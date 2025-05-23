
sap.ui.define([], function () {
    "use strict";

     // Helper to ensure XLSX utils are loaded for CSV conversion
    const checkXLSXUtils = () => {
        if (typeof window.XLSX === 'undefined' || typeof window.XLSX.utils === 'undefined') {
            throw new Error("XLSX library utils not loaded. CSV export requires them for robust conversion.");
        }
    };

    return class CsvFormatter {
        getFileExtension() { return ".csv"; }
        getMimeType() { return "text/csv;charset=utf-8;"; }

        /**
         * Creates a CSV Blob from an array of data.
         * Uses XLSX utils for reliable CSV conversion.
         * @param {Array<object>} data - Array of processed data objects.
         * @returns {Promise<Blob>} Promise resolving with the CSV Blob.
         */
        format(data) {
            return new Promise((resolve, reject) => {
                try {
                    checkXLSXUtils();
                     if (!data || data.length === 0) {
                        reject(new Error("No data provided for CSV export."));
                        return;
                    }

                    const worksheet = window.XLSX.utils.json_to_sheet(data);
                    const csvContent = window.XLSX.utils.sheet_to_csv(worksheet);

                    // Add BOM for UTF-8 compatibility in Excel
                    const blob = new Blob(["\uFEFF" + csvContent], { type: this.getMimeType() });
                    resolve(blob);
                } catch (error) {
                    console.error("Error formatting CSV:", error);
                    reject(error);
                }
            });
        }
    };
});