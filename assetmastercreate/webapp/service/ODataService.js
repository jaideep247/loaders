sap.ui.define(
    [
        "sap/ui/model/odata/v4/ODataModel",
        "sap/ui/model/json/JSONModel",
        "sap/m/MessageBox",
        "sap/ui/core/BusyIndicator",
        "sap/ui/model/Filter",
        "sap/ui/model/FilterOperator",
        "sap/m/MessageToast",
        "sap/ui/core/format/DateFormat",
        "sap/ui/core/Core",
        "sap/ui/model/odata/v4/Context",
        "sap/ui/core/message/Message",
        "assetmastercreate/utils/ErrorUtils"
    ],
    function (
        ODataModel,
        JSONModel,
        MessageBox,
        BusyIndicator,
        Filter,
        FilterOperator,
        MessageToast,
        DateFormat,
        Core,
        Context,
        Message,
        ErrorUtils
    ) {
        "use strict";

        /**
         * ODataService class for handling communication with OData services
         * Updated for Asset Master Creation with sequence-based grouping
         */
        return class ODataService {
            /**
             * Constructor for ODataService
             * @param {sap.ui.model.odata.v4.ODataModel} oModel - OData v4 model
             * @param {object} dataTransformer - Instance of the DataTransformer utility
             * @param {object} errorHandler - Instance of the ErrorHandler utility
             */
            constructor(oModel, dataTransformer, errorHandler) {
                if (!oModel) {
                    throw new Error("OData model is required");
                }
                if (!dataTransformer) {
                    throw new Error("DataTransformer is required");
                }
                if (!errorHandler) {
                    throw new Error("ErrorHandler is required");
                }

                // Check if the model is a valid OData v4 model
                const modelName = oModel.getMetadata ? oModel.getMetadata().getName() : null;
                if (modelName !== "sap.ui.model.odata.v4.ODataModel") {
                    throw new Error(`Invalid OData model type. Expected sap.ui.model.odata.v4.ODataModel, got ${modelName}`);
                }

                this._oModel = oModel;
                this._dataTransformer = dataTransformer;
                this._errorHandler = errorHandler;
                this._entityPath = "/FixedAsset/SAP__self.CreateMasterFixedAsset"; // Asset Master Action Import Path
                this._dateFormatter = DateFormat.getDateInstance({ pattern: "yyyy-MM-dd" });
                this._batchUpdateGroupId = "assetBatchGroup"; // Define a named batch group ID
                this._debugMode = true; // Control internal logging

                this._resetInternalState();
                this._initializeODataErrorHandlers();
            }

            /**
             * Initialize error handlers for the OData model
             * @private
             */
            _initializeODataErrorHandlers() {
                try {
                    const oModel = this._oModel;
                    if (oModel && oModel.getMetadata().getName() === "sap.ui.model.odata.v4.ODataModel") {
                        const originalReportError = oModel.reportError;

                        oModel.reportError = (sLogMessage, sReportingClassName, oError) => {
                            if (this._preventEntityRefresh &&
                                oError &&
                                oError.message &&
                                oError.message.includes("No key predicate known")) {
                                console.warn("Ignoring expected OData refresh error during batch processing:", oError.message);
                                return;
                            }
                            return originalReportError.call(oModel, sLogMessage, sReportingClassName, oError);
                        };

                        console.log("OData error handlers initialized");
                    }
                } catch (error) {
                    console.warn("Could not initialize OData error handlers:", error);
                }
            }

            /**
             * Reset internal state of the service
             * @private
             */
            _resetInternalState() {
                this.totalRecords = 0;
                this.successCount = 0;
                this.failureCount = 0;
                this.failedRecords = [];
                this.successEntries = [];
                this._isCancelled = false;
                this._isProcessing = false;
                this._totalBatches = 0;
                this._batchStartTime = null;
                this._preventEntityRefresh = false;
            }

            /**
             * Set debug mode for detailed logging
             * @param {boolean} enable - Whether to enable debug mode
             */
            setDebugMode(enable) {
                this._debugMode = Boolean(enable);
                this._logInfo(`Debug mode ${this._debugMode ? 'enabled' : 'disabled'}`);
            }

            /**
             * Suspend OData operations to prevent issues during batch processing
             */
            suspendODataOperations() {
                try {
                    const oModel = this._oModel;
                    if (!oModel) return;

                    if (oModel.getMetadata().getName() === "sap.ui.model.odata.v4.ODataModel") {
                        this._modelState = {
                            autoRefresh: oModel.isAutoRefreshEnabled ? oModel.isAutoRefreshEnabled() : false
                        };

                        if (oModel.setAutoRefreshEnabled) {
                            oModel.setAutoRefreshEnabled(false);
                        }
                        if (oModel.suspend) {
                            oModel.suspend();
                        }

                        this._preventEntityRefresh = true;
                        console.log("OData operations suspended");
                    }
                } catch (error) {
                    console.warn("Error suspending OData operations:", error);
                }
            }

            /**
             * Resume OData operations after batch processing
             */
            resumeODataOperations() {
                try {
                    const oModel = this._oModel;
                    if (!oModel) return;

                    if (oModel.getMetadata().getName() === "sap.ui.model.odata.v4.ODataModel") {
                        if (this._modelState && oModel.setAutoRefreshEnabled) {
                            oModel.setAutoRefreshEnabled(this._modelState.autoRefresh);
                        }
                        if (oModel.resume) {
                            oModel.resume();
                        }

                        this._preventEntityRefresh = false;
                        console.log("OData operations resumed");
                    }
                } catch (error) {
                    console.warn("Error resuming OData operations:", error);
                }
            }

            /**
             * Create asset masters grouped by sequence ID
             * @param {Array} assetMasters - Array of asset master entries to create
             * @param {Object} callbacks - Callback functions for batch processing
             * @returns {Promise} Promise resolving with creation results
             */
            createAssetMasters(assetMasters, callbacks = {}) {
                // Validate input
                if (!assetMasters || !Array.isArray(assetMasters) || assetMasters.length === 0) {
                    const error = new Error("Valid asset master entries array is required");
                    if (callbacks.error) {
                        callbacks.error({ message: error.message });
                    }
                    return Promise.reject(error);
                }

                // Check if already processing
                if (this._isProcessing) {
                    const error = new Error("Another batch process is already running");
                    if (callbacks.error) {
                        callbacks.error({ message: error.message });
                    }
                    return Promise.reject(error);
                }

                try {
                    // Reset and initialize processing state
                    this._resetInternalState();
                    this._isProcessing = true;
                    this.totalRecords = assetMasters.length;
                    this._batchStartTime = new Date();

                    // Group by sequence ID
                    const sequenceGroups = this._groupBySequenceId(assetMasters);
                    this._totalBatches = Object.keys(sequenceGroups).length;

                    // Suspend OData operations
                    this.suspendODataOperations();

                    this._logInfo(`Starting processing of ${this.totalRecords} asset masters grouped into ${this._totalBatches} sequence batches`);

                    // Process sequence groups
                    return this._processSequenceGroups(sequenceGroups, {
                        batchStart: callbacks.batchStart || (() => { }),
                        batchProgress: callbacks.batchProgress || (() => { }),
                        success: (result) => {
                            this.resumeODataOperations();
                            this._isProcessing = false;
                            if (callbacks.success) {
                                callbacks.success(result);
                            }
                        },
                        error: (error) => {
                            this.resumeODataOperations();
                            this._isProcessing = false;
                            if (callbacks.error) {
                                callbacks.error(error);
                            }
                        }
                    });
                } catch (initError) {
                    this.resumeODataOperations();
                    this._isProcessing = false;
                    this._logError("Error initializing batch processing", initError);

                    if (callbacks.error) {
                        callbacks.error({
                            message: "Error initializing batch processing: " + initError.message
                        });
                    }
                    return Promise.reject(initError);
                }
            }

            /**
             * Group asset masters by sequence ID
             * @private
             */
            _groupBySequenceId(assetMasters) {
                const groups = {};

                assetMasters.forEach((asset, index) => {
                    const sequenceId = asset.Sequence || asset.OriginalSequence || asset.SequenceNumber || `NoSequence_${index}`;

                    if (!groups[sequenceId]) {
                        groups[sequenceId] = [];
                    }
                    // Add original index for tracking
                    asset._originalIndex = index;
                    groups[sequenceId].push(asset);
                });

                this._logInfo(`Grouped ${assetMasters.length} assets into ${Object.keys(groups).length} sequence groups`);

                // Log group details
                Object.keys(groups).forEach(sequenceId => {
                    this._logInfo(`Sequence ${sequenceId}: ${groups[sequenceId].length} items`);
                });

                return groups;
            }

            /**
             * Process all sequence groups
             * @private
             */
            _processSequenceGroups(sequenceGroups, callbacks) {
                return new Promise((resolve) => {
                    const sequenceIds = Object.keys(sequenceGroups);

                    const processNextSequenceGroup = (sequenceIndex) => {
                        // Check if processing should be cancelled
                        if (this._isCancelled) {
                            this._logInfo("Processing cancelled by user");
                            this._isProcessing = false;
                            resolve(this._createFinalResult(true));
                            return;
                        }

                        // Check if all sequence groups are processed
                        if (sequenceIndex >= sequenceIds.length) {
                            this._logInfo("All sequence groups processed successfully");
                            this._isProcessing = false;
                            const result = this._createFinalResult();
                            if (callbacks.success) {
                                try {
                                    callbacks.success(result);
                                } catch (callbackError) {
                                    this._logError("Error in success callback", callbackError);
                                }
                            }
                            resolve(result);
                            return;
                        }

                        const currentSequenceId = sequenceIds[sequenceIndex];
                        const sequenceEntries = sequenceGroups[currentSequenceId];

                        this._logInfo(`Processing sequence group ${sequenceIndex + 1}/${sequenceIds.length}: ${currentSequenceId} with ${sequenceEntries.length} entries`);

                        // Notify batch start for this sequence group
                        if (callbacks.batchStart) {
                            try {
                                callbacks.batchStart(sequenceIndex + 1, sequenceIds.length);
                            } catch (error) {
                                this._logError("Error in batchStart callback", error);
                            }
                        }

                        // Process the current sequence group as a single batch
                        this._processSequenceBatch(sequenceEntries, currentSequenceId, sequenceIndex, callbacks)
                            .then(() => {
                                if (this._isCancelled) {
                                    processNextSequenceGroup(sequenceIds.length);
                                    return;
                                }
                                setTimeout(() => {
                                    processNextSequenceGroup(sequenceIndex + 1);
                                }, 300);
                            })
                            .catch(error => {
                                this._logError(`Error processing sequence group ${currentSequenceId}`, error);
                                if (this._isCancelled) {
                                    processNextSequenceGroup(sequenceIds.length);
                                    return;
                                }
                                setTimeout(() => {
                                    processNextSequenceGroup(sequenceIndex + 1);
                                }, 500);
                            });
                    };

                    processNextSequenceGroup(0);
                });
            }

            /**
             * Process a sequence batch using $direct method for individual requests
             * @private
             */
            _processSequenceBatch(sequenceEntries, sequenceId, sequenceIndex, callbacks) {
                this._logInfo(`Processing sequence batch: ${sequenceId} with ${sequenceEntries.length} entries using $direct`);

                return new Promise((resolve) => {
                    const processNextEntry = async (entryIndex) => {
                        // Check if processing should be cancelled
                        if (this._isCancelled) {
                            resolve();
                            return;
                        }

                        // Check if all entries in sequence are processed
                        if (entryIndex >= sequenceEntries.length) {
                            this._updateProgress(sequenceIndex, callbacks);
                            this._logInfo(`Completed sequence batch: ${sequenceId}`);
                            resolve();
                            return;
                        }

                        const entry = sequenceEntries[entryIndex];
                        const entryId = entry._originalIndex || entryIndex;

                        try {
                            // Process single asset master creation using $direct
                            const result = await this._processSingleAssetMasterCreation(entry);

                            if (result.success) {
                                this.successCount++;
                                this.successEntries.push({
                                    ...result.response,
                                    OriginalRequest: entry,
                                    OriginalSequence: sequenceId,
                                    Status: "Success",
                                    ProcessedAt: new Date().toISOString(),
                                    Message: result.message || `Asset master created successfully in sequence ${sequenceId}`,
                                    success: true
                                });
                            } else {
                                this.failureCount++;
                                this.failedRecords.push({
                                    entry: entry,
                                    error: result.error || "Unknown error occurred",
                                    details: result.details || result.error,
                                    originalSequence: sequenceId,
                                    errorCode: result.errorCode
                                });
                            }

                        } catch (error) {
                            this._logError(`Error processing entry ${entryId} in sequence ${sequenceId}`, error);
                            this.failureCount++;
                            this.failedRecords.push({
                                entry: entry,
                                error: ErrorUtils.extractErrorMessage(error) || "Unknown error occurred",
                                details: error.message,
                                originalSequence: sequenceId
                            });
                        }

                        // Process next entry with a small delay
                        setTimeout(() => {
                            processNextEntry(entryIndex + 1);
                        }, 100);
                    };

                    processNextEntry(0);
                });
            }

            /**
             * Process a single asset master creation using $direct method
             * @private
             */
            _processSingleAssetMasterCreation(assetEntry) {
                const entryId = assetEntry._originalIndex ?? assetEntry.SequenceNumber ?? "unknown";
                this._logInfo(`Processing asset master creation entry index ${entryId} using $direct (createCompleted EVENT LISTENER)`);

                return new Promise((resolve) => {
                    let context;
                    let listBinding;

                    const handleCreateCompleted = (oEvent) => {
                        this._logInfo(`createCompleted event triggered for index ${entryId}`, oEvent.getParameters());
                        const params = oEvent.getParameters();
                        const bSuccess = params.success;
                        const eventContext = params.context;

                        if (eventContext && context && (eventContext === context || eventContext.getPath() === context.getPath())) {
                            this._logInfo(`createCompleted event matched context for index ${entryId}`);

                            try {
                                // Extract message details for both success and error cases
                                const messageInfo = this._extractMessageDetailsFromEvent(params, entryId, eventContext);

                                if (bSuccess) {
                                    const response = context.getObject();
                                    this._logInfo(`Asset master creation index ${entryId} processed successfully.`, response);

                                    resolve({
                                        success: true,
                                        response: response,
                                        message: messageInfo.message,
                                        code: messageInfo.code,
                                        details: messageInfo.details,
                                        originalInput: assetEntry
                                    });
                                } else {
                                    resolve({
                                        success: false,
                                        error: messageInfo.message,
                                        errorCode: messageInfo.code,
                                        details: messageInfo.details,
                                        originalInput: assetEntry
                                    });
                                }
                            } catch (error) {
                                this._logError(`Error in handleCreateCompleted: ${error.message}`);
                                resolve({
                                    success: false,
                                    error: error.message || "Error during processing",
                                    errorCode: "PROCESSING_ERROR",
                                    details: { originalError: error },
                                    originalInput: assetEntry
                                });
                            }
                        } else {
                            this._logInfo(`createCompleted event ignored for index ${entryId} - Context mismatch`);
                        }
                    };

                    try {
                        // Transform the payload
                        const transformedPayload = this._dataTransformer.transformToODataFormat(assetEntry);
                        if (!transformedPayload) {
                            throw new Error(`Data transformation returned empty result for entry ${entryId}.`);
                        }
                        this._logInfo(`Payload for asset master creation index ${entryId}:`, transformedPayload);

                        // Create binding and context
                        listBinding = this._oModel.bindList(this._entityPath);
                        if (!listBinding) {
                            throw new Error(`Could not get list binding for path: ${this._entityPath}`);
                        }

                        // Clear previous messages before operation
                        Core.getMessageManager().removeAllMessages();
                        this._logInfo(`Cleared previous messages before creating context for ${entryId}.`);

                        // Attach createCompleted listener to the ListBinding
                        listBinding.attachEventOnce("createCompleted", handleCreateCompleted);
                        this._logInfo(`createCompleted listener attached ONCE to ListBinding for index ${entryId}`);

                        // Create context with $$updateGroupId: "$direct"
                        context = listBinding.create(transformedPayload, { $$updateGroupId: "$direct" });
                        if (!context) {
                            throw new Error(`Context creation failed synchronously for entry ${entryId}.`);
                        }
                        this._logInfo(`Context created for index ${entryId} with path ${context.getPath()}. Waiting for createCompleted event...`);

                    } catch (setupError) {
                        this._logError(`Synchronous setup error for index ${entryId}`, setupError);
                        if (listBinding) {
                            try {
                                listBinding.detachEvent("createCompleted", handleCreateCompleted);
                            } catch (e) {
                                // Ignore detach errors
                            }
                        }
                        resolve({
                            success: false,
                            error: setupError.message || "Setup failed",
                            errorCode: "SETUP_ERROR",
                            details: { originalError: setupError },
                            originalInput: assetEntry
                        });
                    }
                });
            }

            /**
             * Extract message details from createCompleted event
             * @private
             */
            _extractMessageDetailsFromEvent(eventParams, entryId, context) {
                this._logInfo(`_extractMessageDetailsFromEvent called for entry ${entryId}. Event Params:`, eventParams);

                try {
                    const isSuccess = eventParams.success;
                    let messageInfo;

                    if (isSuccess) {
                        // For success case, check for any success messages in the message manager first
                        const oMessageManager = Core.getMessageManager();
                        const allMessages = oMessageManager.getMessageModel().getData();
                        const contextPath = context.getPath();

                        const successMessages = allMessages.filter(msg =>
                            msg.getType() === 'Success' &&
                            Array.isArray(msg.getTargets()) &&
                            msg.getTargets().includes(contextPath)
                        );

                        if (successMessages.length > 0) {
                            const message = successMessages[0];
                            messageInfo = {
                                message: message.getMessage() || message.message || `Asset ${entryId} created successfully`,
                                code: message.getCode() || "SUCCESS",
                                details: {
                                    messages: successMessages,
                                    additionalText: message.getAdditionalText && message.getAdditionalText(),
                                    description: message.getDescription && message.getDescription(),
                                    target: message.getTarget && message.getTarget(),
                                    technical: message.getTechnical && message.getTechnical(),
                                    context: message.getFullTarget && message.getFullTarget()
                                }
                            };
                        } else {
                            // Check for response data in event parameters
                            const response = eventParams.response || (context && context.getObject && context.getObject());
                            if (response) {
                                messageInfo = {
                                    message: response.message ||
                                        (response.AssetNumber ?
                                            `Asset created successfully with Asset Number: ${response.AssetNumber}` :
                                            `Asset ${entryId} created successfully`),
                                    code: response.code || response.AssetNumber || "SUCCESS",
                                    details: {
                                        responseData: response,
                                        assetNumber: response.AssetNumber,
                                        companyCode: response.CompanyCode,
                                        assetClass: response.AssetClass,
                                        description: response.FixedAssetDescription,
                                        additionalInfo: {
                                            assetCapitalization: response.AssetIsForPostCapitalization,
                                            masterFixedAsset: response.MasterFixedAsset,
                                            fixedAsset: response.FixedAsset
                                        }
                                    }
                                };
                            } else {
                                messageInfo = {
                                    message: `Asset ${entryId} created successfully`,
                                    code: "SUCCESS",
                                    details: { context: context?.getPath() }
                                };
                            }
                        }
                    } else {
                        // For error case, use the ErrorHandler
                        messageInfo = this._errorHandler.extractODataError(eventParams);

                        // Enhance error information if possible
                        if (eventParams.response && eventParams.response.getObject) {
                            const responseData = eventParams.response.getObject();
                            messageInfo.details = messageInfo.details || {};
                            messageInfo.details.responseData = responseData;
                        }
                    }

                    this._logInfo(`_extractMessageDetailsFromEvent final result for entry ${entryId}: Message='${messageInfo.message}', Code='${messageInfo.code}'`);

                    // Clear messages after extraction in both cases
                    try {
                        const oMessageManager = Core.getMessageManager();
                        oMessageManager.removeAllMessages();
                        this._logInfo(`Removed ALL messages from manager for ${entryId}.`);
                    } catch (removeError) {
                        this._logError(`Error removing messages for ${entryId}:`, removeError);
                    }

                    return messageInfo;

                } catch (error) {
                    this._logError(`Error in _extractMessageDetailsFromEvent: ${error.message}`);
                    return {
                        message: eventParams.success ? `Asset ${entryId} created successfully` : "Processing failed (See logs/messages)",
                        code: eventParams.success ? "SUCCESS" : "PROCESSING_FAILED",
                        details: { originalError: error }
                    };
                }
            }

            /**
             * Update progress of batch processing
             * @private
             */
            _updateProgress(sequenceIndex, callbacks) {
                if (callbacks && callbacks.batchProgress && typeof callbacks.batchProgress === 'function') {
                    try {
                        const processedCount = this.successCount + this.failureCount;
                        callbacks.batchProgress(
                            sequenceIndex + 1,
                            this._totalBatches,
                            processedCount,
                            this.totalRecords
                        );
                    } catch (error) {
                        this._logError("Error in batchProgress callback", error);
                    }
                }
            }

            /**
             * Create final result object
             * @private
             */
            _createFinalResult(cancelled = false) {
                return {
                    cancelled: cancelled,
                    totalRecords: this.totalRecords,
                    successCount: this.successCount,
                    failureCount: this.failureCount,
                    successRecords: this.successEntries,
                    errorRecords: this.failedRecords,
                    successfulRecords: this.successEntries, // For compatibility
                    failedRecordsList: this.failedRecords    // For compatibility
                };
            }

            /**
             * Cancel the current batch processing
             */
            cancelBatchProcessing() {
                if (this._isProcessing) {
                    this._isCancelled = true;
                    this._logInfo("Cancellation requested for batch processing");
                    this._isProcessing = false;

                    return Promise.resolve({
                        cancelled: true,
                        totalRecords: this.totalRecords,
                        successCount: this.successCount,
                        failureCount: this.failureCount,
                        failedRecords: this.failedRecords,
                        successRecords: this.successEntries,
                        failedRecordsList: this.failedRecords,
                        successfulRecords: this.successEntries,
                        responseData: {
                            successItems: this.successCount,
                            errorItems: this.failedRecords
                        }
                    });
                }

                return Promise.resolve({
                    cancelled: false,
                    message: "No active processing to cancel"
                });
            }

            /**
             * Check if batch processing is currently running
             */
            isProcessing() {
                return this._isProcessing;
            }

            /**
             * Log info message to console
             * @private
             */
            _logInfo(message, details) {
                if (this._debugMode) {
                    console.log(`[ODataService] INFO: ${message}`, details !== undefined ? details : "");
                }
            }

            /**
             * Log warning message to console
             * @private
             */
            _logWarn(message, details) {
                console.warn(`[ODataService] WARN: ${message}`, details !== undefined ? details : "");
            }

            /**
             * Log error message to console
             * @private
             */
            _logError(message, error) {
                console.error(`[ODataService] ERROR: ${message}`, error !== undefined ? error : "");
            }
        };
    }
);