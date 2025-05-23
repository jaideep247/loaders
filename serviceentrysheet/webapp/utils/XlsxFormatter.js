sap.ui.define([], function () {
    "use strict";

    // Helper to ensure XLSX library is loaded (can be enhanced)
    const checkXLSX = () => {
        if (typeof window.XLSX === 'undefined' || typeof window.XLSX.utils === 'undefined') {
            throw new Error("XLSX library (SheetJS) not loaded or utils missing.");
        }
    };

    return class XlsxFormatter {

        getFileExtension() { return ".xlsx"; }
        getMimeType() { return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"; }

        /**
         * Creates an XLSX Blob from a single array of data.
         * @param {Array<object>} data - Array of processed data objects.
         * @param {string} [sheetName="Data"] - Name for the sheet.
         * @returns {Promise<Blob>} Promise resolving with the XLSX Blob.
         */
        formatSingleSheet(data, sheetName = "Data") {
            return new Promise((resolve, reject) => {
                try {
                    checkXLSX();
                    if (!data || data.length === 0) {
                        reject(new Error("No data provided for XLSX single sheet export."));
                        return;
                    }
                    const wb = window.XLSX.utils.book_new();
                    const ws = window.XLSX.utils.json_to_sheet(data);
                    window.XLSX.utils.book_append_sheet(wb, ws, sheetName.substring(0, 31)); // Ensure valid sheet name length

                    const wbout = window.XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
                    resolve(new Blob([wbout], { type: this.getMimeType() }));
                } catch (error) {
                    console.error("Error formatting XLSX single sheet:", error);
                    reject(error);
                }
            });
        }

        /**
         * Creates an XLSX Blob with multiple sheets from grouped data.
         * Includes a summary sheet.
         * @param {Object} groupedData - Data grouped by a key (e.g., document number). { groupKey: [entry, ...], ... }
         * @param {Function} [processGroupDataFn] - Optional function to process data for each sheet. (item, reportType) => processedItem
         * @returns {Promise<Blob>} Promise resolving with the XLSX Blob.
         */
        formatMultiSheet(groupedData, processGroupDataFn = (data) => data) {
            return new Promise((resolve, reject) => {
                try {
                    checkXLSX();
                    const groupKeys = Object.keys(groupedData);
                    if (groupKeys.length === 0) {
                        reject(new Error("No data groups provided for XLSX multi-sheet export."));
                        return;
                    }

                    const wb = window.XLSX.utils.book_new();

                    // Process each group into a separate sheet
                    groupKeys.forEach((groupKey, index) => {
                        const groupRawData = groupedData[groupKey];
                        if (!groupRawData || groupRawData.length === 0) return;

                        const processedGroupData = processGroupDataFn(groupRawData, "all"); // Process data for the sheet
                        if (!processedGroupData || processedGroupData.length === 0) return;

                        const ws = window.XLSX.utils.json_to_sheet(processedGroupData);
                        let sheetName = groupKey.toString().replace(/[\[\]*?\/\\:]/g, '_').substring(0, 31);
                        if (wb.SheetNames.includes(sheetName)) { sheetName = `${sheetName}_${index + 1}`.substring(0, 31); }
                        window.XLSX.utils.book_append_sheet(wb, ws, sheetName);
                    });

                    // Add Summary Sheet
                    const summaryData = groupKeys.map(groupKey => {
                        const group = groupedData[groupKey] || [];
                        const successCount = group.filter(item => (item.Status || "").toLowerCase() === "success").length;
                        const errorCount = group.filter(item => (item.Status || "").toLowerCase() === "error" || (item.Status || "").toLowerCase() === "failed").length;
                        return { "Group Key": groupKey, "Total Records": group.length, "Success Count": successCount, "Error/Failed Count": errorCount };
                    });
                    if (summaryData.length > 0) {
                        const summarySheet = window.XLSX.utils.json_to_sheet(summaryData);
                        window.XLSX.utils.book_append_sheet(wb, summarySheet, "Summary");
                        wb.SheetNames.unshift(wb.SheetNames.pop()); // Move Summary to front
                    }


                    const wbout = window.XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
                    resolve(new Blob([wbout], { type: this.getMimeType() }));

                } catch (error) {
                    console.error("Error formatting XLSX multi-sheet:", error);
                    reject(error);
                }
            });
        }
        /**
        * Create workbook for template with proper data handling
        * @param {Array} headers - Column headers array
        * @param {Array} dataRows - Array of data objects
        * @returns {Promise<Object>} XLSX workbook object
        */
        async createWorkbookForTemplate(headers, dataRows) {
            try {
                console.debug("XlsxFormatter: Creating template workbook", {
                    headers: headers?.length,
                    dataRows: dataRows?.length
                });

                // Validate inputs
                if (!Array.isArray(headers) || headers.length === 0) {
                    throw new Error("Headers must be a non-empty array");
                }

                if (!Array.isArray(dataRows)) {
                    throw new Error("DataRows must be an array");
                }

                // Import XLSX library
                const XLSX = window.XLSX || await import('xlsx');

                // Create worksheet data starting with headers
                const wsData = [headers];

                // Add data rows if provided
                if (dataRows.length > 0) {
                    console.debug("XlsxFormatter: Adding data rows to template");

                    dataRows.forEach((rowData, index) => {
                        console.debug(`XlsxFormatter: Processing row ${index + 1}`, rowData);

                        // Convert object to array following header order
                        const rowArray = headers.map(header => {
                            const value = rowData[header];
                            // Convert undefined/null to empty string
                            return (value !== undefined && value !== null) ? String(value) : "";
                        });

                        wsData.push(rowArray);
                        console.debug(`XlsxFormatter: Row ${index + 1} converted:`, rowArray);
                    });
                } else {
                    console.debug("XlsxFormatter: No data rows provided, creating headers-only template");
                }

                console.debug("XlsxFormatter: Final worksheet data structure", {
                    totalRows: wsData.length,
                    firstRow: wsData[0],
                    hasDataRows: wsData.length > 1
                });

                // Create worksheet from array of arrays
                const ws = XLSX.utils.aoa_to_sheet(wsData);

                // Set column widths for better readability
                const colWidths = headers.map(header => {
                    let width = Math.max(header.length + 2, 10); // Minimum width of 10

                    // Special width adjustments for specific fields
                    switch (header) {
                        case 'ServiceEntrySheetName':
                            width = 35;
                            break;
                        case 'ServicePerformanceDate':
                        case 'ServicePerformanceEndDate':
                        case 'PostingDate':
                            width = 15;
                            break;
                        case 'WBS Element':
                            width = 25;
                            break;
                        case 'PurchasingOrganization':
                        case 'AccountAssignmentCategory':
                        case 'Service':
                        case 'QuantityUnit':
                            width = 15;
                            break;
                        default:
                            width = Math.min(width, 20); // Cap at 20 for normal fields
                    }

                    return { wch: width };
                });

                ws['!cols'] = colWidths;

                // Style the header row
                if (ws['!ref']) {
                    const range = XLSX.utils.decode_range(ws['!ref']);

                    // Style header row (row 0)
                    for (let col = range.s.c; col <= range.e.c; col++) {
                        const cellAddress = XLSX.utils.encode_cell({ r: 0, c: col });

                        if (ws[cellAddress]) {
                            ws[cellAddress].s = {
                                font: {
                                    bold: true,
                                    color: { rgb: "FFFFFF" }
                                },
                                fill: {
                                    fgColor: { rgb: "366092" }
                                },
                                alignment: {
                                    horizontal: "center",
                                    vertical: "center"
                                },
                                border: {
                                    top: { style: "thin", color: { rgb: "000000" } },
                                    bottom: { style: "thin", color: { rgb: "000000" } },
                                    left: { style: "thin", color: { rgb: "000000" } },
                                    right: { style: "thin", color: { rgb: "000000" } }
                                }
                            };
                        }
                    }

                    // Style data rows with alternating colors
                    for (let row = 1; row <= range.e.r; row++) {
                        const isEvenRow = row % 2 === 0;
                        const fillColor = isEvenRow ? "F2F2F2" : "FFFFFF";

                        for (let col = range.s.c; col <= range.e.c; col++) {
                            const cellAddress = XLSX.utils.encode_cell({ r: row, c: col });

                            if (ws[cellAddress]) {
                                ws[cellAddress].s = {
                                    fill: { fgColor: { rgb: fillColor } },
                                    alignment: { vertical: "center" },
                                    border: {
                                        top: { style: "thin", color: { rgb: "CCCCCC" } },
                                        bottom: { style: "thin", color: { rgb: "CCCCCC" } },
                                        left: { style: "thin", color: { rgb: "CCCCCC" } },
                                        right: { style: "thin", color: { rgb: "CCCCCC" } }
                                    }
                                };
                            }
                        }
                    }
                }

                // Create workbook
                const wb = XLSX.utils.book_new();
                XLSX.utils.book_append_sheet(wb, ws, "Service Entry Sheet");

                // Add workbook properties
                wb.Props = {
                    Title: "Service Entry Sheet Template",
                    Subject: "Template for Service Entry Sheet Data Upload",
                    Author: "SAP UI5 Application",
                    CreatedDate: new Date(),
                    Company: "SAP"
                };

                // Add custom properties for validation
                wb.Custprops = {
                    "Template Version": "2.0",
                    "Created By": "Service Entry Sheet Application",
                    "Data Rows Included": dataRows.length.toString(),
                    "Headers Count": headers.length.toString()
                };

                console.debug("XlsxFormatter: Template workbook created successfully", {
                    sheetNames: wb.SheetNames,
                    dataRowsIncluded: dataRows.length
                });

                return wb;

            } catch (error) {
                console.error("XlsxFormatter: Error creating template workbook", error);
                throw new Error(`Failed to create template workbook: ${error.message}`);
            }
        }

        /**
         * Convert workbook to blob with proper error handling
         * @param {Object} workbook - XLSX workbook object
         * @returns {Promise<Blob>} Template blob
         */
        async workbookToBlob(workbook) {
            try {
                console.debug("XlsxFormatter: Converting workbook to blob");

                // Import XLSX library
                const XLSX = window.XLSX || await import('xlsx');

                // Write workbook to array buffer
                const wbout = XLSX.write(workbook, {
                    bookType: 'xlsx',
                    type: 'array',
                    cellStyles: true,
                    compression: true
                });

                // Create blob
                const blob = new Blob([wbout], {
                    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
                });

                console.debug("XlsxFormatter: Blob created successfully", {
                    size: blob.size,
                    type: blob.type
                });

                if (blob.size === 0) {
                    throw new Error("Generated blob is empty");
                }

                return blob;

            } catch (error) {
                console.error("XlsxFormatter: Error converting workbook to blob", error);
                throw new Error(`Failed to create blob: ${error.message}`);
            }
        }

    };
});