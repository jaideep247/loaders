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
     * @param {sap.ui.core.routing.Router} [options.router] - Router instance (optional, for navigation)
     * @param {sap.ui.model.odata.v2.ODataModel} [options.oDataModel] - OData V2 Model instance
     * @param {sap.ui.model.json.JSONModel} [options.jsonModel] - JSON Model instance
     * @param {sap.ui.core.Control} [options.view] - The view control (for binding context)
     */
    constructor(options = {}) {
      this._errorHandler = options.errorHandler || new ErrorHandler();
      this._dataTransformer = options.dataTransformer || new DataTransformer();

      // Initialize formatters
      this._xlsxFormatter = options.xlsxFormatter || new XlsxFormatter();
      this._csvFormatter = options.csvFormatter || new CsvFormatter();
      this._sapSpreadsheetFormatter = options.sapSpreadsheetFormatter || new SapSpreadsheetFormatter();
      this._pdfFormatter = options.pdfFormatter || new PdfFormatter();
      this._templateGenerator = options.templateGenerator || new TemplateGenerator({
        dataTransformer: this._dataTransformer,
        xlsxFormatter: this._xlsxFormatter // Inject XlsxFormatter into TemplateGenerator
      });

      console.log("ExportManager initialized.");
    }

    /**
     * Exports batch results to a specified format (XLSX, CSV, PDF, SAP Spreadsheet).
     * @param {Object} batchData - The comprehensive batch data object (e.g., from BatchProcessingManager.getResponseData()).
     * @param {string} exportType - Type of records to export ("all", "success", "error", "all_messages").
     * @param {string} format - Desired export format ("xlsx", "csv", "pdf", "sapspreadsheet").
     * @returns {Promise<void>} A promise that resolves when the export is complete, or rejects on error.
     */
    exportBatchResults(batchData, exportType, format) {
      return new Promise(async (resolve, reject) => {
        try {
          if (!batchData) {
            const msg = "No batch data provided for export.";
            this._errorHandler.showWarning(msg);
            reject(new Error(msg));
            return;
          }

          let processedData;
          let columns;
          let fileNamePrefix;
          let sheetName;

          // Determine data and columns based on exportType
          if (exportType === "all_messages") {
            processedData = this._dataTransformer.processBatchResultsForExport(batchData, "all_messages");
            columns = this._dataTransformer.getMessageExportColumnOrder();
            fileNamePrefix = "Batch_Messages";
            sheetName = "Messages";
          } else {
            // For "all", "success", "error" (WBS element related exports)
            processedData = this._dataTransformer.processBatchResultsForExport(batchData, exportType);
            columns = this._dataTransformer.getWBSExportColumnOrder();
            fileNamePrefix = `WBS_Elements_${exportType.charAt(0).toUpperCase() + exportType.slice(1)}`;
            sheetName = `WBS ${exportType.charAt(0).toUpperCase() + exportType.slice(1)}`;
          }

          if (!processedData || processedData.length === 0) {
            const msg = `No ${exportType} records found for export.`;
            this._errorHandler.showWarning(msg);
            reject(new Error(msg));
            return;
          }

          let formatter;
          let formatMethod; // This will hold the name of the method to call on the formatter
          let fileExtension;

          // Select the appropriate formatter and method
          switch (format) {
            case 'xlsx':
              formatter = this._xlsxFormatter;
              formatMethod = 'exportToExcel'; // Corrected method name
              fileExtension = formatter.getFileExtension();
              break;
            case 'csv':
              formatter = this._csvFormatter;
              formatMethod = 'exportToCsv';
              fileExtension = formatter.getFileExtension();
              break;
            case 'pdf':
              formatter = this._pdfFormatter;
              formatMethod = 'exportToPdf';
              fileExtension = formatter.getFileExtension();
              break;
            case 'sapspreadsheet':
              formatter = this._sapSpreadsheetFormatter;
              formatMethod = 'exportToSapSpreadsheet';
              fileExtension = formatter.getFileExtension();
              break;
            default:
              const msg = `Unsupported export format: ${format}`;
              this._errorHandler.showError(msg);
              reject(new Error(msg));
              return;
          }

          if (!formatter || typeof formatter[formatMethod] !== 'function') {
            const msg = `Export failed: Formatter or format method '${formatMethod}' not found for format '${format}'.`;
            this._errorHandler.showError(msg);
            reject(new Error(msg));
            return;
          }

          const fileName = `${fileNamePrefix}_${new Date().toISOString()}.${fileExtension}`;

          // Execute the export
          await formatter[formatMethod](processedData, columns, sheetName, fileName)
            .then(blob => {
              triggerDownload(blob, fileName);
              this._errorHandler.showSuccess("Export successful.");
              resolve();
            })
            .catch(error => {
              // Error already logged by formatter typically
              const msg = `Export failed: ${error.message}`;
              this._errorHandler.showError(msg);
              reject(error);
            });

        } catch (error) {
          const msg = "Error preparing data for export: " + error.message;
          console.error("ExportManager Error:", error);
          this._errorHandler.showError(msg);
          reject(new Error(msg));
        }
      });
    }

    /**
     * Downloads the template file using TemplateGenerator.
     * @returns {Promise<void>}\
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
