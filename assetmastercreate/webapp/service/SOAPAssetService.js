sap.ui.define([
    "sap/ui/core/BusyIndicator",
    "assetmastercreate/utils/DataTransformer",
    "assetmastercreate/utils/ErrorHandler",
    "sap/base/Log"
], function (
    BusyIndicator,
    DataTransformer,
    ErrorHandler,
    Log
) {
    "use strict";

    /**
     * SOAPAssetService
     * Service for creating fixed assets via SOAP
     */
    return class SOAPAssetService {
        /**
         * Constructor with dependency injection
         * @param {Object} options - Configuration options
         */
        constructor(options = {}) {
            this._dataTransformer = options.dataTransformer || new DataTransformer();
            this._errorHandler = options.errorHandler || new ErrorHandler();
            this._serviceUrl = options.serviceUrl || "/sap/bc/srt/scs_ext/sap/fixedassetcreatemain";

            // Initialize tracking variables
            this._isCancelled = false;
            this.lastResponseText = '';
            this._batchSize = options.batchSize || 10; // Default batch size
        }

        /**
         * Create a single fixed asset
         * @param {Object} assetData - Fixed asset data
         * @param {Object} callbacks - Callbacks for success, error
         */
        createSingleAsset(assetData, callbacks) {
            if (!assetData) {
                throw new Error("Asset data is required");
            }

            BusyIndicator.show(0);

            // Create the SOAP request
            const soapRequest = this._createSOAPRequest([assetData]);

            this._sendSOAPRequest(soapRequest, {
                success: (responseData, rawResponse) => {
                    BusyIndicator.hide();
                    // Store the raw response for export
                    this.lastResponseText = rawResponse;

                    // Prepare success result
                    const result = {
                        status: "SUCCESS",
                        responseData: responseData,
                        rawResponse: rawResponse
                    };

                    if (callbacks && callbacks.success) {
                        callbacks.success(result);
                    }
                },
                error: (error) => {
                    BusyIndicator.hide();

                    // Prepare failure result
                    const result = {
                        status: "ERROR",
                        message: error.message,
                        details: error.details,
                        rawResponse: error.rawResponse
                    };

                    // Call error callback if provided
                    if (callbacks && callbacks.error) {
                        callbacks.error(error);
                    }
                }
            });
        }

        /**
         * Create multiple assets using batch processing
         * @param {Array} assets - Array of assets to process
         * @param {Object} callbacks - Callbacks for batch processing steps
         * @returns {Promise} Promise that resolves when all batches are processed
         */
        createAssets(assets, callbacks) {
            return new Promise((resolve, reject) => {
                try {
                    if (!assets || assets.length === 0) {
                        throw new Error("No assets to process");
                    }

                    // Initialize counters
                    this.totalRecords = assets.length;
                    this.successCount = 0;
                    this.failureCount = 0;
                    this.failedRecords = [];
                    this.successEntries = [];
                    this._isCancelled = false;

                    // Configure batch processing
                    const batchSize = this._batchSize;
                    const totalBatches = Math.ceil(assets.length / batchSize);

                    // Store start time and totals
                    this._batchStartTime = new Date();
                    this._batchTotalEntries = assets.length;
                    this._batchTotalBatches = totalBatches;

                    // Notify about batch information if callback exists
                    if (callbacks && callbacks.batchStart) {
                        callbacks.batchStart(0, totalBatches);
                    }

                    // Start submitting batches
                    this._submitBatches(
                        0,
                        totalBatches,
                        assets,
                        callbacks
                    ).then(result => resolve(result))
                        .catch(error => reject(error));
                } catch (error) {
                    reject(error);
                }
            });
        }

        /**
         * Submit batches of assets to SOAP service
         * @param {Number} batchIndex - Current batch index
         * @param {Number} totalBatches - Total number of batches
         * @param {Array} assets - All assets to process
         * @param {Object} callbacks - Callbacks for batch processing steps
         * @returns {Promise} Promise that resolves when all batches are processed
         * @private
         */
        _submitBatches(batchIndex, totalBatches, assets, callbacks) {
            return new Promise((resolve, reject) => {
                // Check if cancelled
                if (this._isCancelled) {
                    // Reset cancellation flag
                    this._isCancelled = false;

                    // Call error callback
                    if (callbacks && callbacks.error) {
                        callbacks.error({
                            message: "Operation cancelled by user",
                            result: {
                                totalRecords: this.totalRecords,
                                successfulRecords: this.successCount,
                                failedRecords: this.failureCount,
                                failedRecordsList: this.failedRecords
                            }
                        });
                    }

                    resolve({
                        cancelled: true,
                        totalRecords: this.totalRecords,
                        successCount: this.successCount,
                        failureCount: this.failureCount,
                        failedRecords: this.failedRecords
                    });
                    return;
                }

                // Check if we're done
                if (batchIndex >= totalBatches) {
                    // Prepare result object
                    const responseData = {
                        items: this.successEntries,
                        successItems: this.successCount,
                        errorItems: this.failedRecords
                    };

                    // Call success callback
                    if (callbacks && callbacks.success) {
                        callbacks.success({
                            totalRecords: this.totalRecords,
                            successfulRecords: this.successCount,
                            failedRecords: this.failureCount,
                            failedRecordsList: this.failedRecords,
                            responseData: responseData,
                            rawResponse: JSON.stringify(responseData)
                        });
                    }

                    resolve({
                        cancelled: false,
                        totalRecords: this.totalRecords,
                        successCount: this.successCount,
                        failureCount: this.failureCount,
                        failedRecords: this.failedRecords
                    });
                    return;
                }

                // Calculate the start and end indices for this batch
                const batchSize = this._batchSize;
                const startIndex = batchIndex * batchSize;
                const endIndex = Math.min(
                    startIndex + batchSize,
                    assets.length
                );
                const batchEntries = assets.slice(startIndex, endIndex);

                // Update progress if callback provided
                if (callbacks && callbacks.batchStart) {
                    callbacks.batchStart(batchIndex, totalBatches);
                }

                // Create the SOAP request for this batch
                const soapRequest = this._createSOAPRequest(batchEntries);

                this._sendSOAPRequest(soapRequest, {
                    success: (responseData) => {
                        // Increment success counter
                        this.successCount += batchEntries.length;

                        // Add to success entries
                        if (responseData && responseData.FixedAsset) {
                            this.successEntries.push({
                                ...responseData.FixedAsset,
                                success: true
                            });
                        }

                        // Update progress
                        if (callbacks && callbacks.batchProgress) {
                            callbacks.batchProgress(
                                batchIndex,
                                totalBatches,
                                this.successCount + this.failureCount,
                                this.totalRecords
                            );
                        }

                        // Process next batch
                        this._submitBatches(
                            batchIndex + 1,
                            totalBatches,
                            assets,
                            callbacks
                        ).then(resolve).catch(reject);
                    },
                    error: (error) => {
                        // Increment failure counter
                        this.failureCount += batchEntries.length;

                        // Add to failed records
                        batchEntries.forEach(asset => {
                            this.failedRecords.push({
                                assetData: asset,
                                error: error.message,
                                errorCode: error.code,
                                details: error.details
                            });
                        });

                        // Update progress
                        if (callbacks && callbacks.batchProgress) {
                            callbacks.batchProgress(
                                batchIndex,
                                totalBatches,
                                this.successCount + this.failureCount,
                                this.totalRecords
                            );
                        }

                        // Continue with next batch even if this one failed
                        this._submitBatches(
                            batchIndex + 1,
                            totalBatches,
                            assets,
                            callbacks
                        ).then(resolve).catch(reject);
                    }
                });
            });
        }

        /**
         * Create SOAP request envelope for asset creation
         * @param {Array} assets - Array of assets to include in request
         * @returns {String} SOAP request XML
         * @private
         */
        _createSOAPRequest(assets) {
            const currentDateTime = new Date().toISOString();
            const messageId = `MSG_${new Date().toISOString().slice(0, 10)}_APITEST`;

            let soapEnvelope = `<?xml version="1.0" encoding="utf-8"?>
            <soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" 
                             xmlns:fi="http://sap.com/xi/FI-AA"
                             xmlns:yy1="http://SAPCustomFields.com/YY1_">
                <soapenv:Header/>
                <soapenv:Body>
                    <fi:FixedAssetCreateMainBulkRequestMessage>
                        <MessageHeader>
                            <ID>${messageId}</ID>
                            <CreationDateTime>${currentDateTime}</CreationDateTime>
                            <SenderBusinessSystemID>TSIDEV</SenderBusinessSystemID>
                        </MessageHeader>`;

            // Add each asset to the request
            assets.forEach(asset => {
                soapEnvelope += `
              <FixedAssetMainRequest>
                  <MessageHeader>
                      <CreationDateTime>${currentDateTime}</CreationDateTime>
                  </MessageHeader>
                  <FixedAsset>
                      <CompanyCode>${asset.CompanyCode || ''}</CompanyCode>
                      <AssetClass>${asset.AssetClass || ''}</AssetClass>
                      <AssetIsForPostCapitalization>${asset.AssetIsForPostCapitalization || false}</AssetIsForPostCapitalization>`;

                // Add General section if needed
                if (asset.General && (asset.General.FixedAssetDescription || asset.General.AssetAdditionalDescription ||
                    asset.General.AssetSerialNumber || asset.General.BaseUnit)) {
                    soapEnvelope += `
                      <General>`;

                    if (asset.General.FixedAssetDescription) {
                        soapEnvelope += `
                          <FixedAssetDescription>${asset.General.FixedAssetDescription}</FixedAssetDescription>`;
                    }

                    if (asset.General.AssetAdditionalDescription) {
                        soapEnvelope += `
                          <AssetAdditionalDescription>${asset.General.AssetAdditionalDescription}</AssetAdditionalDescription>`;
                    }

                    if (asset.General.AssetSerialNumber) {
                        soapEnvelope += `
                          <AssetSerialNumber>${asset.General.AssetSerialNumber}</AssetSerialNumber>`;
                    }

                    if (asset.General.BaseUnit) {
                        soapEnvelope += `
                          <BaseUnit>${asset.General.BaseUnit}</BaseUnit>`;
                    }

                    soapEnvelope += `
                      </General>`;
                }

                // Add Inventory section if needed
                if (asset.Inventory && asset.Inventory.InventoryNote) {
                    soapEnvelope += `
                      <Inventory>
                          <InventoryNote>${asset.Inventory.InventoryNote}</InventoryNote>
                      </Inventory>`;
                }

                // Add Account Assignment section
                soapEnvelope += `
                      <AccountAssignment>`;

                if (asset.AccountAssignment) {
                    if (asset.AccountAssignment.WBSElementExternalID) {
                        soapEnvelope += `
                          <WBSElementExternalID>${asset.AccountAssignment.WBSElementExternalID}</WBSElementExternalID>`;
                    }

                    if (asset.AccountAssignment.Room) {
                        soapEnvelope += `
                          <Room>${asset.AccountAssignment.Room}</Room>`;
                    }

                    if (asset.AccountAssignment.CostCenter) {
                        soapEnvelope += `
                          <CostCenter>${asset.AccountAssignment.CostCenter}</CostCenter>`;
                    }

                    if (asset.AccountAssignment.Plant) {
                        soapEnvelope += `
                          <Plant>${asset.AccountAssignment.Plant}</Plant>`;
                    }

                    if (asset.AccountAssignment.AssetLocation) {
                        soapEnvelope += `
                          <AssetLocation>${asset.AccountAssignment.AssetLocation}</AssetLocation>`;
                    }

                    if (asset.AccountAssignment.ProfitCenter) {
                        soapEnvelope += `
                          <ProfitCenter>${asset.AccountAssignment.ProfitCenter}</ProfitCenter>`;
                    }
                }

                soapEnvelope += `
                      </AccountAssignment>`;

                // Add Ledger Information sections
                if (asset.LedgerInformation && Array.isArray(asset.LedgerInformation)) {
                    asset.LedgerInformation.forEach(ledger => {
                        if (ledger.Ledger) {
                            soapEnvelope += `
                      <LedgerInformation>
                          <Ledger>${ledger.Ledger}</Ledger>
                          <AssetCapitalizationDate>${ledger.AssetCapitalizationDate || ''}</AssetCapitalizationDate>
                      </LedgerInformation>`;
                        }
                    });
                }

                // Add Valuation sections
                if (asset.Valuation && Array.isArray(asset.Valuation)) {
                    asset.Valuation.forEach(valuation => {
                        if (valuation.AssetDepreciationArea) {
                            soapEnvelope += `
                      <Valuation>
                          <AssetDepreciationArea>${valuation.AssetDepreciationArea}</AssetDepreciationArea>
                          <NegativeAmountIsAllowed>${valuation.NegativeAmountIsAllowed || false}</NegativeAmountIsAllowed>
                          <DepreciationStartDate>${valuation.DepreciationStartDate || ''}</DepreciationStartDate>
                      </Valuation>`;
                        }
                    });
                }

                // Add TimeBasedValuation sections
                if (asset.TimeBasedValuation && Array.isArray(asset.TimeBasedValuation)) {
                    asset.TimeBasedValuation.forEach(tbv => {
                        if (tbv.AssetDepreciationArea) {
                            soapEnvelope += `
                      <TimeBasedValuation>
                          <AssetDepreciationArea>${tbv.AssetDepreciationArea}</AssetDepreciationArea>`;

                            if (tbv.DepreciationKey) {
                                soapEnvelope += `
                          <DepreciationKey>${tbv.DepreciationKey}</DepreciationKey>`;
                            }

                            if (tbv.PlannedUsefulLifeInYears) {
                                soapEnvelope += `
                          <PlannedUsefulLifeInYears>${tbv.PlannedUsefulLifeInYears}</PlannedUsefulLifeInYears>`;
                            }

                            if (tbv.PlannedUsefulLifeInPeriods) {
                                soapEnvelope += `
                          <PlannedUsefulLifeInPeriods>${tbv.PlannedUsefulLifeInPeriods}</PlannedUsefulLifeInPeriods>`;
                            }

                            if (tbv.ScrapAmountInCoCodeCrcy) {
                                const currencyCode = typeof tbv.ScrapAmountInCoCodeCrcy === 'object' ?
                                    tbv.ScrapAmountInCoCodeCrcy.currencyCode : "INR";
                                const value = typeof tbv.ScrapAmountInCoCodeCrcy === 'object' ?
                                    tbv.ScrapAmountInCoCodeCrcy.content : tbv.ScrapAmountInCoCodeCrcy;

                                soapEnvelope += `
                          <ScrapAmountInCoCodeCrcy currencyCode="${currencyCode}">${value}</ScrapAmountInCoCodeCrcy>`;
                            }

                            if (tbv.AcqnProdnCostScrapPercent) {
                                soapEnvelope += `
                          <AcqnProdnCostScrapPercent>${tbv.AcqnProdnCostScrapPercent}</AcqnProdnCostScrapPercent>`;
                            }

                            soapEnvelope += `
                      </TimeBasedValuation>`;
                        }
                    });
                }

                // Add GLO_MasterData section
                if (asset.GLO_MasterData && asset.GLO_MasterData.IN_AssetBlockData) {
                    soapEnvelope += `
                      <GLO_MasterData>
                          <IN_AssetBlockData>
                              <IN_AssetBlock>${asset.GLO_MasterData.IN_AssetBlockData.IN_AssetBlock || ''}</IN_AssetBlock>
                              <IN_AssetPutToUseDate>${asset.GLO_MasterData.IN_AssetBlockData.IN_AssetPutToUseDate || ''}</IN_AssetPutToUseDate>
                              <IN_AssetIsPriorYear/>
                          </IN_AssetBlockData>
                      </GLO_MasterData>`;
                }

                // Add custom field YY1_WBS_ELEMENT
                if (asset.YY1_WBS_ELEMENT) {
                    soapEnvelope += `
                      <yy1:YY1_WBS_ELEMENT>${asset.YY1_WBS_ELEMENT}</yy1:YY1_WBS_ELEMENT>`;
                }

                soapEnvelope += `
                  </FixedAsset>
              </FixedAssetMainRequest>`;
            });
            // Close the SOAP envelope
            soapEnvelope += `</fi:FixedAssetCreateMainBulkRequestMessage></soapenv:Body></soapenv:Envelope>`;

            return soapEnvelope;
        }
        /**
         * Send SOAP request to the service
         * @param {String} soapRequest - SOAP request XML
         * @param {Object} callbacks - Success and error callbacks
         * @private
         */
        _sendSOAPRequest(soapRequest, callbacks) {
            return new Promise((resolve, reject) => {
                // First fetch the CSRF token
                this._fetchCSRFToken()
                    .then((token) => {
                        $.ajax({
                            url: this._serviceUrl,
                            type: "POST",
                            dataType: "xml",
                            data: soapRequest,
                            contentType: "text/xml; charset=utf-8",
                            headers: {
                                "X-CSRF-Token": token,
                                "SOAPAction": this._serviceUrl,
                            },
                            xhrFields: {
                                withCredentials: true
                            },
                            timeout: 60000, // 1 minute timeout
                            success: (data, textStatus, xhr) => {
                                try {
                                    const responseData = this._parseSOAPResponse(data);
                                    if (callbacks && callbacks.success) {
                                        callbacks.success(responseData, xhr.responseText);
                                    }
                                    resolve(responseData);
                                } catch (parseError) {
                                    const error = this._errorHandler.createStandardMessage(
                                        "error",
                                        "PARSE_ERROR",
                                        "Failed to parse SOAP response",
                                        parseError.message
                                    );
                                    if (callbacks && callbacks.error) {
                                        callbacks.error(error);
                                    } else {
                                        reject(error);
                                    }
                                }
                            },
                            error: (xhr) => {
                                const errorInfo = this._errorHandler.extractSOAPError(xhr.responseText);
                                if (callbacks && callbacks.error) {
                                    callbacks.error(errorInfo);
                                }
                                else {
                                    reject(errorInfo);
                                }
                            }
                        });
                    })
                    .catch((error) => {
                        if (callbacks && callbacks.error) {
                            callbacks.error(error);
                        }
                        else {
                            reject(errorInfo);
                        }
                    });
            });
        }

        /**
         * Fetch CSRF token for SOAP requests
         * @returns {Promise} Promise that resolves with the token
         * @private
         */
        _fetchCSRFToken() {
            return new Promise((resolve, reject) => {
                $.ajax({
                    url: this._serviceUrl,
                    type: "HEAD",
                    headers: {
                        "X-CSRF-Token": "Fetch",
                        Accept: "application/xml"
                    },
                    xhrFields: {
                        withCredentials: true
                    },
                    timeout: 30000,
                    success: function (data, textStatus, xhr) {
                        const token = xhr.getResponseHeader("X-CSRF-Token");
                        if (token) {
                            resolve(token);
                        } else {
                            reject({
                                status: "ERROR",
                                message: "Could not retrieve CSRF token",
                                details: "The server did not return a token in the response headers"
                            });
                        }
                    },
                    error: function (xhr, status, error) {
                        const token = xhr.getResponseHeader("X-CSRF-Token");
                        if (token) {
                            resolve(token);
                        } else {
                            Log.error("CSRF Token Fetch Error:", {
                                status: xhr.status,
                                responseText: xhr.responseText,
                                error: error
                            });

                            let errorMessage = "Failed to fetch CSRF token";
                            let detailsMessage = "Service unavailable";

                            if (xhr.status === 404) {
                                errorMessage = "SOAP service endpoint not found";
                                detailsMessage = "The endpoint URL may be incorrect or the service is not deployed";
                            } else if (xhr.status === 403) {
                                errorMessage = "Access to SOAP service denied";
                                detailsMessage = "You don't have permission to access this service";
                            } else if (xhr.status === 401) {
                                errorMessage = "Authentication required for SOAP service";
                                detailsMessage = "You need to log in or provide credentials";
                            } else if (xhr.status >= 500) {
                                errorMessage = `SOAP service unavailable (${xhr.status})`;
                                detailsMessage = "The server encountered an error processing the request";
                            }

                            reject({
                                status: "ERROR",
                                message: errorMessage,
                                details: detailsMessage,
                                statusCode: xhr.status,
                                technicalDetails: xhr.responseText || error || "No additional details available"
                            });
                        }
                    }
                });
            });
        }

        /**
         * Parse SOAP response to extract asset data
         * @param {XMLDocument} response - SOAP response
         * @returns {Object} Parsed response data
         * @private
         */
        _parseSOAPResponse(response) {
            try {
                const $response = $(response);

                // Find all FixedAssetCreateMainConfirmation elements
                const confirmations = $response.find("FixedAssetCreateMainConfirmation, [nodeName='FixedAssetCreateMainConfirmation']");

                const results = [];

                confirmations.each(function () {
                    const $confirmation = $(this);

                    const assetNumber = $confirmation.find("Asset").text();
                    const companyCode = $confirmation.find("CompanyCode").text();
                    const assetClass = $confirmation.find("AssetClass").text();

                    // Check for errors
                    const logItems = $confirmation.find("Log > Item");
                    let status = "SUCCESS";
                    let messages = [];

                    logItems.each(function () {
                        const severity = $(this).find("Severity").text();
                        const note = $(this).find("Note").text();

                        messages.push({
                            severity: severity,
                            message: note
                        });

                        if (severity === "E") {
                            status = "ERROR";
                        }
                    });

                    results.push({
                        Asset: assetNumber,
                        CompanyCode: companyCode,
                        AssetClass: assetClass,
                        Status: status,
                        Messages: messages
                    });
                });

                return {
                    FixedAsset: results.length > 0 ? results[0] : null,
                    AllResults: results
                };
            } catch (e) {
                Log.error("Error parsing SOAP response:", e);
                throw new Error("Failed to parse SOAP response: " + e.message);
            }
        }

        /**
         * Cancel the current batch processing
         */
        cancelBatchProcessing() {
            this._isCancelled = true;
        }

        /**
         * Set the service URL
         * @param {String} url - Service URL
         */
        setServiceUrl(url) {
            this._serviceUrl = url;
        }

        /**
         * Set the batch size
         * @param {Number} size - Batch size
         */
        setBatchSize(size) {
            this._batchSize = size;
        }
    };
});