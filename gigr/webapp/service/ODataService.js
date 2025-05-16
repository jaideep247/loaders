sap.ui.define([
    "sap/ui/core/BusyIndicator",
    "gigr/utils/DataTransformer",
    "gigr/utils/ErrorHandler"
], function (
    BusyIndicator,
    DataTransformer,
    ErrorHandler
) {
    "use strict";

    /**
     * ODataService
     * Centralized service for OData operations
     */
    return class ODataService {
        /**
         * Constructor with dependency injection
         * @param {Object} options - Configuration options
         */
        constructor(options = {}) {
            this._oModel = options.model;
            this._dataTransformer = options.dataTransformer || new DataTransformer();
            this._errorHandler = options.errorHandler || new ErrorHandler();

            if (!this._oModel) {
                throw new Error("OData model is required");
            }

            // Initialize tracking variables
            this._isCancelled = false;
            this.lastResponseText = '';
        }

        /**
         * Create a single GI/GR document with all its items
         * @param {Object} gigrDocumentData - Complete GI/GR document data with header and items
         * @param {Object} callbacks - Callbacks for success, error
         */
        createSingleGIGRDocument(gigrDocumentData, callbacks) {
            if (!gigrDocumentData) {
                throw new Error("GI/GR document data is required");
            }

            BusyIndicator.show(0);

            // Create the GI/GR document with deep insert
            this._oModel.create("/A_MaterialDocumentHeader", gigrDocumentData, {
                success: (oData, oResponse) => {
                    BusyIndicator.hide();
                    // Store the raw response for export
                    this.lastResponseText =
                        oResponse.body || oResponse.data || JSON.stringify(oData);

                    // Try to extract data for export
                    const exportData = this._parseODataResponse(this.lastResponseText);

                    // Prepare success result
                    const result = {
                        totalRecords: gigrDocumentData.to_MaterialDocumentItem.length,
                        successfulRecords: gigrDocumentData.to_MaterialDocumentItem.length,
                        failedRecords: 0,
                        failedRecordsList: [],
                        responseData: exportData,
                        rawResponse: this.lastResponseText
                    };

                    if (callbacks && callbacks.success) {
                        callbacks.success(result);
                    }
                },
                error: (oError) => {
                    BusyIndicator.hide();

                    // Use the ErrorHandler to extract error information
                    const errorInfo = this._errorHandler.extractODataError(oError);

                    // Prepare failure result
                    const result = {
                        totalRecords: gigrDocumentData.to_MaterialDocumentItem.length,
                        successfulRecords: 0,
                        failedRecords: gigrDocumentData.to_MaterialDocumentItem.length,
                        failedRecordsList: gigrDocumentData.to_MaterialDocumentItem.map(
                            (item, index) => ({
                                index: index,
                                entry: item,
                                error: errorInfo.message,
                                errorCode: errorInfo.code,
                                details: errorInfo.details
                            })
                        )
                    };

                    // Call error callback if provided
                    if (callbacks && callbacks.error) {
                        callbacks.error({
                            message: errorInfo.message,
                            code: errorInfo.code,
                            details: errorInfo.details,
                            result: result
                        });
                    }
                }
            });
        }

        /**
         * Create multiple GI/GR documents using batch processing
         * @param {Array} gigrDocuments - Array of GI/GR documents to process
         * @param {Object} callbacks - Callbacks for batch processing steps
         * @returns {Promise} Promise that resolves when all batches are processed
         */
        createGIGRDocuments(gigrDocuments, callbacks) {
            return new Promise((resolve, reject) => {
                try {
                    if (!gigrDocuments || gigrDocuments.length === 0) {
                        throw new Error("No GI/GR documents to process");
                    }

                    // Initialize counters
                    this.totalRecords = gigrDocuments.length;
                    this.successCount = 0;
                    this.failureCount = 0;
                    this.failedRecords = [];
                    this.successEntries = [];
                    this._isCancelled = false;

                    // Configure batch processing
                    const batchSize = 20;
                    const totalBatches = Math.ceil(gigrDocuments.length / batchSize);

                    // Save original deferred groups
                    const originalDeferredGroups = this._oModel.getDeferredGroups() || [];

                    // Create new array with original groups plus our new batch groups
                    const deferredGroups = [...originalDeferredGroups];
                    for (let i = 0; i < totalBatches; i++) {
                        deferredGroups.push("GIGRDocuments_Batch_" + i);
                    }

                    // Set deferred groups and configure model for batch mode
                    this._oModel.setDeferredGroups(deferredGroups);
                    this._oModel.setUseBatch(true);

                    // Store start time and totals
                    this._batchStartTime = new Date();
                    this._batchTotalEntries = gigrDocuments.length;
                    this._batchTotalBatches = totalBatches;

                    // Notify about batch information if callback exists
                    if (callbacks && callbacks.batchStart) {
                        callbacks.batchStart(0, totalBatches);
                    }

                    // Start submitting batches
                    this._submitBatch(
                        0,
                        totalBatches,
                        originalDeferredGroups,
                        gigrDocuments,
                        callbacks
                    ).then(result => resolve(result))
                        .catch(error => reject(error));
                } catch (error) {
                    reject(error);
                }
            });
        }

        /**
         * Submit a batch of GI/GR documents to OData service
         * @param {Number} batchIndex - Current batch index
         * @param {Number} totalBatches - Total number of batches
         * @param {Array} originalDeferredGroups - Original deferred groups
         * @param {Array} gigrDocuments - All GI/GR documents to process
         * @param {Object} callbacks - Callbacks for batch processing steps
         * @returns {Promise} Promise that resolves when all batches are processed
         * @private
         */
        _submitBatch(
            batchIndex,
            totalBatches,
            originalDeferredGroups,
            gigrDocuments,
            callbacks
        ) {
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
                                failedRecordsList: this.failedRecords,
                                responseData: {
                                    successItems: this.successCount,
                                    errorItems: this.failedRecords
                                }
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
                    // Restore original deferred groups
                    this._oModel.setDeferredGroups(originalDeferredGroups);

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
                const batchSize = 20;
                const startIndex = batchIndex * batchSize;
                const endIndex = Math.min(
                    startIndex + batchSize,
                    gigrDocuments.length
                );
                const batchEntries = gigrDocuments.slice(startIndex, endIndex);
                const groupId = "GIGRDocuments_Batch_" + batchIndex;

                // Update progress if callback provided
                if (callbacks && callbacks.batchStart) {
                    callbacks.batchStart(batchIndex, totalBatches);
                }

                // Process each document group
                const documentGroups = this._dataTransformer.groupByDocumentNumber(batchEntries);

                // Process each document group
                Object.keys(documentGroups).forEach(grnDocNumber => {
                    const itemsForDocument = documentGroups[grnDocNumber];

                    // Create GI/GR document header with the DataTransformer
                    const gigrDocHeader = this._dataTransformer.transformToODataFormat(itemsForDocument);

                    // Create the GI/GR document with deep insert
                    this._oModel.create("/A_MaterialDocumentHeader", gigrDocHeader, {
                        groupId: groupId,
                        success: (data, response) => {
                            // Increment success counter
                            this.successCount += itemsForDocument.length;

                            // Add to success entries
                            this.successEntries.push({
                                GRNDocumentNumber: grnDocNumber,
                                MaterialDocument: data.MaterialDocument,
                                MaterialDocumentYear: data.MaterialDocumentYear,
                                success: true
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
                        },
                        error: (error) => {
                            // Increment failure counter
                            this.failureCount += itemsForDocument.length;

                            // Use the ErrorHandler to extract error information
                            const errorInfo = this._errorHandler.extractODataError(error);

                            // Add to failed records
                            this.failedRecords.push({
                                GRNDocumentNumber: grnDocNumber,
                                error: errorInfo.message,
                                errorCode: errorInfo.code,
                                details: errorInfo.details
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
                        }
                    });
                });

                // Submit the batch
                this._oModel.submitChanges({
                    groupId: groupId,
                    success: () => {
                        // Process next batch
                        this._submitBatch(
                            batchIndex + 1,
                            totalBatches,
                            originalDeferredGroups,
                            gigrDocuments,
                            callbacks
                        ).then(resolve).catch(reject);
                    },
                    error: (error) => {
                        // Use the ErrorHandler to extract error information
                        const errorInfo = this._errorHandler.extractODataError(error);

                        if (callbacks && callbacks.error) {
                            callbacks.error({
                                message: `Batch submission error: ${errorInfo.message}`,
                                code: errorInfo.code,
                                details: errorInfo.details,
                                result: {
                                    totalRecords: this.totalRecords,
                                    successfulRecords: this.successCount,
                                    failedRecords: this.failureCount,
                                    failedRecordsList: this.failedRecords,
                                    responseData: {
                                        successItems: this.successCount,
                                        errorItems: this.failedRecords
                                    }
                                }
                            });
                        }

                        reject(error);
                    }
                });
            });
        }

        /**
         * Parse OData response to extract values for export
         * @param {string} responseText - OData response text
         * @returns {Object} Extracted data for export
         * @private
         */
        _parseODataResponse(responseText) {
            try {
                // Check if this is an error response
                if (responseText && responseText.includes('"error":')) {
                    return this._parseErrorResponse(responseText);
                }

                // Try to parse the entire response first
                let response;
                try {
                    response = JSON.parse(responseText);
                } catch (e) {
                    // If full parsing fails, try to extract the JSON part (for mixed content responses)
                    const jsonStart = responseText.indexOf('{"d":');
                    if (jsonStart >= 0) {
                        const jsonPart = responseText.substring(jsonStart);
                        // Find the closing brace that matches the opening brace
                        let braceCount = 0;
                        let endIndex = 0;

                        for (let i = 0; i < jsonPart.length; i++) {
                            if (jsonPart[i] === '{') braceCount++;
                            if (jsonPart[i] === '}') braceCount--;

                            if (braceCount === 0) {
                                endIndex = i + 1;
                                break;
                            }
                        }

                        if (endIndex > 0) {
                            const jsonString = jsonPart.substring(0, endIndex);
                            response = JSON.parse(jsonString);
                        }
                    }
                }

                // If we still don't have a valid response
                if (!response || !response.d) {
                    console.error("Invalid response structure:", responseText);
                    return { header: {}, items: [] };
                }

                const data = response.d;

                // Extract header values specific to your fields
                const header = {
                    MaterialDocument: data.MaterialDocument,
                    MaterialDocumentYear: data.MaterialDocumentYear,
                    DocumentDate: this._dataTransformer.parseODataDate(data.DocumentDate),
                    PostingDate: this._dataTransformer.parseODataDate(data.PostingDate),
                    MaterialDocumentHeaderText: data.MaterialDocumentHeaderText,
                    GoodsMovementCode: data.GoodsMovementCode
                };

                // Check if items exist and parse with your required fields
                const items = [];
                if (data.to_MaterialDocumentItem && data.to_MaterialDocumentItem.results) {
                    data.to_MaterialDocumentItem.results.forEach(item => {
                        items.push({
                            SequenceNumber: item.SequenceNumber || "",
                            GRNDocumentNumber: item.GRNDocumentNumber || "",
                            Material: item.Material || "",
                            Plant: item.Plant || "",
                            StorageLocation: item.StorageLocation || "",
                            GoodsMovementType: item.GoodsMovementType || "",
                            AccountAssignment: item.AccountAssignment || "",
                            QuantityInEntryUnit: item.QuantityInEntryUnit || "",
                            WBSElement: item.WBSElement || "",
                            GLAccount: item.GLAccount || "",
                            EntryUnit: item.EntryUnit || "",
                            MaterialDocumentItemText: item.MaterialDocumentItemText || "",
                            SpecialStockIdfgWBSElement: item.SpecialStockIdfgWBSElement || ""
                        });
                    });
                }

                return {
                    header: header,
                    items: items
                };
            } catch (e) {
                console.error("Error parsing OData response:", e);
                return {
                    header: {},
                    items: []
                };
            }
        }

        /**
         * Parse error response from OData service
         * @param {string} responseText - Error response text
         * @returns {Object} Extracted error data
         * @private
         */
        _parseErrorResponse(responseText) {
            try {
                // Extract the JSON part from the response
                let jsonText = responseText;

                // If the response has HTTP headers, extract just the JSON body
                if (responseText.includes("HTTP/1.1") && responseText.includes("Content-Type:")) {
                    const bodyStart = responseText.indexOf("{");
                    if (bodyStart > 0) {
                        jsonText = responseText.substring(bodyStart);
                    }
                }

                // Use the ErrorHandler to extract error information
                const errorData = JSON.parse(jsonText);
                const errorInfo = this._errorHandler.extractODataError(errorData);

                // Create error items structure that looks similar to success items for consistency in exports
                const errorItems = Array.isArray(errorInfo.details)
                    ? errorInfo.details.map((detail, index) => {
                        return {
                            SL: (index + 1).toString(),
                            ErrorCode: detail.code || "",
                            ErrorMessage: detail.message || "",
                            PropertyRef: detail.propertyref || "",
                            Severity: detail.severity || "error",
                            Status: "Failed"
                        };
                    })
                    : [];

                // If no detailed errors were found, create a single error item with the main message
                if (errorItems.length === 0) {
                    errorItems.push({
                        SL: "1",
                        ErrorCode: errorInfo.code || "",
                        ErrorMessage: errorInfo.message || "Unknown error",
                        PropertyRef: "",
                        Severity: "error",
                        Status: "Failed"
                    });
                }

                return {
                    header: {
                        ErrorMessage: errorInfo.message || "Unknown error"
                    },
                    items: errorItems,
                    errorItems: errorItems,
                    isError: true
                };
            } catch (e) {
                // Even error handling can fail, use ErrorHandler to create a standard message
                const fallbackMessage = this._errorHandler.createStandardMessage(
                    "error",
                    "PARSE_FAILED",
                    "Failed to parse error response",
                    e.message
                );

                return {
                    header: { ErrorMessage: fallbackMessage.message },
                    items: [
                        {
                            SL: "1",
                            ErrorMessage: fallbackMessage.message,
                            Status: "Failed"
                        }
                    ],
                    errorItems: [
                        {
                            ErrorMessage: fallbackMessage.message,
                            Status: "Failed"
                        }
                    ],
                    isError: true
                };
            }
        }

        /**
         * Get the OData model
         * @returns {sap.ui.model.odata.v2.ODataModel} OData model
         */
        getModel() {
            return this._oModel;
        }

        /**
         * Cancel the current batch processing
         */
        cancelBatchProcessing() {
            this._isCancelled = true;
        }

        /**
         * Read entity from OData service
         * @param {String} entityPath - Entity path
         * @param {Object} urlParameters - URL parameters
         * @returns {Promise} Promise that resolves with the entity data
         */
        readEntity(entityPath, urlParameters = {}) {
            return new Promise((resolve, reject) => {
                this._oModel.read(entityPath, {
                    urlParameters: urlParameters,
                    success: (oData) => {
                        resolve(oData);
                    },
                    error: (oError) => {
                        // Use the ErrorHandler to extract error information
                        const errorInfo = this._errorHandler.extractODataError(oError);
                        reject(errorInfo);
                    }
                });
            });
        }

        /**
         * Get metadata for an entity
         * @param {String} entityName - Entity name
         * @returns {Object} Entity metadata
         */
        getEntityMetadata(entityName) {
            try {
                const oMetaModel = this._oModel.getMetaModel();
                if (!oMetaModel) {
                    throw new Error("Metadata model not available");
                }

                return oMetaModel.getODataEntityType(`${this._oModel.getServiceMetadata().dataServices.schema[0].namespace}.${entityName}`);
            } catch (error) {
                console.error("Error getting entity metadata:", error);
                return null;
            }
        }
    };
});