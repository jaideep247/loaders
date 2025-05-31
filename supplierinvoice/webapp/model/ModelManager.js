sap.ui.define([
  "sap/ui/base/Object",
  "sap/ui/model/json/JSONModel",
  "sap/ui/export/library",
  "sap/ui/core/library"
], function (BaseObject, JSONModel, exportLibrary, coreLibrary) {
  "use strict";

  const EdmType = exportLibrary.EdmType;
  const ValueState = coreLibrary.ValueState;

  return BaseObject.extend("supplierinvoice.model.ModelManager", {
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
      this._initSupplierInvoicesModel();
      this._initUserModel();
      this._initStatusFilterModel();
    },

    /**
     * Reset all models to their initial state
     */
    resetModels: function () {
      this._resetUploadSummaryModel();
      this._resetSupplierInvoicesModel();
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
        LastUploadDate: null,
        ProcessingComplete: false,
        isSubmitting: false,
        uploadProgress: 0
      });
      this._view.setModel(oUploadSummaryModel, "uploadSummary");
    },

    /**
     * Initialize supplier invoices model
     * @private
     */
    _initSupplierInvoicesModel: function () {
      const oSupplierInvoicesModel = new JSONModel({
        invoices: [],
        validationStatus: "Pending",
        filteredCount: 0,
        processedEntries: [],
        postedDocuments: []
      });
      this._view.setModel(oSupplierInvoicesModel, "supplierInvoices");
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
          LastUploadDate: null,
          ProcessingComplete: false,
          isSubmitting: false,
          uploadProgress: 0
        });
      }
    },

    /**
     * Reset supplier invoices model
     * @private
     */
    _resetSupplierInvoicesModel: function () {
      const oModel = this._view.getModel("supplierInvoices");
      if (oModel) {
        oModel.setData({
          invoices: [],
          validationStatus: "Pending",
          filteredCount: 0,
          processedEntries: [],
          postedDocuments: []
        });
      }
    },

    /**
     * Update upload summary after file processing
     * @param {Object} summaryData - Summary data from processing
     * @public
     */
    updateUploadSummary: function (summaryData) {
      const oModel = this._view.getModel("uploadSummary");
      if (oModel && summaryData) {
        oModel.setProperty("/TotalEntries", summaryData.totalEntries || 0);
        oModel.setProperty("/SuccessfulEntries", summaryData.validEntries || 0);
        oModel.setProperty("/FailedEntries", summaryData.invalidEntries || 0);
        oModel.setProperty("/ValidationErrors", summaryData.errors || []);
        oModel.setProperty("/IsSubmitEnabled", summaryData.isSubmitEnabled || false);
        oModel.setProperty("/LastUploadDate", new Date());
      }
    },

    /**
     * Update invoices data
     * @param {Array} invoices - Array of invoice objects
     * @public
     */
    updateSupplierInvoices: function (invoices) {
      const oModel = this._view.getModel("supplierInvoices");
      if (oModel && Array.isArray(invoices)) {
        oModel.setProperty("/invoices", invoices);
        oModel.setProperty("/filteredCount", invoices.length);
        oModel.setProperty("/validationStatus", "Completed");
      }
    },

    /**
     * Update user information
     * @param {Object} userData - User data
     * @public
     */
    updateUserInfo: function (userData) {
      const oModel = this._view.getModel("userInfo");
      if (oModel && userData) {
        oModel.setData(userData);
      }
    },

    /**
     * Update processing status
     * @param {Boolean} isComplete - Whether processing is complete
     * @param {Number} progress - Progress percentage (0-100)
     * @public
     */
    updateProcessingStatus: function (isComplete, progress) {
      const oModel = this._view.getModel("uploadSummary");
      if (oModel) {
        oModel.setProperty("/ProcessingComplete", isComplete);
        oModel.setProperty("/uploadProgress", progress || 0);
      }
    },

    /**
     * Update submission status
     * @param {Boolean} isSubmitting - Whether submission is in progress
     * @param {Number} progress - Progress percentage (0-100)
     * @public
     */
    updateSubmissionStatus: function (isSubmitting, progress) {
      const oModel = this._view.getModel("uploadSummary");
      if (oModel) {
        oModel.setProperty("/isSubmitting", isSubmitting);
        oModel.setProperty("/uploadProgress", progress || 0);
      }
    },

    /**
     * Add processed entries after submission
     * @param {Array} processedEntries - Array of processed entries
     * @public
     */
    addProcessedEntries: function (processedEntries) {
      const oModel = this._view.getModel("supplierInvoices");
      if (oModel && Array.isArray(processedEntries)) {
        const currentEntries = oModel.getProperty("/processedEntries") || [];
        oModel.setProperty("/processedEntries", [...currentEntries, ...processedEntries]);
      }
    },

    /**
     * Add posted documents after successful submission
     * @param {Array} postedDocuments - Array of posted document information
     * @public
     */
    addPostedDocuments: function (postedDocuments) {
      const oModel = this._view.getModel("supplierInvoices");
      if (oModel && Array.isArray(postedDocuments)) {
        const currentDocuments = oModel.getProperty("/postedDocuments") || [];
        oModel.setProperty("/postedDocuments", [...currentDocuments, ...postedDocuments]);
      }
    }
  });
});