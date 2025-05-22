sap.ui.define([
    "sap/ui/core/BusyIndicator"
], function (BusyIndicator) {
    "use strict";

    return class ODataService {
        constructor(options = {}) {
            this._oModel = options.model;

            // Ensure model supports batch processing
            if (this._oModel && typeof this._oModel.setUseBatch === 'function') {
                this._oModel.setUseBatch(true);
                this._oModel.setChangeGroups({
                    "WBSCreation": {
                        groupId: "WBSCreation",
                        single: false
                    }
                });
            }

            // Enhanced batch configuration
            this._batchConfig = {
                changesetSize: options.changesetSize || 5,
                changesetCountPerBatch: options.changesetCountPerBatch || 4,
                stopOnError: options.stopOnError || false,
                retryAttempts: options.retryAttempts || 1
            };

            this._errorHandler = options.errorHandler || {
                showError: console.error,
                createStandardMessage: (type, code, text, record) => ({ type, code, text, record }),
                extractODataError: (error) => ({ code: 'UNKNOWN', message: error.message || 'Unknown error', details: [] })
            };

            this._dataTransformer = options.dataTransformer || {
                transformWBSElementData: (data) => data
            };

            // Track processing state
            this._processingState = {
                totalRecords: 0,
                processedCount: 0,
                successCount: 0,
                failureCount: 0,
                successRecords: [],
                errorRecords: [],
                allMessages: [],
                isCancelled: false
            };
        }

        /**
         * Create WBS Elements using comprehensive batch processing
         * @param {Array} wbsElementsData - Array of WBS Element data
         * @param {Object} options - Batch processing options
         * @param {Object} callbacks - Callback functions
         * @returns {Object} Batch processing control object
         */
        createWBSElementsBatch(wbsElementsData, options = {}, callbacks = {}) {
            console.log("ODataService: Starting batch WBS creation", {
                recordCount: wbsElementsData.length,
                options,
                callbacks: Object.keys(callbacks)
            });

            // Merge configuration
            const batchConfig = { ...this._batchConfig, ...options };

            // Validate input
            if (!Array.isArray(wbsElementsData) || wbsElementsData.length === 0) {
                const errorMessage = this._errorHandler.createStandardMessage(
                    "error",
                    "INVALID_INPUT",
                    "No valid WBS Element data provided"
                );

                setTimeout(() => {
                    callbacks.error?.({
                        message: errorMessage.text || errorMessage.message,
                        code: errorMessage.code,
                        processedCount: 0,
                        successCount: 0,
                        failureCount: 0,
                        successRecords: [],
                        errorRecords: [],
                        allMessages: [errorMessage]
                    });
                }, 10);

                return { cancel: () => { } };
            }

            // Reset processing state
            this._processingState = {
                totalRecords: wbsElementsData.length,
                processedCount: 0,
                successCount: 0,
                failureCount: 0,
                successRecords: [],
                errorRecords: [],
                allMessages: [],
                isCancelled: false
            };

            // Start processing
            this._processWBSBatchAsync(wbsElementsData, batchConfig, callbacks);

            // Return control object
            return {
                cancel: () => {
                    console.log("ODataService: Batch processing cancellation requested");
                    this._processingState.isCancelled = true;
                    BusyIndicator.hide();

                    // Notify about cancellation
                    setTimeout(() => {
                        callbacks.error?.({
                            message: "Processing was cancelled by user",
                            code: "CANCELLED",
                            processedCount: this._processingState.processedCount,
                            successCount: this._processingState.successCount,
                            failureCount: this._processingState.failureCount,
                            successRecords: this._processingState.successRecords,
                            errorRecords: this._processingState.errorRecords,
                            allMessages: [
                                ...this._processingState.allMessages,
                                this._errorHandler.createStandardMessage(
                                    "warning",
                                    "CANCELLED",
                                    "Processing was cancelled by user"
                                )
                            ]
                        });
                    }, 10);
                }
            };
        }

        /**
         * Process WBS batch asynchronously with comprehensive error handling
         * @param {Array} wbsElementsData - WBS data to process
         * @param {Object} batchConfig - Batch configuration
         * @param {Object} callbacks - Progress, success, error callbacks
         * @private
         */
        async _processWBSBatchAsync(wbsElementsData, batchConfig, callbacks) {
            BusyIndicator.show(0);

            try {
                // Calculate batch structure
                const recordsPerBatch = batchConfig.changesetSize * batchConfig.changesetCountPerBatch;
                const batches = [];

                for (let i = 0; i < wbsElementsData.length; i += recordsPerBatch) {
                    batches.push(wbsElementsData.slice(i, i + recordsPerBatch));
                }

                console.log(`ODataService: Processing ${batches.length} batches`, {
                    totalRecords: wbsElementsData.length,
                    recordsPerBatch,
                    batchConfig
                });

                // Process each batch
                for (const [batchIndex, batch] of batches.entries()) {
                    if (this._processingState.isCancelled) {
                        console.log("ODataService: Processing cancelled during batch", batchIndex);
                        break;
                    }

                    console.log(`ODataService: Processing batch ${batchIndex + 1}/${batches.length}`, {
                        batchSize: batch.length
                    });

                    // Update progress
                    this._notifyProgress(callbacks.progress, batchIndex, batches.length);

                    // Process batch
                    await this._processSingleBatch(batch, batchIndex, batchConfig);

                    // Small delay to allow UI updates
                    await this._delay(50);
                }

                // Final processing
                BusyIndicator.hide();

                if (this._processingState.isCancelled) {
                    // Cancellation was handled in the cancel method
                    return;
                }

                // Success callback with comprehensive results
                const finalResults = {
                    message: `Batch processing completed. ${this._processingState.successCount} successful, ${this._processingState.failureCount} failed out of ${this._processingState.totalRecords} total records.`,
                    processedCount: this._processingState.processedCount,
                    successCount: this._processingState.successCount,
                    failureCount: this._processingState.failureCount,
                    successRecords: this._processingState.successRecords,
                    errorRecords: this._processingState.errorRecords,
                    allMessages: this._processingState.allMessages
                };

                console.log("ODataService: Batch processing completed successfully", finalResults);
                callbacks.success?.(finalResults);

            } catch (error) {
                BusyIndicator.hide();
                console.error("ODataService: Critical error during batch processing", error);

                const errorResult = {
                    message: `Batch processing failed: ${error.message}`,
                    code: "BATCH_PROCESSING_ERROR",
                    processedCount: this._processingState.processedCount,
                    successCount: this._processingState.successCount,
                    failureCount: this._processingState.failureCount,
                    successRecords: this._processingState.successRecords,
                    errorRecords: this._processingState.errorRecords,
                    allMessages: [
                        ...this._processingState.allMessages,
                        this._errorHandler.createStandardMessage(
                            "error",
                            "BATCH_PROCESSING_ERROR",
                            `Critical batch processing error: ${error.message}`,
                            { error: error.stack }
                        )
                    ]
                };

                callbacks.error?.(errorResult);
            }
        }

        /**
         * Process a single batch with changesets
         * @param {Array} batch - Batch of records to process
         * @param {number} batchIndex - Index of current batch
         * @param {Object} batchConfig - Batch configuration
         * @private
         */
        async _processSingleBatch(batch, batchIndex, batchConfig) {
            // Divide batch into changesets
            const changesets = [];
            for (let i = 0; i < batch.length; i += batchConfig.changesetSize) {
                changesets.push(batch.slice(i, i + batchConfig.changesetSize));
            }

            console.log(`ODataService: Batch ${batchIndex} has ${changesets.length} changesets`);

            // Process each changeset
            for (const [changesetIndex, changeset] of changesets.entries()) {
                if (this._processingState.isCancelled) break;

                await this._processChangeset(changeset, batchIndex, changesetIndex, batchConfig);
            }
        }

        /**
         * Process a single changeset
         * @param {Array} changeset - Records in the changeset
         * @param {number} batchIndex - Batch index
         * @param {number} changesetIndex - Changeset index
         * @param {Object} batchConfig - Batch configuration
         * @private
         */
        async _processChangeset(changeset, batchIndex, changesetIndex, batchConfig) {
            const changesetGroupId = `WBS_Batch_${batchIndex}_Changeset_${changesetIndex}`;

            console.log(`ODataService: Processing changeset ${changesetGroupId}`, {
                recordCount: changeset.length
            });

            try {
                // Add the deferred group
                const currentDeferredGroups = this._oModel.getDeferredGroups() || [];
                this._oModel.setDeferredGroups([...currentDeferredGroups, changesetGroupId]);

                // Prepare records in the changeset
                const changesetRequests = [];

                changeset.forEach((wbsData, recordIndex) => {
                    try {
                        // Transform data
                        const transformedData = this._dataTransformer.transformWBSElementData(wbsData);

                        console.log(`ODataService: Transformed record ${recordIndex}:`, {
                            original: wbsData,
                            transformed: transformedData
                        });

                        // Create record in the changeset
                        this._oModel.create("/A_EnterpriseProjectElement", transformedData, {
                            groupId: changesetGroupId,
                            changeSetId: changesetGroupId,
                            success: (data, response) => {
                                console.log(`ODataService: Individual record success:`, { data, response });
                            },
                            error: (error) => {
                                console.error(`ODataService: Individual record error:`, error);
                            }
                        });

                        changesetRequests.push({ originalData: wbsData, transformedData });

                    } catch (transformError) {
                        console.error('ODataService: Transformation error:', transformError);

                        // Add to error records
                        this._processingState.errorRecords.push({
                            ...wbsData,
                            Status: "Error",
                            Message: `Data transformation failed: ${transformError.message}`,
                            ErrorCode: "TRANSFORM_ERROR"
                        });

                        this._processingState.allMessages.push(
                            this._errorHandler.createStandardMessage(
                                "error",
                                "TRANSFORM_ERROR",
                                `Failed to transform data for record: ${transformError.message}`,
                                wbsData
                            )
                        );

                        this._processingState.failureCount++;
                    }
                });

                // Submit this changeset
                const submitResult = await new Promise((resolve, reject) => {
                    this._oModel.submitChanges({
                        groupId: changesetGroupId,
                        success: (data, response) => {
                            console.log(`ODataService: Changeset ${changesetGroupId} submitted successfully:`, { data, response });
                            resolve({ data, response });
                        },
                        error: (error) => {
                            console.error(`ODataService: Changeset ${changesetGroupId} submission error:`, error);
                            reject(error);
                        }
                    });
                });

                // Process changeset results
                this._processChangesetResults(submitResult, changesetRequests, changesetGroupId);

                // Remove the temporary deferred group
                const updatedDeferredGroups = this._oModel.getDeferredGroups().filter(
                    group => group !== changesetGroupId
                );
                this._oModel.setDeferredGroups(updatedDeferredGroups);

            } catch (submitError) {
                console.error(`ODataService: Changeset ${changesetGroupId} processing error:`, submitError);

                // Handle changeset-level errors
                changeset.forEach(wbsData => {
                    this._processingState.errorRecords.push({
                        ...wbsData,
                        Status: "Error",
                        Message: `Changeset submission failed: ${submitError.message}`,
                        ErrorCode: "CHANGESET_ERROR"
                    });

                    this._processingState.allMessages.push(
                        this._errorHandler.createStandardMessage(
                            "error",
                            "CHANGESET_ERROR",
                            `Changeset submission failed: ${submitError.message}`,
                            wbsData
                        )
                    );

                    this._processingState.failureCount++;
                });

                // Clean up deferred group
                try {
                    const updatedDeferredGroups = this._oModel.getDeferredGroups().filter(
                        group => group !== changesetGroupId
                    );
                    this._oModel.setDeferredGroups(updatedDeferredGroups);
                } catch (cleanupError) {
                    console.warn("ODataService: Error cleaning up deferred group:", cleanupError);
                }
            }

            // Update processed count
            this._processingState.processedCount += changeset.length;
        }

        /**
         * Process changeset submission results
         * @param {Object} submitResult - Result from changeset submission
         * @param {Array} changesetRequests - Original requests in changeset
         * @param {string} changesetGroupId - Changeset identifier
         * @private
         */
        _processChangesetResults(submitResult, changesetRequests, changesetGroupId) {
            console.log(`ODataService: Processing results for changeset ${changesetGroupId}:`, submitResult);

            // Handle batch response structure
            if (submitResult.data && submitResult.data.__batchResponses) {
                submitResult.data.__batchResponses.forEach((batchResponse, batchIndex) => {
                    if (batchResponse.__changeResponses) {
                        // Process change responses (successes)
                        batchResponse.__changeResponses.forEach((changeResponse, changeIndex) => {
                            const requestIndex = batchIndex * changesetRequests.length + changeIndex;
                            const originalRequest = changesetRequests[requestIndex];

                            if (changeResponse.data) {
                                // Success case
                                console.log(`ODataService: Record ${requestIndex} created successfully:`, changeResponse.data);

                                this._processingState.successRecords.push({
                                    ...originalRequest.originalData,
                                    ...changeResponse.data,
                                    Status: "Success",
                                    Message: `WBS Element created successfully`
                                });

                                this._processingState.allMessages.push(
                                    this._errorHandler.createStandardMessage(
                                        "success",
                                        "CREATE_SUCCESS",
                                        `WBS Element created successfully`,
                                        changeResponse.data
                                    )
                                );

                                this._processingState.successCount++;
                            }
                        });
                    }

                    if (batchResponse.response && batchResponse.response.statusCode >= 400) {
                        // Error case
                        console.error(`ODataService: Batch response error:`, batchResponse);

                        const errorInfo = this._errorHandler.extractODataError(batchResponse);

                        changesetRequests.forEach(request => {
                            this._processingState.errorRecords.push({
                                ...request.originalData,
                                Status: "Error",
                                Message: errorInfo.message,
                                ErrorCode: errorInfo.code
                            });

                            this._processingState.allMessages.push(
                                this._errorHandler.createStandardMessage(
                                    "error",
                                    errorInfo.code,
                                    errorInfo.message,
                                    request.originalData
                                )
                            );

                            this._processingState.failureCount++;
                        });
                    }
                });
            } else {
                // Fallback: assume all records in changeset were successful
                console.log(`ODataService: No batch responses found, assuming success for changeset ${changesetGroupId}`);

                changesetRequests.forEach(request => {
                    this._processingState.successRecords.push({
                        ...request.originalData,
                        Status: "Success",
                        Message: "WBS Element created successfully"
                    });

                    this._processingState.allMessages.push(
                        this._errorHandler.createStandardMessage(
                            "success",
                            "CREATE_SUCCESS",
                            "WBS Element created successfully",
                            request.originalData
                        )
                    );

                    this._processingState.successCount++;
                });
            }
        }

        /**
         * Notify progress to callback
         * @param {Function} progressCallback - Progress callback function
         * @param {number} currentBatch - Current batch index
         * @param {number} totalBatches - Total number of batches
         * @private
         */
        _notifyProgress(progressCallback, currentBatch, totalBatches) {
            if (typeof progressCallback === 'function') {
                const progressData = {
                    currentBatch: currentBatch + 1,
                    totalBatches,
                    processedCount: this._processingState.processedCount,
                    totalRecords: this._processingState.totalRecords,
                    successCount: this._processingState.successCount,
                    failureCount: this._processingState.failureCount,
                    status: `Processing batch ${currentBatch + 1} of ${totalBatches}...`
                };

                console.log("ODataService: Progress update:", progressData);
                progressCallback(progressData);
            }
        }

        /**
         * Simple delay utility
         * @param {number} ms - Milliseconds to delay
         * @returns {Promise} Promise that resolves after delay
         * @private
         */
        _delay(ms) {
            return new Promise(resolve => setTimeout(resolve, ms));
        }
    };
});