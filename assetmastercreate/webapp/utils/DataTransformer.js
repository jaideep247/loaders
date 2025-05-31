sap.ui.define([
    "sap/ui/base/Object"
], function (BaseObject) {
    "use strict";

    return BaseObject.extend("assetmastercreate.utils.DataTransformer", {

        constructor: function () {
            BaseObject.call(this);

            // Core configuration
            this.config = {
                defaultCurrency: "INR",
                defaultDate: () => new Date().toISOString().split('T')[0],
                areaToLedgerMap: {
                    '01': '0L', '15': '0L',
                    '32': '2L', '34': '3L'
                }
            };

            // Field mappings for Excel columns
            this.fieldMappings = {
                // Basic fields
                "seq_id": "SequenceNumber",
                "sequencenumber": "SequenceNumber",
                "companycode": "CompanyCode",
                "assetclass": "AssetClass",
                "assetisforpostcapitalization": "AssetIsForPostCapitalization",
                "fixedassetdescription": "FixedAssetDescription",
                "assetadditionaldescription": "AssetAdditionalDescription",
                "assetserialnumber": "AssetSerialNumber",
                "baseunit": "BaseUnit",
                "inventorynote": "InventoryNote",
                "wbselementexternalid": "WBSElementExternalID",
                "room": "Room",
                "in_assetblock": "IN_AssetBlock",
                "in_assetputtousedate": "IN_AssetPutToUseDate",
                "in_assetisprioryear": "IN_AssetIsPriorYear",
                "yy1_wbs_element": "YY1_WBS_ELEMENT",

                // Ledger field mappings
                "assetdepreciationarea": "AssetDepreciationArea",
                "negativeamountisallowed": "NegativeAmountIsAllowed",
                "depreciationstartdate": "DepreciationStartDate",
                "depreciationkey": "DepreciationKey",
                "plannedusefullifeinyears": "PlannedUsefulLifeInYears",
                "plannedusefullifeinperiods": "PlannedUsefulLifeInPeriods",
                "scrapamountincocodcrcy": "ScrapAmountInCoCodeCrcy",
                "currencycode": "CompanyCodeCurrency",
                "acqnprodnscostcrappercent": "AcqnProdnCostScrapPercent",
                "validitystartdate": "ValidityStartDate"
            };
        },

        // =================
        // MAIN TRANSFORMATION METHODS
        // =================

        /**
         * Transform flat Excel row to hierarchical structure
         */
        convertFlatToHierarchical: function (flatRow) {
            const mapped = this._mapBasicFields(flatRow);
            const structured = this._buildStructuredData(mapped);
            structured.ValidationErrors = this.validateAssetData(structured);
            return structured;
        },

        /**
         * Transform asset data for SAP OData API
         */
        transformToODataFormat: function (asset) {
            try {
                const sourceData = Array.isArray(asset) ? asset[0] : asset;

                const payload = {
                    CompanyCode: this._getValue(sourceData, "CompanyCode"),
                    AssetClass: this._getValue(sourceData, "AssetClass"),
                    AssetIsForPostCapitalization: this._parseBoolean(sourceData.AssetIsForPostCapitalization),

                    _General: this._buildGeneralSection(sourceData),
                    _AccountAssignment: this._buildAccountAssignmentSection(sourceData),
                    _Inventory: this._buildInventorySection(sourceData)
                };

                // Add optional sections
                this._addGlobalMasterData(payload, sourceData);
                this._addLedgerData(payload, sourceData);

                this._cleanEmptyObjects(payload);
                this._validateRequiredFields(payload);

                return payload;
            } catch (error) {
                throw new Error(`OData transformation failed: ${error.message}`);
            }
        },

        /**
         * Process entry data for UI display
         */
        processEntryDataForDisplay: function (entry) {
            const processed = JSON.parse(JSON.stringify(entry));

            processed.ProcessedValidationErrors = this._processValidationErrors(processed.ValidationErrors || []);
            processed.GlobalMasterData = this._processGlobalMasterDataForDisplay(processed);
            processed.LedgerDetails = this._processLedgerDetailsForDisplay(processed);
            processed.Status = processed.Status || (processed.ProcessedValidationErrors.length > 0 ? 'Invalid' : 'Valid');

            return processed;
        },

        // =================
        // HELPER METHODS
        // =================

        /**
         * Map basic Excel fields to standard names
         */
        _mapBasicFields: function (row) {
            const mapped = {};

            Object.entries(row).forEach(([key, value]) => {
                const normalizedKey = key.toLowerCase().replace(/\s+/g, '');
                const mappedField = this.fieldMappings[normalizedKey];

                if (mappedField) {
                    mapped[mappedField] = value;
                } else {
                    mapped[key] = value; // Keep original for pattern matching
                }
            });

            return mapped;
        },

        /**
         * Build structured data from mapped fields
         */
        _buildStructuredData: function (data) {
            const result = {};
            const ledgerData = {};

            // Separate basic fields from ledger patterns
            Object.entries(data).forEach(([key, value]) => {
                if (this._isLedgerField(key)) {
                    this._processLedgerField(key, value, ledgerData);
                } else {
                    result[key] = value;
                }
            });

            // Build ledger structure
            result._Ledger = this._buildLedgerArray(ledgerData);

            // Add India-specific fields
            if (result.IN_AssetBlock) {
                result._GlobMasterData = {
                    _IN_AssetBlockData: {
                        IN_AssetBlock: result.IN_AssetBlock,
                        IN_AssetPutToUseDate: result.IN_AssetPutToUseDate || "",
                        IN_AssetIsPriorYear: result.IN_AssetIsPriorYear || ""
                    }
                };
            }

            // Add custom fields
            if (result.YY1_WBS_ELEMENT) {
                result._CustomFields = { YY1_WBS_ELEMENT: result.YY1_WBS_ELEMENT };
            }

            return result;
        },

        /**
         * Check if field is ledger-related
         */
        _isLedgerField: function (key) {
            const patterns = [
                /^Ledger_\w+$/i,
                /^AssetCapitalizationDate_\w+$/i,
                /^.+_\w+_\d{2}$/i
            ];
            return patterns.some(pattern => pattern.test(key));
        },

        /**
         * Process ledger field patterns
         */
        _processLedgerField: function (key, value, ledgerData) {
            // Ledger code pattern: Ledger_0L
            if (/^Ledger_(\w+)$/i.test(key)) {
                const ledgerCode = key.match(/^Ledger_(\w+)$/i)[1];
                this._initLedger(ledgerData, ledgerCode);
                return;
            }

            // Capitalization date pattern: AssetCapitalizationDate_0L
            if (/^AssetCapitalizationDate_(\w+)$/i.test(key)) {
                const ledgerCode = key.match(/^AssetCapitalizationDate_(\w+)$/i)[1];
                this._initLedger(ledgerData, ledgerCode);
                ledgerData[ledgerCode].capitalizationDate = value;
                return;
            }

            // Complex pattern: FieldName_LedgerCode_AreaCode
            const complexMatch = key.match(/^(.+?)_(\w+)_(\d{2})$/i);
            if (complexMatch) {
                const [, fieldName, ledgerCode, areaCode] = complexMatch;
                this._initLedger(ledgerData, ledgerCode);
                this._initArea(ledgerData[ledgerCode], areaCode);

                const mappedField = this.fieldMappings[fieldName.toLowerCase()] || fieldName;
                ledgerData[ledgerCode].areas[areaCode][mappedField] = value;
            }
        },

        /**
         * Initialize ledger structure
         */
        _initLedger: function (ledgerData, ledgerCode) {
            if (!ledgerData[ledgerCode]) {
                ledgerData[ledgerCode] = { areas: {} };
            }
        },

        /**
         * Initialize area structure
         */
        _initArea: function (ledger, areaCode) {
            if (!ledger.areas[areaCode]) {
                ledger.areas[areaCode] = {};
            }
        },

        /**
         * Build ledger array from collected data
         */
        _buildLedgerArray: function (ledgerData) {
            return Object.entries(ledgerData).map(([ledgerCode, ledgerInfo]) => {
                const ledger = {
                    Ledger: ledgerCode,
                    AssetCapitalizationDate: ledgerInfo.capitalizationDate || null,
                    _Valuation: []
                };

                // Build valuations for each area
                Object.entries(ledgerInfo.areas || {}).forEach(([areaCode, areaData]) => {
                    ledger._Valuation.push({
                        AssetDepreciationArea: areaCode,
                        NegativeAmountIsAllowed: this._parseBoolean(areaData.NegativeAmountIsAllowed),
                        DepreciationStartDate: areaData.DepreciationStartDate || null,
                        _TimeBasedValuation: [{
                            ValidityStartDate: areaData.ValidityStartDate || areaData.DepreciationStartDate || null,
                            DepreciationKey: areaData.DepreciationKey || '',
                            PlannedUsefulLifeInYears: areaData.PlannedUsefulLifeInYears || '',
                            PlannedUsefulLifeInPeriods: areaData.PlannedUsefulLifeInPeriods || '0',
                            AcqnProdnCostScrapPercent: String(this._parseNumeric(areaData.AcqnProdnCostScrapPercent, "")),
                            ScrapAmountInCoCodeCrcy: String(this._parseNumeric(areaData.ScrapAmountInCoCodeCrcy, "")),
                            CompanyCodeCurrency: areaData.CompanyCodeCurrency || this.config.defaultCurrency,                           
                        }]
                    });
                });

                return ledger;
            });
        },

        /**
         * Build OData sections
         */
        _buildGeneralSection: function (data) {
            return {
                FixedAssetDescription: this._getValue(data, "FixedAssetDescription"),
                AssetAdditionalDescription: this._getValue(data, "AssetAdditionalDescription"),
                AssetSerialNumber: this._getValue(data, "AssetSerialNumber"),
                BaseUnitSAPCode: this._getValue(data, "BaseUnit") || "EA",
                BaseUnitISOCode: this._getValue(data, "BaseUnit") || "EA"
            };
        },

        _buildAccountAssignmentSection: function (data) {
            const section = {
                WBSElementExternalID: this._getValue(data, "WBSElementExternalID"),
                Room: this._getValue(data, "Room")
            };

            // Add custom field if present
            if (this._getValue(data, "YY1_WBS_ELEMENT")) {
                //    section.YY1_WBS_ELEMENT = this._getValue(data, "YY1_WBS_ELEMENT");
            }

            return section;
        },

        _buildInventorySection: function (data) {
            return {
                InventoryNote: this._getValue(data, "InventoryNote")
            };
        },

        _addGlobalMasterData: function (payload, data) {
            if (this._getValue(data, "IN_AssetBlock")) {
                payload._GlobMasterData = {
                    _IN_AssetBlockData: {
                        IN_AssetBlock: this._getValue(data, "IN_AssetBlock"),
                        IN_AssetPutToUseDate: this._getValue(data, "IN_AssetPutToUseDate"),
                        IN_AssetIsPriorYear: this._getValue(data, "IN_AssetIsPriorYear")
                    }
                };
            }
        },

        _addLedgerData: function (payload, data) {
            if (data._Ledger && Array.isArray(data._Ledger)) {
                payload._Ledger = data._Ledger.map(ledger => {
                    const ledgerPayload = { Ledger: ledger.Ledger };

                    // Add capitalization date if available
                    const capDate = ledger.AssetCapitalizationDate ||
                        data[`AssetCapitalizationDate_${ledger.Ledger}`];
                    if (capDate) {
                        ledgerPayload.AssetCapitalizationDate = capDate;
                    }

                    // Add valuations
                    if (ledger._Valuation) {
                        ledgerPayload._Valuation = ledger._Valuation;
                    }

                    return ledgerPayload;
                });
            }
        },

        /**
         * Process validation errors for display
         */
        _processValidationErrors: function (errors) {
            return errors.map(error => {
                if (typeof error === 'string') {
                    return { message: error, field: 'Unknown', sheet: '' };
                }
                return {
                    message: error.message || error.Message || JSON.stringify(error),
                    field: error.field || error.Field || 'Unknown',
                    sheet: error.sheet || error.Sheet || ''
                };
            }).filter(error => error.message);
        },

        _processGlobalMasterDataForDisplay: function (data) {
            const globalData = {};
            const source = data._GlobMasterData?._IN_AssetBlockData || data;

            if (source.IN_AssetBlock) globalData.AssetBlock = source.IN_AssetBlock;
            if (source.IN_AssetPutToUseDate) globalData.PutToUseDate = source.IN_AssetPutToUseDate;
            if (source.IN_AssetIsPriorYear !== undefined) {
                globalData.IsPriorYear = source.IN_AssetIsPriorYear === "true" || source.IN_AssetIsPriorYear === true;
            }

            return globalData;
        },

        _processLedgerDetailsForDisplay: function (data) {
            const ledgerSource = data._Ledger || data.LedgerDetails?.Ledgers || [];

            return {
                Ledgers: ledgerSource.map((ledger, index) => ({
                    Index: index + 1,
                    Code: ledger.Ledger || 'Unknown',
                    CapitalizationDate: this._formatDateForDisplay(ledger.AssetCapitalizationDate),
                    Valuations: this._processValuations(ledger._Valuation || []),
                    TimeBasedValuations: this._flattenTimeBasedValuations(ledger._Valuation || [])
                }))
            };
        },

        _processValuations: function (valuations) {
            return valuations.map(valuation => ({
                DepreciationArea: valuation.AssetDepreciationArea,
                NegativeAmountAllowed: valuation.NegativeAmountIsAllowed || false,
                DepreciationStartDate: this._formatDateForDisplay(valuation.DepreciationStartDate),
                TimeBasedValuations: (valuation._TimeBasedValuation || []).map(tbv => ({
                    DepreciationArea: valuation.AssetDepreciationArea,
                    DepreciationKey: tbv.DepreciationKey || '',
                    PlannedUsefulLifeYears: tbv.PlannedUsefulLifeInYears || '',
                    PlannedUsefulLifePeriods: tbv.PlannedUsefulLifeInPeriods || '0',
                    ScrapAmount: {
                        Value: String(tbv.ScrapAmountInCoCodeCrcy || ""),
                        Currency: tbv.CompanyCodeCurrency || this.config.defaultCurrency
                    },
                    ScrapPercent: String(tbv.AcqnProdnCostScrapPercent) || "",
                    ValidityStartDate: this._formatDateForDisplay(tbv.ValidityStartDate)
                }))
            }));
        },

        _flattenTimeBasedValuations: function (valuations) {
            return valuations.flatMap(valuation =>
                (valuation._TimeBasedValuation || []).map(tbv => ({
                    DepreciationArea: valuation.AssetDepreciationArea,
                    DepreciationKey: tbv.DepreciationKey || '',
                    PlannedUsefulLifeYears: tbv.PlannedUsefulLifeInYears || '',
                    PlannedUsefulLifePeriods: tbv.PlannedUsefulLifeInPeriods || '0',
                    ScrapAmount: {
                        Value: String(tbv.ScrapAmountInCoCodeCrcy || ""),
                        Currency: tbv.CompanyCodeCurrency || this.config.defaultCurrency
                    },
                    ScrapPercent: String(tbv.AcqnProdnCostScrapPercent) || "",
                    ValidityStartDate: this._formatDateForDisplay(tbv.ValidityStartDate)
                }))
            );
        },

        // =================
        // VALIDATION
        // =================

        validateAssetData: function (asset) {
            const errors = [];
            const requiredFields = [
                { field: 'CompanyCode', message: 'Company Code is required' },
                { field: 'AssetClass', message: 'Asset Class is required' },
                { field: 'FixedAssetDescription', message: 'Asset Description is required' }
            ];

            requiredFields.forEach(({ field, message }) => {
                if (!this._getValue(asset, field)) {
                    errors.push({
                        field, message, severity: 'Error',
                        sequenceId: asset.SequenceNumber || 'N/A'
                    });
                }
            });

            return errors;
        },

        _validateRequiredFields: function (payload) {
            if (!payload.CompanyCode || !payload.AssetClass) {
                throw new Error("Missing required fields: CompanyCode, AssetClass");
            }
            if (!payload._General?.FixedAssetDescription) {
                throw new Error("FixedAssetDescription is required");
            }
        },

        // =================
        // UTILITY METHODS
        // =================

        _getValue: function (obj, key, defaultValue = '') {
            if (!obj || typeof obj !== 'object') return defaultValue;
            return obj[key] !== null && obj[key] !== undefined ? obj[key] : defaultValue;
        },

        _parseBoolean: function (value) {
            if (typeof value === 'boolean') return value;
            if (typeof value === 'string') {
                const lower = value.toLowerCase();
                return ['true', 'yes', '1', 'x'].includes(lower);
            }
            return Boolean(value);
        },

        _parseNumeric: function (value, defaultValue = 0) {
            if (typeof value === 'number') return value;
            if (typeof value === 'string') {
                const parsed = parseFloat(value);
                return isNaN(parsed) ? defaultValue : parsed;
            }
            return defaultValue;
        },

        _formatDateForDisplay: function (dateValue) {
            if (!dateValue) return null;

            try {
                const date = dateValue instanceof Date ? dateValue : new Date(dateValue);
                return !isNaN(date.getTime()) ? date : null;
            } catch (error) {
                return null;
            }
        },

        _cleanEmptyObjects: function (obj) {
            Object.keys(obj).forEach(key => {
                const value = obj[key];

                if (value === null || value === undefined || value === '') {
                    delete obj[key];
                } else if (typeof value === 'object' && !Array.isArray(value)) {
                    this._cleanEmptyObjects(value);
                    if (Object.keys(value).length === 0) {
                        delete obj[key];
                    }
                } else if (Array.isArray(value) && value.length === 0) {
                    delete obj[key];
                }
            });
        },

        // =================
        // DISPLAY FORMATTERS
        // =================

        formatCurrency: function (amount, currency = 'INR') {
            const numericAmount = this._parseNumeric(amount, 0);
            return new Intl.NumberFormat('en-IN', {
                style: 'currency',
                currency: currency,
                minimumFractionDigits: 2
            }).format(numericAmount);
        },

        formatPercentage: function (value) {
            const numericValue = this._parseNumeric(value, 0);
            return new Intl.NumberFormat('en-IN', {
                style: 'percent',
                minimumFractionDigits: 2,
                maximumFractionDigits: 2
            }).format(numericValue / 100);
        }
    });
});