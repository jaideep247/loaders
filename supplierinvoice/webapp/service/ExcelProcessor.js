// ExcelProcessor.js
sap.ui.define([
  "sap/m/MessageBox",
  "sap/m/MessageToast"
], function (MessageBox, MessageToast) {
  "use strict";

  /**
   * ExcelProcessor
   * Responsible for parsing and processing Excel files for supplier invoices
   */
  return function (oController) {
    this.oController = oController;

    /**
     * Process an Excel file for supplier invoices
     * @param {File} file - The Excel file to process
     */
    this.processExcelFile = function (file) {
      const reader = new FileReader();

      reader.onerror = (e) => {
        console.error("FileReader error:", e);
        MessageBox.error("Error reading file. Please try again.");
        this.oController._errorHandler.logError('FileReader Error', {
          fileName: file.name,
          errorMessage: e.message
        });
      };

      reader.onload = (e) => {
        try {
          if (!XLSX) {
            throw new Error("XLSX library not loaded");
          }

          // Show processing message
          MessageToast.show("Processing supplier invoice file...");

          const workbook = XLSX.read(e.target.result, { type: "binary" });

          // Verify required sheets
          const requiredSheets = ["Header_and_Credits", "Debits"];
          const missingSheets = requiredSheets.filter(sheet => !workbook.SheetNames.includes(sheet));

          if (missingSheets.length > 0) {
            throw new Error(`Missing required sheets: ${missingSheets.join(", ")}. Please check your Excel file template.`);
          }

          const parsedData = this._parseSupplierInvoiceWorkbook(workbook);
          console.log("Parsed Supplier Invoice Data", parsedData);

          // Get the validation manager
          const validationManager = this.oController._validationManager;

          // Validate the parsed data
          const validationResult = validationManager.validateSupplierInvoices(parsedData);

          // Update models with validation results
          this._updateModelsWithValidEntries(validationResult.entries);

          // Update upload timestamp
          const uploadSummaryModel = this.oController.getView().getModel("uploadSummary");
          uploadSummaryModel.setProperty("/LastUploadDate", new Date());
          uploadSummaryModel.setProperty("/ProcessingComplete", true);

          // Show success message
          MessageToast.show(`File processed: ${validationResult.entries.length} supplier invoice entries found`);

          // Handle validation errors if any
          if (!validationResult.isValid) {
            const enhancedErrors = validationResult.errors.map(error => {
              const errorObj = {
                message: error.message || error,
                sheet: error.sheet || "Unknown",
                sequenceId: error.sequenceId || "N/A"
              };

              // Try to extract sequence ID from error message if not provided
              if (!errorObj.sequenceId && typeof error === "string") {
                const seqMatch = error.match(/(?:sequence|seq|id)[\s:]?(\d+)/i);
                if (seqMatch && seqMatch[1]) {
                  errorObj.sequenceId = seqMatch[1];
                }
              }

              return errorObj;
            });

            this.oController._uiManager.handleValidationErrors(enhancedErrors);
          }

          // Clear the file input field
          var oFileUploader = this.oController.getView().byId("fileUploader");
          if (oFileUploader) {
            oFileUploader.clear();
          }
        } catch (error) {
          this.oController._errorHandler.logError('Excel Processing Error', {
            fileName: file.name,
            errorMessage: error.message,
            errorStack: error.stack
          });

          MessageBox.error(`Error processing file: ${file.name}`, {
            details: error.message,
            actions: [MessageBox.Action.CLOSE]
          });
        }
      };

      reader.readAsArrayBuffer(file);
    };

    /**
     * Format Excel date to YYYY-MM-DD format
     * @param {*} excelDate - Date in Excel format
     * @returns {string} Formatted date string
     */
    this._formatExcelDate = function (excelDate) {
      if (!excelDate) return "";

      // Check if it's already a date string
      if (typeof excelDate === 'string') {
        const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
        if (dateRegex.test(excelDate)) {
          return excelDate;
        }
        return excelDate;
      }

      // Handle Excel serial date format
      try {
        const date = new Date(Math.round((excelDate - 25569) * 86400 * 1000));
        return date.toISOString().split('T')[0];
      } catch (e) {
        console.warn("Failed to parse Excel date:", excelDate);
        return String(excelDate);
      }
    };

    /**
     * Update models with validated supplier invoice entries
     * @param {array} entries - Validated entries
     */
    this._updateModelsWithValidEntries = function (entries) {
      const uploadSummaryModel = this.oController.getView().getModel("uploadSummary");
      const supplierInvoicesModel = this.oController.getView().getModel("supplierInvoices");

      const validEntries = entries.filter(entry => entry.status === "Valid");
      const invalidEntries = entries.filter(entry => entry.status === "Invalid");

      uploadSummaryModel.setProperty("/TotalEntries", entries.length);
      uploadSummaryModel.setProperty("/SuccessfulEntries", validEntries.length);
      uploadSummaryModel.setProperty("/FailedEntries", invalidEntries.length);
      uploadSummaryModel.setProperty("/ValidationErrors",
        invalidEntries.flatMap(entry => entry.validationErrors)
      );
      uploadSummaryModel.setProperty("/IsSubmitEnabled", validEntries.length > 0);

      supplierInvoicesModel.setProperty("/invoices", entries);
      supplierInvoicesModel.setProperty("/validationStatus",
        invalidEntries.length > 0 ? "Failed" : "Passed"
      );
      supplierInvoicesModel.setProperty("/filteredCount", entries.length);
    };

    /**
     * Parse a supplier invoice workbook into structured data
     * @param {object} workbook - XLSX workbook object
     * @returns {array} - Array of parsed supplier invoice transactions (both header and debit entries)
     */
    this._parseSupplierInvoiceWorkbook = function (workbook) {
      try {
        // Get the current user information
        const userInfo = this.oController.getView().getModel("userInfo").getData();
        const createdBy = (userInfo.firstname + "." + userInfo.lastname.slice(0, 1) || "Unknown User").slice(0, 12);

        // Parse Header_and_Credits Sheet
        const headerSheet = workbook.Sheets["Header_and_Credits"];
        const headerData = XLSX.utils.sheet_to_json(headerSheet, { header: 1 });
        if (headerData.length < 2) {
          throw new Error("Header_and_Credits sheet must contain at least one data row plus header row");
        }
        const headerRows = headerData.slice(1);

        // Parse Debits Sheet
        const debitSheet = workbook.Sheets["Debits"];
        const debitData = XLSX.utils.sheet_to_json(debitSheet, { header: 1 });
        if (debitData.length < 2) {
          throw new Error("Debits sheet must contain at least one data row plus header row");
        }
        const debitRows = debitData.slice(1);

        console.log("Header rows found:", headerRows.length);
        console.log("Debit rows found:", debitRows.length);

        // Store all entries (both header and debit entries)
        const allEntries = [];

        // Process header rows (main invoice data)
        headerRows.forEach((headerRow, index) => {
          if (!headerRow || headerRow.length < 8) { // Check for minimum required columns
            console.warn(`Skipping incomplete header row at index ${index}:`, headerRow);
            return;
          }

          const sequenceId = headerRow[0]; // Sequence Id is in column A

          if (!sequenceId) {
            console.warn(`Skipping header row with invalid sequence ID at index ${index}:`, headerRow);
            return;
          }

          // Create header entry
          const headerEntry = {
            "Sequence Id": sequenceId,
            "CompanyCode": headerRow[1],
            "DocumentDate": this._formatExcelDate(headerRow[2]),
            "PostingDate": this._formatExcelDate(headerRow[3]),
            "SupplierInvoiceIDByInvcgParty": headerRow[4],
            "InvoicingParty": headerRow[5],
            "DocumentCurrency": headerRow[6],
            "InvoiceGrossAmount": headerRow[7],
            "DocumentHeaderText": headerRow[8] || "",
            "PaymentTerms": headerRow[9] || "",
            "Supplierlineitemtext": headerRow[10] || "",
            "AccountingDocumentType": headerRow[11] || "",
            "InvoiceReference": headerRow[12] || "",
            "InvoiceReferenceFiscalYear": headerRow[13] || "",
            "AssignmentReference": headerRow[14] || "",
            "TaxIsCalculatedAutomatically": headerRow[15] || "",
            "BusinessPlace": headerRow[16] || "",
            "BusinessSectionCode": headerRow[17] || "",
            "TaxDeterminationDate": headerRow[18] ? this._formatExcelDate(headerRow[18]) : "",
            "GSTPartner": headerRow[19] || "",
            "GSTPlaceOfSupply": headerRow[20] || "",
            "SupplierInvoiceItem": headerRow[21] || "",
            "s-CompanyCode": headerRow[22] || "",
            "CostCenter": headerRow[23] || "",
            "Created By": createdBy,
            "Sheet": "Header_and_Credits",
            "Entry Type": "Header",
            "TransactionID": `SI-${sequenceId}`
          };

          // Add header entry to the list
          allEntries.push(headerEntry);
          console.log(`Added header entry for Sequence ID: ${sequenceId}`);
        });

        // Process debit rows
        debitRows.forEach((debitRow, index) => {
          if (!debitRow || debitRow.length < 5) { // Check for minimum required columns
            console.warn(`Skipping incomplete debit row at index ${index}:`, debitRow);
            return;
          }

          const sequenceId = debitRow[0]; // Sequence Id is in column A

          if (!sequenceId) {
            console.warn(`Skipping debit row with invalid sequence ID at index ${index}:`, debitRow);
            return;
          }

          // Find corresponding header entry to get common fields
          const headerEntry = allEntries.find(entry =>
            entry["Sequence Id"] === sequenceId && entry["Sheet"] === "Header_and_Credits"
          );

          if (!headerEntry) {
            console.warn(`No matching header found for debit entry with Sequence ID: ${sequenceId}`);
          }

          // Create debit entry
          const debitEntry = {
            // Common fields from header (if available)
            "Sequence Id": sequenceId,
            "CompanyCode": headerEntry ? headerEntry["CompanyCode"] : "",
            "DocumentDate": headerEntry ? headerEntry["DocumentDate"] : "",
            "PostingDate": headerEntry ? headerEntry["PostingDate"] : "",
            "SupplierInvoiceIDByInvcgParty": headerEntry ? headerEntry["SupplierInvoiceIDByInvcgParty"] : "",
            "InvoicingParty": headerEntry ? headerEntry["InvoicingParty"] : "",
            "DocumentCurrency": debitRow[3] || (headerEntry ? headerEntry["DocumentCurrency"] : ""),
            "InvoiceGrossAmount": headerEntry ? headerEntry["InvoiceGrossAmount"] : "",
            "DocumentHeaderText": headerEntry ? headerEntry["DocumentHeaderText"] : "",

            // Debit-specific fields
            "GLAccount": debitRow[1],
            "WBSElement": debitRow[2] || "",
            "SupplierInvoiceItemAmount": debitRow[4],
            "TaxCode": debitRow[5] || "",
            "DebitCreditCode": debitRow[6] || "",
            "SupplierInvoiceItemText": debitRow[7] || "",
            "AssignmentReference": debitRow[8] || "",
            "TDSTAXTYPE": debitRow[9] || "",
            "TDSTAXCODE": debitRow[10] || "",
            "TDSCurrency": debitRow[11] || "",

            // Metadata
            "Created By": createdBy,
            "Sheet": "Debits",
            "Entry Type": "Debit",
            "TransactionID": `SI-${sequenceId}`
          };

          // Add debit entry to the list
          allEntries.push(debitEntry);
          console.log(`Added debit entry for Sequence ID: ${sequenceId}`);
        });

        console.log(`Total entries processed: ${allEntries.length} (${allEntries.filter(e => e.Sheet === "Header_and_Credits").length} headers, ${allEntries.filter(e => e.Sheet === "Debits").length} debits)`);

        return allEntries;
      } catch (error) {
        this.oController._errorHandler.logError('Excel Parsing Error', {
          message: error.message,
          stack: error.stack
        });
        throw error;
      }
    };
  };
});