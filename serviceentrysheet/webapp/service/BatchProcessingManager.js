sap.ui.define([
    "sap/ui/model/json/JSONModel",
    "sap/ui/core/Fragment",
    "sap/ui/core/BusyIndicator", // Added BusyIndicator if needed directly here, though ODataService handles it
    "serviceentrysheet/utils/ErrorHandler",
    "serviceentrysheet/utils/DataTransformer",
    "serviceentrysheet/utils/ResponseProcessor"
], function (JSONModel, Fragment, BusyIndicator, ErrorHandler, DataTransformer, ResponseProcessor) {
    "use strict";

    /**
     * BatchProcessingManager
     * Centralized manager for batch processing operations, typically one SES per PO+PostingDate combination.
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
            this._exportManager = options.exportManager; // Assuming ExportManager might be needed
            this._responseProcessor = options.responseProcessor || new ResponseProcessor({
                dataTransformer: this._dataTransformer
            });

            if (!this.oController) {
                console.warn("BatchProcessingManager: Controller instance not provided. UI updates might fail.");
            }

            if (!this._oDataService) {
                throw new Error("BatchProcessingManager requires an instance of ODataService.");
            }

            // Initialize processing state
            this.processingCancelled = false;
            this.startTime = null;
            this.totalBatches = 0; // Total PO+PostingDate combinations
            this.currentBatchIndex = 0; // Current batch index

            // Initialize response data structure
            this._resetResponseData();
        }

        /**
         * Reset response data structure
         * @private
         */
        _resetResponseData() {
            this.responseData = {
                totalRecords: 0,          // Total individual items across all SES batches
                processedCount: 0,        // Count of individual items processed (success or fail)
                successCount: 0,          // Count of successfully processed individual items
                failureCount: 0,          // Count of failed individual items
                successRecords: [],       // Array of successfully processed item data + results
                errorRecords: [],         // Array of failed item data + error info
                allMessages: [],          // Combined list of success/error messages (standardized)
                processedPOs: 0,          // Count of PO+PostingDate combinations processed
                totalPOs: 0               // Total PO+PostingDate combinations to process
            };
        }

        /**
         * Initialize batch processing UI (Dialog)
         * @param {Number} totalRecords - Total number of individual records (items) to process
         * @param {Number} totalBatches - Total number of PO+PostingDate combinations to process
         * @returns {Promise<sap.m.Dialog>} Promise resolving with the batch processing dialog instance
         */
        initBatchProcessingUI(totalRecords, totalBatches) {
            console.log("BatchProcessingManager: Initializing batch processing UI", { totalRecords, totalBatches });

            return new Promise((resolve, reject) => {
                try {
                    // Set totals based on PO+PostingDate combinations
                    this.totalBatches = totalBatches;
                    this.responseData.totalRecords = totalRecords;
                    this.responseData.totalPOs = totalBatches;

                    // Initialize tracking variables
                    this.currentBatchIndex = 0;
                    this.startTime = new Date();
                    this.processingCancelled = false;

                    // Reset response data counts (keep totals)
                    this.responseData.processedCount = 0;
                    this.responseData.successCount = 0;
                    this.responseData.failureCount = 0;
                    this.responseData.successRecords = [];
                    this.responseData.errorRecords = [];
                    this.responseData.allMessages = [];
                    this.responseData.processedPOs = 0;


                    // Initialize batch display model for the dialog
                    const batchDisplayModel = new JSONModel({
                        status: "Initializing...",
                        error: "",
                        totalBatches: this.totalBatches, // Total PO+PostingDate batches
                        currentBatch: 0,               // Current batch number being processed
                        processedBatches: 0,           // Batches completed
                        totalEntries: totalRecords,    // Total Items
                        processedEntries: 0,           // Items processed
                        successCount: 0,               // Successful Items
                        failureCount: 0,               // Failed Items
                        timeRemaining: "Calculating...",
                        processingSpeed: "Calculating...", // Speed based on items/sec
                        batchProgress: 0,             // Progress based on Batches (0-100)
                        entriesProgress: 0,           // Progress based on Items (0-100)
                        startTime: this.startTime.toISOString(), // Store as ISO string
                        isCompleted: false,
                        isError: false,
                        // We'll update these lists dynamically, start empty
                        successRecords: [], // These are for display in dialog, separate from internal responseData
                        errorRecords: []    // These are for display in dialog
                    });

                    // Set model on controller's view if available
                    if (this.oController && this.oController.getView) {
                        this.oController.getView().setModel(batchDisplayModel, "batchDisplay");
                        console.log("BatchProcessingManager: batchDisplay model set on view.");
                    } else {
                        console.warn("BatchProcessingManager: Cannot set batchDisplay model - Controller or View not available.");
                    }

                    // Load and open the batch processing dialog
                    this._loadBatchProcessingDialog()
                        .then((dialog) => {
                            console.log("BatchProcessingManager: Batch processing dialog loaded/opened successfully.", dialog);
                            resolve(dialog); // Resolve with the dialog instance
                        })
                        .catch((error) => {
                            console.error("BatchProcessingManager: Error loading/opening batch processing dialog:", error);
                            this._errorHandler.showError("Could not initialize batch processing display.", error.message);
                            reject(error);
                        });

                } catch (error) {
                    console.error("BatchProcessingManager: Critical error in initBatchProcessingUI:", error);
                    this._errorHandler.showError("Failed to initialize batch processing.", error.message);
                    reject(error);
                }
            });
        }

        /**
         * Start batch processing of Service Entry Sheets (one SES per Purchase Order + Posting Date combination).
         * @param {Array} data - Array of ALL individual item records to process.
         * @param {Object} [options] - Additional options (currently none specific).
         * @returns {Promise<Object>} Promise that resolves with an object containing the final responseData and a cancelled flag when processing is complete or cancelled.
         */
        startSESBatchProcessing(data, options = {}) {
            console.log("BatchProcessingManager: Starting SES batch processing with:", {
                itemCount: data ? data.length : 0,
                options: options
            });

            return new Promise((resolve, reject) => {
                try {
                    if (!data || data.length === 0) {
                        console.warn("BatchProcessingManager: No data provided to process.");
                        this._errorHandler.showWarning("No data available to process.");
                        // Resolve with empty results and cancelled: false, as it didn't technically fail but did nothing.
                        resolve({ responseData: this.responseData, cancelled: false });
                        return;
                    }

                    // 1. Group all items by Purchase Order + Posting Date
                    const poGroupsByPostingDate = this._groupByPurchaseOrderAndPostingDate(data);
                    const groupKeys = Object.keys(poGroupsByPostingDate);
                    const totalBatches = groupKeys.length;
                    const totalRecords = data.length; // Total individual items

                    if (totalBatches === 0) {
                        console.warn("BatchProcessingManager: Data provided, but no valid PO+PostingDate combinations found after grouping.");
                        this._errorHandler.showWarning("Could not identify valid Purchase Order and Posting Date combinations in the data.");
                        // Resolve with empty results and cancelled: false.
                        resolve({ responseData: this.responseData, cancelled: false });
                        return;
                    }

                    console.log(`BatchProcessingManager: Processing ${totalRecords} items across ${totalBatches} PO+PostingDate combinations.`);

                    // 2. Reset internal state
                    this._resetResponseData(); // Clear previous results
                    this.processingCancelled = false; // Ensure not cancelled initially

                    // 3. Initialize the UI Dialog
                    this.initBatchProcessingUI(totalRecords, totalBatches)
                        .then(() => {
                            console.log("BatchProcessingManager: UI Initialized. Starting PO+PostingDate batch processing...");

                            // 4. Start processing PO+PostingDate batches recursively
                            return this._processPurchaseOrdersSES(groupKeys, poGroupsByPostingDate, 0);
                        })
                        .then((finalProcessingResult) => {
                            // finalProcessingResult contains { cancelled: boolean }
                            console.log("BatchProcessingManager: Batch processing loop finished.", finalProcessingResult);

                            // 5. Handle overall completion (update UI state)
                            this._handleBatchProcessingComplete(finalProcessingResult.cancelled);

                            // 6. Resolve the main promise with the collected results and cancellation status
                            resolve({
                                responseData: this.responseData,
                                cancelled: finalProcessingResult.cancelled
                            });
                        })
                        .catch((error) => {
                            // This catches errors from UI init or the recursive processing loop
                            console.error("BatchProcessingManager: Error during batch processing execution:", error);

                            // Update UI to show error state
                            this._updateBatchDisplay({
                                status: "Error during processing!",
                                error: error.message || "An unknown error occurred.",
                                isCompleted: true, // Mark as completed (with errors)
                                isError: true
                            });

                            // Ensure export buttons etc. are handled
                            this._handleBatchProcessingComplete(false, true); // Mark complete with error

                            // Show error message to user
                            this._errorHandler.showError(
                                "Batch Processing Failed: " + (error.message || "Unknown error"),
                                error.details || (error.stack ? error.stack.substring(0, 300) : "")
                            );

                            // Reject the main promise
                            reject(error);
                        });

                } catch (topLevelError) {
                    console.error("BatchProcessingManager: Top-level error setting up batch processing:", topLevelError);
                    this._errorHandler.showError(
                        "Critical Error: Failed to start batch processing.",
                        topLevelError.message
                    );
                    reject(topLevelError); // Reject the main promise
                }
            });
        }

        /**
         * Process PO+PostingDate batches recursively, creating one SES per PO+PostingDate combination.
         * @param {Array<string>} groupKeys - Array of PO+PostingDate group keys.
         * @param {Object} poGroupsByPostingDate - Object mapping group keys to arrays of item data.
         * @param {Number} currentIndex - The index of the current group in the groupKeys array.
         * @returns {Promise<Object>} Promise that resolves with { cancelled: boolean } when processing is complete or cancelled.
         * @private
         */
        _processPurchaseOrdersSES(groupKeys, poGroupsByPostingDate, currentIndex) {
            return new Promise((resolve, reject) => {
                // --- Check for Completion or Cancellation ---
                if (this.processingCancelled) {
                    console.log(`BatchProcessingManager: Processing cancelled at batch index ${currentIndex}.`);
                    resolve({ cancelled: true });
                    return;
                }

                if (currentIndex >= groupKeys.length) {
                    console.log("BatchProcessingManager: All PO+PostingDate batches processed.");
                    resolve({ cancelled: false }); // Base case: recursion finished
                    return;
                }

                // --- Prepare for Current Batch ---
                const currentGroupKey = groupKeys[currentIndex];
                const batchItems = poGroupsByPostingDate[currentGroupKey];
                this.currentBatchIndex = currentIndex;

                // Extract PO number and posting date from the group key for display
                const [poNumber, postingDate] = currentGroupKey.split('::');
                const displayKey = `PO ${poNumber} / ${postingDate}`;

                console.log(`BatchProcessingManager: Processing batch ${currentIndex + 1}/${groupKeys.length}: ${displayKey} with ${batchItems.length} items.`);

                // Update UI display for the current batch
                this._updateBatchDisplay({
                    status: `Processing ${displayKey} (${currentIndex + 1} of ${groupKeys.length})...`,
                    currentBatch: currentIndex + 1,
                    processedBatches: currentIndex,
                    batchProgress: Math.round(((currentIndex) / groupKeys.length) * 100)
                });

                // --- Transform data and Call OData Service ---
                try {
                    // Use DataTransformer to create the deep insert payload for this single PO+PostingDate batch
                    let serviceEntrySheetPayload = this._dataTransformer.createServiceEntrySheetPayloads(batchItems);
                    if (Array.isArray(serviceEntrySheetPayload)) {
                        if (serviceEntrySheetPayload.length > 1) {
                            console.warn(`BatchProcessingManager: DataTransformer created ${serviceEntrySheetPayload.length} payloads for group ${displayKey}. Using only the first.`);
                        }
                        serviceEntrySheetPayload = serviceEntrySheetPayload[0]; // Take the first payload if array returned
                    }

                    if (!serviceEntrySheetPayload) {
                        throw new Error(`DataTransformer failed to create payload for group ${displayKey}`);
                    }

                    console.log(`BatchProcessingManager: Payload for ${displayKey}:`, JSON.stringify(serviceEntrySheetPayload)); // Log payload

                    // Call the OData service to create this single SES
                    let currentRequest = this._oDataService.createServiceEntrySheets(serviceEntrySheetPayload, {
                        success: (result) => {
                            console.log(`BatchProcessingManager: Success callback received for ${displayKey}`, result);
                            if (this.processingCancelled) {
                                console.log(`BatchProcessingManager: Processing was cancelled during OData call for ${displayKey}`);
                                resolve({ cancelled: true });
                                return;
                            }

                            // Track if any items need GRN approval
                            let sesNumberForApproval = null;
                            let itemsNeedingApproval = [];

                            // Process each item in this batch using ResponseProcessor
                            batchItems.forEach((originalItemData) => {
                                // Extract success record data using ResponseProcessor
                                const successRecord = this._responseProcessor.extractSuccessRecordData(
                                    result,
                                    originalItemData
                                );

                                // Store the success record
                                this._handleRecord(
                                    true,
                                    successRecord, // Pass the processed success record
                                    null,
                                    originalItemData._originalIndex // Pass original index
                                );

                                // Check if this item needs GRN approval and collect it
                                const needsApproval = originalItemData.GRNCreate === "X" ||
                                    originalItemData.GRNCreate === true ||
                                    originalItemData.GRNCreate === "TRUE";

                                if (needsApproval && successRecord && successRecord.ServiceEntrySheet) {
                                    sesNumberForApproval = successRecord.ServiceEntrySheet;
                                    itemsNeedingApproval.push({
                                        originalData: originalItemData,
                                        successRecord: successRecord
                                    });
                                }
                            });

                            this.responseData.processedPOs++; // Increment processed batch count

                            // Update UI
                            this._updateBatchDisplay({
                                processedBatches: this.responseData.processedPOs,
                                batchProgress: Math.round((this.responseData.processedPOs / groupKeys.length) * 100)
                            });

                            // If any items need approval and we have a valid SES number, call the approval process
                            if (itemsNeedingApproval.length > 0 && sesNumberForApproval) {
                                console.log(`BatchProcessingManager: Found ${itemsNeedingApproval.length} items needing GRN approval for SES ${sesNumberForApproval}`);
                                this._updateBatchDisplay({
                                    status: `Approving SES ${sesNumberForApproval} for GRN creation...`
                                });

                                // Call the approval method - pass the first item's data for context
                                this._approveServiceEntrySheetIfNeeded(
                                    sesNumberForApproval,
                                    result // Pass the entire result for context
                                );
                            }

                            // Add a small delay before processing the next batch
                            // to prevent overwhelming the server and to give the UI more time to update
                            const timeoutId = setTimeout(() => {
                                // Check for cancellation before starting next batch
                                if (this.processingCancelled) {
                                    resolve({ cancelled: true });
                                    return;
                                }

                                this._processPurchaseOrdersSES(groupKeys, poGroupsByPostingDate, currentIndex + 1)
                                    .then(resolve)
                                    .catch(reject);
                            }, 5000);

                            // Store timeout ID for potential cancellation
                            this._pendingTimeouts = this._pendingTimeouts || [];
                            this._pendingTimeouts.push(timeoutId);
                        },
                        error: (error) => {
                            console.error(`BatchProcessingManager: Error callback received for ${displayKey}`, error);
                            if (this.processingCancelled) {
                                console.log(`BatchProcessingManager: Processing was cancelled during error for ${displayKey}`);
                                resolve({ cancelled: true });
                                return;
                            }
                            // Process error for all items in this batch
                            batchItems.forEach((originalItemData) => {
                                // Extract error details using ResponseProcessor
                                const errorDetail = this._responseProcessor.extractErrorDetails(
                                    error,
                                    originalItemData // Pass original item data for context
                                );

                                this._handleRecord(
                                    false,
                                    null,
                                    errorDetail, // Pass the processed error detail
                                    originalItemData._originalIndex // Pass original index
                                );
                            });

                            this.responseData.processedPOs++; // Increment processed batch count (as we attempted it)

                            // Update UI
                            this._updateBatchDisplay({
                                processedBatches: this.responseData.processedPOs,
                                batchProgress: Math.round((this.responseData.processedPOs / groupKeys.length) * 100)
                            });

                            // Continue with the next batch despite the error in this one
                            console.warn(`BatchProcessingManager: Continuing to next batch after failure in ${displayKey}.`);

                            // Add a small delay before processing the next batch after an error
                            const timeoutId = setTimeout(() => {
                                // Check for cancellation before starting next batch
                                if (this.processingCancelled) {
                                    resolve({ cancelled: true });
                                    return;
                                }

                                this._processPurchaseOrdersSES(groupKeys, poGroupsByPostingDate, currentIndex + 1)
                                    .then(resolve)
                                    .catch(reject);
                            }, 500);

                            // Store timeout ID for potential cancellation
                            this._pendingTimeouts = this._pendingTimeouts || [];
                            this._pendingTimeouts.push(timeoutId);
                        }
                    });
                    // Store request for potential cancellation
                    if (currentRequest && currentRequest.request) {
                        const xhr = currentRequest.request();
                        if (!this._activeXHRs) this._activeXHRs = [];
                        this._activeXHRs.push(xhr);
                    }
                } catch (processingError) {
                    console.error(`BatchProcessingManager: Error preparing/initiating processing for ${displayKey}:`, processingError);

                    // Mark all items in this batch as failed due to this local error
                    batchItems.forEach((originalItemData) => {
                        const errorDetail = {
                            entry: originalItemData, // Keep original data reference
                            error: `Failed to process ${displayKey}: ${processingError.message}`,
                            errorCode: "LOCAL_PROCESSING_ERROR",
                            details: [processingError.stack]
                        };
                        this._handleRecord(false, null, errorDetail, originalItemData._originalIndex);
                    });

                    this.responseData.processedPOs++; // Increment processed batch count (as we attempted it)

                    // Update UI
                    this._updateBatchDisplay({
                        processedBatches: this.responseData.processedPOs,
                        batchProgress: Math.round((this.responseData.processedPOs / groupKeys.length) * 100)
                    });

                    // Continue with the next batch
                    console.warn(`BatchProcessingManager: Continuing to next batch after local error in ${displayKey}.`);

                    // Add a small delay before processing the next batch after a local error
                    setTimeout(() => {
                        this._processPurchaseOrdersSES(groupKeys, poGroupsByPostingDate, currentIndex + 1)
                            .then(resolve)
                            .catch(reject);
                    }, 500); // 500ms delay between batches
                }
            });
        }

        /**
         * Approve a service entry sheet if specified in the input data
         * @param {String} serviceEntrySheetId - The ID of the successfully created SES
         * @param {Object} originalItemData - The original item data that may contain approval flags
         * @private
         */
        async _approveServiceEntrySheetIfNeeded(serviceEntrySheetId, creationResult) {
            try {
                const approvalPayload = {
                    // Set appropriate approval status fields for GRN creation
                    IsGoodsReceiptCompleted: true,
                    IsApprovalCompleted: true,
                    ApprovalStatus: "A", // "A" for Approved
                    LastChangeDateTime: new Date().toISOString()
                };
                const approvalResult = await this._oDataService.approveServiceEntrySheet(serviceEntrySheetId, approvalPayload);

                console.log(`BatchProcessingManager: SES ${serviceEntrySheetId} successfully approved for GRN creation`, approvalResult);

                this.responseData.successRecords.forEach((record, index) => {
                    if (record.ServiceEntrySheet === serviceEntrySheetId) {
                        this.responseData.successRecords[index].IsGRNCreated = true;
                        this.responseData.successRecords[index].ApprovalStatus = "Approved";
                        this.responseData.successRecords[index].statusMessage = serviceEntrySheetId + " (GRN Created)";
                    }
                });

                this._updateBatchDisplay({
                    status: `SES ${serviceEntrySheetId} approved for GRN creation`
                });

            } catch (approvalError) {
                console.error(`BatchProcessingManager: Error approving SES ${serviceEntrySheetId} for GRN creation`, approvalError);

                this.responseData.successRecords.forEach((record, index) => {
                    if (record.ServiceEntrySheet === serviceEntrySheetId) {
                        this.responseData.successRecords[index].ApprovalStatus = "Error";
                        this.responseData.successRecords[index].ApprovalError = approvalError.message || "GRN creation failed";
                        this.responseData.successRecords[index].statusMessage = serviceEntrySheetId + " (SES created but GRN creation failed)";
                    }
                });

                this._updateBatchDisplay({
                    status: `Error approving SES ${serviceEntrySheetId} for GRN creation`
                });
            }
        }

        /**
         * Unified method to handle results for a single original item record.
         * Stores results in internal responseData and updates UI.
         * @param {Boolean} isSuccess - Whether this item was processed successfully.
         * @param {Object | null} recordData - Processed data for the successful record (from ResponseProcessor). Null if error.
         * @param {Object | null} errorInfo - Processed error information for failed records (from ResponseProcessor). Null if success.
         * @param {Number} originalIndex - The original index of the item in the input data.
         * @private
         */
        _handleRecord(isSuccess, recordData, errorInfo, originalIndex) {
            this.responseData.processedCount++; // Increment total items processed count

            // Get original data reference from the processed structures
            const originalItemData = isSuccess ? recordData : (errorInfo?.entry || {});
            // Ensure originalIndex is valid
            const validOriginalIndex = (originalIndex !== undefined && originalIndex !== null && originalIndex >= 0) ? originalIndex : -1;
            // Create a standardized message object for logging/potential future use
            let messageObject = this._errorHandler.createStandardMessage(
                isSuccess ? "success" : "error",
                isSuccess ? "SUCCESS" : (errorInfo?.errorCode || "ERROR"),
                isSuccess ? (recordData?.Message || "Successfully processed") : (errorInfo?.error || "Processing failed"),
                isSuccess ? (recordData?._rawResponseItem || recordData?._rawResponseHeader || null) : (errorInfo?.details || []),
                "Service Entry Sheet Processor",
                isSuccess ? (recordData?.ServiceEntrySheet || "") : (originalItemData?.PurchaseOrder || ""),
                this.currentBatchIndex, // Current batch index
                validOriginalIndex // Original row index
            );

            if (isSuccess) {
                this.responseData.successCount++;
                // Add to successRecords, including ALL original data
                this.responseData.successRecords.push({
                    // Spread the ENTIRE original item data first
                    ...originalItemData,

                    // Specific result fields
                    ServiceEntrySheet: recordData.ServiceEntrySheet,
                });
                console.log(`BatchProcessingManager: Handled SUCCESS record (Index: ${validOriginalIndex}, PO: ${recordData?.PurchaseOrder}, SES: ${recordData?.ServiceEntrySheet})`);
            } else {
                this.responseData.failureCount++;
                // Add to errorRecords, including ALL original data
                this.responseData.errorRecords.push({
                    // Spread the ENTIRE original item data first
                    ...originalItemData,

                    // Explicitly add error-specific fields
                    Status: 'Error',
                    // REMOVE DUPLICATE ERROR FIELDS
                    // Use messageObject for error details instead of repeating from errorInfo
                    ErrorCode: messageObject.code || "ERROR",
                    ErrorMessage: messageObject.message || "Processing failed"
                });
                console.error(`BatchProcessingManager: Handled ERROR record (Index: ${validOriginalIndex}, PO: ${originalItemData?.PurchaseOrder}, Code: ${messageObject.code})`);
            }

            // Add to allMessages log (for potential detailed logging export)
            this.responseData.allMessages.push(messageObject);

            // Update batch display model (counts and progress) based on ITEM processing
            this._updateBatchDisplay({
                processedEntries: this.responseData.processedCount,
                successCount: this.responseData.successCount,
                failureCount: this.responseData.failureCount,
                entriesProgress: Math.round((this.responseData.processedCount / (this.responseData.totalRecords || 1)) * 100) // Avoid div by zero
            });
        }

        /**
         * Get all messages (success and error) collected during processing.
         * @returns {Array<Object>} - Array of standardized message objects.
         */
        getAllMessages() {
            return this.responseData.allMessages || [];
        }

        /**
         * Get the final collected response data after processing.
         * @returns {Object} Response data object.
         */
        getResponseData() {
            return this.responseData;
        }

        /**
         * Update the batch display JSONModel safely.
         * @param {Object} data - Key-value pairs of properties to update in the model.
         * @private
         */
        _updateBatchDisplay(data) {
            if (!this.oController || !this.oController.getView) {
                // console.warn("BatchProcessingManager: Cannot update display - Controller/View missing.");
                return;
            }
            const batchDisplayModel = this.oController.getView().getModel("batchDisplay");
            if (!batchDisplayModel) {
                // console.warn("BatchProcessingManager: Cannot update display - batchDisplay model not found on view.");
                return;
            }

            // Get current model data
            const currentData = batchDisplayModel.getData();

            // Calculate processing speed (items per second)
            const currentTime = new Date();
            const elapsedSeconds = Math.max(1, (currentTime - this.startTime) / 1000); // Avoid division by zero
            const itemsPerSecond = (this.responseData.processedCount / elapsedSeconds);
            const processingSpeed = `${itemsPerSecond.toFixed(1)} items/sec`;

            // Calculate time remaining based on items
            const remainingItems = Math.max(0, this.responseData.totalRecords - this.responseData.processedCount);
            let formattedTimeRemaining = "Calculating...";

            if (currentData.isCompleted) {
                formattedTimeRemaining = "0s";
            } else if (remainingItems > 0 && itemsPerSecond > 0.01) { // Only estimate if speed is somewhat reliable
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
            } else if (remainingItems === 0) {
                formattedTimeRemaining = "Finishing...";
            }

            // Merge new data with calculations
            const updatedData = {
                ...currentData,
                ...data, // Overwrite with new data passed in
                processingSpeed: processingSpeed,
                timeRemaining: formattedTimeRemaining
            };

            // Update the model
            batchDisplayModel.setData(updatedData);
            // Optional: Force refresh if updates aren't showing
            // batchDisplayModel.refresh(true);
        }

        /**
         * Handle final UI state updates when batch processing completes or is cancelled.
         * @param {boolean} [wasCancelled=false] - Flag indicating if processing was cancelled.
         * @param {boolean} [hadError=false] - Flag indicating if a major error occurred during the loop.
         * @private
         */
        _handleBatchProcessingComplete(wasCancelled = false, hadError = false) {
            const hasFailures = this.responseData.failureCount > 0;
            let finalStatus = "";
            let finalErrorMsg = "";

            if (wasCancelled) {
                finalStatus = "Processing cancelled by user.";
                finalErrorMsg = "Processing was stopped before all items were processed.";
            } else if (hasFailures || hadError) {
                const failureText = this.responseData.failureCount === 1 ? "item" : "items";
                finalStatus = `Processing finished with ${this.responseData.failureCount} failed ${failureText}.`;
                finalErrorMsg = `${this.responseData.failureCount} ${failureText} could not be processed.`;
                if (hadError && !hasFailures) { // Major error but no specific item failures recorded
                    finalStatus = "Processing finished with errors.";
                    finalErrorMsg = "An error occurred during processing. Check logs.";
                }
            } else {
                finalStatus = "Processing completed successfully.";
                finalErrorMsg = "";
            }


            // Update batch display model to final state
            this._updateBatchDisplay({
                status: finalStatus,
                error: finalErrorMsg,
                isCompleted: true, // Always set to true for cancellation to show Close button
                isError: wasCancelled || hasFailures || hadError,
                batchProgress: 100, // Always 100% at the end of this phase
                entriesProgress: Math.round((this.responseData.processedCount / (this.responseData.totalRecords || 1)) * 100), // Avoid div by zero
                currentBatch: this.totalBatches, // Show final batch number
                processedBatches: this.responseData.processedPOs,
                timeRemaining: "0s"
            });

            // Make export buttons visible in the dialog
            // This might be premature if an approval phase follows. Consider moving this call
            // to after the approval phase is also complete in the main controller.
            this._showExportButtonsInDialog();

            console.log("BatchProcessingManager: Batch processing (creation phase) marked as complete in UI.");
        }

        /**
         * Signal cancellation for the ongoing batch process, aborting any in-progress requests.
         */
        cancelBatchProcessing() {
            console.log("BatchProcessingManager: Cancellation requested - aborting all active requests");
            this.processingCancelled = true;

            // Abort any active XHR requests
            if (this._activeXHRs && this._activeXHRs.length > 0) {
                console.log(`BatchProcessingManager: Aborting ${this._activeXHRs.length} active XHR requests`);
                this._activeXHRs.forEach(xhr => {
                    try {
                        if (xhr && xhr.abort && typeof xhr.abort === 'function') {
                            xhr.abort();
                        }
                    } catch (e) {
                        console.warn("Failed to abort XHR:", e);
                    }
                });
                // Clear the array
                this._activeXHRs = [];
            }

            // Clear any pending timeouts for retries
            if (this._pendingTimeouts && this._pendingTimeouts.length > 0) {
                console.log(`BatchProcessingManager: Clearing ${this._pendingTimeouts.length} pending timeouts`);
                this._pendingTimeouts.forEach(timeoutId => {
                    try {
                        clearTimeout(timeoutId);
                    } catch (e) {
                        console.warn("Failed to clear timeout:", e);
                    }
                });
                // Clear the array
                this._pendingTimeouts = [];

                // Update batch display immediately to show completed state
                this._updateBatchDisplay({
                    status: "Cancellation complete - processing stopped.",
                    isError: true,
                    isCompleted: true, // Set to true to show the Close button
                    batchProgress: 100  // Show 100% to indicate cancellation is complete
                });
                // Also update the response data to show it was cancelled
                this.responseData.wasCancelled = true
            }
        }

        /**
         * Load the batch processing dialog fragment using UIManager.
         * @returns {Promise<sap.m.Dialog>} Promise resolving with the dialog instance.
         * @private
         */
        _loadBatchProcessingDialog() {
            return new Promise((resolve, reject) => {
                const dialogId = "batchProcessingDialog";
                const fragmentName = "serviceentrysheet.view.BatchProcessingDisplayDialog";

                if (!this.oController) {
                    reject(new Error("BatchProcessingManager: Controller not available"));
                    return;
                }

                if (!this.oController._uiManager) {
                    reject(new Error("BatchProcessingManager: UIManager not available"));
                    return;
                }

                console.log("BatchProcessingManager: Using UIManager for dialog loading.");

                // Use the UIManager's loadAndShowDialog method which now returns a Promise
                this.oController._uiManager.loadAndShowDialog(
                    dialogId,
                    fragmentName,
                    null, // Model is set later via batchDisplay
                    null,
                    this.oController
                )
                    .then(oDialog => {
                        console.log("BatchProcessingManager: Batch dialog loaded successfully", oDialog);
                        resolve(oDialog);
                    })
                    .catch(error => {
                        console.error("BatchProcessingManager: Error loading batch dialog:", error);
                        reject(error);
                    });
            });
        }

        /**
         * Make export buttons visible in the batch processing dialog.
         * @private
         */
        _showExportButtonsInDialog() {
            // Debounce this call slightly to ensure the dialog is rendered
            setTimeout(() => {
                try {
                    const dialogId = this.oController?.getView()?.createId("batchProcessingDialog");
                    if (!dialogId) {
                        console.warn("BatchProcessingManager: Cannot find dialog ID for export buttons.");
                        return;
                    }

                    const oDialog = sap.ui.getCore().byId(dialogId);
                    if (!oDialog || typeof oDialog.getContent !== 'function') {
                        console.warn("BatchProcessingManager: Cannot find batch dialog instance to show export buttons.");
                        return;
                    }

                    // Find the container for export buttons - more robust search
                    let exportContainer = null;
                    const content = oDialog.getContent();

                    const findControlRecursive = (controls) => {
                        for (const control of controls) {
                            // Check by specific ID suffix if known and stable
                            if (control.getId && control.getId().endsWith("--exportButtonsContainer")) { // Use view-specific ID if fragment has ID
                                return control;
                            }
                            // Check by a custom style class if applied reliably
                            if (control.hasStyleClass && control.hasStyleClass("exportContainer")) { // Check for a specific style class
                                return control;
                            }

                            // Recursively check aggregations
                            if (control.getAggregation) {
                                const aggregationsToCheck = ['items', 'content', 'formElements', 'cells', '_grid', 'contentAreas']; // Add common aggregations
                                for (const aggName of aggregationsToCheck) {
                                    const aggregation = control.getAggregation(aggName);
                                    if (aggregation) {
                                        const found = findControlRecursive(Array.isArray(aggregation) ? aggregation : [aggregation]);
                                        if (found) return found;
                                    }
                                }
                            }
                        }
                        return null;
                    };

                    if (content && content.length > 0) {
                        exportContainer = findControlRecursive(content);
                    }

                    if (exportContainer && typeof exportContainer.setVisible === 'function') {
                        console.log("BatchProcessingManager: Making export buttons visible.");
                        exportContainer.setVisible(true);
                    } else {
                        console.warn("BatchProcessingManager: Export buttons container not found or not visible in the dialog fragment. Check fragment structure, IDs, or style classes.");
                    }
                } catch (error) {
                    console.error("BatchProcessingManager: Error trying to show export buttons:", error);
                }
            }, 100); // Small delay
        }

        /**
         * Close the batch processing dialog using UIManager.
         */
        closeBatchProcessingDialog() {
            const dialogId = "batchProcessingDialog";
            if (this.oController?._uiManager?.closeDialog) {
                console.log("BatchProcessingManager: Using UIManager to close dialog");
                this.oController._uiManager.closeDialog(dialogId);
            } else {
                console.error("BatchProcessingManager: Cannot close dialog - UIManager not available");
            }
        }

        /**
         * Group an array of items by their Purchase Order number and Posting Date.
         * Also stores the original index on each item.
         * Items with same PO and Posting Date are grouped together to be processed as separate items in a single SES.
         * @param {Array<Object>} items - Array of item records to group.
         * @returns {Object} Object where keys are PO+PostingDate combinations and values are arrays of items.
         * @private
         */
        _groupByPurchaseOrderAndPostingDate(items) {
            const groups = {};
            if (!Array.isArray(items)) {
                console.error("BatchProcessingManager: _groupByPurchaseOrderAndPostingDate received non-array input:", items);
                return groups;
            }

            items.forEach((item, index) => {
                if (typeof item !== 'object' || item === null) {
                    console.warn(`BatchProcessingManager: Skipping invalid item at index ${index} during grouping.`);
                    return;
                }

                // Store original index before grouping
                item._originalIndex = index;

                const poNumber = item.PurchaseOrder || "UNKNOWN_PO";
                const postingDate = item.PostingDate || "UNKNOWN_DATE";

                // Format for consistent string representation
                const formattedPostingDate = typeof postingDate === 'string'
                    ? postingDate
                    : (postingDate instanceof Date ? postingDate.toISOString().split('T')[0] : String(postingDate));

                // Create a composite key for the PO + PostingDate combination
                const groupKey = `${poNumber}::${formattedPostingDate}`;

                // Initialize group if it doesn't exist
                if (!groups[groupKey]) {
                    groups[groupKey] = [];
                }

                // Add the item to its group - multiple items with same PO+PostingDate will be in the same group
                groups[groupKey].push(item);
            });

            console.log(`BatchProcessingManager: Grouped ${items.length} items into ${Object.keys(groups).length} PO+PostingDate groups.`);

            // Log group sizes for debugging
            Object.keys(groups).forEach(key => {
                const [po, date] = key.split('::');
                console.log(`Group PO ${po} / Date ${date}: ${groups[key].length} items`);
            });

            return groups;
        }
    };
});