sap.ui.define([
    "serviceentrysheet/utils/XlsxFormatter" // Depends on XlsxFormatter for default template
], function (XlsxFormatter) {
    "use strict";

    return class TemplateGenerator {

        constructor(options = {}) {
            // Inject XlsxFormatter for default template generation
            this._xlsxFormatter = options.xlsxFormatter || new XlsxFormatter();
            // Inject custom processor if provided
            this._customProcessor = options.customExcelProcessor;
        }

        /**
         * Generates the template file Blob, preferring custom processor.
         * Updated to include Service and QuantityUnit fields
         * @returns {Promise<Blob>} Promise resolving with the template Blob.
         */
        generateTemplateBlob() {
            return new Promise(async (resolve, reject) => {
                try {
                    let blob = null;
                    // Try custom processor first
                    if (this._customProcessor && typeof this._customProcessor.createTemplateBlob === 'function') {
                        try {
                            console.debug("TemplateGenerator: Using custom processor.");
                            blob = await this._customProcessor.createTemplateBlob();
                            if (!(blob instanceof Blob)) blob = null; // Fallback if it doesn't return a Blob
                        } catch (customError) {
                            console.warn("TemplateGenerator: Custom processor failed, using default.", customError);
                            blob = null;
                        }
                    }

                    // Fallback to default if no blob generated yet
                    if (!blob) {
                        console.debug("TemplateGenerator: Using default XLSX template generation with Service and QuantityUnit fields.");
                        
                        // Updated headers to include Service and QuantityUnit fields
                        const headers = [
                            "SL", "PurchasingOrganization", "PurchasingGroup", "Currency", "ServiceEntrySheetName",
                            "Supplier", "PostingDate", "ServiceEntrySheetItem", "AccountAssignmentCategory", 
                            "Service", "QuantityUnit", "ConfirmedQuantity", // Added Service and QuantityUnit
                            "Plant", "NetAmount", "NetPriceAmount", "PurchaseOrder", "PurchaseOrderItem",
                            "ServicePerformanceDate", "ServicePerformanceEndDate", "AccountAssignment",
                            "CostCenter", "GLAccount", "WBS Element", "GRNCreate"
                        ];

                        // Updated example row to include Service and QuantityUnit with example values
                        const exampleRow = {
                            "SL": "1",
                            "PurchasingOrganization": "2000",
                            "PurchasingGroup": "P01",
                            "Currency": "INR",
                            "ServiceEntrySheetName": "Service Entry Sheet Test Name",
                            "Supplier": "22000001",
                            "PostingDate": "2025-01-01",
                            "ServiceEntrySheetItem": "10",
                            "AccountAssignmentCategory": "Z",
                            "Service": "SERVICE001", // Example service number
                            "QuantityUnit": "EA", // Example unit (Hours)
                            "ConfirmedQuantity": "1",
                            "Plant": "2001",
                            "NetAmount": "1000.00",
                            "NetPriceAmount": "1000.00",
                            "PurchaseOrder": "4300000001",
                            "PurchaseOrderItem": "10",
                            "ServicePerformanceDate": "2025-01-01",
                            "ServicePerformanceEndDate": "2025-01-01",
                            "AccountAssignment": "1",
                            "CostCenter": "61020050",
                            "GLAccount": "",
                            "WBS Element": "I-24-DEP-100-ATMDL",
                            "GRNCreate": "TRUE"
                        };

                        // Create additional example rows to show different scenarios
                        const emptyServiceRow = {
                            "SL": "2",
                            "PurchasingOrganization": "2000",
                            "PurchasingGroup": "P01",
                            "Currency": "INR",
                            "ServiceEntrySheetName": "Service Entry Sheet Without Service",
                            "Supplier": "22000001",
                            "PostingDate": "2025-01-01",
                            "ServiceEntrySheetItem": "20",
                            "AccountAssignmentCategory": "K",
                            "Service": "", // Both empty - valid scenario
                            "QuantityUnit": "", // Both empty - valid scenario
                            "ConfirmedQuantity": "2",
                            "Plant": "2001",
                            "NetAmount": "2000.00",
                            "NetPriceAmount": "1000.00",
                            "PurchaseOrder": "4300000001",
                            "PurchaseOrderItem": "10",
                            "ServicePerformanceDate": "2025-01-01",
                            "ServicePerformanceEndDate": "2025-01-01",
                            "AccountAssignment": "1",
                            "CostCenter": "61020050",
                            "GLAccount": "",
                            "WBS Element": "",
                            "GRNCreate": "TRUE"
                        };

                        const wb = await this._xlsxFormatter.createWorkbookForTemplate(headers, [exampleRow, emptyServiceRow]);
                        blob = await this._xlsxFormatter.workbookToBlob(wb);
                    }

                    resolve(blob);

                } catch (error) {
                    console.error("Error generating template blob:", error);
                    reject(error);
                }
            });
        }

        /**
         * Gets the desired template filename, preferring custom processor.
         * @returns {string} The template filename.
         */
        getTemplateFileName() {
            let defaultName = "ServiceEntrySheet_Template_v2.xlsx"; // Updated version name
            if (this._customProcessor && typeof this._customProcessor.getTemplateFileName === 'function') {
                try {
                    return this._customProcessor.getTemplateFileName() || defaultName;
                } catch (e) { /* ignore error, use default */ }
            }
            return defaultName;
        }

        /**
         * Get field descriptions for template help/instructions
         * @returns {object} Field descriptions object
         */
        getFieldDescriptions() {
            return {
                "SL": "Sequential number for the entry",
                "PurchasingOrganization": "4-character purchasing organization code (Required)",
                "PurchasingGroup": "3-character purchasing group code (Required)",
                "Currency": "5-character currency code like INR, USD (Required)",
                "ServiceEntrySheetName": "Name/description of the service entry sheet (Required, max 40 chars)",
                "Supplier": "10-character supplier/vendor number (Required)",
                "PostingDate": "Posting date in YYYY-MM-DD format (Required)",
                "ServiceEntrySheetItem": "Item number, typically 10, 20, 30... (Required, max 5 chars)",
                "AccountAssignmentCategory": "Single character assignment category like K, Z (Required)",
                "Service": "Service/Product number (Optional, max 40 chars) - Must be provided with QuantityUnit or both must be blank",
                "QuantityUnit": "Unit of measure like HR, EA, KG (Optional, max 3 chars) - Must be provided with Service or both must be blank",
                "ConfirmedQuantity": "Quantity being confirmed (Required, decimal with up to 3 decimal places)",
                "Plant": "4-character plant code (Required)",
                "NetAmount": "Total net amount (Required, decimal with up to 3 decimal places)",
                "NetPriceAmount": "Price per unit (Required, decimal with up to 3 decimal places)",
                "PurchaseOrder": "Purchase order number (Required, max 10 chars)",
                "PurchaseOrderItem": "Purchase order item number (Required, max 5 chars)",
                "ServicePerformanceDate": "Service start date in YYYY-MM-DD format (Required)",
                "ServicePerformanceEndDate": "Service end date in YYYY-MM-DD format (Required)",
                "AccountAssignment": "Account assignment sequence number (Optional, max 2 chars)",
                "CostCenter": "Cost center for accounting (Optional, max 10 chars)",
                "GLAccount": "General Ledger account number (Optional, max 10 chars)",
                "WBS Element": "Work Breakdown Structure element (Optional, max 24 chars)",
                "GRNCreate": "Whether to create GRN (TRUE/FALSE)"
            };
        }

        /**
         * Get validation rules for template users
         * @returns {array} Array of validation rule descriptions
         */
        getValidationRules() {
            return [
                "All fields marked as 'Required' must have values",
                "Service and QuantityUnit must both have values OR both must be blank - mixed states will cause validation errors",
                "Dates must be in YYYY-MM-DD format",
                "Numeric fields (amounts, quantities) should use decimal format with dots (not commas)",
                "String field lengths must not exceed specified maximums",
                "At least one of CostCenter, GLAccount, or WBS Element must be provided for account assignment"
            ];
        }
    };
});