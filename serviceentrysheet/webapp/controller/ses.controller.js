sap.ui.define([
    "serviceentrysheet/controller/BaseFilterController",
    "serviceentrysheet/model/ModelManager",
    "sap/ui/model/json/JSONModel",
    "sap/ui/model/odata/v2/ODataModel",
    "sap/m/MessageBox",
    "sap/ui/core/BusyIndicator",
    "sap/m/MessageToast",
    "sap/m/Dialog",
    "serviceentrysheet/model/models",
    "sap/ui/core/Fragment",
    "serviceentrysheet/service/BatchProcessingManager",
    "serviceentrysheet/service/ExcelProcessor",
    "serviceentrysheet/service/ValidationManager",
    "serviceentrysheet/service/ExportManager",
    "serviceentrysheet/service/ODataService",
    "serviceentrysheet/service/UIManager",
    "serviceentrysheet/service/UserService",
    "serviceentrysheet/utils/DataTransformer",
    "serviceentrysheet/utils/ErrorHandler",
    "serviceentrysheet/utils/ResponseProcessor"
], function (
    BaseFilterController,
    ModelManager,
    JSONModel,
    ODataModel,
    MessageBox,
    BusyIndicator,
    MessageToast,
    Dialog,
    models,
    Fragment,
    BatchProcessingManager,
    ExcelProcessor,
    ValidationManager,
    ExportManager,
    ODataService,
    UIManager,
    UserService,
    DataTransformer,
    ErrorHandler,
    ResponseProcessor
) {
    "use strict";

    return BaseFilterController.extend("serviceentrysheet.controller.ses", {
        /**
         * Controller initialization
         */
        onInit: function () {
            try {
                console.log("Initializing Service Entry Sheet controller");

                // Initialize services first
                this._initServices();

                // Initialize models (depends on services)
                this._initModels();

                // Initialize filter mappings
                this._initFilterMappings();

                // Call base controller's filter initialization with our mappings
                this.initializeFilters(this._filterFieldMappings, "itemsTable", "serviceEntrySheets");

                // Verify that the table exists and has a binding
                const oTable = this.byId("itemsTable");
                if (oTable) {
                    console.log("itemsTable found in view");

                    // Check binding
                    const itemsBinding = oTable.getBinding("items");
                    if (itemsBinding) {
                        console.log("itemsTable has valid 'items' binding", {
                            path: itemsBinding.getPath(),
                            model: itemsBinding.getModel() ? itemsBinding.getModel().getMetadata().getName() : "none"
                        });
                    } else {
                        console.warn("itemsTable has no 'items' binding!");
                    }
                } else {
                    console.error("itemsTable not found in view!");
                }

                // Initialize response data object for storing results
                this._responseData = {
                    totalRecords: 0,
                    successCount: 0,
                    failureCount: 0,
                    successRecords: [],
                    errorRecords: [],
                    allMessages: []
                };

                // Get user info
                this._userService.getUserInfo();

                console.log("Controller initialization completed successfully");
            } catch (error) {
                console.error("Error during controller initialization:", error);

                // Display user-friendly error message
                MessageBox.error("Application initialization failed: " + error.message, {
                    title: "Initialization Error"
                });
            }
        },

        /**
         * Initialize filter mappings
         * @private 
         */
        _initFilterMappings: function () {
            try {
                // Define mappings from control IDs to model properties
                this._filterFieldMappings = {
                    "sequenceFilter": "SequenceNumber",
                    "supplierFilter": "Supplier",
                    "purchaseOrderFilter": "PurchaseOrder",
                    "serviceEntrySheetFilter": "ServiceEntrySheetName",
                    "plantFilter": "Plant",
                    "statusFilterComboBox": "Status",
                    "accountAssignmentCategoryFilter": "AccountAssignmentCategory",
                    // Add additional filters with exact IDs matching your view
                    "costCenterFilter": "CostCenter",
                    "glAccountFilter": "GLAccount",
                    "wbsElementFilter": "WBSElement",
                    "purchasingOrgFilter": "PurchasingOrganization",
                    "purchasingGroupFilter": "PurchasingGroup",
                    // Add special handling for status filters that might come from buttons
                    "statusFilter": "Status",
                    "invalidItemsBtn": "Status",
                    "validItemsBtn": "Status",
                    "allItemsBtn": "Status"
                };

                console.log("Filter mappings initialized:", this._filterFieldMappings);

                // Verify that the controls with these IDs actually exist in the view
                const view = this.getView();
                if (view) {
                    Object.keys(this._filterFieldMappings).forEach(controlId => {
                        const control = this.byId(controlId);
                        if (!control) {
                            // Only log warnings for standard filters, not the special case IDs
                            if (!["statusFilter", "invalidItemsBtn", "validItemsBtn", "allItemsBtn"].includes(controlId)) {
                                console.warn(`Warning: Filter control with ID '${controlId}' not found in view!`);
                            }
                        }
                    });
                }
            } catch (error) {
                console.error("Error initializing filter mappings:", error);
                if (this._errorHandler) {
                    this._errorHandler.showError("Filter initialization failed: " + error.message);
                }
            }
        },

        /**
         * Initialize services using dependency injection pattern
         * @private
         */
        _initServices: function () {
            try {
                // Get the OData model from the component
                const odataModel = this.getOwnerComponent().getModel();

                // Verify the model exists
                if (!odataModel) {
                    throw new Error("OData model is not initialized");
                }
         
                // Create utilities first
                const errorHandler = new ErrorHandler();
                const dataTransformer = new DataTransformer();
                const responseProcessor = new ResponseProcessor();
                // Store error handler for use in base controller methods
                this._errorHandler = errorHandler;

                // IMPORTANT: Store reference to this controller 
                const controller = this;

                // Create services with dependencies injected using proper objects
                const oDataService = new ODataService({
                    model: odataModel,
                    dataTransformer: dataTransformer,
                    errorHandler: errorHandler
                });

                const validationManager = new ValidationManager({
                    dataTransformer: dataTransformer,
                    errorHandler: errorHandler
                });

                const exportManager = new ExportManager({
                    controller: controller,
                    errorHandler: errorHandler
                });

                const uiManager = new UIManager(controller, errorHandler);

                // Create ModelManager with proper dependencies
                const modelManager = new ModelManager({
                    controller: controller,
                    errorHandler: errorHandler,
                    dataTransformer: dataTransformer
                });

                // Create ExcelProcessor with proper dependencies
                const excelProcessor = new ExcelProcessor({
                    controller: controller,
                    dataTransformer: dataTransformer,
                    validationManager: validationManager,
                    errorHandler: errorHandler,
                    modelManager: modelManager  // Pass the model manager to Excel processor
                });

                const batchProcessingManager = new BatchProcessingManager({
                    controller: controller,
                    errorHandler: errorHandler,
                    dataTransformer: dataTransformer,
                    oDataService: oDataService,
                    exportManager: exportManager,
                    responseProcessor: responseProcessor,
                    modelManager: modelManager
                });

                // Store service references
                this._dataTransformer = dataTransformer;
                this._oDataService = oDataService;
                this._validationManager = validationManager;
                this._exportManager = exportManager;
                this._uiManager = uiManager;
                this._modelManager = modelManager;  // Store the model manager reference
                this._excelProcessor = excelProcessor;
                this._batchProcessingManager = batchProcessingManager;
                this._userService = new UserService(this);
                console.log("Services initialized successfully", {
                    oDataServiceUrl: odataModel.sServiceUrl
                });
            } catch (error) {
                console.error("Error initializing services:", error);
                throw error; // Re-throw to be caught by caller
            }
        },

        /**
         * Initialize models for the controller
         * @private
         */
        _initModels: function () {
            try {
                // Use ModelManager to initialize models
                const models = this._modelManager.initializeModels();

                // Store reference to serviceEntrySheets model for use in base controller
                this.serviceEntrySheetModel = this.getView().getModel("serviceEntrySheets");

                console.log("Models initialized successfully");
            } catch (error) {
                console.error("Error initializing models:", error);
                throw error; // Re-throw to be caught by caller
            }
        },

        /**
  * Initialize account assignment category filter dropdown with values from uploaded data
  * @param {Array} data - The array of service entry sheet data
  */
        initializeAccountAssignmentCategoryFilter: function (data) {
            try {
                // Get the account assignment category filter combobox
                const accountAssignmentCategoryFilter = this.byId("accountAssignmentCategoryFilter");

                if (!accountAssignmentCategoryFilter) {
                    console.warn("Account Assignment Category Filter control not found - ID: accountAssignmentCategoryFilter");
                    return;
                }

                console.log("Initializing account assignment category filter with data:", data ? data.length : 0, "items");

                // Extract unique account assignment category values from the data
                const uniqueValues = new Set();

                // First add the "All" option
                uniqueValues.add("All");

                // Then extract unique values from the data
                if (data && Array.isArray(data)) {
                    data.forEach(item => {
                        // Account for both number and string formats
                        if (item.AccountAssignmentCategory !== undefined && item.AccountAssignmentCategory !== null) {
                            // Normalize to string format
                            const normalizedValue = String(item.AccountAssignmentCategory);
                            uniqueValues.add(normalizedValue);
                        }
                    });
                }

                // Convert Set to array and sort
                const categoryValues = Array.from(uniqueValues)
                    .sort((a, b) => {
                        // Keep "All" at the top
                        if (a === "All") return -1;
                        if (b === "All") return 1;
                        // Sort others alphabetically
                        return a.localeCompare(b, undefined, { numeric: true });
                    });

                console.log("Found unique account assignment category values:", categoryValues);

                // Create model for the combobox
                const categoryModel = new sap.ui.model.json.JSONModel({
                    categories: categoryValues.map(value => {
                        return {
                            key: value,
                            text: value === "All" ? "All" : value
                        };
                    })
                });

                // Set the model on the combobox
                accountAssignmentCategoryFilter.setModel(categoryModel, "accountAssignmentCategories");

                // Set default selection to "All"
                accountAssignmentCategoryFilter.setSelectedKey("All");

                console.log("Account Assignment Category filter initialized with values:", categoryValues);
            } catch (error) {
                console.error("Error initializing account assignment category filter:", error);
                if (this._errorHandler) {
                    this._errorHandler.showError("Failed to initialize account assignment category filter: " + error.message);
                }
            }
        },

        /**
         * Handle account assignment category filter change
         * @param {sap.ui.base.Event} oEvent The event object
         */
        onAccountAssignmentCategoryFilterChange: function (oEvent) {
            try {
                const oSource = oEvent.getSource();
                const selectedItem = oEvent.getParameter("selectedItem");

                if (!selectedItem) {
                    console.warn("Account Assignment Category filter change: No selected item found");
                    return;
                }

                const selectedKey = selectedItem.getKey();
                let sFilterId = oSource.getId();

                // Remove view prefix if it exists
                if (this.getView()) {
                    const viewPrefix = this.getView().getId() + "--";
                    if (sFilterId.startsWith(viewPrefix)) {
                        sFilterId = sFilterId.replace(viewPrefix, "");
                    } else {
                        // Standard ID splitting
                        const parts = sFilterId.split("--");
                        if (parts.length > 1) {
                            sFilterId = parts[parts.length - 1];
                        }
                    }
                }

                console.log("Account Assignment Category filter changed:", {
                    originalId: oSource.getId(),
                    resolvedId: sFilterId,
                    selectedKey: selectedKey
                });

                // When "All" is selected, clear the filter
                if (selectedKey === "All") {
                    delete this._filterValues[sFilterId];
                    console.log(`Removed filter value for ${sFilterId}`);
                } else {
                    // Store filter value
                    this._filterValues[sFilterId] = selectedKey;
                    console.log(`Set filter value for ${sFilterId} to ${selectedKey}`);
                }

                // Apply filters
                console.log("Current filter values after account assignment category change:", JSON.stringify(this._filterValues));
                this.applyFilters();
            } catch (error) {
                console.error("Error in account assignment category filter change:", error);
                if (this._errorHandler) {
                    this._errorHandler.showError("Failed to update account assignment category filter: " + error.message);
                }
            }
        },

        /**
         * Update filter mappings to include account assignment category filter
         * @private 
         */
        _updateFilterMappings: function () {
            try {
                // Make sure the filter field exists in the mappings
                if (!this._filterFieldMappings["accountAssignmentCategoryFilter"]) {
                    this._filterFieldMappings["accountAssignmentCategoryFilter"] = "AccountAssignmentCategory";

                    // Update the base controller's filter fields
                    this._filterFields = this._filterFieldMappings;

                    console.log("Filter mappings updated with account assignment category filter:",
                        this._filterFieldMappings["accountAssignmentCategoryFilter"]);
                }
            } catch (error) {
                console.error("Error updating filter mappings:", error);
                if (this._errorHandler) {
                    this._errorHandler.showError("Filter mapping update failed: " + error.message);
                }
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
         * Reset the form to initial state
         */
        onReset: function () {
            this._errorHandler.showConfirmation(
                "Are you sure you want to reset the form? All unsaved data will be lost.",
                "Confirm Reset",
                () => {
                    this._resetUploadSummary();
                    // Use base controller's reset filters method
                    this.resetFilters();
                    this._errorHandler.showSuccess("Form has been reset");
                }
            );
        },

        /**
         * Reset the upload summary model to its initial state
         * @private
         */
        _resetUploadSummary: function () {
            try {
                // Get the upload summary model
                const uploadSummaryModel = this.getView().getModel("uploadSummary");

                // If model exists, reset its data
                if (uploadSummaryModel) {
                    uploadSummaryModel.setData({
                        TotalEntries: 0,
                        SuccessfulEntries: 0,
                        FailedEntries: 0,
                        ValidationErrors: [],
                        IsSubmitEnabled: false,
                        HasBeenSubmitted: true,
                        LastUploadDate: null,
                        ProcessingComplete: false,
                        isSubmitting: false,
                        uploadProgress: 0
                    });
                }

                // Reset the service entry sheets model if it exists
                if (this.serviceEntrySheetModel) {
                    this.serviceEntrySheetModel.setProperty("/entries", []);
                    this.serviceEntrySheetModel.setProperty("/validationStatus", "Pending");
                    this.serviceEntrySheetModel.setProperty("/filteredCount", 0);
                }

                console.log("Upload summary and service entry sheets models reset");
            } catch (error) {
                console.error("Error resetting upload summary:", error);
                this._errorHandler.showError("Failed to reset form: " + error.message);
            }
        },

        /**
         * Handle file upload for Excel imports
         * @param {sap.ui.base.Event} oEvent - The file upload event
         */
        onFileChange: function (oEvent) {
            try {
                const oFileUploader = oEvent.getSource();
                const file = oEvent.getParameter("files")[0];

                if (!file) {
                    this._errorHandler.showError("No file selected. Please choose a file to upload.");
                    return;
                }

                // Validate file type
                if (!file.name.endsWith(".xlsx")) {
                    this._errorHandler.showError("Invalid file type. Please upload an Excel file (.xlsx).");
                    oFileUploader.clear();
                    return;
                }

                // Reset models and prepare for file processing
                this._resetUploadSummary();

                // Update upload summary model to enable submit button
                const oUploadSummaryModel = this.getView().getModel("uploadSummary");
                if (oUploadSummaryModel) {
                    oUploadSummaryModel.setProperty("/HasBeenSubmitted", false);
                    oUploadSummaryModel.setProperty("/IsSubmitEnabled", true);
                }

                // Show busy indicator
                BusyIndicator.show(0);

                // Process file with slight delay for better UX
                setTimeout(() => {
                    // Use ExcelProcessor to handle file parsing and validation
                    this._excelProcessor.processExcelFile(file)
                        .then(() => {
                            // Expand the summary panel to show results
                            const oSummaryPanel = this.byId("summaryPanel");
                            if (oSummaryPanel) {
                                oSummaryPanel.setExpanded(true);
                            }
                        })
                        .catch(error => {
                            this._errorHandler.showError("Error processing file: " + error.message);
                        })
                        .finally(() => {
                            BusyIndicator.hide();
                        });
                }, 100);
            } catch (error) {
                console.error("Error handling file upload:", error);
                BusyIndicator.hide();
                this._errorHandler.showError("File upload failed: " + error.message);
            }
        },

        /**
         * Create service entry sheets from uploaded Excel data
         */
        onCreateServiceEntrySheet: function () {
            try {
                // Get model data
                const oData = this.serviceEntrySheetModel.getData();
                const uploadSummaryModel = this.getView().getModel("uploadSummary");

                // Check for entries
                if (!oData.entries || oData.entries.length === 0) {
                    this._errorHandler.showError("No valid service entry sheets to submit.");
                    return;
                }

                // Confirm submission
                this._errorHandler.showConfirmation(
                    `You are about to submit ${oData.entries.length} service entry sheets. Continue?`,
                    "Confirm Submission",
                    () => {
                        // Update UI state
                        uploadSummaryModel.setProperty("/HasBeenSubmitted", true);
                        uploadSummaryModel.setProperty("/isSubmitting", true);

                        // Submit service entry sheets
                        this._submitServiceEntrySheets(oData.entries);
                    }
                );
            } catch (error) {
                console.error("Error in service entry sheet creation:", error);
                this._errorHandler.showError("Failed to prepare submission: " + error.message);
            }
        },
        /**
         * Submit validated service entry sheet items.
         * Groups items by Purchase Order and processes one SES per PO using BatchProcessingManager.
         * @param {Array} serviceEntrySheetItems - Array of validated service entry sheet item objects to submit.
         * @private
         */
        _submitServiceEntrySheets: function (serviceEntrySheetItems) {
            try {
                if (!this._batchProcessingManager) {
                    console.error("Batch Processing Manager is not initialized!");
                    this._errorHandler.showError("Critical Error: Processing component not ready.");
                    return;
                }
                if (!serviceEntrySheetItems || serviceEntrySheetItems.length === 0) {
                    this._errorHandler.showWarning("No valid service entry sheet items to submit."); // Changed error to warning
                    return;
                }

                console.log(`Submitting ${serviceEntrySheetItems.length} service entry sheet items...`);

                // Start batch processing using the BatchProcessingManager's updated method
                // Pass only the array of items. Batching/Grouping by PO happens inside.
                this._batchProcessingManager.startSESBatchProcessing(serviceEntrySheetItems)
                    .then((finalResponseData) => {
                        // This 'then' block executes after ALL Purchase Orders have been attempted (success or fail).
                        console.log("Batch processing finished in controller. Final Response Data:", finalResponseData);

                        // Store final results if needed elsewhere
                        this._responseData = finalResponseData; // Store the comprehensive results object

                        // --- Use UIManager for Final Results Display (Recommended) ---
                        if (this.uiManager) { // Check if UIManager instance exists on the controller
                            if (finalResponseData.failureCount === 0 && finalResponseData.successCount > 0) {
                                this.uiManager.showSuccessWithDocuments(finalResponseData.successRecords);
                            } else if (finalResponseData.failureCount > 0 && finalResponseData.successCount > 0) {
                                this.uiManager.showPartialSuccessWithDocuments(finalResponseData.successRecords, finalResponseData.errorRecords);
                            } else if (finalResponseData.failureCount > 0 && finalResponseData.successCount === 0) {
                                this.uiManager.showErrorWithDetails(finalResponseData.errorRecords);
                            } else if (finalResponseData.processedCount === 0 && !finalResponseData.wasCancelled) { // Use processedCount
                                this._errorHandler.showInfo("No records were submitted."); // Handle case where nothing was processed
                            } else if (finalResponseData.wasCancelled) {
                                this._errorHandler.showWarning("Processing was cancelled by the user.");
                            }
                            else {
                                this._errorHandler.showWarning("Processing finished with an unexpected status.");
                            }
                        } else {
                            // --- Fallback if UIManager is not used ---
                            console.warn("UIManager not found, using simple MessageToasts for results.");
                            if (finalResponseData.failureCount > 0) {
                                this._errorHandler.showWarning( // Use warning for partial success/failure
                                    `Processing completed. Success: ${finalResponseData.successCount}, Failed: ${finalResponseData.failureCount}. Check dialog/console for details.`
                                );
                            } else if (finalResponseData.successCount > 0) {
                                this._errorHandler.showSuccess(
                                    `Successfully processed ${finalResponseData.successCount} item(s).`
                                );
                            } else if (finalResponseData.wasCancelled) {
                                this._errorHandler.showWarning("Processing was cancelled by the user.");
                            } else {
                                this._errorHandler.showInfo("Processing finished. No items seem to have been processed.");
                            }
                        }
                        // Optional: Refresh model data if needed after submission
                        // this.refreshData();
                    })
                    .catch((error) => {
                        // Catches errors from the startSESBatchProcessing promise itself (e.g., initialization failure)
                        console.error("Critical error during batch processing submission:", error);
                        this._errorHandler.showError(
                            "Submission failed unexpectedly: " + (error.message || "Unknown error"),
                            error.details || error // Pass details if available
                        );
                        // Ensure the batch dialog is closed on major failure
                        if (this._batchProcessingManager) {
                            this._batchProcessingManager.closeBatchProcessingDialog();
                        }
                    });
            } catch (error) {
                // Catches synchronous errors within this function (e.g., _batchProcessingManager not defined)
                console.error("Synchronous error in _submitServiceEntrySheets:", error);
                this._errorHandler.showError("Submission failed critically: " + error.message);
            }
        },
        /**
         * Close the batch processing dialog
         */
        onCloseBatchDialog: function () {
            try {
                // Always use UIManager to close dialogs - use the instance we stored in _initServices
                if (this._uiManager) {
                    this._uiManager.closeDialog("batchProcessingDialog");
                } else {
                    console.error("Error closing batch dialog: UIManager not available on controller");

                    // Fallback: Try to find dialog directly
                    const dialogId = this.getView().createId("batchProcessingDialog");
                    const dialog = sap.ui.getCore().byId(dialogId);
                    if (dialog && typeof dialog.close === 'function') {
                        dialog.close();
                    }
                }
            } catch (error) {
                console.error("Error closing batch dialog:", error);
            }
        },
        /**
         * Cancel the current batch processing
         */
        onCancelBatchProcessing: function () {

            try {
                if (this._batchProcessingManager) {
                    this._batchProcessingManager.cancelBatchProcessing();
                    this._errorHandler.showSuccess("Processing cancelled");

                    // Ensure dialog stays open until user explicitly closes it
                    // Don't automatically close the dialog here
                    // IMPORTANT: Update the batchDisplay model to switch the buttons
                    const batchDisplayModel = this.getView().getModel("batchDisplay");
                    if (batchDisplayModel) {
                        batchDisplayModel.setProperty("/isCompleted", true);
                        batchDisplayModel.setProperty("/isError", true);
                        batchDisplayModel.setProperty("/status", "Processing cancelled by user");
                    }
                } else {
                    console.error("Cannot cancel batch processing: BatchProcessingManager not available");
                }
            } catch (error) {
                console.error("Error cancelling batch processing:", error);
            }
        },

        /**
         * Handle export of batch processing results from the batch dialog.
         * Retrieves data directly from the stored results (_responseData) instead of the UI model.
         * @param {sap.ui.base.Event} oEvent - The event object from the button press.
         */
        onExportPress: function (oEvent) {

            try {
                // Get format and type from the button's customData (remains the same)
                let format = "xlsx";
                let type = "all"; // Default export type
                const source = oEvent.getSource();
                if (source && source.getCustomData) {
                    const customData = source.getCustomData();
                    customData.forEach(data => {
                        if (data.getKey() === "format") {
                            format = data.getValue().toLowerCase();
                        } else if (data.getKey() === "type") {
                            type = data.getValue(); // e.g., "all", "success", "error"
                        }
                    });
                }
                console.log(`Export requested: type='${type}', format='${format}'`);


                // *** CHANGE HERE: Get data from stored results, NOT the batchDisplay model ***
                // Ensure _responseData was populated in the .then() block after batch processing finished
                if (!this._responseData || (this._responseData.successCount === 0 && this._responseData.failureCount === 0)) {
                    // Use the counts from the stored response data to check if there's anything meaningful
                    this._errorHandler.showWarning("No processing results available to export.");
                    console.warn("Export aborted: _responseData is empty or has no processed records.");
                    return; // Stop if no results were stored
                }

                // Use the stored _responseData object which contains the detailed lists
                const batchResultsData = this._responseData;
                console.log("Data for export:", batchResultsData);

                // Ensure ExportManager is available
                if (!this._exportManager) {
                    console.error("Export Manager not initialized!");
                    this._errorHandler.showError("Critical Error: Export component not ready.");
                    return;
                }

                // Use ExportManager to handle the export with the correct data source
                this._exportManager.exportBatchResults(batchResultsData, type, format)
                    .then(() => {
                        // Success message is handled within exportBatchResults now
                        // this._errorHandler.showSuccess(`Export of '${type}' completed successfully.`);
                    })
                    .catch(error => {
                        // Error message is handled within exportBatchResults now
                        console.error(`Error during export of type '${type}':`, error);
                        // this._errorHandler.showError("Export failed: " + error.message);
                    });

            } catch (error) {
                console.error("Error in onExportPress function:", error);
                this._errorHandler.showError("Export failed unexpectedly: " + error.message);
            }
        },

        /**
         * Export all service entry sheets to Excel
         */
        onExportToExcel: function () {
            try {
                const aData = this.serviceEntrySheetModel.getData().entries || [];

                if (aData.length === 0) {
                    this._errorHandler.showError("No data available to export.");
                    return;
                }

                this._exportManager.exportToExcel(
                    aData,
                    "Service_Entry_Sheets_Upload_Log_Report.xlsx"
                )
                    .then(() => {
                        this._errorHandler.showSuccess("Export to Excel completed successfully.");
                    })
                    .catch(error => {
                        this._errorHandler.showError("Export failed: " + error.message);
                    });
            } catch (error) {
                console.error("Error exporting to Excel:", error);
                this._errorHandler.showError("Export failed: " + error.message);
            }
        },

        /**
         * Download template for Excel import
         */
        onDownloadTemplate: function () {
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
                if (this._uiManager) {
                    this._uiManager.showHelpDialog(this);
                } else {
                    console.error("Error showing help dialog: UIManager not available");
                }
            } catch (error) {
                console.error("Error showing help dialog:", error);
                this._errorHandler.showError("Could not display help: " + error.message);
            }
        },

        /**
         * Close help dialog
         */
        onHelpDialogClose: function () {
            if (this._uiManager) {
                this._uiManager.closeDialog("helpDialog");
            }
        },

        /**
         * Handle view entry details
         * @param {sap.ui.base.Event} oEvent - The event object
         */
        onViewEntryDetails: function (oEvent) {
            try {
                let oItem;
                if (oEvent.getSource) {
                    oItem = oEvent.getSource();
                } else {
                    oItem = oEvent;
                }

                const oEntry = oItem.getBindingContext("serviceEntrySheets").getObject();

                // Use UIManager to show entry details
                if (this._uiManager) {
                    this._uiManager.showEntryDetailsDialog(oEntry);
                } else {
                    console.error("Error showing entry details: UIManager not available");
                }
            } catch (error) {
                console.error("Error showing entry details:", error);
                this._errorHandler.showError("Could not display entry details: " + error.message);
            }
        },

        /**
         * Close entry details dialog
         */
        onEntryDetailsDialogClose: function () {
            if (this._uiManager) {
                this._uiManager.closeDialog("entryDetailsDialog");
            }
        },
        /**
         * Refresh table binding
         */
        onRefreshTable: function () {
            try {
                const oTable = this.byId("itemsTable");
                if (oTable) {
                    const oBinding = oTable.getBinding("items");
                    if (oBinding) {
                        oBinding.refresh(true);
                        this._errorHandler.showSuccess("Table refreshed");
                    }
                }
            } catch (error) {
                console.error("Error refreshing table:", error);
                this._errorHandler.showError("Could not refresh table: " + error.message);
            }
        },

        /**
         * Handle table view change - delegates to status filter change
         * @param {sap.ui.base.Event} oEvent - The event object
         */
        /**
         * Handle table view change - delegates to status filter change
         * @param {sap.ui.base.Event} oEvent - The event object
         */
        onTableViewChange: function (oEvent) {
            try {
                console.log("Table view change triggered:", oEvent.getParameter("item").getKey());

                const selectedItem = oEvent.getParameter("item");
                const selectedKey = selectedItem.getKey();
                const filterId = selectedItem.getId();

                // Create a proper simulated event object that has both getParameter and getSource
                const simulatedEvent = {
                    getParameter: function (paramName) {
                        if (paramName === "selectedItem") {
                            return {
                                getKey: function () {
                                    return selectedKey;
                                }
                            };
                        }
                        return null;
                    },
                    getSource: function () {
                        return {
                            getId: function () {
                                return filterId;
                            }
                        };
                    }
                };

                // Call status filter change with properly structured event
                this.onStatusFilterChange(simulatedEvent);
            } catch (error) {
                console.error("Error in table view change:", error);
                if (this._errorHandler) {
                    this._errorHandler.showError("Failed to update view: " + error.message);
                }
            }
        },

        /**
         * Add advanced filters based on specific entries
         * @param {sap.ui.base.Event} oEvent - The event object
         */
        onAddAdvancedFilter: function (oEvent) {
            try {
                // Get the source button
                const oSource = oEvent.getSource();

                // Get the field to filter from custom data
                const filterField = oSource.data("filterField");
                const filterValue = oSource.data("filterValue") || oSource.getText();

                if (filterField && filterValue) {
                    // Add to filter values
                    this._filterValues[filterField + "Filter"] = filterValue;

                    // Apply filters
                    this.applyFilters();

                    // Show message
                    MessageToast.show(`Filtered by ${filterField}: ${filterValue}`);
                }
            } catch (error) {
                console.error("Error applying advanced filter:", error);
            }
        },

        /**
         * Open advanced filter dialog
         */
        onShowAdvancedFilters: function () {
            try {
                if (!this._advancedFilterDialog) {
                    Fragment.load({
                        name: "serviceentrysheet.view.AdvancedFilterDialog",
                        controller: this
                    }).then(oDialog => {
                        this._advancedFilterDialog = oDialog;
                        this.getView().addDependent(this._advancedFilterDialog);

                        // Create model for advanced filters if needed
                        if (!this.getView().getModel("advancedFilters")) {
                            const advancedFiltersModel = new JSONModel({
                                filters: [
                                    { field: "PurchasingOrganization", label: "Purchasing Organization", value: "" },
                                    { field: "PurchasingGroup", label: "Purchasing Group", value: "" },
                                    { field: "Supplier", label: "Supplier", value: "" },
                                    { field: "Plant", label: "Plant", value: "" },
                                    { field: "CostCenter", label: "Cost Center", value: "" },
                                    { field: "GLAccount", label: "GL Account", value: "" },
                                    { field: "WBSElement", label: "WBS Element", value: "" }
                                ]
                            });
                            this.getView().setModel(advancedFiltersModel, "advancedFilters");
                        }

                        this._advancedFilterDialog.open();
                    }).catch(error => {
                        console.error("Error loading advanced filter dialog:", error);
                        this._errorHandler.showError("Could not show advanced filters: " + error.message);
                    });
                } else {
                    this._advancedFilterDialog.open();
                }
            } catch (error) {
                console.error("Error showing advanced filters dialog:", error);
                this._errorHandler.showError("Could not show advanced filters: " + error.message);
            }
        },

        /**
         * Apply advanced filters from dialog
         */
        onApplyAdvancedFilters: function () {
            try {
                const advancedFiltersModel = this.getView().getModel("advancedFilters");
                if (!advancedFiltersModel) {
                    return;
                }

                const filters = advancedFiltersModel.getProperty("/filters");

                // Apply each filter with a value
                filters.forEach(filter => {
                    if (filter.value) {
                        this._filterValues[filter.field + "Filter"] = filter.value;
                    } else {
                        // Remove empty filters
                        delete this._filterValues[filter.field + "Filter"];
                    }
                });

                // Apply filters
                this.applyFilters();

                // Close dialog
                if (this._advancedFilterDialog) {
                    this._advancedFilterDialog.close();
                }

                // Show message
                MessageToast.show("Advanced filters applied");
            } catch (error) {
                console.error("Error applying advanced filters:", error);
                this._errorHandler.showError("Could not apply advanced filters: " + error.message);
            }
        },

        /**
         * Close advanced filter dialog
         */
        onCancelAdvancedFilters: function () {
            if (this._advancedFilterDialog) {
                this._advancedFilterDialog.close();
            }
        },

        /**
         * Reset just the advanced filters
         */
        onResetAdvancedFilters: function () {
            try {
                const advancedFiltersModel = this.getView().getModel("advancedFilters");
                if (!advancedFiltersModel) {
                    return;
                }

                const filters = advancedFiltersModel.getProperty("/filters");

                // Reset all filter values
                filters.forEach(filter => {
                    filter.value = "";
                    // Also remove from active filters
                    delete this._filterValues[filter.field + "Filter"];
                });

                // Update model
                advancedFiltersModel.setProperty("/filters", filters);

                // Apply filters
                this.applyFilters();

                // Show message
                MessageToast.show("Advanced filters reset");
            } catch (error) {
                console.error("Error resetting advanced filters:", error);
            }
        },
        /**
                * Handles the close button press on the validation errors dialog.
                */
        onValidationDialogClose: function () {
            console.log("Button Handler Executed: onValidationDialogClose"); // For debugging
            // Use UIManager to close the dialog if it was used to open it
            if (this._uiManager) {
                // Assuming the dialog logical ID used in UIManager is "validationErrorsDialog"
                this._uiManager.closeDialog("validationErrorsDialog");
            } else {
                // Fallback: Try to find by ID (less reliable for fragments without view prefix)
                const oDialog = this.byId("validationErrorsDialog") || sap.ui.getCore().byId(this.getView().createId("validationErrorsDialog"));
                if (oDialog) {
                    oDialog.close();
                } else {
                    console.error("Could not find validationErrorsDialog to close.");
                }
            }
        },

        /**
                 * Handles the export button press on the validation errors dialog.
                 */
        onExportValidationErrors: function (oEvent) {
            console.log("Button Handler Executed: onExportValidationErrors"); // For debugging
            if (!this._exportManager) {
                this._errorHandler.showError("Export Manager not initialized.");
                return;
            }

            let oDialog;
            let validationModel;
            let errorsToExport;

            try {
                // Option 1: Get model from the source button's parent dialog (if UIManager didn't cache)
                const oSourceButton = oEvent.getSource();
                oDialog = oSourceButton.getParent(); // Dialog is usually the parent
                if (oDialog && oDialog.getMetadata().getName() === "sap.m.Dialog") {
                    validationModel = oDialog.getModel("validation");
                }

                // Option 2: If UIManager cached the dialog, try getting it from there (more robust)
                // This requires UIManager to expose a way to get dialog instances or models,
                // or we access its internal cache (not recommended practice).
                // Example if UIManager had a getDialog method:
                // oDialog = this._uiManager?.getDialog("validationErrorsDialog");
                // if (oDialog) { validationModel = oDialog.getModel("validation"); }

                if (!validationModel) {
                    // Fallback: Try getting model from view (less likely to be correct for dialogs)
                    validationModel = this.getView().getModel("validation");
                    if (!validationModel) {
                        // Final fallback: Try getting from uploadSummary if errors are stored there
                        const uploadSummaryModel = this.getView().getModel("uploadSummary");
                        errorsToExport = uploadSummaryModel?.getProperty("/ValidationErrors");
                        if (!errorsToExport || errorsToExport.length === 0) {
                            throw new Error("Could not find validation model or error data for export.");
                        }
                        console.warn("Exporting validation errors from uploadSummary model as fallback.");
                    }
                }

                if (!errorsToExport) { // If not already obtained from fallback
                    // Get errors from the validation model found
                    // Assuming the flat list used for display is sufficient, or check for _rawGroupedData
                    errorsToExport = validationModel?.getProperty("/flatErrors");
                    if (!errorsToExport || errorsToExport.length === 0) {
                        // Try the grouped data if it exists (added by UIManager previously)
                        errorsToExport = validationModel?.getProperty("/_rawGroupedData"); // Check this path
                        if (errorsToExport && typeof errorsToExport === 'object') {
                            // Need to flatten the grouped structure if using exportDataWithColumns
                            errorsToExport = Object.values(errorsToExport).flatMap(group => group.errors);
                        }
                    }
                }


                if (!errorsToExport || errorsToExport.length === 0) {
                    this._errorHandler.showWarning("No validation errors found to export.");
                    return;
                }

                console.log(`Exporting ${errorsToExport.length} validation errors.`);

                // Define columns for the validation error export
                const errorColumns = ["sequenceId", "field", "message", "category"]; // Adjust as needed

                // Use the flexible export function
                this._exportManager.exportDataWithColumns(
                    errorsToExport,
                    errorColumns,
                    "Validation_Errors.xlsx",
                    "Validation Errors"
                )
                    // Success/Error messages handled by ExportManager
                    .catch(err => {
                        console.error("Validation Error export failed:", err);
                        // Error already shown by export manager
                    });

            } catch (error) {
                console.error("Error exporting validation errors:", error);
                this._errorHandler.showError("Failed to export validation errors.", error.message);
            }
        },
    });
});