sap.ui.define([], function () {
    "use strict";

    return {
        readExcelFile: function (file, callback) {
            var reader = new FileReader();
            reader.onload = function (e) {
                var workbook = XLSX.read(e.target.result, { type: 'array' });
                var sheetName = workbook.SheetNames[0];
                var worksheet = workbook.Sheets[sheetName];
                var jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

                if (callback && jsonData) {
                    callback(jsonData);
                }
            };
            reader.readAsArrayBuffer(file);
        },

        downloadFailedRecords: function (failedRecords) {
            var csvData = "Row Number, Error Message\n";
            failedRecords.forEach(function (record) {
                csvData += `${record.rowNumber}, ${record.errorMessage}\n`;
            });

            var blob = new Blob([csvData], { type: "text/csv;charset=utf-8;" });
            var link = document.createElement("a");
            link.href = URL.createObjectURL(blob);
            link.download = "failed_records.csv";
            link.click();
        }
    };
});
