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
              let title = options.title || "Fixed Asset Retirement - Upload Report";
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

              // --- Define Required Fields for Fixed Asset Retirement Report ---
              // Include all the fields requested in the customer's requirements
              const requiredFields = [
                { name: "Sequence ID", prop: "Sequence ID", width: 30 },
                { name: "Reference\nDocument Item", prop: "Reference Document Item", width: 45 },
                { name: "Business Transaction Type", prop: "Business Transaction Type", width: 45 },
                { name: "Company Code", prop: "Company Code", width: 30 },
                { name: "Master Fixed Asset", prop: "Master Fixed Asset", width: 40 },
                { name: "Fixed Asset", prop: "Fixed Asset", width: 30 },
                { name: "Document\nDate", prop: "Document Date", width: 40 },
                { name: "Posting Date", prop: "Posting Date", width: 40 },
                { name: "Asset Value Date", prop: "Asset Value Date", width: 40 },
                { name: "Retirement\nType", prop: "Retirement Type", width: 40 },
                { name: "Document Reference ID", prop: "Document Reference ID", width: 45 },
                { name: "Accounting\nDocument Type", prop: "Accounting Document Type", width: 40 },
                { name: "Assignment\nReference", prop: "Assignment Reference", width: 40 },
                { name: "Document Item Text", prop: "Document Item Text", width: 50 },
                { name: "Status", prop: "Status", width: 30 },
                { name: "Message", prop: "Message", width: "*" }
              ];

              // Build actual columns based on available data and required fields
              let columns = [];

              // First, add all the required fields that exist in the data
              requiredFields.forEach(field => {
                if (Array.from(allKeys).includes(field.prop)) {
                  columns.push({
                    name: field.name,
                    prop: field.prop,
                    width: field.width || 40  // Use specified width or default to 40
                  });
                }
              });

              // If we don't have any columns yet (which would be unusual), use all available keys
              if (columns.length === 0) {
                columns = Array.from(allKeys).map(key => ({
                  name: key,
                  prop: key,
                  width: 40  // Default width
                }));
              }

              // Ensure Status and Message are included (these are special fields)
              if (!columns.find(col => col.prop === "Message" || col.prop === "message")) {
                columns.push({ name: "Message", prop: "Message", width: '*' });
              }
              if (!columns.find(col => col.prop === "Status" || col.prop === "status")) {
                columns.push({ name: "Status", prop: "Status", width: 30 });
              }

              // Balance column widths - too many columns will make the PDF unreadable
              // Preserve specified column widths instead of auto-adjusting all columns

              // Message column should use remaining space
              const messageCol = columns.find(col => col.prop === "Message" || col.prop === "message");
              if (messageCol) {
                messageCol.width = "*"; // Use remaining space
              }

              // Apply specific formatting for amount columns
              columns.forEach(col => {
                // Special formatting for certain columns
                if (["AcqnAmtInTransactionCurrency", "Amount", "Retirement Amount"].includes(col.prop)) {
                  col.alignment = 'right';
                }
              });

              console.log("Using columns for PDF:", columns);

              // Function to get display value (handles various field formats and special cases)
              const getDisplayValue = (item, colProp) => {
                // For Message column, handle both objects and strings
                if (colProp === 'Message' || colProp === 'message') {
                  if (item.Status === 'Success' || item.Status === 'success' || item.Status === 'OK') {
                    // For success records
                    const docNumber = item.ReferenceDocument ||
                      item["Document Reference ID"] ||
                      item.DocumentReferenceID || "";
                    // Get UUID if available
                    const uuid = item.FixedAssetPostingUUID || "";

                    // If we have both, show both
                    if (docNumber && uuid) {
                      return `Asset retired with document ${docNumber} (UUID: ${uuid})`;
                    }
                    // If we only have document number
                    else if (docNumber) {
                      return `Asset retired with document ${docNumber}`;
                    }
                    // If we only have UUID 
                    else if (uuid) {
                      return `Asset retired with UUID: ${uuid}`;
                    }
                    // Fallback to any message field
                    else {
                      return item.Message ||
                        item.message ||
                        (item.message && typeof item.message === 'object' ? item.message.message : 'Success');
                    }
                  } else {
                    // For error records, use any available error message
                    return item.Message ||
                      item.message ||
                      item.errorMessage ||
                      (item.message && typeof item.message === 'object' ? item.message.message : 'Error');
                  }
                }

                // For Status column, normalize different possible status formats
                if (colProp === 'Status' || colProp === 'status') {
                  const statusValue = item[colProp] || "";
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
                if (colProp.toLowerCase().includes('amount') ||
                  colProp.toLowerCase().includes('quantity') ||
                  colProp === 'AcqnAmtInTransactionCurrency') {
                  const amount = parseFloat(item[colProp]);
                  return !isNaN(amount) ? amount.toFixed(2) : item[colProp] || "";
                }

                // For any other column, return the value if it exists
                // Check various versions of the property name (camelCase, snake_case, etc.)
                if (item[colProp] !== undefined) {
                  return item[colProp];
                }

                // Try alternative property formats
                const camelCase = colProp.replace(/(?:^\w|[A-Z]|\b\w)/g, (letter, index) =>
                  index === 0 ? letter.toLowerCase() : letter.toUpperCase()
                ).replace(/\s+/g, '');

                if (item[camelCase] !== undefined) {
                  return item[camelCase];
                }

                // Try without spaces
                const noSpaces = colProp.replace(/\s+/g, '');
                if (item[noSpaces] !== undefined) {
                  return item[noSpaces];
                }

                return "";
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
                  if (col.prop === 'Status' || col.prop === 'status') {
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
              const successCount = data.filter(item => {
                const status = item.Status || item.status || '';
                return status.toLowerCase() === 'success' ||
                  status.toLowerCase() === 'ok';
              }).length;

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
                  tableHeader: { bold: true, fontSize: 7, color: 'black', alignment: 'center' },
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