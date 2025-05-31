sap.ui.define(
  [
    "sap/m/MessageBox",
    "sap/m/MessageToast",
    "sap/ui/export/Spreadsheet",
    "sap/ui/export/library",
    "sap/ui/core/format/DateFormat"
  ],
  function (MessageBox, MessageToast, Spreadsheet, exportLibrary, DateFormat) {
    "use strict";

    const EdmType = exportLibrary.EdmType;

    /**
     * ExportManager
     * Responsible for data export functions (Excel, CSV, PDF)
     */
    return function (oController) {
      this.oController = oController;

      /**
       * Download the template Excel file
       */
      this.downloadTemplate = function () {
        const wb = this._createTemplateWorkbook();
        XLSX.writeFile(wb, "Supplier_Invoice_Template.xlsx");
      };

      /**
       * Create template workbook with sample data
       * @returns {object} XLSX workbook object
       */
      this._createTemplateWorkbook = function () {
        const wb = XLSX.utils.book_new();

        // Header_and_Credits Sheet (matches your structure exactly)
        const headerCreditHeaders = [
          "Sequence Id",
          "CompanyCode",
          "DocumentDate",
          "PostingDate",
          "SupplierInvoiceIDByInvcgParty",
          "InvoicingParty",
          "DocumentCurrency",
          "InvoiceGrossAmount",
          "DocumentHeaderText",
          "PaymentTerms",
          "Supplierlineitemtext",
          "AccountingDocumentType",
          "InvoiceReference",
          "InvoiceReferenceFiscalYear",
          "AssignmentReference",
          "TaxIsCalculatedAutomatically",
          "BusinessPlace",
          "BusinessSectionCode",
          "TaxDeterminationDate",
          "GSTPartner",
          "GSTPlaceOfSupply",
          "SupplierInvoiceItem",
          "s-CompanyCode",
          "CostCenter"
        ];

        const headerCreditData = [
          [
            1,                        // Sequence Id
            1000,                     // CompanyCode
            "2025-01-15",            // DocumentDate
            "2025-01-15",            // PostingDate
            "INV-2025-001",          // SupplierInvoiceIDByInvcgParty
            22000011,                // InvoicingParty
            "INR",                   // DocumentCurrency
            118000,                  // InvoiceGrossAmount
            "Sample Header Text",    // DocumentHeaderText
            "NT30",                  // PaymentTerms
            "Sample line text",      // Supplierlineitemtext
            "KR",                    // AccountingDocumentType
            5105600181,              // InvoiceReference
            2024,                    // InvoiceReferenceFiscalYear
            "SAMPLE_ASSIGNMENT",     // AssignmentReference
            "",                      // TaxIsCalculatedAutomatically
            1007,                    // BusinessPlace
            "",                      // BusinessSectionCode
            "2025-01-15",           // TaxDeterminationDate
            22000011,               // GSTPartner
            "HR",                   // GSTPlaceOfSupply
            1,                      // SupplierInvoiceItem
            1000,                   // s-CompanyCode
            "TSI"                   // CostCenter
          ]
        ];

        const headerCreditSheet = XLSX.utils.aoa_to_sheet([
          headerCreditHeaders,
          ...headerCreditData
        ]);
        XLSX.utils.book_append_sheet(wb, headerCreditSheet, "Header_and_Credits");

        // Debits Sheet (matches your structure exactly)
        const debitsHeaders = [
          "Sequence Id",
          "GLAccount",
          "WBSElement",
          "DocumentCurrency",
          "SupplierInvoiceItemAmount",
          "TaxCode",
          "DebitCreditCode",
          "SupplierInvoiceItemText",
          "AssignmentReference",
          "TDSTAXTYPE",
          "TDSTAXCODE",
          "TDSCurrency"
        ];

        const debitsData = [
          [
            1,                       // Sequence Id
            66000110,               // GLAccount
            "C-FINDIP-DL",          // WBSElement
            "INR",                  // DocumentCurrency
            118000,                 // SupplierInvoiceItemAmount
            "G0",                   // TaxCode
            "S",                    // DebitCreditCode
            "Sample debit text",    // SupplierInvoiceItemText
            "99999 HSN",           // AssignmentReference
            "3I",                  // TDSTAXTYPE
            "I3",                  // TDSTAXCODE
            "INR"                  // TDSCurrency
          ]
        ];

        const debitsSheet = XLSX.utils.aoa_to_sheet([
          debitsHeaders,
          ...debitsData
        ]);
        XLSX.utils.book_append_sheet(wb, debitsSheet, "Debits");

        return wb;
      };

      /**
       * Export data to Excel
       * @param {array} data - Data to export
       * @param {string} filename - Output filename
       */
      this.exportToExcel = function (data, filename) {
        try {
          // Create settings for excel export
          const exportSettings = {
            workbook: {
              columns: [
                {
                  label: "Sequence Id",
                  property: "Sequence Id",
                  type: EdmType.String
                },
                {
                  label: "Company Code",
                  property: "CompanyCode",
                  type: EdmType.String
                },
                {
                  label: "Status",
                  property: "status",
                  type: EdmType.String
                },
                {
                  label: "Document Date",
                  property: "DocumentDate",
                  type: EdmType.Date
                },
                {
                  label: "Posting Date",
                  property: "PostingDate",
                  type: EdmType.Date
                },
                {
                  label: "Supplier Invoice ID",
                  property: "SupplierInvoiceIDByInvcgParty",
                  type: EdmType.String
                },
                {
                  label: "Invoicing Party",
                  property: "InvoicingParty",
                  type: EdmType.String
                },
                {
                  label: "Document Currency",
                  property: "DocumentCurrency",
                  type: EdmType.String
                },
                {
                  label: "Invoice Gross Amount",
                  property: "InvoiceGrossAmount",
                  type: EdmType.Number
                },
                {
                  label: "Document Header Text",
                  property: "DocumentHeaderText",
                  type: EdmType.String
                },
                {
                  label: "Payment Terms",
                  property: "PaymentTerms",
                  type: EdmType.String
                },
                {
                  label: "GL Account",
                  property: "GLAccount",
                  type: EdmType.String
                },
                {
                  label: "WBS Element",
                  property: "WBSElement",
                  type: EdmType.String
                },
                {
                  label: "Supplier Invoice Item Amount",
                  property: "SupplierInvoiceItemAmount",
                  type: EdmType.Number
                },
                {
                  label: "Tax Code",
                  property: "TaxCode",
                  type: EdmType.String
                },
                {
                  label: "Debit Credit Code",
                  property: "DebitCreditCode",
                  type: EdmType.String
                }
              ]
            },
            dataSource: data,
            fileName: filename
          };

          // Create and download the spreadsheet
          new Spreadsheet(exportSettings)
            .build()
            .then(() => {
              MessageToast.show("Export completed successfully");
            })
            .catch((error) => {
              MessageBox.error(`Export failed: ${error.message}`);
              this.oController._errorHandler.logError("Excel Export Error", {
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
      this.exportData = function (format, type, uiManager) {
        let data = [];

        // Get the appropriate data based on type
        if (type === "success" && uiManager._dialogs.successDialog) {
          data = uiManager._dialogs.successDialog
            .getModel("success")
            .getProperty("/documents");
        } else if (type === "error" && uiManager._dialogs.errorDialog) {
          data = uiManager._dialogs.errorDialog
            .getModel("error")
            .getProperty("/errors");
        } else if (
          type === "partial" &&
          uiManager._dialogs.partialSuccessDialog
        ) {
          // Combine documents and errors for partial success
          const partialModel =
            uiManager._dialogs.partialSuccessDialog.getModel("partial");
          const documents = partialModel.getProperty("/documents");
          const errors = partialModel.getProperty("/errors");

          // Create combined dataset with type indicator
          data = [
            ...documents.map((doc) => ({ ...doc, recordType: "Success" })),
            ...errors.map((err) => ({ ...err, recordType: "Error" }))
          ];
        }

        if (!data || data.length === 0) {
          MessageBox.information("No data available to export.");
          return;
        }

        // Export data in the requested format
        switch (format) {
          case "xlsx":
            this.exportToExcel(data, this._getExportFilename(type, "xlsx"));
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
      this._getExportFilename = function (type, extension) {
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

        return `supplier_invoice_${typeStr}_${timestamp}.${extension}`;
      };

      /**
       * Export to CSV format
       * @param {array} data - Data to export
       * @param {string} type - Export type (success, error, partial)
       */
      this._exportToCSV = function (data, type) {
        try {
          // Transform data for CSV export based on your file structure
          const csvData = data.map((item) => {
            if (item.supplierInvoiceId || item["Sequence Id"]) {
              // Invoice document entry
              return {
                "Sequence Id": item["Sequence Id"] || item.sequenceId,
                "Company Code": item.CompanyCode || item.companyCode,
                "Record Type": item.recordType || "Success",
                "Document Date": item.DocumentDate || item.documentDate,
                "Posting Date": item.PostingDate || item.postingDate,
                "Supplier Invoice ID": item.SupplierInvoiceIDByInvcgParty || item.supplierInvoiceId,
                "Invoicing Party": item.InvoicingParty || item.invoicingParty,
                "Document Currency": item.DocumentCurrency || item.documentCurrency,
                "Invoice Gross Amount": item.InvoiceGrossAmount || item.invoiceGrossAmount,
                "Document Header Text": item.DocumentHeaderText || item.documentHeaderText,
                "GL Account": item.GLAccount || item.glAccount,
                "WBS Element": item.WBSElement || item.wbsElement,
                "Tax Code": item.TaxCode || item.taxCode,
                "Message": item.message || item.statusMessage
              };
            } else {
              // Error entry
              return {
                "Sequence Id": item["Sequence Id"] || item.sequenceId || "Unknown",
                "Company Code": item.CompanyCode || item.companyCode || "",
                "Record Type": item.recordType || "Error",
                "Status Code": item.statusCode || "",
                "Status Message": item.statusMessage || "",
                "Error Details": item.errorDetails ? item.errorDetails.join("; ") : "",
                "Document ID": item.documentId || ""
              };
            }
          });

          // Create CSV content
          const headers = Object.keys(csvData[0]).join(",");
          const csvRows = csvData.map((row) =>
            Object.values(row)
              .map((value) =>
                typeof value === "string"
                  ? `"${value.replace(/"/g, '""')}"`
                  : value
              )
              .join(",")
          );
          const csvContent = [headers, ...csvRows].join("\n");

          // Create download link
          const blob = new Blob([csvContent], {
            type: "text/csv;charset=utf-8;"
          });
          const url = URL.createObjectURL(blob);
          const filename = this._getExportFilename(type, "csv");

          const link = document.createElement("a");
          link.setAttribute("href", url);
          link.setAttribute("download", filename);
          link.style.visibility = "hidden";

          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);

          MessageToast.show(`Data exported successfully to ${filename}`);
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
      this._exportToPDF = function (data, type) {
        try {
          // Check if pdfmake is available
          if (!window.pdfMake) {
            // Load pdfmake dynamically if not available
            this._loadPdfLibrary()
              .then(() => {
                this._generatePDF(data, type);
              })
              .catch((error) => {
                console.error("Failed to load PDF library:", error);
                MessageBox.error(
                  "Failed to load PDF export library. Please try Excel or CSV export instead."
                );
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
      this._loadPdfLibrary = function () {
        return new Promise((resolve, reject) => {
          // Load pdfmake and fonts
          const scriptPdf = document.createElement("script");
          scriptPdf.src = "./utils/pdfmake.min.js";

          const scriptFonts = document.createElement("script");
          scriptFonts.src = "./utils/vfs_fonts.js";

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
      this._generatePDF = function (data, type) {
        // Define document title based on type
        let title = "Supplier Invoice Entries Upload Report";
        if (type === "success") {
          title = "Supplier Invoice Entries Upload - Success Report";
        } else if (type === "error") {
          title = "Supplier Invoice Entries Upload - Error Report";
        } else if (type === "partial") {
          title = "Supplier Invoice Entries Upload - Partial Success Report";
        }

        // Create document definition
        const docDefinition = {
          pageSize: "A4",
          pageOrientation: "landscape",
          content: [
            { text: title, style: "header" },
            { text: new Date().toLocaleString(), style: "date" },
            { text: " " }, // Space
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
              color: "black",
              fillColor: "#f2f2f2"
            },
            success: {
              color: "#006400"
            },
            error: {
              color: "#8B0000"
            }
          }
        };

        // Generate PDF
        const filename = this._getExportFilename(type, "pdf");
        pdfMake.createPdf(docDefinition).download(filename);

        MessageToast.show(`Data exported successfully to ${filename}`);
      };

      /**
       * Create PDF content based on data type
       * @param {array} data - Data to export
       * @param {string} type - Export type (success, error, partial)
       * @returns {Object} PDF table definition
       */
      this._createPdfContent = function (data, type) {
        if (type === "success" || (type === "partial" && data.some((item) => item["Sequence Id"]))) {
          // Documents table
          const documentsData = data.filter((item) => item["Sequence Id"] || item.sequenceId);

          if (documentsData.length > 0) {
            const documentRows = documentsData.map((doc) => [
              doc["Sequence Id"] || doc.sequenceId,
              doc.CompanyCode || doc.companyCode,
              doc.SupplierInvoiceIDByInvcgParty || doc.supplierInvoiceId,
              doc.InvoicingParty || doc.invoicingParty,
              doc.InvoiceGrossAmount || doc.invoiceGrossAmount,
              doc.DocumentCurrency || doc.documentCurrency,
              doc.message || doc.statusMessage
            ]);

            return {
              table: {
                headerRows: 1,
                widths: ["auto", "auto", "auto", "auto", "auto", "auto", "*"],
                body: [
                  [
                    { text: "Sequence Id", style: "tableHeader" },
                    { text: "Company Code", style: "tableHeader" },
                    { text: "Supplier Invoice ID", style: "tableHeader" },
                    { text: "Invoicing Party", style: "tableHeader" },
                    { text: "Gross Amount", style: "tableHeader" },
                    { text: "Currency", style: "tableHeader" },
                    { text: "Message", style: "tableHeader" }
                  ],
                  ...documentRows
                ]
              }
            };
          }
        }

        if (type === "error" || (type === "partial" && data.some((item) => !item["Sequence Id"] && !item.sequenceId))) {
          // Errors table
          const errorsData = data.filter((item) => !item["Sequence Id"] && !item.sequenceId);

          if (errorsData.length > 0) {
            const errorRows = errorsData.map((err) => [
              err["Sequence Id"] || err.sequenceId || "Unknown",
              err.CompanyCode || err.companyCode || "",
              err.statusCode || "",
              err.statusMessage || "",
              err.errorDetails ? err.errorDetails.join("; ") : ""
            ]);

            return {
              table: {
                headerRows: 1,
                widths: ["auto", "auto", "auto", "auto", "*"],
                body: [
                  [
                    { text: "Sequence Id", style: "tableHeader" },
                    { text: "Company Code", style: "tableHeader" },
                    { text: "Status Code", style: "tableHeader" },
                    { text: "Status Message", style: "tableHeader" },
                    { text: "Error Details", style: "tableHeader" }
                  ],
                  ...errorRows
                ]
              }
            };
          }
        }

        return { text: "No data available", italics: true };
      };

      /**
       * Export validation errors to CSV
       * @param {object} groupedErrors - Errors grouped by category
       */
      this.exportValidationErrors = function (groupedErrors) {
        try {
          let csvContent = "SequenceID,Category,Error\n";

          Object.entries(groupedErrors).forEach(([category, categoryErrors]) => {
            categoryErrors.forEach(error => {
              const errorObj = typeof error === "string" ? { message: error } : error;
              const errorSeqId = errorObj.sequenceId || "N/A";
              const message = errorObj.message || error;
              const safeError = message.replace(/"/g, '""');
              csvContent += `"${errorSeqId}","${category}","${safeError}"\n`;
            });
          });

          this._downloadCSV(csvContent, 'validation_errors_' + new Date().toISOString().slice(0, 10) + '.csv');
        } catch (error) {
          console.error("Error exporting validation errors:", error);
          MessageBox.error("Failed to export errors: " + error.message);
        }
      };

      /**
       * Export partial results (both success and errors)
       * @param {array} successData - Success data
       * @param {array} errorData - Error data
       */
      this.exportPartialResults = function (successData, errorData) {
        try {
          let csvContent = "Type,SequenceID,DocumentNumber,CompanyCode,Status,Message\n";

          // Add success entries
          successData.forEach(doc => {
            const safeMessage = (doc.message || "").replace(/"/g, '""');
            csvContent += `"Success","${doc.sequenceId}","${doc.documentNumber}","${doc.companyCode}","${doc.statusCode}","${safeMessage}"\n`;
          });

          // Add error entries
          errorData.forEach(error => {
            const safeMessage = (error.statusMessage || "").replace(/"/g, '""');
            csvContent += `"Error","${error.sequenceId}","","","${error.statusCode}","${safeMessage}"\n`;
          });

          this._downloadCSV(csvContent, 'partial_results_' + new Date().toISOString().slice(0, 10) + '.csv');
        } catch (error) {
          console.error("Error exporting partial results:", error);
          MessageBox.error("Failed to export results: " + error.message);
        }
      };

      /**
       * Export error details
       * @param {array} errorData - Error data  
       */
      this.exportErrorDetails = function (errorData) {
        try {
          let csvContent = "SequenceID,StatusCode,StatusMessage,TransactionID,ErrorDetails\n";

          errorData.forEach(error => {
            const safeMessage = (error.statusMessage || "").replace(/"/g, '""');
            const safeDetails = (error.errorDetails.join("; ") || "").replace(/"/g, '""');
            csvContent += `"${error.sequenceId}","${error.statusCode}","${safeMessage}","${error.transactionId || ""}","${safeDetails}"\n`;
          });

          this._downloadCSV(csvContent, 'error_details_' + new Date().toISOString().slice(0, 10) + '.csv');
        } catch (error) {
          console.error("Error exporting error details:", error);
          MessageBox.error("Failed to export errors: " + error.message);
        }
      };

      /**
       * Download CSV file helper
       * @param {string} csvContent - CSV content
       * @param {string} filename - Filename
       * @private
       */
      this._downloadCSV = function (csvContent, filename) {
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        const url = URL.createObjectURL(blob);

        link.setAttribute('href', url);
        link.setAttribute('download', filename);
        link.style.visibility = 'hidden';

        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);

        setTimeout(() => {
          URL.revokeObjectURL(url);
        }, 100);

        MessageToast.show("File exported successfully");
      };
    };
  }
);