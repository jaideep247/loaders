sap.ui.define([
    "sap/m/MessageBox",
    "sap/m/MessageToast",
    "sap/base/util/UriParameters"
], function (MessageBox, MessageToast, UriParameters) {
    "use strict";

    class ExportService {
        constructor() {
            this._initialized = true;
            this._urlParams = new UriParameters(window.location.href);
        }

        /**
         * Export data in specified format with proper sequence handling
         * @param {Array|Object} data - Data to export
         * @param {string} filename - Base filename (without extension)
         * @param {string} format - Export format (xlsx, csv, pdf)
         * @param {string} [type] - Optional data type (e.g., 'error')
         */
        exportData(data, filename, format, type) {
            if (!this._initialized) {
                MessageBox.error("ExportService not properly initialized");
                return;
            }

            // Convert to array if single object
            const dataArray = Array.isArray(data) ? data : [data];

            // Process data with sequence preservation
            const processedData = this._processDataWithSequence(dataArray, type);

            // Generate filename with timestamp if in debug mode
            const finalFilename = this._urlParams.get("debug") === "true"
                ? `${filename}_${new Date().toISOString().replace(/[:.]/g, "-")}`
                : filename;

            // Execute export
            switch (format.toLowerCase()) {
                case "xlsx":
                    this._exportExcel(processedData, finalFilename);
                    break;
                case "csv":
                    this._exportCSV(processedData, finalFilename);
                    break;
                case "pdf":
                    this._exportPDF(processedData, finalFilename);
                    break;
                default:
                    MessageBox.error(`Unsupported export format: ${format}`);
            }
        }

        _processDataWithSequence(data, type) {
            return data.map((item, index) => {
                // Prioritize entry if exists, otherwise use the entire item
                const entry = item.entry || item;

                // Comprehensive error detection
                const isError =
                    type === "error" ||
                    item.error ||
                    item.details ||
                    (entry.Status && entry.Status !== 'Success') ||
                    item.success === false;

                // Sequence ID determination with multiple fallback options
                const sequenceId =
                    entry.Sequence !== undefined ? entry.Sequence :
                        item.Sequence !== undefined ? item.Sequence :
                            entry.OriginalSequence !== undefined ? entry.OriginalSequence :
                                (entry.OriginalRequest && entry.OriginalRequest.Sequence) ||
                                (index + 1);

                // Consistent timestamp extraction
                const getTimestamp = () => {
                    // Priority order for timestamp
                    const timestampSources = [
                        entry.LastChangeDateTime,  // Primary source from OData response
                        entry.ProcessedAt,
                        entry.CreationDate,
                        item.ProcessedAt,
                        item.CreationDate,
                        entry.LastChangeDateTime,
                        new Date().toISOString()
                    ];

                    // Find first valid timestamp
                    const timestamp = timestampSources.find(ts => ts && ts.trim() !== '');

                    // Ensure ISO format
                    return timestamp || new Date().toISOString();
                };

                // Determine comprehensive message
                const getMessage = () => {
                    // Priority order for messages
                    const messageSources = [
                        // Success messages
                        item.Message,
                        entry.Message,

                        // Error messages
                        item.error,
                        item.details,
                        entry.ErrorMessage,

                        // SAP Messages
                        (entry.SAP__Messages && entry.SAP__Messages.length > 0
                            ? entry.SAP__Messages[0].message : null),

                        // Fallback
                        isError ? "Processing failed" : "Processed successfully"
                    ];

                    // Find first non-empty message
                    return messageSources.find(msg => msg && msg.trim() !== '') ||
                        (isError ? "Processing failed" : "Processed successfully");
                };

                // Base fields with comprehensive extraction
                const baseFields = {
                    Sequence: String(sequenceId), // Ensure string type
                    Status: isError ? "Error" : "Success",
                    Timestamp: getTimestamp(),
                    PurchaseOrder: entry.PurchaseOrder || item.PurchaseOrder || "",
                    POType: entry.PurchaseOrderType || entry.PurchaseOrderSubtype || "",
                    CompanyCode: entry.CompanyCode || ""
                };

                // Single message field for both success and error
                const messageField = {
                    Message: getMessage()
                };

                // Optional fields with expanded extraction
                const optionalFields = {};
                [
                    'DocumentCurrency', 'Supplier', 'CreationDate',
                    'PurchaseOrderDate', 'PricingDocument', 'PurchasingOrganization',
                    'PurchasingGroup', 'NetPaymentDays', 'ExchangeRate',
                    'Vendor', 'TotalAmount', 'Currency'
                ].forEach(field => {
                    // Check both entry and item for each field
                    if (entry[field] !== undefined) {
                        optionalFields[field] = entry[field];
                    } else if (item[field] !== undefined) {
                        optionalFields[field] = item[field];
                    }
                });

                // If item is an error record, ensure additional error details are included
                if (isError) {
                    if (item.errorDetails) {
                        optionalFields.ErrorDetails = item.errorDetails;
                    }
                    if (entry.SAP__Messages && entry.SAP__Messages.length > 0) {
                        optionalFields.SAPMessages = entry.SAP__Messages.map(msg =>
                            msg.message || msg.text || msg.description
                        ).join('; ');
                    }
                }

                // Combine all fields
                return {
                    ...baseFields,
                    ...messageField,
                    ...optionalFields
                };
            });
        }

        _exportExcel(data, filename) {
            try {
                if (typeof XLSX === 'undefined') {
                    this._showLibraryError('SheetJS');
                    return;
                }

                const wb = XLSX.utils.book_new();
                const ws = XLSX.utils.json_to_sheet(data);

                // Set column widths and styles
                const colWidths = [
                    { wch: 8 },   // Sequence
                    { wch: 10 },  // Status
                    { wch: 20 },  // Timestamp
                    { wch: 15 },  // PurchaseOrder
                    { wch: 10 },  // POType
                    { wch: 12 },  // CompanyCode
                    { wch: 15 },  // DocumentCurrency
                    { wch: 20 },  // Supplier
                    { wch: 12 },  // CreationDate
                    { wch: 12 },  // PurchaseOrderDate
                    { wch: 15 }   // PricingDocument
                ];
                ws['!cols'] = colWidths;

                // Add header style
                if (!ws['!rows']) ws['!rows'] = [];
                ws['!rows'][0] = { hpx: 20, style: { font: { bold: true } } };

                XLSX.utils.book_append_sheet(wb, ws, "PO Export");
                XLSX.writeFile(wb, `${filename}.xlsx`);
                MessageToast.show(`Excel file "${filename}.xlsx" downloaded`);
            } catch (error) {
                console.error("Excel export error:", error);
                MessageBox.error("Failed to generate Excel file");
            }
        }

        /**
         * Export to CSV format
         * @private
         */
        _exportCSV(data, filename) {
            try {
                const headers = Object.keys(data[0] || {});
                const csvContent = [
                    headers.join(','),
                    ...data.map(row =>
                        headers.map(field =>
                            `"${String(row[field] || '').replace(/"/g, '""')}"`
                        ).join(',')
                    )
                ].join('\n');

                // Add UTF-8 BOM for Excel compatibility
                const bom = new Uint8Array([0xEF, 0xBB, 0xBF]);
                const blob = new Blob([bom, csvContent], { type: 'text/csv;charset=utf-8;' });
                this._downloadFile(blob, `${filename}.csv`);
                MessageToast.show(`CSV file "${filename}.csv" downloaded`);
            } catch (error) {
                console.error("CSV export error:", error);
                MessageBox.error("Failed to generate CSV file");
            }
        }

        /**
         * Export to PDF format
         * @private
         */
        _exportPDF(data, filename) {

            this._loadPDFLibrary()
                .then(() => {
                    this._generatePDF(data, filename);
                })
                .catch(error => {
                    console.error("Failed to load PDF library:", error);
                    this._showLibraryError('pdfMake');
                });

        }

        /**
         * Generate PDF document
         * @private
         */
        _generatePDF(data, filename) {
            try {
                // Define essential fields with their display names
                const fieldDefinitions = {
                    'Sequence': { width: 40, text: 'Seq #' },
                    'Status': { width: 50, text: 'Status' },
                    'PurchaseOrder': { width: 80, text: 'PO Number' },
                    'CompanyCode': { width: 60, text: 'Company' },
                    'Supplier': { width: 100, text: 'Supplier' },
                    'ErrorMessage': { width: 150, text: 'Error Details' },
                    'Message': { width: 150, text: 'Message' },
                    'Timestamp': { width: 80, text: 'Processed At' }
                };

                // Get available fields from first data item
                const availableFields = Object.keys(data[0] || {});

                // Filter to only include fields that exist in data and are defined
                const fieldsToShow = Object.entries(fieldDefinitions)
                    .filter(([field]) => availableFields.includes(field))
                    .sort((a, b) => availableFields.indexOf(a[0]) - availableFields.indexOf(b[0]));

                // Prepare table header
                const headerRow = fieldsToShow.map(([field, def]) => ({
                    text: def.text,
                    style: 'tableHeader',
                    fillColor: '#f5f5f5'
                }));

                // Prepare table body with conditional styling
                const bodyRows = data.map(row => {
                    const isError = row.Status === 'Error';
                    return fieldsToShow.map(([field, def]) => {
                        let value = row[field] || '';

                        // Format specific fields
                        if (field === 'Timestamp' && value) {
                            value = new Date(value).toLocaleString();
                        }

                        return {
                            text: value,
                            style: isError ? 'errorText' : 'successText',
                            fillColor: isError ? '#ffebee' : '#e8f5e9'
                        };
                    });
                });

                // Calculate column widths
                const colWidths = fieldsToShow.map(([field, def]) => def.width || 'auto');

                // Split data into chunks to prevent overflow
                const rowsPerPage = 30; // Adjust based on your needs
                const tableChunks = [];

                for (let i = 0; i < bodyRows.length; i += rowsPerPage) {
                    tableChunks.push(bodyRows.slice(i, i + rowsPerPage));
                }

                // Create document definition with dynamic content
                const docDefinition = {
                    pageOrientation: 'landscape',
                    pageSize: 'A4',
                    pageMargins: [20, 20, 20, 40], // [left, top, right, bottom]
                    content: [],
                    styles: {
                        header: {
                            fontSize: 14,
                            bold: true,
                            alignment: 'center',
                            margin: [0, 0, 0, 10]
                        },
                        subheader: {
                            fontSize: 10,
                            alignment: 'center',
                            italics: true,
                            margin: [0, 0, 0, 10]
                        },
                        tableHeader: {
                            bold: true,
                            fontSize: 8,
                            color: '#333333'
                        },
                        successText: {
                            color: '#2e7d32', // Dark green
                            fontSize: 8
                        },
                        errorText: {
                            color: '#c62828', // Dark red
                            fontSize: 8
                        },
                        footer: {
                            fontSize: 8,
                            alignment: 'center'
                        }
                    },
                    defaultStyle: {
                        fontSize: 8,
                        lineHeight: 1.2
                    }
                };

                // Add content for each page
                tableChunks.forEach((chunk, pageIndex) => {
                    // Add header for each page
                    docDefinition.content.push({
                        text: 'Purchase Order Processing Report',
                        style: 'header',
                        pageBreak: pageIndex > 0 ? 'before' : undefined
                    });

                    docDefinition.content.push({
                        text: `Page ${pageIndex + 1} of ${tableChunks.length} | Generated on: ${new Date().toLocaleString()}`,
                        style: 'subheader'
                    });

                    // Add table for current chunk
                    docDefinition.content.push({
                        table: {
                            headerRows: 1,
                            widths: colWidths,
                            body: [headerRow, ...chunk],
                            dontBreakRows: true
                        },
                        layout: {
                            hLineWidth: (i, node) => (i === 0 || i === node.table.body.length) ? 0.5 : 0.3,
                            vLineWidth: () => 0.3,
                            hLineColor: () => '#cccccc',
                            vLineColor: () => '#cccccc',
                            fillColor: (rowIndex) => {
                                if (rowIndex === 0) return '#f5f5f5'; // Header
                                return (chunk[rowIndex - 1][0].style === 'errorText') ? '#ffebee' : '#e8f5e9';
                            }
                        }
                    });
                });

                // Create and download PDF
                pdfMake.createPdf(docDefinition).download(`${filename}.pdf`);
                MessageToast.show(`PDF file "${filename}.pdf" downloaded`);
            } catch (error) {
                console.error("PDF generation error:", error);
                MessageBox.error("Failed to generate PDF file: " + error.message);
            }
        }

        /**
         * Show library loading error
         * @private
         */
        _showLibraryError(lib) {
            MessageBox.error(
                `${lib} library not loaded. Please include ${lib}.js`,
                { title: "Export Error" }
            );
        }

        /**
         * Load PDF library dynamically
         * @private
         */
        _loadPDFLibrary() {
            return new Promise((resolve, reject) => {
                const script = document.createElement('script');
                script.src = './utils/pdfmake.min.js';
                script.onload = () => {
                    // Load fonts after main library
                    const fontsScript = document.createElement('script');
                    fontsScript.src = './utils/vfs_fonts.js';
                    fontsScript.onload = resolve;
                    fontsScript.onerror = reject;
                    document.head.appendChild(fontsScript);
                };
                script.onerror = reject;
                document.head.appendChild(script);
            });
        }

        /**
         * Enhanced file download with better cleanup
         * @private
         */
        _downloadFile(blob, filename) {
            try {
                const url = URL.createObjectURL(blob);
                const link = document.createElement('a');
                link.href = url;
                link.download = filename;
                link.style.display = 'none';

                // Add link to DOM and trigger click
                document.body.appendChild(link);
                const clickEvent = new MouseEvent('click', {
                    bubbles: true,
                    cancelable: true,
                    view: window
                });
                link.dispatchEvent(clickEvent);

                // Enhanced cleanup
                setTimeout(() => {
                    if (document.body.contains(link)) {
                        document.body.removeChild(link);
                    }
                    try {
                        URL.revokeObjectURL(url);
                    } catch (e) {
                        console.warn("Error revoking object URL:", e);
                    }
                }, 200);
            } catch (error) {
                console.error("File download error:", error);
                MessageBox.error("Failed to initiate download");
            }
        }
    }

    return ExportService;
});