sap.ui.define(["sap/ui/core/format/DateFormat"], function (DateFormat) {
  "use strict";

  /**
   * DataTransformer
   * Centralized utility for handling data transformation, formatting, and parsing
   */
  return class DataTransformer {
    constructor() {
      // Date formatters for various formats
      this._dateTimeFormatter = DateFormat.getDateTimeInstance({
        pattern: "yyyy-MM-dd'T'HH:mm:ss'Z'"
      });

      this._dateFormatter = DateFormat.getDateInstance({
        pattern: "yyyy-MM-dd"
      });

      this._sapDateTimeFormatter = DateFormat.getDateTimeInstance({
        pattern: "/Date(dddddddddd)/"
      });
    }
    /**
     * Transform data to OData format
     * @param {Array|Object} data - Array of service entries or single entry
     * @returns {Object} Transformed data in OData format
     */
    transformToODataFormat(data) {
      if (!Array.isArray(data)) {
        data = [data];
      }

      // Take header information from the first item if available
      const firstItem = data[0] || {};

      // Format dates for OData with proper ISO 8601 format
      const documentDate = this.formatDateForOData(firstItem.DocumentDate);
      const postingDate = this.formatDateForOData(firstItem.PostingDate);

      // Create the properly structured object for Material Documents
      return {
        DocumentDate: documentDate,
        PostingDate: postingDate,
        MaterialDocumentHeaderText: firstItem.MaterialDocumentHeaderText || "Loader",
        ReferenceDocument: firstItem.ReferenceDocument || "",
        GoodsMovementCode: firstItem.GoodsMovementCode || "01",
        to_MaterialDocumentItem: {
          results: data.map((entry) => this.transformItemToODataFormat(entry))
        }
      };
    }

    /**
     * Transform a single material document item to OData format
     * @param {Object} entry - Material document item
     * @returns {Object} Transformed item in OData format
     */
    transformItemToODataFormat(entry) {
      return {
        Material: String(entry.Material || ""),
        Plant: String(entry.Plant || ""),
        StorageLocation: String(entry.StorageLocation || ""),
        GoodsMovementType: String(entry.GoodsMovementType || ""),
        PurchaseOrder: String(entry.PurchaseOrder || ""),
        PurchaseOrderItem: String(entry.PurchaseOrderItem || ""),
        GoodsMovementRefDocType: String(entry.GoodsMovementRefDocType || ""),
        QuantityInEntryUnit: String(entry.QuantityInEntryUnit || "0"),
        MaterialDocumentItemText: String(entry.MaterialDocumentItemText || entry.MaterialDocumentHeaderText || "")
      };
    }

    /**
     * Parse and format a date from any input format to the standardized YYYY-MM-DD format
     * @param {any} dateValue - Date input (string, Date object, etc.)
     * @returns {string|null} Formatted date string or null if invalid
     */
    parseDate(dateValue) {
      if (!dateValue) return null;

      try {
        // If it's already a string in YYYY-MM-DD format, return it
        if (typeof dateValue === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(dateValue)) {
          return dateValue;
        }

        // Handle Excel date number format (days since 1900-01-01)
        if (typeof dateValue === 'number' || (typeof dateValue === 'string' && !isNaN(dateValue))) {
          // Check if it's likely an Excel date number (reasonable range check)
          const numValue = Number(dateValue);
          if (numValue > 1000 && numValue < 100000) { // Excel date range check
            // Excel date to JS date
            const jsDate = new Date(Date.UTC(0, 0, numValue - 1));
            if (!isNaN(jsDate.getTime())) {
              return this._dateFormatter.format(jsDate);
            }
          }
        }

        // Handle common date formats like MM/DD/YYYY
        if (typeof dateValue === 'string') {
          // Try parsing MM/DD/YYYY or DD/MM/YYYY format
          const dateParts = dateValue.split(/[-/\\]/);
          if (dateParts.length === 3) {
            // Try both MM/DD/YYYY and DD/MM/YYYY format by creating both and checking validity
            const date1 = new Date(`${dateParts[2]}-${dateParts[0]}-${dateParts[1]}`);
            const date2 = new Date(`${dateParts[2]}-${dateParts[1]}-${dateParts[0]}`);

            if (!isNaN(date1.getTime())) {
              return this._dateFormatter.format(date1);
            }
            if (!isNaN(date2.getTime())) {
              return this._dateFormatter.format(date2);
            }
          }
        }

        // If it's a Date object, format it
        if (dateValue instanceof Date) {
          if (!isNaN(dateValue.getTime())) {
            return this._dateFormatter.format(dateValue);
          }
          return null;
        }

        // Try to parse as generic date string
        const date = new Date(dateValue);
        if (!isNaN(date.getTime())) {
          return this._dateFormatter.format(date);
        }

        return null;
      } catch (e) {
        console.error("Error parsing date:", e);
        return null;
      }
    }
    /**
      * Process diverse batch results structures into a unified format for export.
      * @param {Object} batchData - The raw batch data object.
      * @param {string} [exportType="all"] - Filters results ("all", "success", "error"/"errors").
      * @returns {Array<object>} - An array of standardized objects for export.
      */
    processBatchResults(batchData, exportType = "all") {
      try {
        if (!batchData) {
          console.warn("processBatchResults: No batch data provided.");
          return [];
        }

        // --- Strategy 1: Look for a standardized 'allMessages' array ---
        let allMessages = null;
        const messageSources = [
          batchData.allMessages,
          batchData._responseData?.allMessages,
          batchData.responseData?.allMessages,
          typeof batchData.getResponseData === "function" ? batchData.getResponseData()?.allMessages : undefined,
          batchData.messages // Least specific, might be other kinds of messages
        ];

        for (const source of messageSources) {
          if (source && Array.isArray(source) && source.length > 0) {
            // Basic validation: check if items look like message objects
            if (source[0] && typeof source[0].type === 'string' && typeof source[0].message === 'string') {
              allMessages = source;
              console.debug("processBatchResults: Found standardized messages in source, count:", allMessages.length);
              break; // Use the first valid source found
            }
          }
        }

        if (allMessages) {
          const filteredMessages = allMessages.filter(msg => {
            const msgTypeLower = (msg.type || "").toLowerCase();
            if (exportType === "all") return true;
            if (exportType === "success") return msgTypeLower === "success" || msgTypeLower === "information" || msgTypeLower === "warning"; // Include Info/Warning in success
            if (exportType === "error" || exportType === "errors") return msgTypeLower === "error";
            return true; // Default to all if type is unknown
          });

          console.debug(`processBatchResults: Filtered ${filteredMessages.length} messages based on type '${exportType}'.`);

          return filteredMessages.map(msg => {
            const isError = (msg.type || "").toLowerCase() === 'error';
            const status = isError ? "Error" : "Success"; // Simplified status for export

            // Combine entity data with message details
            const baseRecord = msg.entity && typeof msg.entity === 'object' ? { ...msg.entity } : {};

            // Standardize status fields
            baseRecord.Status = status;

            // Format the timestamp for use in message
            let formattedTime = "";
            if (msg.timestamp) {
              try {
                const date = new Date(msg.timestamp);
                if (!isNaN(date.getTime())) {
                  formattedTime = this._formatDateTime(date);
                }
              } catch (e) {
                console.warn("Error formatting timestamp:", e);
              }
            }

            // Set a unified Message field combining success and error information
            if (isError) {
              baseRecord.Message = msg.message || "Error occurred";
            } else if (baseRecord.MaterialDocument && baseRecord.MaterialDocumentYear) {
              baseRecord.Message = `Material document ${baseRecord.MaterialDocument} created successfully${formattedTime ? ' at ' + formattedTime : ''}`;
            } else {
              baseRecord.Message = msg.message || "Processed successfully";
            }

            // Remove redundant fields that are now consolidated into Message
            delete baseRecord.MaterialDocumentMessage;
            delete baseRecord.ErrorMessage;
            delete baseRecord.SuccessMessage;
            delete baseRecord.ProcessedAt;
            delete baseRecord.index;
            delete baseRecord.MessageCode;
            delete baseRecord.ErrorCode;
            delete baseRecord.error;
            delete baseRecord.errorCode;
            delete baseRecord.details;
            return baseRecord;
          });
        }

        // --- Strategy 2: Fallback to successRecords/errorRecords arrays ---
        console.debug("processBatchResults: Standardized messages not found or empty, falling back to success/errorRecords.");
        let successRecordsRaw = batchData.successRecords || batchData.responseData?.successRecords || [];
        let errorRecordsRaw = batchData.errorRecords || batchData.responseData?.errorRecords || [];

        if (!Array.isArray(successRecordsRaw)) successRecordsRaw = [];
        if (!Array.isArray(errorRecordsRaw)) errorRecordsRaw = [];

        console.debug(`processBatchResults: Found ${successRecordsRaw.length} raw success records, ${errorRecordsRaw.length} raw error records.`);

        let processedRecords = [];

        // Process Success Records
        if (exportType === "all" || exportType === "success") {
          processedRecords = processedRecords.concat(
            successRecordsRaw.map(record => {
              const entry = record?.entry || record?.data || record || {}; // Get the core data object

              // Format timestamp
              let formattedTime = "";
              const timestamp = record?.timestamp || record?.ProcessedAt || new Date().toISOString();
              try {
                const date = new Date(timestamp);
                if (!isNaN(date.getTime())) {
                  formattedTime = this._formatDateTime(date);
                }
              } catch (e) {
                console.warn("Error formatting timestamp:", e);
              }

              // Create a new object for the record
              const result = { ...entry, Status: "Success" };

              // Add consolidated Message field
              if (entry.MaterialDocument && entry.MaterialDocumentYear) {
                result.Message = `Material document ${entry.MaterialDocument} created successfully${formattedTime ? ' at ' + formattedTime : ''}`;
              } else {
                result.Message = entry.SuccessMessage || "Processed successfully";
              }

              // Remove redundant fields
              delete result.MaterialDocumentMessage;
              delete result.ErrorMessage;
              delete result.SuccessMessage;
              delete result.ProcessedAt;
              delete result.index;
              delete result.MessageCode;
              delete result.ErrorCode;
              delete result.error;
              delete result.errorCode;
              delete result.details;
              return result;
            })
          );
        }

        // Process Error Records
        if (exportType === "all" || exportType === "error" || exportType === "errors") {
          processedRecords = processedRecords.concat(
            errorRecordsRaw.map(record => {
              const entry = record?.entry || record || {}; // Get the core data object
              let errorMessage = "Error during processing";

              // Try various common error message structures
              if (record?.message?.message) {
                errorMessage = record.message.message;
              } else if (typeof record?.error === 'string') {
                errorMessage = record.error;
              } else if (typeof record?.message === 'string') {
                errorMessage = record.message;
              } else if (record?.details?.[0]?.message) { // Check details array
                errorMessage = record.details[0].message;
              } else if (record?.ErrorMessage) { // Different casing
                errorMessage = record.ErrorMessage;
              }

              // Create a new object for the record
              const result = { ...entry, Status: "Error", Message: errorMessage };

              // Remove redundant fields 
              delete result.MaterialDocumentMessage;
              delete result.ErrorMessage;
              delete result.SuccessMessage;
              delete result.ProcessedAt;
              delete result.index;
              delete result.MessageCode;
              delete result.ErrorCode;
              delete result.error;
              delete result.errorCode;
              delete result.details;
              return result;
            })
          );
        }

        // Handle case where no records match the filter
        if (processedRecords.length === 0) {
          console.warn(`processBatchResults: No records found matching type '${exportType}' using fallback.`);
          return [{
            Status: "No Records",
            Message: `No ${exportType} records found`
          }];
        }

        // Remove empty columns before returning the processed records
        processedRecords = this._removeEmptyColumns(processedRecords);
        processedRecords = this._reorderColumns(processedRecords);
        console.debug(`processBatchResults: Processed ${processedRecords.length} records using fallback method.`);
        return processedRecords;

      } catch (error) {
        console.error("Error processing batch results:", error);
        // Return a single error record if processing fails catastrophically
        return [{
          Status: "Processing Error",
          Message: "Internal error processing batch results: " + error.message
        }];
      }
    }

    /**
     * Format date time to the required format (DD-MM-YY HH:MM:SS)
     * @param {Date} date - Date to format
     * @returns {string} Formatted date string
     * @private
     */
    _formatDateTime(date) {
      // Existing method unchanged
      if (!date || !(date instanceof Date) || isNaN(date.getTime())) return "";

      const day = String(date.getDate()).padStart(2, '0');
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const year = String(date.getFullYear()).substring(2);
      const hours = String(date.getHours()).padStart(2, '0');
      const minutes = String(date.getMinutes()).padStart(2, '0');
      const seconds = String(date.getSeconds()).padStart(2, '0');

      return `${day}-${month}-${year} ${hours}:${minutes}:${seconds}`;
    }

    /**
     * Reorder fields in each record to the desired column order
     * @param {Array} data - Data to process
     * @returns {Array} Data with columns in the desired order
     * @private
     */
    _reorderColumns(data) {
      if (!data || !Array.isArray(data) || data.length === 0) return data;

      // Define the column order (columns not in this list will appear at the end)
      // Updated to include Message field and remove separated message fields
      const columnOrder = [
        "Status",
        "SequenceNumber",
        "GRNDocumentNumber",
        "DocumentDate",
        "PostingDate",
        "MaterialDocumentHeaderText",
        "ReferenceDocument",
        "GoodsMovementCode",
        "Material",
        "Plant",
        "StorageLocation",
        "GoodsMovementType",
        "PurchaseOrder",
        "PurchaseOrderItem",
        "GoodsMovementRefDocType",
        "QuantityInEntryUnit",
        "EntryUnit",
        "MaterialDocument",
        "MaterialDocumentYear",
        "Message", // Unified message field
        "ErrorCode"
      ];

      // Create new data with the desired column order
      return data.map(item => {
        const orderedItem = {};

        // First add columns in the defined order (if they exist in the item)
        columnOrder.forEach(key => {
          if (key in item) {
            orderedItem[key] = item[key];
          }
        });

        // Then add any remaining columns that aren't in the defined order
        Object.keys(item).forEach(key => {
          if (!(key in orderedItem)) {
            orderedItem[key] = item[key];
          }
        });

        return orderedItem;
      });
    }
    /**
      * Remove empty columns from data
      * @param {Array} data - Data to process
      * @returns {Array} Data with empty columns removed
      * @private
      */
    _removeEmptyColumns(data) {
      if (!data || !Array.isArray(data) || data.length === 0) return data;

      // Get all keys used across all items
      const allKeys = new Set();
      data.forEach(item => {
        Object.keys(item).forEach(key => allKeys.add(key));
      });

      // Filter out keys that start with "__EMPTY" or are empty in all items
      const keysToRemove = [];
      allKeys.forEach(key => {
        if (key.startsWith("__EMPTY") || key === "EMPTY" || key.startsWith("_EMPTY")) {
          keysToRemove.push(key);
        } else {
          // Check if this column is empty in all items
          const isEmpty = data.every(item => !item[key] && item[key] !== 0);
          if (isEmpty) keysToRemove.push(key);
        }
      });

      // Additional columns to explicitly remove
      // Updated to include separated message fields that should be consolidated
      const columnsToRemove = [
        'ValidationErrors',
        'ProcessedAt',
        'index',
        'MessageCode',
        'message',
        'MaterialDocumentMessage', // Remove these since they're now consolidated
        'ErrorMessage',            // into the single Message field
        'SuccessMessage',
        'ErrorCode',
        'error',
        'errorCode',
        'details'
      ];

      columnsToRemove.forEach(col => {
        if (!keysToRemove.includes(col)) {
          keysToRemove.push(col);
        }
      });

      // Create new data without empty columns
      return data.map(item => {
        const newItem = {};
        Object.keys(item).forEach(key => {
          if (!keysToRemove.includes(key)) {
            newItem[key] = item[key];
          }
        });
        return newItem;
      });
    }
    /**
     * Format a date for OData services (including time component)
     * @param {any} dateValue - Date input (string, Date object, etc.)
     * @returns {string|null} Formatted date string for OData or null if invalid
     */
    formatDateForOData(dateValue) {
      const dateString = this.parseDate(dateValue);

      if (!dateString) return null;

      // Add time component for OData (midnight)
      return `${dateString}T00:00:00`;
    }

    /**
     * Parse OData date format (e.g., "/Date(1548979200000)/") to standard format
     * @param {string} oDataDate - OData date string
     * @returns {string} Formatted date in YYYY-MM-DD format
     */
    parseODataDate(oDataDate) {
      if (!oDataDate) return "";

      try {
        // Handle different OData date formats

        // Modern OData format (ISO string)
        if (typeof oDataDate === 'string' && oDataDate.includes('T')) {
          const date = new Date(oDataDate);
          if (!isNaN(date.getTime())) {
            return this._dateFormatter.format(date);
          }
        }

        // Legacy OData format (/Date(timestamp)/)
        if (typeof oDataDate === 'string' && oDataDate.startsWith('/Date(')) {
          // Extract timestamp from OData date format
          const timestamp = parseInt(
            oDataDate.replace(/^\/Date\((\d+)([+-]\d+)?\)\//, "$1"),
            10
          );

          const date = new Date(timestamp);
          if (!isNaN(date.getTime())) {
            return this._dateFormatter.format(date);
          }
        }

        // If none of the special formats match, try to parse as a regular date
        return this.parseDate(oDataDate);
      } catch (e) {
        console.error("Error parsing OData date:", e);
        return "";
      }
    }

    /**
     * Convert a regular date to SAP OData date format
     * @param {Date|string} date - Date to convert
     * @returns {string} Date in SAP OData format
     */
    toSAPDateFormat(date) {
      if (!date) return null;

      try {
        let dateObj;
        if (typeof date === 'string') {
          dateObj = new Date(date);
        } else if (date instanceof Date) {
          dateObj = date;
        } else {
          return null;
        }

        if (isNaN(dateObj.getTime())) {
          return null;
        }

        // Format as "/Date(timestamp)/"
        return `/Date(${dateObj.getTime()})/`;
      } catch (e) {
        console.error("Error converting to SAP date format:", e);
        return null;
      }
    }

    /**
     * Parse a CSV/Excel file date column to standardized format
     * @param {string} dateString - Date from CSV/Excel
     * @returns {string} Standardized date string
     */
    parseFileDate(dateString) {
      return this.parseDate(dateString);
    }

    /**
     * Format a number value for API requests
     * @param {string|number} value - Number value 
     * @returns {string} Formatted number string
     */
    formatNumberForAPI(value) {
      if (value === undefined || value === null || value === '') {
        return "0";
      }

      // Remove any non-numeric characters except decimal point
      const numericString = String(value).replace(/[^0-9.-]/g, '');

      // Parse to float and format with fixed decimal places
      const numValue = parseFloat(numericString);

      if (isNaN(numValue)) {
        return "0";
      }

      // Return the number with 3 decimal places (SAP standard)
      return numValue.toFixed(3);
    }

    /**
     * Group the Excel rows by document number
     * @param {Array} entries - Array of Excel entries
     * @param {string} groupField - Field to group by (default GRNDocumentNumber)
     * @returns {Object} Grouped entries by document number
     */
    /**
     * Group the entries by specified fields
     * @param {Array} entries - Array of entries
     * @param {Array|string} groupFields - Field(s) to group by
     * @returns {Object} Grouped entries
     */
    groupByFields(entries, groupFields) {
      // Convert single field to array for consistency
      const fields = Array.isArray(groupFields) ? groupFields : [groupFields];
      const groups = {};

      entries.forEach(entry => {
        // Create a composite key from all grouping fields
        const groupKey = fields.map(field => entry[field] || "").join('_');

        if (!groups[groupKey]) {
          groups[groupKey] = [];
        }
        groups[groupKey].push(entry);
      });

      return groups;
    }

    /**
     * Map column names to standardized property names
     * @param {Object} rowData - Raw row data with various column names
     * @returns {Object} Row with standardized property names
     */
    mapColumnNames(rowData) {
      const mapping = {
        // Common variations of column names
        'Sequence Number': 'SequenceNumber',
        'SequenceNumber': 'SequenceNumber',
        'Sequence_Number': 'SequenceNumber',
        'SeqNumber': 'SequenceNumber',
        'Seq': 'SequenceNumber',

        'GRN Document Number': 'GRNDocumentNumber',
        'GRNDocumentNumber': 'GRNDocumentNumber',
        'GRN_Document_Number': 'GRNDocumentNumber',
        'GRNNumber': 'GRNDocumentNumber',
        'GRN No': 'GRNDocumentNumber',

        'Document Date': 'DocumentDate',
        'DocumentDate': 'DocumentDate',
        'Document_Date': 'DocumentDate',
        'DocDate': 'DocumentDate',

        'Posting Date': 'PostingDate',
        'PostingDate': 'PostingDate',
        'Posting_Date': 'PostingDate',
        'Post Date': 'PostingDate',

        'Material Document Header Text': 'MaterialDocumentHeaderText',
        'MaterialDocumentHeaderText': 'MaterialDocumentHeaderText',
        'HeaderText': 'MaterialDocumentHeaderText',
        'Header Text': 'MaterialDocumentHeaderText',

        'Reference Document': 'ReferenceDocument',
        'ReferenceDocument': 'ReferenceDocument',
        'Reference_Document': 'ReferenceDocument',
        'Reference Doc': 'ReferenceDocument',
        'RefDoc': 'ReferenceDocument',

        'Goods Movement Code': 'GoodsMovementCode',
        'GoodsMovementCode': 'GoodsMovementCode',
        'GM Code': 'GoodsMovementCode',
        'Movement Code': 'GoodsMovementCode',

        'Material': 'Material',
        'MaterialNumber': 'Material',
        'Material Number': 'Material',
        'Material_Number': 'Material',
        'Mat. No.': 'Material',

        'Plant': 'Plant',
        'PlantID': 'Plant',
        'Plant ID': 'Plant',
        'Plant Code': 'Plant',

        'Storage Location': 'StorageLocation',
        'StorageLocation': 'StorageLocation',
        'Storage_Location': 'StorageLocation',
        'SLoc': 'StorageLocation',

        'Goods Movement Type': 'GoodsMovementType',
        'GoodsMovementType': 'GoodsMovementType',
        'Movement Type': 'GoodsMovementType',
        'MvmtType': 'GoodsMovementType',

        'Purchase Order': 'PurchaseOrder',
        'PurchaseOrder': 'PurchaseOrder',
        'Purchase_Order': 'PurchaseOrder',
        'PO': 'PurchaseOrder',
        'PO Number': 'PurchaseOrder',

        'Purchase Order Item': 'PurchaseOrderItem',
        'PurchaseOrderItem': 'PurchaseOrderItem',
        'PO_Item': 'PurchaseOrderItem',
        'PO Item': 'PurchaseOrderItem',

        'Goods Movement Ref Doc Type': 'GoodsMovementRefDocType',
        'GoodsMovementRefDocType': 'GoodsMovementRefDocType',
        'Ref Doc Type': 'GoodsMovementRefDocType',

        'Quantity In Entry Unit': 'QuantityInEntryUnit',
        'QuantityInEntryUnit': 'QuantityInEntryUnit',
        'Quantity': 'QuantityInEntryUnit',
        'Qty': 'QuantityInEntryUnit',

        'Entry Unit': 'EntryUnit',
        'EntryUnit': 'EntryUnit',
        'Unit': 'EntryUnit'
      };

      const result = {};

      // Map each property using the mapping
      Object.keys(rowData).forEach(key => {
        const standardKey = mapping[key] || key;
        result[standardKey] = rowData[key];
      });

      return result;
    }
  };
});