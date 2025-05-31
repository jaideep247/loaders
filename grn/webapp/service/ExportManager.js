sap.ui.define([
  "grn/utils/ErrorHandler",
  "grn/utils/DataTransformer",
  "grn/utils/XlsxFormatter",
  "grn/utils/CsvFormatter",
  "grn/utils/SapSpreadsheetFormatter",
  "grn/utils/PdfFormatter",
  "grn/utils/TemplateGenerator"
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
        // This will now process data with a unified Message field instead of separate error/success message fields
        processedData = this._errorHandler.processBatchResults(batchData, type);
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

      // Export options to pass to formatter
      const exportOptions = {
        title: `Batch ${reportTypeDesc} Records`,
        reportType: type,
        timestamp: timestamp
      };

      switch (format.toLowerCase()) {
        case "pdf":
          return formatter.format(processedData, exportOptions)
            .then(blob => triggerDownload(blob, finalFileName))
            .then(() => this._errorHandler.showSuccess(`${format.toUpperCase()} export successful.`))
            .catch(error => {
              this._errorHandler.showError(`${format.toUpperCase()} export failed: ` + error.message);
              throw error;
            });
        case "csv":
          return formatter.format(processedData, exportOptions)
            .then(blob => triggerDownload(blob, finalFileName))
            .then(() => this._errorHandler.showSuccess(`${format.toUpperCase()} export successful.`))
            .catch(error => {
              this._errorHandler.showError(`${format.toUpperCase()} export failed: ` + error.message);
              throw error;
            });
        default:
          return formatter.formatSingleSheet(processedData, `${reportTypeDesc} Records`, exportOptions)
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
        groupedData = this._dataTransformer.groupByFields(data, "GRNDocumentNumber");
      } catch (error) {
        this._errorHandler.showError("Error grouping data: " + error.message);
        return Promise.reject(error);
      }

      const finalFileName = baseFileName.toLowerCase().endsWith(".xlsx") ? baseFileName : `${baseFileName}.xlsx`;

      // Pass the dataTransformer's row processing function to the formatter
      // so each sheet's data gets standardized with consolidated message field
      const processFn = (arr) => {
        // Process rows for export, ensuring message consolidation
        const processed = this._dataTransformer.processRowsForExport(arr, "all");

        // Ensure all rows have a consolidated Message field
        return processed.map(row => {
          if (!row.Message) {
            // If separate message fields exist, consolidate them
            if (row.ErrorMessage) {
              row.Message = row.ErrorMessage;
              delete row.ErrorMessage;
            } else if (row.SuccessMessage) {
              row.Message = row.SuccessMessage;
              delete row.SuccessMessage;
            } else if (row.MaterialDocumentMessage) {
              row.Message = row.MaterialDocumentMessage;
              delete row.MaterialDocumentMessage;
            } else {
              // Set default message based on status
              row.Message = row.Status === "Success" ?
                "Document processed successfully" :
                "Processing failed";
            }
          }
          return row;
        });
      };

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

    /**
     * Exports raw data as JSON file - useful for debugging
     * @param {Object|Array} data - Data to export
     * @param {String} [fileName="export.json"] - File name for the export
     * @returns {Promise<void>}
     */
    exportAsJson(data, fileName = "export.json") {
      try {
        if (!data) {
          const msg = "No data provided for JSON export.";
          this._errorHandler.showWarning(msg);
          return Promise.reject(new Error(msg));
        }

        const jsonString = JSON.stringify(data, null, 2);
        const blob = new Blob([jsonString], { type: "application/json" });

        // Ensure file extension
        const finalFileName = fileName.toLowerCase().endsWith(".json") ? fileName : `${fileName}.json`;

        triggerDownload(blob, finalFileName);
        this._errorHandler.showSuccess("JSON export successful.");
        return Promise.resolve();
      } catch (error) {
        this._errorHandler.showError("JSON export failed: " + error.message);
        return Promise.reject(error);
      }
    }

    /**
     * Process data for export and organize message fields
     * @param {Array} data - Raw data to process
     * @param {String} [type="all"] - Type of data to include ("all", "success", "error")
     * @returns {Array} Processed data with consolidated message fields
     */
    processDataForExport(data, type = "all") {
      if (!data || !Array.isArray(data) || data.length === 0) {
        return [];
      }

      // Filter data based on type if needed
      let filteredData = [...data];
      if (type.toLowerCase() === "success") {
        filteredData = data.filter(item => item.Status === "Success" || item.Status === "Successful");
      } else if (type.toLowerCase() === "error" || type.toLowerCase() === "errors") {
        filteredData = data.filter(item => item.Status === "Error" || item.Status === "Failed");
      }

      // Process each row to ensure message consolidation
      return filteredData.map(item => {
        const result = { ...item };

        // Consolidate message fields if they exist
        if (!result.Message) {
          if (result.ErrorMessage) {
            result.Message = result.ErrorMessage;
          } else if (result.SuccessMessage) {
            result.Message = result.SuccessMessage;
          } else if (result.MaterialDocumentMessage) {
            result.Message = result.MaterialDocumentMessage;
          } else {
            // Set default message based on status
            result.Message = result.Status === "Success" || result.Status === "Successful" ?
              "Processed successfully" : "Processing failed";
          }
        }

        // Remove redundant message fields
        delete result.ErrorMessage;
        delete result.SuccessMessage;
        delete result.MaterialDocumentMessage;
        return result;
      });
    }

  }; // End ExportManager class
});