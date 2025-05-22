sap.ui.define([
    "sap/ui/base/Object",
    "sap/ui/model/json/JSONModel",
    "sap/ui/export/library",
    "sap/ui/core/library"
], function (BaseObject, JSONModel, exportLibrary, coreLibrary) {
    "use strict";

    const EdmType = exportLibrary.EdmType;
    const ValueState = coreLibrary.ValueState;

    return BaseObject.extend("serviceentrysheet.model.ModelManager", {
        /**
         * Constructor for ModelManager
         * @param {Object} config - Configuration object
         */
        constructor: function (config) {
            BaseObject.call(this);
            this._controller = config.controller;
            this._view = this._controller.getView();
            this._errorHandler = config.errorHandler;
            this._dataTransformer = config.dataTransformer;
        },

        /**
         * Initialize all application models
         * @returns {Object} Collection of initialized models
         */
        initializeModels: function () {
            try {
                // Initialize upload summary model
                const uploadSummaryModel = this._createUploadSummaryModel();
                this._view.setModel(uploadSummaryModel, "uploadSummary");

                // Initialize service entry sheets model
                const serviceEntrySheetModel = this._createServiceEntrySheetModel();
                this._view.setModel(serviceEntrySheetModel, "serviceEntrySheets");

                // Initialize status filter model
                const statusModel = this._createStatusFilterModel();
                this._view.setModel(statusModel, "statusModel");

                // Initialize field metadata model
                const fieldMetadataModel = this._createFieldMetadataModel();
                this._view.setModel(fieldMetadataModel, "fieldMetadata");

                console.log("Models initialized successfully by ModelManager");

                return {
                    uploadSummary: uploadSummaryModel,
                    serviceEntrySheets: serviceEntrySheetModel,
                    statusModel: statusModel,
                    fieldMetadata: fieldMetadataModel
                };
            } catch (error) {
                console.error("Error initializing models in ModelManager:", error);
                if (this._errorHandler) {
                    this._errorHandler.handleError(error, "Model Initialization Error");
                }
                throw error;
            }
        },

        /**
         * Reset models to their initial state
         */
        resetModels: function () {
            this._resetUploadSummaryModel();
            this._resetServiceEntrySheetModel();
        },

        /**
         * Create upload summary model
         * @private
         * @returns {sap.ui.model.json.JSONModel} The created model
         */
        _createUploadSummaryModel: function () {
            return new JSONModel({
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
        },

        /**
         * Create service entry sheet model
         * @private
         * @returns {sap.ui.model.json.JSONModel} The created model
         */
        _createServiceEntrySheetModel: function () {
            return new JSONModel({
                entries: [],
                validationStatus: "Pending",
                filteredCount: 0
            });
        },

        /**
         * Create status filter model
         * @private
         * @returns {sap.ui.model.json.JSONModel} The created model
         */
        _createStatusFilterModel: function () {
            return new JSONModel([
                { key: "All", text: "All" },
                { key: "Valid", text: "Valid" },
                { key: "Invalid", text: "Invalid" }
            ]);
        },

        /**
         * Create field metadata model containing validation rules for all fields
         * @private
         * @returns {sap.ui.model.json.JSONModel} The created model
         */
        _createFieldMetadataModel: function () {
            return new JSONModel({
                // Header fields metadata
                PurchasingOrganization: {
                    type: EdmType.String,
                    maxLength: 4,
                    required: true,
                    valuePath: "PurchasingOrganization",
                    label: "Purchasing Organization",
                    valueState: ValueState.None,
                    valueStateText: ""
                },
                PurchasingGroup: {
                    type: EdmType.String,
                    maxLength: 3,
                    required: true,
                    valuePath: "PurchasingGroup",
                    label: "Purchasing Group",
                    valueState: ValueState.None,
                    valueStateText: ""
                },
                Currency: {
                    type: EdmType.String,
                    maxLength: 5,
                    required: true,
                    valuePath: "Currency",
                    label: "Currency",
                    valueState: ValueState.None,
                    valueStateText: ""
                },
                ServiceEntrySheetName: {
                    type: EdmType.String,
                    maxLength: 40,
                    required: true,
                    valuePath: "ServiceEntrySheetName",
                    label: "Service Entry Sheet Name",
                    valueState: ValueState.None,
                    valueStateText: ""
                },
                Supplier: {
                    type: EdmType.String,
                    maxLength: 10,
                    required: true,
                    valuePath: "Supplier",
                    label: "Supplier",
                    valueState: ValueState.None,
                    valueStateText: ""
                },
                PostingDate: {
                    type: EdmType.Date,
                    required: true,
                    valuePath: "PostingDate",
                    label: "Posting Date",
                    valueState: ValueState.None,
                    valueStateText: ""
                },
                PurchaseOrder: {
                    type: EdmType.String,
                    maxLength: 10,
                    required: true,
                    valuePath: "PurchaseOrder",
                    label: "Purchase Order",
                    valueState: ValueState.None,
                    valueStateText: ""
                },

                // Item fields metadata
                ServiceEntrySheetItem: {
                    type: EdmType.String,
                    maxLength: 5,
                    required: true,
                    valuePath: "ServiceEntrySheetItem",
                    label: "Item Number",
                    valueState: ValueState.None,
                    valueStateText: ""
                },
                AccountAssignmentCategory: {
                    type: EdmType.String,
                    maxLength: 1,
                    required: true,
                    valuePath: "AccountAssignmentCategory",
                    label: "Account Assignment Category",
                    valueState: ValueState.None,
                    valueStateText: ""
                },
                ConfirmedQuantity: {
                    type: EdmType.Number,
                    precision: 13,
                    scale: 3,
                    required: true,
                    valuePath: "ConfirmedQuantity",
                    label: "Confirmed Quantity",
                    valueState: ValueState.None,
                    valueStateText: ""
                },
                Plant: {
                    type: EdmType.String,
                    maxLength: 4,
                    required: true,
                    valuePath: "Plant",
                    label: "Plant",
                    valueState: ValueState.None,
                    valueStateText: ""
                },
                NetAmount: {
                    type: EdmType.Number,
                    precision: 14,
                    scale: 3,
                    required: true,
                    valuePath: "NetAmount",
                    label: "Net Amount",
                    valueState: ValueState.None,
                    valueStateText: ""
                },
                NetPriceAmount: {
                    type: EdmType.Number,
                    precision: 14,
                    scale: 3,
                    required: true,
                    valuePath: "NetPriceAmount",
                    label: "Net Price Amount",
                    valueState: ValueState.None,
                    valueStateText: ""
                },
                PurchaseOrderItem: {
                    type: EdmType.String,
                    maxLength: 5,
                    required: true,
                    valuePath: "PurchaseOrderItem",
                    label: "Purchase Order Item",
                    valueState: ValueState.None,
                    valueStateText: ""
                },
                ServicePerformanceDate: {
                    type: EdmType.Date,
                    required: true,
                    valuePath: "ServicePerformanceDate",
                    label: "Performance Date",
                    valueState: ValueState.None,
                    valueStateText: ""
                },
                ServicePerformanceEndDate: {
                    type: EdmType.Date,
                    required: true,
                    valuePath: "ServicePerformanceEndDate",
                    label: "Performance End Date",
                    valueState: ValueState.None,
                    valueStateText: ""
                },

                // Service and Quantity fields metadata
                Service: {
                    type: EdmType.String,
                    maxLength: 18,
                    required: true,
                    valuePath: "Service",
                    label: "Service Number",
                    description: "Service master number/code",
                    valueState: ValueState.None,
                    valueStateText: ""
                },
                ServiceDescription: {
                    type: EdmType.String,
                    maxLength: 40,
                    required: false,
                    valuePath: "ServiceDescription",
                    label: "Service Description",
                    description: "Description of the service performed",
                    valueState: ValueState.None,
                    valueStateText: ""
                },
                Quantity: {
                    type: EdmType.Number,
                    precision: 13,
                    scale: 3,
                    required: true,
                    valuePath: "Quantity",
                    label: "Quantity",
                    description: "Service quantity performed",
                    valueState: ValueState.None,
                    valueStateText: "",
                    minimum: 0.001
                },
                BaseUnitOfMeasure: {
                    type: EdmType.String,
                    maxLength: 3,
                    required: true,
                    valuePath: "BaseUnitOfMeasure",
                    label: "Unit of Measure",
                    description: "Base unit of measure for the service quantity",
                    valueState: ValueState.None,
                    valueStateText: ""
                },
                ServiceUnitPrice: {
                    type: EdmType.Number,
                    precision: 14,
                    scale: 3,
                    required: true,
                    valuePath: "ServiceUnitPrice",
                    label: "Service Unit Price",
                    description: "Price per unit of service",
                    valueState: ValueState.None,
                    valueStateText: "",
                    minimum: 0
                },
                ServiceLineTotal: {
                    type: EdmType.Number,
                    precision: 14,
                    scale: 3,
                    required: false,
                    valuePath: "ServiceLineTotal",
                    label: "Service Line Total",
                    description: "Total amount for service line (calculated field)",
                    valueState: ValueState.None,
                    valueStateText: "",
                    calculated: true
                },
                ServiceCategory: {
                    type: EdmType.String,
                    maxLength: 2,
                    required: false,
                    valuePath: "ServiceCategory",
                    label: "Service Category",
                    description: "Category of service (e.g., labor, materials, etc.)",
                    valueState: ValueState.None,
                    valueStateText: ""
                },
                ServiceGroup: {
                    type: EdmType.String,
                    maxLength: 5,
                    required: false,
                    valuePath: "ServiceGroup",
                    label: "Service Group",
                    description: "Service group classification",
                    valueState: ValueState.None,
                    valueStateText: ""
                },
                PersonnelNumber: {
                    type: EdmType.String,
                    maxLength: 8,
                    required: false,
                    valuePath: "PersonnelNumber",
                    label: "Personnel Number",
                    description: "Employee/contractor personnel number",
                    valueState: ValueState.None,
                    valueStateText: ""
                },
                LineOfService: {
                    type: EdmType.String,
                    maxLength: 5,
                    required: false,
                    valuePath: "LineOfService",
                    label: "Line of Service",
                    description: "Service line identifier within purchase order",
                    valueState: ValueState.None,
                    valueStateText: ""
                },

                // Account Assignment fields metadata
                AccountAssignment: {
                    type: EdmType.String,
                    maxLength: 2,
                    required: true,
                    valuePath: "AccountAssignment",
                    label: "Account Assignment Number",
                    valueState: ValueState.None,
                    valueStateText: ""
                },
                CostCenter: {
                    type: EdmType.String,
                    maxLength: 10,
                    required: false,
                    valuePath: "CostCenter",
                    label: "Cost Center",
                    valueState: ValueState.None,
                    valueStateText: ""
                },
                GLAccount: {
                    type: EdmType.String,
                    maxLength: 10,
                    required: false,
                    valuePath: "GLAccount",
                    label: "G/L Account",
                    valueState: ValueState.None,
                    valueStateText: ""
                },
                WBSElement: {
                    type: EdmType.String,
                    maxLength: 24,
                    required: false,
                    valuePath: "WBSElement",
                    label: "WBS Element",
                    valueState: ValueState.None,
                    valueStateText: ""
                }
            });
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
         * Reset service entry sheet model
         * @private
         */
        _resetServiceEntrySheetModel: function () {
            const oModel = this._view.getModel("serviceEntrySheets");
            if (oModel) {
                oModel.setData({
                    entries: [],
                    validationStatus: "Pending",
                    filteredCount: 0
                });
            }
        },

        /**
         * Update models with validation results
         * @param {Object} validationResult - The validation result object
         */
        updateModelsWithValidationResults: function (validationResult) {
            try {
                // Update service entry sheets model
                const serviceEntrySheetModel = this._view.getModel("serviceEntrySheets");
                if (serviceEntrySheetModel) {
                    serviceEntrySheetModel.setProperty("/entries", validationResult.entries || []);
                    serviceEntrySheetModel.setProperty("/validationStatus", validationResult.isValid ? "Valid" : "Invalid");
                    serviceEntrySheetModel.setProperty("/filteredCount", validationResult.entries.length);
                }

                // Update upload summary model
                const uploadSummaryModel = this._view.getModel("uploadSummary");
                if (uploadSummaryModel) {
                    uploadSummaryModel.setProperty("/TotalEntries", validationResult.validCount + validationResult.errorCount);
                    uploadSummaryModel.setProperty("/SuccessfulEntries", validationResult.validCount);
                    uploadSummaryModel.setProperty("/FailedEntries", validationResult.errorCount);
                    uploadSummaryModel.setProperty("/ValidationErrors", validationResult.errors || []);
                    uploadSummaryModel.setProperty("/IsSubmitEnabled", validationResult.validCount > 0);
                    uploadSummaryModel.setProperty("/LastUploadDate", new Date());
                    uploadSummaryModel.setProperty("/ProcessingComplete", true);
                }

                console.log("Models updated with validation results", {
                    totalEntries: validationResult.validCount + validationResult.errorCount,
                    validEntries: validationResult.validCount,
                    invalidEntries: validationResult.errorCount
                });
            } catch (error) {
                console.error("Error updating models with validation results:", error);
                if (this._errorHandler) {
                    this._errorHandler.handleError(error, "Model Update Error");
                }
            }
        },

        /**
         * Get column metadata for export
         * @returns {Array} Column metadata for export
         */
        getColumnConfig: function () {
            return [
                // Header fields
                {
                    label: 'Purchasing Organization',
                    property: 'PurchasingOrganization',
                    type: EdmType.String
                },
                {
                    label: 'Purchasing Group',
                    property: 'PurchasingGroup',
                    type: EdmType.String
                },
                {
                    label: 'Currency',
                    property: 'Currency',
                    type: EdmType.String
                },
                {
                    label: 'Service Entry Sheet Name',
                    property: 'ServiceEntrySheetName',
                    type: EdmType.String
                },
                {
                    label: 'Supplier',
                    property: 'Supplier',
                    type: EdmType.String
                },
                {
                    label: 'Posting Date',
                    property: 'PostingDate',
                    type: EdmType.Date
                },
                {
                    label: 'Purchase Order',
                    property: 'PurchaseOrder',
                    type: EdmType.String
                },

                // Item fields
                {
                    label: 'Item Number',
                    property: 'ServiceEntrySheetItem',
                    type: EdmType.String
                },
                {
                    label: 'Account Assignment Category',
                    property: 'AccountAssignmentCategory',
                    type: EdmType.String
                },
                {
                    label: 'Confirmed Quantity',
                    property: 'ConfirmedQuantity',
                    type: EdmType.Number
                },
                {
                    label: 'Plant',
                    property: 'Plant',
                    type: EdmType.String
                },
                {
                    label: 'Net Amount',
                    property: 'NetAmount',
                    type: EdmType.Number
                },
                {
                    label: 'Net Price Amount',
                    property: 'NetPriceAmount',
                    type: EdmType.Number
                },
                {
                    label: 'Purchase Order Item',
                    property: 'PurchaseOrderItem',
                    type: EdmType.String
                },
                {
                    label: 'Performance Date',
                    property: 'ServicePerformanceDate',
                    type: EdmType.Date
                },
                {
                    label: 'Performance End Date',
                    property: 'ServicePerformanceEndDate',
                    type: EdmType.Date
                },

                // Service and Quantity fields
                {
                    label: 'Service Number',
                    property: 'Service',
                    type: EdmType.String
                },
                {
                    label: 'Service Description',
                    property: 'ServiceDescription',
                    type: EdmType.String
                },
                {
                    label: 'Quantity',
                    property: 'Quantity',
                    type: EdmType.Number
                },
                {
                    label: 'Unit of Measure',
                    property: 'BaseUnitOfMeasure',
                    type: EdmType.String
                },
                {
                    label: 'Service Unit Price',
                    property: 'ServiceUnitPrice',
                    type: EdmType.Number
                },
                {
                    label: 'Service Line Total',
                    property: 'ServiceLineTotal',
                    type: EdmType.Number
                },
                {
                    label: 'Service Category',
                    property: 'ServiceCategory',
                    type: EdmType.String
                },
                {
                    label: 'Service Group',
                    property: 'ServiceGroup',
                    type: EdmType.String
                },
                {
                    label: 'Personnel Number',
                    property: 'PersonnelNumber',
                    type: EdmType.String
                },
                {
                    label: 'Line of Service',
                    property: 'LineOfService',
                    type: EdmType.String
                },

                // Account Assignment fields
                {
                    label: 'Account Assignment Number',
                    property: 'AccountAssignment',
                    type: EdmType.String
                },
                {
                    label: 'Cost Center',
                    property: 'CostCenter',
                    type: EdmType.String
                },
                {
                    label: 'G/L Account',
                    property: 'GLAccount',
                    type: EdmType.String
                },
                {
                    label: 'WBS Element',
                    property: 'WBSElement',
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
        },

        /**
         * Validate service quantity calculations
         * @param {Object} entry - Service entry data
         * @returns {Object} Validation result with calculated values
         */
        validateServiceCalculations: function (entry) {
            const result = {
                isValid: true,
                errors: [],
                calculatedValues: {}
            };

            try {
                // Validate and calculate service line total
                if (entry.Quantity && entry.ServiceUnitPrice) {
                    const quantity = parseFloat(entry.Quantity);
                    const unitPrice = parseFloat(entry.ServiceUnitPrice);

                    if (!isNaN(quantity) && !isNaN(unitPrice)) {
                        const calculatedTotal = quantity * unitPrice;
                        result.calculatedValues.ServiceLineTotal = calculatedTotal;

                        // Check if provided total matches calculated total (within tolerance)
                        if (entry.ServiceLineTotal) {
                            const providedTotal = parseFloat(entry.ServiceLineTotal);
                            const tolerance = 0.01; // 1 cent tolerance

                            if (Math.abs(calculatedTotal - providedTotal) > tolerance) {
                                result.isValid = false;
                                result.errors.push({
                                    field: 'ServiceLineTotal',
                                    message: `Service line total mismatch. Expected: ${calculatedTotal.toFixed(2)}, Got: ${providedTotal.toFixed(2)}`
                                });
                            }
                        }
                    } else {
                        result.isValid = false;
                        result.errors.push({
                            field: 'ServiceCalculation',
                            message: 'Invalid quantity or unit price for service calculation'
                        });
                    }
                }

                // Validate minimum quantity
                if (entry.Quantity) {
                    const quantity = parseFloat(entry.Quantity);
                    if (quantity <= 0) {
                        result.isValid = false;
                        result.errors.push({
                            field: 'Quantity',
                            message: 'Service quantity must be greater than zero'
                        });
                    }
                }

                // Validate unit price
                if (entry.ServiceUnitPrice) {
                    const unitPrice = parseFloat(entry.ServiceUnitPrice);
                    if (unitPrice < 0) {
                        result.isValid = false;
                        result.errors.push({
                            field: 'ServiceUnitPrice',
                            message: 'Service unit price cannot be negative'
                        });
                    }
                }

            } catch (error) {
                result.isValid = false;
                result.errors.push({
                    field: 'ServiceCalculation',
                    message: `Error in service calculation: ${error.message}`
                });
            }

            return result;
        }
    });
});