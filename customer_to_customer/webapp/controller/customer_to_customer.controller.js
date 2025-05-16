sap.ui.define([
  "sap/ui/core/mvc/Controller",
  "sap/m/MessageBox",
  "sap/ui/core/BusyIndicator",
  "sap/ui/model/json/JSONModel",
  "sap/ui/model/Filter",
  "sap/ui/model/FilterOperator",
  "../service/UserService",
  "../service/ExcelProcessor",
  "../service/ValidationManager",
  "../service/JournalEntryService",
  "../service/UIManager",
  "../service/ExportManager",
  "../service/ErrorHandler",
  "./BaseFilterController",
  "../model/ModelManager",
], function (
  Controller, MessageBox, BusyIndicator, JSONModel,
  Filter, FilterOperator,
  UserService, ExcelProcessor, ValidationManager,
  JournalEntryService, UIManager, ExportManager, ErrorHandler,
  BaseFilterController, ModelManager
) {
  "use strict";

  return BaseFilterController.extend("customertocustomer.controller.customer_to_customer", {
    // ****************************************
    // * Lifecycle Methods
    // ****************************************
    onInit: function () {

      // Initialize services
      this._initUtilities();

      // Initialize filter model
      this._initCustomerFilterModel();

      // Initialize advanced filter model with specific fields
      this._initCustomerFilterModel(this.getView(), [
        'customerCode',
        'referenceKey',
        'businessPlace',
        'sheetType',
        'indicator'
      ], {
        // Optional initial configuration
        status: "All"
      });

      // Get user info
      this._userService.getUserInfo();

      // Initialize batch processing display
      setTimeout(() => {
        const batchContainer = this.byId("batchProcessingDisplayContainer");
        if (batchContainer) {
          this._uiManager.initBatchProcessingDisplay(batchContainer)
            .then(display => {
              this._journalEntryService.setBatchProcessingDisplay(display);
            })
            .catch(error => {
              console.error("Failed to initialize batch processing display:", error);
            });
        }
      }, 500);
    },

    _initUtilities: function () {
      // Initialize ModelManager first
      this._modelManager = new ModelManager(this);
      this._modelManager.initializeModels();

      // Initialize services
      this._userService = new UserService(this);
      this._excelProcessor = new ExcelProcessor(this);
      this._validationManager = new ValidationManager(this);
      this._journalEntryService = new JournalEntryService(this);
      this._uiManager = new UIManager(this);
      this._exportManager = new ExportManager(this);
      this._errorHandler = new ErrorHandler(this);
    },

    _initModels: function () {
      // Initialize user model with default values
      const userModel = new JSONModel({
        id: "",
        email: "",
        fullName: ""
      });
      this.getView().setModel(userModel, "userInfo");

      // Initialize upload summary model
      const uploadSummaryModel = new JSONModel({
        TotalEntries: 0,
        SuccessfulEntries: 0,
        FailedEntries: 0,
        ValidationErrors: [],
        IsSubmitEnabled: false,
        LastUploadDate: null,
        ProcessingComplete: false,
        isSubmitting: false,
        uploadProgress: 0
      });

      // Initialize journal entries model
      const journalEntriesModel = new JSONModel({
        transactions: [],
        validationStatus: "Pending",
        filteredCount: 0,
        processedEntries: [],
        postedDocuments: []
      });

      // Initialize status filter model
      const statusModel = new JSONModel([
        { key: "All", text: "All" },
        { key: "Valid", text: "Valid" },
        { key: "Invalid", text: "Invalid" }
      ]);

      // Set models to view
      this.getView().setModel(uploadSummaryModel, "uploadSummary");
      this.getView().setModel(journalEntriesModel, "journalEntries");
      this.getView().setModel(statusModel, "statusModel");

      // Set initial state
      setTimeout(() => {
        this.onResetFilters();
      }, 100);
    },

    // ****************************************
    // * Filtering Methods
    // ****************************************
    // Customer-specific filter model initialization
    _initCustomerFilterModel: function () {
      const filterModel = {
        status: "All",
        sheet: "All",
        indicator: "All",
        customerCode: "",
        referenceKey: "",
        businessPlace: "",
        searchQuery: ""
      };

      const oAdvancedFilterModel = new JSONModel(filterModel);
      this.getView().setModel(oAdvancedFilterModel, "advancedFilter");
      return oAdvancedFilterModel;
    },

    // Status filter change handler
    onStatusFilterChange: function (oEvent) {
      const sStatus = oEvent.getParameter("selectedItem").getKey();
      this.getView().getModel("advancedFilter").setProperty("/status", sStatus);
      this._applyCustomerFilters();
    },

    // Sheet filter change handler
    onSheetFilterChange: function (oEvent) {
      const sSheet = oEvent.getParameter("selectedItem").getKey();
      this.getView().getModel("advancedFilter").setProperty("/sheet", sSheet);
      this._applyCustomerFilters();
    },

    // Indicator filter change handler
    onIndicatorFilterChange: function (oEvent) {
      const sIndicator = oEvent.getParameter("selectedItem").getKey();
      this.getView().getModel("advancedFilter").setProperty("/indicator", sIndicator);
      this._applyCustomerFilters();
    },

    // Customer code filter change handler
    onCustomerCodeFilterChange: function (oEvent) {
      const sCustomerCode = oEvent.getParameter("value");
      this.getView().getModel("advancedFilter").setProperty("/customerCode", sCustomerCode);
      this._applyCustomerFilters();
    },

    // Reference key filter change handler
    onReferenceKeyFilterChange: function (oEvent) {
      const sReferenceKey = oEvent.getParameter("value");
      this.getView().getModel("advancedFilter").setProperty("/referenceKey", sReferenceKey);
      this._applyCustomerFilters();
    },

    // Business place filter change handler
    onBusinessPlaceFilterChange: function (oEvent) {
      const sBusinessPlace = oEvent.getParameter("value");
      this.getView().getModel("advancedFilter").setProperty("/businessPlace", sBusinessPlace);
      this._applyCustomerFilters();
    },

    // Search field handler
    onSearchEntries: function (oEvent) {
      const sQuery = oEvent.getParameter("query");
      this.getView().getModel("advancedFilter").setProperty("/searchQuery", sQuery);
      this._applyCustomerFilters();
    },

    // Live search handler
    onLiveSearch: function (oEvent) {
      const sQuery = oEvent.getParameter("newValue");
      this.getView().getModel("advancedFilter").setProperty("/searchQuery", sQuery);
      this._applyCustomerFilters();
    },

    // Table view selector change handler
    onTableViewChange: function (oEvent) {
      const sKey = oEvent.getParameter("item").getKey();
      const oFilterModel = this.getView().getModel("advancedFilter");

      // Update the status filter in the model
      oFilterModel.setProperty("/status", sKey);

      // Apply the filters to update the table
      this._applyCustomerFilters();
    },

    // Apply customer-specific filters
    _applyCustomerFilters: function () {

      const oTable = this.getView().byId("journalEntriesTable");
      const oFilterModel = this.getView().getModel("advancedFilter");
      const filterData = oFilterModel.getData();
      const aFilters = [];

      // Status filter
      if (filterData.status && filterData.status !== "All") {
        aFilters.push(new Filter("status", FilterOperator.EQ, filterData.status));
      }

      // Sheet filter
      if (filterData.sheet && filterData.sheet !== "All") {
        aFilters.push(new Filter("Sheet", FilterOperator.EQ, filterData.sheet));
      }

      // Indicator filter
      if (filterData.indicator && filterData.indicator !== "All") {
        aFilters.push(new Filter("Indicator", FilterOperator.EQ, filterData.indicator));
      }

      // Customer code filter
      if (filterData.customerCode) {
        aFilters.push(new Filter("Customer Code", FilterOperator.Contains, filterData.customerCode));
      }

      // Reference key filter
      if (filterData.referenceKey) {
        aFilters.push(new Filter("Reference Key 1", FilterOperator.Contains, filterData.referenceKey));
      }

      // Business place filter
      if (filterData.businessPlace) {
        aFilters.push(new Filter("Business Place", FilterOperator.Contains, filterData.businessPlace));
      } 

      // Search filter
      if (filterData.searchQuery) {
        const searchFilters = [
          new Filter("Sequence ID", FilterOperator.Contains, filterData.searchQuery),
          new Filter("Accounting Document Type", FilterOperator.Contains, filterData.searchQuery),
          new Filter("Customer Code", FilterOperator.Contains, filterData.searchQuery),
          new Filter("status", FilterOperator.Contains, filterData.searchQuery)
        ];
        aFilters.push(new Filter({ filters: searchFilters, and: false }));
      }

      // Apply filters
      oTable.getBinding("items").filter(aFilters);
      this._updateFilteredCount(oTable);
    },

    // Update filtered count in the model
    _updateFilteredCount: function (oTable) {
      const oBinding = oTable.getBinding("items");
      const filteredCount = oBinding.getLength();
      const journalEntriesModel = this._modelManager.getModel("journalEntries");
      journalEntriesModel.setProperty("/filteredCount", filteredCount);
    },

    onResetFilters: function () {
      // Use base filter controller's reset method
      BaseFilterController.prototype.onResetFilters.call(this);
    },

    // ****************************************
    // * File Upload Handlers
    // ****************************************
    onFileChange: function (oEvent) {
      var oFileUploader = oEvent.getSource();
      var file = oEvent.getParameter("files")[0];

      if (!file) {
        MessageBox.error("No file selected. Please choose a file to upload.");
        return;
      }

      // Validate file type
      if (!file.name.endsWith(".xlsx")) {
        MessageBox.error("Invalid file type. Please upload an Excel file (.xlsx).");
        oFileUploader.clear();
        return;
      }

      // Show busy indicator
      BusyIndicator.show(0);

      // Reset models and process file
      this._resetModels();

      // Process file with slight delay for UX
      setTimeout(() => {
        this._excelProcessor.processExcelFile(file);
        BusyIndicator.hide();

        // Expand the summary panel
        var oSummaryPanel = this.getView().byId("summaryPanel");
        if (oSummaryPanel) {
          oSummaryPanel.setExpanded(true);
        }
      }, 500);
    },

    _resetModels: function () {
      this._modelManager.resetModels();
    },

    // ****************************************
    // * Journal Entry Submission
    // ****************************************
    onSubmitJournalEntries: function () {
      const uploadSummaryModel = this.getView().getModel("uploadSummary");
      const journalEntriesModel = this.getView().getModel("journalEntries");

      // Ensure entries are valid before submission
      if (!uploadSummaryModel.getProperty("/IsSubmitEnabled")) {
        MessageBox.warning(
          "Please upload and validate entries before submitting."
        );
        return;
      }

      // Prepare data for submission
      const transactions = journalEntriesModel.getProperty("/transactions");
      const validTransactions = transactions.filter(
        (entry) => entry.status === "Valid"
      );

      // Count by unique sequence IDs
      const uniqueEntryIds = new Set();
      validTransactions.forEach(transaction => {
        uniqueEntryIds.add(transaction['Sequence ID']);
      });
      const entryCount = uniqueEntryIds.size;

      // Show confirmation dialog before submission
      MessageBox.confirm(
        `You are about to submit ${entryCount} journal entries. Continue?`,
        {
          title: "Confirm Submission",
          actions: [MessageBox.Action.OK, MessageBox.Action.CANCEL],
          emphasizedAction: MessageBox.Action.OK,
          onClose: (action) => {
            if (action === MessageBox.Action.OK) {
              // Set isSubmitting flag to true to show the progress bar
              uploadSummaryModel.setProperty("/isSubmitting", true);
              // Reset upload progress to 0
              uploadSummaryModel.setProperty("/uploadProgress", 0);
              // Show busy indicator
              BusyIndicator.show();
              this._journalEntryService.processSubmission(validTransactions);
            } else {
              BusyIndicator.hide();
            }
          }
        }
      );
    },

    onCopyTransactionId: function () {
      const batchDisplay = this.getView().getModel("batchDisplay");
      const transactionId = batchDisplay.getProperty("/transactionId");

      if (transactionId) {
        try {
          // Create temporary textarea, copy to clipboard, and remove
          const textArea = document.createElement('textarea');
          textArea.value = transactionId;
          textArea.style.position = 'fixed';
          document.body.appendChild(textArea);
          textArea.focus();
          textArea.select();
          document.execCommand('copy');
          document.body.removeChild(textArea);
          sap.m.MessageToast.show("Transaction ID copied to clipboard");
        } catch (err) {
          console.error("Failed to copy transaction ID", err);
        }
      }
    },
    // ****************************************
    // * Export & Utility Functions
    // ****************************************
    onDownloadTemplate: function () {
      this._validationManager.downloadTemplate();
      sap.m.MessageToast.show("Template downloaded successfully");
    },

    onExportToExcel: function () {
      const journalEntriesModel = this.getView().getModel("journalEntries");
      const transactions = journalEntriesModel.getProperty("/transactions");
      const oTable = this.getView().byId("journalEntriesTable");

      if (!oTable) {
        MessageBox.information("Table not available for export.");
        return;
      }

      const oBinding = oTable.getBinding("items");

      // Use current filters if any
      const filteredEntries = oBinding ?
        transactions.filter((_, index) => oBinding.aIndices.includes(index)) :
        transactions;

      if (filteredEntries.length === 0) {
        MessageBox.information("No data to export.");
        return;
      }

      this._exportManager.exportToExcel(filteredEntries, "Customer_Journal_Entries_Export.xlsx");
    },

    // ****************************************
    // * Dialog & Action Handlers
    // ****************************************
    onViewEntryDetails: function (oEvent) {
      const oItem = oEvent.getSource();
      const oBindingContext = oItem.getBindingContext("journalEntries");
      const oEntry = oBindingContext.getObject();
      this._uiManager.showEntryDetailsDialog(oEntry);
    },

    onItemPress: function (oEvent) {
      this.onViewEntryDetails(oEvent);
    },

    onExportData: function (oEvent) {
      const sourceControl = oEvent.getSource();
      if (!sourceControl || !sourceControl.getCustomData) {
        MessageBox.error("Export information not available.");
        return;
      }

      const customData = sourceControl.getCustomData();
      if (!customData || !Array.isArray(customData) || customData.length === 0) {
        MessageBox.error("Export configuration not available.");
        return;
      }

      const formatData = customData.find(data => data.getKey() === "format");
      const typeData = customData.find(data => data.getKey() === "type");

      if (!formatData || !typeData) {
        MessageBox.error("Export parameters not configured correctly.");
        return;
      }

      const format = formatData.getValue();
      const type = typeData.getValue();

      this._exportManager.exportData(format, type, this._uiManager);
    },

    // ****************************************
    // * Dialog Close Handlers
    // ****************************************
    onSuccessDialogClose: function () {
      if (this._uiManager && this._uiManager._dialogs && this._uiManager._dialogs.successDialog) {
        this._uiManager._dialogs.successDialog.close();
      }
    },

    onPartialSuccessDialogClose: function () {
      if (this._uiManager && this._uiManager._dialogs && this._uiManager._dialogs.partialSuccessDialog) {
        this._uiManager._dialogs.partialSuccessDialog.close();
      }
    },

    onErrorDialogClose: function () {
      if (this._uiManager && this._uiManager._dialogs && this._uiManager._dialogs.errorDialog) {
        this._uiManager._dialogs.errorDialog.close();
      }
    },

    // ****************************************
    // * Error & Validation Handlers
    // ****************************************
    onShowErrorSummary: function () {
      const uploadSummaryModel = this.getView().getModel("uploadSummary");
      const errors = uploadSummaryModel.getProperty("/ValidationErrors");

      if (!errors || errors.length === 0) {
        MessageBox.information("No validation errors to display.");
        return;
      }

      this._uiManager.showErrorSummaryDialog(errors, this._exportManager);
    },

    // ****************************************
    // * Reset & Utility Methods
    // ****************************************
    onResetAction: function () {
      const uploadSummaryModel = this.getView().getModel("uploadSummary");
      const isProcessingComplete = uploadSummaryModel.getProperty("/ProcessingComplete");

      if (isProcessingComplete) {
        // If processing is complete, reset without confirmation
        this._resetUploadForm();
      } else {
        // If processing is not complete, show confirmation dialog
        MessageBox.confirm(
          "Are you sure you want to clear all journal entries? This action cannot be undone.",
          {
            title: "Confirm Clear All",
            actions: [MessageBox.Action.YES, MessageBox.Action.NO],
            emphasizedAction: MessageBox.Action.NO,
            onClose: (sAction) => {
              if (sAction === MessageBox.Action.YES) {
                this._resetUploadForm();
              }
            }
          }
        );
      }
    },

    _resetUploadForm: function () {
      // Reset models
      this._resetModels();

      // Reset file uploader
      const fileUploader = this.getView().byId("fileUploader");
      if (fileUploader) {
        fileUploader.clear();
      }

      // Reset filters using base controller method
      this.onResetFilters();

      // Show confirmation message
      sap.m.MessageToast.show("Form has been reset");
    },

    onShowHelp: function () {
      this._uiManager.showHelpDialog(this);
    },

    /**
     * Handle close of help dialog
     */
    onHelpDialogClose: function () {
      this._uiManager._dialogs.helpDialog.close();
    },
    // Method to get base URL for service calls
    getBaseURL: function () {
      var appId = this.getOwnerComponent().getManifestEntry("/sap.app/id");
      var appPath = appId.replaceAll(".", "/");
      var appModulePath = jQuery.sap.getModulePath(appPath);
      return appModulePath;
    }
  });
});