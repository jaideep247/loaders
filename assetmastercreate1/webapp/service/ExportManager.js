sap.ui.define([
  "assetmastercreate/utils/ErrorHandler",
  "assetmastercreate/utils/DataTransformer",
  "assetmastercreate/utils/XlsxFormatter",
  "assetmastercreate/utils/CsvFormatter",
  "assetmastercreate/utils/SapSpreadsheetFormatter",
  "assetmastercreate/utils/PdfFormatter",
  "assetmastercreate/utils/TemplateGenerator"
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
    setTimeout(() => URL.revokeObjectURL(url), 100); // Cleanup
  };


  return class ExportManager {

    /**
     * Constructor - Inject dependencies
     * @param {object} [options={}] - Constructor options
     * @param {sap.ui.core.mvc.Controller} [options.controller] - Controller instance (optional)
     * @param {object} [options.customExcelProcessor] - Optional custom processor for templates
     */
    constructor(options = {}) {
      // Instantiate dependencies
      this.oController = options.controller; // Keep if needed by error handler or custom processors
      this._errorHandler = new ErrorHandler(this.oController); // Pass controller if ErrorHandler needs it
      this._dataTransformer = new DataTransformer();
      this._xlsxFormatter = new XlsxFormatter();
      this._csvFormatter = new CsvFormatter();
      this._sapSpreadsheetFormatter = new SapSpreadsheetFormatter();
      this._templateGenerator = new TemplateGenerator({
        xlsxFormatter: this._xlsxFormatter, // Provide formatter for default template
        customExcelProcessor: options.customExcelProcessor // Pass along custom processor
      });
      this._pdfFormatter = new PdfFormatter();
    }

    /**
     * Exports data to Excel, choosing the best method (SAP Spreadsheet or XLSX fallback).
     * @param {Array} data - Raw data to export.
     * @param {String} fileName - Desired file name (extension added automatically).
     * @param {Object} [options={}] - Export options.
     * @param {boolean} [options.useSapSpreadsheet=false] - Prefer sap.ui.export.Spreadsheet.
     * @param {string} [options.reportType="all"] - Context for data processing ("all", "success", "error").
     * @returns {Promise<void>}
     */
    exportToExcel(data, fileName, options = {}) {
      const reportType = options.reportType || "all";
      let processedData;
      try {
        processedData = this._dataTransformer.processRowsForExport(data, reportType);
        if (!processedData || processedData.length === 0) {
          const msg = `No data of type '${reportType}' available to export.`;
          this._errorHandler.showWarning(msg);
          return Promise.reject(new Error(msg));
        }
      } catch (error) {
        this._errorHandler.showError("Error processing data for Excel export: " + error.message);
        return Promise.reject(error);
      }

      const finalFileName = fileName.toLowerCase().endsWith(".xlsx") ? fileName : `${fileName}.xlsx`;

      if (options.useSapSpreadsheet) {
        console.debug("ExportManager: Attempting SAP Spreadsheet export.");
        return this._sapSpreadsheetFormatter.formatAndDownload(processedData, finalFileName, {
          // Pass specific options for SAP Spreadsheet if needed
          sheetName: `${reportType.charAt(0).toUpperCase() + reportType.slice(1)} Records`,
          title: `Export Report - ${reportType}`
        })
          .then(() => this._errorHandler.showSuccess("SAP Spreadsheet export started."))
          .catch(sapError => {
            console.warn("ExportManager: SAP Spreadsheet failed, falling back to XLSX.", sapError);
            this._errorHandler.showWarning("SAP export failed, attempting fallback export.");
            return this._xlsxFormatter.formatSingleSheet(processedData, `${reportType} Records`)
              .then(blob => triggerDownload(blob, finalFileName))
              .then(() => this._errorHandler.showSuccess("Fallback XLSX export successful."))
              .catch(fallbackError => {
                this._errorHandler.showError("Fallback XLSX export also failed: " + fallbackError.message);
                throw fallbackError; // Re-throw final error
              });
          });
      } else {
        console.debug("ExportManager: Using XLSX Formatter export.");
        return this._xlsxFormatter.formatSingleSheet(processedData, `${reportType} Records`)
          .then(blob => triggerDownload(blob, finalFileName))
          .then(() => this._errorHandler.showSuccess("XLSX export successful."))
          .catch(error => {
            this._errorHandler.showError("XLSX export failed: " + error.message);
            throw error; // Re-throw
          });
      }
    }

    /**
     * Exports batch processing results in the specified format.
     * @param {Object} batchData - Raw batch results object.
     * @param {String} [type="all"] - Type of records to export ("all", "success", "error"/"errors").
     * @param {String} [format="xlsx"] - Desired format ("xlsx", "csv", "pdf").
     * @returns {Promise<void>}
     */
    exportBatchResults(batchData, type = "all", format = "xlsx") {
      let processedData;
      try {
        processedData = this._dataTransformer.processBatchResults(batchData, type);
        if (!processedData || processedData.length === 0 || (processedData.length === 1 && processedData[0].Status === "No Records")) {
          const msg = processedData.length === 1 && processedData[0].Status === "No Records" ?
            processedData[0].Message : `No batch data matching type '${type}' found to export.`;
          this._errorHandler.showWarning(msg);
          return Promise.reject(new Error(msg));
        }
      } catch (error) {
        this._errorHandler.showError("Error processing batch results: " + error.message);
        return Promise.reject(error);
      }

      const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
      const reportTypeDesc = type.toLowerCase().startsWith("error") ? "Error" : type.toLowerCase() === "success" ? "Success" : "All";
      const baseFileName = `Batch_${reportTypeDesc}_Records_${timestamp}`;
      let formatter;
      let finalFileName = baseFileName;

      switch (format.toLowerCase()) {
        case "csv":
          formatter = this._csvFormatter;
          finalFileName += formatter.getFileExtension();
          break;
        case "pdf":
          formatter = this._pdfFormatter;
          finalFileName += formatter.getFileExtension();
          break;
        case "xlsx":
        default:
          formatter = this._xlsxFormatter; // Use standard XLSX for batch results (single sheet)
          finalFileName += formatter.getFileExtension();
          break;
      }
      switch (format.toLowerCase()) {

        case "pdf":
          return formatter.format(processedData) // Use 'format' or 'formatSingleSheet' as appropriate
            .then(blob => triggerDownload(blob, finalFileName))
            .then(() => this._errorHandler.showSuccess(`${format.toUpperCase()} export successful.`))
            .catch(error => {
              this._errorHandler.showError(`${format.toUpperCase()} export failed: ` + error.message);
              throw error;
            });
        case "csv":
          return formatter.format(processedData) // Use 'format' or 'formatSingleSheet' as appropriate
            .then(blob => triggerDownload(blob, finalFileName))
            .then(() => this._errorHandler.showSuccess(`${format.toUpperCase()} export successful.`))
            .catch(error => {
              this._errorHandler.showError(`${format.toUpperCase()} export failed: ` + error.message);
              throw error;
            });
        default:
          return formatter.formatSingleSheet(processedData) // Use 'format' or 'formatSingleSheet' as appropriate
            .then(blob => triggerDownload(blob, finalFileName))
            .then(() => this._errorHandler.showSuccess(`${format.toUpperCase()} export successful.`))
            .catch(error => {
              this._errorHandler.showError(`${format.toUpperCase()} export failed: ` + error.message);
              throw error;
            });
      }
    }

    /**
     * Exports data grouped by document number into separate sheets in an XLSX file.
     * @param {Array} data - Raw data array.
     * @param {String} baseFileName - Base name for the file (e.g., "Grouped_Export").
     * @returns {Promise<void>}
     */
    exportGroupedData(data, baseFileName) {
      if (!data || data.length === 0) {
        const msg = "No data provided for grouped export.";
        this._errorHandler.showWarning(msg);
        return Promise.reject(new Error(msg));
      }

      let groupedData;
      try {
        // Use specific grouping field names for GRN context
        groupedData = this._dataTransformer.groupDataByField(data, "GRNDocumentNumber", "GRN Document Number");
      } catch (error) {
        this._errorHandler.showError("Error grouping data: " + error.message);
        return Promise.reject(error);
      }

      const finalFileName = baseFileName.toLowerCase().endsWith(".xlsx") ? baseFileName : `${baseFileName}.xlsx`;

      // Pass the dataTransformer's row processing function to the formatter
      // so each sheet's data gets standardized
      const processFn = (arr) => this._dataTransformer.processRowsForExport(arr, "all");

      return this._xlsxFormatter.formatMultiSheet(groupedData, processFn)
        .then(blob => triggerDownload(blob, finalFileName))
        .then(() => this._errorHandler.showSuccess("Grouped XLSX export successful."))
        .catch(error => {
          this._errorHandler.showError("Grouped XLSX export failed: " + error.message);
          throw error;
        });
    }


    /**
     * Downloads the template file.
     * @returns {Promise<void>}
     */
    downloadTemplate() {
      return this._templateGenerator.generateTemplateBlob()
        .then(blob => {
          const fileName = this._templateGenerator.getTemplateFileName();
          triggerDownload(blob, fileName);
        })
        .then(() => this._errorHandler.showSuccess("Template downloaded successfully."))
        .catch(error => {
          this._errorHandler.showError("Template download failed: " + error.message);
          throw error;
        });
    }

  }; // End ExportManager class
});