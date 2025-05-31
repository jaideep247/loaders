sap.ui.define([
  "sap/m/MessageBox",
  "sap/m/MessageToast",
  "sap/ui/export/Spreadsheet",
  "sap/ui/export/library"
], function (MessageBox, MessageToast, Spreadsheet, exportLibrary) {
  "use strict";

  const EdmType = exportLibrary.EdmType;

  /**
   * ExportManager
   * Responsible for data export functions (Excel, CSV, PDF)
   */
  return function(oController) {
    this.oController = oController;
    
    /**
     * Download the template Excel file
     */
    this.downloadTemplate = function() {
      const wb = this._createTemplateWorkbook();
      XLSX.writeFile(wb, "Vendor_Payments.xlsx");
    };
    
    /**
     * Create template workbook with sample data
     * @returns {object} XLSX workbook object
     */
    this._createTemplateWorkbook = function() {
      const wb = XLSX.utils.book_new();

      // Header Sheet
      const headerHeaders = [
        "Sequence ID",
        "Accounting Document Type",
        "Document Reference ID",
        "Document Header Text",
        "Company Code",
        "Document Date",
        "Posting Date"
      ];
      const headerData = [
        [
          "1",
          "Z2",
          "REF_001",
          "MTB from Axis",
          "1000",
          "2025-01-01",
          "2025-01-01"
        ]
      ];
      const headerSheet = XLSX.utils.aoa_to_sheet([
        headerHeaders,
        ...headerData
      ]);
      XLSX.utils.book_append_sheet(wb, headerSheet, "Header");

      // Bank Lines Transactions Sheet (Bank Lines Entries Only)
      const glHeaders = [
        "Sequence ID",
        "Reference Document Item",
        "Indicator (S-Dr, H-Cr.)",
        "GL Account",
        "Currency",
        "Amount",
        "Assignment",
        "Reference Key-1",
        "Item Text",
        "House Bank",
        "Account ID",
        "Profit Center",
        "Business Place"
      ];
      const glData = [
        [
          "1",
          "1",
          "H",
          "11001021",
          "INR",
          "1000",
          "Axis bank",
          "Ref Bank",
          "Item Bank",
          "AXI01",
          "AXI01",
          "1DL_MOF001",
          "1007"
        ]
      ];
      const glSheet = XLSX.utils.aoa_to_sheet([glHeaders, ...glData]);
      XLSX.utils.book_append_sheet(wb, glSheet, "Bank Lines");

      // Vendor Lines Transactions Sheet (Vendor Lines Entries Only)
      const creditorHeaders = [
        "Sequence ID",
        "Reference Document Item",
        "Indicator (S-Dr, H-Cr.)",
        "Vendor Code",
        "Currency",
        "Amount",
        "Assignment",
        "Reference Key-1",
        "Item Text",
        "Business Place",
        "Special GL Code",
        "Payment Reference"
      ];
      const creditorData = [
        [
          "1",
          "1",
          "S",
          "21000014",
          "INR",
          "1000",
          "Axis Vendor",
          "Ref Vendor",
          "Item Vendor",
          "1007",
          "A",
          "123456789"
        ]
      ];
      const creditorSheet = XLSX.utils.aoa_to_sheet([
        creditorHeaders,
        ...creditorData
      ]);
      XLSX.utils.book_append_sheet(
        wb,
        creditorSheet,
        "Vendor Lines"
      );

      return wb;
    };
    
    /**
     * Export data to Excel
     * @param {array} data - Data to export
     * @param {string} filename - Output filename
     */
    this.exportToExcel = function(data, filename) {
      try {
        // Create settings for excel export
        const exportSettings = {
          workbook: {
            columns: [
              {
                label: "Sequence ID",
                property: "Sequence ID",
                type: EdmType.String
              },
              {
                label: "Status",
                property: "status",
                type: EdmType.String
              },
              {
                label: "Entry Type",
                property: "Entry Type",
                type: EdmType.String
              },
              {
                label: "Accounting Doc Type",
                property: "Accounting Document Type",
                type: EdmType.String
              },
              {
                label: "Document Reference ID",
                property: "Document Reference ID",
                type: EdmType.String
              },
              {
                label: "Company Code",
                property: "Company Code",
                type: EdmType.String
              },
              {
                label: "GL Account",
                property: "GL Account",
                type: EdmType.String
              },
              {
                label: "Currency",
                property: "Currency",
                type: EdmType.String
              },
              {
                label: "Amount",
                property: "Amount",
                type: EdmType.Number
              },
              {
                label: "Document Date",
                property: "Document Date",
                type: EdmType.Date
              },
              {
                label: "Posting Date",
                property: "Posting Date",
                type: EdmType.Date
              }
            ]
          },
          dataSource: data,
          fileName: filename
        };

        // Create and download the spreadsheet
        new Spreadsheet(exportSettings).build()
          .then(() => {
            MessageToast.show("Export completed successfully");
          })
          .catch((error) => {
            MessageBox.error(`Export failed: ${error.message}`);
            this.oController._errorHandler.logError('Excel Export Error', {
              errorMessage: error.message
            });
          });
      } catch (error) {
        MessageBox.error(`Export error: ${error.message}`);
        console.error("Export error:", error);
      }
    };
    
    /**
     * Export data in specific format
     * @param {string} format - Export format (csv, xlsx, pdf)
     * @param {string} type - Content type (success, error, partial)
     * @param {object} uiManager - Reference to UI manager
     */
    this.exportData = function(format, type, uiManager) {
      let data = [];
      
      // Get the appropriate data based on type
      if (type === "success" && uiManager._dialogs.successDialog) {
        data = uiManager._dialogs.successDialog.getModel("success").getProperty("/documents");
      } else if (type === "error" && uiManager._dialogs.errorDialog) {
        data = uiManager._dialogs.errorDialog.getModel("error").getProperty("/errors");
      } else if (type === "partial" && uiManager._dialogs.partialSuccessDialog) {
        // Combine documents and errors for partial success
        const partialModel = uiManager._dialogs.partialSuccessDialog.getModel("partial");
        const documents = partialModel.getProperty("/documents");
        const errors = partialModel.getProperty("/errors");

        // Create combined dataset with type indicator
        data = [
          ...documents.map(doc => ({ ...doc, recordType: "Success" })),
          ...errors.map(err => ({ ...err, recordType: "Error" }))
        ];
      }

      if (!data || data.length === 0) {
        MessageBox.information("No data available to export.");
        return;
      }

      // Export data in the requested format
      switch (format) {
        case "xlsx":
          this._exportToExcel(data, type);
          break;
        case "csv":
          this._exportToCSV(data, type);
          break;
        case "pdf":
          this._exportToPDF(data, type);
          break;
        default:
          MessageBox.error("Unsupported export format");
      }
    };
    
    /**
     * Generate export filename with timestamp
     * @param {string} type - Export type (success, error, partial)
     * @param {string} extension - File extension (xlsx, csv, pdf)
     * @returns {string} Formatted filename
     */
    this._getExportFilename = function(type, extension) {
      const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
      let typeStr = "";

      switch (type) {
        case "success":
          typeStr = "success";
          break;
        case "error":
          typeStr = "errors";
          break;
        case "partial":
          typeStr = "partial";
          break;
        default:
          typeStr = "export";
      }

      return `Vendor_Payments_${typeStr}_${timestamp}.${extension}`;
    };
    
    /**
     * Export to Excel format
     * @param {array} data - Data to export
     * @param {string} type - Export type (success, error, partial)
     */
    this._exportToExcel = function(data, type) {
      try {
        // Transform data for Excel export
        const excelData = data.map(item => {
          if (item.documentNumber) {
            // Document entry
            return {
              "Sequence ID": item.sequenceId,
              "Record Type": item.recordType || "Success",
              "Document Number": item.documentNumber,
              "Company Code": item.companyCode,
              "Fiscal Year": item.fiscalYear,
              "Formatted Document": item.formattedDocNumber,
              "Message": item.message
            };
          } else {
            // Error entry
            return {
              "Sequence ID": item.sequenceId,
              "Record Type": item.recordType || "Error",
              "Status Code": item.statusCode,
              "Status Message": item.statusMessage,
              "Error Details": item.errorDetails ? item.errorDetails.join("; ") : ""
            };
          }
        });

        // Create worksheet with formatting
        const worksheet = XLSX.utils.json_to_sheet(excelData);

        // Add column widths
        const wscols = [
          { wch: 15 }, // Sequence ID
          { wch: 10 }, // Record Type
          { wch: 15 }, // Document Number/Status Code
          { wch: 15 }, // Company Code/Status Message
          { wch: 12 }, // Fiscal Year/Empty
          { wch: 20 }, // Formatted Document/Empty
          { wch: 50 }  // Message/Error Details
        ];
        worksheet['!cols'] = wscols;

        // Create workbook and add the worksheet
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, "Journal Entries");

        // Generate Excel file and trigger download
        const filename = this._getExportFilename(type, "xlsx");
        XLSX.writeFile(workbook, filename);

        MessageBox.success(`Data exported successfully to ${filename}`);
      } catch (error) {
        console.error("Excel export error:", error);
        MessageBox.error(`Failed to export data: ${error.message}`);

        // Fallback to CSV if Excel export fails
        this._exportToCSV(data, type);
      }
    };
    
    /**
     * Export to CSV format
     * @param {array} data - Data to export
     * @param {string} type - Export type (success, error, partial)
     */
    this._exportToCSV = function(data, type) {
      try {
        // Transform data for CSV export (similar to Excel transformation)
        const csvData = data.map(item => {
          if (item.documentNumber) {
            // Document entry
            return {
              "Sequence ID": item.sequenceId,
              "Record Type": item.recordType || "Success",
              "Document Number": item.documentNumber,
              "Company Code": item.companyCode,
              "Fiscal Year": item.fiscalYear,
              "Formatted Document": item.formattedDocNumber,
              "Message": item.message
            };
          } else {
            // Error entry
            return {
              "Sequence ID": item.sequenceId,
              "Record Type": item.recordType || "Error",
              "Status Code": item.statusCode,
              "Status Message": item.statusMessage,
              "Error Details": item.errorDetails ? item.errorDetails.join("; ") : ""
            };
          }
        });

        // Convert to CSV
        const headers = Object.keys(csvData[0]).join(',');
        const csvRows = csvData.map(row =>
          Object.values(row).map(value =>
            typeof value === 'string' ? `"${value.replace(/"/g, '""')}"` : value
          ).join(',')
        );
        const csvContent = [headers, ...csvRows].join('\n');

        // Create download link
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const filename = this._getExportFilename(type, "csv");

        const link = document.createElement('a');
        link.setAttribute('href', url);
        link.setAttribute('download', filename);
        link.style.visibility = 'hidden';

        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);

        MessageBox.success(`Data exported successfully to ${filename}`);
      } catch (error) {
        console.error("CSV export error:", error);
        MessageBox.error(`Failed to export data as CSV: ${error.message}`);
      }
    };
    
    /**
     * Export to PDF format
     * @param {array} data - Data to export
     * @param {string} type - Export type (success, error, partial)
     */
    this._exportToPDF = function(data, type) {
      try {
        // Check if pdfmake is available
        if (!window.pdfMake) {
          // Load pdfmake dynamically if not available
          this._loadPdfLibrary().then(() => {
            this._generatePDF(data, type);
          }).catch(error => {
            console.error("Failed to load PDF library:", error);
            MessageBox.error("Failed to load PDF export library. Please try Excel or CSV export instead.");
          });
        } else {
          this._generatePDF(data, type);
        }
      } catch (error) {
        console.error("PDF export error:", error);
        MessageBox.error(`Failed to export data as PDF: ${error.message}`);
      }
    };
    
    /**
     * Load PDF library dynamically
     * @returns {Promise} Promise resolving when libraries are loaded
     */
    this._loadPdfLibrary = function() {
      return new Promise((resolve, reject) => {
        // Load pdfmake and fonts
        const scriptPdf = document.createElement('script');
        scriptPdf.src = './utils/pdfmake.min.js';

        const scriptFonts = document.createElement('script');
        scriptFonts.src = './utils/vfs_fonts.js';

        scriptPdf.onload = () => {
          document.body.appendChild(scriptFonts);
        };

        scriptFonts.onload = () => {
          resolve();
        };

        scriptPdf.onerror = reject;
        scriptFonts.onerror = reject;

        document.body.appendChild(scriptPdf);
      });
    };
    
    /**
     * Generate PDF document
     * @param {array} data - Data to export
     * @param {string} type - Export type (success, error, partial)
     */
    this._generatePDF = function(data, type) {
      // Define document title based on type
      let title = "Journal Entries Upload Report";
      if (type === "success") {
        title = "Journal Entries Upload - Success Report";
      } else if (type === "error") {
        title = "Journal Entries Upload - Error Report";
      } else if (type === "partial") {
        title = "Journal Entries Upload - Partial Success Report";
      }

      // Create document definition
      const docDefinition = {
        pageSize: 'A4',
        pageOrientation: 'landscape',
        content: [
          { text: title, style: 'header' },
          { text: new Date().toLocaleString(), style: 'date' },
          { text: ' ' }, // Space
          this._createPdfContent(data, type)
        ],
        styles: {
          header: {
            fontSize: 18,
            bold: true,
            margin: [0, 0, 0, 10]
          },
          date: {
            fontSize: 12,
            italic: true,
            margin: [0, 0, 0, 20]
          },
          tableHeader: {
            bold: true,
            fontSize: 12,
            color: 'black',
            fillColor: '#f2f2f2'
          },
          success: {
            color: '#006400'
          },
          error: {
            color: '#8B0000'
          }
        }
      };

      // Generate PDF
      const filename = this._getExportFilename(type, "pdf");
      pdfMake.createPdf(docDefinition).download(filename);

      MessageBox.success(`Data exported successfully to ${filename}`);
    };
    
    /**
     * Create PDF content based on data type
     * @param {array} data - Data to export
     * @param {string} type - Export type (success, error, partial)
     * @returns {Object} PDF table definition
     */
    this._createPdfContent = function(data, type) {
      if (type === "success" || (type === "partial" && data.some(item => item.documentNumber))) {
        // Documents table
        const documentsData = data.filter(item => item.documentNumber);

        if (documentsData.length > 0) {
          const documentRows = documentsData.map(doc => [
            doc.sequenceId,
            doc.documentNumber,
            doc.companyCode,
            doc.fiscalYear,
            doc.message
          ]);

          return {
            table: {
              headerRows: 1,
              widths: ['auto', 'auto', 'auto', 'auto', '*'],
              body: [
                [
                  { text: 'Sequence ID', style: 'tableHeader' },
                  { text: 'Document Number', style: 'tableHeader' },
                  { text: 'Company Code', style: 'tableHeader' },
                  { text: 'Fiscal Year', style: 'tableHeader' },
                  { text: 'Message', style: 'tableHeader' }
                ],
                ...documentRows
              ]
            }
          };
        }
      }

      if (type === "error" || (type === "partial" && data.some(item => !item.documentNumber))) {
        // Errors table
        const errorsData = data.filter(item => !item.documentNumber);

        if (errorsData.length > 0) {
          const errorRows = errorsData.map(err => [
            err.sequenceId,
            err.statusCode || '',
            err.statusMessage || '',
            err.errorDetails ? err.errorDetails.join("; ") : ''
          ]);

          return {
            table: {
              headerRows: 1,
              widths: ['auto', 'auto', 'auto', '*'],
              body: [
                [
                  { text: 'Sequence ID', style: 'tableHeader' },
                  { text: 'Status Code', style: 'tableHeader' },
                  { text: 'Status Message', style: 'tableHeader' },
                  { text: 'Error Details', style: 'tableHeader' }
                ],
                ...errorRows
              ]
            }
          };
        }
      }

      // If we have both types in partial success
      if (type === "partial" &&
        data.some(item => item.documentNumber) &&
        data.some(item => !item.documentNumber)) {

        const documentsData = data.filter(item => item.documentNumber);
        const errorsData = data.filter(item => !item.documentNumber);

        const documentRows = documentsData.map(doc => [
          doc.sequenceId,
          'Success',
          doc.documentNumber,
          doc.companyCode,
          doc.fiscalYear,
          doc.message
        ]);

        const errorRows = errorsData.map(err => [
          err.sequenceId,
          'Error',
          '',
          '',
          '',
          err.statusMessage || err.errorDetails ? err.errorDetails.join("; ") : ''
        ]);

        return {
          table: {
            headerRows: 1,
            widths: ['auto', 'auto', 'auto', 'auto', 'auto', '*'],
            body: [
              [
                { text: 'Sequence ID', style: 'tableHeader' },
                { text: 'Status', style: 'tableHeader' },
                { text: 'Document Number', style: 'tableHeader' },
                { text: 'Company Code', style: 'tableHeader' },
                { text: 'Fiscal Year', style: 'tableHeader' },
                { text: 'Message/Error', style: 'tableHeader' }
              ],
              ...documentRows,
              ...errorRows
            ]
          }
        };
      }

      return { text: 'No data available', italics: true };
    };
    
    /**
     * Export validation error log to Excel
     * @param {array} errors - Error objects to export
     * @returns {Promise} Promise resolving when export is complete
     */
    this.exportErrorLog = function(errors) {
      try {
        // Validate input to prevent errors
        if (!Array.isArray(errors) || errors.length === 0) {
          MessageToast.show("No errors to export");
          return Promise.resolve();
        }

        // Import required modules if not already available
        return new Promise((resolve, reject) => {
          // Convert errors to exportable format with error checking
          const formattedErrors = errors.map((error, index) => {
            const errorId = index + 1;

            if (typeof error === 'string') {
              return {
                "Error ID": errorId,
                "Error Type": error.includes('not balanced') ? 'Balance Error' :
                  error.includes('must have') ? 'Missing Entries' :
                    error.includes('is required') ? 'Missing Fields' : 'Validation Error',
                "Error Description": error,
                "Timestamp": new Date().toISOString()
              };
            } else {
              return {
                "Error ID": errorId,
                "Error Type": (error && error.context) || 'System Error',
                "Error Description": (error && error.details && error.details.errorMessage) ||
                  (error ? JSON.stringify(error) : "Unknown error"),
                "Timestamp": (error && error.timestamp) || new Date().toISOString()
              };
            }
          });

          // Create export settings
          const exportSettings = {
            workbook: {
              columns: [
                {
                  label: "Error ID",
                  property: "Error ID",
                  type: EdmType.Number
                },
                {
                  label: "Error Type",
                  property: "Error Type",
                  type: EdmType.String
                },
                {
                  label: "Error Description",
                  property: "Error Description",
                  type: EdmType.String
                },
                {
                  label: "Timestamp",
                  property: "Timestamp",
                  type: EdmType.DateTime
                }
              ]
            },
            dataSource: formattedErrors,
            fileName: "Validation_Errors_" + new Date().toISOString().slice(0, 10) + ".xlsx"
          };

          // Create and download the spreadsheet
          const oSpreadsheet = new Spreadsheet(exportSettings);
          oSpreadsheet.build()
            .then(() => {
              MessageToast.show("Error log exported successfully");
              resolve();
            })
            .catch((exportError) => {
              const errorMessage = exportError.message || "Unknown export error";
              MessageBox.error(`Export failed: ${errorMessage}`);
              console.error("Export error:", exportError);
              reject(exportError);
            });
        });
      } catch (generalError) {
        MessageBox.error(`Error in export function: ${generalError.message}`);
        console.error("General error:", generalError);
        return Promise.reject(generalError);
      }
    };
    
    /**
     * Export transactions to structured Excel workbook
     * @param {array} transactions - Transactions to export
     * @param {string} filename - Output filename
     */
    this.exportTransactionsToWorkbook = function(transactions, filename) {
      try {
        // Group transactions by Sequence ID
        const transactionsBySequence = this._groupTransactionsBySequenceId(transactions);
        
        // Create workbook
        const wb = XLSX.utils.book_new();
        
        // Create summary sheet
        this._addSummarySheet(wb, transactionsBySequence);
        
        // Create detailed transaction sheet
        this._addTransactionDetailsSheet(wb, transactions);
        
        // Create sheet per sequence ID if there are multiple sequences
        if (Object.keys(transactionsBySequence).length > 1) {
          this._addSequenceSheets(wb, transactionsBySequence);
        }
        
        // Write file
        XLSX.writeFile(wb, filename || "Journal_Transactions_Export.xlsx");
        
        MessageToast.show("Transactions exported successfully to Excel");
      } catch (error) {
        console.error("Transaction export error:", error);
        MessageBox.error(`Failed to export transactions: ${error.message}`);
        this.oController._errorHandler.logError('Transaction Export Error', {
          errorMessage: error.message,
          errorStack: error.stack
        });
      }
    };
    
    /**
     * Group transactions by Sequence ID
     * @param {array} transactions - Transactions to group
     * @returns {object} Grouped transactions by sequence ID
     */
    this._groupTransactionsBySequenceId = function(transactions) {
      return transactions.reduce((acc, transaction) => {
        const sequenceId = transaction["Sequence ID"] || "Unknown";
        if (!acc[sequenceId]) {
          acc[sequenceId] = [];
        }
        acc[sequenceId].push(transaction);
        return acc;
      }, {});
    };
    
    /**
     * Add summary sheet to workbook
     * @param {object} wb - XLSX workbook
     * @param {object} transactionsBySequence - Transactions grouped by sequence ID
     */
    this._addSummarySheet = function(wb, transactionsBySequence) {
      const summaryData = Object.entries(transactionsBySequence).map(([sequenceId, transactions]) => {
        // Calculate totals
        const debitTotal = transactions
          .filter(t => t["Entry Type"] === "Debit")
          .reduce((sum, t) => sum + parseFloat(t["Amount"] || 0), 0);
          
        const creditTotal = transactions
          .filter(t => t["Entry Type"] === "Credit")
          .reduce((sum, t) => sum + parseFloat(t["Amount"] || 0), 0);
          
        // Get document information from first transaction
        const firstTransaction = transactions[0];
        
        return {
          "Sequence ID": sequenceId,
          "Document Type": firstTransaction["Accounting Document Type"],
          "Company Code": firstTransaction["Company Code"],
          "Reference ID": firstTransaction["Document Reference ID"],
          "Document Header": firstTransaction["Document Header Text"],
          "Document Date": firstTransaction["Document Date"],
          "Posting Date": firstTransaction["Posting Date"],
          "Debit Total": debitTotal,
          "Credit Total": creditTotal,
          "Balance": Math.abs(debitTotal - creditTotal) < 0.01 ? "Balanced" : "Unbalanced",
          "Status": transactions.every(t => t.status === "Valid") ? "Valid" : "Invalid",
          "Entry Count": transactions.length
        };
      });
      
      // Create worksheet
      const ws = XLSX.utils.json_to_sheet(summaryData);
      
      // Add column widths
      ws['!cols'] = [
        { wch: 12 }, // Sequence ID
        { wch: 15 }, // Document Type
        { wch: 12 }, // Company Code
        { wch: 15 }, // Reference ID
        { wch: 25 }, // Document Header
        { wch: 12 }, // Document Date
        { wch: 12 }, // Posting Date
        { wch: 12 }, // Debit Total
        { wch: 12 }, // Credit Total
        { wch: 10 }, // Balance
        { wch: 10 }, // Status
        { wch: 10 }  // Entry Count
      ];
      
      // Add to workbook
      XLSX.utils.book_append_sheet(wb, ws, "Summary");
    };
    
    /**
     * Add transaction details sheet to workbook
     * @param {object} wb - XLSX workbook
     * @param {array} transactions - All transactions
     */
    this._addTransactionDetailsSheet = function(wb, transactions) {
      // Map transactions to simplified format for export
      const exportData = transactions.map(t => ({
        "Sequence ID": t["Sequence ID"],
        "Entry Type": t["Entry Type"],
        "Document Type": t["Accounting Document Type"],
        "Status": t.status,
        "Company Code": t["Company Code"],
        "GL Account": t["GL Account"] || "",
        "Vendor Code": t["Vendor Code"] || "",
        "Indicator": t["Indicator"],
        "Currency": t["Currency"],
        "Amount": t["Amount"],
        "Document Date": t["Document Date"],
        "Posting Date": t["Posting Date"],
        "Reference": t["Reference Key"] || t["Reference Key 1"] || "",
        "Assignment": t["Assignment"] || "",
        "Business Place": t["Business Place"] || ""
      }));
      
      // Create worksheet
      const ws = XLSX.utils.json_to_sheet(exportData);
      
      // Add column widths
      ws['!cols'] = [
        { wch: 12 }, // Sequence ID
        { wch: 10 }, // Entry Type
        { wch: 15 }, // Document Type
        { wch: 10 }, // Status
        { wch: 12 }, // Company Code
        { wch: 12 }, // GL Account
        { wch: 12 }, // Vendor Code
        { wch: 10 }, // Indicator
        { wch: 10 }, // Currency
        { wch: 12 }, // Amount
        { wch: 12 }, // Document Date
        { wch: 12 }, // Posting Date
        { wch: 15 }, // Reference
        { wch: 15 }, // Assignment
        { wch: 12 }  // Business Place
      ];
      
      // Add to workbook
      XLSX.utils.book_append_sheet(wb, ws, "All Transactions");
    };
    
    /**
     * Add separate sheet for each sequence ID
     * @param {object} wb - XLSX workbook
     * @param {object} transactionsBySequence - Transactions grouped by sequence ID
     */
    this._addSequenceSheets = function(wb, transactionsBySequence) {
      // Limit to first 20 sequences to avoid creating too many sheets
      const sequences = Object.keys(transactionsBySequence).slice(0, 20);
      
      sequences.forEach(sequenceId => {
        const transactions = transactionsBySequence[sequenceId];
        
        // Create array for export
        const exportData = transactions.map(t => ({
          "Entry Type": t["Entry Type"],
          "Status": t.status,
          "GL Account": t["GL Account"] || "",
          "Vendor Code": t["Vendor Code"] || "",
          "Indicator": t["Indicator"],
          "Currency": t["Currency"],
          "Amount": t["Amount"],
          "Reference": t["Reference Key"] || t["Reference Key 1"] || "",
          "Assignment": t["Assignment"] || "",
          "Item Text": t["Item Text"] || ""
        }));
        
        // Create worksheet
        const ws = XLSX.utils.json_to_sheet(exportData);
        
        // Add to workbook (truncate sheet name if too long)
        const safeSheetName = `Seq_${sequenceId}`.substring(0, 31);
        XLSX.utils.book_append_sheet(wb, ws, safeSheetName);
      });
      
      // If there are more sequences than we created sheets for, add a note
      if (Object.keys(transactionsBySequence).length > 20) {
        const noteData = [{
          "Note": "Only the first 20 sequences have individual sheets. See 'All Transactions' for complete data."
        }];
        
        const ws = XLSX.utils.json_to_sheet(noteData);
        XLSX.utils.book_append_sheet(wb, ws, "Note");
      }
    };
    
    /**
     * Export journal entries validation report
     * @param {object} validationData - Validation data
     * @param {string} filename - Output filename
     */
    this.exportValidationReport = function(validationData, filename) {
      try {
        // Create workbook
        const wb = XLSX.utils.book_new();
        
        // Add summary sheet
        this._addValidationSummarySheet(wb, validationData);
        
        // Add error details if present
        if (validationData.errors && validationData.errors.length > 0) {
          this._addValidationErrorsSheet(wb, validationData.errors);
        }
        
        // Write file
        XLSX.writeFile(wb, filename || "Validation_Report.xlsx");
        
        MessageToast.show("Validation report exported successfully");
      } catch (error) {
        console.error("Validation report export error:", error);
        MessageBox.error(`Failed to export validation report: ${error.message}`);
      }
    };
    
    /**
     * Add validation summary sheet to workbook
     * @param {object} wb - XLSX workbook
     * @param {object} validationData - Validation data
     */
    this._addValidationSummarySheet = function(wb, validationData) {
      // Prepare summary data
      const summaryData = [
        { "Metric": "Total Entries", "Value": validationData.totalEntries || 0 },
        { "Metric": "Valid Entries", "Value": validationData.validEntries || 0 },
        { "Metric": "Invalid Entries", "Value": validationData.invalidEntries || 0 },
        { "Metric": "Validation Status", "Value": validationData.isValid ? "Passed" : "Failed" },
        { "Metric": "Error Count", "Value": (validationData.errors && validationData.errors.length) || 0 },
        { "Metric": "Validation Date", "Value": new Date().toISOString() }
      ];
      
      // Create worksheet
      const ws = XLSX.utils.json_to_sheet(summaryData);
      
      // Add to workbook
      XLSX.utils.book_append_sheet(wb, ws, "Validation Summary");
    };
    
    /**
     * Add validation errors sheet to workbook
     * @param {object} wb - XLSX workbook
     * @param {array} errors - Validation errors
     */
    this._addValidationErrorsSheet = function(wb, errors) {
      // Group errors by type
      const errorsByType = this._groupErrorsByType(errors);
      
      // Prepare error data for export
      const errorData = [];
      
      // Add headers for error types
      Object.keys(errorsByType).forEach(errorType => {
        errorData.push({ "Error Type": errorType, "Error Message": "", "Sequence ID": "", "Sheet": "" });
        
        // Add errors for this type
        errorsByType[errorType].forEach(error => {
          errorData.push({
            "Error Type": "",
            "Error Message": error.message || error,
            "Sequence ID": error.sequenceId || "N/A",
            "Sheet": error.sheet || "Unknown"
          });
        });
        
        // Add blank row between error types
        errorData.push({ "Error Type": "", "Error Message": "", "Sequence ID": "", "Sheet": "" });
      });
      
      // Create worksheet
      const ws = XLSX.utils.json_to_sheet(errorData);
      
      // Add column widths
      ws['!cols'] = [
        { wch: 20 }, // Error Type
        { wch: 60 }, // Error Message
        { wch: 15 }, // Sequence ID
        { wch: 15 }  // Sheet
      ];
      
      // Add to workbook
      XLSX.utils.book_append_sheet(wb, ws, "Validation Errors");
    };
    
    /**
     * Group errors by type
     * @param {array} errors - Validation errors
     * @returns {object} Errors grouped by type
     */
    this._groupErrorsByType = function(errors) {
      return errors.reduce((groups, error) => {
        let errorType = "General";
        
        if (typeof error === 'string') {
          if (error.includes('not balanced')) {
            errorType = 'Balance Error';
          } else if (error.includes('must have')) {
            errorType = 'Missing Entries';
          } else if (error.includes('is required')) {
            errorType = 'Missing Fields';
          } else if (error.includes('must be a valid')) {
            errorType = 'Format Error';
          }
        } else if (typeof error === 'object') {
          const message = error.message || "";
          
          if (message.includes('not balanced')) {
            errorType = 'Balance Error';
          } else if (message.includes('must have')) {
            errorType = 'Missing Entries';
          } else if (message.includes('is required')) {
            errorType = 'Missing Fields';
          } else if (message.includes('must be a valid')) {
            errorType = 'Format Error';
          } else {
            errorType = error.context || 'System Error';
          }
        }
        
        if (!groups[errorType]) {
          groups[errorType] = [];
        }
        
        groups[errorType].push(error);
        return groups;
      }, {});
    };
    
    /**
     * Create a unified workbook with formatted data for reporting
     * @param {object} data - Combined data for report
     * @param {string} filename - Output filename
     */
    this.createReportWorkbook = function(data, filename) {
      try {
        const wb = XLSX.utils.book_new();
        
        // Add report info sheet
        this._addReportInfoSheet(wb, data);
        
        // Add transactions sheet
        if (data.transactions && data.transactions.length > 0) {
          this._addTransactionDetailsSheet(wb, data.transactions);
        }
        
        // Add documents sheet if documents exist
        if (data.documents && data.documents.length > 0) {
          this._addDocumentsSheet(wb, data.documents);
        }
        
        // Add errors sheet if errors exist
        if (data.errors && data.errors.length > 0) {
          this._addErrorsSheet(wb, data.errors);
        }
        
        // Write file
        XLSX.writeFile(wb, filename || "Journal_Entries_Report.xlsx");
        
        MessageToast.show("Report exported successfully");
        return true;
      } catch (error) {
        console.error("Report export error:", error);
        MessageBox.error(`Failed to export report: ${error.message}`);
        return false;
      }
    };
    
    /**
     * Add report info sheet to workbook
     * @param {object} wb - XLSX workbook
     * @param {object} data - Report data
     */
    this._addReportInfoSheet = function(wb, data) {
      // Create report metadata
      const reportInfo = [
        { "Property": "Report Date", "Value": new Date().toLocaleString() },
        { "Property": "Report Type", "Value": data.reportType || "Journal Entries Report" },
        { "Property": "Total Transactions", "Value": (data.transactions && data.transactions.length) || 0 },
        { "Property": "Total Documents", "Value": (data.documents && data.documents.length) || 0 },
        { "Property": "Total Errors", "Value": (data.errors && data.errors.length) || 0 },
        { "Property": "Generated By", "Value": data.user || "System" }
      ];
      
      // Create worksheet
      const ws = XLSX.utils.json_to_sheet(reportInfo);
      
      // Add to workbook
      XLSX.utils.book_append_sheet(wb, ws, "Report Info");
    };
    
    /**
     * Add documents sheet to workbook
     * @param {object} wb - XLSX workbook
     * @param {array} documents - Document data
     */
    this._addDocumentsSheet = function(wb, documents) {
      // Format documents for export
      const docsForExport = documents.map(doc => ({
        "Sequence ID": doc.sequenceId || "",
        "Document Number": doc.documentNumber || "",
        "Company Code": doc.companyCode || "",
        "Fiscal Year": doc.fiscalYear || "",
        "Formatted Document": doc.formattedDocNumber || `${doc.documentNumber || ""}/${doc.companyCode || ""}/${doc.fiscalYear || ""}`,
        "Status": doc.statusCode || "S",
        "Message": doc.message || doc.statusMessage || ""
      }));
      
      // Create worksheet
      const ws = XLSX.utils.json_to_sheet(docsForExport);
      
      // Add column widths
      ws['!cols'] = [
        { wch: 12 }, // Sequence ID
        { wch: 15 }, // Document Number
        { wch: 12 }, // Company Code
        { wch: 10 }, // Fiscal Year
        { wch: 20 }, // Formatted Document
        { wch: 8 },  // Status
        { wch: 50 }  // Message
      ];
      
      // Add to workbook
      XLSX.utils.book_append_sheet(wb, ws, "Documents");
    };
    
    /**
     * Add errors sheet to workbook
     * @param {object} wb - XLSX workbook
     * @param {array} errors - Error data
     */
    this._addErrorsSheet = function(wb, errors) {
      // Format errors for export
      const errorsForExport = errors.map(err => {
        // Handle both string and object formats
        if (typeof err === 'string') {
          return {
            "Sequence ID": "N/A",
            "Error Type": "Validation Error",
            "Error Message": err,
            "Status Code": "",
            "Timestamp": new Date().toISOString()
          };
        } else {
          return {
            "Sequence ID": err.sequenceId || "N/A",
            "Error Type": err.errorType || "System Error",
            "Error Message": err.message || err.statusMessage || JSON.stringify(err),
            "Status Code": err.statusCode || "",
            "Timestamp": err.timestamp || new Date().toISOString()
          };
        }
      });
      
      // Create worksheet
      const ws = XLSX.utils.json_to_sheet(errorsForExport);
      
      // Add column widths
      ws['!cols'] = [
        { wch: 12 }, // Sequence ID
        { wch: 15 }, // Error Type
        { wch: 60 }, // Error Message
        { wch: 12 }, // Status Code
        { wch: 20 }  // Timestamp
      ];
      
      // Add to workbook
      XLSX.utils.book_append_sheet(wb, ws, "Errors");
    };
    
    /**
     * Export structured error log to CSV with improved formatting
     * @param {array} errors - Array of error objects to export
     * @param {string} filename - Optional filename
     */
    this.exportStructuredErrorLog = function(errors, filename) {
      try {
        if (!Array.isArray(errors) || errors.length === 0) {
          MessageToast.show("No errors to export");
          return;
        }
        
        // Construct CSV content with proper headers
        let csvContent = "Category,Sequence ID,Sheet,Error Message\n";
        
        // Handle different error object formats
        errors.forEach(error => {
          const errorObj = typeof error === 'string' ? 
            { message: error, sequenceId: 'N/A', sheet: 'Unknown' } : error;
          
          // Determine the category from error message
          let category = 'General';
          const message = errorObj.message || errorObj.toString();
          
          if (message.includes('not balanced')) {
            category = 'Balance';
          } else if (message.includes('must have')) {
            category = 'Missing Entries';
          } else if (message.includes('is required')) {
            category = 'Required Field';
          } else if (message.includes('must be a valid')) {
            category = 'Format';
          } else if (message.includes('Invalid')) {
            category = 'Validation';
          }
          
          // Escape special characters in CSV
          const sequenceId = (errorObj.sequenceId || 'N/A').toString().replace(/"/g, '""');
          const sheet = (errorObj.sheet || 'Unknown').toString().replace(/"/g, '""');
          const safeMessage = message.replace(/"/g, '""');
          
          // Add row to CSV
          csvContent += `"${category}","${sequenceId}","${sheet}","${safeMessage}"\n`;
        });
        
        // Create and trigger download
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const downloadFilename = filename || `Error_Log_${new Date().toISOString().slice(0, 10)}.csv`;
        
        const link = document.createElement('a');
        link.setAttribute('href', url);
        link.setAttribute('download', downloadFilename);
        link.style.visibility = 'hidden';
        
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        
        // Clean up
        setTimeout(() => {
          URL.revokeObjectURL(url);
        }, 100);
        
        MessageToast.show("Error log exported to CSV successfully");
      } catch (error) {
        console.error("Error exporting CSV:", error);
        MessageBox.error(`Failed to export errors: ${error.message}`);
        this.oController._errorHandler.logError('CSV Export Error', {
          errorMessage: error.message,
          errorStack: error.stack
        });
      }
    };
    
    /**
     * Create backup of all data in a single workbook
     * Useful for disaster recovery or auditing
     * @param {object} dataContext - All data context objects
     * @param {string} filename - Filename for backup
     */
    this.createDataBackup = function(dataContext, filename) {
      try {
        const wb = XLSX.utils.book_new();
        
        // Add metadata sheet
        this._addBackupMetadataSheet(wb, dataContext);
        
        // Add each data context to separate sheets
        if (dataContext.transactions) {
          this._addTransactionDetailsSheet(wb, dataContext.transactions);
        }
        
        if (dataContext.documents) {
          this._addDocumentsSheet(wb, dataContext.documents);
        }
        
        if (dataContext.errors) {
          this._addErrorsSheet(wb, dataContext.errors);
        }
        
        if (dataContext.validationStats) {
          this._addValidationStatsSheet(wb, dataContext.validationStats);
        }
        
        // Add system information
        this._addSystemInfoSheet(wb);
        
        // Generate filename with timestamp if not provided
        const backupFilename = filename || `Journal_Entry_Backup_${new Date().toISOString().replace(/[:.]/g, '-')}.xlsx`;
        
        // Write file
        XLSX.writeFile(wb, backupFilename);
        
        MessageToast.show("Data backup created successfully");
        return true;
      } catch (error) {
        console.error("Backup creation error:", error);
        MessageBox.error(`Failed to create backup: ${error.message}`);
        this.oController._errorHandler.logError('Backup Creation Error', {
          errorMessage: error.message,
          errorStack: error.stack
        });
        return false;
      }
    };
    
    /**
     * Add backup metadata sheet with information about the backup
     * @param {object} wb - XLSX workbook
     * @param {object} dataContext - Data context for backup
     */
    this._addBackupMetadataSheet = function(wb, dataContext) {
      // Create metadata for backup
      const metadata = [
        { "Property": "Backup Date", "Value": new Date().toLocaleString() },
        { "Property": "User", "Value": dataContext.user || "System" },
        { "Property": "Application", "Value": "Journal Entry Upload Tool" },
        { "Property": "Version", "Value": "1.0.0" },
        { "Property": "Total Transactions", "Value": (dataContext.transactions && dataContext.transactions.length) || 0 },
        { "Property": "Total Documents", "Value": (dataContext.documents && dataContext.documents.length) || 0 },
        { "Property": "Total Errors", "Value": (dataContext.errors && dataContext.errors.length) || 0 }
      ];
      
      // Create worksheet
      const ws = XLSX.utils.json_to_sheet(metadata);
      
      // Add to workbook
      XLSX.utils.book_append_sheet(wb, ws, "Backup Metadata");
    };
    
    /**
     * Add system information sheet to backup
     * @param {object} wb - XLSX workbook
     */
    this._addSystemInfoSheet = function(wb) {
      // Get relevant system info
      const systemInfo = [
        { "Property": "Environment", "Value": window.location.hostname },
        { "Property": "Browser", "Value": navigator.userAgent },
        { "Property": "Date", "Value": new Date().toISOString() },
        { "Property": "Platform", "Value": navigator.platform },
        { "Property": "Language", "Value": navigator.language }
      ];
      
      // Create worksheet
      const ws = XLSX.utils.json_to_sheet(systemInfo);
      
      // Add to workbook
      XLSX.utils.book_append_sheet(wb, ws, "System Info");
    };
    
    /**
     * Add validation statistics sheet to backup
     * @param {object} wb - XLSX workbook
     * @param {object} stats - Validation statistics
     */
    this._addValidationStatsSheet = function(wb, stats) {
      // Create worksheet from stats
      const ws = XLSX.utils.json_to_sheet([stats]);
      
      // Add to workbook
      XLSX.utils.book_append_sheet(wb, ws, "Validation Stats");
    };
  };
});