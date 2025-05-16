sap.ui.define(
  [
    "sap/m/MessageBox",
    "sap/m/MessageToast",
    "sap/ui/core/BusyIndicator",
    "serviceentrysheet/service/ValidationManager", // Adjust path if needed
    "serviceentrysheet/utils/DataTransformer",     // Adjust path if needed
    "serviceentrysheet/utils/ErrorHandler"         // Adjust path if needed
    // "serviceentrysheet/model/ModelManager" // Add if needed
  ],
  function (MessageBox, MessageToast, BusyIndicator, ValidationManager, DataTransformer, ErrorHandler /*, ModelManager */) {
    "use strict";

    /**
     * ExcelProcessor
     * Responsible for parsing and processing Excel files for Service Entry Sheets
     */
    return class ExcelProcessor {
      /**
       * Constructor with dependency injection
       * @param {Object} options - Configuration options
       */
      constructor(options = {}) {
        this.oController = options.controller;
        this._validationManager = options.validationManager || new ValidationManager(/* pass options if needed */);
        this._dataTransformer = options.dataTransformer || new DataTransformer();
        this._errorHandler = options.errorHandler || new ErrorHandler();
        this._modelManager = options.modelManager;

        if (!this.oController) {
          console.warn("ExcelProcessor: Controller instance not provided.");
        }
      }

      /**
       * Process an Excel file
       * @param {File} file - The Excel file to process
       * @returns {Promise<object>} Promise that resolves with the validation result object
       */
      processExcelFile(file) {
        return new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onerror = (e) => {
            console.error("FileReader error:", e);
            BusyIndicator.hide();
            this._errorHandler.showError("Error reading file...");
            reject(new Error("FileReader failed"));
          };

          reader.onload = (e) => {
            try {
              if (!window.XLSX) {
                throw new Error("XLSX library (SheetJS) not loaded.");
              }

              this._errorHandler.showSuccess("Processing file, please wait...");

              const workbook = window.XLSX.read(e.target.result, {
                type: "array",
                cellDates: true,
                cellText: false,
                cellStyles: true
              });

              const sheetInfo = this._findServiceEntrySheet(workbook);
              if (!sheetInfo.found) {
                throw new Error(sheetInfo.message);
              }

              const parsedData = this._parseServiceEntrySheet(workbook, sheetInfo.sheetName);

              if (!parsedData || !parsedData.entries || parsedData.entries.length === 0) {
                console.warn("No data entries found after parsing and filtering empty rows.");
                const emptyResult = {
                  isValid: true,
                  entries: [],
                  validCount: 0,
                  errorCount: 0,
                  errors: []
                };

                this._updateModels(emptyResult);
                this._showProcessingResults(emptyResult, file.name);
                this._clearFileUploader();
                resolve(emptyResult);
                return;
              }

              const validationResult = this._validationManager.validateServiceEntrySheets(parsedData.entries);

              // Initialize account assignment filter with the parsed data entries
              if (this.oController && typeof this.oController.initializeAccountAssignmentCategoryFilter === 'function') {
                console.log("Initializing account assignment filter with parsed entries...");
                // Make sure we pass the entries array, not the parsedData object
                this.oController.initializeAccountAssignmentCategoryFilter(parsedData.entries);
              }

              // Update filter mappings to include account assignment filter
              if (this.oController && typeof this.oController._updateFilterMappings === 'function') {
                this.oController._updateFilterMappings();
              }

              // Log successful processing
              console.log("Excel file processed successfully", {
                fileName: file.name,
                totalEntries: parsedData.entries.length,
                validEntries: validationResult.validCount,
                invalidEntries: validationResult.errorCount
              });

              this._updateModels(validationResult);
              this._showProcessingResults(validationResult, file.name);
              this._clearFileUploader();
              resolve(validationResult);
            } catch (error) {
              console.error("Excel Processing Error", error);
              BusyIndicator.hide();

              if (error.message && error.message.includes("Required sheet")) {
                this._errorHandler.showError("Excel File Error", error.message);
              } else {
                this._errorHandler.showError(`Error processing file: ${file.name}`, error.message);
              }

              reject(error);
            }
          };

          reader.readAsArrayBuffer(file);
        });
      }

      /**
       * Find the service entry sheet in the workbook (more flexible check)
       * @param {Object} workbook - XLSX workbook object
       * @returns {Object} Object with sheet information { found: boolean, sheetName: string|null, message?: string }
       * @private
       */
      _findServiceEntrySheet(workbook) {

        const possibleSheetNames = ["Service Entries", "Service Entry Sheet"];
        const lowerCasePossibleNames = possibleSheetNames.map(name => name.toLowerCase());
        let foundSheet = null;
        for (const sheetName of workbook.SheetNames) { const lowerCaseSheetName = sheetName.toLowerCase(); if (lowerCasePossibleNames.includes(lowerCaseSheetName)) { foundSheet = sheetName; break; } }
        if (foundSheet) { console.log(`Found matching sheet: '${foundSheet}'`); return { found: true, sheetName: foundSheet }; }
        else { const requiredSheetNamesText = possibleSheetNames.map(name => `"${name}"`).join(" or "); const errorMsg = `Required sheet (${requiredSheetNamesText}) not found... Available sheets: ${workbook.SheetNames.join(", ")}.`; console.error(errorMsg); return { found: false, sheetName: null, message: errorMsg }; }
      }

      /**
       * Parse and structure service entry sheets data from the specified Excel sheet.
       * @param {object} workbook - XLSX workbook object.
       * @param {string} sheetName - Name of the sheet to parse.
       * @returns {object} - Object containing the parsed entries: { entries: Array<object> }.
       * @private
       */
      _parseServiceEntrySheet(workbook, sheetName) {
        try {
          const worksheet = workbook.Sheets[sheetName];
          if (!worksheet) {
            throw new Error(`Sheet "${sheetName}" could not be accessed in the workbook.`);
          }

          console.groupCollapsed(`📄 Parsing Sheet: "${sheetName}"`);

          const sheetData = window.XLSX.utils.sheet_to_json(worksheet, {
            header: 1,
            defval: "", // Keep empty cells as empty strings
            raw: false,
            dateNF: 'yyyy-mm-dd'
          });

          if (sheetData.length < 2) {
            console.warn(`Sheet "${sheetName}" contains no data rows or only headers.`);
            console.groupEnd();
            return { entries: [] };
          }

          const headers = sheetData[0].map(h => String(h || "").trim());
          const dataRows = sheetData.slice(1);

          console.log(`Found ${headers.length} headers and ${dataRows.length} data rows.`);

          const entriesBeforeFilter = dataRows.map((rowArray, rowIndex) => { // Renamed variable
            const rowObject = {};
            headers.forEach((header, colIndex) => {
              if (header) {
                rowObject[header] = rowArray[colIndex];
              }
            });

            const standardizedRow = this._dataTransformer.mapColumnNames(rowObject);

            standardizedRow._sheetName = sheetName;
            standardizedRow._originalData = rowObject;
            standardizedRow.Status = "Pending";
            standardizedRow.ValidationErrors = [];

            // <<< ADDED CONSOLE LOG >>>
            console.log(`Row ${rowIndex} (before filter):`, JSON.stringify(standardizedRow)); // Log the row object before filtering
            // <<< END OF ADDED CONSOLE LOG >>>

            return standardizedRow;
          });

          // Filter out rows where ALL data fields (ignoring internal fields starting with '_')
          // are either null, undefined, or strings containing only whitespace.
          const entries = entriesBeforeFilter.filter(entry => { // Use the unfiltered array
            const isEmpty = !Object.keys(entry).some(key => { // Check if NOT some field has value
              if (key.startsWith('_')) {
                return false; // Ignore internal metadata fields
              }
              const value = entry[key];
              // Check if the value is not null/undefined AND (if it's a string) it's not empty after trimming
              return value !== null && value !== undefined && String(value).trim() !== "";
            });
            if (isEmpty) {
              console.log(`Filtering out empty row (Original Index: ${entry})`);
            }
            return !isEmpty; // Keep the entry if it's NOT empty
          });


          console.log(`✅ Parsed ${entriesBeforeFilter.length} rows, kept ${entries.length} non-empty entries after filtering.`);
          if (entries.length > 0) console.log("Sample parsed entry (after filtering, before validation):", entries[0]);
          console.groupEnd();

          return { entries: entries };

        } catch (error) {
          console.error(`❌ Error parsing sheet "${sheetName}":`, error);
          console.groupEnd();
          throw error;
        }
      }


      /**
       * Update controller models with service entry sheet data and validation results.
       * @param {object} validationResult - The result object from ValidationManager.
       * @private
       */
      _updateModels(validationResult) {
        // --- [Code for _updateModels remains the same as in excel_processor_js_v4] ---
        console.groupCollapsed("🔄 Updating Controller Models");
        try {
          if (!this.oController || !this.oController.getView) { console.warn("Controller or View not available..."); console.groupEnd(); return; }
          const uploadSummaryModel = this.oController.getView().getModel("uploadSummary");
          const serviceEntrySheetsModel = this.oController.getView().getModel("serviceEntrySheets");
          if (!uploadSummaryModel || !serviceEntrySheetsModel) { console.warn("Required models not found..."); console.groupEnd(); return; }
          const allEntries = validationResult.entries || [];
          const validEntries = allEntries.filter(entry => entry.Status === "Valid");
          const invalidEntries = allEntries.filter(entry => entry.Status === "Invalid");
          console.log("Total Entries:", allEntries.length, "Valid:", validEntries.length, "Invalid:", invalidEntries.length);
          uploadSummaryModel.setProperty("/TotalEntries", allEntries.length);
          uploadSummaryModel.setProperty("/SuccessfulEntries", validEntries.length);
          uploadSummaryModel.setProperty("/FailedEntries", invalidEntries.length);
          uploadSummaryModel.setProperty("/ValidationErrors", this._errorHandler.formatValidationErrors(validationResult.errors || []));
          uploadSummaryModel.setProperty("/IsSubmitEnabled", validEntries.length > 0);
          uploadSummaryModel.setProperty("/HasBeenSubmitted", false);
          uploadSummaryModel.setProperty("/LastUploadDate", new Date().toISOString());
          uploadSummaryModel.setProperty("/ProcessingComplete", true);
          console.log(`Setting ${allEntries.length} entries in 'serviceEntrySheets' model.`);
          serviceEntrySheetsModel.setProperty("/entries", allEntries);
          serviceEntrySheetsModel.setProperty("/validationStatus", validationResult.isValid ? "Valid" : "Invalid");
          serviceEntrySheetsModel.setProperty("/filteredCount", allEntries.length);
          uploadSummaryModel.refresh(true);
          serviceEntrySheetsModel.refresh(true);
          console.log("Models updated successfully.");
          console.groupEnd();
        } catch (error) {
          console.error("Error updating models:", error);
          console.groupEnd();
          this._errorHandler.showError("Failed to update data display.", error.message);
        }
      }


      /**
       * Show processing results to the user (e.g., validation errors dialog).
       * @param {Object} validationResult - Validation result object.
       * @param {String} fileName - Name of the processed file.
       * @private
       */
      _showProcessingResults(validationResult, fileName) {
        // --- [Code for _showProcessingResults remains the same as in excel_processor_js_v4] ---
        if (validationResult && validationResult.entries && validationResult.entries.length > 0) { MessageToast.show(`File "${fileName}" processed: ${validationResult.validCount} valid, ${validationResult.errorCount} invalid.`); }
        else if (validationResult) { MessageToast.show(`File "${fileName}" processed. No data rows found after filtering empty rows.`); }
        if (!validationResult.isValid && validationResult.errors && validationResult.errors.length > 0) {
          if (this.oController?._uiManager?.handleValidationErrors) { console.log("Showing validation errors using UIManager."); this.oController._uiManager.handleValidationErrors(validationResult.errors); }
          else { console.warn("UIManager not available..."); const errorCount = validationResult.errorCount; MessageBox.warning(`${errorCount} validation error(s) found...`, { title: "Validation Errors Found" }); }
        }
      }

      /**
       * Clear the file uploader control on the view.
       * @private
       */
      _clearFileUploader() {
        // --- [Code for _clearFileUploader remains the same as in excel_processor_js_v4] ---
        if (this.oController) { const oFileUploader = this.oController.byId("fileUploader"); if (oFileUploader?.clear) { oFileUploader.clear(); console.log("File uploader cleared."); } else { console.warn("Could not find FileUploader control..."); } }
      }

      /**
       * Export invalid records to Excel for correction.
       * @param {array} invalidEntries - The invalid entries (from validationResult.entries where Status === 'Invalid').
       */
      exportInvalidRecords(invalidEntries) {
        // --- [Code for exportInvalidRecords remains the same as in excel_processor_js_v4] ---
        try {
          if (!invalidEntries || invalidEntries.length === 0) { this._errorHandler.showWarning("No invalid records to export."); return; }
          if (!window.XLSX) { throw new Error("XLSX library not loaded"); }
          const exportData = invalidEntries.map(entry => { const errorMessages = (entry.ValidationErrors || []).map(err => typeof err === "string" ? err : err.message || `Error in field '${err.field || 'unknown'}' (Seq: ${err.sequenceId || 'N/A'})`).join("; "); const dataToExport = { ...(entry._originalData || entry) }; delete dataToExport._sheetName; delete dataToExport._originalData; delete dataToExport.Status; delete dataToExport.ValidationErrors; dataToExport.ValidationErrorMessages = errorMessages; return dataToExport; });
          const wb = window.XLSX.utils.book_new(); const ws = window.XLSX.utils.json_to_sheet(exportData); window.XLSX.utils.book_append_sheet(wb, ws, "Invalid Records"); const timestamp = new Date().toISOString().slice(0, 10); const filename = `Invalid_Service_Entry_Sheets_${timestamp}.xlsx`; window.XLSX.writeFile(wb, filename); this._errorHandler.showSuccess(`Invalid records exported to ${filename}`);
        } catch (error) { console.error("Error exporting invalid records:", error); this._errorHandler.showError("Failed to export invalid records: " + error.message); }
      }

      /**
       * Create a template Excel file Blob using ValidationManager constraints.
       * @returns {Promise<Blob|null>} Promise resolving with the Blob or null on error.
       */
      async createTemplateFileBlob() {
        // --- [Code for createTemplateFileBlob remains the same as in excel_processor_js_v4] ---
        try {
          if (!window.XLSX) { throw new Error("XLSX library not loaded"); }
          if (!this._validationManager?._validationManager?.getFieldConstraintsDescription) { console.error("ValidationManager not available..."); throw new Error("ValidationManager not available for template generation."); }
          const wb = window.XLSX.utils.book_new(); const allConstraints = { ...(this._validationManager.fieldConstraints || {}), ...(this._validationManager.accountAssignmentConstraints || {}) }; const headers = Object.keys(allConstraints).map(key => allConstraints[key]?.description || key); if (!headers.includes("GRN Creation")) { headers.push("GRN Creation"); }
          const exampleRow = {}; Object.keys(allConstraints).forEach(key => { const desc = allConstraints[key]?.description || key; const type = allConstraints[key]?.type; if (type === 'date') exampleRow[desc] = new Date().toISOString().slice(0, 10); else if (type === 'decimal') exampleRow[desc] = "100.00"; else if (type === 'string' && allConstraints[key]?.required) exampleRow[desc] = `Example ${desc}`; else exampleRow[desc] = ""; }); exampleRow["GRN Creation"] = "X";
          const templateData = [exampleRow]; const emptyRow = {}; headers.forEach(header => { emptyRow[header] = ""; }); templateData.push(emptyRow); const ws = window.XLSX.utils.json_to_sheet(templateData, { header: headers }); window.XLSX.utils.book_append_sheet(wb, ws, "Service Entries"); this._addHelpSheet(wb); const wbout = window.XLSX.write(wb, { bookType: 'xlsx', type: 'array' }); return new Blob([wbout], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
        } catch (error) { console.error("Error creating template file blob:", error); this._errorHandler.showError("Failed to create template file: " + error.message); return null; }
      }


      /**
       * Add a help sheet to the template workbook.
       * @param {Object} wb - XLSX workbook object.
       * @private
       */
      _addHelpSheet(wb) {
        // --- [Code for _addHelpSheet remains the same as in excel_processor_js_v4] ---
        try {
          if (!this._validationManager?._validationManager?.getFieldConstraintsDescription) { console.warn("ValidationManager not available..."); return; }
          const fieldDescriptions = this._validationManager.getFieldConstraintsDescription(); if (!fieldDescriptions) { console.warn("Field descriptions not available..."); return; }
          const helpData = Object.keys(fieldDescriptions).map(fieldKey => { const constraint = fieldDescriptions[fieldKey]; if (!constraint) return null; let description = constraint.description || fieldKey; if (constraint.required) description += " (Required)"; if (constraint.maxLength) description += ` (Max Length: ${constraint.maxLength})`; if (constraint.type === 'date') description += " (Format: yyyy-MM-dd)"; if (constraint.type === 'decimal') description += ` (e.g., 123.45; Precision: ${constraint.precision || 'N/A'}, Scale: ${constraint.scale || 'N/A'})`; return { "Field Name": constraint.description || fieldKey, "Details": description }; }).filter(item => item !== null);
          helpData.push({ "Field Name": "GRN Creation", "Details": "Indicates if GRN/Approval is required..." });
          helpData.unshift({ "Field Name": "--- GENERAL INSTRUCTIONS ---", "Details": "Fill data starting from the second row..." }, { "Field Name": "Required Fields", "Details": "Fields marked '(Required)' must not be left empty." }, { "Field Name": "Dates", "Details": "Use yyyy-MM-dd format..." }, { "Field Name": "Numbers", "Details": "Use standard decimal format..." }, { "Field Name": "--- FIELD DETAILS ---", "Details": "" });
          const wsHelp = window.XLSX.utils.json_to_sheet(helpData, { skipHeader: true }); wsHelp['!cols'] = [{ wch: 30 }, { wch: 70 }]; window.XLSX.utils.book_append_sheet(wb, wsHelp, "Help");
        } catch (error) { console.error("Error generating Help sheet:", error); }
      }

    }; // End class ExcelProcessor
  }
);
