sap.ui.define([
  "./BaseFilterController",
  "sap/ui/model/json/JSONModel",
  "sap/m/MessageBox",
  "sap/m/MessageToast",
  "assetmastercreate/model/ModelManager",
  "assetmastercreate/service/ExcelProcessor",
  "assetmastercreate/service/ValidationManager",
  "assetmastercreate/service/UIManager",
  "assetmastercreate/utils/ErrorHandler",
  "assetmastercreate/service/ExportManager",
  "assetmastercreate/service/BatchProcessingManager",
  "assetmastercreate/utils/DataTransformer",
  "assetmastercreate/service/UserService",
  "assetmastercreate/service/ODataService"
], function (
  BaseFilterController,
  JSONModel,
  MessageBox,
  MessageToast,
  ModelManager,
  ExcelProcessor,
  ValidationManager,
  UIManager,
  ErrorHandler,
  ExportManager,
  BatchProcessingManager,
  DataTransformer,
  UserService,
  ODataService
) {
  "use strict";

  return BaseFilterController.extend("assetmastercreate.controller.AssetMasterCreate", {
    /**
     * Controller initialization
     */
    onInit: function () {

      BaseFilterController.prototype.onInitFilters.apply(this, arguments);
      console.log(this.byId("downloadTemplateLink"));
      // Initialize models
      this._initializeModels();

      // Initialize services
      this._initializeServices();

      // Initialize filters
      this.onInitFilters();

      // Get user info
      this._userService.getUserInfo();
    },

    /**
     * Initialize application models
     * @private
     */
    _initializeModels: function () {

      // IMPORTANT: Store reference to this controller 
      const controller = this;

      // Initialize ModelManager first
      const modelManager = new ModelManager(controller);
      this._modelManager = modelManager;
      // Upload summary model
      const uploadSummaryModel = new JSONModel({
        TotalEntries: 0,
        SuccessfulEntries: 0,
        FailedEntries: 0,
        ValidationErrors: [],
        IsSubmitEnabled: false,
        HasBeenSubmitted: false,
        LastUploadDate: null,
        ProcessingComplete: false
      });
      this.getView().setModel(uploadSummaryModel, "uploadSummary");

      // Asset master entries model
      const assetMasterModel = new JSONModel({
        entries: [],
        validationStatus: "",
        filteredCount: 0
      });
      this.getView().setModel(assetMasterModel, "assetMasterEntries");
    },

    /**
     * Initialize application services
     * @private
     */
    _initializeServices: function () {
      // Create utilities and services
      const _errorHandler = new ErrorHandler();
      const dataTransformer = new DataTransformer();
      const _exportManager = new ExportManager({
        errorHandler: _errorHandler,
        dataTransformer: dataTransformer
      });

      const uiManager = new UIManager(this, _errorHandler, _exportManager);

      // Store instances for use throughout the controller
      this._errorHandler = _errorHandler;
      this._exportManager = _exportManager;
      this._uiManager = uiManager;
      this._validationManager = new ValidationManager(this);
      this._dataTransformer = dataTransformer;
      this._userService = new UserService(this);

      const oModel = this.getOwnerComponent().getModel(); // Get your OData V4 model instance

      // Create ODataService instance using the new class-based approach
      this._oDataService = new ODataService(oModel, this._dataTransformer, this._errorHandler);

      // Enable debug mode for detailed logging
      this._oDataService.setDebugMode(true);

      // Create Batch Processing Manager with updated constructor
      this._batchProcessingManager = new BatchProcessingManager({
        controller: this,
        uiManager: this._uiManager,
        errorHandler: this._errorHandler,
        dataTransformer: this._dataTransformer,
        oDataService: this._oDataService,
        ExportManager: this._exportManager
      });

      // Create Excel processor
      this._excelProcessor = new ExcelProcessor({
        controller: this,
        validationManager: this._validationManager,
        uiManager: this._uiManager
      });

      console.log("All services initialized successfully");
    },

    /**
     * Handle file upload event
     * @param {sap.ui.base.Event} oEvent - File upload event
     */
    onFileChange: function (oEvent) {
      const fileUploader = this.byId("fileUploader");
      const file = fileUploader.oFileUpload.files[0];

      if (!file) {
        MessageToast.show("No file selected. Please upload an Excel file.");
        return;
      }

      // Check if there's existing data and ask for confirmation
      const assetMasterModel = this.getView().getModel("assetMasterEntries");
      const existingEntries = assetMasterModel ? assetMasterModel.getProperty("/entries") : [];

      if (existingEntries && existingEntries.length > 0) {
        MessageBox.confirm(
          "Uploading a new file will clear all existing data. Do you want to continue?",
          {
            title: "Upload New File",
            onClose: (action) => {
              if (action === MessageBox.Action.OK) {
                this._performResetAndUpload(file);
              } else {
                // Clear the file input if user cancels
                fileUploader.clear();
              }
            }
          }
        );
      } else {
        // No existing data, proceed directly
        this._performResetAndUpload(file);
      }
    },
    getUIManager: function () {
      // Assuming UIManager is initialized in the controller's init method
      return this._uiManager;
    },

    /**
     * Submit valid assets to SAP
     */
    onSubmitToSAP: function () {
      const assetMasterModel = this.getView().getModel("assetMasterEntries");
      const entries = assetMasterModel.getProperty("/entries") || [];

      // Filter valid entries
      const validEntries = entries.filter(entry => entry.Status === 'Valid');

      // Check if there are valid entries
      if (validEntries.length === 0) {
        MessageToast.show("No valid entries to submit.");
        return;
      }

      // Confirm submission
      MessageBox.confirm(
        `Are you sure you want to submit ${validEntries.length} asset masters to SAP?`,
        {
          title: "Confirm Submission",
          onClose: (action) => {
            if (action === MessageBox.Action.OK) {
              this._performSAPSubmission(validEntries);
            }
          }
        }
      );
    },

    /**
     * Perform SAP submission using batch processing
     * @private
     * @param {Array} validEntries - Validated entries to submit
     */
    _performSAPSubmission: function (validEntries) {
      try {
        console.log("Starting SAP submission for", validEntries.length, "asset master entries");

        // Prepare entries for processing with original index tracking
        const entriesToProcess = validEntries.map((entry, index) => {
          // Add original index for tracking within the batch manager
          return {
            ...entry, // Keep all original properties
            _originalIndex: index, // Add a property to track original position
            SequenceNumber: entry.SequenceNumber || entry.Sequence || index // Ensure sequence number exists
          };
        });

        console.log("Prepared", entriesToProcess.length, "asset master entries for submission");

        // Show busy indicator
        this.getView().setBusy(true);

        // Set upload summary to indicate submission is in progress
        const uploadSummaryModel = this.getView().getModel("uploadSummary");
        if (uploadSummaryModel) {
          uploadSummaryModel.setProperty("/isSubmitting", true);
        }

        // Start batch processing using the processRecordsInBatch method
        this._batchProcessingManager.processRecordsInBatch(entriesToProcess)
          .then(result => {
            // Hide busy indicator
            this.getView().setBusy(false);

            // Update upload summary
            if (uploadSummaryModel) {
              uploadSummaryModel.setProperty("/isSubmitting", false);
              uploadSummaryModel.setProperty("/HasBeenSubmitted", true);
              uploadSummaryModel.setProperty("/ProcessingComplete", true);
            }

            // Process results - the result structure is now consistent
            const successEntries = result.results ? result.results.filter(r => r.success) : [];
            const failedEntries = result.results ? result.results.filter(r => !r.success) : [];

            console.log("Asset master submission results - Success:", successEntries.length, "Failed:", failedEntries.length);

            // Show appropriate result dialog based on results
            if (failedEntries.length > 0) {
              if (successEntries.length > 0) {
                // Partial success - some assets created, some failed
                this._uiManager.showPartialSuccessWithDocuments(
                  successEntries.map(entry => ({
                    ...entry.data,
                    AssetNumber: entry.assetNumber || entry.data?.AssetNumber,
                    Message: entry.message,
                    OriginalEntry: entry.originalEntry
                  })),
                  failedEntries.map(entry => ({
                    Error: entry.error,
                    Details: entry.details,
                    OriginalEntry: entry.originalEntry
                  }))
                );
              } else {
                // Complete failure - no assets created
                this._uiManager.showErrorWithDetails(
                  failedEntries.map(entry => ({
                    Error: entry.error,
                    Details: entry.details,
                    OriginalEntry: entry.originalEntry
                  }))
                );
              }
            } else {
              // Complete success - all assets created successfully
              this._uiManager.showSuccessWithDocuments(
                successEntries.map(entry => ({
                  ...entry.data,
                  AssetNumber: entry.assetNumber || entry.data?.AssetNumber,
                  Message: entry.message,
                  OriginalEntry: entry.originalEntry
                }))
              );
            }
          })
          .catch(error => {
            // Hide busy indicator
            this.getView().setBusy(false);

            // Update upload summary
            if (uploadSummaryModel) {
              uploadSummaryModel.setProperty("/isSubmitting", false);
            }

            console.error("Asset master submission error:", error);

            // Show error message
            MessageBox.error(
              `Failed to submit asset masters: ${error.message || 'Unknown error'}`,
              {
                title: "Submission Error",
                details: error.details || 'No additional details available.'
              }
            );
          });

      } catch (error) {
        console.error("Critical error in _performSAPSubmission:", error);

        // Hide busy indicator
        this.getView().setBusy(false);

        // Update upload summary
        const uploadSummaryModel = this.getView().getModel("uploadSummary");
        if (uploadSummaryModel) {
          uploadSummaryModel.setProperty("/isSubmitting", false);
        }

        MessageBox.error(
          `Critical error during asset master submission: ${error.message}`,
          {
            title: "Critical Error"
          }
        );
      }
    },
    /**
     * Apply Filters
     */
    applyFilters: function () {
      // Call the base controller's implementation
      BaseFilterController.prototype.applyFilters.apply(this, arguments);
    },

    /**
     * Handles the table view segmented button selection change
     */
    onTableViewChange: function (oEvent) {
      // The selectedKey is not directly accessible through getParameter("selectedKey")
      // Instead, get the button and read its selected key
      const segmentedButton = oEvent.getSource();
      const selectedKey = segmentedButton.getSelectedKey();
      console.log("Table view selected key:", selectedKey);

      const filterModel = this.getView().getModel("filterModel");

      // Convert segment button key to filter model status value
      let statusValue;
      if (selectedKey === "Valid") {
        statusValue = "valid";
      } else if (selectedKey === "Invalid") {
        statusValue = "invalid";
      } else {
        statusValue = "all";
      }

      console.log("Setting status value in filter model:", statusValue);

      // Update the filter model
      filterModel.setProperty("/status", statusValue);

      // Apply the filters
      this.applyFilters();

      // Sync with the ComboBox
      const statusComboBox = this.byId("statusFilterComboBox");
      if (statusComboBox) {
        statusComboBox.setSelectedKey(statusValue);
      }
    },

    /**
     * Handles search function for assets
     */

    onAssetSearch: function (oEvent) {
      const sQuery = oEvent.getParameter("query");
      const filterModel = this.getView().getModel("filterModel");

      // Clear existing filters first
      filterModel.setProperty("/companyCode", "");
      filterModel.setProperty("/assetClass", "");
      filterModel.setProperty("/description", "");
      filterModel.setProperty("/wbsElement", "");

      // Apply search query to description field
      if (sQuery) {
        filterModel.setProperty("/description", sQuery);
      }

      this.applyFilters();
    },
    /**
     * Handles the status filter ComboBox selection change
     */
    onStatusFilterChange: function (oEvent) {
      // Call parent implementation first
      BaseFilterController.prototype.onStatusFilterChange.apply(this, arguments);

      // Get the selected key for our extended functionality
      const selectedItem = oEvent.getParameter("selectedItem");
      if (selectedItem) {
        const selectedKey = selectedItem.getKey();

        // Sync with table view selector (this is the extended functionality)
        const tableViewSelector = this.byId("tableViewSelector");
        if (tableViewSelector && selectedKey) {
          // Convert to proper case for segmented button
          const segmentKey = selectedKey === "all" ? "All" :
            (selectedKey === "valid" ? "Valid" : "Invalid");
          tableViewSelector.setSelectedKey(segmentKey);
        }
      }
    },

    /**
     * Handles filter change events from any input field
     */
    onFilterChange: function (oEvent) {
      // Just call the base implementation
      BaseFilterController.prototype.applyFilters.apply(this);
    },

    // Add refresh table function
    onRefreshTable: function () {
      const assetTable = this.byId("assetTable");
      if (assetTable) {
        const binding = assetTable.getBinding("items");
        if (binding) {
          binding.refresh();
        }
      }
      MessageToast.show("Table refreshed");
    },
    /**
     * Download template for Excel import
     */
    onDownloadTemplate: function () {
      console.log("Download Template Method Called");

      // Use view busy state instead of individual control
      this.getView().setBusy(true);

      try {
        this._exportManager.downloadTemplate()
          .then(() => {
            this.getView().setBusy(false);
            this._errorHandler.showSuccess("Template downloaded successfully");
          })
          .catch(error => {
            this.getView().setBusy(false);
            this._errorHandler.showError("Template download failed: " + error.message);
          });
      } catch (error) {
        console.error("Error downloading template:", error);
        this.getView().setBusy(false);
        this._errorHandler.showError("Template download failed: " + error.message);
      }
    },
    /**
     * Show help dialog
     */
    onShowHelp: function () {
      try {
        this._uiManager.showHelpDialog(this);
      } catch (error) {
        console.error("Error showing help dialog:", error);
        this._errorHandler.showError("Could not display help: " + error.message);
      }
    },
    /**
     * Show row details 
     * @param {sap.ui.base.Event} oEvent - Event from details button
     */
    onShowEntryDetails: function (oEvent) {
      // First ensure any existing dialog is closed and destroyed
      if (this._uiManager) {
        this._uiManager.closeDialog("assetDetailsDialog", true);
      }

      // Small delay to ensure cleanup
      setTimeout(() => {
        const oButton = oEvent.getSource();
        const oBindingContext = oButton.getBindingContext("assetMasterEntries");

        if (oBindingContext) {
          const oEntryData = oBindingContext.getObject();
          this._uiManager.showEntryDetailsDialog(oEntryData);
        } else {
          MessageToast.show("No data found for this row");
        }
      }, 100);
    },
    onExit: function () {
      console.log("Controller: Cleaning up resources...");

      // Clean up UIManager and all dialogs
      if (this._uiManager) {
        // Close all dialogs with destroy flag
        ["assetDetailsDialog", "validationErrorsDialog", "errorDialog", "successDialog", "partialSuccessDialog", "helpDialog"].forEach(dialogId => {
          try {
            this._uiManager.closeDialog(dialogId, true);
          } catch (e) {
            console.warn(`Failed to close dialog ${dialogId}:`, e);
          }
        });

        // Destroy UIManager if it has a destroy method
        if (typeof this._uiManager.destroy === 'function') {
          this._uiManager.destroy();
        }
      }

      // Clear all models
      const oView = this.getView();
      if (oView) {
        const aModelNames = Object.keys(oView.oPropagatedProperties.oModels || {});
        aModelNames.forEach(sModelName => {
          const oModel = oView.getModel(sModelName);
          if (oModel && typeof oModel.destroy === 'function') {
            try {
              oModel.destroy();
            } catch (e) {
              console.warn(`Failed to destroy model ${sModelName}:`, e);
            }
          }
        });
      }

      console.log("Controller: Cleanup complete");
    },
    /**
     * Handle cancel button press on the batch processing dialog
     */
    onCancelBatchProcessing: function () {
      // Check if batch processing is active
      if (this._batchProcessingManager) {
        // Call the batch manager's cancel method
        this._batchProcessingManager.cancelProcessing(); // Updated method name

        // Update dialog to show cancellation is in progress
        const batchDisplayModel = this.getView().getModel("batchDisplay");
        if (batchDisplayModel) {
          batchDisplayModel.setProperty("/status", "Cancelling...");
          batchDisplayModel.setProperty("/error", "Processing will be cancelled after the current batch completes.");
        }

        // Show a message to user
        MessageToast.show("Cancellation requested. Processing will stop after the current operation.");
      } else {
        // If no batch processing manager is available, just close the dialog
        this.onCloseBatchDialog(); // Assuming you have a close method for the batch dialog
      }
    },

    /**
     * Close the batch processing dialog
     */
    onCloseBatchDialog: function () {
      if (this._batchProcessingManager) {
        this._batchProcessingManager.closeBatchProcessingDialog();
      }
    },

    /**
     * Close the asset details dialog
     */
    onCloseAssetDetailsDialog: function () {
      if (this._uiManager) {
        this._uiManager.closeDialog("assetDetailsDialog");
      }
    },
    onDialogAfterClose: function () {
      // Clean up dialog resources
      this._errorDialog = null;
    },

    /**
     * Close the validation errors dialog
     */
    onValidationDialogClose: function () {
      // Get the dialog instance
      var oDialog = this.byId("validationErrorsDialog");

      // If the dialog can't be found by ID, try to get it from the UI Manager
      if (!oDialog && this._uiManager) {
        this._uiManager.closeDialog("validationErrorsDialog");
        return;
      }

      // If found directly, close it
      if (oDialog) {
        oDialog.close();
      }
    },

    onCloseErrorDialog: function () {
      console.log("Close error dialog triggered");

      // Try multiple approaches to find and close the dialog
      try {

        // Option 1: Use UI Manager
        if (this._uiManager) {
          console.log("Attempting to close via UI Manager");
          this._uiManager.closeDialog("errorDialog");
          return;
        }

        // Option 2: Try to find by ID in various places
        var oDialog = null;

        // Try view ID
        oDialog = this.byId("errorDialog");
        if (oDialog) {
          console.log("Found dialog via byId");
          oDialog.close();
          return;
        }

        // Try core registry with different possible IDs
        const possibleIds = [
          "errorDialog",
          this.getView().getId() + "--errorDialog",
          "container-assetmastercreate---assetmastercreate--errorDialog"
        ];

        for (let id of possibleIds) {
          oDialog = sap.ui.getCore().byId(id);
          if (oDialog) {
            console.log("Found dialog via core with ID: " + id);
            oDialog.close();
            return;
          }
        }

        // Last resort - find any open dialogs
        const openDialogs = sap.ui.getCore().byFieldGroupId("sapUiDialogElements");
        if (openDialogs && openDialogs.length > 0) {
          console.log("Found " + openDialogs.length + " open dialogs, closing the first one");
          openDialogs[0].close();
          return;
        }
        console.error("Could not find any dialog to close");
      } catch (e) {
        console.error("Error closing dialog: ", e);
      }
    },
    /**
     * Reset the entire application to initial state
     * @public
     */
    onReset: function () {
      MessageBox.confirm(
        "This will clear all uploaded data and reset the application. Do you want to continue?",
        {
          title: "Reset Application",
          onClose: (action) => {
            if (action === MessageBox.Action.OK) {
              this._performReset();
            }
          }
        }
      );
    },

    /**
     * Perform the actual reset operation
     * @private
     */
    _performReset: function () {
      try {
        // Show busy indicator during reset
        this.getView().setBusy(true);

        // 1. Reset all models to initial state
        if (this._modelManager) {
          this._modelManager.resetModels();
        }

        // 2. Clear file uploader
        const fileUploader = this.byId("fileUploader");
        if (fileUploader) {
          fileUploader.clear();
          fileUploader.setValue("");
        }

        // 3. Reset validation manager
        if (this._validationManager) {
          //  this._validationManager.reset();
        }

        // 4. Reset batch processing manager
        if (this._batchProcessingManager) {
          //    this._batchProcessingManager.reset(); // Assuming a reset method exists or will be added
        }

        // 5. Clear any open dialogs
        this._closeAllDialogs();

        // 6. Reset filters to default
        this._resetFilters();

        // 7. Clear any cached data in services
        //  this._resetServices();

        // Hide busy indicator
        this.getView().setBusy(false);

        // Show success message
        MessageToast.show("Application reset successfully");

        console.log("Application reset completed");

      } catch (error) {
        // Hide busy indicator on error
        this.getView().setBusy(false);

        console.error("Error during application reset:", error);
        MessageBox.error("Failed to reset application: " + (error.message || error));
      }
    },
    /**
     * Reset and upload new file
     * @private
     * @param {File} file - File to upload
     */
    _performResetAndUpload: function (file) {
      try {
        // First reset everything silently
        this._performSilentReset();

        // Show busy indicator
        this.getView().setBusy(true);

        // Process file using Excel processor
        this._excelProcessor.processExcelFile(file)
          .then(() => {
            // Processing complete
            this.getView().setBusy(false);

            // Update upload summary model to enable submit button
            const uploadSummaryModel = this.getView().getModel("uploadSummary");
            if (uploadSummaryModel) {
              uploadSummaryModel.setProperty("/HasBeenSubmitted", false);
              uploadSummaryModel.setProperty("/IsSubmitEnabled", true);
              uploadSummaryModel.setProperty("/ProcessingComplete", true);
            }

            MessageToast.show("File uploaded and processed successfully");
          })
          .catch(error => {
            // Handle errors
            this.getView().setBusy(false);
            MessageBox.error("Error processing file: " + (error.message || error));
          });

      } catch (error) {
        this.getView().setBusy(false);
        MessageBox.error("Error during file upload: " + (error.message || error));
      }
    },

    /**
     * Perform silent reset without user confirmation
     * @private
     */
    _performSilentReset: function () {
      try {
        // 1. Reset all models to initial state
        if (this._modelManager) {
          this._modelManager.resetModels();
        }

        // 2. Reset validation manager
        if (this._validationManager) {
          //   this._validationManager.reset();
        }

        // 3. Reset batch processing manager
        if (this._batchProcessingManager) {
          //   this._batchProcessingManager.reset(); // Assuming a reset method exists or will be added
        }

        // 4. Close any open dialogs
        this._closeAllDialogs();

        // 5. Reset filters to default
        this._resetFilters();

        // 6. Clear any cached data in services
        //   this._resetServices();

      } catch (error) {
        console.error("Error during silent reset:", error);
        throw error;
      }
    },

    /**
     * Close all open dialogs
     * @private
     */
    _closeAllDialogs: function () {
      try {
        if (this._uiManager) {
          this._uiManager.closeAllDialogs();
        }
      } catch (error) {
        console.warn("Error closing dialogs:", error);
      }
    },

    /**
     * Reset all filters to default values
     * @private
     */
    _resetFilters: function () {
      try {
        const filterModel = this.getView().getModel("filterModel");
        if (filterModel) {
          filterModel.setData({
            companyCode: "",
            assetClass: "",
            description: "",
            wbsElement: "",
            status: "all"
          });
        }

        // Reset table view selector
        const tableViewSelector = this.byId("tableViewSelector");
        if (tableViewSelector) {
          tableViewSelector.setSelectedKey("All");
        }

        // Reset status filter combo box
        const statusComboBox = this.byId("statusFilterComboBox");
        if (statusComboBox) {
          statusComboBox.setSelectedKey("all");
        }

        // Clear search field
        const searchField = this.byId("assetSearchField");
        if (searchField) {
          searchField.setValue("");
        }

      } catch (error) {
        console.warn("Error resetting filters:", error);
      }
    },

    getBaseURL: function () {
      var appId = this.getOwnerComponent().getManifestEntry("/sap.app/id");
      var appPath = appId.replaceAll(".", "/");
      var appModulePath = jQuery.sap.getModulePath(appPath);
      return appModulePath;
    }
  });
});