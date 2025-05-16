sap.ui.define([
    "sap/m/MessageBox",
    "sap/m/MessageToast"
], function (
    MessageBox,
    MessageToast
) {
    "use strict";

    return class FileUploadHandler {
        constructor(controller) {
            this._controller = controller;
        }

        // File change handler
        onFileChange(oEvent) {
            var oFileUploader = oEvent.getSource();
            var sFileName = oEvent.getParameter("newValue");

            // Update file name text
            var oFilePathText = this._controller.getView().byId("filePathText");
            if (sFileName) {
                oFilePathText.setText(sFileName);
            } else {
                oFilePathText.setText("No file selected");
            }
        }

        // File upload handler
        onUpload() {
            var oFileUploader = this._controller.getView().byId("fileUploader");
            var sFileName = oFileUploader.getValue();

            if (!sFileName) {
                MessageBox.error("Please select a file first.");
                return;
            }

            // Check file extension
            if (!sFileName.endsWith(".xlsx")) {
                MessageBox.error("Please select an Excel (.xlsx) file.");
                return;
            }

            // Show busy dialog
            this._openBusyDialog();

            // Get file content
            var oFile = jQuery.sap.domById(oFileUploader.getId() + "-fu").files[0];
            this._readExcelFile(oFile);
        }

        // Read Excel file
        _readExcelFile(oFile) {
            var that = this;

            // Use FileReader API to read file content
            var oReader = new FileReader();

            oReader.onload = function (e) {
                var data = new Uint8Array(e.target.result);
                var workbook = XLSX.read(data, { type: "array" });

                // Look for Template sheet
                var templateSheetName = "Template";
                var dataSheetName = workbook.SheetNames.find(function (name) {
                    return name === templateSheetName;
                });

                // If Template sheet is not found, use the first sheet as fallback
                if (!dataSheetName && workbook.SheetNames.length > 0) {
                    dataSheetName = workbook.SheetNames[0];

                    // Skip the Instructions sheet if it exists
                    if (dataSheetName === "Instructions" && workbook.SheetNames.length > 1) {
                        dataSheetName = workbook.SheetNames[1];
                    }
                }

                var worksheet = workbook.Sheets[dataSheetName];

                // Convert to JSON
                var jsonData = XLSX.utils.sheet_to_json(worksheet, {
                    raw: false,
                    defval: "" // Default empty string for missing cells
                });

                // Process the data
                that._processExcelData(jsonData);

                // Close busy dialog
                that._closeBusyDialog();

                // Update status
                var oFileDataModel = that._controller.getView().getModel("fileData");
                oFileDataModel.setProperty("/isFileUploaded", true);
                oFileDataModel.setProperty(
                    "/statusMessage",
                    "File uploaded successfully. Ready to create/change WBS Elements."
                );

                MessageToast.show("File uploaded successfully!");
            };

            oReader.onerror = function (e) {
                that._closeBusyDialog();
                MessageBox.error("Error reading file: " + e.target.error.name);
            };

            // Read file as array buffer
            oReader.readAsArrayBuffer(oFile);
        }

        // Process Excel data
        _processExcelData(jsonData) {
            // Detailed implementation from original code
            // [Keep the existing _processExcelData method from the original implementation]
        }

        // Export Excel data
        onExportExcelData() {
            var oTable = this._controller.getView().byId("excelTable");
            var oBinding = oTable.getBinding("items");

            // Check if there is data to export
            if (!oBinding || oBinding.getLength() === 0) {
                MessageToast.show("No data to export");
                return;
            }

            // Extract data and prepare for export
            var aData = [];
            oBinding.getContexts().forEach(function (oContext) {
                aData.push(oContext.getObject());
            });

            // Get export columns
            var aColumns = this._getExcelExportColumns();

            // Prepare header and data
            var aColumnLabels = aColumns.map(function (column) {
                return column.label;
            });

            var aExcelData = [aColumnLabels];
            aData.forEach(function (oRow) {
                var aRowData = [];
                aColumns.forEach(function (column) {
                    aRowData.push(oRow[column.property] || "");
                });
                aExcelData.push(aRowData);
            });

            // Create and write Excel file
            var ws = XLSX.utils.aoa_to_sheet(aExcelData);
            var wb = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(wb, ws, "WBS Elements");
            XLSX.writeFile(wb, "WBS_Elements_Export.xlsx");

            MessageToast.show("Export completed");
        }

        // Export template
        onDownloadTemplate() {
            // Keep the existing onDownloadTemplate method from the original implementation
        }

        // Helper methods for busy dialog
        _openBusyDialog() {
            if (!this._busyDialog) {
                this._busyDialog = new sap.m.BusyDialog({
                    title: "Processing",
                    text: "Reading Excel file...",
                    showCancelButton: false
                });
            }
            this._busyDialog.open();
        }

        _closeBusyDialog() {
            if (this._busyDialog) {
                this._busyDialog.close();
            }
        }

        // Define columns for Excel export
        _getExcelExportColumns() {
            // Existing implementation from the original code
        }
    };
});