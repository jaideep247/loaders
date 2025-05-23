sap.ui.define([
    "sap/ui/model/json/JSONModel",
    "sap/ui/core/Fragment",
    "assetmastercreate/utils/ErrorHandler",
    "assetmastercreate/utils/DataTransformer" // Assuming path is correct
], function (JSONModel, Fragment, ErrorHandler, DataTransformer) {
    "use strict";

    /**
     * BatchProcessingManager
     * Centralized manager for batch processing operations, such as submitting data via SOAP.
     * Handles batching, progress display, cancellation, and error aggregation.
     */
    return class BatchProcessingManager {
        /**
         * Constructor with dependency injection.
         * @param {Object} options - Configuration options.
         * @param {sap.ui.core.mvc.Controller} options.controller - The controller instance for accessing view and models.
         * @param {assetmastercreate.utils.ErrorHandler} [options.errorHandler] - Error handling utility.
         * @param {assetmastercreate.utils.DataTransformer} [options.dataTransformer] - Data transformation utility.
         * @param {Object} [options.soapService] - Service object for making SOAP calls (should have a method like 'createAssets').
         * @param {Object} [options.exportManager] - Service object for exporting results.
         * @param {Number} [options.batchSize=10] - Default number of records per batch.
         */
        constructor(options = {}) {
            this.oController = options.controller;
            // Ensure dependencies are instantiated if not provided
            this._errorHandler = options.errorHandler || new ErrorHandler(); // Assuming ErrorHandler constructor requires no args or handles defaults
            this._dataTransformer = options.dataTransformer || new DataTransformer(); // Uses DataTransformer from artifact
            this._soapService = options.soapService; // Must be provided if SOAP processing is needed
            this._exportManager = options.exportManager; // Optional, for exporting results

            // Initialize processing state
            this.processingCancelled = false;
            this.batchSize = options.batchSize || 10; // Default batch size
            this._resetResponseData(); // Initialize response data structure
        }

        /**
         * Resets the internal structure for storing processing results.
         * @private
         */
        _resetResponseData() {
            this.responseData = {
                totalRecords: 0,
                processedCount: 0,
                successCount: 0,
                failureCount: 0,
                successRecords: [], // Stores successfully processed records with results
                errorRecords: [],   // Stores failed records with error details
                allMessages: []     // Stores all messages (success/error) generated during processing
            };
        }

        /**
         * Initializes the batch processing state, model, and dialog.
         * @param {Number} totalRecords - Total number of records to be processed.
         * @param {Number} batchSize - The number of records per batch.
         * @returns {Promise<sap.m.Dialog>} Promise resolving with the batch processing dialog instance.
         */
        initBatchProcessing(totalRecords, batchSize) {
            return new Promise((resolve, reject) => {
                try {
                    // Set processing parameters
                    this.batchSize = batchSize || this.batchSize;
                    this.currentBatchIndex = 0; // Start with the first batch
                    this.totalBatches = Math.ceil(totalRecords / this.batchSize);
                    this.startTime = new Date();
                    this.processingCancelled = false; // Reset cancellation flag

                    // Reset result data
                    this._resetResponseData();
                    this.responseData.totalRecords = totalRecords;

                    // Create or update the JSONModel for the progress display dialog
                    const batchDisplayModel = new JSONModel({
                        status: "Initializing...",
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
                        startTime: this.startTime.toISOString(), // Store start time
                        isCompleted: false,
                        isError: false,
                        successRecords: [], // Bound to success list in dialog
                        errorRecords: []    // Bound to error list in dialog
                    });

                    // Set the model on the view if controller is available
                    if (this.oController?.getView) {
                        this.oController.getView().setModel(batchDisplayModel, "batchDisplay");
                    } else {
                        console.warn("BatchProcessingManager: Controller or View not available to set batchDisplay model.");
                    }

                    // Load and open the batch processing dialog
                    this._loadBatchProcessingDialog()
                        .then(resolve) // Resolve the main promise with the dialog instance
                        .catch(reject); // Reject if dialog loading fails

                } catch (error) {
                    console.error("Error initializing batch processing:", error);
                    reject(error);
                }
            });
        }

        /**
         * Starts the batch processing flow.
         * @param {Array} data - The array of data records to process.
         * @param {Function} [processBatchFn=this.processBatch] - The function to call for processing each batch. Defaults to `this.processBatch`.
         * @param {Object} [options={}] - Additional options.
         * @param {Number} [options.batchSize] - Override the default batch size for this run.
         * @param {String} [options.mode] - Optional processing mode identifier.
         * @returns {Promise<Object>} Promise resolving with the final `responseData` object upon completion or cancellation.
         */
        // In BatchProcessingManager.js, modify the startBatchProcessing method to handle token errors
        startBatchProcessing(data, processBatchFn = this.processBatch.bind(this), options = {}) {
            return new Promise((resolve, reject) => {
                try {
                    // Basic validation
                    if (!Array.isArray(data) || !data.length) {
                        const errorMsg = "No data provided for batch processing.";
                        this._errorHandler?.showError(errorMsg);
                        reject(new Error(errorMsg));
                        return;
                    }

                    // Initialize state and dialog first
                    this.initBatchProcessing(data.length, options.batchSize)
                        .then(() => {
                            // Initialization successful, dialog is open (or was already open)
                            if (options.mode) this.processingMode = options.mode;
                            this.processBatchFn = processBatchFn;

                            // Start the recursive batch processing
                            return this._processBatches(data, this.processBatchFn, 0);
                        })
                        .then((finalStatus) => {
                            // Recursive processing finished (or was cancelled)
                            this._handleBatchProcessingComplete(finalStatus.cancelled);
                            resolve(this.responseData);
                        })
                        .catch(error => {
                            // Close the batch processing dialog before showing error
                            this.closeBatchProcessingDialog(); // Add this line

                            console.error("Error during batch processing:", error);
                            this._updateBatchDisplay({
                                status: "Error during processing",
                                error: error.message || "An unknown error occurred.",
                                isCompleted: true,
                                isError: true
                            });
                            this._errorHandler?.showError(`Batch Processing Error: ${error.message}`);
                            reject(error);
                        });
                } catch (error) {
                    // Close any open dialogs before showing error
                    this.closeBatchProcessingDialog(); // Add this line

                    console.error("Critical error starting batch processing:", error);
                    this._errorHandler?.showError(`Critical Error: ${error.message}`);
                    reject(error);
                }
            });
        }

        /**
         * Default function to process a single batch. Determines the service to use (e.g., SOAP).
         * Can be overridden by passing a different function to `startBatchProcessing`.
         * @param {Array} batch - The array of records in the current batch.
         * @param {Number} batchIndex - The 0-based index of the current batch.
         * @returns {Promise<Object>} A promise resolving with { successfulRecords: Array, failedRecordsList: Array }.
         */
        processBatch(batch, batchIndex) {
            console.log("Inside Process Batch")
            // Example: Default to SOAP processing if service is available
            if (this._soapService) {
                return this._processSOAPBatch(batch, batchIndex);
            }
            // Add other processing types here (e.g., OData $batch)
            // else if (this._oDataService) { ... }

            // If no service is configured, reject the promise
            console.error("BatchProcessingManager: No processing service (SOAP, OData, etc.) configured.");
            return Promise.reject(new Error("No processing service configured"));
        }

        /**
         * Processes a batch of records using the configured SOAP service.
         * Transforms data using DataTransformer before sending.
         * @param {Array} batch - The array of records in the current batch.
         * @param {Number} batchIndex - The 0-based index of the current batch.
         * @returns {Promise<Object>} A promise resolving with { successfulRecords: Array, failedRecordsList: Array }.
         * @private
         */
        _processSOAPBatch(batch) {
     
            return new Promise((resolve, reject) => {
                // Pre-checks
                if (!this._soapService) {
                    return reject(new Error("SOAP service instance is not available in BatchProcessingManager."));
                }
                if (!this._soapService.createAssets || typeof this._soapService.createAssets !== 'function') {
                    return reject(new Error("Configured SOAP service does not have a 'createAssets' method."));
                }
                if (!Array.isArray(batch)) {
                    return reject(new Error("Invalid batch data provided to _processSOAPBatch (must be an array)."));
                }
                if (!this._dataTransformer) {
                    return reject(new Error("DataTransformer instance is not available in BatchProcessingManager."));
                }

                try {
                    // Transform batch items to the format expected by the SOAP service
                    // Using the CORRECT method name from DataTransformer artifact
                    const soapBatchPayload = batch.map(item =>
                        this._dataTransformer.prepareEntryForSOAP(item) // Corrected method name
                    );

                    // Call the SOAP service method
                    this._soapService.createAssets(soapBatchPayload, {
                        success: (result) => {
                            // Process successful records from the result
                            // Adapt property names (e.g., result.successData) based on actual SOAP service response
                            const successfulRecords = (result?.successfulRecords || []).map(successRecord => ({
                                ...successRecord, // Include all data returned for the success record
                                Status: "Success", // Standardize status field
                                Message: successRecord.Message || "Asset created successfully", // Use message from result if available
                                AssetNumber: successRecord.Asset || successRecord.AssetNumber // Adapt based on actual result property name
                            }));

                            // Process failed records from the result
                            // Adapt property names (e.g., result.errorData) based on actual SOAP service response
                            const failedRecordsList = (result?.failedRecordsList || []).map(errorRecord => ({
                                entry: errorRecord.assetData || null, // Include original data if returned by service
                                error: errorRecord.error || "Processing failed (unknown reason)",
                                errorCode: errorRecord.errorCode || "SOAP_ERROR",
                                details: errorRecord.details || [] // Include details if provided
                            }));

                            // Resolve the promise with the processed results
                            resolve({ successfulRecords, failedRecordsList });
                        },
                        error: (error) => {
                            // Handle errors reported by the SOAP service call itself (e.g., network error, auth error)
                            console.error("SOAP Service call failed:", error);
                            // Assume the entire batch failed due to the call error
                            const failedRecordsList = batch.map(originalItem => ({
                                entry: originalItem, // The original item that was part of the failed batch
                                error: error.message || "SOAP service call failed",
                                errorCode: error.code || "SOAP_CALL_FAILURE",
                                details: error.details || (error.responseJSON ? [error.responseJSON] : []) // Include details if possible
                            }));
                            // Resolve with empty success list and list of failures
                            resolve({ successfulRecords: [], failedRecordsList });
                        }
                    });
                } catch (error) {
                    // Catch synchronous errors during data transformation (e.g., if prepareEntryForSOAP fails)
                    console.error("Error transforming data for SOAP batch:", error);
                    // Reject the promise for this batch if transformation fails
                    reject(error);
                }
            });
        }

        /**
         * Recursively processes the data in batches.
         * @param {Array} data - The full dataset.
         * @param {Function} processBatchFn - The function to execute for each batch.
         * @param {Number} startIndex - The starting index in the data array for the current batch.
         * @returns {Promise<Object>} A promise that resolves when all batches are processed or processing is cancelled.
         * @private
         */
        _processBatches(data, processBatchFn, startIndex) {
            return new Promise((resolve, reject) => {
                // Check if processing was cancelled by the user
                if (this.processingCancelled) {
                    console.log("Batch processing cancelled by user.");
                    return resolve({ cancelled: true }); // Resolve indicating cancellation
                }

                // Determine the slice for the current batch
                const endIndex = Math.min(startIndex + this.batchSize, data.length);
                const currentBatch = data.slice(startIndex, endIndex);
                this.currentBatchIndex = Math.floor(startIndex / this.batchSize); // Update current batch index

                // Update the progress dialog
                this._updateBatchDisplay({
                    status: `Processing batch ${this.currentBatchIndex + 1} of ${this.totalBatches}...`,
                    currentBatch: this.currentBatchIndex + 1,
                    processedBatches: this.currentBatchIndex, // Batches completed *before* this one
                    batchProgress: Math.round(((this.currentBatchIndex + 1) / this.totalBatches) * 100) // Progress based on batches
                });

                // Call the provided function to process the current batch
                processBatchFn(currentBatch, this.currentBatchIndex)
                    .then((batchResult) => {
                        // Process the results returned by processBatchFn
                        if (batchResult?.successfulRecords?.length) {
                            batchResult.successfulRecords.forEach((record, idx) => {
                                // Pass original index from the full dataset
                                this._handleRecord(true, record, null, startIndex + idx);
                            });
                        }
                        if (batchResult?.failedRecordsList?.length) {
                            batchResult.failedRecordsList.forEach((errorRecord, idx) => {
                                // Find corresponding original item if needed, or use index
                                // Assuming errorRecord.entry holds original data or identifier
                                const originalIndex = startIndex + idx; // Simplistic index mapping, adjust if needed
                                this._handleRecord(false, errorRecord.entry, errorRecord, originalIndex);
                            });
                        }

                        // Update overall progress counts after processing the batch result
                        this.responseData.processedCount += currentBatch.length;
                        this._updateBatchDisplay({
                            processedEntries: this.responseData.processedCount,
                            entriesProgress: Math.round((this.responseData.processedCount / this.responseData.totalRecords) * 100)
                        });

                        // Check if there are more records to process and not cancelled
                        if (endIndex < data.length && !this.processingCancelled) {
                            // Schedule the next batch using setTimeout to allow UI updates
                            setTimeout(() => {
                                this._processBatches(data, processBatchFn, endIndex) // Recursive call for the next slice
                                    .then(resolve) // Propagate eventual resolution
                                    .catch(reject); // Propagate eventual rejection
                            }, 0); // Use 0ms delay for yielding
                        } else {
                            // All batches processed or cancelled
                            resolve({ cancelled: this.processingCancelled }); // Resolve the final promise
                        }
                    })
                    .catch((error) => {
                        // Handle errors from the processBatchFn promise itself
                        console.error(`Error processing batch starting at index ${startIndex}:`, error);
                        // Mark all items in the current batch as failed due to this error
                        currentBatch.forEach((item, idx) => {
                            this._handleRecord(false, item, {
                                entry: item,
                                error: error.message || "Batch processing function failed",
                                errorCode: "BATCH_FUNC_ERROR",
                                details: error.details || []
                            }, startIndex + idx);
                        });

                        // Update counts and display
                        this.responseData.processedCount += currentBatch.length; // Still processed, just failed
                        this._updateBatchDisplay({
                            processedEntries: this.responseData.processedCount,
                            entriesProgress: Math.round((this.responseData.processedCount / this.responseData.totalRecords) * 100),
                            status: `Error in batch ${this.currentBatchIndex + 1}`,
                            error: error.message,
                            isError: true // Mark general error state
                        });

                        // Decide whether to continue or stop on batch error (current logic continues)
                        if (endIndex < data.length && !this.processingCancelled) {
                            setTimeout(() => {
                                this._processBatches(data, processBatchFn, endIndex)
                                    .then(resolve)
                                    .catch(reject);
                            }, 0);
                        } else {
                            // If this was the last batch or cancelled, resolve (indicating errors occurred)
                            resolve({ cancelled: this.processingCancelled, hadErrors: true });
                        }
                        // Alternative: Reject immediately on batch error?
                        // reject(error);
                    });
            });
        }

        /**
         * Handles the result of processing a single record (success or failure).
         * Updates the internal responseData and the display model.
         * @param {Boolean} isSuccess - True if the record was processed successfully, false otherwise.
         * @param {Object} record - The processed record data (if success) or original data (if failure).
         * @param {Object|null} errorInfo - Details about the error (if failure). Expected: { error: String, errorCode: String, details: Array }
         * @param {Number} index - The original 0-based index of the record in the full dataset.
         * @private
         */
        _handleRecord(isSuccess, record, errorInfo, index) {
            // Create a standardized message object for logging/display
            const messageObject = {
                type: isSuccess ? "Success" : "Error", // Use sap.ui.core.MessageType values if possible
                code: isSuccess ? "SUCCESS" : (errorInfo?.errorCode || "ERROR"),
                message: isSuccess ? (record?.Message || "Successfully processed") : (errorInfo?.error || "Processing failed"),
                details: isSuccess ? [] : (errorInfo?.details || []), // Ensure details is an array
                timestamp: new Date().toISOString(),
                source: "BatchProcessor",
                entityId: record?.SequenceNumber || record?.SequenceID || `Row_${index + 1}`, // Try to get an ID
                batchIndex: this.currentBatchIndex,
                row: index // Original row index (0-based)
            };

            // Add to the appropriate list in responseData
            if (isSuccess) {
                this.responseData.successCount++;
                this.responseData.successRecords.push({
                    ...(record || {}), // Include data returned from backend
                    Status: "Success",
                    ProcessedAt: messageObject.timestamp,
                    OriginalIndex: index, // Keep track of original position
                    message: messageObject // Attach the message object
                    // Ensure 'Message' property aligns with what the success list binding expects
                    // Message: messageObject.message
                });
            } else {
                this.responseData.failureCount++;
                this.responseData.errorRecords.push({
                    ...(record || {}), // Include original data if available in errorInfo.entry or record
                    Status: "Error",
                    ProcessedAt: messageObject.timestamp,
                    OriginalIndex: index,
                    ErrorMessage: messageObject.message, // Specific properties for error list binding
                    ErrorCode: messageObject.code,
                    ErrorDetails: messageObject.details,
                    message: messageObject // Attach the full message object
                    // Ensure 'Message' property aligns with what the error list binding expects
                    // Message: messageObject.message
                });
            }

            // Add to the combined message log
            this.responseData.allMessages.push(messageObject);

            // Update the display model (counts and potentially the lists if bound directly)
            // Debounce this update if it causes performance issues
            this._updateBatchDisplay({
                successCount: this.responseData.successCount,
                failureCount: this.responseData.failureCount,
                // Update arrays in model only if dialog lists are bound directly
                successRecords: this.responseData.successRecords,
                errorRecords: this.responseData.errorRecords
            });
        }

        /**
         * Updates the JSONModel ("batchDisplay") bound to the progress dialog.
         * Calculates estimated time remaining and processing speed.
         * @param {Object} data - An object containing properties to update in the model.
         * @private
         */
        _updateBatchDisplay(data) {
            if (!this.oController?.getView) {
                // console.warn("Cannot update batch display: Controller/View not found.");
                return;
            }

            const batchDisplayModel = this.oController.getView().getModel("batchDisplay");
            if (!batchDisplayModel) {
                // console.warn("Cannot update batch display: Model 'batchDisplay' not found.");
                return;
            }

            const currentData = batchDisplayModel.getData();
            const updatedData = { ...currentData, ...data }; // Merge new data

            // Recalculate time/speed based on potentially updated counts
            const currentTime = new Date();
            const elapsedSeconds = Math.max(1, (currentTime - this.startTime) / 1000); // Avoid division by zero
            const currentProcessedCount = updatedData.processedEntries || this.responseData.processedCount; // Use updated count if provided
            const currentTotalRecords = updatedData.totalEntries || this.responseData.totalRecords;

            const processingSpeed = (currentProcessedCount / elapsedSeconds).toFixed(0); // Records per second
            const remainingRecords = currentTotalRecords - currentProcessedCount;

            let formattedTimeRemaining = "N/A";
            if (updatedData.isCompleted) {
                formattedTimeRemaining = "0s";
            } else if (remainingRecords > 0 && parseFloat(processingSpeed) > 0) {
                const timeRemainingSeconds = Math.ceil(remainingRecords / parseFloat(processingSpeed));
                if (timeRemainingSeconds > 3600) { // More than an hour
                    formattedTimeRemaining = `${Math.floor(timeRemainingSeconds / 3600)}h ${Math.floor((timeRemainingSeconds % 3600) / 60)}m`;
                } else if (timeRemainingSeconds > 60) { // More than a minute
                    formattedTimeRemaining = `${Math.floor(timeRemainingSeconds / 60)}m ${timeRemainingSeconds % 60}s`;
                } else { // Less than a minute
                    formattedTimeRemaining = `${timeRemainingSeconds}s`;
                }
            } else if (remainingRecords === 0 && !updatedData.isCompleted) {
                formattedTimeRemaining = "Finishing...";
            } else {
                formattedTimeRemaining = "Calculating...";
            }


            // Set the final updated data back to the model
            batchDisplayModel.setData({
                ...updatedData, // Include merged data (status, counts, progress, etc.)
                processingSpeed: `${processingSpeed} records/sec`,
                timeRemaining: formattedTimeRemaining
            }, true); // Use bMerge=true to merge with existing data
            // batchDisplayModel.refresh(true); // Force refresh if needed, but setData with merge should usually suffice
        }

        /**
         * Finalizes the batch processing display when processing is complete or cancelled.
         * @param {Boolean} [wasCancelled=false] - Indicates if processing was cancelled.
         * @private
         */
        _handleBatchProcessingComplete(wasCancelled = false) {
            const finalStatus = wasCancelled
                ? "Cancelled by user"
                : (this.responseData.failureCount > 0
                    ? `Completed with ${this.responseData.failureCount} errors`
                    : "Completed successfully");

            this._updateBatchDisplay({
                status: finalStatus,
                isCompleted: true,
                isError: !wasCancelled && this.responseData.failureCount > 0, // Error state if completed with failures
                error: !wasCancelled && this.responseData.failureCount > 0
                    ? `${this.responseData.failureCount} records failed processing.`
                    : (wasCancelled ? "Processing was cancelled." : ""), // Clear error message if successful or cancelled without errors during cancellation
                batchProgress: 100, // Ensure progress bars are full
                entriesProgress: 100,
                currentBatch: this.totalBatches, // Show final batch number
                processedBatches: this.totalBatches,
                timeRemaining: "0s" // Processing finished
            });
            this._showExportButtons(); // Make export buttons visible
        }

        /**
         * Loads the batch processing dialog fragment if not already loaded.
         * Opens the dialog.
         * @returns {Promise<sap.m.Dialog>} A promise resolving with the dialog instance.
         * @private
         */
        _loadBatchProcessingDialog() {
            return new Promise((resolve, reject) => {
                // Check if controller and its _batchProcessingDialog property exist
                if (this.oController && this.oController._batchProcessingDialog) {
                    this.oController._batchProcessingDialog.open();
                    return resolve(this.oController._batchProcessingDialog);
                }

                // Ensure controller exists before loading fragment associated with it
                if (!this.oController) {
                    const errorMsg = "BatchProcessingManager: Controller instance is required to load the dialog fragment.";
                    console.error(errorMsg);
                    return reject(new Error(errorMsg));
                }

                // Load the fragment
                Fragment.load({
                    name: "assetmastercreate.view.BatchProcessingDisplayDialog", // Ensure path is correct
                    controller: this.oController // Associate with the controller
                }).then(oDialog => {
                    // Store the dialog instance on the controller for reuse
                    this.oController._batchProcessingDialog = oDialog;
                    // Add the dialog as a dependent to the controller's view for lifecycle management
                    if (this.oController.getView) {
                        this.oController.getView().addDependent(oDialog);
                    } else {
                        console.warn("BatchProcessingManager: Controller view not found, cannot add dialog as dependent.");
                    }
                    oDialog.open(); // Open the newly loaded dialog
                    resolve(oDialog); // Resolve with the dialog instance
                }).catch(error => {
                    console.error("Failed to load Batch Processing Dialog fragment:", error);
                    this._errorHandler?.showError("Failed to load processing dialog.");
                    reject(error);
                });
            });
        }

        /**
         * Makes the export buttons container within the batch processing dialog visible.
         * Assumes a specific structure and ID convention for the container.
         * @private
         */
        _showExportButtons() {
            try {
                const dialog = this.oController?._batchProcessingDialog;
                if (!dialog) return;

                // Attempt to find the container by a partial ID match
                // This relies on the container having an ID like "...--exportButtonsContainer"
                const exportContainer = sap.ui.getCore().byId(dialog.getId() + "--exportButtonsContainer");

                if (exportContainer && typeof exportContainer.setVisible === 'function') {
                    exportContainer.setVisible(true);
                } else {
                    // Fallback or alternative search method if ID is different
                    console.warn("Could not find export buttons container with ID convention:", dialog.getId() + "--exportButtonsContainer");
                    // Example: Search within dialog content if structure is known
                    // const content = dialog.getContent()[0]; // Assuming content structure
                    // const container = content?.getItems?.().find(item => item.getId().includes("exportButtonsContainer"));
                    // if (container) container.setVisible(true);
                }
            } catch (error) {
                console.error("Error trying to show export buttons:", error);
            }
        }

        // --- Public Methods ---

        /**
         * Returns the array of all messages (success and error) collected during processing.
         * @returns {Array<Object>} Array of message objects.
         */
        getAllMessages() {
            return this.responseData.allMessages || [];
        }

        /**
         * Returns the complete response data object containing counts and record lists.
         * @returns {Object} The responseData object.
         */
        getResponseData() {
            return this.responseData;
        }

        /**
         * Sets the flag to cancel the ongoing batch processing.
         * The cancellation takes effect before the next batch starts.
         */
        cancelBatchProcessing() {
            console.log("Batch processing cancellation requested.");
            this.processingCancelled = true;
            // Update the dialog immediately to reflect cancellation request
            this._updateBatchDisplay({
                status: "Cancelling...",
                isError: true, // Visually indicate interruption
                error: "Processing cancellation requested by user."
            });
            // Note: The final "Cancelled by user" status is set in _handleBatchProcessingComplete
        }

        /**
         * Closes the batch processing dialog if it exists.
         */
        closeBatchProcessingDialog() {
            if (this.oController?._batchProcessingDialog) {
                this.oController._batchProcessingDialog.close();
                // Optional: Destroy the dialog if it won't be reused soon to free resources
                // this.oController._batchProcessingDialog.destroy();
                // this.oController._batchProcessingDialog = null;
            }
        }
    };
});
