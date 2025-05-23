sap.ui.define([
    "assetmastercreate/utils/XlsxFormatter"
], function (XlsxFormatter) {
    "use strict";

    return class TemplateGenerator {

        constructor(options = {}) {
            this._xlsxFormatter = options.xlsxFormatter || new XlsxFormatter();
            this._customProcessor = options.customExcelProcessor;

            // Define the standard mapping
            this.AREA_TO_LEDGER_MAP = {
                '01': '0L',
                '15': '0L',
                '32': '2L',
                '34': '3L'
            };
        }

        /**
         * Generates the template file Blob with updated column structure
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
                        console.debug("TemplateGenerator: Generating Asset Master template with new structure.");
                        const headers = this._getUpdatedHeaders();
                        const exampleRow = this._getUpdatedExampleData();
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
         * Returns the updated headers with new naming convention
         */
        _getUpdatedHeaders() {
            return [
                // Basic Information
                "Seq_ID",
                "CompanyCode",
                "AssetClass",
                "AssetIsForPostCapitalization",
                "FixedAssetDescription",
                "AssetAdditionalDescription",
                "AssetSerialNumber",
                "BaseUnit",
                "InventoryNote",
                "WBSElementExternalID",
                "Room",

                // Capitalization Dates per Ledger
                "CapDate_0L",
                "CapDate_2L",
                "CapDate_3L",

                // Area 01 (Ledger 0L)
                "ValidityDate_01",
                "DeprKey_01",
                "UsefulLife_01",
                "ScrapPercent_01",

                // Area 15 (Ledger 0L)
                "ValidityDate_15",
                "DeprKey_15",
                "UsefulLife_15",
                "ScrapPercent_15",

                // Area 32 (Ledger 2L)
                "ValidityDate_32",
                "DeprKey_32",
                "UsefulLife_32",
                "ScrapPercent_32",

                // Area 34 (Ledger 3L)
                "ValidityDate_34",
                "DeprKey_34",
                "UsefulLife_34",
                "ScrapPercent_34",

                // India-specific and Custom fields
                "IN_AssetBlock",
                "IN_AssetPutToUseDate",
                "IN_AssetIsPriorYear",
                "YY1_WBS_ELEMENT"
            ];
        }

        /**
         * Returns example data with the new structure
         */
        _getUpdatedExampleData() {
            return {
                // Basic Information
                "Seq_ID": 1,
                "CompanyCode": "2000",
                "AssetClass": "Z240",
                "AssetIsForPostCapitalization": "FALSE",
                "FixedAssetDescription": "Monkey Cage",
                "AssetAdditionalDescription": "Monkey Cage",
                "AssetSerialNumber": "12345",
                "BaseUnit": "EA",
                "InventoryNote": "INNOTE",
                "WBSElementExternalID": "B-SBP-OF-00TSSBI0014-A",
                "Room": "ROOM",

                // Capitalization Dates
                "CapDate_0L": "2025-01-01",
                "CapDate_2L": "2025-01-01",
                "CapDate_3L": "2025-01-01",

                // Area 01 (Book Depreciation - Ledger 0L)
                "ValidityDate_01": "2025-01-01",
                "DeprKey_01": "INWD",
                "UsefulLife_01": "10",
                "ScrapPercent_01": "10",

                // Area 15 (Alternative Book - Ledger 0L)
                "ValidityDate_15": "2025-01-01",
                "DeprKey_15": "INWD",
                "UsefulLife_15": "10",
                "ScrapPercent_15": "10",

                // Area 32 (Tax Depreciation - Ledger 2L)
                "ValidityDate_32": "2025-01-01",
                "DeprKey_32": "9AWD",
                "UsefulLife_32": "10",
                "ScrapPercent_32": "10",

                // Area 34 (Alternative - Ledger 3L)
                "ValidityDate_34": "2025-01-01",
                "DeprKey_34": "9NWD",
                "UsefulLife_34": "10",
                "ScrapPercent_34": "10",

                // Additional Information
                "IN_AssetBlock": "Z100",
                "IN_AssetPutToUseDate": "",
                "IN_AssetIsPriorYear": "",
                "YY1_WBS_ELEMENT": "W-TPWT3STN2829"
            };
        }

        /**
         * Enhanced template with configuration sheet
         */
        async generateEnhancedTemplateBlob() {
            try {
                const wb = XLSX.utils.book_new();

                // Create Data Sheet
                const headers = this._getUpdatedHeaders();
                const exampleData = [this._getUpdatedExampleData()];
                const dataWs = XLSX.utils.json_to_sheet(exampleData, { header: headers });
                XLSX.utils.book_append_sheet(wb, dataWs, "Asset Data");

                // Create Configuration Sheet
                const configData = [
                    { Ledger: "0L", "Depreciation Area": "01", Description: "Book Depreciation", "Valid Keys": "INWD, INDD, INSD, 0000" },
                    { Ledger: "0L", "Depreciation Area": "15", Description: "Alternative Book", "Valid Keys": "INWD, INDD, INSD, 0000" },
                    { Ledger: "2L", "Depreciation Area": "32", Description: "Tax Depreciation", "Valid Keys": "9AWD, 9ADD, 9ASD, 0000" },
                    { Ledger: "3L", "Depreciation Area": "34", Description: "Alternative Reporting", "Valid Keys": "9NWD, 9NDD, 9NSD, 0000" }
                ];
                const configWs = XLSX.utils.json_to_sheet(configData);
                XLSX.utils.book_append_sheet(wb, configWs, "Configuration");

                // Create Instructions Sheet
                const instructions = [
                    { Instruction: "Column Naming Convention:" },
                    { Instruction: "- CapDate_XL: Capitalization date for Ledger XL (e.g., CapDate_0L)" },
                    { Instruction: "- DeprKey_XX: Depreciation key for area XX (e.g., DeprKey_01)" },
                    { Instruction: "- UsefulLife_XX: Useful life in years for area XX" },
                    { Instruction: "- ScrapPercent_XX: Scrap percentage for area XX" },
                    { Instruction: "" },
                    { Instruction: "The system automatically maps:" },
                    { Instruction: "- Areas 01, 15 → Ledger 0L" },
                    { Instruction: "- Area 32 → Ledger 2L" },
                    { Instruction: "- Area 34 → Ledger 3L" }
                ];
                const instructWs = XLSX.utils.json_to_sheet(instructions);
                XLSX.utils.book_append_sheet(wb, instructWs, "Instructions");

                // Convert to blob
                const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
                return new Blob([wbout], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });

            } catch (error) {
                console.error("Error generating enhanced template:", error);
                throw error;
            }
        }

        /**
         * Gets the template filename
         */
        getTemplateFileName() {
            let defaultName = "Asset_Master_Template_v2.xlsx";
            if (this._customProcessor && typeof this._customProcessor.getTemplateFileName === 'function') {
                try {
                    return this._customProcessor.getTemplateFileName() || defaultName;
                } catch (e) { }
            }
            return defaultName;
        }
    };
});