sap.ui.define(
  [
    "fixedassetacquisition/controller/BaseFilterController",
    "sap/ui/model/json/JSONModel",
    "sap/ui/model/odata/v2/ODataModel", // Note: ODataService uses v4, ensure consistency or correct model type
    "sap/m/MessageBox",
    "sap/ui/core/BusyIndicator",
    "sap/m/MessageToast",
    "sap/m/Dialog",
    "fixedassetacquisition/model/models",
    "sap/ui/core/Fragment",
    "fixedassetacquisition/service/BatchProcessingManager",
    "fixedassetacquisition/service/ExcelProcessor",
    "fixedassetacquisition/service/ValidationManager",
    "fixedassetacquisition/service/ExportManager",
    "fixedassetacquisition/service/ODataService",
    "fixedassetacquisition/service/UIManager",
    "fixedassetacquisition/service/UserService",
    "fixedassetacquisition/utils/DataTransformer",
    "fixedassetacquisition/utils/ErrorHandler",
    "fixedassetacquisition/model/ModelManager"
  ],
  function (
    BaseFilterController,
    JSONModel,
    ODataModel, // Check if this should be v4.ODataModel based on ODataService
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

    return BaseFilterController.extend("fixedassetacquisition.controller.FixedAssetAcquisition", {
      /**
       * Called when the controller is instantiated.
       * Initializes services and models.
       */
      onInit: function () {
        try {
          console.log("Initializing FixedAssetAcquisition controller");
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
          // IMPORTANT: Check if you are using OData V2 or V4.
          // The ODataService provided earlier uses V4 syntax (bindList, context.created).
          // Ensure the model fetched here matches the version used by ODataService.
          // If ODataService uses V4, fetch the V4 model:
          // const odataModel = this.getOwnerComponent().getModel(); // Assuming default model is V4
          // If ODataService uses V2, fetch the V2 model:
          const odataModel = this.getOwnerComponent().getModel(); // Or specify model name if needed
          // Make sure the 'ODataModel' import matches the version used.

          if (!odataModel) {
            throw new Error("OData model is not initialized in Component.js");
          }
          // Log the model type for verification
          console.log("OData Model Type:", odataModel.getMetadata().getName());

          // Instantiate core utility and service classes
          const errorHandler = new ErrorHandler(); // Handles user messages and errors
          const dataTransformer = new DataTransformer(); // Handles data transformations
          const controller = this; // Reference to the current controller instance

          // Model Manager: Handles application's JSON models
          const modelManager = new ModelManager(controller);
          this._modelManager = modelManager;
          modelManager.initializeModels(); // Setup initial models (e.g., fixedAssetEntries, uploadSummary)

          // Load user info asynchronously
          const baseUrl = this.getBaseURL();
          modelManager.loadUserInfo(baseUrl);

          // OData Service: Interacts with the backend OData service
          // Ensure ODataService.create is compatible with the odataModel version
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

          // Batch Processing Manager: Manages sequential processing of records
          const batchProcessingManager = new BatchProcessingManager({
            controller: controller,
            uiManager: uiManager, // <-- ADDED THIS LINE
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
          this._batchProcessingManager = batchProcessingManager;

          console.log("Services initialized successfully", {
            oDataServiceUrl: odataModel.sServiceUrl || odataModel.getServiceUrl() // Adjust based on V2/V4
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
            this._modelManager.resetModels(); // Reset relevant JSON models
            this._errorHandler.showSuccess("Form has been reset"); // Notify user
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
       * Initiates the creation of Fixed Asset Acquisitions based on uploaded data.
       * Retrieves data, performs checks, confirms with the user, and starts submission.
       */
      onCreateFixedAssetDocument: function () {
        try {
          // Get the model containing the data parsed from the Excel file
          const oModel = this._modelManager.getModel("fixedAssetEntries");
          if (!oModel) {
            // This should ideally not happen if initialization is correct
            throw new Error("Internal Error: Fixed Asset Entries model not found");
          }

          // Get the model for managing UI state related to upload/submission
          const uploadSummaryModel = this._modelManager.getModel("uploadSummary");
          if (!uploadSummaryModel) {
            // This should ideally not happen
            throw new Error("Internal Error: Upload Summary model not found");
          }

          const oData = oModel.getData();

          // Validate if there are entries to submit
          if (!oData || !oData.entries || oData.entries.length === 0) {
            this._errorHandler.showError("No valid Fixed Asset Acquisitions to submit. Please upload a file first.");
            return;
          }

          // Confirm submission with the user
          const numberOfEntries = oData.entries.length;
          this._errorHandler.showConfirmation(
            `You are about to submit ${numberOfEntries} Fixed Asset Acquisitions(s). Continue?`,
            "Confirm Submission",
            () => { // Callback function executed if user confirms
              // Update UI state to indicate submission is in progress
              uploadSummaryModel.setProperty("/HasBeenSubmitted", true); // Mark as submitted
              uploadSummaryModel.setProperty("/isSubmitting", true);     // Show busy state/indicator

              // Start the actual submission process
              this._submitFixedAssetDocuments(oData.entries);
            }
          );
        } catch (error) {
          // Handle errors during the preparation phase
          console.error("Error preparing Fixed Asset Acquisitions creation:", error);
          this._errorHandler.showError("Failed to prepare submission: " + error.message);
          // Ensure submitting state is reset if an error occurs before processing starts
          const uploadSummaryModel = this._modelManager.getModel("uploadSummary");
          if (uploadSummaryModel) {
            uploadSummaryModel.setProperty("/isSubmitting", false);
          }
        }
      },
      // Add this date formatter function to your FixedAssetAcquisition.controller.js file
      // Insert this method inside the controller definition after the onRefreshTable method

      /**
       * Formats a date string to a more readable format
       * @param {string} sDate - The date string to format
       * @returns {string} Formatted date string
       */
      formatDate: function (sDate) {
        if (!sDate) {
          return "";
        }

        try {
          // Handle different date formats that might come from Excel/Backend
          let dateObject;

          // Check if the date is already a JavaScript Date object
          if (sDate instanceof Date) {
            dateObject = sDate;
          }
          // Handle ISO string format (YYYY-MM-DD)
          else if (typeof sDate === 'string' && sDate.includes('-')) {
            dateObject = new Date(sDate);
          }
          // Handle other string formats
          else {
            dateObject = new Date(sDate);
          }

          // Check if the date is valid
          if (isNaN(dateObject.getTime())) {
            return sDate; // Return original string if invalid
          }

          // Format using UI5 DateFormat
          const oDateFormat = sap.ui.core.format.DateFormat.getDateInstance({
            pattern: "dd.MM.yyyy"
          });

          return oDateFormat.format(dateObject);
        } catch (error) {
          console.error("Error formatting date:", error);
          return sDate; // Return original string on error
        }
      },
      /**
       * Submits Fixed Asset Acquisitions sequentially (one record at a time) using the BatchProcessingManager.
       * Handles the entire lifecycle including progress display and final results.
       * @param {Array} fixedAssetDocuments - Array of Fixed Asset Acquisitions to submit.
       * @private
       */
      _submitFixedAssetDocuments: function (fixedAssetDocuments) {
        try {
          // Basic check for data
          if (!fixedAssetDocuments || fixedAssetDocuments.length === 0) {
            this._errorHandler.showError("No Fixed Asset Acquisitions to process.");
            // Ensure submitting state is reset
            const uploadSummaryModel = this._modelManager.getModel("uploadSummary");
            if (uploadSummaryModel) uploadSummaryModel.setProperty("/isSubmitting", false);
            return;
          }

          // Ensure required services are available
          if (!this._batchProcessingManager) {
            throw new Error("Batch processing manager is not initialized.");
          }
          if (!this._oDataService || typeof this._oDataService.processSingleFixedAssetAcquisition !== 'function') {
            throw new Error("OData service or required method 'processSingleFixedAssetAcquisition' is not properly initialized.");
          }

          // 1. Initialize the batch processing UI (dialog, progress model)
          this._batchProcessingManager.initBatchProcessing(fixedAssetDocuments.length)
            .then((oDialog) => { // Promise resolves with the processing dialog instance
              if (!oDialog) {
                // Should not happen if initBatchProcessing is implemented correctly
                throw new Error("Failed to initialize processing dialog.");
              }

              // 2. Define the function to process a single record SAFELY
              // This function wraps the actual OData call and ensures it ALWAYS resolves,
              // returning success/failure status and data/error details.
              const processRecordSafely = (record, index) => {
                console.log(`DEBUG (Controller): processRecordSafely called for index ${index}`);
                // Add index to record if not present, useful for tracking
                if (record && typeof record._originalIndex === 'undefined') {
                  record._originalIndex = index;
                }
                return new Promise((resolve) => { // IMPORTANT: This promise always resolves

                  // *** SIMULATION BLOCK REMOVED ***

                  console.log(`DEBUG (Controller): Calling ODataService for index ${index}`);
                  this._oDataService.processSingleFixedAssetAcquisition(record)
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
                        // *** ADDED TRY-CATCH AROUND ERROR EXTRACTION ***
                        console.log(`DEBUG (Controller): Attempting to extract error details for index ${index}`);
                        extractedError = this._errorHandler.extractODataError(error);
                        console.log(`DEBUG (Controller): Error details extracted successfully for index ${index}`);
                      } catch (extractionError) {
                        console.error(`DEBUG (Controller): CRITICAL - Error during this._errorHandler.extractODataError for index ${index}:`, extractionError);
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

              // 3. Start the sequential processing using the BatchProcessingManager
              // Pass the data array and the safe processing function.
              console.log("DEBUG (Controller): Calling BatchProcessingManager.startBatchProcessing");
              return this._batchProcessingManager.startBatchProcessing(
                fixedAssetDocuments,
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
              this._responseData = this._batchProcessingManager.getResponseData();

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
              if (this._batchProcessingManager) {
                this._batchProcessingManager.closeBatchProcessingDialog();
              }
            });
        } catch (error) {
          // Catch synchronous errors in the _submitFixedAssetDocuments function itself
          console.error("Error submitting Fixed Asset Acquisitions:", error);
          this._errorHandler.showError("Submission failed: " + error.message);

          // Ensure submitting state is reset
          const uploadSummaryModel = this._modelManager.getModel("uploadSummary");
          if (uploadSummaryModel) {
            uploadSummaryModel.setProperty("/isSubmitting", false);
          }
          // Close the dialog if it exists and an error occurred
          if (this._batchProcessingManager) {
            this._batchProcessingManager.closeBatchProcessingDialog();
          }
        }
      },
      onRefreshUI: function () {
        if (this._batchProcessor) {
          this._batchProcessor._updateBatchDisplay({
            status: "Processing...",
            processedEntries: this._batchProcessor.responseData.processedCount
          });
        }
      },
      /**
       * Handles the press event for export buttons (likely within the batch processing dialog).
       * Determines the format and type of export requested and delegates to ExportManager.
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
          const resultsToExport = this._batchProcessingManager.getResponseData(); // Use the method to get results

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
       * Exports the currently displayed Fixed Asset Acquisitions (before submission) to Excel.
       * Likely used for exporting the parsed data from the uploaded file.
       */
      onExportToExcel: function () {
        try {
          // Get the data from the model holding the parsed Excel entries
          const oModel = this._modelManager.getModel("fixedAssetEntries"); // Assuming this holds the pre-submission data
          const aData = oModel ? (oModel.getData().entries || []) : [];

          if (aData.length === 0) {
            this._errorHandler.showWarning("No data available to export. Please upload a file first.");
            return;
          }

          // Use ExportManager to perform the export
          this._exportManager.exportToExcel(
            aData, // The array of data objects
            "Fixed_Asset_Documents_Upload_Log_Report.xlsx" // Desired filename
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
       * Placeholder/Example: Validates entries (potentially before submission).
       * This seems like it might be part of the ExcelProcessor's responsibility now.
       * @param {Array} aEntries - Array of entries to validate.
       */
      onValidateEntries: function (aEntries) {
        // This function seems misplaced here. Validation is typically done
        // by ExcelProcessor upon file upload or potentially by ValidationManager explicitly.
        // If needed, call the ValidationManager here.
        console.warn("onValidateEntries called - consider moving validation logic to ExcelProcessor or ValidationManager.");

        if (!this._validationManager) {
          this._errorHandler.showError("Validation service not available.");
          return;
        }
        if (!aEntries || aEntries.length === 0) {
          // Get entries from model if not passed
          const oModel = this._modelManager.getModel("fixedAssetEntries");
          aEntries = oModel ? (oModel.getData().entries || []) : [];
          if (aEntries.length === 0) {
            this._errorHandler.showWarning("No entries found to validate.");
            return;
          }
        }
        this._errorHandler.showInfo("Validation logic needs refinement based on ValidationManager implementation.");
      },


      /**
       * Placeholder/Example: Handles the completion of submission.
       * This logic is now largely handled within the .then() block of _submitFixedAssetDocuments
       * and the BatchProcessingManager's completion handling.
       * @param {Object} results - Object containing success/failed entries.
       */
      onSubmitComplete: function (results) {
        // This function is likely redundant. The main submission flow handles completion.
        // Results display is managed by the BatchProcessingManager dialog and final messages.
        console.warn("onSubmitComplete called - this logic is likely handled elsewhere now.");
      },


      /**
       * Handles the download template button press.
       * Delegates the download action to the ExportManager.
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
       * Delegates showing the help dialog to the UIManager.
       */
      onShowHelp: function () {
        try {
          if (!this._uiManager) {
            throw new Error("UI Manager service not available.");
          }
          // Delegate showing help dialog to UIManager
          this._uiManager.showHelpDialog(this); // Pass controller context if needed by the dialog
        } catch (error) {
          console.error("Error showing help dialog:", error);
          this._errorHandler.showError("Could not display help: " + error.message);
        }
      },

      /**
       * Handles pressing an item in a list/table (e.g., the list of uploaded entries).
       * Delegates showing item details to the UIManager.
       * @param {sap.ui.base.Event} oEvent - The item press event
       */
      onItemPress: function (oEvent) {
        try {
          if (!this._uiManager) {
            throw new Error("UI Manager service not available.");
          }
          const oItem = oEvent.getSource();
          // Ensure binding context exists and get the corresponding data object
          // Use the correct model name where the list items are bound
          const oBindingContext = oItem.getBindingContext("fixedAssetEntries"); // Or "uploadSummary", "fixedAssetDocuments" etc.
          if (!oBindingContext) {
            console.error("Could not find binding context for the pressed item. Model 'fixedAssetEntries'?", oItem);
            this._errorHandler.showError("Could not retrieve item data.");
            return;
          }
          const oEntry = oBindingContext.getObject();
          // Delegate showing details dialog to UIManager
          this._uiManager.showEntryDetailsDialog(oEntry);
        } catch (error) {
          console.error("Error showing item details:", error);
          this._errorHandler.showError("Could not display item details: " + error.message);
        }
      },


      /**
       * Handles viewing entry details, potentially triggered from different UI elements.
       * Delegates showing item details to the UIManager.
       * @param {sap.ui.base.Event|Object} oEvent - The event or item object
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
       * Handler for closing the Validation Errors Dialog. Delegates to UIManager.
       */
      onValidationDialogClose: function () {
        if (this._uiManager) {
          // Assumes UIManager manages dialog instances by name/ID
          this._uiManager.closeDialog("validationErrorsDialog", true); // true = destroy on close
        } else {
          console.error("onValidationDialogClose: UIManager instance not found on controller.");
        }
      },

      /**
       * Handler for exporting errors from the Validation Errors Dialog. Delegates to UIManager.
       * @param {sap.ui.base.Event} oEvent - The event object from the export button.
       */
      onExportValidationErrors: function (oEvent) {
        if (!this._uiManager || !this._errorHandler) {
          console.error("onExportValidationErrors: UIManager or ErrorHandler not found on controller.");
          if (this._errorHandler) {
            this._errorHandler.showError("Cannot export errors due to an internal issue.");
          }
          return;
        }

        // Find the parent Dialog control
        let oButton = oEvent.getSource();
        // Use UIManager helper if available, otherwise traverse manually
        let oDialog = this._uiManager.findParentDialog ? this._uiManager.findParentDialog(oButton) : null;
        if (!oDialog) {
          let parent = oButton.getParent();
          while (parent && !(parent instanceof Dialog)) {
            parent = parent.getParent();
          }
          oDialog = parent;
        }


        if (oDialog) {
          // Get the data model attached to the dialog (assuming UIManager sets it)
          const oModel = oDialog.getModel("validation"); // Assuming model name is 'validation'
          if (oModel) {
            // Retrieve the raw error data stored in the model (adjust path as needed)
            const groupedErrorsData = oModel.getProperty("/_rawGroupedData"); // Example path
            if (groupedErrorsData) {
              // Delegate export task to UIManager or ExportManager
              // Assuming UIManager has this method for consistency
              this._uiManager.exportValidationErrors(groupedErrorsData);
            } else {
              console.error("Raw grouped data not found in validation model for export.");
              this._errorHandler.showError("Could not retrieve errors for export.");
            }
          } else {
            console.error("Validation model not found on dialog for export.");
            this._errorHandler.showError("Could not retrieve model data for export.");
          }
          // Optionally close the dialog after export
          // this._uiManager.closeDialog("validationErrorsDialog", true);
        } else {
          console.error("Could not find parent Dialog control for the export button.");
          this._errorHandler.showError("Operation failed: Could not identify the dialog window for export.");
        }
      },

      /**
       * Handler for closing the Entry Details Dialog. Delegates to UIManager.
       */
      onEntryDetailsDialogClose: function () {
        if (this._uiManager) {
          // Assumes UIManager manages dialog instances by name/ID
          this._uiManager.closeDialog("entryDetailsDialog", false); // false = don't destroy, just close
        } else {
          console.error("onEntryDetailsDialogClose: UIManager instance not found on controller.");
        }
      },

      /**
       * Handler for exporting from the Entry Details Dialog. (Currently not implemented).
       */
      onExportEntryDetails: function () {
        // This feature might not be required or implemented yet.
        if (this._errorHandler) {
          this._errorHandler.showWarning("Export for single entry details is not implemented yet.");
        }
        // If implemented, get data from the dialog's model and call ExportManager.
      },

      /**
       * Handler for closing a generic success dialog. Delegates to UIManager.
       */
      onSuccessDialogClose: function () {
        if (this._uiManager) {
          // Assumes UIManager manages a generic success dialog instance
          this._uiManager.closeSuccessDialog();
        } else {
          console.error("onSuccessDialogClose: UIManager instance not found on controller.");
        }
      },

      /**
       * Handler for closing the batch processing dialog. Delegates to BatchProcessingManager.
       */
      onBatchProcessingDialogClose: function (oEvent) {
        console.log("DEBUG: onBatchProcessingDialogClose handler executed."); // Log entry
        if (this._batchProcessingManager) {
          console.log("DEBUG: Found _batchProcessingManager instance. Calling closeBatchProcessingDialog...");
          try {
            this._batchProcessingManager.closeBatchProcessingDialog();
            console.log("DEBUG: Call to closeBatchProcessingDialog completed.");
          } catch (e) {
            console.error("DEBUG: Error calling closeBatchProcessingDialog:", e);
            if (this._errorHandler) {
              this._errorHandler.showError("Internal error closing the dialog: " + e.message);
            }
          }
        } else {
          console.error("DEBUG: onBatchProcessingDialogClose: BatchProcessingManager instance NOT found on controller.");
          if (this._errorHandler) {
            this._errorHandler.showError("Cannot close dialog: Processing manager not available.");
          }
        }
      },

      /**
       * Handler for cancelling the batch processing. Delegates to BatchProcessingManager.
       */
      onBatchProcessingDialogCancel: function (oEvent) {
        console.log("DEBUG: onBatchProcessingDialogCancel handler executed.");
        if (this._batchProcessingManager) {
          console.log("DEBUG: Found _batchProcessingManager instance. Calling cancelBatchProcessing...");
          this._batchProcessingManager.cancelBatchProcessing();
          // Optionally show a message, though the manager might update the dialog status
          if (this._errorHandler) {
            this._errorHandler.showInfo("Processing cancellation requested.");
          }
        } else {
          console.error("DEBUG: onBatchProcessingDialogCancel: BatchProcessingManager instance NOT found.");
          if (this._errorHandler) {
            this._errorHandler.showError("Cannot cancel processing: Processing manager not available.");
          }
        }
      },


      /**
       * Utility method to get the base URL path for the application.
       * Used for constructing paths to resources like user info service.
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
            // Fallback for older versions (less likely needed)
            // return jQuery.sap.getModulePath(appPath);
            console.warn("sap.ui.require.toUrl not found, using relative path '.' for base URL.");
            return ".";
          }
        } catch (error) {
          console.error("Error getting base URL:", error);
          return "."; // Return a default relative path as fallback
        }
      },

      /**
       * Refreshes the binding of the main items table.
       * Useful if data might have changed externally or after certain operations.
       */
      onRefreshTable: function () {
        try {
          const oTable = this.byId("itemsTable"); // Ensure 'itemsTable' is the correct ID in your view.xml
          if (oTable) {
            const oBinding = oTable.getBinding("items"); // 'items' is the aggregation name
            if (oBinding) {
              oBinding.refresh(true); // true forces refresh even if data is considered up-to-date
              this._errorHandler.showSuccess("Table refreshed.");
            } else {
              console.warn("Could not find 'items' binding on the table 'itemsTable'.");
              this._errorHandler.showWarning("Could not refresh table binding.");
            }
          } else {
            console.warn("Could not find table with ID 'itemsTable'.");
            this._errorHandler.showWarning("Could not find table to refresh.");
          }
        } catch (error) {
          console.error("Error refreshing table:", error);
          this._errorHandler.showError("Could not refresh table: " + error.message);
        }
      }
    });
  }
);
