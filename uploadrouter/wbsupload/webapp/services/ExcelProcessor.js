sap.ui.define(
    [
      "sap/m/MessageBox",
      "sap/m/MessageToast"
    ],
    function (MessageBox, MessageToast) {
      "use strict";
  
      return function (oController) {
        this._controller = oController;
        this._dataFormatter = oController._dataFormatter;
  
        this.readAndProcessFile = function (oFile) {
          var oReader = new FileReader();
          var that = this;
  
          oReader.onload = function (e) {
            try {
              var data = new Uint8Array(e.target.result);
              var workbook = XLSX.read(data, { type: "array" });
              var jsonData = that._extractAndConvertData(workbook);
              var processingResult = that._dataFormatter.processExcelData(jsonData);
  
              that._controller.getView().getModel("fileData").setProperty("/isFileUploaded", processingResult.success);
              that._controller.getView().getModel("fileData").setProperty(
                "/statusMessage",
                processingResult.success
                  ? "File uploaded successfully. Ready to create/change WBS Elements."
                  : "File uploaded with errors. See Failed Records."
              );
  
              MessageToast.show("File uploaded successfully!");
            } catch (error) {
              that._controller._closeBusyDialog();
              MessageBox.error("Error processing file: " + error.message);
            } finally {
              that._controller._closeBusyDialog();
            }
          };
  
          oReader.onerror = function (e) {
            that._controller._closeBusyDialog();
            MessageBox.error("Error reading file: " + e.target.error.name);
          };
  
          oReader.readAsArrayBuffer(oFile);
        };
  
        this._extractAndConvertData = function (workbook) {
          var templateSheetName = "Template";
          var dataSheetName = workbook.SheetNames.find(function (name) {
            return name === templateSheetName;
          });
  
          if (!dataSheetName && workbook.SheetNames.length > 0) {
            dataSheetName = workbook.SheetNames[0];
            if (dataSheetName === "Instructions" && workbook.SheetNames.length > 1) {
              dataSheetName = workbook.SheetNames[1];
            }
          }
  
          var worksheet = workbook.Sheets[dataSheetName];
          return XLSX.utils.sheet_to_json(worksheet, { raw: false, defval: "" });
        };
      };
    }
  );