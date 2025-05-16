sap.ui.define([], function () {
  "use strict";

  /**
   * DataTransformer
   * Utility for transforming data between different formats.
   * Handles column mapping, flat-to-structured transformation, date parsing,
   * and preparation of data for SOAP calls or detailed display.
   *
   * Note: Property initializations (_columnMappings, _defaultConfig) are done
   * inside the constructor for broader JavaScript environment compatibility,
   * addressing potential issues with class field syntax support.
   */
  return class DataTransformer {

      constructor() {
          // Initialize instance properties within the constructor for compatibility
          this._columnMappings = {
              // Main fields
              "sequence number": "SequenceNumber",
              "sequence": "SequenceNumber",
              "seq number": "SequenceNumber",
              "seq": "SequenceNumber",
              "sequence id": "SequenceNumber",
              "sequenceid": "SequenceNumber",
              "seq id": "SequenceNumber",
              "seqid": "SequenceNumber",
              "sequence no": "SequenceNumber",
              "sequenceno": "SequenceNumber",
              "seq no": "SequenceNumber",
              "seqno": "SequenceNumber",

              "company code": "CompanyCode",
              "companycode": "CompanyCode",
              "co code": "CompanyCode",
              "cocode": "CompanyCode",
              "bukrs": "CompanyCode",

              "asset class": "AssetClass",
              "assetclass": "AssetClass",
              "anla": "AssetClass", // Common SAP field name
              "asset cls": "AssetClass",
              "assetcls": "AssetClass",

              "asset is for post capitalization": "AssetIsForPostCapitalization",
              "assetisforpostcapitalization": "AssetIsForPostCapitalization",
              "post capitalization": "AssetIsForPostCapitalization",
              "postcapitalization": "AssetIsForPostCapitalization",

              // General section
              "fixed asset description": "FixedAssetDescription",
              "fixedassetdescription": "FixedAssetDescription",
              "asset description": "FixedAssetDescription",
              "assetdescription": "FixedAssetDescription",
              "description": "FixedAssetDescription",
              "txt50": "FixedAssetDescription", // Common SAP field name

              "asset additional description": "AssetAdditionalDescription",
              "assetadditionaldescription": "AssetAdditionalDescription",
              "additional description": "AssetAdditionalDescription",
              "additionaldescription": "AssetAdditionalDescription",
              "desc2": "AssetAdditionalDescription",

              "asset serial number": "AssetSerialNumber",
              "assetserialnumber": "AssetSerialNumber",
              "serial number": "AssetSerialNumber",
              "serialnumber": "AssetSerialNumber",
              "serial no": "AssetSerialNumber",
              "serialno": "AssetSerialNumber",
              "sernr": "AssetSerialNumber", // Common SAP field name

              "base unit": "BaseUnit",
              "baseunit": "BaseUnit",
              "unit": "BaseUnit",
              "meins": "BaseUnit", // Common SAP field name

              // Account Assignment section
              "cost center": "CostCenter",
              "costcenter": "CostCenter",
              "cost ctr": "CostCenter",
              "costctr": "CostCenter",
              "kostl": "CostCenter", // Common SAP field name

              "wbs element external id": "WBSElementExternalID",
              "wbselementexternalid": "WBSElementExternalID",
              "wbs element": "WBSElementExternalID",
              "wbselement": "WBSElementExternalID",
              "wbs": "WBSElementExternalID",
              "ps_psp_pnr": "WBSElementExternalID", // Common SAP field name

              "profit center": "ProfitCenter",
              "profitcenter": "ProfitCenter",
              "profit ctr": "ProfitCenter",
              "profitctr": "ProfitCenter",
              "prctr": "ProfitCenter", // Common SAP field name

              "plant": "Plant",
              "werks": "Plant", // Common SAP field name

              "asset location": "AssetLocation",
              "assetlocation": "AssetLocation",
              "location": "AssetLocation",
              "stort": "AssetLocation", // Common SAP field name

              "room": "Room",
              "raumn": "Room", // Common SAP field name

              // Custom fields (Example)
              "yy1_wbs_element": "YY1_WBS_ELEMENT", // Naming convention for custom fields
              "wbs_element": "YY1_WBS_ELEMENT", // Potential alternative input
              "custom wbs": "YY1_WBS_ELEMENT",
              "customwbs": "YY1_WBS_ELEMENT",

              // India-specific fields (Example)
              "in_asset block": "IN_AssetBlock",
              "in_assetblock": "IN_AssetBlock",
              "asset block": "IN_AssetBlock",
              "assetblock": "IN_AssetBlock",

              "in_asset put to use date": "IN_AssetPutToUseDate",
              "in_assetputtousedate": "IN_AssetPutToUseDate",
              "put to use date": "IN_AssetPutToUseDate",
              "puttousedate": "IN_AssetPutToUseDate",

              "in_asset is prior year": "IN_AssetIsPriorYear",
              "in_assetisprior year": "IN_AssetIsPriorYear",
              "is prior year": "IN_AssetIsPriorYear",
              "isprioryear": "IN_AssetIsPriorYear"
          };

          this._defaultConfig = {
              defaultCurrency: "INR", // Example default currency
              defaultDate: () => new Date().toISOString().split('T')[0], // Function to get current date in YYYY-MM-DD
              defaultBoolean: false,
              defaultNumeric: "0",
              nestedStructureDefaults: {
                  // Arrow functions capture the correct 'this' from the constructor context
                  LedgerInformation: (index = 0) => ({
                      Ledger: `0L`,
                      AssetCapitalizationDate: this._defaultConfig.defaultDate()
                  }),
                  Valuation: (index = 1) => ({
                      AssetDepreciationArea: `${index < 10 ? '0' : ''}${index}`,
                      NegativeAmountIsAllowed: false,
                      DepreciationStartDate: this._defaultConfig.defaultDate()
                  }),
                  TimeBasedValuation: (index = 1) => ({
                      AssetDepreciationArea: `${index < 10 ? '0' : ''}${index}`,
                      DepreciationKey: `L100`,
                      PlannedUsefulLifeInYears: "10",
                      PlannedUsefulLifeInPeriods: "120",
                      ScrapAmountInCoCodeCrcy: "0",
                      currencyCode: this._defaultConfig.defaultCurrency,
                      AcqnProdnCostScrapPercent: "0"
                  })
              }
          };
           // End of constructor initializations
      }

      /**
       * Transform flat structure potentially with suffixes (e.g., field_1, field_2) into nested arrays.
       * This helps handle repeating fields from sources like spreadsheets.
       * Example: { Ledger_1: "0L", Ledger_2: "1L" } becomes { Ledger: ["0L", "1L"] }
       * @param {Object} data - Flat data object.
       * @returns {Object} Data object with fields grouped into arrays based on suffixes.
       */
      transformFlatToStructured(data) {
         const result = {};
         const fieldGroups = {}; // Stores fields grouped by their base name (e.g., "Ledger")

         // Step 1: Group fields by base name and suffix
         Object.keys(data).forEach(key => {
              // Regex to match "baseFieldName" or "baseFieldName_index" (index > 0)
              const match = key.match(/^(.+?)(?:_(\d+))?$/);
              if (!match) { // If key doesn't match the pattern, skip it for now
                  return;
              }

              const baseField = match[1]; // The part before the underscore (e.g., "Ledger")
              const suffix = match[2] ? `_${match[2]}` : ''; // The underscore and number (e.g., "_1") or empty string
              const index = match[2] ? parseInt(match[2], 10) : 0; // The numeric index or 0 if no suffix

              if (!fieldGroups[baseField]) {
                  fieldGroups[baseField] = [];
              }

              fieldGroups[baseField].push({
                  index: index, // Store numeric index for sorting
                  suffix: suffix,
                  originalKey: key,
                  value: data[key]
              });
         });

         // Step 2: Sort grouped fields by index and create structured arrays or single values
         Object.keys(fieldGroups).forEach(baseField => {
              const items = fieldGroups[baseField];

              // Sort items based on the numeric index derived from the suffix
              items.sort((a, b) => a.index - b.index);

              // If only one item exists and it has no suffix (index 0), treat it as a single value
              if (items.length === 1 && items[0].index === 0) {
                  result[baseField] = items[0].value;
              } else {
                  // Otherwise, create an array of values, ordered by suffix index
                  // Ensure array has correct length based on max index, filling gaps with undefined/null
                  const maxIndex = items[items.length - 1].index;
                  // Assume indices start from 1 for suffixes like _1, _2...
                  const arrayLength = maxIndex > 0 ? maxIndex : items.length; // Array size based on highest index (1-based)
                  const structuredArray = new Array(arrayLength).fill(undefined);

                  items.forEach(item => {
                       // Map suffix index (1, 2, 3...) to array index (0, 1, 2...)
                       const arrayIndex = item.index > 0 ? item.index - 1 : 0; // Map suffix 1 to array index 0
                       if (arrayIndex < structuredArray.length) {
                          structuredArray[arrayIndex] = item.value;
                       } else if (item.index === 0 && structuredArray.length === 0){
                           // Handle case where only base field exists (e.g. "Ledger") but we decided to make an array
                           // This case should ideally be handled by the 'if' condition above,
                           // but as a fallback, place it at index 0 if array is empty.
                           structuredArray[0] = item.value;
                       }
                  });
                  result[baseField] = structuredArray;
              }
         });


         // Step 3: Create specific nested structures (LedgerInformation, Valuation, etc.)
         // This assumes the corresponding base fields were converted into arrays above.
         if (result.Ledger && Array.isArray(result.Ledger)) {
              result.LedgerInformation = result.Ledger.map((ledger, index) => ({
                  Ledger: ledger,
                  // Use corresponding AssetCapitalizationDate if available at the same index
                  AssetCapitalizationDate: result.AssetCapitalizationDate?.[index]
              }));
              // Optional: Remove the original flat arrays after creating the structure
              // delete result.Ledger;
              // delete result.AssetCapitalizationDate;
         }

         if (result.AssetDepreciationArea && Array.isArray(result.AssetDepreciationArea)) {
              // Create Valuation structure
              result.Valuation = result.AssetDepreciationArea.map((area, index) => ({
                  AssetDepreciationArea: area,
                  NegativeAmountIsAllowed: result.NegativeAmountIsAllowed?.[index],
                  DepreciationStartDate: result.DepreciationStartDate?.[index]
              }));

              // Create TimeBasedValuation structure
              result.TimeBasedValuation = result.AssetDepreciationArea.map((area, index) => ({
                   AssetDepreciationArea: area, // Re-use area from the main list
                   // Check if corresponding time-based fields exist at the same index
                   DepreciationKey: result.DepreciationKey?.[index],
                   PlannedUsefulLifeInYears: result.PlannedUsefulLifeInYears?.[index],
                   PlannedUsefulLifeInPeriods: result.PlannedUsefulLifeInPeriods?.[index],
                   ScrapAmountInCoCodeCrcy: result.ScrapAmountInCoCodeCrcy?.[index],
                   currencyCode: result.currencyCode?.[index], // Note: Often currency is global or per area
                   AcqnProdnCostScrapPercent: result.AcqnProdnCostScrapPercent?.[index]
               }))
               // Filter out entries that don't seem complete (e.g., missing DepreciationKey)
               .filter(tbv => tbv.DepreciationKey !== undefined && tbv.DepreciationKey !== null && tbv.DepreciationKey !== '');

               // Optional: Clean up original flat arrays used to build these structures
               // delete result.AssetDepreciationArea;
               // delete result.NegativeAmountIsAllowed;
               // ... and other related flat arrays (DepreciationStartDate, DepreciationKey, etc.)
         }

         // Step 4: Copy remaining fields that were not part of a suffix group
         // These are fields that had no suffix or were unique.
         Object.keys(data).forEach(key => {
               const match = key.match(/^(.+?)(?:_(\d+))?$/);
               const baseField = match ? match[1] : key;
               // If the key wasn't grouped into an array OR it's a base field that was handled as a single value
               if (!fieldGroups[baseField] || (result.hasOwnProperty(baseField) && !Array.isArray(result[baseField]))) {
                   // And if it hasn't already been added to result (by direct mapping or as a single value)
                   if (!result.hasOwnProperty(key) && !result.hasOwnProperty(this._columnMappings[key.toLowerCase()])) {
                       result[key] = data[key]; // Copy fields that were not grouped or processed
                   }
               }
           });

         return result;
      }


      /**
       * Parse a date value from various potential string formats or a Date object.
       * @param {String|Date|null|undefined} value - Date value to parse.
       * @returns {String} ISO date string (YYYY-MM-DD) or the default date if parsing fails or value is null/undefined.
       */
      parseDate(value) {
          // If no value provided (null, undefined, empty string), return default date (today's date)
          if (value === null || value === undefined || value === '') {
              return this._defaultConfig.defaultDate();
          }

          // If it's already a Date object, format it
          if (value instanceof Date) {
              // Check for invalid Date objects (e.g., new Date("invalid string"))
              if (!isNaN(value.getTime())) {
                 return value.toISOString().split('T')[0];
              } else {
                 // console.warn("Invalid Date object received, returning default.");
                 return this._defaultConfig.defaultDate(); // Invalid date object
              }
          }

          // If it's a string, try to parse it
          if (typeof value === 'string') {
              // Remove potential extra characters, keep digits, hyphens, slashes, dots
              const cleanValue = value.trim().replace(/[^\d\-\/\.]/g, '');
              let dateObj;

              // Try common formats explicitly using UTC to avoid timezone issues during parsing
              if (/^\d{4}-\d{2}-\d{2}$/.test(cleanValue)) {         // YYYY-MM-DD (ISO)
                  // Directly parse ISO format, ensuring it's treated as UTC midnight
                   const parts = cleanValue.split('-');
                   dateObj = new Date(Date.UTC(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10)));
              } else if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(cleanValue)) { // MM/DD/YYYY
                  const parts = cleanValue.split('/');
                  dateObj = new Date(Date.UTC(parseInt(parts[2], 10), parseInt(parts[0], 10) - 1, parseInt(parts[1], 10)));
              } else if (/^\d{1,2}\.\d{1,2}\.\d{4}$/.test(cleanValue)) { // DD.MM.YYYY
                  const parts = cleanValue.split('.');
                  dateObj = new Date(Date.UTC(parseInt(parts[2], 10), parseInt(parts[1], 10) - 1, parseInt(parts[0], 10)));
              } else if (/^\d{8}$/.test(cleanValue)) {              // YYYYMMDD
                  const year = cleanValue.substring(0, 4);
                  const month = cleanValue.substring(4, 6);
                  const day = cleanValue.substring(6, 8);
                  dateObj = new Date(Date.UTC(parseInt(year, 10), parseInt(month, 10) - 1, parseInt(day, 10)));
              } else {
                  // Fallback: Try native Date parsing (can be inconsistent across browsers/environments)
                  const tempDate = new Date(value);
                  // Check if native parsing resulted in a valid date
                  if (tempDate instanceof Date && !isNaN(tempDate.getTime())) {
                       // Convert to UTC base to standardize before formatting
                       dateObj = new Date(Date.UTC(tempDate.getFullYear(), tempDate.getMonth(), tempDate.getDate()));
                  }
              }

              // Check if a valid date was created by any method
              if (dateObj instanceof Date && !isNaN(dateObj.getTime())) {
                  // Format the valid UTC date object to YYYY-MM-DD string
                  const year = dateObj.getUTCFullYear();
                  const month = (dateObj.getUTCMonth() + 1).toString().padStart(2, '0');
                  const day = dateObj.getUTCDate().toString().padStart(2, '0');
                  return `${year}-${month}-${day}`;
              }
          }

          // Handle numeric input (e.g., Excel date serial numbers) if necessary
          if (typeof value === 'number') {
              // Basic check for potential Excel date number (integer part)
              if (Number.isInteger(value) && value > 0) {
                 // console.warn("Numeric date parsing (Excel?) not implemented. Returning default.");
                 // Excel date calculation (days since 1900-01-01, with leap year bug)
                 // Requires careful implementation or a library.
                 // Example placeholder logic (might be inaccurate):
                 // const excelEpoch = new Date(Date.UTC(1899, 11, 30)); // Excel epoch start (day 0)
                 // const dateMillis = excelEpoch.getTime() + value * 86400000; // Add days in milliseconds
                 // const dateObj = new Date(dateMillis);
                 // if (!isNaN(dateObj.getTime())) { return dateObj.toISOString().split('T')[0]; }
              }
          }

          // Return default date if all parsing failed or input type was unhandled
          // console.warn(`Failed to parse date: '${value}', returning default.`);
          return this._defaultConfig.defaultDate();
      }

      /**
       * Map input column names (e.g., from Excel) to standardized internal property names.
       * Uses the `_columnMappings` dictionary. Handles keys case-insensitively.
       * @param {Object} row - Row data object with original column names.
       * @returns {Object} Row data object with standardized property names.
       */
      mapAssetMasterColumns(row) {
          const mappedRow = {};

          Object.entries(row).forEach(([key, value]) => {
              // Trim whitespace and convert key to lowercase for reliable mapping
              const lowerKey = typeof key === 'string' ? key.trim().toLowerCase() : '';

              // Find the standardized key from mappings, or use the original key if no mapping exists
              const mappedKey = this._columnMappings[lowerKey] || key;

              // Assign the value to the mapped key, avoid setting undefined values explicitly
               if (value !== undefined) {
                   // Handle potential overwrite if multiple source keys map to the same target key
                   if (mappedRow.hasOwnProperty(mappedKey)) {
                       // Decide on overwrite strategy: last one wins, first one wins, warn, error?
                       // Current: Last one wins implicitly. Add warning if needed.
                       // console.warn(`Mapping conflict for key: '${key}' -> '${mappedKey}'. Overwriting previous value.`);
                   }
                   mappedRow[mappedKey] = value;
               }
          });

          return mappedRow;
      }


      /**
       * Prepare a single asset entry for submission to a SOAP service.
       * Applies defaults for missing fields and structures the data according to a typical SOAP request format.
       * @param {Object} entry - Original entry data (ideally after mapping and structuring).
       * @returns {Object} SOAP-ready asset object.
       */
      prepareEntryForSOAP(entry) {
          // Ensure entry is a valid object
          const sourceEntry = entry || {};

          // Use helper to get values or defaults
          const getValue = (key, defaultValue) => this._getValueOrDefault(sourceEntry, key, defaultValue);

          // Prepare nested structures - use existing data or generate defaults
          const prepareNested = (structureName, defaultGenerator) => {
              const existingData = sourceEntry[structureName];
              // Check if existing data is a non-empty array
              if (existingData && Array.isArray(existingData) && existingData.length > 0) {
                  // Return a deep copy or validate/clean existing data if necessary
                  // For simplicity, returning existing data directly. Be mindful of mutation if sourceEntry is reused.
                  return existingData;
              }
              // Generate default structure using the config (e.g., one default entry)
              // The arrow function in defaultGenerator captures 'this' correctly.
              return [defaultGenerator(structureName === 'LedgerInformation' ? 0 : 1)]; // Pass index
          };

          const soapEntry = {
              // Core Identification Fields (Mandatory or with defaults)
              SequenceNumber: getValue('SequenceNumber', '1'), // Default sequence
              CompanyCode: getValue('CompanyCode', null), // Expect this to be provided, no safe default
              AssetClass: getValue('AssetClass', null),   // Expect this to be provided
              AssetIsForPostCapitalization: !!getValue('AssetIsForPostCapitalization', false), // Ensure boolean

              // General Information (nested structure)
              General: {
                  FixedAssetDescription: getValue('FixedAssetDescription', 'Default Asset Description'),
                  AssetAdditionalDescription: getValue('AssetAdditionalDescription', ''), // Default to empty string
                  AssetSerialNumber: getValue('AssetSerialNumber', null), // Null if not provided
                  BaseUnit: getValue('BaseUnit', null) // Often mandatory in SAP, null if not provided
                  // Add other general fields as needed by the specific SOAP service
              },

              // Account Assignment (nested structure)
              AccountAssignment: {
                  // Provide defaults (null or empty string) based on SOAP service requirements
                  CostCenter: getValue('CostCenter', null),
                  WBSElementExternalID: getValue('WBSElementExternalID', null),
                  Plant: getValue('Plant', null),
                  AssetLocation: getValue('AssetLocation', null),
                  ProfitCenter: getValue('ProfitCenter', null),
                  Room: getValue('Room', null)
                  // Add other account assignment fields
              },

               // Custom Fields (Example - direct property if expected at top level)
               YY1_WBS_ELEMENT: getValue('YY1_WBS_ELEMENT', null), // Custom WBS field

              // Nested Array Structures (using prepareNested helper)
              LedgerInformation: prepareNested('LedgerInformation', this._defaultConfig.nestedStructureDefaults.LedgerInformation),
              Valuation: prepareNested('Valuation', this._defaultConfig.nestedStructureDefaults.Valuation),
              TimeBasedValuation: prepareNested('TimeBasedValuation', this._defaultConfig.nestedStructureDefaults.TimeBasedValuation),

              // Global Master Data (Example: India-specific, nested)
              // Check the exact structure names required by your SOAP service (e.g., GLO_MasterData, CountrySpecificData)
              GLO_MasterData: {
                  IN_AssetBlockData: { // Check exact SOAP structure name
                      IN_AssetBlock: getValue('IN_AssetBlock', null),
                      // Use parseDate to ensure correct format and handle defaults/errors
                      IN_AssetPutToUseDate: this.parseDate(getValue('IN_AssetPutToUseDate', null)),
                      IN_AssetIsPriorYear: !!getValue('IN_AssetIsPriorYear', false) // Ensure boolean
                  }
                  // Add other GLO structures if needed (e.g., for other countries)
              }
              // Add any other top-level fields required by the SOAP service
          };

           // Optional: Clean up null values if the SOAP service requires fields to be absent instead of null.
           // This would typically involve recursively traversing the soapEntry object.

          return soapEntry;
      }


      /**
       * Prepare comprehensive entry details suitable for display or detailed logging.
       * Structures the data logically, applies formatting (like dates), and includes validation summary.
       * @param {Object} entry - Original entry data (potentially after mapping/structuring).
       * @returns {Object} Structured and prepared entry details object.
       */
      prepareEntryDetails(entry) {
          // Create a deep copy to avoid modifying the original object, handle null/undefined input
          const sourceEntry = entry ? JSON.parse(JSON.stringify(entry)) : {};

          // Use helper to get values or use 'N/A' or empty string for display purposes
          const getDisplayValue = (key, defaultValue = '') => this._getValueOrDefault(sourceEntry, key, defaultValue);

          // Create the structure for prepared details
          const preparedDetails = {
              BasicInfo: {
                  SequenceNumber: getDisplayValue('SequenceNumber', 'N/A'),
                  CompanyCode: getDisplayValue('CompanyCode'),
                  AssetClass: getDisplayValue('AssetClass'),
                  IsPostCapitalization: !!getDisplayValue('AssetIsForPostCapitalization', false) // Display as boolean
              },
              GeneralDetails: {
                  FixedAssetDescription: getDisplayValue('FixedAssetDescription'),
                  AdditionalDescription: getDisplayValue('AssetAdditionalDescription'),
                  SerialNumber: getDisplayValue('AssetSerialNumber'),
                  BaseUnit: getDisplayValue('BaseUnit'),
                  InventoryNote: getDisplayValue('InventoryNote') // Example of another field
              },
              AccountAssignment: {
                  CostCenter: getDisplayValue('CostCenter'),
                  WBSElementExternalID: getDisplayValue('WBSElementExternalID'),
                  Plant: getDisplayValue('Plant'),
                  Location: getDisplayValue('AssetLocation'),
                  ProfitCenter: getDisplayValue('ProfitCenter'),
                  Room: getDisplayValue('Room'),
                  CustomWBSElement: getDisplayValue('YY1_WBS_ELEMENT') // Display custom field
              },
              LedgerDetails: {
                  // Process LedgerInformation array if it exists
                  Ledgers: (sourceEntry.LedgerInformation || []).map((ledger, index) => ({
                      Index: index + 1, // For display (1-based)
                      Code: this._getValueOrDefault(ledger, 'Ledger', 'N/A'),
                      CapitalizationDate: this.parseDate(this._getValueOrDefault(ledger, 'AssetCapitalizationDate', null)), // Format date
                      // Extract related Valuation and TimeBasedValuation based on array index
                      Valuations: this._extractRelatedValuations(sourceEntry.Valuation, index),
                      TimeBasedValuations: this._extractRelatedTimeBasedValuations(sourceEntry.TimeBasedValuation, index)
                  }))
              },
              GlobalMasterData: { // Example: India-specific fields for display
                  AssetBlock: getDisplayValue('IN_AssetBlock'),
                  PutToUseDate: this.parseDate(getDisplayValue('IN_AssetPutToUseDate', null)), // Format date
                  IsPriorYear: !!getDisplayValue('IN_AssetIsPriorYear', false) // Display as boolean
              },
              ValidationSummary: {
                  // Assume ValidationErrors is an array of strings or objects with a 'message' property
                  TotalErrors: (sourceEntry.ValidationErrors || []).length,
                  Errors: (sourceEntry.ValidationErrors || []).map(err =>
                      typeof err === 'string' ? err : (this._getValueOrDefault(err, 'message', 'Unknown Error'))
                  )
              }
          };

          // Provide default placeholder if no ledger information was found at all
          if (preparedDetails.LedgerDetails.Ledgers.length === 0) {
               const defaultLedger = this._defaultConfig.nestedStructureDefaults.LedgerInformation(0);
               const defaultValuation = this._defaultConfig.nestedStructureDefaults.Valuation(1);
               const defaultTbv = this._defaultConfig.nestedStructureDefaults.TimeBasedValuation(1);

               preparedDetails.LedgerDetails.Ledgers.push({
                   Index: 1,
                   Code: `Default (${defaultLedger.Ledger})`,
                   CapitalizationDate: this.parseDate(defaultLedger.AssetCapitalizationDate),
                   Valuations: this._extractRelatedValuations([defaultValuation], 0), // Extract default
                   TimeBasedValuations: this._extractRelatedTimeBasedValuations([defaultTbv], 0) // Extract default
               });
          }

          return preparedDetails;
      }

      /**
       * Helper to extract Valuation entries corresponding to a specific index (matching LedgerInformation index).
       * Assumes a 1:1 relationship based on array index for simplicity in display.
       * @private
       * @param {Array|undefined} valuations - The array of Valuation objects from the source entry.
       * @param {number} index - The index to match (0-based).
       * @returns {Array} Array containing the structured valuation details for display (usually 0 or 1 item).
       */
      _extractRelatedValuations(valuations, index) {
          const related = [];
          // Check if valuations array exists and has an element at the given index
          if (Array.isArray(valuations) && index >= 0 && index < valuations.length && valuations[index]) {
              const val = valuations[index]; // Get the valuation at the same index as the ledger
              related.push({
                  DepreciationArea: this._getValueOrDefault(val, 'AssetDepreciationArea', 'N/A'),
                  NegativeAmountAllowed: !!this._getValueOrDefault(val, 'NegativeAmountIsAllowed', false),
                  DepreciationStartDate: this.parseDate(this._getValueOrDefault(val, 'DepreciationStartDate', null))
              });
          }
          // This can be extended if the relationship isn't strictly index-based
          // (e.g., filter valuations based on a LedgerCode property if available).
          return related;
      }

      /**
       * Helper to extract TimeBasedValuation entries corresponding to a specific index.
       * Assumes a 1:1 relationship based on array index for simplicity in display.
       * @private
       * @param {Array|undefined} tbValuations - The array of TimeBasedValuation objects from the source entry.
       * @param {number} index - The index to match (0-based).
       * @returns {Array} Array containing the structured time-based valuation details for display (usually 0 or 1 item).
       */
      _extractRelatedTimeBasedValuations(tbValuations, index) {
           const related = [];
           // Check if tbValuations array exists and has an element at the given index
           if (Array.isArray(tbValuations) && index >= 0 && index < tbValuations.length && tbValuations[index]) {
               const tbv = tbValuations[index]; // Get the TBV at the same index as the ledger
               related.push({
                   DepreciationArea: this._getValueOrDefault(tbv, 'AssetDepreciationArea', 'N/A'),
                   DepreciationKey: this._getValueOrDefault(tbv, 'DepreciationKey', ''),
                   PlannedUsefulLifeYears: this._getValueOrDefault(tbv, 'PlannedUsefulLifeInYears', ''),
                   PlannedUsefulLifePeriods: this._getValueOrDefault(tbv, 'PlannedUsefulLifeInPeriods', ''),
                   ScrapAmount: {
                       Value: this._getValueOrDefault(tbv, 'ScrapAmountInCoCodeCrcy', this._defaultConfig.defaultNumeric),
                       Currency: this._getValueOrDefault(tbv, 'currencyCode', this._defaultConfig.defaultCurrency)
                   },
                   ScrapPercent: this._getValueOrDefault(tbv, 'AcqnProdnCostScrapPercent', '') // Display raw value, maybe format later
               });
           }
           // Can be extended similar to _extractRelatedValuations if relationship isn't index-based.
           return related;
      }


      /**
       * Get a value from a source object by key, returning a default value if the key
       * is not found, or the value is null or undefined.
       * @param {Object} source - The source object.
       * @param {string} key - The key (property name) to retrieve.
       * @param {*} defaultValue - The value to return if the key is absent or value is null/undefined.
       * @returns {*} The retrieved value or the default value.
       * @private
       */
      _getValueOrDefault(source, key, defaultValue) {
          // Check if source is a non-null object and has the key directly
          if (source && typeof source === 'object' && source.hasOwnProperty(key)) {
              const value = source[key];
              // Return the value only if it's not strictly null or undefined
              if (value !== null && value !== undefined) {
                  return value;
              }
          }
          // Otherwise, return the provided default value
          return defaultValue;
      }

  }; // End of DataTransformer class
}); // End of sap.ui.define