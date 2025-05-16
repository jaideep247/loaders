sap.ui.define([], function () {
  "use strict";

  /**
   * ValidationManager for Purchase Order Entries
   * Responsible for validating purchase order data based on SAP metadata
   */
  return function (oController) {
    this.oController = oController;

    /**
     * Validate purchase orders
     * @param {array} entries - Purchase order entries to validate
     * @returns {object} Validation result with validated entries and errors
     */
    this.validatePurchaseOrders = function (entries) {
      // Ensure entries is an array
      if (!Array.isArray(entries)) {
        console.error("Invalid entries input:", entries);
        entries = entries && entries.entries ? entries.entries : [];
      }

      // If entries is empty, return an invalid result
      if (entries.length === 0) {
        return {
          isValid: false,
          entries: [],
          validCount: 0,
          errorCount: 0,
          errors: [
            {
              message: "No entries to validate",
              sheet: "Purchase Orders",
              sequenceId: "N/A"
            }
          ]
        };
      }

      const validatedEntries = entries.map((entry, index) => {
        const errors = [];
        const sequenceId = entry.Sequence || `PO${index + 1}`;

        // Validation rules based on SAP metadata
        const validationRules = [
          {
            field: "LegacyPurchasingDocumentNumber",
            label: "Legacy Purchasing Document Number",
            validate: (value) => {
              // Optional field, but if present should be a string up to 10 characters
              return !value || (typeof value === 'string' && value.length <= 10);
            },
            errorMessage: "Legacy Purchasing Document Number must be a string up to 10 characters"
          },
          {
            field: "CompanyCode",
            label: "Company Code",
            validate: (value) => {
              return value && typeof value === 'string' && value.length <= 4;
            },
            errorMessage: "Company Code is required and must be up to 4 characters"
          },
          {
            field: "PurchasingDocumentType",
            label: "Purchasing Document Type",
            validate: (value) => {
              return value && typeof value === 'string' && value.length <= 4;
            },
            errorMessage: "Purchasing Document Type is required and must be up to 4 characters"
          },
          {
            field: "SupplierAccountNumber",
            label: "Supplier Account Number",
            validate: (value) => {
              return value && typeof value === 'string' && value.length <= 10;
            },
            errorMessage: "Supplier Account Number is required and must be up to 10 characters"
          },
          {
            field: "PurchasingOrganization",
            label: "Purchasing Organization",
            validate: (value) => {
              return value && typeof value === 'string' && value.length <= 4;
            },
            errorMessage: "Purchasing Organization is required and must be up to 4 characters"
          },
          {
            field: "PurchasingGroup",
            label: "Purchasing Group",
            validate: (value) => {
              return value && typeof value === 'string' && value.length <= 3;
            },
            errorMessage: "Purchasing Group is required and must be up to 3 characters"
          },
          {
            field: "PurchasingDocumentDate",
            label: "Purchasing Document Date",
            validate: (value) => {
              return value instanceof Date || (value && !isNaN(new Date(value).getTime()));
            },
            errorMessage: "Purchasing Document Date must be a valid date"
          },
          {
            field: "ItemNumberOfPurchasingDocument",
            label: "Item Number of Purchasing Document",
            validate: (value) => {
              return value && typeof value === 'string' && value.length <= 5;
            },
            errorMessage: "Item Number of Purchasing Document is required and must be up to 5 characters"
          },
          {
            field: "ProductNumber",
            label: "Product Number",
            validate: (value) => {
              return !value || (typeof value === 'string' && value.length <= 18);
            },
            errorMessage: "Product Number must be up to 18 characters"
          },
          {
            field: "Plant",
            label: "Plant",
            validate: (value) => {
              return value && typeof value === 'string' && value.length <= 4;
            },
            errorMessage: "Plant is required and must be up to 4 characters"
          },
          {
            field: "StorageLocation",
            label: "Storage Location",
            validate: (value) => {
              return !value || (typeof value === 'string' && value.length <= 4);
            },
            errorMessage: "Storage Location must be up to 4 characters"
          },
          {
            field: "OrderQuantity",
            label: "Order Quantity",
            validate: (value) => {
              // Ensure it's a positive number
              return value !== undefined && !isNaN(parseFloat(value)) && parseFloat(value) >= 0;
            },
            errorMessage: "Order Quantity is required and must be a non-negative number"
          },
          {
            field: "DeliveryDays",
            label: "Delivery Days",
            validate: (value) => {
              // Optional, but if present must be a non-negative number
              return value === undefined || (!isNaN(parseFloat(value)) && parseFloat(value) >= 0);
            },
            errorMessage: "Delivery Days must be a non-negative number"
          },
          {
            field: "NetPrice",
            label: "Net Price",
            validate: (value) => {
              // Optional, but if present must be a non-negative number
              return value === undefined || (!isNaN(parseFloat(value)) && parseFloat(value) >= 0);
            },
            errorMessage: "Net Price must be a non-negative number"
          },           
          {
            field: "TaxCode",
            label: "Tax Code",
            validate: (value) => {
              return !value || (typeof value === 'string' && value.length <= 2);
            },
            errorMessage: "Tax Code must be up to 2 characters"
          },
          {
            field: "Return",
            label: "Return",
            validate: (value) => {
              return !value || (typeof value === 'string' && value.length <= 10);
            },
            errorMessage: "Return Purchase Contract must be up to 10 characters"
          },
          {
            field: "PurchaseContractItem",
            label: "Purchase Contract Item",
            validate: (value) => {
              return !value || (typeof value === 'string' && value.length <= 5);
            },
            errorMessage: "Purchase Contract Item must be up to 5 characters"
          },
          {
            field: "AccountAssignmentnumber",
            label: "Account Assignment Number",
            validate: (value) => {
              return !value || (typeof value === 'string');
            },
            errorMessage: "Account Assignment Number must be a valid string"
          },
          {
            field: "WBSElementExternalID",
            label: "WBS Element External ID",
            validate: (value) => {
              return !value || (typeof value === 'string' && value.length <= 24);
            },
            errorMessage: "WBS Element External ID must be up to 24 characters"
          },
          {
            field: "CostCenter",
            label: "Cost Center",
            validate: (value) => {
              return !value || (typeof value === 'string' && value.length <= 10);
            },
            errorMessage: "Cost Center must be up to 10 characters"
          },
          {
            field: "GLAccountNumber",
            label: "GL Account Number",
            validate: (value) => {
              return !value || (typeof value === 'string' && value.length <= 10);
            },
            errorMessage: "GL Account Number must be up to 10 characters"
          },
          {
            field: "ItemText",
            label: "Item Text",
            validate: (value) => {
              return !value || (typeof value === 'string' && value.length <= 40);
            },
            errorMessage: "Item Text must be up to 40 characters"
          }
        ];

        // Validate each rule
        validationRules.forEach(rule => {
          const value = entry[rule.field];
          if (!rule.validate(value)) {
            errors.push({
              field: rule.field,
              message: rule.errorMessage,
              sheet: "Purchase Orders",
              sequenceId: sequenceId
            });
          }
        });

        // Add cross-field validations if needed
        // Example: Account Assignment Category checks
        if (entry.AccountAssignmentCategory === 'K' && !entry.CostCenter) {
          errors.push({
            field: "CostCenter",
            message: "Cost Center is required when Account Assignment Category is 'K'",
            sheet: "Purchase Orders",
            sequenceId: sequenceId
          });
        }

        if (entry.AccountAssignmentCategory === 'P' && !entry.WBSElementExternalID) {
          errors.push({
            field: "WBSElementExternalID",
            message: "WBS Element is required when Account Assignment Category is 'P'",
            sheet: "Purchase Orders",
            sequenceId: sequenceId
          });
        }

        // Calculate total value for business logic 
        const netPrice = parseFloat(entry.NetPrice || 0);
        const quantity = parseFloat(entry.OrderQuantity || 0);
        const totalValue = netPrice * quantity;

        // Add to entry for potential use later
        entry.TotalValue = totalValue;
   
        // Update entry with validation results
        return {
          ...entry,
          Status: errors.length > 0 ? "Invalid" : "Valid",
          ValidationErrors: errors,
          Sequence: sequenceId
        };
      });

      // Count valid and invalid entries
      const validEntries = validatedEntries.filter(
        (entry) => entry.Status === "Valid"
      );
      const invalidEntries = validatedEntries.filter(
        (entry) => entry.Status === "Invalid"
      );

      // Collect all errors
      const allErrors = validatedEntries.flatMap(
        (entry) => entry.ValidationErrors
      );

      return {
        isValid: allErrors.length === 0,
        entries: validatedEntries,
        validCount: validEntries.length,
        errorCount: invalidEntries.length,
        validEntries: validEntries,
        invalidEntries: invalidEntries,
        errors: allErrors
      };
    };

    /**
     * Validate a single purchase order entry
     * @param {object} entry - Purchase order entry to validate
     * @returns {object} Validation result for single entry
     */
    this.validateSinglePurchaseOrder = function (entry) {
      const result = this.validatePurchaseOrders([entry]);
      return {
        isValid: result.isValid,
        entry: result.entries[0],
        errors: result.errors
      };
    };

    /**
     * Format validation errors for display
     * @param {Array} errors - Validation errors to format
     * @returns {Array} Formatted errors for display
     */
    this.formatValidationErrors = function(errors) {
      if (!errors || !errors.length) {
        return [];
      }

      return errors.map(error => {
        // If error is already a string, wrap it in an object
        if (typeof error === 'string') {
          return {
            message: error,
            field: 'Unknown',
            sequenceId: 'N/A'
          };
        }

        // Ensure error has all required properties
        return {
          message: error.message || 'Unknown error',
          field: error.field || 'Unknown',
          sequenceId: error.sequenceId || 'N/A'
        };
      });
    };

    /**
     * Group errors by type for better display
     * @param {Array} errors - Validation errors to group
     * @returns {Object} Grouped errors by category
     */
    this.groupErrorsByType = function(errors) {
      if (!errors || !errors.length) {
        return {};
      }

      return errors.reduce((groups, error) => {
        // Extract error message and field
        const errorMessage = typeof error === 'string' ? error : error.message;
        const errorField = (typeof error === 'object' && error.field) ? error.field : 'Unknown';
        
        // Determine error type based on field and message content
        let errorType = "Data Validation";
        
        if (errorField === "AccountAssignmentCategory") {
          errorType = 'Account Assignment';
        } else if (["WBSElementExternalID", "CostCenter", "GLAccountNumber"].includes(errorField)) {
          errorType = 'Account Assignment Details';
        } else if (["CompanyCode", "PurchasingOrganization", "PurchasingGroup"].includes(errorField)) {
          errorType = 'Organizational Data';
        } else if (["PurchasingDocumentType", "PurchasingDocumentDate", "PurchasingDocumentNumber"].includes(errorField)) {
          errorType = 'Document Data';
        } else if (["ProductNumber", "Plant", "StorageLocation"].includes(errorField)) {
          errorType = 'Material Data';
        } else if (["OrderQuantity", "NetPrice", "PriceUnit"].includes(errorField)) {
          errorType = 'Pricing Data';
        } else if (errorField === "SupplierAccountNumber") {
          errorType = 'Supplier Data';
        } else if (errorMessage && errorMessage.includes('required')) {
          errorType = 'Missing Fields';
        } else if (errorMessage && errorMessage.includes('must be')) {
          errorType = 'Format Errors';
        }

        // Create category if it doesn't exist
        if (!groups[errorType]) {
          groups[errorType] = [];
        }
        
        // Add error to appropriate category
        groups[errorType].push(error);
        
        return groups;
      }, {});
    };
  };
});