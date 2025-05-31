sap.ui.define([
  "sap/ui/base/Object",
  "sap/ui/model/json/JSONModel",
  "sap/m/MessageBox",
  "sap/m/MessageToast",
  "assetmastercreate/utils/DataTransformer"
], function (
  BaseObject,
  JSONModel,
  MessageBox,
  MessageToast,
  DataTransformer
) {
  "use strict";

  return BaseObject.extend("assetmastercreate.service.ExcelProcessor", {
    /**
     * Constructor with dependency injection
     * @param {Object} options - Configuration options
     */
    constructor: function (options = {}) {
      // Validate and store dependencies
      if (!options.controller) {
        throw new Error("ExcelProcessor requires a controller instance");
      }

      this.oController = options.controller;

      // Initialize utilities
      this._dataTransformer = new DataTransformer();
      this._validationManager = options.validationManager;
      this._uiManager = options.uiManager;
    },

    /**
     * Process an Excel file
     * @param {File} file - The Excel file to process
     * @returns {Promise} Promise that resolves with the processed data
     */
    processExcelFile: function (file) {
      return new Promise((resolve, reject) => {
        // Validate file type
        if (!this._validateFileType(file)) {
          reject(new Error("Invalid file type. Please upload an Excel file."));
          return;
        }

        const reader = new FileReader();

        reader.onerror = (error) => {
          console.error("FileReader error:", error);
          MessageBox.error("Error reading file. Please try again.");
          reject(error);
        };

        reader.onload = (event) => {
          try {
            // Validate XLSX library is available
            if (!window.XLSX) {
              throw new Error("XLSX library not loaded");
            }

            // Parse the file with full options
            const workbook = window.XLSX.read(event.target.result, {
              type: "array",
              cellDates: true,
              cellText: false,
              cellStyles: true
            });

            // Find the appropriate sheet
            const sheetName = this._findAppropriateSheet(workbook);

            // Parse the sheet
            const parsedData = this._parseSheet(workbook, sheetName);

            // Validate entries
            const validationResult = this._validateEntries(parsedData);

            // Update models
            this._updateModels(validationResult);

            // Show processing results
            this._showProcessingResults(validationResult, file.name);

            // Clear file uploader
            this._clearFileUploader();

            resolve(validationResult);
          } catch (error) {
            console.error("Excel Processing Error", error);
            MessageBox.error(`Error processing file: ${file.name}`, {
              details: error.message,
              actions: [MessageBox.Action.CLOSE]
            });
            reject(error);
          }
        };

        reader.readAsArrayBuffer(file);
      });
    },

    /**
     * Validate file type
     * @private
     * @param {File} file - File to validate
     * @returns {boolean} - Whether file type is valid
     */
    _validateFileType: function (file) {
      const validExtensions = [
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'application/vnd.ms-excel',
        'text/csv'
      ];
      return validExtensions.includes(file.type) ||
        /\.(xlsx|xls|csv)$/i.test(file.name);
    },

    /**
     * Find appropriate sheet in the workbook
     * @private
     * @param {Object} workbook - XLSX workbook object
     * @returns {string} Sheet name to process
     */
    _findAppropriateSheet: function (workbook) {
      // Look for sheets with specific keywords
      const potentialSheets = workbook.SheetNames.filter(name =>
        name.toLowerCase().includes('asset') ||
        name.toLowerCase().includes('master')
      );

      // Return first matching sheet or first sheet
      return potentialSheets[0] || workbook.SheetNames[0];
    },

    /**
     * Helper method to deduplicate array elements by a key property
     * @private
     * @param {Array} array - The array to deduplicate
     * @param {string} keyProperty - The property to use as a unique key
     * @returns {Array} Deduplicated array
     */
    _deduplicateByKey: function (array, keyProperty) {
      if (!Array.isArray(array) || array.length <= 1) {
        return array;
      }

      const seen = new Set();
      const result = [];
      const duplicates = [];

      array.forEach((item, index) => {
        const key = item[keyProperty];
        if (!key) {
          result.push(item);
        } else if (!seen.has(key)) {
          seen.add(key);
          result.push(item);
        } else {
          duplicates.push({ key: key, index: index });
        }
      });

      if (duplicates.length > 0) {
        console.warn(
          `Deduplicated ${duplicates.length} entries with duplicate ${keyProperty} values: `,
          duplicates.map(d => `${d.key} at index ${d.index}`).join(', ')
        );
      }

      return result;
    },

    /**
     * Parse sheet data - UPDATED FOR SIMPLIFIED DATATRANSFORMER
     * @private
     * @param {Object} workbook - XLSX workbook object
     * @param {string} sheetName - Name of sheet to parse
     * @returns {Array} Parsed entries
     */
    _parseSheet: function (workbook, sheetName) {
      const sheet = workbook.Sheets[sheetName];

      if (!sheet) {
        throw new Error(`Sheet "${sheetName}" not found`);
      }

      // Parse sheet to JSON
      const sheetData = window.XLSX.utils.sheet_to_json(sheet, {
        raw: false,
        defval: "",
        dateNF: "yyyy-mm-dd"
      });

      if (sheetData.length === 0) {
        throw new Error("No data found in the sheet");
      }

      console.log("[ExcelProcessor] Processing", sheetData.length, "rows");

      // Transform and clean entries using simplified DataTransformer
      return sheetData.map((row, index) => {
        try {
          // Use the simplified convertFlatToHierarchical method
          const structuredRow = this._dataTransformer.convertFlatToHierarchical(row);

          // Deduplicate valuations if they exist
          if (structuredRow._Ledger && Array.isArray(structuredRow._Ledger)) {
            structuredRow._Ledger.forEach(ledger => {
              if (ledger._Valuation && Array.isArray(ledger._Valuation)) {
                ledger._Valuation = this._deduplicateByKey(ledger._Valuation, 'AssetDepreciationArea');
              }
            });
          }

          // Create entry with additional metadata
          return {
            SequenceNumber: structuredRow.SequenceNumber || (index + 1),
            ...structuredRow,
            Status: "Pending", // Initial status
            _originalIndex: index // Track original position
          };

        } catch (error) {
          console.error(`Error processing row ${index + 1}:`, error);

          // Return error entry for problematic rows
          return {
            SequenceNumber: index + 1,
            Status: "Invalid",
            ValidationErrors: [`Row processing error: ${error.message}`],
            _originalIndex: index,
            _rawData: row // Keep original data for debugging
          };
        }
      });
    },

    /**
     * Validate entries - UPDATED
     * @private
     * @param {Array} entries - Entries to validate
     * @returns {Object} Validation result
     */
    _validateEntries: function (entries) {
      console.log("[ExcelProcessor] Validating", entries.length, "entries");

      let validCount = 0;
      let invalidCount = 0;

      // Process each entry for validation
      const processedEntries = entries.map(entry => {
        // Skip entries that already failed during parsing
        if (entry.Status === "Invalid") {
          invalidCount++;
          return entry;
        }

        try {
          // Use simplified validation method
          const validationErrors = this._dataTransformer.validateAssetData(entry);

          // Update entry status based on validation
          if (validationErrors.length === 0) {
            entry.Status = "Valid";
            validCount++;
          } else {
            entry.Status = "Invalid";
            entry.ValidationErrors = validationErrors;
            invalidCount++;
          }

        } catch (error) {
          console.error("Validation error for entry", entry.SequenceNumber, error);
          entry.Status = "Invalid";
          entry.ValidationErrors = [`Validation error: ${error.message}`];
          invalidCount++;
        }

        return entry;
      });

      return {
        entries: processedEntries,
        totalCount: entries.length,
        validCount: validCount,
        invalidCount: invalidCount,
        isValid: invalidCount === 0
      };
    },

    /**
     * Update application models
     * @private
     * @param {Object} validationResult - Validation result
     */
    _updateModels: function (validationResult) {
      const controller = this.oController;

      // Update asset master entries model
      const assetMasterModel = controller.getView().getModel("assetMasterEntries");
      assetMasterModel.setProperty("/entries", validationResult.entries);
      assetMasterModel.setProperty("/validationStatus",
        validationResult.isValid ? "Valid" : "Invalid"
      );
      assetMasterModel.setProperty("/filteredCount", validationResult.totalCount);

      // Update upload summary model
      const uploadSummaryModel = controller.getView().getModel("uploadSummary");
      uploadSummaryModel.setProperty("/TotalEntries", validationResult.totalCount);
      uploadSummaryModel.setProperty("/SuccessfulEntries", validationResult.validCount);
      uploadSummaryModel.setProperty("/FailedEntries", validationResult.invalidCount);
      uploadSummaryModel.setProperty("/LastUploadDate", new Date());
      uploadSummaryModel.setProperty("/ProcessingComplete", true);
      uploadSummaryModel.setProperty("/IsSubmitEnabled", validationResult.validCount > 0);
    },

    /**
     * Show processing results to user
     * @private
     * @param {Object} validationResult - Validation result
     * @param {string} fileName - Name of processed file
     */
    _showProcessingResults: function (validationResult, fileName) {
      // Show summary toast
      MessageToast.show(
        `File processed: ${validationResult.totalCount} entries found ` +
        `(${validationResult.validCount} valid, ${validationResult.invalidCount} invalid)`
      );

      // Show validation errors dialog if any
      if (!validationResult.isValid && this._uiManager) {
        const invalidEntries = validationResult.entries.filter(e => e.Status === 'Invalid');
        const allErrors = invalidEntries.flatMap(entry =>
          (entry.ValidationErrors || []).map(error => ({
            sequenceId: entry.SequenceNumber,
            message: typeof error === 'string' ? error : error.message,
            field: typeof error === 'object' ? error.field : 'Unknown'
          }))
        );

        this._uiManager.handleValidationErrors(allErrors);
      }
    },

    /**
     * Clear file uploader
     * @private
     */
    _clearFileUploader: function () {
      const fileUploader = this.oController.getView().byId("fileUploader");
      if (fileUploader) {
        fileUploader.clear();
      }
    },

    /**
     * Determine row index from event source
     * @private
     * @param {sap.ui.core.Control} source - Event source control
     * @returns {number} Row index
     */
    _getRowIndex: function (source) {
      // Try to get context from binding
      const bindingContext = source.getBindingContext("assetMasterEntries");
      if (bindingContext) {
        return parseInt(bindingContext.getPath().split("/").pop(), 10);
      }

      // Try to get from custom data
      if (source.data && source.data("rowIndex") !== undefined) {
        return source.data("rowIndex");
      }

      // Try to get from parent row
      let parent = source.getParent();
      while (parent && !parent.getIndex && parent.getParent) {
        parent = parent.getParent();
      }

      return parent && parent.getIndex ? parent.getIndex() : undefined;
    },

    /**
     * Export invalid records to Excel - ENHANCED
     * @param {Array} invalidEntries - Invalid entries to export
     */
    exportInvalidRecords: function (invalidEntries) {
      try {
        if (!window.XLSX) {
          throw new Error("XLSX library not loaded");
        }

        // Create workbook
        const wb = window.XLSX.utils.book_new();

        // Prepare data for export - flatten complex structures
        const exportData = invalidEntries.map(entry => {
          const flattened = {
            SequenceNumber: entry.SequenceNumber,
            Status: entry.Status,
            CompanyCode: entry.CompanyCode || '',
            AssetClass: entry.AssetClass || '',
            FixedAssetDescription: entry.FixedAssetDescription || '',
            ValidationErrors: ''
          };

          // Add validation errors as concatenated string
          if (entry.ValidationErrors && entry.ValidationErrors.length > 0) {
            flattened.ValidationErrors = entry.ValidationErrors
              .map(err => typeof err === 'string' ? err : err.message)
              .join('; ');
          }

          // Add ledger information if available
          if (entry._Ledger && Array.isArray(entry._Ledger)) {
            entry._Ledger.forEach((ledger, index) => {
              flattened[`Ledger_${index + 1}`] = ledger.Ledger;
              flattened[`CapitalizationDate_${index + 1}`] = ledger.AssetCapitalizationDate;
            });
          }

          return flattened;
        });

        // Create worksheet
        const ws = window.XLSX.utils.json_to_sheet(exportData);

        // Add worksheet to workbook
        window.XLSX.utils.book_append_sheet(wb, ws, "Invalid Entries");

        // Generate filename
        const timestamp = new Date().toISOString().slice(0, 19).replace(/:/g, '-');
        const filename = `Invalid_Asset_Entries_${timestamp}.xlsx`;

        // Save file
        window.XLSX.writeFile(wb, filename);

        // Show success message
        MessageToast.show(`Invalid entries exported to ${filename}`);
      } catch (error) {
        console.error("Error exporting invalid records:", error);
        MessageBox.error("Failed to export invalid records: " + error.message);
      }
    }
  });
});