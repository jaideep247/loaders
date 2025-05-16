sap.ui.define([
    "sap/ui/core/BusyIndicator",
    "wbscreate/utils/DataTransformer",
    "wbscreate/utils/ErrorHandler",
    "wbscreate/utils/ResponseProcessor"
], function (
    BusyIndicator,
    DataTransformer,
    ErrorHandler,
    ResponseProcessor
) {
    "use strict";

    return class WBSODataService {
        /**
         * Constructor with dependency injection
         * @param {Object} options - Configuration options
         * @param {sap.ui.model.odata.v2.ODataModel} options.model - The OData V2 model instance
         * @param {ErrorHandler} [options.errorHandler] - Optional ErrorHandler instance
         * @param {DataTransformer} [options.dataTransformer] - Optional DataTransformer instance
         * @param {ResponseProcessor} [options.responseProcessor] - Optional ResponseProcessor instance
         */
        constructor(options = {}) {
            this._oModel = options.model;
            this._errorHandler = options.errorHandler || new ErrorHandler();
            this._dataTransformer = options.dataTransformer || new DataTransformer();
            this._responseProcessor = options.responseProcessor || new ResponseProcessor({
                dataTransformer: this._dataTransformer
            });

            if (!this._oModel || typeof this._oModel.create !== 'function') {
                throw new Error("OData model is required for WBSODataService and must be a valid ODataModel instance.");
            }

            this._isCancelled = false;
            this.lastResponseText = '';

            console.log("WBSODataService initialized with model:",
                this._oModel.getServiceUrl ? this._oModel.getServiceUrl() : "Unknown OData Service URL");
        }

        /**
         * Create a WBS Element using the Enterprise Project API
         * @param {Object} wbsElementData - WBS Element data (must include ProjectUUID)
         * @param {Object} callbacks - Callbacks for success, error
         * @param {function} callbacks.success - Success callback
         * @param {function} callbacks.error - Error callback
         * @returns {Object} The request object for potential abortion
         */
        createWBSElement(wbsElementData, callbacks) {
            console.log("WBSODataService: Attempting to create WBS Element");

            // Enhanced validation based on OData metadata
         /*   const requiredFields = ['ProjectElement', 'ProjectUUID', 'ProjectElementDescription'];
            const missingFields = requiredFields.filter(field => !wbsElementData[field]);

            if (missingFields.length > 0) {
                const errorMsg = `Missing required fields: ${missingFields.join(', ')}`;
                console.error("WBSODataService: " + errorMsg, wbsElementData);

                if (callbacks?.error) {
                    const validationErrorResult = this._responseProcessor.processValidationError(
                        errorMsg,
                        wbsElementData
                    );

                    callbacks.error({
                        message: errorMsg,
                        code: "INVALID_INPUT",
                        details: missingFields.map(field => ({
                            message: `Field '${field}' is required`,
                            target: field
                        })),
                        result: validationErrorResult
                    });
                }
                return {};
            }

            // Ensure mandatory fields from metadata are set
            const defaultValues = {
                EntProjectElementType: 'WBS',  // Default to WBS element type
                WBSElementIsBillingElement: false,
                WBSIsStatisticalWBSElement: false,
                IsProjectMilestone: '0'  // Default to not a milestone
            };*/

            const payload = {
            //    ...defaultValues,
                ...wbsElementData
            };

            BusyIndicator.show(0);

            return {
                request: () => {
                    return this._oModel.create("/A_EnterpriseProjectElement", payload, {
                        success: (oData, oResponse) => {
                            BusyIndicator.hide();
                            console.log("WBSODataService: Create successful", oData);
                            this.lastResponseText = oResponse?.responseText || oResponse?.body || JSON.stringify(oData);

                            try {
                                // Process the response including navigation properties
                                const result = this._responseProcessor.processSuccessResponse(
                                    oData,
                                    oResponse,
                                    payload
                                );

                                // Add additional processing for WBS-specific fields
                                if (result) {
                                    result.isBillingElement = payload.WBSElementIsBillingElement;
                                    result.isStatistical = payload.WBSIsStatisticalWBSElement;
                                    result.isMilestone = payload.IsProjectMilestone === '1';
                                }

                                console.log("WBSODataService: Successfully processed response data");
                                callbacks?.success?.(result);

                            } catch (parsingError) {
                                console.error("WBSODataService: Error processing response:",
                                    parsingError, "Raw Response:", this.lastResponseText);

                                const parserErrorResult = this._responseProcessor.processParserError(
                                    parsingError,
                                    payload
                                );

                                callbacks?.error?.({
                                    message: "Failed to process server response",
                                    code: "PARSE_ERROR",
                                    details: [{
                                        message: parsingError.message,
                                        stack: parsingError.stack
                                    }],
                                    result: parserErrorResult
                                });
                            }
                        },
                        error: (oError) => {
                            BusyIndicator.hide();
                            console.error("WBSODataService: Create failed", oError);

                            const errorInfo = this._errorHandler.extractODataError(oError);
                            console.error("WBSODataService: Extracted Error Info:", errorInfo);

                            // Handle specific SAP error codes
                            if (errorInfo.code === 'IWEP_ENT_001' || errorInfo.code === 'IWEP_ENT_002') {
                                errorInfo.message = "Project validation failed: " + errorInfo.message;
                            }

                            const errorResult = this._responseProcessor.processErrorResponse(
                                oError,
                                errorInfo,
                                payload
                            );

                            callbacks?.error?.({
                                ...errorInfo,
                                result: errorResult
                            });
                        }
                    });
                },
                cancel: () => {
                    this._isCancelled = true;
                    BusyIndicator.hide();
                }
            };
        }

        /**
         * Read a WBS Element by UUID (not ID, as per the metadata)
         * @param {String} projectElementUUID - The WBS Element UUID to read
         * @param {Object} [options] - Options for the read operation
         * @param {boolean} [options.expandProject=false] - Whether to expand the parent project
         * @param {boolean} [options.expandBlockFunc=false] - Whether to expand block functions
         * @param {Object} [callbacks] - Callbacks for success, error
         * @returns {Object} The request object
         */
        readWBSElement(projectElementUUID, options = {}, callbacks = {}) {
            if (!projectElementUUID) {
                const errorMsg = "ProjectElementUUID is required";
                console.error("WBSODataService: " + errorMsg);
                callbacks.error?.({
                    message: errorMsg,
                    code: "INVALID_INPUT"
                });
                return {};
            }

            // Build $expand based on options
            const expands = [];
            if (options.expandProject) expands.push("to_EnterpriseProject");
            if (options.expandBlockFunc) expands.push("to_EntProjElmntBlkFunc");

            const params = {};
            if (expands.length > 0) {
                params.$expand = expands.join(',');
            }

            BusyIndicator.show(0);

            return {
                request: () => {
                    return this._oModel.read(`/A_EnterpriseProjectElement('${projectElementUUID}')`, {
                        urlParameters: params,
                        success: (oData, oResponse) => {
                            BusyIndicator.hide();
                            console.log("WBSODataService: Read successful", oData);

                            // Process custom fields if they exist
                            if (oData) {
                                oData.customFields = {};
                                for (const key in oData) {
                                    if (key.startsWith('YY1_')) {
                                        oData.customFields[key] = oData[key];
                                    }
                                }
                            }

                            callbacks.success?.(oData);
                        },
                        error: (oError) => {
                            BusyIndicator.hide();
                            console.error("WBSODataService: Read failed", oError);

                            const errorInfo = this._errorHandler.extractODataError(oError);
                            callbacks.error?.(errorInfo);
                        }
                    });
                },
                cancel: () => {
                    this._isCancelled = true;
                    BusyIndicator.hide();
                }
            };
        }

        /**
         * Update a WBS Element
         * @param {String} projectElementUUID - The WBS Element UUID to update
         * @param {Object} changes - The changes to apply (only changed fields)
         * @param {Object} [callbacks] - Callbacks for success, error
         * @returns {Object} The request object
         */
        updateWBSElement(projectElementUUID, changes, callbacks = {}) {
            if (!projectElementUUID || !changes || Object.keys(changes).length === 0) {
                const errorMsg = "ProjectElementUUID and changes object with at least one property are required";
                console.error("WBSODataService: " + errorMsg);
                callbacks.error?.({
                    message: errorMsg,
                    code: "INVALID_INPUT"
                });
                return {};
            }

            // Filter out read-only fields based on metadata
            const readOnlyFields = [
                'ProjectElementUUID', 'ProjectUUID', 'ProjectInternalID',
                'CreatedByUser', 'CreationDateTime', 'LastChangeDateTime'
            ];

            const payload = Object.keys(changes).reduce((acc, key) => {
                if (!readOnlyFields.includes(key)) {
                    acc[key] = changes[key];
                }
                return acc;
            }, {});

            if (Object.keys(payload).length === 0) {
                const errorMsg = "No updatable fields provided";
                console.error("WBSODataService: " + errorMsg);
                callbacks.error?.({
                    message: errorMsg,
                    code: "INVALID_INPUT"
                });
                return {};
            }

            BusyIndicator.show(0);

            return {
                request: () => {
                    return this._oModel.update(`/A_EnterpriseProjectElement('${projectElementUUID}')`, payload, {
                        success: (oData, oResponse) => {
                            BusyIndicator.hide();
                            console.log("WBSODataService: Update successful", oData);
                            callbacks.success?.(oData);
                        },
                        error: (oError) => {
                            BusyIndicator.hide();
                            console.error("WBSODataService: Update failed", oError);

                            const errorInfo = this._errorHandler.extractODataError(oError);

                            // Handle field control errors specifically
                            if (errorInfo.details?.some(d => d.code === 'FIELD_CONTROL_ERROR')) {
                                errorInfo.message = "Field cannot be updated in current status";
                            }

                            callbacks.error?.(errorInfo);
                        }
                    });
                },
                cancel: () => {
                    this._isCancelled = true;
                    BusyIndicator.hide();
                }
            };
        }

        /**
         * Change the processing status of a WBS Element
         * @param {String} projectElementUUID - The WBS Element UUID
         * @param {String} newStatus - The new processing status
         * @param {Object} [callbacks] - Callbacks for success, error
         * @returns {Object} The request object
         */
        changeWBSElementStatus(projectElementUUID, newStatus, callbacks = {}) {
            if (!projectElementUUID || !newStatus) {
                const errorMsg = "ProjectElementUUID and newStatus are required";
                console.error("WBSODataService: " + errorMsg);
                callbacks.error?.({
                    message: errorMsg,
                    code: "INVALID_INPUT"
                });
                return {};
            }

            BusyIndicator.show(0);

            return {
                request: () => {
                    return this._oModel.callFunction(
                        "ChangeEntProjElmntProcgStatus",
                        {
                            method: "POST",
                            urlParameters: {
                                ProjectElementUUID: `guid'${projectElementUUID}'`,
                                ProcessingStatus: `'${newStatus}'`
                            },
                            success: (oData, oResponse) => {
                                BusyIndicator.hide();
                                console.log("WBSODataService: Status change successful", oData);
                                callbacks.success?.(oData);
                            },
                            error: (oError) => {
                                BusyIndicator.hide();
                                console.error("WBSODataService: Status change failed", oError);

                                const errorInfo = this._errorHandler.extractODataError(oError);
                                callbacks.error?.(errorInfo);
                            }
                        }
                    );
                },
                cancel: () => {
                    this._isCancelled = true;
                    BusyIndicator.hide();
                }
            };
        }

        /**
         * Get the OData model instance
         * @returns {sap.ui.model.odata.v2.ODataModel} OData model
         */
        getODataModel() {
            return this._oModel;
        }
    };
});