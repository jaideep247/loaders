sap.ui.define(
  [
    "sap/ui/model/odata/v4/ODataModel",
    "sap/ui/model/json/JSONModel",
    "sap/m/MessageBox",
    "sap/ui/core/BusyIndicator",
    "sap/ui/model/Filter",
    "sap/ui/model/FilterOperator",
    "sap/m/MessageToast",
    "purchaseorder/utils/ErrorUtils"
  ],
  function (
    ODataModel,
    JSONModel,
    MessageBox,
    BusyIndicator,
    Filter,
    FilterOperator,
    MessageToast,
    ErrorUtils
  ) {
    "use strict";

    /**
     * ODataService class for handling communication with OData services
     * Optimized for purchase order operations with sequence-based grouping
     */
    return class ODataService {
      /**
       * Constructor for ODataService
       * @param {sap.ui.model.odata.v4.ODataModel} oModel - OData v4 model
       */
      constructor(oModel) {
        if (!oModel) {
          throw new Error("OData model is required");
        }

        // Check if the model is a valid OData v4 model
        const modelName = oModel.getMetadata ? oModel.getMetadata().getName() : null;
        if (modelName !== "sap.ui.model.odata.v4.ODataModel") {
          throw new Error(`Invalid OData model type. Expected sap.ui.model.odata.v4.ODataModel, got ${modelName}`);
        }

        this._oModel = oModel;
        this._entityPath = "/PurchaseOrder";
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
       * Create purchase orders grouped by sequence ID
       * @param {Array} purchaseOrders - Array of purchase order entries to create
       * @param {Object} callbacks - Callback functions for batch processing
       * @returns {Promise} Promise resolving with creation results
       */
      createPurchaseOrders(purchaseOrders, callbacks = {}) {
        // Validate input
        if (!purchaseOrders || !Array.isArray(purchaseOrders) || purchaseOrders.length === 0) {
          const error = new Error("Valid purchase order entries array is required");
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
          this.totalRecords = purchaseOrders.length;
          this._batchStartTime = new Date();

          // Group by sequence ID (using OriginalSequence for grouping)
          const sequenceGroups = this._groupBySequenceId(purchaseOrders);
          this._totalBatches = Object.keys(sequenceGroups).length;

          // Suspend OData operations
          this.suspendODataOperations();

          this._logInfo(`Starting processing of ${this.totalRecords} purchase orders grouped into ${this._totalBatches} sequence batches`);

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
       * Group purchase orders by sequence ID using OriginalSequence for grouping
       * @private
       */
      _groupBySequenceId(purchaseOrders) {
        const groups = {};

        purchaseOrders.forEach((order, index) => {
          // Use OriginalSequence for grouping, fallback to Sequence, then generate unique ID
          const sequenceId = order.OriginalSequence || order.Sequence || `NoSequence_${index}`;

          if (!groups[sequenceId]) {
            groups[sequenceId] = [];
          }
          groups[sequenceId].push(order);
        });

        this._logInfo(`Grouped ${purchaseOrders.length} orders into ${Object.keys(groups).length} sequence groups`);

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
       * Process a sequence batch
       * @private
       */
      _processSequenceBatch(sequenceEntries, sequenceId, sequenceIndex, callbacks) {
        this._logInfo(`Processing sequence batch: ${sequenceId} with ${sequenceEntries.length} entries`);

        return new Promise((resolve) => {
          this._processSequenceEntriesAsBatch(sequenceEntries, sequenceId, callbacks)
            .then(results => {
              this._updateProgress(sequenceIndex, callbacks);
              this._logInfo(`Completed sequence batch: ${sequenceId}`);
              resolve(results);
            })
            .catch(error => {
              this._logError(`Error processing sequence batch ${sequenceId}`, error);
              this._updateProgress(sequenceIndex, callbacks);

              // Mark all entries as failed
              sequenceEntries.forEach(entry => {
                const failedRecord = {
                  entry: entry,
                  error: "Sequence batch processing failed: " + error.message,
                  details: ErrorUtils.extractErrorMessage(error),
                  originalSequence: entry.OriginalSequence || entry.Sequence || "Unknown"
                };
                this.failureCount++;
                this.failedRecords.push(failedRecord);
              });

              resolve();
            });
        });
      }

      /**
       * Process sequence entries as a single batch
       * @private
       */
      async _processSequenceEntriesAsBatch(sequenceEntries, sequenceId, callbacks) {
        const oModel = this._oModel;
        if (!oModel) {
          throw new Error("OData model is not initialized");
        }

        const listBinding = oModel.bindList(this._entityPath, null, null, null, { $count: true });
        const uniqueGroupId = `sequence_${sequenceId}_${Date.now()}`;

        this._logInfo(`Creating batch for sequence ${sequenceId} with group ID: ${uniqueGroupId}`);

        try {
          const contextPromises = [];

          sequenceEntries.forEach((entry, index) => {
            if (this._isCancelled) {
              return;
            }

            // Create a clean entry object for OData (remove tracking fields)
            const cleanEntry = this._prepareODataPayload(entry);

            try {
              const context = listBinding.create(cleanEntry, false, uniqueGroupId);

              const contextPromise = new Promise((resolve) => {
                const handleCreateCompleted = (event) => {
                  const completedContext = event.getParameter("context");
                  const success = event.getParameter("success");

                  if (completedContext === context) {
                    listBinding.detachCreateCompleted(handleCreateCompleted);
                  
                    if (success) {
                      const responseData = context.getObject() || {};
                      const successRecord = {
                        ...responseData,
                        OriginalRequest: entry,
                        OriginalSequence: entry.OriginalSequence || entry.Sequence || sequenceId,
                        Status: "Success",
                        ProcessedAt: new Date().toISOString(),
                        Message: `Purchase order ${responseData.PurchaseOrder} created successfully in sequence ${sequenceId}`,
                        success: true
                      };

                      this.successCount++;
                      this.successEntries.push(successRecord);
                      resolve({ success: true });
                    } else {
                      const messages = sap.ui.getCore().getMessageManager().getMessageModel().getData();
                      let errorMessage = "Backend validation failed or rejected the creation";
                      let technicalDetails = "";

                      if (messages && messages.length > 0) {
                        const relevantMsg = messages.find(m =>
                          m.getTarget?.().includes(entry.PurchaseOrder || "") ||
                          m.getMessageType() === "Error");

                        if (relevantMsg) {
                          errorMessage = relevantMsg.message || errorMessage;
                          technicalDetails = relevantMsg.getTechnicalDetails?.()?.error?.message || errorMessage;
                        }
                      }

                      const failedRecord = {
                        entry: entry,
                        error: errorMessage,
                        details: technicalDetails || errorMessage,
                        originalSequence: entry.OriginalSequence || entry.Sequence || sequenceId
                      };

                      this.failureCount++;
                      this.failedRecords.push(failedRecord);
                      resolve({ success: false });
                    }
                  }
                };

                listBinding.attachCreateCompleted(handleCreateCompleted);
              });

              contextPromises.push(contextPromise);
            } catch (error) {
              this._logError(`Error creating context for entry in sequence ${sequenceId}`, error);
              const failedRecord = {
                entry: entry,
                error: ErrorUtils.extractErrorMessage(error) || "Unknown error occurred",
                details: error.message,
                originalSequence: entry.OriginalSequence || entry.Sequence || sequenceId
              };

              this.failureCount++;
              this.failedRecords.push(failedRecord);
            }
          });

          // Submit the batch for this sequence
          if (contextPromises.length > 0) {
            this._logInfo(`Submitting batch for sequence ${sequenceId} with ${contextPromises.length} entries`);
            oModel.submitBatch(uniqueGroupId);
            await Promise.all(contextPromises);
          }

          this._logInfo(`Sequence ${sequenceId} processed: ${this.successCount} total success, ${this.failureCount} total failed`);

        } catch (error) {
          this._logError(`Error processing sequence batch ${sequenceId}`, error);

          // Mark all entries as failed
          sequenceEntries.forEach(entry => {
            const failedRecord = {
              entry: entry,
              error: "Sequence batch submission failed: " + error.message,
              details: ErrorUtils.extractErrorMessage(error),
              originalSequence: entry.OriginalSequence || entry.Sequence || sequenceId
            };

            this.failureCount++;
            this.failedRecords.push(failedRecord);
          });
        }
      }

      /**
       * Prepare OData payload by removing tracking fields that shouldn't be sent to the API
       * @param {Object} entry - Purchase order entry with tracking fields
       * @returns {Object} Clean purchase order entry for OData API
       * @private
       */
      _prepareODataPayload(entry) {
        if (!entry) {
          return null;
        }

        // Create a deep copy to avoid modifying the original
        const cleanEntry = jQuery.extend(true, {}, entry);

        // Remove tracking fields that shouldn't be sent to OData API
        delete cleanEntry.Sequence;
        delete cleanEntry.OriginalSequence;
        delete cleanEntry.Status;
        delete cleanEntry.Message;
        delete cleanEntry.ErrorMessage;
        delete cleanEntry.ValidationErrors;
        delete cleanEntry.ProcessedAt;
        delete cleanEntry.OriginalRequest;

        return cleanEntry;
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
       * Create final result object with preserved original sequence information
       * @private
       */
      _createFinalResult(cancelled = false) {
        // Ensure all success and failure records include OriginalSequence for tracking
        const enrichedSuccessRecords = this.successEntries.map(record => ({
          ...record,
          OriginalSequence: record.OriginalSequence || record.OriginalRequest?.OriginalSequence || record.OriginalRequest?.Sequence
        }));

        const enrichedFailedRecords = this.failedRecords.map(record => ({
          ...record,
          OriginalSequence: record.originalSequence || record.entry?.OriginalSequence || record.entry?.Sequence
        }));

        return {
          cancelled: cancelled,
          totalRecords: this.totalRecords,
          successCount: this.successCount,
          failureCount: this.failureCount,
          successRecords: enrichedSuccessRecords,
          errorRecords: enrichedFailedRecords,
          successfulRecords: enrichedSuccessRecords, // For compatibility
          failedRecordsList: enrichedFailedRecords    // For compatibility
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

          // Ensure original sequence is preserved in cancellation response
          const enrichedSuccessRecords = this.successEntries.map(record => ({
            ...record,
            OriginalSequence: record.OriginalSequence || record.OriginalRequest?.OriginalSequence || record.OriginalRequest?.Sequence
          }));

          const enrichedFailedRecords = this.failedRecords.map(record => ({
            ...record,
            OriginalSequence: record.originalSequence || record.entry?.OriginalSequence || record.entry?.Sequence
          }));

          return Promise.resolve({
            cancelled: true,
            totalRecords: this.totalRecords,
            successCount: this.successCount,
            failureCount: this.failureCount,
            failedRecords: enrichedFailedRecords,
            successRecords: enrichedSuccessRecords,
            failedRecordsList: enrichedFailedRecords,
            successfulRecords: enrichedSuccessRecords,
            responseData: {
              successItems: this.successCount,
              errorItems: enrichedFailedRecords
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
      _logInfo(message) {
        console.log(`[ODataService] ${message}`);
      }

      /**
       * Log error message to console
       * @private
       */
      _logError(message, error) {
        console.error(`[ODataService] ${message}`, error || "");
      }
    };
  }
);