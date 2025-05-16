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
     * Optimized for purchase order operations
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

        // Configuration
        this._batchSize = 10;
        this._entityPath = "/PurchaseOrder";

        // Initialize instance variables
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

          // Only proceed if we have an OData v4 model
          if (oModel && oModel.getMetadata().getName() === "sap.ui.model.odata.v4.ODataModel") {
            // Store the original reportError function
            const originalReportError = oModel.reportError;

            // Override the reportError function to catch and handle entity refresh errors
            oModel.reportError = (sLogMessage, sReportingClassName, oError) => {
              // Check if this is a refresh error during processing
              if (this._preventEntityRefresh &&
                oError &&
                oError.message &&
                oError.message.includes("No key predicate known")) {

                // Log but swallow the error
                console.warn("Ignoring expected OData refresh error during batch processing:", oError.message);
                return;
              }

              // For all other errors, call the original function
              return originalReportError.call(oModel, sLogMessage, sReportingClassName, oError);
            };

            // Log successful initialization
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
        this._currentBatch = 0;
        this._totalBatches = 0;
        this._batchStartTime = null;
        this._preventEntityRefresh = false;
      }

      /**
       * Suspend OData operations to prevent issues during batch processing
       */
      suspendODataOperations() {
        try {
          // Get reference to the OData model
          const oModel = this._oModel;

          if (!oModel) return;

          // For v4 models - try to abort pending requests
          if (oModel.getMetadata().getName() === "sap.ui.model.odata.v4.ODataModel") {
            // Store current state to potentially restore later
            this._modelState = {
              autoRefresh: oModel.isAutoRefreshEnabled ? oModel.isAutoRefreshEnabled() : false
            };

            // Disable auto refresh
            if (oModel.setAutoRefreshEnabled) {
              oModel.setAutoRefreshEnabled(false);
            }

            // Try to suspend all operations
            if (oModel.suspend) {
              oModel.suspend();
            }

            // Set flag to prevent entity refresh errors
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
            // Restore auto refresh if it was enabled before
            if (this._modelState && oModel.setAutoRefreshEnabled) {
              oModel.setAutoRefreshEnabled(this._modelState.autoRefresh);
            }

            // Resume operations
            if (oModel.resume) {
              oModel.resume();
            }

            // Reset entity refresh prevention flag
            this._preventEntityRefresh = false;

            console.log("OData operations resumed");
          }
        } catch (error) {
          console.warn("Error resuming OData operations:", error);
        }
      }

      /**
       * Create purchase orders
       * @param {Array} purchaseOrders - Array of purchase order entries to create
       * @param {Object} callbacks - Callback functions for batch processing
       * @returns {Promise} Promise resolving with creation results
       */
      createPurchaseOrders(purchaseOrders, callbacks = {}) {
        // Validate input
        console.log("purchaseOrders", purchaseOrders);
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
          this._totalBatches = Math.ceil(purchaseOrders.length / this._batchSize);

          // Suspend OData operations
          this.suspendODataOperations();

          // Log start of processing
          this._logInfo(`Starting processing of ${this.totalRecords} purchase orders in ${this._totalBatches} batches`);

          // Process batches
          return this._processAllBatches(purchaseOrders, {
            batchStart: callbacks.batchStart || (() => { }),
            batchProgress: callbacks.batchProgress || (() => { }),
            success: (result) => {
              // Resume operations and reset state
              this.resumeODataOperations();
              this._isProcessing = false;

              // Call success callback
              if (callbacks.success) {
                callbacks.success(result);
              }
            },
            error: (error) => {
              // Resume operations and reset state
              this.resumeODataOperations();
              this._isProcessing = false;

              // Call error callback
              if (callbacks.error) {
                callbacks.error(error);
              }
            }
          });
        } catch (initError) {
          // Ensure operations are resumed and state is reset
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
       * Process all batches sequentially
       * @param {Array} purchaseOrders - Array of all purchase order entries
       * @param {Object} callbacks - Callback functions
       * @returns {Promise} Promise that resolves when all batches are processed
       * @private
       */
      _processAllBatches(purchaseOrders, callbacks) {
        return new Promise((resolve, reject) => {
          const processNextBatch = (batchIndex) => {
            // Check if processing should be cancelled - do this check first
            if (this._isCancelled) {
              this._logInfo("Processing cancelled by user");

              // Set processing flag to false
              this._isProcessing = false;

              // Return summarized result
              resolve({
                cancelled: true,
                totalRecords: this.totalRecords,
                successCount: this.successCount,
                failureCount: this.failureCount,
                successRecords: this.successEntries,
                errorRecords: this.failedRecords,
                successfulRecords: this.successEntries, // Add this for compatibility with both naming conventions
                failedRecordsList: this.failedRecords    // Add this for compatibility with both naming conventions
              });
              return;
            }

            // Check if all batches are processed
            if (batchIndex >= this._totalBatches) {
              this._logInfo("All batches processed successfully");

              // Set processing flag to false
              this._isProcessing = false;

              const result = {
                totalRecords: this.totalRecords,
                successCount: this.successCount,
                failureCount: this.failureCount,
                successRecords: this.successEntries,
                errorRecords: this.failedRecords,
                successfulRecords: this.successEntries, // Add this for compatibility with both naming conventions
                failedRecordsList: this.failedRecords    // Add this for compatibility with both naming conventions
              };

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

            // Calculate batch range
            const startIndex = batchIndex * this._batchSize;
            const endIndex = Math.min(startIndex + this._batchSize, purchaseOrders.length);
            const batchEntries = purchaseOrders.slice(startIndex, endIndex);

            // Notify batch start
            if (callbacks.batchStart) {
              try {
                callbacks.batchStart(batchIndex + 1, this._totalBatches);
              } catch (error) {
                this._logError("Error in batchStart callback", error);
              }
            }

            // Process the current batch
            this._processBatch(batchEntries, batchIndex, callbacks)
              .then(() => {
                // Check for cancellation again after each batch
                if (this._isCancelled) {
                  processNextBatch(this._totalBatches); // This will trigger the cancellation check above
                  return;
                }

                // Small delay before processing next batch to avoid UI freezing
                setTimeout(() => {
                  processNextBatch(batchIndex + 1);
                }, 300); // Increased delay for server recovery
              })
              .catch(error => {
                this._logError(`Error processing batch ${batchIndex}`, error);

                // Check for cancellation after error
                if (this._isCancelled) {
                  processNextBatch(this._totalBatches); // This will trigger the cancellation check above
                  return;
                }

                // Continue processing next batch despite errors
                setTimeout(() => {
                  processNextBatch(batchIndex + 1);
                }, 500); // Longer delay after error
              });
          };

          // Start processing from first batch
          processNextBatch(0);
        });
      }

      /**
       * Process a single batch of purchase order entries
       * @param {Array} batchEntries - Entries in the current batch
       * @param {number} batchIndex - Index of the current batch
       * @param {Object} callbacks - Callback functions
       * @returns {Promise} Promise that resolves when the batch is processed
       * @private
       */
      _processBatch(batchEntries, batchIndex, callbacks) {
        this._logInfo(`Processing batch ${batchIndex + 1}/${this._totalBatches} with ${batchEntries.length} entries`);

        return new Promise((resolve) => {
          // Process entries sequentially, one by one
          this._processEntryByEntrySequentially(batchEntries, batchIndex, callbacks)
            .then(results => {
              this._updateProgress(batchIndex, callbacks);
              this._logInfo(`Completed batch ${batchIndex + 1} of ${this._totalBatches}`);
              resolve(results);
            })
            .catch(error => {
              this._logError(`Error processing batch ${batchIndex + 1} sequentially`, error);
              this._updateProgress(batchIndex, callbacks);
              resolve({
                successEntries: [],
                failedRecords: batchEntries.map(entry => ({
                  entry: entry,
                  error: "Sequential processing failed: " + error.message,
                  details: ErrorUtils.extractErrorMessage(error),
                  originalSequence: entry.Sequence || "Unknown"
                }))
              });
            });
        });
      }

      /**
      * Process entries sequentially, one by one
      * @param {Array} batchEntries - Entries in the current batch
      * @param {number} batchIndex - Index of the current batch
      * @param {Object} callbacks - Callback functions
      * @returns {Promise} Promise that resolves when all entries are processed
      * @private
      */
      async _processEntryByEntrySequentially(batchEntries, batchIndex, callbacks) {

        const results = {
          successEntries: [],
          failedRecords: [],
          successfulRecords: [], // Add for compatibility
          failedRecordsList: []  // Add for compatibility
        };

        // Track if we had any errors
        let hasErrors = false;
        let processedCount = 0; // Track how many we've processed

        try {
          for (let i = 0; i < batchEntries.length; i++) {
            // Check if processing was canceled
            if (this._isCancelled) {
              this._logInfo("Processing canceled during sequential processing");
              break;
            }
            var originalSequence = batchEntries[i].Sequence || "Unknown";
            try {
              this._logInfo(`Processing entry ${i + 1} with sequence ${originalSequence}`);

              const result = await this._processEntry(batchEntries[i], i, batchIndex, callbacks);
              processedCount++; // Increment counter

              if (result.success) {
                results.successEntries.push(result.data);
                results.successfulRecords.push(result.data); // For compatibility
              } else {
                hasErrors = true;
                results.failedRecords.push(result.data);
                results.failedRecordsList.push(result.data); // For compatibility
              }

              // Add a delay between individual requests to avoid overwhelming the server
              if (i < batchEntries.length - 1) {
                await new Promise(resolve => setTimeout(resolve, 200));
              }
            } catch (error) {
              hasErrors = true;
              processedCount++; // Still count as processed             
              this._logError(`Error processing entry ${i} (Sequence: ${originalSequence}) in sequential mode`, error);

              const errorMessage = ErrorUtils.extractErrorMessage(error) || "Unknown error occurred during processing";
              const detailedError = error.response ?
                `${errorMessage}. Status: ${error.response.status}, ${error.response.statusText}` :
                errorMessage;

              const failedRecord = {
                entry: batchEntries[i],
                error: errorMessage,
                details: detailedError,
                originalSequence: originalSequence
              };

              this.failureCount++;
              this.failedRecords.push(failedRecord);
              results.failedRecords.push(failedRecord);
              results.failedRecordsList.push(failedRecord); // For compatibility

              this._callProgressCallback(batchIndex, callbacks);
            }
          }

          // Final progress update after all entries processed
          if (processedCount === batchEntries.length) {
            this._updateProgress(batchIndex, callbacks);
          }

          return results;
        } catch (error) {
          // Handle any unexpected errors in the loop itself
          this._logError("Unexpected error in batch processing", error);

          // Make sure we update model with what we managed to process
          this._updateProgress(batchIndex, callbacks);

          // Still return the partial results we collected
          return results;
        }
      }

      /**
      * Process a single purchase order entry
      * @param {Object} entry - Purchase order entry to process
      * @param {number} index - Index of the entry
      * @param {number} batchIndex - Index of the current batch
      * @param {Object} callbacks - Callback functions
      * @returns {Promise} Promise resolving with the result
      * @private
      */
      async _processEntry(entry, index, batchIndex, callbacks) {
        const that = this;
        const oModel = this._oModel;

        const sequenceId = entry.Sequence ||
          (typeof entry.id !== 'undefined' ? "Entry-" + entry.id : "Batch" + batchIndex + "-Item" + index);

        this._logInfo("Processing entry " + (index + 1) + " with sequence " + sequenceId);

        // IMPORTANT: Create a clean entry object that doesn't include our tracking properties
        const cleanEntry = jQuery.extend(true, {}, entry);
        delete cleanEntry.Sequence;

        // Verify model
        if (!oModel) {
          throw new Error("OData model is not initialized");
        }

        const listBinding = oModel.bindList(this._entityPath, null, null, null, { $count: true });

        const uniqueGroupId = `single_${batchIndex}_${index}_${Date.now()}`;

        return new Promise((resolve) => {
          let context;
          let resolved = false;

          const handleCreateCompleted = (event) => {
            const completedContext = event.getParameter("context");
            const success = event.getParameter("success");

            if (completedContext === context) {
              listBinding.detachCreateCompleted(handleCreateCompleted);

              if (success) {
                const responseData = context.getObject() || {};

                this.successCount++;
                this._logInfo(`Successfully created purchase order ${responseData.PurchaseOrder || index} (Sequence: ${sequenceId})`);

                var successRecord = {
                  ...responseData,
                  OriginalRequest: entry,
                  OriginalSequence: sequenceId,
                  Status: "Success",
                  ProcessedAt: new Date().toISOString(),
                  Message: `Purchase order created successfully`,
                  success: true
                };
                successRecord = that._ensureSequenceInfo(successRecord);
                this.successEntries.push(successRecord);
                this._callProgressCallback(batchIndex, callbacks);
                resolved = true;
                return resolve({ success: true, data: successRecord });
              } else {
                this.failureCount++;
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

                this._logError(`Backend rejected PO ${entry.PurchaseOrder || index} (Sequence: ${sequenceId})`);

                var failedRecord = {
                  entry: entry,
                  error: errorMessage,
                  details: technicalDetails || errorMessage,
                  originalSequence: sequenceId
                };
                failedRecord = that._ensureSequenceInfo(failedRecord);
                this.failedRecords.push(failedRecord);
                this._callProgressCallback(batchIndex, callbacks);
                resolved = true;
                return resolve({ success: false, data: failedRecord });
              }
            }
          };

          try {
            context = listBinding.create(cleanEntry, false, uniqueGroupId);
            listBinding.attachCreateCompleted(handleCreateCompleted);
            oModel.submitBatch(uniqueGroupId);
          } catch (error) {
            if (!resolved) {
              listBinding.detachCreateCompleted(handleCreateCompleted);
              this.failureCount++;
              const errorMessage = ErrorUtils.extractErrorMessage(error) || "Unknown error occurred";
              this._logError(`Exception creating purchase order ${entry.PurchaseOrder || index} (Sequence: ${sequenceId})`, error);

              const failedRecord = {
                entry: entry,
                error: errorMessage,
                details: errorMessage,
                originalSequence: sequenceId
              };

              this.failedRecords.push(failedRecord);
              this._callProgressCallback(batchIndex, callbacks);
              return resolve({ success: false, data: failedRecord });
            }
          }
        });
      }

      // Helper method to call the progress callback
      _callProgressCallback(batchIndex, callbacks) {
        if (callbacks && callbacks.batchProgress && typeof callbacks.batchProgress === 'function') {
          try {
            callbacks.batchProgress(
              batchIndex + 1,
              this._totalBatches,
              this.successCount + this.failureCount,
              this.totalRecords
            );
          } catch (error) {
            this._logError("Error in batchProgress callback", error);
          }
        }
      }

      /**
      * Update progress of batch processing
      * @param {number} batchIndex - Index of the current batch
      * @param {Object} callbacks - Callback functions
      * @private
      */
      _updateProgress(batchIndex, callbacks) {
        if (callbacks && callbacks.batchProgress && typeof callbacks.batchProgress === 'function') {
          try {
            // Calculate the processed count
            const processedCount = this.successCount + this.failureCount;

            callbacks.batchProgress(
              batchIndex + 1, // Make it 1-based for consistency with UI
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
      * Log info message to console
      * @param {string} message - Message to log
      * @private
      */
      _logInfo(message) {
        console.log(`[ODataService] ${message}`);
      }

      /**
      * Log error message to console
      * @param {string} message - Error message
      * @param {Error} [error] - Error object
      * @private
      */
      _logError(message, error) {
        console.error(`[ODataService] ${message}`, error || "");
      }

      /**
      * Ensure Sequence Information is preserved
      */
      _ensureSequenceInfo(record) {
        if (!record) return record;
        // Try to get sequence from various possible sources
        const sequence =
          record.Sequence ||
          (record.OriginalRequest && record.OriginalRequest.Sequence) ||
          (record.entry && record.entry.Sequence) ||
          "Unknown";

        // Explicitly set Sequence
        record.Sequence = sequence;

        // Also ensure the entry has the sequence if it exists
        if (record.entry) {
          record.entry.Sequence = sequence;
        }

        return record;
      }
      /**
      * Cancel the current batch processing
      */
      cancelBatchProcessing() {
        if (this._isProcessing) {
          this._isCancelled = true;
          this._logInfo("Cancellation requested for batch processing");

          // Update internal state
          this._isProcessing = false;

          // Return a promise that resolves with cancelled status
          return Promise.resolve({
            cancelled: true,
            totalRecords: this.totalRecords,
            successCount: this.successCount,
            failureCount: this.failureCount,
            failedRecords: this.failedRecords,
            successRecords: this.successEntries,
            failedRecordsList: this.failedRecords,  // Add for compatibility
            successfulRecords: this.successEntries, // Add for compatibility
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
      * @returns {boolean} True if processing is in progress
      */
      isProcessing() {
        return this._isProcessing;
      }
    };
  }
);