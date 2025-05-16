sap.ui.define(["grn/utils/DataTransformer"], function (DataTransformer) {
  "use strict";

  /**
   * ValidationManager
   * Responsible for validating material document data based on SAP metadata constraints
   */
  return function (oController) {
    this.oController = oController;
    this._dataTransformer = new DataTransformer();
    /**
     * Field constraints derived from SAP metadata
     * Only includes constraints for fields being actively validated
     */
    this.fieldConstraints = {
      // Required fields with their metadata constraints
      "SequenceNumber": {
        required: true,
        maxLength: 10,
        type: "string",
        pattern: /^\d+$/,
        description: "Sequence Number"
      },
      "GRNDocumentNumber": {
        required: true,
        maxLength: 10,
        type: "string",
        pattern: /^\d{1,10}$/,
        description: "GRN Document Number"
      },
      "DocumentDate": {
        required: true,
        type: "date",
        description: "Document Date",
        sap_type: "Edm.DateTime"
      },
      "PostingDate": {
        required: true,
        type: "date",
        description: "Posting Date",
        sap_type: "Edm.DateTime"
      },
      "Material": {
        required: true,
        maxLength: 40,
        type: "string",
        description: "Material",
        sap_type: "Edm.String"
      },
      "Plant": {
        required: true,
        maxLength: 4,
        type: "string",
        description: "Plant",
        sap_type: "Edm.String"
      },
      "StorageLocation": {
        required: true,
        maxLength: 4,
        type: "string",
        description: "Storage Location",
        sap_type: "Edm.String"
      },
      "GoodsMovementType": {
        required: true,
        maxLength: 3,
        type: "string",
        description: "Goods Movement Type",
        sap_type: "Edm.String"
      },
      "QuantityInEntryUnit": {
        required: true,
        type: "decimal",
        precision: 13,
        scale: 3,
        minValue: 0.001,
        description: "Quantity In Entry Unit",
        sap_type: "Edm.Decimal"
      },

      // Optional fields with their metadata constraints
      "PurchaseOrder": {
        required: false,
        maxLength: 10,
        type: "string",
        pattern: /^.{1,10}$/,
        description: "Purchase Order",
        sap_type: "Edm.String"
      },
      "PurchaseOrderItem": {
        required: false,
        maxLength: 5,
        type: "string",
        pattern: /^\d{1,5}$/,
        description: "Purchase Order Item",
        sap_type: "Edm.String"
      },
      "GoodsMovementRefDocType": {
        required: false,
        maxLength: 1,
        type: "string",
        description: "Goods Movement Ref Doc Type",
        sap_type: "Edm.String"
      },
      "EntryUnit": {
        required: false,
        maxLength: 3,
        type: "string",
        description: "Unit of Entry",
        sap_type: "Edm.String"
      }
    };

    /**
     * Validate material documents
     * @param {array} entries - Material documents to validate
     * @returns {object} Validation result with validated entries and errors
     */
    this.validateMaterialDocuments = function (entries) {
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
              sheet: "GRN",
              sequenceId: "N/A"
            }
          ]
        };
      }

      const validatedEntries = entries.map((entry) => {
        const errors = [];
        const sequenceId = entry.SequenceNumber || entry.id || "Unknown";

        // Validate required fields using metadata constraints
        const requiredFields = [
          { field: "SequenceNumber", label: "Sequence Number" },
          { field: "GRNDocumentNumber", label: "GRN Document Number" },
          { field: "DocumentDate", label: "Document Date" },
          { field: "PostingDate", label: "Posting Date" },
          { field: "Material", label: "Material" },
          { field: "Plant", label: "Plant" },
          { field: "StorageLocation", label: "Storage Location" },
          { field: "GoodsMovementType", label: "Goods Movement Type" },
          { field: "QuantityInEntryUnit", label: "Quantity In Entry Unit" }
        ];

        // Validate required fields existence
        requiredFields.forEach((fieldInfo) => {
          if (
            !entry[fieldInfo.field] ||
            (typeof entry[fieldInfo.field] === "string" &&
              entry[fieldInfo.field].trim() === "")
          ) {
            errors.push({
              message: `${fieldInfo.label} is required for entry with Sequence Number ${sequenceId}`,
              sheet: "GRN",
              sequenceId: sequenceId,
              field: fieldInfo.field
            });
          }
        });

        // Detailed validation based on metadata constraints for all fields
        Object.keys(this.fieldConstraints).forEach(fieldName => {
          // Skip validation if the field doesn't exist in the entry or already has a required error
          if (
            (entry[fieldName] === undefined || entry[fieldName] === null) ||
            (typeof entry[fieldName] === "string" && entry[fieldName].trim() === "")
          ) {
            // Already validated as required above, so skip additional validation
            return;
          }

          const constraint = this.fieldConstraints[fieldName];
          const value = entry[fieldName];

          // Type-specific validation
          switch (constraint.type) {
            case "string":
              // Length validation
              if (constraint.maxLength && value.toString().length > constraint.maxLength) {
                errors.push({
                  message: `${constraint.description} exceeds maximum length of ${constraint.maxLength} characters for entry with Sequence Number ${sequenceId}`,
                  sheet: "GRN",
                  sequenceId: sequenceId,
                  field: fieldName
                });
              }

              // Pattern validation if specified
              if (constraint.pattern && !constraint.pattern.test(value.toString())) {
                errors.push({
                  message: `${constraint.description} format is invalid for entry with Sequence Number ${sequenceId}`,
                  sheet: "GRN",
                  sequenceId: sequenceId,
                  field: fieldName
                });
              }
              break;

            case "date":
              const parsedDate = this._dataTransformer.parseDate(value);

              if (!parsedDate) {
                errors.push({
                  message: `Invalid ${constraint.description} for entry with Sequence Number ${sequenceId}. Must be a valid date.`,
                  sheet: "GRN",
                  sequenceId: sequenceId,
                  field: fieldName
                });
              }
              break;

            case "decimal":
              const numericValue = parseFloat(value);

              if (isNaN(numericValue)) {
                errors.push({
                  message: `${constraint.description} must be a valid number for entry with Sequence Number ${sequenceId}`,
                  sheet: "GRN",
                  sequenceId: sequenceId,
                  field: fieldName
                });
              } else if (constraint.minValue && numericValue < constraint.minValue) {
                errors.push({
                  message: `${constraint.description} must be greater than ${constraint.minValue} for entry with Sequence Number ${sequenceId}`,
                  sheet: "GRN",
                  sequenceId: sequenceId,
                  field: fieldName
                });
              }

              // Precision/scale validation for decimal values
              if (!isNaN(numericValue) && constraint.precision) {
                const stringValue = numericValue.toString();
                const parts = stringValue.split('.');
                const integerPart = parts[0];
                const decimalPart = parts.length > 1 ? parts[1] : '';

                // Check total precision (integer + decimal digits)
                if (integerPart.length + decimalPart.length > constraint.precision) {
                  errors.push({
                    message: `${constraint.description} exceeds maximum precision of ${constraint.precision} digits for entry with Sequence Number ${sequenceId}`,
                    sheet: "GRN",
                    sequenceId: sequenceId,
                    field: fieldName
                  });
                }

                // Check decimal scale
                if (constraint.scale && decimalPart.length > constraint.scale) {
                  errors.push({
                    message: `${constraint.description} exceeds maximum scale of ${constraint.scale} decimal places for entry with Sequence Number ${sequenceId}`,
                    sheet: "GRN",
                    sequenceId: sequenceId,
                    field: fieldName
                  });
                }
              }
              break;
          }
        });

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
     * Validate a specific material document entry
     * @param {object} entry - Material document entry to validate
     * @returns {object} Validation result for single entry
     */
    this.validateSingleMaterialDocument = function (entry) {
      const result = this.validateMaterialDocuments([entry]);
      return {
        isValid: result.isValid,
        entry: result.entries[0],
        errors: result.errors
      };
    };
  };
});