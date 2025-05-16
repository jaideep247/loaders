sap.ui.define([
    "sap/m/MessageBox",
    "sap/m/MessageToast",
  ], function (MessageBox, MessageToast) {
    "use strict";
  
    var ExcelProcessor = function (oController) {
      this.oController = oController;
      this.busyDialog = null;
    };
  
    ExcelProcessor.prototype = {
      constructor: ExcelProcessor,
      /**
       * Read and parse Excel file
       * @param {File} oFile The uploaded Excel file
       */
      processFile: function (oFile) {
        var that = this;
        this.oController._openBusyDialog("Reading excel file...");
  
        // Use FileReader API to read file content
        var oReader = new FileReader();
  
        oReader.onload = function (e) {
          try{
              var data = new Uint8Array(e.target.result);
              var workbook = XLSX.read(data, { type: "array" });
  
              // Look for Template sheet - it might not be the first one
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
  
              // Convert to JSON - use headers option to match column names
              var jsonData = XLSX.utils.sheet_to_json(worksheet, {
              raw: false,
              defval: "" // Default empty string for missing cells
              });
  
              // Process the data
              var result = that._processExcelData(jsonData);
  
               // Update status
              var oFileDataModel = that.oController.getView().getModel("fileData");
              oFileDataModel.setProperty("/isFileUploaded", true);
              oFileDataModel.setProperty(
              "/statusMessage",
              "File uploaded successfully. Ready to create/change WBS Elements."
              );
  
              MessageToast.show("File uploaded successfully!");
          }
          catch(error){
              that.oController._closeBusyDialog();
              MessageBox.error("Error processing file: " + error.message);
              return;
          }
          finally{
              that.oController._closeBusyDialog();
          }
  
        };
  
        oReader.onerror = function (e) {
          that.oController._closeBusyDialog();
          MessageBox.error("Error reading file: " + e.target.error.name);
        };
  
        // Read file as array buffer
        oReader.readAsArrayBuffer(oFile);
      },
  
      /**
       * Process Excel data from uploaded file
       * @param {Array} jsonData JSON data from Excel file
       */
      _processExcelData: function (jsonData) {
        var aData = [];
        var oFileDataModel = this.oController.getView().getModel("fileData");
        var failedRows = []; // Array to track failed rows
        var that = this;
  
        // Define mapping from labels to property names
        var labelToPropertyMap = {};
        // Use the same column definitions from your template code
        var aColumns = [
          { label: "Operation Type (Required)", property: "OperationType" }, // Added new column  
          { label: "Project Element (Required)", property: "ProjectElement" },
          { label: "ProjectUUID", property: "ProjectUUID" },
          { label: "Name of WBS", property: "ProjectElementDescription" },
          { label: "Planned Start Date", property: "PlannedStartDate" },
          { label: "Planned End Date", property: "PlannedEndDate" },
          { label: "Responsible Cost Center", property: "ResponsibleCostCenter" },
          { label: "Company Code", property: "CompanyCode" },
          { label: "Profit Center", property: "ProfitCenter" },
          { label: "Controlling Area", property: "ControllingArea" },
          { label: "Billing Element", property: "WBSElementIsBillingElement" },
          { label: "Old Project ID", property: "YY1_OldProjectSiteID_PTD" },
          { label: "Exact WBS code", property: "YY1_ExactWBScode_PTD" },
          { label: "Site type (OF/ON)", property: "YY1_Categorization1_PTD" },
          { label: "ATM ID", property: "YY1_ATMID_PTD" },
          { label: "District", property: "YY1_Address_PTD" },
          { label: "State", property: "YY1_State_PTD" },
          { label: "Bank name", property: "YY1_Project_PTD" },
          { label: "ATM count", property: "YY1_ATMCount_PTD" },
          { label: "Nature of WBS", property: "YY1_NatureOfWBS_PTD" },
          { label: "SAP Site ID report", property: "YY1_SAPsiteIDReport_PTD" },
          { label: "Address", property: "YY1_Addressandpostalco_PTD" },
          { label: "Deployment", property: "YY1_Deployment_PTD" },
          { label: "Bank load percentage", property: "YY1_BankLoadATMDiscoun_PTD" },
          { label: "ERP relocation Ref ATM ID", property: "YY1_ERPRelocationRefAT_PTD" },
          { label: "ERP Site ID report", property: "YY1_ERPsiteIDReport_PTD" },
          { label: "UDF-1", property: "YY1_UDF3_PTD" },
          { label: "Categorization", property: "YY1_Categorization_PTD" },
          { label: "Actual start date", property: "YY1_UDF1_PTD" },
          { label: "Postal code", property: "YY1_Postalcode_PTD" },
          { label: "Actual end date", property: "YY1_UDF2_PTD" },
          { label: "ERP relocation ref. site id", property: "YY1_ERPRelocationRefer_PTD" }
        ];
  
        // Create mapping from label to property
        aColumns.forEach(function (column) {
          labelToPropertyMap[column.label] = column.property;
        });
  
        // Detect and handle header format
        var firstRow = jsonData[0];
        var hasLabelsAsHeaders = false;
  
        // Check if the first row contains labels instead of properties
        if (firstRow && Object.keys(firstRow).some(key => labelToPropertyMap[key])) {
          hasLabelsAsHeaders = true;
          console.log("Detected labels as headers, will perform mapping");
  
          // Transform the jsonData to use properties instead of labels
          jsonData = jsonData.map(function (row) {
            var newRow = {};
            Object.keys(row).forEach(function (label) {
              if (labelToPropertyMap[label]) {
                newRow[labelToPropertyMap[label]] = row[label];
              } else {
                // Keep original key if no mapping found
                newRow[label] = row[label];
              }
            });
            return newRow;
          });
        }
  
        // Skip empty rows
        jsonData = jsonData.filter(function (row) {
          // Check if any property has a non-empty value
          return Object.values(row).some(function (value) {
            return value !== null && value !== undefined && value !== "";
          });
        });
  
        // Skip header row if it contains no real data
        if (jsonData.length > 0 && !jsonData[0].ProjectElement && hasLabelsAsHeaders) {
          jsonData = jsonData.slice(1);
        }
  
        // Process each row of data
        jsonData.forEach(function (row, i) {
          console.log(row);
          // Skip rows without a ProjectElement (required field)
          if (!row.ProjectElement) {
            var errorMessage = "Missing required field: ProjectElement";
            failedRows.push({
              rowNumber: i + 1,
              projectElement: "(missing)",
              errorMessage: errorMessage
            });
            console.log("Skipping row without ProjectElement");
            return;
          }
  
          try {
            // Capture operation type but remove it from the data record
            var operationType = row.OperationType;
            var rowCopy = { ...row };
  
            // Delete the OperationType property so it's not included in the processed data
            delete rowCopy.OperationType;
  
            // Clean up the data - convert empty strings to undefined and format dates
            Object.keys(rowCopy).forEach(function (key) {
              if (rowCopy[key] === "") {
                rowCopy[key] = undefined;
              }
               if ((key === "PlannedStartDate" || key === "PlannedEndDate" ||
                  key === "YY1_UDF1_PTD" || key === "YY1_UDF2_PTD") && rowCopy[key]) {
                  // Ensure date is in YYYY-MM-DD format
                  if (rowCopy[key] && typeof rowCopy[key] === "string") {
                      try{
                          var dateParts = rowCopy[key].split(/[-\/]/);
                          if (dateParts.length === 3)
                          {
                              var year, month, day;
                               if (dateParts[0].length === 4) {
                                  // Already in YYYY-MM-DD format
                                  year = dateParts[0];
                                  month = dateParts[1];
                                  day = dateParts[2];
                              } else {
                                   year = dateParts.find(part => part.length === 4) || dateParts[2];
                                    var yearIndex = dateParts.indexOf(year);
                                   if (yearIndex === 2) {
                                      month = dateParts[0].padStart(2, '0');
                                      day = dateParts[1].padStart(2, '0');
                                  } else {
                                      month = dateParts[1].padStart(2, '0');
                                      day = dateParts[2].padStart(2, '0');
                                  }
                              }
                              rowCopy[key] = year + "-" + month.padStart(2, '0') + "-" + day.padStart(2, '0');
                          }
                      }
                      catch(e)
                      {
                           var errorMessage = "Error parsing date for field: " + key + ": " + e.message;
                           failedRows.push({
                              rowNumber: i + 1,
                              projectElement: rowCopy.ProjectElement || "(missing)",
                              errorMessage: errorMessage
                           });
                           console.error("Error parsing date:", e);
                      }
                  }
               }
            });
  
            aData.push(rowCopy);
          } catch (error) {
            var errorMessage = "Error processing row: " + error.message;
            failedRows.push({
              rowNumber: i + 1,
              projectElement: row.ProjectElement || "(missing)",
              errorMessage: errorMessage
            });
            console.error("Error processing row:", error);
          }
        });
  
        // Store the processed data in the model
        oFileDataModel.setProperty("/wbsData", aData);
        oFileDataModel.setProperty("/recordCount", aData.length);
  
        // Store processed data in excelData model as well (from original code)
        var oExcelDataModel = this.oController.getView().getModel("excelData");
        if (oExcelDataModel) {
          oExcelDataModel.setProperty("/rows", aData);
        }
        console.log(aData);
        // Store failed rows in separate model (from original code)
        var oFailedRecordsModel = this.oController.getView().getModel("failedRecords");
        if (oFailedRecordsModel) {
          oFailedRecordsModel.setProperty("/rows", failedRows);
        }
  
        // Also keep failed rows in fileData model
        oFileDataModel.setProperty("/failedRows", failedRows);
        oFileDataModel.setProperty("/failedRowCount", failedRows.length);
  
        // Update table
        var oTable = this.oController.byId("excelTable");
        if (oTable) {
          oTable.getBinding("items").refresh();
        }
  
        // Log failed rows summary
        if (failedRows.length > 0) {
          console.log("Failed rows:", failedRows.length);
          console.table(failedRows);
        }
  
        return {
          success: aData.length > 0,
          totalRows: jsonData.length,
          processedRows: aData.length,
          failedRows: failedRows
        };
      },
      getExcelExportColumns : function()
      {
          return [
              {
              label: "Project Element",
              property: "ProjectElement",
              type: String
              },
              {
              label: "Project UUID",
              property: "ProjectUUID",
              type: String
              },
              {
              label: "Project Element Description",
              property: "ProjectElementDescription",
              type: String
              },
              {
              label: "Planned Start Date",
              property: "PlannedStartDate",
              type: String
              },
              {
              label: "Planned End Date",
              property: "PlannedEndDate",
              type: String
              },
              {
              label: "Responsible Cost Center",
              property: "ResponsibleCostCenter",
              type: String
              },
              {
              label: "Company Code",
              property: "CompanyCode",
              type: String
              },
              {
              label: "Profit Center",
              property: "ProfitCenter",
              type: String
              },
              {
              label: "Controlling Area",
              property: "ControllingArea",
              type: String
              },
              {
              label: "Is Statistical WBS",
              property: "WBSIsStatisticalWBSElement",
              type: String
              },
              {
              label: "Is Billing Element",
              property: "WBSElementIsBillingElement",
              type: String
              },
              {
              label: "Old Project Site ID",
              property: "YY1_OldProjectSiteID_PTD",
              type: String
              },
              {
              label: "Exact WBS Code",
              property: "YY1_ExactWBScode_PTD",
              type: String
              },
              {
              label: "Categorization 1",
              property: "YY1_Categorization1_PTD",
              type: String
              },
              {
              label: "ATM ID",
              property: "YY1_ATMID_PTD",
              type: String
              },
              {
              label: "Address",
              property: "YY1_Address_PTD",
              type: String
              },
              {
              label: "State",
              property: "YY1_State_PTD",
              type: String
              },
              {
              label: "Project",
              property: "YY1_Project_PTD",
              type: String
              },
              {
              label: "ATM Count",
              property: "YY1_ATMCount_PTD",
              type: String
              },
              {
              label: "Nature of WBS",
              property: "YY1_NatureOfWBS_PTD",
              type: String
              },
              {
              label: "SAP Site ID Report",
              property: "YY1_SAPsiteIDReport_PTD",
              type: String
              },
              {
              label: "Address and Postal Code",
              property: "YY1_Addressandpostalco_PTD",
              type: String
              },
              {
              label: "Deployment",
              property: "YY1_Deployment_PTD",
              type: String
              },
              {
              label: "Bank Load ATM Discount",
              property: "YY1_BankLoadATMDiscoun_PTD",
              type: String
              },
              {
              label: "ERP Relocation Reference AT",
              property: "YY1_ERPRelocationRefAT_PTD",
              type: String
              },
              {
              label: "ERP Site ID Report",
              property: "YY1_ERPsiteIDReport_PTD",
              type: String
              },
              {
              label: "UDF3",
              property: "YY1_UDF3_PTD",
              type: String
              },
              {
              label: "Categorization",
              property: "YY1_Categorization_PTD",
              type: String
              },
              {
              label: "UDF1",
              property: "YY1_UDF1_PTD",
              type: String
              },
              {
              label: "Postal Code",
              property: "YY1_Postalcode_PTD",
              type: String
              },
              {
              label: "UDF2",
              property: "YY1_UDF2_PTD",
              type: String
              },
              {
              label: "ERP Relocation Reference",
              property: "YY1_ERPRelocationRefer_PTD",
              type: String
              }
          ];
      },
      exportExcelData: function(oBinding) {
          var aData = [];
          oBinding.getContexts().forEach(function (oContext) {
            aData.push(oContext.getObject());
          });
    
          // Get the columns from the predefined function
          var aColumns = this.getExcelExportColumns();
    
          // Prepare the header row (column labels only)
          var aColumnLabels = aColumns.map(function (column) {
            return column.label;
          });
    
          // Prepare the data in anarray of arrays (for xlsx)
          var aExcelData = [aColumnLabels]; // The first row will be the column headers
    
          aData.forEach(function (oRow) {
            var aRowData = [];
            aColumns.forEach(function (column) {
              // Use the property mapping from the column definition
              aRowData.push(oRow[column.property] || "");
            });
            aExcelData.push(aRowData);
          });
    
          // Create a worksheet using xlsx.utils.aoa_to_sheet
          var ws = XLSX.utils.aoa_to_sheet(aExcelData);
    
          // Create a workbook and append the worksheet
          var wb = XLSX.utils.book_new();
          XLSX.utils.book_append_sheet(wb, ws, "WBS Elements");
    
          // Trigger the export by writing the file
          XLSX.writeFile(wb, "WBS_Elements_Export.xlsx");
    
          MessageToast.show("Export completed");
      },
      exportFailedRecords: function(oBinding) {
          var aData = [];
          oBinding.getContexts().forEach(function (oContext) {
            aData.push(oContext.getObject());
          });
    
          // Define the columns for the failed records table
          var aColumns = ["Excel Row Number", "Project Element", "Error Details"];
    
          // Prepare the data in an array of arrays (for xlsx)
          var aExcelData = [aColumns]; // The first row will be the column headers
          aData.forEach(function (oRow, index) {
            var aRowData = [
              index + 1, // Row number (Excel row starts from 1)
              oRow.projectElement || "", // Project Element
              oRow.errorMessage || "" // Error Details
            ];
            aExcelData.push(aRowData);
          });
    
          // Create a worksheet using xlsx.utils.aoa_to_sheet
          var ws = XLSX.utils.aoa_to_sheet(aExcelData);
    
          // Create a workbook and append the worksheet
          var wb = XLSX.utils.book_new();
          XLSX.utils.book_append_sheet(wb, ws, "Failed Records");
    
          // Trigger the export by writing the file
          XLSX.writeFile(wb, "Failed_Records_Export.xlsx");
    
          MessageToast.show("Export completed");
      }
    };
  
    return ExcelProcessor;
  });
  