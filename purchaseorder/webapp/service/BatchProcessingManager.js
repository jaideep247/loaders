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
        this._batchOptions = {}; // To store batch options

        // Processing state
        this._processingState = {
            isProcessing: false,
            isCanceled: false,
            currentBatchIndex: 0, // For UI display batches
            totalBatches: 0     // For UI display batches
        };

        // Response data
        this._responseData = {
            totalRecords: 0,
            successCount: 0,
            failureCount: 0,
            successRecords: [],
            errorRecords: [],
            allMessages: [],
            initialEntries: [] // To store the initial set of entries
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
                        totalBatches: this._processingState.totalBatches, // UI display total batches
                        isCompleted: false,
                        isError: false,
                        batchOptions: this._batchOptions // Store batchOptions for access if needed
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
                            resolve(null); // Continue even if dialog fails
                        });
                    } else {
                        if (!this._batchProcessingDialog.isOpen()) {
                            this._batchProcessingDialog.open();
                        }
                        resolve(this._batchProcessingDialog);
                    }
                } catch (error) {
                    this._logError("Error initializing batch display", error);
                    resolve(null); // Continue even if display fails
                }
            });
        };

        this._updateProgressDisplay = function () {
            if (!this._batchDisplayModel) return;

            try {
                const progress = this._progressTracker.getProgress();
                const elapsedMinutes = progress.elapsedTime / 60;
                const speed = elapsedMinutes > 0 ? Math.round(progress.processed / elapsedMinutes) : 0;

                const currentModelData = this._batchDisplayModel.getData();

                this._batchDisplayModel.setData({
                    ...currentModelData,
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
                        sequences: `${this._processingState.currentBatchIndex} of ${this._processingState.totalBatches} sequence groups`
                    },
                    isCompleted: currentModelData.isCompleted || false,
                    isError: currentModelData.isError || false,
                    processingSpeed: `${speed} entries/min`,
                    entriesProgress: progress.percentage,
                    sequenceProgress: this._processingState.totalBatches > 0 ?
                        (this._processingState.currentBatchIndex / this._processingState.totalBatches) * 100 : 0
                });
            } catch (error) {
                this._logError("Error updating progress display", error);
            }
        };

        // Main processing method
        this.startBatchProcessing = function (entries, options = {}) {
            if (!entries || !entries.length) {
                return Promise.reject(new Error("No entries to process"));
            }

            if (!this.oController._oDataService) {
                return Promise.reject(new Error("OData Service not initialized in controller"));
            }

            // Store batchOptions on 'this' to make it accessible in callbacks if needed,
            // though direct closure access also works if callbacks are defined within this function's scope.
            this._batchOptions = {
                batchSize: 10, // Default UI batch size for display
                showProgress: true,
                ...options
            };

            // Initialize state
            this._processingState = {
                isProcessing: true,
                isCanceled: false,
                currentBatchIndex: 0, // For UI display batches
                totalBatches: Math.ceil(entries.length / this._batchOptions.batchSize) // For UI display batches
            };
            if (this._processingState.totalBatches === 0 && entries.length > 0) { // Ensure totalBatches is at least 1 if there are entries
                this._processingState.totalBatches = 1;
            }


            // Initialize progress tracker
            this._progressTracker.start(entries.length);

            // Initialize response data & store initial entries
            this._responseData = {
                totalRecords: entries.length,
                successCount: 0,
                failureCount: 0,
                successRecords: [],
                errorRecords: [],
                allMessages: [],
                initialEntries: entries.map(entry => ({ ...entry })) // Store a deep copy of initial entries
            };

            if (this._timeoutId) {
                clearTimeout(this._timeoutId);
                this._timeoutId = null;
            }

            const initPromise = this._batchOptions.showProgress
                ? this._initBatchProcessingDisplay(entries.length)
                : Promise.resolve();

            return initPromise.then(() => {
                const callbacks = {
                    batchStart: (sequenceGroupIndex, totalSequenceGroups) => {
                        // This callback from ODataService indicates the start of a sequence group batch
                        this._logInfo(`ODataService: Sequence group ${sequenceGroupIndex} of ${totalSequenceGroups} initiated.`);
                        if (this._batchDisplayModel) {
                            this._batchDisplayModel.setProperty("/status", `Processing sequence group ${sequenceGroupIndex} of ${totalSequenceGroups}...`);
                        }

                        // Update current batch index for UI display
                        this._processingState.currentBatchIndex = sequenceGroupIndex;
                        this._processingState.totalBatches = totalSequenceGroups;

                        this._updateProgressDisplay();
                    },

                    batchProgress: (sequenceGroupIndex, totalSequenceGroups, processedItems, totalItems) => {
                        // This callback from ODataService reports progress within sequence groups
                        if (this._batchDisplayModel) {
                            this._batchDisplayModel.setProperty("/status",
                                `Processing sequence group ${sequenceGroupIndex} of ${totalSequenceGroups} - ${processedItems} of ${totalItems} items processed...`);
                        }

                        // Update the display batch index
                        this._processingState.currentBatchIndex = sequenceGroupIndex;
                        if (this._processingState.totalBatches !== totalSequenceGroups) {
                            this._processingState.totalBatches = totalSequenceGroups;
                        }

                        // Update item progress display
                        if (this._batchDisplayModel) {
                            this._batchDisplayModel.setProperty("/processedEntries", processedItems);
                            this._batchDisplayModel.setProperty("/percentage", totalItems > 0 ? (processedItems / totalItems) * 100 : 0);
                        }

                        this._updateProgressDisplay();
                    },

                    success: (result) => {
                        this._logInfo("ODataService: Sequence-based batch processing reported success.");
                        if (this._batchDisplayModel) {
                            this._batchDisplayModel.setProperty("/status", "Processing completed successfully");
                        }
                        this._handleBatchResult(result);
                        this._finalizeProgress(true);
                        return result;
                    },

                    error: (error, resultFromODataErrorCallback) => {
                        this._logError("ODataService: Sequence-based batch processing reported an error.", error);
                        if (this._batchDisplayModel) {
                            this._batchDisplayModel.setProperty("/status", "Processing completed with errors");
                        }

                        if (resultFromODataErrorCallback) {
                            this._handleBatchResult(resultFromODataErrorCallback);
                        } else {
                            // Construct a result indicating total failure
                            const totalFailureResult = {
                                totalRecords: this._responseData.totalRecords,
                                successCount: 0,
                                failureCount: this._responseData.totalRecords,
                                successRecords: [],
                                failedRecordsList: this._responseData.initialEntries.map(entry => ({
                                    originalEntry: entry,
                                    Sequence: entry.Sequence || "N/A",
                                    Status: "Error",
                                    RawData: entry,
                                    ErrorMessage: `Sequence batch submission failed: ${error.message || "Unknown error"}`,
                                    ErrorDetails: error.stack || error.details,
                                    ValidationErrors: [],
                                    error: { message: `Sequence batch submission failed: ${error.message || "Unknown error"}` }
                                }))
                            };
                            this._handleBatchResult(totalFailureResult);
                        }
                        this._finalizeProgress(false, error);
                        return this._createErrorResponse(error);
                    }
                };

                // Delegate actual processing to ODataService
                // 'entries' here are the transformedItems from POController
                return this.oController._oDataService.createPurchaseOrders(entries, callbacks);
            });
        };

        this._handleBatchResult = function (result) {
            if (!result) return;

            if (result.successRecords) {
                const successRecords = result.successRecords || [];
                this._responseData.successCount += successRecords.length;
                this._responseData.successRecords = [...this._responseData.successRecords, ...successRecords];
                this._progressTracker.update(successRecords.length, true, successRecords);
            }

            // ODataService returns failedRecordsList, BatchProcessingManager used errorRecords internally
            const errorRecordsList = result.errorRecords || result.failedRecordsList || [];
            if (errorRecordsList.length > 0) {
                this._responseData.failureCount += errorRecordsList.length;
                // Ensure errorRecords in _responseData are compatible with what _createErrorResponse expects
                // _formatErrorRecord from ODataService should provide the correct structure.
                this._responseData.errorRecords = [...this._responseData.errorRecords, ...errorRecordsList];
                this._progressTracker.update(errorRecordsList.length, false, errorRecordsList);
            }

            if (result.error || result.cancelled) { // 'cancelled' from ODataService result
                this._processingState.isProcessing = false;
                if (result.cancelled) {
                    this._processingState.isCanceled = true;
                }
            }
            this._updateProgressDisplay(); // Reflect final counts from _progressTracker
        };

        this._createErrorResponse = function (error) {
            const progress = this._progressTracker.getProgress(); // Gets up-to-date counts
            return {
                error: true,
                errorMessage: error ? error.message : "Unknown error occurred",
                successCount: progress.successCount,
                failureCount: progress.failureCount,
                totalCount: progress.total,
                successRecords: this._responseData.successRecords, // Use accumulated success records
                errorRecords: this._responseData.errorRecords     // Use accumulated error records
            };
        };

        this._finalizeProgress = function (success, error) {
            if (!this._batchDisplayModel) return;

            try {
                const currentData = this._batchDisplayModel.getData();
                if (currentData && currentData.isCompleted) {
                    return;
                }

                const progress = this._progressTracker.getProgress();
                const finalStatus = success ? "Processing completed successfully" :
                    (this._processingState.isCanceled ? "Processing canceled by user" :
                        (error ? `Processing completed with errors: ${error.message}` : "Processing completed with errors"));

                this._batchDisplayModel.setData({
                    ...currentData,
                    status: finalStatus,
                    error: error && !this._processingState.isCanceled ? error.message : (this._processingState.isCanceled ? "Processing was canceled." : ""),
                    timeRemaining: "Completed",
                    processingTime: `${progress.elapsedTime.toFixed(2)}s`,
                    isCompleted: true,
                    isError: !success || this._processingState.isCanceled,
                    // Ensure final counts are reflected
                    processedEntries: progress.processed,
                    successCount: progress.successCount,
                    failureCount: progress.failureCount,
                    percentage: progress.percentage
                });
            } catch (e) {
                this._logError("Error finalizing progress", e);
            }
        };

        this.cancelBatchProcessing = function () {
            if (this._processingState.isProcessing && !this._processingState.isCanceled) {
                this._processingState.isCanceled = true; // Mark as canceled first

                // Delegate cancellation to ODataService
                if (this.oController._oDataService?.cancelBatchProcessing) {
                    try {
                        // ODataService's cancelBatchProcessing is now synchronous or returns a promise
                        // indicating the cancellation signal has been sent.
                        this.oController._oDataService.cancelBatchProcessing();
                        this._logInfo("Cancellation signal sent to ODataService.");
                    } catch (error) {
                        this._logError("Error signaling cancel to ODataService", error);
                    }
                }
                // The ODataService loop will check _isCancelled.
                // Finalize progress will reflect cancellation status.
                // No need to immediately call _finalizeProgress here if ODataService error/success path handles it.
                // However, if user clicks cancel on dialog, we might want to update UI immediately.
                if (this._batchDisplayModel) {
                    this._batchDisplayModel.setProperty("/status", "Cancelling processing...");
                }
                // The actual finalization will happen when the ODataService's current operation
                // (queueing or submitting) acknowledges the cancellation and calls the error/success callback.
                // If ODataService's `createPurchaseOrders` returns a `cancelled:true` result,
                // `_handleBatchResult` and `_finalizeProgress` will correctly update the UI.
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
            // Ensure the response data reflects the latest from progress tracker
            const progress = this._progressTracker.getProgress();
            return {
                ...this._responseData,
                successCount: progress.successCount,
                failureCount: progress.failureCount,
                totalRecords: progress.total
                // successRecords and errorRecords are already accumulated in _responseData
            };
        };

        this.getProcessingState = function () {
            return this._processingState;
        };

        this.forceCloseDialog = function () {
            this.closeBatchProcessingDialog();
            this._processingState.isProcessing = false;
            if (this._timeoutId) {
                clearTimeout(this._timeoutId);
                this._timeoutId = null;
            }
        };
    };
});
