sap.ui.define(
    [
        "wbscreate/controller/BaseFilterController",
        "sap/ui/model/json/JSONModel",
        "sap/ui/model/odata/v2/ODataModel",
        "sap/m/MessageBox",
        "sap/ui/core/BusyIndicator",
        "sap/m/MessageToast",
        "sap/m/Dialog",
        "wbscreate/model/models",
        "sap/ui/core/Fragment",
        "wbscreate/service/BatchProcessingManager",
        "wbscreate/service/ExcelProcessor",
        "wbscreate/service/ValidationManager",
        "wbscreate/service/ExportManager",
        "wbscreate/service/ODataService",
        "wbscreate/service/UIManager",
        "wbscreate/utils/DataTransformer",
        "wbscreate/utils/ErrorHandler",
        "wbscreate/utils/ResponseProcessor",
        "wbscreate/model/ModelManager",
        "wbscreate/service/UserService"
    ],
    function (
        BaseFilterController,
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
        DataTransformer,
        ErrorHandler,
        ResponseProcessor,
        ModelManager,
        UserService
    ) {
        "use strict";

        return BaseFilterController.extend("wbscreate.controller.wbscreate", {
            /**
             * Controller initialization
             */
            onInit: function () {
                try {
                    console.log("Initializing WBS Element controller");

                    // Initialize services first
                    this._initServices();

                    // Initialize filter mappings
                    this._initFilterMappings();

                    // Call base controller's filter initialization with our mappings
                    this.initializeFilters(this._filterFieldMappings, "itemsTable", "wbsElements");

                    // Initialize response data object for storing results
                    this._responseData = {
                        totalRecords: 0,
                        successCount: 0,
                        failureCount: 0,
                        successRecords: [],
                        errorRecords: [],
                        allMessages: []
                    };

                    // Initialize a new JSONModel for filter data (e.g., dropdown options)
                    this.getView().setModel(new JSONModel({
                        StatusSet: [
                            { key: "All", text: "All" },
                            { key: "Valid", text: "Valid" },
                            { key: "Invalid", text: "Invalid" }
                        ],                         
                    }), "filterData");


                    // Initial reset of the FileUploader and related models when the app starts
                    this._resetFormAndFileUploader();

                    console.log("Controller initialization completed successfully");
                } catch (error) {
                    console.error("Error during controller initialization:", error);
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
                    // Define mappings from control IDs to model property names
                    this._filterFieldMappings = {
                        "projectElementFilter": "ProjectElement",
                        "descriptionFilter": "ProjectElementDescription",
                        "startDateFilter": "PlannedStartDate",
                        "endDateFilter": "PlannedEndDate",
                        "responsibleCostCenterFilter": "ResponsibleCostCenter",
                        "companyCodeFilter": "CompanyCode",
                        "profitCenterFilter": "ProfitCenter",
                        "controllingAreaFilter": "ControllingArea",
                        "statusFilterComboBox": "Status",
                        // Add custom extension field filters
                        "siteTypeFilter": "YY1_Categorization1_PTD",
                        "atmIdFilter": "YY1_ATMID_PTD",
                        "projectSiteIdFilter": "YY1_OldProjectSiteID_PTD",
                        // --- NEW FILTER FIELDS ---
                        "projectIDFilter": "ProjectID",       // New: for Project ID (Input)
                        "plantFilter": "Plant",               // New: for Plant (MultiComboBox)
                        "creationDateFilter": "CreationDate", // New: for Creation Date (DatePicker)
                        "isActiveFilter": "IsActive"          // New: for Is Active (SegmentedButton)
                        // --- END NEW FILTER FIELDS ---
                    };

                    console.log("Filter mappings initialized:", this._filterFieldMappings);
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
                    const responseProcessor = new ResponseProcessor({
                        dataTransformer: dataTransformer
                    });

                    // Store reference to this controller
                    const controller = this;

                    // Initialize ModelManager with proper config object
                    const modelManager = new ModelManager(controller);
                    this._modelManager = modelManager;

                    // Initialize all models
                    modelManager.initializeModels();

                    // Create services with dependencies injected using proper objects
                    const oDataService = new ODataService({
                        model: odataModel,
                        dataTransformer: dataTransformer,
                        errorHandler: errorHandler,
                        responseProcessor: responseProcessor
                    });

                    const validationManager = new ValidationManager({
                        dataTransformer: dataTransformer,
                        errorHandler: errorHandler
                    });

                    const exportManager = new ExportManager({
                        controller: controller,
                        errorHandler: errorHandler
                    });
                    // Initialize UIManager first since other services might need it
                    this._uiManager = new UIManager(controller, errorHandler);
                    // Create ExcelProcessor with all its dependencies
                    const excelProcessor = new ExcelProcessor({
                        controller: controller,
                        dataTransformer: dataTransformer,
                        validationManager: validationManager,
                        errorHandler: errorHandler
                    });

                    // Create BatchProcessingManager with all its dependencies
                    const batchProcessingManager = new BatchProcessingManager({
                        controller: controller,
                        errorHandler: errorHandler,
                        dataTransformer: dataTransformer,
                        oDataService: oDataService,
                        responseProcessor: responseProcessor,
                        exportManager: exportManager
                    });

                    const userService = new UserService({
                        controller: controller
                    });
                    // Store service references
                    this._errorHandler = errorHandler;
                    this._dataTransformer = dataTransformer;
                    this._responseProcessor = responseProcessor;
                    this._oDataService = oDataService;
                    this._validationManager = validationManager;
                    this._exportManager = exportManager;
                    this._excelProcessor = excelProcessor;
                    this._batchProcessingManager = batchProcessingManager;
                    this._userService = userService;

                    // Load user info
                    const baseUrl = this.getBaseURL();
                    modelManager.loadUserInfo(baseUrl);
                    console.log("Services initialized successfully", {
                        oDataServiceUrl: odataModel.sServiceUrl
                    });
                } catch (error) {
                    console.error("Error initializing services:", error);
                    throw error;
                }
            },

            /**
             * Event handler for the "Go" button or search event on the FilterBar.
             * Triggers the filter application.
             */
            onApplyFilters: function () {
                this.applyFilters(); // Calls the applyFilters method from BaseFilterController
            },

            /**
             * Event handler for the "Clear" or "Reset" button on the FilterBar.
             * Triggers the filter reset.
             */
            onResetFilters: function () {
                this.resetFilters(); // Calls the resetFilters method from BaseFilterController
            },

            /**
             * File upload handler
             * @param {sap.ui.base.Event} oEvent - The file upload event
             */
            onFileChange: function (oEvent) {
                try {
                    const oFileUploader = this.byId("fileUploader"); // Get by ID for consistency
                    const file = oEvent.getParameter("files")[0];

                    if (!file) {
                        // If no file is selected (e.g., user clears the field manually), reset everything
                        this._resetFormAndFileUploader();
                        this._errorHandler.showError("No file selected. Please choose a file to upload.");
                        return;
                    }

                    // Validate file type
                    if (!file.name.endsWith(".xlsx")) {
                        this._errorHandler.showError("Invalid file type. Please upload an Excel file (.xlsx).");
                        oFileUploader.clear(); // Clear the FileUploader if the type is wrong
                        // Also reset the models if the file is invalid
                        this._modelManager.resetModels();
                        return;
                    }

                    // Reset the form and FileUploader at the beginning of a new file selection
                    this._resetFormAndFileUploader();

                    // Update upload summary model to enable submit button
                    const oUploadSummaryModel = this._modelManager.getModel("uploadSummary");
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
                                // Apply filters after new data is loaded
                                this.onApplyFilters();
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
             * Submit project elements
             */
            onCreateProjectElements: function () {
                try {
                    // Get model data using ModelManager
                    const oModel = this._modelManager.getModel("wbsElements");
                    const uploadSummaryModel = this._modelManager.getModel("uploadSummary");
                    const oData = oModel.getData();

                    // Check for entries
                    if (!oData.entries || oData.entries.length === 0) {
                        this._errorHandler.showError("No valid WBS Elements to submit.");
                        return;
                    }

                    // Confirm submission
                    this._errorHandler.showConfirmation(
                        `You are about to submit ${oData.entries.length} WBS Elements. Continue?`,
                        "Confirm Submission",
                        () => {
                            // Update UI state
                            uploadSummaryModel.setProperty("/HasBeenSubmitted", true);
                            uploadSummaryModel.setProperty("/isSubmitting", true);
                            uploadSummaryModel.setProperty("/IsSubmitEnabled", false);

                            // Submit WBS elements
                            this._submitProjectElements(oData.entries);
                        }
                    );
                } catch (error) {
                    console.error("Error in WBS Element creation:", error);
                    this._errorHandler.showError("Failed to prepare submission: " + error.message);
                }
            },

            /**
             * Submit project elements in batches
             * @param {Array} entries - Array of WBS Elements to submit
             * @private
             */
            _submitProjectElements: function (entries) {
                try {
                    // Filter only valid entries
                    const validEntries = entries.filter(entry => entry.Status === 'Valid');

                    if (validEntries.length === 0) {
                        this._errorHandler.showError("No valid entries to process.");
                        return;
                    }

                    // Ensure BatchProcessingManager is available
                    if (!this._batchProcessingManager || typeof this._batchProcessingManager.startWBSElementCreation !== 'function') {
                        throw new Error("WBS Element processing service is not available");
                    }

                    // Show processing dialog and start batch creation
                    this._batchProcessingManager.startWBSElementCreation(validEntries)
                        .then((result) => {
                            const { responseData, cancelled } = result;

                            // Update response data in controller
                            this._responseData = responseData;

                            // Show appropriate message based on result
                            if (cancelled) {
                                this._errorHandler.showWarning("Processing was cancelled by user.");
                            } else if (responseData.failureCount > 0) {
                                this._errorHandler.showWarning(
                                    `Processing completed with ${responseData.failureCount} failures.`,
                                    `${responseData.successCount} items were processed successfully.`
                                );
                            } else {
                                this._errorHandler.showSuccess(
                                    `All ${responseData.successCount} items were processed successfully.`
                                );
                            }
                            // Reset the form and FileUploader after batch processing is done (success or error)
                            this._resetFormAndFileUploader();
                            // Re-apply filters to update the table based on submission results
                            this.onApplyFilters();
                        })
                        .catch((error) => {
                            console.error("Error during WBS element creation:", error);
                            this._errorHandler.showError(
                                "Failed to process WBS elements: " + (error.message || "Unknown error")
                            );
                            // Reset the form and FileUploader if an overall error occurs
                            this._resetFormAndFileUploader();
                            // Re-apply filters to update the table based on submission results
                            this.onApplyFilters();
                        });

                } catch (error) {
                    console.error("Error submitting WBS elements:", error);
                    this._errorHandler.showError("Submission failed: " + error.message);

                    // Update the upload summary model on immediate error
                    const uploadSummaryModel = this._modelManager.getModel("uploadSummary");
                    if (uploadSummaryModel) {
                        uploadSummaryModel.setProperty("/isSubmitting", false);
                    }
                    // Ensure FileUploader is reset on any error
                    this._resetFormAndFileUploader();
                    // Re-apply filters to update the table based on submission results
                    this.onApplyFilters();
                }
            },
            /**
             * Handle export of batch processing results
             * @param {sap.ui.base.Event} oEvent - The event object
             */
            onExportPress: function (oEvent) {
                try {
                    // Always use these defaults to ensure all records are included
                    let format = "xlsx";
                    let type = "all";  // Always use "all" to include all records

                    // Get format from button's custom data if available
                    const source = oEvent.getSource();
                    if (source && source.getCustomData) {
                        const customData = source.getCustomData();
                        if (customData && customData.length > 0) {
                            for (let i = 0; i < customData.length; i++) {
                                const data = customData[i];
                                if (data.getKey() === "format") {
                                    format = data.getValue().toLowerCase();
                                }
                            }
                        }
                    }

                    // Get batch display model data
                    const wbsDisplayModel = this.getView().getModel("wbsDisplay");
                    if (!wbsDisplayModel) {
                        this._errorHandler.showError("No data available for export");
                        return;
                    }

                    const batchData = wbsDisplayModel.getData();
                    const responseData = this._batchProcessingManager.getResponseData();

                    // Combine the data for export
                    const exportData = {
                        ...batchData,
                        responseData: responseData
                    };

                    // Use ExportManager to handle the export, always using "all" for type
                    this._exportManager.exportBatchResults(exportData, type, format)
                        .then(() => {
                            this._errorHandler.showSuccess(`Export completed successfully`);
                        })
                        .catch(error => {
                            this._errorHandler.showError("Export failed: " + error.message);
                        });
                } catch (error) {
                    console.error("Error in export process:", error);
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
             * Close the batch processing dialog
             */
            onCloseBatchDialog: function () {
                try {
                    this._batchProcessingManager.closeBatchProcessingDialog();
                } catch (error) {
                    console.error("Error closing batch dialog:", error);
                }
            },
            /**
             * View entry details
             * @param {sap.ui.base.Event} oEvent The event
             */
            onViewEntryDetails: function (oEvent) {
                try {
                    let oItem;
                    if (oEvent.getSource) {
                        oItem = oEvent.getSource();
                    } else {
                        oItem = oEvent;
                    }

                    const oEntry = oItem.getBindingContext("wbsElements").getObject();
                    this._uiManager.showEntryDetailsDialog(oEntry);
                } catch (error) {
                    console.error("Error showing entry details:", error);
                    this._errorHandler.showError("Could not display entry details: " + error.message);
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
             * Helper method to refresh table data
             * @private
             */
            _refreshTableData: function () {
                const oTable = this.byId("itemsTable");
                if (oTable) {
                    const oBinding = oTable.getBinding("items");
                    if (oBinding) {
                        oBinding.refresh();
                    }
                }
            },

            /**
             * Cancel current processing
             */
            onCancelProcessing: function () {
                if (this._batchProcessingManager) {
                    this._batchProcessingManager.cancelWBSElementCreation();
                    this._errorHandler.showSuccess("Processing cancelled");
                    // Reset the form and FileUploader upon cancellation
                    this._resetFormAndFileUploader();
                    // Re-apply filters to ensure UI reflects current data after cancellation
                    this.onApplyFilters();
                }
            },

            /**
             * Handler for Validation Errors Dialog close
             */
            onValidationDialogClose: function () {
                if (this._uiManager) {
                    this._uiManager.closeDialog("validationErrorsDialog", true);
                } else {
                    console.error("onValidationDialogClose: UIManager instance not found on controller.");
                }
            },

            /**
             * Handler for exporting errors from the Validation Errors Dialog.
             */
            onExportValidationErrors: function (oEvent) {
                if (!this._uiManager || !this._errorHandler) {
                    console.error("onExportValidationErrors: UIManager or ErrorHandler not found on controller.");
                    if (this._errorHandler) {
                        this._errorHandler.showError("Cannot export errors due to an internal issue.");
                    }
                    return;
                }

                let oButton = oEvent.getSource();
                let oDialog = oButton;
                while (oDialog && !(oDialog instanceof Dialog)) {
                    oDialog = oDialog.getParent();
                }

                if (oDialog) {
                    const oModel = oDialog.getModel("validation");
                    if (oModel) {
                        const groupedErrorsData = oModel.getProperty("/_rawGroupedData");
                        if (groupedErrorsData) {
                            this._uiManager.exportValidationErrors(groupedErrorsData);
                        } else {
                            console.error("Raw grouped data not found in validation model for export.");
                            this._errorHandler.showError("Could not retrieve errors for export.");
                        }
                    } else {
                        console.error("Validation model not found on dialog for export.");
                        this._errorHandler.showError("Could not retrieve model data for export.");
                    }
                    this._uiManager.closeDialog("validationErrorsDialog", true);
                } else {
                    console.error("Could not find parent Dialog control for the export button.");
                    this._errorHandler.showError("Operation failed: Could not identify the dialog window for export.");
                }
            },

            /**
             * Handler for closing the Entry Details Dialog.
             */
            onEntryDetailsDialogClose: function () {
                if (this._uiManager) {
                    this._uiManager.closeDialog("entryDetailsDialog", false);
                } else {
                    console.error("onEntryDetailsDialogClose: UIManager instance not found on controller.");
                }
            },

            /**
             * Handler for exporting from the Entry Details Dialog.
             */
            onExportEntryDetails: function () {
                if (this._errorHandler) {
                    this._errorHandler.showWarning("Export for single entry details is not implemented.");
                }
            },

            /**
             * Show success dialog close
             */
            onSuccessDialogClose: function () {
                if (this._uiManager) {
                    this._uiManager.closeDialog("successDialog", true);
                }
            },

            /**
             * Method to get base URL for service calls
             * @returns {string} Base URL for service calls
             */
            getBaseURL: function () {
                const appId = this.getOwnerComponent().getManifestEntry("/sap.app/id");
                const appPath = appId.replaceAll(".", "/");
                const appModulePath = jQuery.sap.getModulePath(appPath);
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
                        // Use the new combined reset function
                        this._resetFormAndFileUploader();
                        this._errorHandler.showSuccess("Form has been reset");
                        // Re-apply filters to clear the table after reset
                        this.onApplyFilters();
                    }
                );
            },

            /**
             * Helper function to reset the FileUploader control.
             * @private
             */
            _resetFileUploader: function () {
                const oFileUploader = this.byId("fileUploader");
                if (oFileUploader) {
                    // Preferred method for newer SAPUI5 versions (1.54+)
                    if (oFileUploader.clear) {
                        oFileUploader.clear();
                        console.log("FileUploader cleared using .clear() method.");
                    } else {
                        // Fallback for older versions: manually clear the input element
                        const oFileUploaderInput = oFileUploader.getDomRef().querySelector('input[type="file"]');
                        if (oFileUploaderInput) {
                            oFileUploaderInput.value = '';
                            console.log("FileUploader input value manually reset.");
                        } else {
                            console.warn("Could not find the internal file input element of FileUploader.");
                        }
                    }
                } else {
                    console.warn("FileUploader control with ID 'fileUploader' not found.");
                }
            },

            /**
             * Resets all relevant models and the FileUploader to their initial state.
             * @private
             */
            _resetFormAndFileUploader: function () {
                // Reset all models managed by ModelManager
                if (this._modelManager) {
                    this._modelManager.resetModels();
                    console.log("All models reset by ModelManager.");
                } else {
                    console.warn("ModelManager not available to reset models.");
                }

                // Explicitly clear the FileUploader
                this._resetFileUploader();

                // Optionally, collapse the summary panel after reset
                const oSummaryPanel = this.byId("summaryPanel");
                if (oSummaryPanel && oSummaryPanel.getExpanded()) {
                    oSummaryPanel.setExpanded(false);
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
             * Custom implementation for _updateFilteredCount from BaseFilterController.
             * Updates a property in the 'uploadSummary' model with the current filtered count.
             * @param {number} count - The number of filtered items.
             * @override
             */
            _updateFilteredCount: function (count) {
                const oUploadSummaryModel = this._modelManager.getModel("uploadSummary");
                if (oUploadSummaryModel) {
                    oUploadSummaryModel.setProperty("/filteredCount", count);
                    console.log(`Filtered count updated to: ${count}`);
                }
            },

            /**
             * Custom implementation for _updateFilterIndicators from BaseFilterController.
             * This method can be used to visually indicate active filters, e.g., by changing
             * the state of a filter bar or showing a message.
             * @override
             */
            _updateFilterIndicators: function () {
                // In your current view, you don't have a sap.ui.comp.filterbar.FilterBar
                // but a custom layout with individual controls.
                // You can still count active filters and enable/disable a "Clear Filters" button.

                // Count active filters based on the _filterValues property
                const activeFiltersCount = Object.keys(this._filterValues).filter(filterId => {
                    const value = this._filterValues[filterId];
                    // Special handling for 'All' key in ComboBox/SegmentedButton
                    if (filterId === "statusFilterComboBox" && value === "All") {
                        return false;
                    }
                    if (filterId === "isActiveFilter" && value === "All") {
                        return false;
                    }
                    // For MultiComboBox, if "All" is one of the selected keys, or if no keys are selected, it's not an active filter
                    if (filterId === "plantFilter" && (Array.isArray(value) && (value.length === 0 || value.includes("All")))) {
                        return false;
                    }
                    // Consider a filter active if its value is not null, undefined, empty string, or empty array
                    return value !== null && value !== undefined && value !== "" && !(Array.isArray(value) && value.length === 0);
                }).length;

                const oResetFiltersBtn = this.byId("resetFiltersBtn");
                if (oResetFiltersBtn) {
                    oResetFiltersBtn.setEnabled(activeFiltersCount > 0);
                    console.log(`Reset Filters button enabled: ${activeFiltersCount > 0}`);
                }
                // You could also update a text on the page to summarize active filters
                // e.g., this.byId("activeFiltersSummaryText").setText(`Active Filters: ${activeFiltersCount}`);
            },

            /**
             * Handler for the search field in the table toolbar.
             * This is a separate search from the main filters.
             * @param {sap.ui.base.Event} oEvent The search event
             */
            onSearchItems: function (oEvent) {
                const sQuery = oEvent.getParameter("query");
                const aTableFilters = [];

                if (sQuery) {
                    // Create a filter for each relevant column that can be searched
                    const oFilter = new sap.ui.model.Filter({
                        filters: [
                            new sap.ui.model.Filter("ProjectElement", sap.ui.model.FilterOperator.Contains, sQuery),
                            new sap.ui.model.Filter("ProjectElementDescription", sap.ui.model.FilterOperator.Contains, sQuery),
                            new sap.ui.model.Filter("ProjectID", sap.ui.model.FilterOperator.Contains, sQuery),
                            new sap.ui.model.Filter("Plant", sap.ui.model.FilterOperator.Contains, sQuery)
                            // Add other columns you want to be searchable
                        ],
                        and: false // OR logic for multiple columns in a search field
                    });
                    aTableFilters.push(oFilter);
                }

                const oTable = this.byId("itemsTable");
                const oBinding = oTable.getBinding("items");
                if (oBinding) {
                    oBinding.filter(aTableFilters);
                    this._updateFilteredCount(oBinding.getLength()); // Update count after search
                }
            },

            /**
             * Mock function to simulate Excel data parsing
             * Now includes mock data for new fields
             */
            _generateMockWBSData: function (fileName) {
                const data = [];
                const numRecords = 20; // Increased for better filter testing
                const plants = ["P100", "P200", "P300"];
                const statuses = ["Valid", "Invalid", "Existing", "Error"]; // All possible statuses

                for (let i = 0; i < numRecords; i++) {
                    const isActive = Math.random() > 0.5; // Random boolean
                    const plant = plants[Math.floor(Math.random() * plants.length)];
                    const creationDate = new Date();
                    creationDate.setDate(creationDate.getDate() - Math.floor(Math.random() * 30)); // Random date in last 30 days

                    // Assign statuses more broadly for testing
                    const status = statuses[Math.floor(Math.random() * statuses.length)];

                    data.push({
                        "ProjectElement": `P123-WBS-${i + 1}`,
                        "ProjectUUID": `UUID-${Math.random().toString(36).substring(2, 10).toUpperCase()}`,
                        "ProjectElementDescription": `WBS Element Description ${i + 1} from ${fileName}`,
                        "PlannedStartDate": new Date(2023, 0, 1 + i), // Jan 1st + i days
                        "PlannedEndDate": new Date(2023, 1, 15 + i), // Feb 15th + i days
                        "ResponsibleCostCenter": `CC${100 + i}`,
                        "CompanyCode": `C${1000 + (i % 3)}`,
                        "ProfitCenter": `PC${200 + (i % 5)}`,
                        "ControllingArea": `CA${300 + (i % 2)}`,
                        "WBSElementIsBillingElement": i % 2 === 0, // Alternate true/false
                        "Status": status, // Use the randomly selected status
                        // --- NEW MOCK DATA FIELDS ---
                        "ProjectID": `PRJ-${String(100 + i).padStart(3, '0')}`,
                        "Plant": plant,
                        "CreationDate": creationDate,
                        "IsActive": isActive
                        // --- END NEW MOCK DATA FIELDS ---
                    });
                }
                return data;
            }
        });
    }
);