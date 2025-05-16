sap.ui.define(
  [
    "sap/ui/core/mvc/Controller",
    "sap/ui/model/Filter",
    "sap/ui/model/FilterOperator",
    "sap/m/MessageBox",
    "sap/m/MessageToast",
    "sap/m/Dialog",
    "sap/m/Button",
    "sap/m/Text",
    "sap/m/Label",
    "sap/m/VBox",
    "sap/ui/layout/form/SimpleForm",
    "sap/ui/core/Fragment"
  ],
  function (
    Controller,
    Filter,
    FilterOperator,
    MessageBox,
    MessageToast,
    Dialog,
    Button,
    Text,
    Label,
    VBox,
    SimpleForm,
    Fragment
  ) {
    "use strict";

    // var EdmType = exportLibrary.EdmType;

    return Controller.extend("wbsupload.controller.Fileupload", {
      onInit: function () {
        // Initialize models
        this._initializeModels();
      },

      _initializeModels: function () {
        // File data model for tracking upload state
        var oFileDataModel = new sap.ui.model.json.JSONModel({
          isFileUploaded: false,
          statusMessage: "Ready to upload file"
        });
        this.getView().setModel(oFileDataModel, "fileData");

        // Excel data model - will contain the parsed Excel content
        var oExcelDataModel = new sap.ui.model.json.JSONModel({
          rows: []
        });
        this.getView().setModel(oExcelDataModel, "excelData");

        // Failed records model - will contain records that failed processing
        var oFailedRecordsModel = new sap.ui.model.json.JSONModel({
          rows: []
        });
        this.getView().setModel(oFailedRecordsModel, "failedRecords");
      },

      /**
       * Handler for file selection
       */
      onFileChange: function (oEvent) {
        var oFileUploader = oEvent.getSource();
        var sFileName = oEvent.getParameter("newValue");

        // Update file name text
        var oFilePathText = this.getView().byId("filePathText");
        if (sFileName) {
          oFilePathText.setText(sFileName);
        } else {
          oFilePathText.setText("No file selected");
        }
      },

      /**
       * Handler for file upload button
       */
      onUpload: function () {
        var oFileUploader = this.getView().byId("fileUploader");
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
      },

      /**
  * Read and parse Excel file
  * @param {File} oFile The uploaded Excel file
  */
      _readExcelFile: function (oFile) {
        var that = this;

        // Show busy dialog
        if (!this.busyDialog) {
          this.busyDialog = new sap.m.BusyDialog({
            title: "Processing",
            text: "Reading Excel file...",
            showCancelButton: false
          });
        } else {
          this.busyDialog.setText("Reading Excel file...");
        }
        this.busyDialog.open();

        // Use FileReader API to read file content
        var oReader = new FileReader();

        oReader.onload = function (e) {
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
          that._processExcelData(jsonData);

          // Close busy dialog
          that._closeBusyDialog();

          // Update status
          var oFileDataModel = that.getView().getModel("fileData");
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
      },

      /**
       * Process Excel data from uploaded file
       * @param {Array} jsonData JSON data from Excel file
       */
      _processExcelData: function (jsonData) {
        var aData = [];
        var oFileDataModel = this.getView().getModel("fileData");
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

            // Store the operation type in a separate property if needed
            if (operationType) {
              // Optionally store the operation type in a custom property
              // that won't be part of the data sent to backend
              //   rowCopy._operationType = operationType;
            }

            // Clean up the data - convert empty strings to undefined
            Object.keys(rowCopy).forEach(function (key) {
              // Handle empty strings
              if (rowCopy[key] === "") {
                rowCopy[key] = undefined;
              }

              // Handle dates - ensure they are in the right format
              if ((key === "PlannedStartDate" || key === "PlannedEndDate" ||
                key === "YY1_UDF1_PTD" || key === "YY1_UDF2_PTD") && rowCopy[key]) {
                // Ensure date is in YYYY-MM-DD format
                if (rowCopy[key] && typeof rowCopy[key] === "string") {
                  // Try to parse and standardize date format if needed
                  try {
                    var dateParts = rowCopy[key].split(/[-\/]/);
                    if (dateParts.length === 3) {
                      // Handle different date formats
                      var year, month, day;

                      // Determine if the format is MM/DD/YYYY or DD/MM/YYYY or YYYY-MM-DD
                      if (dateParts[0].length === 4) {
                        // Already in YYYY-MM-DD format
                        year = dateParts[0];
                        month = dateParts[1];
                        day = dateParts[2];
                      } else {
                        // Assuming MM/DD/YYYY or DD/MM/YYYY
                        // For simplicity, assuming the year is the part with 4 digits
                        year = dateParts.find(part => part.length === 4) || dateParts[2];

                        // Determine month and day based on position of year
                        var yearIndex = dateParts.indexOf(year);
                        if (yearIndex === 2) {
                          // Format is either MM/DD/YYYY or DD/MM/YYYY
                          month = dateParts[0].padStart(2, '0');
                          day = dateParts[1].padStart(2, '0');
                        } else {
                          // Unusual format, make best guess
                          month = dateParts[1].padStart(2, '0');
                          day = dateParts[2].padStart(2, '0');
                        }
                      }

                      // Format as YYYY-MM-DD
                      rowCopy[key] = year + "-" + month.padStart(2, '0') + "-" + day.padStart(2, '0');
                    }
                  } catch (e) {
                    var errorMessage = "Error parsing date for field: " + key + ": " + e.message;
                    failedRows.push({
                      rowNumber: i + 1,
                      projectElement: rowCopy.ProjectElement || "(missing)",
                      errorMessage: errorMessage
                    });
                    console.error("Error parsing date:", e);
                    // Keep original value if parsing failed
                  }
                }
              }
            });

            // Add to processed data array
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
        var oExcelDataModel = this.getView().getModel("excelData");
        if (oExcelDataModel) {
          oExcelDataModel.setProperty("/rows", aData);
        }
        console.log(aData);
        // Store failed rows in separate model (from original code)
        var oFailedRecordsModel = this.getView().getModel("failedRecords");
        if (oFailedRecordsModel) {
          oFailedRecordsModel.setProperty("/rows", failedRows);
        }

        // Also keep failed rows in fileData model
        oFileDataModel.setProperty("/failedRows", failedRows);
        oFileDataModel.setProperty("/failedRowCount", failedRows.length);

        // Update table
        var oTable = this.byId("excelTable");
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

      /**
       * Search handler for Excel data table
       */
      onExcelDataSearch: function (oEvent) {
        var sQuery = oEvent.getParameter("query");
        var oTable = this.getView().byId("excelTable");
        var oBinding = oTable.getBinding("items");

        if (sQuery) {
          // Create filter array (can add more fields to search)
          var aFilters = [
            new Filter("ProjectElement", FilterOperator.Contains, sQuery),
            new Filter(
              "ProjectElementDescription",
              FilterOperator.Contains,
              sQuery
            ),
            new Filter("ProjectUUID", FilterOperator.Contains, sQuery)
          ];

          var oFilter = new Filter({
            filters: aFilters,
            and: false // OR logic
          });

          oBinding.filter(oFilter);
        } else {
          oBinding.filter([]);
        }
      },

      /**
       * Search handler for Failed Records table
       */
      onFailedRecordsSearch: function (oEvent) {
        var sQuery = oEvent.getParameter("query");
        var oTable = this.getView().byId("failedRecordsTable");
        var oBinding = oTable.getBinding("items");

        if (sQuery) {
          // Create filter array
          var aFilters = [
            new Filter("projectElement", FilterOperator.Contains, sQuery),
            new Filter("errorMessage", FilterOperator.Contains, sQuery)
          ];

          var oFilter = new Filter({
            filters: aFilters,
            and: false // OR logic
          });

          oBinding.filter(oFilter);
        } else {
          oBinding.filter([]);
        }
      },

      /**
       * Export Excel data to Excel file
       */

      onExportExcelData: function () {
        var oTable = this.getView().byId("excelTable");
        var oBinding = oTable.getBinding("items");
        console.log("Export function called");

        // Check if there is data to export
        if (!oBinding || oBinding.getLength() === 0) {
          MessageToast.show("No data to export");
          return;
        }

        // Extract the data from the table
        var aData = [];
        oBinding.getContexts().forEach(function (oContext) {
          aData.push(oContext.getObject());
        });

        // Get the columns from the predefined function
        var aColumns = this._getExcelExportColumns();

        // Prepare the header row (column labels only)
        var aColumnLabels = aColumns.map(function (column) {
          return column.label;
        });

        // Prepare the data in an array of arrays (for xlsx)
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

      /**
       * Define columns for Excel export
       */
      _getExcelExportColumns: function () {
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
      onExportFailedRecords: function () {
        var oTable = this.getView().byId("failedRecordsTable");
        var oBinding = oTable.getBinding("items");

        // Check if there is data to export
        if (!oBinding || oBinding.getLength() === 0) {
          MessageToast.show("No failed records to export");
          return;
        }

        // Extract the failed records data from the table
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
      },

      /**
       * Handle clicking on an item in the Excel data table
       */
      onItemPress: function (oEvent) {
        var oItem = oEvent.getSource();
        var oContext = oItem.getBindingContext("excelData");
        var oData = oContext.getObject();

        // Show detail dialog
        this._showDetailDialog(oData);
      },

      /**
       * Show WBS Element detail dialog
       */
      _showDetailDialog: function (oData) {
        var that = this;

        // Create dialog
        if (!this._oDetailDialog) {
          this._oDetailDialog = new Dialog({
            title: "WBS Element Details",
            contentWidth: "40rem",
            contentHeight: "auto",
            content: new SimpleForm({
              layout: "ResponsiveGridLayout",
              editable: false,
              content: [
                new Label({ text: "Project Element" }),
                new Text({ text: "{detail>/ProjectElement}" }),

                new Label({ text: "Project UUID" }),
                new Text({ text: "{detail>/ProjectUUID}" }),

                new Label({ text: "Description" }),
                new Text({ text: "{detail>/ProjectElementDescription}" }),

                new Label({ text: "Planned Start Date" }),
                new Text({ text: "{detail>/PlannedStartDate}" }),

                new Label({ text: "Planned End Date" }),
                new Text({ text: "{detail>/PlannedEndDate}" }),

                new Label({ text: "Responsible Cost Center" }),
                new Text({ text: "{detail>/ResponsibleCostCenter}" }),

                new Label({ text: "Company Code" }),
                new Text({ text: "{detail>/CompanyCode}" }),

                new Label({ text: "Profit Center" }),
                new Text({ text: "{detail>/ProfitCenter}" }),

                new Label({ text: "Controlling Area" }),
                new Text({ text: "{detail>/ControllingArea}" })
              ]
            }),
            endButton: new Button({
              text: "Close",
              press: function () {
                that._oDetailDialog.close();
              }
            })
          });

          this.getView().addDependent(this._oDetailDialog);
        }

        // Set model data
        var oModel = new sap.ui.model.json.JSONModel(oData);
        this._oDetailDialog.setModel(oModel, "detail");

        // Open dialog
        this._oDetailDialog.open();
      },

      /**
       * Handle clicking on an item in the Failed Records table
       */
      onFailedItemPress: function (oEvent) {
        var oItem = oEvent.getSource();
        var oContext = oItem.getBindingContext("failedRecords");
        var oData = oContext.getObject();

        // Show error details dialog
        this._showErrorDialog(oData);
      },

      /**
       * Show Error detail dialog
       */
      _showErrorDialog: function (oData) {
        // Create dialog if it doesn't exist
        if (!this._oErrorDialog) {
          this._oErrorDialog = new Dialog({
            title: "Error Details",
            contentWidth: "30rem",
            content: new VBox({
              items: [
                new SimpleForm({
                  layout: "ResponsiveGridLayout",
                  editable: false,
                  content: [
                    new Label({ text: "Excel Row" }),
                    new Text({ text: "{error>/rowNumber}" }),

                    new Label({ text: "Project Element" }),
                    new Text({ text: "{error>/projectElement}" }),

                    new Label({ text: "Error Message" }),
                    new Text({ text: "{error>/errorMessage}" })
                  ]
                })
              ]
            }),
            endButton: new Button({
              text: "Close",
              press: function () {
                this._oErrorDialog.close();
              }.bind(this)
            })
          });

          this.getView().addDependent(this._oErrorDialog);
        }

        // Set model data
        var oModel = new sap.ui.model.json.JSONModel(oData);
        this._oErrorDialog.setModel(oModel, "error");

        // Open dialog
        this._oErrorDialog.open();
      },

      /**
       * View ATM Details
       */
      onViewATMDetails: function (oEvent) {
        var oSource = oEvent.getSource();
        var oContext = oSource.getBindingContext("excelData");
        var oData = oContext.getObject();

        // Create dialog if it doesn't exist
        if (!this._oATMDialog) {
          this._oATMDialog = new Dialog({
            title: "ATM Related Fields",
            contentWidth: "40rem", // Adjusted width to accommodate more fields
            content: new SimpleForm({
              layout: "ResponsiveGridLayout",
              editable: false,
              content: [
                // ProjectElement Fields
                new Label({ text: "Project Element" }),
                new Text({ text: "{atm>/ProjectElement}" }),

                new Label({ text: "Project UUID" }),
                new Text({ text: "{atm>/ProjectUUID}" }),

                new Label({ text: "Project Element Description" }),
                new Text({ text: "{atm>/ProjectElementDescription}" }),

                new Label({ text: "Planned Start Date" }),
                new Text({ text: "{atm>/PlannedStartDate}" }),

                new Label({ text: "Planned End Date" }),
                new Text({ text: "{atm>/PlannedEndDate}" }),

                new Label({ text: "Responsible Cost Center" }),
                new Text({ text: "{atm>/ResponsibleCostCenter}" }),

                new Label({ text: "Company Code" }),
                new Text({ text: "{atm>/CompanyCode}" }),

                new Label({ text: "Profit Center" }),
                new Text({ text: "{atm>/ProfitCenter}" }),

                new Label({ text: "Controlling Area" }),
                new Text({ text: "{atm>/ControllingArea}" }),

                new Label({ text: "WBS Element Is Billing Element" }),
                new Text({ text: "{atm>/WBSElementIsBillingElement}" }),

                // Additional fields (starting from YY1_OldProjectSiteID_PTD)
                new Label({ text: "Old Project ID" }),
                new Text({ text: "{atm>/YY1_OldProjectSiteID_PTD}" }),

                new Label({ text: "Exact WBS Code" }),
                new Text({ text: "{atm>/YY1_ExactWBScode_PTD}" }),

                new Label({ text: "Site type" }),
                new Text({ text: "{atm>/YY1_Categorization1_PTD}" }),

                new Label({ text: "ATM ID" }),
                new Text({ text: "{atm>/YY1_ATMID_PTD}" }),

                new Label({ text: "Address" }),
                new Text({ text: "{atm>/YY1_Address_PTD}" }),

                new Label({ text: "State" }),
                new Text({ text: "{atm>/YY1_State_PTD}" }),

                new Label({ text: "Project" }),
                new Text({ text: "{atm>/YY1_Project_PTD}" }),

                new Label({ text: "ATM Count" }),
                new Text({ text: "{atm>/YY1_ATMCount_PTD}" }),

                new Label({ text: "Nature of WBS" }),
                new Text({ text: "{atm>/YY1_NatureOfWBS_PTD}" }),

                new Label({ text: "SAP Site ID Report" }),
                new Text({ text: "{atm>/YY1_SAPsiteIDReport_PTD}" }),

                new Label({ text: "Address and Postal Code" }),
                new Text({ text: "{atm>/YY1_Addressandpostalco_PTD}" }),

                new Label({ text: "Deployment" }),
                new Text({ text: "{atm>/YY1_Deployment_PTD}" }),

                new Label({ text: "Bank Load Percentage" }),
                new Text({ text: "{atm>/YY1_BankLoadATMDiscoun_PTD}" }),

                new Label({ text: "ERP Relocation Reference ATM" }),
                new Text({ text: "{atm>/YY1_ERPRelocationRefAT_PTD}" }),

                new Label({ text: "ERP Site ID Report" }),
                new Text({ text: "{atm>/YY1_ERPsiteIDReport_PTD}" }),

                new Label({ text: "UDF 1" }),
                new Text({ text: "{atm>/YY1_UDF3_PTD}" }),

                new Label({ text: "Categorization" }),
                new Text({ text: "{atm>/YY1_Categorization_PTD}" }),

                new Label({ text: "Actual Start Date" }),
                new Text({ text: "{atm>/YY1_UDF1_PTD}" }),

                new Label({ text: "Postal Code" }),
                new Text({ text: "{atm>/YY1_Postalcode_PTD}" }),

                new Label({ text: "Actual End Date" }),
                new Text({ text: "{atm>/YY1_UDF2_PTD}" }),

                new Label({ text: "ERP Relocation Ref. Site ID" }),
                new Text({ text: "{atm>/YY1_ERPRelocationRefer_PTD}" })
              ]
            }),
            endButton: new Button({
              text: "Close",
              press: function () {
                this._oATMDialog.close();
              }.bind(this)
            })
          });

          this.getView().addDependent(this._oATMDialog);
        }

        // Extract or mock ATM-related fields
        var atmData = {
          ATMCategory: oData.ATMCategory || "Standard",
          ATMPriority: oData.ATMPriority || "Medium",
          ATMStatus: oData.ATMStatus || "Active",
          ATMGroup: oData.ATMGroup || "Default",
          ATMNote: oData.ATMNote || "No additional notes",

          // ProjectElement Fields
          ProjectElement: oData.ProjectElement || "",
          ProjectUUID: oData.ProjectUUID || "",
          ProjectElementDescription: oData.ProjectElementDescription || "",
          PlannedStartDate: oData.PlannedStartDate || "",
          PlannedEndDate: oData.PlannedEndDate || "",
          ResponsibleCostCenter: oData.ResponsibleCostCenter || "",
          CompanyCode: oData.CompanyCode || "",
          ProfitCenter: oData.ProfitCenter || "",
          ControllingArea: oData.ControllingArea || "",
          WBSElementIsBillingElement: oData.WBSElementIsBillingElement || "No",

          // Additional Fields
          YY1_OldProjectSiteID_PTD: oData.YY1_OldProjectSiteID_PTD || "",
          YY1_ExactWBScode_PTD: oData.YY1_ExactWBScode_PTD || "",
          YY1_Categorization1_PTD: oData.YY1_Categorization1_PTD || "",
          YY1_ATMID_PTD: oData.YY1_ATMID_PTD || "",
          YY1_Address_PTD: oData.YY1_Address_PTD || "",
          YY1_State_PTD: oData.YY1_State_PTD || "",
          YY1_Project_PTD: oData.YY1_Project_PTD || "",
          YY1_ATMCount_PTD: oData.YY1_ATMCount_PTD || "0",
          YY1_NatureOfWBS_PTD: oData.YY1_NatureOfWBS_PTD || "",
          YY1_SAPsiteIDReport_PTD: oData.YY1_SAPsiteIDReport_PTD || "",
          YY1_Addressandpostalco_PTD: oData.YY1_Addressandpostalco_PTD || "",
          YY1_Deployment_PTD: oData.YY1_Deployment_PTD || "",
          YY1_BankLoadATMDiscoun_PTD: oData.YY1_BankLoadATMDiscoun_PTD || "",
          YY1_ERPRelocationRefAT_PTD: oData.YY1_ERPRelocationRefAT_PTD || "",
          YY1_ERPsiteIDReport_PTD: oData.YY1_ERPsiteIDReport_PTD || "",
          YY1_UDF3_PTD: oData.YY1_UDF3_PTD || "",
          YY1_Categorization_PTD: oData.YY1_Categorization_PTD || "",
          YY1_UDF1_PTD: oData.YY1_UDF1_PTD || "",
          YY1_Postalcode_PTD: oData.YY1_Postalcode_PTD || "",
          YY1_UDF2_PTD: oData.YY1_UDF2_PTD || "",
          YY1_ERPRelocationRefer_PTD: oData.YY1_ERPRelocationRefer_PTD || ""
        };

        // Set model data
        var oModel = new sap.ui.model.json.JSONModel(atmData);
        this._oATMDialog.setModel(oModel, "atm");

        // Open dialog
        this._oATMDialog.open();
      },

      /**
       * Handle click on help button
       */
      onShowHelp: function () {
        // Create help dialog if it doesn't exist
        if (!this._oHelpDialog) {
          this._oHelpDialog = new Dialog({
            title: "Help Information",
            contentWidth: "40rem",
            content: new VBox({
              items: [
                new Text({
                  text: "This application allows you to upload and process WBS Element data from Excel files."
                }),
                new Text({
                  text: "Steps to use this application:"
                }),
                new VBox({
                  items: [
                    new Text({
                      text: "1. Download the template using the 'Download Template' button"
                    }),
                    new Text({
                      text: "2. Fill in the WBS Element data in the Excel template"
                    }),
                    new Text({
                      text: "3. Upload the file using 'Browse...' button"
                    }),
                    new Text({
                      text: "4. Click 'Upload File' to process the data"
                    }),
                    new Text({
                      text: "5. Review the data in the 'Excel Data' tab"
                    }),
                    new Text({
                      text: "6. Check the 'Failed Records' tab for any errors"
                    }),
                    new Text({
                      text: "7. Click 'Update WBS Elements' to save the data"
                    })
                  ]
                })
              ],
              spacing: "1rem"
            }),
            endButton: new Button({
              text: "Close",
              press: function () {
                this._oHelpDialog.close();
              }.bind(this)
            })
          });

          this.getView().addDependent(this._oHelpDialog);
        }

        // Open dialog
        this._oHelpDialog.open();
      },

      onDownloadTemplate: function () {
        // Sample data for the template with examples for both create and update
        var aData = [
          {
            // Example for CREATE - all fields need to be filled
            OperationType: "CREATE",
            ProjectElement: "B-SBP-OF-00TS101",
            ProjectUUID: "159b9e67-d1a9-1eef-aea9-b582a1b144e5",
            ProjectElementDescription: "00TSSB91",
            PlannedStartDate: "2024-12-01",
            PlannedEndDate: "2024-12-31",
            ResponsibleCostCenter: "1AP_BLA001",
            CompanyCode: "1000",
            ProfitCenter: "1AP_BLA001",
            ControllingArea: "A000",
            WBSElementIsBillingElement: "X",
            YY1_OldProjectSiteID_PTD: "OLD123",
            YY1_ExactWBScode_PTD: "B-SBP-OF-00TSSB91",
            YY1_Categorization1_PTD: "Offsite",
            YY1_ATMID_PTD: "ATM-12345",
            YY1_Address_PTD: "Jhajjhar",
            YY1_State_PTD: "Haryana",
            YY1_Project_PTD: "SBI BANK",
            YY1_ATMCount_PTD: "1",
            YY1_NatureOfWBS_PTD: "SITE",
            YY1_SAPsiteIDReport_PTD: "ERTSAPSITE",
            YY1_Addressandpostalco_PTD: "DORA GUA VILLAGE",
            YY1_Deployment_PTD: "URBAN",
            YY1_BankLoadATMDiscoun_PTD: "0.02",
            YY1_ERPRelocationRefAT_PTD: "ERP RELOCATIONATM",
            YY1_ERPsiteIDReport_PTD: "ERPSAP ITE",
            YY1_UDF3_PTD: "UDF-1",
            YY1_Categorization_PTD: "GOLD",
            YY1_UDF1_PTD: "2024-12-01",
            YY1_Postalcode_PTD: "122001",
            YY1_UDF2_PTD: "2024-12-01",
            YY1_ERPRelocationRefer_PTD: "RELOCATION"
          },
          {
            // Example for UPDATE - only changed fields + ProjectElement (required)
            OperationType: "UPDATE",
            ProjectElement: "B-SBP-OF-00TS102",
            ProjectUUID: "259b9e67-d1a9-1eef-aea9-b582a1b144e6",
            ProjectElementDescription: "[NO CHANGE]",
            PlannedStartDate: "2025-01-15",
            PlannedEndDate: "[NO CHANGE]",
            ResponsibleCostCenter: "[NO CHANGE]",
            CompanyCode: "[NO CHANGE]",
            ProfitCenter: "[NO CHANGE]",
            ControllingArea: "[NO CHANGE]",
            WBSElementIsBillingElement: "[CLEAR]",
            YY1_OldProjectSiteID_PTD: "[NO CHANGE]",
            YY1_ExactWBScode_PTD: "[NO CHANGE]",
            YY1_Categorization1_PTD: "Onsite",
            YY1_ATMID_PTD: "[NO CHANGE]",
            YY1_Address_PTD: "[NO CHANGE]",
            YY1_State_PTD: "[NO CHANGE]",
            YY1_Project_PTD: "[NO CHANGE]",
            YY1_ATMCount_PTD: "[NO CHANGE]",
            YY1_NatureOfWBS_PTD: "[NO CHANGE]",
            YY1_SAPsiteIDReport_PTD: "[NO CHANGE]",
            YY1_Addressandpostalco_PTD: "[CLEAR]",
            YY1_Deployment_PTD: "[NO CHANGE]",
            YY1_BankLoadATMDiscoun_PTD: "[NO CHANGE]",
            YY1_ERPRelocationRefAT_PTD: "[NO CHANGE]",
            YY1_ERPsiteIDReport_PTD: "[NO CHANGE]",
            YY1_UDF3_PTD: "[NO CHANGE]",
            YY1_Categorization_PTD: "[NO CHANGE]",
            YY1_UDF1_PTD: "[NO CHANGE]",
            YY1_Postalcode_PTD: "[NO CHANGE]",
            YY1_UDF2_PTD: "[NO CHANGE]",
            YY1_ERPRelocationRefer_PTD: "[NO CHANGE]"
          }
        ];

        // Define columns with labels, properties, types, instructions, and required status
        var aColumns = [
          { label: "Operation Type (Required)", property: "OperationType", type: "string", note: "Must be either CREATE or UPDATE", required: true },
          { label: "Project Element (Required)", property: "ProjectElement", type: "string", note: "Must be filled for both CREATE and UPDATE operations", required: true },
          { label: "ProjectUUID", property: "ProjectUUID", type: "string", note: "System-generated, used for reference only", required: false },
          { label: "Name of WBS", property: "ProjectElementDescription", type: "string", note: "Full description for CREATE, [NO CHANGE] for UPDATE if not changing", required: true },
          { label: "Planned Start Date", property: "PlannedStartDate", type: "String", note: "Format: YYYY-MM-DD", required: true },
          { label: "Planned End Date", property: "PlannedEndDate", type: "String", note: "Format: YYYY-MM-DD", required: true },
          { label: "Responsible Cost Center", property: "ResponsibleCostCenter", type: "string", required: true },
          { label: "Company Code", property: "CompanyCode", type: "string", required: true },
          { label: "Profit Center", property: "ProfitCenter", type: "string", required: true },
          { label: "Controlling Area", property: "ControllingArea", type: "string", required: true },
          { label: "Billing Element", property: "WBSElementIsBillingElement", type: "string", note: "Use 'X' for yes, leave blank for no", required: false },
          { label: "Old Project ID", property: "YY1_OldProjectSiteID_PTD", type: "string", required: false },
          { label: "Exact WBS code", property: "YY1_ExactWBScode_PTD", type: "string", required: false },
          { label: "Site type (OF/ON)", property: "YY1_Categorization1_PTD", type: "string", note: "Values: Offsite, Onsite", required: false },
          { label: "ATM ID", property: "YY1_ATMID_PTD", type: "string", required: false },
          { label: "District", property: "YY1_Address_PTD", type: "string", required: false },
          { label: "State", property: "YY1_State_PTD", type: "string", required: false },
          { label: "Bank name", property: "YY1_Project_PTD", type: "string", required: false },
          { label: "ATM count", property: "YY1_ATMCount_PTD", type: "string", required: false },
          { label: "Nature of WBS", property: "YY1_NatureOfWBS_PTD", type: "string", required: false },
          { label: "SAP Site ID report", property: "YY1_SAPsiteIDReport_PTD", type: "string", required: false },
          { label: "Address", property: "YY1_Addressandpostalco_PTD", type: "string", required: false },
          { label: "Deployment", property: "YY1_Deployment_PTD", type: "string", note: "Values: URBAN, RURAL", required: false },
          { label: "Bank load percentage", property: "YY1_BankLoadATMDiscoun_PTD", type: "string", note: "Format as decimal, e.g., 0.02 for 2%", required: false },
          { label: "ERP relocation Ref ATM ID", property: "YY1_ERPRelocationRefAT_PTD", type: "string", required: false },
          { label: "ERP Site ID report", property: "YY1_ERPsiteIDReport_PTD", type: "string", required: false },
          { label: "UDF-1", property: "YY1_UDF3_PTD", type: "string", required: false },
          { label: "Categorization", property: "YY1_Categorization_PTD", type: "string", note: "Values: GOLD, SILVER, PLATINUM", required: false },
          { label: "Actual start date", property: "YY1_UDF1_PTD", type: "String", note: "Format: YYYY-MM-DD", required: false },
          { label: "Postal code", property: "YY1_Postalcode_PTD", type: "string", required: false },
          { label: "Actual end date", property: "YY1_UDF2_PTD", type: "String", note: "Format: YYYY-MM-DD", required: false },
          { label: "ERP relocation ref. site id", property: "YY1_ERPRelocationRefer_PTD", type: "string", required: false }
        ];

        // Create a new workbook
        // Ensure the workbook and worksheet are created
        var workbook = new ExcelJS.Workbook();
        var worksheetInstructions = workbook.addWorksheet('Instructions');
        var worksheet = workbook.addWorksheet('Template');

        // Set column widths
        aColumns.forEach(function (column, index) {
          worksheet.getColumn(index + 1).width = 20;
        });

        worksheetInstructions.getColumn(1).width = 80;

        // Add headers
        aColumns.forEach(function (column, index) {
          var headerCell = worksheet.getCell(1, index + 1);
          headerCell.value = column.label;

          if (column.required) {
            headerCell.style = { font: { bold: true, color: { argb: "FF0000" } }, fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFCCCC' } } };
          } else {
            headerCell.style = { font: { bold: true }, fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'DDDDDD' } } };
          }

          // Add notes for columns with special notes
          if (column.note) {
            worksheet.getCell(1, index + 1).note = column.note;
          }
        });

        // Add data rows (CREATE example)
        var createRow = worksheet.addRow(aColumns.map(function (column) {
          return aData[0][column.property];
        }));

        createRow.eachCell(function (cell, colNumber) {
          if (aColumns[colNumber - 1].required) {
            cell.style = { font: { color: { argb: "FF0000" } }, fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'E6FFE6' } } };
          } else {
            cell.style = { fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'E6FFE6' } } };
          }
        });

        // Add data rows (UPDATE example)
        var updateRow = worksheet.addRow(aColumns.map(function (column) {
          return aData[1][column.property];
        }));

        updateRow.eachCell(function (cell, colNumber) {
          if (aData[1][aColumns[colNumber - 1].property] === "[NO CHANGE]" || aData[1][aColumns[colNumber - 1].property] === "[CLEAR]") {
            cell.style = { font: { color: { argb: "0000FF" }, italic: true }, fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'E6E6FF' } } };
          } else if (aColumns[colNumber - 1].required) {
            cell.style = { font: { bold: true, color: { argb: "FF0000" } }, fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'E6E6FF' } } };
          } else {
            cell.style = { fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'E6E6FF' } } };
          }
        });

        // Add instruction sheet
        worksheetInstructions.addRow(['WBS Elements - Template Instructions']).font = { bold: true, size: 14 };

        worksheetInstructions.addRow(['']);
        worksheetInstructions.addRow(['This template can be used for both CREATE and UPDATE operations:']);

        // Add CREATE instructions
        worksheetInstructions.addRow(['For CREATE operations:']).font = { bold: true, color: { argb: "008000" } };
        worksheetInstructions.addRow(['1. Set Operation Type column to "CREATE"']).font = { color: { argb: "FF0000" } };
        worksheetInstructions.addRow(['2. Fill in all required fields with actual values (highlighted in red)']).font = { color: { argb: "FF0000" } };
        worksheetInstructions.addRow(['3. ProjectElement must be unique and follow the pattern (e.g., B-SBP-OF-00TS101)']);
        worksheetInstructions.addRow(['4. Date fields must be in format YYYY-MM-DD']);
        worksheetInstructions.addRow(['5. For WBSElementIsBillingElement, use "X" for yes, leave blank for no']);

        // Add UPDATE instructions
        worksheetInstructions.addRow(['For UPDATE operations:']).font = { bold: true, color: { argb: "0000FF" } };
        worksheetInstructions.addRow(['1. Set Operation Type column to "UPDATE"']).font = { color: { argb: "FF0000" } };
        worksheetInstructions.addRow(['2. ProjectElement is required and must match an existing WBS Element']).font = { color: { argb: "FF0000" } };
        worksheetInstructions.addRow(['3. Fill only the fields you want to update with new values']);
        worksheetInstructions.addRow(['4. Use [NO CHANGE] for fields you don\'t want to modify']).font = { italic: true, color: { argb: "0000FF" } };
        worksheetInstructions.addRow(['5. Use [CLEAR] to clear/empty a field\'s value']).font = { italic: true, color: { argb: "0000FF" } };


        // Save Excel file
        workbook.xlsx.writeBuffer().then(function (buffer) {
          var blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
          var link = document.createElement('a');
          link.href = URL.createObjectURL(blob);
          link.download = 'WBS_Elements_Template.xlsx';
          link.click();
        });

        MessageToast.show("Template downloaded successfully");
      },
      /**
       * Handle Update WBS Elements button
       */
      onUpdateWbsElements: function () {
        var oExcelDataModel = this.getView().getModel("excelData");
        var aRows = oExcelDataModel.getProperty("/rows");

        if (!aRows || aRows.length === 0) {
          MessageBox.error("No data available to create.");
          return;
        }

        // Show confirmation dialog
        MessageBox.confirm(
          "Are you sure you want to create/change " +
          aRows.length +
          " WBS Element(s)?",
          {
            title: "Confirm Create",
            onClose: function (sAction) {
              if (sAction === MessageBox.Action.OK) {
                this._processWbsElementUpdate(aRows);
              }
            }.bind(this)
          }
        );
      },
      /**
   * Process WBS Element update using OData V2 batch operations with bulk reads
   * Handles [NO CHANGE] markers for update operations
   * @param {Array} aRows Array of WBS Elements to update
   */
      _processWbsElementUpdate: function (aRows) {
        // Initialize counters and storage for failed records
        this.totalRecords = aRows.length;
        this.successCount = 0;
        this.failureCount = 0;
        this.failedRecords = [];

        // Create and show busy dialog programmatically
        if (!this.busyDialog) {
          this.busyDialog = new sap.m.BusyDialog({
            title: "Processing",
            text: "Preparing to process WBS Elements...",
            showCancelButton: false
          });
        } else {
          this.busyDialog.setText("Preparing to process WBS Elements...");
        }
        this.busyDialog.open();

        // Get the OData V2 model
        var oModel = this.getOwnerComponent().getModel();

        // Verify we have a valid OData V2 model
        if (!oModel || !(oModel instanceof sap.ui.model.odata.v2.ODataModel)) {
          MessageBox.error("OData V2 model not available");
          this._closeBusyDialog();
          return;
        }

        // Configure batch processing with optimized settings
        var batchSize = 20; // Process 20 records per batch
        var totalBatches = Math.ceil(aRows.length / batchSize);

        // Save original deferred groups to restore later
        var originalDeferredGroups = oModel.getDeferredGroups();

        // Create new array with original groups plus our new batch groups
        var deferredGroups = [...originalDeferredGroups];
        for (var i = 0; i < totalBatches; i++) {
          deferredGroups.push("WBS_Create_Batch_" + i);
        }

        // Set deferred groups and configure model for batch mode
        oModel.setDeferredGroups(deferredGroups);
        oModel.setUseBatch(true);

        // First, collect all ProjectElement IDs that need to be fetched
        var projectElementIds = aRows.map(row => row.ProjectElement);
      
        // Build a filter string to fetch all entities in a single call
        // Example: "ProjectElement eq 'TASK_1' or ProjectElement eq 'TASK_2' or ..."
        var filterString = projectElementIds.map(id => `(ProjectElement eq '${id}')`).join(" or ");
    //    var entityPath = `/A_EnterpriseProjectElement?$filter=${filterString}`;
        var entityPath = `/A_EnterpriseProjectElement?${filterString}`;    
        console.log("Entity Path", entityPath);

        // Update busy dialog
        this.busyDialog.setText("Fetching existing WBS Elements...");

        // Perform a single read operation to fetch all entities
        console.log("Starting bulk read operation for all entities");
        oModel.read(entityPath, {
          success: (oData) => {
            console.log(`Read operation successful. Retrieved ${oData.results?.length || 0} entities.`);

            // Create a map of ProjectElement to ProjectElementUUID for quick lookups
            var uuidMap = {};
            // Also store the full entity data for each ProjectElement
            var entityMap = {};

            if (oData.results && oData.results.length > 0) {
              oData.results.forEach(entity => {
                uuidMap[entity.ProjectElement] = entity.ProjectElementUUID;
                entityMap[entity.ProjectElement] = entity;
              });
            }

            // Process all records and organize them into batches
            aRows.forEach((row, index) => {
              var batchIndex = Math.floor(index / batchSize);
              var groupId = "WBS_Create_Batch_" + batchIndex;
              var projectUuid = uuidMap[row.ProjectElement];

              if (projectUuid) {
                // Entity exists - perform UPDATE
                console.log(`Entity found for ${row.ProjectElement}. Proceeding with UPDATE.`);
                var updateUrl = `/A_EnterpriseProjectElement(guid'${projectUuid}')`;

                // Get the existing entity data
                var existingEntity = entityMap[row.ProjectElement];

                // Prepare payload with [NO CHANGE] handling
                var updatedPayload = this._prepareUpdatePayload(row, existingEntity);

                // Only perform update if there are fields to update
                if (Object.keys(updatedPayload).length > 0) {
                  console.log(`Updating ${row.ProjectElement} with payload:`, updatedPayload);

                  oModel.update(updateUrl, updatedPayload, {
                    groupId: groupId,
                    success: () => {
                      console.log(`Update queued for ${updateUrl}`);
                    },
                    error: (error) => {
                      console.error(`Error updating entity at ${updateUrl}:`, error);
                      this._handleOperationError(index, row, error);
                    }
                  });
                } else {
                  console.log(`No changes to update for ${row.ProjectElement}, skipping`);
                  // Count it as success since no update was needed
                  this._handleOperationSuccess(index);
                }
              } else {
                // Entity doesn't exist - perform CREATE
                console.log(`Entity not found for ${row.ProjectElement}. Queuing CREATE operation.`);

                // For creates, we need all values, so prepare the full payload
                var payload = this._prepareCreatePayload(row);

                oModel.create("/A_EnterpriseProjectElement", payload, {
                  groupId: groupId,
                  success: () => {
                    console.log(`Create operation queued for ${row.ProjectElement}`);
                  },
                  error: (error) => {
                    console.error(`Error creating entity for ${row.ProjectElement}:`, error);
                    this._handleOperationError(index, row, error);
                  }
                });
              }
            });

            // Start submitting batches
            this.busyDialog.setText(`Preparing to submit batches...`);
            this._submitWbsUpdateBatch(0, totalBatches, originalDeferredGroups, aRows);
          },
          error: (error) => {
            console.error("Error performing bulk read operation:", error);
            MessageBox.error("Failed to fetch existing WBS Elements. Please try again.");
            this._closeBusyDialog();
          }
        });
      },

      /**
 * Prepare payload for UPDATE operations, handling [NO CHANGE] markers and formatting fields
 * @param {Object} row Row data from import
 * @param {Object} existingEntity Existing entity data from OData
 * @returns {Object} Payload with only fields that should be updated
 */
      _prepareUpdatePayload: function (row, existingEntity) {
        var payload = {};

        // Process each field in the row
        Object.keys(row).forEach(key => {
          // Skip technical fields or fields not meant for the API
          if (key === "__metadata" || key.startsWith("__") || key.startsWith("Operation")) {
            return;
          }

          // Skip null or undefined values
          if (row[key] === null || row[key] === undefined) {
            return;
          }
          // Skip ProjectElement fields completely - never include them in the update payload
          if (key === "ProjectElement") {
            return;
          }
          // Handle special markers
          if (row[key] === "[NO CHANGE]") {
            // Skip this field, don't include in update payload
            return;
          } else if (row[key] === "[CLEAR]") {
            if (key === "WBSElementIsBillingElement") {
              payload[key] = false; // Set to false for WBSElementIsBillingElement
            } else {
              payload[key] = ""; // For other fields, treat as empty string
            }
          } else {
            // Handle specific data types according to OData V2 requirements
            if (key === "PlannedStartDate" || key === "PlannedEndDate") {
              if (row[key]) {
                // Ensure proper date formatting for OData V2
                payload[key] = this.formatDateToODataDate(row[key]);
              }
            } else if (key === "WBSElementIsBillingElement") {
              // Convert string indicator to boolean for OData
              payload[key] = row[key] === "X" || row[key] === true;
            } else if (typeof row[key] === "string") {
              // Trim string values and only include non-empty strings
              var trimmedValue = row[key].trim();
              if (trimmedValue) {
                payload[key] = trimmedValue;
              }
            } else {
              // Include all other non-empty values
              payload[key] = row[key];
            }
          }
        });

        return payload;
      },
      /**
       * Prepare payload for CREATE operations, ensuring all required fields are included
       * @param {Object} row Row data from import
       * @returns {Object} Complete payload for create operation
       */
      _prepareCreatePayload: function (row) {
        var payload = {};

        // For creates, we need all values except special markers
        Object.keys(row).forEach(key => {
          // Skip technical fields
          if (key === "__metadata" || key.startsWith("__")) {
            return;
          }

          // Skip null or undefined values
          if (row[key] === null || row[key] === undefined) {
            return;
          }

          // Handle special cases
          if (row[key] === "[NO CHANGE]" || row[key] === "[CLEAR]") {
            // For create operations, treat these markers as empty string, but handle WBSElementIsBillingElement as false       
            payload[key] = ""; // For other fields, treat as empty string
          } else {
            // Handle specific data types according to OData V2 requirements
            if (key === "PlannedStartDate" || key === "PlannedEndDate") {
              if (row[key]) {
                // Ensure proper date formatting for OData V2
                payload[key] = this.formatDateToODataDate(row[key]);
              }
            } else if (key === "WBSElementIsBillingElement") {
              // If no value or the value is "[CLEAR]", set as false
              if (row[key] === null || row[key] === undefined || row[key] === "[CLEAR]") {
                payload[key] = false;
              } else {
                // Convert string indicator to boolean for OData
                payload[key] = row[key] === "X" || row[key] === true;
              }
            } else if (typeof row[key] === "string") {
              // Trim string values and only include non-empty strings
              var trimmedValue = row[key].trim();
              if (trimmedValue) {
                payload[key] = trimmedValue;
              }
            } else {
              // Include all other non-empty values
              payload[key] = row[key];
            }
          }

        });

        return payload;
      },
      /**
       * Handle successful operation
       * @param {Number} index Index of the processed row
       */
      _handleOperationSuccess: function (index, oData) {
        this.successCount++;
        this._updateProgressIndicator();
      },

      /**
       * Handle operation error
       * @param {Number} index Index of the processed row
       * @param {Object} row Original row data
       * @param {Object} oError Error object from OData call
       */
      _handleOperationError: function (index, row, oError) {
        this.failureCount++;
        var errorMessage = this._extractErrorMessage(oError);
        this.failedRecords.push({
          rowNumber: index + 1,
          projectElement: row.ProjectElement || "",
          errorMessage: errorMessage
        });
        // Update the failed records model immediately so it's visible
        this._updateFailedRecordsModel();
        // Update progress
        this._updateProgressIndicator();
      },

      /**
       * Update the failed records model
       * This method should update the model that's bound to the failures table
       */
      _updateFailedRecordsModel: function () {
        // Create model if it doesn't exist
        if (!this._oFailedRecordsModel) {
          this._oFailedRecordsModel = new sap.ui.model.json.JSONModel({
            records: []
          });
          this.getView().setModel(this._oFailedRecordsModel, "failedRecords");
        }

        // Update the model with current failed records
        this._oFailedRecordsModel.setData({
          rows: this.failedRecords
        });

        // If there's a table or list to show failed records, make it visible
        var oFailedRecordsTable = this.byId("failedRecordsTable");
        if (oFailedRecordsTable) {
          oFailedRecordsTable.setVisible(this.failedRecords.length > 0);
        }
      },
      /**
       * Finalize the WBS Element update process
       */
      _finalizeWbsUpdate: function () {
        // Close busy dialog
        this._closeBusyDialog();

        // Update status message
        var oFileDataModel = this.getView().getModel("fileData");
        var statusMessage = `WBS Elements processed: ${this.totalRecords}, Success: ${this.successCount}, Failures: ${this.failureCount}`;
        oFileDataModel.setProperty("/statusMessage", statusMessage);

        // Final update of the failed records model to ensure it's current
        this._updateFailedRecordsModel();

        // Show completion message with appropriate icon and title based on results
        var dialogTitle =
          this.failureCount === 0
            ? "Update Completed Successfully"
            : "Update Completed with Issues";
        var dialogIcon =
          this.failureCount === 0
            ? MessageBox.Icon.SUCCESS
            : MessageBox.Icon.INFORMATION;

        MessageBox.show(
          `WBS Element update complete.\nSuccess: ${this.successCount}\nFailures: ${this.failureCount}`,
          {
            icon: dialogIcon,
            title: dialogTitle,
            actions: [MessageBox.Action.OK],
            details: this.failedRecords.length
              ? JSON.stringify(this.failedRecords, null, 2)
              : "No errors",
            onClose: function () {
              // If there are failures, make sure the failures tab is visible and selected
              if (this.failedRecords.length > 0) {
                var oIconTabBar = this.getView().byId("idIconTabBar");
                if (oIconTabBar) {
                  // Make sure the failures tab is visible
                  var oFailuresTab = oIconTabBar
                    .getItems()
                    .find(function (item) {
                      return item.getKey() === "failuresTab";
                    });

                  if (oFailuresTab) {
                    oFailuresTab.setVisible(true);
                    oIconTabBar.setSelectedKey("failuresTab");
                  }
                }

                // Ensure the failures table is updated and visible
                var oFailuresTable = this.getView().byId("failuresTable");
                if (oFailuresTable) {
                  // Force rebind if necessary
                  if (oFailuresTable.getBinding("items")) {
                    oFailuresTable.getBinding("items").refresh(true);
                  }
                  oFailuresTable.setVisible(true);
                }
              }
            }.bind(this)
          }
        );

        // Reset file upload state
        oFileDataModel.setProperty("/isFileUploaded", false);

        // Reset other UI elements as needed
        this.byId("updateWBSButton").setEnabled(false);

        // Reset the flag after clearing data
        this.bFailedRecordsReviewed = false;
      },
      /**
       * Update progress indicator (if it exists in the view)
       */
      _updateProgressIndicator: function () {
        // Calculate progress percentage
        var progress =
          ((this.successCount + this.failureCount) / this.totalRecords) * 100;

        // Update progress text in busy dialog
        if (this.busyDialog) {
          var statusText = `Processed: ${this.successCount + this.failureCount} of ${this.totalRecords}`;
          if (this.failureCount > 0) {
            statusText += ` (${this.failureCount} failures)`;
          }
          this.busyDialog.setText(statusText);
        }

        // If there's a progress bar in the view, update it
        var oProgressIndicator = this.getView().byId("uploadProgress");
        if (oProgressIndicator) {
          oProgressIndicator.setPercentValue(progress);
          oProgressIndicator.setDisplayValue(progress.toFixed(0) + "%");
        }
      },
      /**
       * Extract user-friendly error message from OData error response
       * @param {Object} oError Error object from OData call
       * @returns {String} Formatted error message
       */
      /**
       * Extract user-friendly error message from OData error response
       * @param {Object} oError Error object from OData call
       * @returns {String} Formatted error message
       */
      _extractErrorMessage: function (oError) {
        try {
          // Check if there's a detailed error response in the body
          if (oError.responseText) {
            try {
              // Parse JSON response
              var errorResponse = JSON.parse(oError.responseText);

              // Navigate OData V2 error structure
              if (errorResponse.error) {
                // Get message from standard OData V2 error format
                if (
                  errorResponse.error.message &&
                  errorResponse.error.message.value
                ) {
                  return errorResponse.error.message.value;
                } else if (errorResponse.error.message) {
                  return errorResponse.error.message;
                }

                // Check for inner error details
                if (errorResponse.error.innererror) {
                  if (
                    errorResponse.error.innererror.errordetails &&
                    errorResponse.error.innererror.errordetails.length > 0
                  ) {
                    // Get the first detailed error message
                    return (
                      errorResponse.error.innererror.errordetails[0].message ||
                      errorResponse.error.innererror.message
                    );
                  }
                  return (
                    errorResponse.error.innererror.message ||
                    "Inner error occurred"
                  );
                }
              }

              // Check SAP specific error format
              if (errorResponse.d && errorResponse.d.ErrorMessage) {
                return errorResponse.d.ErrorMessage;
              }
            } catch (parseError) {
              // If response isn't valid JSON, try to extract message from text
              if (oError.responseText.indexOf("<message>") > -1) {
                // Extract message from XML response
                var messageStart = oError.responseText.indexOf("<message>") + 9;
                var messageEnd = oError.responseText.indexOf("</message>");
                if (messageStart > 8 && messageEnd > messageStart) {
                  return oError.responseText.substring(
                    messageStart,
                    messageEnd
                  );
                }
              }
            }
          }

          // Check other properties where error messages might be found
          if (oError.response) {
            try {
              // Try to parse the response body
              var oErrorResponse = JSON.parse(oError.response.body);

              // Navigate the OData V2 error structure
              if (oErrorResponse.error && oErrorResponse.error.message) {
                return (
                  oErrorResponse.error.message.value ||
                  oErrorResponse.error.message
                );
              } else if (
                oErrorResponse.error &&
                oErrorResponse.error.innererror
              ) {
                return (
                  oErrorResponse.error.innererror.message ||
                  "Inner error occurred"
                );
              }
            } catch (e) {
              // If not valid JSON, try to get message from raw body
              if (oError.response.body) {
                return oError.response.body;
              }
            }
          }

          // Check for a status text
          if (oError.statusText) {
            return oError.statusText;
          }

          // Check for a message property
          if (oError.message) {
            return oError.message;
          }

          // Fallback to generic error message with status code if available
          return (
            "Error " +
            (oError.statusCode || "") +
            ": " +
            (oError.statusText || "Unknown error occurred")
          );
        } catch (e) {
          // Final fallback if everything else fails
          return (
            "Failed to extract error details: " + (e.message || "Unknown error")
          );
        }
      },


      _submitWbsUpdateBatch: function (
        batchIndex,
        totalBatches,
        originalDeferredGroups,
        aRows
      ) {
        if (batchIndex >= totalBatches) {
          // Restore original deferred groups when finished
          var oModel = this.getOwnerComponent().getModel();
          oModel.setDeferredGroups(originalDeferredGroups);

          this._finalizeWbsUpdate();
          return;
        }

        var groupId = "WBS_Create_Batch_" + batchIndex;
        this.busyDialog.setText(
          `Processing batch ${batchIndex + 1} of ${totalBatches}...`
        );

        // Calculate which rows are in this batch
        var batchSize = 20; // Should match the batchSize in _processWbsElementUpdate
        var startIndex = batchIndex * batchSize;
        var endIndex = Math.min(startIndex + batchSize, aRows.length);
        var currentBatchRows = aRows.slice(startIndex, endIndex);

        var oModel = this.getOwnerComponent().getModel();
        oModel.submitChanges({
          groupId: groupId,
          success: (oData) => {
            // Process batch success - mark all items in this batch as successful
            if (oData && oData.__batchResponses) {
              oData.__batchResponses.forEach((batchResponse, i) => {
                // If the batch has changesets, process each changeset
                if (batchResponse.__changeResponses) {
                  batchResponse.__changeResponses.forEach((changeResponse, j) => {
                    if (changeResponse.statusCode >= 200 && changeResponse.statusCode < 300) {
                      // Success response
                      var rowIndex = startIndex + j;
                      if (rowIndex < aRows.length) {
                        this._handleOperationSuccess(rowIndex, changeResponse.data);
                      }
                    } else {
                      // Error response within a successful batch
                      var rowIndex = startIndex + j;
                      if (rowIndex < aRows.length) {
                        console.log(rowIndex, aRows[rowIndex]);
                        this._handleOperationError(rowIndex, aRows[rowIndex], {
                          message: "Operation failed with status: " + changeResponse.statusCode
                        });
                      }
                    }
                  });
                }
              });
            } else {
              // If batch structure is unclear, mark all as successful
              currentBatchRows.forEach((row, i) => {
                this._handleOperationSuccess(startIndex + i, null);
              });
            }

            // Process next batch
            this._submitWbsUpdateBatch(
              batchIndex + 1,
              totalBatches,
              originalDeferredGroups,
              aRows
            );
          },
          error: (oError) => {
            // Log batch-level error
            console.error("Batch processing error:", oError);

            // Mark all items in this batch as failed
            currentBatchRows.forEach((row, i) => {
              this._handleOperationError(startIndex + i, row, oError);
            });

            // Continue with next batch even if this one failed
            this._submitWbsUpdateBatch(
              batchIndex + 1,
              totalBatches,
              originalDeferredGroups,
              aRows
            );
          }
        });
      },
      get submitWbsUpdateBatch() {
        return this._submitWbsUpdateBatch;
      },
      set submitWbsUpdateBatch(value) {
        this._submitWbsUpdateBatch = value;
      },

      /**
       * Format date for OData V2 compatibility
       * @param {String|Date} date Date to format
       * @returns {String} OData V2 formatted date
       */
      formatDateToODataDate: function (date) {
        if (!date) {
          return null;
        }

        var dateObj;
        if (date instanceof Date) {
          dateObj = date;
        } else {
          // Handle various string formats
          dateObj = new Date(date);

          // Validate the date is valid
          if (isNaN(dateObj.getTime())) {
            return null;
          }
        }

        // Format as yyyy-MM-ddT00:00:00
        var yyyy = dateObj.getFullYear();
        var MM = String(dateObj.getMonth() + 1).padStart(2, "0");
        var dd = String(dateObj.getDate()).padStart(2, "0");

        return `${yyyy}-${MM}-${dd}T00:00:00`;
      },

      /**
       * Finalize the WBS Element update process
       */
      /**
  * Finalize the WBS update process
  * Display results and error logs
  */
      _finalizeWbsUpdate: function () {
        this._closeBusyDialog();

        // Display results in a message box
        if (this.failureCount === 0) {
          MessageBox.success(`Successfully processed all ${this.totalRecords} WBS Elements.`);
        } else {
          MessageBox.warning(
            `Processed ${this.totalRecords} WBS Elements.\n` +
            `Success: ${this.successCount}\n` +
            `Failed: ${this.failureCount}\n\n` +
            `See the error log for details.`
          );

          // Update the failed records model
          this._updateFailedRecordsModel();
        }
      },
      /**
       * Navigate to failures tab/section
       * Adding this method to prevent errors in case it's called elsewhere
       */
      _showFailuresTab: function () {
        // Try to find and select the failures tab or section if it exists
        var oIconTabBar = this.getView().byId("idIconTabBar");
        if (oIconTabBar) {
          // Select the failures tab (assuming "failuresTab" is the key)
          var failuresTabKey = "failuresTab";
          oIconTabBar.setSelectedKey(failuresTabKey);
        }

        // Scroll to the failures table if it exists
        var oFailuresTable = this.getView().byId("failuresTable");
        if (oFailuresTable) {
          oFailuresTable.focus();
        }
      },
      /**
       * Navigate back (close the application)
       */
      onNavBack: function () {
        // Handle closing or navigating back
        // If embedded in SAP Fiori Launchpad, use the following:
        var oCrossAppNavigator =
          sap.ushell &&
          sap.ushell.Container &&
          sap.ushell.Container.getService("CrossApplicationNavigation");

        if (oCrossAppNavigator) {
          oCrossAppNavigator.toExternal({
            target: { shellHash: "#Shell-home" }
          });
        } else {
          // Standalone application
          window.history.go(-1);
        }
      },

      /**
       * Open busy dialog
       */
      _openBusyDialog: function () {
        if (!this.busyDialog) {
          this.busyDialog = new sap.m.BusyDialog({
            title: "Processing",
            text: "Processing...",
            showCancelButton: false
          });
        }
        this.busyDialog.open();
      },

      /**
       * Close busy dialog
       */
      _closeBusyDialog: function () {
        if (this.busyDialog) {
          this.busyDialog.close();
        }
      }
    });
  }
);
