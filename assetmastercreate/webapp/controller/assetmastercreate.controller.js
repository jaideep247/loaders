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
  "assetmastercreate/service/SOAPAssetService",
  "assetmastercreate/utils/DataTransformer",
  "assetmastercreate/service/UserService"
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
  SOAPAssetService,
  DataTransformer,
  UserService
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
      this._exportManager = new ExportManager(this);
      this._errorHandler = new ErrorHandler(this);
      this._uiManager = new UIManager(this, this._errorHandler);
      this._validationManager = new ValidationManager(this);
      this._dataTransformer = new DataTransformer();
      this._userService = new UserService(this);
      // Create SOAP Asset Service
      this._soapAssetService = new SOAPAssetService({
        serviceUrl: this.getBaseURL() + "/sap/bc/srt/scs_ext/sap/fixedassetcreatemain"
      });

      // Create Batch Processing Manager
      this._batchProcessingManager = new BatchProcessingManager({
        controller: this,
        errorHandler: this._errorHandler,
        dataTransformer: this._dataTransformer,
        soapService: this._soapAssetService
      });

      // Create Excel processor
      this._excelProcessor = new ExcelProcessor({
        controller: this,
        validationManager: this._validationManager,
        uiManager: this._uiManager
      });
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
          }
        })
        .catch(error => {
          // Handle errors
          this.getView().setBusy(false);
          MessageBox.error("Error processing file: " + (error.message || error));
        });
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
        `Are you sure you want to submit ${validEntries.length} assets to SAP?`,
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

      // Prepare entries for submission
      const preparedEntries = validEntries.map((entry, index) => {
        // Add original index for tracking
        const preparedEntry = this._dataTransformer.prepareEntryForSOAP(entry);
        preparedEntry._originalIndex = index;
        return preparedEntry;
      });

      // Show busy indicator
      this.getView().setBusy(true);

      // Set upload summary to indicate submission is in progress
      const uploadSummaryModel = this.getView().getModel("uploadSummary");
      if (uploadSummaryModel) {
        uploadSummaryModel.setProperty("/isSubmitting", true);
      }

      // Start batch processing
      this._batchProcessingManager.startBatchProcessing(
        preparedEntries,
        this._batchProcessingManager.processBatch.bind(this._batchProcessingManager),
        { batchSize: 10 }
      )
        .then(result => {
          // Hide busy indicator
          this.getView().setBusy(false);

          // Update upload summary
          if (uploadSummaryModel) {
            uploadSummaryModel.setProperty("/isSubmitting", false);
            uploadSummaryModel.setProperty("/HasBeenSubmitted", true);
            uploadSummaryModel.setProperty("/ProcessingComplete", true);
          }

          // Categorize results
          const successEntries = result.successRecords || [];
          const failedEntries = result.errorRecords || [];

          // Show appropriate result dialog
          if (failedEntries.length > 0) {
            if (successEntries.length > 0) {
              // Partial success
              this._uiManager.showPartialSuccessWithDocuments(
                successEntries,
                failedEntries
              );
            } else {
              // Complete failure
              this._uiManager.showErrorWithDetails(failedEntries);
            }
          } else {
            // Complete success
            this._uiManager.showSuccessWithDocuments(successEntries);
          }
        })
        .catch(error => {
          // Hide busy indicator
          this.getView().setBusy(false);

          // Update upload summary
          if (uploadSummaryModel) {
            uploadSummaryModel.setProperty("/isSubmitting", false);
          }

          // Show error message
          MessageBox.error(
            `Failed to submit assets: ${error.message || 'Unknown error'}`,
            {
              details: error.details || 'No additional details available.'
            }
          );
        });
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
      this.byId("downloadTemplateLink").setEnabled(false);
      
      try {
        this._exportManager.downloadTemplate()
          .then(() => {
            this._errorHandler.showSuccess("Template downloaded successfully");
          })
          .catch(error => {
            this._errorHandler.showError("Template download failed: " + error.message);
          });
      } catch (error) {
        console.error("Error downloading template:", error);
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
      // Delegate row selection and details display to Excel processor
      this._excelProcessor.showEntryDetails(oEvent);
    },
    /**
     * Handle cancel button press on the batch processing dialog
     */
    onCancelBatchProcessing: function () {
      // Check if batch processing is active
      if (this._batchProcessingManager) {
        // Call the batch manager's cancel method
        this._batchProcessingManager.cancelBatchProcessing();

        // Update dialog to show cancellation is in progress
        const batchDisplayModel = this.getView().getModel("batchDisplay");
        if (batchDisplayModel) {
          batchDisplayModel.setProperty("/status", "Cancelling...");
          batchDisplayModel.setProperty("/error", "Processing will be cancelled after the current batch completes.");
        }

        // Show a message to user
        sap.m.MessageToast.show("Cancellation requested. Processing will stop after the current batch.");
      } else {
        // If no batch processing manager is available, just close the dialog
        this.onCloseBatchDialog();
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
    getBaseURL: function () {
      var appId = this.getOwnerComponent().getManifestEntry("/sap.app/id");
      var appPath = appId.replaceAll(".", "/");
      var appModulePath = jQuery.sap.getModulePath(appPath);
      return appModulePath;
    }
  });
});