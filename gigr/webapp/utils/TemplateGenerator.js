sap.ui.define([
    "gigr/utils/XlsxFormatter"
], function (XlsxFormatter) {
    "use strict";

    return class TemplateGenerator {

        constructor(options = {}) {
            this._xlsxFormatter = options.xlsxFormatter || new XlsxFormatter();
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

                    if (this._customProcessor && typeof this._customProcessor.createTemplateBlob === 'function') {
                        try {
                            console.debug("TemplateGenerator: Using custom processor.");
                            blob = await this._customProcessor.createTemplateBlob();
                            if (!(blob instanceof Blob)) blob = null;
                        } catch (customError) {
                            console.warn("TemplateGenerator: Custom processor failed, using default.", customError);
                            blob = null;
                        }
                    }

                    if (!blob) {
                        console.debug("TemplateGenerator: Using default XLSX template generation.");
                        const headers = [
                            "Sequence Number", "GRN Document Number", "DocumentDate", "PostingDate", "MaterialDocumentHeaderText",
                            "GoodsMovementCode", "GRN Document Number", "Material", "Plant", "StorageLocation",
                            "GoodsMovementType", "Account Assignment", "QuantityInEntryUnit", "WBSElement",
                            "GLAccount", "Entry Unit", "Materialdocumentitemtext", "SpecialStockIdfgWBSElement"
                        ];

                        const exampleRow = {
                            "Sequence Number": 1,
                            "GRNDocumentNumber": "4900000201",
                            "DocumentDate": "2025-01-01",
                            "PostingDate": "2025-01-01",
                            "MaterialDocumentHeaderText": "API test",
                            "GoodsMovementCode": "03",
                            "Material": "100000274",
                            "Plant": "2001",
                            "StorageLocation": "WH01",
                            "GoodsMovementType": "221",
                            "AccountAssignmentCategory": "Q",
                            "QuantityInEntryUnit": "1",
                            "WBSElement": "I-24-DEP-100-BATDL",
                            "GLAccount": "51600000",
                            "EntryUnit": "PC",
                            "MaterialDocumentItemText": "SITE-1",
                            "SpecialStockIdfgWBSElement": "I-24-DEP-100-BATHR"
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
            let defaultName = "GI_GR_Document_Template.xlsx";
            if (this._customProcessor && typeof this._customProcessor.getTemplateFileName === 'function') {
                try {
                    return this._customProcessor.getTemplateFileName() || defaultName;
                } catch (e) { }
            }
            return defaultName;
        }
    };
});
