sap.ui.define(["serviceentrysheet/utils/DataTransformer"], function (DataTransformer) {
  "use strict";

  /**
   * ValidationManager
   * Responsible for validating service entry sheet data based on SAP metadata constraints
   */
  return function (oController) {
    this.oController = oController;
    this._dataTransformer = new DataTransformer();

    /**
     * Field constraints derived from SAP metadata for Service Entry Sheets
     * Updated to include Service and QuantityUnit fields
     */
    this.fieldConstraints = {
      // Header fields with their metadata constraints
      "PurchasingOrganization": {
        required: true,
        maxLength: 4,
        type: "string",
        description: "Purchasing Organization"
      },
      "PurchasingGroup": {
        required: true,
        maxLength: 3,
        type: "string",
        description: "Purchasing Group"
      },
      "Currency": {
        required: true,
        maxLength: 5,
        type: "string",
        description: "Currency Key"
      },
      "ServiceEntrySheetName": {
        required: true,
        maxLength: 40,
        type: "string",
        description: "Name of Service Entry Sheet"
      },
      "Supplier": {
        required: true,
        maxLength: 10,
        type: "string",
        description: "Account Number of Supplier"
      },
      "PostingDate": {
        required: true,
        type: "date",
        description: "GR Posting Date"
      },
      "PurchaseOrder": {
        required: true,
        maxLength: 10,
        type: "string",
        description: "Reference Purchase Order"
      },

      // Item fields with their metadata constraints
      "ServiceEntrySheetItem": {
        required: true,
        maxLength: 5,
        type: "string",
        description: "Item Number of Service Entry Sheet"
      },
      "AccountAssignmentCategory": {
        required: true,
        maxLength: 1,
        type: "string",
        description: "Account Assignment Category"
      },
      "Service": {
        required: false, // Optional field based on API schema
        maxLength: 40,
        type: "string",
        description: "Service/Product Number"
      },
      "ConfirmedQuantity": {
        required: true,
        type: "decimal",
        precision: 13,
        scale: 3,
        minValue: -9999999999.999,
        maxValue: 9999999999.999,
        description: "Stated Quantity"
      },
      "QuantityUnit": {
        required: false, // Optional field based on API schema
        maxLength: 3,
        type: "string",
        description: "Unit of Measure for Service Entry Statement"
      },
      "Plant": {
        required: true,
        maxLength: 4,
        type: "string",
        description: "Plant"
      },
      "NetAmount": {
        required: true,
        type: "decimal",
        precision: 14,
        scale: 3,
        minValue: -99999999999.999,
        maxValue: 99999999999.999,
        description: "Stated Amount"
      },
      "NetPriceAmount": {
        required: true,
        type: "decimal",
        precision: 14,
        scale: 3,
        minValue: -99999999999.999,
        maxValue: 99999999999.999,
        description: "Price per Unit"
      },
      "PurchaseOrderItem": {
        required: true,
        maxLength: 5,
        type: "string",
        description: "Referenced Purchase Order Item"
      },
      "ServicePerformanceDate": {
        required: true,
        type: "date",
        description: "Date of Service Performance"
      },
      "ServicePerformanceEndDate": {
        required: true,
        type: "date",
        description: "End Date of Performance Period"
      }
    };

    /**
     * Account assignment field constraints
     */
    this.accountAssignmentConstraints = {
      "AccountAssignment": {
        required: false,
        maxLength: 2,
        type: "string",
        description: "Sequential Number of Account Assignment"
      },
      "CostCenter": {
        required: false,
        maxLength: 10,
        type: "string",
        description: "Cost Center"
      },
      "GLAccount": {
        required: false,
        maxLength: 10,
        type: "string",
        description: "G/L Account Number"
      },
      "WBSElement": {
        required: false,
        maxLength: 24,
        type: "string",
        description: "Work Breakdown Structure Element"
      }
    };

    /**
     * Validate service entry sheets
     * @param {array} entries - Service entry sheets to validate
     * @returns {object} Validation result with validated entries and errors
     */
    this.validateServiceEntrySheets = function (entries) {
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
              sheet: "Service Entry Sheets",
              sequenceId: "N/A"
            }
          ]
        };
      }

      const validatedEntries = entries.map((entry) => {
        const errors = [];
        const sequenceId = entry.ServiceEntrySheet || entry.SequenceNumber || "Unknown";

        // Validate required header fields
        const headerFields = [
          "PurchasingOrganization", "PurchasingGroup", "Currency",
          "ServiceEntrySheetName", "Supplier", "PostingDate", "PurchaseOrder"
        ];

        headerFields.forEach(fieldName => {
          const constraint = this.fieldConstraints[fieldName];
          const value = entry[fieldName];

          // Check if required field exists
          if (constraint.required && (!value || (typeof value === "string" && value.trim() === ""))) {
            errors.push({
              message: `${constraint.description} is required for Service Entry Sheet ${sequenceId}`,
              sheet: "Service Entry Sheets",
              sequenceId: sequenceId,
              field: fieldName
            });
            return; // Skip further validation for this field
          }

          // Skip validation if the field doesn't exist
          if (value === undefined || value === null) return;

          // Type-specific validation
          switch (constraint.type) {
            case "string":
              // Length validation
              if (constraint.maxLength && value.toString().length > constraint.maxLength) {
                errors.push({
                  message: `${constraint.description} exceeds maximum length of ${constraint.maxLength} characters for Service Entry Sheet ${sequenceId}`,
                  sheet: "Service Entry Sheets",
                  sequenceId: sequenceId,
                  field: fieldName
                });
              }
              break;

            case "date":
              const parsedDate = this._dataTransformer.parseDate(value);

              if (!parsedDate) {
                errors.push({
                  message: `Invalid ${constraint.description} for Service Entry Sheet ${sequenceId}. Must be a valid date.`,
                  sheet: "Service Entry Sheets",
                  sequenceId: sequenceId,
                  field: fieldName
                });
              }
              break;

            case "decimal":
              const numericValue = parseFloat(value);

              if (isNaN(numericValue)) {
                errors.push({
                  message: `${constraint.description} must be a valid number for Service Entry Sheet ${sequenceId}`,
                  sheet: "Service Entry Sheets",
                  sequenceId: sequenceId,
                  field: fieldName
                });
              } else {
                // Range validation
                if (constraint.minValue !== undefined && numericValue < constraint.minValue) {
                  errors.push({
                    message: `${constraint.description} must be greater than ${constraint.minValue} for Service Entry Sheet ${sequenceId}`,
                    sheet: "Service Entry Sheets",
                    sequenceId: sequenceId,
                    field: fieldName
                  });
                }
                if (constraint.maxValue !== undefined && numericValue > constraint.maxValue) {
                  errors.push({
                    message: `${constraint.description} must be less than ${constraint.maxValue} for Service Entry Sheet ${sequenceId}`,
                    sheet: "Service Entry Sheets",
                    sequenceId: sequenceId,
                    field: fieldName
                  });
                }

                // Precision/scale validation
                if (constraint.precision) {
                  const stringValue = numericValue.toString();
                  const parts = stringValue.split('.');
                  const integerPart = parts[0];
                  const decimalPart = parts.length > 1 ? parts[1] : '';

                  // Check total precision
                  if (integerPart.length + decimalPart.length > constraint.precision) {
                    errors.push({
                      message: `${constraint.description} exceeds maximum precision of ${constraint.precision} digits for Service Entry Sheet ${sequenceId}`,
                      sheet: "Service Entry Sheets",
                      sequenceId: sequenceId,
                      field: fieldName
                    });
                  }

                  // Check decimal scale
                  if (constraint.scale && decimalPart.length > constraint.scale) {
                    errors.push({
                      message: `${constraint.description} exceeds maximum scale of ${constraint.scale} decimal places for Service Entry Sheet ${sequenceId}`,
                      sheet: "Service Entry Sheets",
                      sequenceId: sequenceId,
                      field: fieldName
                    });
                  }
                }
              }
              break;
          }
        });

        // Validate item data if present
        if (Array.isArray(entry.Items)) {
          entry.Items.forEach((item, index) => {
            const itemId = item.ServiceEntrySheetItem || (index + 1).toString();

            // Updated item fields to include Service and QuantityUnit
            const itemFields = [
              "ServiceEntrySheetItem", "AccountAssignmentCategory", "Service", "ConfirmedQuantity",
              "QuantityUnit", "Plant", "NetAmount", "NetPriceAmount", "PurchaseOrderItem",
              "ServicePerformanceDate", "ServicePerformanceEndDate"
            ];

            itemFields.forEach(fieldName => {
              const constraint = this.fieldConstraints[fieldName];
              if (!constraint) return; // Skip if no constraint defined

              const value = item[fieldName];

              // Check if required field exists
              if (constraint.required && (!value || (typeof value === "string" && value.trim() === ""))) {
                errors.push({
                  message: `${constraint.description} is required for Item ${itemId} in Service Entry Sheet ${sequenceId}`,
                  sheet: "Service Entry Sheets",
                  sequenceId: sequenceId,
                  itemId: itemId,
                  field: fieldName
                });
                return; // Skip further validation for this field
              }

              // Skip validation if the field doesn't exist or is empty for optional fields
              if (value === undefined || value === null || 
                  (!constraint.required && typeof value === "string" && value.trim() === "")) {
                return;
              }

              // Type-specific validation
              switch (constraint.type) {
                case "string":
                  // Length validation
                  if (constraint.maxLength && value.toString().length > constraint.maxLength) {
                    errors.push({
                      message: `${constraint.description} exceeds maximum length of ${constraint.maxLength} characters for Item ${itemId} in Service Entry Sheet ${sequenceId}`,
                      sheet: "Service Entry Sheets",
                      sequenceId: sequenceId,
                      itemId: itemId,
                      field: fieldName
                    });
                  }
                  break;

                case "date":
                  const parsedDate = this._dataTransformer.parseDate(value);

                  if (!parsedDate) {
                    errors.push({
                      message: `Invalid ${constraint.description} for Item ${itemId} in Service Entry Sheet ${sequenceId}. Must be a valid date.`,
                      sheet: "Service Entry Sheets",
                      sequenceId: sequenceId,
                      itemId: itemId,
                      field: fieldName
                    });
                  }
                  break;

                case "decimal":
                  const numericValue = parseFloat(value);

                  if (isNaN(numericValue)) {
                    errors.push({
                      message: `${constraint.description} must be a valid number for Item ${itemId} in Service Entry Sheet ${sequenceId}`,
                      sheet: "Service Entry Sheets",
                      sequenceId: sequenceId,
                      itemId: itemId,
                      field: fieldName
                    });
                  } else {
                    // Range validation
                    if (constraint.minValue !== undefined && numericValue < constraint.minValue) {
                      errors.push({
                        message: `${constraint.description} must be greater than ${constraint.minValue} for Item ${itemId} in Service Entry Sheet ${sequenceId}`,
                        sheet: "Service Entry Sheets",
                        sequenceId: sequenceId,
                        itemId: itemId,
                        field: fieldName
                      });
                    }
                    if (constraint.maxValue !== undefined && numericValue > constraint.maxValue) {
                      errors.push({
                        message: `${constraint.description} must be less than ${constraint.maxValue} for Item ${itemId} in Service Entry Sheet ${sequenceId}`,
                        sheet: "Service Entry Sheets",
                        sequenceId: sequenceId,
                        itemId: itemId,
                        field: fieldName
                      });
                    }

                    // Precision/scale validation
                    if (constraint.precision) {
                      const stringValue = numericValue.toString();
                      const parts = stringValue.split('.');
                      const integerPart = parts[0];
                      const decimalPart = parts.length > 1 ? parts[1] : '';

                      // Check total precision
                      if (integerPart.length + decimalPart.length > constraint.precision) {
                        errors.push({
                          message: `${constraint.description} exceeds maximum precision of ${constraint.precision} digits for Item ${itemId} in Service Entry Sheet ${sequenceId}`,
                          sheet: "Service Entry Sheets",
                          sequenceId: sequenceId,
                          itemId: itemId,
                          field: fieldName
                        });
                      }

                      // Check decimal scale
                      if (constraint.scale && decimalPart.length > constraint.scale) {
                        errors.push({
                          message: `${constraint.description} exceeds maximum scale of ${constraint.scale} decimal places for Item ${itemId} in Service Entry Sheet ${sequenceId}`,
                          sheet: "Service Entry Sheets",
                          sequenceId: sequenceId,
                          itemId: itemId,
                          field: fieldName
                        });
                      }
                    }
                  }
                  break;
              }
            });

            // Business Rule: Service and QuantityUnit must both have values or both be blank
            const hasService = item.Service && typeof item.Service === "string" && item.Service.trim() !== "";
            const hasQuantityUnit = item.QuantityUnit && typeof item.QuantityUnit === "string" && item.QuantityUnit.trim() !== "";
            
            if (hasService !== hasQuantityUnit) {
              if (hasService && !hasQuantityUnit) {
                errors.push({
                  message: `QuantityUnit is required when Service is provided for Item ${itemId} in Service Entry Sheet ${sequenceId}`,
                  sheet: "Service Entry Sheets",
                  sequenceId: sequenceId,
                  itemId: itemId,
                  field: "QuantityUnit"
                });
              } else if (!hasService && hasQuantityUnit) {
                errors.push({
                  message: `Service is required when QuantityUnit is provided for Item ${itemId} in Service Entry Sheet ${sequenceId}`,
                  sheet: "Service Entry Sheets",
                  sequenceId: sequenceId,
                  itemId: itemId,
                  field: "Service"
                });
              }
            }

            // Validate account assignments if present
            if (Array.isArray(item.AccountAssignments)) {
              item.AccountAssignments.forEach((assignment, assignmentIndex) => {
                const assignmentId = assignment.AccountAssignment || (assignmentIndex + 1).toString();

                // Validate account assignment fields
                Object.keys(this.accountAssignmentConstraints).forEach(fieldName => {
                  const constraint = this.accountAssignmentConstraints[fieldName];
                  const value = assignment[fieldName];

                  // Check if required field exists
                  if (constraint.required && (!value || (typeof value === "string" && value.trim() === ""))) {
                    errors.push({
                      message: `${constraint.description} is required for Account Assignment ${assignmentId} in Item ${itemId}, Service Entry Sheet ${sequenceId}`,
                      sheet: "Service Entry Sheets",
                      sequenceId: sequenceId,
                      itemId: itemId,
                      assignmentId: assignmentId,
                      field: fieldName
                    });
                    return; // Skip further validation for this field
                  }

                  // Skip validation if the field doesn't exist
                  if (value === undefined || value === null) return;

                  // Type-specific validation for strings (only type used in account assignments)
                  if (constraint.type === "string") {
                    // Length validation
                    if (constraint.maxLength && value.toString().length > constraint.maxLength) {
                      errors.push({
                        message: `${constraint.description} exceeds maximum length of ${constraint.maxLength} characters for Account Assignment ${assignmentId} in Item ${itemId}, Service Entry Sheet ${sequenceId}`,
                        sheet: "Service Entry Sheets",
                        sequenceId: sequenceId,
                        itemId: itemId,
                        assignmentId: assignmentId,
                        field: fieldName
                      });
                    }
                  }
                });

                // At least one of CostCenter, GLAccount, or WBSElement must be provided
                if (!assignment.CostCenter && !assignment.GLAccount && !assignment.WBSElement) {
                  errors.push({
                    message: `At least one of Cost Center, G/L Account, or WBS Element must be provided for Account Assignment ${assignmentId} in Item ${itemId}, Service Entry Sheet ${sequenceId}`,
                    sheet: "Service Entry Sheets",
                    sequenceId: sequenceId,
                    itemId: itemId,
                    assignmentId: assignmentId,
                    field: "AccountAssignment"
                  });
                }
              });
            }
          });
        }

        // Update entry with validation results
        return {
          ...entry,
          Status: errors.length > 0 ? "Invalid" : "Valid",
          ValidationErrors: errors
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
        validData: validEntries,
        errors: allErrors
      };
    };

    /**
     * Get field constraints description for template generation and help
     * @returns {object} Field constraints object
     */
    this.getFieldConstraintsDescription = function () {
      return {
        ...this.fieldConstraints,
        ...this.accountAssignmentConstraints
      };
    };

    /**
     * Verify validation results for debugging
     * @param {object} validationResult - Validation result to verify
     * @returns {object} Original validation result after verification
     */
    this._verifyValidationResults = function (validationResult) {
      try {
        console.group("Validation Results Debug Info");

        // Check if validation result has expected structure
        if (!validationResult || typeof validationResult !== 'object') {
          console.error("Invalid validation result", validationResult);
          console.groupEnd();
          return validationResult;
        }

        // Log basic stats
        console.log("Total entries:", validationResult.entries?.length || 0);
        console.log("Valid count:", validationResult.validCount);
        console.log("Error count:", validationResult.errorCount);
        console.log("Is overall valid:", validationResult.isValid);

        // Log first few entries for debugging
        const sampleEntries = validationResult.entries?.slice(0, 3) || [];
        console.log("Sample entries:", sampleEntries);

        // Log first few errors for debugging
        const sampleErrors = validationResult.errors?.slice(0, 5) || [];
        console.log("Sample errors:", sampleErrors);

        // Verify error counts match
        const errorCount = validationResult.errors?.length || 0;
        const invalidCount = validationResult.errorCount || 0;
        if (errorCount > 0 && invalidCount === 0) {
          console.warn("Mismatch: Errors exist but errorCount is 0");
        }

        // Verify entry status consistency
        const entriesWithErrors = validationResult.entries?.filter(entry =>
          entry.ValidationErrors && entry.ValidationErrors.length > 0
        ).length || 0;
        const entriesMarkedInvalid = validationResult.entries?.filter(entry =>
          entry.Status === "Invalid"
        ).length || 0;

        if (entriesWithErrors !== entriesMarkedInvalid) {
          console.warn("Inconsistency: Entries with errors vs. entries marked invalid",
            { withErrors: entriesWithErrors, markedInvalid: entriesMarkedInvalid });

          // Apply fixes if needed
          if (validationResult.entries) {
            validationResult.entries = this._fixEntryStatus(validationResult.entries);
            console.log("Entry status fixed");
          }
        }

        console.groupEnd();
        return validationResult;
      } catch (error) {
        console.error("Error in _verifyValidationResults:", error);
        console.groupEnd();
        return validationResult;
      }
    };

    /**
     * Fix entry status to ensure consistency
     * @param {array} entries - Entries to fix
     * @returns {array} Fixed entries
     */
    this._fixEntryStatus = function (entries) {
      if (!Array.isArray(entries)) return [];

      return entries.map(entry => {
        // Create a copy to avoid modifying the original
        const fixedEntry = { ...entry };

        // If ValidationErrors array exists
        if (Array.isArray(fixedEntry.ValidationErrors)) {
          // Set Status based on ValidationErrors
          fixedEntry.Status = fixedEntry.ValidationErrors.length > 0 ? "Invalid" : "Valid";
        } else {
          // If no ValidationErrors array, create empty one and set Status to Valid
          fixedEntry.ValidationErrors = [];
          fixedEntry.Status = "Valid";
        }

        return fixedEntry;
      });
    };

    /**
     * Validate a single Service Entry Sheet
     * @param {object} entry - Service Entry Sheet to validate
     * @returns {object} Validation result for single entry
     */
    this.validateSingleServiceEntrySheet = function (entry) {
      const result = this.validateServiceEntrySheets([entry]);
      return {
        isValid: result.isValid,
        entry: result.entries[0],
        errors: result.errors
      };
    };
  };
});