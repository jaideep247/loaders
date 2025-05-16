sap.ui.define(
  ["sap/m/MessageToast", "sap/m/MessageBox", "sap/ui/core/library"],
  function (MessageToast, MessageBox, coreLibrary) {
    "use strict";

    const MessageType = coreLibrary.MessageType;

    /**
     * @class ErrorHandler
     * @description Centralizes error handling, formatting, and display logic for Asset Retirement application.
     */
    return class ErrorHandler {
      /**
       * Creates an instance of ErrorHandler.
       * @param {object} [options] - Configuration options.
       */
      constructor(options = {}) {
        /** @protected */
        this._controller = options.controller || null;
        /** @protected */
        this._messageBox = options.messageBox || MessageBox;
        /** @protected */
        this._messageToast = options.messageToast || MessageToast;
      }

      // --- Public Methods for Displaying Messages ---

      /**
       * Shows an error message dialog using MessageBox.
       * @param {string|object|Error} error - The error to display.
       * @param {string} [title="Error"] - The title for the error dialog.
       * @param {boolean} [isBusinessError=false] - Flag for logging level.
       * @public
       */
      showError(error, title = "Error", isBusinessError = false) {
        let errorInfo;
        try {
          // Normalize the error first using the extraction logic
          errorInfo = this.extractODataError(error);
        } catch (extractionError) {
          // Catch errors during the normalization/extraction process itself
          console.error("ErrorHandler: Error during error normalization in showError:", extractionError);
          errorInfo = {
            code: "EXTRACTION_FAILED",
            message: "An error occurred while processing the error details.",
            details: [{ message: `Original error: ${JSON.stringify(error)}` }, { message: `Extraction error: ${extractionError.message}` }],
            originalError: error
          };
        }

        // Log the error
        if (isBusinessError) {
          console.warn(`ErrorHandler: Business Error Displayed: ${title} - ${errorInfo.message}`, errorInfo);
        } else {
          console.error(`ErrorHandler: Technical Error Displayed: ${title} - ${errorInfo.message}`, errorInfo);
        }

        // Prepare details for MessageBox display
        let messageBoxDetails = "";
        try {
          // Use the structured details array from errorInfo
          if (Array.isArray(errorInfo.details) && errorInfo.details.length > 0) {
            messageBoxDetails = errorInfo.details
              .map(d => {
                // Format each detail item consistently
                let detailMsg = typeof d === 'string' ? d : (d?.message || JSON.stringify(d));
                let detailCode = d?.code ? ` (${d.code})` : "";
                let detailTarget = d?.propertyref || d?.target ? ` [Target: ${d.propertyref || d.target}]` : "";
                let detailSeverity = d?.severity ? ` [Severity: ${d.severity}]` : "";
                return `- ${detailMsg}${detailCode}${detailTarget}${detailSeverity}`;
              })
              .join("\n");
          } else if (errorInfo.innererror) { // Fallback to inner error if no details formatted
            messageBoxDetails = `Inner Error:\n${JSON.stringify(errorInfo.innererror, null, 2)}`;
          }
        } catch (stringifyError) {
          console.error("ErrorHandler: Error stringifying details for MessageBox:", stringifyError);
          messageBoxDetails = "Could not display error details due to a processing issue.";
        }

        // Show MessageBox - make sure MessageBox is available
        if (this._messageBox) {
          this._messageBox.error(errorInfo.message || "An error occurred", {
            title: title,
            details: messageBoxDetails || "No further details available.",
            actions: [this._messageBox.Action.CLOSE]
          });
        } else {
          // Fallback if MessageBox is not available
          console.error("MessageBox not available. Error:", errorInfo.message);
          alert(`Error: ${errorInfo.message}`);
        }
      }

      /** Shows a short success message using MessageToast. */
      showSuccess(message) {
        if (message && typeof message === "string") {
          this._messageToast.show(message);
          console.log(`ErrorHandler: Success - ${message}`);
        } else {
          console.warn("ErrorHandler: showSuccess called with invalid message:", message);
        }
      }

      /** Shows a short warning message using MessageToast. */
      showWarning(message) {
        if (message && typeof message === "string") {
          this._messageToast.show(message);
          console.warn(`ErrorHandler: Warning - ${message}`);
        } else {
          console.warn("ErrorHandler: showWarning called with invalid message:", message);
        }
      }

      /** Shows a short information message using MessageToast. */
      showInfo(message) {
        if (message && typeof message === "string") {
          this._messageToast.show(message);
          console.info(`ErrorHandler: Info - ${message}`);
        } else {
          console.warn("ErrorHandler: showInfo called with invalid message:", message);
        }
      }

      /** 
       * Shows a confirmation dialog using MessageBox.
       * @param {string} message - Message to display
       * @param {string} [title="Confirmation"] - Dialog title
       * @param {function} [onConfirm] - Callback when confirmed
       * @param {function} [onCancel] - Callback when cancelled
       */
      showConfirmation(message, title = "Confirmation", onConfirm, onCancel) {
        if (!message || typeof message !== "string") {
          console.error("ErrorHandler: showConfirmation requires a valid message string.");
          return;
        }

        // FIX: Make sure MessageBox is available and properly reference it
        if (!this._messageBox) {
          console.error("MessageBox not available for confirmation dialog");
          // Optional fallback
          if (window.confirm && window.confirm(message)) {
            if (onConfirm && typeof onConfirm === "function") {
              onConfirm();
            }
          } else {
            if (onCancel && typeof onCancel === "function") {
              onCancel();
            }
          }
          return;
        }

        // Use proper reference to MessageBox
        this._messageBox.confirm(message, {
          title: title,
          actions: [this._messageBox.Action.YES, this._messageBox.Action.NO],
          emphasizedAction: this._messageBox.Action.YES,
          onClose: (action) => {
            if (action === this._messageBox.Action.YES) {
              if (onConfirm && typeof onConfirm === "function") {
                try {
                  onConfirm();
                } catch (e) {
                  console.error("ErrorHandler: Error in onConfirm callback:", e);
                  this.showError("An error occurred while processing the confirmation.", "Callback Error");
                }
              }
            } else { // Treat NO and closing the dialog as cancellation
              if (onCancel && typeof onCancel === "function") {
                try {
                  onCancel();
                } catch (e) {
                  console.error("ErrorHandler: Error in onCancel callback:", e);
                }
              }
            }
          }
        });
      }

      // --- Internal Helper for Parsing and Structuring ---

      /**
       * Parses a data object (from success or error) to find the primary message and details.
       * Prioritizes messages found within a 'details' or 'errordetails' array.
       * @param {object} dataObject - The parsed data object (e.g., response.data or error.error).
       * @returns {object} Normalized structure: { code, message, details (formatted array), innererror? }
       * @private
       */
      _parseAndStructureInfo(dataObject) {
        let code = "UNKNOWN";
        let message = "Operation status unknown.";
        let details = [];
        let innererror = null;

        if (!dataObject || typeof dataObject !== 'object') {
          return { code, message, details, innererror }; // Return default if input is invalid
        }

        // --- Extract top-level info ---
        code = dataObject.code || code; // Use provided code or default
        // Message can be string or object { value: "..." }
        let topLevelMessage = (dataObject.message && (typeof dataObject.message === "string" ? dataObject.message : dataObject.message.value)) || "";
        innererror = dataObject.innererror || null; // Capture inner error if present

        // --- Consolidate details array ---
        let detailsArray = [];
        if (dataObject.details && Array.isArray(dataObject.details)) {
          detailsArray = detailsArray.concat(dataObject.details);
        }
        // Check innererror structure as well (common in OData)
        if (innererror && innererror.errordetails && Array.isArray(innererror.errordetails)) {
          detailsArray = detailsArray.concat(innererror.errordetails);
        }

        // --- Determine Primary Message (Prioritize first detail message) ---
        message = topLevelMessage; // Start with top-level message
        let firstDetailMessage = "";
        let firstDetailCode = "";

        if (detailsArray.length > 0 && typeof detailsArray[0] === 'object' && detailsArray[0] !== null) {
          firstDetailMessage = detailsArray[0].message || "";
          firstDetailCode = detailsArray[0].code || "";
        } else if (detailsArray.length > 0 && typeof detailsArray[0] === 'string') {
          firstDetailMessage = detailsArray[0]; // Handle case where detail is just a string
        }

        // Use the first detail message if the top-level one is empty, generic, or potentially less specific
        // Customize generic checks based on typical backend responses
        const isGenericTopLevel = !message || message.includes("Error occurred") || message.includes("An error occurred") || message.includes("Operation completed");
        if (firstDetailMessage && isGenericTopLevel) {
          message = firstDetailMessage;
          // Use the detail code if available and more specific than the top-level one
          if (firstDetailCode && (code === "UNKNOWN" || code === "UNKNOWN_ODATA_ERROR" || code === "SUCCESS")) {
            code = firstDetailCode;
          }
        }

        // Fallback if message is still empty
        if (!message) {
          message = "No specific message provided.";
        }

        // --- Format the full details array ---
        if (detailsArray.length > 0) {
          details = detailsArray.map(detail => {
            if (typeof detail === 'string') {
              return { message: detail, code: '', propertyref: '', severity: 'information' }; // Treat string detail as info
            }
            return {
              code: detail.code || "",
              message: detail.message || JSON.stringify(detail), // Ensure message exists
              propertyref: detail.propertyref || detail.target || "", // Target field
              severity: detail.severity || "error" // Default severity to error if not specified
            };
          });
        }
        // If no details array, but innererror exists, add it as a detail for context
        else if (innererror && details.length === 0) {
          details.push({ message: `Inner Error: ${JSON.stringify(innererror)}`, code: 'INNER_ERROR', severity: 'error' });
        }

        return { code, message, details, innererror };
      }

      // --- Public Extraction Methods ---

      /**
       * Extracts and normalizes error information from various OData response formats.
       * @param {object|string} error - The error object or string.
       * @returns {object} Normalized error info: { code, message, details, innererror? }
       * @public
       */
      extractODataError(error) {
        let errorInfo = { // Default structure
          code: "UNKNOWN_ERROR",
          message: "An unknown error occurred during the operation.",
          details: [],
          innererror: null
        };

        try {
          // --- Handle V4 Message Manager (if applicable) ---
          if (error?.context?.oModel?.mMessages) {
            // ... (Keep existing V4 message manager extraction logic here) ...
            // If foundMessage, return the extracted info directly.
            const mMessages = error.context.oModel.mMessages;
            const sContextPath = error.context.getPath();
            let foundMessage = false;
            for (const sPath in mMessages) {
              if (mMessages.hasOwnProperty(sPath)) {
                const aMessages = mMessages[sPath];
                if (Array.isArray(aMessages) && aMessages.length > 0 && (sPath.includes(sContextPath) || sPath === "")) {
                  const oErrorMessage = aMessages.find(m => m.type === MessageType.Error);
                  const oMessage = oErrorMessage || aMessages[0];
                  if (oMessage?.message) {
                    // Use the message manager data directly as it's often well-structured
                    errorInfo.message = oMessage.message;
                    errorInfo.code = oMessage.code || "ODATA_MESSAGE_ERROR";
                    errorInfo.details = aMessages.map(m => ({
                      message: m.message, code: m.code, target: m.target, type: m.type,
                      processor: m.processor?.getMetadata().getName()
                    }));
                    foundMessage = true;
                    break;
                  }
                }
              }
            }
            if (foundMessage) return errorInfo;
          }

          // --- Parse Response Body / Error Object ---
          let errorData = null;
          let responseBody = null;

          if (error?.response) {
            responseBody = error.response.body || error.response.data || error.response.responseText || error.responseText;
          } else if (error?.responseText) {
            responseBody = error.responseText;
          } else if (error?.error) { // Already structured error object
            errorData = error;
          } else if (error?.message) { // Generic JS Error or simple object
            return { code: error.code || error.name || "GENERIC_ERROR", message: error.message, details: (Array.isArray(error.details) ? error.details.map(d => typeof d === 'string' ? { message: d } : d) : []), innererror: null };
          } else if (typeof error === "string") {
            return { code: "STRING_ERROR", message: error, details: [], innererror: null };
          } else {
            return errorInfo; // Return default if source unknown
          }

          // Parse responseBody if it's a string
          if (responseBody && typeof responseBody === "string") {
            try {
              // Basic JSON parsing (add batch/multipart handling if needed)
              errorData = JSON.parse(responseBody);
            } catch (parseError) {
              console.warn("ErrorHandler: Failed to parse error response body:", parseError, responseBody);
              return { code: "PARSE_ERROR", message: "Failed to parse error response from server.", details: [{ message: `Raw response snippet: ${responseBody.substring(0, 200)}...` }], innererror: null };
            }
          } else if (responseBody && typeof responseBody === 'object') {
            errorData = responseBody; // Already parsed (e.g., by axios)
          }

          // --- Extract using the helper ---
          if (errorData && errorData.error) {
            // Pass the inner 'error' object to the parser
            errorInfo = this._parseAndStructureInfo(errorData.error);
          } else if (errorData) {
            // If no standard '.error' property, try parsing the whole data object
            // This might occur with non-standard error responses
            console.warn("ErrorHandler: No standard '.error' property found in parsed error data. Attempting to parse top level.", errorData);
            errorInfo = this._parseAndStructureInfo(errorData);
            // If parsing the top level didn't yield a better message, indicate structure issue
            if (errorInfo.message === "Operation status unknown." || errorInfo.message === "No specific message provided.") {
              errorInfo.message = "Received error response, but structure is non-standard.";
              errorInfo.code = errorInfo.code === "UNKNOWN" ? "NON_STANDARD_ERROR" : errorInfo.code;
              // Add raw data as a detail if not already present
              if (!errorInfo.details.some(d => d.message.includes("Inner Error"))) {
                errorInfo.details.push({ message: `Raw Data: ${JSON.stringify(errorData)}` });
              }
            }
          }
          // else: errorInfo remains the default unknown error

        } catch (e) {
          console.error("ErrorHandler: Unexpected exception during OData error extraction:", e, error);
          // Return a structured error about the extraction failure
          return {
            code: "EXTRACTION_EXCEPTION",
            message: "Critical error during error message processing.",
            details: [{ message: e.message, stack: e.stack }],
            innererror: null
          };
        }

        return errorInfo;
      }

      /**
       * Extracts and normalizes success information from response data.
       * @param {object} response - The success response data.
       * @returns {object} Normalized info: { code, message, details }
       * @public
       */
      extractSuccessInfo(response) {
        let successInfo = { // Default structure
          code: "SUCCESS",
          message: "Operation completed successfully.",
          details: {} // Use object for success details by default
        };

        try {
          if (response && typeof response === 'object') {
            // Use the unified helper to parse the response object
            const parsedInfo = this._parseAndStructureInfo(response);

            // Adapt the parsed info for success structure
            successInfo.code = parsedInfo.code === "UNKNOWN" ? "SUCCESS" : parsedInfo.code; // Default to SUCCESS if code unknown
            successInfo.message = parsedInfo.message;

            // Structure details: If parsedInfo.details is an array, try to convert to key-value pairs
            // or just assign the response object. Customize as needed.
            if (Array.isArray(parsedInfo.details) && parsedInfo.details.length > 0) {
              // Example: just take the first detail message if relevant
              // successInfo.message = parsedInfo.details[0].message || successInfo.message;
              // Or store the array itself, or the original response
              successInfo.details = { parsedDetails: parsedInfo.details, originalResponse: response };
            } else {
              // If no details parsed, store the original response as details
              successInfo.details = response;
            }

            // --- Add Specific Fixed Asset Retirement Logic ---
            // Override generic message/code if specific fields are present
            if (response.FixedAssetPostingUUID) {
              successInfo.code = "ASSET_RETIREMENT_POSTED";
              successInfo.message = `Asset retirement posted with document no. ${response.FixedAssetPostingUUID}`;
              // Ensure key details are present
              successInfo.details = {
                documentNo: response.FixedAssetPostingUUID,
                companyCode: response.CompanyCode,
                masterFixedAsset: response.MasterFixedAsset,
                fixedAsset: response.FixedAsset,
                amount: response.AstRtrmtAmtInTransCrcy,
                currency: response.FxdAstRetirementTransCrcy,
                retirementType: response.FixedAssetRetirementType,
                ...(typeof successInfo.details === 'object' ? successInfo.details : {}) // Merge existing details if object
              };
            } else if (response.AccountingDocumentHeaderText && successInfo.message === "Operation completed successfully.") {
              // Use header text if no posting UUID and message is generic
              successInfo.message = response.AccountingDocumentHeaderText;
            }
            // --- End Specific Logic ---

          }
        } catch (e) {
          console.error("ErrorHandler: Unexpected exception during success info extraction:", e);
          return {
            code: "SUCCESS_EXTRACTION_ERROR",
            message: "Operation succeeded but details extraction failed",
            details: { extractionError: e.message, originalResponse: response }
          };
        }

        return successInfo;
      }

      /**
       * Formats raw validation errors into a consistent structure and removes duplicates.
       * @param {Array<string|object>} errors - Array of raw validation error items.
       * @returns {Array<object>} Array of unique, formatted error objects.
       * @public
       */
      formatValidationErrors(errors) {
        if (!errors || !Array.isArray(errors) || errors.length === 0) {
          return [];
        }

        const formattedErrors = errors.map((error, index) => {
          if (typeof error === "object" && error !== null) {
            let message = error.message || error.Message || error.text || error.description || "";
            if (!message && error.toString() === "[object Object]") {
              message = error.field ? `Validation error in field '${error.field}'` : `Unknown validation error object (Row ${index + 1})`;
            }
            else if (!message) {
              message = `Unknown error object (Row ${index + 1}): ${JSON.stringify(error)}`;
            }
            return {
              ...error,
              message: String(message),
              sequenceId: error.sequenceId || error.SequenceNumber || error.seqId || error.entryIdentifier || "N/A",
              field: error.field || error.Field || error.propertyref || error.target || "Unknown"
            };
          } else if (typeof error === "string" && error.trim() !== "") {
            return { message: error, sequenceId: "N/A", field: "Unknown" };
          }
          else {
            console.warn(`ErrorHandler: Invalid error item at index ${index}:`, error);
            return { message: `Invalid error item found at row ${index + 1}.`, sequenceId: "N/A", field: "Invalid Data" };
          }
        }).filter(e => e && e.message);

        const uniqueErrorsMap = new Map();
        formattedErrors.forEach(error => {
          const key = `${error.sequenceId}-${error.field}-${error.message}`;
          if (!uniqueErrorsMap.has(key)) {
            uniqueErrorsMap.set(key, error);
          }
        });

        return Array.from(uniqueErrorsMap.values());
      }

      /**
       * Creates a standardized message object structure.
       * @param {string} [type="info"] - 'success', 'error', 'info', 'warning'.
       * @param {string} [code] - Application-specific message code.
       * @param {string} [message] - The main message text.
       * @param {any} [details=""] - Additional details (object, array, string).
       * @param {string} [source="Application"] - The source component.
       * @param {string} [entityId=""] - ID of a related business entity.
       * @param {number|string} [batchIndex=""] - Index if part of a batch.
       * @returns {object} A standardized message object.
       * @public
       */
      createStandardMessage(type = "info", code, message, details = "", source = "Application", entityId = "", batchIndex = "") {
        const messageType = String(type).toLowerCase();
        let defaultCode = "INFO";
        let defaultMessage = "Operation processed.";
        if (messageType === "success") { defaultCode = "SUCCESS"; defaultMessage = "Operation successful."; }
        else if (messageType === "error") { defaultCode = "ERROR"; defaultMessage = "Operation failed."; }
        else if (messageType === "warning") { defaultCode = "WARNING"; defaultMessage = "Operation completed with warnings."; }

        return {
          type: messageType,
          code: code || defaultCode,
          message: message || defaultMessage,
          details: details, // Keep details as passed
          timestamp: new Date().toISOString(),
          source: source,
          entityId: entityId,
          batchIndex: batchIndex
        };
      }
    }; // End of class ErrorHandler
  }
);