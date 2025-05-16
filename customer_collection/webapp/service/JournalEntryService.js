sap.ui.define([
  "sap/m/MessageBox",
  "sap/ui/core/BusyIndicator",
  "customercollection/service/SOAPService",
  "sap/ui/core/Fragment"
], function (MessageBox, BusyIndicator, SOAPService, Fragment) {
  "use strict";

  /**
   * JournalEntryService
   * Responsible for journal entry submission and processing
   */
  return function (oController) {
    this.oController = oController;
    this._soapService = new SOAPService();
    this._batchProcessingDisplay = null;

    /**
     * Process submission of journal entries
     * @param {array} validTransactions - Valid transactions to submit
     */
    this.processSubmission = function (validTransactions) {
      // Disable submit button immediately
      const uploadSummaryModel = this.oController.getView().getModel("uploadSummary");
      if (uploadSummaryModel) {
        uploadSummaryModel.setProperty("/IsSubmitEnabled", false);
        uploadSummaryModel.setProperty("/isSubmitting", true);
      }

      // Get the container and ensure batch processing display is initialized
      const batchContainer = this.oController.byId("batchProcessingDisplayContainer");
      if (batchContainer) {
        // Make it visible
        batchContainer.setVisible(true);
        batchContainer.setExpanded(true);
      }

      // Check if we have a batch display, if not try to get from controller
      if (!this._batchProcessingDisplay && this.oController._uiManager &&
        this.oController._uiManager._batchProcessingDisplay) {
        this._batchProcessingDisplay = this.oController._uiManager._batchProcessingDisplay;
      }

      // Start processing just once
      this._startProcessing(validTransactions, uploadSummaryModel);
    };
    // New helper method
    this._startProcessing = function (validTransactions, uploadSummaryModel) {

      // Make batch processing display visible only if it exists
      if (this._batchProcessingDisplay) {
        this._batchProcessingDisplay.setVisible(true);
        this._batchProcessingDisplay.setStatus("Preparing data for submission...");
      }
      // Set up progress indicator and process display update
      this._setupProgressIndicator();

      // Small timeout to ensure UI has time to update
      setTimeout(() => {
        // Call SOAP service to submit journal entries
        this._soapService
          .uploadJournalEntries(validTransactions)
          .then((result) => {
            this._handleSubmissionResult(result);
          })
          .catch((error) => {
            MessageBox.error(`Submission failed: ${error.message}`);
            console.error("SOAP Service Error:", error);

            if (this.oController._errorHandler && typeof this.oController._errorHandler.logError === 'function') {
              this.oController._errorHandler.logError('SOAP Service Error', {
                errorMessage: error.message,
                errorStack: error.stack
              });
            }

            // Update batch processing display with error if it exists
            if (this._batchProcessingDisplay) {
              if (typeof this._batchProcessingDisplay.setError === 'function') {
                this._batchProcessingDisplay.setError("Submission failed: " + error.message);
              }
              this._batchProcessingDisplay.setStatus("Failed");
            }

            // Re-enable submit button in case of error           
            if (uploadSummaryModel) {
              uploadSummaryModel.setProperty("/IsSubmitEnabled", true);
            }
          })
          .finally(() => {
            BusyIndicator.hide();

            // Keep batch processing display visible for result viewing
            // Set timeout to hide progress indicator in uploadSummaryModel
            setTimeout(() => {
              if (uploadSummaryModel) {
                uploadSummaryModel.setProperty("/uploadProgress", 0);
              }
            }, 1000);
          });
      }, 300); // Small delay to ensure batch display is initialized and UI updated  
    };
    /**
     * Initialize the batch processing display synchronously
     * This ensures the display is ready before SOAP processing starts
     */
    this._initBatchProcessingDisplaySync = function () {
      // If we already have a batch processing display, no need to create another one
      if (this._batchProcessingDisplay) {
        return;
      }

      try {
        // Check if we have a direct reference to the batch processing display
        const existingDisplay = this.oController.byId("batchProcessingDisplay");
        if (existingDisplay) {
          this._batchProcessingDisplay = existingDisplay;
          return;
        }

        // For small transactions, just create a dummy display
        // to ensure it's available immediately
        this._createDummyBatchProcessingDisplay();

        // Still try to load the real one asynchronously
        // Check if there's a container for the batch processing display in the view
        const batchDisplayContainer = this.oController.byId("batchProcessingDisplayContainer");

        if (batchDisplayContainer) {
          // Create the batch processing display asynchronously
          this._createBatchProcessingDisplay(batchDisplayContainer, true);
        } else {
          // If no container exists, try to find a suitable content area
          const contentArea = this.oController.byId("summaryPanel") || this.oController.byId("page");

          if (contentArea) {
            this._createBatchProcessingDisplay(contentArea, false);
          }
        }
      } catch (error) {
        console.error("Error initializing batch processing display:", error);
        // Ensure we have at least a dummy display
        this._createDummyBatchProcessingDisplay();
      }
    };
    /**
     * Initialize the batch processing display if not already created
     */
    this._initBatchProcessingDisplay = function () {
      // If we already have a batch processing display, no need to create another one
      if (this._batchProcessingDisplay) {
        return;
      }

      try {
        // Check if we have a direct reference to the batch processing display
        const existingDisplay = this.oController.byId("batchProcessingDisplay");
        if (existingDisplay) {
          this._batchProcessingDisplay = existingDisplay;
          return;
        }

        // Check if there's a container for the batch processing display in the view
        const batchDisplayContainer = this.oController.byId("batchProcessingDisplayContainer");

        if (batchDisplayContainer) {
          // Create the batch processing display asynchronously
          this._createBatchProcessingDisplay(batchDisplayContainer, true);
        } else {
          // If no container exists, try to find a suitable content area
          const contentArea = this.oController.byId("summaryPanel") || this.oController.byId("page");

          if (contentArea) {
            this._createBatchProcessingDisplay(contentArea, false);
          } else {
            console.warn("No suitable container found for batch processing display");
          }
        }
      } catch (error) {
        console.error("Error initializing batch processing display:", error);
        // Create a dummy batch processing display that won't throw errors
        this._createDummyBatchProcessingDisplay();
      }
    };

    /**
     * Create a dummy batch processing display that won't throw errors
     * This is a fallback when the real control can't be created
     */
    this._createDummyBatchProcessingDisplay = function () {
      this._batchProcessingDisplay = {
        setVisible: function () { return this; },
        setStatus: function () { return this; },
        setError: function () { return this; },
        setTotalBatches: function () { return this; },
        setCurrentBatch: function () { return this; },
        setProcessedBatches: function () { return this; },
        setTotalEntries: function () { return this; },
        setProcessedEntries: function () { return this; },
        setEstimatedTimeRemaining: function () { return this; },
        getStatus: function () { return ""; }
      };
      // Share with UIManager if available
      if (this.oController._uiManager &&
        typeof this.oController._uiManager.setBatchProcessingDisplay === 'function') {
        this.oController._uiManager.setBatchProcessingDisplay(this._batchProcessingDisplay);
      }
    };

    /**
     * Create batch processing display and attach it to container
     * @param {object} container - Container to attach display to
     * @param {boolean} useAddItem - Whether to use addItem or addContent
     */
    this._createBatchProcessingDisplay = function (container, useAddItem) {
      // First check if the element already exists
      const existingDisplay = this.oController.byId("batchProcessingDisplay");
      if (existingDisplay) {
        this._batchProcessingDisplay = existingDisplay;

        // Make sure it's in the container
        if (useAddItem && container.addItem && !container.getItems().includes(existingDisplay)) {
          container.addItem(existingDisplay);
        } else if (container.addContent && !container.getContent().includes(existingDisplay)) {
          container.addContent(existingDisplay);
        }
        return;
      }
      // First, try to load the control synchronously
      try {
        if (sap.ui.require.toUrl("customercollection/control/BatchProcessingDisplay")) {
          const BatchProcessingDisplayClass = sap.ui.require("customercollection/control/BatchProcessingDisplay");

          if (BatchProcessingDisplayClass) {
            this._batchProcessingDisplay = new BatchProcessingDisplayClass({
              id: this.oController.createId("batchProcessingDisplay" + new Date().getTime()),
              visible: false,
              cancel: this._handleBatchCancellation.bind(this)
            });

            if (useAddItem && container.addItem) {
              container.addItem(this._batchProcessingDisplay);
            } else if (container.addContent) {
              container.addContent(this._batchProcessingDisplay);
            }
            return;
          }
        }
      } catch (e) {
        console.warn("Could not load BatchProcessingDisplay synchronously:", e);
      }

      // Fall back to async loading if synchronous loading fails
      try {
        sap.ui.require(["customercollection/control/BatchProcessingDisplay"], (BatchProcessingDisplay) => {
          // Create the batch processing display
          this._batchProcessingDisplay = new BatchProcessingDisplay({
            id: this.oController.createId("batchProcessingDisplay"),
            visible: false,
            cancel: this._handleBatchCancellation.bind(this)
          });
          // Add to the container (only once!)
          if (useAddItem && container.addItem) {
            container.addItem(this._batchProcessingDisplay);
          } else if (container.addContent) {
            container.addContent(this._batchProcessingDisplay);
          } else if (!useAddItem && container.addItem) {
            container.addItem(this._batchProcessingDisplay);
          }
          // Share with UIManager if available
          if (this.oController._uiManager &&
            typeof this.oController._uiManager.setBatchProcessingDisplay === 'function') {
            this.oController._uiManager.setBatchProcessingDisplay(this._batchProcessingDisplay);
          }
          return;
        }, (error) => {
          console.error("Failed to load BatchProcessingDisplay:", error);
          this._createDummyBatchProcessingDisplay();
        });
      } catch (e) {
        console.error("Error loading BatchProcessingDisplay:", e);
        this._createDummyBatchProcessingDisplay();
      }
    };
    this.setBatchProcessingDisplay = function (display) {
      if (display) {
        this._batchProcessingDisplay = display;
        console.log("JournalEntryService received batch processing display instance");
      }
    };
    /**
     * Handle batch processing cancellation (if implemented)
     * This is a placeholder for if cancellation is supported in the future
     */
    this._handleBatchCancellation = function () {
      MessageBox.confirm(
        "Are you sure you want to cancel the batch processing? This may result in partial data processing.",
        {
          title: "Confirm Cancellation",
          onClose: (action) => {
            if (action === MessageBox.Action.OK && this._batchProcessingDisplay) {
              // Cancellation logic would go here if supported
              // Currently, we don't support cancellation of the SOAP requests
              this._batchProcessingDisplay.setStatus("Cancellation requested. Waiting for current batch to complete...");
            }
          }
        }
      );
    };

    /**
     * Set up progress indicator for submission
     */
    this._setupProgressIndicator = function () {
      // Set progress indicator function for overall progress
      this._soapService.setProgressIndicator((progress) => {
        // Update the upload summary model with the progress
        const uploadSummaryModel = this.oController.getView().getModel("uploadSummary");
        if (uploadSummaryModel) {
          uploadSummaryModel.setProperty("/uploadProgress", progress);
        }

        // Update progress bar
        const progressBar = this.oController.byId("uploadProgressBar");
        if (progressBar) {
          progressBar.setPercentValue(progress);
        }

        // Update status text if you have one
        const statusText = this.oController.byId("uploadStatusText");
        if (statusText) {
          statusText.setText(`Processing: ${progress}% complete`);
        }
      });

      // Set process display update function for detailed batch information
      this._soapService.setProcessDisplayUpdate((data) => {
        // Use the UIManager to update the batch processing display if it exists
        if (this.oController._uiManager && typeof this.oController._uiManager.updateBatchProcessingDisplay === 'function') {
          this.oController._uiManager.updateBatchProcessingDisplay(data);
        }

        if (this._batchProcessingDisplay) {
          // Check if each method exists before calling
          if (typeof this._batchProcessingDisplay.setTotalBatches === 'function') {
            this._batchProcessingDisplay.setTotalBatches(data.totalBatches || 0);
          }
          if (typeof this._batchProcessingDisplay.setCurrentBatch === 'function') {
            this._batchProcessingDisplay.setCurrentBatch(data.currentBatch || 0);
          }
          if (typeof this._batchProcessingDisplay.setProcessedBatches === 'function') {
            this._batchProcessingDisplay.setProcessedBatches(data.processedBatches || 0);
          }
          if (typeof this._batchProcessingDisplay.setTotalEntries === 'function') {
            this._batchProcessingDisplay.setTotalEntries(data.totalEntries || 0);
          }
          if (typeof this._batchProcessingDisplay.setProcessedEntries === 'function') {
            this._batchProcessingDisplay.setProcessedEntries(data.processedEntries || 0);
          }
          if (typeof this._batchProcessingDisplay.setEstimatedTimeRemaining === 'function') {
            this._batchProcessingDisplay.setEstimatedTimeRemaining(data.estimatedTimeRemaining || "Calculating...");
          }

          this._batchProcessingDisplay.setStatus(data.status || "Processing");

          if (data.error && typeof this._batchProcessingDisplay.setError === 'function') {
            this._batchProcessingDisplay.setError(data.error);
          }
        }
      });
    };
    /**
     * Handle submission result
     * @param {object} result - Submission result from SOAP service
     */
    this._handleSubmissionResult = function (result) {
      const journalEntriesModel = this.oController.getView().getModel("journalEntries");
      const uploadSummaryModel = this.oController.getView().getModel("uploadSummary");

      if (!journalEntriesModel) {
        console.error("Journal entries model not found");
        return;
      }

      const transactions = journalEntriesModel.getProperty("/transactions") || [];

      // Store all entries for potential export to Excel
      journalEntriesModel.setProperty("/processedEntries", result.allEntries);

      // Update batch processing display with final status
      if (this._batchProcessingDisplay) {
        const successCount = result.successEntries ? result.successEntries.length : 0;
        const failedCount = result.failedEntries ? result.failedEntries.length : 0;
        const totalCount = successCount + failedCount;

        this._batchProcessingDisplay.setStatus(
          result.status === "SUCCESS" ? "Completed successfully" :
            result.status === "PARTIAL" ? `Completed with partial success (${successCount}/${totalCount} entries successful)` :
              "Failed with errors"
        );

        if (result.status !== "SUCCESS" && typeof this._batchProcessingDisplay.setError === 'function') {
          this._batchProcessingDisplay.setError(
            `${failedCount} entries failed. Check the error details for more information.`
          );
        }

        // Display processing metrics
        if (result.processingMetrics) {
          const processTime = result.processingMetrics.processingTime;
          const formattedTime = this._formatProcessingTime(processTime);

          // Add processing time to status
          if (typeof this._batchProcessingDisplay.getStatus === 'function') {
            const currentStatus = this._batchProcessingDisplay.getStatus();
            this._batchProcessingDisplay.setStatus(`${currentStatus} (Total processing time: ${formattedTime})`);
          }
        }
      }

      // Count unique journal entries by sequence ID
      const getUniqueJournalCount = (entries) => {
        if (!entries || !Array.isArray(entries)) return 0;
        const uniqueIds = new Set();
        entries.forEach(entry => {
          if (entry && entry["Sequence ID"]) {
            uniqueIds.add(entry["Sequence ID"]);
          }
        });
        return uniqueIds.size;
      };

      // Check if there were any actual failures
      const hasFailures = result.failedEntries && result.failedEntries.length > 0;

      if (!hasFailures) {
        // Complete success case
        this._handleCompleteSuccess(result.successEntries);

        // Log successful submission with accurate journal entry count
        const journalEntryCount = getUniqueJournalCount(result.successEntries);
        console.log("Successfully submitted journal entries:", journalEntryCount);

        // Reset summary and entries        
        if (typeof this.oController._resetModels === 'function') {
          this.oController._resetModels();
        }
      }
      else if (result.successEntries && result.successEntries.length > 0) {
        // Partial success (both successes and failures)
        this._handlePartialSuccess(result, transactions);
      }
      else {
        // Complete failure
        this._handleCompleteFailure(result.failedEntries);
      }
    };

    /**
     * Format processing time into readable string
     * @param {number} milliseconds - Time in milliseconds
     * @returns {string} Formatted time string
     */
    this._formatProcessingTime = function (milliseconds) {
      if (!milliseconds) return "Unknown";

      const seconds = Math.floor(milliseconds / 1000);

      if (seconds < 60) {
        return `${seconds} seconds`;
      } else if (seconds < 3600) {
        const minutes = Math.floor(seconds / 60);
        const remainingSeconds = seconds % 60;
        return `${minutes} minute${minutes > 1 ? 's' : ''} ${remainingSeconds} second${remainingSeconds !== 1 ? 's' : ''}`;
      } else {
        const hours = Math.floor(seconds / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);
        return `${hours} hour${hours > 1 ? 's' : ''} ${minutes} minute${minutes > 1 ? 's' : ''}`;
      }
    };

    /**
     * Handle complete success submission
     * @param {array} successEntries - Successfully submitted entries
     */
    this._handleCompleteSuccess = function (successEntries) {
      const uploadSummaryModel = this.oController.getView().getModel("uploadSummary");
      const journalEntriesModel = this.oController.getView().getModel("journalEntries");

      // Update processing status
      uploadSummaryModel.setProperty("/ProcessingComplete", true);

      // Store document information in the model
      const documentInfo = this._extractPostedDocumentsFromEntries(successEntries);
      journalEntriesModel.setProperty("/postedDocuments", documentInfo);

      // Show success with document information
      this.oController._uiManager.showSuccessWithDocuments(successEntries);
    };

    /**
     * Handle partial success submission
     * @param {object} result - Submission result
     * @param {array} transactions - Original transactions
     */
    this._handlePartialSuccess = function (result, transactions) {
      const journalEntriesModel = this.oController.getView().getModel("journalEntries");
      const failedEntries = result.failedEntries;
      const successEntries = result.successEntries;

      // Count by unique sequence IDs
      const getUniqueJournalCount = (entries) => {
        const uniqueIds = new Set();
        entries.forEach(entry => uniqueIds.add(entry["Sequence ID"]));
        return uniqueIds.size;
      };

      const failedCount = getUniqueJournalCount(failedEntries);
      const successCount = getUniqueJournalCount(successEntries);

      // Show partial success with document information
      this.oController._uiManager.showPartialSuccessWithDocuments(
        successEntries,
        failedEntries,
        successCount,
        failedCount
      );

      // Update model with failed entries
      const updatedTransactions = transactions.map((entry) => {
        const failedEntry = result.failedEntries.find(
          (failed) => failed["Sequence ID"] === entry["Sequence ID"]
        );

        return failedEntry
          ? {
            ...entry,
            status: "Invalid",
            uploadError: failedEntry.statusMessage || "Unknown error"
          }
          : entry;
      });

      journalEntriesModel.setProperty("/transactions", updatedTransactions);
      journalEntriesModel.setProperty(
        "/postedDocuments",
        this._extractPostedDocumentsFromEntries(successEntries)
      );
    };

    /**
     * Handle complete failure submission
     * @param {array} failedEntries - Failed entries
     */
    this._handleCompleteFailure = function (failedEntries) {
      // Count by unique IDs
      const uniqueIds = new Set();
      failedEntries.forEach(entry => uniqueIds.add(entry["Sequence ID"]));
      const failedCount = uniqueIds.size;

      console.log("Failed to submit journal entries:", failedCount);
      this.oController._uiManager.showErrorWithDetails(failedEntries);
    };

    /**
     * Extract posted document information from success entries
     * @param {array} successEntries - Array of successful entry objects
     * @returns {array} Extracted document information
     */
    this._extractPostedDocumentsFromEntries = function (successEntries) {
      return successEntries.map(entry => {
        // Initialize variables
        let documentNumber = "";
        let companyCode = "";
        let fiscalYear = "";

        // Extract document information from entry
        if (entry.documentInfo) {
          documentNumber = entry.documentInfo.documentNumber || "";
          companyCode = entry.documentInfo.companyCode || "";
          fiscalYear = entry.documentInfo.fiscalYear || "";
        } else if (entry.documentNumber) {
          documentNumber = entry.documentNumber || "";
          companyCode = entry.companyCode || "";
          fiscalYear = entry.fiscalYear || "";
        }

        // If we have a full document string like "070002074510002024"
        // Try to match document number patterns from BKPFF messages
        const bkpffMatch = entry.statusMessage && entry.statusMessage.match(/BKPFF\s+(\d+)\s/);
        if (bkpffMatch && bkpffMatch[1]) {
          const fullDocString = bkpffMatch[1];
          // Extract components from the full string
          // Format is typically: document number + company code + fiscal year
          if (fullDocString.length >= 16) { // Ensuring we have enough characters
            // Assuming fiscal year is always the last 4 digits
            fiscalYear = fullDocString.slice(-4);
            // Assuming company code is the 4 digits before fiscal year
            companyCode = fullDocString.slice(-8, -4);
            // Document number is everything else
            documentNumber = fullDocString.slice(0, -8);
          }
        }

        // Create display text with proper formatting
        const displayText = `Document ${documentNumber} (Company Code: ${companyCode}, Fiscal Year: ${fiscalYear})`;

        return {
          documentNumber: documentNumber,
          companyCode: companyCode,
          fiscalYear: fiscalYear,
          sequenceId: entry["Sequence ID"],
          message: entry.statusMessage || "",
          displayText: displayText,
          formattedDocNumber: `${documentNumber}/${companyCode}/${fiscalYear}`
        };
      }).filter(doc => doc.documentNumber); // Only return documents with a document number
    };

    /**
     * Navigate to document display (e.g., in SAP Fiori)
     * @param {object} docInfo - Document information
     */
    this.navigateToDocumentDisplay = function (docInfo) {
      // Navigate to document display app or open in a new window
      const oCrossAppNav = sap.ushell && sap.ushell.Container &&
        sap.ushell.Container.getService("CrossApplicationNavigation");

      if (oCrossAppNav) {
        // Navigate to standard document display app
        oCrossAppNav.toExternal({
          target: {
            semanticObject: "AccountingDocument",
            action: "display"
          },
          params: {
            CompanyCode: docInfo.companyCode,
            AccountingDocument: docInfo.documentNumber,
            FiscalYear: docInfo.fiscalYear
          }
        });
      } else {
        // Fallback: just show information
        MessageBox.information(
          `Document Details:\n` +
          `Document Number: ${docInfo.documentNumber}\n` +
          `Company Code: ${docInfo.companyCode}\n` +
          `Fiscal Year: ${docInfo.fiscalYear}`
        );
      }
    };
  };
});