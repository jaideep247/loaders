sap.ui.define([
    "./BaseFilterController",
    "sap/m/MessageBox",
    "sap/ui/core/BusyIndicator",
    "sap/ui/model/json/JSONModel",
    "sap/ui/model/Filter",
    "sap/ui/model/FilterOperator",
    "../service/UserService",
    "../service/ExcelProcessor",
    "../service/ValidationManager",
    "../service/SupplierInvoiceService",
    "../service/UIManager",
    "../service/ExportManager",
    "../service/ErrorHandler",
    "../model/ModelManager",
], function (
    BaseFilterController, MessageBox, BusyIndicator, JSONModel,
    Filter, FilterOperator,
    UserService, ExcelProcessor, ValidationManager,
    SupplierInvoiceService, UIManager, ExportManager, ErrorHandler,
    ModelManager
) {
    "use strict";

    return BaseFilterController.extend("supplierinvoice.controller.supplierinvoice", {
        // ****************************************
        // * Lifecycle Methods
        // ****************************************
        onInit: function () {
            // Initialize services
            this._initUtilities();

            // Initialize filter model with supplier invoice specific fields
            this._initFilterModel(['supplierFields'], {
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
                            this._supplierInvoiceService.setBatchProcessingDisplay(display);
                        })
                        .catch(error => {
                            console.error("Failed to initialize batch processing display:", error);
                        });
                }
            }, 500);

            // Set initial filter state
            setTimeout(() => {
                this.onResetFilters();
            }, 100);
        },

        _initUtilities: function () {
            // Initialize ModelManager first
            this._modelManager = new ModelManager(this);
            this._modelManager.initializeModels();

            // Initialize services with supplier invoice specific service
            this._userService = new UserService(this);
            this._excelProcessor = new ExcelProcessor(this);
            this._validationManager = new ValidationManager(this);
            this._supplierInvoiceService = new SupplierInvoiceService(this);
            this._uiManager = new UIManager(this);
            this._exportManager = new ExportManager(this);
            this._errorHandler = new ErrorHandler(this);
        },

        // ****************************************
        // * Filter Event Handlers
        // ****************************************

        onStatusFilterChange: function (oEvent) {
            const sStatus = oEvent.getParameter("selectedItem").getKey();
            this.getView().getModel("advancedFilter").setProperty("/status", sStatus);
            this._applyFilters();
        },

        onTableViewChange: function (oEvent) {
            const sKey = oEvent.getParameter("item").getKey();
            const statusFilter = this.byId("statusFilterComboBox");
            if (statusFilter) {
                statusFilter.setSelectedKey(sKey);
            }
            this.getView().getModel("advancedFilter").setProperty("/status", sKey);
            this._applyFilters();
        },

        onCompanyCodeFilterChange: function (oEvent) {
            const sCompanyCode = oEvent.getParameter("newValue");
            this.getView().getModel("advancedFilter").setProperty("/companyCode", sCompanyCode);
            this._applyFilters();
        },

        onSupplierIdFilterChange: function (oEvent) {
            const sSupplierId = oEvent.getParameter("newValue");
            this.getView().getModel("advancedFilter").setProperty("/supplierId", sSupplierId);
            this._applyFilters();
        },

        onInvoiceNumberFilterChange: function (oEvent) {
            const sInvoiceNumber = oEvent.getParameter("newValue");
            this.getView().getModel("advancedFilter").setProperty("/invoiceNumber", sInvoiceNumber);
            this._applyFilters();
        },

        onBusinessPlaceFilterChange: function (oEvent) {
            const sBusinessPlace = oEvent.getParameter("newValue");
            this.getView().getModel("advancedFilter").setProperty("/businessPlace", sBusinessPlace);
            this._applyFilters();
        },

        onFiscalYearFilterChange: function (oEvent) {
            const sFiscalYear = oEvent.getParameter("newValue");
            this.getView().getModel("advancedFilter").setProperty("/fiscalYear", sFiscalYear);
            this._applyFilters();
        },

        onSearchInvoices: function (oEvent) {
            const sQuery = oEvent.getParameter("query");
            this.getView().getModel("advancedFilter").setProperty("/searchQuery", sQuery);
            this._applyFilters();
        },

        onLiveSearch: function (oEvent) {
            const sQuery = oEvent.getParameter("newValue");
            this.getView().getModel("advancedFilter").setProperty("/searchQuery", sQuery);
            this._applyFilters();
        },

        // ****************************************
        // * Filter Methods - Override BaseFilterController
        // ****************************************

        // Override the base filter method to add supplier invoice specific filters
        _applyFilters: function () {
            // Call the parent method first to apply common filters
            BaseFilterController.prototype._applyFilters.call(this, "supplierInvoicesTable", "supplierInvoices");

            // Now add supplier invoice specific filters
            const oTable = this.getView().byId("supplierInvoicesTable");
            if (!oTable || !oTable.getBinding("items")) {
                return;
            }

            const oFilterModel = this.getView().getModel("advancedFilter");
            const filterData = oFilterModel.getData();

            // Get existing filters
            const existingFilters = oTable.getBinding("items").aFilters || [];
            const aFilters = [...existingFilters];

            // Company code filter (supplier specific)
            if (filterData.companyCode) {
                aFilters.push(new Filter("CompanyCode", FilterOperator.Contains, filterData.companyCode));
            }

            // Supplier ID filter (supplier specific)
            if (filterData.supplierId) {
                aFilters.push(new Filter("InvoicingParty", FilterOperator.Contains, filterData.supplierId));
            }

            // Invoice number filter (supplier specific)
            if (filterData.invoiceNumber) {
                aFilters.push(new Filter("SupplierInvoiceIDByInvcgParty", FilterOperator.Contains, filterData.invoiceNumber));
            }

            // Fiscal year filter (supplier specific)
            if (filterData.fiscalYear) {
                aFilters.push(new Filter("InvoiceReferenceFiscalYear", FilterOperator.Contains, filterData.fiscalYear));
            }

            // Apply all filters
            oTable.getBinding("items").filter(aFilters);

            // Update filtered count
            this._updateFilteredCount(oTable, "supplierInvoices");
        },

        // Override the reset filters method to reset supplier specific controls
        onResetFilters: function () {
            // Call parent method first
            BaseFilterController.prototype.onResetFilters.apply(this, arguments);

            // Additional supplier-specific resets
            // These should already be covered by the parent method but we're being explicit
            const companyCodeFilter = this.byId("companyCodeFilter");
            if (companyCodeFilter) companyCodeFilter.setValue("");

            const supplierIdFilter = this.byId("supplierIdFilter");
            if (supplierIdFilter) supplierIdFilter.setValue("");

            const invoiceNumberFilter = this.byId("invoiceNumberFilter");
            if (invoiceNumberFilter) invoiceNumberFilter.setValue("");

            const fiscalYearFilter = this.byId("fiscalYearFilter");
            if (fiscalYearFilter) fiscalYearFilter.setValue("");

            // Apply filters
            this._applyFilters();
        },

        // Remove this method as it's inherited from BaseFilterController
        // _updateFilteredCount: function (oTable) {
        //   const oBinding = oTable.getBinding("items");
        //   const filteredCount = oBinding ? oBinding.getLength() : 0;
        //   const supplierInvoicesModel = oTable.getModel("supplierInvoices");
        //   supplierInvoicesModel.setProperty("/filteredCount", filteredCount);
        // },

        // Implement the base controller's reset filters functionality
        onResetFilters: function () {
            // Call the parent method
            BaseFilterController.prototype.onResetFilters.apply(this, arguments);

            // Reset supplier invoice specific filters
            const oFilterModel = this.getView().getModel("advancedFilter");
            oFilterModel.setProperty("/companyCode", "");
            oFilterModel.setProperty("/supplierId", "");
            oFilterModel.setProperty("/invoiceNumber", "");
            oFilterModel.setProperty("/fiscalYear", "");

            // Reset UI controls specific to supplier invoices
            this.byId("companyCodeFilter").setValue("");
            this.byId("supplierIdFilter").setValue("");
            this.byId("invoiceNumberFilter").setValue("");
            this.byId("fiscalYearFilter").setValue("");

            // Apply the filters
            this._applyFilters();
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

        // Replace the _resetModels method with the ModelManager usage

        // ****************************************
        // * Supplier Invoice Submission
        // ****************************************
        // ****************************************
        // * Supplier Invoice Submission
        // ****************************************
        onSubmitSupplierInvoices: function () {
            const uploadSummaryModel = this.getView().getModel("uploadSummary");
            const supplierInvoicesModel = this.getView().getModel("supplierInvoices");

            // Ensure entries are valid before submission
            if (!uploadSummaryModel.getProperty("/IsSubmitEnabled")) {
                MessageBox.warning(
                    "Please upload and validate entries before submitting."
                );
                return;
            }

            // Prepare data for submission
            const invoices = supplierInvoicesModel.getProperty("/invoices");
            const validInvoices = invoices.filter(
                (entry) => entry.status === "Valid"
            );

            // Group valid invoices by Sequence Id
            const groupedInvoices = {};
            validInvoices.forEach(invoice => {
                const sequenceId = invoice['Sequence Id'];
                if (!groupedInvoices[sequenceId]) {
                    groupedInvoices[sequenceId] = {
                        header: null,
                        debits: []
                    };
                }

                if (invoice['Entry Type'] === 'Header') { // Assuming 'Entry Type' is populated by ExcelProcessor
                    groupedInvoices[sequenceId].header = invoice;
                } else if (invoice['Entry Type'] === 'Debit') {
                    groupedInvoices[sequenceId].debits.push(invoice);
                }
            });

            // Count by unique sequence IDs
            const entryCount = Object.keys(groupedInvoices).length;

            // Show confirmation dialog before submission
            MessageBox.confirm(
                `You are about to submit ${entryCount} supplier documents (based on Sequence ID). Continue?`,
                {
                    title: "Confirm Submission",
                    actions: [MessageBox.Action.OK, MessageBox.Action.CANCEL],
                    emphasizedAction: MessageBox.Action.OK,
                    onClose: (action) => {
                        if (action === MessageBox.Action.OK) {
                            // Update submission status using ModelManager
                            this._modelManager.updateSubmissionStatus(true, 0);

                            // Show busy indicator
                            BusyIndicator.show();

                            // Process submission with the grouped data
                            this._supplierInvoiceService.processSubmission(groupedInvoices) // <-- Pass grouped data here
                                .then(result => {
                                    // Update status through ModelManager
                                    this._modelManager.updateProcessingStatus(true, 100);

                                    // Add processed entries and posted documents
                                    if (result.successEntries && result.successEntries.length > 0) {
                                        this._modelManager.addProcessedEntries(result.successEntries);
                                        this._modelManager.addPostedDocuments(result.successEntries);
                                    }
                                })
                                .catch(error => {
                                    // Reset submission status in case of error
                                    this._modelManager.updateSubmissionStatus(false, 0);
                                    console.error("Submission error:", error);
                                    this._errorHandler.logError("Submission Failed", error); // Assuming you have an error handler
                                })
                                .finally(() => {
                                    BusyIndicator.hide();
                                });
                        }
                    }
                }
            );
        },
        // ****************************************
        // * Export & Utility Functions
        // ****************************************
        onDownloadTemplate: function () {
            // Create template structure based on the Excel file fields
            const templateData = [
                {
                    "Sequence Id": "",
                    "CompanyCode": "",
                    "DocumentDate": "",
                    "PostingDate": "",
                    "SupplierInvoiceIDByInvcgParty": "",
                    "InvoicingParty": "",
                    "DocumentCurrency": "",
                    "InvoiceGrossAmount": "",
                    "DocumentHeaderText": "",
                    "PaymentTerms": "",
                    "Supplierlineitemtext": "",
                    "AccountingDocumentType": "",
                    "InvoiceReference": "",
                    "InvoiceReferenceFiscalYear": "",
                    "AssignmentReference": "",
                    "TaxIsCalculatedAutomatically": "",
                    "BusinessPlace": "",
                    "BusinessSectionCode": "",
                    "TaxDeterminationDate": "",
                    "GSTPartner": "",
                    "GSTPlaceOfSupply": "",
                    "SupplierInvoiceItem": "",
                    "s-CompanyCode": "",
                    "CostCenter": "",
                    // Debit fields
                    "GLAccount": "",
                    "WBSElement": "",
                    "SupplierInvoiceItemAmount": "",
                    "TaxCode": "",
                    "DebitCreditCode": "",
                    "SupplierInvoiceItemText": "",
                    "TDSTAXTYPE": "",
                    "TDSTAXCODE": "",
                    "TDSCurrency": ""
                }
            ];

            this._exportManager.exportToExcel(templateData, "Supplier_Invoice_Template.xlsx");
            sap.m.MessageToast.show("Template downloaded successfully");
        },

        // ****************************************
        // * View Details Handlers
        // ****************************************
        onViewInvoiceDetails: function (oEvent) {
            const oItem = oEvent.getSource();
            const oBindingContext = oItem.getBindingContext("supplierInvoices");
            const oInvoice = oBindingContext.getObject();
            this._uiManager.showInvoiceDetailsDialog(oInvoice);
        },

        onItemPress: function (oEvent) {
            const oItem = oEvent.getSource();
            const oBindingContext = oItem.getBindingContext("supplierInvoices");
            const oInvoice = oBindingContext.getObject();
            this._uiManager.showInvoiceDetailsDialog(oInvoice);
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
                this._resetUploadForm();
            } else {
                MessageBox.confirm(
                    "Are you sure you want to clear all supplier invoices? This action cannot be undone.",
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

            // Reset filters
            this.onResetFilters();

            // Show confirmation message
            sap.m.MessageToast.show("Form has been reset");
        },

        // ****************************************
        // * Help & Information Methods
        // ****************************************
        onShowHelp: function () {
            // Show help dialog using UIManager
            if (this._uiManager && typeof this._uiManager.showHelpDialog === "function") {
                this._uiManager.showHelpDialog();
            } else {
                // Fallback to simple message box if UIManager not available
                MessageBox.information(
                    "This application allows you to upload supplier invoices from Excel, validate them, and submit them to SAP. " +
                    "Download the template, fill it with your invoice data, then upload it for processing."
                );
            }
        },
        /**
         * Get the base URL for API calls
         * @returns {string} Base URL
         */
        getBaseURL: function () {
            var appId = this.getOwnerComponent().getManifestEntry("/sap.app/id");
            var appPath = appId.replaceAll(".", "/");
            var appModulePath = jQuery.sap.getModulePath(appPath);
            return appModulePath;
        },
        // ****************************************
        // * Formatter Methods
        // ****************************************
        formatDate: function (dateString) {
            if (!dateString) return "";

            try {
                const date = new Date(dateString);
                return date.toLocaleDateString();
            } catch (e) {
                return dateString;
            }
        }
    });
});