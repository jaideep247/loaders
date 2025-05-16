sap.ui.define(["sap/ui/core/format/DateFormat",
  "purchaseorder/utils/DateUtils"
], function (DateFormat, DateUtils) {
  "use strict";

  /**
   * PurchaseOrderDataTransformer
   * Handles data transformation between different formats for Purchase Orders
   */
  class PurchaseOrderDataTransformer {
    constructor() {
      this._dateFormatter = DateFormat.getDateInstance({
        pattern: "yyyy-MM-dd"
      });
      this._dateTimeFormatter = DateFormat.getDateTimeInstance({
        pattern: "yyyy-MM-dd'T'HH:mm:ss"
      });
    }

    /**
     * Transform array of items into individual purchase orders
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

      // Create an array of individual purchase orders with thorough validation
      return data.map(item => {
        // Make sure we have an item
        if (!item) {
          console.error("transformToIndividualEntries: Item is null or undefined");
          return null;
        }

        // Create purchase order with all required fields
        const entry = {
          Sequence: item.Sequence || "",
          LegacyPurchasingDocumentNumber: item.LegacyPurchasingDocumentNumber || "",
          CompanyCode: item.CompanyCode || "",
          PurchasingDocumentType: item.PurchasingDocumentType || "",
          SupplierAccountNumber: item.SupplierAccountNumber || "",
          PurchasingOrganization: item.PurchasingOrganization || "",
          PurchasingGroup: item.PurchasingGroup || "",
          PurchasingDocumentDate: DateUtils.formatDateForOData(item.PurchasingDocumentDate || new Date()),
          PurchasingDocumentNumber: item.PurchasingDocumentNumber || "",
          ItemNumberOfPurchasingDocument: item.ItemNumberOfPurchasingDocument || "",
          AccountAssignmentCategory: item.AccountAssignmentCategory || "",
          ProductNumber: item.ProductNumber || "",
          Plant: item.Plant || "",
          StorageLocation: item.StorageLocation || "",
          OrderQuantity: item.OrderQuantity || "0",
          DeliveryDays: item.DeliveryDays || "0",
          NetPrice: item.NetPrice || "0",
          PriceUnit: item.PriceUnit || "1",
          TaxCode: item.TaxCode || "",
          Return: item.Return || "",
          PurchaseContractItem: item.PurchaseContractItem || "",
          PurchaseOrderItemAccountAssignmentnumber: item.PurchaseOrderItemAccountAssignmentnumber || "",
          WBSElementExternalID: item.WBSElementExternalID || "",
          CostCenter: item.CostCenter || "",
          GLAccountNumber: item.GLAccountNumber || "",
          ItemText: item.ItemText || ""
        };

        // Log the entry for debugging
        console.log("Created purchase order entry:", JSON.stringify(entry, null, 2));

        return entry;
      }).filter(entry => entry !== null); // Remove any null entries
    }
    /**
      * Transform data to OData format
      * @param {Array} data - Array of purchase orders
      * @returns {Object} Transformed data in OData format
      */
    transformToODataFormat(data) {
      if (!Array.isArray(data)) {
        data = [data];
      }
      // Group entries by Sequence
      const sequenceGroups = this._groupBySequence(data);

      // Transform each sequence group into a purchase order
      return Object.values(sequenceGroups).map((groupedEntries) => {
        // Use the first entry as the base for header information
        const baseEntry = groupedEntries[0];

        // Create base purchase order structure
        const purchaseOrder = {
          PurchaseOrderType: baseEntry.PurchasingDocumentType || "NB",
          PurchaseOrderDate: DateUtils.formatDateForOData(baseEntry.PurchasingDocumentDate || new Date()),
          CompanyCode: baseEntry.CompanyCode,
          PurchasingOrganization: baseEntry.PurchasingOrganization,
          PurchasingGroup: baseEntry.PurchasingGroup,
          Supplier: baseEntry.SupplierAccountNumber,
          DocumentCurrency: "INR", // Default currency
          Language: "EN",
          Sequence: baseEntry.Sequence
        };

        // Transform Purchase Order Items - create an item for each entry in the group
        purchaseOrder._PurchaseOrderItem = groupedEntries.map((entry, index) => {
          // Calculate item number (10, 20, 30, etc.)
          const itemNumber = String((index + 1) * 10);

          // Create individual line item
          const lineItem = {
            PurchaseOrderItem: itemNumber,
            DocumentCurrency: "INR",
            Material: entry.ProductNumber,
            Plant: entry.Plant,
            StorageLocation: entry.StorageLocation,
            PurchaseOrderQuantityUnit: entry.PriceUnit || "EA",
            OrderQuantity: entry.OrderQuantity || "0",
            NetPriceAmount: entry.NetPrice || "0",
            TaxCode: entry.TaxCode,
            AccountAssignmentCategory: entry.AccountAssignmentCategory
          };

          // Add Item Notes if Item Text is present
          if (entry.ItemText) {
            lineItem._PurchaseOrderItemNote = [{
              TextObjectType: "F01",
              Language: "EN",
              PlainLongText: entry.ItemText
            }];
          }

          // Add Account Assignments if applicable
          if (entry.WBSElementExternalID || entry.CostCenter || entry.GLAccountNumber) {
            lineItem._PurOrdAccountAssignment = [{
              AccountAssignmentNumber: entry.PurchaseOrderItemAccountAssignmentnumber || "1",
              WBSElementExternalID: entry.WBSElementExternalID || "",
              CostCenter: entry.CostCenter || "",
              GLAccount: entry.GLAccountNumber || ""
            }];
          }

          // Optional additional fields

          lineItem.IsReturnsItem = entry.Return ? true : false;

          if (entry.PurchaseContractItem) {
            lineItem.PurchaseContractItem = entry.PurchaseContractItem;
          }

          return lineItem;
        });    

        return purchaseOrder;
      });
    }

    /**
     * Transform data to UI format
     * @param {Array} data - Array of purchase orders
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
        PurchasingDocumentDate: this._parseDate(entry.PurchasingDocumentDate),
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
        ValidationErrors: entry.ValidationErrors || []
      }));
    }

    /**
     * Transform Excel data to purchase order format
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
          // Standardize field names and data types
          const purchaseOrder = {
            Sequence: this._formatStringValue(row["Sequence"]),
            LegacyPurchasingDocumentNumber: this._formatStringValue(row["Legacy Purchasing Document Number"]),
            CompanyCode: this._formatStringValue(row["Company Code"]),
            PurchasingDocumentType: this._formatStringValue(row["Purchasing Document Type"]),
            SupplierAccountNumber: this._formatStringValue(row["Supplier Account Number"]),
            PurchasingOrganization: this._formatStringValue(row["Purchasing Organization"]),
            PurchasingGroup: this._formatStringValue(row["Purchasing Group"]),
            PurchasingDocumentDate: this._parseExcelDate(row["Purchasing Document Date"]),
            PurchasingDocumentNumber: this._formatStringValue(row["Purchasing Document Number"]),
            ItemNumberOfPurchasingDocument: this._formatStringValue(row["Item Number of Purchasing Document"]),
            AccountAssignmentCategory: this._formatStringValue(row["Account Assignment Category"]),
            ProductNumber: this._formatStringValue(row["Product Number"]),
            Plant: this._formatStringValue(row["Plant"]),
            StorageLocation: this._formatStringValue(row["Storage Location"]),
            OrderQuantity: this._formatNumberValue(row["Order Quantity"]),
            DeliveryDays: this._formatNumberValue(row["Delivery Days"]),
            NetPrice: this._formatNumberValue(row["Net Price"]),
            PriceUnit: this._formatNumberValue(row["Price Unit"], "1"),
            TaxCode: this._formatStringValue(row["Tax Code"]),
            Return: this._formatStringValue(row["Return"]),
            PurchaseContract: this._formatStringValue(row["Purchase Contract"]),
            PurchaseContractItem: this._formatStringValue(row["Purchase Contract Item"]),
            AccountAssignmentnumber: this._formatStringValue(row["Account Assignment number"]),
            WBSElementExternalID: this._formatStringValue(row["WBSElementExternalID"]),
            CostCenter: this._formatStringValue(row["Cost Center"]),
            GLAccountNumber: this._formatStringValue(row["GL Account Number"]),
            ItemText: this._formatStringValue(row["Item Text"]),
            Status: "Valid", // Default status, will be updated during validation
            ValidationErrors: []
          };

          return purchaseOrder;
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
      * Group entries by Sequence number
      * @param {Array} data - Input data array
      * @returns {Object} Grouped entries by sequence
      * @private
      */
    _groupBySequence(data) {
      return data.reduce((groups, entry) => {
        // Use the original Sequence field as the key for grouping
        const sequence = entry.Sequence || 'default';

        if (!groups[sequence]) {
          groups[sequence] = [];
        }

        groups[sequence].push(entry);

        return groups;
      }, {});
    }
    /**
     * Helper method to format string values from Excel
     * @private
     * @param {any} value - Value to format
     * @returns {string} Formatted string value
     */
    _formatStringValue(value) {
      if (value === undefined || value === null) {
        return "";
      }
      return String(value).trim();
    }

    /**
     * Helper method to format number values from Excel
     * @private
     * @param {any} value - Value to format
     * @param {string} defaultValue - Default value if invalid
     * @returns {string} Formatted number value
     */
    _formatNumberValue(value, defaultValue = "0") {
      if (value === undefined || value === null || value === "") {
        return defaultValue;
      }
      const num = Number(value);
      return isNaN(num) ? defaultValue : num.toString();
    }

    /**
     * Parse Excel date values which might be in different formats
     * @private
     * @param {any} value - Date value from Excel
     * @returns {Date} Parsed date object
     */
    _parseExcelDate(value) {
      return DateUtils.parseExcelDate(value);
    }

    /**
     * Parse date from OData format
     * @private
     * @param {string} dateStr - Date string to parse
     * @returns {Date} Parsed date object
     */
    _parseDate(dateStr) {
      return DateUtils.formatDateForOData(dateStr);
    }

  }

  return PurchaseOrderDataTransformer;
});