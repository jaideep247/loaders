sap.ui.define([
  "assetmastercreate/utils/DataTransformer"
], function (DataTransformer) {
  "use strict";

  /**
   * ValidationManager
   * Comprehensive validation for SAP Asset Master Create documents
   * @param {Object} oController - Controller instance
   */
  return function (oController) {
    this.oController = oController;
    this._dataTransformer = new DataTransformer();

    /**
     * Comprehensive field constraints derived from SAP WSDL metadata
     */
    this.fieldConstraints = {
      // Core Fields
      "SequenceNumber": {
        required: true,
        maxLength: 10,
        type: "string",
        pattern: /^\d+$/,
        description: "Sequence Number"
      },
      "CompanyCode": {
        required: true,
        maxLength: 4,
        type: "string",
        description: "Company Code"
      },
      "AssetClass": {
        required: true,
        maxLength: 8,
        type: "string",
        description: "Asset Class"
      },
      "AssetIsForPostCapitalization": {
        required: false,
        type: "string",
        description: "Asset for Post Capitalization"
      },

      // General Section
      "FixedAssetDescription": {
        required: false,
        maxLength: 50,
        type: "string",
        description: "Fixed Asset Description"
      },
      "AssetAdditionalDescription": {
        required: false,
        maxLength: 50,
        type: "string",
        description: "Asset Additional Description"
      },
      "AssetSerialNumber": {
        required: false,
        maxLength: 18,
        type: "string",
        description: "Asset Serial Number"
      },
      "BaseUnit": {
        required: false,
        maxLength: 3,
        type: "string",
        description: "Base Unit"
      },
      "InventoryNote": {
        required: false,
        maxLength: 15,
        type: "string",
        description: "Inventory Note"
      },

      // Account Assignment
      "WBSElementExternalID": {
        required: false,
        maxLength: 24,
        type: "string",
        description: "WBS Element External ID"
      },
      "Room": {
        required: false,
        maxLength: 8,
        type: "string",
        description: "Room"
      },

      // Ledger Information (array)
      "LedgerInformation": {
        type: "array",
        description: "Ledger Information",
        itemConstraints: {
          "Ledger": {
            required: false,
            maxLength: 2,
            type: "string",
            description: "Ledger Code"
          },
          "AssetCapitalizationDate": {
            required: false,
            type: "string",
            description: "Asset Capitalization Date"
          }
        }
      },

      // Valuation (array)
      "Valuation": {
        type: "array",
        description: "Valuation",
        itemConstraints: {
          "AssetDepreciationArea": {
            required: true,
            type: "number",
            minValue: 0,
            maxValue: 99,
            description: "Asset Depreciation Area"
          },
          "NegativeAmountIsAllowed": {
            required: false,
            type: "boolean",
            description: "Negative Amount Is Allowed"
          },
          "DepreciationStartDate": {
            required: false,
            type: "date",
            description: "Depreciation Start Date"
          }
        }
      },

      // Time-Based Valuation (array)
      "TimeBasedValuation": {
        type: "array",
        description: "Time-Based Valuation",
        itemConstraints: {
          "AssetDepreciationArea": {
            required: true,
            type: "number",
            minValue: 0,
            maxValue: 99,
            description: "Asset Depreciation Area"
          },
          "DepreciationKey": {
            required: false,
            maxLength: 4,
            type: "string",
            description: "Depreciation Key"
          },
          "PlannedUsefulLifeInYears": {
            required: false,
            type: "number",
            minValue: 0,
            maxValue: 999,
            description: "Planned Useful Life in Years"
          },
          "PlannedUsefulLifeInPeriods": {
            required: false,
            type: "number",
            minValue: 0,
            maxValue: 999,
            description: "Planned Useful Life in Periods"
          },
          "ScrapAmountInCoCodeCrcy": {
            required: false,
            type: "decimal",
            precision: 28,
            scale: 6,
            description: "Scrap Amount in Company Code Currency"
          },
          "currencyCode": {
            required: false,
            maxLength: 3,
            type: "string",
            description: "Currency Code"
          },
          "AcqnProdnCostScrapPercent": {
            required: false,
            type: "decimal",
            minValue: -999.99999999999,
            maxValue: 999.99999999999,
            precision: 14,
            scale: 11,
            description: "Acquisition/Production Cost Scrap Percent"
          }
        }
      },

      // India-specific fields
      "IN_AssetBlock": {
        required: false,
        maxLength: 5,
        type: "string",
        description: "India Asset Block"
      },
      "IN_AssetPutToUseDate": {
        required: false,
        type: "date",
        description: "India Asset Put To Use Date"
      },
      "IN_AssetIsPriorYear": {
        required: false,
        type: "string",
        description: "India Asset Is Prior Year"
      },

      // Custom Fields
      "YY1_WBS_ELEMENT": {
        required: false,
        maxLength: 20,
        type: "string",
        description: "Custom WBS Element"
      }
    };

    /**
     * Validate Asset Master Create Documents
     * @param {Array} entries - Asset master entries to validate
     * @returns {Object} Validation result
     */
    this.validateAssetMasterCreateDocuments = function (entries) {
      // Validate input
      if (!Array.isArray(entries)) {
        entries = entries && entries.entries ? entries.entries : [];
      }

      // No entries case
      if (entries.length === 0) {
        return {
          isValid: false,
          entries: [],
          validCount: 0,
          errorCount: 0,
          errors: [{
            message: "No entries to validate",
            sheet: "Asset Master Data",
            sequenceId: "N/A"
          }]
        };
      }

      // Validate each entry
      const validatedEntries = entries.map((entry, index) => {
        const errors = [];
        const sequenceId = entry.SequenceNumber || `Row ${index + 1}`;

        // Validate core required fields
        const requiredFields = [
          { field: "SequenceNumber", label: "Sequence Number" },
          { field: "CompanyCode", label: "Company Code" },
          { field: "AssetClass", label: "Asset Class" }
        ];

        requiredFields.forEach(fieldInfo => {
          if (!entry[fieldInfo.field] ||
            (typeof entry[fieldInfo.field] === "string" &&
              entry[fieldInfo.field].trim() === "")) {
            errors.push({
              message: `${fieldInfo.label} is required`,
              sheet: "Asset Master Data",
              sequenceId: sequenceId,
              field: fieldInfo.field
            });
          }
        });

        // Detailed validation for each defined field constraint
        Object.keys(this.fieldConstraints).forEach(fieldName => {
          const constraint = this.fieldConstraints[fieldName];

          // Skip array-type constraints (handled separately)
          if (constraint.type === "array") return;

          const value = entry[fieldName];

          // Skip if value is undefined and not required
          if (value === undefined || value === null) {
            if (constraint.required) {
              errors.push({
                message: `${constraint.description} is required`,
                sheet: "Asset Master Data",
                sequenceId: sequenceId,
                field: fieldName
              });
            }
            return;
          }

          // Type-specific validations
          this._validateField(value, constraint, fieldName, sequenceId, errors);
        });

        // Validate array-type structures
        this._validateArrayStructures(entry, errors, sequenceId);

        return {
          ...entry,
          Status: errors.length > 0 ? "Invalid" : "Valid",
          ValidationErrors: errors
        };
      });

      // Compute overall validation results
      const validEntries = validatedEntries.filter(entry => entry.Status === "Valid");
      const invalidEntries = validatedEntries.filter(entry => entry.Status === "Invalid");

      const allErrors = validatedEntries.flatMap(entry => entry.ValidationErrors);

      return {
        isValid: allErrors.length === 0,
        entries: validatedEntries,
        validCount: validEntries.length,
        errorCount: invalidEntries.length,
        errors: allErrors
      };
    };

    /**
     * Validate a single field against its constraints
     * @param {*} value - Field value to validate
     * @param {Object} constraint - Field constraints
     * @param {string} fieldName - Field name
     * @param {string} sequenceId - Sequence identifier
     * @param {Array} errors - Error collection array
     */
    this._validateField = function (value, constraint, fieldName, sequenceId, errors) {
      // Skip validation if value is empty and not required
      if ((value === undefined || value === null || value === "") && !constraint.required) {
        return;
      }

      switch (constraint.type) {
        case "string":
          const strValue = value.toString();
          if (constraint.maxLength && strValue.length > constraint.maxLength) {
            errors.push({
              message: `${constraint.description} exceeds max length of ${constraint.maxLength}`,
              sheet: "Asset Master Data",
              sequenceId: sequenceId,
              field: fieldName
            });
          }
          if (constraint.pattern && !constraint.pattern.test(strValue)) {
            errors.push({
              message: `${constraint.description} has invalid format`,
              sheet: "Asset Master Data",
              sequenceId: sequenceId,
              field: fieldName
            });
          }
          break;

        case "number":
        case "decimal":
          const numValue = Number(value);
          if (isNaN(numValue)) {
            errors.push({
              message: `${constraint.description} must be a valid number`,
              sheet: "Asset Master Data",
              sequenceId: sequenceId,
              field: fieldName
            });
          } else {
            if (constraint.minValue !== undefined && numValue < constraint.minValue) {
              errors.push({
                message: `${constraint.description} must be >= ${constraint.minValue}`,
                sheet: "Asset Master Data",
                sequenceId: sequenceId,
                field: fieldName
              });
            }
            if (constraint.maxValue !== undefined && numValue > constraint.maxValue) {
              errors.push({
                message: `${constraint.description} must be <= ${constraint.maxValue}`,
                sheet: "Asset Master Data",
                sequenceId: sequenceId,
                field: fieldName
              });
            }
            // For decimal fields, check precision and scale
            if (constraint.type === "decimal") {
              const parts = value.toString().split('.');
              const integerPart = parts[0].replace('-', '');
              const decimalPart = parts[1] || '';

              if (constraint.precision && (integerPart.length + decimalPart.length) > constraint.precision) {
                errors.push({
                  message: `${constraint.description} exceeds maximum precision of ${constraint.precision} digits`,
                  sheet: "Asset Master Data",
                  sequenceId: sequenceId,
                  field: fieldName
                });
              }
              if (constraint.scale && decimalPart.length > constraint.scale) {
                errors.push({
                  message: `${constraint.description} exceeds maximum scale of ${constraint.scale} decimal places`,
                  sheet: "Asset Master Data",
                  sequenceId: sequenceId,
                  field: fieldName
                });
              }
            }
          }
          break;

        case "boolean":
          if (typeof value !== "boolean" &&
            !(value === "true" || value === "false" || value === "1" || value === "0")) {
            errors.push({
              message: `${constraint.description} must be a boolean value`,
              sheet: "Asset Master Data",
              sequenceId: sequenceId,
              field: fieldName
            });
          }
          break;

        case "date":
          // Only validate if we have a value
          if (value) {
            const parsedDate = this._dataTransformer.parseDate(value);
            if (!parsedDate) {
              errors.push({
                message: `${constraint.description} must be a valid date`,
                sheet: "Asset Master Data",
                sequenceId: sequenceId,
                field: fieldName
              });
            }
          }
          break;
      }
    };

    /**
     * Validate array-type structures within an entry
     * @param {Object} entry - Entry to validate
     * @param {Array} errors - Error collection array
     * @param {string} sequenceId - Sequence identifier
     */
    this._validateArrayStructures = function (entry, errors, sequenceId) {
      // Validate Ledger Information 
      
      if (entry.LedgerInformation) {
        if (!Array.isArray(entry.LedgerInformation)) {
          errors.push({
            message: "LedgerInformation must be an array",
            sheet: "Asset Master Data",
            sequenceId: sequenceId
          });
        } else {
          entry.LedgerInformation.forEach((ledger, idx) => {
            Object.keys(this.fieldConstraints.LedgerInformation.itemConstraints).forEach(field => {
              const constraint = this.fieldConstraints.LedgerInformation.itemConstraints[field];
              const value = ledger[field];

              if (value !== undefined && value !== null) {
                this._validateField(value, constraint, `LedgerInformation[${idx}].${field}`, sequenceId, errors);
              } else if (constraint.required) {
                errors.push({
                  message: `${constraint.description} is required in LedgerInformation[${idx}]`,
                  sheet: "Asset Master Data",
                  sequenceId: sequenceId,
                  field: `LedgerInformation[${idx}].${field}`
                });
              }
            });
          });
        }
      }

      // Validate Valuation
      if (entry.Valuation) {
        if (!Array.isArray(entry.Valuation)) {
          errors.push({
            message: "Valuation must be an array",
            sheet: "Asset Master Data",
            sequenceId: sequenceId
          });
        } else {
          entry.Valuation.forEach((valuation, idx) => {
            Object.keys(this.fieldConstraints.Valuation.itemConstraints).forEach(field => {
              const constraint = this.fieldConstraints.Valuation.itemConstraints[field];
              const value = valuation[field];

              if (value !== undefined && value !== null) {
                this._validateField(value, constraint, `Valuation[${idx}].${field}`, sequenceId, errors);
              } else if (constraint.required) {
                errors.push({
                  message: `${constraint.description} is required in Valuation[${idx}]`,
                  sheet: "Asset Master Data",
                  sequenceId: sequenceId,
                  field: `Valuation[${idx}].${field}`
                });
              }
            });
          });
        }
      }

      // Validate Time-Based Valuation
      if (entry.TimeBasedValuation) {
        if (!Array.isArray(entry.TimeBasedValuation)) {
          errors.push({
            message: "TimeBasedValuation must be an array",
            sheet: "Asset Master Data",
            sequenceId: sequenceId
          });
        } else {
          entry.TimeBasedValuation.forEach((tbv, idx) => {
            Object.keys(this.fieldConstraints.TimeBasedValuation.itemConstraints).forEach(field => {
              const constraint = this.fieldConstraints.TimeBasedValuation.itemConstraints[field];
              const value = tbv[field];

              if (value !== undefined && value !== null) {
                this._validateField(value, constraint, `TimeBasedValuation[${idx}].${field}`, sequenceId, errors);
              } else if (constraint.required) {
                errors.push({
                  message: `${constraint.description} is required in TimeBasedValuation[${idx}]`,
                  sheet: "Asset Master Data",
                  sequenceId: sequenceId,
                  field: `TimeBasedValuation[${idx}].${field}`
                });
              }
            });
          });
        }
      }
    };
  };
});