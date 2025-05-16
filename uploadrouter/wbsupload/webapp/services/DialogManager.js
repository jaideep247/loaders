sap.ui.define([
    "sap/m/Dialog",
    "sap/m/Button",
    "sap/m/Text",
    "sap/m/Label",
    "sap/m/VBox",
    "sap/ui/layout/form/SimpleForm",
    "sap/ui/model/json/JSONModel"
  ], function (Dialog, Button, Text, Label, VBox, SimpleForm, JSONModel) {
    "use strict";
  
    var DialogManager = function (oController) {
      this.oController = oController;
      this._oDetailDialog = null;
      this._oErrorDialog = null;
      this._oATMDialog = null;
    };
  
    DialogManager.prototype = {
      constructor: DialogManager,
      /**
       * Show WBS Element detail dialog
       */
      showDetailDialog: function (oData) {
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
  
          this.oController.getView().addDependent(this._oDetailDialog);
        }
  
        // Set model data
        var oModel = new JSONModel(oData);
        this._oDetailDialog.setModel(oModel, "detail");
  
        // Open dialog
        this._oDetailDialog.open();
      },
  
      /**
       * Show Error detail dialog
       */
      showErrorDialog: function (oData) {
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
  
          this.oController.getView().addDependent(this._oErrorDialog);
        }
  
        // Set model data
        var oModel = new JSONModel(oData);
        this._oErrorDialog.setModel(oModel, "error");
  
        // Open dialog
        this._oErrorDialog.open();
      },
  
      /**
       * View ATM Details
       */
      showATMDialog: function (oData) {
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
  
                new Label({ text: "Bank Load ATM Discount" }),
                new Text({ text: "{atm>/YY1_BankLoadATMDiscoun_PTD}" }),
  
                new Label({ text: "ERP Relocation Reference ATM ID" }),
                new Text({ text: "{atm>/YY1_ERPRelocationRefAT_PTD}" }),
  
                new Label({ text: "ERP Site ID Report" }),
                new Text({ text: "{atm>/YY1_ERPsiteIDReport_PTD}" }),
  
                new Label({ text: "UDF-1" }),
                new Text({ text: "{atm>/YY1_UDF3_PTD}" }),
  
                new Label({ text: "Categorization" }),
                new Text({ text: "{atm>/YY1_Categorization_PTD}" }),
  
                new Label({ text: "Actual start date" }),
                new Text({ text: "{atm>/YY1_UDF1_PTD}" }),
  
                new Label({ text: "Postal code" }),
                new Text({ text: "{atm>/YY1_Postalcode_PTD}" }),
  
                new Label({ text: "Actual end date" }),
                new Text({ text: "{atm>/YY1_UDF2_PTD}" }),
  
                new Label({ text: "ERP Relocation Reference Site ID" }),
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
  
          this.oController.getView().addDependent(this._oATMDialog);
        }
  
        // Set model data
        var oModel = new JSONModel(oData);
        this._oATMDialog.setModel(oModel, "atm");
  
        // Open dialog
        this._oATMDialog.open();
      }
    };
  
    return DialogManager;
  });