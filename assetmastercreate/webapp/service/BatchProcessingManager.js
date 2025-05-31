sap.ui.define([
    "sap/ui/model/json/JSONModel",
    "sap/ui/core/Fragment",
    "sap/m/MessageBox",
    "assetmastercreate/utils/ProgressTracker",
    "assetmastercreate/utils/ErrorUtils"
], function (JSONModel, Fragment, MessageBox, ProgressTracker, ErrorUtils) {
    "use strict";

    return function (options) {
        // Store options and controller reference
        this.oController = options.controller;
        this._uiManager = options.uiManager;
        this._errorHandler = options.errorHandler;
        this._dataTransformer = options.dataTransformer;
        this._oDataService = options.oDataService;
        this._exportManager = options.ExportManager;

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
                            name: "assetmastercreate.view.BatchProcessingDisplayDialog",
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

        // Main processing method - updated for asset masters
        this.processRecordsInBatch = function (entries, options = {}) {
            if (!entries || !entries.length) {
                return Promise.reject(new Error("No entries to process"));
            }

            if (!this._oDataService) {
                return Promise.reject(new Error("OData Service not initialized"));
            }

            // Store batchOptions
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
            if (this._processingState.totalBatches === 0 && entries.length > 0) {
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
                        return this._createSuccessResponse(result);
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
                                    Sequence: entry.Sequence || entry.SequenceNumber || "N/A",
                                    Status: "Error",
                                    RawData: entry,
                                    ErrorMessage: `Asset master creation failed: ${error.message || "Unknown error"}`,
                                    ErrorDetails: error.stack || error.details,
                                    ValidationErrors: [],
                                    error: { message: `Asset master creation failed: ${error.message || "Unknown error"}` }
                                }))
                            };
                            this._handleBatchResult(totalFailureResult);
                        }
                        this._finalizeProgress(false, error);
                        return this._createErrorResponse(error);
                    }
                };

                // Delegate actual processing to ODataService - changed method name
                return this._oDataService.createAssetMasters(entries, callbacks);
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

            // ODataService returns errorRecords/failedRecordsList
            const errorRecordsList = result.errorRecords || result.failedRecordsList || [];
            if (errorRecordsList.length > 0) {
                this._responseData.failureCount += errorRecordsList.length;
                this._responseData.errorRecords = [...this._responseData.errorRecords, ...errorRecordsList];
                this._progressTracker.update(errorRecordsList.length, false, errorRecordsList);
            }

            if (result.error || result.cancelled) {
                this._processingState.isProcessing = false;
                if (result.cancelled) {
                    this._processingState.isCanceled = true;
                }
            }
            this._updateProgressDisplay();
        };

        this._createSuccessResponse = function (result) {
            const progress = this._progressTracker.getProgress();
            return {
                success: true,
                successCount: progress.successCount,
                errorCount: progress.failureCount,
                totalCount: progress.total,
                results: [
                    ...this._responseData.successRecords.map(record => ({
                        success: true,
                        data: record,
                        message: record.Message || "Asset created successfully",
                        assetNumber: record.AssetNumber || record.FixedAsset,
                        originalEntry: record.OriginalRequest
                    })),
                    ...this._responseData.errorRecords.map(record => ({
                        success: false,
                        error: record.error || record.ErrorMessage,
                        details: record.details || record.ErrorDetails,
                        originalEntry: record.entry || record.originalEntry
                    }))
                ]
            };
        };

        this._createErrorResponse = function (error) {
            const progress = this._progressTracker.getProgress();
            return {
                error: true,
                errorMessage: error ? error.message : "Unknown error occurred",
                successCount: progress.successCount,
                errorCount: progress.failureCount,
                totalCount: progress.total,
                results: [
                    ...this._responseData.successRecords.map(record => ({
                        success: true,
                        data: record,
                        message: record.Message || "Asset created successfully",
                        assetNumber: record.AssetNumber || record.FixedAsset,
                        originalEntry: record.OriginalRequest
                    })),
                    ...this._responseData.errorRecords.map(record => ({
                        success: false,
                        error: record.error || record.ErrorMessage,
                        details: record.details || record.ErrorDetails,
                        originalEntry: record.entry || record.originalEntry
                    }))
                ]
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

        this.cancelProcessing = function () {
            if (this._processingState.isProcessing && !this._processingState.isCanceled) {
                this._processingState.isCanceled = true; // Mark as canceled first

                // Delegate cancellation to ODataService
                if (this._oDataService?.cancelBatchProcessing) {
                    try {
                        this._oDataService.cancelBatchProcessing();
                        this._logInfo("Cancellation signal sent to ODataService.");
                    } catch (error) {
                        this._logError("Error signaling cancel to ODataService", error);
                    }
                }

                if (this._batchDisplayModel) {
                    this._batchDisplayModel.setProperty("/status", "Cancelling processing...");
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
            // Ensure the response data reflects the latest from progress tracker
            const progress = this._progressTracker.getProgress();
            return {
                ...this._responseData,
                successCount: progress.successCount,
                failureCount: progress.failureCount,
                totalRecords: progress.total
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

        // Legacy method name for compatibility
        this.startBatchProcessing = function (entries, options = {}) {
            return this.processRecordsInBatch(entries, options);
        };
    };
});