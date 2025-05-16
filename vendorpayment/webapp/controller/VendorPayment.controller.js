sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap/m/MessageBox",
    "sap/ui/core/BusyIndicator",
    "sap/ui/model/json/JSONModel",
    "sap/ui/model/Filter",
    "sap/ui/model/FilterOperator",
    "vendorpayment/service/UserService",
    "vendorpayment/service/ExcelProcessor",
    "vendorpayment/service/ValidationManager",
    "vendorpayment/service/JournalEntryService",
    "vendorpayment/service/UIManager",
    "vendorpayment/service/ExportManager",
    "vendorpayment/service/ErrorHandler"
  ], function (
    Controller, MessageBox, BusyIndicator, JSONModel,
    Filter, FilterOperator,
    UserService, ExcelProcessor, ValidationManager,
    JournalEntryService, UIManager, ExportManager, ErrorHandler
  ) {
    "use strict";
  
    return Controller.extend("vendorpayment.controller.VendorPayment", {
      // ****************************************
      // * Lifecycle Methods
      // ****************************************
      onInit: function () {
        // Initialize services
        this._userService = new UserService(this);
        this._excelProcessor = new ExcelProcessor(this);
        this._validationManager = new ValidationManager(this);
        this._journalEntryService = new JournalEntryService(this);
        this._uiManager = new UIManager(this);
        this._exportManager = new ExportManager(this);
        this._errorHandler = new ErrorHandler(this);
  
        // Initialize models
        this._initModels();
  
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
      // * Table Filtering Methods
      // ****************************************
      onSearchEntries: function (oEvent) {
        const sQuery = oEvent.getParameter("query");
        const oTable = this.getView().byId("journalEntriesTable");
        const oBinding = oTable.getBinding("items");
  
        if (!oBinding) {
          return;
        }
  
        const aFilters = [];
        if (sQuery) {
          // Create filters for multiple columns
          const columns = [
            "Sequence ID",
            "Accounting Document Type",
            "Company Code",
            "GL Account",
            "Entry Type",
            "status"
          ];
  
          const filterArray = columns.map(
            (columnName) =>
              new Filter(columnName, FilterOperator.Contains, sQuery)
          );
  
          // Combine filters with OR condition
          aFilters.push(
            new Filter({
              filters: filterArray,
              and: false
            })
          );
        }
  
        // Apply filters
        oBinding.filter(aFilters);
  
        // Update filtered count
        setTimeout(() => {
          this._updateFilteredCount();
        }, 100);
      },
  
      _updateFilteredCount: function () {
        const oTable = this.getView().byId("journalEntriesTable");
        const oBinding = oTable.getBinding("items");
  
        if (oBinding) {
          const filteredCount = oBinding.getLength();
          const oJournalEntriesModel = this.getView().getModel("journalEntries");
          oJournalEntriesModel.setProperty("/filteredCount", filteredCount);
        }
      },
  
      onStatusFilterChange: function () {
        this._applyFilters();
      },
  
      onDateRangeChange: function () {
        this._applyFilters();
      },
  
      onTableViewChange: function (oEvent) {
        const sKey = oEvent.getParameter("item").getKey();
        const oStatusFilter = this.getView().byId("statusFilterComboBox");
  
        if (sKey !== "All") {
          oStatusFilter.setSelectedKey(sKey);
        } else {
          oStatusFilter.setSelectedKey("All");
        }
  
        this._applyFilters();
      },
  
      _resetFilters: function () {
        const oStatusFilter = this.getView().byId("statusFilterComboBox");
        const oDateRangeFilter = this.getView().byId("postingDateFilter");
        const oViewSelector = this.getView().byId("tableViewSelector");
  
        oStatusFilter.setSelectedKey("All");
        oDateRangeFilter.setValue("");
        oViewSelector.setSelectedKey("All");
      },
  
      onResetFilters: function () {
        this._resetFilters();
        this._applyFilters();
        sap.m.MessageToast.show("Filters reset");
      },
  
      _applyFilters: function () {
        const oTable = this.getView().byId("journalEntriesTable");
        const oBinding = oTable.getBinding("items");
        const oStatusFilter = this.getView().byId("statusFilterComboBox");
        const oDateRangeFilter = this.getView().byId("postingDateFilter");
  
        if (!oBinding) return;
  
        const aFilters = [];
  
        // Status filter
        const sStatusKey = oStatusFilter.getSelectedKey();
        if (sStatusKey && sStatusKey !== "All") {
          aFilters.push(new Filter("status", FilterOperator.EQ, sStatusKey));
        }
  
        // Date range filter
        const sDateRange = oDateRangeFilter.getValue();
        if (sDateRange) {
          const aDates = sDateRange.split(" - ");
          if (aDates.length === 2) {
            aFilters.push(new Filter("Posting Date", FilterOperator.BT, aDates[0], aDates[1]));
          }
        }
  
        // Apply filters
        const oCombinedFilter = aFilters.length > 0 ? new Filter({
          filters: aFilters,
          and: true
        }) : null;
  
        oBinding.filter(oCombinedFilter);
  
        // Update filtered count after filter is applied
        setTimeout(() => {
          this._updateFilteredCount();
        }, 100);
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
  
        this._exportManager.exportToExcel(filteredEntries, "Journal_Entries_Export.xlsx");
      },
  
      onExportData: function (oEvent) {
        const format = oEvent.getSource().getCustomData().find(data => data.getKey() === "format").getValue();
        const type = oEvent.getSource().getCustomData().find(data => data.getKey() === "type").getValue();
  
        this._exportManager.exportData(format, type, this._uiManager);
      },
  
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
        this._resetFilters();
  
        // Show confirmation message
        sap.m.MessageToast.show("Form has been reset");
      },
  
      onShowHelp: function () {
        this._uiManager.showHelpDialog(this);
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