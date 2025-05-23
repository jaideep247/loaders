sap.ui.define([
    "sap/ui/core/BusyIndicator",
    "assetmastercreate/utils/DataTransformer",
    "assetmastercreate/utils/ErrorHandler",
    "sap/base/Log",
    "sap/ui/thirdparty/jquery"
], function (
    BusyIndicator,
    DataTransformer,
    ErrorHandler,
    Log,
    jQuery
) {
    "use strict";

    /**
     * @class ODataAssetService
     * @extends sap.ui.base.Object
     * @description Service class for interacting with OData V4 endpoint to create fixed assets in SAP.
     */
    return class ODataAssetService {
        /**
         * @constructor
         * @param {object} [options] - Configuration options for the service.
         * @param {assetmastercreate.utils.DataTransformer} [options.dataTransformer] - Instance of a DataTransformer.
         * @param {assetmastercreate.utils.ErrorHandler} [options.errorHandler] - Instance of an ErrorHandler.
         * @param {string} [options.serviceUrl="/sap/opu/odata4/sap/api_fixedasset/srvd_a2x/sap/fixedasset/0001"] - The base URL of the OData service.
         * @param {object} [options.config={}] - Additional configuration for OData requests.
         * @param {number} [options.batchSize=10] - The number of assets to process in each batch for bulk creation.
         */
        constructor(options = {}) {
            this._dataTransformer = options.dataTransformer || new DataTransformer();
            this._errorHandler = options.errorHandler || new ErrorHandler();
            this._serviceUrl = options.serviceUrl || "/sap/opu/odata4/sap/api_fixedasset/srvd_a2x/sap/fixedasset/0001";
            this.config = options.config || {};
            this._isCancelled = false;
            this.lastResponseText = '';
            this._batchSize = options.batchSize || 10;
            this._csrfRetried = false;
            this._csrfToken = null;

            // Batch processing internal state
            this.totalRecords = 0;
            this.successCount = 0;
            this.failureCount = 0;
            this.failedRecords = [];
            this.successEntries = [];
            this._batchStartTime = null;
            this._batchTotalEntries = 0;
            this._batchTotalBatches = 0;
        }

        /**
         * Creates a single fixed asset by sending an OData POST request.
         * @param {object} assetData - The data for the asset to be created.
         * @param {object} [callbacks] - Optional callback functions.
         * @param {function(object)} [callbacks.success] - Called on successful creation.
         * @param {function(object)} [callbacks.error] - Called on error during creation.
         * @returns {Promise<object>} A Promise that resolves with the creation result or rejects with an error.
         */
        createSingleAsset(assetData, callbacks) {
            return new Promise(async (resolve, reject) => {
                if (!assetData) {
                    const error = new Error("Asset data is required for single asset creation.");
                    Log.error("Asset data missing", error);
                    if (callbacks?.error) callbacks.error(error);
                    return reject(error);
                }

                BusyIndicator.show(0);

                try {
                    // Ensure CSRF token is available
                    if (!this._csrfToken) {
                        await this._fetchCSRFToken();
                    }

                    // Transform data for OData
                    const odataPayload = this._transformToODataPayload(assetData);

                    // Send OData request
                    this._sendODataRequest(odataPayload, {
                        success: (responseData) => {
                            BusyIndicator.hide();
                            const result = {
                                status: "SUCCESS",
                                responseData: responseData,
                                assetNumber: responseData.FixedAsset,
                                companyCode: responseData.CompanyCode
                            };
                            Log.info("Single asset creation successful:", result);
                            if (callbacks?.success) callbacks.success(result);
                            resolve(result);
                        },
                        error: (error) => {
                            BusyIndicator.hide();
                            Log.error("Single asset creation failed:", error);
                            const result = {
                                status: "ERROR",
                                message: error.message,
                                details: error.details,
                                statusCode: error.statusCode
                            };
                            if (callbacks?.error) callbacks.error(result);
                            reject(result);
                        }
                    });
                } catch (e) {
                    BusyIndicator.hide();
                    Log.error("Error preparing OData request for single asset:", e);
                    if (callbacks?.error) callbacks.error(e);
                    reject(e);
                }
            });
        }

        /**
         * Creates multiple fixed assets in batches using OData $batch requests.
         * @param {Array<object>} assets - An array of asset data objects to be created.
         * @param {object} [callbacks] - Optional callback functions.
         * @param {function(number, number)} [callbacks.batchStart] - Called when a new batch starts.
         * @param {function(number, number, number, number)} [callbacks.batchProgress] - Called on batch progress.
         * @param {function(object)} [callbacks.success] - Called on overall successful completion.
         * @param {function(object)} [callbacks.error] - Called if an unrecoverable error occurs.
         * @returns {Promise<object>} A Promise that resolves with the overall results or rejects with an error.
         */
        createAssets(assets, callbacks) {
            return new Promise(async (resolve, reject) => {
                try {
                    if (!Array.isArray(assets) || assets.length === 0) {
                        throw new Error("No assets provided for batch processing.");
                    }

                    // Reset internal state
                    this.totalRecords = assets.length;
                    this.successCount = 0;
                    this.failureCount = 0;
                    this.failedRecords = [];
                    this.successEntries = [];
                    this._isCancelled = false;
                    this._batchStartTime = new Date();
                    this._batchTotalEntries = assets.length;
                    const batchSize = this._batchSize;
                    this._batchTotalBatches = Math.ceil(assets.length / batchSize);

                    Log.info(`Starting batch processing for ${this.totalRecords} assets in ${this._batchTotalBatches} batches.`);
                    BusyIndicator.show(0);

                    if (callbacks?.batchStart) {
                        callbacks.batchStart(0, this._batchTotalBatches);
                    }

                    try {
                        // Fetch CSRF token before starting
                        await this._fetchCSRFToken();

                        await this._submitBatches(0, this._batchTotalBatches, assets, callbacks);

                        const finalResult = {
                            cancelled: false,
                            totalRecords: this.totalRecords,
                            successfulRecords: this.successCount,
                            failedRecords: this.failureCount,
                            failedRecordsList: this.failedRecords,
                            successEntries: this.successEntries,
                            durationMs: new Date().getTime() - this._batchStartTime.getTime()
                        };

                        BusyIndicator.hide();
                        if (callbacks?.success) callbacks.success(finalResult);
                        resolve(finalResult);

                    } catch (error) {
                        BusyIndicator.hide();
                        Log.error("Batch processing failed or was cancelled:", error);

                        if (this._isCancelled) {
                            const cancelledResult = {
                                cancelled: true,
                                totalRecords: this.totalRecords,
                                successfulRecords: this.successCount,
                                failedRecords: this.failureCount,
                                failedRecordsList: this.failedRecords,
                                successEntries: this.successEntries,
                                message: "Operation cancelled by user."
                            };
                            if (callbacks?.error) callbacks.error(cancelledResult);
                            resolve(cancelledResult);
                        } else {
                            if (callbacks?.error) callbacks.error(error);
                            reject(error);
                        }
                    }

                } catch (error) {
                    BusyIndicator.hide();
                    Log.error("Initial setup for batch processing failed:", error);
                    if (callbacks?.error) callbacks.error(error);
                    reject(error);
                }
            });
        }

        /**
         * Recursively submits batches using OData $batch requests.
         * @private
         */
        async _submitBatches(batchIndex, totalBatches, assets, callbacks) {
            if (this._isCancelled) {
                throw new Error("Batch processing cancelled by user.");
            }

            if (batchIndex >= totalBatches) {
                Log.info("All batches processed.");
                return;
            }

            const batchSize = this._batchSize;
            const startIndex = batchIndex * batchSize;
            const endIndex = Math.min(startIndex + batchSize, assets.length);
            const batchEntries = assets.slice(startIndex, endIndex);

            Log.debug(`Processing batch ${batchIndex + 1}/${totalBatches} (Assets ${startIndex} to ${endIndex - 1}).`);

            try {
                const batchResponse = await this._sendODataBatchRequest(batchEntries);

                // Process batch response
                this._processBatchResponse(batchResponse, batchEntries, startIndex);

                if (callbacks?.batchProgress) {
                    callbacks.batchProgress(
                        batchIndex,
                        totalBatches,
                        this.successCount + this.failureCount,
                        this.totalRecords
                    );
                }

                // Continue to next batch
                await this._submitBatches(batchIndex + 1, totalBatches, assets, callbacks);

            } catch (error) {
                Log.error(`Batch ${batchIndex + 1} failed:`, error);

                // Mark all entries in this batch as failed
                this.failureCount += batchEntries.length;
                batchEntries.forEach((asset, idx) => {
                    this.failedRecords.push({
                        assetData: asset,
                        error: error.message || "Batch request failed",
                        errorCode: error.statusCode || "BATCH_ERROR",
                        details: error.details,
                        originalIndex: startIndex + idx
                    });
                });

                if (callbacks?.batchProgress) {
                    callbacks.batchProgress(
                        batchIndex,
                        totalBatches,
                        this.successCount + this.failureCount,
                        this.totalRecords
                    );
                }

                // Continue to next batch even if this one failed
                await this._submitBatches(batchIndex + 1, totalBatches, assets, callbacks);
            }
        }

        /**
         * Fetches a CSRF token for OData requests
         * @private
         */
        _fetchCSRFToken() {
            return new Promise((resolve, reject) => {
                jQuery.ajax({
                    url: this._serviceUrl,
                    method: "HEAD",
                    headers: {
                        "X-CSRF-Token": "Fetch"
                    },
                    success: (data, textStatus, jqXHR) => {
                        const csrfToken = jqXHR.getResponseHeader("X-CSRF-Token");
                        if (!csrfToken || csrfToken === 'Required') {
                            Log.warning("Failed to obtain CSRF token, proceeding anyway...");
                            this._csrfToken = null;
                            resolve(null);
                        } else {
                            Log.info("CSRF Token successfully fetched");
                            this._csrfToken = csrfToken;
                            resolve(csrfToken);
                        }
                    },
                    error: (jqXHR, textStatus, errorThrown) => {
                        Log.warning("Failed to fetch CSRF token:", errorThrown);
                        this._csrfToken = null;
                        resolve(null);
                    }
                });
            });
        }

        /**
         * Transforms asset data to OData V4 payload format
         * @private
         */
        _transformToODataPayload(assetData) {
            // First, transform the flat structure to nested structure
            const structuredData = this._dataTransformer.transformFlatToStructured(assetData);

            // Then prepare for OData format
            const odataPayload = {
                CompanyCode: structuredData.CompanyCode,
                AssetClass: structuredData.AssetClass,
                AssetIsForPostCapitalization: structuredData.AssetIsForPostCapitalization || false,
                FixedAssetDescription: structuredData.FixedAssetDescription || "",
                AssetAdditionalDescription: structuredData.AssetAdditionalDescription || "",
                AssetSerialNumber: structuredData.AssetSerialNumber || "",
                BaseUnit: structuredData.BaseUnit || "EA",
                InventoryNote: structuredData.InventoryNote || "",
                WBSElementExternalID: structuredData.WBSElementExternalID || null,
                Room: structuredData.Room || "",

                // Navigation properties for deep insert
                _Ledger: structuredData._Ledger || [],

                // Custom fields
                YY1_WBS_ELEMENT: structuredData.YY1_WBS_ELEMENT || null
            };

            // Add India-specific fields if present
            if (structuredData._GlobMasterData) {
                odataPayload._GlobMasterData = structuredData._GlobMasterData;
            }

            return odataPayload;
        }

        /**
         * Sends a single OData POST request
         * @private
         */
        _sendODataRequest(payload, callbacks) {
            const headers = {
                "Content-Type": "application/json",
                "Accept": "application/json"
            };

            if (this._csrfToken) {
                headers["X-CSRF-Token"] = this._csrfToken;
            }

            jQuery.ajax({
                url: `${this._serviceUrl}/FixedAsset`,
                method: "POST",
                headers: headers,
                data: JSON.stringify(payload),
                success: (data) => {
                    Log.info("OData request successful:", data);
                    if (callbacks?.success) callbacks.success(data);
                },
                error: (jqXHR) => {
                    const error = this._handleODataError(jqXHR);

                    // Retry with fresh token if CSRF error
                    if (jqXHR.status === 403 && !this._csrfRetried) {
                        Log.warning("CSRF token may be invalid, retrying with fresh token");
                        this._csrfRetried = true;
                        this._csrfToken = null;

                        this._fetchCSRFToken().then(() => {
                            this._csrfRetried = false;
                            this._sendODataRequest(payload, callbacks);
                        });
                        return;
                    }

                    this._csrfRetried = false;
                    Log.error("OData request failed:", error);
                    if (callbacks?.error) callbacks.error(error);
                }
            });
        }

        /**
         * Sends an OData $batch request
         * @private
         */
        _sendODataBatchRequest(assets) {
            return new Promise((resolve, reject) => {
                const batchId = this._generateBatchId();
                const changesetId = this._generateChangesetId();

                // Build batch request body
                const batchBody = this._buildBatchRequestBody(assets, batchId, changesetId);

                const headers = {
                    "Content-Type": `multipart/mixed; boundary=batch_${batchId}`,
                    "Accept": "multipart/mixed"
                };

                if (this._csrfToken) {
                    headers["X-CSRF-Token"] = this._csrfToken;
                }

                jQuery.ajax({
                    url: `${this._serviceUrl}/$batch`,
                    method: "POST",
                    headers: headers,
                    data: batchBody,
                    processData: false,
                    contentType: false,
                    success: (data, textStatus, jqXHR) => {
                        const contentType = jqXHR.getResponseHeader("Content-Type");
                        const boundary = this._extractBoundary(contentType);
                        const responses = this._parseBatchResponse(data, boundary);
                        resolve(responses);
                    },
                    error: (jqXHR) => {
                        const error = this._handleODataError(jqXHR);
                        reject(error);
                    }
                });
            });
        }

        /**
         * Builds the multipart batch request body
         * @private
         */
        _buildBatchRequestBody(assets, batchId, changesetId) {
            let body = '';

            // Start changeset
            body += `--batch_${batchId}\r\n`;
            body += `Content-Type: multipart/mixed; boundary=changeset_${changesetId}\r\n\r\n`;

            // Add each asset as a request in the changeset
            assets.forEach((asset, index) => {
                const payload = this._transformToODataPayload(asset);

                body += `--changeset_${changesetId}\r\n`;
                body += `Content-Type: application/http\r\n`;
                body += `Content-Transfer-Encoding: binary\r\n`;
                body += `Content-ID: ${index + 1}\r\n\r\n`;

                body += `POST ${this._serviceUrl}/FixedAsset HTTP/1.1\r\n`;
                body += `Content-Type: application/json\r\n`;
                body += `Accept: application/json\r\n\r\n`;

                body += JSON.stringify(payload) + '\r\n';
            });

            // Close changeset and batch
            body += `--changeset_${changesetId}--\r\n`;
            body += `--batch_${batchId}--\r\n`;

            return body;
        }

        /**
         * Parses the multipart batch response
         * @private
         */
        _parseBatchResponse(responseText, boundary) {
            const responses = [];
            const parts = responseText.split(new RegExp(`--${boundary}`));

            parts.forEach(part => {
                if (part.trim() && !part.includes('--')) {
                    // Extract HTTP status and body
                    const lines = part.split('\r\n');
                    let inBody = false;
                    let status = null;
                    let body = '';

                    lines.forEach(line => {
                        if (line.startsWith('HTTP/1.1')) {
                            const matches = line.match(/HTTP\/1\.1 (\d+)/);
                            if (matches) {
                                status = parseInt(matches[1]);
                            }
                        } else if (line === '') {
                            inBody = true;
                        } else if (inBody) {
                            body += line;
                        }
                    });

                    if (status && body) {
                        try {
                            const jsonBody = JSON.parse(body);
                            responses.push({
                                status: status,
                                body: jsonBody
                            });
                        } catch (e) {
                            responses.push({
                                status: status,
                                body: body,
                                error: 'Failed to parse response body'
                            });
                        }
                    }
                }
            });

            return responses;
        }

        /**
         * Processes batch response and updates internal counters
         * @private
         */
        _processBatchResponse(responses, batchEntries, startIndex) {
            responses.forEach((response, idx) => {
                const originalIndex = startIndex + idx;

                if (response.status >= 200 && response.status < 300) {
                    this.successCount++;
                    this.successEntries.push({
                        ...response.body,
                        originalIndex: originalIndex,
                        success: true
                    });
                } else {
                    this.failureCount++;
                    const errorMessage = response.body?.error?.message ||
                        response.body?.message ||
                        'Unknown error';

                    this.failedRecords.push({
                        assetData: batchEntries[idx],
                        error: errorMessage,
                        errorCode: response.status,
                        details: JSON.stringify(response.body),
                        originalIndex: originalIndex
                    });
                }
            });
        }

        /**
         * Handles OData error responses
         * @private
         */
        _handleODataError(jqXHR) {
            let errorMessage = 'Unknown error';
            let errorDetails = '';

            try {
                const errorResponse = JSON.parse(jqXHR.responseText);
                if (errorResponse.error) {
                    errorMessage = errorResponse.error.message || errorMessage;
                    errorDetails = errorResponse.error.details || errorResponse.error;
                }
            } catch (e) {
                errorMessage = jqXHR.statusText || errorMessage;
                errorDetails = jqXHR.responseText;
            }

            return {
                message: errorMessage,
                statusCode: jqXHR.status,
                details: errorDetails
            };
        }

        /**
         * Helper methods for batch processing
         * @private
         */
        _generateBatchId() {
            return 'batch_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
        }

        _generateChangesetId() {
            return 'changeset_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
        }

        _extractBoundary(contentType) {
            const match = contentType.match(/boundary=([^;]+)/);
            return match ? match[1] : null;
        }

        /**
         * Cancels any ongoing batch processing
         */
        cancelProcessing() {
            this._isCancelled = true;
            BusyIndicator.hide();
            Log.info("Batch processing cancelled by user.");
        }
    };
});