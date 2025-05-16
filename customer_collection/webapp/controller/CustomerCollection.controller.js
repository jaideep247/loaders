sap.ui.define([
  "sap/ui/core/mvc/Controller",
  "sap/m/MessageBox",
  "sap/ui/core/BusyIndicator",
  "sap/ui/model/json/JSONModel",
  "sap/ui/model/Filter",
  "sap/ui/model/FilterOperator",
  "customercollection/service/UserService",
  "customercollection/service/ExcelProcessor",
  "customercollection/service/ValidationManager",
  "customercollection/service/JournalEntryService",
  "customercollection/service/UIManager",
  "customercollection/service/ExportManager",
  "customercollection/service/ErrorHandler",
  "./BaseFilterController"
], function (
  Controller, MessageBox, BusyIndicator, JSONModel,
  Filter, FilterOperator,
  UserService, ExcelProcessor, ValidationManager,
  JournalEntryService, UIManager, ExportManager, ErrorHandler,
  BaseFilterController
) {
  "use strict";

  return BaseFilterController.extend("customercollection.controller.CustomerCollection", {
    constructor: function () {
      BaseFilterController.prototype.constructor.apply(this, arguments);
    },
    // ****************************************
    // * Lifecycle Methods
    // ****************************************
    onInit: function () {
      // Initialize services
      this._initUtilities();

      // Initialize models
      this._initModels();

      // Initialize advanced filter model with specific fields
      this._initAdvancedFilterModel(this.getView(), [
        'glAccount',
        'customerCode',
        'profitCenter',
        'currency',
        'referenceKey'
      ], {
        // Optional initial configuration
        status: "All"
      });

      // Get user info
      this._userService.getUserInfo();

      // Initialize batch processing display with delay to ensure view is fully loaded
      setTimeout(() => {
        const batchContainer = this.byId("batchProcessingDisplayContainer");
        if (batchContainer) {
          console.log("Initializing batch processing display", batchContainer);
          this._uiManager.initBatchProcessingDisplay(batchContainer)
            .then(display => {
              console.log("Batch processing display initialized successfully", display);
              // Share the initialized display with JournalEntryService
              this._journalEntryService.setBatchProcessingDisplay(display);
              console.log("Batch display shared with JournalEntryService");
            })
            .catch(error => {
              console.error("Failed to initialize batch processing display:", error);
            });
        } else {
          console.error("Batch processing display container not found in view");
        }
      }, 500);
    },

    _initUtilities: function () {
      this._userService = new UserService(this);
      this._excelProcessor = new ExcelProcessor(this);
      this._validationManager = new ValidationManager(this);
      this._journalEntryService = new JournalEntryService(this);
      this._uiManager = new UIManager(this);
      this._exportManager = new ExportManager(this);
      this._errorHandler = new ErrorHandler(this);
    },

    // ****************************************
    // * Filtering Methods
    // ****************************************
    onGLAccountFilterChange: function (oEvent) {
      const sGLAccount = oEvent.getParameter("value");
      const advancedFilterModel = this.getView().getModel("advancedFilter");
      advancedFilterModel.setProperty("/glAccount", sGLAccount);

      this._applyComprehensiveFilters(this.getView().byId("journalEntriesTable"), advancedFilterModel, {
        additionalFilters: {
          glAccount: {
            modelField: "GL Account",
            operator: FilterOperator.EQ // Exact match for GL Account
          }
        }
      });
    },

    onCustomerCodeFilterChange: function (oEvent) {
      const sCustomerCode = oEvent.getParameter("value");
      const advancedFilterModel = this.getView().getModel("advancedFilter");
      advancedFilterModel.setProperty("/customerCode", sCustomerCode);

      this._applyComprehensiveFilters(this.getView().byId("journalEntriesTable"), advancedFilterModel, {
        additionalFilters: {
          customerCode: {
            modelField: "Customer Code",
            operator: FilterOperator.EQ // Exact match for Customer Code
          }
        }
      });
    },

    onProfitCenterFilterChange: function (oEvent) {
      const sProfitCenter = oEvent.getParameter("value");
      const advancedFilterModel = this.getView().getModel("advancedFilter");
      advancedFilterModel.setProperty("/profitCenter", sProfitCenter);

      this._applyComprehensiveFilters(this.getView().byId("journalEntriesTable"), advancedFilterModel, {
        additionalFilters: {
          profitCenter: {
            modelField: "Profit Center",
            operator: FilterOperator.Contains // Partial match for Profit Center
          }
        }
      });
    },

    onCurrencyFilterChange: function (oEvent) {
      const sCurrency = oEvent.getParameter("value");
      const advancedFilterModel = this.getView().getModel("advancedFilter");
      advancedFilterModel.setProperty("/currency", sCurrency);

      this._applyComprehensiveFilters(this.getView().byId("journalEntriesTable"), advancedFilterModel, {
        additionalFilters: {
          currency: {
            modelField: "Currency",
            operator: FilterOperator.EQ // Exact match for Currency
          }
        }
      });
    },

    onAmountRangeFilterChange: function () {
      const advancedFilterModel = this.getView().getModel("advancedFilter");
      const minAmount = advancedFilterModel.getProperty("/minAmount");
      const maxAmount = advancedFilterModel.getProperty("/maxAmount");

      this._applyComprehensiveFilters(this.getView().byId("journalEntriesTable"), advancedFilterModel, {
        additionalFilters: {
          minAmount: {
            modelField: "Amount",
            operator: FilterOperator.GE,
            numeric: true
          },
          maxAmount: {
            modelField: "Amount",
            operator: FilterOperator.LE,
            numeric: true
          }
        }
      });
    },

    onReferenceKeyFilterChange: function (oEvent) {
      const sReferenceKey = oEvent.getParameter("value");
      const advancedFilterModel = this.getView().getModel("advancedFilter");

      // Set reference key in advanced filter model
      advancedFilterModel.setProperty("/referenceKey", sReferenceKey);

      const oTable = this.getView().byId("journalEntriesTable");

      // Apply comprehensive filters
      this._applyComprehensiveFilters(oTable, advancedFilterModel, {
        additionalFilters: {
          referenceKey: {
            modelField: "Reference Key 1",
            operator: FilterOperator.Contains
          }
        }
      });
    },
    _applyComprehensiveFilters: function (oTable, oAdvancedFilterModel, mConfig = {}) {
      if (!oTable || !oAdvancedFilterModel) return;

      const aFilters = [];
      const filterData = oAdvancedFilterModel.getData();

      // 1. Add search filters if configured
      if (mConfig.searchColumns) {
        const searchFilters = this._createSearchFilters(
          filterData.searchQuery,
          mConfig.searchColumns
        );
        aFilters.push(...searchFilters);
      }

      // 2. Add standard filters (status)
      this._addStandardFilters(filterData, aFilters);

      // 3. Add additional specific filters
      if (mConfig.additionalFilters) {
        this._addAdditionalFilters(filterData, aFilters, mConfig.additionalFilters);
      }

      // Apply all filters to the table
      const oBinding = oTable.getBinding("items");
      if (oBinding) {
        oBinding.filter(aFilters.length > 0 ? aFilters : []);
        this._updateFilteredCount(oTable);
      }
    },

    onCurrencyFilterChange: function (oEvent) {
      const sCurrency = oEvent.getParameter("value");
      const advancedFilterModel = this.getView().getModel("advancedFilter");

      // Set currency in advanced filter model
      advancedFilterModel.setProperty("/currency", sCurrency);

      const oTable = this.getView().byId("journalEntriesTable");

      // Apply comprehensive filters
      this._applyComprehensiveFilters(oTable, advancedFilterModel, {
        additionalFilters: {
          currency: {
            modelField: "Currency",
            operator: FilterOperator.EQ
          }
        }
      });
    },

    onSearchEntries: function (oEvent) {
      const sQuery = oEvent.getParameter("query");
      const advancedFilterModel = this.getView().getModel("advancedFilter");

      // Set search query in advanced filter model
      advancedFilterModel.setProperty("/searchQuery", sQuery);

      const oTable = this.getView().byId("journalEntriesTable");

      // Apply comprehensive filters with customer-specific search columns
      this._applyComprehensiveFilters(oTable, advancedFilterModel, {
        searchColumns: [
          "Sequence ID",
          "Accounting Document Type",
          "Company Code",
          "GL Account",
          "Customer Code",
          "Entry Type",
          "status"
        ]
      });
    },

    onStatusFilterChange: function (oEvent) {
      const sSelectedKey = oEvent.getParameter("selectedItem").getKey();
      const advancedFilterModel = this.getView().getModel("advancedFilter");

      // Set status in advanced filter model
      advancedFilterModel.setProperty("/status", sSelectedKey);

      const oTable = this.getView().byId("journalEntriesTable");

      // Apply comprehensive filters
      this._applyComprehensiveFilters(oTable, advancedFilterModel);
    },

    onResetFilters: function () {
      // Use base filter controller's reset method
      this._resetAllFilters(this.getView());
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
      this._resetFilters();
    },

    _resetModels: function () {
      const uploadSummaryModel = this.getView().getModel("uploadSummary");
      const journalEntriesModel = this.getView().getModel("journalEntries");

      uploadSummaryModel.setData({
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

      journalEntriesModel.setData({
        transactions: [],
        validationStatus: "Pending",
        filteredCount: 0,
        processedEntries: [],
        postedDocuments: []
      });
    },

    // ****************************************
    // * Entry Detail & Item Handlers
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
          navigator.clipboard.writeText()
          document.body.removeChild(textArea);
          sap.m.MessageToast.show("Transaction ID copied to clipboard");
        } catch (err) {
          console.error("Failed to copy transaction ID", err);
        }
      }
    },

    // ****************************************
    // * Template & Export Functions
    // ****************************************
    onDownloadTemplate: function () {
      this._exportManager.downloadTemplate();
      sap.m.MessageToast.show("Template downloaded successfully");
    },

    onExportToExcel: function () {
      const journalEntriesModel = this.getView().getModel("journalEntries");
      const transactions = journalEntriesModel.getProperty("/transactions");
      const oTable = this.getView().byId("journalEntriesTable");
      const oBinding = oTable.getBinding("items");

      // Use current filters if any
      const filteredEntries = oBinding ?
        transactions.filter((_, index) => oBinding.aIndices.includes(index)) :
        transactions;

      if (filteredEntries.length === 0) {
        MessageBox.information("No data to export.");
        return;
      }

      this._exportManager.exportToExcel(filteredEntries, "Customer_Collection_Log.xlsx");
    },

    onExportData: function (oEvent) {
      const format = oEvent.getSource().getCustomData().find(data => data.getKey() === "format").getValue();
      const type = oEvent.getSource().getCustomData().find(data => data.getKey() === "type").getValue();

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
    // * Error & Validation Functions
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

    /**
     * Handle close of error summary dialog
     */
    onErrorSummaryClose: function () {
      this._uiManager._dialogs.errorSummaryDialog.close();
    },

    /**
     * Handle export of error summary
     */
    onExportErrorSummary: function () {
      // Get the error data from the dialog model
      const dialogModel = this._uiManager._dialogs.errorSummaryDialog.getModel("errorSummary");
      const errors = dialogModel ? dialogModel.getData().errors : [];

      // Call the export function from the export manager or UI manager
      if (this._exportManager && typeof this._exportManager.exportErrorLog === 'function') {
        this._exportManager.exportErrorLog(errors);
      } else if (this._uiManager && typeof this._uiManager._exportErrorList === 'function') {
        this._uiManager._exportErrorList(errors);
      }

      // Close the dialog
      this._uiManager._dialogs.errorSummaryDialog.close();
    },
    /**
     * Handle close of validation stats dialog
     */
    onValidationStatsClose: function () {
      this._uiManager._dialogs.validationStatsDialog.close();
    },
    // ****************************************
    // * Utility Functions
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

      // Reset filters
      this._resetAllFilters(this.getView());

      // Show confirmation message
      sap.m.MessageToast.show("Form has been reset");
    },

    onTableViewChange: function (oEvent) {
      const sKey = oEvent.getParameter("item").getKey();
      const oFilterModel = this.getView().getModel("advancedFilter");

      // Update the status filter in the model
      oFilterModel.setProperty("/status", sKey);

      // Use the comprehensive filters method that exists in this controller
      const oTable = this.getView().byId("journalEntriesTable");
      this._applyComprehensiveFilters(oTable, oFilterModel);
    },

    _resetFilters: function () {
      const oStatusFilter = this.getView().byId("statusFilterComboBox");
      const oViewSelector = this.getView().byId("tableViewSelector");

      if (oStatusFilter) oStatusFilter.setSelectedKey("All"); 
      if (oViewSelector) oViewSelector.setSelectedKey("All");
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