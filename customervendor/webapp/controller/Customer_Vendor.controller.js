sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap/m/MessageBox",
    "sap/m/MessageToast",
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
    Controller, MessageBox, MessageToast, BusyIndicator, JSONModel,
    Filter, FilterOperator,
    UserService, ExcelProcessor, ValidationManager,
    JournalEntryService, UIManager, ExportManager, ErrorHandler,
    ModelManager, BaseFilterController
) {
    "use strict";

    return BaseFilterController.extend("customervendor.controller.Customer_Vendor", {
        // ****************************************
        // * Lifecycle Methods
        // ****************************************
        onInit: function () {
            // Initialize services
            this._initUtilities();

            // Initialize filter model
            this._initCustomerVendorFilterModel();

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
            // Initialize services that depend on models          
            this._excelProcessor = new ExcelProcessor(this);
            this._validationManager = new ValidationManager(this);
            this._journalEntryService = new JournalEntryService(this);
            this._userService = new UserService(this);
            this._uiManager = new UIManager(this);
            this._exportManager = new ExportManager(this);
            this._errorHandler = new ErrorHandler(this);

        },

        // Customer-specific filter model initialization
        _initCustomerVendorFilterModel: function () {
            const filterModel = {
                status: "All",
                sheet: "All",
                indicator: "All",
                vendorCode: "",
                customerCode: "",
                referenceKey: "",
                businessPlace: "",
                companyCode: "",
                searchQuery: ""
            };

            const oAdvancedFilterModel = new JSONModel(filterModel);
            this.getView().setModel(oAdvancedFilterModel, "advancedFilter");
            return oAdvancedFilterModel;
        },

        // ****************************************
        // * Filter Change Handlers with Enhanced Filtering
        // ****************************************
        /**
         * Resets all filters to default values
         */
        onResetFilters: function () {
            try {
                // Reset filter model
                const oFilterModel = this.getView().getModel("advancedFilter");
                oFilterModel.setData({
                    status: "All",
                    sheet: "All",
                    indicator: "All",
                    vendorCode: "",
                    customerCode: "",
                    referenceKey: "",
                    businessPlace: "",
                    companyCode: "",
                    searchQuery: ""
                });

                // Reset UI controls
                this._resetFilterControls();

                // Reset table filters
                const oTable = this.getView().byId("journalEntriesTable");
                if (oTable) {
                    const oBinding = oTable.getBinding("items");
                    oBinding.filter([]);
                    this._updateFilteredCount(oTable);
                }

                MessageToast.show("All filters have been reset");
            } catch (error) {
                console.error("Error resetting filters:", error);
                MessageToast.show("Error resetting filters");
            }
        },

        /**
         * Reset all filter UI controls
         */
        _resetFilterControls: function () {
            const aControlIds = [
                "statusFilterComboBox",
                "sheetFilterComboBox",
                "indicatorFilterComboBox",
                "vendorCodeFilter",
                "customerCodeFilter",
                "referenceKeyFilter",
                "businessPlaceFilter",
                "companyCodeFilter",
                "entriesSearchField"
            ];

            aControlIds.forEach(sId => {
                const oControl = this.byId(sId);
                if (!oControl) return;

                if (sId.endsWith("ComboBox")) {
                    oControl.setSelectedKey("All");                
                } else {
                    oControl.setValue("");
                }
            });
        },
        // Filter Change Handlers
        onStatusFilterChange: function (oEvent) {
            const sStatus = oEvent.getParameter("selectedItem").getKey();
            this.getView().getModel("advancedFilter").setProperty("/status", sStatus);
            this._applyCustomerVendorFilters();
        },

        onSheetFilterChange: function (oEvent) {
            const sSheet = oEvent.getParameter("selectedItem").getKey();
            this.getView().getModel("advancedFilter").setProperty("/sheet", sSheet);
            this._applyCustomerVendorFilters();
        },

        onIndicatorFilterChange: function (oEvent) {
            const sIndicator = oEvent.getParameter("selectedItem").getKey();
            this.getView().getModel("advancedFilter").setProperty("/indicator", sIndicator);
            this._applyCustomerVendorFilters();
        },

        onVendorCodeFilterChange: function (oEvent) {
            const sVendorCode = oEvent.getParameter("newValue");
            this.getView().getModel("advancedFilter").setProperty("/vendorCode", sVendorCode);
            this._applyCustomerVendorFilters();
        },

        onCustomerCodeFilterChange: function (oEvent) {
            const sCustomerCode =
                oEvent.getParameter("value") ||
                oEvent.getParameter("newValue") ||
                (oEvent.getSource().getValue ? oEvent.getSource().getValue() : "");

            // Ensure sCustomerCode is a string
            const cleanedCustomerCode = String(sCustomerCode).trim();

            // Update model with the cleaned value
            this.getView().getModel("advancedFilter").setProperty("/customerCode", cleanedCustomerCode);

            // Apply filters
            this._applyCustomerVendorFilters();
        },

        onReferenceKeyFilterChange: function (oEvent) {
            const sReferenceKey = oEvent.getParameter("newValue");
            this.getView().getModel("advancedFilter").setProperty("/referenceKey", sReferenceKey);
            this._applyCustomerVendorFilters();
        },

        onBusinessPlaceFilterChange: function (oEvent) {
            const sBusinessPlace = oEvent.getParameter("newValue");
            this.getView().getModel("advancedFilter").setProperty("/businessPlace", sBusinessPlace);
            this._applyCustomerVendorFilters();
        },

        onCompanyCodeFilterChange: function (oEvent) {
            const sCompanyCode = oEvent.getParameter("newValue");
            this.getView().getModel("advancedFilter").setProperty("/companyCode", sCompanyCode);
            this._applyCustomerVendorFilters();
        },
      
        onSearchEntries: function (oEvent) {
            const sQuery = oEvent.getParameter("query");
            this.getView().getModel("advancedFilter").setProperty("/searchQuery", sQuery);
            this._applyCustomerVendorFilters();
        },

        onLiveSearch: function (oEvent) {
            const sQuery = oEvent.getParameter("newValue");
            this.getView().getModel("advancedFilter").setProperty("/searchQuery", sQuery);
            this._applyCustomerVendorFilters();
        },

        onTableViewChange: function (oEvent) {
            const sKey = oEvent.getParameter("item").getKey();
            const oFilterModel = this.getView().getModel("advancedFilter");

            // Update the status filter in the model
            oFilterModel.setProperty("/status", sKey);

            // Apply the filters to update the table
            this._applyCustomerVendorFilters();
        },

        /**
         * Update filtered count in the model
         */
        _updateFilteredCount: function (oTable) {
            const oBinding = oTable.getBinding("items");
            const filteredCount = oBinding.getLength();
            const journalEntriesModel = this._modelManager.getModel("journalEntries");
            journalEntriesModel.setProperty("/filteredCount", filteredCount);
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

            // Reset models using ModelManager
            this._modelManager.resetModels();

            // Update UI settings
            const uploadSummaryModel = this._modelManager.getModel("uploadSummary");
            uploadSummaryModel.setProperty("/IsSubmitEnabled", false);

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

        // ****************************************
        // * Journal Entry Submission
        // ****************************************
        onSubmitJournalEntries: function () {
            const uploadSummaryModel = this._modelManager.getModel("uploadSummary");
            const journalEntriesModel = this._modelManager.getModel("journalEntries");

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
            const batchDisplay = this._modelManager.getModel("batchDisplay");
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
            const journalEntriesModel = this._modelManager.getModel("journalEntries");
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

            this._exportManager.exportToExcel(filteredEntries, "Customer_Vendor_Log.xlsx");
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
            const uploadSummaryModel = this._modelManager.getModel("uploadSummary");
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
            const uploadSummaryModel = this._modelManager.getModel("uploadSummary");
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
            // Reset models using ModelManager
            this._modelManager.resetModels();

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
        },

        /**
         * Apply comprehensive filters to the journal entries table
         * @private
         */
        _applyCustomerVendorFilters: function () {
            try {
                const oTable = this.getView().byId("journalEntriesTable");
                if (!oTable) {
                    console.error("Journal entries table not found");
                    return;
                }

                const oFilterModel = this.getView().getModel("advancedFilter");
                const filterData = oFilterModel.getData();
                const aFilters = [];

                // Status filter
                if (filterData.status && filterData.status !== "All") {
                    aFilters.push(new Filter("status", FilterOperator.EQ, String(filterData.status)));
                }

                // Sheet filter
                if (filterData.sheet && filterData.sheet !== "All") {
                    aFilters.push(new Filter("Sheet", FilterOperator.EQ, String(filterData.sheet)));
                }

                // Indicator filter
                if (filterData.indicator && filterData.indicator !== "All") {
                    aFilters.push(new Filter("Indicator", FilterOperator.EQ, String(filterData.indicator)));
                }

                // Vendor code filter
                if (filterData.vendorCode) {
                    aFilters.push(new Filter("Vendor Code", FilterOperator.Contains, String(filterData.vendorCode)));
                }

                // Customer code filter
                if (filterData.customerCode) {
                    aFilters.push(new Filter("Customer Code", FilterOperator.Contains, String(filterData.customerCode)));
                }

                // Reference key filter
                if (filterData.referenceKey) {
                    aFilters.push(new Filter("Reference Key 1", FilterOperator.Contains, String(filterData.referenceKey)));
                }

                // Business place filter
                if (filterData.businessPlace) {
                    aFilters.push(new Filter("Business Place", FilterOperator.Contains, String(filterData.businessPlace)));
                }

                // Company code filter
                if (filterData.companyCode) {
                    aFilters.push(new Filter("Company Code", FilterOperator.Contains, String(filterData.companyCode)));
                }
            
                // Search filter
                if (filterData.searchQuery) {
                    const sQuery = String(filterData.searchQuery);
                    const searchFilters = [
                        new Filter("Sequence ID", FilterOperator.Contains, sQuery),
                        new Filter("Accounting Document Type", FilterOperator.Contains, sQuery),
                        new Filter("Vendor Code", FilterOperator.Contains, sQuery),
                        new Filter("Customer Code", FilterOperator.Contains, sQuery),
                        new Filter("status", FilterOperator.Contains, sQuery)
                    ];
                    aFilters.push(new Filter({ filters: searchFilters, and: false }));
                }

                // Apply filters
                const oBinding = oTable.getBinding("items");
                oBinding.filter(aFilters);

                // Update filtered count
                this._updateFilteredCount(oTable);

            } catch (error) {
                console.error("Error applying filters:", error);
                MessageToast.show("Error applying filters");
            }
        }
    });
});