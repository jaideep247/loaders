sap.ui.define(
    [
        "gigr/controller/BaseFilterController",
        "sap/ui/model/json/JSONModel",
        "sap/ui/model/odata/v2/ODataModel",
        "sap/m/MessageBox",
        "sap/ui/core/BusyIndicator",
        "sap/m/MessageToast",
        "sap/m/Dialog",
        "gigr/model/models",
        "sap/ui/core/Fragment",
        "gigr/service/BatchProcessingManager",
        "gigr/service/ExcelProcessor",
        "gigr/service/ValidationManager",
        "gigr/service/ExportManager",
        "gigr/service/ODataService",
        "gigr/service/UIManager",
        "gigr/service/UserService",
        "gigr/utils/DataTransformer",
        "gigr/utils/ErrorHandler",
        "gigr/model/ModelManager"
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
        UserService,
        DataTransformer,
        ErrorHandler,
        ModelManager
    ) {
        "use strict";

        return BaseFilterController.extend("gigr.controller.gigr", {
            /**
             * Controller initialization
             */
            onInit: function () {
                try {
                    console.log("Initializing GIGRDocument controller");
                    // Initialize services first
                    this._initServices();
                    // Initialize base filter properties
                    //       this._initFilterProperties();
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

                    // Store reference to this controller 
                    const controller = this;

                    // Initialize ModelManager first
                    const modelManager = new ModelManager(controller);
                    this._modelManager = modelManager;

                    // Initialize all models
                    modelManager.initializeModels();

                    // Load user info
                    const baseUrl = this.getBaseURL();
                    modelManager.loadUserInfo(baseUrl);

                    // Create services with dependencies injected using proper objects
                    const oDataService = new ODataService({
                        model: odataModel,
                        dataTransformer: dataTransformer,
                        errorHandler: errorHandler
                    });

                    const userService = new UserService({
                        controller: controller
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

                    // Fix ExcelProcessor instantiation - pass the controller explicitly
                    const excelProcessor = new ExcelProcessor({
                        controller: controller,
                        dataTransformer: dataTransformer,
                        validationManager: validationManager,
                        errorHandler: errorHandler
                    });

                    const batchProcessingManager = new BatchProcessingManager({
                        controller: controller,
                        errorHandler: errorHandler,
                        dataTransformer: dataTransformer,
                        oDataService: oDataService,
                        exportManager: exportManager
                    });

                    // Store service references
                    this._errorHandler = errorHandler;
                    this._dataTransformer = dataTransformer;
                    this._oDataService = oDataService;
                    this._userService = userService;
                    this._validationManager = validationManager;
                    this._exportManager = exportManager;
                    this._uiManager = uiManager;
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

                    // Reset models using ModelManager
                    this._modelManager.resetModels();

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
             * Create GIGR documents from uploaded Excel data
             */
            onCreateGIGRDocument: function () {
                try {
                    // Get model data using ModelManager
                    const oModel = this._modelManager.getModel("gigrDocuments");
                    const uploadSummaryModel = this._modelManager.getModel("uploadSummary");
                    const oData = oModel.getData();

                    // Check for entries
                    if (!oData.entries || oData.entries.length === 0) {
                        this._errorHandler.showError("No valid GIGR documents to submit.");
                        return;
                    }

                    // Confirm submission
                    this._errorHandler.showConfirmation(
                        `You are about to submit ${oData.entries.length} GIGR documents. Continue?`,
                        "Confirm Submission",
                        () => {
                            // Update UI state
                            uploadSummaryModel.setProperty("/HasBeenSubmitted", true);
                            uploadSummaryModel.setProperty("/isSubmitting", true);

                            // Submit GIGR documents
                            this._submitGIGRDocuments(oData.entries);
                        }
                    );
                } catch (error) {
                    console.error("Error in GIGR document creation:", error);
                    this._errorHandler.showError("Failed to prepare submission: " + error.message);
                }
            },

            /**
             * Submit GIGR documents in batches
             * @param {Array} gigrDocuments - Array of GIGR documents to submit
             * @private
             */
            _submitGIGRDocuments: function (gigrDocuments) {
                try {
                    if (!gigrDocuments || gigrDocuments.length === 0) {
                        this._errorHandler.showError("No GIGR documents to process");
                        return;
                    }

                    // Set batch size - can be adjusted based on system performance
                    const batchSize = 10;

                    // Start batch processing using the BatchProcessingManager
                    this._batchProcessingManager.startBatchProcessing(
                        gigrDocuments,
                        this._batchProcessingManager.processODataBatch.bind(this._batchProcessingManager),
                        {
                            batchSize: batchSize,
                            mode: "odata"
                        }
                    )
                        .then((result) => {
                            console.log("Batch processing complete:", result);

                            // Store result for export features
                            this._responseData = this._batchProcessingManager.getResponseData();

                            // Show appropriate message based on results
                            if (result.failureCount > 0) {
                                this._errorHandler.showWarning(
                                    `Processing completed with ${result.failureCount} errors. ` +
                                    `You can export the results for details.`
                                );
                            } else {
                                this._errorHandler.showSuccess(
                                    `Successfully processed ${result.successCount} entries.`
                                );
                            }
                        })
                        .catch((error) => {
                            console.error("Error in batch processing:", error);
                            this._errorHandler.showError(
                                "Error processing GIGR documents: " +
                                (error.message || "Unknown error")
                            );
                        });
                } catch (error) {
                    console.error("Error submitting GIGR documents:", error);
                    this._errorHandler.showError("Submission failed: " + error.message);
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
             * Cancel the current batch processing
             */
            onCancelBatchProcessing: function () {
                try {
                    this._batchProcessingManager.cancelBatchProcessing();
                    this._errorHandler.showSuccess("Processing cancelled");
                } catch (error) {
                    console.error("Error cancelling batch processing:", error);
                }
            },

            /**
             * Handle export of batch processing results
             * @param {sap.ui.base.Event} oEvent - The event object
             */
            onExportPress: function (oEvent) {
                try {
                    // Get format and type from the button's customData
                    let format = "xlsx";
                    let type = "all";

                    const source = oEvent.getSource();
                    if (source && source.getCustomData) {
                        const customData = source.getCustomData();
                        if (customData && customData.length > 0) {
                            for (let i = 0; i < customData.length; i++) {
                                const data = customData[i];
                                if (data.getKey() === "format") {
                                    format = data.getValue().toLowerCase();
                                } else if (data.getKey() === "type") {
                                    type = data.getValue();
                                }
                            }
                        }
                    }

                    // Get batch display model data using ModelManager
                    const batchDisplayModel = this._modelManager.getModel("batchDisplay");
                    if (!batchDisplayModel) {
                        this._errorHandler.showError("No data available for export");
                        return;
                    }

                    const batchData = batchDisplayModel.getData();

                    // Use ExportManager to handle the export
                    this._exportManager.exportBatchResults(batchData, type, format)
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
            * Export all GIGR documents to Excel
            */
            onExportToExcel: function () {
                try {
                    const oModel = this._modelManager.getModel("gigrDocuments");
                    const aData = oModel.getData().entries || [];

                    if (aData.length === 0) {
                        this._errorHandler.showError("No data available to export.");
                        return;
                    }

                    this._exportManager.exportToExcel(
                        aData,
                        "GIGR_Documents_Upload_Log_Report.xlsx"
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
             * Submit Complete
             */
            onValidateEntries: function (aEntries) {
                const validationErrors = [];
                if (validationErrors.length > 0) {
                    this._uiManager.handleValidationErrors(validationErrors);

                    const total = aEntries.length;
                    const failed = validationErrors.length;
                    const successful = total - failed;
                    this._uiManager.showValidationStatsDialog(total, successful, failed);
                } else {
                    this._errorHandler.showSuccess("All entries are valid!");
                    this._uiManager.showValidationStatsDialog(aEntries.length, aEntries.length, 0);
                }
            },

            /**
            * Submit Complete
            */
            onSubmitComplete: function (results) {
                if (results.failedEntries.length === 0 && results.successEntries.length > 0) {
                    this._uiManager.showSuccessWithDocuments(results.successEntries);
                } else if (results.failedEntries.length > 0 && results.successEntries.length > 0) {
                    this._uiManager.showPartialSuccessWithDocuments(results.successEntries, results.failedEntries);
                } else if (results.failedEntries.length > 0) {
                    this._uiManager.showErrorWithDetails(results.failedEntries);
                } else {
                    this._errorHandler.showWarning("Submission complete, but no results reported.");
                }

                if (this._uiManager._batchProcessingDisplay) {
                    this._uiManager.updateBatchProcessingDisplay({ status: "Complete", visible: false });
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
                    this._uiManager.showHelpDialog(this);
                } catch (error) {
                    console.error("Error showing help dialog:", error);
                    this._errorHandler.showError("Could not display help: " + error.message);
                }
            },

            /**
            * Handle item press to show details
            * @param {sap.ui.base.Event} oEvent - The item press event
            */
            onItemPress: function (oEvent) {
                try {
                    const oItem = oEvent.getSource();
                    const oEntry = oItem.getBindingContext("gigrDocuments").getObject();
                    this._uiManager.showEntryDetailsDialog(oEntry);
                } catch (error) {
                    console.error("Error showing item details:", error);
                    this._errorHandler.showError("Could not display item details: " + error.message);
                }
            },

            /**
            * Handle entry details view
            * @param {sap.ui.base.Event|Object} oEvent - The event or item object
            */
            onViewEntryDetails: function (oEvent) {
                try {
                    let oItem;
                    if (oEvent.getSource) {
                        oItem = oEvent.getSource();
                    } else {
                        oItem = oEvent;
                    }

                    const oEntry = oItem.getBindingContext("gigrDocuments").getObject();
                    this._uiManager.showEntryDetailsDialog(oEntry);
                } catch (error) {
                    console.error("Error showing entry details:", error);
                    this._errorHandler.showError("Could not display entry details: " + error.message);
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
                    this._uiManager.closeSuccessDialog();
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