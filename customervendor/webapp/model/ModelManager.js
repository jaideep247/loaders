sap.ui.define([
  "sap/ui/base/Object",
  "sap/ui/model/json/JSONModel",
  "sap/ui/export/library",
  "sap/ui/core/library"
], function (BaseObject, JSONModel, exportLibrary, coreLibrary) {
  "use strict";

  const EdmType = exportLibrary.EdmType;
  const ValueState = coreLibrary.ValueState;

  return BaseObject.extend("customervendor.model.ModelManager", {
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
      this._initJournalEntriesModel();
      this._initBatchDisplayModel();

      console.log("Models initialized successfully");
    },

    /**
     * Reset all models to their initial state
     */
    resetModels: function () {
      this._resetUploadSummaryModel();
      this._resetJournalEntriesModel();
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
        HasBeenSubmitted: false,
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
     * Initialize journal entries model
     * @private
     */
    _initJournalEntriesModel: function () {
      const journalEntriesModel = new JSONModel({
        transactions: [],
        validationStatus: "Pending",
        filteredCount: 0,
        processedEntries: [],
        postedDocuments: []
      });
      this._view.setModel(journalEntriesModel, "journalEntries");

      // Store a reference to make it accessible to the controller if needed
      this.journalEntriesModel = journalEntriesModel;
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
        errors: [],
        transactionId: ""
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
          HasBeenSubmitted: false,
          LastUploadDate: null,
          ProcessingComplete: false,
          isSubmitting: false,
          uploadProgress: 0
        });
      }
    },

    /**
     * Reset journal entries model
     * @private
     */
    _resetJournalEntriesModel: function () {
      const oModel = this._view.getModel("journalEntries");
      if (oModel) {
        oModel.setData({
          transactions: [],
          validationStatus: "Pending",
          filteredCount: 0,
          processedEntries: [],
          postedDocuments: []
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
          errors: [],
          transactionId: ""
        });
      }
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
     * Update journal entries model with new transactions
     * @param {Array} transactions - Journal entry transactions
     * @param {string} validationStatus - Validation status
     */
    updateJournalEntries: function (transactions, validationStatus = "Pending") {
      const oModel = this._view.getModel("journalEntries");
      if (oModel) {
        oModel.setProperty("/transactions", transactions || []);
        oModel.setProperty("/validationStatus", validationStatus);
        oModel.setProperty("/filteredCount", transactions ? transactions.length : 0);
      }
    },

    /**
     * Update upload summary with validation results
     * @param {object} validationResults - Validation results
     */
    updateUploadSummary: function (validationResults) {
      const oModel = this._view.getModel("uploadSummary");
      if (oModel && validationResults) {
        oModel.setProperty("/TotalEntries", validationResults.totalEntries || 0);
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
        oModel.setData({
          ...oModel.getData(),
          ...progressData
        });
      }
    },

    /**
     * Update transaction ID in batch display model
     * @param {string} transactionId - Transaction ID
     */
    setTransactionId: function (transactionId) {
      const oModel = this._view.getModel("batchDisplay");
      if (oModel && transactionId) {
        oModel.setProperty("/transactionId", transactionId);
      }
    },

    /**
     * Add posted document to journal entries model
     * @param {object} document - Posted document
     */
    addPostedDocument: function (document) {
      const oModel = this._view.getModel("journalEntries");
      if (oModel && document) {
        const postedDocuments = oModel.getProperty("/postedDocuments") || [];
        postedDocuments.push(document);
        oModel.setProperty("/postedDocuments", postedDocuments);
      }
    },

    /**
     * Add processed entry to journal entries model
     * @param {object} entry - Processed entry
     */
    addProcessedEntry: function (entry) {
      const oModel = this._view.getModel("journalEntries");
      if (oModel && entry) {
        const processedEntries = oModel.getProperty("/processedEntries") || [];
        processedEntries.push(entry);
        oModel.setProperty("/processedEntries", processedEntries);
      }
    },

    /**
     * Update upload progress
     * @param {number} progress - Upload progress percentage (0-100)
     */
    updateUploadProgress: function (progress) {
      const oModel = this._view.getModel("uploadSummary");
      if (oModel) {
        oModel.setProperty("/uploadProgress", progress);
      }
    },

    /**
     * Set processing complete status
     * @param {boolean} isComplete - Whether processing is complete
     */
    setProcessingComplete: function (isComplete) {
      const oModel = this._view.getModel("uploadSummary");
      if (oModel) {
        oModel.setProperty("/ProcessingComplete", isComplete);
        oModel.setProperty("/isSubmitting", !isComplete);
      }
    }
  });
});