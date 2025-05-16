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
  "../model/ModelManager",
  "./BaseFilterController"
], function (
  Controller, MessageBox, BusyIndicator, JSONModel,
  Filter, FilterOperator,
  UserService, ExcelProcessor, ValidationManager,
  JournalEntryService, UIManager, ExportManager, ErrorHandler,
  ModelManager, BaseFilterController
) {
  "use strict";

  return BaseFilterController.extend("vendortovendor.controller.vendor_to_vendor", {
    // ****************************************
    // * Lifecycle Methods
    // ****************************************
    onInit: function () {

      // Initialize models
      this._initModels();

      // Initialize services
      this._initUtilities();

      // Initialize filter model
      this._initVendorFilterModel();

      // Initialize advanced filter model with specific fields
      this._initVendorFilterModel(this.getView(), [
        'vendorCode',
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
      this._userService = new UserService(this);
      this._excelProcessor = new ExcelProcessor(this);
      this._validationManager = new ValidationManager(this);
      this._journalEntryService = new JournalEntryService(this);
      this._uiManager = new UIManager(this);
      this._exportManager = new ExportManager(this);
      this._errorHandler = new ErrorHandler(this);
    },

    _initModels: function () {
      this._modelManager = new ModelManager(this);
      this._modelManager.initializeModels();
      // Set initial state
      setTimeout(() => {
        this.onResetFilters();
      }, 100);
    },

    // ****************************************
    // * Filtering Methods
    // ****************************************
    // Status filter change handler
    onStatusFilterChange: function (oEvent) {
      const sStatus = oEvent.getParameter("selectedItem").getKey();
      this.getView().getModel("advancedFilter").setProperty("/status", sStatus);
      this._applyVendorFilters();
    },

    // Sheet filter change handler
    onSheetFilterChange: function (oEvent) {
      const sSheet = oEvent.getParameter("selectedItem").getKey();
      this.getView().getModel("advancedFilter").setProperty("/sheet", sSheet);
      this._applyVendorFilters();
    },

    // Indicator filter change handler
    onIndicatorFilterChange: function (oEvent) {
      const sIndicator = oEvent.getParameter("selectedItem").getKey();
      this.getView().getModel("advancedFilter").setProperty("/indicator", sIndicator);
      this._applyVendorFilters();
    },

    // Vendor code filter change handler
    onVendorCodeFilterChange: function (oEvent) {
      const sVendorCode = oEvent.getParameter("value");
      this.getView().getModel("advancedFilter").setProperty("/vendorCode", sVendorCode);
      this._applyVendorFilters();
    },

    // Reference key filter change handler
    onReferenceKeyFilterChange: function (oEvent) {
      const sReferenceKey = oEvent.getParameter("value");
      this.getView().getModel("advancedFilter").setProperty("/referenceKey", sReferenceKey);
      this._applyVendorFilters();
    },

    // Business place filter change handler
    onBusinessPlaceFilterChange: function (oEvent) {
      const sBusinessPlace = oEvent.getParameter("value");
      this.getView().getModel("advancedFilter").setProperty("/businessPlace", sBusinessPlace);
      this._applyVendorFilters();
    },
 
    // Search field handler
    onSearchEntries: function (oEvent) {
      const sQuery = oEvent.getParameter("query");
      this.getView().getModel("advancedFilter").setProperty("/searchQuery", sQuery);
      this._applyVendorFilters();
    },

    // Live search handler
    onLiveSearch: function (oEvent) {
      const sQuery = oEvent.getParameter("newValue");
      this.getView().getModel("advancedFilter").setProperty("/searchQuery", sQuery);
      this._applyVendorFilters();
    },

    // Table view selector change handler
    onTableViewChange: function (oEvent) {
      const sKey = oEvent.getParameter("item").getKey();
      const oFilterModel = this.getView().getModel("advancedFilter");

      // Update the status filter in the model
      oFilterModel.setProperty("/status", sKey);
      // Apply the filters to update the table      
      this._applyVendorFilters();
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
    // * Export & Utility Functions
    // ****************************************
    onDownloadTemplate: function () {
      this._exportManager.downloadTemplate();
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

      this._exportManager.exportToExcel(filteredEntries, "Journal_Entries_Export.xlsx");
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

    /**
     * Handle close of validation stats dialog
     */
    onValidationStatsClose: function () {
      this._uiManager._dialogs.validationStatsDialog.close();
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
      this._resetAllFilters(this.getView());

      // Show confirmation message
      sap.m.MessageToast.show("Form has been reset");
    },
    // Add these methods to your controller

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