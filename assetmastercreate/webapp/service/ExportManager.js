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
     * @param {ErrorHandler} [options.errorHandler] - Error handler instance (optional)
     * @param {object} [options.customExcelProcessor] - Optional custom processor for templates
     */
    constructor(options = {}) {
      // Instantiate dependencies
      this.oController = options.controller;
      this._errorHandler = options.errorHandler || new ErrorHandler();
      this._dataTransformer = options.dataTransformer || new DataTransformer();
      this._xlsxFormatter = new XlsxFormatter();
      this._csvFormatter = new CsvFormatter();
      this._sapSpreadsheetFormatter = new SapSpreadsheetFormatter();
      this._templateGenerator = new TemplateGenerator({
        xlsxFormatter: this._xlsxFormatter,
        customExcelProcessor: options.customExcelProcessor
      });
      this._pdfFormatter = new PdfFormatter();
    }

    /**
     * Processes validation errors for display in dialogs.
     * @param {Array} errors - Array of validation errors
     * @returns {Object} Object with flatErrors, errorCount, and _rawGroupedData
     * @public
     */
    processValidationErrorsForDisplay(errors) {
      return this._dataTransformer.processValidationErrorsForDisplay(errors);
    }

    /**
     * Processes entry data for display in details dialog.
     * @param {Object} oEntry - Entry data object
     * @returns {Object} Processed entry data
     * @public
     */
    processEntryDataForDisplay(oEntry) {
      return this._dataTransformer.processEntryDataForDisplay(oEntry);
    }

    /**
     * Processes errors for summary display.
     * @param {Array} errors - Array of errors
     * @returns {Object} Object with processed errors array
     * @public
     */
    processErrorsForSummaryDisplay(errors) {
      return this._dataTransformer.processErrorsForSummaryDisplay(errors);
    }

    /**
     * Calculates validation statistics.
     * @param {number} total - Total count
     * @param {number} successful - Successful count
     * @param {number} failed - Failed count
     * @returns {Object} Statistics object
     * @public
     */
    calculateValidationStats(total = 0, successful = 0, failed = 0) {
      return this._dataTransformer.calculateValidationStats(total, successful, failed);
    }

    /**
     * Formats successfully processed entries for display.
     * @param {Array} successEntries - Array of successful entries
     * @returns {Object} Formatted data object
     * @public
     */
    formatSuccessEntriesForDisplay(successEntries) {
      return this._dataTransformer.formatSuccessEntriesForDisplay(successEntries);
    }

    /**
     * Formats partial results (both success and failure) for display.
     * @param {Array} successEntries - Array of successful entries
     * @param {Array} failedEntries - Array of failed entries
     * @returns {Object} Formatted data object
     * @public
     */
    formatPartialResultsForDisplay(successEntries, failedEntries) {
      return this._dataTransformer.formatPartialResultsForDisplay(successEntries, failedEntries);
    }

    /**
     * Formats failed entries for display.
     * @param {Array} failedEntries - Array of failed entries
     * @returns {Object} Formatted data object
     * @public
     */
    formatFailedEntriesForDisplay(failedEntries) {
      return this._dataTransformer.formatFailedEntriesForDisplay(failedEntries);
    }

    // --- Export Methods ---

    /**
     * Exports validation errors to CSV file using CsvFormatter.
     * @param {Object} groupedErrorsData - Grouped errors data structure
     * @public
     */
    exportValidationErrorsToCSV(groupedErrorsData) {
      console.log("ExportManager: Exporting validation errors...");
      if (!groupedErrorsData || Object.keys(groupedErrorsData).length === 0) {
        this._errorHandler.showWarning("No errors available to export.");
        return Promise.reject(new Error("No errors available to export."));
      }

      try {
        // Convert grouped errors to flat array for CSV export
        const flatErrorsForCSV = [];
        Object.values(groupedErrorsData).forEach(({ category, errors }) => {
          errors.forEach((error) => {
            flatErrorsForCSV.push({
              SequenceNumber: error.sequenceId || "N/A",
              Category: category,
              Field: error.field || "Unknown",
              Error: error.message || "Error Description Missing"
            });
          });
        });

        const fileName = `validation_errors_${new Date().toISOString().slice(0, 10)}.csv`;

        // Use CsvFormatter for consistent CSV generation
        return this._csvFormatter.format(flatErrorsForCSV)
          .then(blob => {
            triggerDownload(blob, fileName);
            this._errorHandler.showSuccess("Validation errors exported successfully.");
          })
          .catch(error => {
            console.error("ExportManager: Error exporting validation errors CSV:", error);
            this._errorHandler.showError("Failed to export validation errors.", error.message);
            throw error;
          });

      } catch (error) {
        console.error("ExportManager: Error preparing validation errors for CSV:", error);
        this._errorHandler.showError("Failed to prepare validation errors for export.", error.message);
        return Promise.reject(error);
      }
    }

    /**
     * Exports data to Excel, choosing the best method (SAP Spreadsheet or XLSX fallback).
     * Uses XlsxFormatter and SapSpreadsheetFormatter for consistent output.
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
          const msg = `No data of type '${reportType}' available to export.;`;
          this._errorHandler.showWarning(msg);
          return Promise.reject(new Error(msg));
        }
      } catch (error) {
        this._errorHandler.showError("Error processing data for Excel export: " + error.message);
        return Promise.reject(error);
      }

      const finalFileName = fileName.toLowerCase().endsWith(".xlsx") ? fileName : `${fileName}.xlsx`;
      const sheetName = `${reportType.charAt(0).toUpperCase() + reportType.slice(1)} Records`;

      if (options.useSapSpreadsheet) {
        console.debug("ExportManager: Attempting SAP Spreadsheet export.");
        return this._sapSpreadsheetFormatter.formatAndDownload(processedData, finalFileName, {
          sheetName: sheetName,
          title: `Export Report - ${reportType}`
        })
          .then(() => {
            this._errorHandler.showSuccess("SAP Spreadsheet export started.");
          })
          .catch(sapError => {
            console.warn("ExportManager: SAP Spreadsheet failed, falling back to XLSX.", sapError);
            this._errorHandler.showWarning("SAP export failed, attempting fallback export.");

            // Fallback to XlsxFormatter
            return this._xlsxFormatter.formatSingleSheet(processedData, sheetName)
              .then(blob => {
                triggerDownload(blob, finalFileName);
                this._errorHandler.showSuccess("Fallback XLSX export successful.");
              })
              .catch(fallbackError => {
                this._errorHandler.showError("Fallback XLSX export also failed: " + fallbackError.message);
                throw fallbackError;
              });
          });
      } else {
        console.debug("ExportManager: Using XlsxFormatter export.");
        return this._xlsxFormatter.formatSingleSheet(processedData, sheetName)
          .then(blob => {
            triggerDownload(blob, finalFileName);
            this._errorHandler.showSuccess("XLSX export successful.");
          })
          .catch(error => {
            this._errorHandler.showError("XLSX export failed: " + error.message);
            throw error;
          });
      }
    }

    /**
     * Exports batch processing results in the specified format.
     * Uses dedicated formatter classes for consistent output.
     * @param {Object} batchData - Raw batch results object.
     * @param {String} [type="all"] - Type of records to export ("all", "success", "error"/"errors").
     * @param {String} [format="xlsx"] - Desired format ("xlsx", "csv", "pdf").
     * @returns {Promise<void>}
     */
    exportBatchResults(batchData, type = "all", format = "xlsx") {
      let processedData;
      try {
        // This method assumes DataTransformer has a processBatchResults method
        // which takes the raw batchData (containing successRecords and errorRecords)
        // and the 'type' ("all", "success", "error") to filter and format the data
        // into a flat array suitable for generic export.
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

      // Use appropriate formatter based on format
      switch (format.toLowerCase()) {
        case "csv":
          const csvFileName = baseFileName + this._csvFormatter.getFileExtension();
          return this._csvFormatter.format(processedData)
            .then(blob => {
              triggerDownload(blob, csvFileName);
              this._errorHandler.showSuccess("CSV export successful.");
            })
            .catch(error => {
              this._errorHandler.showError("CSV export failed: " + error.message);
              throw error;
            });

        case "pdf":
          const pdfFileName = baseFileName + this._pdfFormatter.getFileExtension();
          const pdfOptions = {
            reportType: type,
            title: `Batch Processing Results - ${reportTypeDesc}`,
            orientation: "landscape",
            pageSize: "A4"
          };
          // Assumes PdfFormatter.format can take processedData and options
          return this._pdfFormatter.format(processedData, pdfOptions)
            .then(blob => {
              triggerDownload(blob, pdfFileName);
              this._errorHandler.showSuccess("PDF export successful.");
            })
            .catch(error => {
              this._errorHandler.showError("PDF export failed: " + error.message);
              throw error;
            });

        case "xlsx":
        default: // Default to XLSX if format is not recognized
          const xlsxFileName = baseFileName + this._xlsxFormatter.getFileExtension();
          const sheetName = `${reportTypeDesc} Records`;
          // For XLSX, try SapSpreadsheetFormatter first, then fallback to XlsxFormatter
          return this._sapSpreadsheetFormatter.formatAndDownload(processedData, xlsxFileName, {
            sheetName: sheetName,
            title: `Batch Report - ${reportTypeDesc}`
          }).catch(sapError => {
            console.warn("ExportManager: SAP Spreadsheet failed for XLSX batch export, falling back to basic XLSX.", sapError);
            return this._xlsxFormatter.formatSingleSheet(processedData, sheetName);
          }).then(blob => {
            // If SapSpreadsheetFormatter succeeded, it handles download itself.
            // If XlsxFormatter was used as fallback, it returns a blob to trigger download.
            if (blob) { // Check if blob is returned (only by XlsxFormatter fallback)
              triggerDownload(blob, xlsxFileName);
            }
            this._errorHandler.showSuccess("XLSX export successful.");
          }).catch(error => {
            this._errorHandler.showError("XLSX export failed: " + error.message);
            throw error;
          });
      }
    }

    /**
     * Exports data grouped by document number into separate sheets in an XLSX file.
     * Uses XlsxFormatter for consistent multi-sheet output.
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
        groupedData = this._dataTransformer.groupDataByField(data, "GRNDocumentNumber", "GRN Document Number");
      } catch (error) {
        this._errorHandler.showError("Error grouping data: " + error.message);
        return Promise.reject(error);
      }

      const finalFileName = baseFileName.toLowerCase().endsWith(".xlsx") ? baseFileName : `${baseFileName}.xlsx`;

      // Use DataTransformer's processing function for each sheet
      const processFn = (arr) => this._dataTransformer.processRowsForExport(arr, "all");

      // Use XlsxFormatter for multi-sheet export
      return this._xlsxFormatter.formatMultiSheet(groupedData, processFn)
        .then(blob => {
          triggerDownload(blob, finalFileName);
          this._errorHandler.showSuccess("Grouped XLSX export successful.");
        })
        .catch(error => {
          this._errorHandler.showError("Grouped XLSX export failed: " + error.message);
          throw error;
        });
    }

    /**
     * Downloads the template file using TemplateGenerator.
     * @returns {Promise<void>}
     */
    downloadTemplate() {
      return this._templateGenerator.generateTemplateBlob()
        .then(blob => {
          const fileName = this._templateGenerator.getTemplateFileName();
          triggerDownload(blob, fileName);
          this._errorHandler.showSuccess("Template downloaded successfully.");
        })
        .catch(error => {
          this._errorHandler.showError("Template download failed: " + error.message);
          throw error;
        });
    }

    // --- Utility Methods ---

    /**
     * Gets the data transformer instance for use by other utilities.
     * @returns {DataTransformer} The data transformer instance
     * @public
     */
    getDataTransformer() {
      return this._dataTransformer;
    }

    /**
     * Gets the error handler instance for use by other utilities.
     * @returns {ErrorHandler} The error handler instance
     * @public
     */
    getErrorHandler() {
      return this._errorHandler;
    }

  }; // End ExportManager class
});