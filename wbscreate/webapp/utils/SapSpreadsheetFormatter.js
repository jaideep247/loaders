sap.ui.define([
    "sap/ui/export/Spreadsheet",
    "sap/ui/export/library"
], function (Spreadsheet, exportLibrary) {
    "use strict";

    const EdmType = exportLibrary.EdmType;

    return class SapSpreadsheetFormatter {

        getFileExtension() { return ".xlsx"; }
        getMimeType() { return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"; } // Same as XLSX

        /**
         * Exports data using sap.ui.export.Spreadsheet.
         * This directly triggers the download via the library.
         * @param {Array<object>} data - Processed data array.
         * @param {string} fileName - Desired file name.
         * @param {object} [options={}] - Options like context metadata.
         * @param {string} [options.sheetName="Exported Data"] - Name for the sheet.
         * @param {string} [options.title="Exported Report"] - Title metadata.
         * @param {string} [options.application="Export Application"] - Application metadata.
         * @returns {Promise<void>} Promise resolving when build starts, or rejecting on error.
         */
        formatAndDownload(data, fileName, options = {}) {
            return new Promise((resolve, reject) => {
                try {
                     if (!data || data.length === 0) {
                        reject(new Error("No data provided for SAP Spreadsheet export."));
                        return;
                    }

                    // Dynamically generate columns
                    const firstItem = data[0];
                    const columns = Object.keys(firstItem).map(key => {
                        let type = EdmType.String; // Default to String
                        const value = firstItem[key];
                        if (typeof value === 'number') type = EdmType.Number;
                        else if (typeof value === 'boolean') type = EdmType.Boolean;
                        // Add more type detection (Date, Time, DateTimeOffset) if needed
                        const label = key.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase()).trim();
                        return { label: label, property: key, type: type };
                    });

                    const exportSettings = {
                        workbook: {
                            columns: columns,
                            context: {
                                application: options.application || "Export Application",
                                sheetName: options.sheetName || "Exported Data",
                                title: options.title || "Exported Report"
                            }
                        },
                        dataSource: data,
                        fileName: fileName.toLowerCase().endsWith(".xlsx") ? fileName : `${fileName}.xlsx`,
                        worker: false // Often better performance for moderate datasets
                    };

                    const oSpreadsheet = new Spreadsheet(exportSettings);
                    oSpreadsheet.build()
                        .then(() => {
                            console.log("SAP Spreadsheet build completed.");
                            resolve(); // Resolve when build is done (download is triggered)
                        })
                        .catch((error) => {
                            console.error("SAP Spreadsheet build error:", error);
                            reject(error); // Reject the promise on build error
                        })
                        .finally(() => {
                            oSpreadsheet.destroy(); // Clean up
                        });

                } catch (error) {
                    console.error("Error setting up SAP Spreadsheet export:", error);
                    reject(error);
                }
            });
        }
    };
});