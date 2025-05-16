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
              let title = options.title || "Material Document - Upload Log Report";
              if (reportType === "success") {
                title += " (Success Records)";
              } else if (reportType === "error") {
                title += " (Error Records)";
              }

              // Define columns with updated Message field (consolidated from Error/Success messages)
              const columns = [
                {
                  name: "Sequence",
                  prop: "SequenceNumber",
                  width: 30,
                  wrap: false
                },
                {
                  name: "Material Document",
                  prop: "MaterialDocument",
                  width: 60,
                  wrap: true
                },
                {
                  name: "GRN Document",
                  prop: "GRNDocumentNumber",
                  width: 60,
                  wrap: true
                },
                {
                  name: "Material",
                  prop: "Material",
                  width: 60,
                  wrap: true
                },
                {
                  name: "Plant",
                  prop: "Plant",
                  width: 40,
                  wrap: false
                },
                {
                  name: "Storage Loc",
                  prop: "StorageLocation",
                  width: 40,
                  wrap: false
                },
                {
                  name: "Document Date",
                  prop: "DocumentDate",
                  width: 50,
                  wrap: false
                },
                {
                  name: "Posting Date",
                  prop: "PostingDate",
                  width: 50,
                  wrap: false
                },
                {
                  name: "Status",
                  prop: "Status",
                  width: 40,
                  wrap: false
                },
                {
                  name: "Message", // Consolidated message field
                  prop: "Message",
                  width: 120,
                  wrap: true
                }
              ];

              // Intelligent text truncation and wrapping function
              const truncateText = (text, maxLength = 200) => {
                if (!text) return "";
                // Convert to string and trim
                text = String(text).trim();
                // If text is shorter than max length, return as is
                if (text.length <= maxLength) return text;
                // Truncate and add ellipsis
                return text.substring(0, maxLength) + "...";
              };

              // Prepare table body with headers
              const tableBody = [
                columns.map((col) => ({
                  text: col.name,
                  style: "tableHeader",
                  width: col.width
                }))
              ];

              // Process data rows with intelligent truncation
              data.forEach((item) => {
                const row = columns.map((col) => {
                  const rawValue = item[col.prop] || "";
                  // Apply truncation based on column configuration
                  const processedValue = col.wrap
                    ? truncateText(rawValue, col.width)
                    : String(rawValue);

                  // Status color coding
                  const textStyle =
                    col.prop === "Status"
                      ? processedValue === "Success"
                        ? "successText"
                        : "errorText"
                      : "normalText";

                  return {
                    text: processedValue,
                    style: textStyle,
                    width: col.width
                  };
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
                      widths: columns.map((col) => col.width),
                      body: tableBody
                    },
                    layout: {
                      fillColor: (rowIndex) => {
                        // Alternate row colors
                        return rowIndex === 0
                          ? "#4472C4"
                          : rowIndex % 2 === 0
                            ? "#F2F2F2"
                            : null;
                      }
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
                    fontSize: 10
                  },
                  normalText: {
                    fontSize: 8
                  },
                  successText: {
                    color: "green",
                    fontSize: 8
                  },
                  errorText: {
                    color: "red",
                    fontSize: 8
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
  };
});