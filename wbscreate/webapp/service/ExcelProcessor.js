/**
 * Enhanced Excel Processor for WBS Element file format
 * This extends the existing ExcelProcessor to handle WBS Element files with the specific format provided
 */
sap.ui.define([
  "sap/m/MessageBox",
  "sap/m/MessageToast",
  "sap/ui/core/BusyIndicator",
  "wbscreate/service/ValidationManager",
  "wbscreate/utils/DataTransformer",
  "wbscreate/utils/ErrorHandler"
], function (MessageBox, MessageToast, BusyIndicator, ValidationManager, DataTransformer, ErrorHandler) {
  "use strict";

  /**
   * WBSElementProcessor
   * Specialized processor for WBS Element files
   */
  return class WBSElementProcessor {
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

      // Define WBS Element field mappings for standardization
      this.wbsFieldMappings = {
        "Project Element": "ProjectElement",
        "ProjectUUID": "ProjectUUID",
        "Name of WBS": "ProjectElementDescription",
        "Planned Start Date": "PlannedStartDate",
        "Planned End Date": "PlannedEndDate",
        "Responsible Cost Center": "ResponsibleCostCenter",
        "Company Code": "CompanyCode",
        "Profit Center": "ProfitCenter",
        "Controlling Area": "ControllingArea",
        "Billing Element": "WBSElementIsBillingElement",
        "Old Project ID": "YY1_OldProjectSiteID_PTD",
        "Exact WBS code": "YY1_ExactWBScode_PTD",
        "Site type (OF/ON)": "YY1_Categorization1_PTD",
        "ATM ID": "YY1_ATMID_PTD",
        "District": "YY1_Address_PTD",
        "State": "YY1_State_PTD",
        "Bank name": "YY1_Project_PTD",
        "ATM count": "YY1_ATMCount_PTD",
        "Nature of WBS": "YY1_NatureOfWBS_PTD",
        "SAP Site ID report": "YY1_SAPsiteIDReport_PTD",
        "Address": "YY1_Addressandpostalco_PTD",
        "Deployment": "YY1_Deployment_PTD",
        "Bank load percentage": "YY1_BankLoadATMDiscoun_PTD",
        "ERP relocation Ref ATM ID": "YY1_ERPRelocationRefAT_PTD",
        "ERP Site ID report": "YY1_ERPsiteIDReport_PTD",
        "UDF-1": "YY1_UDF3_PTD",
        "Categorization": "YY1_Categorization_PTD",
        "Actual start date": "YY1_UDF1_PTD",
        "Postal code": "YY1_Postalcode_PTD",
        "Actual end date": "YY1_UDF2_PTD",
        "ERP relocation ref. site id": "YY1_ERPRelocationRefer_PTD"
      };
    }

    /**
     * Process a WBS Element Excel file
     * @param {File} file - The Excel file to process
     * @returns {Promise<object>} Promise that resolves with the processed data
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

            this._errorHandler.showSuccess("Processing WBS Element file, please wait...");

            const workbook = window.XLSX.read(e.target.result, {
              type: "array",
              cellDates: true,
              cellText: false,
              cellStyles: true
            });

            // Find the first sheet (assuming WBS data is in the first sheet)
            if (workbook.SheetNames.length === 0) {
              throw new Error("Excel file has no sheets.");
            }

            const sheetName = workbook.SheetNames[0];
            const wbsElements = this._parseWBSElementSheet(workbook, sheetName);

            if (!wbsElements || wbsElements.length === 0) {
              console.warn("No WBS Elements found after parsing and filtering empty rows.");
              const emptyResult = {
                isValid: true,
                entries: [],
                count: 0,
                errors: []
              };

              resolve(emptyResult);
              return;
            }

            // Validate the WBS Elements
            const validationResult = this._validateWBSElements(wbsElements);

            // Log successful processing
            console.log("WBS Element file processed successfully", {
              fileName: file.name,
              totalEntries: wbsElements.length,
              validEntries: validationResult.validCount,
              invalidEntries: validationResult.errorCount
            });

            // Update models if needed
            this._updateModels(validationResult);

            // Show processing results
            this._showProcessingResults(validationResult, file.name);

            resolve(validationResult);
          } catch (error) {
            console.error("WBS Element Processing Error", error);
            BusyIndicator.hide();
            this._errorHandler.showError(`Error processing file: ${file.name}`, error.message);
            reject(error);
          }
        };

        reader.readAsArrayBuffer(file);
      });
    }

    /**
     * Parse WBS Element data from an Excel sheet
     * @param {object} workbook - XLSX workbook object
     * @param {string} sheetName - Name of the sheet to parse
     * @returns {array} Array of parsed WBS Elements
     * @private
     */
    _parseWBSElementSheet(workbook, sheetName) {
      try {
        const worksheet = workbook.Sheets[sheetName];
        if (!worksheet) {
          throw new Error(`Sheet "${sheetName}" could not be accessed in the workbook.`);
        }

        console.groupCollapsed(`📄 Parsing WBS Element Sheet: "${sheetName}"`);

        const sheetData = window.XLSX.utils.sheet_to_json(worksheet, {
          header: 1,
          defval: "", // Keep empty cells as empty strings
          raw: false,
          dateNF: 'yyyy-mm-dd'
        });

        if (sheetData.length < 2) {
          console.warn(`Sheet "${sheetName}" contains no data rows or only headers.`);
          console.groupEnd();
          return [];
        }

        // Get headers and standardize them
        const headers = sheetData[0].map(h => String(h || "").trim());
        const dataRows = sheetData.slice(1);

        console.log(`Found ${headers.length} headers and ${dataRows.length} data rows.`);

        // Create WBS Element objects
        const wbsElements = dataRows.map((rowArray, rowIndex) => {
          const rowObject = {};

          // Map raw values based on headers
          headers.forEach((header, colIndex) => {
            if (header) {
              rowObject[header] = rowArray[colIndex];
            }
          });

          // Map to standardized field names
          const standardizedRow = this._mapWBSFields(rowObject);

          // Add metadata
          standardizedRow._sheetName = sheetName;
          standardizedRow._originalData = rowObject;
          standardizedRow.Status = "Pending";
          standardizedRow.ValidationErrors = [];

          // Convert 'X' to boolean for boolean fields
          if (standardizedRow.WBSElementIsBillingElement === 'X') {
            standardizedRow.WBSElementIsBillingElement = true;
          } else if (standardizedRow.WBSElementIsBillingElement === '') {
            standardizedRow.WBSElementIsBillingElement = false;
          }

          // Handle date fields
          const dateFields = ['PlannedStartDate', 'PlannedEndDate', 'YY1_UDF1_PTD', 'YY1_UDF2_PTD'];
          dateFields.forEach(field => {
            if (standardizedRow[field]) {
              standardizedRow[field] = this._dataTransformer.parseDate(standardizedRow[field]);
            }
          });

          console.log(`Row ${rowIndex}:`, JSON.stringify(standardizedRow));
          return standardizedRow;
        });

        // Filter out empty rows
        const filteredElements = wbsElements.filter(elem => {
          const isEmpty = !Object.keys(elem).some(key => {
            if (key.startsWith('_')) {
              return false; // Ignore internal metadata fields
            }
            const value = elem[key];
            return value !== null && value !== undefined && String(value).trim() !== "";
          });

          if (isEmpty) {
            console.log(`Filtering out empty row (Original Index: ${wbsElements.indexOf(elem)})`);
          }
          return !isEmpty;
        });

        console.log(`✅ Parsed ${wbsElements.length} rows, kept ${filteredElements.length} non-empty entries after filtering.`);
        if (filteredElements.length > 0) {
          console.log("Sample parsed WBS Element:", filteredElements[0]);
        }
        console.groupEnd();

        return filteredElements;
      } catch (error) {
        console.error(`❌ Error parsing WBS Element sheet "${sheetName}":`, error);
        console.groupEnd();
        throw error;
      }
    }

    /**
     * Map from raw field names to standardized SAP field names
     * @param {object} rawData - Raw data with original field names
     * @returns {object} Data with standardized field names
     * @private
     */
    _mapWBSFields(rawData) {
      const mapped = {};

      Object.keys(rawData).forEach(key => {
        const standardKey = this.wbsFieldMappings[key] || key;
        mapped[standardKey] = rawData[key];
      });

      return mapped;
    }

    /**
     * Validate WBS Elements against business rules
     * @param {array} wbsElements - Array of WBS Elements to validate
     * @returns {object} Validation result
     * @private
     */
    _validateWBSElements(wbsElements) {
      // Define required fields for WBS Elements
      const requiredFields = [
        { field: "ProjectElement", description: "Project Element" },
        { field: "ProjectElementDescription", description: "Name of WBS" },
        { field: "PlannedStartDate", description: "Planned Start Date" },
        { field: "PlannedEndDate", description: "Planned End Date" }
      ];

      // Validate each WBS Element
      const validatedElements = wbsElements.map(element => {
        const errors = [];

        // Check required fields
        requiredFields.forEach(({ field, description }) => {
          if (!element[field]) {
            errors.push({
              message: `${description} is required for WBS Element ${element.ProjectElement || 'Unknown'}`,
              field: field
            });
          }
        });

        // Check that PlannedEndDate is after PlannedStartDate
        if (element.PlannedStartDate && element.PlannedEndDate &&
          element.PlannedEndDate < element.PlannedStartDate) {
          errors.push({
            message: `Planned End Date must be after Planned Start Date for WBS Element ${element.ProjectElement || 'Unknown'}`,
            field: "PlannedEndDate"
          });
        }

        // Set validation status
        return {
          ...element,
          Status: errors.length > 0 ? "Invalid" : "Valid",
          ValidationErrors: errors
        };
      });

      // Count valid and invalid entries
      const validElements = validatedElements.filter(elem => elem.Status === "Valid");
      const invalidElements = validatedElements.filter(elem => elem.Status === "Invalid");

      // Collect all errors
      const allErrors = validatedElements.flatMap(elem => elem.ValidationErrors);

      return {
        isValid: allErrors.length === 0,
        entries: validatedElements,
        validCount: validElements.length,
        errorCount: invalidElements.length,
        validData: validElements,
        errors: allErrors
      };
    }

    /**
     * Update controller models with WBS Element data
     * @param {object} validationResult - The result object from validation
     * @private
     */
    _updateModels(validationResult) {
      console.groupCollapsed("🔄 Updating Controller Models for WBS Elements");
      try {
        if (!this.oController || !this.oController.getView) {
          console.warn("Controller or View not available...");
          console.groupEnd();
          return;
        }

        // Assuming there's a wbsElements model to update
        const wbsElementsModel = this.oController.getView().getModel("wbsElements");
        if (!wbsElementsModel) {
          console.warn("WBS Elements model not found...");
          console.groupEnd();
          return;
        }

        const allEntries = validationResult.entries || [];
        const validEntries = allEntries.filter(entry => entry.Status === "Valid");
        const invalidEntries = allEntries.filter(entry => entry.Status === "Invalid");

        console.log("Total WBS Elements:", allEntries.length, "Valid:", validEntries.length, "Invalid:", invalidEntries.length);

        // Update the model
        wbsElementsModel.setProperty("/entries", allEntries);
        wbsElementsModel.setProperty("/validationStatus", validationResult.isValid ? "Valid" : "Invalid");
        wbsElementsModel.setProperty("/filteredCount", allEntries.length);
        wbsElementsModel.refresh(true);

        console.log("WBS Elements model updated successfully.");
        console.groupEnd();
      } catch (error) {
        console.error("Error updating models:", error);
        console.groupEnd();
        this._errorHandler.showError("Failed to update WBS Elements display.", error.message);
      }
    }

    /**
     * Show processing results to the user
     * @param {Object} validationResult - Validation result object
     * @param {String} fileName - Name of the processed file
     * @private
     */
    _showProcessingResults(validationResult, fileName) {
      if (validationResult && validationResult.entries && validationResult.entries.length > 0) {
        MessageToast.show(`File "${fileName}" processed: ${validationResult.validCount} valid, ${validationResult.errorCount} invalid WBS Elements.`);
      } else if (validationResult) {
        MessageToast.show(`File "${fileName}" processed. No WBS Elements found after filtering empty rows.`);
      }

      if (!validationResult.isValid && validationResult.errors && validationResult.errors.length > 0) {
        if (this.oController?._uiManager?.handleValidationErrors) {
          console.log("Showing validation errors using UIManager.");
          this.oController._uiManager.handleValidationErrors(validationResult.errors);
        } else {
          console.warn("UIManager not available...");
          const errorCount = validationResult.errorCount;
          MessageBox.warning(`${errorCount} validation error(s) found in WBS Elements...`, { title: "Validation Errors Found" });
        }
      }
    }
  };
});