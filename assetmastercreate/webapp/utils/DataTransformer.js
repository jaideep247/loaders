sap.ui.define([], function () {
    "use strict";

    /**
     * DataTransformer - Updated for dynamic ledger-based column mapping
     */
    return class DataTransformer {

        constructor() {
            // Define the mapping of depreciation areas to ledgers
            this.AREA_TO_LEDGER_MAP = {
                '01': '0L',
                '15': '0L',
                '32': '2L',
                '34': '3L'
            };

            // Column mappings for basic fields (non-ledger specific)
            this._basicColumnMappings = {
                // Main fields
                "seq_id": "SequenceNumber",
                "seq id": "SequenceNumber",
                "sequence id": "SequenceNumber",
                "companycode": "CompanyCode",
                "company code": "CompanyCode",
                "assetclass": "AssetClass",
                "asset class": "AssetClass",
                "assetisforpostcapitalization": "AssetIsForPostCapitalization",
                "asset is for post capitalization": "AssetIsForPostCapitalization",
                "fixedassetdescription": "FixedAssetDescription",
                "fixed asset description": "FixedAssetDescription",
                "assetadditionaldescription": "AssetAdditionalDescription",
                "asset additional description": "AssetAdditionalDescription",
                "assetserialnumber": "AssetSerialNumber",
                "asset serial number": "AssetSerialNumber",
                "baseunit": "BaseUnit",
                "base unit": "BaseUnit",
                "inventorynote": "InventoryNote",
                "inventory note": "InventoryNote",
                "wbselementexternalid": "WBSElementExternalID",
                "wbs element external id": "WBSElementExternalID",
                "room": "Room",
                "in_assetblock": "IN_AssetBlock",
                "in_asset block": "IN_AssetBlock",
                "in_assetputtousedate": "IN_AssetPutToUseDate",
                "in_asset put to use date": "IN_AssetPutToUseDate",
                "in_assetisprioryear": "IN_AssetIsPriorYear",
                "in_asset is prior year": "IN_AssetIsPriorYear",
                "yy1_wbs_element": "YY1_WBS_ELEMENT",
                "yy1 wbs element": "YY1_WBS_ELEMENT"
            };

            this._defaultConfig = {
                defaultCurrency: "INR",
                defaultDate: () => new Date().toISOString().split('T')[0],
                defaultBoolean: false,
                defaultNumeric: "0"
            };
        }

        /**
         * Transform flat Excel structure to nested OData structure
         * Now handles the new column naming convention with area codes
         */
        transformFlatToStructured(data) {
            const result = {};
            const ledgerData = {};
            const areaData = {};

            // First pass: separate basic fields from ledger/area specific fields
            Object.entries(data).forEach(([key, value]) => {
                const lowerKey = key.toLowerCase().replace(/\s+/g, '');

                // Check if it's a basic field
                if (this._basicColumnMappings[lowerKey]) {
                    result[this._basicColumnMappings[lowerKey]] = value;
                }
                // Check for capitalization date pattern (CapDate_XL)
                else if (/capdate_(\w+)/i.test(key)) {
                    const match = key.match(/capdate_(\w+)/i);
                    if (match) {
                        const ledger = match[1].toUpperCase();
                        if (!ledgerData[ledger]) ledgerData[ledger] = {};
                        ledgerData[ledger].capitalizationDate = value;
                    }
                }
                // Check for area-specific fields (e.g., DeprKey_01, ValidityDate_32)
                else if (/_(\d{2})$/i.test(key)) {
                    const match = key.match(/^(.+?)_(\d{2})$/i);
                    if (match) {
                        const fieldType = match[1];
                        const area = match[2];
                        if (!areaData[area]) areaData[area] = {};
                        areaData[area][fieldType] = value;
                    }
                }
                // Default: keep the original field
                else {
                    result[key] = value;
                }
            });

            // Build Ledger structure
            result._Ledger = this._buildLedgerStructure(ledgerData, areaData);

            // Add India-specific fields if present
            if (result.IN_AssetBlock) {
                result._GlobMasterData = {
                    _IN_AssetBlockData: {
                        IN_AssetBlock: result.IN_AssetBlock,
                        IN_AssetPutToUseDate: result.IN_AssetPutToUseDate || null,
                        IN_AssetIsPriorYear: result.IN_AssetIsPriorYear || ''
                    }
                };
            }

            // Add custom fields if present
            if (result.YY1_WBS_ELEMENT) {
                result._CustomFields = {
                    YY1_WBS_ELEMENT: result.YY1_WBS_ELEMENT
                };
            }

            return result;
        }

        /**
         * Build the ledger structure based on the area-to-ledger mapping
         */
        _buildLedgerStructure(ledgerData, areaData) {
            const ledgers = {};

            // Process each depreciation area
            Object.entries(areaData).forEach(([area, data]) => {
                const ledgerCode = this.AREA_TO_LEDGER_MAP[area];

                if (!ledgerCode) {
                    console.warn(`Unknown depreciation area: ${area}`);
                    return;
                }

                // Initialize ledger if not exists
                if (!ledgers[ledgerCode]) {
                    ledgers[ledgerCode] = {
                        Ledger: ledgerCode,
                        AssetCapitalizationDate: ledgerData[ledgerCode]?.capitalizationDate || null,
                        _Valuation: []
                    };
                }

                // Add valuation for this area
                const valuation = {
                    AssetDepreciationArea: area,
                    _TimeBasedValuation: [{
                        ValidityStartDate: data.ValidityDate || data.validitydate || null,
                        DepreciationKey: data.DeprKey || data.deprkey || '',
                        PlannedUsefulLifeInYears: data.UsefulLife || data.usefullife || '',
                        PlannedUsefulLifeInPeriods: '0',
                        AcqnProdnCostScrapPercent: parseFloat(data.ScrapPercent || data.scrappercent || '5'),
                        ScrapAmountInCoCodeCrcy: 0,
                        CompanyCodeCurrency: this._defaultConfig.defaultCurrency
                    }]
                };

                ledgers[ledgerCode]._Valuation.push(valuation);
            });

            // Return array of ledgers
            return Object.values(ledgers);
        }

        /**
         * Map Excel columns to standardized names
         * Updated to handle the new column naming pattern
         */
        mapAssetMasterColumns(row) {
            const mappedRow = {};

            Object.entries(row).forEach(([key, value]) => {
                const lowerKey = key.toLowerCase().replace(/\s+/g, '');

                // Check basic mappings first
                if (this._basicColumnMappings[lowerKey]) {
                    mappedRow[this._basicColumnMappings[lowerKey]] = value;
                } else {
                    // Keep original key for pattern-based fields (will be processed in transformFlatToStructured)
                    mappedRow[key] = value;
                }
            });

            return mappedRow;
        }

        /**
         * Parse date value - unchanged from original
         */
        parseDate(value) {
            if (value === null || value === undefined || value === '') {
                return this._defaultConfig.defaultDate();
            }

            if (value instanceof Date) {
                if (!isNaN(value.getTime())) {
                    return value.toISOString().split('T')[0];
                } else {
                    return this._defaultConfig.defaultDate();
                }
            }

            if (typeof value === 'string') {
                const cleanValue = value.trim().replace(/[^\d\-\/\.]/g, '');
                let dateObj;

                if (/^\d{4}-\d{2}-\d{2}$/.test(cleanValue)) {
                    const parts = cleanValue.split('-');
                    dateObj = new Date(Date.UTC(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10)));
                } else if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(cleanValue)) {
                    const parts = cleanValue.split('/');
                    dateObj = new Date(Date.UTC(parseInt(parts[2], 10), parseInt(parts[0], 10) - 1, parseInt(parts[1], 10)));
                } else if (/^\d{1,2}\.\d{1,2}\.\d{4}$/.test(cleanValue)) {
                    const parts = cleanValue.split('.');
                    dateObj = new Date(Date.UTC(parseInt(parts[2], 10), parseInt(parts[1], 10) - 1, parseInt(parts[0], 10)));
                } else if (/^\d{8}$/.test(cleanValue)) {
                    const year = cleanValue.substring(0, 4);
                    const month = cleanValue.substring(4, 6);
                    const day = cleanValue.substring(6, 8);
                    dateObj = new Date(Date.UTC(parseInt(year, 10), parseInt(month, 10) - 1, parseInt(day, 10)));
                }

                if (dateObj instanceof Date && !isNaN(dateObj.getTime())) {
                    const year = dateObj.getUTCFullYear();
                    const month = (dateObj.getUTCMonth() + 1).toString().padStart(2, '0');
                    const day = dateObj.getUTCDate().toString().padStart(2, '0');
                    return `${year}-${month}-${day}`;
                }
            }

            return this._defaultConfig.defaultDate();
        }

        /**
         * Prepare entry for SOAP - updated to work with new structure
         */
        prepareEntryForSOAP(entry) {
            const sourceEntry = entry || {};

            const soapEntry = {
                SequenceNumber: sourceEntry.SequenceNumber || '1',
                CompanyCode: sourceEntry.CompanyCode,
                AssetClass: sourceEntry.AssetClass,
                AssetIsForPostCapitalization: sourceEntry.AssetIsForPostCapitalization === 'TRUE' || sourceEntry.AssetIsForPostCapitalization === true,

                General: {
                    FixedAssetDescription: sourceEntry.FixedAssetDescription || '',
                    AssetAdditionalDescription: sourceEntry.AssetAdditionalDescription || '',
                    AssetSerialNumber: sourceEntry.AssetSerialNumber || '',
                    BaseUnit: sourceEntry.BaseUnit || 'EA'
                },

                AccountAssignment: {
                    WBSElementExternalID: sourceEntry.WBSElementExternalID || null,
                    Room: sourceEntry.Room || ''
                },

                Inventory: {
                    InventoryNote: sourceEntry.InventoryNote || ''
                },

                // Use the _Ledger structure if available
                LedgerInformation: sourceEntry._Ledger || [],

                // Handle custom fields
                YY1_WBS_ELEMENT: sourceEntry.YY1_WBS_ELEMENT || null
            };

            // Add India-specific fields if present
            if (sourceEntry._GlobMasterData) {
                soapEntry.GLO_MasterData = sourceEntry._GlobMasterData;
            }

            return soapEntry;
        }

        /**
         * Prepare entry details for display
         */
        prepareEntryDetails(entry) {
            const sourceEntry = entry ? JSON.parse(JSON.stringify(entry)) : {};

            const preparedDetails = {
                BasicInfo: {
                    SequenceNumber: sourceEntry.SequenceNumber || 'N/A',
                    CompanyCode: sourceEntry.CompanyCode || '',
                    AssetClass: sourceEntry.AssetClass || '',
                    IsPostCapitalization: sourceEntry.AssetIsForPostCapitalization === 'TRUE' || sourceEntry.AssetIsForPostCapitalization === true
                },
                GeneralDetails: {
                    FixedAssetDescription: sourceEntry.FixedAssetDescription || '',
                    AdditionalDescription: sourceEntry.AssetAdditionalDescription || '',
                    SerialNumber: sourceEntry.AssetSerialNumber || '',
                    BaseUnit: sourceEntry.BaseUnit || '',
                    InventoryNote: sourceEntry.InventoryNote || ''
                },
                AccountAssignment: {
                    WBSElementExternalID: sourceEntry.WBSElementExternalID || '',
                    Room: sourceEntry.Room || '',
                    CustomWBSElement: sourceEntry.YY1_WBS_ELEMENT || ''
                },
                LedgerDetails: {
                    Ledgers: (sourceEntry._Ledger || []).map((ledger, index) => ({
                        Index: index + 1,
                        Code: ledger.Ledger,
                        CapitalizationDate: this.parseDate(ledger.AssetCapitalizationDate),
                        Valuations: ledger._Valuation || []
                    }))
                },
                GlobalMasterData: sourceEntry._GlobMasterData?._IN_AssetBlockData || {},
                ValidationSummary: {
                    TotalErrors: (sourceEntry.ValidationErrors || []).length,
                    Errors: sourceEntry.ValidationErrors || []
                }
            };

            return preparedDetails;
        }

        _getValueOrDefault(source, key, defaultValue) {
            if (source && typeof source === 'object' && source.hasOwnProperty(key)) {
                const value = source[key];
                if (value !== null && value !== undefined) {
                    return value;
                }
            }
            return defaultValue;
        }
    };
});