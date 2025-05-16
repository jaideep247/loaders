sap.ui.define(
  [
    "sap/m/MessageBox",
    "sap/m/MessageToast",
    "fixedassetacquisition/service/ValidationManager",
    "fixedassetacquisition/utils/DataTransformer",
    "fixedassetacquisition/utils/ErrorHandler"
  ],
  function (
    MessageBox,
    MessageToast,
    ValidationManager,
    DataTransformer,
    ErrorHandler
  ) {
    "use strict";

    /**
     * ExcelProcessor for Fixed Asset Acquisition
     * Responsible for parsing and processing Excel files for Fixed Asset Acquisition
     */
    return class ExcelProcessor {
      constructor(options = {}) {
        if (!options.controller) {
          throw new Error("Controller reference is required");
        }
        this._controller = options.controller;
        this._validationManager =
          options.validationManager || new ValidationManager();
        this._dataTransformer =
          options.dataTransformer || new DataTransformer();
        this._errorHandler = options.errorHandler || new ErrorHandler();

        // Column mapping to handle different header formats
        this._columnMapping = {
          // Original field name -> [possible variations in Excel headers]
          SequenceID: ["SequenceID", "Sequence ID", "sequence_id", "Sequence Number", "Seq ID"],
          ReferenceDocumentItem: ["ReferenceDocumentItem", "Reference Document Item", "reference_document_item", "Ref Doc Item"],
          BusinessTransactionType: ["BusinessTransactionType", "Business Transaction Type", "business_transaction_type", "Trans Type", "Transaction Type"],
          CompanyCode: ["CompanyCode", "Company Code", "company_code", "Company"],
          MasterFixedAsset: ["MasterFixedAsset", "Master Fixed Asset", "master_fixed_asset", "Master Asset"],
          FixedAsset: ["FixedAsset", "Fixed Asset", "fixed_asset", "Asset", "Asset Number"],
          DocumentDate: ["DocumentDate", "Document Date", "document_date", "Doc Date"],
          PostingDate: ["PostingDate", "Posting Date", "posting_date", "Post Date"],
          AssetValueDate: ["AssetValueDate", "Asset Value Date", "asset_value_date", "Value Date"],
          DebitCreditCode: ["DebitCreditCode", "Debit Credit Code", "debit_credit_code", "Debit/Credit Code", "DC Code"],
          FixedAssetYearOfAcqnCode: ["FixedAssetYearOfAcqnCode", "Fixed Asset Year Of Acqn Code", "fixed_asset_year_of_acqn_code", "Year of Acquisition", "Acqn Year"],
          DocumentReferenceID: ["DocumentReferenceID", "Document Reference ID", "document_reference_id", "Doc Ref ID", "Reference ID"],
          AccountingDocumentHeaderText: ["AccountingDocumentHeaderText", "Accounting Document Header Text", "accounting_document_header_text", "Header Text", "Doc Header Text"],
          TransactionCurrency: ["TransactionCurrency", "Transaction Currency", "transaction_currency", "Currency", "Currency Code"],
          AcqnAmtInTransactionCurrency: ["AcqnAmtInTransactionCurrency", "Acqn Amt In Transaction Currency", "acqn_amt_in_transaction_currency", "Acquisition Amount", "Amount"],
          QuantityInBaseUnit: ["QuantityInBaseUnit", "Quantity In Base Unit", "quantity_in_base_unit", "Quantity", "Base Quantity"],
          BaseUnitSAPCode: ["BaseUnitSAPCode", "Base Unit SAP Code", "base_unit_sap_code", "SAP Unit", "Unit SAP Code"],
          BaseUnitISOCode: ["BaseUnitISOCode", "Base Unit ISO Code", "base_unit_iso_code", "ISO Unit", "Unit ISO Code"],
          AccountingDocumentType: ["AccountingDocumentType", "Accounting Document Type", "accounting_document_type", "Doc Type", "Document Type"],
          AssignmentReference: ["AssignmentReference", "Assignment Reference", "assignment_reference", "Assignment Ref", "Assignment"],
          DocumentItemText: ["DocumentItemText", "Document Item Text", "document_item_text", "Item Text"],
          OffsettingAccount: ["OffsettingAccount", "Offsetting Account", "offsetting_account", "Offset Account", "GL Account"]
        };
      }

      /**
       * Find the matching column name from the Excel header
       * @param {Object} row - The row data from Excel
       * @param {string} fieldName - The standard field name
       * @returns {string|undefined} The value for the field
       * @private
       */
      _findColumnValue(row, fieldName) {
        const possibleNames = this._columnMapping[fieldName] || [fieldName];

        for (const columnName of possibleNames) {
          // Direct match
          if (row.hasOwnProperty(columnName)) {
            return row[columnName];
          }

          // Case-insensitive match
          const lowercaseColumns = Object.keys(row).find(
            key => key.toLowerCase() === columnName.toLowerCase()
          );
          if (lowercaseColumns) {
            return row[lowercaseColumns];
          }
        }

        return undefined;
      }

      /**
       * Process an Excel file for Fixed Asset Acquisition
       * @param {File} file - The Excel file to process
       * @returns {Promise} Promise that resolves with the processed data
       */
      processExcelFile(file) {
        return new Promise((resolve, reject) => {
          const reader = new FileReader();

          reader.onerror = (e) => {
            console.error("FileReader error:", e);
            this._errorHandler.showError(
              "Error reading file. Please try again."
            );
            reject(e);
          };

          reader.onload = (e) => {
            try {
              if (!window.XLSX) {
                throw new Error("XLSX library not loaded");
              }

              // Show processing message
              MessageToast.show("Processing file...");

              // Parse the file with full options to preserve formatting
              const workbook = window.XLSX.read(e.target.result, {
                type: "array",
                cellDates: true,
                cellText: false,
                cellStyles: true
              });

              // Verify and find the fixed asset sheet
              const sheetInfo = this._findFixedAssetSheet(workbook);

              if (!sheetInfo.found) {
                throw new Error(sheetInfo.message);
              }

              // Parse fixed asset sheet
              const parsedData = this._parseFixedAssetSheet(
                workbook,
                sheetInfo.sheetName
              );

              // Validate fixed asset entries using the ValidationManager
              const validationResult =
                this._validationManager.validateFixedAssetEntries(
                  parsedData.entries
                );

              // Update models with ALL fixed asset data, including valid and invalid entries
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
       * Find the fixed asset sheet in the workbook
       * @param {Object} workbook - XLSX workbook object
       * @returns {Object} Object with sheet information
       * @private
       */
      _findFixedAssetSheet(workbook) {
        const requiredSheet = "Fixed Asset Acquisitions";
        const normalizedSheetNames = workbook.SheetNames.map((name) =>
          name.toLowerCase().replace(/\s+/g, "")
        );

        // Check for exact sheet name match (case-insensitive)
        for (let name of workbook.SheetNames) {
          if (name.toLowerCase().trim() === requiredSheet.toLowerCase()) {
            return {
              found: true,
              sheetName: name // Use actual sheet name from workbook
            };
          }
        }

        // Check for similar sheet names
        const potentialSheets = workbook.SheetNames.filter(
          (name) =>
            name.toLowerCase().includes("fixed") ||
            name.toLowerCase().includes("asset")
        );

        if (potentialSheets.length > 0) {
          return {
            found: true,
            sheetName: potentialSheets[0],
            warning: `Using "${potentialSheets[0]}" instead of "${requiredSheet}"`
          };
        }

        // No suitable sheet found
        return {
          found: false,
          message: `Missing required sheet: "${requiredSheet}". Available sheets: ${workbook.SheetNames.join(
            ", "
          )}. Please check your Excel file.`
        };
      }

      /**
       * Parse and validate fixed asset entries from Excel
       * @param {object} workbook - XLSX workbook object
       * @param {string} sheetName - Name of the fixed asset sheet
       * @returns {object} - Parsed fixed asset entries
       * @private
       */
      _parseFixedAssetSheet(workbook, sheetName) {
        try {
          console.group("📄 Detailed Fixed Asset Parsing");
          console.log("Parsing sheet:", sheetName);

          const assetSheet = workbook.Sheets[sheetName];

          if (!assetSheet) {
            throw new Error(
              `Sheet "${sheetName}" not found in workbook. Available sheets: ${workbook.SheetNames.join(
                ", "
              )}`
            );
          }

          const sheetData = window.XLSX.utils.sheet_to_json(assetSheet, {
            raw: false,
            defval: "",
            dateNF: "yyyy-mm-dd"
          });

          if (sheetData.length === 0) {
            throw new Error(
              `Sheet "${sheetName}" contains no data or headers could not be parsed`
            );
          }

          const entries = sheetData.map((row, index) => ({
            id: index + 1,
            Status: "Valid",
            ValidationErrors: [],

            // Fixed Asset Acquisition fields - using flexible column mapping
            SequenceID: this._findColumnValue(row, "SequenceID") || String(index + 1),
            ReferenceDocumentItem: this._findColumnValue(row, "ReferenceDocumentItem") || "",
            BusinessTransactionType: this._findColumnValue(row, "BusinessTransactionType") || "",
            CompanyCode: this._findColumnValue(row, "CompanyCode") || "",
            MasterFixedAsset: this._findColumnValue(row, "MasterFixedAsset") || "",
            FixedAsset: this._findColumnValue(row, "FixedAsset") || "",
            DocumentDate: this._findColumnValue(row, "DocumentDate"),
            PostingDate: this._findColumnValue(row, "PostingDate"),
            AssetValueDate: this._findColumnValue(row, "AssetValueDate"),
            DebitCreditCode: this._findColumnValue(row, "DebitCreditCode") || "",
            FixedAssetYearOfAcqnCode: this._findColumnValue(row, "FixedAssetYearOfAcqnCode") || "",
            DocumentReferenceID: this._findColumnValue(row, "DocumentReferenceID") || "",
            AccountingDocumentHeaderText: this._findColumnValue(row, "AccountingDocumentHeaderText") || "",
            TransactionCurrency: this._findColumnValue(row, "TransactionCurrency") || "",
            AcqnAmtInTransactionCurrency: this._findColumnValue(row, "AcqnAmtInTransactionCurrency"),
            QuantityInBaseUnit: this._findColumnValue(row, "QuantityInBaseUnit"),
            BaseUnitSAPCode: this._findColumnValue(row, "BaseUnitSAPCode") || "",
            BaseUnitISOCode: this._findColumnValue(row, "BaseUnitISOCode") || "",
            AccountingDocumentType: this._findColumnValue(row, "AccountingDocumentType") || "",
            AssignmentReference: this._findColumnValue(row, "AssignmentReference") || "",
            DocumentItemText: this._findColumnValue(row, "DocumentItemText") || "",
            OffsettingAccount: this._findColumnValue(row, "OffsettingAccount") || ""
          }));

          return { entries };
        } catch (error) {
          console.error("Error parsing fixed asset sheet:", error);
          throw error;
        }
      }

      /**
       * Get current date formatted as yyyy-MM-dd
       * @returns {string} Formatted date
       * @private
       */
      _getCurrentDateFormatted() {
        const today = new Date();
        const year = today.getFullYear();
        const month = String(today.getMonth() + 1).padStart(2, "0");
        const day = String(today.getDate()).padStart(2, "0");
        return `${year}-${month}-${day}`;
      }

      /**
       * Update models with fixed asset data
       * @param {object} validationResult - Validation result object
       * @private
       */
      _updateModels(validationResult) {
        console.group("🔄 Updating Fixed Asset Models");

        try {
          if (!this._controller) {
            console.warn("Controller not available, skipping model updates");
            console.groupEnd();
            return;
          }

          const view = this._controller.getView();
          if (!view) {
            console.warn("View not available, skipping model updates");
            console.groupEnd();
            return;
          }

          // Get models
          const uploadSummaryModel = view.getModel("uploadSummary");
          const fixedAssetModel = view.getModel("fixedAssetEntries");

          if (!uploadSummaryModel || !fixedAssetModel) {
            console.warn(
              "Required models not available, skipping model updates"
            );
            console.groupEnd();
            return;
          }

          // Get entries from validation result
          const entries = validationResult.entries || [];
          const validEntries = entries.filter(
            (entry) => entry.Status === "Valid"
          );
          const invalidEntries = entries.filter(
            (entry) => entry.Status === "Invalid"
          );

          // Logging
          console.log("Total Entries:", entries.length);
          console.log("Valid Entries:", validEntries.length);
          console.log("Invalid Entries:", invalidEntries.length);

          // Update summary model
          uploadSummaryModel.setProperty("/TotalEntries", entries.length);
          uploadSummaryModel.setProperty(
            "/SuccessfulEntries",
            validEntries.length
          );
          uploadSummaryModel.setProperty(
            "/FailedEntries",
            invalidEntries.length
          );
          uploadSummaryModel.setProperty(
            "/ValidationErrors",
            validationResult.errors || []
          );
          uploadSummaryModel.setProperty(
            "/IsSubmitEnabled",
            validEntries.length > 0
          );
          uploadSummaryModel.setProperty("/HasBeenSubmitted", false);
          uploadSummaryModel.setProperty("/LastUploadDate", new Date());
          uploadSummaryModel.setProperty("/ProcessingComplete", true);

          // Prepare entries for display - include all entries
          if (entries.length > 0) {
            const processedEntries = entries.map((entry) => {
              // Destructure to remove unnecessary properties
              const { id, RawData, ...assetItem } = entry;

              return {
                ...assetItem,
                Status: entry.Status // Explicitly preserve Status
              };
            });

            console.log(
              "Processed Entries for display:",
              processedEntries.length
            );

            // Set items directly in the model
            fixedAssetModel.setProperty("/entries", processedEntries);
            fixedAssetModel.setProperty(
              "/validationStatus",
              validationResult.isValid ? "Valid" : "Invalid"
            );
            fixedAssetModel.setProperty(
              "/filteredCount",
              processedEntries.length
            );

            // Force model refresh
            fixedAssetModel.refresh(true);
          }

          console.groupEnd();
        } catch (error) {
          console.error("Error updating models:", error);
          console.groupEnd();
          throw error;
        }
      }

      /**
       * Show processing results to the user
       * @param {Object} validationResult - Validation result object
       * @param {String} fileName - Name of the processed file
       * @private
       */
      _showProcessingResults(validationResult, fileName) {
        if (!validationResult || !validationResult.entries) {
          MessageToast.show("No valid entries were found in the file.");
          return;
        }

        const entriesLength = validationResult.entries ? validationResult.entries.length : 0;
        const validCount = validationResult.validCount || 0;
        const errorCount = validationResult.errorCount || 0;

        // Show basic results message
        MessageToast.show(
          `File processed: ${entriesLength} entries found (${validCount} valid, ${errorCount} invalid)`
        );

        // If there are validation errors, show detailed error dialog
        if (validationResult.isValid === false && this._controller && this._controller._uiManager) {
          this._controller._uiManager.handleValidationErrors(
            validationResult.errors || []
          );
        }
      }

      /**
       * Clear the file uploader control
       * @private
       */
      _clearFileUploader() {
        if (this._controller) {
          const view = this._controller.getView();
          if (view) {
            const oFileUploader = view.byId("fileUploader");
            if (oFileUploader) {
              oFileUploader.clear();
            }
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
          const ws = window.XLSX.utils.json_to_sheet(
            invalidEntries.map((entry) => {
              // Map validation errors to a string
              const errorMessages = entry.ValidationErrors
                ? entry.ValidationErrors.map((err) => {
                  if (typeof err === "string") return err;
                  return err.message || JSON.stringify(err);
                }).join("; ")
                : "";

              // Create a clean object with all needed fields and add validation errors
              return {
                ...entry,
                ValidationErrorMessages: errorMessages
              };
            })
          );

          // Add the worksheet to the workbook
          window.XLSX.utils.book_append_sheet(wb, ws, "Invalid Fixed Assets");

          // Generate filename with date
          const now = new Date();
          const timestamp = now.toISOString().slice(0, 10);
          const filename = `Invalid_Fixed_Assets_${timestamp}.xlsx`;

          // Save the file
          window.XLSX.writeFile(wb, filename);

          // Show success message
          MessageToast.show(`Invalid records exported to ${filename}`);
        } catch (error) {
          console.error("Error exporting invalid records:", error);
          MessageBox.error(
            "Failed to export invalid records: " + error.message
          );
        }
      }

      /**
       * Create a template Excel file for fixed asset acquisition
       * @returns {ArrayBuffer} Excel file as ArrayBuffer
       */
      createTemplateFile() {
        const wb = window.XLSX.utils.book_new();

        // Template headers
        const headers = [
          "SequenceID",
          "ReferenceDocumentItem",
          "BusinessTransactionType",
          "CompanyCode",
          "MasterFixedAsset",
          "FixedAsset",
          "DocumentDate",
          "PostingDate",
          "AssetValueDate",
          "DebitCreditCode",
          "FixedAssetYearOfAcqnCode",
          "DocumentReferenceID",
          "AccountingDocumentHeaderText",
          "TransactionCurrency",
          "AcqnAmtInTransactionCurrency",
          "QuantityInBaseUnit",
          "BaseUnitSAPCode",
          "BaseUnitISOCode",
          "AccountingDocumentType",
          "AssignmentReference",
          "DocumentItemText",
          "OffsettingAccount"
        ];

        // Sample data
        const sampleData = [
          {
            SequenceID: "FA001",
            ReferenceDocumentItem: "1000000123",
            BusinessTransactionType: "100",
            CompanyCode: "1000",
            MasterFixedAsset: "10000123",
            FixedAsset: "20000123",
            DocumentDate: "2024-03-20",
            PostingDate: "2024-03-20",
            AssetValueDate: "2024-03-20",
            DebitCreditCode: "D",
            FixedAssetYearOfAcqnCode: "2024",
            DocumentReferenceID: "REF123",
            AccountingDocumentHeaderText: "Asset Acquisition",
            TransactionCurrency: "USD",
            AcqnAmtInTransactionCurrency: "10000.00",
            QuantityInBaseUnit: "1",
            BaseUnitSAPCode: "EA",
            BaseUnitISOCode: "EA",
            AccountingDocumentType: "AA",
            AssignmentReference: "PO123456",
            DocumentItemText: "New Equipment Purchase",
            OffsettingAccount: "100000"
          }
        ];

        // Create worksheet
        const ws = window.XLSX.utils.json_to_sheet(sampleData, {
          header: headers
        });

        // Add worksheet to workbook
        window.XLSX.utils.book_append_sheet(wb, ws, "Fixed Asset Acquisitions");

        // Add help sheet
        this._addHelpSheet(wb);

        return wb;
      }

      /**
       * Add a help sheet to the template workbook
       * @param {Object} wb - XLSX workbook
       * @private
       */
      _addHelpSheet(wb) {
        // Get field constraints description from ValidationManager
        const fieldDescriptions =
          this._validationManager.getFieldConstraintsDescription();

        // Prepare help data
        const helpData = Object.keys(fieldDescriptions).map((field) => {
          return {
            "Field Name": field,
            Description: fieldDescriptions[field]
          };
        });

        // Add general instructions
        helpData.unshift(
          {
            "Field Name": "INSTRUCTIONS",
            Description:
              "This template is used for uploading fixed asset acquisitions. Fill in all required fields."
          },
          {
            "Field Name": "",
            Description: "Fields marked as 'Required' must not be left empty."
          },
          {
            "Field Name": "",
            Description:
              "Dates must be in YYYY-MM-DD format (e.g., 2023-04-17)."
          },
          {
            "Field Name": "",
            Description:
              "Amounts should be entered without currency symbols (e.g., 1000.00)."
          },
          {
            "Field Name": "",
            Description: ""
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