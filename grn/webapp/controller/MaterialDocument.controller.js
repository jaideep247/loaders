sap.ui.define(
    [
        "grn/controller/BaseFilterController",
        "sap/ui/model/json/JSONModel",
        "sap/ui/model/odata/v2/ODataModel",
        "sap/m/MessageBox",
        "sap/ui/core/BusyIndicator",
        "sap/m/MessageToast",
        "sap/m/Dialog",
        "grn/model/models",
        "sap/ui/core/Fragment",
        "grn/service/BatchProcessingManager",
        "grn/service/ExcelProcessor",
        "grn/service/ValidationManager",
        "grn/service/ExportManager",
        "grn/service/ODataService",
        "grn/service/UIManager",
        "grn/service/UserService",
        "grn/utils/DataTransformer",
        "grn/utils/ErrorHandler",
        "grn/model/ModelManager"
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
        ModelManager  // Add ModelManager parameter
    ) {
        "use strict";

        return BaseFilterController.extend("grn.controller.MaterialDocument", {
            /**
             * Controller initialization
             */
            onInit: function () {
                try {
                    console.log("Initializing MaterialDocument controller");

                    // Initialize base filter properties
                    this._initFilterProperties();

                    // Initialize services first
                    this._initServices();

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

                    // Display user-friendly error message
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
                    const odataModel = this.getOwnerComponent().getModel();
                    if (!odataModel) throw new Error("OData model is not initialized");

                    const controller = this;

                    // Create DataTransformer FIRST (handles all data operations)
                    const dataTransformer = new DataTransformer();

                    // Create ErrorHandler SECOND (handles all error/message operations)
                    const errorHandler = new ErrorHandler();

                    // Cross-inject dependencies
                    errorHandler.setDataTransformer(dataTransformer);
                    dataTransformer._errorHandler = errorHandler;

                    // Create ModelManager and INITIALIZE MODELS
                    const modelManager = new ModelManager(controller);
                    modelManager.initializeModels(); 
                    // Load user info
                    const baseUrl = this.getBaseURL();
                    modelManager.loadUserInfo(baseUrl);
                    
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
                        errorHandler: errorHandler,
                        dataTransformer: dataTransformer
                    });

                    const uiManager = new UIManager(controller, errorHandler);

                    // CREATE EXCEL PROCESSOR - This was missing!
                    const excelProcessor = new ExcelProcessor({
                        controller: controller,
                        dataTransformer: dataTransformer,
                        errorHandler: errorHandler,
                        validationManager: validationManager,
                        modelManager: modelManager // Pass the initialized ModelManager
                    });

                    const batchProcessingManager = new BatchProcessingManager({
                        controller: controller,
                        errorHandler: errorHandler,
                        dataTransformer: dataTransformer,
                        oDataService: oDataService,
                        exportManager: exportManager
                    });

                    // Store references - INCLUDE ExcelProcessor!
                    this._errorHandler = errorHandler;
                    this._dataTransformer = dataTransformer;
                    this._oDataService = oDataService;
                    this._validationManager = validationManager;
                    this._exportManager = exportManager;
                    this._uiManager = uiManager;
                    this._excelProcessor = excelProcessor;
                    this._batchProcessingManager = batchProcessingManager;
                    this._modelManager = modelManager;
                        
                    console.log("Services initialized with clean separation of concerns");
                } catch (error) {
                    console.error("Error initializing services:", error);
                    throw error;
                }
            },

            /**
             * Reset the form to initial state
             */
            onReset: function () {
                this._errorHandler.showConfirmation(
                    "Are you sure you want to reset the form? All unsaved data will be lost.",
                    "Confirm Reset",
                    () => {
                        // Use ModelManager to reset models
                        this._modelManager.resetModels();
                        this._resetFilters();
                        this._errorHandler.showSuccess("Form has been reset");
                    }
                );
            },

            /**
             * Handle file upload for Excel imports
             * @param {sap.ui.base.Event} oEvent - The file upload event
             */
            onFileChange: function (oEvent) {
                try {
                    const oFileUploader = oEvent.getSource();
                    const file = oEvent.getParameter("files") && oEvent.getParameter("files")[0];

                    // Validate file selection
                    if (!file) {
                        this._errorHandler.showError("No file selected. Please choose a file to upload.");
                        return;
                    }

                    // Validate file type
                    if (!file.name.toLowerCase().endsWith(".xlsx")) {
                        this._errorHandler.showError("Invalid file type. Please upload an Excel file (.xlsx).");
                        oFileUploader.clear();
                        return;
                    }

                    // Validate file size (optional - adjust limit as needed)
                    const maxSizeInMB = 10;
                    const maxSizeInBytes = maxSizeInMB * 1024 * 1024;
                    if (file.size > maxSizeInBytes) {
                        this._errorHandler.showError(`File size exceeds ${maxSizeInMB}MB limit. Please select a smaller file.`);
                        oFileUploader.clear();
                        return;
                    }

                    // Check if ExcelProcessor is initialized
                    if (!this._excelProcessor) {
                        console.error("ExcelProcessor not initialized");
                        this._errorHandler.showError("Excel processor not available. Please refresh the page and try again.");
                        return;
                    }

                    // Check if ModelManager is initialized
                    if (!this._modelManager) {
                        console.error("ModelManager not initialized");
                        this._errorHandler.showError("Model manager not available. Please refresh the page and try again.");
                        return;
                    }

                    // Reset models using ModelManager
                    this._modelManager.resetModels();

                    // Update upload summary model to enable submit button
                    const oUploadSummaryModel = this._modelManager.getModel("uploadSummary");
                    if (oUploadSummaryModel) {
                        oUploadSummaryModel.setProperty("/HasBeenSubmitted", false);
                        oUploadSummaryModel.setProperty("/IsSubmitEnabled", true);
                        oUploadSummaryModel.setProperty("/IsProcessing", true);
                    }

                    // Show busy indicator
                    BusyIndicator.show(0);

                    console.log("Starting file processing:", {
                        fileName: file.name,
                        fileSize: file.size,
                        fileType: file.type
                    });

                    // Process file with slight delay for better UX
                    setTimeout(() => {
                        // Use ExcelProcessor to handle file parsing and validation
                        this._excelProcessor.processExcelFile(file)
                            .then((result) => {
                                console.log("File processing completed successfully:", result);

                                // Update upload summary model
                                if (oUploadSummaryModel) {
                                    oUploadSummaryModel.setProperty("/IsProcessing", false);
                                }

                                // Expand the summary panel to show results
                                const oSummaryPanel = this.byId("summaryPanel");
                                if (oSummaryPanel) {
                                    oSummaryPanel.setExpanded(true);
                                }

                                // Show success message with summary
                                if (result && result.totalRecords) {
                                    this._errorHandler.showSuccess(
                                        `File processed successfully. ${result.totalRecords} records loaded.`
                                    );
                                } else {
                                    this._errorHandler.showSuccess("File processed successfully.");
                                }
                            })
                            .catch(error => {
                                console.error("Error processing file:", error);

                                // Update upload summary model
                                if (oUploadSummaryModel) {
                                    oUploadSummaryModel.setProperty("/IsProcessing", false);
                                    oUploadSummaryModel.setProperty("/IsSubmitEnabled", false);
                                }

                                // Show detailed error message
                                let errorMessage = "Error processing file";
                                if (error && error.message) {
                                    errorMessage += ": " + error.message;
                                }

                                this._errorHandler.showError(errorMessage);

                                // Clear the file uploader
                                oFileUploader.clear();
                            })
                            .finally(() => {
                                BusyIndicator.hide();
                            });
                    }, 100);

                } catch (error) {
                    console.error("Error handling file upload:", error);
                    BusyIndicator.hide();

                    // Update upload summary model in case of error
                    const oUploadSummaryModel = this._modelManager && this._modelManager.getModel("uploadSummary");
                    if (oUploadSummaryModel) {
                        oUploadSummaryModel.setProperty("/IsProcessing", false);
                        oUploadSummaryModel.setProperty("/IsSubmitEnabled", false);
                    }

                    this._errorHandler.showError("File upload failed: " + error.message);

                    // Clear the file uploader
                    const oFileUploader = oEvent.getSource();
                    if (oFileUploader && oFileUploader.clear) {
                        oFileUploader.clear();
                    }
                }
            },

            /**
             * Create material documents from uploaded Excel data
             */
            onCreateMaterialDocument: function () {
                try {
                    // Get model data using ModelManager
                    const oModel = this._modelManager.getModel("materialDocuments");
                    const uploadSummaryModel = this._modelManager.getModel("uploadSummary");
                    const oData = oModel.getData();

                    // Check for entries
                    if (!oData.entries || oData.entries.length === 0) {
                        this._errorHandler.showError("No valid material documents to submit.");
                        return;
                    }

                    // Confirm submission
                    this._errorHandler.showConfirmation(
                        `You are about to submit ${oData.entries.length} material documents. Continue?`,
                        "Confirm Submission",
                        () => {
                            // Update UI state
                            uploadSummaryModel.setProperty("/HasBeenSubmitted", true);
                            uploadSummaryModel.setProperty("/isSubmitting", true);

                            // Submit material documents
                            this._submitMaterialDocuments(oData.entries);
                        }
                    );
                } catch (error) {
                    console.error("Error in GRN creation:", error);
                    this._errorHandler.showError("Failed to prepare submission: " + error.message);
                }
            },

            /**
             * Submit material documents in batches
             * @param {Array} materialDocuments - Array of material documents to submit
             * @private
             */
            _submitMaterialDocuments: function (materialDocuments) {
                try {
                    if (!materialDocuments || materialDocuments.length === 0) {
                        this._errorHandler.showError("No material documents to process");
                        return;
                    }

                    // Set batch size - can be adjusted based on system performance
                    const batchSize = 10;

                    // Start batch processing using the BatchProcessingManager
                    this._batchProcessingManager.startBatchProcessing(
                        materialDocuments,
                        // Use the OData batch processor function instead of local function
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
                                "Error processing material documents: " +
                                (error.message || "Unknown error")
                            );
                        });
                } catch (error) {
                    console.error("Error submitting material documents:", error);
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
            * Export all material documents to Excel
            */
            onExportToExcel: function () {
                try {
                    const oModel = this._modelManager.getModel("materialDocuments");
                    const aData = oModel.getData().entries || [];

                    if (aData.length === 0) {
                        this._errorHandler.showError("No data available to export.");
                        return;
                    }

                    this._exportManager.exportToExcel(
                        aData,
                        "Material_Documents_Upload_Log_Report.xlsx"
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
                // ... validation logic ...
                const validationErrors = []; // Populate with errors found
                if (validationErrors.length > 0) {
                    this._uiManager.handleValidationErrors(validationErrors);

                    // Also show stats
                    const total = aEntries.length;
                    const failed = validationErrors.length; // Approximation, might need more precise count
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
                // Assuming results = { successEntries: [...], failedEntries: [...] }
                if (results.failedEntries.length === 0 && results.successEntries.length > 0) {
                    this._uiManager.showSuccessWithDocuments(results.successEntries);
                } else if (results.failedEntries.length > 0 && results.successEntries.length > 0) {
                    this._uiManager.showPartialSuccessWithDocuments(results.successEntries, results.failedEntries);
                } else if (results.failedEntries.length > 0) {
                    this._uiManager.showErrorWithDetails(results.failedEntries);
                } else {
                    this._errorHandler.showWarning("Submission complete, but no results reported.");
                }

                // Update batch display if used
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
                    const oEntry = oItem.getBindingContext("materialDocuments").getObject();
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

                    const oEntry = oItem.getBindingContext("materialDocuments").getObject();
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
                    this._uiManager.closeDialog("validationErrorsDialog", true); // Close and destroy
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
                // Traverse up to find the Dialog control
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
                    // Close and destroy the dialog after export attempt
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
                    // Close WITHOUT destroying to allow reuse
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