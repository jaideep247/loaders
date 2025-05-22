sap.ui.define(["sap/ui/core/format/DateFormat"], function (DateFormat) {
  "use strict";

  /**
   * DataTransformer
   * Centralized utility for handling data transformation, formatting, and parsing for Service Entry Sheets.
   * Updated to include Service and QuantityUnit fields
   */
  return class DataTransformer {
    constructor() {
      // --- Date Formatters ---
      this._oDataDateFormatter = DateFormat.getDateTimeInstance({ pattern: "yyyy-MM-dd'T00:00:00'", UTC: false });
      this._displayDateFormatter = DateFormat.getDateInstance({ pattern: "yyyy-MM-dd", strictParsing: false });
      this._displayDateTimeFormatter = DateFormat.getDateTimeInstance({ pattern: "yyyy-MM-dd HH:mm:ss", strictParsing: false });
      console.log("DataTransformer initialized with Service and QuantityUnit support.");
    }

    // ====================================================================
    // OData Payload Creation / Transformation
    // ====================================================================

    /**
     * Creates payload structure(s) for creating Service Entry Sheets via OData deep insert.
     * One SES payload per unique Purchase Order + Posting Date combination found in the input data.
     * @param {Array<object>} itemsData - Array of service entry item data objects (standardized keys expected).
     * @returns {Array<object>} Array of service entry sheet OData payload objects. Returns empty array on error/no data.
     */
    createServiceEntrySheetPayloads(itemsData) {
      if (!Array.isArray(itemsData) || itemsData.length === 0) {
        console.warn("createServiceEntrySheetPayloads: Input data is not an array or is empty.");
        return []; // Return empty array
      }

      // Group by PO + PostingDate instead of just PO
      const poPostingDateGroups = this.groupByPurchaseOrderAndPostingDate(itemsData);
      const serviceEntrySheetPayloads = []; // Initialize as array

      Object.keys(poPostingDateGroups).forEach(groupKey => {
        if (!groupKey || groupKey === "UNKNOWN_PO_DATE") {
          console.warn("Skipping items with missing or unknown Purchase Order/Posting Date:", poPostingDateGroups[groupKey]);
          return; // Skip this group
        }

        const poItems = poPostingDateGroups[groupKey];
        if (!poItems || poItems.length === 0) return; // Skip if group is empty

        // Extract PO number and PostingDate from the group key
        const [poNumber, postingDateStr] = groupKey.split('::');

        if (!poNumber) {
          console.warn(`Invalid group key format: ${groupKey}`);
          return;
        }

        const firstItem = poItems[0]; // Use first item for header defaults

        // Process all items in this PO+PostingDate group as separate items in a single SES
        const transformedItems = poItems.map((item, index) => {
          // Use sequential numbers for SES items if not already provided
          if (!item.ServiceEntrySheetItem) {
            item.ServiceEntrySheetItem = String((index + 1) * 10); // Use 10, 20, 30, etc. as item numbers
          }
          return this.transformServiceItemToODataFormat(item, index + 1);
        });

        const serviceEntrySheet = {
          PurchasingOrganization: String(firstItem.PurchasingOrganization || ""),
          PurchasingGroup: String(firstItem.PurchasingGroup || ""),
          Currency: String(firstItem.Currency || "INR"), // Default currency if needed
          PurchaseOrder: String(poNumber),
          ServiceEntrySheetName: String(firstItem.ServiceEntrySheetName || `SES for PO ${poNumber}`),
          Supplier: String(firstItem.Supplier || ""),
          PostingDate: this.formatDateForOData(postingDateStr || firstItem.PostingDate),
          to_ServiceEntrySheetItem: {
            results: transformedItems
          }
        };
        console.log(`Created payload for PO ${poNumber} with posting date ${postingDateStr} containing ${transformedItems.length} items.`);
        serviceEntrySheetPayloads.push(serviceEntrySheet);
      });

      return serviceEntrySheetPayloads;
    }

    /**
     * Transform a single service entry sheet item to the OData format needed for deep insert.
     * Updated to include Service and QuantityUnit fields
     * @param {Object} item - The input service entry sheet item data.
     * @param {number} itemNumber - The sequential item number (e.g., 1, 2, 3...).
     * @returns {Object} Transformed item object for the OData payload.
     * @private
     */
    transformServiceItemToODataFormat(item, itemNumber) {
      // Create the base service item object
      const serviceItem = {
        ServiceEntrySheetItem: String(item.ServiceEntrySheetItem),
        AccountAssignmentCategory: String(item.AccountAssignmentCategory || ""),
        ConfirmedQuantity: this.formatNumberForAPI(item.ConfirmedQuantity, 3) || "1.000",
        Plant: String(item.Plant || ""),
        NetAmount: this.formatNumberForAPI(item.NetAmount, 3) || "0.000", // Ensure correct scale (e.g., 3)
        NetPriceAmount: this.formatNumberForAPI(item.NetPriceAmount, 3) || "0.000", // Ensure correct scale (e.g., 3)
        PurchaseOrder: String(item.PurchaseOrder || ""),
        PurchaseOrderItem: String(item.PurchaseOrderItem || ""),
        ServicePerformanceDate: this.formatDateForOData(item.ServicePerformanceDate),
        ServicePerformanceEndDate: this.formatDateForOData(item.ServicePerformanceEndDate)
      };

      // Add Service field if it has a value (optional field)
      if (item.Service && typeof item.Service === "string" && item.Service.trim() !== "") {
        serviceItem.Service = String(item.Service.trim());
      }

      // Add QuantityUnit field if it has a value (optional field)
      if (item.QuantityUnit && typeof item.QuantityUnit === "string" && item.QuantityUnit.trim() !== "") {
        serviceItem.QuantityUnit = String(item.QuantityUnit.trim());
      }

      // Check if any account assignment field has a value
      const hasAccountAssignment = item.AccountAssignment || item.CostCenter || item.GLAccount || item.WBSElement;

      // Only add the to_AccountAssignment if any of the fields has a value
      if (hasAccountAssignment) {
        serviceItem.to_AccountAssignment = {
          results: [
            {
              ServiceEntrySheetItem: String(item.ServiceEntrySheetItem),
              AccountAssignment: String(item.AccountAssignment || "1"), // Default to '1' if missing
              CostCenter: String(item.CostCenter || ""),
              GLAccount: String(item.GLAccount || ""),
              WBSElement: String(item.WBSElement || "")
              // Add other account assignment fields if needed
            }
          ]
        };
      }

      return serviceItem;
    }

    // ====================================================================
    // Data Parsing and Formatting Utilities
    // ====================================================================

    /**
     * Parses various date inputs into a standard YYYY-MM-DD string format.
     * @param {*} dateValue - The date value to parse.
     * @returns {string|null} Formatted date string (YYYY-MM-DD) or null if invalid.
     */
    parseDate(dateValue) {
      if (!dateValue && dateValue !== 0) return null;
      try {
        if (dateValue instanceof Date) { return !isNaN(dateValue.getTime()) ? this._displayDateFormatter.format(dateValue) : null; }
        if (typeof dateValue === 'string') {
          if (dateValue.startsWith('/Date(')) { const ts = parseInt(dateValue.substring(6)); if (!isNaN(ts)) { const d = new Date(ts); return !isNaN(d.getTime()) ? this._displayDateFormatter.format(d) : null; } }
          if (dateValue.includes('T') && dateValue.includes('-')) { const d = new Date(dateValue); return !isNaN(d.getTime()) ? this._displayDateFormatter.format(d) : null; }
          if (/^\d{4}-\d{2}-\d{2}$/.test(dateValue)) { const d = new Date(dateValue + 'T00:00:00'); return !isNaN(d.getTime()) ? dateValue : null; }
          const parsedTs = Date.parse(dateValue); if (!isNaN(parsedTs)) { return this._displayDateFormatter.format(new Date(parsedTs)); }
        }
        if (typeof dateValue === 'number' || (typeof dateValue === 'string' && /^\d+$/.test(dateValue))) { const num = Number(dateValue); if (num > 25569 && num < 2958466) { const excelTs = (num - 25569) * 86400 * 1000; const excelD = new Date(excelTs); if (!isNaN(excelD.getTime())) { return this._displayDateFormatter.format(excelD); } } }
        const genericD = new Date(dateValue); if (!isNaN(genericD.getTime())) { console.warn("parseDate: Used generic new Date() parsing for:", dateValue); return this._displayDateFormatter.format(genericD); }
        console.warn("parseDate: Could not parse date input:", dateValue); return null;
      } catch (e) { console.error("Error during date parsing:", dateValue, e); return null; }
    }

    /**
     * Format a date specifically for OData V2 payload requirements.
     * @param {*} dateValue - Date input (string, Date object, Excel number, etc.)
     * @returns {string|null} Formatted date string for OData or null if invalid.
     */
    formatDateForOData(dateValue) {
      const parsedDate = this.parseDate(dateValue);
      if (!parsedDate) return null;
      try { const dateObj = new Date(parsedDate + "T00:00:00"); return isNaN(dateObj.getTime()) ? null : this._oDataDateFormatter.format(dateObj); }
      catch (e) { console.error("Error formatting date for OData:", dateValue, e); return null; }
    }

    /**
     * Parses OData date formats into a standard YYYY-MM-DD string.
     * @param {string} oDataDate - OData date string.
     * @returns {string|null} Formatted date in YYYY-MM-DD format, or null if invalid.
     */
    parseODataDate(oDataDate) {
      return this.parseDate(oDataDate);
    }

    /**
     * Converts a date to the legacy OData V2 /Date(timestamp)/ format.
     * @param {Date|string} date - The date to convert.
     * @returns {string|null} Date in "/Date(timestamp)/" format, or null if invalid.
     */
    toLegacySAPDateFormat(date) {
      if (!date) return null;
      try { let d = (date instanceof Date) ? date : new Date(date); return isNaN(d.getTime()) ? null : `/Date(${d.getTime()})/`; }
      catch (e) { console.error("Error converting to legacy SAP date format:", e); return null; }
    }

    /**
     * Formats a numeric value for OData API calls (as string).
     * @param {string|number} value - The numeric value to format.
     * @param {number} [decimalPlaces=3] - The number of decimal places required (defaulting to 3 for quantities/amounts).
     * @returns {string|null} Formatted number string, or "0.000" if input is invalid/empty.
     */
    formatNumberForAPI(value, decimalPlaces = 3) { // Default to 3 based on metadata examples
      const defaultValue = (0).toFixed(decimalPlaces);
      if (value === undefined || value === null || value === '') { return defaultValue; }
      let numericString = String(value).replace(/,/g, ''); // Handle thousand separators
      let numValue = parseFloat(numericString);
      if (isNaN(numValue)) { console.warn(`formatNumberForAPI: Could not parse '${value}' as a number.`); return defaultValue; }
      return numValue.toFixed(decimalPlaces);
    }

    // ====================================================================
    // Data Grouping and Mapping Utilities
    // ====================================================================

    /**
     * Groups an array of objects by the value of a specified field.
     * @param {Array<object>} data - The array of objects to group.
     * @param {string} groupField - The name of the property to group by.
     * @param {string} [unknownKey="UNKNOWN"] - Key to use if the groupField is missing or empty.
     * @returns {Object} An object where keys are the unique values of the groupField.
     */
    groupDataByField(data, groupField, unknownKey = "UNKNOWN") {
      if (!Array.isArray(data)) return {};
      const groups = {};
      data.forEach(item => { const groupValue = item?.[groupField] ? item[groupField] : unknownKey; if (!groups[groupValue]) { groups[groupValue] = []; } groups[groupValue].push(item); });
      return groups;
    }

    /**
     * Groups items by Purchase Order number.
     * @param {Array<object>} items - Array of item data objects.
     * @returns {Object} Object grouped by Purchase Order.
     */
    groupByPurchaseOrder(items) {
      return this.groupDataByField(items, 'PurchaseOrder', 'UNKNOWN_PO');
    }

    /**
     * Groups items by Purchase Order number AND Posting Date.
     * Creates groups where each unique PO+PostingDate combination is a separate group.
     * @param {Array<object>} items - Array of item data objects.
     * @returns {Object} Object grouped by PO and Posting Date.
     */
    groupByPurchaseOrderAndPostingDate(items) {
      if (!Array.isArray(items)) {
        console.error("groupByPurchaseOrderAndPostingDate: Input is not an array:", items);
        return {};
      }

      const groups = {};

      items.forEach(item => {
        // Extract PO and PostingDate
        const poNumber = item.PurchaseOrder || "UNKNOWN_PO";
        let postingDate = null;

        // Parse posting date to standardized format
        if (item.PostingDate) {
          postingDate = this.parseDate(item.PostingDate);
        }

        // Create a composite key for the PO+PostingDate combination
        const groupKey = postingDate ? `${poNumber}::${postingDate}` : `${poNumber}::UNKNOWN_DATE`;

        // Initialize the group if it doesn't exist
        if (!groups[groupKey]) {
          groups[groupKey] = [];
        }

        // Add the item to the appropriate group
        groups[groupKey].push(item);
      });

      console.log(`Grouped ${items.length} items into ${Object.keys(groups).length} PO+PostingDate combinations.`);
      return groups;
    }

    /**
     * Maps input object keys (from Excel headers) to standardized internal property names.
     * Updated to include Service and QuantityUnit field mappings
     * @param {Object} rowData - The raw input object for a single row.
     * @returns {Object} An object with standardized keys. Returns empty object if input is invalid or has no data.
     */
    mapColumnNames(rowData) {
      const mapping = {
        'sequencenumber': 'SequenceNumber', 'sequence_number': 'SequenceNumber', 'seqnumber': 'SequenceNumber', 'seq': 'SequenceNumber', 'sl': 'SequenceNumber', 'sl no': 'SequenceNumber', 'slno': 'SequenceNumber',
        'supplier': 'Supplier', 'supplier number': 'Supplier', 'supplier_number': 'Supplier', 'vendor': 'Supplier', 'vendor number': 'Supplier',
        'purchasing organization': 'PurchasingOrganization', 'purchasingorganization': 'PurchasingOrganization', 'purchasing_organization': 'PurchasingOrganization', 'purch org': 'PurchasingOrganization', 'purg org': 'PurchasingOrganization',
        'purchasing group': 'PurchasingGroup', 'purchasinggroup': 'PurchasingGroup', 'purchasing_group': 'PurchasingGroup', 'purch group': 'PurchasingGroup', 'purg group': 'PurchasingGroup',
        'currency': 'Currency', 'currency code': 'Currency', 'currencycode': 'Currency', 'currency_code': 'Currency',
        'service entry sheet name': 'ServiceEntrySheetName', 'serviceentrysheetname': 'ServiceEntrySheetName', 'service_entry_sheet_name': 'ServiceEntrySheetName', 'ses name': 'ServiceEntrySheetName', 'ses description': 'ServiceEntrySheetName',
        'posting date': 'PostingDate', 'postingdate': 'PostingDate', 'posting_date': 'PostingDate', 'post date': 'PostingDate',
        'service entry sheet item': 'ServiceEntrySheetItem', 'serviceentrysheetitem': 'ServiceEntrySheetItem', 'service_entry_sheet_item': 'ServiceEntrySheetItem', 'ses item': 'ServiceEntrySheetItem', 'item no': 'ServiceEntrySheetItem', 'item': 'ServiceEntrySheetItem',
        'account assignment category': 'AccountAssignmentCategory', 'accountassignmentcategory': 'AccountAssignmentCategory', 'account_assignment_category': 'AccountAssignmentCategory', 'acc assignment cat': 'AccountAssignmentCategory', 'acct ass cat': 'AccountAssignmentCategory', 'aac': 'AccountAssignmentCategory',
        'service': 'Service', 'service number': 'Service', 'service_number': 'Service', 'activity number': 'Service', 'activity': 'Service', 'product': 'Service', 'product number': 'Service',
        'confirmed quantity': 'ConfirmedQuantity', 'confirmedquantity': 'ConfirmedQuantity', 'confirmed_quantity': 'ConfirmedQuantity', 'quantity': 'ConfirmedQuantity', 'qty': 'ConfirmedQuantity',
        'unit': 'QuantityUnit', 'unit of measure': 'QuantityUnit', 'uom': 'QuantityUnit', 'quantityunit': 'QuantityUnit', 'quantity unit': 'QuantityUnit', 'measure': 'QuantityUnit',
        'plant': 'Plant', 'plantid': 'Plant', 'plant id': 'Plant', 'plant code': 'Plant',
        'net amount': 'NetAmount', 'netamount': 'NetAmount', 'net_amount': 'NetAmount', 'amount': 'NetAmount',
        'net price amount': 'NetPriceAmount', 'netpriceamount': 'NetPriceAmount', 'net_price_amount': 'NetPriceAmount', 'price amount': 'NetPriceAmount', 'price': 'NetPriceAmount',
        'purchase order': 'PurchaseOrder', 'purchaseorder': 'PurchaseOrder', 'purchase_order': 'PurchaseOrder', 'po': 'PurchaseOrder', 'po number': 'PurchaseOrder',
        'purchase order item': 'PurchaseOrderItem', 'purchaseorderitem': 'PurchaseOrderItem', 'purchase_order_item': 'PurchaseOrderItem', 'po_item': 'PurchaseOrderItem', 'po item': 'PurchaseOrderItem',
        'service performance date': 'ServicePerformanceDate', 'serviceperformancedate': 'ServicePerformanceDate', 'service_performance_date': 'ServicePerformanceDate', 'service start date': 'ServicePerformanceDate', 'start date': 'ServicePerformanceDate', 'performance date': 'ServicePerformanceDate',
        'service performance end date': 'ServicePerformanceEndDate', 'serviceperformanceenddate': 'ServicePerformanceEndDate', 'service_performance_end_date': 'ServicePerformanceEndDate', 'service end date': 'ServicePerformanceEndDate', 'end date': 'ServicePerformanceEndDate', 'performance end date': 'ServicePerformanceEndDate',
        'short text': 'ServiceEntrySheetItemDesc', 'description': 'ServiceEntrySheetItemDesc', 'serviceentrysheetitemdesc': 'ServiceEntrySheetItemDesc',
        'account assignment': 'AccountAssignment', 'accountassignment': 'AccountAssignment',
        'cost center': 'CostCenter', 'costcenter': 'CostCenter', 'cost_center': 'CostCenter', 'costctr': 'CostCenter',
        'gl account': 'GLAccount', 'glaccount': 'GLAccount', 'gl_account': 'GLAccount', 'g/l account': 'GLAccount',
        'wbs element': 'WBSElement', 'wbselement': 'WBSElement', 'wbs_element': 'WBSElement', 'wbs': 'WBSElement',
        'grn creation': 'GRNCreate' // Added mapping for GRN indicator
      };
      const result = {};
      let hasData = false;
      if (!rowData || typeof rowData !== 'object') return {};
      Object.keys(rowData).forEach(key => {
        const originalValue = rowData[key];
        const lookupKey = key.trim().toLowerCase();
        const standardKey = mapping[lookupKey];
        if (standardKey) {
          result[standardKey] = originalValue;
          // Check if the value is meaningful (not null, undefined, or just whitespace)
          if (originalValue !== null && originalValue !== undefined && String(originalValue).trim() !== "") hasData = true;
        } else if (!key.startsWith('__') && key !== 'EMPTY') { // Keep unmapped fields unless internal/placeholder
          result[key] = originalValue;
          if (originalValue !== null && originalValue !== undefined && String(originalValue).trim() !== "") hasData = true;
        }
      });
      // Return only if some meaningful data was found after mapping
      return hasData ? result : {};
    }

    // ====================================================================
    // Batch Results Processing for Export
    // ====================================================================

    /**
     * Process diverse batch results structures into a unified format for export.
     * @param {Object} batchData - The raw batch data object (expected to contain results from BatchProcessingManager).
     * @param {string} [exportType="all"] - Filters results ("all", "success", "error"/"errors").
     * @returns {Array<object>} - An array of standardized objects for export.
     */
    processBatchResults(batchData, exportType = "all") {
      try {
        if (!batchData) {
          console.warn("processBatchResults: No batch data provided.");
          return [];
        }

        // Prioritize using successRecords and errorRecords directly from batchData or batchData.responseData
        const successRecordsRaw = batchData.successRecords || batchData.responseData?.successRecords || [];
        const errorRecordsRaw = batchData.errorRecords || batchData.responseData?.errorRecords || [];

        let successRecordsArray = successRecordsRaw;
        let errorRecordsArray = errorRecordsRaw;

        if (!Array.isArray(successRecordsArray)) {
          console.warn("processBatchResults: successRecords is not an array.", successRecordsRaw);
          successRecordsArray = [];
        }
        if (!Array.isArray(errorRecordsArray)) {
          console.warn("processBatchResults: errorRecords is not an array.", errorRecordsRaw);
          errorRecordsArray = [];
        }

        console.debug(`processBatchResults: Found ${successRecordsArray.length} raw success records, ${errorRecordsArray.length} raw error records.`);

        let combinedRecords = [];

        // Process success records if requested
        if (exportType === "all" || exportType === "success") {
          combinedRecords = combinedRecords.concat(
            successRecordsArray.map(record => this._transformFallbackRecord(record, true))
          );
        }

        // Process error records if requested
        if (exportType === "all" || exportType === "error" || exportType === "errors") {
          combinedRecords = combinedRecords.concat(
            errorRecordsArray.map(record => this._transformFallbackRecord(record, false))
          );
        }

        if (combinedRecords.length === 0) {
          console.warn(`processBatchResults: No records found matching type '${exportType}'.`);
          // Return a specific structure indicating no records found
          return [{ Status: "No Records", Message: `No records found matching type '${exportType}'.` }];
        }

        // Reorder columns before returning
        const reorderedRecords = this._reorderColumns(combinedRecords);
        console.debug(`processBatchResults: Processed ${reorderedRecords.length} records.`);
        return reorderedRecords;

      } catch (error) {
        console.error("Error processing batch results:", error);
        // Return a structured error message for export
        return [{ Status: "Processing Error", ErrorMessage: "Internal error processing batch results: " + error.message, ErrorDetails: error.stack }];
      }
    }

    /**
     * Helper to transform records from the fallback success/error arrays.
     * @param {object} record - The raw record from successRecords or errorRecords.
     * @param {boolean} isSuccessRecord - Flag indicating if this is from successRecords.
     * @returns {object} - Transformed record object for export.
     * @private
     */
    _transformFallbackRecord(record, isSuccessRecord) {
      // If you already have a complete record, just ensure consistent status and error/success messaging
      const exportRecord = { ...record };

      // Remove internal/system-specific fields
      const fieldsToRemove = [
        '_sheetName',
        '_originalData',
        '_originalIndex',
        'ValidationErrors',
        'Message',
        'statusMessage'
      ];
      fieldsToRemove.forEach(key => delete exportRecord[key]);

      // Ensure consistent status field
      exportRecord.Status = isSuccessRecord ? "Success" : "Error";

      // For success records, add a success message if not already present
      if (isSuccessRecord && !exportRecord.SuccessMessage) {
        exportRecord.SuccessMessage = this._generateSuccessMessage(exportRecord);
      }

      // For error records, ensure error details are meaningful
      if (!isSuccessRecord) {
        exportRecord.ErrorMessage = exportRecord.ErrorMessage || "Processing failed";
        exportRecord.ErrorCode = exportRecord.ErrorCode || "UNKNOWN_ERROR";
      }

      return exportRecord;
    }

    // Optional helper method to generate success message
    _generateSuccessMessage(record) {
      if (record.ServiceEntrySheet && record.ServiceEntrySheetItem) {
        return `Service Entry Sheet ${record.ServiceEntrySheet} / Item ${record.ServiceEntrySheetItem} created successfully.`;
      }
      if (record.ServiceEntrySheet) {
        return `Service Entry Sheet ${record.ServiceEntrySheet} created successfully.`;
      }
      return "Processed successfully.";
    }

    // ====================================================================
    // Column Reordering and Formatting Helpers
    // ====================================================================

    /**
     * Formats a JS Date object into a displayable Date+Time string.
     * @param {Date} date - The date object to format.
     * @returns {string} Formatted date-time string.
     * @private
     */
    _formatDateTime(date) {
      if (!date || !(date instanceof Date) || isNaN(date.getTime())) return "";
      try { return this._displayDateTimeFormatter.format(date); }
      catch (e) { console.error("Error formatting date/time:", e); try { return date.toISOString(); } catch (isoE) { return "Invalid Date"; } }
    }

    /**
     * Reorders properties (columns) of objects in an array based on a desired sequence.
     * Updated to include Service and QuantityUnit in the desired order
     * @param {Array<object>} records - Array of record objects.
     * @returns {Array<object>} Array of records with properties reordered.
     * @private
     */
    _reorderColumns(records) {
      if (!records || !Array.isArray(records) || records.length === 0) {
        return records;
      }

      // Set desired order as requested by business requirements - updated to include new fields
      const desiredOrder = [
        // Identification and sequence
        "SequenceNumber",
        "ServiceEntrySheet",
        // Status Fields
        "Status",
        "SuccessMessage",
        // Error information
        "ErrorMessage",
        "ErrorCode",
        // Approval Fields
        "IsGRNCreated",
        "ApprovalStatus",
        "StatusMessage",
        "ApprovalError",

        // Business data
        "ServiceEntrySheetName",
        "ServiceEntrySheetItem",
        "Supplier",
        "PostingDate",
        "Plant",
        "AccountAssignmentCategory",
        
        // Service and Quantity fields (new)
        "Service",
        "QuantityUnit",
        
        "ConfirmedQuantity",
        "NetAmount",
        "NetPriceAmount",
        "Currency",
        "ServicePerformanceDate",
        "ServicePerformanceEndDate",

        // Organizational data
        "PurchasingOrganization",
        "PurchasingGroup",
        "PurchaseOrder",
        "PurchaseOrderItem",
        // Account assignment data
        "CostCenter",
        "GLAccount",
        "WBSElement",
        "AccountAssignment",

        // GRN-related fields
        "GRNCreate"
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
        // This ensures custom fields or unexpected fields are still included at the end
        Object.keys(record).forEach(key => {
          if (!reorderedRecord.hasOwnProperty(key)) {
            reorderedRecord[key] = record[key];
          }
        });

        return reorderedRecord;
      });

      return reorderedRecords;
    }
  }; // End class DataTransformer
}); // End sap.ui.define