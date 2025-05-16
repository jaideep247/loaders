sap.ui.define([
    "sap/ui/base/Object",
    "serviceentrysheet/utils/DataTransformer"
], function (BaseObject, DataTransformer) {
    "use strict";

    /**
     * ResponseProcessor
     * Centralized utility for processing OData responses (success and error)
     */
    return BaseObject.extend("serviceentrysheet.utils.ResponseProcessor", {

        constructor: function (options = {}) {
            this._dataTransformer = options.dataTransformer || new DataTransformer();
        },

        /**
         * Process successful OData response for service entry sheet creation
         * @param {Object} oData - The OData response object
         * @param {Object} oResponse - The raw response object
         * @param {Object} serviceEntrySheetData - The original request data
         * @returns {Object} Standardized result object
         */
        processSuccessResponse: function (oData, oResponse, serviceEntrySheetData) {
            console.log("ResponseProcessor: Processing successful response", oData);

            // Store raw response for debug/export
            const rawResponseText = oResponse?.body || oResponse?.data || JSON.stringify(oData);

            // Parse the response data
            const exportData = this._parseODataResponse(oData, rawResponseText);

            // Check for parsing errors
            if (!exportData || exportData.status === "Error") {
                throw new Error(exportData?.message || "Failed to parse successful response data.");
            }

            // Return standardized success result
            return {
                totalRecords: serviceEntrySheetData.to_ServiceEntrySheetItem.results.length,
                successfulRecords: serviceEntrySheetData.to_ServiceEntrySheetItem.results.length,
                failedRecords: 0,
                failedRecordsList: [],
                responseData: exportData,
                rawResponse: rawResponseText
            };
        },

        /**
         * Process error OData response for service entry sheet creation
         * @param {Object} oError - The error object from OData call
         * @param {Object} errorInfo - Extracted error info from ErrorHandler
         * @param {Object} serviceEntrySheetData - The original request data
         * @returns {Object} Standardized error result object
         */
        processErrorResponse: function (oError, errorInfo, serviceEntrySheetData) {
            console.log("ResponseProcessor: Processing error response", errorInfo);
            // Get the primary error detail (first one in the array)
            const primaryError = errorInfo.details && errorInfo.details.length > 0 ?
                errorInfo.details[0] : { code: errorInfo.code, message: errorInfo.message };

            return {
                totalRecords: serviceEntrySheetData.to_ServiceEntrySheetItem.results.length,
                successfulRecords: 0,
                failedRecords: serviceEntrySheetData.to_ServiceEntrySheetItem.results.length,
                failedRecordsList: serviceEntrySheetData.to_ServiceEntrySheetItem.results.map(
                    (item, index) => ({
                        index: index,
                        entry: item,
                        error: primaryError.message,
                        errorCode: primaryError.code,
                        details: errorInfo.details
                    })
                ),
                rawResponse: errorInfo.rawError
            };
        },

        /**
         * Process validation error (before OData call)
         * @param {String} errorMsg - Error message 
         * @param {Object} serviceEntrySheetData - The original request data (possibly incomplete)
         * @returns {Object} Standardized error result object
         */
        processValidationError: function (errorMsg, serviceEntrySheetData) {
            console.log("ResponseProcessor: Processing validation error", errorMsg);

            const itemCount = (serviceEntrySheetData?.to_ServiceEntrySheetItem?.results?.length || 0);

            return {
                totalRecords: itemCount,
                successfulRecords: 0,
                failedRecords: itemCount,
                failedRecordsList: (serviceEntrySheetData?.to_ServiceEntrySheetItem?.results || []).map(
                    (item, index) => ({
                        index: index,
                        entry: item,
                        error: errorMsg,
                        errorCode: "INVALID_INPUT",
                        details: []
                    })
                )
            };
        },

        /**
         * Process parser error (when parsing successful response fails)
         * @param {Error} parsingError - The parsing error
         * @param {Object} serviceEntrySheetData - The original request data
         * @returns {Object} Standardized error result object with parser error
         */
        processParserError: function (parsingError, serviceEntrySheetData) {
            console.log("ResponseProcessor: Processing parser error", parsingError);

            const errorInfo = {
                message: parsingError.message || "Failed to process successful response.",
                code: "PARSE_ERROR",
                details: [parsingError.stack] || []
            };

            return {
                totalRecords: serviceEntrySheetData.to_ServiceEntrySheetItem.results.length,
                successfulRecords: 0,
                failedRecords: serviceEntrySheetData.to_ServiceEntrySheetItem.results.length,
                failedRecordsList: serviceEntrySheetData.to_ServiceEntrySheetItem.results.map(
                    (item, index) => ({
                        index: index,
                        entry: item,
                        error: errorInfo.details[0].message,
                        errorCode: errorInfo.details[0].code,
                        details: errorInfo.details
                    })
                )
            };
        },

        /**
         * Extract record data from batch processing results for success cases
         * @param {Object} result - The success result from ODataService
         * @param {Object} originalItemData - The original item data
         * @returns {Object} Merged record with original and response data
         */
        extractSuccessRecordData: function (result, originalItemData) {
            // Find matching item data in the response
            const responseItem = result.responseData?.items?.find(
                resItem => resItem.PurchaseOrderItem === originalItemData.PurchaseOrderItem &&
                    (resItem.Service === originalItemData.Service)
            ) || {};

            // Create success record with merged data
            return {
                ...originalItemData,
                ServiceEntrySheet: result.responseData?.header?.ServiceEntrySheet,
                ServiceEntrySheetItem: responseItem.ServiceEntrySheetItem,
                Status: "Success",
                Message: result.responseData?.message || "Processed successfully."
            };
        },

        /**
         * Extract error details for failed records
         * @param {Object} error - The error object from ODataService
         * @param {Object} originalItemData - The original item data
         * @returns {Object} Error details object
         */
        extractErrorDetails: function (error, originalItemData) {
            const primaryError = error.details && error.details.length > 0 ?
                error.details[0] : { code: error.code, message: error.message };

            return {
                entry: originalItemData,
                error: primaryError.message || "Processing failed.",
                errorCode: primaryError.code || "ERROR",
                details: error.details || []
            };
        },

        /**
         * Parse OData response to extract values for export
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

                // Extract header details
                const header = {
                    ServiceEntrySheetName: data.ServiceEntrySheetName || "",
                    ServiceEntrySheet: data.ServiceEntrySheet || "",
                    Supplier: data.Supplier || "",
                    PurchasingOrganization: data.PurchasingOrganization || "",
                    PurchasingGroup: data.PurchasingGroup || "",
                    PostingDate: this._dataTransformer.parseODataDate(data.PostingDate),
                    ApprovalStatus: data.ApprovalStatus || "",
                    SESWorkflowStatus: data.SESWorkflowStatus || "",
                    PurchaseOrder: data.PurchaseOrder || "",
                    ServiceEntrySheetUUID: data.ServiceEntrySheetUUID || ""
                };

                // Extract items
                const items = [];
                if (data.to_ServiceEntrySheetItem && data.to_ServiceEntrySheetItem.results) {
                    data.to_ServiceEntrySheetItem.results.forEach(item => {
                        items.push({
                            ServiceEntrySheetItem: item.ServiceEntrySheetItem,
                            AccountAssignmentCategory: item.AccountAssignmentCategory,
                            ConfirmedQuantity: item.ConfirmedQuantity,
                            Plant: item.Plant,
                            NetAmount: item.NetAmount,
                            NetPriceAmount: item.NetPriceAmount,
                            PurchaseOrder: item.PurchaseOrder,
                            PurchaseOrderItem: item.PurchaseOrderItem,
                            ServicePerformanceDate: this._dataTransformer.parseODataDate(item.ServicePerformanceDate),
                            ServicePerformanceEndDate: this._dataTransformer.parseODataDate(item.ServicePerformanceEndDate),
                            Service: item.Service || "",
                            ServiceEntrySheetItemDesc: item.ServiceEntrySheetItemDesc || "",
                            QuantityUnit: item.QuantityUnit || "",
                            Currency: item.Currency || ""
                        });
                    });
                }

                return {
                    status: "Success",
                    message: `Service Entry Sheet '${header.ServiceEntrySheet}' created successfully.`,
                    header: header,
                    items: items
                };

            } catch (e) {
                console.error("ResponseProcessor: Error parsing response:", e, "Input:", responseInput);
                return {
                    status: "Error",
                    message: `Failed to parse Service Entry Sheet response: ${e.message}`,
                    header: {},
                    items: []
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
                header: {
                    ErrorMessage: message,
                    ErrorCode: code
                },
                items: []
            };
        }
    });
});