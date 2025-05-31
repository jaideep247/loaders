sap.ui.define([
  "sap/ui/core/format/DateFormat",
  "purchaseorder/utils/DateUtils"
], function (DateFormat, DateUtils) {
  "use strict";

  /**
   * PurchaseOrderDataTransformer
   * Handles data transformation between different formats for Purchase Orders
   */
  class PurchaseOrderDataTransformer {
    constructor() {
      // Standard OData Edm.Date format
      this._dateFormatter = DateFormat.getDateInstance({
        pattern: "yyyy-MM-dd"
      });
      // Standard OData Edm.DateTimeOffset format (if needed, though not explicitly used in PO example)
      this._dateTimeOffsetFormatter = DateFormat.getDateTimeInstance({
        pattern: "yyyy-MM-ddTHH:mm:ssZ", // UTC Zulu time
        UTC: true
      });
    }

    /**
     * Transform array of items into individual purchase orders (UI representation)
     * This method seems to be for creating a flat list for UI display or initial processing.
     * It's kept as is from your provided code, as the main issue is in transformToODataFormat.
     * @param {Array} data - Array of purchase orders
     * @returns {Array} Array of transformed purchase orders
     */
    transformToIndividualEntries(data) {
      if (!data) {
        console.error("transformToIndividualEntries: Invalid input - data is null or undefined");
        return [];
      }

      if (!Array.isArray(data)) {
        console.warn("transformToIndividualEntries: Input is not an array, converting to array");
        data = [data];
      }

      if (data.length === 0) {
        console.warn("transformToIndividualEntries: Input array is empty");
        return [];
      }

      return data.map(item => {
        if (!item) {
          console.error("transformToIndividualEntries: Item is null or undefined");
          return null;
        }
        // Assuming DateUtils.formatDateForOData handles various input date types and returns yyyy-MM-dd string
        return {
          Sequence: item.Sequence || "",
          LegacyPurchasingDocumentNumber: item.LegacyPurchasingDocumentNumber || "",
          CompanyCode: item.CompanyCode || "",
          PurchasingDocumentType: item.PurchasingDocumentType || "", // This will be PurchaseOrderType in OData
          SupplierAccountNumber: item.SupplierAccountNumber || "", // This will be Supplier in OData
          PurchasingOrganization: item.PurchasingOrganization || "",
          PurchasingGroup: item.PurchasingGroup || "",
          PurchasingDocumentDate: DateUtils.formatDateForOData(item.PurchasingDocumentDate || new Date()), // OData expects "yyyy-MM-dd"
          PurchasingDocumentNumber: item.PurchasingDocumentNumber || "", // Likely PO number if known
          ItemNumberOfPurchasingDocument: item.ItemNumberOfPurchasingDocument || "", // This is PurchaseOrderItem in OData
          AccountAssignmentCategory: item.AccountAssignmentCategory || "",
          ProductNumber: item.ProductNumber || "", // This will be Material in OData item
          Plant: item.Plant || "",
          StorageLocation: item.StorageLocation || "",
          OrderQuantity: String(item.OrderQuantity || "0"),
          DeliveryDays: item.DeliveryDays || "0", // Not in desired OData, but kept from original
          NetPrice: item.NetPrice || "0", // This will be NetPriceAmount in OData item
          PriceUnit: item.PriceUnit || "1", // This will be PurchaseOrderQuantityUnit in OData item
          TaxCode: item.TaxCode || "",
          Return: item.Return || "", // This will be IsReturnsItem (boolean) in OData item
          PurchaseContractItem: item.PurchaseContractItem || "",
          PurchaseOrderItemAccountAssignmentnumber: item.PurchaseOrderItemAccountAssignmentnumber || "1", // AccountAssignmentNumber in OData item's acc assign.
          WBSElementExternalID: item.WBSElementExternalID || "",
          CostCenter: item.CostCenter || "",
          GLAccountNumber: item.GLAccountNumber || "",
          ItemText: item.ItemText || "", // For _PurchaseOrderItemNote
          PerformancePeriodStartDate: DateUtils.formatDateForOData(item.PerformancePeriodStartDate), // For _PurchaseOrderScheduleLineTP
          PerformancePeriodEndDate: DateUtils.formatDateForOData(item.PerformancePeriodEndDate)   // For _PurchaseOrderScheduleLineTP
        };
      }).filter(entry => entry !== null);
    }

    /**
     * Transform flat data (grouped by a PO identifier like 'Sequence') into OData deep create format.
     * @param {Array} flatEntries - Array of flat purchase order item entries.
     * Each entry represents one line item but contains header info.
     * @returns {Array} Array of transformed purchase orders in OData deep create format.
     */
    transformToODataFormat(flatEntries) {
      if (!Array.isArray(flatEntries) || flatEntries.length === 0) {
        console.warn("transformToODataFormat: Input data is not an array or is empty.");
        return [];
      }

      // Group entries by a common Purchase Order identifier (e.g., 'Sequence' or a combination of header fields)
      // Assuming 'Sequence' is the unique identifier for a PO from the Excel/flat structure.
      const purchaseOrderGroups = this._groupBySequence(flatEntries);

      const odataPurchaseOrders = [];

      for (const sequenceKey in purchaseOrderGroups) {
        const groupedItemEntries = purchaseOrderGroups[sequenceKey];
        if (!groupedItemEntries || groupedItemEntries.length === 0) continue;

        const firstEntry = groupedItemEntries[0]; // Use the first item for header data

        const purchaseOrder = {
          // Header fields from the first entry of the group
          PurchaseOrderType: firstEntry.PurchasingDocumentType || "NB", // Default if not provided
          PurchaseOrderDate: DateUtils.formatDateForOData(firstEntry.PurchasingDocumentDate || new Date()), // Expects "yyyy-MM-dd"
          CompanyCode: firstEntry.CompanyCode,
          PurchasingOrganization: firstEntry.PurchasingOrganization,
          PurchasingGroup: firstEntry.PurchasingGroup,
          Supplier: firstEntry.SupplierAccountNumber, // Map from SupplierAccountNumber
          DocumentCurrency: firstEntry.DocumentCurrency || "INR", // Default or from entry
          Language: firstEntry.Language || "EN", // Default or from entry
          _PurchaseOrderItem: [] // Initialize item array
        };

        // Map each entry in the group to a PurchaseOrderItem structure
        groupedItemEntries.forEach((entry, index) => {
          const itemNumber = String((index + 1) * 10).padStart(5, '0'); // e.g., "00010", "00020"

          const poItem = {
            PurchaseOrderItem: itemNumber,
            AccountAssignmentCategory: entry.AccountAssignmentCategory,
            DocumentCurrency: entry.DocumentCurrency || purchaseOrder.DocumentCurrency, // Inherit from header or specify
            Material: entry.ProductNumber, // Map from ProductNumber
            Plant: entry.Plant,
            StorageLocation: entry.StorageLocation || "", // Ensure it's a string, can be empty
            OrderQuantity: String(entry.OrderQuantity) || "0", // Convert to number
            NetPriceAmount: String(entry.NetPrice) || "0", // Convert to number
            PurchaseOrderQuantityUnit: entry.PriceUnit || "EA", // Map from PriceUnit, default EA
            TaxCode: entry.TaxCode,
            IsReturnsItem: entry.Return === "X" || entry.Return === true || entry.Return === "true", // Convert to boolean
            // PurchaseContractItem: entry.PurchaseContractItem, // If this field exists in your OData item entity

            _PurchaseOrderItemNote: [],
            _PurchaseOrderScheduleLineTP: [],
            _PurOrdAccountAssignment: []
          };

          // Add Item Text (Note)
          if (entry.ItemText) {
            poItem._PurchaseOrderItemNote.push({
              TextObjectType: "F01", // Common type for item texts
              Language: purchaseOrder.Language,
              PlainLongText: entry.ItemText
            });
          }
          if (poItem._PurchaseOrderItemNote.length === 0) {
            delete poItem._PurchaseOrderItemNote; // Omit if empty, as per desired payload
          }

       
          // Add Schedule Lines
          if (entry.PerformancePeriodStartDate && entry.PerformancePeriodEndDate) {
            poItem._PurchaseOrderScheduleLineTP.push({
              PurchaseOrderItem: itemNumber, // Link to parent item
              ScheduleLine: "1", // Typically starts with 1 for a new item's schedule line
              ScheduleLineOrderQuantity: poItem.OrderQuantity, // Can be same as item qty or different
              PurchaseOrderQuantityUnit: poItem.PurchaseOrderQuantityUnit,
              PerformancePeriodStartDate: DateUtils.formatDateForOData(entry.PerformancePeriodStartDate),
              PerformancePeriodEndDate: DateUtils.formatDateForOData(entry.PerformancePeriodEndDate)
            });
          }
          if (poItem._PurchaseOrderScheduleLineTP.length === 0) {
            delete poItem._PurchaseOrderScheduleLineTP; // Omit if empty
          }

          // Add Account Assignments
          if (entry.AccountAssignmentCategory && (entry.WBSElementExternalID || entry.CostCenter || entry.GLAccountNumber)) {
            poItem._PurOrdAccountAssignment.push({
              PurchaseOrderItem: itemNumber, // Link to parent item
              AccountAssignmentNumber: entry.PurchaseOrderItemAccountAssignmentnumber || "1", // Default to "1" if not specified
              WBSElementExternalID: entry.WBSElementExternalID || "",
              CostCenter: entry.CostCenter || "",
              GLAccount: entry.GLAccountNumber
            });
          }
          if (poItem._PurOrdAccountAssignment.length === 0) {
            delete poItem._PurOrdAccountAssignment; // Omit if empty
          }

          // Add PurchaseContractItem if present
          if (entry.PurchaseContractItem) {
            poItem.PurchaseContractItem = entry.PurchaseContractItem;
          }


          purchaseOrder._PurchaseOrderItem.push(poItem);
        });

        if (purchaseOrder._PurchaseOrderItem.length > 0) {
          odataPurchaseOrders.push(purchaseOrder);
        }
      }
      return odataPurchaseOrders;
    }


    /**
     * Transform data to UI format (for display purposes)
     * Kept as is from your provided code.
     * @param {Array} data - Array of purchase orders (likely from OData read)
     * @returns {Array} Transformed data in UI format
     */
    transformToUIFormat(data) {
      if (!Array.isArray(data)) {
        data = [data];
      }
      return data.map((entry) => ({
        Sequence: entry.Sequence,
        LegacyPurchasingDocumentNumber: entry.LegacyPurchasingDocumentNumber,
        CompanyCode: entry.CompanyCode,
        PurchasingDocumentType: entry.PurchasingDocumentType,
        SupplierAccountNumber: entry.SupplierAccountNumber,
        PurchasingOrganization: entry.PurchasingOrganization,
        PurchasingGroup: entry.PurchasingGroup,
        PurchasingDocumentDate: DateUtils.parseDate(entry.PurchasingDocumentDate), // Use a generic parseDate from DateUtils
        PurchasingDocumentNumber: entry.PurchasingDocumentNumber,
        ItemNumberOfPurchasingDocument: entry.ItemNumberOfPurchasingDocument,
        AccountAssignmentCategory: entry.AccountAssignmentCategory,
        ProductNumber: entry.ProductNumber,
        Plant: entry.Plant,
        StorageLocation: entry.StorageLocation,
        OrderQuantity: entry.OrderQuantity,
        DeliveryDays: entry.DeliveryDays,
        NetPrice: entry.NetPrice,
        PriceUnit: entry.PriceUnit,
        TaxCode: entry.TaxCode,
        Return: entry.Return,
        PurchaseContractItem: entry.PurchaseContractItem,
        PurchaseOrderItemAccountAssignmentnumber: entry.PurchaseOrderItemAccountAssignmentnumber,
        WBSElementExternalID: entry.WBSElementExternalID,
        CostCenter: entry.CostCenter,
        GLAccountNumber: entry.GLAccountNumber,
        ItemText: entry.ItemText,
        Status: entry.Status,
        Message: entry.Message,
        ErrorMessage: entry.ErrorMessage,
        ValidationErrors: entry.ValidationErrors || [],
        PerformancePeriodStartDate: DateUtils.parseDate(entry.PerformancePeriodStartDate),
        PerformancePeriodEndDate: DateUtils.parseDate(entry.PerformancePeriodEndDate)
      }));
    }

    /**
     * Transform Excel data to a flat purchase order item format.
     * Kept as is from your provided code.
     * @param {Array} excelData - Raw data from Excel file
     * @returns {Array} Transformed purchase order data
     */
    transformExcelToPurchaseOrders(excelData) {
      if (!Array.isArray(excelData)) {
        console.error("transformExcelToPurchaseOrders: Input is not an array");
        return [];
      }
      return excelData.map((row, index) => {
        try {
          return {
            Sequence: this._formatStringValue(row["Sequence"]),
            LegacyPurchasingDocumentNumber: this._formatStringValue(row["Legacy Purchasing Document Number"]),
            CompanyCode: this._formatStringValue(row["Company Code"]),
            PurchasingDocumentType: this._formatStringValue(row["Purchasing Document Type"]),
            SupplierAccountNumber: this._formatStringValue(row["Supplier Account Number"]),
            PurchasingOrganization: this._formatStringValue(row["Purchasing Organization"]),
            PurchasingGroup: this._formatStringValue(row["Purchasing Group"]),
            PurchasingDocumentDate: DateUtils.parseExcelDate(row["Purchasing Document Date"]),
            DocumentCurrency: this._formatStringValue(row["Document Currency"]) || "INR", // Added from desired payload
            Language: this._formatStringValue(row["Language"]) || "EN", // Added from desired payload
            ItemNumberOfPurchasingDocument: this._formatStringValue(row["Item Number of Purchasing Document"]),
            AccountAssignmentCategory: this._formatStringValue(row["Account Assignment Category"]),
            ProductNumber: this._formatStringValue(row["Product Number"]),
            Plant: this._formatStringValue(row["Plant"]),
            StorageLocation: this._formatStringValue(row["Storage Location"]),
            OrderQuantity: this._formatNumberValue(row["Order Quantity"]),
            DeliveryDays: this._formatNumberValue(row["Delivery Days"]), // Not in OData, but in Excel
            NetPrice: this._formatNumberValue(row["Net Price"]),
            PriceUnit: this._formatStringValue(row["Price Unit"]) || "EA", // Default to EA if empty
            TaxCode: this._formatStringValue(row["Tax Code"]),
            Return: this._formatStringValue(row["Return"]), // "X" or empty for boolean
            PurchaseContract: this._formatStringValue(row["Purchase Contract"]), // Not in OData, but in Excel
            PurchaseContractItem: this._formatStringValue(row["Purchase Contract Item"]),
            PurchaseOrderItemAccountAssignmentnumber: this._formatStringValue(row["Account Assignment number"]) || "1",
            WBSElementExternalID: this._formatStringValue(row["WBSElementExternalID"]),
            CostCenter: this._formatStringValue(row["Cost Center"]),
            GLAccountNumber: this._formatStringValue(row["GL Account Number"]),
            ItemText: this._formatStringValue(row["Item Text"]),
            PerformancePeriodStartDate: DateUtils.parseExcelDate(row["Performance Period Start Date"]),
            PerformancePeriodEndDate: DateUtils.parseExcelDate(row["Performance Period End Date"]),
            Status: "Valid",
            ValidationErrors: []
          };
        } catch (error) {
          console.error("Error transforming Excel row:", error, row);
          return {
            Sequence: (index + 1).toString(),
            Status: "Invalid",
            ValidationErrors: [{
              field: "General",
              message: "Error transforming Excel data: " + error.message
            }]
          };
        }
      });
    }

    /**
     * Group entries by Sequence number (or any PO identifier).
     * @param {Array} data - Input data array.
     * @returns {Object} Grouped entries.
     * @private
     */
    _groupBySequence(data) {
      return data.reduce((groups, entry) => {
        const sequence = entry.Sequence || 'PO_UNKNOWN_' + Date.now(); // Fallback key if sequence is missing
        if (!groups[sequence]) {
          groups[sequence] = [];
        }
        groups[sequence].push(entry);
        return groups;
      }, {});
    }

    _formatStringValue(value) {
      if (value === undefined || value === null) return "";
      return String(value).trim();
    }

    _formatNumberValue(value, defaultValue = "0") {
      if (value === undefined || value === null || String(value).trim() === "") return defaultValue;
      const num = Number(value);
      return isNaN(num) ? defaultValue : num.toString(); // Keep as string as per original, but OData might need number
    }

    // _parseExcelDate and _parseDate are assumed to be in DateUtils
    // and should handle conversion to appropriate Date objects or formatted strings.
    // For OData Edm.Date, the string "yyyy-MM-dd" is typically required.
    // DateUtils.formatDateForOData should ensure this.
    // DateUtils.parseDate (used in transformToUIFormat) should parse an OData date string to a Date object.
    // DateUtils.parseExcelDate should parse various Excel date formats to a Date object.

  }
  return PurchaseOrderDataTransformer;
});
