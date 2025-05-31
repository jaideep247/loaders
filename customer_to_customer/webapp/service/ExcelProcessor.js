sap.ui.define([
  "sap/m/MessageBox",
  "sap/m/MessageToast"
], function (MessageBox, MessageToast) {
  "use strict";

  /**
   * ExcelProcessor
   * Responsible for parsing and processing Excel files
   */
  return function (oController) {
    this.oController = oController;

    /**
     * Process an Excel file
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
          MessageToast.show("Processing file...");

          const workbook = XLSX.read(e.target.result, { type: "binary" });

          // Verify required sheets
          const requiredSheets = ["Header", "Customer Debit Lines", "Customer Credit Lines"];
          const missingSheets = requiredSheets.filter(sheet => !workbook.SheetNames.includes(sheet));

          if (missingSheets.length > 0) {
            throw new Error(`Missing required sheets: ${missingSheets.join(", ")}. Please check your Excel file template.`);
          }

          const parsedData = this._parseMultiSheetWorkbook(workbook);
          console.log("Parsed Data", parsedData);

          // Get the validation manager
          const validationManager = this.oController._validationManager;

          // Validate the parsed data
          const validationResult = validationManager.validateJournalEntries(parsedData);

          // Update models with validation results
          this._updateModelsWithValidEntries(validationResult.entries);

          // Update upload timestamp
          const uploadSummaryModel = this.oController.getView().getModel("uploadSummary");
          uploadSummaryModel.setProperty("/LastUploadDate", new Date());
          uploadSummaryModel.setProperty("/ProcessingComplete", true);

          // Show success message
          MessageToast.show(`File processed: ${validationResult.entries.length} entries found`);

          // Handle validation errors if any
          if (!validationResult.isValid) {
            // Transform error strings into structured objects with sheet and sequence ID information
            const enhancedErrors = validationResult.errors.map(error => {
              // Create a structured error object
              const errorObj = {
                message: error.message || error,
                sheet: "Unknown",
                sequenceId: "N/A"
              };

              // Extract sheet information from error or from references in parsedData
              if (error.sheet) {
                errorObj.sheet = error.sheet;
              } else if (error.entryId && parsedData.entries) {
                // Try to find the entry in parsedData and extract sheet info
                const entry = parsedData.entries.find(e => e.id === error.entryId);
                if (entry) {
                  errorObj.sheet = entry.sourceSheet || "Unknown";
                }
              } else if (typeof error === "string") {
                // Try to extract sheet from error message
                if (error.includes("Header")) errorObj.sheet = "Header";
                else if (error.includes("Debit")) errorObj.sheet = "Customer Debit Lines";
                else if (error.includes("Credit")) errorObj.sheet = "Customer Credit Lines";
              }

              // Extract sequence ID from error or from references in parsedData
              if (error.sequenceId) {
                errorObj.sequenceId = error.sequenceId;
              } else if (error.entryId && parsedData.entries) {
                // Try to find the entry in parsedData and extract sequence ID
                const entry = parsedData.entries.find(e => e.id === error.entryId);
                if (entry) {
                  errorObj.sequenceId = entry.sequenceId || entry.id || "N/A";
                }
              } else if (typeof error === "string") {
                // Try to extract sequence ID from error message
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

          // Show user-friendly error message
          MessageBox.error(`Error processing file: ${file.name}`,
            {
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
        // Try to parse as YYYY-MM-DD
        const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
        if (dateRegex.test(excelDate)) {
          return excelDate;
        }

        // Try other formats or return as is
        return excelDate;
      }

      // Handle Excel serial date format
      try {
        const date = new Date(Math.round((excelDate - 25569) * 86400 * 1000));
        return date.toISOString().split('T')[0]; // YYYY-MM-DD format
      } catch (e) {
        console.warn("Failed to parse Excel date:", excelDate);
        return String(excelDate);
      }
    };

    /**
     * Update models with validated entries
     * @param {array} entries - Validated entries
     */
    this._updateModelsWithValidEntries = function (entries) {
      const uploadSummaryModel = this.oController.getView().getModel("uploadSummary");
      const journalEntriesModel = this.oController.getView().getModel("journalEntries");

      const validEntries = entries.filter(
        (entry) => entry.status === "Valid"
      );
      const invalidEntries = entries.filter(
        (entry) => entry.status === "Invalid"
      );

      uploadSummaryModel.setProperty("/TotalEntries", entries.length);
      uploadSummaryModel.setProperty(
        "/SuccessfulEntries",
        validEntries.length
      );
      uploadSummaryModel.setProperty("/FailedEntries", invalidEntries.length);
      uploadSummaryModel.setProperty(
        "/ValidationErrors",
        invalidEntries.flatMap((entry) => entry.validationErrors)
      );
      uploadSummaryModel.setProperty(
        "/IsSubmitEnabled",
        validEntries.length > 0
      );

      journalEntriesModel.setProperty("/transactions", entries);
      journalEntriesModel.setProperty(
        "/validationStatus",
        invalidEntries.length > 0 ? "Failed" : "Passed"
      );
      journalEntriesModel.setProperty("/filteredCount", entries.length);
    };

    /**
     * Parse a multi-sheet workbook into structured data
     * @param {object} workbook - XLSX workbook object
     * @returns {array} - Array of parsed transactions
     */
    this._parseMultiSheetWorkbook = function (workbook) {
      try {
        const options = {};
        const headerSheetName = options.headerSheet || "Header";
        const customerDebitSheet = options.debitSheet || "Customer Debit Lines";
        const customerCreditSheet = options.creditSheet || "Customer Credit Lines";

        // Get the current user information
        var userInfo = this.oController.getView().getModel("userInfo").getData();
        var createdBy = (userInfo.firstname + "." + userInfo.lastname.slice(0, 1) || "Unknown User").slice(0, 12);

        // Validate sheet existence
        if (!workbook.Sheets[headerSheetName]) {
          throw new Error(`Header sheet "${headerSheetName}" not found in workbook`);
        }
        if (!workbook.Sheets[customerDebitSheet]) {
          throw new Error(`Customer Debit Lines sheet "${customerDebitSheet}" not found in workbook`);
        }
        if (!workbook.Sheets[customerCreditSheet]) {
          throw new Error(`Customer Credit Lines sheet "${customerCreditSheet}" not found in workbook`);
        }

        // Parse Header Sheet
        const headerSheet = workbook.Sheets[headerSheetName];
        const headerData = XLSX.utils.sheet_to_json(headerSheet, { header: 1 });
        if (headerData.length < 2) {
          throw new Error(`${headerSheetName} sheet must contain at least one data row plus header row`);
        }
        const headerRows = headerData.slice(1);

        // Parse Customer Debit and Credit Sheets
        const debitSheet = workbook.Sheets[customerDebitSheet];
        const debitData = XLSX.utils.sheet_to_json(debitSheet, { header: 1 }).slice(1);
        const creditSheet = workbook.Sheets[customerCreditSheet];
        const creditData = XLSX.utils.sheet_to_json(creditSheet, { header: 1 }).slice(1);

        // Helper function to normalize sequence IDs
        const normalizeSequenceId = (id) => {
          return id !== undefined && id !== null ? String(id) : id;
        };

        // Create a structure to group transactions by sequence ID
        const transactionGroups = {};

        headerRows.forEach((headerRow) => {
          if (!headerRow || headerRow.length < 7) {
            console.warn("Skipping incomplete header row:", headerRow);
            return;
          }

          const [
            sequenceId,
            accountingDocType,
            docRefId,
            docHeaderText,
            companyCode,
            docDate,
            postingDate
          ] = headerRow;

          // Normalize the sequence ID to string
          const normalizedSequenceId = normalizeSequenceId(sequenceId);

          if (!normalizedSequenceId) {
            console.warn("Skipping row with invalid sequence ID:", headerRow);
            return;
          }

          // Initialize transaction group if it doesn't exist
          if (!transactionGroups[normalizedSequenceId]) {
            transactionGroups[normalizedSequenceId] = {
              headerInfo: {
                "Sequence ID": normalizedSequenceId,
                "Accounting Document Type": accountingDocType,
                "Document Reference ID": docRefId,
                "Document Header Text": docHeaderText,
                "Company Code": companyCode,
                "Document Date": this._formatExcelDate(docDate),
                "Posting Date": this._formatExcelDate(postingDate)
              },
              entries: []
            };
          }

          // Map customer debit entries with correct column structure
          const mappedDebitEntries = debitData
            .filter((row) => {
              // Normalize both sequence IDs for comparison
              const rowSequenceId = normalizeSequenceId(row[0]);
              return rowSequenceId === normalizedSequenceId;
            })
            .map((debitEntry) => {
              const [
                entrySequenceId,
                referenceDocumentItem,
                indicator,
                customerCode,
                currency,
                amount,
                assignment,
                referenceKey1,
                referenceKey3,
                itemText,
                businessPlace
              ] = debitEntry;

              return {
                ...transactionGroups[normalizedSequenceId].headerInfo,
                "Reference Document Item": referenceDocumentItem,
                "Indicator": indicator,
                "Customer Code": customerCode,
                "Currency": currency,
                "Amount": amount,
                "Assignment": assignment,
                "Reference Key 1": referenceKey1,
                "Reference Key 3": referenceKey3,
                "Item Text": itemText,
                "Business Place": businessPlace,
                "Created By": createdBy,
                "Sheet": customerDebitSheet,
                "Entry Type": "Debit" // Added to differentiate
              };
            });

          // Map customer credit entries with correct column structure
          const mappedCreditEntries = creditData
            .filter((row) => {
              // Normalize both sequence IDs for comparison
              const rowSequenceId = normalizeSequenceId(row[0]);
              return rowSequenceId === normalizedSequenceId;
            })
            .map((creditEntry) => {
              const [
                entrySequenceId,
                referenceDocumentItem,
                indicator,
                customerCode,
                currency,
                amount,
                assignment,
                referenceKey1,
                referenceKey3,
                itemText,
                businessPlace,
                specialGlIndicator
              ] = creditEntry;

              return {
                ...transactionGroups[normalizedSequenceId].headerInfo,
                "Reference Document Item": referenceDocumentItem,
                "Indicator": indicator,
                "Customer Code": customerCode,
                "Currency": currency,
                "Amount": amount,
                "Assignment": assignment,
                "Reference Key 1": referenceKey1,
                "Reference Key 3": referenceKey3,
                "Item Text": itemText,
                "Business Place": businessPlace,
                "Special GL Indicator": specialGlIndicator,
                "Created By": createdBy,
                "Sheet": customerCreditSheet,
                "Entry Type": "Credit" // Added to differentiate
              };
            });

          // Add all entries to this transaction group
          transactionGroups[normalizedSequenceId].entries.push(...mappedDebitEntries, ...mappedCreditEntries);
        });

        // Convert transaction groups to a flat array while preserving transaction relationships
        const combinedTransactions = [];

        Object.values(transactionGroups).forEach(group => {
          // Add a transaction property to show these entries belong to same transaction
          const transactionId = `T-${group.headerInfo["Sequence ID"]}`;

          // Add entries with transaction reference
          group.entries.forEach(entry => {
            entry.TransactionID = transactionId;
            combinedTransactions.push(entry);
          });
        });

        return combinedTransactions;
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