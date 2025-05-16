sap.ui.define([
  "sap/m/MessageBox",
  "sap/m/MessageToast"
  // pdfmake libraries are loaded dynamically
], function (MessageBox, MessageToast) {
  "use strict";

  return class PdfFormatter {
    constructor() {
      this.pdfLibraryLoaded = false;
      // Consider adding paths to pdfmake scripts to config or constants
      this.pdfMakeScriptPath = "./utils/pdfmake.min.js"; // Adjust path if needed
      this.pdfFontsScriptPath = "./utils/vfs_fonts.js"; // Adjust path if needed
    }

    getFileExtension() { return ".pdf"; }
    getMimeType() { return "application/pdf"; }

    /** Loads the PDF libraries asynchronously */
    _loadPdfLibrary() {
      if (this.pdfLibraryLoaded) {
        return Promise.resolve();
      }
      return new Promise((resolve, reject) => {
        try {
          if (window.pdfMake && window.pdfMake.fonts) {
            console.log("PDF libraries already loaded.");
            this.pdfLibraryLoaded = true;
            return resolve();
          }

          MessageToast.show("Loading PDF library...");

          const scriptPdf = document.createElement("script");
          scriptPdf.src = this.pdfMakeScriptPath;
          scriptPdf.async = true;

          const scriptFonts = document.createElement("script");
          scriptFonts.src = this.pdfFontsScriptPath;
          scriptFonts.async = true;

          let pdfLoaded = false;
          let fontsLoaded = false;

          const checkCompletion = () => {
            if (pdfLoaded && fontsLoaded) {
              if (window.pdfMake) {
                console.log("pdfMake and vfs_fonts loaded successfully.");
                this.pdfLibraryLoaded = true;
                resolve();
              } else {
                reject(new Error("pdfMake library failed to initialize."));
              }
            }
          };

          scriptPdf.onload = () => { pdfLoaded = true; checkCompletion(); };
          scriptFonts.onload = () => { fontsLoaded = true; checkCompletion(); };

          scriptPdf.onerror = (e) => reject(new Error(`Failed to load ${this.pdfMakeScriptPath}: ${e.message}`));
          scriptFonts.onerror = (e) => reject(new Error(`Failed to load ${this.pdfFontsScriptPath}: ${e.message}`));

          document.head.appendChild(scriptPdf); // Append to head for cleaner loading
          document.head.appendChild(scriptFonts);

        } catch (error) {
          console.error("Error initiating PDF library loading:", error);
          reject(error);
        }
      });
    }

    /**
     * Creates a PDF from an array of data (e.g., batch results).
     * @param {Array<object>} data - Array of processed data objects (standardized format expected).
     * @param {object} [options={}] - PDF generation options (e.g., title, reportType).
     * @returns {Promise<Blob>} Promise resolving with the PDF Blob.
     */
    format(data, options = {}) {
      return new Promise((resolve, reject) => {
        this._loadPdfLibrary()
          .then(() => {
            try {
              if (!data || data.length === 0 || (data.length === 1 && data[0].Status === "No Records")) {
                reject(new Error("No data provided for PDF export."));
                return;
              } 
              // Debug log the full data structure
              console.log("PDF Export - Full data object:", data);

              // Determine Report Type and Title
              const reportType = options.reportType || "all"; // "all", "success", "error"
              let title = options.title || "Fixed Asset Acquisition - Upload Report";
              if (reportType === "success") title += " (Successful Records)";
              else if (reportType === "error") title += " (Failed Records)";

              // Analyze data to determine what fields are available
              const allKeys = new Set();
              data.forEach(item => {
                Object.keys(item).forEach(key => {
                  if (key !== "__metadata" && key !== "entry" && key !== "response") {
                    allKeys.add(key);
                  }
                });
              });
              console.log("All available keys in data:", Array.from(allKeys));

              // --- Define Columns for Fixed Asset Report ---
              // Core fields to always include if possible
              const coreFields = [
                { name: "Seq", prop: "SequenceID", width: 25 },
                { name: "Company Code", prop: "CompanyCode", width: 50 },
                { name: "Asset", prop: "MasterFixedAsset", width: 45 },
                { name: "Asset Acqu Posted", prop: "ReferenceDocument", width: 50 }, // Document number column
                { name: "Post Date", prop: "PostingDate", width: 45 },
                { name: "Amount", prop: "AcqnAmtInTransactionCurrency", width: 50, alignment: 'right' },
                { name: "Curr", prop: "TransactionCurrency", width: 30 },
                { name: "Offset Acc", prop: "OffsettingAccount", width: 45 },
                { name: "Status", prop: "Status", width: 35 },
                { name: "Message", prop: "Message", width: '*' } // Use remaining space
              ];

              // Build actual columns based on available data
              const columns = coreFields.filter(field =>
                Array.from(allKeys).includes(field.prop) || field.prop === "Message" || field.prop === "Status"
              );

              // Add message and status explicitly if not already included
              if (!columns.find(col => col.prop === "Message")) {
                columns.push({ name: "Message", prop: "Message", width: '*' });
              }
              if (!columns.find(col => col.prop === "Status")) {
                columns.push({ name: "Status", prop: "Status", width: 35 });
              }

              console.log("Using columns for PDF:", columns);
 
              // Function to get display value (handles success/error messages)
              const getDisplayValue = (item, colProp) => {
                // For Message column, use multiple possible sources including ReferenceDocument and UUID
                if (colProp === 'Message') {
                  // For success records, show both document number (ReferenceDocument) and UUID
                  if (item.Status === 'Success' || item.Status === 'success' || item.Status === 'OK') {
                    // Get document number from ReferenceDocument field
                    const docNumber = item.ReferenceDocument || "";
                    // Get UUID if available
                    const uuid = item.FixedAssetPostingUUID || "";

                    // If we have both, show both
                    if (docNumber && uuid) {
                      return `Asset posted with document ${docNumber} (UUID: ${uuid})`;
                    }
                    // If we only have document number
                    else if (docNumber) {
                      return `Asset posted with document ${docNumber}`;
                    }
                    // If we only have UUID 
                    else if (uuid) {
                      return `Asset posted with UUID: ${uuid}`;
                    }
                    // Fallback
                    else {
                      return item.Message ||
                        (item.message && typeof item.message === 'object' ? item.message.message :
                          typeof item.message === 'string' ? item.message : 'Success');
                    }
                  } else {
                    // For error records, use the error message
                    return item.Message ||
                      item.errorMessage ||
                      (item.message && typeof item.message === 'object' ? item.message.message :
                        typeof item.message === 'string' ? item.message : 'Error');
                  }
                }

                // For Status column, normalize different possible status formats
                if (colProp === 'Status') {
                  const statusValue = item.Status || "";
                  // Normalize status values
                  if (statusValue.toLowerCase() === 'success' ||
                    statusValue.toLowerCase() === 'ok' ||
                    statusValue === '200') {
                    return 'Success';
                  } else if (statusValue.toLowerCase().includes('error') ||
                    statusValue.toLowerCase().includes('fail')) {
                    return 'Error';
                  }
                  return statusValue;
                }

                // Format amounts as numbers with 2 decimal places
                if (colProp === 'AcqnAmtInTransactionCurrency') {
                  const amount = parseFloat(item[colProp]);
                  return !isNaN(amount) ? amount.toFixed(2) : item[colProp] || "";
                }

                // For any other column, return the value if it exists
                return item[colProp] !== undefined ? item[colProp] : "";
              };

              // Prepare PDFMake table body
              const tableBody = [
                // Header Row
                columns.map(col => ({ text: col.name, style: "tableHeader" }))
              ];

              // Data Rows
              data.forEach(item => {
                const row = columns.map(col => {
                  const text = getDisplayValue(item, col.prop);
                  let style = "normalText";
                  if (col.prop === 'Status') {
                    style = (text === 'Success') ? 'successText' : 'errorText';
                  }
                  return {
                    text: text,
                    style: style,
                    alignment: col.alignment || 'left'
                  };
                });
                tableBody.push(row);
              });

              // Calculate summary counts
              const successCount = data.filter(item =>
                item.Status === 'Success' ||
                item.Status === 'success' ||
                item.Status === 'OK'
              ).length;

              const errorCount = data.length - successCount;
              const totalCount = data.length;

              // --- Define PDF Document ---
              const docDefinition = {
                // Set to landscape to fit more columns horizontally
                pageOrientation: "landscape",
                // Use A4 size for most compatibility
                pageSize: "A4",
                // Reduce margins to maximize usable space
                pageMargins: [15, 20, 15, 20], // [left, top, right, bottom]
                content: [
                  { text: title, style: "header", margin: [0, 0, 0, 5] },
                  { text: `Generated: ${new Date().toLocaleString()}`, style: "subheader", margin: [0, 0, 0, 5] },
                  {
                    table: {
                      headerRows: 1,
                      // Calculate column widths dynamically based on available page width
                      widths: columns.map(col => col.width),
                      body: tableBody,
                      // Enable table to break across pages if needed
                      dontBreakRows: false
                    },
                    layout: {
                      hLineWidth: (i, node) => 0.5,
                      vLineWidth: (i, node) => 0.5,
                      hLineColor: (i, node) => (i === 0 || i === node.table.body.length) ? 'black' : 'grey',
                      vLineColor: (i, node) => 'grey',
                      // Reduce cell padding to fit more content
                      paddingLeft: (i, node) => 3,
                      paddingRight: (i, node) => 3,
                      paddingTop: (i, node) => 2,
                      paddingBottom: (i, node) => 2,
                      fillColor: (rowIndex) => (rowIndex === 0) ? '#D3D3D3' : null // Header grey
                    }
                  },
                  { text: `Summary: Total ${totalCount}, Successful ${successCount}, Failed ${errorCount}`, style: "summary", margin: [0, 5, 0, 0] }
                ],
                styles: {
                  header: { fontSize: 14, bold: true },
                  subheader: { fontSize: 8, italics: true },
                  tableHeader: { bold: true, fontSize: 8, color: 'black' },
                  // Reduce text size to fit more
                  normalText: { fontSize: 7 },
                  successText: { fontSize: 7, color: 'green' },
                  errorText: { fontSize: 7, color: 'red', bold: true },
                  summary: { fontSize: 8, bold: true }
                },
                footer: (currentPage, pageCount) => ({
                  text: `Page ${currentPage} of ${pageCount}`,
                  alignment: 'right', fontSize: 7, margin: [0, 0, 20, 0]
                }),
                // Compression can help reduce file size
                compress: true
              };

              console.log("PDF document definition created. Generating PDF...");

              // Generate PDF
              const pdfDocGenerator = window.pdfMake.createPdf(docDefinition);
              pdfDocGenerator.getBlob(
                (blob) => resolve(blob),
                (error) => reject(error || new Error("PDF generation failed in getBlob callback."))
              );

            } catch (error) {
              console.error("Error during PDF document definition or generation:", error);
              reject(error);
            }
          })
          .catch(error => {
            console.error("Error loading PDF libraries:", error);
            MessageBox.error("Failed to load PDF export library. Please try Excel or CSV export instead.");
            reject(error);
          });
      });
    }
  };
});