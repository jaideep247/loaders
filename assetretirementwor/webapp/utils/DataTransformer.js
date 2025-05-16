sap.ui.define([
    "sap/ui/base/Object"
], function (BaseObject) {
    "use strict";

    /**
     * DataTransformer
     * Utility class for transforming data between different formats for Fixed Asset Retirement
     */
    return BaseObject.extend("assetretirementwor.utils.DataTransformer", {
        /**
         * Constructor for DataTransformer
         */
        constructor: function () {
            BaseObject.call(this);
        },

        /**
         * Process rows for export to Excel/CSV
         * @param {Array} rows - Raw data rows
         * @param {String} [reportType="all"] - Type of report ("all", "success", "error")
         * @returns {Array} Processed rows for export
         */
        processRowsForExport: function (rows, reportType) {
            if (!rows || !Array.isArray(rows)) {
                return [];
            }

            // Filter rows based on report type if needed
            let filteredRows = rows;
            if (reportType === "success") {
                filteredRows = rows.filter(row => row.Status === "Valid");
            } else if (reportType === "error" || reportType === "errors") {
                filteredRows = rows.filter(row => row.Status === "Invalid");
            }

            // Map to export format
            return filteredRows.map(row => {
                return {
                    "Sequence ID": row.SequenceID || "",
                    "Reference Document Item": row.ReferenceDocumentItem || "",
                    "Business Transaction Type": row.BusinessTransactionType || "",
                    "Company Code": row.CompanyCode || "",
                    "Master Fixed Asset": row.MasterFixedAsset || "",
                    "Fixed Asset": row.FixedAsset || "",
                    "Document Date": row.DocumentDate || "",
                    "Posting Date": row.PostingDate || "",
                    "Asset Value Date": row.AssetValueDate || "",
                    "Retirement Type": row.FixedAssetRetirementType || "",
                    "Document Reference ID": row.DocumentReferenceID || "",
                    "Accounting Document Header Text": row.AccountingDocumentHeaderText || "",
                    "Transaction Currency": row.FxdAstRtrmtRevnTransCrcy || "",
                    "Retirement Amount": row.AstRtrmtAmtInTransCrcy || "",
                    "Quantity": row.FxdAstRtrmtQuantityInBaseUnit || "",
                    "Base Unit SAP Code": row.BaseUnitSAPCode || "",
                    "Base Unit ISO Code": row.BaseUnitISOCode || "",
                    "Accounting Document Type": row.AccountingDocumentType || "",
                    "Assignment Reference": row.AssignmentReference || "",
                    "Document Item Text": row.DocumentItemText || "",
                    "Status": row.Status || "",
                    "Validation Errors": row.ValidationErrors ? this._formatValidationErrors(row.ValidationErrors) : ""
                };
            });
        },

        /**
         * Process batch results for export
         * @param {Object} batchData - Data from batch processing
         * @param {String} [type="all"] - Type of records to process ("all", "success", "error"/"errors")
         * @returns {Array} Processed rows for export
         */
        processResultsForExport: function (batchData, type) {
            if (!batchData) {
                console.error("No batch data provided for export");
                return [];
            }

            console.log("Processing batch data for export: ", JSON.stringify(batchData));

            let recordsToProcess = [];
            if (type === "success") {
                recordsToProcess = batchData.successRecords || [];
            } else if (type === "error" || type === "errors") {
                recordsToProcess = batchData.errorRecords || [];
            } else {
                // "all" - combine both success and error records
                recordsToProcess = [].concat(
                    batchData.successRecords || [],
                    batchData.errorRecords || []
                );
            }

            console.log(`Found ${recordsToProcess.length} records to process for type: ${type}`);

            // Enhanced mapping with fall back to original input or entry + better error handling
            return recordsToProcess.map(record => {
                // Try to get the entry data from multiple possible locations
                const entry = record.entry || record.originalData || record;
                const message = record.message || {};
                const isSuccess = batchData.successRecords && batchData.successRecords.includes(record);

                console.log("Processing record: ", JSON.stringify({
                    hasEntry: !!record.entry,
                    hasOriginalData: !!record.originalData,
                    entry: entry,
                    message: message
                }));

                // Comprehensive export object with all fields
                return {
                    "Sequence ID": entry.SequenceID || "",
                    "Reference Document Item": entry.ReferenceDocumentItem || "",
                    "Business Transaction Type": entry.BusinessTransactionType || "",
                    "Company Code": entry.CompanyCode || "",
                    "Master Fixed Asset": entry.MasterFixedAsset || "",
                    "Fixed Asset": entry.FixedAsset || "",
                    "Document Date": entry.DocumentDate || "",
                    "Posting Date": entry.PostingDate || "",
                    "Asset Value Date": entry.AssetValueDate || "",
                    "Retirement Type": entry.FixedAssetRetirementType || "",
                    "Document Reference ID": entry.DocumentReferenceID || "",
                    "Accounting Document Header Text": entry.AccountingDocumentHeaderText || "",
                    "Transaction Currency": entry.FxdAstRtrmtRevnTransCrcy || entry.FxdAstRetirementTransCrcy || "",
                    "Retirement Amount": entry.AstRtrmtAmtInTransCrcy || "",
                    "Quantity": entry.FxdAstRtrmtQuantityInBaseUnit || "",
                    "Base Unit SAP Code": entry.BaseUnitSAPCode || "",
                    "Base Unit ISO Code": entry.BaseUnitISOCode || "",
                    "Accounting Document Type": entry.AccountingDocumentType || "",
                    "Assignment Reference": entry.AssignmentReference || "",
                    "Document Item Text": entry.DocumentItemText || "",
                    "Status": isSuccess ? "Success" : "Error",
                    "Message": message.message || record.errorMessage || "",
                    "Error Code": message.code || record.errorCode || "",
                    // Include response-specific fields if available
                    "Response Document Number": message.details?.extractedDetails?.documentNo ||
                        record.documentNumber ||
                        record.FixedAssetPostingUUID ||
                        ""
                };
            });
        },

        /**
         * Group data by a specific field
         * @param {Array} data - Array of data objects
         * @param {String} fieldName - Name of the field to group by
         * @param {String} [displayName] - Display name for the group
         * @returns {Object} Grouped data object
         */
        groupDataByField: function (data, fieldName, displayName) {
            if (!data || !Array.isArray(data) || !fieldName) {
                return {};
            }

            const groups = {};
            const label = displayName || fieldName;

            // Group data by the specified field
            data.forEach(item => {
                const groupValue = item[fieldName] || "Unspecified";
                if (!groups[groupValue]) {
                    groups[groupValue] = {
                        name: `${label}: ${groupValue}`,
                        data: []
                    };
                }
                groups[groupValue].data.push(item);
            });

            return groups;
        },

        /**
         * Transform data for retirement Post action
         * @param {Object} entry - Asset retirement entry
         * @returns {Object} Transformed entry for OData Post action
         */
        transformFixedAssetRetirementToOData: function (entry) {
            if (!entry) {
                return null;
            }

            // Transform data based on OData service requirements
            return {
                ReferenceDocumentItem: entry.ReferenceDocumentItem,
                BusinessTransactionType: entry.BusinessTransactionType,
                CompanyCode: entry.CompanyCode,
                MasterFixedAsset: entry.MasterFixedAsset,
                FixedAsset: entry.FixedAsset,
                DocumentDate: entry.DocumentDate,
                PostingDate: entry.PostingDate,
                AssetValueDate: entry.AssetValueDate,
                FixedAssetRetirementType: entry.FixedAssetRetirementType,
                DocumentReferenceID: entry.DocumentReferenceID || "",
                AccountingDocumentHeaderText: entry.AccountingDocumentHeaderText || "",
                FxdAstRtrmtQuantityInBaseUnit: this._formatQuantity(entry.FxdAstRtrmtQuantityInBaseUnit),
                BaseUnitSAPCode: entry.BaseUnitSAPCode || "",
                BaseUnitISOCode: entry.BaseUnitISOCode || "",
                AccountingDocumentType: entry.AccountingDocumentType || "",
                AssignmentReference: entry.AssignmentReference || "",
                DocumentItemText: entry.DocumentItemText || "",
            };
        },

        /**
         * Format date for OData service
         * @param {String} dateString - Date string in YYYY-MM-DD format
         * @returns {Object|null} Date object or null if invalid
         * @private
         */
        _formatDate: function (dateString) {
            if (!dateString || typeof dateString !== 'string') {
                return null;
            }

            // Try to parse the date
            try {
                // Check if the format is YYYY-MM-DD
                if (dateString.match(/^\d{4}-\d{2}-\d{2}$/)) {
                    const date = new Date(dateString + "T00:00:00Z");
                    if (!isNaN(date.getTime())) {
                        return date;
                    }
                }
                return null;
            } catch (e) {
                console.error("Error parsing date:", e);
                return null;
            }
        },

        /**
         * Format amount for OData service
         * @param {String|Number} amount - Amount to format
         * @returns {String} Formatted amount
         * @private
         */
        _formatAmount: function (amount) {
            if (amount === null || amount === undefined || amount === "") {
                return "0";
            }

            // If amount is already a string, try to parse it
            if (typeof amount === 'string') {
                // Remove any non-numeric characters except decimal point
                amount = amount.replace(/[^\d.-]/g, '');

                // Parse to number and format
                const numAmount = parseFloat(amount);
                if (!isNaN(numAmount)) {
                    return numAmount.toString();
                }
                return "0";
            }

            // If amount is a number
            if (typeof amount === 'number') {
                return amount.toString();
            }

            return "0";
        },

        /**
         * Format quantity for OData service
         * @param {String|Number} quantity - Quantity to format
         * @returns {String} Formatted quantity
         * @private
         */
        _formatQuantity: function (quantity) {
            // Similar to _formatAmount, but for quantities
            if (quantity === null || quantity === undefined || quantity === "") {
                return "0";
            }

            // If quantity is already a string, try to parse it
            if (typeof quantity === 'string') {
                // Remove any non-numeric characters except decimal point
                quantity = quantity.replace(/[^\d.-]/g, '');

                // Parse to number and format
                const numQuantity = parseFloat(quantity);
                if (!isNaN(numQuantity)) {
                    return numQuantity.toString();
                }
                return "0";
            }

            // If quantity is a number
            if (typeof quantity === 'number') {
                return quantity.toString();
            }

            return "0";
        },

        /**
         * Format validation errors for export
         * @param {Array} errors - Validation errors
         * @returns {String} Formatted error string
         * @private
         */
        _formatValidationErrors: function (errors) {
            if (!errors || !Array.isArray(errors) || errors.length === 0) {
                return "";
            }

            // Convert errors to string format
            return errors.map(err => {
                if (typeof err === 'string') {
                    return err;
                }
                if (typeof err === 'object') {
                    return `${err.field || 'Error'}: ${err.message || JSON.stringify(err)}`;
                }
                return String(err);
            }).join("; ");
        }
    });
});