sap.ui.define(
  [
    // Core utilities needed
    "sap/ui/model/json/JSONModel",
    "sap/ui/core/Fragment",
    "sap/ui/core/library",
    "sap/ui/core/format/DateFormat"
  ],
  function (
    JSONModel,
    Fragment,
    coreLibrary,
    DateFormat
  ) {
    "use strict";

    /**
     * UIManager
     * Responsible for handling UI components, dialogs, and views using fragments.
     * Requires an instance of the ErrorHandler utility to be passed during construction.
     */
    return function (oController, oErrorHandlerInstance) {
      // Validate inputs
      if (!oController || !oController.getView) {
        throw new Error("UIManager requires a valid controller instance with getView() method");
      }

      if (!oErrorHandlerInstance || typeof oErrorHandlerInstance.showError !== 'function') {
        throw new Error("UIManager requires a valid ErrorHandler instance");
      }

      // Store references safely
      this._controller = oController; // Changed from this.oController to avoid potential conflicts
      this._errorHandler = oErrorHandlerInstance;
      this._dialogs = {};
      this._batchProcessingDisplay = null;
      this._helpControllerContext = null;

      // --- Private Helper Methods ---

      /**
       * Helper function to load and show fragment-based dialogs consistently.
       * Manages dialog caching (prioritizing internal cache), model setting, lifecycle, and error handling.
       */
      this.loadAndShowDialog = function (dialogId, fragmentName, oModel, modelName, oControllerOverride) {
        const sFragmentInstanceId = this._controller.getView().createId(dialogId);
        const oView = this._controller.getView();

        return new Promise((resolve, reject) => {
          // Check cache first
          let oExistingDialog = this._dialogs[dialogId];

          const openDialog = (oDialog) => {
            if (!oDialog || oDialog.bIsDestroyed) {
              const error = new Error(`Invalid or destroyed dialog: ${dialogId}`);
              console.error(`UIManager: ${error.message}`);
              delete this._dialogs[dialogId];
              reject(error);
              return;
            }

            if (oModel) {
              oDialog.setModel(oModel, modelName || undefined);
            }

            if (typeof oDialog.isOpen === 'function' && !oDialog.isOpen()) {
              oDialog.open();
            }

            resolve(oDialog);
          };

          // Reuse cached dialog if available
          if (oExistingDialog && !oExistingDialog.bIsDestroyed) {
            if (sap.ui.getCore().byId(oExistingDialog.getId())) {
              console.log(`UIManager: Reusing dialog ${dialogId}`);
              openDialog(oExistingDialog);
              return;
            }
            delete this._dialogs[dialogId];
          }

          // Load new fragment
          Fragment.load({
            id: sFragmentInstanceId,
            name: fragmentName,
            controller: oControllerOverride || this._controller
          }).then((oDialog) => {
            if (!oDialog) {
              reject(new Error("Fragment.load resolved without a control"));
              return;
            }

            const dialogInstance = Array.isArray(oDialog) ? oDialog[0] : oDialog;
            this._dialogs[dialogId] = dialogInstance;
            oView.addDependent(dialogInstance);
            openDialog(dialogInstance);
          }).catch((error) => {
            console.error(`UIManager: Error loading ${fragmentName}`, error);
            this._errorHandler.showError(`Could not load ${fragmentName}`, error.message);
            reject(error);
          });
        });
      };

      // --- Public Dialog Display Methods ---
      /**
       * Close a dialog
       */
      this.closeDialog = function (dialogId, destroy = false) {
        try {
          const oDialog = this._dialogs[dialogId] ||
            sap.ui.getCore().byId(this._controller.getView().createId(dialogId));

          if (oDialog && !oDialog.bIsDestroyed) {
            if (typeof oDialog.close === 'function') {
              oDialog.close();
            }

            if (destroy) {
              setTimeout(() => {
                if (!oDialog.bIsDestroyed) {
                  oDialog.destroy();
                }
                delete this._dialogs[dialogId];
              }, 300);
            }
            return true;
          }
          return false;
        } catch (error) {
          console.error(`UIManager: Error closing ${dialogId}`, error);
          return false;
        }
      };
      /** Handles display of validation errors using the ValidationErrorsDialog fragment. @public */
      this.handleValidationErrors = function (errors) {
        console.log("UIManager: Handling validation errors (using Fragment)...");
        if (!errors || !errors.length) { return; }
        const uniqueErrors = this._errorHandler.formatValidationErrors(errors);
        if (!uniqueErrors.length) { return; }

        // Create flat list with category info for simpler fragment binding
        const flatErrorsWithCategory = uniqueErrors.map(error => {
          let errorType = "Data Validation";
          if (typeof error.message === 'string') { /* ... category logic ... */
            if (error.message.includes("not balanced")) errorType = "Balance Error";
            else if (error.message.includes("must have") || error.message.includes("Missing")) errorType = "Missing Data";
            else if (error.message.includes("required")) errorType = "Required Fields";
            else if (error.message.includes("format") || error.message.includes("invalid")) errorType = "Format Error";
            else if (error.message.toLowerCase().includes("odata")) errorType = "OData Error";
            else if (error.message.toLowerCase().includes("technical")) errorType = "Technical Error";
          }
          return { ...error, category: errorType };
        });

        // Store the original grouped structure needed for export
        const groupedErrorsMap = uniqueErrors.reduce((groups, error) => {
          let errorType = "Data Validation";
          if (typeof error.message === 'string') { /* ... category logic ... */
            if (error.message.includes("not balanced")) errorType = "Balance Error";
            else if (error.message.includes("must have") || error.message.includes("Missing")) errorType = "Missing Data";
            else if (error.message.includes("required")) errorType = "Required Fields";
            else if (error.message.includes("format") || error.message.includes("invalid")) errorType = "Format Error";
            else if (error.message.toLowerCase().includes("odata")) errorType = "OData Error";
            else if (error.message.toLowerCase().includes("technical")) errorType = "Technical Error";
          }
          const categoryKey = errorType;
          if (!groups[categoryKey]) { groups[categoryKey] = { category: categoryKey, errors: [] }; }
          groups[categoryKey].errors.push(error);
          return groups;
        }, {});

        const oValidationModel = new JSONModel({
          flatErrors: flatErrorsWithCategory, // Use the flat list for the fragment
          errorCount: uniqueErrors.length,
          _rawGroupedData: groupedErrorsMap // Keep grouped data for export function
        });

        // Destroy this dialog on close
        this.loadAndShowDialog(
          "validationErrorsDialog",
          "wbscreate.view.ValidationErrorsDialog", // <<< ADJUST NAMESPACE
          oValidationModel,
          "validation", // Model name used in fragment
          this.oController // Main controller handles actions
        );
      };

      /** Export error list to CSV file. @public */
      this.exportValidationErrors = function (groupedErrorsData) {
        // ... (implementation unchanged) ...
        console.log("UIManager: Exporting validation errors...");
        if (!groupedErrorsData || Object.keys(groupedErrorsData).length === 0) { this.errorHandler.showWarning("No errors available to export."); return; }
        try {
          let csvContent = "SequenceNumber,Category,Field,Error\n";
          Object.values(groupedErrorsData).forEach(({ category, errors }) => { errors.forEach((error) => { const errorSeqId = error.sequenceId || "N/A"; const errorField = error.field || "Unknown"; const message = error.message || "Error Description Missing"; const escapeCSV = (val) => `"${String(val).replace(/"/g, '""')}"`; csvContent += `${escapeCSV(errorSeqId)},${escapeCSV(category)},${escapeCSV(errorField)},${escapeCSV(message)}\n`; }); });
          const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" }); const link = document.createElement("a");
          if (link.download !== undefined) { const url = URL.createObjectURL(blob); link.setAttribute("href", url); link.setAttribute("download", `validation_errors_${new Date().toISOString().slice(0, 10)}.csv`); link.style.visibility = 'hidden'; document.body.appendChild(link); link.click(); document.body.removeChild(link); setTimeout(() => URL.revokeObjectURL(url), 100); this.errorHandler.showSuccess("Validation errors exported successfully."); }
          else { throw new Error("Browser does not support automatic download."); }
        } catch (error) { console.error("UIManager: Error exporting validation errors CSV:", error); this.errorHandler.showError("Failed to export validation errors.", error.message); }
      };


      /**
       * Enhanced showEntryDetailsDialog with better error handling
       * @param {object} oEntry - The entry data to display
       * @param {boolean} [forceNewInstance=false] - Whether to create a new dialog instance
       * @public
       */
      this.showEntryDetailsDialog = function (oEntry, forceNewInstance = false) {
        console.log("UIManager: Showing entry details dialog...");

        // Validate input data
        if (!oEntry) {
          this.errorHandler.showWarning("Cannot show details: No entry data provided.");
          return;
        }

        const dialogId = "entryDetailsDialog";
        const fragmentName = "wbscreate.view.EntryDetailsDialog";

        try {
          // Deep clone to avoid reference issues
          const oEntryData = JSON.parse(JSON.stringify(oEntry));

          // Ensure ValidationErrors array exists
          if (!oEntryData.ValidationErrors) {
            oEntryData.ValidationErrors = [];
          }

          // If forcing new instance, destroy existing dialog
          if (forceNewInstance && this._dialogs[dialogId]) {
            this.closeDialog(dialogId, true);
          }

          // Open dialog with prepared data
          this.loadAndShowDialog(
            dialogId,
            fragmentName,
            new JSONModel(oEntryData),
            "entryDetails",
            {
              onEntryDetailsDialogClose: () => {
                this.closeDialog(dialogId, false);
              }
            }
          ).catch(error => {
            console.error("UIManager: Failed to show entry details dialog:", error);
            this.errorHandler.showError(
              "Failed to display entry details",
              "Please try again or contact support if the issue persists."
            );
          });

        } catch (error) {
          console.error("UIManager: Error preparing entry details data:", error);
          this.errorHandler.showError(
            "Failed to process entry details",
            error.message || "Unknown error occurred while processing data."
          );
        }
      };

      /** Shows error summary dialog, destroys on close. @public */
      this.showErrorSummaryDialog = function (errors, exportManager) {
        console.log("UIManager: Showing error summary...");
        const dialogId = "errorSummaryDialog"; const fragmentName = "wbscreate.view.ErrorSummaryDialog"; // <<< ADJUST NAMESPACE
        const oErrorModel = new JSONModel({ errors: (errors || []).map(e => typeof e === 'string' ? { message: e } : (e || { message: "Invalid error entry" })) });
        // Destroy this dialog on close
        this.loadAndShowDialog(dialogId, fragmentName, oErrorModel, "errors", { onErrorDialogClose: () => this.closeDialog(dialogId, true), onExportErrors: () => { const errorData = oErrorModel.getProperty("/errors"); if (exportManager && typeof exportManager.exportToExcel === 'function') { exportManager.exportToExcel(errorData, "ErrorSummary.xlsx"); this.errorHandler.showSuccess("Error summary exported."); } else { this.errorHandler.showWarning("Export functionality for error summary is not available."); } this.closeDialog(dialogId, true); } });
      };

      /** Show validation statistics dialog, destroys on close. @public */
      this.showValidationStatsDialog = function (total = 0, successful = 0, failed = 0) {
        console.log("UIManager: Showing validation stats...");
        const safeTotal = total > 0 ? total : 1; const successRate = Math.round((successful / safeTotal) * 100);
        const oStatsModel = new JSONModel({ total, successful, failed, successRate });
        const dialogId = "validationStatsDialog"; const fragmentName = "wbscreate.view.ValidationStatsDialog"; // <<< ADJUST NAMESPACE
        // Destroy this dialog on close
        this.loadAndShowDialog(dialogId, fragmentName, oStatsModel, "stats", { onValidationStatsDialogClose: () => this.closeDialog(dialogId, true) });
      };

      /** Show help dialog, reuses instance. @public */
      this.showHelpDialog = function (controllerContext) {
        console.log("UIManager: Showing help dialog...");

        // Store controller context for template download
        this._helpControllerContext = controllerContext &&
          typeof controllerContext.onDownloadTemplate === 'function' ?
          controllerContext : null;

        if (!this._helpControllerContext) {
          console.warn("UIManager: Help dialog context for onDownloadTemplate is missing.");
        }

        const dialogId = "helpDialog";
        const fragmentName = "wbscreate.view.HelpDialog"; // Ensure this path is correct

        // Create a controller object with the specific handlers needed
        const dialogController = {
          onHelpDialogClose: () => {
            this.closeDialog(dialogId, false);
            this._helpControllerContext = null;
          },

          // This is the critical function to fix the download link:
          onDownloadTemplate: () => {
            console.log("UIManager: onDownloadTemplate called from help dialog");
            if (this._helpControllerContext &&
              typeof this._helpControllerContext.onDownloadTemplate === 'function') {
              this._helpControllerContext.onDownloadTemplate();
            } else {
              this._errorHandler.showWarning(
                "Cannot download template: Application context not available."
              );
            }
          }
        };

        // Pass the dedicated controller for help dialog
        this.loadAndShowDialog(
          dialogId,
          fragmentName,
          null,
          null,
          dialogController  // Pass the special controller with handlers
        );
      };
      // --- Result Dialogs (Success, Partial, Error) - Destroy on close ---
      /** Shows success dialog. @public */
      this.showSuccessWithDocuments = function (successEntries) {
        const dialogId = "successDialog"; const fragmentName = "wbscreate.view.SuccessDialog"; // <<< ADJUST NAMESPACE
        if (!successEntries || !successEntries.length) { this.errorHandler.showSuccess("Operation completed successfully!"); return; }
        const formattedDocuments = this._formatDocumentsForDisplay(successEntries); const oModel = new JSONModel({ documents: formattedDocuments, entryCount: successEntries.length, title: "Submission Successful", message: `${successEntries.length} document(s) submitted successfully.` });
        this.loadAndShowDialog(dialogId, fragmentName, oModel, "success", { onSuccessDialogClose: () => { if (this.oController && typeof this.oController.onSuccessDialogClose === 'function') { this.oController.onSuccessDialogClose(); } else { this.closeDialog(dialogId, true); } } }); // Destroy
      };
      /** Show partial success dialog. @public */
      this.showPartialSuccessWithDocuments = function (successEntries, failedEntries) {
        const dialogId = "partialSuccessDialog"; const fragmentName = "wbscreate.view.PartialSuccessDialog"; // <<< ADJUST NAMESPACE
        const successCount = (successEntries || []).length; const failedCount = (failedEntries || []).length;
        if (successCount === 0 && failedCount === 0) { this.errorHandler.showWarning("No entries were processed."); return; } if (failedCount === 0) { this.showSuccessWithDocuments(successEntries); return; } if (successCount === 0) { this.showErrorWithDetails(failedEntries); return; }
        const formattedDocuments = this._formatDocumentsForDisplay(successEntries); const formattedErrors = this._formatErrorsForDisplay(failedEntries); const oModel = new JSONModel({ documents: formattedDocuments, errors: formattedErrors, successCount: successCount, failedCount: failedCount, title: "Partial Submission", message: `${successCount} succeeded, ${failedCount} failed.` });
        this.loadAndShowDialog(dialogId, fragmentName, oModel, "partial", { onPartialSuccessDialogClose: () => { if (this.oController && typeof this.oController.onPartialSuccessDialogClose === 'function') { this.oController.onPartialSuccessDialogClose(); } else { this.closeDialog(dialogId, true); } } }); // Destroy
      };
      /** Show error details dialog. @public */
      this.showErrorWithDetails = function (failedEntries) {
        const dialogId = "errorDialog"; const fragmentName = "wbscreate.view.ErrorDialog"; // <<< ADJUST NAMESPACE
        if (!failedEntries || !failedEntries.length) { this.errorHandler.showError("Submission failed, but no specific error details were provided."); return; }
        const formattedErrors = this._formatErrorsForDisplay(failedEntries); const oModel = new JSONModel({ errors: formattedErrors, errorCount: failedEntries.length, title: "Submission Failed", message: `${failedEntries.length} document(s) failed to submit.` });
        this.loadAndShowDialog(dialogId, fragmentName, oModel, "error", { onErrorDialogClose: () => { if (this.oController && typeof this.oController.onErrorDialogClose === 'function') { this.oController.onErrorDialogClose(); } else { this.closeDialog(dialogId, true); } } }); // Destroy
      };

      // --- Batch Processing Display (implementation unchanged) ---
      /** Initialize batch processing display. @public */
      this.initBatchProcessingDisplay = function (container) { /* ... */
        console.log("UIManager: Initializing batch processing display...");
        return new Promise((resolve, reject) => {
          if (!container || typeof container.addContent !== 'function') { const errorMsg = "Valid container with addContent method required for batch processing display."; console.error(`UIManager: ${errorMsg}`); return reject(new Error(errorMsg)); }
          const fragmentName = "wbscreate.view.BatchProcessingDisplayDialog"; const fragmentId = this.oController.getView().createId("batchProcessingDisplayFragment");
          if (this._batchProcessingDisplay) { console.log("UIManager: Batch processing display already initialized."); this._batchProcessingDisplay.setVisible(true); return resolve(this._batchProcessingDisplay); }
          Fragment.load({ id: fragmentId, name: fragmentName, controller: this.oController })
            .then((oFragmentContent) => { if (!oFragmentContent) throw new Error("Batch processing fragment loaded as null/undefined."); console.log("UIManager: Batch processing fragment loaded successfully."); const oModel = new JSONModel({ status: "Ready", error: "", totalBatches: 0, currentBatch: 0, processedBatches: 0, totalEntries: 0, processedEntries: 0, progressPercent: 0, progressText: "0/0", timeRemaining: "Calculating...", visible: false }); this.oController.getView().setModel(oModel, "batchDisplay"); container.addContent(oFragmentContent); this._batchProcessingDisplay = this._createBatchDisplayInterface(oModel); console.log("UIManager: Batch processing display initialized."); resolve(this._batchProcessingDisplay); })
            .catch((error) => { const msg = `Error loading fragment ${fragmentName}`; console.error(`UIManager: ${msg}`, error); this.errorHandler.showError(msg, error.message || error); reject(error); });
        });
      };
      /** Creates the interface object for controlling the batch display. @private */
      this._createBatchDisplayInterface = function (oModel) { /* ... */
        const modelPath = "/"; const updateDerivedProperties = () => { const data = oModel.getData(); const total = data.totalBatches > 0 ? data.totalBatches : 1; const current = data.processedBatches || 0; const percent = Math.round((current / total) * 100); oModel.setProperty(modelPath + "progressPercent", percent); const progressText = `Batch ${current} / ${data.totalBatches || 0}`; oModel.setProperty(modelPath + "progressText", progressText); }; updateDerivedProperties();
        return { _model: oModel, setVisible: function (bVisible) { this._model.setProperty(modelPath + "visible", !!bVisible); return this; }, reset: function () { this._model.setData({ status: "Ready", error: "", totalBatches: 0, currentBatch: 0, processedBatches: 0, totalEntries: 0, processedEntries: 0, progressPercent: 0, progressText: "0/0", timeRemaining: "Calculating...", visible: false }); updateDerivedProperties(); return this; }, setStatus: function (sStatus) { this._model.setProperty(modelPath + "status", sStatus || "Ready"); if (sStatus !== "Error") { this._model.setProperty(modelPath + "error", ""); } return this; }, setError: function (sError) { this._model.setProperty(modelPath + "error", sError || ""); if (sError) this.setStatus("Error"); return this; }, setTotalBatches: function (iValue) { this._model.setProperty(modelPath + "totalBatches", parseInt(iValue, 10) || 0); updateDerivedProperties(); return this; }, setProcessedBatches: function (iValue) { const val = parseInt(iValue, 10) || 0; this._model.setProperty(modelPath + "processedBatches", val); this._model.setProperty(modelPath + "currentBatch", val); updateDerivedProperties(); return this; }, incrementProcessedBatches: function () { const current = this._model.getProperty(modelPath + "processedBatches") || 0; this.setProcessedBatches(current + 1); return this; }, setTotalEntries: function (iValue) { this._model.setProperty(modelPath + "totalEntries", parseInt(iValue, 10) || 0); updateDerivedProperties(); return this; }, setProcessedEntries: function (iValue) { this._model.setProperty(modelPath + "processedEntries", parseInt(iValue, 10) || 0); updateDerivedProperties(); return this; }, setEstimatedTimeRemaining: function (sValue) { this._model.setProperty(modelPath + "timeRemaining", sValue || "Calculating..."); return this; } };
      };
      /** Updates batch processing display using its interface object. @public */
      this.updateBatchProcessingDisplay = function (data) { /* ... */
        if (!this._batchProcessingDisplay) { console.warn("UIManager: Batch processing display not initialized. Update ignored."); return; } if (!data || typeof data !== 'object') { console.warn("UIManager: Invalid data provided for batch display update."); return; }
        if (data.status !== undefined) this._batchProcessingDisplay.setStatus(data.status); if (data.error !== undefined) this._batchProcessingDisplay.setError(data.error); if (data.totalBatches !== undefined) this._batchProcessingDisplay.setTotalBatches(data.totalBatches); if (data.processedBatches !== undefined) this._batchProcessingDisplay.setProcessedBatches(data.processedBatches); if (data.totalEntries !== undefined) this._batchProcessingDisplay.setTotalEntries(data.totalEntries); if (data.processedEntries !== undefined) this._batchProcessingDisplay.setProcessedEntries(data.processedEntries); if (data.estimatedTimeRemaining !== undefined) this._batchProcessingDisplay.setEstimatedTimeRemaining(data.estimatedTimeRemaining); if (data.visible !== undefined) this._batchProcessingDisplay.setVisible(data.visible);
      };

      // --- Formatting Helpers ---
      /** Formats successfully processed entries for display. @private */
      this._formatDocumentsForDisplay = function (entries = []) { /* ... */
        return entries.map((entry) => { let docInfo = entry.documentInfo || {}; let matDoc = docInfo.MaterialDocument || entry.MaterialDocument || ""; let matDocYear = docInfo.MaterialDocumentYear || entry.MaterialDocumentYear || ""; let grnDoc = docInfo.GRNDocumentNumber || entry.GRNDocumentNumber || ""; let displayText = grnDoc ? `GRN: ${grnDoc}` : "Document Info Unavailable"; let formattedDocNumber = grnDoc; if (matDoc) { formattedDocNumber = `${matDoc} / ${matDocYear}`; displayText = `Material Doc: ${formattedDocNumber}`; } return { sequenceNumber: entry.SequenceNumber || entry.sequenceId || 'N/A', materialDocument: matDoc, materialDocumentYear: matDocYear, grnDocumentNumber: grnDoc, material: entry.Material || "", plant: entry.Plant || "", formattedDocNumber: formattedDocNumber, displayText: displayText, message: entry.statusMessage || "Success", statusCode: entry.statusCode || "200" }; });
      };
      /** Formats failed entries for display. @private */
      this._formatErrorsForDisplay = function (entries = []) { /* ... */
        return entries.map((entry) => { let errorMessages = []; if (entry.errorDetails && Array.isArray(entry.errorDetails)) { entry.errorDetails.forEach(detail => { const msg = detail.message || JSON.stringify(detail); if (msg && !errorMessages.includes(msg)) errorMessages.push(msg); }); } if (entry.ValidationErrors && Array.isArray(entry.ValidationErrors)) { entry.ValidationErrors.forEach(valError => { const msg = (typeof valError === 'string') ? valError : (valError.message || JSON.stringify(valError)); if (msg && !errorMessages.includes(msg)) errorMessages.push(msg); }); } if (entry.statusMessage && !errorMessages.includes(entry.statusMessage)) { errorMessages.push(entry.statusMessage); } if (errorMessages.length === 0) { errorMessages.push("Unknown processing error occurred."); } return { sequenceNumber: entry.SequenceNumber || entry.sequenceId || 'N/A', material: entry.Material || "", plant: entry.Plant || "", grnDocumentNumber: entry.GRNDocumentNumber || "", statusCode: entry.statusCode || "Error", statusMessage: entry.statusMessage || errorMessages[0], errorDetails: errorMessages, timestamp: new Date().toISOString() }; });
      };

    }; // End of returned constructor function
  }
);
