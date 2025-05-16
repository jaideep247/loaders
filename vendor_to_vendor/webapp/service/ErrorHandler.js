sap.ui.define([
], function () {
  "use strict";

  /**
   * ErrorHandler
   * Responsible for centralizing error handling and logging
   */
  return function(oController) {
    this.oController = oController;
    
    /**
     * Log error to console and store in model
     * @param {string} context - Error context description
     * @param {object} errorDetails - Error details object
     */
    this.logError = function(context, errorDetails) {
      // Log to console
      console.error(`[${context}]`, errorDetails);

      // Add to error log in model
      const uploadSummaryModel = this.oController.getView().getModel("uploadSummary");
      const currentErrors = uploadSummaryModel.getProperty("/ValidationErrors") || [];

      currentErrors.push({
        context: context,
        details: errorDetails,
        timestamp: new Date()
      });

      uploadSummaryModel.setProperty("/ValidationErrors", currentErrors);
    };
    
    /**
     * Handle SOAP service errors
     * @param {object} error - Error object
     * @param {function} onComplete - Callback function
     */
    this.handleSoapError = function(error, onComplete) {
      this.logError('SOAP Service Error', {
        errorMessage: error.message,
        errorStack: error.stack
      });
      
      sap.m.MessageBox.error(`Service error: ${error.message}`);
      
      if (typeof onComplete === 'function') {
        onComplete();
      }
    };
    
    /**
     * Handle validation errors
     * @param {array} errors - Validation errors
     */
    this.handleValidationErrors = function(errors) {
      // Store errors in model
      const uploadSummaryModel = this.oController.getView().getModel("uploadSummary");
      uploadSummaryModel.setProperty("/ValidationErrors", errors);
      
      // Show dialog using UI manager
      this.oController._uiManager.handleValidationErrors(errors);
    };
    
    /**
     * Handle file processing errors
     * @param {string} fileName - Name of file being processed
     * @param {object} error - Error object
     */
    this.handleFileProcessingError = function(fileName, error) {
      this.logError('File Processing Error', {
        fileName: fileName,
        errorMessage: error.message,
        errorStack: error.stack
      });
      
      sap.m.MessageBox.error(`Error processing file: ${fileName}`, {
        details: error.message,
        actions: [sap.m.MessageBox.Action.CLOSE]
      });
    };
    
    /**
     * Handle export errors
     * @param {string} format - Export format
     * @param {object} error - Error object
     */
    this.handleExportError = function(format, error) {
      this.logError('Export Error', {
        format: format,
        errorMessage: error.message,
        errorStack: error.stack
      });
      
      sap.m.MessageBox.error(`Export failed: ${error.message}`);
    };
  };
});