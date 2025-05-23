sap.ui.define(
  [
    // Core utilities needed
    "sap/ui/model/json/JSONModel",
    "sap/ui/core/Fragment",
  ],
  function (
    JSONModel,
    Fragment,
  ) {
    "use strict";

    /**
     * UIManager
     * Responsible for handling UI components, dialogs, and views using fragments.
     * Requires an instance of the ErrorHandler utility to be passed during construction.
     */
    return function (oController, oErrorHandlerInstance) {
      // --- Instance Setup ---
      if (!oController) { throw new Error("UIManager requires a controller instance."); }
      if (!oErrorHandlerInstance || typeof oErrorHandlerInstance.showError !== 'function') {
        throw new Error("UIManager requires a valid ErrorHandler instance with at least a 'showError' method.");
      }
      this.oController = oController;
      this.errorHandler = oErrorHandlerInstance;
      this._dialogs = {}; // Cache for dialog instances (using logical ID as key)
      this._batchProcessingDisplay = null;
      this._helpControllerContext = null;

      // --- Private Helper Methods ---

      /**
       * Helper function to load and show fragment-based dialogs consistently.
       * Manages dialog caching (prioritizing internal cache), model setting, lifecycle, and error handling.
       */
      this._loadAndShowDialog = function (dialogId, fragmentName, oModel, modelName, oControllerOverride) {
        const sFragmentInstanceId = this.oController.getView().createId(dialogId);

        const openDialog = (oDialog) => {
          if (!oDialog || oDialog.bIsDestroyed) {
            console.error(`UIManager: Attempted to open an invalid or destroyed dialog: ${dialogId}`);
            this.errorHandler.showError("Could not open the dialog window.", "Dialog Instance Error");
            delete this._dialogs[dialogId]; return;
          }
          if (oModel) {
            oDialog.setModel(oModel, modelName || undefined);
          }
          if (typeof oDialog.isOpen === 'function') {
            if (!oDialog.isOpen()) { oDialog.open(); }
            else { console.log(`UIManager: Dialog ${dialogId} is already open.`); }
          } else { console.warn(`UIManager: Control loaded for ${dialogId} might not be a standard dialog.`); }
        };

        // --- SIMPLIFIED DIALOG LOOKUP (v2) ---
        // 1. Check internal cache first
        let oExistingDialog = this._dialogs[dialogId];

        // 2. If found in cache, verify it's not destroyed before reusing
        if (oExistingDialog && !oExistingDialog.bIsDestroyed) {
          // Check if the control still exists in the core using its ID from the cache
          // This helps catch cases where the view might have been destroyed externally
          if (sap.ui.getCore().byId(oExistingDialog.getId())) {
            console.log(`UIManager: Reusing dialog from cache: ${dialogId} (Instance ID: ${oExistingDialog.getId()})`);
            openDialog(oExistingDialog); // Update model and open
            return; // Reuse successful
          } else {
            // Control exists in cache but not in core registry - likely destroyed externally
            console.warn(`UIManager: Dialog ${dialogId} found in cache but not in core registry. Clearing cache.`);
            delete this._dialogs[dialogId];
            oExistingDialog = null; // Force reload
          }
        } else if (oExistingDialog && oExistingDialog.bIsDestroyed) {
          // Reference exists in cache but points to a destroyed control
          console.log(`UIManager: Dialog ${dialogId} found in cache but was destroyed. Clearing cache.`);
          delete this._dialogs[dialogId]; // Clean up destroyed reference
          oExistingDialog = null; // Force reload
        }
        // --- END SIMPLIFIED LOOKUP (v2) ---


        // 3. Load fragment if not found or destroyed
        console.log(`UIManager: Loading fragment: ${fragmentName} for dialog: ${dialogId} (Instance ID: ${sFragmentInstanceId})`);
        // Cache is already cleared if needed by checks above

        Fragment.load({
          id: sFragmentInstanceId, // Assign the unique, view-prefixed ID
          name: fragmentName,
          controller: oControllerOverride || this.oController // Use override or main controller
        }).then((oDialog) => {
          if (!oDialog) { throw new Error("Fragment.load resolved without a valid control instance."); }
          const dialogInstance = Array.isArray(oDialog) ? oDialog[0] : oDialog;
          if (!dialogInstance || typeof dialogInstance.addDependent !== 'function') { throw new Error("Loaded fragment root is not a valid control instance."); }

          this._dialogs[dialogId] = dialogInstance; // Cache the NEW instance
          this.oController.getView().addDependent(dialogInstance);
          console.log(`UIManager: Fragment loaded and added as dependent: ${dialogId}`);
          openDialog(dialogInstance);

        }).catch((error) => {
          const msg = `Could not load dialog fragment: ${fragmentName}`;
          console.error(`UIManager: ${msg}`, error);
          this.errorHandler.showError(msg, error.message || error);
          delete this._dialogs[dialogId]; // Clean cache ONLY on error
        });
      }; // End of _loadAndShowDialog

      /** Closes and potentially destroys a dialog. @public */
      // Update the closeDialog method in UIManager.js
      this.closeDialog = function (dialogId) {
        if (!dialogId) return;

        console.log("Attempting to close dialog: " + dialogId);

        // First try to get the dialog from our cache
        let oDialog = this._dialogs[dialogId];

        // If not in cache or destroyed, try different ways to find it
        if (!oDialog || oDialog.bIsDestroyed) {
          // Try view-prefixed ID
          const sFragmentInstanceId = this.oController.getView().createId(dialogId);
          oDialog = sap.ui.getCore().byId(sFragmentInstanceId);

          // If not found with view prefix, try direct ID
          if (!oDialog) {
            oDialog = sap.ui.getCore().byId(dialogId);
          }

          // If still not found, try fragment ID
          if (!oDialog) {
            oDialog = sap.ui.core.Fragment.byId(dialogId, dialogId);
          }
        }

        // Close if found and has close method
        if (oDialog && typeof oDialog.close === 'function') {
          oDialog.close();
          console.log(`Dialog closed: ${dialogId}`);
        } else {
          console.warn(`Unable to close dialog: ${dialogId} - not found or not a dialog`);
        }
      }

      // --- Public Dialog Display Methods ---

      /** Handles display of validation errors using the ValidationErrorsDialog fragment. @public */
      this.handleValidationErrors = function (errors) {
        console.log("UIManager: Handling validation errors (using Fragment)...");
        if (!errors || !errors.length) { return; }
        const uniqueErrors = this.errorHandler.formatValidationErrors(errors);
        if (!uniqueErrors.length) { return; }

        // Create flat list with category info for simpler fragment binding
        // Create flat list with category info for simpler fragment binding
        const flatErrorsWithCategory = uniqueErrors.map(error => {
          let errorType = "Data Validation";
          if (typeof error.message === 'string') {
            if (error.message.includes("must have") || error.message.includes("Missing")) errorType = "Missing Data";
            else if (error.message.includes("required")) errorType = "Required Fields";
            else if (error.message.includes("format") || error.message.includes("invalid")) errorType = "Format Error";
            else if (error.message.toLowerCase().includes("odata")) errorType = "OData Error";
            else if (error.message.toLowerCase().includes("technical")) errorType = "Technical Error";
            else if (error.message.toLowerCase().includes("wbs")) errorType = "WBS Element Error";
            else if (error.message.toLowerCase().includes("gl account")) errorType = "GL Account Error";
            else if (error.message.toLowerCase().includes("account assignment")) errorType = "Account Assignment Error";
            else if (error.message.toLowerCase().includes("special stock")) errorType = "Special Stock Error";
          }
          return { ...error, category: errorType };
        });

        // Store the original grouped structure needed for export
        const groupedErrorsMap = uniqueErrors.reduce((groups, error) => {
          let errorType = "Data Validation";
          if (typeof error.message === 'string') { /* ... category logic ... */
            if (error.message.includes("must have") || error.message.includes("Missing")) errorType = "Missing Data";
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
        this._loadAndShowDialog(
          "validationErrorsDialog",
          "assetmastercreate.view.ValidationErrorsDialog", // <<< ADJUST NAMESPACE
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

      /** Shows entry details dialog, reusing instance. @public */
      this.showEntryDetailsDialog = function (oEntry) {
        console.log("UIManager: Showing entry details (reuse enabled)...");
        if (!oEntry) { this.errorHandler.showWarning("Cannot show details: No entry data provided."); return; }

        // --- Prepare Data for Model ---
        const oEntryData = JSON.parse(JSON.stringify(oEntry));
        if (!oEntryData.ValidationErrors) oEntryData.ValidationErrors = [];
        oEntryData.ProcessedValidationErrors = oEntryData.ValidationErrors.map(error => { if (typeof error === 'string') return { message: error, field: 'Unknown', sheet: '' }; return { message: error.message || error.Message || JSON.stringify(error), field: error.field || error.Field || 'Unknown', sheet: error.sheet || error.Sheet || '' }; }).filter(error => error.message);

        const dialogId = "assetDetailsDialog";
        const fragmentName = "assetmastercreate.view.EntryDetailsDialog";
        // --- MODIFIED HERE: Pass main controller ---
        this._loadAndShowDialog(
          dialogId,
          fragmentName,
          new JSONModel(oEntryData),
          "entryDetails",
          this.oController // Pass main controller, assumes handlers exist there
        );
        // --- END MODIFICATION ---
      };

      /** Shows error summary dialog, destroys on close. @public */
      this.showErrorSummaryDialog = function (errors, exportManager) {
        console.log("UIManager: Showing error summary...");
        const dialogId = "errorSummaryDialog"; const fragmentName = "assetmastercreate.view.ErrorSummaryDialog"; // <<< ADJUST NAMESPACE
        const oErrorModel = new JSONModel({ errors: (errors || []).map(e => typeof e === 'string' ? { message: e } : (e || { message: "Invalid error entry" })) });
        // Destroy this dialog on close
        this._loadAndShowDialog(dialogId, fragmentName, oErrorModel, "errors", { onErrorDialogClose: () => this.closeDialog(dialogId, true), onExportErrors: () => { const errorData = oErrorModel.getProperty("/errors"); if (exportManager && typeof exportManager.exportToExcel === 'function') { exportManager.exportToExcel(errorData, "ErrorSummary.xlsx"); this.errorHandler.showSuccess("Error summary exported."); } else { this.errorHandler.showWarning("Export functionality for error summary is not available."); } this.closeDialog(dialogId, true); } });
      };

      /** Show validation statistics dialog, destroys on close. @public */
      this.showValidationStatsDialog = function (total = 0, successful = 0, failed = 0) {
        console.log("UIManager: Showing validation stats...");
        const safeTotal = total > 0 ? total : 1; const successRate = Math.round((successful / safeTotal) * 100);
        const oStatsModel = new JSONModel({ total, successful, failed, successRate });
        const dialogId = "validationStatsDialog"; const fragmentName = "assetmastercreate.view.ValidationStatsDialog"; // <<< ADJUST NAMESPACE
        // Destroy this dialog on close
        this._loadAndShowDialog(dialogId, fragmentName, oStatsModel, "stats", { onValidationStatsDialogClose: () => this.closeDialog(dialogId, true) });
      };

      /** Show help dialog, reuses instance. @public */
      this.showHelpDialog = function (controllerContext) {
        console.log("UIManager: Showing help dialog...");
        this._helpControllerContext = controllerContext && typeof controllerContext.onDownloadTemplate === 'function' ? controllerContext : null;
        if (!this._helpControllerContext) { console.warn("UIManager: Help dialog context for actions missing."); }
        const dialogId = "helpDialog"; const fragmentName = "assetmastercreate.view.HelpDialog"; // <<< ADJUST NAMESPACE
        // Do NOT destroy this dialog on close
        this._loadAndShowDialog(dialogId, fragmentName, null, null, { onHelpDialogClose: () => { this.closeDialog(dialogId, false); this._helpControllerContext = null; }, onDownloadTemplateLinkPress: () => { if (this._helpControllerContext) { this._helpControllerContext.onDownloadTemplate(); } else { this.errorHandler.showWarning("Cannot download template: Application context not available."); } } });
      };

      // --- Result Dialogs (Success, Partial, Error) - Destroy on close ---
      /** Shows success dialog. @public */
      this.showSuccessWithDocuments = function (successEntries) {
        const dialogId = "successDialog"; const fragmentName = "assetmastercreate.view.SuccessDialog"; // <<< ADJUST NAMESPACE
        if (!successEntries || !successEntries.length) { this.errorHandler.showSuccess("Operation completed successfully!"); return; }
        const formattedDocuments = this._formatDocumentsForDisplay(successEntries); const oModel = new JSONModel({ documents: formattedDocuments, entryCount: successEntries.length, title: "Submission Successful", message: `${successEntries.length} document(s) submitted successfully.` });
        this._loadAndShowDialog(dialogId, fragmentName, oModel, "success", { onSuccessDialogClose: () => { if (this.oController && typeof this.oController.onSuccessDialogClose === 'function') { this.oController.onSuccessDialogClose(); } else { this.closeDialog(dialogId, true); } } }); // Destroy
      };
      /** Show partial success dialog. @public */
      this.showPartialSuccessWithDocuments = function (successEntries, failedEntries) {
        const dialogId = "partialSuccessDialog"; const fragmentName = "assetmastercreate.view.PartialSuccessDialog"; // <<< ADJUST NAMESPACE
        const successCount = (successEntries || []).length; const failedCount = (failedEntries || []).length;
        if (successCount === 0 && failedCount === 0) { this.errorHandler.showWarning("No entries were processed."); return; } if (failedCount === 0) { this.showSuccessWithDocuments(successEntries); return; } if (successCount === 0) { this.showErrorWithDetails(failedEntries); return; }
        const formattedDocuments = this._formatDocumentsForDisplay(successEntries); const formattedErrors = this._formatErrorsForDisplay(failedEntries); const oModel = new JSONModel({ documents: formattedDocuments, errors: formattedErrors, successCount: successCount, failedCount: failedCount, title: "Partial Submission", message: `${successCount} succeeded, ${failedCount} failed.` });
        this._loadAndShowDialog(dialogId, fragmentName, oModel, "partial", { onPartialSuccessDialogClose: () => { if (this.oController && typeof this.oController.onPartialSuccessDialogClose === 'function') { this.oController.onPartialSuccessDialogClose(); } else { this.closeDialog(dialogId, true); } } }); // Destroy
      };
      /** Show error details dialog. @public */
      this.showErrorWithDetails = function (failedEntries) {
        const dialogId = "errorDialog"; const fragmentName = "assetmastercreate.view.ErrorDialog"; // <<< ADJUST NAMESPACE
        if (!failedEntries || !failedEntries.length) { this.errorHandler.showError("Submission failed, but no specific error details were provided."); return; }
        const formattedErrors = this._formatErrorsForDisplay(failedEntries); const oModel = new JSONModel({ errors: formattedErrors, errorCount: failedEntries.length, title: "Submission Failed", message: `${failedEntries.length} document(s) failed to submit.` });
        this._loadAndShowDialog(dialogId, fragmentName, oModel, "error", { onErrorDialogClose: () => { if (this.oController && typeof this.oController.onErrorDialogClose === 'function') { this.oController.onErrorDialogClose(); } else { this.closeDialog(dialogId, true); } } }); // Destroy
      };

      // --- Batch Processing Display (implementation unchanged) ---
      /** Initialize batch processing display. @public */
      this.initBatchProcessingDisplay = function (container) { /* ... */
        console.log("UIManager: Initializing batch processing display...");
        return new Promise((resolve, reject) => {
          if (!container || typeof container.addContent !== 'function') { const errorMsg = "Valid container with addContent method required for batch processing display."; console.error(`UIManager: ${errorMsg}`); return reject(new Error(errorMsg)); }
          const fragmentName = "assetmastercreate.view.BatchProcessingDisplay"; const fragmentId = this.oController.getView().createId("batchProcessingDisplayFragment");
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
      this._formatAssetsForDisplay = function (entries = []) {
        return entries.map((entry) => {
          // Extract basic asset information
          const companyCode = entry.CompanyCode || "";
          const assetClass = entry.AssetClass || "";
          const assetDescription = entry.FixedAssetDescription || "Asset Description Unavailable";

          // Format display text
          const displayText = companyCode && assetClass
            ? `${companyCode} - ${assetClass}: ${assetDescription}`
            : "Asset Information Unavailable";

          // Format capitalization date if available
          let capitalizationDate = "";
          if (entry.LedgerInformation && entry.LedgerInformation.length > 0) {
            const date = new Date(entry.LedgerInformation[0].AssetCapitalizationDate);
            if (!isNaN(date)) {
              capitalizationDate = date.toLocaleDateString();
            }
          }

          return {
            // Basic Identification
            sequenceId: entry.SeqID || 'N/A',
            companyCode: companyCode,
            assetClass: assetClass,
            assetDescription: assetDescription,
            additionalDescription: entry.AssetAdditionalDescription || "",
            serialNumber: entry.AssetSerialNumber || "",
            baseUnit: entry.BaseUnit || "",

            // Cost Assignment
            wbsElement: entry.YY1_WBS_ELEMENT || "",
            plant: entry.AccountAssignment?.Plant || "",
            costCenter: entry.AccountAssignment?.CostCenter || "",

            // Depreciation Information
            depreciationKey: entry.TimeBasedValuation?.[0]?.DepreciationKey || "",
            usefulLife: entry.TimeBasedValuation?.[0]?.PlannedUsefulLifeInYears || "",
            scrapValue: entry.TimeBasedValuation?.[0]?.ScrapAmountInCoCodeCrcy || "",

            // Dates
            capitalizationDate: capitalizationDate,
            putToUseDate: entry.IN_AssetPutToUseDate || "",

            // Display Properties
            displayText: displayText,
            formattedAssetNumber: `${companyCode}-${assetClass}-${entry.SeqID || '000'}`,

            // Status Information
            status: entry.Status || "Valid",
            statusMessage: entry.statusMessage || "Asset record valid",
            statusCode: entry.statusCode || "200",

            // Additional Fields
            assetBlock: entry.IN_AssetBlock || "",
            isPriorYear: entry.IN_AssetIsPriorYear || false
          };
        });
      };

      /** Formats failed entries for display. @private */
      this._formatErrorsForDisplay = function (entries = []) {
        return entries.map((entry) => {
          // Initialize with the error object itself if it's simple
          let baseError = (typeof entry === 'string') ? { message: entry } : entry;
          let errorData = baseError.assetData || baseError;

          // Extract error information
          let errorMessages = [];
          let primaryMessage = "";

          // First check for direct error properties
          if (baseError.message) {
            primaryMessage = baseError.message;
            errorMessages.push(primaryMessage);
          } else if (baseError.error) {
            primaryMessage = baseError.error;
            errorMessages.push(primaryMessage);
          }

          // Check for details array
          if (baseError.details) {
            if (typeof baseError.details === 'string') {
              errorMessages.push(baseError.details);
            } else if (Array.isArray(baseError.details)) {
              baseError.details.forEach(detail => {
                const msg = typeof detail === 'string' ? detail : (detail.message || JSON.stringify(detail));
                if (msg && !errorMessages.includes(msg)) errorMessages.push(msg);
              });
            }
          }

          // Check for technical details
          if (baseError.technicalDetails && !errorMessages.includes(baseError.technicalDetails)) {
            errorMessages.push(baseError.technicalDetails);
          }

          // If still no messages, add default
          if (errorMessages.length === 0) {
            errorMessages.push("Unknown processing error occurred");
          }

          // Extract basic info from the asset data if available
          return {
            sequenceId: errorData.SequenceNumber || errorData._originalIndex || 'N/A',
            statusCode: baseError.statusCode || baseError.code || "ERROR",
            statusMessage: primaryMessage || errorMessages[0],
            errorDetails: errorMessages.slice(1), // All messages except the primary one
            timestamp: new Date().toISOString()
          };
        });
      }
    }; // End of returned constructor function
  }
);
