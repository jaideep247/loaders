sap.ui.define([
  "sap/m/MessageBox",
  "sap/m/MessageToast",
  "purchaseorder/utils/ExportUtil"
], function (MessageBox, MessageToast, ExportService) {
  "use strict";

  class ExportManager {
    constructor(oController) {
      if (!(this instanceof ExportManager)) {
        throw new Error("ExportManager must be called with new");
      }

      this._oController = oController;
      this._exportService = new ExportService();
      this._sequenceToOrderMap = new Map();
    }

    exportBatchResults(batchData, type, format) {
      try {
        console.log("Processing batch data for export:", type, format);

        // Create a deep copy for processing
        const exportData = JSON.parse(JSON.stringify(batchData));

        // Process and extract data in a single flow
        const processedData = this._processDataForExport(exportData, type);

        // Create timestamped filename
        const timestamp = new Date().toISOString()
          .replace(/[:.]/g, "-")
          .substring(0, 19);

        const filename = `Batch_All_Records${type}_${timestamp}`;

        // Perform the export
        this._exportService.exportData(
          processedData,
          filename,
          format,
          type
        );

        console.log(`Export complete: ${processedData.length} records`);
      } catch (error) {
        console.error("Export failed:", error);
        MessageBox.error("Export failed: " + error.message);
      }
    }

    /**
     * Process data for export in a single flow
     */
    _processDataForExport(batchData, type) {
      // 1. Collect records from all sources
      const { successRecords, errorRecords } = this._collectRecords(batchData);

      // 2. Build sequence mapping
      this._buildSequenceMap([...successRecords, ...errorRecords]);

      // 3. Select records based on export type
      let selectedRecords;
      switch (type) {
        case "success":
          selectedRecords = successRecords;
          break;
        case "error":
          selectedRecords = errorRecords;
          break;
        default: // "all"
          selectedRecords = [...successRecords, ...errorRecords];
      }

      // 4. Process each record for export
      const processedRecords = selectedRecords.map(record =>
        this._processRecordForExport(record)
      );

      // 5. Sort by sequence
      processedRecords.sort((a, b) => {
        const seqA = parseInt(a.Sequence, 10) || 0;
        const seqB = parseInt(b.Sequence, 10) || 0;
        return seqA - seqB;
      });

      return processedRecords;
    }

    /**
     * Collect all records from various sources in the batch data
     */
    _collectRecords(batchData) {
      const successRecords = [];
      const errorRecords = [];
 
      // Function to check record validity and categorize
      const processRecord = (record) => {
        // Prioritize entry if exists
        const processedRecord = record.entry || record;

        // Check for direct error indicators
        if (record.error || record.details ||
          (processedRecord.Status && processedRecord.Status !== 'Success')) {
          errorRecords.push(record);
          return;
        }

        // Check PO and other validity criteria
        if (!processedRecord.PurchaseOrder ||
          String(processedRecord.PurchaseOrder).trim() === '') {
          record.Message = record.Message || "Invalid record: Missing Purchase Order";
          record.Status = "Error";
          errorRecords.push(record);
          return;
        }

        // If no issues, add to success records
        successRecords.push(record);
      };

      // Process different record formats
      const processRecordCollection = (collection) => {
        if (Array.isArray(collection)) {
          collection.forEach(processRecord);
        }
      };

      // Check various possible record collections
      processRecordCollection(batchData.successRecords);
      processRecordCollection(batchData.errorRecords);
      processRecordCollection(batchData.successfulRecords);
      processRecordCollection(batchData.failedRecordsList);

      // Handle nested response data
      if (batchData.responseData) {
        const nestedRecords = this._collectRecords(batchData.responseData);
        successRecords.push(...nestedRecords.successRecords);
        errorRecords.push(...nestedRecords.errorRecords);
      }

      return { successRecords, errorRecords };
    }

    /**
     * Build sequence map from records
     */
    _buildSequenceMap(records) {
      this._sequenceToOrderMap.clear();

      records.forEach(record => {
        try {
          // Normalize record to use entry if exists
          const processedRecord = record.entry || record;

          // Find sequence value
          const sequence = this._findSequenceValue(processedRecord);

          // Map sequence if PO exists
          if (processedRecord.PurchaseOrder && sequence) {
            this._sequenceToOrderMap.set(processedRecord.PurchaseOrder, sequence);
          }
        } catch (error) {
          console.error("Error mapping sequence:", error);
        }
      });
    }

    /**
     * Process individual record for export
     */
    _processRecordForExport(record) {
      // Create a new export record object
      const exportRecord = {};

      // Determine the primary record to process (prefer entry)
      const primaryRecord = record.entry || record;
      const originalRecord = record;

      // Copy sequence and core details
      exportRecord.Sequence = this._findSequenceValue(originalRecord) ||
        this._findSequenceValue(primaryRecord) ||
        "Unknown";

      // Determine status and message
      let status = "Success";
      let message = "Processing complete";

      // Check for error conditions
      if (originalRecord.error || originalRecord.details ||
        (primaryRecord.Status && primaryRecord.Status !== 'Success')) {
        status = "Error";
        message = originalRecord.error ||
          originalRecord.details ||
          originalRecord.Message ||
          "Processing failed";
      }

      // Validate PO number
      if (!primaryRecord.PurchaseOrder ||
        String(primaryRecord.PurchaseOrder).trim() === '') {
        status = "Error";
        message = originalRecord.error ||
          originalRecord.details ||
          originalRecord.Message ||
          "Processing failed";
      }

      // Flatten the record
      const flattenObject = (obj, prefix = '') => {
        return Object.keys(obj || {}).reduce((acc, key) => {
          const pre = prefix.length ? prefix + '_' : '';

          // Skip nested objects and arrays
          if (obj[key] === null || obj[key] === undefined) {
            return acc;
          }

          if (typeof obj[key] === 'object' && !Array.isArray(obj[key])) {
            Object.assign(acc, flattenObject(obj[key], pre + key));
          } else if (Array.isArray(obj[key])) {
            // For arrays, just take the first item if it's an object
            if (obj[key].length > 0 && typeof obj[key][0] === 'object') {
              Object.assign(acc, flattenObject(obj[key][0], pre + key));
            }
          } else {
            acc[pre + key] = obj[key];
          }
          return acc;
        }, {});
      };

      // Combine flattened records
      Object.assign(
        exportRecord,
        flattenObject(primaryRecord),
        {
          Status: status,
          Message: message
        }
      );

      // Clean up sensitive or redundant fields
      const fieldsToRemove = [
        'entry', 'error', 'details', 'errorMessage',
        'OriginalRequest', 'originalSequence',
        'success', 'ProcessedAt'
      ];
      fieldsToRemove.forEach(field => {
        delete exportRecord[field];
      });

      return exportRecord;
    }

    /**
     * Find sequence value from various possible locations
     */
    _findSequenceValue(obj) {
      if (!obj) return null;

      // Check direct properties in priority order
      const sequenceFields = [
        'Sequence',
        'OriginalSequence',
        'originalSequence',
        'sequence'
      ];

      for (let field of sequenceFields) {
        if (obj[field]) return obj[field];
      }

      // Check nested objects
      if (obj.OriginalRequest) {
        for (let field of sequenceFields) {
          if (obj.OriginalRequest[field]) return obj.OriginalRequest[field];
        }
      }

      return null;
    }

    downloadTemplate() {
      if (!window.XLSX) {
        MessageBox.error("XLSX library not loaded");
        return;
      }

      // Detailed headers matching the exact format
      const headers = [
        "Sequence",
        "Legacy Purchasing Document Number",
        "Company Code",
        "Purchasing Document Type",
        "Supplier Account Number",
        "Purchasing Organization",
        "Purchasing Group",
        "Purchasing Document Date",
        "Purchasing Document Number",
        "Item Number of Purchasing Document",
        "Account Assignment Category",
        "Product Number",
        "Plant",
        "Storage Location",
        "Order Quantity",
        "Delivery Days",
        "Net Price",
        "Price Unit",
        "Tax Code",
        "Return",
        "Purchase Contract",
        "Purchase Contract Item",
        "Account Assignment number",
        "WBSElementExternalID",
        "Cost Center",
        "GL Account Number",
        "Item Text"
      ];

      // Sample data matching the description
      const sampleData = [
        {
          "Sequence": "1",
          "Legacy Purchasing Document Number": "",
          "Company Code": "2000",
          "Purchasing Document Type": "NB",
          "Supplier Account Number": "22000230",
          "Purchasing Organization": "2000",
          "Purchasing Group": "P01",
          "Purchasing Document Date": "2025-04-01",
          "Purchasing Document Number": "",
          "Item Number of Purchasing Document": "10",
          "Account Assignment Category": "",
          "Product Number": "100000271",
          "Plant": "2001",
          "Storage Location": "WH01",
          "Order Quantity": "2",
          "Delivery Days": "",
          "Net Price": "100",
          "Price Unit": "EA",
          "Tax Code": "G3",
          "Return": "",
          "Purchase Contract": "",
          "Purchase Contract Item": "0",
          "Account Assignment number": "",
          "WBSElementExternalID": "",
          "Cost Center": "",
          "GL Account Number": "",
          "Item Text": ""
        },
        {
          "Sequence": "1",
          "Legacy Purchasing Document Number": "",
          "Company Code": "2000",
          "Purchasing Document Type": "NB",
          "Supplier Account Number": "22000230",
          "Purchasing Organization": "2000",
          "Purchasing Group": "P01",
          "Purchasing Document Date": "2025-04-01",
          "Purchasing Document Number": "",
          "Item Number of Purchasing Document": "20",
          "Account Assignment Category": "Q",
          "Product Number": "100000274",
          "Plant": "2001",
          "Storage Location": "WH01",
          "Order Quantity": "2",
          "Delivery Days": "",
          "Net Price": "100",
          "Price Unit": "PC",
          "Tax Code": "G3",
          "Return": "",
          "Purchase Contract": "",
          "Purchase Contract Item": "0",
          "Account Assignment number": "1",
          "WBSElementExternalID": "I-24-DEP-100-BATHR",
          "Cost Center": "",
          "GL Account Number": "",
          "Item Text": ""
        },
        {
          "Sequence": "2",
          "Legacy Purchasing Document Number": "",
          "Company Code": "2000",
          "Purchasing Document Type": "ZSER",
          "Supplier Account Number": "22000230",
          "Purchasing Organization": "2000",
          "Purchasing Group": "P01",
          "Purchasing Document Date": "2025-04-01",
          "Purchasing Document Number": "",
          "Item Number of Purchasing Document": "10",
          "Account Assignment Category": "Z",
          "Product Number": "200000242",
          "Plant": "2001",
          "Storage Location": "",
          "Order Quantity": "2",
          "Delivery Days": "",
          "Net Price": "100",
          "Price Unit": "EA",
          "Tax Code": "G3",
          "Return": "",
          "Purchase Contract": "",
          "Purchase Contract Item": "0",
          "Account Assignment number": "1",
          "WBSElementExternalID": "W-TPWT3SRJ2868",
          "Cost Center": "",
          "GL Account Number": "",
          "Item Text": ""
        },
        {
          "Sequence": "2",
          "Legacy Purchasing Document Number": "",
          "Company Code": "2000",
          "Purchasing Document Type": "ZSER",
          "Supplier Account Number": "22000230",
          "Purchasing Organization": "2000",
          "Purchasing Group": "P01",
          "Purchasing Document Date": "2025-04-01",
          "Purchasing Document Number": "",
          "Item Number of Purchasing Document": "20",
          "Account Assignment Category": "K",
          "Product Number": "200000242",
          "Plant": "2001",
          "Storage Location": "",
          "Order Quantity": "2",
          "Delivery Days": "",
          "Net Price": "10",
          "Price Unit": "EA",
          "Tax Code": "G3",
          "Return": "",
          "Purchase Contract": "",
          "Purchase Contract Item": "0",
          "Account Assignment number": "1",
          "WBSElementExternalID": "",
          "Cost Center": "2AN_C_COM",
          "GL Account Number": "",
          "Item Text": ""
        }
      ];

      // Convert sample data to array of arrays for XLSX
      const dataRows = sampleData.map(row =>
        headers.map(header =>
          row[header] !== undefined ? row[header] : ""
        )
      );

      // Combine headers and data
      const worksheetData = [headers, ...dataRows];

      // Create worksheet
      const ws = XLSX.utils.aoa_to_sheet(worksheetData);

      // Create workbook
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Purchase Orders");

      // Write file
      XLSX.writeFile(wb, "PurchaseOrder_Template.xlsx");

      // Show success message
      MessageToast.show("Purchase Order template downloaded");
    }
  }

  return ExportManager;
});