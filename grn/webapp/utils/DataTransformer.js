sap.ui.define(["sap/ui/core/format/DateFormat"], function (DateFormat) {
  "use strict";

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

      // Field standardization configurations
      this._standardFieldMap = this._initializeFieldMappings();
      this._fieldsToCleanup = [
        'ValidationErrors', 'ProcessedAt', 'index', 'MessageCode', 'message',
        'MaterialDocumentMessage', 'ErrorMessage', 'SuccessMessage',
        'ErrorCode', 'error', 'errorCode', 'details'
      ];

      // Export column order
      this._exportColumnOrder = [
        "Status", "SequenceNumber", "GRNDocumentNumber", "DocumentDate",
        "PostingDate", "MaterialDocumentHeaderText", "ReferenceDocument",
        "GoodsMovementCode", "Material", "Plant", "StorageLocation",
        "GoodsMovementType", "PurchaseOrder", "PurchaseOrderItem",
        "GoodsMovementRefDocType", "QuantityInEntryUnit", "EntryUnit",
        "MaterialDocument", "MaterialDocumentYear", "Message", "ErrorCode"
      ];
    }

    // === DATE/TIME OPERATIONS ===

    /**
     * Parse date from various formats to standardized YYYY-MM-DD format
     * @param {any} dateValue - Date input (string, Date object, number, etc.)
     * @returns {string|null} Formatted date string or null if invalid
     */
    parseDate(dateValue) {
      if (!dateValue) return null;

      try {
        // Already in YYYY-MM-DD format
        if (typeof dateValue === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(dateValue)) {
          return dateValue;
        }

        // Handle Excel date numbers (days since 1900-01-01)
        if (typeof dateValue === 'number' || (!isNaN(dateValue) && typeof dateValue === 'string')) {
          const numValue = Number(dateValue);
          if (numValue > 1000 && numValue < 100000) {
            const jsDate = new Date(Date.UTC(0, 0, numValue - 1));
            if (!isNaN(jsDate.getTime())) {
              return this._dateFormatter.format(jsDate);
            }
          }
        }

        // Handle common date formats like MM/DD/YYYY, DD/MM/YYYY
        if (typeof dateValue === 'string') {
          const dateParts = dateValue.split(/[-/\\]/);
          if (dateParts.length === 3) {
            // Try both MM/DD/YYYY and DD/MM/YYYY formats
            const date1 = new Date(`${dateParts[2]}-${dateParts[0]}-${dateParts[1]}`);
            const date2 = new Date(`${dateParts[2]}-${dateParts[1]}-${dateParts[0]}`);

            if (!isNaN(date1.getTime())) return this._dateFormatter.format(date1);
            if (!isNaN(date2.getTime())) return this._dateFormatter.format(date2);
          }
        }

        // Handle Date objects
        if (dateValue instanceof Date && !isNaN(dateValue.getTime())) {
          return this._dateFormatter.format(dateValue);
        }

        // Try generic date parsing
        const date = new Date(dateValue);
        if (!isNaN(date.getTime())) {
          return this._dateFormatter.format(date);
        }

        return null;
      } catch (e) {
        console.error("DataTransformer: Error parsing date:", e);
        return null;
      }
    }

    /**
     * Format date time to the required format (DD-MM-YY HH:MM:SS)
     * @param {Date} date - Date to format
     * @returns {string} Formatted date string
     */
    formatDateTime(date) {
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
     * Format timestamp with error handling
     * @param {string|Date} timestamp - Timestamp to format
     * @returns {string} Formatted timestamp or empty string
     */
    formatTimestamp(timestamp) {
      if (!timestamp) return "";

      try {
        const date = new Date(timestamp);
        if (!isNaN(date.getTime())) {
          return this.formatDateTime(date);
        }
      } catch (e) {
        console.warn("DataTransformer: Error formatting timestamp:", e);
      }
      return "";
    }

    /**
     * Format date for OData with time component
     * @param {any} dateValue - Date input
     * @returns {string|null} OData formatted date
     */
    formatDateForOData(dateValue) {
      const dateString = this.parseDate(dateValue);
      return dateString ? `${dateString}T00:00:00` : null;
    }

    /**
     * Parse OData date format (e.g., "/Date(1548979200000)/") to standard format
     * @param {string} oDataDate - OData date string
     * @returns {string} Formatted date in YYYY-MM-DD format
     */
    parseODataDate(oDataDate) {
      if (!oDataDate) return "";

      try {
        // Modern OData format (ISO string)
        if (typeof oDataDate === 'string' && oDataDate.includes('T')) {
          const date = new Date(oDataDate);
          if (!isNaN(date.getTime())) {
            return this._dateFormatter.format(date);
          }
        }

        // Legacy OData format (/Date(timestamp)/)
        if (typeof oDataDate === 'string' && oDataDate.startsWith('/Date(')) {
          const timestamp = parseInt(
            oDataDate.replace(/^\/Date\((\d+)([+-]\d+)?\)\//, "$1"),
            10
          );

          const date = new Date(timestamp);
          if (!isNaN(date.getTime())) {
            return this._dateFormatter.format(date);
          }
        }

        return this.parseDate(oDataDate);
      } catch (e) {
        console.error("DataTransformer: Error parsing OData date:", e);
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

        return `/Date(${dateObj.getTime()})/`;
      } catch (e) {
        console.error("DataTransformer: Error converting to SAP date format:", e);
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

    // === FIELD STANDARDIZATION ===

    /**
     * Initialize field mappings for column name standardization
     * @returns {Object} Field mapping object
     * @private
     */
    _initializeFieldMappings() {
      return {
        // Sequence Number variations
        'Sequence Number': 'SequenceNumber',
        'SequenceNumber': 'SequenceNumber',
        'SequenceId': 'SequenceNumber',
        'SequenceID': 'SequenceNumber',
        'Sequence_Number': 'SequenceNumber',
        'SeqNumber': 'SequenceNumber',
        'Seq': 'SequenceNumber',

        // GRN Document variations
        'GRN Document Number': 'GRNDocumentNumber',
        'GRNDocumentNumber': 'GRNDocumentNumber',
        'GRN_Document_Number': 'GRNDocumentNumber',
        'GRNNumber': 'GRNDocumentNumber',
        'GRN No': 'GRNDocumentNumber',

        // Date variations
        'Document Date': 'DocumentDate',
        'DocumentDate': 'DocumentDate',
        'Document_Date': 'DocumentDate',
        'DocDate': 'DocumentDate',
        'Posting Date': 'PostingDate',
        'PostingDate': 'PostingDate',
        'Posting_Date': 'PostingDate',
        'Post Date': 'PostingDate',

        // GRN Header Text variations
        'Material Document Header Text': 'MaterialDocumentHeaderText',
        'MaterialDocumentHeaderText': 'MaterialDocumentHeaderText',
        'HeaderText': 'MaterialDocumentHeaderText',
        'Header Text': 'MaterialDocumentHeaderText',

        // Reference Document variations
        'Reference Document': 'ReferenceDocument',
        'ReferenceDocument': 'ReferenceDocument',
        'Reference_Document': 'ReferenceDocument',
        'Reference Doc': 'ReferenceDocument',
        'RefDoc': 'ReferenceDocument',

        // Goods Movement Code variations
        'Goods Movement Code': 'GoodsMovementCode',
        'GoodsMovementCode': 'GoodsMovementCode',
        'GM Code': 'GoodsMovementCode',
        'Movement Code': 'GoodsMovementCode',

        // Material variations
        'Material': 'Material',
        'MaterialNumber': 'Material',
        'Material Number': 'Material',
        'Material_Number': 'Material',
        'Mat. No.': 'Material',

        // Plant variations
        'Plant': 'Plant',
        'PlantID': 'Plant',
        'Plant ID': 'Plant',
        'Plant Code': 'Plant',

        // Storage Location variations
        'Storage Location': 'StorageLocation',
        'StorageLocation': 'StorageLocation',
        'Storage_Location': 'StorageLocation',
        'SLoc': 'StorageLocation',

        // Goods Movement Type variations
        'Goods Movement Type': 'GoodsMovementType',
        'GoodsMovementType': 'GoodsMovementType',
        'Movement Type': 'GoodsMovementType',
        'MvmtType': 'GoodsMovementType',

        // Purchase Order variations
        'Purchase Order': 'PurchaseOrder',
        'PurchaseOrder': 'PurchaseOrder',
        'Purchase_Order': 'PurchaseOrder',
        'PO': 'PurchaseOrder',
        'PO Number': 'PurchaseOrder',

        // Purchase Order Item variations
        'Purchase Order Item': 'PurchaseOrderItem',
        'PurchaseOrderItem': 'PurchaseOrderItem',
        'PO_Item': 'PurchaseOrderItem',
        'PO Item': 'PurchaseOrderItem',

        // Goods Movement Ref Doc Type variations
        'Goods Movement Ref Doc Type': 'GoodsMovementRefDocType',
        'GoodsMovementRefDocType': 'GoodsMovementRefDocType',
        'Ref Doc Type': 'GoodsMovementRefDocType',

        // Quantity variations
        'Quantity In Entry Unit': 'QuantityInEntryUnit',
        'QuantityInEntryUnit': 'QuantityInEntryUnit',
        'Quantity': 'QuantityInEntryUnit',
        'Qty': 'QuantityInEntryUnit',

        // Entry Unit variations
        'Entry Unit': 'EntryUnit',
        'EntryUnit': 'EntryUnit',
        'Unit': 'EntryUnit'
      };
    }

    /**
     * Get standardized field name
     * @param {string} fieldName - Original field name
     * @returns {string} Standardized field name
     */
    getStandardFieldName(fieldName) {
      return this._standardFieldMap[fieldName] || fieldName;
    }

    /**
     * Standardize field names in a record
     * @param {Object} record - Record with potentially non-standard field names
     * @returns {Object} Record with standardized field names
     */
    standardizeFieldNames(record) {
      const standardized = {};

      Object.keys(record).forEach(key => {
        const standardKey = this.getStandardFieldName(key);
        standardized[standardKey] = record[key];
      });

      return standardized;
    }

    /**
     * Get sequence ID from record with fallback handling
     * @param {Object} record - Record object
     * @returns {string} Sequence ID value
     */
    getSequenceId(record) {
      return record.SequenceId || record.SequenceID || record.SequenceNumber || '';
    }

    /**
     * Clean up record fields by removing internal/redundant fields
     * @param {Object} record - Record to clean
     * @returns {Object} Cleaned record
     */
    cleanupRecordFields(record) {
      const cleaned = { ...record };

      this._fieldsToCleanup.forEach(field => {
        delete cleaned[field];
      });

      return cleaned;
    }

    /**
     * Clean and standardize record (combines field standardization and cleanup)
     * @param {Object} record - Raw record
     * @returns {Object} Cleaned and standardized record
     */
    cleanupAndStandardizeRecord(record) {
      const standardized = this.standardizeFieldNames(record);
      return this.cleanupRecordFields(standardized);
    }

    // === DATA TRANSFORMATION ===

    /**
     * Transform data to OData format
     * @param {Array|Object} data - Array of service entries or single entry
     * @returns {Object} Transformed data in OData format
     */
    transformToODataFormat(data) {
      if (!Array.isArray(data)) {
        data = [data];
      }

      const firstItem = data[0] || {};
      const documentDate = this.formatDateForOData(firstItem.DocumentDate);
      const postingDate = this.formatDateForOData(firstItem.PostingDate);

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
     * Transform a single GRN item to OData format
     * @param {Object} entry - GRN item
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
     * Format a number value for API requests
     * @param {string|number} value - Number value 
     * @returns {string} Formatted number string
     */
    formatNumberForAPI(value) {
      if (value === undefined || value === null || value === '') {
        return "0";
      }

      const numericString = String(value).replace(/[^0-9.-]/g, '');
      const numValue = parseFloat(numericString);

      if (isNaN(numValue)) {
        return "0";
      }

      return numValue.toFixed(3);
    }

    // === GROUPING OPERATIONS ===

    /**
     * Group entries by specified fields
     * @param {Array} entries - Array of entries
     * @param {Array|string} groupFields - Field(s) to group by
     * @returns {Object} Grouped entries
     */
    groupByFields(entries, groupFields) {
      const fields = Array.isArray(groupFields) ? groupFields : [groupFields];
      const groups = {};

      entries.forEach(entry => {
        // Standardize field names first
        const standardizedEntry = this.standardizeFieldNames(entry);

        const groupKey = fields.map(field => {
          if (field === 'SequenceId') {
            return this.getSequenceId(standardizedEntry);
          }
          return standardizedEntry[field] || "";
        }).join('_');

        if (!groups[groupKey]) {
          groups[groupKey] = [];
        }
        groups[groupKey].push(standardizedEntry);
      });

      return groups;
    }

    /**
     * Map column names to standardized property names (alias for standardizeFieldNames)
     * @param {Object} rowData - Raw row data with various column names
     * @returns {Object} Row with standardized property names
     */
    mapColumnNames(rowData) {
      return this.standardizeFieldNames(rowData);
    }

    // === EXPORT UTILITIES ===

    /**
     * Remove empty columns from data
     * @param {Array} data - Data to process
     * @returns {Array} Data with empty columns removed
     */
    removeEmptyColumns(data) {
      if (!data || !Array.isArray(data) || data.length === 0) return data;

      // Get all keys used across all items
      const allKeys = new Set();
      data.forEach(item => {
        Object.keys(item).forEach(key => allKeys.add(key));
      });

      // Filter out keys that are empty or should be cleaned up
      const keysToRemove = [];
      allKeys.forEach(key => {
        if (key.startsWith("__EMPTY") || key === "EMPTY" || key.startsWith("_EMPTY")) {
          keysToRemove.push(key);
        } else {
          const isEmpty = data.every(item => !item[key] && item[key] !== 0);
          if (isEmpty) keysToRemove.push(key);
        }
      });

      // Add cleanup fields to removal list
      this._fieldsToCleanup.forEach(col => {
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
     * Reorder fields in each record to the desired column order
     * @param {Array} data - Data to process
     * @returns {Array} Data with columns in the desired order
     */
    reorderColumns(data) {
      if (!data || !Array.isArray(data) || data.length === 0) return data;

      return data.map(item => {
        const orderedItem = {};

        // First add columns in the defined order (if they exist in the item)
        this._exportColumnOrder.forEach(key => {
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
     * Finalize records by removing empty columns and reordering
     * @param {Array} records - Records to finalize
     * @returns {Array} Finalized records
     */
    finalizeRecords(records) {
      let finalizedRecords = this.removeEmptyColumns(records);
      finalizedRecords = this.reorderColumns(finalizedRecords);
      console.debug(`DataTransformer: Finalized ${finalizedRecords.length} records.`);
      return finalizedRecords;
    }
  };
});