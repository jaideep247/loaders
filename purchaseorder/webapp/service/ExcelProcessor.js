sap.ui.define(
  [
    "sap/m/MessageBox",
    "sap/m/MessageToast",
    "purchaseorder/service/ValidationManager",
    "purchaseorder/utils/DateUtils"
  ],
  function (MessageBox, MessageToast, ValidationManager, DateUtils) {
    "use strict";

    /**
     * ExcelProcessor
     * Responsible for parsing and processing Excel files for Purchase Orders
     */
    return function (oController) {
      this.oController = oController;

      // Initialize the ValidationManager
      this._validationManager = new ValidationManager(oController);

      /**
       * Process an Excel file
       * @param {File} file - The Excel file to process
       */
      this.processExcelFile = function (file) {
        return new Promise((resolve, reject) => {
          const reader = new FileReader();

          reader.onerror = (e) => {
            console.error("FileReader error:", e);
            reject(new Error("Error reading file. Please try again."));
          };

          reader.onload = (e) => {
            try {
              if (!window.XLSX) {
                throw new Error("XLSX library not loaded");
              }

              // Show processing message
              MessageToast.show("Processing file...");

              const workbook = window.XLSX.read(e.target.result, {
                type: "binary"
              });

              // Verify required sheets for purchase order
              const requiredSheets = ["Purchase Orders"];

              // First check if the exact required sheet name exists
              let poSheetFound = workbook.SheetNames.includes("Purchase Orders");

              // If not found, try to find a sheet with a similar name
              let actualPOSheetName = requiredSheets;
              if (!poSheetFound) {
                // Check for variations like case insensitive match or with/without spaces
                const potentialSheetNames = workbook.SheetNames.filter(
                  (name) =>
                    name.toLowerCase().includes("purchase") ||
                    name.toLowerCase().includes("order") ||
                    name
                      .toLowerCase()
                      .replace(/\s+/g, "")
                      .includes("purchaseorders")
                );

                if (potentialSheetNames.length > 0) {
                  // Use the first matching sheet
                  actualPOSheetName = potentialSheetNames[0];
                  poSheetFound = true;
                  console.log(
                    "Found alternative sheet name:",
                    actualPOSheetName
                  );
                }
              }

              if (!poSheetFound) {
                throw new Error(
                  `Missing required sheet: Purchase Orders. Available sheets: ${workbook.SheetNames.join(
                    ", "
                  )}. Please check your Excel file template or worksheet name.`
                );
              }

              // Parse purchase order sheet
              const parsedData = this._parsePurchaseOrderSheet(
                workbook,
                actualPOSheetName
              );

              // Validate purchase orders using the ValidationManager
              const validationResult = this._validationManager.validatePurchaseOrders(
                parsedData.entries
              );

              // Update models with purchase order data
              this._updatePurchaseOrderModels(validationResult.entries);

              // Update upload timestamp
              const uploadSummaryModel = this.oController
                .getView()
                .getModel("uploadSummary");
              uploadSummaryModel.setProperty("/LastUploadDate", new Date());
              uploadSummaryModel.setProperty("/ProcessingComplete", true);

              // Show success message
              MessageToast.show(
                `File processed: ${validationResult.entries.length} entries found`
              );

              // Handle validation errors if any
              if (!validationResult.isValid) {
                // Update the errors in the model
                uploadSummaryModel.setProperty(
                  "/ValidationErrors",
                  validationResult.errors
                );

                // Show validation statistics using UIManager
                this._showValidationResults(validationResult.entries);
              }

              // Clear the file input field
              var oFileUploader = this.oController.getView().byId("fileUploader");
              if (oFileUploader) {
                oFileUploader.clear();
              }

              // Resolve the promise with the validation result
              resolve(validationResult);
            } catch (error) {
              console.error("Excel Processing Error", error);
              reject(error);
            }
          };

          try {
            // Read the file as an array buffer (safer than binary for large files)
            reader.readAsArrayBuffer(file);
          } catch (error) {
            console.error("Error initiating file read:", error);
            reject(new Error("Error initiating file read: " + error.message));
          }
        });
      };

      /**
       * Show validation results using UIManager
       * @param {Array} entries - All entries (valid and invalid)
       * @private
       */
      this._showValidationResults = function (entries) {
        // Get a reference to the UIManager
        const uiManager = this.oController._uiManager;
        if (!uiManager) {
          console.error("UIManager not available");
          return;
        }

        // Count valid and invalid entries
        const validEntries = entries.filter(entry => entry.Status === "Valid");
        const invalidEntries = entries.filter(entry => entry.Status === "Invalid");

        // If there are invalid entries, prepare for error summary
        if (invalidEntries.length > 0) {
          // Format validation errors for display
          const validationErrors = invalidEntries.flatMap(entry =>
            entry.ValidationErrors.map(error => ({
              sequenceId: entry.Sequence,
              field: error.field,
              message: error.message,
              timestamp: new Date().toISOString()
            }))
          );
          console.log(validationErrors);
          // Get export manager reference for exporting errors
          const exportManager = this.oController._exportManager;

          // Show error summary dialog
          uiManager.handleValidationErrors(validationErrors, exportManager);
        }
      };

      /**
       * Export invalid entries to Excel
       * @param {Array} invalidEntries - Invalid entries to export
       */
      this.exportInvalidEntries = function (invalidEntries) {
        try {
          if (!window.XLSX) {
            MessageBox.error("XLSX library not loaded");
            return;
          }

          // Format data for export
          const exportData = invalidEntries.map(entry => {
            // Create a flattened version of the entry for export
            const flatEntry = {
              "Sequence": sequence,
              "Status": "Invalid",
              "Error Message": entry.ValidationErrors.map(e => e.message).join("; "),
              "Error Fields": entry.ValidationErrors.map(e => e.field).join(", "),
              "Company Code": entry.CompanyCode || "",
              "Supplier": entry.SupplierAccountNumber || "",
              "Document Type": entry.PurchasingDocumentType || ""
            };

            return flatEntry;
          });

          // Create worksheet
          const ws = window.XLSX.utils.json_to_sheet(exportData);

          // Create workbook
          const wb = window.XLSX.utils.book_new();
          window.XLSX.utils.book_append_sheet(wb, ws, "Invalid Entries");

          // Save file
          const today = new Date();
          const fileName = `Invalid_PO_Entries_${today.getFullYear()}${(today.getMonth() + 1).toString().padStart(2, '0')}${today.getDate().toString().padStart(2, '0')}.xlsx`;

          window.XLSX.writeFile(wb, fileName);

          MessageToast.show("Invalid entries exported successfully");
        } catch (error) {
          console.error("Error exporting invalid entries:", error);
          MessageBox.error(`Failed to export invalid entries: ${error.message}`);
        }
      };

      /**
       * Parse and validate purchase orders from Excel
       * @param {object} workbook - XLSX workbook object
       * @param {string} poSheetName - Name of the purchase orders sheet
       * @returns {object} - Parsed purchase orders
       */
      this._parsePurchaseOrderSheet = function (
        workbook,
        poSheetName = "Purchase Orders"
      ) {
        try {
          // Get the purchase orders sheet
          const poSheet = workbook.Sheets[poSheetName];

          if (!poSheet) {
            throw new Error(
              `Sheet "${poSheetName}" not found in workbook. Available sheets: ${workbook.SheetNames.join(
                ", "
              )}`
            );
          }

          console.log("Parsing sheet:", poSheetName);

          // Parse sheet to JSON (assuming the first row contains headers)
          const sheetData = window.XLSX.utils.sheet_to_json(poSheet, {
            raw: false, // Don't convert dates, we'll handle that manually
            defval: "" // Default empty cells to empty string
          });

          console.log("Sheet data rows:", sheetData.length);

          if (sheetData.length === 0) {
            throw new Error(
              `Sheet "${poSheetName}" contains no data or headers could not be parsed`
            );
          }

          // Log headers to help with debugging
          console.log("Headers found:", Object.keys(sheetData[0]));

          // Map the entries to the required format
          const entries = sheetData.map((row, index) => {

            // Debug log for each row
            console.log(
              `Processing row ${index + 1}:`,
              JSON.stringify(row).substring(0, 100) + "..."
            );

            // Create a purchase order item from the Excel row
            return {
              id: index + 1,
              // Use Sequence if available, otherwise generate one
              Sequence: row.Sequence,
              Status: "Valid", // Initial status, will be updated during validation
              ValidationErrors: [],
              // Map fields to match OData service structure with exact mappings from template
              LegacyPurchasingDocumentNumber: row["Legacy Purchasing Document Number"] || "",
              CompanyCode: row["Company Code"] || "",
              PurchasingDocumentType: row["Purchasing Document Type"] || "",
              SupplierAccountNumber: row["Supplier Account Number"] || "",
              PurchasingOrganization: row["Purchasing Organization"] || "",
              PurchasingGroup: row["Purchasing Group"] || "",
              PurchasingDocumentDate: this._parseExcelDate(row["Purchasing Document Date"]),
              PurchasingDocumentNumber: row["Purchasing Document Number"] || "",
              ItemNumberOfPurchasingDocument: row["Item Number of Purchasing Document"] || "",
              AccountAssignmentCategory: row["Account Assignment Category"] || "",
              ProductNumber: row["Product Number"] || "",
              Plant: row["Plant"] || "",
              StorageLocation: row["Storage Location"] || "",
              OrderQuantity: row["Order Quantity"] || "0",
              DeliveryDays: row["Delivery Days"] || "0",
              NetPrice: row["Net Price"] || "0",
              PriceUnit: row["Price Unit"] || "1",
              TaxCode: row["Tax Code"] || "",
              Return: row["Return"] || "",
              PurchaseContract: row["Purchase Contract"] || "",
              PurchaseContractItem: row["Purchase Contract Item"] || "",
              AccountAssignmentnumber: row["Account Assignment number"] || "",
              WBSElementExternalID: row["WBSElementExternalID"] || "",
              CostCenter: row["Cost Center"] || "",
              GLAccountNumber: row["GL Account Number"] || "",
              ItemText: row["Item Text"] || "",
              PerformancePeriodEndDate: row["Performance End Date"] || "",
              PerformancePeriodStartDate: row["Performance Start Date"] || "",
              RawData: row // Keep the raw data for reference
            };
          });

          console.log(`Parsed ${entries.length} entries successfully`);
          return {
            entries: entries
          };
        } catch (error) {
          console.error("Error parsing purchase order sheet:", error);
          throw error;
        }
      };

      /**
       * Update models with purchase order data
       * @param {array} entries - Validated purchase orders
       */
      this._updatePurchaseOrderModels = function (entries) {
        try {
          const uploadSummaryModel = this.oController
            .getView()
            .getModel("uploadSummary");

          const validEntries = entries.filter(
            (entry) => entry.Status === "Valid"
          );
          const invalidEntries = entries.filter(
            (entry) => entry.Status === "Invalid"
          );

          // Update the summary model
          uploadSummaryModel.setProperty("/TotalEntries", entries.length);
          uploadSummaryModel.setProperty(
            "/SuccessfulEntries",
            validEntries.length
          );
          uploadSummaryModel.setProperty("/FailedEntries", invalidEntries.length);
          uploadSummaryModel.setProperty(
            "/ValidationErrors",
            invalidEntries.flatMap((entry) => entry.ValidationErrors)
          );
          uploadSummaryModel.setProperty(
            "/IsSubmitEnabled",
            validEntries.length > 0
          );

          // Store all entries including invalid ones in the model
          uploadSummaryModel.setProperty("/AllEntries", entries);

          // Update purchase order model with the data - now include both valid and invalid entries
          const oPurchaseOrderModel = this.oController.getView().getModel("purchaseOrders");
          if (oPurchaseOrderModel) {
            // Set all entries in the model, including invalid ones
            oPurchaseOrderModel.setProperty("/entries", entries.map(
              (entry) => {
                const {
                  id,
                  RawData,
                  ...poItem
                } = entry;
                return {
                  ...poItem,
                  ValidationErrors: entry.ValidationErrors, // Explicitly preserve ValidationErrors
                  Status: entry.Status,
                  HasErrors: entry.Status === "Invalid"
                };
              }
            ));

            // Also store a reference to valid entries for submission
            oPurchaseOrderModel.setProperty("/validEntries", validEntries.map(
              (entry) => {
                const {
                  id,
                  ValidationErrors,
                  RawData,
                  ...poItem
                } = entry;
                return {
                  ...poItem,
                  Status: entry.Status
                };
              }
            ));
          }
        } catch (error) {
          console.error("Error updating models:", error);
          throw new Error("Failed to update models: " + error.message);
        }
      };

      /**
       * Parse Excel date value
       * @param {any} excelDate - Date from Excel
       * @returns {Date} - JavaScript Date object
       */
      this._parseExcelDate = function (excelDate) {
        return DateUtils.parseExcelDate(excelDate);
      };
    };
  }
);