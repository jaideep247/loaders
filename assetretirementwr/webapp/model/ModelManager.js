sap.ui.define([
  "sap/ui/base/Object",
  "sap/ui/model/json/JSONModel",
  "sap/ui/export/library",
  "sap/ui/core/library",
  "assetretirementwr/model/models"
], function (BaseObject, JSONModel, exportLibrary, coreLibrary, models) {
  "use strict";

  const EdmType = exportLibrary.EdmType;
  const ValueState = coreLibrary.ValueState;

  return BaseObject.extend("assetretirementwr.model.ModelManager", {
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
      this._initFixedAssetRetirementModel();
      this._initBatchDisplayModel();
      this._initRetirementTypeModel();
      this._initRevenueCurrencyModel();
      this._initRevenueCurrencyRoleModel();
      this._initRetirementRevenueTypeModel();

      console.log("Retirement models initialized successfully");
    },

    /**
     * Reset all models to their initial state
     */
    resetModels: function () {
      this._resetUploadSummaryModel();
      this._resetFixedAssetRetirementModel();
      this._resetBatchDisplayModel();
      this._initStatusFilterModel();
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
        { key: "All", text: "All" },
        { key: "Valid", text: "Valid" },
        { key: "Invalid", text: "Invalid" }
      ]);
      this._view.setModel(oStatusModel, "statusModel");
    },

    /**
     * Initialize retirement type model
     * @private
     */
    _initRetirementTypeModel: function () {
      const oRetirementTypeModel = new JSONModel([
        { key: "1", text: "Complete Retirement" },
        { key: "2", text: "Partial Retirement" }
      ]);
      this._view.setModel(oRetirementTypeModel, "retirementTypeModel");
    },

    /**
     * Initialize retirement revenue type model
     * @private
     */
    _initRetirementRevenueTypeModel: function () {
      const oRevenueTypeModel = new JSONModel([
        { key: "1", text: "Standard Revenue" },
        { key: "2", text: "Sale Revenue" },
        { key: "3", text: "Insurance Revenue" }
      ]);
      this._view.setModel(oRevenueTypeModel, "revenueTypeModel");
    },

    /**
     * Initialize revenue currency model
     * @private
     */
    _initRevenueCurrencyModel: function () {
      const oCurrencyModel = new JSONModel([
        { key: "INR", text: "Indian Rupee (INR)" },
        { key: "USD", text: "US Dollar (USD)" },
        { key: "EUR", text: "Euro (EUR)" },
        { key: "GBP", text: "British Pound (GBP)" },
        { key: "JPY", text: "Japanese Yen (JPY)" },
        { key: "CAD", text: "Canadian Dollar (CAD)" },
        { key: "AUD", text: "Australian Dollar (AUD)" },
        { key: "CHF", text: "Swiss Franc (CHF)" }
      ]);
      this._view.setModel(oCurrencyModel, "currencyModel");
    },

    /**
     * Initialize revenue currency role model
     * @private
     */
    _initRevenueCurrencyRoleModel: function () {
      const oCurrencyRoleModel = new JSONModel([
        { key: "10", text: "Transaction Currency (10)" },
        { key: "20", text: "Reference Currency (20)" },
        { key: "30", text: "Group Currency (30)" }
      ]);
      this._view.setModel(oCurrencyRoleModel, "currencyRoleModel");
    },

    /**
     * Initialize fixed asset retirement entries model
     * @private
     */
    _initFixedAssetRetirementModel: function () {
      const fixedAssetRetirementModel = new JSONModel({
        entries: [],
        validationStatus: "Pending",
        filteredCount: 0,
        // Add template entry with all required fields for new entries
        templateEntry: {
          SequenceID: "",
          ReferenceDocumentItem: "",
          BusinessTransactionType: "RA20", // Default to retirement with revenue
          CompanyCode: "",
          MasterFixedAsset: "",
          FixedAsset: "",
          DocumentDate: new Date(),
          PostingDate: new Date(),
          AssetValueDate: new Date(),
          FxdAstRetirementRevenueType: "1", // Default revenue type
          AstRevenueAmountInTransCrcy: "0.00",
          FxdAstRtrmtRevnTransCrcy: "INR", // Default currency
          FxdAstRtrmtRevnCurrencyRole: "10", // Default role
          FixedAssetRetirementType: "1",
          DocumentReferenceID: "",
          AccountingDocumentHeaderText: "",
          BaseUnitSAPCode: "EA",
          BaseUnitISOCode: "EA",
          AccountingDocumentType: "",
          AssignmentReference: "",
          DocumentItemText: "",
          Status: "Valid",
          ValidationErrors: []
        }
      });
      this._view.setModel(fixedAssetRetirementModel, "fixedAssetEntries");

      // Store a reference to make it accessible to the controller if needed
      this.fixedAssetRetirementModel = fixedAssetRetirementModel;
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
     * Reset fixed asset retirement entries model
     * @private
     */
    _resetFixedAssetRetirementModel: function () {
      const oModel = this._view.getModel("fixedAssetEntries");
      if (oModel) {
        // Preserve the templateEntry when resetting
        const templateEntry = oModel.getProperty("/templateEntry");
        oModel.setData({
          entries: [],
          validationStatus: "Pending",
          filteredCount: 0,
          templateEntry: templateEntry
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
     * Get model by name
     * @param {string} modelName - Model name
     * @returns {sap.ui.model.Model} Model instance
     */
    getModel: function (modelName) {
      return this._view.getModel(modelName);
    },

    /**
     * Update fixed asset retirement entries model with new entries
     * @param {Array} entries - Fixed asset retirement entries
     * @param {string} validationStatus - Validation status
     */
    updateFixedAssetRetirement: function (entries, validationStatus = "Pending") {
      const oModel = this._view.getModel("fixedAssetEntries");
      if (oModel) {
        // Make sure entries have all required fields
        const completeEntries = this._ensureAllFields(entries || []);
        oModel.setProperty("/entries", completeEntries);
        oModel.setProperty("/validationStatus", validationStatus);
        oModel.setProperty("/filteredCount", completeEntries.length);
      }
    },

    /**
     * Ensure all required fields exist on entries
     * @param {Array} entries - Entries to check and complete
     * @returns {Array} Completed entries
     * @private
     */
    _ensureAllFields: function(entries) {
      // Get template entry with defaults
      const templateEntry = this.getModel("fixedAssetEntries").getProperty("/templateEntry");
      
      // Ensure all entries have all required fields
      return entries.map(entry => {
        // Create new entry with template defaults and override with actual values
        return {
          ...templateEntry,
          ...entry,
          // Preserve Status and ValidationErrors
          Status: entry.Status || templateEntry.Status,
          ValidationErrors: entry.ValidationErrors || []
        };
      });
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
     * Enable/disable submit button in upload summary
     * @param {boolean} isEnabled - Whether to enable the submit button
     */
    setSubmitEnabled: function (isEnabled) {
      const oModel = this._view.getModel("uploadSummary");
      if (oModel) {
        oModel.setProperty("/IsSubmitEnabled", isEnabled);
      }
    },

    /**
     * Update upload progress percentage
     * @param {number} progress - Progress percentage (0-100)
     */
    updateUploadProgress: function (progress) {
      const oModel = this._view.getModel("uploadSummary");
      if (oModel) {
        oModel.setProperty("/uploadProgress", progress);
      }
    },

    /**
     * Create a new empty retirement entry with default values
     * @returns {Object} New retirement entry with default values
     */
    createNewRetirementEntry: function() {
      const templateEntry = this.getModel("fixedAssetEntries").getProperty("/templateEntry");
      // Create a deep copy to avoid modifying the template
      return JSON.parse(JSON.stringify(templateEntry));
    }
  });
});