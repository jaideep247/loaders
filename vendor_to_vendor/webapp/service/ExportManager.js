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
        XLSX.writeFile(wb, "Vendor_to_Vendor.xlsx");
      };

      /**
       * Create template workbook with sample data
       * @returns {object} XLSX workbook object
       */
      this._createTemplateWorkbook = function () {
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
        const vendorDebitLines = [
          "Sequence ID",
          "Reference Document Item",
          "Indicator (S-Dr, H-Cr.)",
          "Vendor Code",
          "Currency",
          "Amount",
          "Assignment",
          "Reference Key-1",
          "Item Text",
          "Business Place"
        ];
        const vendorDebitData = [
          [
            "1",
            "1",
            "S",
            "21000014",
            "INR",
            "1000",
            "Axis Vendor",
            "Ref Vendor",
            "Debit Item Vendor Text",
            "1007"
          ]
        ];
        const glSheet = XLSX.utils.aoa_to_sheet([vendorDebitLines, ...vendorDebitData]);
        XLSX.utils.book_append_sheet(wb, glSheet, "Vendor Debit Lines");

        // Vendor Lines Transactions Sheet (Vendor Lines Entries Only)
        const vendorCreditLines = [
          "Sequence ID",
          "Reference Document Item",
          "Indicator (S-Dr, H-Cr.)",
          "Vendor Code",
          "Currency",
          "Amount",
          "Assignment",
          "Reference Key-1",
          "Item Text",
          "Business Place"
        ];
        const vendorCreditData = [
          [
            "1",
            "1",
            "H",
            "21000014",
            "INR",
            "1000",
            "Axis Vendor",
            "Ref Vendor",
            "Credit Item Vendor Text",
            "1007"
          ]
        ];
        const debitorSheet = XLSX.utils.aoa_to_sheet([
          vendorCreditLines,
          ...vendorCreditData
        ]);
        XLSX.utils.book_append_sheet(
          wb,
          debitorSheet,
          "Vendor Credit Lines"
        );

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

        return `vendor_to_vendor_entries_${typeStr}_${timestamp}.${extension}`;
      };

      /**
       * Export to CSV format
       * @param {array} data - Data to export
       * @param {string} type - Export type (success, error, partial)
       */
      this._exportToCSV = function (data, type) {
        try {
          // Transform data for CSV export
          const csvData = data.map((item) => {
            if (item.documentNumber) {
              // Document entry
              return {
                "Sequence ID": item.sequenceId,
                "Record Type": item.recordType || "Success",
                "Document Number": item.documentNumber,
                "Company Code": item.companyCode,
                "Fiscal Year": item.fiscalYear,
                "Formatted Document": item.formattedDocNumber,
                Message: item.message
              };
            } else {
              // Error entry
              return {
                "Sequence ID": item.sequenceId,
                "Record Type": item.recordType || "Error",
                "Status Code": item.statusCode,
                "Status Message": item.statusMessage,
                "Error Details": item.errorDetails
                  ? item.errorDetails.join("; ")
                  : ""
              };
            }
          });

          // Convert to CSV
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
        let title = "Customer Collection Entries Upload Report";
        if (type === "success") {
          title = "Customer Collection Entries Upload - Success Report";
        } else if (type === "error") {
          title = "Customer Collection Entries Upload - Error Report";
        } else if (type === "partial") {
          title = "Customer Collection Entries Upload - Partial Success Report";
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
        if (
          type === "success" ||
          (type === "partial" && data.some((item) => item.documentNumber))
        ) {
          // Documents table
          const documentsData = data.filter((item) => item.documentNumber);

          if (documentsData.length > 0) {
            const documentRows = documentsData.map((doc) => [
              doc.sequenceId,
              doc.documentNumber,
              doc.companyCode,
              doc.fiscalYear,
              doc.message
            ]);

            return {
              table: {
                headerRows: 1,
                widths: ["auto", "auto", "auto", "auto", "*"],
                body: [
                  [
                    { text: "Sequence ID", style: "tableHeader" },
                    { text: "Document Number", style: "tableHeader" },
                    { text: "Company Code", style: "tableHeader" },
                    { text: "Fiscal Year", style: "tableHeader" },
                    { text: "Message", style: "tableHeader" }
                  ],
                  ...documentRows
                ]
              }
            };
          }
        }

        if (
          type === "error" ||
          (type === "partial" && data.some((item) => !item.documentNumber))
        ) {
          // Errors table
          const errorsData = data.filter((item) => !item.documentNumber);

          if (errorsData.length > 0) {
            const errorRows = errorsData.map((err) => [
              err.sequenceId,
              err.statusCode || "",
              err.statusMessage || "",
              err.errorDetails ? err.errorDetails.join("; ") : ""
            ]);

            return {
              table: {
                headerRows: 1,
                widths: ["auto", "auto", "auto", "*"],
                body: [
                  [
                    { text: "Sequence ID", style: "tableHeader" },
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

        // If we have both types in partial success
        if (
          type === "partial" &&
          data.some((item) => item.documentNumber) &&
          data.some((item) => !item.documentNumber)
        ) {
          const documentsData = data.filter((item) => item.documentNumber);
          const errorsData = data.filter((item) => !item.documentNumber);

          const documentRows = documentsData.map((doc) => [
            doc.sequenceId,
            "Success",
            doc.documentNumber,
            doc.companyCode,
            doc.fiscalYear,
            doc.message
          ]);

          const errorRows = errorsData.map((err) => [
            err.sequenceId,
            "Error",
            "",
            "",
            "",
            err.statusMessage || err.errorDetails
              ? err.errorDetails.join("; ")
              : ""
          ]);

          return {
            table: {
              headerRows: 1,
              widths: ["auto", "auto", "auto", "auto", "auto", "*"],
              body: [
                [
                  { text: "Sequence ID", style: "tableHeader" },
                  { text: "Status", style: "tableHeader" },
                  { text: "Document Number", style: "tableHeader" },
                  { text: "Company Code", style: "tableHeader" },
                  { text: "Fiscal Year", style: "tableHeader" },
                  { text: "Message/Error", style: "tableHeader" }
                ],
                ...documentRows,
                ...errorRows
              ]
            }
          };
        }

        return { text: "No data available", italics: true };
      };
    };
  }
);
