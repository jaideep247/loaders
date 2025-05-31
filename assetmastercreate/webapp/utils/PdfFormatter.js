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
              let title = options.title || "Asset Master Create - Upload Report";
              if (reportType === "success") {
                title += " (Success Records)";
              } else if (reportType === "error") {
                title += " (Error Records)";
              }

              // Define columns for Asset Master Create documents
              const columns = [
                {
                  name: "Seq No",
                  prop: "OriginalSequence",
                  width: 30,
                  wrap: false
                },
                {
                  name: "Company Code",
                  prop: "CompanyCode",
                  width: 40,
                  wrap: false
                },
                {
                  name: "Asset Class",
                  prop: "AssetClass",
                  width: 40,
                  wrap: false
                },
                {
                  name: "Description",
                  prop: "FixedAssetDescription",
                  width: 80,
                  wrap: true
                },
                {
                  name: "Additional Desc",
                  prop: "AssetAdditionalDescription",
                  width: 70,
                  wrap: true
                },
                {
                  name: "Serial Number",
                  prop: "AssetSerialNumber",
                  width: 50,
                  wrap: false
                },
                {
                  name: "WBS Element",
                  prop: "WBSElementExternalID",
                  width: 50,
                  wrap: false
                },
                {
                  name: "Status",
                  prop: "Status",
                  width: 35,
                  wrap: false
                },
                {
                  name: "Message",
                  prop: "Message",
                  width: 100,
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
                  let rawValue = item[col.prop] || "";

                  // Special handling for boolean fields
                  if (col.prop === "AssetIsForPostCapitalization") {
                    rawValue = rawValue === true || rawValue === "true" || rawValue === "X" ? "Yes" : "No";
                  }

                  // Apply truncation based on column configuration
                  const processedValue = col.wrap
                    ? truncateText(rawValue, col.width * 2)
                    : String(rawValue);

                  // Status color coding
                  const textStyle =
                    col.prop === "Status"
                      ? processedValue === "Valid" || processedValue === "Success"
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

              // Count valid and invalid records
              const validCount = data.filter(
                (item) => item.Status === "Valid" || item.Status === "Success"
              ).length;
              const invalidCount = data.filter(
                (item) => item.Status === "Invalid" || item.Status === "Error" || item.Status === "Failed"
              ).length;

              // Create document definition
              const docDefinition = {
                pageOrientation: options.orientation || "landscape",
                pageSize: options.pageSize || "A4",
                pageMargins: [20, 40, 20, 40],
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
                      },
                      hLineWidth: function (i, node) {
                        return 0.5;
                      },
                      vLineWidth: function (i, node) {
                        return 0.5;
                      },
                      hLineColor: function (i, node) {
                        return '#CCCCCC';
                      },
                      vLineColor: function (i, node) {
                        return '#CCCCCC';
                      },
                      paddingLeft: function (i, node) { return 4; },
                      paddingRight: function (i, node) { return 4; },
                      paddingTop: function (i, node) { return 2; },
                      paddingBottom: function (i, node) { return 2; }
                    }
                  },
                  {
                    text: `Summary: Total ${data.length} assets, ${validCount} valid, ${invalidCount} invalid`,
                    style: "summary",
                    margin: [0, 10, 0, 0]
                  }
                ],
                styles: {
                  header: {
                    fontSize: 18,
                    bold: true,
                    color: '#2E4053'
                  },
                  subheader: {
                    fontSize: 10,
                    color: '#5D6D7E'
                  },
                  tableHeader: {
                    bold: true,
                    color: "white",
                    fontSize: 8,
                    alignment: 'center'
                  },
                  normalText: {
                    fontSize: 7,
                    color: '#2C3E50'
                  },
                  successText: {
                    color: '#27AE60',
                    fontSize: 7,
                    bold: true
                  },
                  errorText: {
                    color: '#E74C3C',
                    fontSize: 7,
                    bold: true
                  },
                  summary: {
                    fontSize: 10,
                    bold: true,
                    color: '#34495E'
                  }
                },
                footer: function (currentPage, pageCount) {
                  return {
                    columns: [
                      {
                        text: 'Asset Master Create Export',
                        alignment: 'left',
                        fontSize: 8,
                        color: '#7F8C8D',
                        margin: [40, 0, 0, 0]
                      },
                      {
                        text: `Page ${currentPage} of ${pageCount}`,
                        alignment: 'right',
                        fontSize: 8,
                        color: '#7F8C8D',
                        margin: [0, 0, 40, 0]
                      }
                    ]
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