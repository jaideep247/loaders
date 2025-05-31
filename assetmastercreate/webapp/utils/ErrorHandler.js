sap.ui.define([
  "sap/m/MessageToast",
  "sap/m/MessageBox"
], function (MessageToast, MessageBox) {
  "use strict";

  /**
   * @class ErrorHandler
   * @description Centralizes error handling and display logic (MessageBox, MessageToast)
   * across the application. Focused solely on error management and user messaging.
   */
  return class ErrorHandler {
    /**
     * Creates an instance of ErrorHandler.
     * @param {object} [options] - Configuration options.
     * @param {sap.m.MessageBox} [options.messageBox=sap.m.MessageBox] - MessageBox implementation (for testing).
     * @param {sap.m.MessageToast} [options.messageToast=sap.m.MessageToast] - MessageToast implementation (for testing).
     */
    constructor(options = {}) {
      /** @protected */
      this.messageBox = options.messageBox || MessageBox;
      /** @protected */
      this.messageToast = options.messageToast || MessageToast;
    }

    /**
     * Shows an error message dialog using MessageBox.
     * Automatically attempts to parse OData errors and format details.
     *
     * @param {string|object|Error} error - The error to display. Can be a string, a generic object/Error,
     * or an OData error object (it will attempt extraction).
     * @param {string} [title="Error"] - The title for the error dialog.
     * @param {boolean} [isBusinessError=false] - Flag to indicate if this is a known business/validation error
     * (affects console logging level).
     * @public
     */
    showError(error, title = "Error", isBusinessError = false) {
      let errorInfo;

      // --- 1. Normalize Error Input ---
      try {
        if (typeof error === "string") {
          // Simple string error
          errorInfo = { code: "GENERIC_ERROR", message: error, details: [] };
        } else if (error && typeof error === 'object') {
          // Check if it looks like a raw OData error needing parsing (heuristic)
          const looksLikeOData = error.response || // Often indicates HTTP layer error
            (error.error && error.error.innererror) || // Common OData V2 structure
            (error.code && error.message && Array.isArray(error.details)) || // Common OData V4 structure
            (error.responseText && typeof error.responseText === 'string' && error.responseText.includes('"error":')); // Raw response text check

          if (looksLikeOData && typeof this.extractODataError === 'function') {
            // Attempt to parse as OData error
            console.debug("ErrorHandler: Attempting to extract OData error structure.");
            errorInfo = this.extractODataError(error); // Use dedicated extractor
          } else {
            // Treat as a generic JS error object or pre-formatted error
            errorInfo = {
              code: error.code || (error instanceof Error ? error.name : "ERROR"), // Use Error name if available
              message: error.message || "An unknown error occurred.",
              // Use provided details array, or stack for JS Errors
              details: error.details || (error instanceof Error ? error.stack : null) || [],
              originalError: error // Keep original for stringify fallback if needed
            };
          }
        } else {
          // Handle null, undefined, or other unexpected types
          errorInfo = { code: "UNKNOWN_ERROR", message: "An unknown error occurred or invalid error provided.", details: [] };
          console.warn("ErrorHandler: showError called with invalid error type:", error);
        }
      } catch (extractionError) {
        // Catch errors during the normalization process itself
        console.error("ErrorHandler: Error during error normalization:", extractionError);
        errorInfo = {
          code: "EXTRACTION_FAILED",
          message: "An error occurred while processing the error message.",
          details: `Original error: ${JSON.stringify(error, null, 2)} \n\n Extraction error: ${extractionError.message}`,
          originalError: error
        };
      }

      // --- 2. Log Error ---
      // Log differently based on the flag
      if (isBusinessError) {
        console.warn(`ErrorHandler: Business Error Displayed: ${title} - ${errorInfo.message}`, errorInfo.details || errorInfo);
      } else {
        console.error(`ErrorHandler: Technical Error Displayed: ${title} - ${errorInfo.message}`, { errorInfo: errorInfo, originalInput: error });
      }

      // --- 3. Prepare Details for MessageBox ---
      let messageBoxDetails = "";
      try {
        // Prioritize formatted details array
        if (Array.isArray(errorInfo.details) && errorInfo.details.length > 0) {
          messageBoxDetails = errorInfo.details
            .map(d => {
              // Handle detail items that might be strings or objects
              let detailMsg = typeof d === 'string' ? d : (d.message || JSON.stringify(d));
              let detailCode = (d && d.code) ? ` (${d.code})` : ''; // Check if d exists before accessing code
              return `- ${detailMsg}${detailCode}`;
            })
            .join("\n");
        } else if (typeof errorInfo.details === 'string' && errorInfo.details.trim() !== '') {
          // Use details if it's a non-empty string (e.g., stack trace)
          messageBoxDetails = errorInfo.details;
        } else if (errorInfo.innererror) {
          // Fallback to inner error object
          messageBoxDetails = `Inner Error:\n${JSON.stringify(errorInfo.innererror, null, 2)}`;
        } else if (errorInfo.originalError && messageBoxDetails === "") {
          // Final fallback: stringify the original error if no other details found
          messageBoxDetails = `Details:\n${JSON.stringify(errorInfo.originalError, null, 2)}`;
        }
      } catch (stringifyError) {
        console.error("ErrorHandler: Error stringifying details for MessageBox:", stringifyError);
        messageBoxDetails = "Could not display error details due to a processing issue.";
      }

      // --- 4. Show MessageBox ---
      this.messageBox.error(errorInfo.message || "Error occurred", {
        title: title,
        details: messageBoxDetails || "No further details available.",
        actions: [this.messageBox.Action.CLOSE]
      });
    }

    /**
     * Shows a short success message using MessageToast.
     * @param {string} message - The success message text.
     * @public
     */
    showSuccess(message) {
      if (message && typeof message === 'string') {
        this.messageToast.show(message);
        console.log(`ErrorHandler: Success - ${message}`);
      } else {
        console.warn("ErrorHandler: showSuccess called with invalid message:", message);
      }
    }

    /**
     * Shows a short warning message using MessageToast.
     * @param {string} message - The warning message text.
     * @public
     */
    showWarning(message) {
      if (message && typeof message === 'string') {
        this.messageToast.show(message);
        console.warn(`ErrorHandler: Warning - ${message}`);
      } else {
        console.warn("ErrorHandler: showWarning called with invalid message:", message);
      }
    }

    /**
     * Shows a confirmation dialog using MessageBox.
     * @param {string} message - The confirmation question/message text.
     * @param {string} [title="Confirmation"] - The title for the confirmation dialog.
     * @param {function} [onConfirm] - Callback function executed if the user confirms (e.g., clicks Yes).
     * @param {function} [onCancel] - Callback function executed if the user cancels (e.g., clicks No or closes).
     * @public
     */
    showConfirmation(message, title = "Confirmation", onConfirm, onCancel) {
      if (!message || typeof message !== 'string') {
        console.error("ErrorHandler: showConfirmation requires a valid message string.");
        return;
      }
      this.messageBox.confirm(message, {
        title: title,
        actions: [this.messageBox.Action.YES, this.messageBox.Action.NO],
        emphasizedAction: this.messageBox.Action.YES,
        onClose: (action) => {
          if (action === this.messageBox.Action.YES) {
            if (onConfirm && typeof onConfirm === 'function') {
              try {
                onConfirm();
              } catch (e) {
                console.error("ErrorHandler: Error in onConfirm callback:", e);
                this.showError("An error occurred while processing the confirmation.", "Callback Error");
              }
            }
          } else { // Treat NO and closing the dialog (action=undefined or ESC) as cancellation
            if (onCancel && typeof onCancel === 'function') {
              try {
                onCancel();
              } catch (e) {
                console.error("ErrorHandler: Error in onCancel callback:", e);
                // Avoid showing another error for cancellation callback issues usually
              }
            }
          }
        }
      });
    }

    // --- Error Processing Utility Methods ---

    /**
     * Formats raw validation errors into a consistent structure and removes duplicates.
     * Expects errors to potentially be strings or objects with properties like
     * 'message', 'text', 'description', 'field', 'sequenceId', 'SequenceNumber'.
     *
     * @param {Array<string|object>} errors - Array of raw validation error items.
     * @returns {Array<object>} Array of unique, formatted error objects, each containing
     * at least `message`, `sequenceId`, `field`. Returns empty array if input is invalid.
     * @public
     */
    formatValidationErrors(errors) {
      if (!errors || !Array.isArray(errors) || errors.length === 0) {
        return []; // Return empty array for invalid input
      }

      // 1. Map to consistent format, handling various input types
      const formattedErrors = errors.map((error, index) => {
        if (typeof error === 'object' && error !== null) {
          let message = error.message || error.Message || error.text || error.description || "";
          if (!message && error.toString() === '[object Object]') {
            message = error.field ? `Validation error in field '${error.field}'` : `Unknown validation error object (Row ${index + 1})`;
          } else if (!message) {
            message = `Unknown error object (Row ${index + 1}): ${JSON.stringify(error)}`;
          }

          return {
            ...error, // Keep original properties
            message: String(message), // Ensure message is a string
            sequenceId: error.sequenceId || error.SequenceNumber || error.seqId || 'N/A',
            field: error.field || error.Field || error.propertyref || 'Unknown'
          };
        } else if (typeof error === 'string' && error.trim() !== '') {
          return {
            message: error,
            sequenceId: 'N/A', // No sequence info available from string
            field: 'Unknown'
          };
        } else {
          // Log and create a placeholder for invalid entries in the array
          console.warn(`ErrorHandler: Invalid error item at index ${index}:`, error);
          return {
            message: `Invalid error item found at row ${index + 1}.`,
            sequenceId: 'N/A',
            field: 'Invalid Data'
          };
        }
      }).filter(e => e && e.message); // Filter out any null/undefined results or those without a message

      // 2. Deduplicate based on a composite key
      const uniqueErrorsMap = new Map();
      formattedErrors.forEach((error) => {
        const key = `${error.sequenceId}-${error.field}-${error.message}`;
        if (!uniqueErrorsMap.has(key)) {
          uniqueErrorsMap.set(key, error);
        }
      });

      return Array.from(uniqueErrorsMap.values());
    }

    /**
     * Extracts and normalizes error information from various OData response formats.
     * Handles OData V2/V4 structures, batch errors, and plain error objects/strings.
     *
     * @param {object|string} error - The error object, typically from an OData request failure (e.g., in a .catch block).
     * @returns {object} A normalized error information object with properties:
     * `code` (string), `message` (string), `details` (array), `innererror` (object|null).
     * @public
     */
    extractODataError(error) {
      let errorInfo = {
        code: "UNKNOWN_ERROR",
        message: "An unknown error occurred during the operation.",
        details: [],
        innererror: null
      };

      try {
        let errorData;
        let responseBody = null;

        // --- 1. Find Error Source ---
        if (error && error.response) {
          responseBody = error.response.body || error.response.responseText || error.responseText;
        } else if (error && error.responseText) {
          responseBody = error.responseText;
        } else if (error && error.error) {
          errorData = error; // Already structured
        } else if (error && error.message) { // Generic Error or simple object
          errorInfo.message = error.message;
          errorInfo.code = error.code || error.name || "GENERIC_ERROR";
          errorInfo.details = (Array.isArray(error.details) ? error.details : [])
            .map(d => typeof d === 'string' ? { message: d } : d);
          return errorInfo;
        } else if (typeof error === 'string') {
          errorInfo.message = error;
          errorInfo.code = "STRING_ERROR";
          return errorInfo;
        } else {
          // Cannot determine error source
          return errorInfo;
        }

        // --- 2. Parse Body if Necessary ---
        if (responseBody && typeof responseBody === 'string') {
          try {
            if (responseBody.includes("Content-Type: application/http") && responseBody.includes('{"error":')) {
              const jsonStartIndex = responseBody.indexOf('{"error":');
              const potentialEndIndex = responseBody.indexOf('\r\n--', jsonStartIndex);
              const jsonString = responseBody.substring(jsonStartIndex, potentialEndIndex > jsonStartIndex ? potentialEndIndex : undefined);
              try {
                errorData = JSON.parse(jsonString);
              } catch (batchParseError) {
                console.warn("ErrorHandler: Failed to parse extracted JSON from batch response.", batchParseError, jsonString);
                errorInfo.message = "Error processing batch response (details unavailable).";
              }
            } else {
              errorData = JSON.parse(responseBody);
            }
          } catch (parseError) {
            console.warn("ErrorHandler: Failed to parse error response body:", parseError, responseBody);
            errorInfo.message = "Failed to parse error response from server.";
            errorInfo.details = [{ message: `Raw response snippet: ${responseBody.substring(0, 200)}...` }];
          }
        } else if (responseBody && typeof responseBody === 'object') {
          errorData = responseBody;
        }

        // --- 3. Extract from Parsed Data ---
        if (errorData && errorData.error) {
          const mainError = errorData.error;
          errorInfo.code = mainError.code || "UNKNOWN_ODATA_ERROR";
          errorInfo.message = (mainError.message && (typeof mainError.message === 'string' ? mainError.message : mainError.message.value)) || "No OData error message provided.";
          errorInfo.innererror = mainError.innererror || null;

          const detailsArray = (mainError.innererror && mainError.innererror.errordetails) || mainError.details || [];
          if (Array.isArray(detailsArray)) {
            errorInfo.details = detailsArray.map(detail => ({
              code: detail.code || "",
              message: detail.message || JSON.stringify(detail),
              propertyref: detail.propertyref || detail.target || "",
              severity: detail.severity || "error"
            }));
          }
        } else if (responseBody && !errorInfo.message.startsWith("Failed to parse")) {
          // If we had a response body but couldn't find the error structure
          errorInfo.message = "Received response, but could not find standard OData error structure.";
          errorInfo.details = [{ message: `Response data: ${JSON.stringify(errorData || responseBody, null, 2)}` }];
        }

      } catch (e) {
        console.error("ErrorHandler: Unexpected exception during OData error extraction:", e, error);
        errorInfo.message = "Critical error during error message processing.";
        errorInfo.code = "EXTRACTION_EXCEPTION";
      }

      return errorInfo;
    }

    /**
     * Extracts success information from OData response.
     * @param {Object} response - The success response object
     * @returns {Object} Normalized success information
     * @public
     */
    extractSuccessInfo(response) {
      try {
        // Handle different response structures
        if (response && response.data) {
          return {
            code: 'SUCCESS',
            message: `Operation completed successfully`,
            details: response.data
          };
        } else if (response && response.AssetNumber) {
          return {
            code: 'SUCCESS',
            message: `Asset ${response.AssetNumber} created successfully`,
            details: response
          };
        } else {
          return {
            code: 'SUCCESS',
            message: 'Operation completed successfully',
            details: response || {}
          };
        }
      } catch (error) {
        console.error("ErrorHandler: Error extracting success info:", error);
        return {
          code: 'SUCCESS_EXTRACTION_ERROR',
          message: 'Operation completed but could not extract details',
          details: { error: error.message, originalResponse: response }
        };
      }
    }

    /**
     * Creates a standardized message object structure. Useful for logging or internal message queues.
     *
     * @param {string} [type="info"] - Message type ('success', 'error', 'info', 'warning').
     * @param {string} [code] - Application-specific message code. Defaults based on type.
     * @param {string} [message] - The main message text. Defaults based on type.
     * @param {any} [details=""] - Additional details (can be string, object, array).
     * @param {string} [source="Application"] - The source component/module generating the message.
     * @param {string} [entityId=""] - ID of a related business entity, if applicable.
     * @param {number|string} [batchIndex=""] - Index if part of a batch operation.
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
        details: details,
        timestamp: new Date().toISOString(),
        source: source,
        entityId: entityId,
        batchIndex: batchIndex
      };
    }

  }; // End of class ErrorHandler
});