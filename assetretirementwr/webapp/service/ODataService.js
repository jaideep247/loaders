sap.ui.define([
  "sap/ui/model/odata/v4/ODataModel",
  "sap/ui/core/format/DateFormat",
  "sap/ui/core/Core",
  "sap/ui/model/odata/v4/Context",
  "sap/ui/core/message/Message"
], function (ODataModel, DateFormat, Core, Context, Message) {
  "use strict";

  return {
    /**
     * Factory function to create an ODataService instance for Fixed Asset Retirement.
     * @param {object} options - Configuration options.
     * @param {sap.ui.model.odata.v4.ODataModel} options.model - The OData V4 model instance.
     * @param {object} options.dataTransformer - Instance of the DataTransformer utility.
     * @param {object} options.errorHandler - Instance of the ErrorHandler utility.
     * @returns {object} The ODataService instance with public methods.
     */
    create: function (options) {
      if (!options || !options.model || !options.dataTransformer || !options.errorHandler) {
        throw new Error("ODataService requires model, dataTransformer and errorHandler");
      }

      // --- Private Variables ---
      const _oModel = options.model;
      const _dataTransformer = options.dataTransformer;
      const _errorHandler = options.errorHandler;
      let _debugMode = true; // Control internal logging
      const _entitySetPath = "/FixedAssetRetirement/SAP__self.Post"; // Action Import Path
      const _dateFormatter = DateFormat.getDateInstance({ pattern: "yyyy-MM-dd" });

      // --- Private Methods ---
      function _logInfo(message, details) {
        if (_debugMode) {
          console.log(`[ODataService] INFO: ${message}`, details !== undefined ? details : "");
        }
      }
      function _logWarn(message, details) {
        console.warn(`[ODataService] WARN: ${message}`, details !== undefined ? details : "");
      }
      function _logError(message, error) {
        console.error(`[ODataService] ERROR: ${message}`, error !== undefined ? error : "");
      }

      /**
       * Extracts message details when createCompleted event fires.
       * Works for both success and error cases.
       * @param {object} eventParams - The parameters object from the createCompleted event.
       * @param {string} entryId - Identifier for logging.
       * @param {sap.ui.model.odata.v4.Context} context - The context associated with the event.
       * @returns {{message: string, code: string, details: object}}
       * @private
       */
      function _extractMessageDetailsFromEvent(eventParams, entryId, context) {
        _logInfo(`_extractMessageDetailsFromEvent called for entry ${entryId}. Event Params:`, eventParams);

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
              // Extract message details similar to error handling
              const message = successMessages[0];
              messageInfo = {
                message: message.getMessage() || message.message || `Record ${entryId} processed successfully`,
                code: message.getCode() || "SUCCESS",
                details: {
                  messages: successMessages,
                  // Extract additional information from the message
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
                // Extract comprehensive success information similar to error handling
                messageInfo = {
                  message: response.message ||
                    response.AccountingDocumentHeaderText ||
                    (response.FixedAssetPostingUUID ?
                      `Asset retirement posted with document no. ${response.FixedAssetPostingUUID}` :
                      `Record ${entryId} processed successfully`),
                  code: response.code || response.FixedAssetPostingUUID || "SUCCESS",
                  details: {
                    responseData: response,
                    documentNumber: response.FixedAssetPostingUUID,
                    companyCode: response.CompanyCode,
                    masterFixedAsset: response.MasterFixedAsset,
                    fixedAsset: response.FixedAsset,
                    amount: response.AstRtrmtAmtInTransCrcy,
                    currency: response.FxdAstRetirementTransCrcy,
                    additionalInfo: {
                      referenceDocument: response.ReferenceDocument,
                      headerText: response.AccountingDocumentHeaderText,
                      itemText: response.DocumentItemText,
                      retirementType: response.FixedAssetRetirementType
                    }
                  }
                };
              } else {
                // Default success message
                messageInfo = {
                  message: `Record ${entryId} processed successfully`,
                  code: "SUCCESS",
                  details: { context: context?.getPath() }
                };
              }
            }
          } else {
            // For error case, use the ErrorHandler with similar detailed extraction
            messageInfo = _errorHandler.extractODataError(eventParams);

            // Enhance error information if possible
            if (eventParams.response && eventParams.response.getObject) {
              const responseData = eventParams.response.getObject();
              messageInfo.details = messageInfo.details || {};
              messageInfo.details.responseData = responseData;
            }
          }

          _logInfo(`_extractMessageDetailsFromEvent final result for entry ${entryId}: Message='${messageInfo.message}', Code='${messageInfo.code}'`);

          // Clear messages after extraction in both cases
          try {
            const oMessageManager = Core.getMessageManager();
            oMessageManager.removeAllMessages();
            _logInfo(`DEBUG (ExtractMessageDetails): Removed ALL messages from manager for ${entryId}.`);
          } catch (removeError) {
            _logError(`DEBUG (ExtractMessageDetails): Error removing messages for ${entryId}:`, removeError);
          }

          return messageInfo;

        } catch (error) {
          _logError(`Error in _extractMessageDetailsFromEvent: ${error.message}`);
          return {
            message: eventParams.success ? `Record ${entryId} processed successfully` : "Processing failed (See logs/messages)",
            code: eventParams.success ? "SUCCESS" : "PROCESSING_FAILED",
            details: { originalError: error }
          };
        }
      }

      // --- Public API ---
      return {
        setDebugMode: function (enable) {
          _debugMode = Boolean(enable);
          _logInfo(`Debug mode ${_debugMode ? 'enabled' : 'disabled'}`);
        },

        /**
         * Processes a single fixed asset retirement record using an individual POST request ($direct).
         * Uses createCompleted event listener on the ListBinding.
         * @param {Object} assetEntry - The fixed asset retirement entry to process.
         * @returns {Promise<object>} Resolves with { success: boolean, response?: object, error?: string, errorCode?: string, details?: object, originalInput: object }
         */
        processSingleFixedAssetRetirement: function (assetEntry) {
          const entryId = assetEntry?._originalIndex ?? "unknown";
          _logInfo(`Processing retirement entry index ${entryId} using $direct (createCompleted EVENT LISTENER)`);
    
          return new Promise((resolve) => {
            let context;
            let listBinding;

            const handleCreateCompleted = (oEvent) => {
              console.log("DEBUG: handleCreateCompleted called for entry", entryId);
              _logWarn(`createCompleted event triggered for index ${entryId}`, oEvent.getParameters());
              const params = oEvent.getParameters();
              const bSuccess = params.success;
              const eventContext = params.context;

              console.log("DEBUG: Event context exists:", !!eventContext);
              console.log("DEBUG: Created context exists:", !!context);
              console.log("DEBUG: Event context path:", eventContext?.getPath());
              console.log("DEBUG: Created context path:", context?.getPath());
              console.log("DEBUG: Context comparison result:", eventContext === context || eventContext?.getPath() === context?.getPath());

              if (eventContext && context && (eventContext === context || eventContext.getPath() === context.getPath())) {
                console.log("DEBUG: Context matched - proceeding with message extraction");
                _logInfo(`createCompleted event matched context for index ${entryId}`);

                try {
                  // Extract message details for both success and error cases
                  console.log("DEBUG: Before _extractMessageDetailsFromEvent");
                  const messageInfo = _extractMessageDetailsFromEvent(params, entryId, eventContext);
                  console.log("DEBUG: After _extractMessageDetailsFromEvent, messageInfo:", messageInfo);

                  if (bSuccess) {
                    console.log("DEBUG: Success branch - getting response object");
                    const response = context.getObject();
                    console.log("DEBUG: Response object:", response);
                    _logInfo(`Record index ${entryId} retirement processed successfully.`, response);

                    console.log("DEBUG: About to resolve with success");
                    resolve({
                      success: true,
                      response: response,
                      message: messageInfo.message,
                      code: messageInfo.code,
                      details: messageInfo.details,
                      originalInput: assetEntry
                    });
                    console.log("DEBUG: Resolve called for success");
                  } else {
                    console.log("DEBUG: Error branch - about to resolve");
                    resolve({
                      success: false,
                      error: messageInfo.message,
                      errorCode: messageInfo.code,
                      details: messageInfo.details,
                      originalInput: assetEntry
                    });
                    console.log("DEBUG: Resolve called for error");
                  }
                } catch (error) {
                  console.error("DEBUG: Error during message extraction or resolution:", error);
                  _logError(`Error in handleCreateCompleted: ${error.message}`);
                  resolve({
                    success: false,
                    error: error.message || "Error during processing",
                    errorCode: "PROCESSING_ERROR",
                    details: { originalError: error },
                    originalInput: assetEntry
                  });
                }
              } else {
                console.log("DEBUG: Context mismatch - event will be ignored");
                console.log("DEBUG: Event context:", eventContext);
                console.log("DEBUG: Created context:", context);
                _logWarn(`createCompleted event ignored for index ${entryId} - Context mismatch?`);
              }
            };
    
            try {
              // --- Transformation ---
              // If you want to transform multiple entries, you can map the array
              const transformedPayload = _dataTransformer.transformFixedAssetRetirementToOData(assetEntry);
              const oDataPayload = transformedPayload;
              if (!oDataPayload) {
                throw new Error(`Data transformation returned empty result for entry ${entryId}.`);
              }
              _logInfo(`Payload for retirement index ${entryId}:`, oDataPayload);

              // --- Binding & Context ---
              listBinding = _oModel.bindList(_entitySetPath);
              if (!listBinding) {
                throw new Error(`Could not get list binding for path: ${_entitySetPath}`);
              }
              // Clear previous messages before operation
              Core.getMessageManager().removeAllMessages();
              _logInfo(`Cleared previous messages before creating context for ${entryId}.`);

              // *** Attach createCompleted listener to the ListBinding ***
              listBinding.attachEventOnce("createCompleted", handleCreateCompleted);
              _logInfo(`createCompleted listener attached ONCE to ListBinding for index ${entryId}`);

              // *** Create context with $$updateGroupId: "$direct" ***
              context = listBinding.create(oDataPayload, { $$updateGroupId: "$direct" });
              if (!context) {
                throw new Error(`Context creation failed synchronously for entry ${entryId}.`);
              }
              _logInfo(`Context created for index ${entryId} with path ${context.getPath()}. Waiting for createCompleted event...`);

            } catch (setupError) {
              _logError(`Synchronous setup error for index ${entryId}`, setupError);
              if (listBinding) {
                try { listBinding.detachEvent("createCompleted", handleCreateCompleted); } catch (e) { }
              }
              resolve({
                success: false,
                error: setupError.message || "Setup failed",
                errorCode: "SETUP_ERROR",
                details: { originalError: setupError },
                originalInput: assetEntry
              });
            }
          }); // End of new Promise
        }, // End of processSingleFixedAssetRetirement

        cancelBatchProcessing: function () {
          _logWarn("ODataService: Cancellation logic called, but not applicable for $direct requests.");
        }

      }; // End of public API return
    } // End of create function
  }; // End of returned object
});