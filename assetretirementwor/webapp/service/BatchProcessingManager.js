sap.ui.define([
    "sap/ui/model/json/JSONModel",
    "assetretirementwor/utils/ErrorHandler",
    "assetretirementwor/utils/DataTransformer",
    "assetretirementwor/service/UIManager"
], function (JSONModel, ErrorHandler, DataTransformer, UIManager) {
    "use strict";

    /**
     * BatchProcessingManager
     * Manages the sequential processing of fixed asset retirement records, displaying progress via UIManager.
     */
    return class BatchProcessingManager {
        /**
         * Constructor for BatchProcessingManager.
         * @param {object} [options={}] - Configuration options.
         */
        constructor(options = {}) {
            // --- Validate Required Dependencies ---
            if (!options.controller) throw new Error("BatchProcessingManager requires a controller instance.");
            if (!options.uiManager || typeof options.uiManager.showDialog !== 'function') throw new Error("BatchProcessingManager requires a valid UIManager instance.");

            // --- Dependencies ---
            this.oController = options.controller;
            this._uiManager = options.uiManager || new UIManager();
            this._errorHandler = options.errorHandler || this._uiManager.errorHandler;
            if (!this._errorHandler || typeof this._errorHandler.showError !== 'function') {
                console.error("BatchProcessingManager: Invalid ErrorHandler. Falling back.");
                try { this._errorHandler = new ErrorHandler(this.oController); }
                catch (e) { throw new Error("BatchProcessingManager: Critical dependency ErrorHandler missing."); }
            }
            this._dataTransformer = options.dataTransformer || new DataTransformer();
            this._oDataService = options.oDataService;
            this._exportManager = options.exportManager;

            // --- Configuration & State ---
            this._processingDelay = options.processingDelay || 300;
            this.batchSize = 1; // Fixed
            this.processingCancelled = false;
            this._processingComplete = false;
            this.currentIndex = 0;
            this.totalRecords = 0;
            this.startTime = null;
            this._oBatchProcessingDialog = null;
            this._dialogTimestamp = new Date().getTime(); // Store a single timestamp for this instance
            this._dialogId = `batchProcessingDialog-${this._dialogTimestamp}`;
            this._resetResponseData();
            this._initializationInProgress = false; // Flag to prevent duplicate initialization
        }

        /** Resets internal data structure. @private */
        _resetResponseData() {
            this.responseData = { totalRecords: 0, processedCount: 0, successCount: 0, failureCount: 0, successRecords: [], errorRecords: [], allMessages: [] };
            this._processingComplete = false;
        }

        /** Initializes the batch processing UI via UIManager. */
        initBatchProcessing(totalRecords) {
            // Check if initialization is already in progress
            if (this._initializationInProgress) {
                console.log(`BatchProcessingManager: Initialization already in progress, ignoring duplicate call.`);
                return Promise.reject(new Error("Initialization already in progress"));
            }

            // Set flag to prevent duplicate initialization
            this._initializationInProgress = true;

            console.log(`BatchProcessingManager: Initializing for ${totalRecords} retirement records.`);
            this.currentIndex = 0; this.totalRecords = totalRecords; this.startTime = new Date();
            this.processingCancelled = false; this._resetResponseData(); this.responseData.totalRecords = totalRecords;

            const batchDisplayModel = new JSONModel({
                status: "Initializing...", error: "", totalBatches: totalRecords, currentBatch: 0, processedBatches: 0,
                totalEntries: totalRecords, processedEntries: 0, successCount: 0, failureCount: 0, timeRemaining: "Calculating...",
                processingSpeed: "Calculating...", batchProgress: 0, entriesProgress: 0, startTime: this.startTime,
                isCompleted: false, isError: false, successRecords: [], errorRecords: []
            });

            if (!this.oController?.getView()) {
                const errorMsg = "BatchProcessingManager: Controller/View missing for model setup.";
                console.error(errorMsg);
                this._initializationInProgress = false; // Reset flag
                return Promise.reject(new Error(errorMsg));
            }

            this.oController.getView().setModel(batchDisplayModel, "batchDisplay");

            // Use a consistent dialogId based on the instance timestamp
            const fragmentName = "assetretirementwor.view.BatchProcessingDisplay";

            return this._uiManager.showDialog(this._dialogId, fragmentName, batchDisplayModel, "batchDisplay", this.oController)
                .then(oDialog => {
                    if (!oDialog) throw new Error("UIManager returned invalid dialog.");
                    this._oBatchProcessingDialog = oDialog;
                    console.log("BatchProcessingManager: Dialog obtained from UIManager.");
                    try { // Hide export panel initially
                        const exportPanel = sap.ui.getCore().byId(oDialog.getId() + "--exportPanel");
                        if (exportPanel) exportPanel.setVisible(false);
                    } catch (e) { console.warn("BatchProcessingManager: Could not find exportPanel.", e); }
                    this._initializationInProgress = false; // Reset flag
                    return oDialog;
                }).catch(err => {
                    console.error("BatchProcessingManager: Failed init via UIManager.", err);
                    this._errorHandler.showError("Failed to initialize retirement processing dialog.", err.message);
                    this._initializationInProgress = false; // Reset flag
                    throw err;
                });
        }

        /** Starts the sequential processing loop. */
        startBatchProcessing(data, processRecordFn) {
            console.log(`BatchProcessingManager: Starting retirement processing. Data length: ${data?.length}.`);
            return new Promise((resolve, reject) => {
                if (!data?.length) {
                    const msg = "No retirement data to process.";
                    console.warn(msg);
                    this._errorHandler.showWarning(msg);
                    this.closeBatchProcessingDialog();
                    return reject(new Error(msg));
                }

                if (typeof processRecordFn !== 'function') {
                    const msg = "Invalid processRecordFn.";
                    console.error(msg);
                    this._errorHandler.showError(msg);
                    this.closeBatchProcessingDialog();
                    return reject(new Error(msg));
                }

                // Ensure we don't already have a dialog
                if (this._oBatchProcessingDialog && !this._oBatchProcessingDialog.bIsDestroyed) {
                    console.log("BatchProcessingManager: Using existing dialog. Starting loop directly.");
                    this._processRecordsSequentially(data, processRecordFn)
                        .then(() => {
                            console.log("DEBUG: BatchProcMgr: Retirement loop finished.");
                            resolve(this.responseData);
                        })
                        .catch(error => {
                            console.error("DEBUG: BatchProcMgr: Critical error during retirement execution:", error);
                            try {
                                this._updateBatchDisplay({
                                    status: "Critical Error",
                                    error: error.message,
                                    isCompleted: true,
                                    isError: true
                                });
                                this._handleBatchProcessingComplete();
                            }
                            catch (finalError) {
                                console.error("DEBUG: BatchProcMgr: Error during final error handling:", finalError);
                            }
                            reject(error);
                        });
                } else {
                    // Initialize the UI first, then process
                    this.initBatchProcessing(data.length)
                        .then(oDialog => {
                            if (!oDialog || !this._oBatchProcessingDialog) throw new Error("Critical Error: Dialog init failed.");
                            console.log("BatchProcessingManager: Dialog ready. Starting retirement processing loop.");
                            return this._processRecordsSequentially(data, processRecordFn);
                        })
                        .then(() => {
                            console.log("DEBUG: BatchProcMgr: Retirement loop finished.");
                            resolve(this.responseData);
                        })
                        .catch(error => {
                            console.error("DEBUG: BatchProcMgr: Critical error during retirement setup/exec:", error);
                            try {
                                this._updateBatchDisplay({
                                    status: "Critical Error",
                                    error: error.message,
                                    isCompleted: true,
                                    isError: true
                                });
                                this._handleBatchProcessingComplete();
                            }
                            catch (finalError) {
                                console.error("DEBUG: BatchProcMgr: Error during final error handling:", finalError);
                            }
                            reject(error);
                        });
                }
            });
        }

        /** Internal recursive processing loop. @private */
        _processRecordsSequentially(data, processRecordFn) {
            return new Promise((resolve) => {
                const processNext = async (index) => {
                    try {
                        if (this.processingCancelled || index >= data.length) {
                            console.log(`BatchProcessingManager: Stopping retirement loop (Cancelled: ${this.processingCancelled}, Index: ${index}/${data.length})`);
                            this._handleBatchProcessingComplete(); return resolve();
                        }

                        this.currentIndex = index; const currentRecord = data[index];
                        const entryId = currentRecord?._originalIndex ?? currentRecord?.SequenceID ?? `Index ${index}`;
                        this._updateBatchDisplay({ status: `Processing retirement ${index + 1}/${data.length}...`, currentBatch: index + 1 });
                        console.log(`DEBUG: BatchProcMgr: Calling processRetirementFn idx ${index}`);

                        const result = await processRecordFn(currentRecord, index); // Await the user-provided function
                        console.log(`DEBUG: BatchProcMgr: processRetirementFn resolved idx ${index}`, result);

                        let errorInfoForHandler = null; // Prepare error info if needed
                        if (!result.success) { errorInfoForHandler = result.errorInfo || result.error || "Unknown Error"; }

                        this._handleRecord(result.success, result.originalInput || currentRecord, result.response, errorInfoForHandler, index);
                        console.log(`DEBUG: BatchProcMgr: _handleRecord done idx ${index}`);

                        if (this.processingCancelled) { console.log("BatchProcMgr: Cancelled after handling."); this._handleBatchProcessingComplete(); return resolve(); }
                        setTimeout(() => processNext(index + 1), this._processingDelay); // Schedule next

                    } catch (error) { // Catch unexpected errors in the loop/await
                        const currentRecord = data[index] || { _originalIndex: `Index ${index}` };
                        const entryId = currentRecord?._originalIndex ?? currentRecord?.SequenceID ?? `Index ${index}`;
                        console.error(`DEBUG: BatchProcMgr: *** UNEXPECTED retirement loop error idx ${index} (ID: ${entryId}) ***:`, error);
                        this._handleRecord(false, currentRecord, null, { error: error, message: error.message || "Unexpected retirement loop error.", errorCode: "LOOP_ERROR" }, index);
                        console.log(`DEBUG: BatchProcMgr: _handleRecord done after loop error idx ${index}`);
                        if (this.processingCancelled) { console.log("BatchProcMgr: Cancelled after loop error."); this._handleBatchProcessingComplete(); return resolve(); }
                        setTimeout(() => processNext(index + 1), this._processingDelay); // Continue processing next
                    }
                };
                processNext(0); // Start
            });
        }

        /** Handles storing result for one record. @private */
        _handleRecord(isSuccess, originalInput, responseData, errorInfo, index) {
            const entryId = originalInput?._originalIndex ?? originalInput?.SequenceID ?? `Index ${index}`;
            try {
                // Generate the standardized message using the unified ErrorHandler logic
                const messageObject = this._createComprehensiveMessage(isSuccess, originalInput, responseData, errorInfo);

                if (isSuccess) {
                    this.responseData.successCount++;
                    this.responseData.successRecords.push({ entry: originalInput, response: responseData, message: messageObject, metadata: { processingTimestamp: new Date().toISOString(), index: index } });
                } else {
                    this.responseData.failureCount++;
                    this.responseData.errorRecords.push({ entry: originalInput, message: messageObject, metadata: { processingTimestamp: new Date().toISOString(), index: index }, errorCode: messageObject.code, errorMessage: messageObject.message, errorDetails: messageObject.details });
                }
                this.responseData.allMessages.push(messageObject);
                this.responseData.processedCount++;
                this._updateBatchDisplay({ lastProcessedMessage: messageObject.message }); // Update UI

            } catch (handleError) { // Catch errors within _handleRecord itself
                console.error(`DEBUG: BatchProcMgr: INTERNAL ERROR in _handleRecord for ${entryId}:`, handleError);
                const fallbackMsg = this._errorHandler.createStandardMessage('error', 'INTERNAL_HANDLING_ERROR', `Internal error processing result for ${entryId}: ${handleError.message}`, { originalInput, handleError: handleError.message, stackTrace: handleError.stack }, 'BatchProcessorInternal', entryId, index);
                this.responseData.processedCount++; this.responseData.failureCount++;
                this.responseData.errorRecords.push({ entry: originalInput, message: fallbackMsg, metadata: { processingTimestamp: new Date().toISOString(), index: index }, errorCode: fallbackMsg.code, errorMessage: fallbackMsg.message, errorDetails: fallbackMsg.details });
                this.responseData.allMessages.push(fallbackMsg);
                this._updateBatchDisplay({ lastProcessedMessage: fallbackMsg.message });
            }
        }

        /** Creates standardized message using ErrorHandler extraction methods. @private */
        _createComprehensiveMessage(isSuccess, originalInput, responseData, errorInfo) {
            const entryId = originalInput?._originalIndex ?? originalInput?.SequenceID ?? `Entry ${this.currentIndex + 1}`;
            let extractedInfo;

            try {
                // Use the appropriate extraction method from ErrorHandler
                extractedInfo = isSuccess
                    ? this._errorHandler.extractSuccessInfo(responseData)
                    : this._errorHandler.extractODataError(errorInfo);
            } catch (extractionError) {
                console.error(`Failed to extract ${isSuccess ? 'success' : 'error'} details for retirement entry ${entryId}:`, extractionError);
                // Fallback structure for extraction failures
                extractedInfo = {
                    code: 'EXTRACTION_FAILED',
                    message: `Failed to extract ${isSuccess ? 'success' : 'error'} details for retirement record ${entryId}`,
                    details: { extractionError: extractionError.message, stackTrace: extractionError.stack, originalData: isSuccess ? responseData : errorInfo }
                };
                // Ensure details is an array for error messages if possible
                if (!isSuccess && !Array.isArray(extractedInfo.details)) {
                    extractedInfo.details = [extractedInfo.details];
                }
            }

            // Prepare message details payload for createStandardMessage
            const messageDetails = {
                originalInput: originalInput,
                // Include raw and extracted data for context
                ...(isSuccess
                    ? { responseDetails: responseData, extractedDetails: extractedInfo.details }
                    : { rawErrorInfo: errorInfo, extractedDetails: extractedInfo } // Pass full extracted error info
                )
            };

            // Create standardized message using ErrorHandler
            return this._errorHandler.createStandardMessage(
                isSuccess ? 'success' : 'error',
                extractedInfo.code,
                extractedInfo.message,
                messageDetails,
                'RetirementBatchProcessor', // Source
                entryId,                     // Entity ID
                this.currentIndex            // Batch Index
            );
        }

        /** Updates the batchDisplay model. @private */
        _updateBatchDisplay(data = {}) {
            if (!this.oController?.getView()) { console.warn("BPM: No view for model update."); return; }
            const model = this.oController.getView().getModel("batchDisplay");
            if (!model) { console.warn("BPM: batchDisplay model missing."); return; }
            try {
                const currentData = model.getData(); const now = new Date();
                const elapsed = Math.max(0.1, (now - (this.startTime || now)) / 1000);
                const processed = this.responseData.processedCount; const total = this.responseData.totalRecords;
                const success = this.responseData.successCount; const failed = this.responseData.failureCount;
                const speed = (total > 0 && elapsed > 0.1) ? (processed / elapsed).toFixed(1) : "0.0";
                const progress = (total > 0) ? Math.round((processed / total) * 100) : 0;
                let remaining = "N/A";
                const isDone = data.isCompleted === true || this._processingComplete; const allDone = processed === total;
                const isRunning = !isDone && !this.processingCancelled && !allDone;
                if (isRunning && processed > 0) {
                    const spd = parseFloat(speed); remaining = spd > 0 ? this._formatSeconds(Math.ceil((total - processed) / spd)) : "Calculating...";
                } else if (total === 0 || allDone || isDone || this.processingCancelled) { remaining = "0s"; }
                const updated = { ...currentData, successCount: success, failureCount: failed, processedEntries: processed, processedBatches: processed, entriesProgress: progress, batchProgress: progress, processingSpeed: `${speed} items/sec`, timeRemaining: remaining, ...data };
                if (updated.isCompleted || (total > 0 && allDone)) { updated.entriesProgress = 100; updated.batchProgress = 100; updated.timeRemaining = "0s"; if (!updated.status || updated.status.startsWith("Processing")) updated.status = `Finished. ${processed}/${total}.`; }
                if (this.processingCancelled) { updated.timeRemaining = "0s"; if (!updated.status || updated.status.startsWith("Processing")) updated.status = `Cancelled after ${processed}.`; updated.isError = true; }
                model.setData(updated, true); model.refresh(true);
            } catch (e) { console.error("DEBUG: BPM: Error updating batchDisplayModel:", e); }
        }

        /** Formats seconds to human-readable string. @private */
        _formatSeconds(seconds) {
            if (isNaN(seconds) || seconds < 0) return "N/A"; if (seconds === 0) return "0s"; if (seconds < 1) return "< 1s";
            seconds = Math.round(seconds); const h = Math.floor(seconds / 3600); const m = Math.floor((seconds % 3600) / 60); const s = seconds % 60;
            let p = []; if (h > 0) p.push(`${h}h`); if (m > 0) p.push(`${m}m`); if ((h === 0 && s >= 0) || (m > 0 && s > 0)) p.push(`${s}s`);
            return p.length > 0 ? p.join(" ") : "0s";
        }

        /** Finalizes UI state on completion/cancellation. @private */
        _handleBatchProcessingComplete() {
            if (this._processingComplete) { console.log("DEBUG: BPM: Completion already handled."); return; }
            this._processingComplete = true; console.log("DEBUG: BPM: Handling retirement completion.");
            const s = this.responseData.successCount; const f = this.responseData.failureCount; const p = this.responseData.processedCount; const t = this.responseData.totalRecords;
            let status; let isError = false;
            if (this.processingCancelled) { status = `Cancelled by user after ${p}/${t}.`; isError = true; }
            else if (t === 0) { status = "Finished: No retirement records provided."; }
            else if (f > 0 && p < t && t > 0) { status = `Finished unexpectedly. Processed: ${p}/${t}. Success: ${s}, Failed: ${f}.`; isError = true; console.warn("DEBUG: BPM: Final count mismatch."); }
            else if (f === t && t > 0) { status = `Completed. All ${t} retirements failed.`; isError = true; }
            else if (f > 0) { status = `Completed. ${s} succeeded, ${f} failed.`; isError = true; }
            else if (s === t && t > 0) { status = `Completed successfully (${s} retirements).`; }
            else { status = `Finished. Status unclear. Processed: ${p}, Success: ${s}, Failed: ${f}.`; isError = true; console.warn("DEBUG: BPM: Unexpected final state."); }
            try { this._updateBatchDisplay({ status: status, isCompleted: true, isError: isError, error: isError ? (this.processingCancelled ? "Cancelled." : `${f} failed.`) : "" }); console.log("DEBUG: BPM: Completion handled successfully."); }
            catch (e) { console.error("DEBUG: BPM: Error during final UI update:", e); }
        }

        /** Sets cancellation flag. */
        cancelBatchProcessing() {
            if (!this.processingCancelled && !this._processingComplete) {
                this.processingCancelled = true; console.log("BPM: Retirement cancellation requested.");
                try { this._updateBatchDisplay({ status: "Cancelling...", isError: true }); } catch (e) { console.error("DEBUG: BPM: Error updating display on cancel:", e); }
            } else { console.log(`DEBUG: BPM: Cancel request ignored (Cancelled: ${this.processingCancelled}, Complete: ${this._processingComplete})`); }
        }

        /** Closes the dialog via UIManager. */
        closeBatchProcessingDialog() {
            // Use consistent dialogId
            this._uiManager.closeDialog(this._dialogId, true); // true = destroy
            this._oBatchProcessingDialog = null; console.log("BPM: Requested UIManager close dialog.");
        }

        /** Returns all logged messages. */
        getAllMessages() { return this.responseData?.allMessages || []; }

        /** Returns final aggregated results. */
        getResponseData() { return this.responseData; }
    };
});