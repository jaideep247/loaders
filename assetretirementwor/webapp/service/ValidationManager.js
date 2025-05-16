sap.ui.define(
  ["sap/ui/base/Object", "sap/ui/model/json/JSONModel"],
  function (BaseObject, JSONModel) {
    "use strict";

    /**
     * ValidationManager
     * Responsible for validating fixed asset retirement data based on constraints.
     */
    return BaseObject.extend(
      "assetretirementwor.service.ValidationManager",
      {
        /**
         * Validates an array of fixed asset retirement entries.
         * @param {Array<object>} entries - The entries to validate.
         * @returns {object} An object containing validation results (valid/invalid entries, counts, errors).
         */
        validateFixedAssetRetirementEntries: function (entries) {
          const validationResults = {
            entries: [...entries], // Keep original entries
            valid: [],
            invalid: [],
            totalCount: entries.length,
            validCount: 0,
            invalidCount: 0,
            errors: [], // Collect all errors from all entries
            isValid: true
          };

          entries.forEach((entry) => {
            // Ensure each entry has a ValidationErrors array initialized
            entry.ValidationErrors = entry.ValidationErrors || [];
            entry.Status = "Valid"; // Assume valid initially

            const validationResult = this.validateFixedAssetRetirementEntry(entry);

            if (!validationResult.isValid) {
              entry.Status = "Invalid"; // Mark as invalid if any errors found
              // Add errors found by validateFixedAssetRetirementEntry to the entry's list
              entry.ValidationErrors.push(...validationResult.errors);
              validationResults.invalid.push(entry);
              validationResults.invalidCount++;
              validationResults.errors.push(...validationResult.errors); // Add to overall error list
              validationResults.isValid = false; // Mark overall validation as invalid
            } else {
              // If no errors found by validateFixedAssetRetirementEntry, and Status wasn't already 'Invalid'
              if (entry.Status === "Valid") {
                validationResults.valid.push(entry);
                validationResults.validCount++;
              } else {
                // Entry might have been marked invalid earlier (e.g., during transformation)
                validationResults.invalid.push(entry);
                validationResults.invalidCount++;
                validationResults.errors.push(...entry.ValidationErrors); // Ensure existing errors are counted
                validationResults.isValid = false; // Mark overall validation as invalid
              }
            }
          });

          return validationResults;
        },

        /**
         * Validates a single fixed asset retirement entry.
         * @param {object} entry - The entry to validate.
         * @returns {{isValid: boolean, errors: Array<object>}} Result object.
         */
        validateFixedAssetRetirementEntry: function (entry) {
          const errors = []; // Collect errors for *this* entry validation pass

          // Required field validation with specific constraints
          this._validateRequiredFields(entry, errors);

          // Field format validations (only if required fields are present)
          this._validateFieldFormats(entry, errors);

          // Business logic validations (can be done even if formats are slightly off, depending on logic)
          this._validateBusinessLogic(entry, errors);

          // Add a unique identifier to each error for better tracking/display
          errors.forEach(err => {
            err.entryIdentifier = entry.SequenceID || entry._originalIndex; // Link error to entry
            err.severity = err.severity || 'Error'; // Default severity
            err.sequenceId = entry.SequenceID || 'N/A'; // Add sequenceId for UI display
          });

          return {
            isValid: errors.length === 0,
            errors: errors
          };
        },

        /**
         * Validates required fields and their lengths.
         * @param {object} entry - The entry data.
         * @param {Array<object>} errors - The array to push error objects into.
         * @private
         */
        _validateRequiredFields: function (entry, errors) {
          // Define required fields and their constraints based on retirement metadata
          // Combine required check and maxLength check
          const fieldConstraints = [
            // --- Key Fields ---
            { field: "CompanyCode", label: "Company Code", required: true, maxLength: 4, numeric: true },
            { field: "MasterFixedAsset", label: "Master Fixed Asset", required: true, maxLength: 12 },
            { field: "FixedAsset", label: "Fixed Asset (Sub-no.)", required: true, maxLength: 4 },
            { field: "BusinessTransactionType", label: "Business Transaction Type", required: true, maxLength: 4 },
            { field: "ReferenceDocumentItem", label: "Reference Document Item", required: true, maxLength: 6 },
            // --- Date Fields ---
            { field: "DocumentDate", label: "Document Date", required: true },
            { field: "PostingDate", label: "Posting Date", required: true },
            // { field: "AssetValueDate", label: "Asset Value Date", required: false }, // Often optional
            // --- Retirement Specific Fields ---
            { field: "FixedAssetRetirementType", label: "Retirement Type", required: true, maxLength: 1 },
      //      { field: "AstRtrmtAmtInTransCrcy", label: "Retirement Amount", required: true },
      //      { field: "FxdAstRtrmtRevnTransCrcy", label: "Transaction Currency", required: true, maxLength: 3 },
            // --- Optional but commonly used ---
            { field: "DocumentReferenceID", label: "Document Reference ID", required: false, maxLength: 16 },
            { field: "AccountingDocumentHeaderText", label: "Header Text", required: false, maxLength: 25 },
            { field: "DocumentItemText", label: "Item Text", required: false, maxLength: 50 },
            { field: "FxdAstRtrmtQuantityInBaseUnit", label: "Quantity", required: false },
            { field: "BaseUnitSAPCode", label: "Base Unit", required: false, maxLength: 3 },
            { field: "BaseUnitISOCode", label: "Base Unit ISO Code", required: false, maxLength: 3 },
            { field: "AccountingDocumentType", label: "Accounting Document Type", required: false, maxLength: 2 },
            { field: "AssignmentReference", label: "Assignment Reference", required: false, maxLength: 18 }
          ];

          fieldConstraints.forEach(({ field, label, required, maxLength, numeric }) => {
            const value = entry[field];
            const valueString = value?.toString() || ""; // Use empty string for length check if null/undefined

            // Check if required field is missing (null, undefined, or empty string)
            if (required && (value === null || value === undefined || valueString.trim() === "")) {
              errors.push({ field: field, message: `${label} is required.` });
            }
            // Check max length if value is present and maxLength is defined
            else if (maxLength && valueString.length > maxLength) {
              errors.push({ field: field, message: `${label} must not exceed ${maxLength} characters (found ${valueString.length}).` });
            }
            // Check if numeric if required
            else if (numeric && valueString && !/^\d+$/.test(valueString)) {
              errors.push({ field: field, message: `${label} must contain only digits.` });
            }
          });

          // Conditional requirement: Base Unit is required if Quantity is provided
          if (entry.FxdAstRtrmtQuantityInBaseUnit && !entry.BaseUnitSAPCode) {
            errors.push({ field: "BaseUnitSAPCode", message: "Base Unit is required when Quantity is provided." });
          }
        },

        /**
         * Validates specific field formats (Dates, Amounts, Quantities).
         * @param {object} entry - The entry data.
         * @param {Array<object>} errors - The array to push error objects into.
         * @private
         */
        _validateFieldFormats: function (entry, errors) {
          // Date validations (check if the value exists and is a string before validating format)
          const dateFields = [
            { field: "DocumentDate", label: "Document Date" },
            { field: "PostingDate", label: "Posting Date" },
            { field: "AssetValueDate", label: "Asset Value Date" }
          ];

          dateFields.forEach(({ field, label }) => {
            const dateValue = entry[field];
            // Only validate if dateValue is a non-empty string
            if (dateValue && typeof dateValue === 'string' && !this._isValidDate(dateValue)) {
              errors.push({ field: field, message: `${label} ('${dateValue}') must be a valid date in format YYYY-MM-DD.` });
            } else if (dateValue && typeof dateValue !== 'string') {
              // This case should ideally not happen if DataTransformer worked correctly
              errors.push({ field: field, message: `${label} has an unexpected data type (${typeof dateValue}). Expected YYYY-MM-DD string.` });
            }
          });

          // Amount validation for retirement amount
          if (entry.AstRtrmtAmtInTransCrcy === null && entry.Status !== "Invalid") {
            // Might indicate parsing/formatting error in transformer
          } else if (entry.AstRtrmtAmtInTransCrcy && typeof entry.AstRtrmtAmtInTransCrcy === 'string' && !/^-?\d+(\.\d+)?$/.test(entry.AstRtrmtAmtInTransCrcy)) {
            errors.push({ field: "AstRtrmtAmtInTransCrcy", message: `Retirement Amount ('${entry.AstRtrmtAmtInTransCrcy}') is not a valid number format.` });
          }

          // Quantity validation 
          if (entry.FxdAstRtrmtQuantityInBaseUnit === null && entry.Status !== "Invalid") {
            // Might indicate parsing/formatting error in transformer
          } else if (entry.FxdAstRtrmtQuantityInBaseUnit && typeof entry.FxdAstRtrmtQuantityInBaseUnit === 'string' && !/^-?\d+(\.\d{1,3})?$/.test(entry.FxdAstRtrmtQuantityInBaseUnit)) {
            errors.push({ field: "FxdAstRtrmtQuantityInBaseUnit", message: `Quantity ('${entry.FxdAstRtrmtQuantityInBaseUnit}') is not a valid number format (expected up to 3 decimals).` });
          }
        },

        /**
         * Validates business logic rules for fixed asset retirement.
         * @param {object} entry - The entry data.
         * @param {Array<object>} errors - The array to push error objects into.
         * @private
         */
        _validateBusinessLogic: function (entry, errors) {
          // Validate Reference Document Item format if present
          if (entry.ReferenceDocumentItem && !/^\d{1,6}$/.test(entry.ReferenceDocumentItem)) {
            errors.push({ field: "ReferenceDocumentItem", message: "Reference Document Item must be up to 6 digits." });
          }

          // Validate Business Transaction Type for retirement patterns
          if (entry.BusinessTransactionType && !this._isValidRetirementBusinessType(entry.BusinessTransactionType)) {
            errors.push({ field: "BusinessTransactionType", message: "Business Transaction Type is not valid for asset retirement. Expected patterns like RA* or AB*." });
          }

          // Validate Retirement Type (must be one of the expected values)
          if (entry.FixedAssetRetirementType && !this._isValidRetirementType(entry.FixedAssetRetirementType)) {
            errors.push({ field: "FixedAssetRetirementType", message: "Retirement Type must be one of the valid types (1-5)." });
          }

          // Validate Currency Code format if present
          if (entry.FxdAstRtrmtRevnTransCrcy && !/^[A-Z]{3}$/.test(entry.FxdAstRtrmtRevnTransCrcy)) {
            errors.push({ field: "FxdAstRtrmtRevnTransCrcy", message: "Transaction Currency must be a 3-letter uppercase code." });
          }

          // Check if Posting Date is in the future
          if (entry.PostingDate) {
            try {
              const postingDate = new Date(entry.PostingDate + "T00:00:00Z"); // Treat as UTC
              const today = new Date();
              today.setUTCHours(0, 0, 0, 0); // Set today to UTC start of day

              if (postingDate > today) {
                // Warning instead of error for this rule
                console.warn(`Validation Warning: Posting Date ${entry.PostingDate} is in the future.`);
              }
            } catch (e) { /* Ignore if date parsing failed - handled in format validation */ }
          }
        },

        /**
         * Checks if a string is a valid date in YYYY-MM-DD format.
         * @param {string} dateString - The date string to validate.
         * @returns {boolean} True if valid, false otherwise.
         * @private
         */
        _isValidDate: function (dateString) {
          // Check if it's a string first
          if (typeof dateString !== 'string') {
            return false;
          }
          // Regex check for YYYY-MM-DD format
          if (!dateString.match(/^\d{4}-\d{2}-\d{2}$/)) {
            return false;
          }
          // Check if it represents a valid date object
          const date = new Date(dateString + "T00:00:00Z"); // Use UTC to avoid timezone issues with date-only strings
          return date instanceof Date && !isNaN(date.getTime()) && date.toISOString().startsWith(dateString);
        },

        /**
         * Checks if a business transaction type is valid for retirement.
         * @param {string} businessType - The business transaction type code.
         * @returns {boolean} True if valid for retirement, false otherwise.
         * @private
         */
        _isValidRetirementBusinessType: function (businessType) {
          // Sample validation logic for retirement business types
          // RA* codes are typically used for retirements
          // Adjust this logic based on your specific business rules
          if (typeof businessType !== 'string') return false;

          // Common retirement business transaction type patterns
          const validPatterns = [
            /^RA\d+$/, // RA followed by digits (RA20, RA21, etc.)
            /^AB\d+$/, // AB followed by digits
            /^[rR][aA]\d*$/ // Case-insensitive RA pattern
          ];

          return validPatterns.some(pattern => pattern.test(businessType));
        },

        /**
         * Checks if a retirement type is valid.
         * @param {string} retirementType - The retirement type code.
         * @returns {boolean} True if valid, false otherwise.
         * @private
         */
        _isValidRetirementType: function (retirementType) {
          // Based on SAP fixed asset retirement types
          // 1: Sale, 2: Scrapping, 3: No revenue, etc.
          if (typeof retirementType !== 'string') return false;

          const validTypes = ["1", "2", "3", "4", "5"];
          return validTypes.includes(retirementType);
        },

        /**
         * Gets field constraints descriptions for help text
         * @returns {object} Field descriptions object
         */
        getFieldConstraintsDescription: function () {
          return {
            "SequenceID": "A unique identifier for the entry (optional, generated if not provided).",
            "ReferenceDocumentItem": "Required. Line item reference, up to 6 digits.",
            "BusinessTransactionType": "Required. Transaction type code (e.g., RA21 for retirement). Max 4 characters.",
            "CompanyCode": "Required. SAP company code, exactly 4 digits.",
            "MasterFixedAsset": "Required. Main asset number, up to 12 characters.",
            "FixedAsset": "Required. Asset subnumber, up to 4 characters. Use '0' for main assets.",
            "DocumentDate": "Required. Format: YYYY-MM-DD. The document's reference date.",
            "PostingDate": "Required. Format: YYYY-MM-DD. Date for general ledger posting.",
            "AssetValueDate": "Optional. Format: YYYY-MM-DD. When the asset value is affected.",
            "FixedAssetRetirementType": "Required. '1'=Sale, '2'=Scrapping, '3'=No revenue, etc.",
            "DocumentReferenceID": "Optional. Reference number, up to 16 characters.",
            "AccountingDocumentHeaderText": "Optional. Document header description, up to 25 characters.",
            "FxdAstRtrmtRevnTransCrcy": "Required. 3-letter ISO currency code (e.g., USD, EUR).",
            "AstRtrmtAmtInTransCrcy": "Required. Retirement amount in transaction currency (e.g., 5000.00).",
            "FxdAstRtrmtQuantityInBaseUnit": "Optional. Quantity being retired (e.g., 1.000).",
            "BaseUnitSAPCode": "Optional unless Quantity provided. SAP unit code (e.g., EA, PC).",
            "BaseUnitISOCode": "Optional. ISO unit code.",
            "AccountingDocumentType": "Optional. Document type code, up to 2 characters.",
            "AssignmentReference": "Optional. Assignment reference, up to 18 characters.",
            "DocumentItemText": "Optional. Line item description, up to 50 characters."
          };
        }
      }
    );
  }
);