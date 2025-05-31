sap.ui.define(
  [
    "sap/m/MessageBox",
    "sap/m/MessageToast",
    "assetretirementwr/service/ValidationManager",
    "assetretirementwr/utils/DataTransformer",
    "assetretirementwr/utils/ErrorHandler"
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
     * ExcelProcessor for Fixed Asset Retirement
     * Responsible for parsing and processing Excel files for Fixed Asset Retirement
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

        // Column mapping to handle different header formats for Asset Retirement
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
          FxdAstRetirementRevenueType: ["FxdAstRetirementRevenueType", "Fixed Asset Retirement Revenue Type", "Revenue Type", "RetirementRevenueType", "Retirement Revenue Type"],
          AstRevenueAmountInTransCrcy: ["AstRevenueAmountInTransCrcy", "Asset Revenue Amount In Transaction Currency", "Revenue Amount", "RevenueAmount"],
          FxdAstRtrmtRevnTransCrcy: ["FxdAstRtrmtRevnTransCrcy", "Fixed Asset Retirement Revenue Transaction Currency", "Revenue Currency", "revenue_currency", "Currency", "Currency Code"],
          FxdAstRtrmtRevnCurrencyRole: ["FxdAstRtrmtRevnCurrencyRole", "Fixed Asset Retirement Revenue Currency Role", "Currency Role", "RevenueCurrencyRole"],
          FixedAssetRetirementType: ["FixedAssetRetirementType", "Retirement Type", "retirement_type", "Asset Retirement Type", "Fixed Asset Retirement Type"],
          DocumentReferenceID: ["DocumentReferenceID", "Document Reference ID", "document_reference_id", "Doc Ref ID", "Reference ID"],
          AccountingDocumentHeaderText: ["AccountingDocumentHeaderText", "Accounting Document Header Text", "accounting_document_header_text", "Header Text", "Doc Header Text"],
          BaseUnitSAPCode: ["BaseUnitSAPCode", "Base Unit SAP Code", "base_unit_sap_code", "SAP Unit", "Unit SAP Code"],
          BaseUnitISOCode: ["BaseUnitISOCode", "Base Unit ISO Code", "base_unit_iso_code", "ISO Unit", "Unit ISO Code"],
          AccountingDocumentType: ["AccountingDocumentType", "Accounting Document Type", "accounting_document_type", "Doc Type", "Document Type"],
          AssignmentReference: ["AssignmentReference", "Assignment Reference", "assignment_reference", "Assignment Ref", "Assignment"],
          DocumentItemText: ["DocumentItemText", "Document Item Text", "document_item_text", "Item Text"]
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
       * Process an Excel file for Fixed Asset Retirement
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

              // Verify and find the fixed asset retirement sheet
              const sheetInfo = this._findFixedAssetSheet(workbook);

              if (!sheetInfo.found) {
                // Show error message to user instead of throwing
                MessageBox.error(sheetInfo.message, {
                  title: "Incorrect Sheet Name",
                  actions: [MessageBox.Action.CLOSE]
                });
                return reject(new Error(sheetInfo.message));
              }

              // If there's a warning about sheet name, show it to the user
              if (sheetInfo.warning) {
                MessageBox.warning(sheetInfo.warning, {
                  title: "Sheet Name Notice",
                  actions: [MessageBox.Action.CLOSE]
                });
              }

              // Parse fixed asset retirement sheet
              const parsedData = this._parseFixedAssetSheet(
                workbook,
                sheetInfo.sheetName
              );

              // Validate fixed asset entries using the ValidationManager
              const validationResult =
                this._validationManager.validateFixedAssetRetirementEntries(
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
        const requiredSheet = "Asset Retirements";
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
            (name.toLowerCase().includes("fixed") && name.toLowerCase().includes("retirement")) ||
            (name.toLowerCase().includes("asset") && name.toLowerCase().includes("retirement"))
        );

        if (potentialSheets.length > 0) {
          return {
            found: true,
            sheetName: potentialSheets[0],
            warning: `Using "${potentialSheets[0]}" instead of "${requiredSheet}"`
          };
        }

        // No suitable sheet found - prepare detailed error message for user
        const availableSheets = workbook.SheetNames.map(name => `• ${name}`).join('\n');
        const errorMessage = `The required sheet "${requiredSheet}" was not found in your Excel file.\n\n` +
          `Please ensure your file contains a sheet with one of these names:\n` +
          `• "${requiredSheet}"\n` +
          `• A sheet containing both "Asset" and "Retirement" in the name\n\n` +
          `Available sheets in your file:\n${availableSheets}`;

        return {
          found: false,
          message: errorMessage
        };
      }


      /**
       * Parse and validate fixed asset retirement entries from Excel
       * @param {object} workbook - XLSX workbook object
       * @param {string} sheetName - Name of the fixed asset sheet
       * @returns {object} - Parsed fixed asset retirement entries
       * @private
       */
      _parseFixedAssetSheet(workbook, sheetName) {
        try {
          console.group("📄 Detailed Fixed Asset Retirement Parsing");
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

            // Fixed Asset Retirement fields - using flexible column mapping
            SequenceID: this._findColumnValue(row, "SequenceID") || String(index + 1),
            ReferenceDocumentItem: this._findColumnValue(row, "ReferenceDocumentItem") || "",
            BusinessTransactionType: this._findColumnValue(row, "BusinessTransactionType") || "",
            CompanyCode: this._findColumnValue(row, "CompanyCode") || "",
            MasterFixedAsset: this._findColumnValue(row, "MasterFixedAsset") || "",
            FixedAsset: this._findColumnValue(row, "FixedAsset") || "",
            DocumentDate: this._findColumnValue(row, "DocumentDate"),
            PostingDate: this._findColumnValue(row, "PostingDate"),
            AssetValueDate: this._findColumnValue(row, "AssetValueDate"),
            // New fields for retirement with revenue
            FxdAstRetirementRevenueType: this._findColumnValue(row, "FxdAstRetirementRevenueType") || "",
            AstRevenueAmountInTransCrcy: this._findColumnValue(row, "AstRevenueAmountInTransCrcy") || "",
            FxdAstRtrmtRevnTransCrcy: this._findColumnValue(row, "FxdAstRtrmtRevnTransCrcy") || "",
            FxdAstRtrmtRevnCurrencyRole: this._findColumnValue(row, "FxdAstRtrmtRevnCurrencyRole") || "",
            // Continue with other fields
            FixedAssetRetirementType: this._findColumnValue(row, "FixedAssetRetirementType") || "",
            DocumentReferenceID: this._findColumnValue(row, "DocumentReferenceID") || "",
            AccountingDocumentHeaderText: this._findColumnValue(row, "AccountingDocumentHeaderText") || "",
            BaseUnitSAPCode: this._findColumnValue(row, "BaseUnitSAPCode") || "",
            BaseUnitISOCode: this._findColumnValue(row, "BaseUnitISOCode") || "",
            AccountingDocumentType: this._findColumnValue(row, "AccountingDocumentType") || "",
            AssignmentReference: this._findColumnValue(row, "AssignmentReference") || "",
            DocumentItemText: this._findColumnValue(row, "DocumentItemText") || ""
          }));

          return { entries };
        } catch (error) {
          console.error("Error parsing fixed asset retirement sheet:", error);
          throw error;
        }
      }

      /**
       * Update models with fixed asset retirement data
       * @param {object} validationResult - Validation result object
       * @private
       */
      _updateModels(validationResult) {
        console.group("🔄 Updating Fixed Asset Retirement Models");

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
          window.XLSX.utils.book_append_sheet(wb, ws, "Invalid Fixed Asset Retirements");

          // Generate filename with date
          const now = new Date();
          const timestamp = now.toISOString().slice(0, 10);
          const filename = `Invalid_Fixed_Asset_Retirements_${timestamp}.xlsx`;

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
       * Create a template Excel file for fixed asset retirement
       * @returns {ArrayBuffer} Excel file as ArrayBuffer
       */
      createTemplateFile() {
        const wb = window.XLSX.utils.book_new();

        // Template headers for retirement
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
          "FxdAstRetirementRevenueType",
          "AstRevenueAmountInTransCrcy",
          "FxdAstRtrmtRevnTransCrcy",
          "FxdAstRtrmtRevnCurrencyRole",
          "FixedAssetRetirementType",
          "DocumentReferenceID",
          "AccountingDocumentHeaderText",
          "BaseUnitSAPCode",
          "BaseUnitISOCode",
          "AccountingDocumentType",
          "AssignmentReference",
          "DocumentItemText"
        ];

        // Sample data with revenue fields
        const sampleData = [
          {
            SequenceID: "FR001",
            ReferenceDocumentItem: "000001",
            BusinessTransactionType: "RA20",
            CompanyCode: "1000",
            MasterFixedAsset: "20002290",
            FixedAsset: "0",
            DocumentDate: "2025-03-12",
            PostingDate: "2025-03-12",
            AssetValueDate: "2025-03-12",
            FxdAstRetirementRevenueType: "1",
            AstRevenueAmountInTransCrcy: "200.00",
            FxdAstRtrmtRevnTransCrcy: "INR",
            FxdAstRtrmtRevnCurrencyRole: "10",
            FixedAssetRetirementType: "1",
            DocumentReferenceID: "REF-ID",
            AccountingDocumentHeaderText: "Header text",
           BaseUnitSAPCode: "EA",
            BaseUnitISOCode: "EA",
            AccountingDocumentType: "SA",
            AssignmentReference: "Ass ref",
            DocumentItemText: "Item text"
          }
        ];

        // Create worksheet
        const ws = window.XLSX.utils.json_to_sheet(sampleData, {
          header: headers
        });

        // Add worksheet to workbook
        window.XLSX.utils.book_append_sheet(wb, ws, "Asset Retirements");

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
        // Help data with revenue retirement fields included
        const helpData = [
          {
            "Field Name": "INSTRUCTIONS",
            Description:
              "This template is used for uploading fixed asset retirements. Fill in all required fields."
          },
          {
            "Field Name": "",
            Description: "Fields marked as 'Required' must not be left empty."
          },
          {
            "Field Name": "",
            Description:
              "Dates must be in YYYY-MM-DD format (e.g., 2025-03-12)."
          },
          {
            "Field Name": "",
            Description:
              "Amounts should be entered without currency symbols (e.g., 200.00)."
          },
          {
            "Field Name": "",
            Description: ""
          },
          {
            "Field Name": "SequenceID",
            Description: "Unique identifier for the record (Required)"
          },
          {
            "Field Name": "ReferenceDocumentItem",
            Description: "Reference to the document item"
          },
          {
            "Field Name": "BusinessTransactionType",
            Description: "Transaction type code (e.g., RA20 for retirement with revenue, RA21 for retirement without revenue) (Required)"
          },
          {
            "Field Name": "CompanyCode",
            Description: "SAP Company Code (Required)"
          },
          {
            "Field Name": "MasterFixedAsset",
            Description: "Master Fixed Asset number (Required)"
          },
          {
            "Field Name": "FixedAsset",
            Description: "Fixed Asset number"
          },
          {
            "Field Name": "DocumentDate",
            Description: "Date of the document (YYYY-MM-DD) (Required)"
          },
          {
            "Field Name": "PostingDate",
            Description: "Date of posting (YYYY-MM-DD) (Required)"
          },
          {
            "Field Name": "AssetValueDate",
            Description: "Asset value date (YYYY-MM-DD) (Required)"
          },
          {
            "Field Name": "FxdAstRetirementRevenueType",
            Description: "Type of retirement revenue (e.g., 1)"
          },
          {
            "Field Name": "AstRevenueAmountInTransCrcy",
            Description: "Amount of revenue in transaction currency (e.g., 200.00)"
          },
          {
            "Field Name": "FxdAstRtrmtRevnTransCrcy",
            Description: "Currency code for revenue (e.g., INR, USD)"
          },
          {
            "Field Name": "FxdAstRtrmtRevnCurrencyRole",
            Description: "Currency role code (e.g., 10)"
          },
          {
            "Field Name": "FixedAssetRetirementType",
            Description: "Type of retirement (e.g., 1) (Required)"
          },
          {
            "Field Name": "DocumentReferenceID",
            Description: "Reference ID for the document"
          },
          {
            "Field Name": "AccountingDocumentHeaderText",
            Description: "Header text for accounting document"
          },          
          {
            "Field Name": "BaseUnitSAPCode",
            Description: "SAP code for the base unit (e.g., EA)"
          },
          {
            "Field Name": "BaseUnitISOCode",
            Description: "ISO code for the base unit (e.g., EA)"
          },
          {
            "Field Name": "AccountingDocumentType",
            Description: "Type of accounting document (e.g., SA)"
          },
          {
            "Field Name": "AssignmentReference",
            Description: "Reference for the assignment"
          },
          {
            "Field Name": "DocumentItemText",
            Description: "Text for the document item"
          }
        ];

        // Create help worksheet
        const wsHelp = window.XLSX.utils.json_to_sheet(helpData);

        // Add to workbook
        window.XLSX.utils.book_append_sheet(wb, wsHelp, "Help");
      }
    };
  }
);