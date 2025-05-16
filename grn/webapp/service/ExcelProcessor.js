sap.ui.define(
  [
    "sap/m/MessageBox",
    "sap/m/MessageToast",
    "grn/service/ValidationManager",
    "grn/utils/DataTransformer",
    "grn/utils/ErrorHandler"
  ],
  function (MessageBox, MessageToast, ValidationManager, DataTransformer, ErrorHandler) {
    "use strict";

    /**
     * ExcelProcessor
     * Responsible for parsing and processing Excel files for Material Documents
     */
    return class ExcelProcessor {
      /**
       * Constructor with dependency injection
       * @param {Object} options - Configuration options
       */
      constructor(options = {}) {
        this.oController = options.controller;
        this._validationManager = options.validationManager || new ValidationManager();
        this._dataTransformer = options.dataTransformer || new DataTransformer();
        this._errorHandler = options.errorHandler || new ErrorHandler();
      }

      /**
       * Process an Excel file
       * @param {File} file - The Excel file to process
       * @returns {Promise} Promise that resolves with the processed data
       */
      processExcelFile(file) {
        return new Promise((resolve, reject) => {
          const reader = new FileReader();

          reader.onerror = (e) => {
            console.error("FileReader error:", e);
            this._errorHandler.showError("Error reading file. Please try again.");
            reject(e);
          };

          reader.onload = (e) => {
            try {
              if (!window.XLSX) {
                throw new Error("XLSX library not loaded");
              }

              // Show processing message
              this._errorHandler.showSuccess("Processing file...");

              // Parse the file with full options to preserve formatting
              const workbook = window.XLSX.read(e.target.result, {
                type: "array",
                cellDates: true,
                cellText: false,
                cellStyles: true
              });

              // Verify and find the material document sheet
              const sheetInfo = this._findMaterialDocumentSheet(workbook);

              if (!sheetInfo.found) {
                throw new Error(sheetInfo.message);
              }

              // Parse material document sheet
              const parsedData = this._parseMaterialDocumentSheet(
                workbook,
                sheetInfo.sheetName
              );

              // Validate material documents using the ValidationManager
              const validationResult = this._validationManager.validateMaterialDocuments(
                parsedData.entries
              );

              // Update models with ALL material document data, including valid and invalid entries
              this._updateModels(validationResult);

              // Update the UI with processing results
              this._showProcessingResults(validationResult, file.name);

              // Clear the file input field
              this._clearFileUploader();

              // Resolve with the validation result
              resolve(validationResult);
            } catch (error) {
              console.error("Excel Processing Error", error);

              // Show user-friendly error message
              MessageBox.error(`Error processing file: ${file.name}`, {
                details: error.message,
                actions: [MessageBox.Action.CLOSE]
              });

              reject(error);
            }
          };

          reader.readAsArrayBuffer(file);
        });
      }

      /**
       * Find the material document sheet in the workbook
       * @param {Object} workbook - XLSX workbook object
       * @returns {Object} Object with sheet information
       * @private
       */
      _findMaterialDocumentSheet(workbook) {
        // Check for the exact required sheet name
        if (workbook.SheetNames.includes("GRN")) {
          return {
            found: true,
            sheetName: "GRN"
          };
        }

        // Check for variations like case insensitive match or with/without spaces
        const potentialSheetNames = workbook.SheetNames.filter(
          (name) =>
            name.toLowerCase().includes("material") ||
            name.toLowerCase().includes("document") ||
            name.toLowerCase().includes("grn") ||
            name
              .toLowerCase()
              .replace(/\s+/g, "")
              .includes("materialdocuments")
        );

        if (potentialSheetNames.length > 0) {
          // Use the first matching sheet
          return {
            found: true,
            sheetName: potentialSheetNames[0]
          };
        }

        // No suitable sheet found
        return {
          found: false,
          message: `Missing required sheet: Material Documents. Available sheets: ${workbook.SheetNames.join(
            ", "
          )}. Please check your Excel file template or worksheet name.`
        };
      }

      /**
       * Parse and validate material documents from Excel
       * @param {object} workbook - XLSX workbook object
       * @param {string} materialDocSheetName - Name of the material documents sheet
       * @returns {object} - Parsed material documents
       * @private
       */
      _parseMaterialDocumentSheet(workbook, materialDocSheetName) {
        try {
          // Get the material documents sheet
          const materialDocSheet = workbook.Sheets[materialDocSheetName];

          if (!materialDocSheet) {
            throw new Error(
              `Sheet "${materialDocSheetName}" not found in workbook. Available sheets: ${workbook.SheetNames.join(
                ", "
              )}`
            );
          }

          console.group("📄 Detailed Material Document Parsing");
          console.log("Parsing sheet:", materialDocSheetName);

          // Parse sheet to JSON (assuming the first row contains headers)
          const sheetData = window.XLSX.utils.sheet_to_json(materialDocSheet, {
            raw: false,
            defval: "",
            dateNF: "yyyy-mm-dd"
          });

          console.log("Sheet data rows:", sheetData.length);

          if (sheetData.length === 0) {
            throw new Error(
              `Sheet "${materialDocSheetName}" contains no data or headers could not be parsed`
            );
          }

          // Detailed parsing of entries
          const entries = sheetData.map((row, index) => {
            // Map column names to standardized property names
            const standardizedRow = this._dataTransformer.mapColumnNames(row);

            // Filter out __EMPTY fields from standardizedRow
            const cleanStandardizedRow = Object.entries(standardizedRow).reduce((acc, [key, value]) => {
              if (!key.includes("EMPTY") && !key.startsWith("__") && !key.startsWith("_EMPTY")) {
                acc[key] = value;
              }
              return acc;
            }, {});

            // Create a material document entry
            const materialDocument = {
              id: index + 1,
              Status: "Valid", // Initial status, will be updated during validation
              ValidationErrors: [],
              EntryUnit: standardizedRow.EntryUnit || "EA", // Default entry unit

              // Add the filtered standardized fields
              ...cleanStandardizedRow,

              // Ensure dates are properly formatted
              DocumentDate: this._dataTransformer.parseDate(standardizedRow.DocumentDate),
              PostingDate: this._dataTransformer.parseDate(standardizedRow.PostingDate),

              // Ensure SequenceNumber exists
              SequenceNumber: standardizedRow.SequenceNumber?.toString() || `${index + 1}`,

              // Store clean raw data for reference (optional)
              RawData: Object.entries(row).reduce((acc, [key, value]) => {
                if (!key.includes("EMPTY") && !key.startsWith("__") && !key.startsWith("_EMPTY")) {
                  acc[key] = value;
                }
                return acc;
              }, {})
            };

            return materialDocument;
          });

          console.log(`✅ Parsed ${entries.length} entries successfully`);
          console.log("Sample parsed entry:", entries[0]);

          console.groupEnd();

          return {
            entries: entries
          };
        } catch (error) {
          console.error("❌ Error parsing material document sheet:", error);
          console.groupEnd();
          throw error;
        }
      }
      /**
       * Update models with material document data
       * @param {object} validationResult - Validation result object
       * @private
       */
      _updateModels(validationResult) {
        console.group("🔄 Updating Material Document Models");

        try {
          if (!this.oController) {
            console.warn("Controller not available, skipping model updates");
            console.groupEnd();
            return;
          }

          // Get models
          const uploadSummaryModel = this.oController.getView().getModel("uploadSummary");
          const oMaterialDocumentModel = this.oController.getView().getModel("materialDocuments");

          if (!uploadSummaryModel || !oMaterialDocumentModel) {
            console.warn("Required models not available, skipping model updates");
            console.groupEnd();
            return;
          }

          // Get entries from validation result
          const entries = validationResult.entries || [];
          const validEntries = entries.filter(entry => entry.Status === "Valid");
          const invalidEntries = entries.filter(entry => entry.Status === "Invalid");

          // Logging
          console.log("Total Entries:", entries.length);
          console.log("Valid Entries:", validEntries.length);
          console.log("Invalid Entries:", invalidEntries.length);

          // Update summary model
          uploadSummaryModel.setProperty("/TotalEntries", entries.length);
          uploadSummaryModel.setProperty("/SuccessfulEntries", validEntries.length);
          uploadSummaryModel.setProperty("/FailedEntries", invalidEntries.length);
          uploadSummaryModel.setProperty("/ValidationErrors", validationResult.errors || []);
          uploadSummaryModel.setProperty("/IsSubmitEnabled", validEntries.length > 0);
          uploadSummaryModel.setProperty("/HasBeenSubmitted", false);
          uploadSummaryModel.setProperty("/LastUploadDate", new Date());
          uploadSummaryModel.setProperty("/ProcessingComplete", true);

          // Prepare entries for display - include all entries
          if (entries.length > 0) {
            const processedEntries = entries.map((entry) => {
              // Destructure to remove unnecessary properties
              const { id, RawData, ...materialDocItem } = entry;

              return {
                ...materialDocItem,
                Status: entry.Status // Explicitly preserve Status
              };
            });

            console.log("Processed Entries for display:", processedEntries.length);

            // Set items directly in the model
            oMaterialDocumentModel.setProperty("/entries", processedEntries);
            oMaterialDocumentModel.setProperty("/validationStatus", validationResult.isValid ? "Valid" : "Invalid");
            oMaterialDocumentModel.setProperty("/filteredCount", processedEntries.length);

            // Force model refresh
            oMaterialDocumentModel.refresh(true);
          }

          console.groupEnd();
        } catch (error) {
          console.error("Error updating models:", error);
          console.groupEnd();
        }
      }

      /**
       * Show processing results to the user
       * @param {Object} validationResult - Validation result object
       * @param {String} fileName - Name of the processed file
       * @private
       */
      _showProcessingResults(validationResult, fileName) {
        // Show basic results message
        MessageToast.show(
          `File processed: ${validationResult.entries.length} entries found (${validationResult.validCount} valid, ${validationResult.errorCount} invalid)`
        );

        // If there are validation errors, show detailed error dialog
        if (!validationResult.isValid && this.oController && this.oController._uiManager) {
          this.oController._uiManager.handleValidationErrors(validationResult.errors);
        }
      }

      /**
       * Clear the file uploader control
       * @private
       */
      _clearFileUploader() {
        if (this.oController) {
          const oFileUploader = this.oController.getView().byId("fileUploader");
          if (oFileUploader) {
            oFileUploader.clear();
          }
        }
      }

      /**
       * Export invalid records to Excel for correction
       * @param {array} invalidEntries - The invalid entries to export
       */
      exportInvalidRecords(invalidEntries) {
        try {
          if (!window.XLSX) {
            throw new Error("XLSX library not loaded");
          }

          // Create workbook
          const wb = window.XLSX.utils.book_new();

          // Add sheet with invalid entries
          const ws = window.XLSX.utils.json_to_sheet(invalidEntries.map(entry => {
            // Map validation errors to a string
            const errorMessages = entry.ValidationErrors
              ? entry.ValidationErrors.map(err => {
                if (typeof err === "string") return err;
                return err.message || JSON.stringify(err);
              }).join("; ")
              : "";

            // Create a clean object with all needed fields and add validation errors
            return {
              ...entry,
              ValidationErrorMessages: errorMessages
            };
          }));

          // Add the worksheet to the workbook
          window.XLSX.utils.book_append_sheet(wb, ws, "Invalid Records");

          // Generate filename with date
          const now = new Date();
          const timestamp = now.toISOString().slice(0, 10);
          const filename = `Invalid_Material_Documents_${timestamp}.xlsx`;

          // Save the file
          window.XLSX.writeFile(wb, filename);

          // Show success message
          MessageToast.show(`Invalid records exported to ${filename}`);
        } catch (error) {
          console.error("Error exporting invalid records:", error);
          MessageBox.error("Failed to export invalid records: " + error.message);
        }
      }

      /**
       * Create a template Excel file
       * @returns {ArrayBuffer} Excel file as ArrayBuffer
       */
      createTemplateFile() {
        try {
          if (!window.XLSX) {
            throw new Error("XLSX library not loaded");
          }

          // Create workbook
          const wb = window.XLSX.utils.book_new();

          // Define template headers based on field constraints
          const headers = [
            "Sequence Number",
            "GRN Document Number",
            "Document Date",
            "Posting Date",
            "Material",
            "Plant",
            "Storage Location",
            "Goods Movement Type",
            "Purchase Order",
            "Purchase Order Item",
            "Goods Movement Ref Doc Type",
            "Quantity In Entry Unit",
            "Entry Unit"
          ];

          // Create empty template data with example row
          const templateData = [
            {
              "Sequence Number": "1",
              "GRN Document Number": "5000000123",
              "Document Date": new Date().toISOString().slice(0, 10),
              "Posting Date": new Date().toISOString().slice(0, 10),
              "Material": "MAT001",
              "Plant": "1000",
              "Storage Location": "0001",
              "Goods Movement Type": "101",
              "Purchase Order": "4500000123",
              "Purchase Order Item": "00010",
              "Goods Movement Ref Doc Type": "",
              "Quantity In Entry Unit": "10.000",
              "Entry Unit": "EA"
            },
            // Empty row template (all fields empty)
            headers.reduce((obj, header) => {
              obj[header] = "";
              return obj;
            }, {})
          ];

          // Convert to worksheet
          const ws = window.XLSX.utils.json_to_sheet(templateData);

          // Add the worksheet to the workbook
          window.XLSX.utils.book_append_sheet(wb, ws, "Material Documents");

          // Add a Help sheet with field descriptions
          this._addHelpSheet(wb);

          // Convert to ArrayBuffer
          return window.XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
        } catch (error) {
          console.error("Error creating template file:", error);
          MessageBox.error("Failed to create template file: " + error.message);
          return null;
        }
      }

      /**
       * Add a help sheet to the template workbook
       * @param {Object} wb - XLSX workbook
       * @private
       */
      _addHelpSheet(wb) {
        // Get field constraints description from ValidationManager
        const fieldDescriptions = this._validationManager.getFieldConstraintsDescription();

        // Prepare help data
        const helpData = Object.keys(fieldDescriptions).map(field => {
          return {
            "Field Name": field,
            "Description": fieldDescriptions[field]
          };
        });

        // Add general instructions
        helpData.unshift(
          {
            "Field Name": "INSTRUCTIONS",
            "Description": "This template is used for uploading material documents. Fill in all required fields."
          },
          {
            "Field Name": "",
            "Description": "Fields marked as 'Required' must not be left empty."
          },
          {
            "Field Name": "",
            "Description": "Dates must be in YYYY-MM-DD format (e.g., 2023-04-17)."
          },
          {
            "Field Name": "",
            "Description": ""
          }
        );

        // Create help worksheet
        const wsHelp = window.XLSX.utils.json_to_sheet(helpData);

        // Add to workbook
        window.XLSX.utils.book_append_sheet(wb, wsHelp, "Help");
      }
    };
  }
);