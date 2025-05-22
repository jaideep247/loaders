sap.ui.define([
    "sap/ui/core/BusyIndicator",
    "assetmastercreate/utils/DataTransformer",
    "assetmastercreate/utils/ErrorHandler",
    "sap/base/Log",
    "sap/ui/thirdparty/jquery"
], function (
    BusyIndicator,
    DataTransformer,
    ErrorHandler,
    Log,
    jQuery
) {
    "use strict";

    /**
     * @class SOAPAssetService
     * @extends sap.ui.base.Object
     * @description Service class for interacting with a SOAP endpoint to create fixed assets in SAP.
     */
    return class SOAPAssetService {
        /**
         * @constructor
         * @param {object} [options] - Configuration options for the service.
         * @param {assetmastercreate.utils.DataTransformer} [options.dataTransformer] - Instance of a DataTransformer.
         * @param {assetmastercreate.utils.ErrorHandler} [options.errorHandler] - Instance of an ErrorHandler.
         * @param {string} [options.serviceUrl="/sap/bc/srt/scs_ext/sap/fixedassetcreatemain"] - The base URL of the SOAP service.
         * @param {object} [options.config={}] - Additional configuration for SOAP requests (e.g., sender/recipient system IDs).
         * @param {number} [options.batchSize=10] - The number of assets to process in each batch for bulk creation.
         */
        constructor(options = {}) {
            this._dataTransformer = options.dataTransformer || new DataTransformer();
            this._errorHandler = options.errorHandler || new ErrorHandler();
            this._serviceUrl = options.serviceUrl || "/sap/bc/srt/scs_ext/sap/fixedassetcreatemain";
            this.config = options.config || {};
            this._isCancelled = false;
            this.lastResponseText = '';
            this._batchSize = options.batchSize || 10;
            this._csrfRetried = false; // Flag to prevent infinite retry loops
            this._csrfToken = null; // Store CSRF token

            // Batch processing internal state
            this.totalRecords = 0;
            this.successCount = 0;
            this.failureCount = 0;
            this.failedRecords = [];
            this.successEntries = [];
            this._batchStartTime = null;
            this._batchTotalEntries = 0;
            this._batchTotalBatches = 0;
        }

        /**
         * Creates a single fixed asset by sending a SOAP request.
         * @param {object} assetData - The data for the asset to be created.
         * @param {object} [callbacks] - Optional callback functions.
         * @param {function(object)} [callbacks.success] - Called on successful creation.
         * @param {function(object)} [callbacks.error] - Called on error during creation.
         * @returns {Promise<object>} A Promise that resolves with the creation result or rejects with an error.
         */
        createSingleAsset(assetData, callbacks) {
            return new Promise((resolve, reject) => {
                if (!assetData) {
                    const error = new Error("Asset data is required for single asset creation.");
                    Log.error("Asset data missing", error);
                    if (callbacks?.error) callbacks.error(error);
                    return reject(error);
                }

                BusyIndicator.show(0); // Show busy indicator immediately
                let requestData;
                try {
                    requestData = this._createSOAPRequest([assetData]);
                } catch (e) {
                    BusyIndicator.hide();
                    Log.error("Error creating SOAP request for single asset:", e);
                    if (callbacks?.error) callbacks.error(e);
                    return reject(e);
                }

                this._sendSOAPRequest(requestData, {
                    success: (responseData, rawResponse) => {
                        BusyIndicator.hide();
                        this.lastResponseText = rawResponse;
                        // For single asset, the responseData.AllResults will contain one item
                        const result = {
                            status: responseData?.AllResults?.[0]?.Status || "UNKNOWN",
                            responseData: responseData,
                            rawResponse: rawResponse,
                            messageId: requestData.messageId
                        };
                        Log.info("Single asset creation successful:", result);
                        if (callbacks?.success) callbacks.success(result);
                        resolve(result);
                    },
                    error: (error) => {
                        BusyIndicator.hide();
                        Log.error("Single asset creation failed:", error);
                        const result = {
                            status: "ERROR",
                            message: error.message,
                            details: error.details,
                            rawResponse: error.rawResponse,
                            messageId: requestData.messageId
                        };
                        if (callbacks?.error) callbacks.error(result); // Pass the structured error result
                        reject(result);
                    }
                });
            });
        }

        /**
         * Creates multiple fixed assets in batches by sending SOAP requests.
         * Provides callbacks for progress tracking.
         * @param {Array<object>} assets - An array of asset data objects to be created.
         * @param {object} [callbacks] - Optional callback functions.
         * @param {function(number, number)} [callbacks.batchStart] - Called when a new batch starts (currentIndex, totalBatches).
         * @param {function(number, number, number, number)} [callbacks.batchProgress] - Called on batch progress (currentIndex, totalBatches, processedRecords, totalRecords).
         * @param {function(object)} [callbacks.success] - Called on overall successful completion of all batches.
         * @param {function(object)} [callbacks.error] - Called if an unrecoverable error occurs or the operation is cancelled.
         * @returns {Promise<object>} A Promise that resolves with the overall results or rejects with an error.
         */
        createAssets(assets, callbacks) {
            return new Promise(async (resolve, reject) => {
                try {
                    if (!Array.isArray(assets) || assets.length === 0) {
                        throw new Error("No assets provided for batch processing.");
                    }

                    // Reset internal state for a new batch operation
                    this.totalRecords = assets.length;
                    this.successCount = 0;
                    this.failureCount = 0;
                    this.failedRecords = [];
                    this.successEntries = [];
                    this._isCancelled = false;
                    this._batchStartTime = new Date();
                    this._batchTotalEntries = assets.length;
                    const batchSize = this._batchSize;
                    this._batchTotalBatches = Math.ceil(assets.length / batchSize);

                    Log.info(`Starting batch processing for ${this.totalRecords} assets in ${this._batchTotalBatches} batches.`);
                    BusyIndicator.show(0); // Show busy indicator for the whole operation

                    if (callbacks?.batchStart) {
                        callbacks.batchStart(0, this._batchTotalBatches);
                    }

                    try {
                        // First fetch CSRF token before starting batch processing
                        await this._fetchCSRFToken();

                        await this._submitBatches(0, this._batchTotalBatches, assets, callbacks);

                        // Final overall result
                        const finalResult = {
                            cancelled: false,
                            totalRecords: this.totalRecords,
                            successfulRecords: this.successCount,
                            failedRecords: this.failureCount,
                            failedRecordsList: this.failedRecords,
                            successEntries: this.successEntries, // Added successful entries
                            durationMs: new Date().getTime() - this._batchStartTime.getTime()
                        };

                        BusyIndicator.hide();
                        if (callbacks?.success) callbacks.success(finalResult);
                        resolve(finalResult);

                    } catch (error) {
                        BusyIndicator.hide();
                        Log.error("Batch processing failed or was cancelled:", error);

                        // If cancelled, error will contain the cancellation message
                        if (this._isCancelled) {
                            const cancelledResult = {
                                cancelled: true,
                                totalRecords: this.totalRecords,
                                successfulRecords: this.successCount,
                                failedRecords: this.failureCount,
                                failedRecordsList: this.failedRecords,
                                successEntries: this.successEntries,
                                message: "Operation cancelled by user."
                            };
                            if (callbacks?.error) callbacks.error(cancelledResult);
                            resolve(cancelledResult); // Resolve as cancelled, not necessarily an error
                        } else {
                            if (callbacks?.error) callbacks.error(error);
                            reject(error);
                        }
                    }

                } catch (error) {
                    BusyIndicator.hide();
                    Log.error("Initial setup for batch processing failed:", error);
                    if (callbacks?.error) callbacks.error(error);
                    reject(error);
                }
            });
        }

        /**
         * Recursively submits batches of asset creation requests.
         * @private
         * @param {number} batchIndex - The current batch index.
         * @param {number} totalBatches - The total number of batches.
         * @param {Array<object>} assets - The full array of assets to process.
         * @param {object} callbacks - The callback functions.
         * @returns {Promise<void>} A Promise that resolves when all batches are processed or rejects on error/cancellation.
         */
        async _submitBatches(batchIndex, totalBatches, assets, callbacks) {
            if (this._isCancelled) {
                const cancellationError = new Error("Batch processing cancelled by user.");
                // We'll handle the actual callback and resolve/reject in the createAssets method for a cleaner flow.
                throw cancellationError;
            }

            if (batchIndex >= totalBatches) {
                Log.info("All batches processed.");
                return; // All batches are done
            }

            const batchSize = this._batchSize;
            const startIndex = batchIndex * batchSize;
            const endIndex = Math.min(startIndex + batchSize, assets.length);
            const batchEntries = assets.slice(startIndex, endIndex);

            Log.debug(`Processing batch ${batchIndex + 1}/${totalBatches} (Assets ${startIndex} to ${endIndex - 1}).`);

            let requestData;
            try {
                requestData = this._createSOAPRequest(batchEntries);
            } catch (e) {
                // If SOAP request creation fails, log and treat all entries in this batch as failed
                Log.error(`Failed to create SOAP request for batch ${batchIndex + 1}:`, e);
                this.failureCount += batchEntries.length;
                batchEntries.forEach(asset => {
                    this.failedRecords.push({
                        assetData: asset,
                        error: e.message || "Failed to prepare request",
                        errorCode: "REQUEST_PREP_ERROR",
                        details: e.stack,
                        messageId: requestData?.messageId || "N/A"
                    });
                });
                if (callbacks?.batchProgress) {
                    callbacks.batchProgress(
                        batchIndex,
                        totalBatches,
                        this.successCount + this.failureCount,
                        this.totalRecords
                    );
                }
                // Continue to the next batch even if this one failed at request creation
                return this._submitBatches(batchIndex + 1, totalBatches, assets, callbacks);
            }

            try {
                const responseData = await this._sendSOAPRequest(requestData);
                Log.debug(`SOAP Response Data for batch ${batchIndex + 1}:`, responseData);

                // Process individual results within the batch response
                if (responseData?.AllResults?.length) {
                    responseData.AllResults.forEach((result, idx) => {
                        const originalAssetIndex = startIndex + idx;
                        if (result.Status === "SUCCESS") {
                            this.successCount++;
                            this.successEntries.push({
                                ...result,
                                originalIndex: originalAssetIndex,
                                success: true
                            });
                        } else {
                            this.failureCount++;
                            this.failedRecords.push({
                                assetData: assets[originalAssetIndex],
                                error: result.Messages?.[0]?.message || "Unknown error",
                                errorCode: result.Messages?.[0]?.severity || "UNKNOWN",
                                details: JSON.stringify(result.Messages),
                                messageId: requestData.messageId,
                                originalIndex: originalAssetIndex
                            });
                        }
                    });
                } else if (responseData?.FixedAsset && batchEntries.length === 1) {
                    // Handle single asset response structure if present (though bulk is expected)
                    const result = responseData.FixedAsset;
                    const originalAssetIndex = startIndex;
                    if (result.Status === "SUCCESS") {
                        this.successCount++;
                        this.successEntries.push({
                            ...result,
                            originalIndex: originalAssetIndex,
                            success: true
                        });
                    } else {
                        this.failureCount++;
                        this.failedRecords.push({
                            assetData: assets[originalAssetIndex],
                            error: result.Messages?.[0]?.message || "Unknown error",
                            errorCode: result.Messages?.[0]?.severity || "UNKNOWN",
                            details: JSON.stringify(result.Messages),
                            messageId: requestData.messageId,
                            originalIndex: originalAssetIndex
                        });
                    }
                } else {
                    // If no structured results, assume the entire batch failed or succeeded based on general response,
                    // or log a warning if ambiguous. For now, assume failure for safety.
                    Log.warning(`Unexpected SOAP response structure for batch ${batchIndex + 1}. Assuming failure for batch entries.`);
                    this.failureCount += batchEntries.length;
                    batchEntries.forEach((asset, idx) => {
                        const originalAssetIndex = startIndex + idx;
                        this.failedRecords.push({
                            assetData: asset,
                            error: "Unexpected response structure or no clear status",
                            errorCode: "PARSE_WARNING",
                            details: "Check raw response for details.",
                            messageId: requestData.messageId,
                            originalIndex: originalAssetIndex
                        });
                    });
                }

                if (callbacks?.batchProgress) {
                    callbacks.batchProgress(
                        batchIndex,
                        totalBatches,
                        this.successCount + this.failureCount,
                        this.totalRecords
                    );
                }

                // Recursively call for the next batch
                await this._submitBatches(batchIndex + 1, totalBatches, assets, callbacks);
            } catch (error) {
                // If the entire batch SOAP request failed (e.g., network, CSRF, server error)
                Log.error(`SOAP request failed for batch ${batchIndex + 1}:`, error);
                this.failureCount += batchEntries.length;
                batchEntries.forEach(asset => {
                    this.failedRecords.push({
                        assetData: asset,
                        error: error.message || "Request failed",
                        errorCode: error.statusCode || "NETWORK_ERROR",
                        details: error.details || error.technicalDetails,
                        messageId: requestData?.messageId || "N/A"
                    });
                });

                if (callbacks?.batchProgress) {
                    callbacks.batchProgress(
                        batchIndex,
                        totalBatches,
                        this.successCount + this.failureCount,
                        this.totalRecords
                    );
                }

                // Crucially, continue to the next batch even if one failed
                await this._submitBatches(batchIndex + 1, totalBatches, assets, callbacks);
            }
        }

        /**
         * Fetches a CSRF token using HEAD method
         * @private
         * @returns {Promise<string>} A Promise resolving to the CSRF token
         */
        _fetchCSRFToken() {
            return new Promise((resolve, reject) => {
                jQuery.ajax({
                    url: this._serviceUrl,
                    method: "HEAD",
                    headers: {
                        "X-CSRF-Token": "Fetch"
                    },
                    success: (data, textStatus, jqXHR) => {
                        const csrfToken = jqXHR.getResponseHeader("X-CSRF-Token");
                        if (!csrfToken || csrfToken === 'Required') {
                            Log.warning("Failed to obtain CSRF token, proceeding anyway...");
                            this._csrfToken = null;
                            resolve(null);
                        } else {
                            Log.info("CSRF Token successfully fetched:", csrfToken);
                            this._csrfToken = csrfToken;
                            this.config.csrfToken = csrfToken;
                            resolve(csrfToken);
                        }
                    },
                    error: (jqXHR, textStatus, errorThrown) => {
                        Log.warning("Failed to fetch CSRF token:", errorThrown);
                        this._csrfToken = null;
                        resolve(null); // Continue without token
                    }
                });
            });
        }

        /**
         * Formats a Date object or string into an ISO 8601 date string (YYYY-MM-DD).
         * @private
         * @param {Date|string} date - The date to format.
         * @returns {string} The formatted date string, or an empty string if invalid.
         */
        _formatDate(date) {
            if (!date) return '';
            try {
                const d = date instanceof Date ? date : new Date(date);
                // Ensure date is valid before formatting
                if (isNaN(d.getTime())) {
                    Log.warning("Invalid date provided for formatting:", date);
                    return '';
                }
                return d.toISOString().split('T')[0];
            } catch (e) {
                Log.error("Error formatting date:", date, e);
                return '';
            }
        }

        /**
         * Generates a UUID for the Message ID.
         * @private
         * @returns {string} A formatted UUID string.
         */
        _generateFormattedUUID() {
            // This is a simplified UUID generation. For true UUIDv4, a more robust implementation is needed.
            // Example: 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'
            return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
                var r = Math.random() * 16 | 0,
                    v = c == 'x' ? r : (r & 0x3 | 0x8);
                return v.toString(16).toUpperCase(); // Convert to uppercase for consistency with example
            });
        }

        /**
         * Constructs the SOAP XML request payload for asset creation.
         * @private
         * @param {Array<object>} assets - An array of asset data objects.
         * @returns {object} An object containing the SOAP request XML string, message ID, and service URL.
         * @throws {Error} If `assets` is not a non-empty array or if required asset fields are missing.
         */
        _createSOAPRequest(assets) {
            if (!Array.isArray(assets) || assets.length === 0) {
                throw new Error('Assets must be a non-empty array to create a SOAP request.');
            }

            // Log full asset data structure for debugging
            console.log("Creating SOAP request for assets:", JSON.stringify(assets, null, 2));

            const currentDateTime = new Date().toISOString().replace('Z', '1234567Z'); // Add more precision to match working format
            const messageId = this._generateFormattedUUID();
            // Construct the service URL with MessageId as a query parameter
            const serviceUrlWithMsgId = `${this._serviceUrl}?MessageId=384C6E5F-2AX1-11AE-B041-18002F1AC7D5`;
            const senderSystemId = this.config?.senderSystemId || "TSIDEV";

            // Helper function to escape XML special characters
            const escapeXml = (str) => {
                if (typeof str !== 'string' || str === null || str === undefined) {
                    return '';
                }
                return str.replace(/[<>&'"]/g, (char) => ({
                    '<': '&lt;',
                    '>': '&gt;',
                    '&': '&amp;',
                    '\'': '&apos;',
                    '"': '&quot;'
                }[char] || char));
            };

            /**
             * Helper function to ensure numeric values are properly formatted.
             * Handles strings with spaces, null values, and other edge cases.
             * @param {any} value - The value to format as a numeric string
             * @returns {string} A properly formatted numeric string without spaces
             */
            function formatNumeric(value) {
                // If null/undefined, return '0'
                if (value === null || value === undefined) return '0';

                // If already a number, convert to string
                if (typeof value === 'number') return value.toString();

                // If it's a string, trim spaces and handle formatting
                if (typeof value === 'string') {
                    // Trim any whitespace first
                    const trimmed = value.trim();

                    // If empty after trimming, return '0'
                    if (trimmed === '') return '0';

                    // Try to parse as a number to see if it's valid
                    const parsed = parseFloat(trimmed);
                    if (!isNaN(parsed)) {
                        return parsed.toString(); // Return as clean numeric string
                    }

                    // If not a valid number, try to extract numeric characters
                    // Remove any non-numeric characters except decimal point and minus sign
                    const numStr = trimmed.replace(/[^0-9.-]/g, '');
                    return numStr || '0'; // Return extracted numbers or '0' if none found
                }

                // For other types (boolean, object, etc.), return '0'
                return '0';
            }

            // Helper function to format boolean as empty tag or explicit value based on value
            // For the working format, we always use empty tag
            const formatBoolean = (value) => {
                return ''; // Return empty string to generate empty tag <Tag/>
            };

            // Enhanced helper function to safely access nested properties
            const getPropertyValue = (obj, propPath, defaultValue = '') => {
                if (!obj) return defaultValue;

                // If propPath is a simple string without dots, use direct access
                if (!propPath.includes('.')) {
                    return obj[propPath] !== undefined && obj[propPath] !== null ? obj[propPath] : defaultValue;
                }

                // For nested properties (e.g., "General.FixedAssetDescription")
                const parts = propPath.split('.');
                let current = obj;

                for (let i = 0; i < parts.length; i++) {
                    if (current === null || current === undefined) {
                        return defaultValue;
                    }
                    current = current[parts[i]];
                }

                return current !== undefined && current !== null ? current : defaultValue;
            };

            // Format date without time (YYYY-MM-DD)
            const formatDateOnly = (date) => {
                if (!date) return '';
                try {
                    const d = date instanceof Date ? date : new Date(date);
                    if (isNaN(d.getTime())) return '';
                    return d.toISOString().split('T')[0];
                } catch (e) {
                    return '';
                }
            };

            // Use current date formatted as YYYY-MM-DD for the message ID
            const today = formatDateOnly(new Date());

            let soapEnvelope = `<?xml version="1.0" encoding="utf-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" 
                  xmlns:fi="http://sap.com/xi/FI-AA" 
                  xmlns:yy1="http://SAPCustomFields.com/YY1_">
    <soapenv:Header/>
    <soapenv:Body>
        <fi:FixedAssetCreateMainBulkRequestMessage>
            <MessageHeader>
                <ID>MSG_${today}_APITEST</ID>
                <CreationDateTime>${currentDateTime}</CreationDateTime>
                <SenderBusinessSystemID>${escapeXml(senderSystemId)}</SenderBusinessSystemID>
            </MessageHeader>`;

            assets.forEach((asset) => {
                if (!asset.CompanyCode || !asset.AssetClass) {
                    throw new Error(`Asset is missing required fields: CompanyCode or AssetClass.`);
                }

                // Access General fields directly or from nested General object
                const fixedAssetDescription = getPropertyValue(asset, 'General.FixedAssetDescription') || getPropertyValue(asset, 'FixedAssetDescription', 'Default Asset Description');
                const assetAdditionalDescription = getPropertyValue(asset, 'General.AssetAdditionalDescription') || getPropertyValue(asset, 'AssetAdditionalDescription', '');
                const assetSerialNumber = getPropertyValue(asset, 'General.AssetSerialNumber') || getPropertyValue(asset, 'AssetSerialNumber', '');
                const baseUnit = getPropertyValue(asset, 'General.BaseUnit') || getPropertyValue(asset, 'BaseUnit', 'EA');

                // Access AccountAssignment fields - but only use WBSElementExternalID and Room as in working example
                const wbsElementExternalID = getPropertyValue(asset, 'AccountAssignment.WBSElementExternalID') || getPropertyValue(asset, 'WBSElementExternalID', '');
                const room = getPropertyValue(asset, 'AccountAssignment.Room') || getPropertyValue(asset, 'Room', '');

                // Access Inventory fields
                const inventoryNote = getPropertyValue(asset, 'Inventory.InventoryNote') || getPropertyValue(asset, 'InventoryNote', '');

                soapEnvelope += `
            <FixedAssetMainRequest>
                <MessageHeader>
                    <CreationDateTime>${currentDateTime}</CreationDateTime>
                </MessageHeader>
                <FixedAsset>
                    <CompanyCode>${escapeXml(getPropertyValue(asset, 'CompanyCode'))}</CompanyCode>
                    <AssetClass>${escapeXml(getPropertyValue(asset, 'AssetClass'))}</AssetClass>
                    <AssetIsForPostCapitalization>${formatBoolean(getPropertyValue(asset, 'AssetIsForPostCapitalization'))}</AssetIsForPostCapitalization>
                    
                    <General>
                        <FixedAssetDescription>${escapeXml(fixedAssetDescription)}</FixedAssetDescription>
                        <AssetAdditionalDescription>${escapeXml(assetAdditionalDescription)}</AssetAdditionalDescription>
                        <AssetSerialNumber>${escapeXml(assetSerialNumber)}</AssetSerialNumber>
                        <BaseUnit>${escapeXml(baseUnit)}</BaseUnit>
                    </General>
                    
                    <Inventory>
                        <InventoryNote>${escapeXml(inventoryNote)}</InventoryNote>
                    </Inventory>
                    
                    <AccountAssignment>
                        <WBSElementExternalID>${escapeXml(wbsElementExternalID)}</WBSElementExternalID>
                        <Room>${escapeXml(room)}</Room>
                    </AccountAssignment>`;

                // Ensure 0L ledger is always included first, followed by other ledgers
                const ledgerInfo = getPropertyValue(asset, 'LedgerInformation', []);
                const ledgers = ['0L', '2L', '3L']; // Mandatory ledgers in specific order

                ledgers.forEach(ledgerCode => {
                    // Find matching ledger from asset data or create default
                    const existingLedger = Array.isArray(ledgerInfo) ?
                        ledgerInfo.find(l => l.Ledger === ledgerCode) : null;

                    soapEnvelope += `
                    <LedgerInformation>
                        <Ledger>${ledgerCode}</Ledger>
                        <AssetCapitalizationDate>${formatDateOnly(existingLedger?.AssetCapitalizationDate || '')}</AssetCapitalizationDate>
                    </LedgerInformation>`;
                });

                // Ensure all valuation areas are included in specific order
                const valuationInfo = getPropertyValue(asset, 'Valuation', []);
                const valuationAreas = ['01', '15', '32', '34']; // Mandatory areas in specific order

                valuationAreas.forEach(areaCode => {
                    // Find matching valuation from asset data or create default
                    const existingValuation = Array.isArray(valuationInfo) ?
                        valuationInfo.find(v => v.AssetDepreciationArea === areaCode) : null;

                    soapEnvelope += `
                    <Valuation>
                        <AssetDepreciationArea>${areaCode}</AssetDepreciationArea>
                        <NegativeAmountIsAllowed>${formatBoolean(existingValuation?.NegativeAmountIsAllowed)}</NegativeAmountIsAllowed>
                        <DepreciationStartDate>${formatDateOnly(existingValuation?.DepreciationStartDate || '')}</DepreciationStartDate>
                    </Valuation>`;
                });

                // Handle TimeBasedValuation - ensure all areas are included
                const tbvInfo = getPropertyValue(asset, 'TimeBasedValuation', []);
                const tbvAreas = ['01', '15', '32', '34']; // Same areas in same order

                tbvAreas.forEach(areaCode => {
                    // Find matching TBV from asset data or create default
                    const existingTbv = Array.isArray(tbvInfo) ?
                        tbvInfo.find(t => t.AssetDepreciationArea === areaCode) : null;

                    // Default values specific to different areas
                    let defaultDepKey = 'INDD'; // Default for areas 01, 15
                    if (areaCode === '32') {
                        defaultDepKey = '9ADD';
                    } else if (areaCode === '34') {
                        defaultDepKey = '9NDD';
                    }

                    soapEnvelope += `
                    <TimeBasedValuation>
                        <AssetDepreciationArea>${areaCode}</AssetDepreciationArea>
                        <DepreciationKey>${escapeXml(existingTbv?.DepreciationKey || defaultDepKey)}</DepreciationKey>
                        <PlannedUsefulLifeInYears>${formatNumeric(existingTbv?.PlannedUsefulLifeInYears || '5')}</PlannedUsefulLifeInYears>
                        <PlannedUsefulLifeInPeriods>${formatNumeric(existingTbv?.PlannedUsefulLifeInPeriods || '0')}</PlannedUsefulLifeInPeriods>
                        <ScrapAmountInCoCodeCrcy currencyCode="INR">${formatNumeric(existingTbv?.ScrapAmountInCoCodeCrcy || '0')}</ScrapAmountInCoCodeCrcy>
                        <AcqnProdnCostScrapPercent>${formatNumeric(existingTbv?.AcqnProdnCostScrapPercent || '5')}</AcqnProdnCostScrapPercent>
                    </TimeBasedValuation>`;
                });

                // Handle GLO_MasterData by checking both nested and direct paths
                const assetBlock = getPropertyValue(asset, 'GLO_MasterData.IN_AssetBlockData.IN_AssetBlock') ||
                    getPropertyValue(asset, 'IN_AssetBlock', '');
                const assetPutToUseDate = getPropertyValue(asset, 'GLO_MasterData.IN_AssetBlockData.IN_AssetPutToUseDate') ||
                    getPropertyValue(asset, 'IN_AssetPutToUseDate', '');
                const assetIsPriorYear = getPropertyValue(asset, 'GLO_MasterData.IN_AssetBlockData.IN_AssetIsPriorYear') ||
                    getPropertyValue(asset, 'IN_AssetIsPriorYear', false);

                soapEnvelope += `
                    <GLO_MasterData>
                        <IN_AssetBlockData>
                            <IN_AssetBlock>${escapeXml(assetBlock)}</IN_AssetBlock>
                            <IN_AssetPutToUseDate>${formatDateOnly(assetPutToUseDate)}</IN_AssetPutToUseDate>
                            <IN_AssetIsPriorYear>${formatBoolean(assetIsPriorYear)}</IN_AssetIsPriorYear>
                        </IN_AssetBlockData>
                    </GLO_MasterData>`;

                // Handle custom YY1_ fields
                const yy1Keys = Object.keys(asset).filter(key => key.startsWith('YY1_'));
                if (yy1Keys.length > 0) {
                    yy1Keys.forEach(yy1Key => {
                        soapEnvelope += `
                    <yy1:${yy1Key}>${escapeXml(getPropertyValue(asset, yy1Key, ''))}</yy1:${yy1Key}>`;
                    });
                }

                soapEnvelope += `
                </FixedAsset>
            </FixedAssetMainRequest>`;
            });

            soapEnvelope += `
        </fi:FixedAssetCreateMainBulkRequestMessage>
    </soapenv:Body>
</soapenv:Envelope>`;

            const result = {
                soapRequest: soapEnvelope,
                messageId: messageId,
                serviceUrl: serviceUrlWithMsgId // Use the URL with MessageId appended
            };

            return result;
        }

        /**
         * Sends the SOAP request to the configured service URL.
         * First fetches CSRF token if not already available, then makes the actual POST.
         * @private
         * @param {object} requestData - Object containing soapRequest XML, messageId, and serviceUrl.
         * @param {object} [callbacks] - Optional callback functions.
         * @param {function(object, string)} [callbacks.success] - Called on successful SOAP response.
         * @param {function(object)} [callbacks.error] - Called on SOAP request or response error.
         * @returns {Promise<object>} A Promise that resolves with the parsed response or rejects with an error.
         */
        _sendSOAPRequest(requestData, callbacks) {
            return new Promise((resolve, reject) => {
                // Use existing token if available, otherwise fetch a fresh one
                if (this._csrfToken) {
                    this._sendActualSOAPRequest(requestData, this._csrfToken, callbacks, resolve, reject);
                } else {
                    // Fetch a new CSRF token first
                    jQuery.ajax({
                        url: this._serviceUrl,
                        method: "HEAD",
                        headers: {
                            "X-CSRF-Token": "Fetch"
                        },
                        success: (data, textStatus, jqXHR) => {
                            const csrfToken = jqXHR.getResponseHeader("X-CSRF-Token");
                            if (!csrfToken || csrfToken === 'Required') {
                                Log.warning("Failed to obtain CSRF token, proceeding anyway...");
                            } else {
                                Log.info("CSRF Token successfully fetched:", csrfToken);
                                this._csrfToken = csrfToken;
                                this.config.csrfToken = csrfToken;
                            }

                            // Send the actual SOAP request with the token
                            this._sendActualSOAPRequest(requestData, csrfToken, callbacks, resolve, reject);
                        },
                        error: (jqXHR, textStatus, errorThrown) => {
                            Log.warning("Failed to fetch CSRF token, attempting request anyway:", errorThrown);
                            // Try the request without a token as a fallback
                            this._sendActualSOAPRequest(requestData, null, callbacks, resolve, reject);
                        }
                    });
                }
            });
        }

        /**
         * Helper method to send the actual SOAP request after CSRF token is obtained.
         * @private
         * @param {object} requestData - Object containing soapRequest XML, messageId, and serviceUrl.
         * @param {string|null} csrfToken - The CSRF token obtained from the HEAD request.
         * @param {object} callbacks - Callback functions.
         * @param {function} resolve - Promise resolve function.
         * @param {function} reject - Promise reject function.
         */
        _sendActualSOAPRequest(requestData, csrfToken, callbacks, resolve, reject) {
            const headers = {
                "SOAPAction": this._serviceUrl
            };

            // Add CSRF token if available
            if (csrfToken) {
                headers["X-CSRF-Token"] = csrfToken;
            }

            jQuery.ajax({
                url: requestData.serviceUrl || this._serviceUrl, // Use message ID URL if available
                method: "POST",
                contentType: "text/xml; charset=utf-8",
                data: requestData.soapRequest,
                headers: headers,
                success: (data, textStatus, jqXHR) => {
                    // Parse the XML response
                    const parser = new DOMParser();
                    const xmlDoc = parser.parseFromString(data, "text/xml");

                    // Check for SOAP faults
                    const faultNode = xmlDoc.querySelector("soapenv\\:Fault, Fault");
                    if (faultNode) {
                        const faultstring = faultNode.querySelector("faultstring")?.textContent || "Unknown SOAP Fault";
                        const detail = faultNode.querySelector("detail")?.textContent || "";
                        const error = new Error(`SOAP Fault: ${faultstring}`);
                        error.details = detail;
                        error.rawResponse = data;
                        Log.error("SOAP Fault received:", faultstring, detail);
                        if (callbacks?.error) callbacks.error(error);
                        return reject(error);
                    }

                    // Transform the successful response
                    const transformedResponse = this._dataTransformer.transformSOAPResponse(xmlDoc);
                    Log.info("SOAP request successful, response transformed:", transformedResponse);
                    if (callbacks?.success) callbacks.success(transformedResponse, data);
                    resolve(transformedResponse);
                },
                error: (jqXHR, textStatus, errorThrown) => {
                    const errorDetails = this._errorHandler.extractODataError(jqXHR);
                    const error = new Error(`SOAP request failed: ${errorDetails.message || errorThrown}`);
                    error.statusCode = jqXHR.status;
                    error.statusText = textStatus;
                    error.rawResponse = jqXHR.responseText;
                    error.details = errorDetails.details || jqXHR.responseText;

                    // If we get a 403 Forbidden or CSRF token invalid, try again with a fresh token
                    if ((jqXHR.status === 403 || jqXHR.responseText?.includes("CSRF")) && !this._csrfRetried) {
                        Log.warning("CSRF token may be invalid, retrying with fresh token");
                        this._csrfRetried = true; // Flag to prevent infinite retry loops
                        this._csrfToken = null; // Clear the token to force a new fetch

                        // Retry the entire sequence
                        this._sendSOAPRequest(requestData, callbacks)
                            .then(resolve)
                            .catch(reject);
                        return;
                    }

                    // Reset retry flag for future requests
                    this._csrfRetried = false;

                    Log.error("SOAP request failed:", error);
                    if (callbacks?.error) callbacks.error(error);
                    reject(error);
                }
            });
        }
        /**
         * Transforms a SOAP XML response into a structured JavaScript object.
         * @param {Document} xmlDoc - The XML Document object from the SOAP response.
         * @returns {Object} A structured JavaScript object with the response data.
         */
        transformSOAPResponse(xmlDoc) {
            if (!xmlDoc || xmlDoc.nodeType !== 9) { // 9 = Document node type
                return { error: "Invalid XML document" };
            }

            // Helper function to get text content from a node, handles null case
            const getTextContent = (node) => {
                return node ? node.textContent.trim() : '';
            };

            // Helper function to find nodes and extract values
            const findAndExtract = (parent, selector, isRequired = false) => {
                const node = parent.querySelector(selector);
                if (!node && isRequired) {
                    console.warn(`Required element '${selector}' not found in SOAP response`);
                }
                return getTextContent(node);
            };

            // Helper function to transform a single FixedAsset node
            const transformFixedAssetNode = (assetNode) => {
                if (!assetNode) return null;

                // Extract basic fields
                const status = findAndExtract(assetNode, "Status");
                const assetNumber = findAndExtract(assetNode, "AssetNumber");
                const companyCode = findAndExtract(assetNode, "CompanyCode");
                const assetDescription = findAndExtract(assetNode, "FixedAssetDescription");

                // Extract messages - multiple messages are possible
                const messageNodes = assetNode.querySelectorAll("Message, Messages > Message");
                const messages = [];

                messageNodes.forEach((msgNode) => {
                    messages.push({
                        severity: findAndExtract(msgNode, "Severity") ||
                            findAndExtract(msgNode, "severity") ||
                            "INFO",
                        message: findAndExtract(msgNode, "Text") ||
                            findAndExtract(msgNode, "text") ||
                            findAndExtract(msgNode, "Message") ||
                            "No message text",
                        id: findAndExtract(msgNode, "ID") ||
                            findAndExtract(msgNode, "id") ||
                            ""
                    });
                });

                return {
                    Status: status,
                    AssetNumber: assetNumber,
                    CompanyCode: companyCode,
                    FixedAssetDescription: assetDescription,
                    Messages: messages,
                    // Add more fields as needed for your specific SOAP response structure
                    // For example, you might need to extract Technical IDs, General information, etc.
                };
            };

            try {
                // Try to find the bulk response structure first
                const bulkResponseNode = xmlDoc.querySelector("FixedAssetCreateMainBulkResponseMessage");
                if (bulkResponseNode) {
                    // This is a bulk response, with potentially multiple fixed asset results
                    const fixedAssetNodes = bulkResponseNode.querySelectorAll("FixedAssetMainResponse");

                    // Create an array for all results
                    const allResults = [];

                    fixedAssetNodes.forEach((responseNode) => {
                        const assetNode = responseNode.querySelector("FixedAsset");
                        const assetResult = transformFixedAssetNode(assetNode);

                        if (assetResult) {
                            allResults.push(assetResult);
                        }
                    });

                    return {
                        Type: "BulkResponse",
                        AllResults: allResults
                    };
                }

                // If not a bulk response, try to find a single asset response
                const singleAssetNode = xmlDoc.querySelector("FixedAssetCreateMainResponse > FixedAsset");
                if (singleAssetNode) {
                    // This is a single asset response
                    const assetResult = transformFixedAssetNode(singleAssetNode);

                    return {
                        Type: "SingleResponse",
                        FixedAsset: assetResult
                    };
                }

                // If neither bulk nor single asset structured response is found, handle as an error or special case
                // First check for a SOAP fault which might be already handled in the SOAPAssetService class
                const faultNode = xmlDoc.querySelector("soapenv\\:Fault, Fault");
                if (faultNode) {
                    const faultString = findAndExtract(faultNode, "faultstring");
                    const faultCode = findAndExtract(faultNode, "faultcode");

                    return {
                        Type: "Fault",
                        FaultString: faultString,
                        FaultCode: faultCode,
                        Detail: findAndExtract(faultNode, "detail")
                    };
                }

                // If we get here, we couldn't recognize the response structure
                return {
                    Type: "Unknown",
                    XMLContent: xmlDoc.documentElement.outerHTML
                };

            } catch (error) {
                console.error("Error transforming SOAP response:", error);
                return {
                    error: "Failed to transform SOAP response: " + error.message
                };
            }
        }
        /**
         * Cancels any ongoing batch processing.
         */
        cancelProcessing() {
            this._isCancelled = true;
            BusyIndicator.hide();
            Log.info("Batch processing cancelled by user.");
        }
    };
});