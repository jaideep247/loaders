sap.ui.define(["sap/ui/core/format/DateFormat"], function (DateFormat) {
  "use strict";

  /**
   * DataTransformer
   * Centralized utility for handling data transformation, formatting, and parsing for WBS Elements.
   */
  var DataTransformer = function () {
    // --- Date Formatters ---
    this._oDataDateFormatter = DateFormat.getDateTimeInstance({ pattern: "yyyy-MM-dd'T00:00:00'", UTC: false });
    this._displayDateFormatter = DateFormat.getDateInstance({ pattern: "yyyy-MM-dd", strictParsing: false });

    // Initialize field mappings
    this._fieldMappings = this._initWBSFieldMappings();
    // Define the canonical order of columns for WBS export
    this._wbsExportColumnOrder = this._initWBSExportColumnOrder();
    // Define the canonical order of columns for message export
    this._messageExportColumnOrder = this._initMessageExportColumnOrder();

    console.log("DataTransformer initialized.");
  };

  /**
  * Initialize WBS field mappings
  * Maps from business-friendly names (as seen in Excel) to SAP API field names
  * @returns {Object} WBS field mappings
  * @private
  */
  DataTransformer.prototype._initWBSFieldMappings = function () {
    return {
      // Primary WBS Element fields - map from business-friendly names to API fields
      // Exact template field names (case-sensitive)
      'Project Element': 'ProjectElement',
      'Project UUID': 'ProjectUUID',
      'Description': 'ProjectElementDescription',
      'Planned Start Date': 'PlannedStartDate',
      'Planned End Date': 'PlannedEndDate',
      'Responsible Cost Center': 'ResponsibleCostCenter',
      'Company Code': 'CompanyCode',
      'Profit Center': 'ProfitCenter',
      'Controlling Area': 'ControllingArea',
      'Billing Element': 'WBSElementIsBillingElement',
      //'Is Billing Element (X=Yes)': 'WBSElementIsBillingElement',
      'Old Project Site ID': 'YY1_OldProjectSiteID_PTD',
      'Exact WBS Code': 'YY1_ExactWBScode_PTD',
      'Site Type': 'YY1_Categorization1_PTD',
      'ATM ID': 'YY1_ATMID_PTD',
      'District': 'YY1_Address_PTD',
      'State': 'YY1_State_PTD',
      'Project': 'YY1_Project_PTD',
      'ATM Count': 'YY1_ATMCount_PTD',
      'Nature of WBS': 'YY1_NatureOfWBS_PTD',
      'SAP Site ID Report': 'YY1_SAPsiteIDReport_PTD',
      'Address and Postal Code': 'YY1_Addressandpostalco_PTD',
      'Deployment': 'YY1_Deployment_PTD',
      'Bank Load ATM Discount': 'YY1_BankLoadATMDiscoun_PTD',
      'ERP Relocation Ref ATM': 'YY1_ERPRelocationRefAT_PTD',
      'ERP Site ID Report': 'YY1_ERPsiteIDReport_PTD',
      'UDF3': 'YY1_UDF3_PTD',
      'Categorization': 'YY1_Categorization_PTD',
      'Actual Start Date': 'YY1_UDF1_PTD',
      'Postal Code': 'YY1_Postalcode_PTD',
      'Actual End Date': 'YY1_UDF2_PTD',
      'ERP Relocation Reference': 'YY1_ERPRelocationRefer_PTD',

      // Lowercase variations for compatibility
      'project element': 'ProjectElement',
      'project uuid': 'ProjectUUID',
      'description': 'ProjectElementDescription',
      // Add more lowercase variations as needed
    };
  };


  /**
   * Get all field mappings as an array of objects for template generation
   * @returns {Array} Array of {field, displayName} objects
   */
  DataTransformer.prototype.getFieldMappingsForTemplate = function () {
    const businessMappings = this.getBusinessFieldMappings();
    return Object.keys(businessMappings).map(field => ({
      field: field,
      displayName: businessMappings[field]
    }));
  };

  /**
   * Get all field mappings as an array of objects for template generation
   * @returns {Array} Array of {field, displayName} objects
   */
  DataTransformer.prototype.getFieldMappingsForTemplate = function () {
    const businessMappings = this._initWBSFieldMappings();

    // Process mappings, filtering out undefined and duplicate mappings
    const processedMappings = [];
    const seenFields = new Set();

    Object.keys(businessMappings).forEach(displayName => {
      const technicalField = businessMappings[displayName];

      // Skip if no technical field or already processed
      if (!technicalField || seenFields.has(technicalField)) return;

      processedMappings.push({
        field: technicalField,
        displayName: displayName
      });

      seenFields.add(technicalField);
    });

    return processedMappings;
  };
  /**
   * Defines the canonical order of columns for WBS Element export.
   * This ensures consistent output regardless of input data order.
   * @returns {Array<string>} An array of column names in the desired order.
   * @private
   */
  DataTransformer.prototype._initWBSExportColumnOrder = function () {
    return [
      // Status information (always first for export results)
      "Status",
      "Message",
      "ErrorCode", // Added for error records

      // Primary WBS Element fields
      "ProjectElement",
      "ProjectUUID",
      "ProjectElementDescription",
      "PlannedStartDate",
      "PlannedEndDate",
      "ResponsibleCostCenter",
      "CompanyCode",
      "ProfitCenter",
      "ControllingArea",
      "WBSElementIsBillingElement",

      // Custom extension fields (YY1_*)
      "YY1_OldProjectSiteID_PTD",
      "YY1_ExactWBScode_PTD",
      "YY1_Categorization1_PTD",
      "YY1_ATMID_PTD",
      "YY1_Address_PTD",
      "YY1_State_PTD",
      "YY1_Project_PTD",
      "YY1_ATMCount_PTD",
      "YY1_NatureOfWBS_PTD",
      "YY1_SAPsiteIDReport_PTD",
      "YY1_Addressandpostalco_PTD",
      "YY1_Deployment_PTD",
      "YY1_BankLoadATMDiscoun_PTD",
      "YY1_ERPRelocationRefAT_PTD",
      "YY1_ERPsiteIDReport_PTD",
      "YY1_UDF3_PTD",
      "YY1_Categorization_PTD",
      "YY1_UDF1_PTD", // Actual start date
      "YY1_Postalcode_PTD",
      "YY1_UDF2_PTD", // Actual end date
      "YY1_ERPRelocationRefer_PTD",

      // System fields (last, if available in the data)
      "CreatedByUser",
      "CreationDateTime",
      "LastChangeDateTime",
      "LastChangedByUser"
    ];
  };

  /**
   * Defines the canonical order of columns for message export.
   * @returns {Array<string>} An array of column names in the desired order.
   * @private
   */
  DataTransformer.prototype._initMessageExportColumnOrder = function () {
    return [
      "Status",
      "Type",
      "Code",
      "Message",
      "Timestamp",
      "Source",
      "EntityId",
      "BatchIndex",
      "Details"
    ];
  };

  /**
   * Returns the canonical WBS export column order.
   * @returns {Array<string>} An array of column names in the desired order.
   * @public
   */
  DataTransformer.prototype.getWBSExportColumnOrder = function () {
    return this._wbsExportColumnOrder;
  };

  /**
   * Returns the canonical message export column order.
   * @returns {Array<string>} An array of column names in the desired order.
   * @public
   */
  DataTransformer.prototype.getMessageExportColumnOrder = function () {
    return this._messageExportColumnOrder;
  };

  /**
   * Parses various date inputs into a standard YYYY-MM-DD string format.
   * @param {*} dateValue - The date value to parse.
   * @returns {string|null} Formatted date string (YYYY-MM-DD) or null if invalid.
   */
  DataTransformer.prototype.parseDate = function (dateValue) {
    if (!dateValue && dateValue !== 0) return null;

    try {
      // Handle Date objects
      if (dateValue instanceof Date) {
        return !isNaN(dateValue.getTime()) ? this._displayDateFormatter.format(dateValue) : null;
      }

      // Handle string formats
      if (typeof dateValue === 'string') {
        // Handle SAP /Date()/ format
        if (dateValue.startsWith('/Date(')) {
          const ts = parseInt(dateValue.substring(6));
          if (!isNaN(ts)) {
            const d = new Date(ts);
            return !isNaN(d.getTime()) ? this._displayDateFormatter.format(d) : null;
          }
        }

        // Handle ISO format
        if (dateValue.includes('T') && dateValue.includes('-')) {
          const d = new Date(dateValue);
          return !isNaN(d.getTime()) ? this._displayDateFormatter.format(d) : null;
        }

        // Handle YYYY-MM-DD format
        if (/^\d{4}-\d{2}-\d{2}$/.test(dateValue)) {
          const d = new Date(dateValue + 'T00:00:00');
          return !isNaN(d.getTime()) ? dateValue : null;
        }

        // Handle other string formats
        const parsedTs = Date.parse(dateValue);
        if (!isNaN(parsedTs)) {
          return this._displayDateFormatter.format(new Date(parsedTs));
        }
      }

      // Handle Excel date numbers (numeric date)
      if (typeof dateValue === 'number' || (typeof dateValue === 'string' && /^\d+$/.test(dateValue))) {
        const num = Number(dateValue);
        if (num > 25569 && num < 2958466) { // Common range for Excel dates (1970-2099)
          const excelTs = (num - 25569) * 86400 * 1000;
          const excelD = new Date(excelTs);
          if (!isNaN(excelD.getTime())) {
            return this._displayDateFormatter.format(excelD);
          }
        }
      }

      // Last resort generic parsing
      const genericD = new Date(dateValue);
      if (!isNaN(genericD.getTime())) {
        console.warn("parseDate: Used generic new Date() parsing for:", dateValue);
        return this._displayDateFormatter.format(genericD);
      }

      console.warn("parseDate: Could not parse date input:", dateValue);
      return null;
    } catch (e) {
      console.error("Error during date parsing:", dateValue, e);
      return null;
    }
  };

  /**
   * Format a date specifically for OData V2 payload requirements.
   * @param {*} dateValue - Date input (string, Date object, Excel number, etc.)
   * @returns {string|null} Formatted date string for OData or null if invalid.
   */
  DataTransformer.prototype.formatDateForOData = function (dateValue) {
    const parsedDate = this.parseDate(dateValue);
    if (!parsedDate) return null;

    try {
      const dateObj = new Date(parsedDate + "T00:00:00");
      return isNaN(dateObj.getTime()) ? null : this._oDataDateFormatter.format(dateObj);
    } catch (e) {
      console.error("Error formatting date for OData:", dateValue, e);
      return null;
    }
  };

  /**
   * Format number for API with specific decimal places
   * @param {string|number} value - The numeric value to format
   * @param {number} [decimalPlaces=3] - Number of decimal places
   * @returns {string} Formatted number string
   */
  DataTransformer.prototype.formatNumberForAPI = function (value, decimalPlaces = 3) {
    // Handle null, undefined, or empty string
    if (value === null || value === undefined || value === '') {
      return (0).toFixed(decimalPlaces);
    }

    // Remove any commas and parse as float
    const numValue = parseFloat(String(value).replace(/,/g, ''));

    // Check if it's a valid number
    if (isNaN(numValue)) {
      console.warn(`formatNumberForAPI: Could not parse '${value}' as a number.`);
      return (0).toFixed(decimalPlaces);
    }

    // Return formatted number with specified decimal places
    return numValue.toFixed(decimalPlaces);
  };

  /**
    * Format date for OData payload
    * @param {*} dateValue - Date input to format
    * @returns {string|null} Formatted date string for OData
    */
  DataTransformer.prototype.formatDateForOData = function (dateValue) {
    // Handle null, undefined, or empty string
    if (!dateValue) return null;

    try {
      // Use existing parseDate method to standardize the date
      const parsedDate = this.parseDate(dateValue);

      // If parsing fails, return null
      if (!parsedDate) return null;

      // Create date object with time set to 00:00:00
      const dateObj = new Date(parsedDate + "T00:00:00");

      // If date is invalid, return null
      if (isNaN(dateObj.getTime())) return null;

      // Use OData date formatter
      return this._oDataDateFormatter.format(dateObj);
    } catch (error) {
      console.error("Error formatting date for OData:", dateValue, error);
      return null;
    }
  };

  /**
   * Maps input object keys (from Excel headers) to standardized internal property names.
   * @param {Object} rowData - The raw input object for a single row.
   * @returns {Object} An object with standardized keys. Returns empty object if input is invalid or has no data.
   */
  DataTransformer.prototype.mapColumnNames = function (rowData) {
    const result = {};
    let hasData = false;

    if (!rowData || typeof rowData !== 'object') return {};

    Object.keys(rowData).forEach(key => {
      const originalValue = rowData[key];

      // Try exact match first, then lowercase match
      let standardKey = this._fieldMappings[key];
      if (!standardKey) {
        const lookupKey = key.trim().toLowerCase();
        standardKey = this._fieldMappings[lookupKey] || key;
      }

      if (standardKey) {
        result[standardKey] = originalValue;
        // Check if the value is meaningful (not null, undefined, or just whitespace)
        if (originalValue !== null && originalValue !== undefined && String(originalValue).trim() !== "") {
          hasData = true;
        }
      } else if (!key.startsWith('__') && key !== 'EMPTY') { // Keep unmapped fields unless internal/placeholder
        result[key] = originalValue;
        if (originalValue !== null && originalValue !== undefined && String(originalValue).trim() !== "") {
          hasData = true;
        }
      }
    });

    // Return only if some meaningful data was found after mapping
    return hasData ? result : {};
  };

  /**
   * Process WBS Element data for creation
   * @param {Array} data - Array of raw WBS Element data
   * @returns {Array} Processed WBS Element data ready for creation
   */
  DataTransformer.prototype.processWBSElementData = function (data) {
    if (!Array.isArray(data)) {
      console.warn("DataTransformer: Input data is not an array");
      return [];
    }

    if (data.length === 0) {
      console.warn("DataTransformer: Input data array is empty");
      return [];
    }

    // Map column names and standardize values
    const standardizedData = data.map(item => this._standardizeWBSElementData(item));

    // Filter out invalid data
    const validData = this.validateWBSElementData(standardizedData);

    return validData;
  };

  /**
   * Standardize WBS Element data using field mappings and data format conversions
   * @param {Object} item - Raw WBS Element data item
   * @returns {Object} Standardized WBS Element data item
   * @private
   */
  DataTransformer.prototype._standardizeWBSElementData = function (item) {
    if (!item || typeof item !== 'object') {
      return null;
    }

    // Use mapColumnNames to get standardized field names
    const standardizedItem = this.mapColumnNames(item);

    // Format dates if they exist
    const dateFields = [
      'PlannedStartDate',
      'PlannedEndDate',
      'YY1_UDF1_PTD', // Actual start date
      'YY1_UDF2_PTD'  // Actual end date
    ];

    dateFields.forEach(dateField => {
      if (standardizedItem[dateField]) {
        standardizedItem[dateField] = this.parseDate(standardizedItem[dateField]);
      }
    });

    // Handle boolean fields - convert 'X' to true
    if (standardizedItem.WBSElementIsBillingElement === 'X' ||
      standardizedItem.WBSElementIsBillingElement === 'true' ||
      standardizedItem.WBSElementIsBillingElement === true) {
      standardizedItem.WBSElementIsBillingElement = true;
    } else {
      standardizedItem.WBSElementIsBillingElement = false;
    }

    return standardizedItem;
  };

  /**
   * Validate WBS Element data
   * @param {Array} data - Array of WBS Element data to validate
   * @returns {Array} Validated WBS Element data array
   */
  DataTransformer.prototype.validateWBSElementData = function (data) {
    if (!Array.isArray(data)) {
      return [];
    }

    return data.filter(item => {
      if (!item) return false;

      // Check required field - ProjectElement is mandatory
      if (!item.ProjectElement) {
        console.warn("DataTransformer: Skipping item missing required ProjectElement field", item);
        return false;
      }

      return true;
    });
  };

  DataTransformer.prototype.parseODataDate = function (odataDateString) {
    if (!odataDateString) {
      return null;
    }

    try {
      // Handle the OData date format: "/Date(timestamp)/" or "/Date(timestamp+offset)/"
      if (typeof odataDateString === "string" && odataDateString.indexOf("/Date(") === 0) {
        // Extract the timestamp part between parentheses
        const timestampPart = odataDateString.substring(6, odataDateString.length - 2);

        // Split by + or - to handle timezone offset if present
        const parts = timestampPart.split(/[+-]/);
        const timestamp = parseInt(parts[0], 10);

        if (!isNaN(timestamp)) {
          return new Date(timestamp);
        }
      }

      // For ISO format dates (fallback)
      if (typeof odataDateString === "string" &&
        (odataDateString.includes("T") || odataDateString.includes("-"))) {
        const date = new Date(odataDateString);
        if (!isNaN(date.getTime())) {
          return date;
        }
      }
    } catch (e) {
      console.error("DataTransformer: Error parsing OData date", e, odataDateString);
    }

    // If we can't parse it as a date, return null
    return null;
  },

    /**
      * Transform WBS Element data into the format expected by the OData service
      * @param {Object} wbsData - Raw WBS Element data
      * @returns {Object} Transformed WBS Element payload
      */
    DataTransformer.prototype.transformWBSElementData = function (wbsData) {
      // Enhanced logging for debugging
      console.log("Transforming WBS Element Data:", JSON.stringify(wbsData, null, 2));

      // Helper function to sanitize values with more comprehensive handling
      const sanitizeValue = (value, options = {}) => {
        const {
          defaultValue = '',
          trimString = true,
          convertEmptyToNull = false
        } = options;

        // Handle null/undefined cases
        if (value === null || value === undefined) {
          return convertEmptyToNull ? null : defaultValue;
        }

        // Convert to string
        let strValue = String(value);

        // Trim if specified
        if (trimString) {
          strValue = strValue.trim();
        }

        // Return empty string or null based on configuration
        return strValue === ''
          ? (convertEmptyToNull ? null : defaultValue)
          : strValue;
      };

      // Helper function to handle boolean conversion
      const convertToBoolean = (value) => {
        if (value === true || value === 'true' || value === 'X') return true;
        if (value === false || value === 'false' || value === '') return false;
        return false;
      };
     
      // Detailed transformation with extensive fallback and mapping
      const transformedData = {
        // Core fields with multiple fallback options
        ProjectElement: sanitizeValue(
          wbsData.ProjectElement ||
          wbsData['Project Element'] ||
          wbsData.ProjectElementID
        ),
        ProjectUUID: sanitizeValue(
          wbsData.ProjectUUID ||
          wbsData['Project UUID']
        ),
        ProjectElementDescription: sanitizeValue(
          wbsData.ProjectElementDescription ||
          wbsData.Description ||
          wbsData['Name of WBS'] ||
          wbsData['Description']
        ),

        // Date fields with comprehensive parsing
        PlannedStartDate: this.formatDateForOData(
          wbsData.PlannedStartDate ||
          wbsData['Planned Start Date']
        ),
        PlannedEndDate: this.formatDateForOData(
          wbsData.PlannedEndDate ||
          wbsData['Planned End Date']
        ),

        // Organizational fields
        ResponsibleCostCenter: sanitizeValue(
          wbsData.ResponsibleCostCenter ||
          wbsData['Responsible Cost Center']
        ),
        CompanyCode: sanitizeValue(
          wbsData.CompanyCode ||
          wbsData['Company Code']
        ),
        ProfitCenter: sanitizeValue(
          wbsData.ProfitCenter ||
          wbsData['Profit Center']
        ),
        ControllingArea: sanitizeValue(
          wbsData.ControllingArea ||
          wbsData['Controlling Area']
        ),

        // Boolean field with multiple conversion options
        WBSElementIsBillingElement: convertToBoolean(
          wbsData.WBSElementIsBillingElement ||
          wbsData['Is Billing Element (X=Yes)'] ||
          wbsData['Billing Element']
        ),

        // Extension fields with comprehensive mapping
        YY1_OldProjectSiteID_PTD: sanitizeValue(
          wbsData.YY1_OldProjectSiteID_PTD ||
          wbsData['Old Project Site ID'] ||
          wbsData['Old Project ID']
        ),
        YY1_ExactWBScode_PTD: sanitizeValue(
          wbsData.YY1_ExactWBScode_PTD ||
          wbsData['Exact WBS Code'] ||
          wbsData['Exact WBS code']
        ),
        YY1_Categorization1_PTD: sanitizeValue(
          wbsData.YY1_Categorization1_PTD ||
          wbsData['Site Type'] ||
          wbsData['Site type (OF/ON)']
        ),
        YY1_ATMID_PTD: sanitizeValue(
          wbsData.YY1_ATMID_PTD ||
          wbsData['ATM ID']
        ),
        YY1_Address_PTD: sanitizeValue(
          wbsData.YY1_Address_PTD ||
          wbsData['District'] ||
          wbsData['Address']
        ),
        YY1_State_PTD: sanitizeValue(
          wbsData.YY1_State_PTD ||
          wbsData['State']
        ),
        YY1_Project_PTD: sanitizeValue(
          wbsData.YY1_Project_PTD ||
          wbsData['Project'] ||
          wbsData['Bank name']
        ),
        YY1_ATMCount_PTD: sanitizeValue(
          wbsData.YY1_ATMCount_PTD ||
          wbsData['ATM Count'] ||
          wbsData['atm count']
        ),
        YY1_NatureOfWBS_PTD: sanitizeValue(
          wbsData.YY1_NatureOfWBS_PTD ||
          wbsData['Nature of WBS']
        ),
        YY1_SAPsiteIDReport_PTD: sanitizeValue(
          wbsData.YY1_SAPsiteIDReport_PTD ||
          wbsData['SAP Site ID Report']
        ),
        YY1_Addressandpostalco_PTD: sanitizeValue(
          wbsData.YY1_Addressandpostalco_PTD ||
          wbsData['Address and Postal Code']
        ),
        YY1_Deployment_PTD: sanitizeValue(
          wbsData.YY1_Deployment_PTD ||
          wbsData['Deployment']
        ),
        YY1_BankLoadATMDiscoun_PTD: this.formatNumberForAPI(
          wbsData.YY1_BankLoadATMDiscoun_PTD ||
          wbsData['Bank Load ATM Discount'] ||
          wbsData['Bank load percentage'],
          2
        ),
        YY1_ERPRelocationRefAT_PTD: sanitizeValue(
          wbsData.YY1_ERPRelocationRefAT_PTD ||
          wbsData['ERP Relocation Ref ATM']
        ),
        YY1_ERPsiteIDReport_PTD: sanitizeValue(
          wbsData.YY1_ERPsiteIDReport_PTD ||
          wbsData['ERP Site ID Report']
        ),
        YY1_UDF3_PTD: sanitizeValue(
          wbsData.YY1_UDF3_PTD ||
          wbsData['UDF-1'] ||
          wbsData['UDF3']
        ),
        YY1_Categorization_PTD: sanitizeValue(
          wbsData.YY1_Categorization_PTD ||
          wbsData['Categorization']
        ),
        YY1_UDF1_PTD: this.formatDateForOData(
          wbsData.YY1_UDF1_PTD ||
          wbsData['Actual Start Date'] ||
          wbsData['Actual start date']
        ),
        YY1_Postalcode_PTD: sanitizeValue(
          wbsData.YY1_Postalcode_PTD ||
          wbsData['Postal Code'] ||
          wbsData['postal code']
        ),
        YY1_UDF2_PTD: this.formatDateForOData(
          wbsData.YY1_UDF2_PTD ||
          wbsData['Actual End Date'] ||
          wbsData['Actual end date']
        ),
        YY1_ERPRelocationRefer_PTD: sanitizeValue(
          wbsData.YY1_ERPRelocationRefer_PTD ||
          wbsData['ERP Relocation Reference'] ||
          wbsData['ERP relocation ref. site id']
        )
      };

      // Log the transformed data for debugging
      console.log("Transformed WBS Element Data:", JSON.stringify(transformedData, null, 2));

      return transformedData;
    };

  /**
   * Generates a success message for a WBS Element creation record.
   * @param {Object} record - The success record.
   * @returns {String} Generated success message.
   * @private
   */
  DataTransformer.prototype._generateWBSSuccessMessage = function (record) {
    if (record.WBSElementID && record.ProjectElementDescription) {
      return `WBS Element ${record.WBSElementID} (${record.ProjectElementDescription}) created successfully.`;
    }
    if (record.WBSElementID) {
      return `WBS Element ${record.WBSElementID} created successfully.`;
    }
    if (record.ProjectElement) {
      return `Project Element ${record.ProjectElement} processed successfully.`;
    }
    return "Processed successfully.";
  };

  /**
 * Processes diverse batch results structures into a unified format for export.
 * This method consolidates logic from previous processBatchResults and processBatchWBSResults.
 *
 * @param {Object} batchData - The raw batch data object, typically from BatchProcessingManager.getResponseData().
 * @param {string} [exportType="all"] - Filters results ("all", "success", "error"/"errors", "all_messages").
 * @returns {Array<object>} - An array of standardized objects for export, with consistent columns.
 */
  DataTransformer.prototype.processBatchResultsForExport = function (batchData, exportType = "all") {
    try {
      // ADDED LOG: Inspect the incoming batchData for debugging
      console.log("DataTransformer: processBatchResultsForExport called with batchData:", JSON.stringify(batchData, null, 2), "and exportType:", exportType);

      if (!batchData) {
        console.warn("processBatchResultsForExport: No batch data provided.");
        return [];
      }

      let recordsToProcess = [];

      // FIXED: Handle 'all_messages' type with proper Status mapping
      if (exportType === "all") {
        const allMessages = batchData.allMessages || batchData._responseData?.allMessages || batchData.responseData?.allMessages || [];
        if (allMessages.length === 0) {
          return [{
            Status: "No Records",
            Type: "info",
            Code: "NO_MESSAGES",
            Message: "No messages found for export.",
            Timestamp: this._formatDateTime(new Date()),
            Source: "Export",
            EntityId: "",
            BatchIndex: "",
            Details: ""
          }];
        }

        // Transform each message object into a flat record for export with proper Status
        const transformedMessages = allMessages.map(msg => {
          // FIXED: Map message type to Status
          let status = "Unknown";
          const msgType = (msg.type || "").toLowerCase();

          switch (msgType) {
            case 'success':
              status = "Success";
              break;
            case 'error':
              status = "Error";
              break;
            case 'warning':
              status = "Warning";
              break;
            case 'info':
            case 'information':
              status = "Info";
              break;
            default:
              // If no type, try to determine from code or message content
              const code = (msg.code || "").toUpperCase();
              const message = (msg.message || msg.text || "").toLowerCase();

              if (code.includes('ERROR') || message.includes('error') || message.includes('failed')) {
                status = "Error";
              } else if (code.includes('SUCCESS') || message.includes('success') || message.includes('created')) {
                status = "Success";
              } else if (code.includes('WARNING') || message.includes('warning')) {
                status = "Warning";
              } else {
                status = "Info";
              }
              break;
          }

          const transformed = {
            Status: msg.type,
            Code: msg.code || "",
            Message: msg.message || msg.text || "",
            Timestamp: msg.timestamp ? this._formatDateTime(new Date(msg.timestamp)) : "",
            Source: msg.source || "",
            EntityId: msg.entityId || "",
            BatchIndex: msg.batchIndex !== undefined ? msg.batchIndex : "",
            Details: (msg.details && typeof msg.details === 'object') ? JSON.stringify(msg.details) : (msg.details || "")
          };
          return transformed;
        });

        // FIXED: Use message export column order for all_messages
        return this._reorderColumns(transformedMessages, this.getMessageExportColumnOrder());
      }

      // For other export types, process success/error records
      const successRecordsRaw = batchData.successRecords || batchData.responseData?.successRecords || [];
      const errorRecordsRaw = batchData.errorRecords || batchData.responseData?.errorRecords || [];

      // Helper to transform a single record for export
      const transformRecordForExport = (record, status, defaultMessage) => {
        // Defensive check: Ensure record is a valid object before attempting to transform
        if (!record || typeof record !== 'object') {
          console.warn("transformRecordForExport: Invalid record provided, skipping transformation:", record);
          return null; // Return null to filter out invalid records later
        }

        const transformed = { ...record };
        transformed.Status = status;
        // Ensure a message exists
        transformed.Message = record.Message || record.SuccessMessage || record.ErrorMessage || defaultMessage;
        transformed.ErrorCode = record.ErrorCode || ""; // Ensure ErrorCode is present for error records

        // Remove internal/system-specific fields if they exist
        const fieldsToRemove = [
          '_rawResponse',
          '_originalIndex',
          '_processingError',
          '_sapui_batchId',
          '_sapui_requestType',
          '_sapui_url'
          // FIXED: Don't remove Status anymore as we want it in the export
        ];
        fieldsToRemove.forEach(key => delete transformed[key]);

        // Format date fields consistently
        ['PlannedStartDate', 'PlannedEndDate', 'YY1_UDF1_PTD', 'YY1_UDF2_PTD',
          'CreationDateTime', 'LastChangeDateTime'].forEach(dateField => {
            if (transformed[dateField] && typeof this.parseDate === 'function') {
              try {
                transformed[dateField] = this.parseDate(transformed[dateField]);
              } catch (e) {
                console.warn(`Error formatting date field ${dateField} in export record:`, e);
              }
            }
          });

        return transformed;
      };

      // FIXED: Handle "all" export type to include messages as well
      if (exportType === "all") {
        // Add success records
        recordsToProcess = recordsToProcess.concat(
          successRecordsRaw.map(record => transformRecordForExport(record, "Success", this._generateWBSSuccessMessage(record))).filter(Boolean)
        );

        // Add error records
        recordsToProcess = recordsToProcess.concat(
          errorRecordsRaw.map(record => transformRecordForExport(record, "Error", record.Message || "Processing failed")).filter(Boolean)
        );

        // FIXED: Also include messages from allMessages for complete export
        const allMessages = batchData.allMessages || [];
        if (allMessages.length > 0) {
          const messageRecords = allMessages.map(msg => {
            // Convert message to record format
            let status = "Info";
            const msgType = (msg.type || "").toLowerCase();

            switch (msgType) {
              case 'success':
                status = "Success";
                break;
              case 'error':
                status = "Error";
                break;
              case 'warning':
                status = "Warning";
                break;
              default:
                status = "Info";
                break;
            }

            return {
              Status: status,
              Message: msg.message || msg.text || "",
              ErrorCode: msg.code || "",
              ProjectElement: msg.entityId || "",
              // Add other relevant fields from the message if available
              Source: msg.source || "System",
              BatchIndex: msg.batchIndex || "",
              Timestamp: msg.timestamp || "",
              Details: (msg.details && typeof msg.details === 'object') ? JSON.stringify(msg.details) : (msg.details || "")
            };
          });

          recordsToProcess = recordsToProcess.concat(messageRecords);
        }
      } else if (exportType === "success") {
        recordsToProcess = recordsToProcess.concat(
          successRecordsRaw.map(record => transformRecordForExport(record, "Success", this._generateWBSSuccessMessage(record))).filter(Boolean)
        );
      } else if (exportType === "error" || exportType === "errors") {
        recordsToProcess = recordsToProcess.concat(
          errorRecordsRaw.map(record => transformRecordForExport(record, "Error", record.Message || "Processing failed")).filter(Boolean)
        );
      }

      if (recordsToProcess.length === 0) {
        console.warn(`processBatchResultsForExport: No records found matching type '${exportType}'.`);
        return [{
          Status: "No Records",
          Message: `No ${exportType} records found for export.`,
          ErrorCode: "NO_DATA",
          ProjectElement: "",
          Timestamp: this._formatDateTime(new Date())
        }];
      }

      // Reorder columns for better readability based on the canonical order for WBS records
      return this._reorderColumns(recordsToProcess, this.getWBSExportColumnOrder());

    } catch (error) {
      console.error("Error processing batch results for export:", error);
      return [{
        Status: "Processing Error",
        Message: "Internal error processing batch results for export: " + error.message,
        ErrorCode: "EXPORT_ERROR",
        ErrorDetails: error.stack,
        Timestamp: this._formatDateTime(new Date())
      }];
    }
  };


  /**
   * Reorders columns for export based on a provided canonical order.
   * Ensures all columns in the canonical order are present, even if empty, and appends any extra fields.
   * @param {Array<object>} records - Records to reorder.
   * @param {Array<string>} columnOrder - An array of column names in the desired order.
   * @returns {Array<object>} Records with reordered columns.
   * @private
   */
  DataTransformer.prototype._reorderColumns = function (records, columnOrder) {
    if (!records || !Array.isArray(records) || records.length === 0) {
      return records;
    }
    if (!columnOrder || !Array.isArray(columnOrder) || columnOrder.length === 0) {
      console.warn("No column order provided for reordering. Returning records as is.");
      return records;
    }

    return records.map(record => {
      const orderedRecord = {};

      // First add properties in the defined order (if they exist)
      columnOrder.forEach(key => {
        // Ensure all defined columns are present, even if their value is null/undefined
        orderedRecord[key] = record.hasOwnProperty(key) ? (record[key] ?? "") : ""; // Use nullish coalescing for null/undefined
      });

      // Then add any remaining properties not in the defined order
      Object.keys(record).forEach(key => {
        if (!(key in orderedRecord)) {
          orderedRecord[key] = record[key];
        }
      });

      return orderedRecord;
    });
  };

  /**
   * Format date time to a standard format (e.g., DD-MM-YY HH:MM:SS)
   * @param {Date} date - Date to format
   * @returns {string} Formatted date string
   * @private
   */
  DataTransformer.prototype._formatDateTime = function (date) {
    if (!date || !(date instanceof Date) || isNaN(date.getTime())) return "";

    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = String(date.getFullYear()).substring(2); // Get last two digits of year
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    const seconds = String(date.getSeconds()).padStart(2, '0');

    return `${day}-${month}-${year} ${hours}:${minutes}:${seconds}`;
  };

  // Return the DataTransformer constructor
  return DataTransformer;
});
