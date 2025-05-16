sap.ui.define([
    "sap/ui/model/json/JSONModel",
    "sap/ui/core/Fragment",
    "sap/m/MessageBox",
    "purchaseorder/utils/ProgressTracker",
    "purchaseorder/utils/ErrorUtils"
], function (JSONModel, Fragment, MessageBox, ProgressTracker, ErrorUtils) {
    "use strict";

    return function (oController) {
        // Controller reference
        this.oController = oController;
        this._batchProcessingDialog = null;
        this._progressTracker = new ProgressTracker();
        this._batchDisplayModel = null;
        this._timeoutId = null;

        // Processing state (simplified)
        this._processingState = {
            isProcessing: false,
            isCanceled: false,
            currentBatchIndex: 0,
            totalBatches: 0
        };

        // Response data
        this._responseData = {
            totalRecords: 0,
            successCount: 0,
            failureCount: 0,
            successRecords: [],
            errorRecords: [],
            allMessages: []
        };

        this._logInfo = function (message) {
            console.log(`[BatchProcessingManager] ${message}`);
        };

        this._logError = function (message, error) {
            console.error(`[BatchProcessingManager] ${message}`, error || "");
        };

        // Progress display methods
        this._initBatchProcessingDisplay = function (totalEntries) {
            return new Promise((resolve, reject) => {
                try {
                    this._batchDisplayModel = new JSONModel({
                        status: "Initializing batch processing...",
                        totalEntries: totalEntries,
                        processedEntries: 0,
                        successCount: 0,
                        failureCount: 0,
                        percentage: 0,
                        timeRemaining: "Calculating...",
                        processingSpeed: "0 entries/sec",
                        currentBatch: 0,
                        totalBatches: this._processingState.totalBatches,
                        isCompleted: false,
                        isError: false
                    });

                    this.oController.getView().setModel(this._batchDisplayModel, "batchDisplay");

                    if (!this._batchProcessingDialog) {
                        Fragment.load({
                            name: "purchaseorder.view.BatchProcessingDisplayDialog",
                            controller: this.oController
                        }).then(oDialog => {
                            this._batchProcessingDialog = oDialog;
                            this.oController.getView().addDependent(oDialog);
                            oDialog.open();
                            resolve(oDialog);
                        }).catch(error => {
                            this._logError("Error loading fragment", error);
                            // Even if dialog fails, continue processing
                            resolve(null);
                        });
                    } else {
                        try {
                            if (!this._batchProcessingDialog.isOpen()) {
                                this._batchProcessingDialog.open();
                            }
                        } catch (error) {
                            this._logError("Error opening dialog", error);
                        }
                        resolve(this._batchProcessingDialog);
                    }
                } catch (error) {
                    this._logError("Error initializing batch display", error);
                    // Continue even if display fails
                    resolve(null);
                }
            });
        };

        this._updateProgressDisplay = function () {
            if (!this._batchDisplayModel) return;

            try {
                const progress = this._progressTracker.getProgress();
                const elapsedMinutes = progress.elapsedTime / 60;
                const speed = elapsedMinutes > 0 ? Math.round(progress.processed / elapsedMinutes) : 0;

                this._batchDisplayModel.setData({
                    status: "Processing entries...",
                    totalEntries: progress.total,
                    processedEntries: progress.processed,
                    successCount: progress.successCount,
                    failureCount: progress.failureCount,
                    percentage: progress.percentage,
                    timeRemaining: progress.timeRemaining,
                    currentBatch: this._processingState.currentBatchIndex,
                    totalBatches: this._processingState.totalBatches,
                    displayText: {
                        entries: `${progress.processed} of ${progress.total} entries`,
                        batches: `${this._processingState.currentBatchIndex} of ${this._processingState.totalBatches} batches`
                    },
                    isCompleted: false,
                    isError: false,
                    processingSpeed: `${speed} entries/min`,
                    entriesProgress: progress.percentage,
                    batchProgress: (this._processingState.currentBatchIndex / this._processingState.totalBatches) * 100
                });
            } catch (error) {
                this._logError("Error updating progress display", error);
            }
        };

        // Main processing method - now delegates to ODataService
        this.startBatchProcessing = function (entries, options = {}) {
          
            if (!entries || !entries.length) {
                return Promise.reject(new Error("No entries to process"));
            }

            if (!this.oController._oDataService) {
                return Promise.reject(new Error("OData Service not initialized in controller"));
            }

            const batchOptions = {
                batchSize: 10,
                showProgress: true,
                ...options
            };

            // Initialize state
            this._processingState = {
                isProcessing: true,
                isCanceled: false,
                currentBatchIndex: 0,
                totalBatches: Math.ceil(entries.length / batchOptions.batchSize)
            };

            // Initialize progress tracker
            this._progressTracker.start(entries.length);

            // Initialize response data
            this._responseData = {
                totalRecords: entries.length,
                successCount: 0,
                failureCount: 0,
                successRecords: [],
                errorRecords: [],
                allMessages: []
            };

            // Clear any previous timeout
            if (this._timeoutId) {
                clearTimeout(this._timeoutId);
                this._timeoutId = null;
            }

            // Display progress dialog if enabled
            const initPromise = batchOptions.showProgress
                ? this._initBatchProcessingDisplay(entries.length)
                : Promise.resolve();

            return initPromise.then(() => {
                // Define callbacks for ODataService
                const callbacks = {
                    batchStart: (batchIndex, totalBatches) => {
                        this._processingState.currentBatchIndex = batchIndex;
                        this._updateProgressDisplay();
                    },
                    
                    batchProgress: (batchIndex, totalBatches, processedCount, totalCount) => {
                        this._processingState.currentBatchIndex = batchIndex;
                        this._updateProgressDisplay();
                    },
                    
                    success: (result) => {
                        // Update our internal response data with the results from ODataService
                        this._handleBatchResult(result);
                        this._finalizeProgress(true);
                        
                        // Dialog will remain open until explicitly closed by the user
                        return result;
                    },
                    
                    error: (error) => {
                        // Handle error, but don't automatically close the dialog
                        this._logError("Error in batch processing", error);
                        this._handleBatchResult(error);
                        this._finalizeProgress(false, error);
                        
                        // Return error response
                        return this._createErrorResponse(error);
                    }
                };

                // Delegate actual processing to ODataService
                return this.oController._oDataService.createPurchaseOrders(entries, callbacks);
            });
        };

        // Combined handler for successful or error results
        this._handleBatchResult = function(result) {
            // Make sure we handle both success and error results
            if (!result) return;

            // Update success records if available
            if (result.successRecords || result.successfulRecords) {
                const successRecords = result.successRecords || result.successfulRecords || [];
                this._responseData.successCount += successRecords.length;
                this._responseData.successRecords = [...this._responseData.successRecords, ...successRecords];
                
                // Update progress tracker with successful records
                this._progressTracker.update(successRecords.length, true, successRecords);
            }

            // Update error records if available
            if (result.errorRecords || result.failedRecordsList) {
                const errorRecords = result.errorRecords || result.failedRecordsList || [];
                this._responseData.failureCount += errorRecords.length;
                this._responseData.errorRecords = [...this._responseData.errorRecords, ...errorRecords];
                
                // Update progress tracker with failed records
                this._progressTracker.update(errorRecords.length, false, errorRecords);
            }

            // Handle error response
            if (result.error || result.canceled) {
                this._processingState.isProcessing = false;
                if (result.canceled) {
                    this._processingState.isCanceled = true;
                }
            }

            // Update display
            this._updateProgressDisplay();
        };

        // Error response helper
        this._createErrorResponse = function (error) {
            const progress = this._progressTracker.getProgress();
            return {
                error: true,
                errorMessage: error ? error.message : "Unknown error occurred",
                successCount: progress.successCount,
                failureCount: progress.failureCount,
                totalCount: progress.total,
                successRecords: progress.successRecords || [],
                errorRecords: progress.errorRecords || []
            };
        };

        this._finalizeProgress = function (success, error) {
            if (!this._batchDisplayModel) return;

            try {
                // Check if already finalized
                const currentData = this._batchDisplayModel.getData();
                if (currentData && currentData.isCompleted) {
                    return;
                }

                const progress = this._progressTracker.getProgress();

                this._batchDisplayModel.setData({
                    ...this._batchDisplayModel.getData(),
                    status: success ? "Processing completed successfully" :
                        (error ? `Processing completed with errors: ${error.message}` : "Processing completed with errors"),
                    error: error ? error.message : "",
                    timeRemaining: "Completed",
                    processingTime: `${progress.elapsedTime.toFixed(2)}s`,
                    isCompleted: true,
                    isError: !success
                });
            } catch (error) {
                this._logError("Error finalizing progress", error);
            }
        };

        // Cancel processing by delegating to ODataService
        this.cancelBatchProcessing = function () {
            if (this._processingState.isProcessing) {
                this._processingState.isCanceled = true;

                if (this._batchDisplayModel) {
                    try {
                        this._batchDisplayModel.setProperty("/status", "Processing canceled by user");
                        this._batchDisplayModel.setProperty("/isError", true);
                        this._batchDisplayModel.setProperty("/error", "Processing was canceled by the user");
                        this._batchDisplayModel.setProperty("/isCompleted", true);
                    } catch (error) {
                        this._logError("Error updating model during cancel", error);
                    }
                }

                // Delegate cancellation to ODataService
                if (this.oController._oDataService?.cancelBatchProcessing) {
                    try {
                        this.oController._oDataService.cancelBatchProcessing();
                    } catch (error) {
                        this._logError("Error canceling OData processing", error);
                    }
                }

                return true;
            }
            return false;
        };

        this.closeBatchProcessingDialog = function () {
            try {
                if (this._batchProcessingDialog && this._batchProcessingDialog.isOpen && this._batchProcessingDialog.isOpen()) {
                    this._batchProcessingDialog.close();
                }
            } catch (error) {
                this._logError("Error closing batch processing dialog", error);
            }
        };

        this.getResponseData = function () {
            return this._responseData;
        };

        this.getProcessingState = function () {
            return this._processingState;
        };

        // Add a method to force close dialog - can be triggered from outside
        this.forceCloseDialog = function () {
            this.closeBatchProcessingDialog();

            // Ensure processing state is finalized
            this._processingState.isProcessing = false;

            if (this._timeoutId) {
                clearTimeout(this._timeoutId);
                this._timeoutId = null;
            }
        };
    };
});