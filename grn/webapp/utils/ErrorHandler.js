sap.ui.define([
  "sap/m/MessageToast",
  "sap/m/MessageBox"
], function (MessageToast, MessageBox) {
  "use strict";

  return class ErrorHandler {
    constructor(options = {}) {
      this.messageBox = options.messageBox || MessageBox;
      this.messageToast = options.messageToast || MessageToast;
    }

    // === CORE ERROR DISPLAY METHODS ===

    /**
     * Shows an error message dialog using MessageBox.
     * @param {string|object|Error} error - The error to display
     * @param {string} [title="Error"] - The title for the error dialog
     * @param {boolean} [isBusinessError=false] - Flag for business/validation error
     * @public
     */
    showError(error, title = "Error", isBusinessError = false) {
      let errorInfo;

      try {
        if (typeof error === "string") {
          errorInfo = { code: "GENERIC_ERROR", message: error, details: [] };
        } else if (error && typeof error === 'object') {
          const looksLikeOData = error.response ||
            (error.error && error.error.innererror) ||
            (error.code && error.message && Array.isArray(error.details)) ||
            (error.responseText && typeof error.responseText === 'string' && error.responseText.includes('"error":'));

          if (looksLikeOData && typeof this.extractODataError === 'function') {
            console.debug("ErrorHandler: Attempting to extract OData error structure.");
            errorInfo = this.extractODataError(error);
          } else {
            errorInfo = {
              code: error.code || (error instanceof Error ? error.name : "ERROR"),
              message: error.message || "An unknown error occurred.",
              details: error.details || (error instanceof Error ? error.stack : null) || [],
              originalError: error
            };
          }
        } else {
          errorInfo = { code: "UNKNOWN_ERROR", message: "An unknown error occurred or invalid error provided.", details: [] };
          console.warn("ErrorHandler: showError called with invalid error type:", error);
        }
      } catch (extractionError) {
        console.error("ErrorHandler: Error during error normalization:", extractionError);
        errorInfo = {
          code: "EXTRACTION_FAILED",
          message: "An error occurred while processing the error message.",
          details: `Original error: ${JSON.stringify(error, null, 2)} \n\n Extraction error: ${extractionError.message}`,
          originalError: error
        };
      }

      // Log error
      if (isBusinessError) {
        console.warn(`ErrorHandler: Business Error Displayed: ${title} - ${errorInfo.message}`, errorInfo.details || errorInfo);
      } else {
        console.error(`ErrorHandler: Technical Error Displayed: ${title} - ${errorInfo.message}`, { errorInfo: errorInfo, originalInput: error });
      }

      // Prepare details for MessageBox
      let messageBoxDetails = "";
      try {
        if (Array.isArray(errorInfo.details) && errorInfo.details.length > 0) {
          messageBoxDetails = errorInfo.details
            .map(d => {
              let detailMsg = typeof d === 'string' ? d : (d.message || JSON.stringify(d));
              let detailCode = (d && d.code) ? ` (${d.code})` : '';
              return `- ${detailMsg}${detailCode}`;
            })
            .join("\n");
        } else if (typeof errorInfo.details === 'string' && errorInfo.details.trim() !== '') {
          messageBoxDetails = errorInfo.details;
        } else if (errorInfo.innererror) {
          messageBoxDetails = `Inner Error:\n${JSON.stringify(errorInfo.innererror, null, 2)}`;
        } else if (errorInfo.originalError && messageBoxDetails === "") {
          messageBoxDetails = `Details:\n${JSON.stringify(errorInfo.originalError, null, 2)}`;
        }
      } catch (stringifyError) {
        console.error("ErrorHandler: Error stringifying details for MessageBox:", stringifyError);
        messageBoxDetails = "Could not display error details due to a processing issue.";
      }

      // Show MessageBox
      this.messageBox.error(errorInfo.message || "Error occurred", {
        title: title,
        details: messageBoxDetails || "No further details available.",
        actions: [this.messageBox.Action.CLOSE]
      });
    }

    /**
     * Shows a short success message using MessageToast.
     * @param {string} message - The success message text
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
     * @param {string} message - The warning message text
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
     * @param {string} message - The confirmation question/message text
     * @param {string} [title="Confirmation"] - The title for the confirmation dialog
     * @param {function} [onConfirm] - Callback function executed if the user confirms
     * @param {function} [onCancel] - Callback function executed if the user cancels
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
          } else {
            if (onCancel && typeof onCancel === 'function') {
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

    // === MESSAGE CREATION AND STANDARDIZATION ===

    /**
     * Create standardized success message for GRNs
     * @param {Object} record - Record object
     * @param {string} source - Source component
     * @param {number} batchIndex - Batch index
     * @returns {Object} Standardized message object
     */
    createSuccessMessage(record, source = "Application", batchIndex = "") {
      const materialDoc = record.MaterialDocument;
      const materialDocYear = record.MaterialDocumentYear;

      let message;
      if (materialDoc && materialDocYear) {
        // Use DataTransformer for date formatting if available
        const timestamp = this._dataTransformer ?
          this._dataTransformer.formatDateTime(new Date()) :
          new Date().toLocaleString();
        message = `GRN ${materialDoc} created successfully at ${timestamp}`;
      } else {
        message = record.Message || "Successfully processed GRN";
      }

      return this.createStandardMessage(
        "success",
        "SUCCESS",
        message,
        "",
        source,
        record.GRNDocumentNumber || "",
        batchIndex
      );
    }

    /**
     * Create standardized error message
     * @param {Object} errorInfo - Error information
     * @param {Object} record - Related record
     * @param {string} source - Source component
     * @param {number} batchIndex - Batch index
     * @returns {Object} Standardized message object
     */
    createErrorMessage(errorInfo, record = {}, source = "Application", batchIndex = "") {
      return this.createStandardMessage(
        "error",
        errorInfo?.errorCode || errorInfo?.code || "ERROR",
        errorInfo?.error || errorInfo?.message || "Processing failed",
        errorInfo?.details || [],
        source,
        record.GRNDocumentNumber || "",
        batchIndex
      );
    }

    /**
     * Create standardized message object structure
     * @param {string} type - Message type
     * @param {string} code - Message code
     * @param {string} message - Message text
     * @param {any} details - Additional details
     * @param {string} source - Source component
     * @param {string} entityId - Entity ID
     * @param {string|number} batchIndex - Batch index
     * @returns {Object} Standardized message object
     */
    createStandardMessage(type = "info", code, message, details = "", source = "Application", entityId = "", batchIndex = "") {
      const messageType = String(type).toLowerCase();
      let defaultCode = "INFO";
      let defaultMessage = "Operation processed.";

      if (messageType === "success") {
        defaultCode = "SUCCESS";
        defaultMessage = "Operation successful.";
      } else if (messageType === "error") {
        defaultCode = "ERROR";
        defaultMessage = "Operation failed.";
      } else if (messageType === "warning") {
        defaultCode = "WARNING";
        defaultMessage = "Operation completed with warnings.";
      }

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

    /**
     * Process and normalize any record into standardized format with proper messaging
     * @param {Object} record - Raw record
     * @param {boolean} isSuccess - Whether this is a success record
     * @param {Object} errorInfo - Error information (for failed records)
     * @param {string} source - Source component
     * @param {number} index - Record index
     * @param {number} batchIndex - Batch index
     * @returns {Object} Normalized record with message
     */
    normalizeRecord(record, isSuccess, errorInfo = null, source = "Application", index = 0, batchIndex = "") {
      // Use DataTransformer for field cleanup if available
      let normalizedRecord = this._dataTransformer ?
        this._dataTransformer.cleanupAndStandardizeRecord(record) :
        { ...record };

      // Add processing metadata
      normalizedRecord.Status = isSuccess ? "Success" : "Error";
      normalizedRecord.ProcessedAt = new Date().toISOString();
      normalizedRecord.index = index;

      // Create appropriate message
      const messageObject = isSuccess
        ? this.createSuccessMessage(record, source, batchIndex)
        : this.createErrorMessage(errorInfo, record, source, batchIndex);

      // Add message to record
      normalizedRecord.message = messageObject;
      normalizedRecord.Message = messageObject.message;

      return normalizedRecord;
    }

    // === PROGRESS CALCULATION UTILITIES ===

    /**
     * Calculate processing progress statistics
     * @param {Object} stats - Current statistics
     * @param {Date} startTime - Processing start time
     * @returns {Object} Progress information
     */
    calculateProgress(stats, startTime) {
      const currentTime = new Date();
      const elapsedSeconds = Math.max(1, (currentTime - startTime) / 1000);
      const processingSpeed = (stats.processedCount / elapsedSeconds).toFixed(0);

      const remainingRecords = stats.totalRecords - stats.processedCount;
      let formattedTimeRemaining = "Calculating...";

      if (remainingRecords > 0 && parseFloat(processingSpeed) > 0) {
        const timeRemaining = Math.ceil(remainingRecords / parseFloat(processingSpeed));
        formattedTimeRemaining = this.formatTimeRemaining(timeRemaining);
      }

      return {
        processingSpeed: `${processingSpeed} records/sec`,
        timeRemaining: formattedTimeRemaining,
        batchProgress: Math.round(((stats.currentBatch || 0) / (stats.totalBatches || 1)) * 100),
        entriesProgress: Math.round((stats.processedCount / stats.totalRecords) * 100)
      };
    }

    /**
     * Format time remaining in human-readable format
     * @param {number} timeRemaining - Time in seconds
     * @returns {string} Formatted time string
     */
    formatTimeRemaining(timeRemaining) {
      if (timeRemaining > 3600) {
        const hours = Math.floor(timeRemaining / 3600);
        const minutes = Math.floor((timeRemaining % 3600) / 60);
        return `${hours}h ${minutes}m`;
      } else if (timeRemaining > 60) {
        const minutes = Math.floor(timeRemaining / 60);
        const seconds = timeRemaining % 60;
        return `${minutes}m ${seconds}s`;
      } else {
        return `${timeRemaining}s`;
      }
    }

    // === BATCH RESULT PROCESSING ===

    /**
     * Process diverse batch results into standardized format for export
     * @param {Object} batchData - Raw batch data
     * @param {string} exportType - Export type filter ("all", "success", "error")
     * @returns {Array} Standardized records
     */
    processBatchResults(batchData, exportType = "all") {
      try {
        if (!batchData) {
          console.warn("ErrorHandler: No batch data provided for processing.");
          return [];
        }

        // Try to get standardized messages first
        const allMessages = this._extractStandardizedMessages(batchData);

        if (allMessages && allMessages.length > 0) {
          return this._processStandardizedMessages(allMessages, exportType);
        }

        // Fallback to processing individual record arrays
        return this._processFallbackRecords(batchData, exportType);

      } catch (error) {
        console.error("ErrorHandler: Error processing batch results:", error);
        return [{
          Status: "Processing Error",
          Message: "Internal error processing batch results: " + error.message
        }];
      }
    }

    /**
     * Extract standardized messages from batch data
     * @param {Object} batchData - Batch data
     * @returns {Array|null} Messages array or null
     * @private
     */
    _extractStandardizedMessages(batchData) {
      const messageSources = [
        batchData.allMessages,
        batchData._responseData?.allMessages,
        batchData.responseData?.allMessages,
        typeof batchData.getResponseData === "function" ? batchData.getResponseData()?.allMessages : undefined,
        batchData.messages
      ];

      for (const source of messageSources) {
        if (this._isValidMessageArray(source)) {
          console.debug("ErrorHandler: Found standardized messages, count:", source.length);
          return source;
        }
      }
      return null;
    }

    /**
     * Check if source is valid message array
     * @param {any} source - Source to validate
     * @returns {boolean} True if valid
     * @private
     */
    _isValidMessageArray(source) {
      return source &&
        Array.isArray(source) &&
        source.length > 0 &&
        source[0] &&
        typeof source[0].type === 'string' &&
        typeof source[0].message === 'string';
    }

    /**
     * Process standardized messages
     * @param {Array} messages - Messages array
     * @param {string} exportType - Export type
     * @returns {Array} Processed records
     * @private
     */
    _processStandardizedMessages(messages, exportType) {
      const filteredMessages = this._filterMessagesByType(messages, exportType);

      const processedRecords = filteredMessages.map(msg => {
        const isError = (msg.type || "").toLowerCase() === 'error';
        const baseRecord = msg.entity && typeof msg.entity === 'object' ? { ...msg.entity } : {};

        return this.normalizeRecord(
          baseRecord,
          !isError,
          isError ? { message: msg.message, code: msg.code } : null,
          msg.source || "BatchProcessor",
          msg.row || 0,
          msg.batchIndex || ""
        );
      });

      // Use DataTransformer for final processing if available
      return this._dataTransformer ?
        this._dataTransformer.finalizeRecords(processedRecords) :
        processedRecords;
    }

    /**
     * Filter messages by type
     * @param {Array} messages - Messages to filter
     * @param {string} exportType - Export type
     * @returns {Array} Filtered messages
     * @private
     */
    _filterMessagesByType(messages, exportType) {
      return messages.filter(msg => {
        const msgTypeLower = (msg.type || "").toLowerCase();
        switch (exportType) {
          case "all": return true;
          case "success": return ["success", "information", "warning"].includes(msgTypeLower);
          case "error":
          case "errors": return msgTypeLower === "error";
          default: return true;
        }
      });
    }

    /**
     * Process fallback records when standardized messages aren't available
     * @param {Object} batchData - Batch data
     * @param {string} exportType - Export type
     * @returns {Array} Processed records
     * @private
     */
    _processFallbackRecords(batchData, exportType) {
      let processedRecords = [];

      // Process success records
      if (exportType === "all" || exportType === "success") {
        const successRecords = this._extractRecordsArray(batchData, 'successRecords');
        processedRecords = processedRecords.concat(
          successRecords.map((record, index) => {
            const entry = record?.entry || record?.data || record || {};
            return this.normalizeRecord(entry, true, null, "BatchProcessor", index);
          })
        );
      }

      // Process error records
      if (exportType === "all" || exportType === "error" || exportType === "errors") {
        const errorRecords = this._extractRecordsArray(batchData, 'errorRecords');
        processedRecords = processedRecords.concat(
          errorRecords.map((record, index) => {
            const entry = record?.entry || record || {};
            const errorInfo = {
              message: this._extractErrorMessage(record),
              code: record?.errorCode || record?.code || "ERROR"
            };
            return this.normalizeRecord(entry, false, errorInfo, "BatchProcessor", index);
          })
        );
      }

      if (processedRecords.length === 0) {
        return [{
          Status: "No Records",
          Message: `No ${exportType} records found`
        }];
      }

      // Use DataTransformer for final processing if available
      return this._dataTransformer ?
        this._dataTransformer.finalizeRecords(processedRecords) :
        processedRecords;
    }

    /**
     * Extract records array from batch data
     * @param {Object} batchData - Batch data
     * @param {string} recordType - Record type
     * @returns {Array} Records array
     * @private
     */
    _extractRecordsArray(batchData, recordType) {
      const records = batchData[recordType] || batchData.responseData?.[recordType] || [];
      return Array.isArray(records) ? records : [];
    }

    /**
     * Extract error message from error record
     * @param {Object} record - Error record
     * @returns {string} Error message
     * @private
     */
    _extractErrorMessage(record) {
      if (record?.message?.message) return record.message.message;
      if (typeof record?.error === 'string') return record.error;
      if (typeof record?.message === 'string') return record.message;
      if (record?.details?.[0]?.message) return record.details[0].message;
      if (record?.ErrorMessage) return record.ErrorMessage;
      return "Error during processing";
    }

    // === VALIDATION ERROR FORMATTING ===

    /**
     * Formats raw validation errors into a consistent structure and removes duplicates
     * @param {Array<string|object>} errors - Array of raw validation error items
     * @returns {Array<object>} Array of unique, formatted error objects
     * @public
     */
    formatValidationErrors(errors) {
      if (!errors || !Array.isArray(errors) || errors.length === 0) {
        return [];
      }

      const formattedErrors = errors.map((error, index) => {
        if (typeof error === 'object' && error !== null) {
          let message = error.message || error.Message || error.text || error.description || "";
          if (!message && error.toString() === '[object Object]') {
            message = error.field ? `Validation error in field '${error.field}'` : `Unknown validation error object (Row ${index + 1})`;
          } else if (!message) {
            message = `Unknown error object (Row ${index + 1}): ${JSON.stringify(error)}`;
          }

          return {
            ...error,
            message: String(message),
            sequenceId: error.sequenceId || error.SequenceNumber || error.seqId || 'N/A',
            field: error.field || error.Field || error.propertyref || 'Unknown'
          };
        } else if (typeof error === 'string' && error.trim() !== '') {
          return {
            message: error,
            sequenceId: 'N/A',
            field: 'Unknown'
          };
        } else {
          console.warn(`ErrorHandler: Invalid error item at index ${index}:`, error);
          return {
            message: `Invalid error item found at row ${index + 1}.`,
            sequenceId: 'N/A',
            field: 'Invalid Data'
          };
        }
      }).filter(e => e && e.message);

      // Deduplicate based on composite key
      const uniqueErrorsMap = new Map();
      formattedErrors.forEach((error) => {
        const key = `${error.sequenceId}-${error.field}-${error.message}`;
        if (!uniqueErrorsMap.has(key)) {
          uniqueErrorsMap.set(key, error);
        }
      });

      return Array.from(uniqueErrorsMap.values());
    }

    // === ODATA ERROR EXTRACTION ===

    /**
     * Extracts and normalizes error information from various OData response formats
     * @param {object|string} error - The error object from an OData request failure
     * @returns {object} A normalized error information object
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

        // Find error source
        if (error && error.response) {
          responseBody = error.response.body || error.response.responseText || error.responseText;
        } else if (error && error.responseText) {
          responseBody = error.responseText;
        } else if (error && error.error) {
          errorData = error;
        } else if (error && error.message) {
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
          return errorInfo;
        }

        // Parse body if necessary
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

        // Extract from parsed data
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

    // === DEPENDENCY INJECTION ===

    /**
     * Set DataTransformer dependency for date/field operations
     * @param {Object} dataTransformer - DataTransformer instance
     */
    setDataTransformer(dataTransformer) {
      this._dataTransformer = dataTransformer;
    }
  };
});