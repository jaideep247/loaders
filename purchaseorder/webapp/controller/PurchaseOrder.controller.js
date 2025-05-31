sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap/ui/model/json/JSONModel",
    "sap/m/MessageBox",
    "sap/m/MessageToast",
    "sap/ui/core/BusyIndicator",
    "sap/ui/model/Filter",
    "sap/ui/model/FilterOperator",
    "purchaseorder/service/ExportManager",
    "purchaseorder/service/UIManager",
    "purchaseorder/service/BatchProcessingManager",
    "purchaseorder/service/ExcelProcessor",
    "purchaseorder/service/ValidationManager",
    "purchaseorder/utils/DataTransformer",
    "purchaseorder/service/ODataService",
    "purchaseorder/service/UserService",
], function (
    Controller,
    JSONModel,
    MessageBox,
    MessageToast,
    BusyIndicator,
    Filter,
    FilterOperator,
    ExportManager,
    UIManager,
    BatchProcessingManager,
    ExcelProcessor,
    ValidationManager,
    DataTransformer,
    ODataService,
    UserService
) {
    "use strict";

    return Controller.extend("purchaseorder.controller.PurchaseOrder", {
        /**
         * Controller initialization
         */
        onInit: function () {
            // Initialize models and utilities
            this._initializeComponents();
        },
        /**
         * Centralized initialization method
         * @private
         */
        _initializeComponents: function () {
            // Initialize models
            this._initModels();
            // Initialize utility classes
            this._initUtilities();
        },
        /**
         * Initialize utility classes
         * @private
         */
        _initUtilities: function () {
            // Initialize utility manager classes
            this._exportManager = new ExportManager(this);
            this._uiManager = new UIManager(this);
            this._batchProcessingManager = new BatchProcessingManager(this);
            this._validationManager = new ValidationManager(this);
            this._dataTransformer = new DataTransformer();
            this._excelProcessor = new ExcelProcessor(this);
            this._userService = new UserService(this);
            // Create OData model first
            const oDataModel = new sap.ui.model.odata.v4.ODataModel({
                serviceUrl: this.getBaseURL() + "/sap/opu/odata4/sap/api_purchaseorder_2/srvd_a2x/sap/purchaseorder/0001/",
                synchronizationMode: "None",
                operationMode: "Server",
                groupId: "$auto",
                autoExpandSelect: true,
                updateGroupId: "$auto",
            });

            // Pass the OData model to ODataService
            this._oDataService = new ODataService(oDataModel);
            // Get user info
            this._userService.getUserInfo();
        },

        /**
         * Initialize JSON models for the view
         * @private
         */
        _initModels: function () {
            // Create a model for purchase order data
            const purchaseOrderModel = new JSONModel({
                purchaseOrderId: "",
                supplier: "",
                entries: [], // All entries including invalid ones
                validEntries: [], // Valid entries only for submission
                totalAmount: 0,
                currency: "INR",
                status: "New",
                showInvalidEntries: true // Flag to control visibility of invalid entries
            });
            this.getView().setModel(purchaseOrderModel, "purchaseOrders");
            this._sTableView = "All";
            // Initialize upload summary model
            const uploadSummaryModel = new JSONModel({
                totalEntries: 0,
                successfulEntries: 0,
                failedEntries: 0,
                validationErrors: [],
                isSubmitEnabled: false,
                hasBeenSubmitted: false,
                lastUploadDate: null,
                processingComplete: false,
                isSubmitting: false,
                uploadProgress: 0
            });
            this.getView().setModel(uploadSummaryModel, "uploadSummary");
            const oStatusModel = new JSONModel([
                { key: "All", text: "All" },
                { key: "Valid", text: "Valid" },
                { key: "Invalid", text: "Invalid" }
            ]);

            this.getView().setModel(oStatusModel, "statusModel");

            // Initialize table view state
            this._sTableView = "All";
        },

        /**
         * Handle file upload for Excel imports
         * @param {sap.ui.base.Event} oEvent - The file upload event
         */
        onFileChange: function (oEvent) {
            const oFileUploader = oEvent.getSource();
            const file = oEvent.getParameter("files")[0];

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

            // Reset models
            this._initModels();

            // Show busy indicator
            BusyIndicator.show(0);

            // Process the file and ensure BusyIndicator is always hidden when complete
            try {
                this._excelProcessor.processExcelFile(file)
                    .then(result => {

                        // If we have validation errors, show validation statistics
                        if (result.errors && result.errors.length > 0) {
                            // Show validation statistics
                            this._uiManager.showValidationStatsDialog(
                                result.entries.length,
                                result.validCount,
                                result.errorCount
                            );
                        }
                    })
                    .catch(error => {
                        console.error("File processing error:", error);
                        MessageBox.error(`Error processing file: ${error.message}`);
                    })
                    .finally(() => {
                        // Always hide the busy indicator
                        BusyIndicator.hide();
                    });
            } catch (error) {
                console.error("Exception during file processing:", error);
                MessageBox.error(`Exception during file processing: ${error.message}`);
                BusyIndicator.hide();
            }
        },
        onShowPurchaseOrderDetails: function (oEvent) {
            // 1. Get the binding context and source item
            const oItem = oEvent.getSource();
            const oContext = oItem.getBindingContext("purchaseOrders");

            // 2. Get the complete entry data
            let oEntryDetails;
            if (oContext) {
                // Get the full model reference
                const oModel = this.getView().getModel("purchaseOrders");

                // Try to find the entry in the entries array
                const aAllEntries = oModel.getProperty("/entries") || [];
                const sSequence = oContext.getProperty("Sequence");

                oEntryDetails = aAllEntries.find(item => item.Sequence === sSequence);

                // Fallback to context object if not found in array
                if (!oEntryDetails) {
                    oEntryDetails = $.extend(true, {}, oContext.getObject());
                }
            } else {
                console.error("No binding context found for purchase order details");
                return;
            }

            // 3. Ensure ValidationErrors exists (shouldn't be needed if validation worked)
            if (oEntryDetails.Status === "Invalid" && (!oEntryDetails.ValidationErrors || oEntryDetails.ValidationErrors.length === 0)) {
                console.warn("Invalid entry missing ValidationErrors", oEntryDetails);
                oEntryDetails.ValidationErrors = [{
                    field: "General",
                    message: "Validation failed but no specific errors were recorded",
                    sequenceId: oEntryDetails.Sequence
                }];
            }

            // 4. Create and open dialog
            if (!this._purchaseOrderDetailsDialog) {
                this._purchaseOrderDetailsDialog = sap.ui.xmlfragment(
                    "purchaseorder.view.PurchaseOrderDetailsDialog",
                    this
                );
                this.getView().addDependent(this._purchaseOrderDetailsDialog);
            }

            // 5. Create a deep copy to avoid model pollution
            const oDialogData = JSON.parse(JSON.stringify(oEntryDetails));
            const oDialogModel = new sap.ui.model.json.JSONModel(oDialogData);

            this._purchaseOrderDetailsDialog.setModel(oDialogModel, "entryDetails");
            this._purchaseOrderDetailsDialog.open();

            // Debug output

            if (oDialogData.Status === "Invalid") {
                console.log("ValidationErrors:", oDialogData.ValidationErrors);
            }
        },

        /**
         * Handle refreshing the table data
         */
        onRefreshTable: function () {
            const oTable = this.byId("itemsTable");
            if (oTable) {
                const oBinding = oTable.getBinding("items");
                if (oBinding) {
                    oBinding.refresh(true);
                    MessageToast.show("Table refreshed");
                }
            }
            this._initModels();
            this.onResetFilters();
        },
        onPurchaseOrderDetailsDialogClose: function () {
            if (this._purchaseOrderDetailsDialog) {
                this._purchaseOrderDetailsDialog.close();
            }
        },
        /**
         * Show validation errors dialog
         */
        onShowValidationErrors: function () {
            const uploadSummaryModel = this.getView().getModel("uploadSummary");
            const validationErrors = uploadSummaryModel.getProperty("/validationErrors") || [];

            if (validationErrors.length === 0) {
                MessageBox.information("No validation errors found.");
                return;
            }

            // Show validation errors using UIManager
            this._uiManager.handleValidationErrors(validationErrors, this._exportManager);
        },

        /**
         * Submit valid entries
         */
        onCreatePurchaseOrder: function () {
            const purchaseOrderModel = this.getView().getModel("purchaseOrders");
            const uploadSummaryModel = this.getView().getModel("uploadSummary");

            // Get entries to submit - either valid entries only or all entries
            const validEntries = purchaseOrderModel.getProperty("/validEntries") || [];

            if (!validEntries || validEntries.length === 0) {
                MessageBox.error("No valid items to submit.");
                return;
            }
            const enhancedEntries = validEntries.map((entry, index) => {
                // Create a new object to avoid modifying the original
                const enhancedEntry = { ...entry };

                // Explicitly preserve sequence in both formats for compatibility
                enhancedEntry.OriginalSequence = entry.Sequence;

                return enhancedEntry;
            });
            // Confirm submission
            MessageBox.confirm(
                `You are about to submit ${validEntries.length} valid items. Continue?`,
                {
                    title: "Confirm Submission",
                    actions: [MessageBox.Action.YES, MessageBox.Action.NO],
                    emphasizedAction: MessageBox.Action.YES,
                    onClose: (action) => {
                        if (action === MessageBox.Action.YES) {
                            this._submitItems(enhancedEntries);
                            uploadSummaryModel.setProperty("/HasBeenSubmitted", true);
                            uploadSummaryModel.setProperty("/isSubmitEnabled", false);
                        }
                    }
                }
            );
        },
        /**
         * Handle export from batch processing dialog
         * @param {sap.ui.base.Event} oEvent - The button press event
         */
        onExportPress: function (oEvent) {
            try {
                console.log("Export button pressed");

                // Get export format and type from button's custom data
                const oButton = oEvent.getSource();
                let format = "XLSX";  // Default format
                let type = "all";     // Default type

                // Get customData from the button
                const aCustomData = oButton.getCustomData();
                if (aCustomData && aCustomData.length > 0) {
                    // Loop through custom data to find format and type
                    aCustomData.forEach(function (oCustomData) {
                        const key = oCustomData.getKey();
                        const value = oCustomData.getValue();

                        if (key === "format") {
                            format = value;
                        } else if (key === "type") {
                            type = value;
                        }
                    });
                } else {
                    // Try to get the format from the button ID as fallback
                    const sButtonId = oButton.getId();
                    if (sButtonId.indexOf("Excel") !== -1) {
                        format = "XLSX";
                    } else if (sButtonId.indexOf("Csv") !== -1) {
                        format = "CSV";
                    } else if (sButtonId.indexOf("Pdf") !== -1) {
                        format = "PDF";
                    }
                }

                console.log("Export format:", format);
                console.log("Export type:", type);

                // Get batch data from the batch processing manager
                if (!this._batchProcessingManager) {
                    MessageBox.error("Batch processing manager not available");
                    return;
                }

                // Get response data from the batch processing manager
                const batchData = this._batchProcessingManager.getResponseData();


                // Call the export manager to perform the export
                if (this._exportManager) {
                    this._exportManager.exportBatchResults(batchData, type.toLowerCase(), format.toLowerCase());
                    MessageToast.show(`Export to ${format} started`);
                } else {
                    MessageBox.error("Export manager not available");
                }
            } catch (error) {
                console.error("Error during export:", error);
                MessageBox.error("Export failed: " + error.message);
            }
        },
        /**
         * Cancel batch processing
         */
        onCancelBatchProcessing: function () {
            if (this._batchProcessingManager) {
                const canceled = this._batchProcessingManager.cancelBatchProcessing();

                if (canceled) {
                    MessageToast.show("Batch processing canceled");
                } else {
                    MessageToast.show("No active batch processing to cancel");
                }
            }
        },

        /**
         * Close batch dialog
         */
        onCloseBatchDialog: function () {
            if (this._batchProcessingManager) {
                this._batchProcessingManager.closeBatchProcessingDialog();
            }
        },
        /**
         * Get Base URL
         * @private
         */
        getBaseURL: function () {
            var appId = this.getOwnerComponent().getManifestEntry("/sap.app/id");
            var appPath = appId.replaceAll(".", "/");
            var appModulePath = jQuery.sap.getModulePath(appPath);
            return appModulePath;
        },

        /**
         * Submit items to backend
         * @param {Array} items - The items to submit
         * @private
         */
        _submitItems: function (items) {
            BusyIndicator.show(0);

            // Update upload summary
            const uploadSummaryModel = this.getView().getModel("uploadSummary");
            uploadSummaryModel.setProperty("/isSubmitting", true);

            // Track processing state
            let processingComplete = false;

            // Create deep copies of items and ensure sequence information is preserved
            const enhancedItems = items.map((item, index) => {
                // Create a copy to avoid modifying the original
                const enhancedItem = jQuery.extend(true, {}, item);

                // Ensure sequence is properly set - prioritize existing Sequence over index-based
                if (!enhancedItem.Sequence) {
                    enhancedItem.Sequence = item.OriginalSequence || `SEQ_${index + 1}`;
                }

                return enhancedItem;
            });

            // Log sequence grouping information
            const sequenceGroups = this._groupItemsBySequence(enhancedItems);
            console.log("Sequence Groups Summary:", {
                totalItems: enhancedItems.length,
                uniqueSequences: Object.keys(sequenceGroups).length,
                groupDetails: Object.keys(sequenceGroups).map(seq => ({
                    sequence: seq,
                    itemCount: sequenceGroups[seq].length
                }))
            });

            // Transform data for OData format
            const transformedItems = this._dataTransformer.transformToODataFormat(enhancedItems);

            // Use the BatchProcessingManager to handle sequence-based batch submission
            this._batchProcessingManager.startBatchProcessing(
                transformedItems,
                {
                    batchSize: 10, // This is now used for UI display grouping, not OData batching
                    showProgress: true,
                    processingMode: "sequence" // Flag to indicate sequence-based processing
                }
            )
                .then(result => {
                    processingComplete = true;

                    // Log sequence processing results
                    console.log("Sequence Processing Results:", {
                        totalProcessed: result.successCount + result.failureCount,
                        successful: result.successCount,
                        failed: result.failureCount,
                        sequenceResults: this._analyzeSequenceResults(result)
                    });

                    // Update the upload summary
                    uploadSummaryModel.setProperty("/successfulEntries", result.successCount);
                    uploadSummaryModel.setProperty("/failedEntries", result.failureCount);
                    uploadSummaryModel.setProperty("/processingComplete", true);
                    uploadSummaryModel.setProperty("/isSubmitting", false);
                })
                .catch(error => {
                    processingComplete = true;
                    console.error("Sequence-based processing error:", error);
                    MessageBox.error("Error processing entries: " + error.message);
                    uploadSummaryModel.setProperty("/isSubmitting", false);
                })
                .finally(() => {
                    // Always hide the busy indicator when processing is complete
                    if (processingComplete) {
                        BusyIndicator.hide();
                    } else {
                        // Add a safety timeout to ensure BusyIndicator is eventually hidden
                        setTimeout(() => {
                            BusyIndicator.hide();
                        }, 500);
                    }
                });
        },

        // Add helper method to group items by sequence
        _groupItemsBySequence: function (items) {
            const groups = {};

            items.forEach((item, index) => {
                const sequenceId = item.Sequence || item.OriginalSequence || `SEQ_${index + 1}`;

                if (!groups[sequenceId]) {
                    groups[sequenceId] = [];
                }

                groups[sequenceId].push(item);
            });

            return groups;
        },

        // Add helper method to analyze sequence results
        _analyzeSequenceResults: function (result) {
            const sequenceAnalysis = {};

            // Analyze successful records
            if (result.successRecords) {
                result.successRecords.forEach(record => {
                    const seq = record.OriginalSequence || record.Sequence || "Unknown";
                    if (!sequenceAnalysis[seq]) {
                        sequenceAnalysis[seq] = { success: 0, failed: 0 };
                    }
                    sequenceAnalysis[seq].success++;
                });
            }

            // Analyze failed records
            if (result.errorRecords || result.failedRecordsList) {
                const failedRecords = result.errorRecords || result.failedRecordsList;
                failedRecords.forEach(record => {
                    const seq = record.originalSequence || record.entry?.Sequence || "Unknown";
                    if (!sequenceAnalysis[seq]) {
                        sequenceAnalysis[seq] = { success: 0, failed: 0 };
                    }
                    sequenceAnalysis[seq].failed++;
                });
            }

            return sequenceAnalysis;
        },

        /**
         * Download template
         */
        onDownloadTemplate: function () {
            this._exportManager.downloadTemplate();
            MessageToast.show("Template downloaded successfully");
        },

        /**
         * Show help dialog
         */
        onShowHelp: function () {
            this._uiManager.showHelpDialog(this);
        },

        /**
         * Reset form
         */
        onReset: function () {
            MessageBox.confirm(
                "Are you sure you want to reset the form? All unsaved data will be lost.",
                {
                    onClose: (action) => {
                        if (action === MessageBox.Action.OK) {
                            this._initModels();
                            MessageToast.show("Form has been reset");
                        }
                    }
                }
            );
        },

        /**
         * Handle status filter changes (compatible with both ComboBox and SegmentedButton)
         */
        onStatusFilterChange: function (oEvent) {
            let sKey = "All";

            // Get the selected key based on control type
            const oSource = oEvent.getSource();
            if (oSource.getSelectedKey) {
                sKey = oSource.getSelectedKey();
            } else if (oEvent.getParameter("selectedItem")) {
                sKey = oEvent.getParameter("selectedItem").getKey();
            } else if (oEvent.getParameter("key")) {
                sKey = oEvent.getParameter("key");
            }

            // Sync UI controls
            this._syncFilterControls(sKey);

            // Apply filters
            this._applyFilters();
        },

        /**
         * Synchronize filter controls to show consistent selection
         * @private
         */
        _syncFilterControls: function (sKey) {
            // Sync status filter controls if you have multiple
            const oStatusCombo = this.byId("statusFilter");
            const oStatusSegmented = this.byId("statusSegmentedButton");

            if (oStatusCombo && oStatusCombo.getSelectedKey() !== sKey) {
                oStatusCombo.setSelectedKey(sKey);
            }

            if (oStatusSegmented && oStatusSegmented.getSelectedKey() !== sKey) {
                oStatusSegmented.setSelectedKey(sKey);
            }
        },
        /**
         * Handle search field input
         */
        onSearchItems: function (oEvent) {
            const sQuery = oEvent.getParameter("query");
            const oTable = this.byId("itemsTable");

            if (!oTable) return;

            const oBinding = oTable.getBinding("items");
            if (!oBinding) return;

            // Store the search query for use in _applyFilters
            this._sSearchQuery = sQuery;

            // Reapply all filters including search
            this._applyFilters();
        },
        /**
         * Handle live search changes (optional)
         */
        onSearchLiveChange: function (oEvent) {
            const sQuery = oEvent.getParameter("value");
            const oTable = this.byId("itemsTable");

            if (!oTable) return;

            const oBinding = oTable.getBinding("items");
            if (!oBinding) return;

            // Store the search query
            this._sSearchQuery = sQuery;

            // Reapply all filters including search
            this._applyFilters();
        },
        /**
         * Handle segmented button view change
         */
        onTableViewChange: function (oEvent) {
            const sSelectedKey = oEvent.getParameter("selectedKey") || oEvent.getSource().getSelectedKey();
            this._sTableView = sSelectedKey; // Store the current view selection
            this._applyFilters(); // Reapply all filters
        },

        /**
         * Apply all active filters including search
         * @private
         */
        _applyFilters: function () {
            try {
                const oTable = this.byId("itemsTable");
                if (!oTable) {
                    console.warn("Table with ID 'itemsTable' not found");
                    return;
                }

                const oBinding = oTable.getBinding("items");
                if (!oBinding) {
                    console.warn("Table binding not found");
                    return;
                }

                // Get all filter values with null checks
                const aFilters = [];

                // Status filter from segmented button
                if (this._sTableView && this._sTableView !== "All") {
                    aFilters.push(new Filter("Status", FilterOperator.EQ, this._sTableView));
                }

                // Status filter from combo box (if you want both to work together)
                const sStatus = this._getFilterValue("statusFilterComboBox", "getSelectedKey");
                if (sStatus && sStatus !== "All") {
                    aFilters.push(new Filter("Status", FilterOperator.EQ, sStatus));
                }

                // Sequence filter
                const sSequence = this._getFilterValue("sequenceFilter", "getValue");
                if (sSequence) {
                    aFilters.push(new Filter("Sequence", FilterOperator.Contains, sSequence));
                }

                // Product filter
                const sProduct = this._getFilterValue("productFilter", "getValue");
                if (sProduct) {
                    aFilters.push(new Filter("ProductNumber", FilterOperator.Contains, sProduct));
                }

                // Date range filter
                const sDateRange = this._getFilterValue("documentDateFilter", "getValue");
                if (sDateRange) {
                    const aDates = sDateRange.split(" - ");
                    if (aDates.length === 2) {
                        try {
                            const oStartDate = new Date(aDates[0]);
                            const oEndDate = new Date(aDates[1]);
                            oEndDate.setDate(oEndDate.getDate() + 1);

                            aFilters.push(new Filter({
                                path: "PurchasingDocumentDate",
                                operator: FilterOperator.BT,
                                value1: oStartDate,
                                value2: oEndDate
                            }));
                        } catch (e) {
                            console.error("Date parsing error:", e);
                        }
                    }
                }

                // Company code filter
                const sCompanyCode = this._getFilterValue("companyCodeFilter", "getValue");
                if (sCompanyCode) {
                    aFilters.push(new Filter("CompanyCode", FilterOperator.EQ, sCompanyCode));
                }

                // Supplier filter
                const sSupplier = this._getFilterValue("supplierFilter", "getValue");
                if (sSupplier) {
                    aFilters.push(new Filter("SupplierAccountNumber", FilterOperator.Contains, sSupplier));
                }

                // Search filter (if search query exists)
                if (this._sSearchQuery) {
                    const aSearchFilters = [
                        new Filter("SupplierAccountNumber", FilterOperator.Contains, this._sSearchQuery),
                        new Filter("Sequence", FilterOperator.Contains, this._sSearchQuery),
                        new Filter("CompanyCode", FilterOperator.Contains, this._sSearchQuery),
                        new Filter("ProductNumber", FilterOperator.Contains, this._sSearchQuery),
                        new Filter("PurchasingDocumentNumber", FilterOperator.Contains, this._sSearchQuery)
                    ];

                    aFilters.push(new Filter({
                        filters: aSearchFilters,
                        and: false // OR between search fields
                    }));
                }

                // Combine all filters
                let oCombinedFilter = aFilters.length > 0 ?
                    new Filter({ filters: aFilters, and: true }) : null;

                // Apply to binding
                oBinding.filter(oCombinedFilter);

                // Update filtered count
                this._updateFilteredCount();

            } catch (error) {
                console.error("Error applying filters:", error);
                MessageBox.error("Error applying filters. Please try again.");
            }
        },

        /**
         * Handle date range filter changes
         */
        onDateRangeChange: function (oEvent) {
            this._applyFilters();
        },

        /**
         * Handle generic filter changes
         */
        onFilterChange: function (oEvent) {
            this._applyFilters();
        },

        /**
         * Reset all filters including search
         */
        onResetFilters: function () {
            // Reset all filter controls
            const aFilterIds = [
                "statusFilterComboBox",
                "sequenceFilter",
                "productFilter",
                "documentDateFilter",
                "companyCodeFilter",
                "supplierFilter",
                "itemSearchField"
            ];

            aFilterIds.forEach(sId => {
                const oControl = this.byId(sId);
                if (!oControl) return;

                if (sId === "statusFilterComboBox") {
                    oControl.setSelectedKey("All");
                } else if (sId === "documentDateFilter") {
                    oControl.setValue("");
                } else {
                    oControl.setValue("");
                }
            });

            // Reset segmented button
            const oViewSelector = this.byId("tableViewSelector");
            if (oViewSelector) {
                oViewSelector.setSelectedKey("All");
            }

            // Clear search query and view selection
            this._sSearchQuery = "";
            this._sTableView = "All";

            // Reapply filters
            this._applyFilters();

            MessageToast.show("Filters reset");
        },

        /**
         * Helper method to safely get filter values
         * @private
         */
        _getFilterValue: function (sControlId, sMethod) {
            const oControl = this.byId(sControlId);
            return oControl && oControl[sMethod] ? oControl[sMethod]() : null;
        },
        /**
         * Update the filtered count display
         * @private
         */
        _updateFilteredCount: function () {
            const oTable = this.byId("itemsTable");
            if (!oTable) return;

            const oBinding = oTable.getBinding("items");
            if (!oBinding) return;

            const iFilteredCount = oBinding.getLength();
            const oModel = this.getView().getModel("purchaseOrders");

            if (oModel) {
                oModel.setProperty("/filteredCount", iFilteredCount);
            }
        },
        /**
         * Toggle visibility of invalid entries
         */
        onToggleInvalidEntries: function () {
            const purchaseOrderModel = this.getView().getModel("purchaseOrders");
            const showInvalidEntries = purchaseOrderModel.getProperty("/showInvalidEntries");

            // Toggle the flag
            purchaseOrderModel.setProperty("/showInvalidEntries", !showInvalidEntries);

            // Show message to indicate change
            MessageToast.show(showInvalidEntries ?
                "Invalid entries hidden" :
                "Showing all entries including invalid ones");
        },

        /**
         * Export invalid entries
         */
        onExportInvalidEntries: function () {
            const purchaseOrderModel = this.getView().getModel("purchaseOrders");
            const entries = purchaseOrderModel.getProperty("/entries") || [];
            const invalidEntries = entries.filter(entry => entry.Status === "Invalid");

            if (invalidEntries.length === 0) {
                MessageBox.information("No invalid entries to export.");
                return;
            }

            // Export invalid entries
            this._exportManager.exportToExcel(invalidEntries, "Invalid_Entries.xlsx");
        }
    });
});