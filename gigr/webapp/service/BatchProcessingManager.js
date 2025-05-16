sap.ui.define([
    "sap/ui/model/json/JSONModel",
    "sap/ui/core/Fragment",
    "gigr/utils/ErrorHandler",
    "gigr/utils/DataTransformer"
], function (JSONModel, Fragment, ErrorHandler, DataTransformer) {
    "use strict";

    /**
     * BatchProcessingManager
     * Centralized manager for batch processing operations
     */
    return class BatchProcessingManager {
        /**
         * Constructor with dependency injection
         * @param {Object} options - Configuration options
         */
        constructor(options = {}) {
            this.oController = options.controller;
            this._errorHandler = options.errorHandler || new ErrorHandler();
            this._dataTransformer = options.dataTransformer || new DataTransformer();
            this._oDataService = options.oDataService;
            this._exportManager = options.exportManager;

            // Initialize processing state
            this.processingCancelled = false;
            this.batchSize = options.batchSize || 10; // Default batch size

            // Initialize response data structure
            this._resetResponseData();
        }

        /**
         * Reset response data structure
         * @private
         */
        _resetResponseData() {
            this.responseData = {
                totalRecords: 0,
                processedCount: 0,
                successCount: 0,
                failureCount: 0,
                successRecords: [],
                errorRecords: [],
                allMessages: []
            };
        }

        /**
         * Initialize batch processing
         * @param {Number} totalRecords - Total number of records to process
         * @param {Number} batchSize - Size of each batch
         * @returns {Promise} Promise for the batch processing dialog
         */
        initBatchProcessing(totalRecords, batchSize) {
            console.log("Initializing batch processing", {
                totalRecords: totalRecords,
                batchSize: batchSize
            });

            return new Promise((resolve, reject) => {
                try {
                    // Set batch size
                    this.batchSize = batchSize || this.batchSize;

                    // Initialize tracking variables
                    this.currentBatchIndex = 0;
                    this.totalBatches = Math.ceil(totalRecords / this.batchSize);
                    this.startTime = new Date();
                    this.processingCancelled = false;

                    // Reset response data
                    this._resetResponseData();
                    this.responseData.totalRecords = totalRecords;

                    // Initialize batch display model
                    const batchDisplayModel = new JSONModel({
                        status: "Initializing batch processing...",
                        error: "",
                        totalBatches: this.totalBatches,
                        currentBatch: 0,
                        processedBatches: 0,
                        totalEntries: totalRecords,
                        processedEntries: 0,
                        successCount: 0,
                        failureCount: 0,
                        timeRemaining: "Calculating...",
                        processingSpeed: "Calculating...",
                        batchProgress: 0,
                        entriesProgress: 0,
                        startTime: this.startTime,
                        isCompleted: false,
                        isError: false,
                        successRecords: [],
                        errorRecords: []
                    });

                    // Set model on controller's view if available
                    if (this.oController && this.oController.getView) {
                        this.oController.getView().setModel(batchDisplayModel, "batchDisplay");
                    }

                    // Load the batch processing dialog
                    this._loadBatchProcessingDialog()
                        .then((dialog) => {
                            console.log("Batch processing dialog loaded successfully", dialog);
                            resolve(dialog);
                        })
                        .catch((error) => {
                            console.error("Error loading batch processing dialog:", error);
                            reject(error);
                        });

                } catch (error) {
                    console.error("Critical error in initBatchProcessing:", error);
                    reject(error);
                }
            });
        }

        /**
         * Start batch processing with a processor function
         * @param {Array} data - Array of records to process
         * @param {Function} processBatchFn - Function to process a batch of records
         * @param {Object} options - Additional options
         * @returns {Promise} Promise that resolves when processing is complete
         */
        startBatchProcessing(data, processBatchFn, options = {}) {
            console.log("Starting batch processing with:", {
                dataLength: data ? data.length : 0,
                options: options
            });

            return new Promise((resolve, reject) => {
                try {
                    if (!data || data.length === 0) {
                        console.warn("No data to process");
                        this._errorHandler.showError("No data to process");
                        reject(new Error("No data to process"));
                        return;
                    }

                    // Initialize batch processing with dialog
                    this.initBatchProcessing(data.length, options.batchSize)
                        .then((dialogResult) => {
                            console.log("Batch processing dialog initialized", dialogResult);

                            // Additional check to ensure dialog is properly initialized
                            if (!dialogResult) {
                                throw new Error("Failed to initialize batch processing dialog");
                            }

                            // Set processing mode if provided
                            if (options.mode) {
                                this.processingMode = options.mode;
                            }

                            // Set processor function
                            this.processBatchFn = processBatchFn;

                            // Start processing with the first batch
                            return this._processBatches(data, processBatchFn, 0);
                        })
                        .then((result) => {
                            console.log("Batch processing completed with result:", result);

                            // Handle completion
                            this._handleBatchProcessingComplete();
                            resolve(this.responseData);
                        })
                        .catch((error) => {
                            console.error("Detailed error in batch processing:", {
                                errorMessage: error.message,
                                errorStack: error.stack,
                                fullError: error
                            });

                            // Update batch display with error details
                            this._updateBatchDisplay({
                                status: "Error in batch processing",
                                error: error.message || "Unknown error occurred",
                                isCompleted: true,
                                isError: true
                            });

                            // Show a detailed error message
                            this._errorHandler.showError(
                                "Batch Processing Error: " +
                                (error.message || "Unknown error occurred") +
                                "\n\nPlease check the console for more details."
                            );

                            reject(error);
                        });

                } catch (topLevelError) {
                    console.error("Top-level error in batch processing:", {
                        errorMessage: topLevelError.message,
                        errorStack: topLevelError.stack,
                        fullError: topLevelError
                    });

                    this._errorHandler.showError(
                        "Critical Error: " +
                        (topLevelError.message || "Unexpected error occurred") +
                        "\n\nPlease contact support."
                    );

                    reject(topLevelError);
                }
            });
        }

        /**
         * Process batches recursively
         * @param {Array} data - Full array of data to process
         * @param {Function} processBatchFn - Function to process each batch
         * @param {Number} startIndex - Current start index
         * @returns {Promise} Promise that resolves when all batches are processed
         * @private
         */
        _processBatches(data, processBatchFn, startIndex) {
            return new Promise((resolve, reject) => {
                // Check if processing has been cancelled
                if (this.processingCancelled) {
                    resolve({
                        cancelled: true,
                        processedRecords: this.responseData.processedCount,
                        successRecords: this.responseData.successCount,
                        failedRecords: this.responseData.failureCount
                    });
                    return;
                }

                // Calculate batch indices
                const endIndex = Math.min(startIndex + this.batchSize, data.length);
                const currentBatch = data.slice(startIndex, endIndex);
                this.currentBatchIndex = Math.floor(startIndex / this.batchSize);

                // Update display with current batch info
                this._updateBatchDisplay({
                    status: `Processing batch ${this.currentBatchIndex + 1} of ${this.totalBatches}...`,
                    currentBatch: this.currentBatchIndex + 1,
                    processedBatches: this.currentBatchIndex,
                    batchProgress: Math.round(((this.currentBatchIndex + 1) / this.totalBatches) * 100)
                });

                // Process current batch
                processBatchFn(currentBatch, this.currentBatchIndex)
                    .then((batchResult) => {
                        // Handle successful records
                        if (batchResult.successfulRecords && batchResult.successfulRecords.length > 0) {
                            batchResult.successfulRecords.forEach((record, index) => {
                                this._handleRecord(true, record, null, startIndex + index);
                            });
                        }

                        // Handle failed records
                        if (batchResult.failedRecordsList && batchResult.failedRecordsList.length > 0) {
                            batchResult.failedRecordsList.forEach((errorRecord, index) => {
                                this._handleRecord(false, errorRecord.entry, errorRecord, startIndex + index);
                            });
                        }

                        // Update processed count
                        const batchProcessed = currentBatch.length;
                        this.responseData.processedCount += batchProcessed;

                        // Update display
                        this._updateBatchDisplay({
                            processedEntries: this.responseData.processedCount,
                            entriesProgress: Math.round((this.responseData.processedCount / this.responseData.totalRecords) * 100)
                        });

                        // Process next batch if available
                        if (endIndex < data.length && !this.processingCancelled) {
                            // Use setTimeout to avoid stack overflow with large datasets
                            setTimeout(() => {
                                this._processBatches(data, processBatchFn, endIndex)
                                    .then(resolve)
                                    .catch(reject);
                            }, 0);
                        } else {
                            // All batches processed
                            resolve({
                                cancelled: this.processingCancelled,
                                processedRecords: this.responseData.processedCount,
                                successRecords: this.responseData.successCount,
                                failedRecords: this.responseData.failureCount
                            });
                        }
                    })
                    .catch((error) => {
                        console.error("Error processing batch:", error);

                        // Handle batch level error - mark all items in batch as failed
                        currentBatch.forEach((item, index) => {
                            const errorRecord = {
                                entry: item,
                                error: error.message || "Unknown error occurred",
                                details: error.details || []
                            };
                            this._handleRecord(false, item, errorRecord, startIndex + index);
                        });

                        // Update processed count
                        const batchProcessed = currentBatch.length;
                        this.responseData.processedCount += batchProcessed;

                        // Update display
                        this._updateBatchDisplay({
                            processedEntries: this.responseData.processedCount,
                            entriesProgress: Math.round((this.responseData.processedCount / this.responseData.totalRecords) * 100),
                            status: "Error occurred in batch processing",
                            error: error.message || "Unknown error occurred",
                            isError: true
                        });

                        // Continue with next batch despite error
                        if (endIndex < data.length && !this.processingCancelled) {
                            setTimeout(() => {
                                this._processBatches(data, processBatchFn, endIndex)
                                    .then(resolve)
                                    .catch(reject);
                            }, 0);
                        } else {
                            // All batches processed
                            resolve({
                                cancelled: this.processingCancelled,
                                processedRecords: this.responseData.processedCount,
                                successRecords: this.responseData.successCount,
                                failedRecords: this.responseData.failureCount,
                                hadErrors: true
                            });
                        }
                    });
            });
        }

        /**
         * Unified method to handle both success and error records
         * @param {Boolean} isSuccess - Whether this is a success record
         * @param {Object} record - Record data
         * @param {Object} errorInfo - Error information (for failed records)
         * @param {Number} index - Record index
         * @private
         */
        _handleRecord(isSuccess, record, errorInfo, index) {
            // Create standardized message
            let messageObject = this._errorHandler.createStandardMessage(
                isSuccess ? "success" : "error",
                isSuccess ? "SUCCESS" : (errorInfo?.errorCode || "ERROR"),
                isSuccess ? (record.Message || "Successfully processed material document") : (errorInfo?.error || "Processing failed"),
                isSuccess ? "" : (errorInfo?.details || []),
                "BatchProcessor",
                record ? (record.GRNDocumentNumber || record.MaterialDocument || "") : "",
                this.currentBatchIndex
            );

            // Add index to message
            messageObject.row = index;

            // Add to appropriate collection in response data
            if (isSuccess) {
                // Add to success records
                this.responseData.successCount++;
                this.responseData.successRecords.push({
                    ...record,
                    Status: "Success",
                    ProcessedAt: new Date().toISOString(),
                    index: index,
                    message: messageObject,
                    Message: messageObject.message
                });
            } else {
                // Add to error records
                this.responseData.failureCount++;

                // Prepare normalized error record
                const normalizedErrorRecord = {
                    ...(record || {}),
                    error: messageObject.message,
                    errorCode: messageObject.code,
                    details: messageObject.details,
                    Status: "Error",
                    ProcessedAt: new Date().toISOString(),
                    index: index,
                    ErrorMessage: messageObject.message,
                    ErrorCode: messageObject.code,
                    message: messageObject,
                    Message: messageObject.message
                };

                this.responseData.errorRecords.push(normalizedErrorRecord);
            }

            // Add to allMessages
            this.responseData.allMessages.push(messageObject);

            // Update batch display model
            this._updateBatchDisplay({
                successCount: this.responseData.successCount,
                failureCount: this.responseData.failureCount,
                successRecords: this.responseData.successRecords,
                errorRecords: this.responseData.errorRecords
            });
        }

        /**
         * Get all messages in a standardized format
         * @returns {Array} - Array of all messages (success and error)
         */
        getAllMessages() {
            return this.responseData.allMessages || [];
        }

        /**
         * Get response data
         * @returns {Object} Response data
         */
        getResponseData() {
            return this.responseData;
        }

        /**
         * Update the batch display model
         * @param {Object} data - Data to update
         * @private
         */
        _updateBatchDisplay(data) {
            if (!this.oController || !this.oController.getView) {
                return;
            }

            const batchDisplayModel = this.oController.getView().getModel("batchDisplay");
            if (!batchDisplayModel) return;

            // Get current data
            const currentData = batchDisplayModel.getData();

            // Calculate processing speed and time remaining
            const currentTime = new Date();
            const elapsedSeconds = Math.max(1, (currentTime - this.startTime) / 1000);
            const processingSpeed = (this.responseData.processedCount / elapsedSeconds).toFixed(0);

            // Calculate time remaining
            const remainingRecords = this.responseData.totalRecords - this.responseData.processedCount;
            let formattedTimeRemaining = "Calculating...";

            if (remainingRecords > 0 && parseFloat(processingSpeed) > 0) {
                const timeRemaining = Math.ceil(remainingRecords / parseFloat(processingSpeed));

                if (timeRemaining > 3600) {
                    const hours = Math.floor(timeRemaining / 3600);
                    const minutes = Math.floor((timeRemaining % 3600) / 60);
                    formattedTimeRemaining = `${hours}h ${minutes}m`;
                } else if (timeRemaining > 60) {
                    const minutes = Math.floor(timeRemaining / 60);
                    const seconds = timeRemaining % 60;
                    formattedTimeRemaining = `${minutes}m ${seconds}s`;
                } else {
                    formattedTimeRemaining = `${timeRemaining}s`;
                }
            }

            // Create updated data
            const updatedData = {
                ...currentData,
                ...data,
                processingSpeed: `${processingSpeed} records/sec`,
                timeRemaining: formattedTimeRemaining
            };

            // Update the model
            batchDisplayModel.setData(updatedData);
        }

        /**
         * Handle batch processing completion
         * @private
         */
        _handleBatchProcessingComplete() {
            // Update batch display model
            this._updateBatchDisplay({
                status: this.responseData.failureCount > 0
                    ? `Processing completed with ${this.responseData.failureCount} errors`
                    : "Processing completed successfully",
                isCompleted: true,
                isError: this.responseData.failureCount > 0,
                error: this.responseData.failureCount > 0
                    ? `${this.responseData.failureCount} records failed to process`
                    : "",
                batchProgress: 100,
                entriesProgress: 100,
                currentBatch: this.totalBatches,
                processedBatches: this.totalBatches,
                timeRemaining: "0s"
            });

            // Make export buttons visible
            this._showExportButtons();
        }

        /**
         * Cancel ongoing batch processing
         */
        cancelBatchProcessing() {
            this.processingCancelled = true;

            // Update batch display model
            this._updateBatchDisplay({
                status: "Processing cancelled by user",
                isError: true,
                error: "Processing was cancelled by the user"
            });
        }

        /**
         * Load the batch processing dialog
         * @returns {Promise} Promise that resolves with the dialog
         * @private
         */
        _loadBatchProcessingDialog() {
            return new Promise((resolve, reject) => {
                // Check if dialog already exists
                if (this.oController && this.oController._batchProcessingDialog) {
                    // Set model and open dialog
                    this.oController._batchProcessingDialog.open();
                    resolve(this.oController._batchProcessingDialog);
                    return;
                }

                // Load dialog from fragment
                Fragment.load({
                    name: "gigr.view.BatchProcessingDisplayDialog",
                    controller: this.oController
                })
                    .then((oDialog) => {
                        // Store dialog reference
                        if (this.oController) {
                            this.oController._batchProcessingDialog = oDialog;
                            // Add dialog to view's dependents
                            this.oController.getView().addDependent(oDialog);
                        }

                        // Open dialog
                        oDialog.open();
                        resolve(oDialog);
                    })
                    .catch((error) => {
                        console.error("Error loading batch processing dialog:", error);
                        reject(error);
                    });
            });
        }

        /**
         * Make export buttons visible
         * @private
         */
        _showExportButtons() {
            try {
                if (!this.oController || !this.oController._batchProcessingDialog) {
                    return;
                }

                // Get the export buttons container
                const content = this.oController._batchProcessingDialog.getContent();
                if (content && content.length > 0) {
                    // Try to find the export buttons container
                    let exportContainer = null;
                    const mainContent = content[0];

                    if (mainContent.getItems) {
                        const items = mainContent.getItems();
                        for (let i = 0; i < items.length; i++) {
                            if (items[i].getId().includes("exportButtonsContainer")) {
                                exportContainer = items[i];
                                break;
                            }
                        }
                    }

                    // If found, make it visible
                    if (exportContainer) {
                        exportContainer.setVisible(true);
                    }
                }
            } catch (error) {
                console.error("Error showing export buttons:", error);
            }
        }

        /**
         * Close the batch processing dialog
         */
        closeBatchProcessingDialog() {
            if (this.oController && this.oController._batchProcessingDialog) {
                this.oController._batchProcessingDialog.close();
            }
        }

        /**
         * Process a batch using the OData service
         * @param {Array} batch - Batch of records to process
         * @param {Number} batchIndex - Batch index
         * @returns {Promise} Promise that resolves with batch processing results
         */

        processODataBatch(batch, batchIndex) {
            return new Promise((resolve, reject) => {
                if (!this._oDataService) {
                    reject(new Error("OData service not available"));
                    return;
                }

                // Check if batch is an array
                if (!Array.isArray(batch)) {
                    console.error("Expected batch to be an array but got:", typeof batch, batch);
                    reject(new Error("Invalid batch format: expected array"));
                    return;
                }

                try {
                    // Set up callbacks for OData service
                    const callbacks = {
                        success: (result) => {
                            console.log("OData batch success:", result);

                            // Extract material document info from response data
                            const materialDocument = result.responseData?.header?.MaterialDocument ||
                                result.rawResponse?.d?.MaterialDocument ||
                                "";

                            const materialDocumentYear = result.responseData?.header?.MaterialDocumentYear ||
                                result.rawResponse?.d?.MaterialDocumentYear ||
                                "";

                            // If we have raw response as string, try to parse it
                            let parsedResponse = null;
                            if (typeof result.rawResponse === 'string') {
                                try {
                                    parsedResponse = JSON.parse(result.rawResponse);
                                    if (parsedResponse && parsedResponse.d) {
                                        // Extract document info from parsed response
                                        if (!materialDocument && parsedResponse.d.MaterialDocument) {
                                            materialDocument = parsedResponse.d.MaterialDocument;
                                        }
                                        if (!materialDocumentYear && parsedResponse.d.MaterialDocumentYear) {
                                            materialDocumentYear = parsedResponse.d.MaterialDocumentYear;
                                        }
                                    }
                                } catch (e) {
                                    console.warn("Could not parse raw response:", e);
                                }
                            }

                            // Format successful records with material document info
                            const successfulRecords = batch.map(item => {
                                return {
                                    ...item,
                                    MaterialDocument: materialDocument,
                                    MaterialDocumentYear: materialDocumentYear,
                                    Message: "Material document created successfully"
                                };
                            });

                            resolve({
                                successfulRecords: successfulRecords,
                                failedRecordsList: []
                            });
                        },
                        error: (error) => {
                            console.error("OData batch error:", error);

                            // Format error records - all records in batch failed
                            const failedRecordsList = batch.map(item => {
                                return {
                                    entry: item,
                                    error: error.message || "Unknown error",
                                    errorCode: error.code || "ERROR",
                                    details: error.details || []
                                };
                            });

                            resolve({
                                successfulRecords: [],
                                failedRecordsList: failedRecordsList
                            });
                        }
                    };

                    // Group records by GRNDocumentNumber 
                    const groupedData = this._dataTransformer.groupByDocumentNumber(batch);

                    // Create an array of properly formatted documents
                    const documentsToProcess = [];

                    Object.keys(groupedData).forEach(grnDocNumber => {
                        const itemsForDoc = groupedData[grnDocNumber];
                        if (itemsForDoc && itemsForDoc.length > 0) {
                            // Create a properly formatted document
                            const formattedDoc = this._dataTransformer.transformToODataFormat(itemsForDoc);
                            documentsToProcess.push(formattedDoc);
                        }
                    });

                    if (documentsToProcess.length === 0) {
                        reject(new Error("No valid documents to process"));
                        return;
                    }

                    // Process options
                    const processingOptions = {
                        singleDocument: documentsToProcess.length === 1
                    };

                    // Call appropriate method based on available methods and document count
                    if (processingOptions.singleDocument) {
                        // Check which method exists and use it
                        if (typeof this._oDataService.createSingleGIGRDocument === 'function') {
                            this._oDataService.createSingleGIGRDocument(documentsToProcess[0], callbacks);
                        }
                        else if (typeof this._oDataService.create === 'function') {
                            this._oDataService.create("/A_MaterialDocumentHeader", documentsToProcess[0], callbacks);
                        }
                        else {
                            reject(new Error("No method available for processing single document"));
                        }
                    }
                    else {
                        // Multiple documents - use batch processing if available
                        if (typeof this._oDataService.createGIGRDocuments === 'function') {
                            this._oDataService.createGIGRDocuments(documentsToProcess, callbacks);
                        }
                        else {
                            // Fallback to processing one by one
                            this._oDataService.create("/A_MaterialDocumentHeader", documentsToProcess[0], callbacks);
                        }
                    }
                } catch (error) {
                    console.error("Error preparing batch for OData processing:", error);
                    reject(error);
                }
            });
        }
    };
});