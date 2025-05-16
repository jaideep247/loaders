sap.ui.define(
  [
    "sap/ui/model/json/JSONModel",
    "sap/ui/Device"
  ],
  function (JSONModel, Device) {
    "use strict";

    return {
      /**
       * Creates and returns a device model
       * @returns {sap.ui.model.json.JSONModel} Device model
       */
      createDeviceModel: function () {
        var oModel = new JSONModel(Device);
        oModel.setDefaultBindingMode("OneWay");
        return oModel;
      },

      /**
       * Creates a new JSON model with fixed asset retirement data structure
       * @returns {sap.ui.model.json.JSONModel} JSON model for fixed asset retirement data
       */
      createFixedAssetModel: function () {
        return new JSONModel({
          CompanyCode: "1000",
          BusinessTransactionType: "RA21",
          MasterFixedAsset: "",
          FixedAsset: "",
          DocumentDate: new Date(),
          PostingDate: new Date(),
          AssetValueDate: new Date(),
          FixedAssetRetirementType: "1",
          ReferenceDocumentItem: "",
          DocumentReferenceID: "",
          FxdAstRtrmtRevnTransCrcy: "USD",
          AstRtrmtAmtInTransCrcy: "0.00",
          FxdAstRtrmtQuantityInBaseUnit: "1",
          BaseUnitSAPCode: "EA",
          BaseUnitISOCode: "EA",
          AccountingDocumentType: "SA",
          AssignmentReference: "",
          DocumentItemText: ""
        });
      },

      /**
       * Creates a model for retirement types
       * @returns {sap.ui.model.json.JSONModel} JSON model for retirement types
       */
      createRetirementTypeModel: function () {
        return new JSONModel([
          { key: "1", text: "Sale" },
          { key: "2", text: "Scrapping" },
          { key: "3", text: "No Revenue" },
          { key: "4", text: "Transfer" },
          { key: "5", text: "Other" }
        ]);
      },

      /**
       * Creates a model for business transaction types for retirement
       * @returns {sap.ui.model.json.JSONModel} JSON model for business transaction types
       */
      createBusinessTransactionTypeModel: function () {
        return new JSONModel([
          { key: "RA20", text: "Retirement with Customer" },
          { key: "RA21", text: "Retirement without Customer" },
          { key: "RA22", text: "Retirement by Scrapping" },
          { key: "RA24", text: "Retirement by Transfer" }
        ]);
      },

      /**
       * Creates a model for filter display
       * @returns {sap.ui.model.json.JSONModel} JSON model for filter display
       */
      createFilterModel: function () {
        return new JSONModel({
          dateRangeFrom: null,
          dateRangeTo: null,
          postingDateFrom: null,
          postingDateTo: null,
          assetValueDateFrom: null,
          assetValueDateTo: null,
          amountFrom: null,
          amountTo: null
        });
      }
    };
  }
);