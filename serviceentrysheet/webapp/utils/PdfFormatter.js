sap.ui.define([
  "sap/m/MessageBox",
  "sap/m/MessageToast"
], function (MessageBox, MessageToast) {
  "use strict";

  return class PdfFormatter {
    constructor() {
      this.pdfLibraryLoaded = false;
    }

    getFileExtension() { return ".pdf"; }
    getMimeType() { return "application/pdf"; }

    /**
     * Loads the PDF libraries asynchronously
     * @returns {Promise} Promise that resolves when libraries are loaded
     */
    _loadPdfLibrary() {
      return new Promise((resolve, reject) => {
        try {
          // Show "loading" message
          MessageToast.show("Loading PDF export library, please wait...");

          // Load pdfmake and fonts
          const scriptPdf = document.createElement("script");
          scriptPdf.src = "./utils/pdfmake.min.js";

          const scriptFonts = document.createElement("script");
          scriptFonts.src = "./utils/vfs_fonts.js";

          scriptPdf.onload = () => {
            console.log("PDF library loaded successfully");
            document.body.appendChild(scriptFonts);
          };

          scriptFonts.onload = () => {
            console.log("Fonts library loaded successfully");
            if (window.pdfMake) {
              this.pdfLibraryLoaded = true;
              resolve();
            } else {
              reject(new Error("PDFMake library not available after loading"));
            }
          };

          scriptPdf.onerror = (e) => {
            console.error("Failed to load pdfmake.min.js:", e);
            reject(new Error("Failed to load pdfmake.min.js: " + e.message));
          };

          scriptFonts.onerror = (e) => {
            console.error("Failed to load vfs_fonts.js:", e);
            reject(new Error("Failed to load vfs_fonts.js: " + e.message));
          };

          document.body.appendChild(scriptPdf);
        } catch (error) {
          console.error("Error in PDF library loading:", error);
          reject(error);
        }
      });
    }

    /**
     * Creates a PDF from an array of data using PDFMake.
     * @param {Array<object>} data - Array of processed data objects.
     * @param {object} [options={}] - PDF generation options.
     * @returns {Promise<Blob>} Promise resolving with the PDF Blob.
     */
    format(data, options = {}) {
 
      return new Promise((resolve, reject) => {
        // First load/ensure PDF libraries are available
        this._loadPdfLibrary()
          .then(() => {
            try {
              if (!data || data.length === 0) {
                reject(new Error("No data provided for PDF export."));
                return;
              }

              // Define title based on report type
              const reportType = options.reportType || "all";
              let title = options.title || "Service Entry Sheet - Upload Log Report";
              if (reportType === "success") {
                title += " (Success Records)";
              } else if (reportType === "error") {
                title += " (Error Records)";
              }

              // Define priority levels for columns (1=highest, 3=lowest)
              const columns = [
                {
                  name: "Sequence",
                  prop: "SequenceNumber",
                  width: 30,
                  priority: 1
                },
                {
                  name: "PO Number",
                  prop: "PurchaseOrder",
                  width: 50,
                  priority: 1
                },
                {
                  name: "PO Item",
                  prop: "PurchaseOrderItem",
                  width: 35,
                  priority: 1
                },
                {
                  name: "SES",
                  prop: "ServiceEntrySheet",
                  width: 30,
                  priority: 1
                },
                {
                  name: "SES Name",
                  prop: "ServiceEntrySheetName",
                  width: 60,
                  priority: 2
                },
                {
                  name: "GRN Create",
                  prop: "GRNCreate",
                  width: 50,
                  priority: 2
                },
                {
                  name: "Supplier",
                  prop: "Supplier",
                  width: 40,
                  priority: 1
                },
                {
                  name: "Plant",
                  prop: "Plant",
                  width: 30,
                  priority: 2
                },
                {
                  name: "Purch. Org",
                  prop: "PurchasingOrganization",
                  width: 30,
                  priority: 3
                },
                {
                  name: "Purch. Group",
                  prop: "PurchasingGroup",
                  width: 40,
                  priority: 3
                },
                {
                  name: "GL Account",
                  prop: "GLAccount",
                  width: 50,
                  priority: 2
                },
                {
                  name: "WBS Element",
                  prop: "WBSElement",
                  width: 80,
                  priority: 2
                },
                {
                  name: "Status",
                  prop: "Status",
                  width: 40,
                  priority: 1
                },
                {
                  name: "Message",
                  prop: "Message",
                  width: 140,
                  priority: 1
                }
              ];

              // Filter columns based on priority if specified in options
              let activeColumns = columns;
              if (options.priorityLevel) {
                activeColumns = columns.filter(col => col.priority <= options.priorityLevel);
              }

              // Calculate available page width based on page size and orientation
              const pageWidth = options.orientation === "portrait" ? 515 : 770; // Approximate values for A4

              // Dynamic column width adjustment
              this._adjustColumnWidths(activeColumns, pageWidth);

              // Improved text handling function with proper line breaks
              const formatText = (text, col) => {
                if (text === null || text === undefined) return "";

                // Convert to string
                text = String(text).trim();

                // For high priority columns that might contain important error messages, ensure full content
                if (col.priority === 1 && (col.prop === "Message" || col.prop === "Status" || col.prop === "ErrorMessage" || col.prop === "SuccessMessage")) {
                  return {
                    text: text,
                    fontSize: 8,
                    lineHeight: 1.1
                  };
                }

                return {
                  text: text,
                  fontSize: 8,
                  lineHeight: 1.1
                };
              };

              // Prepare table body with headers
              const tableBody = [
                activeColumns.map((col) => ({
                  text: col.name,
                  style: "tableHeader",
                  width: col.width
                }))
              ];

              // Process data rows with improved text handling
              data.forEach((item) => {
                const row = activeColumns.map((col) => {
                  // For error records, use ErrorMessage if available and Status is Error
                  let rawValue = item[col.prop] !== undefined ? item[col.prop] : "";

                  if (col.prop === "Message") {
                    rawValue = item?.Status === "Error"
                      ? item?.ErrorMessage
                      : item?.Status === "Success"
                        ? item?.SuccessMessage
                        : "";
                  }


                  // Status color coding
                  const textStyle =
                    col.prop === "Status"
                      ? rawValue === "Success"
                        ? "successText"
                        : "errorText"
                      : null;

                  const cellContent = formatText(rawValue, col);

                  // Apply style if needed
                  if (textStyle) {
                    cellContent.style = textStyle;
                  }

                  return cellContent;
                });

                tableBody.push(row);
              });

              // Count success and error records
              const successCount = data.filter(
                (item) => item.Status === "Success"
              ).length;
              const errorCount = data.filter(
                (item) => item.Status === "Error"
              ).length;

              // Create document definition
              const docDefinition = {
                pageOrientation: options.orientation || "landscape",
                pageSize: options.pageSize || "A4",
                pageMargins: [15, 30, 15, 30], // Smaller margins to maximize content space
                content: [
                  {
                    text: title,
                    style: "header",
                    margin: [0, 0, 0, 10]
                  },
                  {
                    text: `Generated: ${new Date().toLocaleString()}`,
                    style: "subheader",
                    margin: [0, 0, 0, 10]
                  },
                  {
                    table: {
                      headerRows: 1,
                      widths: activeColumns.map((col) => col.width),
                      body: tableBody,
                      dontBreakRows: true,
                      keepWithHeaderRows: 1
                    },
                    layout: {
                      fillColor: (rowIndex) => {
                        // Alternate row colors
                        return rowIndex === 0
                          ? "#4472C4"
                          : rowIndex % 2 === 0
                            ? "#F2F2F2"
                            : null;
                      },
                      hLineWidth: (i) => 0.5,
                      vLineWidth: (i) => 0.5,
                      hLineColor: (i) => "#AAAAAA",
                      vLineColor: (i) => "#AAAAAA"
                    }
                  },
                  {
                    text: `Summary: Total ${data.length} entries, ${successCount} successful, ${errorCount} failed`,
                    style: "summary",
                    margin: [0, 10, 0, 0]
                  }
                ],
                styles: {
                  header: {
                    fontSize: 18,
                    bold: true
                  },
                  subheader: {
                    fontSize: 10
                  },
                  tableHeader: {
                    bold: true,
                    color: "white",
                    fontSize: 9
                  },
                  successText: {
                    color: "green",
                    bold: true
                  },
                  errorText: {
                    color: "red",
                    bold: true
                  },
                  summary: {
                    fontSize: 10,
                    bold: true
                  }
                },
                footer: function (currentPage, pageCount) {
                  return {
                    text: `Page ${currentPage} of ${pageCount}`,
                    alignment: "right",
                    fontSize: 8,
                    margin: [0, 0, 40, 0]
                  };
                },
                defaultStyle: {
                  fontSize: 8
                }
              };

              // Create PDF with Blob output
              const pdfDocGenerator = pdfMake.createPdf(docDefinition);

              // Get PDF as blob
              pdfDocGenerator.getBlob((blob) => {
                resolve(blob);
              });
            } catch (error) {
              console.error("Error generating PDF:", error);
              reject(error);
            }
          })
          .catch(error => {
            console.error("Error loading PDF libraries:", error);
            MessageBox.error(
              "Failed to load PDF export library. Please try Excel or CSV export instead."
            );
            reject(error);
          });
      });
    }

    /**
     * Dynamically adjusts column widths based on available page width
     * @param {Array} columns - Array of column definitions
     * @param {number} pageWidth - Available page width
     */
    _adjustColumnWidths(columns, pageWidth) {
      // Calculate total of all column width requirements
      const totalWidth = columns.reduce((sum, col) => sum + col.width, 0);

      // If total exceeds page width, adjust based on priority
      if (totalWidth > pageWidth) {
        // Calculate how much we need to reduce
        const reductionFactor = pageWidth / totalWidth;

        // First pass - reduce all columns proportionally
        columns.forEach(col => {
          // High priority columns get reduced less
          if (col.priority === 1) {
            col.width = Math.max(Math.floor(col.width * Math.sqrt(reductionFactor)), 30);
          }
          // Medium priority columns get reduced normally
          else if (col.priority === 2) {
            col.width = Math.max(Math.floor(col.width * reductionFactor), 25);
          }
          // Low priority columns get reduced more
          else {
            col.width = Math.max(Math.floor(col.width * reductionFactor * 0.8), 20);
          }
        });

        // Ensure the Message column (usually containing errors) stays reasonably wide
        const messageCol = columns.find(col => col.prop === "Message");
        if (messageCol) {
          messageCol.width = Math.max(messageCol.width, 100);
        }
      }
    }
  };
});