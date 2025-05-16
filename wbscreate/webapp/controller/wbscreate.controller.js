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
        "wbscreate/model/ModelManager"
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
        ModelManager
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
                    // Define mappings from control IDs to model properties
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
                        "projectSiteIdFilter": "YY1_OldProjectSiteID_PTD"
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

                    // Store service references
                    this._errorHandler = errorHandler;
                    this._dataTransformer = dataTransformer;
                    this._responseProcessor = responseProcessor;
                    this._oDataService = oDataService;
                    this._validationManager = validationManager;
                    this._exportManager = exportManager;
                    this._excelProcessor = excelProcessor;
                    this._batchProcessingManager = batchProcessingManager;

                    console.log("Services initialized successfully", {
                        oDataServiceUrl: odataModel.sServiceUrl
                    });
                } catch (error) {
                    console.error("Error initializing services:", error);
                    throw error;
                }
            },

            /**
             * File upload handler
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

                    // Reset models using ModelManager
                    this._modelManager.initializeModels();

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

                            // Update the upload summary model
                            const uploadSummaryModel = this._modelManager.getModel("uploadSummary");
                            if (uploadSummaryModel) {
                                uploadSummaryModel.setProperty("/isSubmitting", false);
                                uploadSummaryModel.setProperty("/HasBeenSubmitted", true);
                                uploadSummaryModel.setProperty("/IsSubmitEnabled", false);
                            }

                            // Refresh the table data if needed
                            this._refreshTableData();
                        })
                        .catch((error) => {
                            console.error("Error during WBS element creation:", error);
                            this._errorHandler.showError(
                                "Failed to process WBS elements: " + (error.message || "Unknown error")
                            );

                            // Update the upload summary model
                            const uploadSummaryModel = this._modelManager.getModel("uploadSummary");
                            if (uploadSummaryModel) {
                                uploadSummaryModel.setProperty("/isSubmitting", false);
                            }
                        });
                } catch (error) {
                    console.error("Error submitting WBS elements:", error);
                    this._errorHandler.showError("Submission failed: " + error.message);

                    // Update the upload summary model
                    const uploadSummaryModel = this._modelManager.getModel("uploadSummary");
                    if (uploadSummaryModel) {
                        uploadSummaryModel.setProperty("/isSubmitting", false);
                    }
                }
            },

            /**
             * Export all WBS elements to Excel
             */
            onExportToExcel: function () {
                try {
                    const oModel = this._modelManager.getModel("wbsElements");
                    const aData = oModel.getData().entries || [];

                    if (aData.length === 0) {
                        this._errorHandler.showError("No data available to export.");
                        return;
                    }

                    this._exportManager.exportToExcel(
                        aData,
                        "WBS_Elements_Upload_Log_Report.xlsx"
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
            }
        });
    }
);