sap.ui.define([
  "sap/ui/base/Object",
  "sap/ui/model/json/JSONModel",
  "sap/ui/export/library",
  "sap/ui/core/library",
  "grn/model/models"
], function (BaseObject, JSONModel, exportLibrary, coreLibrary, models) {
  "use strict";

  const EdmType = exportLibrary.EdmType;
  const ValueState = coreLibrary.ValueState;

  return BaseObject.extend("grn.model.ModelManager", {
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
      this._initMaterialDocumentsModel();
      this._initBatchDisplayModel();

      // Get material document model from models module
      const oMaterialDocumentModel = this.createMaterialDocumentModel();
      this._view.setModel(oMaterialDocumentModel);

      console.log("Models initialized successfully");
    },

    /**
     * Reset all models to their initial state
     */
    resetModels: function () {
      this._resetUploadSummaryModel();
      this._resetMaterialDocumentsModel();
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
        { key: "All", text: "All" },
        { key: "Valid", text: "Valid" },
        { key: "Invalid", text: "Invalid" }
      ]);
      this._view.setModel(oStatusModel, "statusModel");
    },

    /**
     * Initialize material documents model
     * @private
     */
    _initMaterialDocumentsModel: function () {
      const materialDocumentsModel = new JSONModel({
        entries: [],
        validationStatus: "Pending",
        filteredCount: 0
      });
      this._view.setModel(materialDocumentsModel, "materialDocuments");

      // Store a reference to make it accessible to the controller if needed
      this.materialDocumentsModel = materialDocumentsModel;
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
     * Reset material documents model
     * @private
     */
    _resetMaterialDocumentsModel: function () {
      const oModel = this._view.getModel("materialDocuments");
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
     * Creates a new material document model with default structure
     * @returns {sap.ui.model.json.JSONModel} JSON model for material document data
     */
    createMaterialDocumentModel: function () {
      return new JSONModel({
        DocumentDate: new Date(),
        PostingDate: new Date(),
        GRNDocumentNumber: "",
        Plant: "",
        StorageLocation: "",
        GoodsMovementType: "",
        to_MaterialDocumentItem: {
          results: []
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
     * Update material documents model with new entries
     * @param {Array} entries - Material document entries
     * @param {string} validationStatus - Validation status
     */
    updateMaterialDocuments: function (entries, validationStatus = "Pending") {
      const oModel = this._view.getModel("materialDocuments");
      if (oModel) {
        oModel.setProperty("/entries", entries || []);
        oModel.setProperty("/validationStatus", validationStatus);
        oModel.setProperty("/filteredCount", entries ? entries.length : 0);
      }
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
    }
  });
});