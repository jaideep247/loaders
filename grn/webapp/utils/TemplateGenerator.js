// New file: grn/utils/export/TemplateGenerator.js
sap.ui.define([
    "grn/utils/XlsxFormatter" // Depends on XlsxFormatter for default template
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
                        const headers = [ /* ... Paste headers from createTemplateWorkbook ... */
                             "Sequence Number", "GRN Document Number", "Document Date", "Posting Date",
                             "Material Document Header Text", "Reference Document", "Goods Movement Code",
                             "Material", "Plant", "Storage Location", "Goods Movement Type", "Purchase Order",
                             "Purchase Order Item", "Goods Movement Ref Doc Type", "Quantity In Entry Unit", "Entry Unit"
                        ];
                        const exampleRow = { /* ... Paste exampleRow from createTemplateWorkbook ... */
                             "Sequence Number": 1, "GRN Document Number": "123456789", "Document Date": "2025-04-17",
                             "Posting Date": "2025-04-17", "Material Document Header Text": "Goods Receipt via Upload",
                             "Reference Document": "Delivery Note 9876", "Goods Movement Code": "01", "Material": "MATERIAL-001",
                             "Plant": "1000", "Storage Location": "RM01", "Goods Movement Type": "101", "Purchase Order": "4500000999",
                             "Purchase Order Item": "10", "Goods Movement Ref Doc Type": "B", "Quantity In Entry Unit": "125.5", "Entry Unit": "KG"
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
            let defaultName = "Material_Document_Template.xlsx";
             if (this._customProcessor && typeof this._customProcessor.getTemplateFileName === 'function') {
                 try {
                    return this._customProcessor.getTemplateFileName() || defaultName;
                 } catch (e) { /* ignore error, use default */ }
             }
             return defaultName;
         }
    };
});