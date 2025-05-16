sap.ui.define(
    [
        "assetretirementwor/controller/BaseFilterController",
        "sap/ui/model/json/JSONModel",
        "sap/ui/model/odata/v2/ODataModel",
        "sap/m/MessageBox",
        "sap/ui/core/BusyIndicator",
        "sap/m/MessageToast",
        "sap/m/Dialog",
        "assetretirementwor/model/models",
        "sap/ui/core/Fragment",
        "assetretirementwor/service/BatchProcessingManager",
        "assetretirementwor/service/ExcelProcessor",
        "assetretirementwor/service/ValidationManager",
        "assetretirementwor/service/ExportManager",
        "assetretirementwor/service/ODataService",
        "assetretirementwor/service/UIManager",
        "assetretirementwor/service/UserService",
        "assetretirementwor/utils/DataTransformer",
        "assetretirementwor/utils/ErrorHandler",
        "assetretirementwor/model/ModelManager"
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

        return BaseFilterController.extend("assetretirementwor.controller.assetretirementwor", {
            /**
             * Called when the controller is instantiated.
             * Initializes services and models.
             */
            onInit: function () {
                try {
                    console.log("Initializing assetretirement_wor controller");
                    // Initialize core services and managers
                    this._initServices();

                    // Initialize response data structure for storing processing results
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
                    // Show critical error if initialization fails
                    MessageBox.error("Application initialization failed: " + error.message, {
                        title: "Initialization Error"
                    });
                }
            },

            /**
             * Initializes all necessary services and managers for the controller.
             * @private
             */
            _initServices: function () {
                try {
                    const odataModel = this.getOwnerComponent().getModel();

                    if (!odataModel) {
                        throw new Error("OData model is not initialized in Component.js");
                    }
                    // Log the model type for verification
                    console.log("OData Model Type:", odataModel.getMetadata().getName());

                    // Instantiate core utility and service classes
                    const errorHandler = new ErrorHandler();
                    const dataTransformer = new DataTransformer();
                    const controller = this;

                    // Model Manager: Handles application's JSON models
                    const modelManager = new ModelManager(controller);
                    this._modelManager = modelManager;
                    modelManager.initializeModels();

                    // Load user info asynchronously
                    const baseUrl = this.getBaseURL();
                    modelManager.loadUserInfo(baseUrl);

                    // OData Service: Interacts with the backend OData service
                    this._oDataService = ODataService.create({
                        model: odataModel,
                        dataTransformer: dataTransformer,
                        errorHandler: errorHandler
                    });

                    // User Service: Handles user-related information
                    const userService = new UserService({ controller: controller });

                    // Validation Manager: Handles data validation rules
                    const validationManager = new ValidationManager({
                        dataTransformer: dataTransformer,
                        errorHandler: errorHandler
                    });

                    // Export Manager: Handles exporting data (e.g., to Excel)
                    const exportManager = new ExportManager({
                        controller: controller,
                        errorHandler: errorHandler
                    });

                    // UI Manager: Manages UI elements like dialogs and messages
                    const uiManager = new UIManager(controller, errorHandler);

                    // Excel Processor: Handles reading and processing uploaded Excel files
                    const excelProcessor = new ExcelProcessor({
                        controller: controller,
                        dataTransformer: dataTransformer,
                        validationManager: validationManager,
                        errorHandler: errorHandler
                    });

                    // Batch Manager: Manages sequential processing of records
                    const batchManager = new BatchProcessingManager({
                        controller: controller,
                        uiManager: uiManager,
                        errorHandler: errorHandler,
                        dataTransformer: dataTransformer,
                        oDataService: this._oDataService,
                        exportManager: exportManager
                    });

                    // Store instances on the controller for later access
                    this._errorHandler = errorHandler;
                    this._dataTransformer = dataTransformer;
                    this._userService = userService;
                    this._validationManager = validationManager;
                    this._exportManager = exportManager;
                    this._uiManager = uiManager;
                    this._excelProcessor = excelProcessor;
                    this._batchManager = batchManager;

                    console.log("Services initialized successfully", {
                        oDataServiceUrl: odataModel.sServiceUrl || odataModel.getServiceUrl()
                    });
                } catch (error) {
                    console.error("Error initializing services:", error);
                    // Propagate the error to be caught by the onInit's catch block
                    throw error;
                }
            },

            /**
             * Handles the reset button press.
             * Confirms with the user before resetting models.
             */
            onReset: function () {
                this._errorHandler.showConfirmation(
                    "Are you sure you want to reset the form? All unsaved data will be lost.",
                    "Confirm Reset",
                    () => {
                        // Perform the reset action if confirmed
                        this._modelManager.resetModels();
                        this._errorHandler.showSuccess("Form has been reset");
                    }
                );
            },

            /**
             * Handles the file change event from the FileUploader.
             * Validates the file and initiates processing.
             * @param {sap.ui.base.Event} oEvent - The event object
             */
            onFileChange: function (oEvent) {
                try {
                    const oFileUploader = oEvent.getSource();
                    const file = oEvent.getParameter("files")[0]; // Get the selected file

                    // Basic validation: Check if a file was selected
                    if (!file) {
                        this._errorHandler.showError("No file selected. Please choose a file to upload.");
                        return;
                    }

                    // Basic validation: Check file extension
                    if (!file.name.endsWith(".xlsx")) {
                        this._errorHandler.showError("Invalid file type. Please upload an Excel file (.xlsx).");
                        oFileUploader.clear(); // Clear the invalid file from the uploader
                        return;
                    }

                    // Delegate file processing to the ExcelProcessor service
                    this._excelProcessor.processExcelFile(file);

                } catch (error) {
                    // Handle any unexpected errors during file change handling
                    this._errorHandler.showError("Error processing file: " + error.message);
                    console.error("File processing error:", error);
                }
            },

            /**
             * Initiates the creation of Fixed Asset Retirements based on uploaded data.
             * Retrieves data, performs checks, confirms with the user, and starts submission.
             */
            onSubmitRetirements: function () {
                try {
                    // Get the model containing the data parsed from the Excel file
                    const oModel = this._modelManager.getModel("fixedAssetEntries");
                    if (!oModel) {
                        throw new Error("Internal Error: Fixed Asset Entries model not found");
                    }

                    // Get the model for managing UI state related to upload/submission
                    const uploadSummaryModel = this._modelManager.getModel("uploadSummary");
                    if (!uploadSummaryModel) {
                        throw new Error("Internal Error: Upload Summary model not found");
                    }

                    const oData = oModel.getData();

                    // Validate if there are entries to submit
                    if (!oData || !oData.entries || oData.entries.length === 0) {
                        this._errorHandler.showError("No valid Fixed Asset Retirements to submit. Please upload a file first.");
                        return;
                    }

                    // Confirm submission with the user
                    const numberOfEntries = oData.entries.length;
                    this._errorHandler.showConfirmation(
                        `You are about to submit ${numberOfEntries} Fixed Asset Retirement(s). Continue?`,
                        "Confirm Submission",
                        () => { // Callback function executed if user confirms
                            // Update UI state to indicate submission is in progress
                            uploadSummaryModel.setProperty("/HasBeenSubmitted", true);
                            uploadSummaryModel.setProperty("/isSubmitting", true);

                            // Start the actual submission process
                            this._submitFixedAssetRetirements(oData.entries);
                        }
                    );
                } catch (error) {
                    // Handle errors during the preparation phase
                    console.error("Error preparing Fixed Asset Retirements creation:", error);
                    this._errorHandler.showError("Failed to prepare submission: " + error.message);
                    // Ensure submitting state is reset if an error occurs before processing starts
                    const uploadSummaryModel = this._modelManager.getModel("uploadSummary");
                    if (uploadSummaryModel) {
                        uploadSummaryModel.setProperty("/isSubmitting", false);
                    }
                }
            },

            /**
             * Submits Fixed Asset Retirements sequentially using the BatchProcessingManager.
             * Handles the entire lifecycle including progress display and final results.
             * @param {Array} fixedAssetRetirements - Array of Fixed Asset Retirements to submit.
             * @private
             */
            _submitFixedAssetRetirements: function (fixedAssetRetirements) {
                try {
                    // Basic check for data
                    if (!fixedAssetRetirements || fixedAssetRetirements.length === 0) {
                        this._errorHandler.showError("No Fixed Asset Retirements to process.");
                        // Ensure submitting state is reset
                        const uploadSummaryModel = this._modelManager.getModel("uploadSummary");
                        if (uploadSummaryModel) uploadSummaryModel.setProperty("/isSubmitting", false);
                        return;
                    }

                    // Ensure required services are available
                    if (!this._batchManager) {
                        throw new Error("Batch manager is not initialized.");
                    }
                    if (!this._oDataService || typeof this._oDataService.processSingleFixedAssetRetirement !== 'function') {
                        throw new Error("OData service or required method 'processSingleFixedAssetRetirement' is not properly initialized.");
                    }

                    // 1. Initialize the batch processing UI (dialog, progress model)
                    this._batchManager.initBatchProcessing(fixedAssetRetirements.length)
                        .then((oDialog) => { // Promise resolves with the processing dialog instance
                            if (!oDialog) {
                                throw new Error("Failed to initialize processing dialog.");
                            }

                            // 2. Define the function to process a single record SAFELY
                            const processRecordSafely = (record, index) => {
                                console.log(`DEBUG (Controller): processRecordSafely called for index ${index}`);
                                // Add index to record if not present, useful for tracking
                                if (record && typeof record._originalIndex === 'undefined') {
                                    record._originalIndex = index;
                                }
                                return new Promise((resolve) => { // IMPORTANT: This promise always resolves

                                    console.log(`DEBUG (Controller): Calling ODataService for index ${index}`);
                                    this._oDataService.processSingleFixedAssetRetirement(record)
                                        .then(result => {
                                            console.log(`DEBUG (Controller): ODataService resolved for index ${index}. Success: ${result.success}`);
                                            // OData call was successful (business success or failure reported by backend)
                                            resolve({ // Resolve with detailed result object
                                                success: result.success, // Boolean indicating business success
                                                response: result.response, // Response data from backend
                                                error: result.error,       // Business error message (if success=false)
                                                errorCode: result.errorCode, // Business error code (if success=false)
                                                details: result.details,   // Additional details from backend
                                                originalInput: record      // Include the original input record
                                            });
                                        })
                                        .catch(error => {
                                            // OData call FAILED or ODataService promise was rejected unexpectedly
                                            console.error(`DEBUG (Controller): ODataService promise rejected or caught error for index ${index}:`, error);
                                            let extractedError = { // Default error structure
                                                message: "Unknown processing error",
                                                code: "PROCESSING_ERROR",
                                                details: error
                                            };
                                            try {
                                                console.log(`DEBUG (Controller): Attempting to extract error details for index ${index}`);
                                                extractedError = this._errorHandler.extractODataError(error);
                                                console.log(`DEBUG (Controller): Error details extracted successfully for index ${index}`);
                                            } catch (extractionError) {
                                                console.error(`DEBUG (Controller): CRITICAL - Error during extractODataError for index ${index}:`, extractionError);
                                                // Use the original error if extraction fails
                                                extractedError = {
                                                    message: error?.message || "Processing error & failed to extract details",
                                                    code: "EXTRACTION_ERROR",
                                                    details: { originalError: error, extractionError: extractionError }
                                                };
                                            }

                                            resolve({ // Resolve with error information
                                                success: false,
                                                error: extractedError.message,
                                                errorCode: extractedError.code,
                                                details: extractedError.details,
                                                originalInput: record
                                            });
                                        });
                                }); // End of new Promise
                            }; // End of processRecordSafely

                            // 3. Start the sequential processing using the BatchManager
                            console.log("DEBUG (Controller): Calling BatchManager.startBatchProcessing");
                            return this._batchManager.startBatchProcessing(
                                fixedAssetRetirements,
                                processRecordSafely, // Use the safe wrapper function
                                {
                                    processingDelay: 100, // Optional: Delay in ms between processing each record
                                    continueOnError: true // This is handled by processRecordSafely always resolving
                                }
                            );
                        })
                        .then((result) => { // Promise resolves when ALL records have been processed
                            console.log("Sequential processing complete. Final results:", result);

                            // Store the final aggregated response data on the controller
                            this._responseData = this._batchManager.getResponseData();

                            // Update UI state: processing finished
                            const uploadSummaryModel = this._modelManager.getModel("uploadSummary");
                            if (uploadSummaryModel) {
                                uploadSummaryModel.setProperty("/isSubmitting", false);
                            }

                            // Display summary message based on the results
                            if (result.failureCount > 0) {
                                if (result.successCount > 0) {
                                    this._errorHandler.showWarning(
                                        `Processing finished. ${result.successCount} succeeded, ${result.failureCount} failed. ` +
                                        `Check the processing dialog or export results for details.`
                                    );
                                } else {
                                    this._errorHandler.showError(
                                        `Processing failed for all ${result.failureCount} records. ` +
                                        `Check the processing dialog or export results for details.`
                                    );
                                }
                            } else {
                                this._errorHandler.showSuccess(
                                    `Successfully processed all ${result.successCount} entries.`
                                );
                            }
                        })
                        .catch((error) => {
                            // Handle errors during the SETUP of processing (e.g., dialog loading failed)
                            console.error("Error during processing setup or execution:", error);
                            this._errorHandler.showError(
                                "Error during document processing: " + (error.message || "Unknown error")
                            );

                            // Ensure submitting state is reset even on setup errors
                            const uploadSummaryModel = this._modelManager.getModel("uploadSummary");
                            if (uploadSummaryModel) {
                                uploadSummaryModel.setProperty("/isSubmitting", false);
                            }
                            // Close the dialog if it exists and an error occurred during setup/start
                            if (this._batchManager) {
                                this._batchManager.closeBatchProcessingDialog();
                            }
                        });
                } catch (error) {
                    // Catch synchronous errors in the _submitFixedAssetRetirements function itself
                    console.error("Error submitting Fixed Asset Retirements:", error);
                    this._errorHandler.showError("Submission failed: " + error.message);

                    // Ensure submitting state is reset
                    const uploadSummaryModel = this._modelManager.getModel("uploadSummary");
                    if (uploadSummaryModel) {
                        uploadSummaryModel.setProperty("/isSubmitting", false);
                    }
                    // Close the dialog if it exists and an error occurred
                    if (this._batchManager) {
                        this._batchManager.closeBatchProcessingDialog();
                    }
                }
            },

            /**
             * Updates the UI to reflect current processing status
             */
            onRefreshUI: function () {
                if (this._batchManager) {
                    this._batchManager._updateBatchDisplay({
                        status: "Processing...",
                        processedEntries: this._batchManager.responseData.processedCount
                    });
                }
            },

            /**
             * Handles the press event for export buttons
             * @param {sap.ui.base.Event} oEvent - The event object
             */
            onExportPress: function (oEvent) {
                try {
                    // Default export settings
                    let format = "xlsx"; // Default format
                    let type = "all";    // Default type (all, success, error)

                    // Read custom data attributes from the pressed button to determine format/type
                    const source = oEvent.getSource();
                    if (source && source.getCustomData) {
                        const customData = source.getCustomData();
                        customData.forEach(data => {
                            if (data.getKey() === "format") {
                                format = data.getValue().toLowerCase();
                            } else if (data.getKey() === "type") {
                                type = data.getValue();
                            }
                        });
                    }

                    // Get the data to be exported (results from the batch processing)
                    const resultsToExport = this._batchManager.getResponseData();

                    if (!resultsToExport || (resultsToExport.successRecords.length === 0 && resultsToExport.errorRecords.length === 0)) {
                        this._errorHandler.showWarning("No processing results available to export.");
                        return;
                    }

                    // Delegate the export task to the ExportManager
                    this._exportManager.exportBatchResults(resultsToExport, type, format)
                        .then(() => {
                            this._errorHandler.showSuccess(`Export of ${type} results completed successfully.`);
                        })
                        .catch(error => {
                            console.error(`Export failed for type "${type}", format "${format}":`, error);
                            this._errorHandler.showError("Export failed: " + error.message);
                        });
                } catch (error) {
                    console.error("Error in export process:", error);
                    this._errorHandler.showError("Export failed: " + error.message);
                }
            },

            /**
             * Exports the currently displayed Fixed Asset Retirements to Excel
             */
            onExportToExcel: function () {
                try {
                    // Get the data from the model holding the parsed Excel entries
                    const oModel = this._modelManager.getModel("fixedAssetEntries");
                    const aData = oModel ? (oModel.getData().entries || []) : [];

                    if (aData.length === 0) {
                        this._errorHandler.showWarning("No data available to export. Please upload a file first.");
                        return;
                    }

                    // Use ExportManager to perform the export
                    this._exportManager.exportToExcel(
                        aData,
                        "Fixed_Asset_Retirement_Upload_Log_Report.xlsx"
                    )
                        .then(() => {
                            this._errorHandler.showSuccess("Data export to Excel completed successfully.");
                        })
                        .catch(error => {
                            console.error("Export to Excel failed:", error);
                            this._errorHandler.showError("Export failed: " + error.message);
                        });
                } catch (error) {
                    console.error("Error exporting to Excel:", error);
                    this._errorHandler.showError("Export failed: " + error.message);
                }
            },

            /**
             * Handles the download template button press.
             */
            onDownloadTemplate: function () {
                try {
                    if (!this._exportManager) {
                        throw new Error("Export Manager service not available.");
                    }
                    // Delegate template download to ExportManager
                    this._exportManager.downloadTemplate()
                        .then(() => {
                            this._errorHandler.showSuccess("Template download started successfully.");
                        })
                        .catch(error => {
                            console.error("Template download failed:", error);
                            this._errorHandler.showError("Template download failed: " + error.message);
                        });
                } catch (error) {
                    console.error("Error downloading template:", error);
                    this._errorHandler.showError("Template download failed: " + error.message);
                }
            },

            /**
             * Handles the show help button press.
             */
            onShowHelp: function () {
                try {
                    if (!this._uiManager) {
                        throw new Error("UI Manager service not available.");
                    }
                    // Delegate showing help dialog to UIManager
                    this._uiManager.showHelpDialog(this);
                } catch (error) {
                    console.error("Error showing help dialog:", error);
                    this._errorHandler.showError("Could not display help: " + error.message);
                }
            },

            /**
             * Handles row selection in the table
             * @param {sap.ui.base.Event} oEvent - The event object
             */
            onRowPress: function (oEvent) {
                try {
                    if (!this._uiManager) {
                        throw new Error("UI Manager service not available.");
                    }

                    const oItem = oEvent.getSource();
                    const oBindingContext = oItem.getBindingContext("fixedAssetEntries");

                    if (!oBindingContext) {
                        console.error("Could not find binding context for the pressed item");
                        this._errorHandler.showError("Could not retrieve item data.");
                        return;
                    }

                    const oEntry = oBindingContext.getObject();
                    this._uiManager.showEntryDetailsDialog(oEntry);
                } catch (error) {
                    console.error("Error showing item details:", error);
                    this._errorHandler.showError("Could not display item details: " + error.message);
                }
            },

            /**
             * Handles viewing entry details from a button click
             * @param {sap.ui.base.Event} oEvent - The event object
             */
            onViewEntryDetails: function (oEvent) {
                var oButton = oEvent.getSource();
                var oBindingContext = oButton.getBindingContext("fixedAssetEntries");

                if (!oBindingContext) {
                    sap.m.MessageToast.show("No entry context available");
                    return;
                }

                var oEntryData = oBindingContext.getObject();

                // Use the UIManager's showEntryDetailsDialog method
                if (this._uiManager && typeof this._uiManager.showEntryDetailsDialog === 'function') {
                    this._uiManager.showEntryDetailsDialog(oEntryData);
                } else {
                    // Fallback error handling
                    this._errorHandler.showError("UIManager not properly initialized for entry details view.");
                }
            },
            /**
             * Handler for closing the Entry Details Dialog. Delegates to UIManager.
             */
            onEntryDetailsDialogClose: function () {
                try {

                    if (this._uiManager) {
                        console.log("Closing dialog using UIManager");
                        this._uiManager.closeDialog("entryDetailsDialog", true);
                    }

                } catch (error) {
                    console.error("Error in onEntryDetailsDialogClose:", error);

                    // Fallback error handling
                    if (this._entryDetailsDialog) {
                        try {
                            this._entryDetailsDialog.close();
                        } catch (closeError) {
                            console.error("Failed to close dialog:", closeError);
                        }
                    }
                }
            },
            /**
             * Handler for closing the Validation Errors Dialog
             */
            onErrorDialogClose: function () {
                if (this._uiManager) {
                    this._uiManager.closeDialog("validationErrorsDialog", true);
                } else {
                    console.error("onErrorDialogClose: UIManager instance not found on controller.");
                }
            },

            /**
             * Handler for exporting errors from the Validation Errors Dialog
             */
            onExportErrors: function (oEvent) {
                if (!this._uiManager || !this._errorHandler) {
                    console.error("onExportErrors: UIManager or ErrorHandler not found on controller.");
                    if (this._errorHandler) {
                        this._errorHandler.showError("Cannot export errors due to an internal issue.");
                    }
                    return;
                }

                // Find the parent Dialog control
                let oButton = oEvent.getSource();
                let oDialog = this._uiManager.findParentDialog ? this._uiManager.findParentDialog(oButton) : null;

                if (!oDialog) {
                    let parent = oButton.getParent();
                    while (parent && !(parent instanceof Dialog)) {
                        parent = parent.getParent();
                    }
                    oDialog = parent;
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
                } else {
                    console.error("Could not find parent Dialog control for the export button.");
                    this._errorHandler.showError("Operation failed: Could not identify the dialog window for export.");
                }
            },

            /**
             * Handler for closing the Entry Details Dialog
             */
            onEntryDetailsClose: function () {
                if (this._uiManager) {
                    this._uiManager.closeDialog("entryDetailsDialog", false);
                } else {
                    console.error("onEntryDetailsClose: UIManager instance not found on controller.");
                }
            },

            /**
             * Handler for closing a success dialog
             */
            onSuccessDialogClose: function () {
                if (this._uiManager) {
                    this._uiManager.closeDialog("successDialog", true);
                } else {
                    console.error("onSuccessDialogClose: UIManager instance not found on controller.");
                }
            },

            /**
             * Handler for closing the batch processing dialog
             */
            onBatchProcessingDialogClose: function () {
                console.log("DEBUG: onBatchProcessingDialogClose handler executed.");
                if (this._batchManager) {
                    console.log("DEBUG: Found _batchManager instance. Calling closeBatchProcessingDialog...");
                    try {
                        this._batchManager.closeBatchProcessingDialog();
                        console.log("DEBUG: Call to closeBatchProcessingDialog completed.");
                    } catch (e) {
                        console.error("DEBUG: Error calling closeBatchProcessingDialog:", e);
                        if (this._errorHandler) {
                            this._errorHandler.showError("Internal error closing the dialog: " + e.message);
                        }
                    }
                } else {
                    console.error("DEBUG: onBatchProcessingDialogClose: BatchManager instance NOT found on controller.");
                    if (this._errorHandler) {
                        this._errorHandler.showError("Cannot close dialog: Processing manager not available.");
                    }
                }
            },

            /**
             * Handler for cancelling the batch processing
             */
            onBatchProcessingDialogCancel: function () {
                console.log("DEBUG: onBatchProcessingDialogCancel handler executed.");
                if (this._batchManager) {
                    console.log("DEBUG: Found _batchManager instance. Calling cancelBatchProcessing...");
                    this._batchManager.cancelBatchProcessing();
                    // Optionally show a message, though the manager might update the dialog status
                    if (this._errorHandler) {
                        this._errorHandler.showInfo("Processing cancellation requested.");
                    }
                } else {
                    console.error("DEBUG: onBatchProcessingDialogCancel: BatchManager instance NOT found.");
                    if (this._errorHandler) {
                        this._errorHandler.showError("Cannot cancel processing: Processing manager not available.");
                    }
                }
            },

            /**
             * Handler for closing the help dialog
             */
            onHelpDialogClose: function () {
                if (this._uiManager) {
                    this._uiManager.closeDialog("helpDialog", false); // false = don't destroy, just close
                } else {
                    console.error("onHelpDialogClose: UIManager instance not found on controller.");
                }
            },

            /**
             * Handler for downloading template from dialog
             */
            onDownloadTemplateLinkPress: function () {
                this.onDownloadTemplate();
            },

            /**
             * Utility method to get the base URL path for the application.
             * @returns {string} Base URL path for the application module.
             */
            getBaseURL: function () {
                try {
                    const appId = this.getOwnerComponent().getManifestEntry("/sap.app/id");
                    const appPath = appId.replaceAll(".", "/");
                    // Ensure sap.ui.require.toUrl is available (modern UI5)
                    if (sap.ui.require && sap.ui.require.toUrl) {
                        return sap.ui.require.toUrl(appPath);
                    } else {
                        // Fallback for older versions
                        console.warn("sap.ui.require.toUrl not found, using relative path '.' for base URL.");
                        return ".";
                    }
                } catch (error) {
                    console.error("Error getting base URL:", error);
                    return "."; // Return a default relative path as fallback
                }
            },

            /**
             * Event handler for validation statistics dialog close
             */
            onValidationStatsDialogClose: function () {
                if (this._uiManager) {
                    this._uiManager.closeDialog("validationStatsDialog", true);
                }
            },

            /**
             * Event handler for failed records dialog close
             */
            onCloseFailedRecordsDialog: function () {
                if (this._uiManager) {
                    this._uiManager.closeDialog("failedRecordsDialog", true);
                }
            },

            /**
             * Export failed records to various formats
             */
            onExportFailedToExcel: function () {
                this._exportFailedRecords("xlsx");
            },

            onExportFailedToCSV: function () {
                this._exportFailedRecords("csv");
            },

            onExportFailedToPDF: function () {
                this._exportFailedRecords("pdf");
            },
        });
    }
);