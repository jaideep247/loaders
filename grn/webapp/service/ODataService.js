sap.ui.define([
    "sap/ui/core/BusyIndicator",
    "grn/utils/DataTransformer",
    "grn/utils/ErrorHandler"
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
         * Create a single material document with all its items
         * @param {Object} materialDocumentData - Complete material document data with header and items
         * @param {Object} callbacks - Callbacks for success, error
         */
        createSingleMaterialDocument(materialDocumentData, callbacks) {
            if (!materialDocumentData) {
                throw new Error("Material document data is required");
            }

            BusyIndicator.show(0);

            // Create the material document with deep insert
            this._oModel.create("/A_MaterialDocumentHeader", materialDocumentData, {
                success: (oData, oResponse) => {
                    BusyIndicator.hide();
                    // Store the raw response for export
                    this.lastResponseText =
                        oResponse.body || oResponse.data || JSON.stringify(oData);

                    // Try to extract data for export
                    const exportData = this._parseODataResponse(this.lastResponseText);

                    // Prepare success result with consolidated message format
                    const result = {
                        totalRecords: materialDocumentData.to_MaterialDocumentItem.results.length,
                        successfulRecords: materialDocumentData.to_MaterialDocumentItem.results.length,
                        failedRecords: 0,
                        failedRecordsList: [],
                        responseData: exportData, // Include parsed response data
                        rawResponse: this.lastResponseText // Include raw response
                    };

                    // Ensure success message is in "Message" field for each item
                    if (result.responseData && result.responseData.items) {
                        result.responseData.items.forEach(item => {
                            // Set Message field directly, rather than using SuccessMessage or ErrorMessage
                            item.Message = item.Message || "Document processed successfully";
                            // Remove any separate message fields
                            delete item.SuccessMessage;
                            delete item.ErrorMessage;
                        });
                    }

                    if (callbacks && callbacks.success) {
                        callbacks.success(result);
                    }
                },
                error: (oError) => {
                    BusyIndicator.hide();

                    // Extract error information
                    const errorInfo = this._errorHandler.extractODataError(oError);

                    // Prepare failure result with consolidated message format
                    const result = {
                        totalRecords: materialDocumentData.to_MaterialDocumentItem.results.length,
                        successfulRecords: 0,
                        failedRecords: materialDocumentData.to_MaterialDocumentItem.results.length,
                        failedRecordsList: materialDocumentData.to_MaterialDocumentItem.results.map(
                            (item, index) => ({
                                index: index,
                                entry: item,
                                // Use Message instead of separate error fields
                                Message: errorInfo.message,
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
         * Create multiple material documents using batch processing
         * @param {Array} materialDocuments - Array of material documents to process
         * @param {Object} callbacks - Callbacks for batch processing steps
         * @returns {Promise} Promise that resolves when all batches are processed
         */
        createMaterialDocuments(materialDocuments, callbacks) {
            return new Promise((resolve, reject) => {
                try {
                    if (!materialDocuments || materialDocuments.length === 0) {
                        throw new Error("No material documents to process");
                    }

                    // Initialize counters
                    this.totalRecords = materialDocuments.length;
                    this.successCount = 0;
                    this.failureCount = 0;
                    this.failedRecords = [];
                    this.successEntries = [];
                    this._isCancelled = false;

                    // Configure batch processing
                    const batchSize = 20;
                    const totalBatches = Math.ceil(materialDocuments.length / batchSize);

                    // Save original deferred groups
                    const originalDeferredGroups = this._oModel.getDeferredGroups() || [];

                    // Create new array with original groups plus our new batch groups
                    const deferredGroups = [...originalDeferredGroups];
                    for (let i = 0; i < totalBatches; i++) {
                        deferredGroups.push("MaterialDocuments_Batch_" + i);
                    }

                    // Set deferred groups and configure model for batch mode
                    this._oModel.setDeferredGroups(deferredGroups);
                    this._oModel.setUseBatch(true);

                    // Store start time and totals
                    this._batchStartTime = new Date();
                    this._batchTotalEntries = materialDocuments.length;
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
                        materialDocuments,
                        callbacks
                    ).then(result => resolve(result))
                        .catch(error => reject(error));
                } catch (error) {
                    reject(error);
                }
            });
        }

        /**
         * Submit a batch of material documents to OData service
         * @param {Number} batchIndex - Current batch index
         * @param {Number} totalBatches - Total number of batches
         * @param {Array} originalDeferredGroups - Original deferred groups
         * @param {Array} materialDocuments - All material documents to process
         * @param {Object} callbacks - Callbacks for batch processing steps
         * @returns {Promise} Promise that resolves when all batches are processed
         * @private
         */
        _submitBatch(
            batchIndex,
            totalBatches,
            originalDeferredGroups,
            materialDocuments,
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
                                failedRecordsList: this.failedRecords.map(record => {
                                    // Ensure failed records use a single Message field
                                    const processedRecord = { ...record };
                                    processedRecord.Message = record.Message || record.error || "Operation cancelled by user";
                                    delete processedRecord.error; // Remove separate error field
                                    return processedRecord;
                                }),
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

                    // Process success entries to ensure they use a single Message field
                    const processedSuccessEntries = this.successEntries.map(entry => {
                        const processedEntry = { ...entry };
                        processedEntry.Message = entry.Message || "Document processed successfully";
                        return processedEntry;
                    });

                    // Process failed records to ensure they use a single Message field
                    const processedFailedRecords = this.failedRecords.map(record => {
                        const processedRecord = { ...record };
                        processedRecord.Message = record.Message || record.error || "Processing failed";
                        delete processedRecord.error; // Remove separate error field
                        return processedRecord;
                    });

                    // Prepare result object with consolidated message format
                    const responseData = {
                        items: processedSuccessEntries,
                        successItems: this.successCount,
                        errorItems: processedFailedRecords
                    };

                    // Call success callback
                    if (callbacks && callbacks.success) {
                        callbacks.success({
                            totalRecords: this.totalRecords,
                            successfulRecords: this.successCount,
                            failedRecords: this.failureCount,
                            failedRecordsList: processedFailedRecords,
                            responseData: responseData,
                            rawResponse: JSON.stringify(responseData)
                        });
                    }

                    resolve({
                        cancelled: false,
                        totalRecords: this.totalRecords,
                        successCount: this.successCount,
                        failureCount: this.failureCount,
                        failedRecords: processedFailedRecords
                    });
                    return;
                }

                // Calculate the start and end indices for this batch
                const batchSize = 20;
                const startIndex = batchIndex * batchSize;
                const endIndex = Math.min(
                    startIndex + batchSize,
                    materialDocuments.length
                );
                const batchEntries = materialDocuments.slice(startIndex, endIndex);
                const groupId = "MaterialDocuments_Batch_" + batchIndex;

                // Update progress if callback provided
                if (callbacks && callbacks.batchStart) {
                    callbacks.batchStart(batchIndex, totalBatches);
                }

                // Group entries by document number
                const documentGroups = this._dataTransformer.groupByFields(batchEntries, ['PurchaseOrder', 'PostingDate']);

                // Process each document group
                Object.keys(documentGroups).forEach(groupKey => {
                    const itemsForDocument = documentGroups[groupKey];
                    const firstItem = itemsForDocument[0];
                    const grnDocNumber = firstItem.GRNDocumentNumber || "Unknown";

                    // Create material document header with the DataTransformer
                    const materialDocHeader = this._dataTransformer.transformToODataFormat(itemsForDocument);

                    // Create the material document with deep insert
                    this._oModel.create("/A_MaterialDocumentHeader", materialDocHeader, {
                        groupId: groupId,
                        success: (data, response) => {
                            // Increment success counter
                            this.successCount += itemsForDocument.length;

                            // Add to success entries with consolidated message format
                            this.successEntries.push({
                                GRNDocumentNumber: grnDocNumber,
                                MaterialDocument: data.MaterialDocument,
                                MaterialDocumentYear: data.MaterialDocumentYear,
                                Status: "Success",
                                Message: "Document processed successfully" // Use a single Message field
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

                            // Extract error information
                            const errorInfo = this._errorHandler.extractODataError(error);

                            // Add to failed records with consolidated message format
                            this.failedRecords.push({
                                GRNDocumentNumber: grnDocNumber,
                                Status: "Error",
                                Message: errorInfo.message, // Use a single Message field
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
                            materialDocuments,
                            callbacks
                        ).then(resolve).catch(reject);
                    },
                    error: (error) => {
                        // Extract error information
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
                                    failedRecordsList: this.failedRecords.map(record => {
                                        // Ensure all failed records use a single Message field
                                        const processedRecord = { ...record };
                                        if (!processedRecord.Message) {
                                            processedRecord.Message = record.error || `Batch submission error: ${errorInfo.message}`;
                                        }
                                        delete processedRecord.error; // Remove separate error field
                                        return processedRecord;
                                    }),
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

                // Extract header values
                const header = {
                    MaterialDocument: data.MaterialDocument,
                    MaterialDocumentYear: data.MaterialDocumentYear,
                    DocumentDate: this._dataTransformer.parseODataDate(data.DocumentDate),
                    PostingDate: this._dataTransformer.parseODataDate(data.PostingDate),
                    MaterialDocumentHeaderText: data.MaterialDocumentHeaderText,
                    ReferenceDocument: data.ReferenceDocument,
                    GoodsMovementCode: data.GoodsMovementCode,
                    InventoryTransactionType: data.InventoryTransactionType
                };

                // Check if items exist
                const items = [];
                if (data.to_MaterialDocumentItem && data.to_MaterialDocumentItem.results) {
                    data.to_MaterialDocumentItem.results.forEach(item => {
                        items.push({
                            MaterialDocument: item.MaterialDocument,
                            MaterialDocumentYear: item.MaterialDocumentYear,
                            MaterialDocumentItem: item.MaterialDocumentItem,
                            Material: item.Material,
                            Plant: item.Plant,
                            StorageLocation: item.StorageLocation,
                            GoodsMovementType: item.GoodsMovementType,
                            PurchaseOrder: item.PurchaseOrder,
                            PurchaseOrderItem: item.PurchaseOrderItem,
                            QuantityInEntryUnit: item.QuantityInEntryUnit,
                            EntryUnit: item.EntryUnit,
                            GoodsMovementRefDocType: item.GoodsMovementRefDocType,
                            Status: "Success",
                            Message: "Material document item created successfully" // Add a consistent Message field
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
                // Extract the JSON part from the response (handling different formats)
                let jsonText = responseText;

                // If the response has HTTP headers, extract just the JSON body
                if (
                    responseText.includes("HTTP/1.1") &&
                    responseText.includes("Content-Type:")
                ) {
                    const bodyStart = responseText.indexOf("{");
                    if (bodyStart > 0) {
                        jsonText = responseText.substring(bodyStart);
                    }
                }

                const errorData = JSON.parse(jsonText);
                let mainErrorMessage = "Unknown error";
                let detailedErrors = [];

                // Extract the main error message
                if (errorData.error && errorData.error.message) {
                    mainErrorMessage =
                        errorData.error.message.value ||
                        (typeof errorData.error.message === "string"
                            ? errorData.error.message
                            : "Unknown error");
                }

                // Extract detailed error messages from innererror if available
                if (
                    errorData.error &&
                    errorData.error.innererror &&
                    errorData.error.innererror.errordetails
                ) {
                    detailedErrors = errorData.error.innererror.errordetails.map(
                        (detail) => {
                            return {
                                code: detail.code || "",
                                message: detail.message || "",
                                severity: detail.severity || "error"
                            };
                        }
                    );
                }

                // Create error items structure with consolidated message format
                const errorItems = detailedErrors.map((error, index) => {
                    return {
                        SL: (index + 1).toString(),
                        MaterialDocument: "",
                        MaterialDocumentItem: "",
                        ErrorCode: error.code,
                        Message: error.message, // Use a single Message field
                        Severity: error.severity,
                        Status: "Failed"
                    };
                });

                // If no detailed errors were found, create a single error item with the main message
                if (errorItems.length === 0) {
                    errorItems.push({
                        SL: "1",
                        MaterialDocument: "",
                        MaterialDocumentItem: "",
                        ErrorCode: errorData.error?.code || "",
                        Message: mainErrorMessage, // Use a single Message field
                        Severity: "error",
                        Status: "Failed"
                    });
                }

                return {
                    header: {
                        ErrorMessage: mainErrorMessage
                    },
                    items: errorItems,
                    errorItems: errorItems,
                    isError: true
                };
            } catch (e) {
                console.error("Error parsing error response:", e);
                return {
                    header: { ErrorMessage: "Failed to parse error response" },
                    items: [
                        {
                            SL: "1",
                            Message: "Failed to parse error response", // Use a single Message field
                            Status: "Failed"
                        }
                    ],
                    errorItems: [
                        {
                            Message: "Failed to parse error response", // Use a single Message field
                            Status: "Failed"
                        }
                    ],
                    isError: true
                };
            }
        }

        // Other methods remain unchanged...

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