sap.ui.define([
    "sap/ui/base/Object",
    "wbscreate/utils/DataTransformer"
], function (BaseObject, DataTransformer) {
    "use strict";

    /**
     * ResponseProcessor
     * Centralized utility for processing OData responses (success and error)
     * for WBS Element creation
     */
    return BaseObject.extend("wbscreate.utils.ResponseProcessor", {

        constructor: function (options = {}) {
            this._dataTransformer = options.dataTransformer || new DataTransformer();
        },

        /**
         * Process successful OData response for WBS Element creation
         * @param {Object} oData - The OData response object
         * @param {Object} oResponse - The raw response object
         * @param {Object} wbsElementData - The original request data
         * @returns {Object} Standardized result object
         */
        processSuccessResponse: function (oData, oResponse, wbsElementData) {
            console.log("ResponseProcessor: Processing successful WBS response", oData);

            // Store raw response for debug/export
            const rawResponseText = oResponse?.body || oResponse?.data || JSON.stringify(oData);

            // Parse the response data
            const exportData = this._parseODataResponse(oData, rawResponseText);

            // Check for parsing errors
            if (!exportData || exportData.status === "Error") {
                throw new Error(exportData?.message || "Failed to parse successful WBS response data.");
            }

            // Return standardized success result
            return {
                totalRecords: 1, // WBS Element creation is typically one record
                successfulRecords: 1,
                failedRecords: 0,
                failedRecordsList: [],
                responseData: exportData,
                rawResponse: rawResponseText
            };
        },

        /**
         * Process error OData response for WBS Element creation
         * @param {Object} oError - The error object from OData call
         * @param {Object} errorInfo - Extracted error info from ErrorHandler
         * @param {Object} wbsElementData - The original request data
         * @returns {Object} Standardized error result object
         */
        processErrorResponse: function (oError, errorInfo, wbsElementData) {
            console.log("ResponseProcessor: Processing error response for WBS element", errorInfo);
            // Get the primary error detail (first one in the array)
            const primaryError = errorInfo.details && errorInfo.details.length > 0 ?
                errorInfo.details[0] : { code: errorInfo.code, message: errorInfo.message };

            return {
                totalRecords: 1, // WBS Element creation is typically one record
                successfulRecords: 0,
                failedRecords: 1,
                failedRecordsList: [{
                    index: 0,
                    entry: wbsElementData,
                    error: primaryError.message,
                    errorCode: primaryError.code,
                    details: errorInfo.details
                }],
                rawResponse: errorInfo.rawError
            };
        },

        /**
         * Process validation error (before OData call)
         * @param {String} errorMsg - Error message 
         * @param {Object} wbsElementData - The original request data (possibly incomplete)
         * @returns {Object} Standardized error result object
         */
        processValidationError: function (errorMsg, wbsElementData) {
            console.log("ResponseProcessor: Processing validation error for WBS element", errorMsg);

            return {
                totalRecords: 1,
                successfulRecords: 0,
                failedRecords: 1,
                failedRecordsList: [{
                    index: 0,
                    entry: wbsElementData,
                    error: errorMsg,
                    errorCode: "INVALID_INPUT",
                    details: []
                }]
            };
        },

        /**
         * Process parser error (when parsing successful response fails)
         * @param {Error} parsingError - The parsing error
         * @param {Object} wbsElementData - The original request data
         * @returns {Object} Standardized error result object with parser error
         */
        processParserError: function (parsingError, wbsElementData) {
            console.log("ResponseProcessor: Processing parser error for WBS element", parsingError);

            const errorInfo = {
                message: parsingError.message || "Failed to process successful WBS response.",
                code: "PARSE_ERROR",
                details: [parsingError.stack] || []
            };

            return {
                totalRecords: 1,
                successfulRecords: 0,
                failedRecords: 1,
                failedRecordsList: [{
                    index: 0,
                    entry: wbsElementData,
                    error: errorInfo.message,
                    errorCode: errorInfo.code,
                    details: errorInfo.details
                }]
            };
        },

        /**
         * Extract WBS Element success data from a successful response
         * @param {Object} result - The success result from ODataService
         * @param {Object} originalWBSData - The original WBS Element data
         * @returns {Object} Processed success record data
         */
        extractWBSSuccessData: function (result, originalWBSData) {
            if (!result) {
                console.warn("ResponseProcessor: No result data provided");
                return {};
            }

            try {
                // Create base success record with important fields
                const successRecord = {
                    // Include the original WBS data
                    ...originalWBSData,

                    // Add key response fields
                    WBSElementID: result.WBSElementID || result.WBSElementExternalID || "",
                    ProjectElement: result.ProjectElement || originalWBSData.ProjectElement || "",
                    ProjectUUID: result.ProjectUUID || originalWBSData.ProjectUUID || "",
                    WBSElementName: result.WBSElementName || originalWBSData.WBSElementName || "",
                    WBSElementStatus: "Created",
                    Status: "Success",

                    // Store raw response for debugging/logging
                    _rawResponse: result
                };

                // Add any additional fields from the response that aren't in the original data
                Object.keys(result).forEach(key => {
                    if (!successRecord[key] && result[key] !== null && result[key] !== undefined) {
                        successRecord[key] = result[key];
                    }
                });

                // Add messages from response if available
                if (result.Message || result.message) {
                    successRecord.Message = result.Message || result.message || "WBS Element created successfully";
                } else {
                    successRecord.Message = "WBS Element created successfully";
                }

                // Format the message for display
                successRecord.statusMessage = `${successRecord.WBSElementID} created successfully`;

                return successRecord;
            } catch (error) {
                console.error("ResponseProcessor: Error extracting WBS success data", error);

                // Return basic success record on error
                return {
                    ...originalWBSData,
                    WBSElementID: result.WBSElementID || "Unknown",
                    Status: "Success",
                    Message: "WBS Element created, but response processing failed",
                    statusMessage: result.WBSElementID ? `${result.WBSElementID} created` : "WBS Element created",
                    _rawResponse: result,
                    _processingError: error.message
                };
            }
        },

        /**
         * Extract error details for failed WBS Element creation
         * @param {Object} error - The error object from ODataService
         * @param {Object} originalWBSData - The original WBS Element data
         * @returns {Object} Error details object
         */
        extractErrorDetails: function (error, originalWBSData) {
            const primaryError = error.details && error.details.length > 0 ?
                error.details[0] : { code: error.code, message: error.message };

            return {
                entry: originalWBSData,
                error: primaryError.message || "WBS Element creation failed.",
                errorCode: primaryError.code || "ERROR",
                details: error.details || []
            };
        },

        /**
         * Parse OData response to extract values for export specific to WBS Element creation
         * @param {Object|string} responseInput - OData object or response string
         * @param {string} rawTextForError - Optional raw text for error context
         * @returns {Object} Extracted data in standard format
         * @private
         */
        _parseODataResponse: function (responseInput, rawTextForError = "") {
            let response = null;
            let isInputString = typeof responseInput === 'string';

            try {
                if (isInputString) {
                    // Handle string input (multipart or JSON)
                    if (responseInput.includes('--') && responseInput.includes('Content-Type: application/json')) {
                        console.warn("ResponseProcessor: Received multipart string - attempting extraction");
                        const jsonPartMatch = responseInput.match(/\{.*\}/s);
                        if (jsonPartMatch) {
                            response = JSON.parse(jsonPartMatch[0]);
                            console.log("ResponseProcessor: Extracted JSON from multipart");
                        } else {
                            throw new Error("Could not find JSON part in multipart response");
                        }
                    } else if (responseInput.trim().startsWith('{')) {
                        response = JSON.parse(responseInput);
                    } else {
                        throw new Error("Input string is not recognizable JSON or multipart");
                    }
                } else if (typeof responseInput === 'object' && responseInput !== null) {
                    // Input is already an object
                    response = responseInput.d ? responseInput : { d: responseInput };
                    console.log("ResponseProcessor: Processing direct object input");
                } else {
                    throw new Error("Invalid input type for parsing");
                }

                // Check for error structure
                if (response.error) {
                    console.warn("ResponseProcessor: Parsed object contains error structure");
                    return this._formatParsedError(response.error);
                }

                // Validate expected data structure
                if (!response || !response.d) {
                    console.error("ResponseProcessor: Invalid structure - missing 'd' property", response);
                    throw new Error("Invalid response structure (missing 'd')");
                }

                const data = response.d;

                // Extract WBS Element details
                const wbsElement = {
                    WBSElementID: data.WBSElementID || "",
                    WBSElementExternalID: data.WBSElementExternalID || "",
                    ProjectElement: data.ProjectElement || "",
                    ProjectUUID: data.ProjectUUID || "",
                    WBSElementName: data.WBSElementName || "",
                    PlannedStartDate: this._dataTransformer.parseODataDate(data.PlannedStartDate),
                    PlannedEndDate: this._dataTransformer.parseODataDate(data.PlannedEndDate),
                    ResponsibleCostCenter: data.ResponsibleCostCenter || "",
                    CostCenter: data.CostCenter || "",
                    CompanyCode: data.CompanyCode || "",
                    ProfitCenter: data.ProfitCenter || "",
                    ControllingArea: data.ControllingArea || "",
                    BillingElement: data.BillingElement === true || data.BillingElement === "X" || data.BillingElement === "true",
                    OldProjectID: data.OldProjectID || "",
                    CreatedAt: this._dataTransformer.parseODataDate(data.CreatedAt),
                    CreatedBy: data.CreatedBy || "",
                    LastChangedAt: this._dataTransformer.parseODataDate(data.LastChangedAt),
                    LastChangedBy: data.LastChangedBy || ""
                };

                // Add custom fields if present
                const customFields = [
                    "SiteType", "ATMID", "District", "State", "BankName",
                    "ATMCount", "NatureOfWBS", "SAPSiteID", "Address",
                    "Deployment", "BankLoadPercentage", "ERPRelocation",
                    "ReferenceATMID", "ERPSiteIDReport", "UserDefinedField1",
                    "Categorization", "ActualStartDate", "PostalCode",
                    "ActualEndDate", "ERPRelocationRefSiteID"
                ];

                customFields.forEach(field => {
                    if (data[field] !== undefined) {
                        wbsElement[field] = data[field];
                    }
                });

                return {
                    status: "Success",
                    message: `WBS Element '${wbsElement.WBSElementID}' created successfully.`,
                    wbsElement: wbsElement
                };

            } catch (e) {
                console.error("ResponseProcessor: Error parsing WBS response:", e, "Input:", responseInput);
                return {
                    status: "Error",
                    message: `Failed to parse WBS Element response: ${e.message}`,
                    wbsElement: {}
                };
            }
        },

        /**
         * Format parsed OData error into standard structure
         * @param {Object} errorObj - Parsed error object
         * @returns {Object} Standardized error structure
         * @private
         */
        _formatParsedError: function (errorObj) {
            let message = "Unknown error";
            let code = "UNKNOWN_ERROR";
            let details = [];

            if (errorObj && errorObj.message) {
                message = errorObj.message.value ||
                    (typeof errorObj.message === "string" ?
                        errorObj.message : JSON.stringify(errorObj.message));
            }

            if (errorObj && errorObj.code) {
                code = errorObj.code;
            }

            if (errorObj && errorObj.innererror && errorObj.innererror.errordetails) {
                details = errorObj.innererror.errordetails.map(detail => ({
                    code: detail.code,
                    message: detail.message,
                    severity: detail.severity,
                    target: detail.target
                }));
            }

            return {
                status: "Error",
                message: message,
                errorCode: code,
                errorDetails: details,
                wbsElement: {
                    ErrorMessage: message,
                    ErrorCode: code
                }
            };
        }
    });
});