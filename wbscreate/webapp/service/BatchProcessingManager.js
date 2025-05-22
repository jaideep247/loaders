sap.ui.define([
    "sap/ui/model/json/JSONModel",
    "sap/ui/core/Fragment",
    "sap/ui/core/BusyIndicator",
    "wbscreate/utils/ErrorHandler",
    "wbscreate/utils/DataTransformer",
    "wbscreate/utils/ResponseProcessor"
], function (JSONModel, Fragment, BusyIndicator, ErrorHandler, DataTransformer, ResponseProcessor) {
    "use strict";

    /**
     * BatchProcessingManager - Enhanced version using ODataService batch capabilities
     * Centralized manager for WBS Element creation operations.
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
            this._responseProcessor = options.responseProcessor || new ResponseProcessor({
                dataTransformer: this._dataTransformer
            });
            this._exportManager = options.exportManager;

            if (!this.oController) {
                console.warn("BatchProcessingManager: Controller instance not provided. UI updates might fail.");
            }

            if (!this._oDataService) {
                throw new Error("BatchProcessingManager requires an instance of ODataService.");
            }

            // Verify that ODataService has batch methods
            if (!this._oDataService.createWBSElementsBatch) {
                console.error("BatchProcessingManager: ODataService does not have createWBSElementsBatch method. Batch processing will not work.");
                throw new Error("ODataService does not support batch processing");
            }

            // Initialize processing state
            this.processingCancelled = false;
            this.startTime = null;
            this.totalBatches = 0;
            this.currentBatchIndex = 0;
            this._activeRequest = null;

            // Initialize response data structure
            this._resetResponseData();

            // Enhanced validation configuration
            this._validationConfig = {
                minRecords: options.minRecords || 1,
                maxRecords: options.maxRecords || 1000,
                requiredFields: options.requiredFields || ['ProjectElement', 'Description']
            };
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
                // existingCount: 0, // Removed
                successRecords: [],
                errorRecords: [],
                // existingRecords: [], // Removed
                allMessages: [], // Ensure this is initialized
                processedWBS: 0,
                totalWBS: 0,
                wasCancelled: false
            };
        }

        /**
         * Initialize WBS Element creation UI (Dialog)
         * @param {Number} totalRecords - Total number of WBS Elements to create
         * @returns {Promise<sap.m.Dialog>} Promise resolving with the batch processing dialog instance
         */
        initWBSCreationUI(totalRecords) {
            console.log("BatchProcessingManager: Initializing WBS Element creation UI", { totalRecords });

            return new Promise((resolve, reject) => {
                try {
                    // Set totals
                    this.totalBatches = totalRecords;
                    this.responseData.totalRecords = totalRecords;
                    this.responseData.totalWBS = totalRecords;

                    // Initialize tracking variables
                    this.currentBatchIndex = 0;
                    this.startTime = new Date();
                    this.processingCancelled = false;

                    // Reset response data counts (keep totals)
                    this.responseData.processedCount = 0;
                    this.responseData.successCount = 0;
                    this.responseData.failureCount = 0;
                    // this.responseData.existingCount = 0; // Removed
                    this.responseData.successRecords = [];
                    this.responseData.errorRecords = [];
                    // this.responseData.existingRecords = []; // Removed
                    this.responseData.allMessages = []; // Ensure this is reset
                    this.responseData.processedWBS = 0;
                    this.responseData.wasCancelled = false;

                    // Initialize WBS display model for the dialog
                    const wbsDisplayModel = new JSONModel({
                        status: "Initializing...",
                        error: "",
                        totalWBS: this.totalBatches,
                        currentWBS: 0,
                        processedWBS: 0,
                        totalEntries: totalRecords,
                        processedEntries: 0,
                        successCount: 0,
                        failureCount: 0,
                        existingCount: 0, // Keep in model for display, will always be 0
                        timeRemaining: "Calculating...",
                        processingSpeed: "Calculating...",
                        wbsProgress: 0,
                        entriesProgress: 0,
                        startTime: this.startTime.toISOString(),
                        isCompleted: false,
                        isError: false,
                        successRecords: [],
                        errorRecords: []
                    });

                    // Set model on controller's view if available
                    if (this.oController && this.oController.getView) {
                        this.oController.getView().setModel(wbsDisplayModel, "wbsDisplay");
                        console.log("BatchProcessingManager: wbsDisplay model set on view.");
                    } else {
                        console.warn("BatchProcessingManager: Cannot set wbsDisplay model - Controller or View not available.");
                    }

                    // Load and open the WBS creation dialog
                    this._loadWBSCreationDialog()
                        .then((dialog) => {
                            console.log("BatchProcessingManager: WBS creation dialog loaded/opened successfully.", dialog);
                            resolve(dialog);
                        })
                        .catch((error) => {
                            console.error("BatchProcessingManager: Error loading/opening WBS creation dialog:", error);
                            this._errorHandler.showError("Could not initialize WBS Element creation display.", error.message);
                            reject(error);
                        });

                } catch (error) {
                    console.error("BatchProcessingManager: Critical error in initWBSCreationUI:", error);
                    this._errorHandler.showError("Failed to initialize WBS Element creation.", error.message);
                    reject(error);
                }
            });
        }

        /**
         * Start batch creation of WBS Elements using the ODataService batch capabilities
         * @param {Array} data - Array of WBS Element data to process.
         * @param {Object} [options] - Additional options (e.g., batchSize, stopOnError).
         * @returns {Promise<Object>} Promise that resolves with an object containing the final responseData and a cancelled flag.
         */
        /**
   * Start batch creation of WBS Elements using the ODataService batch capabilities
   * @param {Array} data - Array of WBS Element data to process.
   * @param {Object} [options] - Additional options (e.g., batchSize, stopOnError).
   * @returns {Promise<Object>} Promise that resolves with an object containing the final responseData and a cancelled flag.
   */
        startWBSElementCreation(data, options = {}) {
            return new Promise((resolve, reject) => {
                try {
                    if (!data || data.length === 0) {
                        console.warn("BatchProcessingManager: No data provided to process.");
                        this._errorHandler.showWarning("No data available to process.");
                        resolve({ responseData: this.responseData, cancelled: false });
                        return;
                    }

                    const totalRecords = data.length;

                    // Define comprehensive batch options, including configurable batchSize
                    const batchOptions = {
                        batchSize: options.batchSize || 20,
                        stopOnError: options.stopOnError || false,
                        allowPartialSuccess: options.allowPartialSuccess !== undefined ? options.allowPartialSuccess : true
                    };

                    console.log(`BatchProcessingManager: Processing ${totalRecords} WBS Elements`, { batchOptions });

                    // Reset response data with comprehensive tracking
                    this._resetResponseData();
                    this.processingCancelled = false;
                    this.responseData.totalRecords = totalRecords;
                    this.responseData.totalWBS = totalRecords;

                    // Initialize the UI Dialog with comprehensive progress
                    this.initWBSCreationUI(totalRecords)
                        .then(() => {
                            console.log("BatchProcessingManager: UI Initialized. Starting batch WBS Element creation...");

                            // Define progress callback for real-time updates
                            const onProgress = (progress) => {
                                console.log("Batch Progress Update:", progress);
                                this._updateWBSProgressFromBatchProgress(progress);
                            };

                            // Start the batch processing using ODataService's batch method
                            this._activeRequest = this._oDataService.createWBSElementsBatch(
                                data,
                                batchOptions,
                                {
                                    success: (result) => {
                                        console.log("BatchProcessingManager: Batch creation completed successfully", result);

                                        // FIXED: Properly map the ODataService result to responseData structure
                                        this.responseData = {
                                            totalRecords,
                                            processedCount: result.processedCount || 0,
                                            successCount: result.successCount || 0,
                                            failureCount: result.failureCount || 0,
                                            existingCount: 0, // Always 0
                                            successRecords: result.successRecords || [],
                                            errorRecords: result.errorRecords || [],
                                            allMessages: result.allMessages || [],
                                            processedWBS: result.processedCount || 0,
                                            totalWBS: totalRecords,
                                            wasCancelled: false
                                        };

                                        console.log("BatchProcessingManager: Final responseData:", this.responseData);

                                        // Final UI update to ensure completion status
                                        this._handleWBSCreationComplete(false);

                                        resolve({
                                            responseData: this.responseData,
                                            cancelled: false
                                        });
                                    },
                                    error: (error) => {
                                        console.error("BatchProcessingManager: Batch creation error", error);

                                        const wasCancelled = error.code === "CANCELLED";

                                        // FIXED: Properly handle error results with default values
                                        this.responseData = {
                                            totalRecords,
                                            processedCount: error.processedCount || 0,
                                            successCount: error.successCount || 0,
                                            failureCount: error.failureCount || 0,
                                            existingCount: 0, // Always 0
                                            successRecords: error.successRecords || [],
                                            errorRecords: error.errorRecords || [],
                                            allMessages: error.allMessages || [],
                                            processedWBS: error.processedCount || 0,
                                            totalWBS: totalRecords,
                                            wasCancelled
                                        };

                                        console.log("BatchProcessingManager: Error responseData:", this.responseData);

                                        // Comprehensive completion UI update with error
                                        this._handleWBSCreationComplete(wasCancelled, true);

                                        // Error handling depends on cancellation state
                                        if (wasCancelled) {
                                            resolve({
                                                responseData: this.responseData,
                                                cancelled: true
                                            });
                                        } else {
                                            reject(error);
                                        }
                                    },
                                    progress: onProgress
                                }
                            );
                        })
                        .catch((error) => {
                            console.error("BatchProcessingManager: Error initializing UI for WBS Element creation:", error);
                            this._errorHandler.showError(
                                "Could not initialize WBS Element creation display.",
                                error.message
                            );
                            reject(error);
                        });

                } catch (topLevelError) {
                    console.error("BatchProcessingManager: Top-level error setting up WBS Element creation:", topLevelError);
                    this._errorHandler.showError(
                        "Critical Error: Failed to start WBS Element creation.",
                        topLevelError.message
                    );
                    reject(topLevelError);
                }
            });
        }
        /**
   * Update WBS display from batch progress information.
   * @param {Object} progress - Progress information from batch processing.
   * @private
   */
        _updateWBSProgressFromBatchProgress(progress) {
            try {
                console.log("Updating WBS Progress", progress);

                // FIXED: Ensure progress data has default values and proper validation
                const processedCount = Math.max(0, progress.processedCount || 0);
                const totalRecords = Math.max(1, progress.totalRecords || this.responseData.totalRecords || 1);
                const successCount = Math.max(0, progress.successCount || 0);
                const failureCount = Math.max(0, progress.failureCount || 0);
                const existingCount = 0; // Always 0
                const currentBatch = Math.max(0, progress.currentBatch || 0);
                const totalBatches = Math.max(1, progress.totalBatches || 1);

                // Calculate progress percentages with safety checks
                const overallProgress = Math.min(100, Math.max(0, Math.round((processedCount / totalRecords) * 100)));

                // Calculate processing speed (items per second)
                const currentTime = new Date();
                const elapsedSeconds = Math.max(1, (currentTime - this.startTime) / 1000);
                const itemsPerSecond = Math.max(0, processedCount / elapsedSeconds);
                const processingSpeed = `${itemsPerSecond.toFixed(1)} items/sec`;

                // Calculate time remaining based on items
                const remainingItems = Math.max(0, totalRecords - processedCount);
                let formattedTimeRemaining = "Calculating...";

                if (processedCount >= totalRecords) {
                    formattedTimeRemaining = "Completing...";
                } else if (remainingItems > 0 && itemsPerSecond > 0.01) {
                    const remainingSeconds = Math.ceil(remainingItems / itemsPerSecond);
                    if (remainingSeconds > 3600) {
                        const hours = Math.floor(remainingSeconds / 3600);
                        const minutes = Math.floor((remainingSeconds % 3600) / 60);
                        formattedTimeRemaining = `~${hours}h ${minutes}m`;
                    } else if (remainingSeconds > 60) {
                        const minutes = Math.floor(remainingSeconds / 60);
                        const seconds = remainingSeconds % 60;
                        formattedTimeRemaining = `~${minutes}m ${seconds}s`;
                    } else if (remainingSeconds > 0) {
                        formattedTimeRemaining = `~${remainingSeconds}s`;
                    } else {
                        formattedTimeRemaining = "Almost done...";
                    }
                } else if (remainingItems === 0 && processedCount > 0) {
                    formattedTimeRemaining = "Finishing...";
                }

                // Update status message based on counts
                let status = progress.status;
                if (!status) {
                    if (failureCount > 0) {
                        status = `Processing batch ${currentBatch} of ${totalBatches}: ${processedCount}/${totalRecords} entries (${successCount} success, ${failureCount} failed)`;
                    } else {
                        status = `Processing batch ${currentBatch} of ${totalBatches}: ${processedCount}/${totalRecords} entries`;
                    }
                }

                // FIXED: Update the UI model with all calculated data and proper validation
                this._updateWBSDisplay({
                    status: status,
                    currentWBS: processedCount,
                    processedWBS: processedCount,
                    totalWBS: totalRecords,
                    processedEntries: processedCount,
                    totalEntries: totalRecords,
                    successCount: successCount,
                    failureCount: failureCount,
                    existingCount: existingCount,
                    wbsProgress: overallProgress,
                    entriesProgress: overallProgress,
                    timeRemaining: formattedTimeRemaining,
                    processingSpeed: processingSpeed,
                    isCompleted: processedCount >= totalRecords,
                    isError: failureCount > 0
                }, true);

                // FIXED: Update internal state to match progress
                this.responseData.processedCount = processedCount;
                this.responseData.successCount = successCount;
                this.responseData.failureCount = failureCount;
                this.responseData.processedWBS = processedCount;

            } catch (error) {
                console.error("BatchProcessingManager: Error updating progress from batch information:", error);

                // Show error in UI
                this._updateWBSDisplay({
                    status: "Error updating progress display",
                    isError: true,
                    error: `Progress update failed: ${error.message}`
                });
            }
        }

        /**
         * Cancel the current batch WBS Element creation process
         */
        cancelWBSElementCreation() {
            console.log("BatchProcessingManager: Cancellation requested - aborting batch processing");
            this.processingCancelled = true;

            // Cancel the active batch request if available
            if (this._activeRequest && typeof this._activeRequest.cancel === 'function') {
                this._activeRequest.cancel();

                // Update UI immediately to show cancellation
                this._updateWBSDisplay({
                    status: "Cancellation requested - stopping processing...",
                    isError: true
                });

                // Update response data
                this.responseData.wasCancelled = true;
            } else {
                console.warn("BatchProcessingManager: No active request to cancel");
            }
        }

        /**
   * Handle final UI state updates when WBS Element creation completes or is cancelled.
   * @param {boolean} [wasCancelled=false] - Flag indicating if processing was cancelled.
   * @param {boolean} [hadError=false] - Flag indicating if a major error occurred.
   * @private
   */
        _handleWBSCreationComplete(wasCancelled = false, hadError = false) {
            console.group('WBS Creation Completion Analysis');
            console.log('Raw Response Data:', JSON.stringify(this.responseData, null, 2));
            console.log('Was Cancelled:', wasCancelled);
            console.log('Had Error:', hadError);

            // FIXED: Extract all relevant information with proper null safety
            const totalRecords = this.responseData.totalRecords || 0;
            const processedCount = this.responseData.processedCount || 0;
            const successCount = this.responseData.successCount || 0;
            const failureCount = this.responseData.failureCount || 0;
            const allMessages = this.responseData.allMessages || [];

            // FIXED: Detailed status determination with proper validation
            let finalStatus = "";
            let finalErrorMsg = "";
            let isError = false;

            if (wasCancelled) {
                finalStatus = `Processing cancelled. ${processedCount} of ${totalRecords} records were processed before cancellation.`;
                finalErrorMsg = "Processing was stopped before completing.";
                isError = true;
            } else if (failureCount > 0 || hadError) {
                const successRate = totalRecords > 0 ? ((successCount / totalRecords) * 100).toFixed(1) : "0";
                finalStatus = `Processing completed with ${failureCount} failed entries out of ${totalRecords} total (${successRate}% success rate).`;
                finalErrorMsg = `${failureCount} entries could not be processed. Check detailed messages for specific issues.`;
                isError = failureCount > successCount; // Only mark as error if more failures than successes
            } else if (successCount > 0) {
                finalStatus = `Processing completed successfully! ${successCount} out of ${totalRecords} WBS Elements created.`;
                finalErrorMsg = "";
                isError = false;
            } else {
                finalStatus = "No records were processed successfully.";
                finalErrorMsg = "Check your input data and configuration. See messages for details.";
                isError = true;
            }

            // FIXED: Prepare detailed messages for display with proper filtering
            const errorMessages = allMessages
                .filter(msg => msg && (msg.type === 'error' || msg.severity === 'error'))
                .map(msg => `[${msg.code || 'ERROR'}] ${msg.message || msg.text || 'Unknown error'}`)
                .slice(0, 5); // Limit to first 5 error messages

            const warningMessages = allMessages
                .filter(msg => msg && (msg.type === 'warning' || msg.severity === 'warning'))
                .map(msg => `[${msg.code || 'WARNING'}] ${msg.message || msg.text || 'Unknown warning'}`)
                .slice(0, 3); // Limit to first 3 warning messages

            // Combine error and warning messages
            const combinedErrorMessages = [
                ...errorMessages,
                ...warningMessages
            ].join('\n');

            console.log('Final Status:', finalStatus);
            console.log('Final Error Message:', finalErrorMsg);
            console.log('Detailed Error Messages:', combinedErrorMessages);
            console.groupEnd();

            // FIXED: Update WBS display with comprehensive information and proper data validation
            this._updateWBSDisplay({
                status: finalStatus,
                error: finalErrorMsg,
                detailedErrors: combinedErrorMessages,
                isCompleted: true,
                isError: isError,
                wbsProgress: 100,
                entriesProgress: 100,
                currentWBS: Math.max(processedCount, successCount + failureCount), // Ensure consistent count
                processedWBS: processedCount,
                successCount: successCount,
                failureCount: failureCount,
                existingCount: 0,
                timeRemaining: "0s",
                processingSpeed: "Completed",
                totalRecords: totalRecords,
                processedCount: processedCount,

                // FIXED: Additional metadata for comprehensive reporting
                processingDetails: {
                    wasCancelled,
                    hadError,
                    successRate: totalRecords > 0 ? (successCount / totalRecords * 100).toFixed(1) : "0",
                    totalMessages: allMessages.length,
                    errorMessageCount: errorMessages.length,
                    warningMessageCount: warningMessages.length
                }
            }, true);

            // Always try to show export buttons
            this._showExportButtonsInDialog();

            // FIXED: Enhanced logging with proper error handling
            try {
                if (this._errorHandler && typeof this._errorHandler.log === 'function') {
                    this._errorHandler.log(
                        isError ? 'error' : 'info',
                        finalStatus,
                        {
                            totalRecords,
                            successCount,
                            failureCount,
                            wasCancelled,
                            hadError,
                            successRate: totalRecords > 0 ? (successCount / totalRecords * 100).toFixed(1) : "0",
                            messageCount: allMessages.length
                        }
                    );
                }
            } catch (logError) {
                console.error('BatchProcessingManager: Error logging completion:', logError);
            }

            // FIXED: Mark completion in response data
            this.responseData.isCompleted = true;
            this.responseData.completionTime = new Date().toISOString();
            this.responseData.wasCancelled = wasCancelled;
        }

        /**
    * Update the WBS display JSONModel safely with enhanced error handling.
    * @param {Object} data - Key-value pairs of properties to update in the model.
    * @param {boolean} [forceRefresh=false] - Whether to force a model refresh.
    * @private
    */
        _updateWBSDisplay(data, forceRefresh = false) {
            try {
                if (!this.oController || !this.oController.getView) {
                    console.warn("BatchProcessingManager: Cannot update display - Controller or View not available");
                    return;
                }

                const wbsDisplayModel = this.oController.getView().getModel("wbsDisplay");
                if (!wbsDisplayModel) {
                    console.warn("BatchProcessingManager: Cannot update display - wbsDisplay model not found");
                    return;
                }

                // Get current model data
                const currentData = wbsDisplayModel.getData() || {};

                // FIXED: Merge new data with proper null safety and validation
                const updatedData = {
                    ...currentData,
                    ...data,
                    // Ensure critical fields always have valid values
                    totalWBS: Math.max(0, data.totalWBS !== undefined ? data.totalWBS : currentData.totalWBS || 0),
                    processedWBS: Math.max(0, data.processedWBS !== undefined ? data.processedWBS : currentData.processedWBS || 0),
                    totalEntries: Math.max(0, data.totalEntries !== undefined ? data.totalEntries : currentData.totalEntries || 0),
                    processedEntries: Math.max(0, data.processedEntries !== undefined ? data.processedEntries : currentData.processedEntries || 0),
                    successCount: Math.max(0, data.successCount !== undefined ? data.successCount : currentData.successCount || 0),
                    failureCount: Math.max(0, data.failureCount !== undefined ? data.failureCount : currentData.failureCount || 0),
                    existingCount: 0, // Always 0
                    wbsProgress: Math.min(100, Math.max(0, data.wbsProgress !== undefined ? data.wbsProgress : currentData.wbsProgress || 0)),
                    entriesProgress: Math.min(100, Math.max(0, data.entriesProgress !== undefined ? data.entriesProgress : currentData.entriesProgress || 0)),
                    // Ensure string fields are never undefined
                    status: data.status || currentData.status || "Processing...",
                    error: data.error !== undefined ? data.error : currentData.error || "",
                    timeRemaining: data.timeRemaining || currentData.timeRemaining || "Calculating...",
                    processingSpeed: data.processingSpeed || currentData.processingSpeed || "Calculating...",
                    // Boolean fields with proper defaults
                    isCompleted: data.isCompleted !== undefined ? data.isCompleted : currentData.isCompleted || false,
                    isError: data.isError !== undefined ? data.isError : currentData.isError || false
                };

                console.log("BatchProcessingManager: Updating WBS display with data:", updatedData);

                // FIXED: Force UI update by setting the model data with validation
                wbsDisplayModel.setData(updatedData);

                // Force immediate refresh
                if (forceRefresh) {
                    wbsDisplayModel.refresh(true);

                    // FIXED: Force redraw of progress indicators with error handling
                    try {
                        const dialogId = "wbsCreationDialog";
                        const dialog = sap.ui.getCore().byId(this.oController.getView().createId(dialogId));
                        if (dialog) {
                            const content = dialog.getContent();
                            if (content && content.length > 0) {
                                this._refreshProgressIndicators(content);
                            }
                        }
                    } catch (refreshError) {
                        console.warn("BatchProcessingManager: Error refreshing progress indicators:", refreshError);
                    }
                }

            } catch (error) {
                console.error("BatchProcessingManager: Critical error updating WBS display", error);

                // Try to show at least an error message
                try {
                    if (this.oController && this.oController.getView) {
                        const wbsDisplayModel = this.oController.getView().getModel("wbsDisplay");
                        if (wbsDisplayModel) {
                            wbsDisplayModel.setProperty("/status", "Error updating display");
                            wbsDisplayModel.setProperty("/error", `Display update failed: ${error.message}`);
                            wbsDisplayModel.setProperty("/isError", true);
                        }
                    }
                } catch (fallbackError) {
                    console.error("BatchProcessingManager: Even fallback display update failed:", fallbackError);
                }
            }
        }

        /**
        * Helper method to find and refresh all ProgressIndicator controls
        * @param {Array|Object} controls - UI5 controls to check
        * @private
        */
        _refreshProgressIndicators(controls) {
            if (!controls) return;

            const processControl = (control) => {
                if (control instanceof sap.m.ProgressIndicator) {
                    // Force progress indicator rerender
                    try {
                        control.invalidate();
                        control.rerender();
                    } catch (e) {
                        console.warn("Error rerendering progress indicator:", e);
                    }
                    return true;
                }

                // Check aggregations for nested controls
                const aggregations = ['content', 'items', 'cells', '_grid', 'contentAreas'];
                aggregations.forEach(aggName => {
                    if (control.getAggregation && control.getAggregation(aggName)) {
                        const aggregation = control.getAggregation(aggName);
                        if (aggregation) {
                            if (Array.isArray(aggregation)) {
                                aggregation.forEach(child => processControl(child));
                            } else {
                                processControl(aggregation);
                            }
                        }
                    }
                });
            };

            if (Array.isArray(controls)) {
                controls.forEach(control => processControl(control));
            } else {
                processControl(controls);
            }
        }

        /**
        * Load the WBS creation dialog fragment using UIManager.
        * @returns {Promise<sap.m.Dialog>} Promise resolving with the dialog instance.
        * @private
        */
        _loadWBSCreationDialog() {
            return new Promise((resolve, reject) => {
                const dialogId = "wbsCreationDialog";
                const fragmentName = "wbscreate.view.BatchProcessingDisplayDialog";

                if (!this.oController) {
                    reject(new Error("BatchProcessingManager: Controller not available"));
                    return;
                }

                if (!this.oController._uiManager) {
                    reject(new Error("BatchProcessingManager: UIManager not available"));
                    return;
                }

                console.log("BatchProcessingManager: Using UIManager for dialog loading.");

                // Use the UIManager's loadAndShowDialog method which returns a Promise
                this.oController._uiManager.loadAndShowDialog(
                    dialogId,
                    fragmentName,
                    null,
                    null,
                    this.oController
                )
                    .then(oDialog => {
                        console.log("BatchProcessingManager: WBS dialog loaded successfully", oDialog);
                        resolve(oDialog);
                    })
                    .catch(error => {
                        console.error("BatchProcessingManager: Error loading WBS dialog:", error);
                        reject(error);
                    });
            });
        }

        /**
         * Make export buttons visible in the WBS creation dialog
         * @private
         */
        _showExportButtonsInDialog() {
            // Add more robust logging
            console.log("BatchProcessingManager: Showing export buttons", {
                successCount: this.responseData.successCount,
                failureCount: this.responseData.failureCount,
                totalRecords: this.responseData.totalRecords,
                processedCount: this.responseData.processedCount
            });

            // Try multiple strategies to show export buttons
            setTimeout(() => {
                const dialogSelectors = [
                    '#wbsCreationDialog--exportPanel',
                    '.sapMPanel.exportPanel',
                    '.sapMFlexBox.exportContainer'
                ];

                dialogSelectors.forEach(selector => {
                    const exportArea = $(selector);
                    if (exportArea.length) {
                        console.log(`BatchProcessingManager: Found export area via ${selector}`);
                        exportArea.show();
                        exportArea.closest('.sapMPanel').find('.sapMPanelContent').show();
                    }
                });
            }, 100);
        }

        /**
         * Close the batch processing dialog
         */
        closeBatchProcessingDialog() {
            const dialogId = "wbsCreationDialog";
            if (this.oController?._uiManager?.closeDialog) {
                console.log("BatchProcessingManager: Using UIManager to close dialog");
                this.oController._uiManager.closeDialog(dialogId);
            } else {
                console.error("BatchProcessingManager: Cannot close dialog - UIManager not available");
            }
        }

        /**
         * Get the response data
         * @returns {Object} Response data
         */
        getResponseData() {
            return this.responseData;
        }

        /**
         * Get all messages with proper null safety
         * @returns {Array} All messages
         */
        getAllMessages() {
            const allMessages = [
                ...(this.responseData?.allMessages || []),
                ...(this.responseData?.messages || [])
            ];

            // Filter out invalid messages and ensure proper structure
            return allMessages.filter(msg => {
                return msg &&
                    (msg.message || msg.text) &&
                    typeof (msg.message || msg.text) === 'string' &&
                    (msg.message || msg.text).trim() !== '';
            }).map(msg => ({
                type: msg.type || 'info',
                code: msg.code || 'UNKNOWN',
                message: msg.message || msg.text || 'Unknown message',
                timestamp: msg.timestamp || new Date().toISOString(),
                source: msg.source || 'Application',
                entityId: msg.entityId || '',
                batchIndex: msg.batchIndex !== undefined ? msg.batchIndex : '',
                details: msg.details || ''
            }));
        }
    };
});
