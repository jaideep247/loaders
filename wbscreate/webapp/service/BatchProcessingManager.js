sap.ui.define([
    "sap/ui/model/json/JSONModel",
    "sap/ui/core/Fragment",
    "sap/ui/core/BusyIndicator",
    "wbscreate/utils/ErrorHandler",
    "wbscreate/utils/DataTransformer",
    "wbscreate/utils/ResponseProcessor"
], function (JSONModel, Fragment, BusyIndicator, ErrorHandler, DataTransformer, ResponseProcessor) {
    "use strict";

    /**
     * WBSElementManager
     * Centralized manager for WBS Element creation operations.
     */
    return class WBSElementManager {
        /**
         * Constructor with dependency injection
         * @param {Object} options - Configuration options
         */
        constructor(options = {}) {
            this.oController = options.controller;
            this._errorHandler = options.errorHandler || new ErrorHandler();
            this._dataTransformer = options.dataTransformer || new DataTransformer();
            this._oDataService = options.oDataService;
            this._responseProcessor = options.responseProcessor || new ResponseProcessor({
                dataTransformer: this._dataTransformer
            });

            if (!this.oController) {
                console.warn("WBSElementManager: Controller instance not provided. UI updates might fail.");
            }

            if (!this._oDataService) {
                throw new Error("WBSElementManager requires an instance of ODataService.");
            }

            // Initialize processing state
            this.processingCancelled = false;
            this.startTime = null;
            this.totalBatches = 0;
            this.currentBatchIndex = 0;

            // Define field mappings for WBS Element creation
            this._fieldMappings = {
                'ProjectElement': 'ProjectElement',
                'ProjectUUID': 'ProjectUUID',
                'Name': 'WBSElementName',
                'PlannedStartDate': 'PlannedStartDate',
                'PlannedEndDate': 'PlannedEndDate',
                'Responsible': 'ResponsibleCostCenter',
                'CostCenter': 'CostCenter',
                'CompanyCode': 'CompanyCode',
                'ProfitCenter': 'ProfitCenter',
                'ControllingArea': 'ControllingArea',
                'BillingElement': 'BillingElement',
                'OldProjectID': 'OldProjectID',
                'ExactWBSCode': 'WBSElementExternalID',
                'SiteType': 'SiteType',
                'ATMID': 'ATMID',
                'District': 'District',
                'State': 'State',
                'BankName': 'BankName',
                'ATMCount': 'ATMCount',
                'NatureOfWBS': 'NatureOfWBS',
                'SAPSiteID': 'SAPSiteID',
                'Address': 'Address',
                'Deployment': 'Deployment',
                'BankLoadPercentage': 'BankLoadPercentage',
                'ERPRelocation': 'ERPRelocation',
                'RefATMID': 'ReferenceATMID',
                'ERPSiteIDReport': 'ERPSiteIDReport',
                'UDF1': 'UserDefinedField1',
                'Categorization': 'Categorization',
                'ActualStartDate': 'ActualStartDate',
                'PostalCode': 'PostalCode',
                'ActualEndDate': 'ActualEndDate',
                'ERPRelocationRefSiteID': 'ERPRelocationRefSiteID'
            };

            // Initialize response data structure
            this._resetResponseData();
        }

        /**
         * Reset response data structure
         * @private
         */
        _resetResponseData() {
            this.responseData = {
                totalRecords: 0,
                processedCount: 0,
                successCount: 0,
                failureCount: 0,
                successRecords: [],
                errorRecords: [],
                allMessages: [],
                processedWBS: 0,
                totalWBS: 0
            };
        }

        /**
         * Initialize WBS Element creation UI (Dialog)
         * @param {Number} totalRecords - Total number of WBS Elements to create
         * @returns {Promise<sap.m.Dialog>} Promise resolving with the batch processing dialog instance
         */
        initWBSCreationUI(totalRecords) {
            console.log("WBSElementManager: Initializing WBS Element creation UI", { totalRecords });

            return new Promise((resolve, reject) => {
                try {
                    // Set totals
                    this.totalBatches = totalRecords;
                    this.responseData.totalRecords = totalRecords;
                    this.responseData.totalWBS = totalRecords;

                    // Initialize tracking variables
                    this.currentBatchIndex = 0;
                    this.startTime = new Date();
                    this.processingCancelled = false;

                    // Reset response data counts (keep totals)
                    this.responseData.processedCount = 0;
                    this.responseData.successCount = 0;
                    this.responseData.failureCount = 0;
                    this.responseData.successRecords = [];
                    this.responseData.errorRecords = [];
                    this.responseData.allMessages = [];
                    this.responseData.processedWBS = 0;

                    // Initialize WBS display model for the dialog
                    const wbsDisplayModel = new JSONModel({
                        status: "Initializing...",
                        error: "",
                        totalWBS: this.totalBatches,
                        currentWBS: 0,
                        processedWBS: 0,
                        totalEntries: totalRecords,
                        processedEntries: 0,
                        successCount: 0,
                        failureCount: 0,
                        timeRemaining: "Calculating...",
                        processingSpeed: "Calculating...",
                        wbsProgress: 0,
                        entriesProgress: 0,
                        startTime: this.startTime.toISOString(),
                        isCompleted: false,
                        isError: false,
                        successRecords: [],
                        errorRecords: []
                    });

                    // Set model on controller's view if available
                    if (this.oController && this.oController.getView) {
                        this.oController.getView().setModel(wbsDisplayModel, "wbsDisplay");
                        console.log("WBSElementManager: wbsDisplay model set on view.");
                    } else {
                        console.warn("WBSElementManager: Cannot set wbsDisplay model - Controller or View not available.");
                    }

                    // Load and open the WBS creation dialog
                    this._loadWBSCreationDialog()
                        .then((dialog) => {
                            console.log("WBSElementManager: WBS creation dialog loaded/opened successfully.", dialog);
                            resolve(dialog);
                        })
                        .catch((error) => {
                            console.error("WBSElementManager: Error loading/opening WBS creation dialog:", error);
                            this._errorHandler.showError("Could not initialize WBS Element creation display.", error.message);
                            reject(error);
                        });

                } catch (error) {
                    console.error("WBSElementManager: Critical error in initWBSCreationUI:", error);
                    this._errorHandler.showError("Failed to initialize WBS Element creation.", error.message);
                    reject(error);
                }
            });
        }

        /**
         * Start batch creation of WBS Elements.
         * @param {Array} data - Array of WBS Element data to process.
         * @param {Object} [options] - Additional options.
         * @returns {Promise<Object>} Promise that resolves with an object containing the final responseData and a cancelled flag.
         */
        startWBSElementCreation(data, options = {}) {
            console.log("WBSElementManager: Starting WBS Element creation with:", {
                itemCount: data ? data.length : 0,
                options: options
            });

            return new Promise((resolve, reject) => {
                try {
                    if (!data || data.length === 0) {
                        console.warn("WBSElementManager: No data provided to process.");
                        this._errorHandler.showWarning("No data available to process.");
                        resolve({ responseData: this.responseData, cancelled: false });
                        return;
                    }

                    const totalRecords = data.length;

                    console.log(`WBSElementManager: Processing ${totalRecords} WBS Elements.`);

                    // Reset internal state
                    this._resetResponseData();
                    this.processingCancelled = false;

                    // Initialize the UI Dialog
                    this.initWBSCreationUI(totalRecords)
                        .then(() => {
                            console.log("WBSElementManager: UI Initialized. Starting WBS Element creation...");

                            // Start processing WBS Elements
                            return this._processWBSElements(data, 0);
                        })
                        .then((finalProcessingResult) => {
                            console.log("WBSElementManager: WBS Element creation loop finished.", finalProcessingResult);

                            // Handle overall completion (update UI state)
                            this._handleWBSCreationComplete(finalProcessingResult.cancelled);

                            // Resolve the main promise with the collected results and cancellation status
                            resolve({
                                responseData: this.responseData,
                                cancelled: finalProcessingResult.cancelled
                            });
                        })
                        .catch((error) => {
                            console.error("WBSElementManager: Error during WBS Element creation:", error);

                            // Update UI to show error state
                            this._updateWBSDisplay({
                                status: "Error during processing!",
                                error: error.message || "An unknown error occurred.",
                                isCompleted: true,
                                isError: true
                            });

                            // Ensure export buttons etc. are handled
                            this._handleWBSCreationComplete(false, true);

                            // Show error message to user
                            this._errorHandler.showError(
                                "WBS Element Creation Failed: " + (error.message || "Unknown error"),
                                error.details || (error.stack ? error.stack.substring(0, 300) : "")
                            );

                            // Reject the main promise
                            reject(error);
                        });

                } catch (topLevelError) {
                    console.error("WBSElementManager: Top-level error setting up WBS Element creation:", topLevelError);
                    this._errorHandler.showError(
                        "Critical Error: Failed to start WBS Element creation.",
                        topLevelError.message
                    );
                    reject(topLevelError);
                }
            });
        }

        /**
         * Process WBS Elements recursively.
         * @param {Array} wbsElements - Array of WBS Element data.
         * @param {Number} currentIndex - The index of the current WBS Element.
         * @returns {Promise<Object>} Promise that resolves with { cancelled: boolean } when processing is complete or cancelled.
         * @private
         */
        _processWBSElements(wbsElements, currentIndex) {
            return new Promise((resolve, reject) => {
                // Check for Completion or Cancellation
                if (this.processingCancelled) {
                    console.log(`WBSElementManager: Processing cancelled at WBS index ${currentIndex}.`);
                    resolve({ cancelled: true });
                    return;
                }

                if (currentIndex >= wbsElements.length) {
                    console.log("WBSElementManager: All WBS Elements processed.");
                    resolve({ cancelled: false });
                    return;
                }

                // Prepare for Current WBS Element
                const currentWBS = wbsElements[currentIndex];
                this.currentBatchIndex = currentIndex;

                // Extract WBS Element ID for display
                const wbsID = currentWBS.ExactWBSCode || currentWBS.WBSElementExternalID || `WBS-${currentIndex + 1}`;

                console.log(`WBSElementManager: Processing WBS Element ${currentIndex + 1}/${wbsElements.length}: ${wbsID}`);

                // Update UI display for the current WBS Element
                this._updateWBSDisplay({
                    status: `Processing ${wbsID} (${currentIndex + 1} of ${wbsElements.length})...`,
                    currentWBS: currentIndex + 1,
                    processedWBS: currentIndex,
                    wbsProgress: Math.round(((currentIndex) / wbsElements.length) * 100)
                });

                // Transform data and Call OData Service
                try {
                    // Use DataTransformer to create the WBS Element payload
                    let wbsElementPayload = this._transformWBSElementData(currentWBS);

                    if (!wbsElementPayload) {
                        throw new Error(`DataTransformer failed to create payload for WBS Element ${wbsID}`);
                    }

                    console.log(`WBSElementManager: Payload for ${wbsID}:`, JSON.stringify(wbsElementPayload));

                    // Call the OData service to create this WBS Element
                    let currentRequest = this._oDataService.createWBSElement(wbsElementPayload, {
                        success: (result) => {
                            console.log(`WBSElementManager: Success callback received for ${wbsID}`, result);
                            if (this.processingCancelled) {
                                console.log(`WBSElementManager: Processing was cancelled during OData call for ${wbsID}`);
                                resolve({ cancelled: true });
                                return;
                            }

                            // Extract success record data
                            const successRecord = this._responseProcessor.extractWBSSuccessData(
                                result,
                                currentWBS
                            );

                            // Store the success record
                            this._handleRecord(
                                true,
                                successRecord,
                                null,
                                currentIndex
                            );

                            this.responseData.processedWBS++;

                            // Update UI
                            this._updateWBSDisplay({
                                processedWBS: this.responseData.processedWBS,
                                wbsProgress: Math.round((this.responseData.processedWBS / wbsElements.length) * 100)
                            });

                            // Add a small delay before processing the next WBS Element
                            const timeoutId = setTimeout(() => {
                                // Check for cancellation before starting next WBS Element
                                if (this.processingCancelled) {
                                    resolve({ cancelled: true });
                                    return;
                                }

                                this._processWBSElements(wbsElements, currentIndex + 1)
                                    .then(resolve)
                                    .catch(reject);
                            }, 500);

                            // Store timeout ID for potential cancellation
                            this._pendingTimeouts = this._pendingTimeouts || [];
                            this._pendingTimeouts.push(timeoutId);
                        },
                        error: (error) => {
                            console.error(`WBSElementManager: Error callback received for ${wbsID}`, error);
                            if (this.processingCancelled) {
                                console.log(`WBSElementManager: Processing was cancelled during error for ${wbsID}`);
                                resolve({ cancelled: true });
                                return;
                            }

                            // Extract error details
                            const errorDetail = this._responseProcessor.extractErrorDetails(
                                error,
                                currentWBS
                            );

                            this._handleRecord(
                                false,
                                null,
                                errorDetail,
                                currentIndex
                            );

                            this.responseData.processedWBS++;

                            // Update UI
                            this._updateWBSDisplay({
                                processedWBS: this.responseData.processedWBS,
                                wbsProgress: Math.round((this.responseData.processedWBS / wbsElements.length) * 100)
                            });

                            // Continue with the next WBS Element despite the error
                            console.warn(`WBSElementManager: Continuing to next WBS Element after failure in ${wbsID}.`);

                            // Add a small delay before processing the next WBS Element after an error
                            const timeoutId = setTimeout(() => {
                                // Check for cancellation before starting next WBS Element
                                if (this.processingCancelled) {
                                    resolve({ cancelled: true });
                                    return;
                                }

                                this._processWBSElements(wbsElements, currentIndex + 1)
                                    .then(resolve)
                                    .catch(reject);
                            }, 500);

                            // Store timeout ID for potential cancellation
                            this._pendingTimeouts = this._pendingTimeouts || [];
                            this._pendingTimeouts.push(timeoutId);
                        }
                    });

                    // Store request for potential cancellation
                    if (currentRequest && currentRequest.request) {
                        const xhr = currentRequest.request();
                        if (!this._activeXHRs) this._activeXHRs = [];
                        this._activeXHRs.push(xhr);
                    }
                } catch (processingError) {
                    console.error(`WBSElementManager: Error preparing/initiating processing for ${wbsID}:`, processingError);

                    // Mark this WBS Element as failed due to this local error
                    const errorDetail = {
                        entry: currentWBS,
                        error: `Failed to process ${wbsID}: ${processingError.message}`,
                        errorCode: "LOCAL_PROCESSING_ERROR",
                        details: [processingError.stack]
                    };
                    this._handleRecord(false, null, errorDetail, currentIndex);

                    this.responseData.processedWBS++;

                    // Update UI
                    this._updateWBSDisplay({
                        processedWBS: this.responseData.processedWBS,
                        wbsProgress: Math.round((this.responseData.processedWBS / wbsElements.length) * 100)
                    });

                    // Continue with the next WBS Element
                    console.warn(`WBSElementManager: Continuing to next WBS Element after local error in ${wbsID}.`);

                    // Add a small delay before processing the next WBS Element after a local error
                    setTimeout(() => {
                        this._processWBSElements(wbsElements, currentIndex + 1)
                            .then(resolve)
                            .catch(reject);
                    }, 500);
                }
            });
        }

        /**
         * Transforms WBS Element data into the format expected by the OData service.
         * @param {Object} wbsData - Raw WBS Element data.
         * @returns {Object} Transformed WBS Element payload.
         * @private
         */
        _transformWBSElementData(wbsData) {
            // Map fields from input data to API expected format
            const mappedData = {};

            // Apply field mappings
            Object.entries(wbsData).forEach(([key, value]) => {
                const apiFieldName = this._fieldMappings[key] || key;
                if (value !== undefined && value !== null) {
                    mappedData[apiFieldName] = value;
                }
            });

            // Format dates properly if they exist
            if (mappedData.PlannedStartDate) {
                mappedData.PlannedStartDate = this._formatDateForAPI(mappedData.PlannedStartDate);
            }
            if (mappedData.PlannedEndDate) {
                mappedData.PlannedEndDate = this._formatDateForAPI(mappedData.PlannedEndDate);
            }
            if (mappedData.ActualStartDate) {
                mappedData.ActualStartDate = this._formatDateForAPI(mappedData.ActualStartDate);
            }
            if (mappedData.ActualEndDate) {
                mappedData.ActualEndDate = this._formatDateForAPI(mappedData.ActualEndDate);
            }

            // Ensure required fields are present
            if (!mappedData.ProjectElement) {
                console.warn("WBSElementManager: Missing required field ProjectElement");
            }
            if (!mappedData.ProjectUUID) {
                console.warn("WBSElementManager: Missing required field ProjectUUID");
            }

            // Return the formatted payload
            return {
                ProjectElement: mappedData.ProjectElement || "",
                ProjectUUID: mappedData.ProjectUUID || "",
                WBSElementName: mappedData.WBSElementName || "",
                PlannedStartDate: mappedData.PlannedStartDate || null,
                PlannedEndDate: mappedData.PlannedEndDate || null,
                ResponsibleCostCenter: mappedData.ResponsibleCostCenter || "",
                CostCenter: mappedData.CostCenter || "",
                CompanyCode: mappedData.CompanyCode || "",
                ProfitCenter: mappedData.ProfitCenter || "",
                ControllingArea: mappedData.ControllingArea || "",
                BillingElement: mappedData.BillingElement === "X" || mappedData.BillingElement === true,
                OldProjectID: mappedData.OldProjectID || "",
                WBSElementExternalID: mappedData.WBSElementExternalID || "",
                // Custom fields for this specific implementation
                SiteType: mappedData.SiteType || "",
                ATMID: mappedData.ATMID || "",
                District: mappedData.District || "",
                State: mappedData.State || "",
                BankName: mappedData.BankName || "",
                ATMCount: mappedData.ATMCount || "",
                NatureOfWBS: mappedData.NatureOfWBS || "",
                SAPSiteID: mappedData.SAPSiteID || "",
                Address: mappedData.Address || "",
                Deployment: mappedData.Deployment || "",
                BankLoadPercentage: mappedData.BankLoadPercentage || "",
                ERPRelocation: mappedData.ERPRelocation || "",
                ReferenceATMID: mappedData.ReferenceATMID || "",
                ERPSiteIDReport: mappedData.ERPSiteIDReport || "",
                UserDefinedField1: mappedData.UserDefinedField1 || "",
                Categorization: mappedData.Categorization || "",
                ActualStartDate: mappedData.ActualStartDate || null,
                PostalCode: mappedData.PostalCode || "",
                ActualEndDate: mappedData.ActualEndDate || null,
                ERPRelocationRefSiteID: mappedData.ERPRelocationRefSiteID || ""
            };
        }

        /**
         * Format a date for the API (ISO string format)
         * @param {string|Date} date - Date to format
         * @returns {string} Formatted date string
         * @private
         */
        _formatDateForAPI(date) {
            if (!date) return null;

            try {
                let dateObj;
                if (typeof date === 'string') {
                    // Parse the date string
                    dateObj = new Date(date);
                } else if (date instanceof Date) {
                    dateObj = date;
                } else {
                    return null;
                }

                // Check if date is valid
                if (isNaN(dateObj.getTime())) {
                    return null;
                }

                // Format as ISO string (YYYY-MM-DD)
                return dateObj.toISOString().split('T')[0];
            } catch (error) {
                console.error("Error formatting date:", error);
                return null;
            }
        }

        /**
         * Unified method to handle results for a single WBS Element.
         * Stores results in internal responseData and updates UI.
         * @param {Boolean} isSuccess - Whether this WBS Element was processed successfully.
         * @param {Object | null} recordData - Processed data for the successful record. Null if error.
         * @param {Object | null} errorInfo - Processed error information for failed records. Null if success.
         * @param {Number} originalIndex - The original index of the WBS Element in the input data.
         * @private
         */
        _handleRecord(isSuccess, recordData, errorInfo, originalIndex) {
            this.responseData.processedCount++;

            // Get original data reference from the processed structures
            const originalWBSData = isSuccess ? recordData : (errorInfo?.entry || {});
            // Ensure originalIndex is valid
            const validOriginalIndex = (originalIndex !== undefined && originalIndex !== null && originalIndex >= 0) ? originalIndex : -1;
            // Create a standardized message object for logging/potential future use
            let messageObject = this._errorHandler.createStandardMessage(
                isSuccess ? "success" : "error",
                isSuccess ? "SUCCESS" : (errorInfo?.errorCode || "ERROR"),
                isSuccess ? (recordData?.Message || "Successfully processed") : (errorInfo?.error || "Processing failed"),
                isSuccess ? (recordData?._rawResponse || null) : (errorInfo?.details || []),
                "WBS Element Creator",
                isSuccess ? (recordData?.WBSElementID || "") : (originalWBSData?.ProjectElement || ""),
                this.currentBatchIndex,
                validOriginalIndex
            );

            if (isSuccess) {
                this.responseData.successCount++;
                // Add to successRecords, including ALL original data
                this.responseData.successRecords.push({
                    // Spread the ENTIRE original item data first
                    ...originalWBSData,

                    // Specific result fields
                    WBSElementID: recordData.WBSElementID,
                    WBSElementStatus: "Created"
                });
                console.log(`WBSElementManager: Handled SUCCESS record (Index: ${validOriginalIndex}, WBS ID: ${recordData?.WBSElementID})`);
            } else {
                this.responseData.failureCount++;
                // Add to errorRecords, including ALL original data
                this.responseData.errorRecords.push({
                    // Spread the ENTIRE original item data first
                    ...originalWBSData,

                    // Explicitly add error-specific fields
                    Status: 'Error',
                    ErrorCode: messageObject.code || "ERROR",
                    ErrorMessage: messageObject.message || "Processing failed"
                });
                console.error(`WBSElementManager: Handled ERROR record (Index: ${validOriginalIndex}, ProjectElement: ${originalWBSData?.ProjectElement}, Code: ${messageObject.code})`);
            }

            // Add to allMessages log (for potential detailed logging export)
            this.responseData.allMessages.push(messageObject);

            // Update batch display model (counts and progress) based on WBS Element processing
            this._updateWBSDisplay({
                processedEntries: this.responseData.processedCount,
                successCount: this.responseData.successCount,
                failureCount: this.responseData.failureCount,
                entriesProgress: Math.round((this.responseData.processedCount / (this.responseData.totalRecords || 1)) * 100)
            });
        }

        /**
         * Get all messages (success and error) collected during processing.
         * @returns {Array<Object>} - Array of standardized message objects.
         */
        getAllMessages() {
            return this.responseData.allMessages || [];
        }

        /**
         * Get the final collected response data after processing.
         * @returns {Object} Response data object.
         */
        getResponseData() {
            return this.responseData;
        }

        /**
         * Update the WBS display JSONModel safely.
         * @param {Object} data - Key-value pairs of properties to update in the model.
         * @private
         */
        _updateWBSDisplay(data) {
            if (!this.oController || !this.oController.getView) {
                return;
            }
            const wbsDisplayModel = this.oController.getView().getModel("wbsDisplay");
            if (!wbsDisplayModel) {
                return;
            }

            // Get current model data
            const currentData = wbsDisplayModel.getData();

            // Calculate processing speed (items per second)
            const currentTime = new Date();
            const elapsedSeconds = Math.max(1, (currentTime - this.startTime) / 1000);
            const itemsPerSecond = (this.responseData.processedCount / elapsedSeconds);
            const processingSpeed = `${itemsPerSecond.toFixed(1)} items/sec`;

            // Calculate time remaining based on items
            const remainingItems = Math.max(0, this.responseData.totalRecords - this.responseData.processedCount);
            let formattedTimeRemaining = "Calculating...";

            if (currentData.isCompleted) {
                formattedTimeRemaining = "0s";
            } else if (remainingItems > 0 && itemsPerSecond > 0.01) {
                const remainingSeconds = Math.ceil(remainingItems / itemsPerSecond);
                if (remainingSeconds > 3600) {
                    const hours = Math.floor(remainingSeconds / 3600);
                    const minutes = Math.floor((remainingSeconds % 3600) / 60);
                    formattedTimeRemaining = `~${hours}h ${minutes}m`;
                } else if (remainingSeconds > 60) {
                    const minutes = Math.floor(remainingSeconds / 60);
                    const seconds = remainingSeconds % 60;
                    formattedTimeRemaining = `~${minutes}m ${seconds}s`;
                } else if (remainingSeconds > 0) {
                    formattedTimeRemaining = `~${remainingSeconds}s`;
                } else {
                    formattedTimeRemaining = "Almost done...";
                }
            } else if (remainingItems === 0) {
                formattedTimeRemaining = "Finishing...";
            }

            // Merge new data with calculations
            const updatedData = {
                ...currentData,
                ...data,
                processingSpeed: processingSpeed,
                timeRemaining: formattedTimeRemaining
            };

            // Update the model
            wbsDisplayModel.setData(updatedData);
        }

        /**
         * Handle final UI state updates when WBS Element creation completes or is cancelled.
         * @param {boolean} [wasCancelled=false] - Flag indicating if processing was cancelled.
         * @param {boolean} [hadError=false] - Flag indicating if a major error occurred.
         * @private
         */
        _handleWBSCreationComplete(wasCancelled = false, hadError = false) {
            const hasFailures = this.responseData.failureCount > 0;
            let finalStatus = "";
            let finalErrorMsg = "";

            if (wasCancelled) {
                finalStatus = "Processing cancelled by user.";
                finalErrorMsg = "Processing was stopped before all WBS Elements were processed.";
            } else if (hasFailures || hadError) {
                const failureText = this.responseData.failureCount === 1 ? "WBS Element" : "WBS Elements";
                finalStatus = `Processing finished with ${this.responseData.failureCount} failed ${failureText}.`;
                finalErrorMsg = `${this.responseData.failureCount} ${failureText} could not be processed.`;
                if (hadError && !hasFailures) {
                    finalStatus = "Processing finished with errors.";
                    finalErrorMsg = "An error occurred during processing. Check logs.";
                }
            } else {
                finalStatus = "Processing completed successfully.";
                finalErrorMsg = "";
            }

            // Update WBS display model to final state
            this._updateWBSDisplay({
                status: finalStatus,
                error: finalErrorMsg,
                isCompleted: true,
                isError: wasCancelled || hasFailures || hadError,
                wbsProgress: 100,
                entriesProgress: Math.round((this.responseData.processedCount / (this.responseData.totalRecords || 1)) * 100),
                currentWBS: this.totalBatches,
                processedWBS: this.responseData.processedWBS,
                timeRemaining: "0s"
            });

            // Make export buttons visible in the dialog
            this._showExportButtonsInDialog();

            console.log("WBSElementManager: WBS Element creation marked as complete in UI.");
        }

        /**
         * Signal cancellation for the ongoing WBS Element creation process, aborting any in-progress requests.
         */
        cancelWBSElementCreation() {
            console.log("WBSElementManager: Cancellation requested - aborting all active requests");
            this.processingCancelled = true;

            // Abort any active XHR requests
            if (this._activeXHRs && this._activeXHRs.length > 0) {
                console.log(`WBSElementManager: Aborting ${this._activeXHRs.length} active XHR requests`);
                this._activeXHRs.forEach(xhr => {
                    try {
                        if (xhr && xhr.abort && typeof xhr.abort === 'function') {
                            xhr.abort();
                        }
                    } catch (e) {
                        console.warn("Failed to abort XHR:", e);
                    }
                });
                // Clear the array
                this._activeXHRs = [];
            }

            // Clear any pending timeouts for retries
            if (this._pendingTimeouts && this._pendingTimeouts.length > 0) {
                console.log(`WBSElementManager: Clearing ${this._pendingTimeouts.length} pending timeouts`);
                this._pendingTimeouts.forEach(timeoutId => {
                    try {
                        clearTimeout(timeoutId);
                    } catch (e) {
                        console.warn("Failed to clear timeout:", e);
                    }
                });
                // Clear the array
                this._pendingTimeouts = [];

                // Update WBS display immediately to show completed state
                this._updateWBSDisplay({
                    status: "Cancellation complete - processing stopped.",
                    isError: true,
                    isCompleted: true,
                    wbsProgress: 100
                });
                // Also update the response data to show it was cancelled
                this.responseData.wasCancelled = true
            }
        }

        /**
         * Load the WBS creation dialog fragment using UIManager.
         * @returns {Promise<sap.m.Dialog>} Promise resolving with the dialog instance.
         * @private
         */
        _loadWBSCreationDialog() {
            return new Promise((resolve, reject) => {
                const dialogId = "wbsCreationDialog";
                const fragmentName = "wbscreate.view.BatchProcessingDisplayDialog";

                if (!this.oController) {
                    reject(new Error("WBSElementManager: Controller not available"));
                    return;
                }

                if (!this.oController._uiManager) {
                    reject(new Error("WBSElementManager: UIManager not available"));
                    return;
                }

                console.log("WBSElementManager: Using UIManager for dialog loading.");

                // Use the UIManager's loadAndShowDialog method which returns a Promise
                this.oController._uiManager.loadAndShowDialog(
                    dialogId,
                    fragmentName,
                    null,
                    null,
                    this.oController
                )
                    .then(oDialog => {
                        console.log("WBSElementManager: WBS dialog loaded successfully", oDialog);
                        resolve(oDialog);
                    })
                    .catch(error => {
                        console.error("WBSElementManager: Error loading WBS dialog:", error);
                        reject(error);
                    });
            });
        }

        /**
         * Make export buttons visible in the WBS creation dialog.
         * @private
         */
        _showExportButtonsInDialog() {
            // Debounce this call slightly to ensure the dialog is rendered
            setTimeout(() => {
                try {
                    const dialogId = this.oController?.getView()?.createId("wbsCreationDialog");
                    if (!dialogId) {
                        console.warn("WBSElementManager: Cannot find dialog ID for export buttons.");
                        return;
                    }

                    const oDialog = sap.ui.getCore().byId(dialogId);
                    if (!oDialog || typeof oDialog.getContent !== 'function') {
                        console.warn("WBSElementManager: Cannot find WBS dialog instance to show export buttons.");
                        return;
                    }

                    // Find the container for export buttons - more robust search
                    let exportContainer = null;
                    const content = oDialog.getContent();

                    const findControlRecursive = (controls) => {
                        for (const control of controls) {
                            // Check by specific ID suffix if known and stable
                            if (control.getId && control.getId().endsWith("--exportButtonsContainer")) {
                                return control;
                            }
                            // Check by a custom style class if applied reliably
                            if (control.hasStyleClass && control.hasStyleClass("exportContainer")) {
                                return control;
                            }

                            // Recursively check aggregations
                            if (control.getAggregation) {
                                const aggregationsToCheck = ['items', 'content', 'formElements', 'cells', '_grid', 'contentAreas'];
                                for (const aggName of aggregationsToCheck) {
                                    const aggregation = control.getAggregation(aggName);
                                    if (aggregation) {
                                        const found = findControlRecursive(Array.isArray(aggregation) ? aggregation : [aggregation]);
                                        if (found) return found;
                                    }
                                }
                            }
                        }
                        return null;
                    };

                    if (content && content.length > 0) {
                        exportContainer = findControlRecursive(content);
                    }

                    if (exportContainer && typeof exportContainer.setVisible === 'function') {
                        console.log("WBSElementManager: Making export buttons visible.");
                        exportContainer.setVisible(true);
                    } else {
                        console.warn("WBSElementManager: Export buttons container not found or not visible in the dialog fragment. Check fragment structure, IDs, or style classes.");
                    }
                } catch (error) {
                    console.error("WBSElementManager: Error trying to show export buttons:", error);
                }
            }, 100);
        }

        /**
         * Close the WBS creation dialog using UIManager.
         */
        closeWBSCreationDialog() {
            const dialogId = "wbsCreationDialog";
            if (this.oController?._uiManager?.closeDialog) {
                console.log("WBSElementManager: Using UIManager to close dialog");
                this.oController._uiManager.closeDialog(dialogId);
            } else {
                console.error("WBSElementManager: Cannot close dialog - UIManager not available");
            }
        }
    };
});