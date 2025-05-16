sap.ui.define(
  [
    "sap/ui/model/json/JSONModel",
    "sap/ui/core/Fragment",
    "sap/ui/core/library",
    "sap/ui/core/format/DateFormat",
    "assetretirementwr/utils/ErrorHandler"
  ],
  function (
    JSONModel,
    Fragment,
    coreLibrary,
    DateFormat,
    ErrorHandler
  ) {
    "use strict";

    // --- UIManager Constructor Function ---
    // Returns an object containing the UIManager's methods, bound to the created context.
    return function (oController, oErrorHandlerInstance) {
      // Basic validation of inputs
      if (!oController || !oController.getView) {
        throw new Error("UIManager requires a valid controller instance with a getView method.");
      }

      // Internal context for the UIManager instance
      const uiManagerContext = {
        oController: oController,
        _dialogs: {}, // Cache for dialogs, keyed by logical ID
        _helpControllerContext: null // Context for help dialog actions
      };

      // Use injected ErrorHandler or instantiate a new one if necessary
      uiManagerContext.errorHandler = oErrorHandlerInstance || new ErrorHandler(oController);
      if (typeof uiManagerContext.errorHandler.showError !== 'function') {
        console.warn("UIManager: Provided ErrorHandler instance is invalid. Using fallback.");
        uiManagerContext.errorHandler = new ErrorHandler(oController); // Fallback
      }

      // --- Private Helper: Load/Show Dialog (Remains largely internal) ---
      // This function now returns the promise resolving with the dialog instance.
      const _loadAndShowDialog = function (dialogId, fragmentName, oModel, modelName, oControllerOverride) {
        // Use 'this' which refers to uiManagerContext within this scope
        const sFragmentInstanceId = this.oController.getView().createId(dialogId);
        const currentContext = this; // Capture context for promises

        return new Promise((resolve, reject) => {
          const openDialogAndResolve = (oDialog) => {
            try {
              if (oModel) oDialog.setModel(oModel, modelName || undefined);
              // Ensure dialog is added as dependent if not already
              if (!this.oController.getView().getDependents().some(dep => dep.getId() === oDialog.getId())) {
                this.oController.getView().addDependent(oDialog);
              }
              if (!oDialog.isOpen()) oDialog.open();
              resolve(oDialog); // Resolve the promise with the dialog instance
            } catch (openError) {
              console.error(`UIManager: Error setting model or opening dialog ${dialogId}`, openError);
              reject(openError);
            }
          };

          let oExistingDialog = this._dialogs[dialogId];

          // Check cache and if the dialog still exists in the core and isn't destroyed
          if (oExistingDialog && !oExistingDialog.bIsDestroyed && sap.ui.getCore().byId(oExistingDialog.getId())) {
            console.log(`UIManager: Reusing dialog ${dialogId}`);
            openDialogAndResolve(oExistingDialog);
            return; // Exit promise chain early
          }
          // Clear invalid cache entry if it exists but is destroyed or not in core
          if (oExistingDialog) {
            console.log(`UIManager: Clearing invalid cached dialog ${dialogId}`);
            delete this._dialogs[dialogId];
          }

          // --- Load Fragment ---
          console.log(`UIManager: Loading fragment ${fragmentName} for dialog ${dialogId}`);
          Fragment.load({
            id: this.oController.getView().getId(),  // Use view ID to avoid duplicate IDs
            name: fragmentName, // Ensure correct fragment path
            controller: oControllerOverride || this.oController // Use provided controller or the main one
          }).then((oDialog) => {
            if (!oDialog) {
              throw new Error(`Fragment ${fragmentName} loaded as null/undefined.`);
            }
            // Fragment.load might return an array, ensure we get the dialog control
            const dialogInstance = Array.isArray(oDialog) ? oDialog[0] : oDialog;
            if (!dialogInstance || typeof dialogInstance.open !== 'function') {
              throw new Error(`Loaded fragment ${fragmentName} is not a valid dialog control.`);
            }

            currentContext._dialogs[dialogId] = dialogInstance; // Use captured context to update cache
            // Note: addDependent is handled in openDialogAndResolve now
            openDialogAndResolve(dialogInstance);

          }).catch((error) => {
            const msg = `Could not load or setup dialog fragment: ${fragmentName}`;
            console.error(`UIManager: ${msg}`, error);
            // Use captured context for error handler
            currentContext.errorHandler.showError(msg, error.message || String(error));
            delete currentContext._dialogs[dialogId]; // Clean cache on error
            reject(error); // Reject the promise
          });
        }); // End of returned Promise
      }.bind(uiManagerContext); // Bind to ensure 'this' is correct


      // --- Public Method: Show Dialog (Wrapper for _loadAndShowDialog) ---
      /**
       * Loads and shows a dialog fragment, handling caching and model setting.
       * @param {string} dialogId - A unique logical ID for caching the dialog (e.g., "validationErrorsDialog").
       * @param {string} fragmentName - The full name of the fragment file (e.g., "com.myapp.view.MyDialog").
       * @param {sap.ui.model.json.JSONModel} [oModel] - Optional JSONModel to set on the dialog.
       * @param {string} [modelName] - Optional name for the model (if oModel is provided).
       * @param {object} [oControllerOverride] - Optional controller instance to attach to the fragment actions. Defaults to the UIManager's main controller.
       * @returns {Promise<sap.m.Dialog|sap.ui.core.Control>} A promise that resolves with the dialog instance once loaded and opened. Rejects on failure.
       */
      const showDialog = function (dialogId, fragmentName, oModel, modelName, oControllerOverride) {
        // Directly call the internal (bound) function
        return _loadAndShowDialog(dialogId, fragmentName, oModel, modelName, oControllerOverride);
      }.bind(uiManagerContext);


      // --- Public Method: Close Dialog ---
      /**
       * Closes a dialog managed by the UIManager.
       * @param {string} dialogId - The unique logical ID used when showing the dialog.
       * @param {boolean} [bDestroy=false] - If true, destroys the dialog after closing. Otherwise, it remains cached.
       */
      const closeDialog = function (dialogId, bDestroy = false) {
        // Use 'this' which refers to uiManagerContext
        let oDialog = this._dialogs[dialogId];
        if (oDialog && !oDialog.bIsDestroyed && typeof oDialog.close === 'function') {
          const cleanup = () => {
            // Ensure dialog still exists and isn't destroyed before calling destroy
            if (bDestroy && this._dialogs[dialogId] && !this._dialogs[dialogId].bIsDestroyed) {
              try {
                this._dialogs[dialogId].destroy();
                console.log(`UIManager: Dialog destroyed: ${dialogId}`);
              } catch (destroyError) {
                console.error(`UIManager: Error destroying dialog ${dialogId}:`, destroyError);
              } finally {
                delete this._dialogs[dialogId]; // Remove from cache after attempting destroy
              }
            }
          };

          if (oDialog.isOpen()) {
            // Attach cleanup *only* if destroying after close
            if (bDestroy) {
              oDialog.attachEventOnce("afterClose", cleanup);
            }
            oDialog.close();
            console.log(`UIManager: Dialog closed: ${dialogId}`);
          } else if (bDestroy) {
            // If already closed and should be destroyed, clean up immediately
            cleanup();
          }
        } else {
          console.warn(`UIManager: Dialog '${dialogId}' not found, already destroyed, or invalid for closing/destroying.`);
          // Clean cache if destroying a non-existent/invalid entry
          if (bDestroy) delete this._dialogs[dialogId];
        }
      }.bind(uiManagerContext);


      // --- Public Dialog Display Methods (Specific Dialog Logic) ---

      /** Handles display of validation errors */
      const handleValidationErrors = function (errors, fileName) {
        console.log("UIManager: Handling validation errors...", errors);
        if (!errors || !Array.isArray(errors) || errors.length === 0) {
          console.log("UIManager: No validation errors to display.");
          return;
        }

        // Use ErrorHandler to format/deduplicate if needed
        const uniqueErrors = this.errorHandler.formatValidationErrors ?
          this.errorHandler.formatValidationErrors(errors) : errors;

        console.log("UIManager: Prepared validation errors:", uniqueErrors);

        if (uniqueErrors.length === 0) {
          console.log("UIManager: Validation errors were empty after formatting/deduplication.");
          return;
        }

        // Create a simple validation errors dialog controller
        const dialogController = {
          errors: uniqueErrors,
          errorCount: uniqueErrors.length,
          fileName: fileName || "Uploaded File",

          // Direct handler functions
          onCloseValidationErrorsDialog: function () {
            closeDialog("validationErrorsDialog", true);
          },

          onExportErrors: function () {
            if (uiManagerContext.oController._excelProcessor &&
              typeof uiManagerContext.oController._excelProcessor.exportInvalidRecords === 'function') {
              // Get the entries from model
              const allEntries = uiManagerContext.oController.getView().getModel("fixedAssetRetirement")?.getProperty("/entries") || [];
              if (!allEntries.length) {
                uiManagerContext.errorHandler.showWarning("Could not retrieve entry data for export.");
                return;
              }

              const errorSequenceIds = new Set(uniqueErrors.map(err => String(err.sequenceId || err.SequenceID)));
              const invalidEntries = allEntries.filter(entry =>
                errorSequenceIds.has(String(entry.SequenceID || entry.id)) ||
                (entry.Status === 'Invalid')
              );

              if (invalidEntries && invalidEntries.length > 0) {
                uiManagerContext.oController._excelProcessor.exportInvalidRecords(invalidEntries);
                closeDialog("validationErrorsDialog", true);
              } else {
                uiManagerContext.errorHandler.showWarning("Could not find matching invalid entries for export.");
              }
            } else {
              uiManagerContext.errorHandler.showWarning("Error export function not available.");
            }
          }
        };

        // Create the model with the data
        const oValidationModel = new JSONModel({
          errors: uniqueErrors,
          errorCount: uniqueErrors.length,
          fileName: fileName || "Uploaded File"
        });

        // Try to load and show dialog with explicit fragment name 
        Fragment.load({
          name: "assetretirementwr.view.ValidationErrorsDialog",
          controller: dialogController
        }).then(function (oDialog) {
          // Set the model directly on the dialog
          oDialog.setModel(oValidationModel, "validation");

          // Add to view dependencies and store in cache
          uiManagerContext.oController.getView().addDependent(oDialog);
          uiManagerContext._dialogs["validationErrorsDialog"] = oDialog;

          // Open the dialog
          oDialog.open();
        }).catch(function (error) {
          console.error("Failed to load validation errors dialog:", error);
          uiManagerContext.errorHandler.showError(
            "Could not display validation errors",
            "There was a problem loading the errors dialog: " + error.message
          );
        });
      }.bind(uiManagerContext);


      /** Shows entry details dialog */
      const showEntryDetailsDialog = function (oEntry) {
        // Use 'this' which refers to uiManagerContext
        console.log("UIManager: Showing retirement entry details...");
        if (!oEntry) {
          this.errorHandler.showWarning("No entry data provided for details view.");
          return;
        }

        // Prepare data: clone and format errors/fields for display
        const oEntryData = JSON.parse(JSON.stringify(oEntry)); // Deep clone
        if (oEntryData.ValidationErrors && Array.isArray(oEntryData.ValidationErrors) && oEntryData.ValidationErrors.length > 0) {
          // Format errors nicely for display in the dialog
          oEntryData.FormattedErrors = oEntryData.ValidationErrors
            .map(err => `• (${err.field || 'General'}): ${err.message}`)
            .join('\n');
        } else {
          oEntryData.FormattedErrors = "No validation errors recorded.";
        }
        // Ensure key fields exist even if null/undefined in original data for stable binding
        const requiredFields = ["SequenceID", "MasterFixedAsset", "FixedAsset", "CompanyCode", "FixedAssetRetirementType"];
        requiredFields.forEach(f => { if (oEntryData[f] === undefined) oEntryData[f] = null; });

        // Use timestamp to ensure unique dialog ID
        const timestamp = new Date().getTime();
        const dialogId = `entryDetailsDialog`;
        const fragmentName = "assetretirementwr.view.EntryDetailsDialog";

        // Use showDialog method from UIManager
        showDialog(
          dialogId,
          fragmentName,
          new JSONModel(oEntryData),
          "entryDetails", // Model name used in the fragment
          this.oController // Main controller instance handles events
        ).catch(err => {
          console.error("UIManager: Failed to show entry details dialog.", err);
        });
      }.bind(uiManagerContext);

      // --- Result Dialogs (Success, Partial, Error) ---

      /** Shows success result dialog. */
      const showSuccessResult = function (results) { // results = batchManager.responseData
        // Use 'this' which refers to uiManagerContext
        const timestamp = new Date().getTime();
        const dialogId = `successDialog-${timestamp}`;
        const fragmentName = "assetretirementwr.view.SuccessDialog";
        const successEntries = results?.successRecords || []; // Safely access records

        if (!successEntries.length) {
          this.errorHandler.showSuccess("Operation completed successfully."); // Simple toast if no details
          // Optionally call completion callback even if no details dialog shown
          if (this.oController && typeof this.oController.onSubmissionComplete === 'function') {
            this.oController.onSubmissionComplete(true, results);
          }
          return;
        }

        const formattedData = _formatSuccessEntriesForDisplay(successEntries); // Use internal helper
        const oModel = new JSONModel({
          entries: formattedData,
          entryCount: successEntries.length,
          title: "Submission Successful",
          message: `${successEntries.length} Fixed Asset retirement(s) submitted successfully.`
        });

        // Define controller for dialog actions
        const dialogController = {
          onSuccessDialogClose: () => {
            closeDialog(dialogId, true); // Destroy dialog
            // Trigger completion callback in main controller
            if (this.oController && typeof this.oController.onSubmissionComplete === 'function') {
              this.oController.onSubmissionComplete(true, results);
            }
          },

          // New function for exporting success results
          onExportResults: () => {
            if (this.oController && this.oController._exportManager) {
              // Use ExportManager to export only success records
              this.oController._exportManager.exportBatchResults(results, "success", "xlsx");
            } else {
              this.errorHandler.showWarning("Export functionality not available.");
            }
          }
        };

        showDialog(dialogId, fragmentName, oModel, "successData", dialogController)
          .catch(err => console.error("UIManager: Failed to show success result dialog.", err));
      }.bind(uiManagerContext);

      /** Shows error result dialog with export capability. */
      const showErrorResult = function (results) {
        // Use 'this' which refers to uiManagerContext
        const timestamp = new Date().getTime();
        const dialogId = `errorDialog-${timestamp}`;
        const fragmentName = "assetretirementwr.view.ErrorDialog";
        const failedEntries = results?.errorRecords || [];

        if (!failedEntries.length) {
          this.errorHandler.showError("Submission failed, but no specific error details were provided.");
          if (this.oController && typeof this.oController.onSubmissionComplete === 'function') {
            this.oController.onSubmissionComplete(false, results); // Indicate failure
          }
          return;
        }

        const formattedErrors = _formatErrorEntriesForDisplay(failedEntries);
        const oModel = new JSONModel({
          errors: formattedErrors,
          errorCount: failedEntries.length,
          title: "Submission Failed",
          message: `All ${failedEntries.length} retirement(s) failed.`
        });

        const dialogController = {
          onErrorDialogClose: () => {
            closeDialog(dialogId, true); // Destroy dialog
            if (this.oController && typeof this.oController.onSubmissionComplete === 'function') {
              this.oController.onSubmissionComplete(false, results); // Indicate failure
            }
          },

          // Updated export function to use the enhanced ExportManager
          onExportAllErrors: () => {
            if (this.oController && this.oController._exportManager) {
              // Use the new ExportManager to export the error records with all fields
              this.oController._exportManager.exportBatchResults(results, "error", "xlsx");
            } else if (this.oController._excelProcessor && typeof this.oController._excelProcessor.exportInvalidRecords === 'function') {
              // Fallback to old method if needed
              const failedEntryObjects = failedEntries.map(record => record.entry || {});
              this.oController._excelProcessor.exportInvalidRecords(failedEntryObjects);
            } else {
              this.errorHandler.showWarning("Error export function not available.");
            }
          }
        };

        showDialog(dialogId, fragmentName, oModel, "errorData", dialogController)
          .catch(err => console.error("UIManager: Failed to show error result dialog.", err));
      }.bind(uiManagerContext);

      // --- Other Dialogs ---
      /** Show help dialog */
      const showHelpDialog = function (controllerContext) {
        // Use 'this' which refers to uiManagerContext
        console.log("UIManager: Showing help dialog...");
        this._helpControllerContext = controllerContext || this.oController; // Store context for actions
        const timestamp = new Date().getTime();
        const dialogId = `helpDialog-${timestamp}`;
        const fragmentName = "assetretirementwr.view.HelpDialog";

        const dialogController = {
          onHelpDialogClose: () => closeDialog(dialogId, true), // Don't destroy help dialog, reuse it
          onDownloadTemplateLinkPress: () => {
            // Use the stored context to call the download function
            if (this._helpControllerContext && typeof this._helpControllerContext.onDownloadTemplate === 'function') {
              this._helpControllerContext.onDownloadTemplate();
            } else {
              this.errorHandler.showWarning("Template download action not available in the current context.");
            }
          }
        };
        // Help dialog usually doesn't need its own model unless content is dynamic
        showDialog(dialogId, fragmentName, null, null, dialogController)
          .catch(err => console.error("UIManager: Failed to show help dialog.", err));
      }.bind(uiManagerContext);


      // --- Formatting Helpers (Private to UIManager) ---

      /** Formats successfully processed entries for display in result dialogs. */
      const _formatSuccessEntriesForDisplay = function (successEntries = []) {
        // Use 'this' which refers to uiManagerContext
        return successEntries.map((resultItem) => {
          // resultItem structure: { entry (originalInput), response, message (standardized), metadata }
          const originalInput = resultItem.entry || {};
          const responseData = resultItem.response || {};
          const messageData = resultItem.message || {};

          return {
            // Key identifiers from original input
            SequenceID: originalInput.SequenceID || originalInput._originalIndex || 'N/A',
            MasterFixedAsset: originalInput.MasterFixedAsset || 'N/A',
            FixedAsset: originalInput.FixedAsset || 'N/A',
            CompanyCode: originalInput.CompanyCode || 'N/A',
            RetirementType: originalInput.FixedAssetRetirementType || 'N/A',
            BusinessTransactionType: originalInput.BusinessTransactionType || 'N/A',

            // Result identifiers (from API response within responseData or extracted details)
            FixedAssetPostingUUID: responseData.FixedAssetPostingUUID ||
              messageData.details?.extractedDetails?.documentNo || 'N/A',
            DocumentReferenceID: originalInput.DocumentReferenceID || 'N/A',

            // Status message from standardized message object
            Message: messageData.message || "Success"
          };
        });
      }.bind(uiManagerContext);

      /** Formats failed entries for display in result dialogs. */
      const _formatErrorEntriesForDisplay = function (failedEntries = []) {
        // Use 'this' which refers to uiManagerContext
        return failedEntries.map((errorItem) => {
          // errorItem structure: { entry (originalInput), message (standardized), metadata, errorCode, errorMessage, errorDetails }
          const originalInput = errorItem.entry || {};
          const messageData = errorItem.message || {}; // Standardized message object
          const errorDetails = messageData.details || {}; // Details within the standardized message

          // Try to get specific extracted error details if available
          const extractedError = errorDetails.extractedDetails || {};
          const rawErrorInfo = errorDetails.rawErrorInfo || {};

          return {
            // Key identifiers from original input
            SequenceID: originalInput.SequenceID || originalInput._originalIndex || 'N/A',
            MasterFixedAsset: originalInput.MasterFixedAsset || 'N/A',
            FixedAsset: originalInput.FixedAsset || 'N/A',
            CompanyCode: originalInput.CompanyCode || 'N/A',
            RetirementType: originalInput.FixedAssetRetirementType || 'N/A',
            BusinessTransactionType: originalInput.BusinessTransactionType || 'N/A',

            // Error details from standardized message
            ErrorMessage: messageData.message || "Unknown Error",
            ErrorCode: messageData.code || "",

            // Provide more context if available within the details
            // Example: Concatenate messages from OData details array
            ErrorDetails: Array.isArray(extractedError.details)
              ? extractedError.details.map(d => d.message || JSON.stringify(d)).join('; ')
              : (typeof extractedError === 'object' ? JSON.stringify(extractedError) : String(extractedError)),

            // Include key input fields that might be relevant to the error
            Amount: originalInput.AstRtrmtAmtInTransCrcy,
            Currency: originalInput.FxdAstRetirementTransCrcy,
            PostingDate: originalInput.PostingDate
          };
        });
      }.bind(uiManagerContext);


      // --- Return the Public API of the UIManager ---
      return {
        // Dialog Management
        showDialog: showDialog,
        closeDialog: closeDialog,

        // Specific Dialog Triggers
        handleValidationErrors: handleValidationErrors,
        showEntryDetailsDialog: showEntryDetailsDialog,
        showSuccessResult: showSuccessResult,
        showErrorResult: showErrorResult,
        showHelpDialog: showHelpDialog,

        // Expose Error Handler instance if needed externally
        errorHandler: uiManagerContext.errorHandler
      };

    }; // End of returned constructor function
  }
);