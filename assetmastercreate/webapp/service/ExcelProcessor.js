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
     * Parse sheet data
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

      // Transform and clean entries
      return sheetData.map((row, index) => {
        // Use DataTransformer to standardize column names
        const standardizedRow = this._dataTransformer.mapAssetMasterColumns(row);
        // Then transform flat structure to nested arrays
        const structuredRow = this._dataTransformer.transformFlatToStructured(standardizedRow);

        // Create entry with additional metadata
        return {
          SequenceNumber: index + 1,
          ...structuredRow,
          Status: "Pending", // Initial status
          ValidationErrors: []
        };
      });
    },

    /**
     * Validate entries
     * @private
     * @param {Array} entries - Entries to validate
     * @returns {Object} Validation result
     */
    _validateEntries: function (entries) {
      // Validate all entries at once
      const validationResult = this._validationManager.validateAssetMasterCreateDocuments(entries);

      // Prepare comprehensive validation summary
      return {
        entries: validationResult.entries,
        totalCount: entries.length,
        validCount: validationResult.validCount,
        invalidCount: validationResult.errorCount,
        isValid: validationResult.isValid
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
    },

    /**
     * Show processing results to user
     * @private
     * @param {Object} validationResult - Validation result
     * @param {string} fileName - Name of processed file
     */
    _showProcessingResults: function (validationResult) {
      // Show summary toast
      MessageToast.show(
        `File processed: ${validationResult.totalCount} entries found ` +
        `(${validationResult.validCount} valid, ${validationResult.invalidCount} invalid)`
      );

      // Show validation errors dialog if any
      if (!validationResult.isValid && this._uiManager) {
        const invalidEntries = validationResult.entries.filter(e => e.Status === 'Invalid');
        this._uiManager.handleValidationErrors(
          invalidEntries.flatMap(entry => entry.ValidationErrors)
        );
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
     * Show entry details for a specific row
     * @param {sap.ui.base.Event} oEvent - Event from details button
     */
    showEntryDetails: function (oEvent) {
      // Get the source control (likely a button)
      const source = oEvent.getSource();

      // Determine row index
      let rowIndex = this._getRowIndex(source);

      // Get the entries from the model
      const assetMasterModel = this.oController.getView().getModel("assetMasterEntries");
      const entries = assetMasterModel.getProperty("/entries");

      // Validate row index
      if (rowIndex === undefined || rowIndex < 0 || rowIndex >= entries.length) {
        MessageToast.show("Invalid row index");
        return;
      }

      // Get the specific entry
      const entry = entries[rowIndex];

      // Prepare comprehensive entry details using Data Transformer
      const preparedEntry = this._dataTransformer.prepareEntryDetails(entry);

      // Access UI Manager from the controller
      const uiManager = this.oController.getUIManager();

      // Show entry details using UI Manager
      if (uiManager && typeof uiManager.showEntryDetailsDialog === 'function') {
        uiManager.showEntryDetailsDialog(preparedEntry);
      } else {
        // Fallback if UI Manager is not available
        MessageBox.show(JSON.stringify(preparedEntry, null, 2), {
          title: "Entry Details",
          actions: [MessageBox.Action.CLOSE]
        });
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
     * Export invalid records to Excel
     * @param {Array} invalidEntries - Invalid entries to export
     */
    exportInvalidRecords: function (invalidEntries) {
      try {
        if (!window.XLSX) {
          throw new Error("XLSX library not loaded");
        }

        // Create workbook
        const wb = window.XLSX.utils.book_new();

        // Prepare data for export
        const exportData = invalidEntries.map(entry => ({
          ...entry,
          ValidationErrors: entry.ValidationErrors
            ? entry.ValidationErrors.map(err =>
              typeof err === 'string' ? err : err.message
            ).join('; ')
            : ''
        }));

        // Create worksheet
        const ws = window.XLSX.utils.json_to_sheet(exportData);

        // Add worksheet to workbook
        window.XLSX.utils.book_append_sheet(wb, ws, "Invalid Entries");

        // Generate filename
        const timestamp = new Date().toISOString().slice(0, 10);
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