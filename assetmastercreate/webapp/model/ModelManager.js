sap.ui.define([
  "sap/ui/base/Object",
  "sap/ui/model/json/JSONModel",
  "sap/ui/export/library",
  "sap/ui/core/library",
  "assetmastercreate/model/models"
], function (BaseObject, JSONModel, exportLibrary, coreLibrary, models) {
  "use strict";

  const EdmType = exportLibrary.EdmType;
  const ValueState = coreLibrary.ValueState;

  return BaseObject.extend("assetmastercreate.model.ModelManager", {
    /**
     * Constructor for ModelManager
     * @param {sap.ui.core.mvc.Controller} oController - Reference to the controller
     */
    constructor: function (oController) {
      BaseObject.call(this);
      this._controller = oController;
      this._view = oController.getView();
    },

    /**
     * Initialize all application models
     */
    initializeModels: function () {
      this._initUploadSummaryModel();
      this._initUserModel();
      this._initStatusFilterModel();
      this._initAssetMasterModel();
      this._initBatchDisplayModel();

      // Get Asset Master document model from models module
      const oAssetMasterCreateModel = this.createAssetMasterCreate();
      this._view.setModel(oAssetMasterCreateModel);

      console.log("Models initialized successfully");
    },

    /**
     * Reset all models to their initial state
     */
    resetModels: function () {
      this._resetUploadSummaryModel();
      this._resetassetMasterModel();
      this._resetBatchDisplayModel();
    },

    /**
     * Initialize upload summary model
     * @private
     */
    _initUploadSummaryModel: function () {
      const oUploadSummaryModel = new JSONModel({
        TotalEntries: 0,
        SuccessfulEntries: 0,
        FailedEntries: 0,
        ValidationErrors: [],
        IsSubmitEnabled: false,
        HasBeenSubmitted: true,
        LastUploadDate: null,
        ProcessingComplete: false,
        isSubmitting: false,
        uploadProgress: 0
      });
      this._view.setModel(oUploadSummaryModel, "uploadSummary");
    },

    /**
     * Initialize user model
     * @private
     */
    _initUserModel: function () {
      const oUserModel = new JSONModel({
        id: "",
        email: "",
        fullName: "",
        displayName: ""
      });
      this._view.setModel(oUserModel, "userInfo");
    },

    /**
     * Initialize status filter model
     * @private
     */
    _initStatusFilterModel: function () {
      const oStatusModel = new JSONModel([
        { key: "all", text: "All" },
        { key: "valid", text: "Valid" },
        { key: "invalid", text: "Invalid" }
      ]);
      this._view.setModel(oStatusModel, "statusModel");
    },

    /**
     * Initialize Asset Master documents model
     * @private
     */
    _initAssetMasterModel: function () {
      const assetMasterModel = new JSONModel({
        entries: [],
        validationStatus: "Pending",
        filteredCount: 0
      });
      this._view.setModel(assetMasterModel, "assetMasterEntries");

      // Store a reference to make it accessible to the controller if needed
      this.assetMasterModel = assetMasterModel;
    },

    /**
     * Initialize batch display model
     * @private
     */
    _initBatchDisplayModel: function () {
      const batchDisplayModel = new JSONModel({
        visible: false,
        status: "Waiting",
        currentBatch: 0,
        totalBatches: 0,
        processedItems: 0,
        totalItems: 0,
        progressPercentage: 0,
        remainingTime: "Calculating...",
        errors: []
      });
      this._view.setModel(batchDisplayModel, "batchDisplay");
    },

    /**
     * Reset upload summary model
     * @private
     */
    _resetUploadSummaryModel: function () {
      const oModel = this._view.getModel("uploadSummary");
      if (oModel) {
        oModel.setData({
          TotalEntries: 0,
          SuccessfulEntries: 0,
          FailedEntries: 0,
          ValidationErrors: [],
          IsSubmitEnabled: false,
          HasBeenSubmitted: true,
          LastUploadDate: null,
          ProcessingComplete: false,
          isSubmitting: false,
          uploadProgress: 0
        });
      }
    },

    /**
     * Reset Asset Master documents model
     * @private
     */
    _resetassetMasterModel: function () {
      // Use "assetMasterEntries" as model name to match the view binding
      const oModel = this._view.getModel("assetMasterEntries");
      if (oModel) {
        oModel.setData({
          entries: [], // Empty entries array will trigger the "no data" text
          validationStatus: "Pending",
          filteredCount: 0
        });
      }
    },

    /**
     * Reset batch display model
     * @private
     */
    _resetBatchDisplayModel: function () {
      const oModel = this._view.getModel("batchDisplay");
      if (oModel) {
        oModel.setData({
          visible: false,
          status: "Waiting",
          currentBatch: 0,
          totalBatches: 0,
          processedItems: 0,
          totalItems: 0,
          progressPercentage: 0,
          remainingTime: "Calculating...",
          errors: []
        });
      }
    },

    /**
     * Load user information from API
     * @param {string} baseUrl - Base URL for API calls
     */
    loadUserInfo: function (baseUrl) {
      const url = baseUrl + "/user-api/currentUser";
      const oModel = new JSONModel();
      const mockData = {
        firstname: "Dummy",
        lastname: "User",
        email: "dummy.user@com",
        name: "dummy.user@com",
        displayName: "Dummy User (dummy.user@com)"
      };

      oModel.loadData(url);
      oModel.dataLoaded()
        .then(() => {
          if (!oModel.getData().email) {
            oModel.setData(mockData);
          }
          this._view.setModel(oModel, "userInfo");
        })
        .catch(() => {
          oModel.setData(mockData);
          this._view.setModel(oModel, "userInfo");
        });
    },
    /**
     * Creates a new Asset Master document model with default structure
     * @returns {sap.ui.model.json.JSONModel} JSON model for Asset Master document data
     */
    createAssetMasterModel: function () {
      return new JSONModel({
        entries: [], // Array to hold asset entries
        validationStatus: "Pending",
        filteredCount: 0,
        defaultTemplate: {
          // Basic Information
          SequenceNumber: "",
          CompanyCode: "",
          AssetClass: "",
          AssetIsForPostCapitalization: false,

          // General Data
          FixedAssetDescription: "",
          AssetAdditionalDescription: "",
          AssetSerialNumber: "",
          BaseUnit: "",
          InventoryNote: "",

          // Account Assignment
          YY1_WBS_ELEMENT: "", // Custom field for WBS Element
          Room: "",

          // Ledger Information
          LedgerInformation: [
            { Ledger: "0L", AssetCapitalizationDate: "" },
            { Ledger: "2L", AssetCapitalizationDate: "" },
            { Ledger: "3L", AssetCapitalizationDate: "" }
          ],

          // Depreciation Areas
          Valuation: [
            { AssetDepreciationArea: "01", NegativeAmountIsAllowed: false, DepreciationStartDate: "" },
            { AssetDepreciationArea: "15", NegativeAmountIsAllowed: false, DepreciationStartDate: "" },
            { AssetDepreciationArea: "32", NegativeAmountIsAllowed: false, DepreciationStartDate: "" },
            { AssetDepreciationArea: "34", NegativeAmountIsAllowed: false, DepreciationStartDate: "" }
          ],

          // Time-Based Valuation
          TimeBasedValuation: [
            {
              AssetDepreciationArea: "01",
              DepreciationKey: "",
              PlannedUsefulLifeInYears: 0,
              PlannedUsefulLifeInPeriods: 0,
              ScrapAmountInCoCodeCrcy: 0,
              CurrencyCode: "INR",
              AcqnProdnCostScrapPercent: 0
            },
            {
              AssetDepreciationArea: "15",
              DepreciationKey: "",
              PlannedUsefulLifeInYears: 0,
              PlannedUsefulLifeInPeriods: 0,
              ScrapAmountInCoCodeCrcy: 0,
              CurrencyCode: "INR",
              AcqnProdnCostScrapPercent: 0
            },
            {
              AssetDepreciationArea: "32",
              DepreciationKey: "",
              PlannedUsefulLifeInYears: 0,
              PlannedUsefulLifeInPeriods: 0,
              ScrapAmountInCoCodeCrcy: 0,
              CurrencyCode: "INR",
              AcqnProdnCostScrapPercent: 0
            },
            {
              AssetDepreciationArea: "34",
              DepreciationKey: "",
              PlannedUsefulLifeInYears: 0,
              PlannedUsefulLifeInPeriods: 0,
              ScrapAmountInCoCodeCrcy: 0,
              CurrencyCode: "INR",
              AcqnProdnCostScrapPercent: 0
            }
          ],

          // Asset Block Data (India-specific)
          GLO_MasterData: {
            IN_AssetBlockData: {
              IN_AssetBlock: "",
              IN_AssetPutToUseDate: "",
              IN_AssetIsPriorYear: false
            }
          },

          // Status fields for UI handling
          Status: "Pending",
          ValidationMessages: []
        }
      });
    },
    /**
     * Get model by name
     * @param {string} modelName - Model name
     * @returns {sap.ui.model.Model} Model instance
     */
    getModel: function (modelName) {
      return this._view.getModel(modelName);
    },

    /**
     * Update upload summary with validation results
     * @param {object} validationResults - Validation results
     */
    updateUploadSummary: function (validationResults) {
      const oModel = this._view.getModel("uploadSummary");
      if (oModel && validationResults) {
        oModel.setProperty("/TotalEntries", validationResults.entries ? validationResults.entries.length : 0);
        oModel.setProperty("/SuccessfulEntries", validationResults.validCount || 0);
        oModel.setProperty("/FailedEntries", validationResults.errorCount || 0);
        oModel.setProperty("/ValidationErrors", validationResults.errors || []);
        oModel.setProperty("/IsSubmitEnabled", validationResults.isValid);
        oModel.setProperty("/LastUploadDate", new Date());
      }
    },
    /**
 * Update asset master model with validation results
 * @param {object} validationResults - Validation results
 */
    updateAssetMasterEntries: function (entries, validationStatus = "Pending") {
      // Use "assetMasterEntries" as model name to match the view binding
      const oModel = this._view.getModel("assetMasterEntries");
      if (oModel) {
        oModel.setProperty("/entries", entries || []);
        oModel.setProperty("/validationStatus", validationStatus);
        oModel.setProperty("/filteredCount", entries ? entries.length : 0);
      }
    },
    /**
     * Update batch processing progress
     * @param {object} progressData - Progress data
     */
    updateBatchProgress: function (progressData) {
      const oModel = this._view.getModel("batchDisplay");
      if (oModel && progressData) {
        oModel.setData(progressData);
      }
    },
    /**
* Reset all models to their initial state
*/
    resetModels: function () {
      console.log("Resetting all models to initial state");

      this._resetUploadSummaryModel();
      this._resetAssetMasterModel();
      this._resetBatchDisplayModel();

      // Reset any other models that might have state
      this._resetFilterModel();

      console.log("All models reset successfully");
    },

    /**
    * Reset filter model to initial state
    * @private
    */
    _resetFilterModel: function () {
      const oModel = this._view.getModel("filterModel");
      if (oModel) {
        oModel.setData({
          companyCode: "",
          assetClass: "",
          description: "",
          wbsElement: "",
          status: "all"
        });
      }
    },

    /**
    * Reset upload summary model to initial state
    * @private
    */
    _resetUploadSummaryModel: function () {
      const oModel = this._view.getModel("uploadSummary");
      if (oModel) {
        oModel.setData({
          TotalEntries: 0,
          SuccessfulEntries: 0,
          FailedEntries: 0,
          ValidationErrors: [],
          IsSubmitEnabled: false,
          HasBeenSubmitted: true,
          LastUploadDate: null,
          ProcessingComplete: false,
          isSubmitting: false,
          uploadProgress: 0
        });
      }
    },

    /**
    * Reset Asset Master documents model
    * @private
    */
    _resetAssetMasterModel: function () {
      const oModel = this._view.getModel("assetMasterEntries");
      if (oModel) {
        oModel.setData({
          entries: [],
          validationStatus: "Pending",
          filteredCount: 0
        });
      }
    },

    /**
    * Reset batch display model
    * @private
    */
    _resetBatchDisplayModel: function () {
      const oModel = this._view.getModel("batchDisplay");
      if (oModel) {
        oModel.setData({
          visible: false,
          status: "Waiting",
          currentBatch: 0,
          totalBatches: 0,
          processedItems: 0,
          totalItems: 0,
          progressPercentage: 0,
          remainingTime: "Calculating...",
          errors: []
        });
      }
    },
  });
});