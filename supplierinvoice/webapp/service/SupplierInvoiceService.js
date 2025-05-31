sap.ui.define([
  "sap/ui/base/Object",
  "sap/m/MessageBox",
  "sap/ui/core/BusyIndicator",
  "supplierinvoice/service/OdataService"
], function (BaseObject, MessageBox, BusyIndicator, ODataService) {
  "use strict";

  return BaseObject.extend("supplierinvoice.service.SupplierInvoiceService", {
    constructor: function (controller) {
      // Store reference to controller
      this._controller = controller;

      // Initialize OData service
      this._controller = controller;
      this._oDataService = new ODataService(controller.getBaseURL());
    },

    /**
     * Process a list of supplier invoices for submission
     * @param {Array} invoices - Array of invoice objects
     * @returns {Promise} Promise that resolves with the submission results
     */
    processSubmission: function (groupedInvoices) {
      return new Promise((resolve, reject) => {
        if (!groupedInvoices || groupedInvoices.length === 0) {
          MessageBox.error("No valid invoices to process");
          reject("No valid invoices to process");
          return;
        }

        // Update UI models to show processing state
        this._updateProcessingState(true, 0);

        // Show busy indicator
        BusyIndicator.show(0);

        // Use OData service to upload invoices
        this._oDataService.uploadSupplierInvoices(groupedInvoices)
          .then(result => {
            console.log("Supplier Invoice Upload Result:", result);

            // Update UI models to show processing complete
            this._updateProcessingState(false, 100);

            // Hide busy indicator
            BusyIndicator.hide();

            // Show appropriate message based on result
            this._showResultMessage(result);

            // Resolve with the result
            resolve(result);
          })
          .catch(error => {
            console.error("Supplier Invoice Upload Error:", error);

            // Update UI models to show processing failed
            this._updateProcessingState(false, 0);

            // Hide busy indicator
            BusyIndicator.hide();

            // Show error message
            MessageBox.error("Failed to process supplier invoices: " + (error.message || error));

            // Reject with the error
            reject(error);
          });
      });
    },

    /**
     * Update UI models to reflect processing state
     * @param {boolean} isSubmitting - Whether submission is in progress
     * @param {number} progress - Current progress percentage (0-100)
     * @private
     */
    _updateProcessingState: function (isSubmitting, progress) {
      const uploadSummaryModel = this._controller.getView().getModel("uploadSummary");
      if (uploadSummaryModel) {
        uploadSummaryModel.setProperty("/isSubmitting", isSubmitting);
        uploadSummaryModel.setProperty("/uploadProgress", progress);
      }
    },

    /**
     * Show appropriate message based on upload result
     * @param {Object} result - Upload result object
     * @private
     */
    _showResultMessage: function (result) {
      // Get UI manager from controller if available
      const uiManager = this._controller._uiManager;

      if (result.status === "SUCCESS") {
        // All entries were successful
        if (uiManager && typeof uiManager.showSuccessWithDocuments === "function") {
          uiManager.showSuccessWithDocuments(result.successEntries);
        } else {
          MessageBox.success(
            `Successfully created ${result.successEntries.length} supplier invoices.`,
            {
              title: "Upload Successful"
            }
          );
        }
      } else if (result.status === "PARTIAL") {
        // Some entries succeeded, some failed
        if (uiManager && typeof uiManager.showPartialSuccessWithDocuments === "function") {
          uiManager.showPartialSuccessWithDocuments(
            result.successEntries,
            result.failedEntries,
            result.successEntries.length,
            result.failedEntries.length
          );
        } else {
          MessageBox.warning(
            `Created ${result.successEntries.length} supplier invoices. ${result.failedEntries.length} invoices failed.`,
            {
              title: "Partial Success"
            }
          );
        }
      } else {
        // All entries failed
        if (uiManager && typeof uiManager.showErrorWithDetails === "function") {
          uiManager.showErrorWithDetails(result.failedEntries);
        } else {
          MessageBox.error(
            `Failed to create supplier invoices. ${result.failedEntries.length} errors occurred.`,
            {
              title: "Upload Failed"
            }
          );
        }
      }
    },

    /**
     * Set batch processing display control
     * @param {Object} display - Batch processing display control
     */
    setBatchProcessingDisplay: function (display) {
      if (this._oDataService) {
        this._oDataService.setBatchProcessingDisplay(display);

        // Set update function to keep display in sync
        this._oDataService.setProcessDisplayUpdate((data) => {
          if (display) {
            if (typeof display.setVisible === "function") {
              display.setVisible(true);
            }

            if (typeof display.setStatus === "function") {
              display.setStatus(data.status);
            }

            if (typeof display.setError === "function") {
              display.setError(data.error);
            }

            if (typeof display.setTotalBatches === "function") {
              display.setTotalBatches(data.totalBatches);
            }

            if (typeof display.setCurrentBatch === "function") {
              display.setCurrentBatch(data.currentBatch);
            }

            if (typeof display.setProcessedBatches === "function") {
              display.setProcessedBatches(data.processedBatches);
            }

            if (typeof display.setTotalEntries === "function") {
              display.setTotalEntries(data.totalEntries);
            }

            if (typeof display.setProcessedEntries === "function") {
              display.setProcessedEntries(data.processedEntries);
            }

            if (typeof display.setEstimatedTimeRemaining === "function") {
              display.setEstimatedTimeRemaining(data.estimatedTimeRemaining);
            }
          }
        });

        // Set progress indicator update function
        this._oDataService.setProgressIndicator((progress) => {
          this._updateProcessingState(true, progress);
        });
      }
    }
  });
});