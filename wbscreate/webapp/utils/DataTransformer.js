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

    console.log("DataTransformer initialized.");
  };

  /**
   * Initialize WBS field mappings
   * Maps from Excel column names to SAP API field names
   * @returns {Object} WBS field mappings
   * @private
   */
  DataTransformer.prototype._initWBSFieldMappings = function () {
    return {
      // Primary WBS Element fields - map from Excel headers to API fields
      'project element': 'ProjectElement',
      'projectelement': 'ProjectElement',
      'project_element': 'ProjectElement',

      'projectuuid': 'ProjectUUID',
      'project uuid': 'ProjectUUID',

      'name of wbs': 'ProjectElementDescription',
      'description': 'ProjectElementDescription',
      'projectelementdescription': 'ProjectElementDescription',
      'project_element_description': 'ProjectElementDescription',

      'planned start date': 'PlannedStartDate',
      'plannedstartdate': 'PlannedStartDate',
      'planned_start_date': 'PlannedStartDate',

      'planned end date': 'PlannedEndDate',
      'plannedenddate': 'PlannedEndDate',
      'planned_end_date': 'PlannedEndDate',

      'responsible cost center': 'ResponsibleCostCenter',
      'responsiblecostcenter': 'ResponsibleCostCenter',
      'responsible_cost_center': 'ResponsibleCostCenter',

      'company code': 'CompanyCode',
      'companycode': 'CompanyCode',
      'company_code': 'CompanyCode',

      'profit center': 'ProfitCenter',
      'profitcenter': 'ProfitCenter',
      'profit_center': 'ProfitCenter',

      'controlling area': 'ControllingArea',
      'controllingarea': 'ControllingArea',
      'controlling_area': 'ControllingArea',

      'billing element': 'WBSElementIsBillingElement',
      'billingelement': 'WBSElementIsBillingElement',
      'billing_element': 'WBSElementIsBillingElement',
      'is billing element': 'WBSElementIsBillingElement',
      'isbillingelement': 'WBSElementIsBillingElement',
      'wbselementisbillingelement': 'WBSElementIsBillingElement',

      // Extension fields (YY1_*)
      'old project id': 'YY1_OldProjectSiteID_PTD',
      'oldprojectid': 'YY1_OldProjectSiteID_PTD',
      'old_project_id': 'YY1_OldProjectSiteID_PTD',

      'exact wbs code': 'YY1_ExactWBScode_PTD',
      'exactwbscode': 'YY1_ExactWBScode_PTD',
      'exact_wbs_code': 'YY1_ExactWBScode_PTD',

      'site type': 'YY1_Categorization1_PTD',
      'site type (of/on)': 'YY1_Categorization1_PTD',
      'sitetype': 'YY1_Categorization1_PTD',
      'site_type': 'YY1_Categorization1_PTD',
      'categorization1': 'YY1_Categorization1_PTD',

      'atm id': 'YY1_ATMID_PTD',
      'atmid': 'YY1_ATMID_PTD',
      'atm_id': 'YY1_ATMID_PTD',

      'district': 'YY1_Address_PTD',
      'address': 'YY1_Addressandpostalco_PTD',

      'state': 'YY1_State_PTD',

      'bank name': 'YY1_Project_PTD',
      'bankname': 'YY1_Project_PTD',
      'bank_name': 'YY1_Project_PTD',

      'atm count': 'YY1_ATMCount_PTD',
      'atmcount': 'YY1_ATMCount_PTD',
      'atm_count': 'YY1_ATMCount_PTD',

      'nature of wbs': 'YY1_NatureOfWBS_PTD',
      'natureofwbs': 'YY1_NatureOfWBS_PTD',
      'nature_of_wbs': 'YY1_NatureOfWBS_PTD',

      'sap site id report': 'YY1_SAPsiteIDReport_PTD',
      'sapsiteidreport': 'YY1_SAPsiteIDReport_PTD',
      'sap_site_id_report': 'YY1_SAPsiteIDReport_PTD',

      'deployment': 'YY1_Deployment_PTD',

      'bank load percentage': 'YY1_BankLoadATMDiscoun_PTD',
      'bankloadpercentage': 'YY1_BankLoadATMDiscoun_PTD',
      'bank_load_percentage': 'YY1_BankLoadATMDiscoun_PTD',

      'erp relocation ref atm id': 'YY1_ERPRelocationRefAT_PTD',
      'erprelocationrefatmid': 'YY1_ERPRelocationRefAT_PTD',
      'erp_relocation_ref_atm_id': 'YY1_ERPRelocationRefAT_PTD',

      'erp site id report': 'YY1_ERPsiteIDReport_PTD',
      'erpsiteidreport': 'YY1_ERPsiteIDReport_PTD',
      'erp_site_id_report': 'YY1_ERPsiteIDReport_PTD',

      'udf-1': 'YY1_UDF3_PTD',
      'udf1': 'YY1_UDF3_PTD',

      'categorization': 'YY1_Categorization_PTD',

      'actual start date': 'YY1_UDF1_PTD',
      'actualstartdate': 'YY1_UDF1_PTD',
      'actual_start_date': 'YY1_UDF1_PTD',

      'postal code': 'YY1_Postalcode_PTD',
      'postalcode': 'YY1_Postalcode_PTD',
      'postal_code': 'YY1_Postalcode_PTD',

      'actual end date': 'YY1_UDF2_PTD',
      'actualenddate': 'YY1_UDF2_PTD',
      'actual_end_date': 'YY1_UDF2_PTD',

      'erp relocation ref. site id': 'YY1_ERPRelocationRefer_PTD',
      'erprelocationrefsiteid': 'YY1_ERPRelocationRefer_PTD',
      'erp_relocation_ref_site_id': 'YY1_ERPRelocationRefer_PTD'
    };
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
        if (num > 25569 && num < 2958466) {
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
   * Formats a numeric value for OData API calls (as string).
   * @param {string|number} value - The numeric value to format.
   * @param {number} [decimalPlaces=3] - The number of decimal places required.
   * @returns {string|null} Formatted number string, or defaultValue if input is invalid/empty.
   */
  DataTransformer.prototype.formatNumberForAPI = function (value, decimalPlaces = 3) {
    const defaultValue = (0).toFixed(decimalPlaces);

    if (value === undefined || value === null || value === '') {
      return defaultValue;
    }

    let numericString = String(value).replace(/,/g, ''); // Handle thousand separators
    let numValue = parseFloat(numericString);

    if (isNaN(numValue)) {
      console.warn(`formatNumberForAPI: Could not parse '${value}' as a number.`);
      return defaultValue;
    }

    return numValue.toFixed(decimalPlaces);
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
      const lookupKey = key.trim().toLowerCase();
      const standardKey = this._fieldMappings[lookupKey] || key;

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

  /**
   * Transform WBS Element data into the format expected by the OData service
   * @param {Object} wbsData - Raw WBS Element data
   * @returns {Object} Transformed WBS Element payload
   */
  DataTransformer.prototype.transformWBSElementData = function (wbsData) {
    // Return the formatted payload for OData service
    return {
      // Core fields
      ProjectElement: wbsData.ProjectElement || "",
      ProjectUUID: wbsData.ProjectUUID || "",
      ProjectElementDescription: wbsData.ProjectElementDescription || "",
      PlannedStartDate: this.formatDateForOData(wbsData.PlannedStartDate),
      PlannedEndDate: this.formatDateForOData(wbsData.PlannedEndDate),
      ResponsibleCostCenter: wbsData.ResponsibleCostCenter || "",
      CompanyCode: wbsData.CompanyCode || "",
      ProfitCenter: wbsData.ProfitCenter || "",
      ControllingArea: wbsData.ControllingArea || "",
      WBSElementIsBillingElement: wbsData.WBSElementIsBillingElement === true || wbsData.WBSElementIsBillingElement === "X",

      // Extension fields
      YY1_OldProjectSiteID_PTD: wbsData.YY1_OldProjectSiteID_PTD || "",
      YY1_ExactWBScode_PTD: wbsData.YY1_ExactWBScode_PTD || "",
      YY1_Categorization1_PTD: wbsData.YY1_Categorization1_PTD || "",
      YY1_ATMID_PTD: wbsData.YY1_ATMID_PTD || "",
      YY1_Address_PTD: wbsData.YY1_Address_PTD || "",
      YY1_State_PTD: wbsData.YY1_State_PTD || "",
      YY1_Project_PTD: wbsData.YY1_Project_PTD || "",
      YY1_ATMCount_PTD: wbsData.YY1_ATMCount_PTD || "",
      YY1_NatureOfWBS_PTD: wbsData.YY1_NatureOfWBS_PTD || "",
      YY1_SAPsiteIDReport_PTD: wbsData.YY1_SAPsiteIDReport_PTD || "",
      YY1_Addressandpostalco_PTD: wbsData.YY1_Addressandpostalco_PTD || "",
      YY1_Deployment_PTD: wbsData.YY1_Deployment_PTD || "",
      YY1_BankLoadATMDiscoun_PTD: wbsData.YY1_BankLoadATMDiscoun_PTD || "",
      YY1_ERPRelocationRefAT_PTD: wbsData.YY1_ERPRelocationRefAT_PTD || "",
      YY1_ERPsiteIDReport_PTD: wbsData.YY1_ERPsiteIDReport_PTD || "",
      YY1_UDF3_PTD: wbsData.YY1_UDF3_PTD || "",
      YY1_Categorization_PTD: wbsData.YY1_Categorization_PTD || "",
      YY1_UDF1_PTD: this.formatDateForOData(wbsData.YY1_UDF1_PTD), // Actual start date
      YY1_Postalcode_PTD: wbsData.YY1_Postalcode_PTD || "",
      YY1_UDF2_PTD: this.formatDateForOData(wbsData.YY1_UDF2_PTD), // Actual end date
      YY1_ERPRelocationRefer_PTD: wbsData.YY1_ERPRelocationRefer_PTD || ""
    };
  };

  /**
   * Process batch WBS Element creation results for export
   * @param {Object} batchData - The raw batch data object
   * @param {string} [exportType="all"] - Filters results ("all", "success", "error"/"errors")
   * @returns {Array<object>} - An array of standardized objects for export
   */
  DataTransformer.prototype.processBatchWBSResults = function (batchData, exportType = "all") {
    try {
      if (!batchData) {
        console.warn("processBatchWBSResults: No batch data provided.");
        return [];
      }

      // Prioritize using successRecords and errorRecords directly from batchData or batchData.responseData
      const successRecordsRaw = batchData.successRecords || batchData.responseData?.successRecords || [];
      const errorRecordsRaw = batchData.errorRecords || batchData.responseData?.errorRecords || [];

      let successRecordsArray = successRecordsRaw;
      let errorRecordsArray = errorRecordsRaw;

      if (!Array.isArray(successRecordsArray)) {
        console.warn("processBatchWBSResults: successRecords is not an array.", successRecordsRaw);
        successRecordsArray = [];
      }
      if (!Array.isArray(errorRecordsArray)) {
        console.warn("processBatchWBSResults: errorRecords is not an array.", errorRecordsRaw);
        errorRecordsArray = [];
      }

      console.debug(`processBatchWBSResults: Found ${successRecordsArray.length} raw success records, ${errorRecordsArray.length} raw error records.`);

      let combinedRecords = [];

      // Process success records if requested
      if (exportType === "all" || exportType === "success") {
        combinedRecords = combinedRecords.concat(
          successRecordsArray.map(record => this._transformWBSRecord(record, true))
        );
      }

      // Process error records if requested
      if (exportType === "all" || exportType === "error" || exportType === "errors") {
        combinedRecords = combinedRecords.concat(
          errorRecordsArray.map(record => this._transformWBSRecord(record, false))
        );
      }

      if (combinedRecords.length === 0) {
        console.warn(`processBatchWBSResults: No records found matching type '${exportType}'.`);
        // Return a specific structure indicating no records found
        return [{ Status: "No Records", Message: `No records found matching type '${exportType}'.` }];
      }

      // Reorder columns if needed
      const reorderedRecords = this._reorderColumns(combinedRecords);
      console.debug(`processBatchWBSResults: Processed ${reorderedRecords.length} records.`);
      return reorderedRecords;

    } catch (error) {
      console.error("Error processing batch WBS results:", error);
      // Return a structured error message for export
      return [{ Status: "Processing Error", ErrorMessage: "Internal error processing batch results: " + error.message, ErrorDetails: error.stack }];
    }
  };

  /**
   * Helper to transform WBS Element records from the success/error arrays
   * @param {object} record - The raw record from successRecords or errorRecords
   * @param {boolean} isSuccessRecord - Flag indicating if this is from successRecords
   * @returns {object} - Transformed record object for export
   * @private
   */
  DataTransformer.prototype._transformWBSRecord = function (record, isSuccessRecord) {
    // If you already have a complete record, just ensure consistent status and error/success messaging
    const exportRecord = { ...record };

    // Remove internal/system-specific fields
    const fieldsToRemove = [
      '_rawResponse',
      '_originalIndex',
      '_processingError'
    ];
    fieldsToRemove.forEach(key => delete exportRecord[key]);

    // Ensure consistent status field
    exportRecord.Status = isSuccessRecord ? "Success" : "Error";

    // For success records, add a success message if not already present
    if (isSuccessRecord && !exportRecord.SuccessMessage) {
      exportRecord.SuccessMessage = this._generateWBSSuccessMessage(exportRecord);
    }

    // For error records, ensure error details are meaningful
    if (!isSuccessRecord) {
      exportRecord.ErrorMessage = exportRecord.ErrorMessage || "Processing failed";
      exportRecord.ErrorCode = exportRecord.ErrorCode || "UNKNOWN_ERROR";
    }

    return exportRecord;
  };

  /**
   * Generate success message for WBS Element creation
   * @param {Object} record - The success record
   * @returns {String} Generated success message
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
   * Reorders properties (columns) of objects in an array based on a desired sequence.
   * @param {Array<object>} records - Array of record objects.
   * @returns {Array<object>} Array of records with properties reordered.
   * @private
   */
  DataTransformer.prototype._reorderColumns = function (records) {
    if (!records || !Array.isArray(records) || records.length === 0) {
      return records;
    }

    // Set desired order for WBS Elements (aligned with SAP field naming)
    const desiredOrder = [
      // Status information
      "Status",
      "SuccessMessage",
      "ErrorMessage",
      "ErrorCode",

      // Core WBS Element fields
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

      // Extension fields (YY1_*)
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
      "YY1_UDF1_PTD",
      "YY1_Postalcode_PTD",
      "YY1_UDF2_PTD",
      "YY1_ERPRelocationRefer_PTD"
    ];

    const reorderedRecords = records.map(record => {
      const reorderedRecord = {};

      // Add columns in the desired order if they exist in the record
      desiredOrder.forEach(key => {
        if (record.hasOwnProperty(key)) {
          reorderedRecord[key] = record[key];
        }
      });

      // Add any remaining keys from the record that weren't in the desired order
      Object.keys(record).forEach(key => {
        if (!reorderedRecord.hasOwnProperty(key)) {
          reorderedRecord[key] = record[key];
        }
      });

      return reorderedRecord;
    });

    return reorderedRecords;
  };

  // Return the DataTransformer constructor
  return DataTransformer;
});