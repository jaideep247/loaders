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
     * UIManager - UPDATED FOR SIMPLIFIED DATATRANSFORMER
     * Responsible for handling UI components, dialogs, and views using fragments.
     */
    return function (oController, oErrorHandlerInstance, oExportManagerInstance) {
      // --- Instance Setup ---
      if (!oController) { throw new Error("UIManager requires a controller instance."); }
      if (!oErrorHandlerInstance) {
        throw new Error("UIManager requires a valid ErrorHandler instance.");
      }
      if (!oExportManagerInstance) {
        throw new Error("UIManager requires a valid ExportManager instance.");
      }
      this.oController = oController;
      this.errorHandler = oErrorHandlerInstance;
      this.exportManager = oExportManagerInstance;

      // Access DataTransformer from controller
      this.dataTransformer = oController._dataTransformer;

      this._dialogs = {}; // Cache for dialog instances
      this._batchProcessingDisplay = null;
      this._helpControllerContext = null;

      // --- Private Helper Methods ---

      /**
       * Helper function to load and show fragment-based dialogs consistently.
       */
      this._loadAndShowDialog = function (dialogId, fragmentName, oModel, modelName, oControllerOverride) {
        const sFragmentInstanceId = this.oController.getView().createId(dialogId);

        const openDialog = (oDialog) => {
          if (!oDialog || oDialog.bIsDestroyed) {
            console.error(`UIManager: Attempted to open an invalid or destroyed dialog: ${dialogId}`);
            this.errorHandler.showError("Could not open the dialog window.", "Dialog Instance Error");
            delete this._dialogs[dialogId];
            return;
          }
          if (oModel) {
            oDialog.setModel(oModel, modelName || undefined);
          }
          if (typeof oDialog.isOpen === 'function') {
            if (!oDialog.isOpen()) {
              oDialog.open();
            } else {
              console.log(`UIManager: Dialog ${dialogId} is already open.`);
            }
          } else {
            console.warn(`UIManager: Control loaded for ${dialogId} might not be a standard dialog.`);
          }
        };

        // CRITICAL FIX: For problematic dialogs, always destroy and recreate
        if (dialogId === "assetDetailsDialog" || dialogId === "validationErrorsDialog") {
          // Check for existing dialog in multiple places
          let existingDialog = this._dialogs[dialogId];

          // Also check by fragment instance ID
          if (!existingDialog || existingDialog.bIsDestroyed) {
            existingDialog = sap.ui.getCore().byId(sFragmentInstanceId);
          }

          // Also check for any dialog with the base ID
          if (!existingDialog || existingDialog.bIsDestroyed) {
            existingDialog = sap.ui.getCore().byId(dialogId);
          }

          // If found, destroy it completely
          if (existingDialog && !existingDialog.bIsDestroyed) {
            try {
              // Remove from parent first
              const parent = existingDialog.getParent();
              if (parent) {
                parent.removeDependent(existingDialog);
              }

              // Then destroy
              existingDialog.destroy();
              console.log(`UIManager: Destroyed existing ${dialogId} to prevent duplicate IDs`);
            } catch (e) {
              console.error(`UIManager: Error destroying existing dialog ${dialogId}:`, e);
            }
          }

          // Clear from cache
          delete this._dialogs[dialogId];

          // Small delay to ensure cleanup is complete
          return new Promise((resolve) => {
            setTimeout(() => {
              this._loadDialogFragment(dialogId, fragmentName, oModel, modelName, oControllerOverride, openDialog)
                .then(resolve)
                .catch((error) => {
                  console.error(`UIManager: Failed to load dialog after cleanup: ${dialogId}`, error);
                  throw error;
                });
            }, 100);
          });
        }

        // For non-problematic dialogs, check cache first
        let oExistingDialog = this._dialogs[dialogId];

        if (oExistingDialog && !oExistingDialog.bIsDestroyed) {
          if (sap.ui.getCore().byId(oExistingDialog.getId())) {
            console.log(`UIManager: Reusing dialog from cache: ${dialogId}`);
            openDialog(oExistingDialog);
            return Promise.resolve(oExistingDialog);
          } else {
            console.warn(`UIManager: Dialog ${dialogId} found in cache but not in core registry. Clearing cache.`);
            delete this._dialogs[dialogId];
            oExistingDialog = null;
          }
        }

        // Load new dialog
        return this._loadDialogFragment(dialogId, fragmentName, oModel, modelName, oControllerOverride, openDialog);
      };

      // Add this new helper method
      this._loadDialogFragment = function (dialogId, fragmentName, oModel, modelName, oControllerOverride, openDialog) {
        console.log(`UIManager: Loading fragment: ${fragmentName} for dialog: ${dialogId}`);

        // Generate a unique ID to avoid conflicts
        const timestamp = Date.now();
        const uniqueFragmentId = `${this.oController.getView().getId()}--${dialogId}-${timestamp}`;

        return new Promise((resolve, reject) => {
          Fragment.load({
            id: uniqueFragmentId,
            name: fragmentName,
            controller: oControllerOverride || this.oController
          }).then((oDialog) => {
            if (!oDialog) {
              const error = new Error("Fragment.load resolved without a valid control instance.");
              reject(error);
              throw error;
            }
            const dialogInstance = Array.isArray(oDialog) ? oDialog[0] : oDialog;
            if (!dialogInstance || typeof dialogInstance.addDependent !== 'function') {
              const error = new Error("Loaded fragment root is not a valid control instance.");
              reject(error);
              throw error;
            }

            // Store with the original dialogId for future reference
            this._dialogs[dialogId] = dialogInstance;
            this.oController.getView().addDependent(dialogInstance);
            console.log(`UIManager: Fragment loaded and added as dependent: ${dialogId}`);
            openDialog(dialogInstance);
            resolve(dialogInstance);

          }).catch((error) => {
            const msg = `Could not load dialog fragment: ${fragmentName}`;
            console.error(`UIManager: ${msg}`, error);
            this.errorHandler.showError(msg, error.message || error);
            delete this._dialogs[dialogId];
            reject(error);
          });
        });
      };

      this.destroy = function () {
        console.log("UIManager: Destroying all dialogs...");
        Object.keys(this._dialogs).forEach(dialogId => {
          try {
            const dialog = this._dialogs[dialogId];
            if (dialog && !dialog.bIsDestroyed && typeof dialog.destroy === 'function') {
              dialog.destroy();
              console.log(`UIManager: Destroyed dialog ${dialogId}`);
            }
          } catch (e) {
            console.error(`UIManager: Error destroying dialog ${dialogId}:`, e);
          }
        });
        this._dialogs = {};
      };
      /**
       * Process entry data for display using DataTransformer
       * @private
       */
      this._processEntryDataForDisplay = function (oEntry) {

        try {
          // Use DataTransformer if available, otherwise process manually
          if (this.dataTransformer && typeof this.dataTransformer.processEntryDataForDisplay === 'function') {
            return this.dataTransformer.processEntryDataForDisplay(oEntry);
          }

          // Fallback manual processing
          return this._manualProcessEntryData(oEntry);
        } catch (error) {
          console.error("Error processing entry data for display:", error);
          return this._manualProcessEntryData(oEntry);
        }
      };

      /**
       * Manual processing fallback for entry data
       * @private
       */
      this._manualProcessEntryData = function (oEntry) {
        const processedEntry = JSON.parse(JSON.stringify(oEntry));

        // Basic Info Section
        processedEntry.BasicInfo = {
          SequenceNumber: processedEntry.SequenceNumber || processedEntry.Seq_ID || 'N/A',
          CompanyCode: processedEntry.CompanyCode || '',
          AssetClass: processedEntry.AssetClass || '',
          IsPostCapitalization: this._parseBoolean(processedEntry.AssetIsForPostCapitalization)
        };

        // General Details Section
        processedEntry.GeneralDetails = {
          FixedAssetDescription: processedEntry.FixedAssetDescription || '',
          AdditionalDescription: processedEntry.AssetAdditionalDescription || '',
          SerialNumber: processedEntry.AssetSerialNumber || '',
          BaseUnit: processedEntry.BaseUnit || '',
          InventoryNote: processedEntry.InventoryNote || ''
        };

        // Account Assignment Section
        processedEntry.AccountAssignment = {
          WBSElementExternalID: processedEntry.WBSElementExternalID || '',
          Room: processedEntry.Room || processedEntry.ROOM || '',
          CustomWBSElement: processedEntry.YY1_WBS_ELEMENT || ''
        };

        // Global Master Data Section
        processedEntry.GlobalMasterData = {
          AssetBlock: this._getGlobalMasterValue(processedEntry, 'IN_AssetBlock'),
          PutToUseDate: this._getGlobalMasterValue(processedEntry, 'IN_AssetPutToUseDate'),
          IsPriorYear: this._parseBoolean(this._getGlobalMasterValue(processedEntry, 'IN_AssetIsPriorYear'))
        };

        // Process Ledger Details
        processedEntry.LedgerDetails = this._processLedgerDetailsForDisplay(processedEntry);

        // Process Validation Errors
        processedEntry.ProcessedValidationErrors = this._processValidationErrors(processedEntry.ValidationErrors || []);

        // Set Status
        processedEntry.ValidationSummary = {
          TotalErrors: processedEntry.ProcessedValidationErrors.length,
          IsValid: processedEntry.ProcessedValidationErrors.length === 0,
          Status: processedEntry.ProcessedValidationErrors.length > 0 ? 'Invalid' : 'Valid'
        };

        return processedEntry;
      };

      /**
       * Get global master data value from various sources
       * @private
       */
      this._getGlobalMasterValue = function (entry, fieldName) {
        // Check _GlobMasterData._IN_AssetBlockData first
        if (entry._GlobMasterData && entry._GlobMasterData._IN_AssetBlockData) {
          const value = entry._GlobMasterData._IN_AssetBlockData[fieldName];
          if (value !== undefined && value !== null && value !== '') {
            return value;
          }
        }

        // Check GlobalMasterData
        if (entry.GlobalMasterData && entry.GlobalMasterData[fieldName] !== undefined) {
          return entry.GlobalMasterData[fieldName];
        }

        // Check direct field
        return entry[fieldName] || '';
      };

      /**
       * Process ledger details for display
       * @private
       */
      this._processLedgerDetailsForDisplay = function (entry) {
        const ledgerSource = entry._Ledger || entry.LedgerDetails?.Ledgers || [];

        return {
          Ledgers: ledgerSource.map((ledger, index) => ({
            Index: index + 1,
            Code: ledger.Ledger || 'Unknown',
            CapitalizationDate: this._formatDateForDisplay(ledger.AssetCapitalizationDate),
            Valuations: this._processValuations(ledger._Valuation || []),
            TimeBasedValuations: this._flattenTimeBasedValuations(ledger._Valuation || [])
          }))
        };
      };

      /**
       * Process valuations
       * @private
       */
      this._processValuations = function (valuations) {
        return valuations.map(valuation => ({
          DepreciationArea: valuation.AssetDepreciationArea,
          NegativeAmountAllowed: valuation.NegativeAmountIsAllowed || false,
          DepreciationStartDate: this._formatDateForDisplay(valuation.DepreciationStartDate),
          TimeBasedValuations: (valuation._TimeBasedValuation || []).map(tbv => ({
            DepreciationArea: valuation.AssetDepreciationArea,
            DepreciationKey: tbv.DepreciationKey || '',
            PlannedUsefulLifeYears: tbv.PlannedUsefulLifeInYears || '',
            PlannedUsefulLifePeriods: tbv.PlannedUsefulLifeInPeriods || '0',
            ScrapAmount: {
              Value: tbv.ScrapAmountInCoCodeCrcy || 0,
              Currency: tbv.CompanyCodeCurrency || 'INR'
            },
            ScrapPercent: tbv.AcqnProdnCostScrapPercent || 5,
            ValidityStartDate: this._formatDateForDisplay(tbv.ValidityStartDate)
          }))
        }));
      };

      /**
       * Flatten time-based valuations
       * @private
       */
      this._flattenTimeBasedValuations = function (valuations) {
        return valuations.flatMap(valuation =>
          (valuation._TimeBasedValuation || []).map(tbv => ({
            DepreciationArea: valuation.AssetDepreciationArea,
            DepreciationKey: tbv.DepreciationKey || '',
            PlannedUsefulLifeYears: tbv.PlannedUsefulLifeInYears || '',
            PlannedUsefulLifePeriods: tbv.PlannedUsefulLifeInPeriods || '0',
            ScrapAmount: {
              Value: tbv.ScrapAmountInCoCodeCrcy || 0,
              Currency: tbv.CompanyCodeCurrency || 'INR'
            },
            ScrapPercent: tbv.AcqnProdnCostScrapPercent || 5,
            ValidityStartDate: this._formatDateForDisplay(tbv.ValidityStartDate)
          }))
        );
      };

      /**
       * Process validation errors
       * @private
       */
      this._processValidationErrors = function (errors) {
        return errors.map(error => {
          if (typeof error === 'string') {
            return { message: error, field: 'Unknown', sheet: '' };
          }
          return {
            message: error.message || error.Message || JSON.stringify(error),
            field: error.field || error.Field || 'Unknown',
            sheet: error.sheet || error.Sheet || ''
          };
        }).filter(error => error.message);
      };

      /**
       * Format date for display
       * @private
       */
      this._formatDateForDisplay = function (dateValue) {
        if (!dateValue) return null;

        try {
          const date = dateValue instanceof Date ? dateValue : new Date(dateValue);
          return !isNaN(date.getTime()) ? date : null;
        } catch (error) {
          return null;
        }
      };

      /**
       * Parse boolean values
       * @private
       */
      this._parseBoolean = function (value) {
        if (typeof value === 'boolean') return value;
        if (typeof value === 'string') {
          const lower = value.toLowerCase();
          return ['true', 'yes', '1', 'x'].includes(lower);
        }
        return Boolean(value);
      };

      // --- Public Methods ---

      /**
       * Public method to show any dialog by ID and fragment name
       * @public
       */
      this.showDialog = function (dialogId, fragmentName, oModel, modelName, oControllerOverride) {
        console.log(`UIManager: showDialog called for ${dialogId} with fragment ${fragmentName}`);
        return this._loadAndShowDialog(dialogId, fragmentName, oModel, modelName, oControllerOverride);
      };

      /**
       * Closes and potentially destroys a dialog
       * @public
       */
      this.closeDialog = function (dialogId, bDestroy) {
        if (!dialogId) return;

        console.log("Attempting to close dialog: " + dialogId);
        let oDialog = this._dialogs[dialogId];

        // Try multiple methods to find the dialog
        if (!oDialog || oDialog.bIsDestroyed) {
          const sFragmentInstanceId = this.oController.getView().createId(dialogId);
          oDialog = sap.ui.getCore().byId(sFragmentInstanceId);

          if (!oDialog) {
            oDialog = sap.ui.getCore().byId(dialogId);
          }

          if (!oDialog) {
            oDialog = sap.ui.core.Fragment.byId(dialogId, dialogId);
          }
        }

        if (oDialog && typeof oDialog.close === 'function') {
          oDialog.close();
          console.log(`Dialog closed: ${dialogId}`);

          // Always destroy dialogs that might have duplicate ID issues
          if (bDestroy || dialogId === "assetDetailsDialog") {
            try {
              if (typeof oDialog.destroy === 'function') {
                // Destroy immediately for problematic dialogs
                if (dialogId === "assetDetailsDialog") {
                  oDialog.destroy();
                  console.log(`Dialog destroyed immediately: ${dialogId}`);
                } else {
                  setTimeout(function () {
                    oDialog.destroy();
                    console.log(`Dialog destroyed: ${dialogId}`);
                  }, 300);
                }
              }
              delete this._dialogs[dialogId];
            } catch (e) {
              console.error(`Error destroying dialog ${dialogId}:`, e);
            }
          }
        } else {
          console.warn(`Unable to close dialog: ${dialogId} - not found or not a dialog`);
        }
      };

      /**
       * Handles display of validation errors - UPDATED
       * @public
       */
      this.handleValidationErrors = function (errors) {
        console.log("UIManager: Handling validation errors...");
        if (!errors || !errors.length) { return; }

        // Use DataTransformer if available, otherwise use ExportManager
        let processedErrors;
        if (this.dataTransformer && typeof this.dataTransformer.processValidationErrorsForDisplay === 'function') {
          processedErrors = this.dataTransformer.processValidationErrorsForDisplay(errors);
        } else {
          processedErrors = this.exportManager.processValidationErrorsForDisplay(errors);
        }

        if (!processedErrors.flatErrors || !processedErrors.flatErrors.length) { return; }

        const oValidationModel = new JSONModel(processedErrors);
        this._loadAndShowDialog(
          "validationErrorsDialog",
          "assetmastercreate.view.ValidationErrorsDialog",
          oValidationModel,
          "validation",
          this.oController
        );
      };

      /**
       * Shows entry details dialog - UPDATED
       * @public
       */
      this.showEntryDetailsDialog = function (oEntry) {
        console.log("UIManager: Showing entry details...");
        if (!oEntry) {
          this.errorHandler.showWarning("Cannot show details: No entry data provided.");
          return;
        }

        // Process the entry data for display
        const processedEntryData = this._processEntryDataForDisplay(oEntry);

        const dialogId = "assetDetailsDialog";
        const fragmentName = "assetmastercreate.view.EntryDetailsDialog";

        this._loadAndShowDialog(
          dialogId,
          fragmentName,
          new JSONModel(processedEntryData),
          "entryDetails",
          this.oController
        );
      };

      /**
       * Shows error summary dialog
       * @public
       */
      this.showErrorSummaryDialog = function (errors, exportManager) {
        console.log("UIManager: Showing error summary...");
        const dialogId = "errorSummaryDialog";
        const fragmentName = "assetmastercreate.view.ErrorSummaryDialog";

        const processedErrors = this.exportManager.processErrorsForSummaryDisplay(errors);
        const oErrorModel = new JSONModel(processedErrors);

        this._loadAndShowDialog(dialogId, fragmentName, oErrorModel, "errors", {
          onErrorDialogClose: () => this.closeDialog(dialogId, true),
          onExportErrors: () => {
            if (this.exportManager && typeof this.exportManager.exportToExcel === 'function') {
              this.exportManager.exportToExcel(processedErrors.errors, "ErrorSummary.xlsx")
                .then(() => {
                  this.errorHandler.showSuccess("Error summary exported.");
                })
                .catch(() => {
                  this.errorHandler.showError("Failed to export error summary.");
                });
            } else {
              this.errorHandler.showWarning("Export functionality for error summary is not available.");
            }
            this.closeDialog(dialogId, true);
          }
        });
      };

      /**
       * Show validation statistics dialog
       * @public
       */
      this.showValidationStatsDialog = function (total = 0, successful = 0, failed = 0) {
        console.log("UIManager: Showing validation stats...");

        // Use DataTransformer if available, otherwise use ExportManager
        let statsData;
        if (this.dataTransformer && typeof this.dataTransformer.calculateValidationStats === 'function') {
          statsData = this.dataTransformer.calculateValidationStats(total, successful, failed);
        } else {
          statsData = this.exportManager.calculateValidationStats(total, successful, failed);
        }

        const oStatsModel = new JSONModel(statsData);
        const dialogId = "validationStatsDialog";
        const fragmentName = "assetmastercreate.view.ValidationStatsDialog";

        this._loadAndShowDialog(dialogId, fragmentName, oStatsModel, "stats", {
          onValidationStatsDialogClose: () => this.closeDialog(dialogId, true)
        });
      };

      /**
       * Export validation errors to CSV
       * @public
       */
      this.exportValidationErrors = function (groupedErrorsData) {
        return this.exportManager.exportValidationErrorsToCSV(groupedErrorsData);
      };

      /**
       * Show help dialog
       * @public
       */
      this.showHelpDialog = function (controllerContext) {
        console.log("UIManager: Showing help dialog...");
        this._helpControllerContext = controllerContext && typeof controllerContext.onDownloadTemplate === 'function' ? controllerContext : null;

        const dialogId = "helpDialog";
        const fragmentName = "assetmastercreate.view.HelpDialog";

        this._loadAndShowDialog(dialogId, fragmentName, null, null, {
          onHelpDialogClose: () => {
            this.closeDialog(dialogId, false);
            this._helpControllerContext = null;
          },
          onDownloadTemplateLinkPress: () => {
            if (this._helpControllerContext) {
              this._helpControllerContext.onDownloadTemplate();
            } else {
              this.errorHandler.showWarning("Cannot download template: Application context not available.");
            }
          }
        });
      };

      // --- Result Dialogs ---

      /**
       * Shows success dialog
       * @public
       */
      this.showSuccessWithDocuments = function (successEntries) {
        const dialogId = "successDialog";
        const fragmentName = "assetmastercreate.view.SuccessDialog";

        if (!successEntries || !successEntries.length) {
          this.errorHandler.showSuccess("Operation completed successfully!");
          return;
        }

        const formattedData = this.exportManager.formatSuccessEntriesForDisplay(successEntries);
        const oModel = new JSONModel(formattedData);

        this._loadAndShowDialog(dialogId, fragmentName, oModel, "success", {
          onSuccessDialogClose: () => {
            if (this.oController && typeof this.oController.onSuccessDialogClose === 'function') {
              this.oController.onSuccessDialogClose();
            } else {
              this.closeDialog(dialogId, true);
            }
          }
        });
      };

      /**
       * Show partial success dialog
       * @public
       */
      this.showPartialSuccessWithDocuments = function (successEntries, failedEntries) {
        const dialogId = "partialSuccessDialog";
        const fragmentName = "assetmastercreate.view.PartialSuccessDialog";

        const successCount = (successEntries || []).length;
        const failedCount = (failedEntries || []).length;

        if (successCount === 0 && failedCount === 0) {
          this.errorHandler.showWarning("No entries were processed.");
          return;
        }

        const formattedData = this.exportManager.formatPartialResultsForDisplay(successEntries, failedEntries);
        const oModel = new JSONModel(formattedData);

        this._loadAndShowDialog(dialogId, fragmentName, oModel, "partial", {
          onPartialSuccessDialogClose: () => {
            if (this.oController && typeof this.oController.onPartialSuccessDialogClose === 'function') {
              this.oController.onPartialSuccessDialogClose();
            } else {
              this.closeDialog(dialogId, true);
            }
          }
        });
      };

      /**
       * Show error details dialog
       * @public
       */
      this.showErrorWithDetails = function (failedEntries) {
        const dialogId = "errorDialog";
        const fragmentName = "assetmastercreate.view.ErrorDialog";

        if (!failedEntries || !failedEntries.length) {
          return;
        }

        const formattedData = this.exportManager.formatFailedEntriesForDisplay(failedEntries);
        const oModel = new JSONModel(formattedData);

        this._loadAndShowDialog(dialogId, fragmentName, oModel, "error", {
          onErrorDialogClose: () => {
            if (this.oController && typeof this.oController.onErrorDialogClose === 'function') {
              this.oController.onErrorDialogClose();
            } else {
              this.closeDialog(dialogId, true);
            }
          }
        });
      };

      // --- Batch Processing Methods (unchanged) ---
      this.initBatchProcessingDisplay = function (container) {
        // ... existing implementation unchanged
      };

      this._createBatchDisplayInterface = function (oModel) {
        // ... existing implementation unchanged
      };

      this.hideProcessingDialog = function () {
        // ... existing implementation unchanged
      };

      this.updateBatchProcessingDisplay = function (data) {
        // ... existing implementation unchanged
      };

      this.closeAllDialogs = function () {
        Object.keys(this._dialogs).forEach(dialogId => {
          try {
            this.closeDialog(dialogId, true);
          } catch (e) {
            console.error(`Error closing dialog ${dialogId}:`, e);
          }
        });

        sap.ui.getCore().getOpenDialogs().forEach(dialog => {
          if (dialog && typeof dialog.close === 'function') {
            dialog.close();
          }
        });
      };
    };
  }
);