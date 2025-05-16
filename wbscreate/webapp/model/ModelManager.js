sap.ui.define([
    "sap/ui/base/Object",
    "sap/ui/model/json/JSONModel",
    "sap/ui/export/library",
    "sap/ui/core/library"
], function (BaseObject, JSONModel, exportLibrary, coreLibrary) {
    "use strict";

    const EdmType = exportLibrary.EdmType;
    const ValueState = coreLibrary.ValueState;

    return BaseObject.extend("wbscreate.model.ModelManager", {
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
            this._initStatusFilterModel();
            this._initWbsElementsModel();
            this._initFieldMetadataModel();
            this._initBatchDisplayModel();

            console.log("Models initialized successfully");
        },

        /**
         * Reset all models to their initial state
         */
        resetModels: function () {
            this._resetUploadSummaryModel();
            this._resetWbsElementsModel();
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
                HasBeenSubmitted: false,
                LastUploadDate: null,
                ProcessingComplete: false,
                isSubmitting: false,
                uploadProgress: 0
            });
            this._view.setModel(oUploadSummaryModel, "uploadSummary");
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
         * Initialize WBS elements model
         * @private
         */
        _initWbsElementsModel: function () {
            const wbsElementsModel = new JSONModel({
                entries: [],
                validationStatus: "Pending",
                filteredCount: 0
            });
            this._view.setModel(wbsElementsModel, "wbsElements");

            // Store a reference to make it accessible to the controller if needed
            this.wbsElementsModel = wbsElementsModel;
        },

        /**
         * Initialize field metadata model
         * @private
         */
        _initFieldMetadataModel: function () {
            const fieldMetadataModel = new JSONModel({
                // Core Project Element Fields
                ProjectElement: {
                    type: EdmType.String,
                    maxLength: 24,
                    required: true,
                    valuePath: "ProjectElement",
                    label: "Project Element ID",
                    valueState: ValueState.None,
                    valueStateText: ""
                },
                ProjectUUID: {
                    type: EdmType.String,
                    maxLength: 36,
                    required: false,
                    valuePath: "ProjectUUID",
                    label: "Project UUID",
                    valueState: ValueState.None,
                    valueStateText: ""
                },
                ProjectElementDescription: {
                    type: EdmType.String,
                    maxLength: 60,
                    required: false,
                    valuePath: "ProjectElementDescription",
                    label: "Project Element Description",
                    valueState: ValueState.None,
                    valueStateText: ""
                },

                // Date Fields
                PlannedStartDate: {
                    type: EdmType.Date,
                    required: false,
                    valuePath: "PlannedStartDate",
                    label: "Planned Start Date",
                    valueState: ValueState.None,
                    valueStateText: ""
                },
                PlannedEndDate: {
                    type: EdmType.Date,
                    required: false,
                    valuePath: "PlannedEndDate",
                    label: "Planned End Date",
                    valueState: ValueState.None,
                    valueStateText: ""
                },

                // Organization Fields
                ResponsibleCostCenter: {
                    type: EdmType.String,
                    maxLength: 10,
                    required: false,
                    valuePath: "ResponsibleCostCenter",
                    label: "Responsible Cost Center",
                    valueState: ValueState.None,
                    valueStateText: ""
                },
                CompanyCode: {
                    type: EdmType.String,
                    maxLength: 4,
                    required: false,
                    valuePath: "CompanyCode",
                    label: "Company Code",
                    valueState: ValueState.None,
                    valueStateText: ""
                },
                ProfitCenter: {
                    type: EdmType.String,
                    maxLength: 10,
                    required: false,
                    valuePath: "ProfitCenter",
                    label: "Profit Center",
                    valueState: ValueState.None,
                    valueStateText: ""
                },
                ControllingArea: {
                    type: EdmType.String,
                    maxLength: 4,
                    required: false,
                    valuePath: "ControllingArea",
                    label: "Controlling Area",
                    valueState: ValueState.None,
                    valueStateText: ""
                },

                // Boolean Fields
                WBSElementIsBillingElement: {
                    type: EdmType.Boolean,
                    required: false,
                    valuePath: "WBSElementIsBillingElement",
                    label: "WBS Element is Billing Element",
                    valueState: ValueState.None,
                    valueStateText: ""
                },

                // Custom Extension Fields
                YY1_OldProjectSiteID_PTD: {
                    type: EdmType.String,
                    maxLength: 24,
                    required: false,
                    valuePath: "YY1_OldProjectSiteID_PTD",
                    label: "Old Project Site ID",
                    valueState: ValueState.None,
                    valueStateText: ""
                },
                YY1_ExactWBScode_PTD: {
                    type: EdmType.String,
                    maxLength: 24,
                    required: false,
                    valuePath: "YY1_ExactWBScode_PTD",
                    label: "Exact WBS Code",
                    valueState: ValueState.None,
                    valueStateText: ""
                },
                YY1_Categorization1_PTD: {
                    type: EdmType.String,
                    maxLength: 20,
                    required: false,
                    valuePath: "YY1_Categorization1_PTD",
                    label: "Site Type",
                    valueState: ValueState.None,
                    valueStateText: ""
                },
                YY1_ATMID_PTD: {
                    type: EdmType.String,
                    maxLength: 20,
                    required: false,
                    valuePath: "YY1_ATMID_PTD",
                    label: "ATM ID",
                    valueState: ValueState.None,
                    valueStateText: ""
                }
            });
            this._view.setModel(fieldMetadataModel, "fieldMetadata");
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
                    HasBeenSubmitted: false,
                    LastUploadDate: null,
                    ProcessingComplete: false,
                    isSubmitting: false,
                    uploadProgress: 0
                });
            }
        },

        /**
         * Reset WBS elements model
         * @private
         */
        _resetWbsElementsModel: function () {
            const oModel = this._view.getModel("wbsElements");
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
         * Get model by name
         * @param {string} modelName - Model name
         * @returns {sap.ui.model.Model} Model instance
         */
        getModel: function (modelName) {
            return this._view.getModel(modelName);
        },

        /**
         * Update WBS elements model with new entries
         * @param {Array} entries - WBS element entries
         * @param {string} validationStatus - Validation status
         */
        updateWbsElements: function (entries, validationStatus = "Pending") {
            const oModel = this._view.getModel("wbsElements");
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
                oModel.setProperty("/IsSubmitEnabled", validationResults.validCount > 0);
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
         * Get column metadata for export
         * @returns {Array} Column metadata for export
         */
        getColumnConfig: function () {
            return [
                // Core Project Element Fields
                {
                    label: 'Project Element ID',
                    property: 'ProjectElement',
                    type: EdmType.String
                },
                {
                    label: 'Project UUID',
                    property: 'ProjectUUID',
                    type: EdmType.String
                },
                {
                    label: 'Project Element Description',
                    property: 'ProjectElementDescription',
                    type: EdmType.String
                },
                {
                    label: 'Planned Start Date',
                    property: 'PlannedStartDate',
                    type: EdmType.Date
                },
                {
                    label: 'Planned End Date',
                    property: 'PlannedEndDate',
                    type: EdmType.Date
                },
                {
                    label: 'Responsible Cost Center',
                    property: 'ResponsibleCostCenter',
                    type: EdmType.String
                },
                {
                    label: 'Company Code',
                    property: 'CompanyCode',
                    type: EdmType.String
                },
                {
                    label: 'Profit Center',
                    property: 'ProfitCenter',
                    type: EdmType.String
                },
                {
                    label: 'Controlling Area',
                    property: 'ControllingArea',
                    type: EdmType.String
                },
                {
                    label: 'WBS Element is Billing Element',
                    property: 'WBSElementIsBillingElement',
                    type: EdmType.Boolean
                },

                // Custom Extension Fields
                {
                    label: 'Old Project Site ID',
                    property: 'YY1_OldProjectSiteID_PTD',
                    type: EdmType.String
                },
                {
                    label: 'Exact WBS Code',
                    property: 'YY1_ExactWBScode_PTD',
                    type: EdmType.String
                },
                {
                    label: 'Site Type',
                    property: 'YY1_Categorization1_PTD',
                    type: EdmType.String
                },
                {
                    label: 'ATM ID',
                    property: 'YY1_ATMID_PTD',
                    type: EdmType.String
                }
            ];
        },

        /**
         * Get the validation field metadata
         * @returns {Object} Validation field metadata
         */
        getFieldMetadata: function () {
            const fieldMetadataModel = this._view.getModel("fieldMetadata");
            return fieldMetadataModel ? fieldMetadataModel.getData() : {};
        },

        /**
         * Update upload progress
         * @param {number} progress - Progress percentage (0-100)
         */
        updateUploadProgress: function (progress) {
            const uploadSummaryModel = this._view.getModel("uploadSummary");
            if (uploadSummaryModel) {
                uploadSummaryModel.setProperty("/uploadProgress", progress);
            }
        },

        /**
         * Set submission status
         * @param {boolean} isSubmitting - Whether submission is in progress
         */
        setSubmissionStatus: function (isSubmitting) {
            const uploadSummaryModel = this._view.getModel("uploadSummary");
            if (uploadSummaryModel) {
                uploadSummaryModel.setProperty("/isSubmitting", isSubmitting);
                if (!isSubmitting) {
                    uploadSummaryModel.setProperty("/HasBeenSubmitted", true);
                }
            }
        }
    });
});