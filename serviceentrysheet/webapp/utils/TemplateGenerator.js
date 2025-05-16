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
                        console.debug("TemplateGenerator: Using default XLSX template generation.");
                        const headers = [
                            "SL", "PurchasingOrganization", "PurchasingGroup", "Currency", "ServiceEntrySheetName",
                            "Supplier", "PostingDate", "ServiceEntrySheetItem", "AccountAssignmentCategory", "ConfirmedQuantity",
                            "Plant", "NetAmount", "NetPriceAmount", "PurchaseOrder", "PurchaseOrderItem",
                            "ServicePerformanceDate", "ServicePerformanceEndDate", "AccountAssignment",
                            "CostCenter", "GLAccount", "WBS Element", "GRNCreate"
                        ];

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
                            "ConfirmedQuantity": "1",
                            "Plant": "2001",
                            "NetAmount": "",
                            "NetPriceAmount": "",
                            "PurchaseOrder": "4300000001",
                            "PurchaseOrderItem": "10",
                            "ServicePerformanceDate": "2025-01-01",
                            "ServicePerformanceEndDate": "2025-01-01",
                            "ServiceEntrySheetItem": "10",
                            "AccountAssignment": "1",
                            "CostCenter": "",
                            "GLAccount": "61020050",
                            "WBS Element": "I-24-DEP-100-ATMDL",
                            "GRNCreate": "TRUE"
                        };
                        const wb = await this._xlsxFormatter.createWorkbookForTemplate(headers, exampleRow);
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
            let defaultName = "ServiceEntrySheet_Template.xlsx";
            if (this._customProcessor && typeof this._customProcessor.getTemplateFileName === 'function') {
                try {
                    return this._customProcessor.getTemplateFileName() || defaultName;
                } catch (e) { /* ignore error, use default */ }
            }
            return defaultName;
        }
    };
});