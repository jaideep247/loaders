sap.ui.define([
    "sap/ui/base/Object",
    "sap/ui/model/json/JSONModel",
    "sap/ui/export/library",
    "sap/ui/core/library"
  ], function (BaseObject, JSONModel, exportLibrary, coreLibrary) {
    "use strict";
  
    const EdmType = exportLibrary.EdmType;
    const ValueState = coreLibrary.ValueState;
  
    return BaseObject.extend("purchaseorder.model.ModelManager", {
      /**
       * Constructor for ModelManager
       * @param {sap.ui.core.mvc.Controller} oController - Reference to the controller
       */
      constructor: function(oController) {
        BaseObject.call(this);
        this._controller = oController;
        this._view = oController.getView();
      },
      
      /**
       * Initialize all application models
       */
      initializeModels: function() {
        this._initUploadSummaryModel();
        this._initUserModel();
        this._initStatusFilterModel();
      },
      
      /**
       * Reset all models to their initial state
       */
      resetModels: function() {
        this._resetUploadSummaryModel();
      },
      
      /**
       * Initialize upload summary model
       * @private
       */
      _initUploadSummaryModel: function() {
        const oUploadSummaryModel = new JSONModel({
          TotalEntries: 0,
          SuccessfulEntries: 0,
          FailedEntries: 0,
          ValidationErrors: [],
          IsSubmitEnabled: false,
          HasBeenSubmitted: false,
          LastUploadDate: null,
          ProcessingComplete: false
        });
        this._view.setModel(oUploadSummaryModel, "uploadSummary");
      },      
      /**
       * Initialize user model
       * @private
       */
      _initUserModel: function() {
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
      _initStatusFilterModel: function() {
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
      _resetUploadSummaryModel: function() {
        const oModel = this._view.getModel("uploadSummary");
        if (oModel) {
          oModel.setData({
            TotalEntries: 0,
            SuccessfulEntries: 0,
            FailedEntries: 0,
            ValidationErrors: [],
            IsSubmitEnabled: false,
            LastUploadDate: null,
            ProcessingComplete: false
          });
        }
      },            
      
      /**
       * Load user information from API
       * @param {string} baseUrl - Base URL for API calls
       */
      loadUserInfo: function(baseUrl) {
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
      }
    });
  });