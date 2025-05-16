sap.ui.define([
  "../utils/ErrorHandler", // Adjust path if necessary
  "../utils/DataTransformer", // Adjust path if necessary
  "../utils/XlsxFormatter", // Adjust path if necessary
  "../utils/CsvFormatter", // Adjust path if necessary
  "../utils/SapSpreadsheetFormatter", // Adjust path if necessary
  "../utils/PdfFormatter", // Adjust path if necessary
  "../utils/TemplateGenerator" // Adjust path if necessary
], function (
  ErrorHandler,
  DataTransformer,
  XlsxFormatter,
  CsvFormatter,
  SapSpreadsheetFormatter,
  PdfFormatter,
  TemplateGenerator
) {
  "use strict";

  // Helper function to trigger browser download from a Blob
  const triggerDownload = (blob, fileName) => {
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", fileName);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    // Delay cleanup slightly to ensure download starts in all browsers
    setTimeout(() => URL.revokeObjectURL(url), 150);
  };

  return class ExportManager {
    /**
     * Constructor - Inject dependencies with enhanced field mapping
     * @param {object} [options={}] - Constructor options
     * @param {sap.ui.core.mvc.Controller} [options.controller] - Controller instance
     * @param {object} [options.customExcelProcessor] - Optional custom processor for templates
     * @param {object} [options.fieldMappings] - Custom field mappings for export
     * @param {object} [options.grnConfig] - Configuration for GRN generation in DataTransformer
     * @param {ErrorHandler} [options.errorHandler] - Optional ErrorHandler instance
     * @param {DataTransformer} [options.dataTransformer] - Optional DataTransformer instance
     */
    constructor(options = {}) {
      // Instantiate dependencies
      this.oController = options.controller;
      // Use provided ErrorHandler or create a default one
      this._errorHandler = options.errorHandler || new ErrorHandler(); // Pass controller if ErrorHandler needs it: new ErrorHandler(this.oController);

      // Default field mappings (copied from user's provided code)
      this._fieldMappings = {
        'Project Element (Required)': 'WBSCode',
        'ProjectUUID': 'ProjectUUID',
        'Name of WBS': 'WBSName',
        'Planned Start Date': 'PlannedStartDate',
        'Planned End Date': 'PlannedEndDate',
        'Responsible Cost Center': 'CostCenter',
        'Company Code': 'CompanyCode',
        'Profit Center': 'ProfitCenter',
        'Controlling Area': 'ControllingArea',
        'Billing Element': 'BillingElement',
        'Old Project ID': 'OldProjectID',
        'Exact WBS code': 'ExactWBSCode',
        'Site type (OF/ON)': 'SiteType',
        'ATM ID': 'ATM_ID',
        'District': 'District',
        'State': 'State',
        'Bank name': 'BankName',
        'ATM count': 'ATMCount',
        'Nature of WBS': 'NatureOfWBS',
        'SAP Site ID report': 'SAPSiteID',
        'Address': 'Address',
        'Deployment': 'Deployment',
        'Bank load percentage': 'BankLoadPercentage',
        'ERP relocation Ref ATM ID': 'ERPRefATM_ID',
        'ERP Site ID report': 'ERPSiteID',
        'UDF-1': 'UDF1',
        'Categorization': 'Categorization',
        'Actual start date': 'ActualStartDate',
        'Postal code': 'PostalCode',
        'Actual end date': 'ActualEndDate',
        'ERP relocation ref. site id': 'ERPRefSiteID'
        // Add other mappings as needed
      };

      // Override default mappings if custom mappings provided
      if (options.fieldMappings) {
        this._fieldMappings = { ...this._fieldMappings, ...options.fieldMappings };
      }

      // Initialize DataTransformer (use provided or default)
      this._dataTransformer = options.dataTransformer || new DataTransformer(options.grnConfig || {});

      // Initialize Formatters
      this._xlsxFormatter = new XlsxFormatter();
      this._csvFormatter = new CsvFormatter();
      this._sapSpreadsheetFormatter = new SapSpreadsheetFormatter();
      this._pdfFormatter = new PdfFormatter();
      // Initialize TemplateGenerator (pass dependencies if needed)
      this._templateGenerator = new TemplateGenerator({
        xlsxFormatter: this._xlsxFormatter,
        customExcelProcessor: options.customExcelProcessor
        // Pass other dependencies like validationManager if TemplateGenerator needs field info
      });

      console.log("ExportManager initialized.");
    }

    /**
     * Standardize data using field mappings.
     * Note: GRN generation logic might be better placed in DataTransformer itself.
     * This primarily focuses on mapping keys based on _fieldMappings.
     * @param {Array} data - Raw data array.
     * @returns {Array} Data with standardized keys.
     * @private
     */
    _standardizeData(data) {
      if (!Array.isArray(data)) return [];
      // Create reverse mapping for faster lookup if needed, or iterate keys
      // const reverseMapping = Object.entries(this._fieldMappings).reduce((acc, [key, val]) => { acc[val] = key; return acc; }, {});

      return data.map(item => {
        if (typeof item !== 'object' || item === null) return item; // Skip non-objects
        const standardizedItem = {};
        Object.keys(item).forEach(originalKey => {
          // Find the standard key corresponding to the original key
          const standardKey = this._fieldMappings[originalKey] || originalKey; // Use original if no mapping found
          standardizedItem[standardKey] = item[originalKey];
        });
        return standardizedItem;
      });
    }
    /**
         * Specialized method to export WBS Element creation results
         * @param {Array} wbsData - Array of WBS Element data objects
         * @param {string} fileName - Base file name (without extension)
         * @param {string} [format="xlsx"] - Export format ("xlsx", "csv")
         * @returns {Promise<void>}
         */
    exportWbsElementResults(wbsData, fileName, format = "xlsx") {
      if (!Array.isArray(wbsData)) {
        const msg = "WBS Element data must be an array";
        this._errorHandler.showError(msg);
        return Promise.reject(new Error(msg));
      }

      if (wbsData.length === 0) {
        const msg = "No WBS Element data to export";
        this._errorHandler.showWarning(msg);
        return Promise.reject(new Error(msg));
      }

      // Define the exact column order for WBS Element export
      const wbsColumns = [
        'Project Element (Required)',
        'ProjectUUID',
        'Name of WBS',
        'Planned Start Date',
        'Planned End Date',
        'Responsible Cost Center',
        'Company Code',
        'Profit Center',
        'Controlling Area',
        'Billing Element',
        'Old Project ID',
        'Exact WBS code',
        'Site type (OF/ON)',
        'ATM ID',
        'District',
        'State',
        'Bank name',
        'ATM count',
        'Nature of WBS',
        'SAP Site ID report',
        'Address',
        'Deployment',
        'Bank load percentage',
        'ERP relocation Ref ATM ID',
        'ERP Site ID report',
        'UDF-1',
        'Categorization',
        'Actual start date',
        'Postal code',
        'Actual end date',
        'ERP relocation ref. site id'
      ];

      // Process data through standardizer first
      const standardizedData = this._standardizeData(wbsData);

      // Format filename with timestamp
      const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
      const baseName = fileName || `WBS_Elements_Export_${timestamp}`;
      const finalFileName = format.toLowerCase() === 'csv'
        ? `${baseName}.csv`
        : `${baseName}.xlsx`;

      // Use the existing exportWithColumns method
      return this.exportDataWithColumns(
        standardizedData,
        wbsColumns,
        finalFileName,
        'WBS Elements'
      ).catch(error => {
        this._errorHandler.showError(`WBS Element export failed: ${error.message}`);
        throw error;
      });
    }

    /**
     * Exports data to Excel with enhanced field mapping and processing.
     * Processes data using DataTransformer before exporting.
     * @param {Array} data - Raw data array to export.
     * @param {String} fileName - Desired file name.
     * @param {Object} [options={}] - Export options (e.g., { reportType: "all", useSapSpreadsheet: false }).
     * @returns {Promise<void>}
     */
    exportToExcel(data, fileName, options = {}) {
      let processedData;;
      const reportType = options.reportType || "all"; // Default to 'all'

      try {
        // Standardize keys first (using mappings)
        const standardizedData = this._standardizeData(data);
        // Then process rows using DataTransformer (which might format dates, numbers, etc.)
        processedData = this._dataTransformer.processRowsForExport(standardizedData, reportType);

        if (!processedData || processedData.length === 0) {
          const msg = `No data of type '${reportType}' available to export.`;
          this._errorHandler.showWarning(msg);
          return Promise.reject(new Error(msg)); // Reject promise for clarity
        }
      } catch (error) {
        this._errorHandler.showError("Error processing data for Excel export: " + error.message);
        return Promise.reject(error);
      }

      const finalFileName = fileName.toLowerCase().endsWith(".xlsx") ? fileName : `${fileName}.xlsx`;

      // Decide which formatter to use
      if (options.useSapSpreadsheet) {
        console.debug("ExportManager: Attempting SAP Spreadsheet export.");
        return this._sapSpreadsheetFormatter.formatAndDownload(processedData, finalFileName, {
          sheetName: `${reportType.charAt(0).toUpperCase() + reportType.slice(1)} Records`,
          title: `Export Report - ${reportType}`
          // Add other sap.ui.export options if needed
        })
          .then(() => this._errorHandler.showSuccess("SAP Spreadsheet export started."))
          .catch(sapError => {
            console.warn("ExportManager: SAP Spreadsheet failed, falling back to XLSX.", sapError);
            this._errorHandler.showWarning("SAP export failed, attempting fallback export.");
            // Fallback to standard XLSX formatter
            return this._xlsxFormatter.formatSingleSheet(processedData, `${reportType} Records`)
              .then(blob => triggerDownload(blob, finalFileName))
              .then(() => this._errorHandler.showSuccess("Fallback XLSX export successful."))
              .catch(fallbackError => {
                this._errorHandler.showError("Fallback XLSX export also failed: " + fallbackError.message);
                throw fallbackError; // Re-throw the final error
              });
          });
      } else {
        console.debug("ExportManager: Using standard XLSX Formatter export.");
        return this._xlsxFormatter.formatSingleSheet(processedData, `${reportType} Records`)
          .then(blob => triggerDownload(blob, finalFileName))
          .then(() => this._errorHandler.showSuccess("XLSX export successful."))
          .catch(error => {
            this._errorHandler.showError("XLSX export failed: " + error.message);
            throw error; // Re-throw error
          });
      }
    }

    /**
     * Exports batch processing results in the specified format.
     * Uses DataTransformer to process the raw batch data structure.
     * @param {Object} batchData - Raw batch results object (e.g., from BatchProcessingManager).
     * @param {String} [type="all"] - Type of records to export ("all", "success", "error"/"errors").
     * @param {String} [format="xlsx"] - Desired format ("xlsx", "csv", "pdf").
     * @returns {Promise<void>}
     */
    exportBatchResults(batchData, type = "all", format = "xlsx") {
      let processedData;
      try {
        // Use DataTransformer to get a flat array suitable for export
        processedData = this._dataTransformer.processBatchResults(batchData, type);

        // Check if processing returned meaningful data
        if (!processedData || processedData.length === 0 || (processedData.length === 1 && processedData[0].Status === "No Records")) {
          const msg = (processedData && processedData.length === 1 && processedData[0].Status === "No Records") ?
            processedData[0].Message : `No batch data matching type '${type}' found to export.`;
          this._errorHandler.showWarning(msg);
          return Promise.reject(new Error(msg)); // Reject promise
        }
      } catch (error) {
        this._errorHandler.showError("Error processing batch results for export: " + error.message);
        return Promise.reject(error);
      }

      // Generate filename
      const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
      const reportTypeDesc = type.toLowerCase().startsWith("error") ? "Error" : type.toLowerCase() === "success" ? "Success" : "All";
      const baseFileName = `Batch_${reportTypeDesc}_Records_${timestamp}`;
      let formatter;
      let finalFileName = baseFileName;
      let formatMethod = 'formatSingleSheet'; // Default for XLSX

      // Select formatter and method based on format
      switch (format.toLowerCase()) {
        case "csv":
          formatter = this._csvFormatter;
          formatMethod = 'format'; // CSV formatter uses 'format'
          break;
        case "pdf":
          formatter = this._pdfFormatter;
          formatMethod = 'format'; // PDF formatter uses 'format'
          break;
        case "xlsx":
        default: // Default to XLSX
          formatter = this._xlsxFormatter;
          formatMethod = 'formatSingleSheet'; // XLSX uses 'formatSingleSheet' for simple lists
          format = 'xlsx'; // Ensure format is set correctly for messages
          break;
      }
      finalFileName += formatter.getFileExtension();

      // Execute formatting and download
      return formatter[formatMethod](processedData, `Batch ${reportTypeDesc} Records`) // Pass sheet name
        .then(blob => triggerDownload(blob, finalFileName))
        .then(() => this._errorHandler.showSuccess(`${format.toUpperCase()} export successful.`))
        .catch(error => {
          this._errorHandler.showError(`${format.toUpperCase()} export failed: ` + error.message);
          throw error; // Re-throw error
        });
    }

    /**
     * Exports data grouped by a specified field into separate sheets in an XLSX file.
     * @param {Array} data - Raw data array.
     * @param {String} groupField - The field name in the data objects to group by.
     * @param {String} baseFileName - Base name for the file (e.g., "Grouped_Export").
     * @returns {Promise<void>}
     */
    exportGroupedData(data, groupField, baseFileName) {
      if (!data || data.length === 0) {
        const msg = "No data provided for grouped export.";
        this._errorHandler.showWarning(msg);
        return Promise.reject(new Error(msg));
      }
      if (!groupField) {
        const msg = "Group field must be specified for grouped export.";
        this._errorHandler.showError(msg);
        return Promise.reject(new Error(msg));
      }

      let groupedData;
      try {
        // Standardize first to ensure groupField uses standard name if mapped
        const standardizedData = this._standardizeData(data);
        // Group using the potentially standardized field name
        groupedData = this._dataTransformer.groupDataByField(standardizedData, groupField, `Unknown_${groupField}`);
      } catch (error) {
        this._errorHandler.showError("Error grouping data: " + error.message);
        return Promise.reject(error);
      }

      if (Object.keys(groupedData).length === 0) {
        const msg = `No groups found using field '${groupField}'.`;
        this._errorHandler.showWarning(msg);
        return Promise.reject(new Error(msg));
      }

      const finalFileName = baseFileName.toLowerCase().endsWith(".xlsx") ? baseFileName : `${baseFileName}.xlsx`;

      // Pass the dataTransformer's row processing function to the formatter
      // so each sheet's data gets standardized/formatted correctly
      const processFn = (arr) => this._dataTransformer.processRowsForExport(arr, "all");

      return this._xlsxFormatter.formatMultiSheet(groupedData, processFn)
        .then(blob => triggerDownload(blob, finalFileName))
        .then(() => this._errorHandler.showSuccess("Grouped XLSX export successful."))
        .catch(error => {
          this._errorHandler.showError("Grouped XLSX export failed: " + error.message);
          throw error;
        });
    }


    // <<< NEW METHOD ADDED HERE >>>
    /**
     * Exports data to Excel, allowing specification of columns and their order.
     * This method assumes the input data is already processed/combined as needed.
     * @param {Array<object>} data - The array of data objects to export.
     * @param {Array<string>} columns - An array of property names (keys) representing the desired columns in order.
     * @param {string} fileName - Desired file name (e.g., "report.xlsx").
     * @param {string} [sheetName="Report"] - Name for the Excel sheet.
     * @returns {Promise<void>} Promise that resolves when download is triggered or rejects on error.
     */
    exportDataWithColumns(data, columns, fileName, sheetName = "Report") {
      return new Promise((resolve, reject) => {
        if (!Array.isArray(data)) {
          const msg = "Export failed: Input data must be an array.";
          this._errorHandler.showError(msg);
          return reject(new Error(msg));
        }
        if (!Array.isArray(columns) || columns.length === 0) {
          const msg = "Export failed: Column list must be provided.";
          this._errorHandler.showError(msg);
          return reject(new Error(msg));
        }
        if (!fileName || typeof fileName !== 'string') {
          const msg = "Export failed: A valid file name must be provided.";
          this._errorHandler.showError(msg);
          return reject(new Error(msg));
        }

        const finalFileName = fileName.toLowerCase().endsWith(".xlsx") ? fileName : `${fileName}.xlsx`;

        try {
          // 1. Prepare data based on selected columns and order
          const exportData = data.map(row => {
            const newRow = {};
            columns.forEach(colKey => {
              // Assign value if property exists in the row, otherwise empty string
              // This preserves the column order defined in 'columns'
              newRow[colKey] = row.hasOwnProperty(colKey) ? (row[colKey] ?? "") : ""; // Use nullish coalescing for null/undefined
            });
            return newRow;
          });

          if (exportData.length === 0) {
            this._errorHandler.showWarning("No data available to export after processing columns.");
            return resolve(); // Resolve successfully, nothing to download
          }

          // 2. Use XLSX Formatter (formatSingleSheet is suitable here)
          console.debug(`ExportManager: Exporting ${exportData.length} rows with specified columns to ${finalFileName}`);
          this._xlsxFormatter.formatSingleSheet(exportData, sheetName)
            .then(blob => {
              triggerDownload(blob, finalFileName);
              this._errorHandler.showSuccess("Export successful.");
              resolve();
            })
            .catch(error => {
              // Error already logged by formatter typically
              // this._errorHandler.showError("XLSX export failed: " + error.message);
              reject(error);
            });

        } catch (error) {
          const msg = "Error preparing data for export with columns: " + error.message;
          console.error("ExportManager Error:", error);
          this._errorHandler.showError(msg);
          reject(new Error(msg));
        }
      });
    }
    // <<< END OF NEW METHOD >>>


    /**
     * Downloads the template file using TemplateGenerator.
     * @returns {Promise<void>}
     */
    downloadTemplate() {
      return this._templateGenerator.generateTemplateBlob()
        .then(blob => {
          const fileName = this._templateGenerator.getTemplateFileName();
          triggerDownload(blob, fileName);
          // Success message moved here for better timing
          this._errorHandler.showSuccess("Template downloaded successfully.");
        })
        // .then(() => this._errorHandler.showSuccess("Template downloaded successfully.")) // Redundant now
        .catch(error => {
          this._errorHandler.showError("Template download failed: " + error.message);
          throw error; // Re-throw error after handling
        });
    }

  }; // End ExportManager class
});
