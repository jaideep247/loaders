sap.ui.define([
    "sap/ui/core/BusyIndicator",
    "serviceentrysheet/utils/DataTransformer",
    "serviceentrysheet/utils/ErrorHandler",
    "serviceentrysheet/utils/ResponseProcessor"
], function (
    BusyIndicator,
    DataTransformer,
    ErrorHandler,
    ResponseProcessor
) {
    "use strict";

    return class ODataService {
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
            // Ensure dependencies are instantiated if not provided
            this._errorHandler = options.errorHandler || new ErrorHandler();
            this._dataTransformer = options.dataTransformer || new DataTransformer();
            this._responseProcessor = options.responseProcessor || new ResponseProcessor({
                dataTransformer: this._dataTransformer,
                // Pass errorHandler to ResponseProcessor if it needs it
                // errorHandler: this._errorHandler
            });


            if (!this._oModel || typeof this._oModel.create !== 'function') { // Basic check for ODataModel
                throw new Error("OData model is required for ODataService and must be a valid ODataModel instance.");
            }

            // Initialize tracking variables if needed (e.g., for cancellation, though not fully implemented here)
            this._isCancelled = false;
            this.lastResponseText = ''; // For debugging

            console.log("ODataService initialized with model:",
                this._oModel.getServiceUrl ? this._oModel.getServiceUrl() : "Unknown OData Service URL");
        }

        /**
         * Create a single service entry sheet with all its items (Deep Insert)
         * @param {Object} serviceEntrySheetData - Complete service entry sheet data with header and items (transformed payload)
         * @param {Object} callbacks - Callbacks for success, error
         * @param {function} callbacks.success - Success callback, receives processed result object
         * @param {function} callbacks.error - Error callback, receives processed error object
         */
        createServiceEntrySheets(serviceEntrySheetData, callbacks) {
            console.log("ODataService: Attempting to create Service Entry Sheet"); // Avoid logging potentially large payload by default

            // Input validation - Use ResponseProcessor for consistency
            if (!serviceEntrySheetData || !serviceEntrySheetData.to_ServiceEntrySheetItem || !Array.isArray(serviceEntrySheetData.to_ServiceEntrySheetItem.results)) {
                const errorMsg = "Invalid or incomplete Service Entry Sheet data provided for creation.";
                console.error("ODataService: " + errorMsg, serviceEntrySheetData); // Log invalid data for debugging

                if (callbacks && callbacks.error) {
                    // Use ResponseProcessor for validation error structure
                    const validationErrorResult = this._responseProcessor.processValidationError(
                        errorMsg,
                        serviceEntrySheetData // Pass the data that failed validation
                    );

                    // Structure the error passed to the callback
                    callbacks.error({
                        message: errorMsg,
                        code: "INVALID_INPUT",
                        details: [{ message: errorMsg }], // Simple detail
                        result: validationErrorResult // Include the processed result
                    });
                }
                return;
            }

            BusyIndicator.show(0);

            // Use the standard ODataModel create method for deep insert
            this._oModel.create("/A_ServiceEntrySheet", serviceEntrySheetData, {
                success: (oData, oResponse) => {
                    BusyIndicator.hide();
                    console.log("ODataService: Create successful", oData); // Log success data

                    // Store the raw response text for potential debugging
                    this.lastResponseText = oResponse?.responseText || oResponse?.body || JSON.stringify(oData);

                    try {
                        // Use ResponseProcessor to handle successful response
                        const result = this._responseProcessor.processSuccessResponse(
                            oData,
                            oResponse,
                            serviceEntrySheetData // Pass original request for context if needed by processor
                        );

                        console.log("ODataService: Successfully processed response data");

                        if (callbacks && callbacks.success) {
                            callbacks.success(result);
                        }

                    } catch (parsingError) {
                        console.error("ODataService: Error processing successful response:",
                            parsingError, "Raw Response:", this.lastResponseText);
                        // Don't hide BusyIndicator again if already hidden
                        // BusyIndicator.hide(); // Already hidden in outer success

                        // Use ResponseProcessor for parser error structure
                        const parserErrorResult = this._responseProcessor.processParserError(
                            parsingError,
                            serviceEntrySheetData // Pass original request for context
                        );

                        // Call the error callback
                        if (callbacks && callbacks.error) {
                            callbacks.error({
                                message: parsingError.message || "Failed to process successful response.",
                                code: "PARSE_ERROR",
                                details: [{ message: parsingError.message, stack: parsingError.stack }] || [],
                                result: parserErrorResult // Include the processed result
                            });
                        }
                    }
                },
                error: (oError) => {
                    BusyIndicator.hide();
                    console.error("ODataService: Create failed", oError);

                    // Extract detailed error information using the ErrorHandler utility
                    const errorInfo = this._errorHandler.extractODataError(oError);
                    console.error("ODataService: Extracted Error Info:", errorInfo);

                    // Use ResponseProcessor for error response structure
                    const errorResult = this._responseProcessor.processErrorResponse(
                        oError,
                        errorInfo, // Pass extracted info
                        serviceEntrySheetData // Pass original request for context
                    );

                    // Call the error callback
                    if (callbacks && callbacks.error) {
                        callbacks.error({
                            message: errorInfo.message,
                            code: errorInfo.code,
                            details: errorInfo.details,
                            result: errorResult // Include the processed result
                        });
                    }
                }
            });
        }

        /**
         * Approve a Service Entry Sheet for GRN creation
         * @param {string} serviceEntrySheetId - The ID of the SES to approve.
         * @param {object} callbacks - Callbacks for success, error.
         */

        approveServiceEntrySheet(serviceEntrySheetId, approvalPayload) {
            // Configure retry parameters
            const maxRetries = 10;
            const initialBackoff = 5000; // 5 second

            return this._approveWithRetry(serviceEntrySheetId, approvalPayload, 0, maxRetries, initialBackoff);
        }

        /**
         * Private method to implement retry logic with exponential backoff and cancellation support
         * @private
         */
        _approveWithRetry(serviceEntrySheetId, approvalPayload, currentRetry, maxRetries, backoff) {
            const params = {
                ServiceEntrySheet: `${serviceEntrySheetId}`
            };

            return new Promise((resolve, reject) => {
                // Check for cancellation before starting the request
                if (this.processingCancelled) {
                    reject({
                        cancelled: true,
                        message: "Operation cancelled by user",
                        ServiceEntrySheet: serviceEntrySheetId
                    });
                    return;
                }

                // In ODataModel V2, callFunction doesn't return a request object with a request method
                // Instead we need to store the pending request differently
                const pendingRequest = this._oModel.callFunction("/SubmitForApproval", {
                    method: "POST",
                    urlParameters: params,
                    success: (oData, oResponse) => {
                        const statusCode = oResponse?.statusCode || 200;
                        const successMsg = `Service Entry Sheet ${serviceEntrySheetId} approved successfully. Status: ${statusCode}`;
                        console.log("ODataService: Approval successful", successMsg, oResponse);
                        resolve({
                            ServiceEntrySheet: serviceEntrySheetId,
                            message: successMsg,
                            status: statusCode
                        });
                    },
                    error: (oError) => {
                        const errorInfo = this._errorHandler.extractODataError(oError);
                        console.error(`ODataService: Approval failed for SES ${serviceEntrySheetId}`, errorInfo);

                        // Don't retry if processing was cancelled
                        if (this.processingCancelled) {
                            reject({
                                cancelled: true,
                                message: "Operation cancelled by user",
                                ServiceEntrySheet: serviceEntrySheetId
                            });
                            return;
                        }

                        // Check if this is a concurrency error and we should retry
                        const isConcurrencyError = errorInfo.details &&
                            errorInfo.details.some(detail =>
                                detail.code === 'ME/006'
                            );

                        if (isConcurrencyError && currentRetry < maxRetries) {
                            // Calculate exponential backoff with jitter
                            const jitter = Math.random() * 0.3 + 0.85; // Random factor between 0.85 and 1.15
                            const nextBackoff = backoff * 2 * jitter;
                            const nextRetry = currentRetry + 1;

                            console.log(`Retry ${nextRetry}/${maxRetries} for SES ${serviceEntrySheetId} after ${nextBackoff}ms due to concurrency issue`);

                            // Retry after backoff if not cancelled
                            const timeoutId = setTimeout(() => {
                                // Check again for cancellation before retry
                                if (this.processingCancelled) {
                                    reject({
                                        cancelled: true,
                                        message: "Operation cancelled by user during retry wait",
                                        ServiceEntrySheet: serviceEntrySheetId
                                    });
                                    return;
                                }

                                this._approveWithRetry(serviceEntrySheetId, approvalPayload, nextRetry, maxRetries, nextBackoff)
                                    .then(resolve)
                                    .catch(reject);
                            }, nextBackoff);

                            // Store timeout ID for potential cancellation
                            this._pendingTimeouts = this._pendingTimeouts || [];
                            this._pendingTimeouts.push(timeoutId);
                        } else {
                            // Either not a concurrency error or we've exceeded max retries
                            reject({
                                ServiceEntrySheet: serviceEntrySheetId,
                                message: errorInfo.message,
                                code: errorInfo.code,
                                details: errorInfo.details,
                                retriesAttempted: currentRetry
                            });
                        }
                    }
                });

                // Store the pending request for potential cancellation
                // Note: This depends on implementation details of the ODataModel
                // and might need adjustment based on your specific version
                if (pendingRequest && pendingRequest.request) {
                    // If pendingRequest has a request property that's the actual XHR
                    if (!this._activeXHRs) this._activeXHRs = [];
                    this._activeXHRs.push(pendingRequest.request);
                } else {
                    // For models where we can't directly access the XHR, store the request identifier
                    if (!this._pendingRequests) this._pendingRequests = [];
                    this._pendingRequests.push(pendingRequest);
                }
            });
        }


        /**
         * Get the OData model instance.
         * @returns {sap.ui.model.odata.v2.ODataModel} OData model
         */
        getModel() {
            return this._oModel;
        }

        /**
         * Read entity from OData service.
         * @param {String} entityPath - Entity path (e.g., "/A_ServiceEntrySheet('485')")
         * @param {Object} [urlParameters={}] - URL parameters (e.g., {$expand: "to_ServiceEntrySheetItem"})
         * @returns {Promise<object>} Promise that resolves with the entity data or rejects with extracted error info
         */
        readEntity(entityPath, urlParameters = {}) {
            console.log(`ODataService: Reading entity '${entityPath}' with params:`, urlParameters);
            return new Promise((resolve, reject) => {
                if (!entityPath || typeof entityPath !== 'string') {
                    const errorInfo = { code: "INVALID_PATH", message: "Invalid entity path provided for read.", details: [] };
                    console.error(errorInfo.message, entityPath);
                    return reject(errorInfo);
                }
                this._oModel.read(entityPath, {
                    urlParameters: urlParameters,
                    success: (oData) => {
                        console.log(`ODataService: Read successful for '${entityPath}'`);
                        resolve(oData); // Resolve with the data (often includes 'results' property for collections)
                    },
                    error: (oError) => {
                        console.error(`ODataService: Read failed for '${entityPath}'`, oError);
                        const errorInfo = this._errorHandler.extractODataError(oError);
                        reject(errorInfo); // Reject with the extracted error info
                    }
                });
            });
        }

        /**
         * Get metadata for an entity type.
         * @param {String} entityTypeName - The entity type name (e.g., "A_ServiceEntrySheetType")
         * @returns {Promise<Object|null>} Promise resolving with the OData entity type metadata object, or null on failure.
         */
        getEntityTypeMetadata(entityTypeName) {
            return this._oModel.getMetaModel().loaded().then(() => {
                const oMetaModel = this._oModel.getMetaModel();
                let qualifiedName = entityTypeName;

                // Attempt to qualify the name if not already done (e.g., adding namespace)
                if (entityTypeName && !entityTypeName.includes('.')) {
                    try {
                        // Heuristic to find the default namespace - might need adjustment
                        const serviceMetadata = oMetaModel.getServiceMetadata();
                        const schema = serviceMetadata?.dataServices?.schema?.find(s => s.entityType?.some(et => et.name === entityTypeName));
                        if (schema?.namespace) {
                            qualifiedName = `${schema.namespace}.${entityTypeName}`;
                        } else {
                            console.warn(`ODataService: Could not determine namespace for entity: ${entityTypeName}. Trying without.`);
                        }
                    } catch (metaError) {
                        console.error(`ODataService: Error accessing service metadata for namespace lookup: ${metaError}`);
                        // Proceed with the original name if namespace lookup fails
                    }
                }

                console.log(`ODataService: Getting metadata for qualified name: ${qualifiedName}`);
                const entityType = oMetaModel.getODataEntityType(qualifiedName);
                if (!entityType) {
                    console.warn(`ODataService: Metadata not found for entity type: ${qualifiedName}`);
                }
                return entityType; // Return the metadata object or null/undefined if not found
            }).catch(error => {
                console.error("ODataService: Error loading metadata model:", error);
                this._errorHandler.showError("Failed to load OData metadata.", error.message);
                return null; // Return null on error
            });
        }
    };
});
