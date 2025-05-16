// File: utils/FileReader.js
sap.ui.define([
    "sap/ui/core/Fragment",
    "sap/m/MessageBox",
    "sap/m/MessageToast"
], function (Fragment, MessageBox, MessageToast) {
    "use strict";

    return {
        readExcelFile: function (oFile, onSuccess, onError) {
            if (typeof XLSX === "undefined") {
                MessageBox.error("XLSX library is not loaded.");
                return;
            }

            var oReader = new FileReader();
            oReader.onload = function (e) {
                try {
                    var workbook = XLSX.read(e.target.result, { type: 'array' });
                    var sheetName = workbook.SheetNames[0];
                    var worksheet = workbook.Sheets[sheetName];
                    var jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

                    if (!jsonData || jsonData.length === 0) {
                        throw new Error("No data found in the sheet.");
                    }

                    var columns = jsonData[0];
                    var rows = jsonData.slice(1).map(row => {
                        var rowData = {};
                        columns.forEach((col, idx) => rowData[col] = row[idx]);
                        return rowData;
                    }).filter(rowData => Object.values(rowData).some(val => val !== undefined && val !== ""));

                    onSuccess(rows, columns);
                } catch (error) {
                    MessageBox.error("Error processing file: " + error.message);
                    onError(error);
                }
            };

            // Start reading the file as array buffer
            oReader.readAsArrayBuffer(oFile);
        }
    };
});
