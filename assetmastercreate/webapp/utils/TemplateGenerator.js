sap.ui.define([
    "assetmastercreate/utils/XlsxFormatter"
], function (XlsxFormatter) {
    "use strict";

    return class TemplateGenerator {

        constructor(options = {}) {
            this._xlsxFormatter = options.xlsxFormatter || new XlsxFormatter();
            this._customProcessor = options.customExcelProcessor;
        }

        /**
         * Generates the template file Blob with asset master data structure
         * @returns {Promise<Blob>} Promise resolving with the template Blob
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
                        console.debug("TemplateGenerator: Generating Asset Master template.");
                        const headers = this._getAssetMasterHeaders();
                        const exampleRow = this._getExampleAssetData();
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
         * Returns the structured headers for asset master data
         * @private
         * @returns {Array} Array of header strings
         */
        _getAssetMasterHeaders() {
            return [
                // Basic Asset Information
                "Seq. ID", "Companycode", "Assetclass", "AssetIsForPostCapitalization",
                "FixedAssetDescription", "AssetAdditionalDescription", "AssetSerialNumber",
                "BaseUnit", "InventoryNote", "WBSElementExternalID", "Room",

                // Capitalization Dates (multiple ledgers)
                "Ledger", "AssetCapitalizationDate",
                "Ledger", "AssetCapitalizationDate",
                "Ledger", "AssetCapitalizationDate",

                // Depreciation Areas Configuration
                "AssetDepreciationArea", "NegativeAmountIsAllowed", "DepreciationStartDate",
                "AssetDepreciationArea", "NegativeAmountIsAllowed", "DepreciationStartDate",
                "AssetDepreciationArea", "NegativeAmountIsAllowed", "DepreciationStartDate",
                "AssetDepreciationArea", "NegativeAmountIsAllowed", "DepreciationStartDate",

                // Depreciation Area 01 Details
                "AssetDepreciationArea", "DepreciationKey", "PlannedUsefulLifeInYears",
                "PlannedUsefulLifeInPeriods", "ScrapAmountInCoCodeCrcy", "CurrencyCode",
                "AcqnProdnCostScrapPercent",

                // Depreciation Area 15 Details
                "AssetDepreciationArea", "DepreciationKey", "PlannedUsefulLifeInYears",
                "PlannedUsefulLifeInPeriods", "ScrapAmountInCoCodeCrcy", "CurrencyCode",
                "AcqnProdnCostScrapPercent",

                // Depreciation Area 32 Details
                "AssetDepreciationArea", "DepreciationKey", "PlannedUsefulLifeInYears",
                "PlannedUsefulLifeInPeriods", "ScrapAmountInCoCodeCrcy", "CurrencyCode",
                "AcqnProdnCostScrapPercent",

                // Depreciation Area 34 Details
                "AssetDepreciationArea", "DepreciationKey", "PlannedUsefulLifeInYears",
                "PlannedUsefulLifeInPeriods", "ScrapAmountInCoCodeCrcy", "CurrencyCode",
                "AcqnProdnCostScrapPercent",

                // Additional Information
                "IN_AssetBlock", "IN_AssetPutToUseDate", "IN_AssetIsPriorYear", "YY1_WBS_ELEMENT"
            ];
        }

        /**
         * Returns example asset data matching the provided sample
         * @private
         * @returns {Object} Example asset data object
         */
        _getExampleAssetData() {
            return {
                // Basic Asset Information
                "Seq. ID": 1,
                "Companycode": "1000",
                "Assetclass": "Z100",
                "AssetIsForPostCapitalization": "",
                "FixedAssetDescription": "FA Description",
                "AssetAdditionalDescription": "AA Description",
                "AssetSerialNumber": "12345",
                "BaseUnit": "EA",
                "InventoryNote": "INNOTE",
                "WBSElementExternalID": "C-FINDIP-DL",
                "Room": "Room",

                // Capitalization Dates
                "Ledger": "0L", "AssetCapitalizationDate": "2025-01-01",
                "Ledger": "2L", "AssetCapitalizationDate": "2025-01-01",
                "Ledger": "3L", "AssetCapitalizationDate": "2025-01-01",

                // Depreciation Areas Configuration
                "AssetDepreciationArea": "01", "NegativeAmountIsAllowed": "true", "DepreciationStartDate": "2025-01-01",
                "AssetDepreciationArea": "15", "NegativeAmountIsAllowed": "false", "DepreciationStartDate": "2025-01-01",
                "AssetDepreciationArea": "32", "NegativeAmountIsAllowed": "false", "DepreciationStartDate": "2025-01-01",
                "AssetDepreciationArea": "34", "NegativeAmountIsAllowed": "false", "DepreciationStartDate": "2025-01-01",

                // Depreciation Area 01 Details
                "AssetDepreciationArea": "01",
                "DepreciationKey": "INWD",
                "PlannedUsefulLifeInYears": "5",
                "PlannedUsefulLifeInPeriods": "4",
                "ScrapAmountInCoCodeCrcy": "5",
                "CurrencyCode": "INR",
                "AcqnProdnCostScrapPercent": "15",

                // Depreciation Area 15 Details
                "AssetDepreciationArea": "15",
                "DepreciationKey": "INDD",
                "PlannedUsefulLifeInYears": "5",
                "PlannedUsefulLifeInPeriods": "4",
                "ScrapAmountInCoCodeCrcy": "5",
                "CurrencyCode": "INR",
                "AcqnProdnCostScrapPercent": "32",

                // Depreciation Area 32 Details
                "AssetDepreciationArea": "32",
                "DepreciationKey": "9AWD",
                "PlannedUsefulLifeInYears": "5",
                "PlannedUsefulLifeInPeriods": "4",
                "ScrapAmountInCoCodeCrcy": "5",
                "CurrencyCode": "INR",
                "AcqnProdnCostScrapPercent": "34",

                // Depreciation Area 34 Details
                "AssetDepreciationArea": "34",
                "DepreciationKey": "9NDD",
                "PlannedUsefulLifeInYears": "5",
                "PlannedUsefulLifeInPeriods": "4",
                "ScrapAmountInCoCodeCrcy": "5",
                "CurrencyCode": "INR",
                "AcqnProdnCostScrapPercent": "Z100",

                // Additional Information
                "IN_AssetBlock": "Z100",
                "IN_AssetPutToUseDate": "",
                "IN_AssetIsPriorYear": "",
                "YY1_WBS_ELEMENT": "N-PIY-1"
            };
        }

        /**
         * Gets the template filename
         * @returns {string} The template filename
         */
        getTemplateFileName() {
            let defaultName = "Asset_Master_Create_Template.xlsx";
            if (this._customProcessor && typeof this._customProcessor.getTemplateFileName === 'function') {
                try {
                    return this._customProcessor.getTemplateFileName() || defaultName;
                } catch (e) { }
            }
            return defaultName;
        }
    };
});