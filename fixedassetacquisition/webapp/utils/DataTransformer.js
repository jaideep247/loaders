sap.ui.define([
    "sap/ui/core/format/DateFormat",
    "sap/m/MessageToast" // Added for potential logging/messaging
], function (DateFormat, MessageToast) {
    "use strict";

    // Date formatter instances (consider making these configurable or passed in)
    const oDateFormat = DateFormat.getDateInstance({ pattern: "yyyy-MM-dd" });
    // Example display format for exports (e.g., dd/MM/yyyy or MM/dd/yyyy based on locale)
    const oDisplayDateFormat = DateFormat.getDateInstance({ style: "short" });

    return class DataTransformer {
        constructor(options = {}) {
            // Options could include custom date formats, etc.
            this._debugMode = options.debugMode || true; // Enable logging by default
        }

        // --- Logging Helpers ---
        _logInfo(message, details) {
            if (this._debugMode) {
                console.log(`[DataTransformer] INFO: ${message}`, details || "");
            }
        }
        _logWarn(message, details) {
            console.warn(`[DataTransformer] WARN: ${message}`, details || "");
        }
        _logError(message, error) {
            console.error(`[DataTransformer] ERROR: ${message}`, error || "");
        }

        // --- Date Handling ---
        /**
         * Parses a date string (e.g., from Excel) into a Date object.
         * Handles various potential input formats.
         * @param {string|number|Date} dateInput - The date input.
         * @returns {Date|null} The parsed Date object or null if invalid.
         */
        parseDate(dateInput) {
            if (!dateInput) return null;
            if (dateInput instanceof Date && !isNaN(dateInput.getTime())) return dateInput; // Already a valid Date object

            // Handle Excel numeric date format (number of days since 1900-01-00)
            if (typeof dateInput === 'number' && dateInput > 0) {
                try {
                    // Excel date calculation (adjust for leap year bug if needed)
                    const excelEpoch = new Date(Date.UTC(1899, 11, 30)); // Excel epoch start (day 0)
                    // Calculate milliseconds from epoch and create Date object
                    const date = new Date(excelEpoch.getTime() + dateInput * 24 * 60 * 60 * 1000);
                    // Check if the resulting date is valid
                    if (!isNaN(date.getTime())) {
                        this._logInfo(`Parsed Excel date number ${dateInput} to:`, date);
                        return date;
                    } else {
                        this._logWarn(`Excel date number ${dateInput} resulted in invalid Date object.`);
                    }
                } catch (e) {
                    this._logWarn("Failed to parse numeric date input as Excel date:", dateInput, e);
                }
            }

            // Handle common string formats (add more as needed)
            if (typeof dateInput === 'string') {
                try {
                    // Try ISO format first (YYYY-MM-DD or YYYY-MM-DDTHH:mm:ss...)
                    let parsedDate = new Date(dateInput);
                    if (!isNaN(parsedDate.getTime())) {
                        this._logInfo(`Parsed date string (ISO?) '${dateInput}' to:`, parsedDate);
                        return parsedDate;
                    }

                    // Try common formats like DD/MM/YYYY, MM/DD/YYYY, DD.MM.YYYY etc.
                    // Using Date.parse is generally unreliable for non-ISO formats.
                    // A more robust solution would use a dedicated parsing library (like moment.js or date-fns)
                    // or more specific regex checks based on expected formats.
                    // For simplicity, we'll rely on the browser's Date constructor attempt above.

                } catch (e) {
                    this._logWarn(`Failed to parse date string '${dateInput}':`, e);
                }
            }

            this._logWarn("Could not parse date input:", dateInput);
            return null; // Return null if parsing fails
        }

        /**
         * Formats a Date object into the required OData format (yyyy-MM-dd).
         * @param {Date|null} dateObject - The Date object.
         * @returns {string|null} The formatted date string or null.
         */
        formatDateForOData(dateObject) {
            if (!dateObject || !(dateObject instanceof Date) || isNaN(dateObject.getTime())) {
                return null;
            }
            try {
                // Use the specific formatter for yyyy-MM-dd
                return oDateFormat.format(dateObject);
            } catch (e) {
                this._logError("Error formatting date for OData:", e);
                return null;
            }
        }

        /**
        * Formats a Date object or a valid date string for display (e.g., in export).
        * @param {Date|string|null} dateInput - The Date object or string.
        * @returns {string} The formatted date string or an empty string.
        */
        formatDateForDisplay(dateInput) {
            const dateObject = this.parseDate(dateInput); // Parse first to handle various inputs
            if (!dateObject) {
                return ""; // Return empty if parsing failed
            }
            try {
                // Use a locale-sensitive short date format for display
                return oDisplayDateFormat.format(dateObject);
            } catch (e) {
                this._logError("Error formatting date for display:", e);
                return "";
            }
        }


        // --- Transformation Functions ---

        /**
         * Transforms raw data (likely from Excel) into a structured format for internal use.
         * Parses dates, potentially validates types, adds internal IDs.
         * @param {Array<object>} rawData - Array of raw data objects.
         * @param {string} [fileName] - Optional name of the source file.
         * @returns {Array<object>} Array of processed entry objects.
         */
        transformRawDataToEntries(rawData, fileName = "Uploaded Data") {
            this._logInfo(`Transforming ${rawData.length} raw entries...`);
            return rawData.map((row, index) => {
                // Map raw fields using a helper for flexibility
                const mappedRow = this.mapFixedAssetColumns(row);

                // Basic structure with potential validation status
                const entry = {
                    _originalIndex: index, // Keep track of original row
                    _sourceFile: fileName,
                    Status: "New", // Initial status
                    ValidationErrors: [], // Placeholder for validation errors

                    // Assign mapped values, providing defaults or null
                    SequenceID: mappedRow.SequenceID?.toString() || (index + 1).toString(),
                    ReferenceDocumentItem: mappedRow.ReferenceDocumentItem || null,
                    BusinessTransactionType: mappedRow.BusinessTransactionType || null,
                    CompanyCode: mappedRow.CompanyCode?.toString() || null,
                    MasterFixedAsset: mappedRow.MasterFixedAsset?.toString() || null,
                    FixedAsset: mappedRow.FixedAsset?.toString() || "0", // Default if blank?
                    AcqnAmtInTransactionCurrency: mappedRow.AcqnAmtInTransactionCurrency || null, // Format later
                    TransactionCurrency: mappedRow.TransactionCurrency || null,
                    // Parse and format dates for OData *during* this initial transform
                    PostingDate: this.formatDateForOData(this.parseDate(mappedRow.PostingDate)),
                    DocumentDate: this.formatDateForOData(this.parseDate(mappedRow.DocumentDate)),
                    AssetValueDate: this.formatDateForOData(this.parseDate(mappedRow.AssetValueDate)),
                    OffsettingAccount: mappedRow.OffsettingAccount?.toString() || null,
                    DocumentReferenceID: mappedRow.DocumentReferenceID || null,
                    AccountingDocumentHeaderText: mappedRow.AccountingDocumentHeaderText || null,
                    DocumentItemText: mappedRow.DocumentItemText || null,
                    QuantityInBaseUnit: mappedRow.QuantityInBaseUnit || null, // Format later
                    BaseUnitSAPCode: mappedRow.BaseUnitSAPCode || null,
                    BaseUnitISOCode: mappedRow.BaseUnitISOCode || null,
                    // Add other mapped fields...
                };

                // Format/Validate numbers *after* mapping
                if (entry.AcqnAmtInTransactionCurrency) {
                    const formattedAmount = this.formatAmount(entry.AcqnAmtInTransactionCurrency);
                    if (formattedAmount === null) {
                        entry.Status = "Invalid";
                        entry.ValidationErrors.push({ field: "Acquisition Amount", message: `Invalid amount format: ${entry.AcqnAmtInTransactionCurrency}` });
                    }
                    entry.AcqnAmtInTransactionCurrency = formattedAmount; // Store formatted string or null
                }
                if (entry.QuantityInBaseUnit) {
                    const formattedQuantity = this.formatQuantity(entry.QuantityInBaseUnit);
                    if (formattedQuantity === null) {
                        entry.Status = "Invalid";
                        entry.ValidationErrors.push({ field: "Quantity", message: `Invalid quantity format: ${entry.QuantityInBaseUnit}` });
                    }
                    entry.QuantityInBaseUnit = formattedQuantity; // Store formatted string or null
                }


                return entry;
            });
        }

        /**
         * Maps potential Excel column headers (case-insensitive, trimmed) for Fixed Asset Acquisition
         * to standardized internal property names.
         * @param {Object} rowData - Raw row data object from Excel (header names as keys).
         * @returns {Object} Row object with standardized property names as keys.
         * @private
         */
        mapFixedAssetColumns(rowData) {
            const mapping = {
                SequenceID: ["sequence id", "sequenceid", "seq id", "seqid", "sequence number"],
                ReferenceDocumentItem: ["reference document item", "ref doc item", "refdocitem", "ref item"],
                BusinessTransactionType: ["business transaction type", "trans type", "transtype", "businesstransactiontype", "bus. trans. type"],
                CompanyCode: ["company code", "comp code", "companycode", "co code"],
                MasterFixedAsset: ["master fixed asset", "master asset", "main asset", "masterfixedasset", "asset"],
                FixedAsset: ["fixed asset", "asset subnumber", "subnumber", "fixedasset", "sub no", "asset sub no"],
                DocumentDate: ["document date", "doc date", "documentdate"],
                PostingDate: ["posting date", "post date", "postingdate"],
                AssetValueDate: ["asset value date", "value date", "assetvaluedate", "cap. date", "capitalization date"],
                AcqnAmtInTransactionCurrency: ["acquisition amount in transaction currency", "amount", "acq amount", "acqnamtintransactioncurrency", "amount posted", "acquisition value", "trans. amount"],
                TransactionCurrency: ["transaction currency", "currency", "curr", "transactioncurrency", "trans curr", "crcy"],
                OffsettingAccount: ["offsetting account", "offsetting acct", "gl account", "offsettingaccount", "g/l account", "offsetting gl"],
                DocumentReferenceID: ["document reference id", "doc ref id", "docrefid", "reference", "documentreferenceid", "invoice number", "invoice ref"],
                AccountingDocumentHeaderText: ["accounting document header text", "header text", "accountingdocumentheadertext", "doc header text"],
                DocumentItemText: ["document item text", "item text", "documentitemtext", "line item text"],
                QuantityInBaseUnit: ["quantity in base unit", "quantity", "qty", "quantityinbaseunit"],
                BaseUnitSAPCode: ["base unit sap code", "base unit", "unit sap", "baseunitsapcode", "uom", "sap uom"]
                // Add other fields as needed
            };

            const standardizedRow = {};
            const inputKeys = Object.keys(rowData);
            const inputKeysLower = inputKeys.map(k => String(k).toLowerCase().trim()); // Ensure keys are strings

            for (const standardKey in mapping) {
                const possibleHeaders = mapping[standardKey];
                let foundValue = undefined; // Use undefined initially

                for (const header of possibleHeaders) {
                    const index = inputKeysLower.indexOf(header);
                    if (index !== -1) {
                        const originalKey = inputKeys[index];
                        foundValue = rowData[originalKey];
                        // Treat empty strings from Excel as null for consistency
                        if (foundValue === "") {
                            foundValue = null;
                        }
                        break;
                    }
                }
                // Assign only if found, otherwise the key won't exist on standardizedRow
                if (foundValue !== undefined) {
                    standardizedRow[standardKey] = foundValue;
                }
            }
            return standardizedRow;
        }


        /**
         * Transforms processed entries into the specific payload format required by the OData service.
         * Selects and renames fields as needed by the API.
         * @param {Array<object>} processedEntries - Array of validated/processed entry objects.
         * @returns {Array<object>} Array of OData payload objects.
         */
        transformFixedAssetToOData(processedEntries) {
            this._logInfo(`Transforming array of ${processedEntries.length} Fixed Asset entries to OData format`);
            // Process each entry and filter out any that fail transformation
            return processedEntries.map(entry => this._transformSingleFixedAssetToOData(entry))
                .filter(payload => payload !== null); // Remove nulls from failed transformations
        }

        /**
        * Transform a single fixed asset entry to OData format
        * @param {Object} entry - Fixed asset entry
        * @returns {Object | null} Transformed data in OData format, or null if invalid
        * @private
        */
        _transformSingleFixedAssetToOData(entry) {
            if (!entry || typeof entry !== 'object') {
                this._logError("Invalid input entry for OData transformation.");
                return null;
            }
            // Payload structure based on parameters of the 'Post' action in CE_FIXEDASSETACQUISITION_0001.json
            const oDataPayload = {
                ReferenceDocumentItem: entry.ReferenceDocumentItem || '1',
                BusinessTransactionType: entry.BusinessTransactionType,
                CompanyCode: entry.CompanyCode,
                MasterFixedAsset: entry.MasterFixedAsset,
                FixedAsset: entry.FixedAsset,
                DocumentDate: entry.DocumentDate,
                PostingDate: entry.PostingDate,
                AssetValueDate: entry.AssetValueDate || entry.PostingDate,
                DebitCreditCode: entry.DebitCreditCode || 'S', // Default to 'S' if not provided
                FixedAssetYearOfAcqnCode: entry.FixedAssetYearOfAcqnCode || '1', // Default to '1' if not provided
                TransactionCurrency: entry.TransactionCurrency,
                AcqnAmtInTransactionCurrency: entry.AcqnAmtInTransactionCurrency,
                OffsettingAccount: entry.OffsettingAccount,
                // Optional fields - only include if they have a value
                ...(entry.DocumentReferenceID && { DocumentReferenceID: entry.DocumentReferenceID }),
                ...(entry.AccountingDocumentHeaderText && { AccountingDocumentHeaderText: entry.AccountingDocumentHeaderText }),
                ...(entry.DocumentItemText && { DocumentItemText: entry.DocumentItemText }),
                ...(entry.QuantityInBaseUnit && { QuantityInBaseUnit: entry.QuantityInBaseUnit }),
                ...(entry.BaseUnitSAPCode && { BaseUnitSAPCode: entry.BaseUnitSAPCode }),
                ...(entry.BaseUnitISOCode && { BaseUnitISOCode: entry.BaseUnitISOCode }), // Added
                ...(entry.AccountingDocumentType && { AccountingDocumentType: entry.AccountingDocumentType }), // Added
                ...(entry.AssignmentReference && { AssignmentReference: entry.AssignmentReference }), // Added
            };

            // Basic check for essential fields before returning
            if (!oDataPayload.BusinessTransactionType || !oDataPayload.CompanyCode || !oDataPayload.MasterFixedAsset ||
                !oDataPayload.FixedAsset || !oDataPayload.DocumentDate || !oDataPayload.PostingDate ||
                !oDataPayload.TransactionCurrency || oDataPayload.AcqnAmtInTransactionCurrency === null || !oDataPayload.OffsettingAccount) {
                this._logError("Missing essential field for OData payload:", { entryIndex: entry._originalIndex, payload: oDataPayload });
                return null; // Indicate failure to transform
            }

            return oDataPayload;
        }
        _transformSingleFixedAssetToOData(entry) {
            if (!entry || typeof entry !== 'object') {
                this._logError("Invalid input entry for OData transformation.");
                return null;
            }
            // Payload structure based on parameters of the 'Post' action in CE_FIXEDASSETACQUISITION_0001.json
            const oDataPayload = {
                ReferenceDocumentItem: entry.ReferenceDocumentItem || '1',
                BusinessTransactionType: entry.BusinessTransactionType,
                CompanyCode: entry.CompanyCode,
                MasterFixedAsset: entry.MasterFixedAsset,
                FixedAsset: entry.FixedAsset,
                DocumentDate: entry.DocumentDate,
                PostingDate: entry.PostingDate,
                AssetValueDate: entry.AssetValueDate || entry.PostingDate,
                DebitCreditCode: entry.DebitCreditCode || 'S', // Default to 'S' if not provided
                FixedAssetYearOfAcqnCode: entry.FixedAssetYearOfAcqnCode || '1', // Default to '1' if not provided
                TransactionCurrency: entry.TransactionCurrency,
                AcqnAmtInTransactionCurrency: entry.AcqnAmtInTransactionCurrency,
                OffsettingAccount: entry.OffsettingAccount,
                // Optional fields - only include if they have a value
                ...(entry.DocumentReferenceID && { DocumentReferenceID: entry.DocumentReferenceID }),
                ...(entry.AccountingDocumentHeaderText && { AccountingDocumentHeaderText: entry.AccountingDocumentHeaderText }),
                ...(entry.DocumentItemText && { DocumentItemText: entry.DocumentItemText }),
                ...(entry.QuantityInBaseUnit && { QuantityInBaseUnit: entry.QuantityInBaseUnit }),
                ...(entry.BaseUnitSAPCode && { BaseUnitSAPCode: entry.BaseUnitSAPCode }),
                ...(entry.BaseUnitISOCode && { BaseUnitISOCode: entry.BaseUnitISOCode }), // Added
                ...(entry.AccountingDocumentType && { AccountingDocumentType: entry.AccountingDocumentType }), // Added
                ...(entry.AssignmentReference && { AssignmentReference: entry.AssignmentReference }), // Added
            };

            // Basic check for essential fields before returning
            if (!oDataPayload.BusinessTransactionType || !oDataPayload.CompanyCode || !oDataPayload.MasterFixedAsset ||
                !oDataPayload.FixedAsset || !oDataPayload.DocumentDate || !oDataPayload.PostingDate ||
                !oDataPayload.TransactionCurrency || oDataPayload.AcqnAmtInTransactionCurrency === null || !oDataPayload.OffsettingAccount) {
                this._logError("Missing essential field for OData payload:", { entryIndex: entry._originalIndex, payload: oDataPayload });
                return null; // Indicate failure to transform
            }

            return oDataPayload;
        }

        /**
    * Processes the results from BatchProcessingManager for export.
    * Combines success and error records into a single list suitable for export.
    * @param {object} responseData - The responseData object from BatchProcessingManager.
    * @param {string} type - The type of export ('all', 'success', 'error').
    * @returns {Array<object>} An array of objects formatted for export.
    */
        processResultsForExport(batchData, type) {
            console.log("Processing batch results for export:", { type, batchData });

            const columnOrder = [
                "SequenceID",
                "Status",
                "Messages",
                "ReferenceDocument",
                "FixedAssetPostingUUID",
                "CompanyCode",
                "MasterFixedAsset",
                "FixedAsset",
                "BusinessTransactionType",
                "PostingDate",
                "DocumentDate",
                "AssetValueDate",
                "AcqnAmtInTransactionCurrency",
                "TransactionCurrency",
                "OffsettingAccount",
                "DocumentReferenceID",
                "AccountingDocumentHeaderText",
                "DocumentItemText",
                "QuantityInBaseUnit",
                "BaseUnitSAPCode"
            ];

            // Determine which array of records to use based on type
            let recordsToExport = [];

            if (!batchData) {
                console.warn("No batch data provided for export processing");
                return [];
            }

            if (type.toLowerCase() === "success") {
                recordsToExport = batchData.successRecords || [];
            } else if (type.toLowerCase().startsWith("error")) {
                recordsToExport = batchData.errorRecords || [];
            } else { // "all" or any other value
                recordsToExport = [
                    ...(batchData.successRecords || []),
                    ...(batchData.errorRecords || [])
                ];
            }

            console.log(`Selected ${recordsToExport.length} records for export processing`);

            // Transform records to ensure they have all necessary fields
            const processedRecords = recordsToExport.map((record, index) => {
                // Start with original entry data or empty object
                const entry = record.entry || {};
                // Get response data or empty object
                const response = record.response || {};
                // Get message object or empty object
                const message = record.message || {};

                // CRITICAL: Determine if this is a success record
                // This is the source of truth for the status
                const isSuccessRecord = batchData.successRecords && batchData.successRecords.includes(record);

                // Create a processed record with all relevant fields
                const processedRecord = {
                    // Include sequence ID for ordering
                    SequenceID: entry.SequenceID || entry._originalIndex || (index + 1).toString(),

                    // Include all fields from entry
                    ...entry,

                    // Include all fields from response
                    ...response,

                    // FIXED: Force the status to either "Success" or "Error" based on which array the record came from
                    Status: isSuccessRecord ? "Success" : "Error",

                    // Consolidated Message field
                    Message: this._consolidateMessageFields(record, message, isSuccessRecord, response),
                };

                // Remove individual message fields that are now consolidated
                delete processedRecord.message;
                delete processedRecord.errorCode;
                delete processedRecord.errorMessage;
                delete processedRecord.errorDetails;

                // Remove OData metadata fields that aren't needed for export
                const fieldsToExclude = [
                    '@$ui5.context.isTransient',
                    '@odata.context',
                    '@odata.metadataEtag',
                    'ValidationErrors',
                    'SAP__Messages'
                ];

                fieldsToExclude.forEach(field => delete processedRecord[field]);

                // Create a new ordered object based on column order
                const orderedRecord = {};

                // First, add fields in the specified order
                columnOrder.forEach(field => {
                    if (processedRecord.hasOwnProperty(field)) {
                        orderedRecord[field] = processedRecord[field];
                    }
                });

                // Then add any remaining fields that weren't in the column order
                Object.keys(processedRecord).forEach(key => {
                    if (!orderedRecord.hasOwnProperty(key) && !fieldsToExclude.includes(key)) {
                        orderedRecord[key] = processedRecord[key];
                    }
                });

                return orderedRecord;
            });

            // Sort by SequenceID
            processedRecords.sort((a, b) => {
                const seqA = parseInt(a.SequenceID, 10);
                const seqB = parseInt(b.SequenceID, 10);
                if (isNaN(seqA) || isNaN(seqB)) {
                    // Fallback to string comparison if parsing fails
                    return String(a.SequenceID).localeCompare(String(b.SequenceID));
                }
                return seqA - seqB;
            });

            return processedRecords;
        }

        /**
         * Consolidates multiple message fields into a single SAP__Messages field
         * @private
         */
        _consolidateMessageFields(record, message, isSuccessRecord, response) {
            let consolidatedMessage = "";

            if (isSuccessRecord) {
                // For success records, prioritize the message text
                consolidatedMessage =
                    message.message ||
                    (typeof record.message === 'string' ? record.message : '') ||
                    `Asset posted with document ${response.ReferenceDocument || ""} (UUID: ${response.FixedAssetPostingUUID || ""})`;
            } else {
                // For error records, include error code if available
                const errorCode = record.errorCode || message.code || '';
                const errorMessage =
                    message.message ||
                    record.errorMessage ||
                    (typeof record.message === 'string' ? record.message : '') ||
                    "Error occurred during processing";

                consolidatedMessage = errorCode ? `[${errorCode}] ${errorMessage}` : errorMessage;

                // If there are additional error details, append them
                if (record.errorDetails || message.details) {
                    const details = record.errorDetails || message.details;
                    if (typeof details === 'object') {
                        // Extract meaningful details, avoiding circular references
                        const safeDetails = this._extractSafeDetails(details);
                        if (safeDetails) {
                            consolidatedMessage += ` - Details: ${safeDetails}`;
                        }
                    } else if (typeof details === 'string') {
                        consolidatedMessage += ` - Details: ${details}`;
                    }
                }
            }

            return consolidatedMessage;
        }

        /**
         * Safely extracts details from an object, avoiding circular references
         * @private
         */
        _extractSafeDetails(details) {
            if (!details || typeof details !== 'object') {
                return null;
            }

            try {
                // Only extract specific, safe fields
                const safeFields = ['message', 'code', 'target', 'description', 'errorMessage'];
                const extracted = {};

                for (const field of safeFields) {
                    if (details[field] && typeof details[field] !== 'object') {
                        extracted[field] = details[field];
                    }
                }

                // Convert to string only if we have extracted something
                return Object.keys(extracted).length > 0 ? JSON.stringify(extracted) : null;
            } catch (e) {
                console.warn("Failed to extract error details:", e);
                return null;
            }
        }
    }; // End of class definition
});
