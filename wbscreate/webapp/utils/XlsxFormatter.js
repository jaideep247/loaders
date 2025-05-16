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
         * Creates a workbook object for template generation.
         * @param {Array<string>} headers - Array of header strings.
         * @param {object} [exampleRow] - Optional example data row object.
         * @returns {Promise<object>} Promise resolving with the XLSX workbook object.
         */
         createWorkbookForTemplate(headers, exampleRow = null) {
            return new Promise((resolve, reject) => {
                 try {
                    checkXLSX();
                    const wb = window.XLSX.utils.book_new();
                    const ws_data = [];
                    if (exampleRow) {
                        ws_data.push(exampleRow);
                    }
                    // Add empty row if needed to ensure headers are shown even with no example
                    // ws_data.push(headers.reduce((obj, h) => { obj[h] = ""; return obj; }, {}));

                    const ws = window.XLSX.utils.json_to_sheet(ws_data, { header: headers });
                    window.XLSX.utils.book_append_sheet(wb, ws, "Service Entry Sheet");
                    resolve(wb);
                } catch (error) {
                     console.error("Error creating workbook for template:", error);
                    reject(error);
                }
            });
         }

         /**
          * Converts a workbook object to a Blob.
          * @param {object} wb - Workbook object from XLSX library.
          * @returns {Promise<Blob>} Promise resolving with the Blob.
          */
         workbookToBlob(wb) {
             return new Promise((resolve, reject) => {
                 try {
                     checkXLSX();
                     const woptions = { bookType:'xlsx', bookSST:false, type:'array' };
                     const wbout = window.XLSX.write(wb, woptions);
                     resolve(new Blob([wbout], {type: this.getMimeType()}));
                 } catch (error) {
                     console.error("Error converting workbook to Blob:", error);
                     reject(error);
                 }
             });
         }
    };
});