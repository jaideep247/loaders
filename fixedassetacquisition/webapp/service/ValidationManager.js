sap.ui.define(
  ["sap/ui/base/Object", "sap/ui/model/json/JSONModel"],
  function (BaseObject, JSONModel) {
    "use strict";

    /**
     * ValidationManager
     * Responsible for validating fixed asset acquisition data based on constraints.
     */
    return BaseObject.extend(
      "fixedassetacquisition.service.ValidationManager",
      {
        /**
         * Validates an array of fixed asset entries.
         * @param {Array<object>} entries - The entries to validate.
         * @returns {object} An object containing validation results (valid/invalid entries, counts, errors).
         */
        validateFixedAssetEntries: function (entries) {
          const validationResults = {
            entries: [...entries], // Keep original entries
            valid: [],
            invalid: [],
            totalCount: entries.length,
            validCount: 0,
            invalidCount: 0,
            allErrors: [] // Collect all errors from all entries
          };

          entries.forEach((entry) => {
            // Ensure each entry has a ValidationErrors array initialized
            entry.ValidationErrors = entry.ValidationErrors || [];
            entry.Status = "Valid"; // Assume valid initially

            const validationResult = this.validateFixedAssetEntry(entry);

            if (!validationResult.isValid) {
              entry.Status = "Invalid"; // Mark as invalid if any errors found
              // Add errors found by validateFixedAssetEntry to the entry's list
              entry.ValidationErrors.push(...validationResult.errors);
              validationResults.invalid.push(entry);
              validationResults.invalidCount++;
              validationResults.allErrors.push(...validationResult.errors); // Add to overall error list
            } else {
              // If no errors found by validateFixedAssetEntry, and Status wasn't already 'Invalid'
              if (entry.Status === "Valid") {
                 validationResults.valid.push(entry);
                 validationResults.validCount++;
              } else {
                 // Entry might have been marked invalid earlier (e.g., during transformation)
                 validationResults.invalid.push(entry);
                 validationResults.invalidCount++;
                 validationResults.allErrors.push(...entry.ValidationErrors); // Ensure existing errors are counted
              }
            }
          });

          return validationResults;
        },

        /**
         * Validates a single fixed asset entry.
         * @param {object} entry - The entry to validate.
         * @returns {{isValid: boolean, errors: Array<object>}} Result object.
         */
        validateFixedAssetEntry: function (entry) {
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
            // Define required fields and their constraints
            // Combine required check and maxLength check
            const fieldConstraints = [
                // --- Key Fields ---
                { field: "CompanyCode", label: "Company Code", required: true, maxLength: 4, numeric: true },
                { field: "MasterFixedAsset", label: "Master Fixed Asset", required: true, maxLength: 12 },
                { field: "FixedAsset", label: "Fixed Asset (Sub-no.)", required: true, maxLength: 4 }, // Often required, even if '0'
                { field: "BusinessTransactionType", label: "Business Transaction Type", required: true, maxLength: 4 },
                // --- Date Fields ---
                { field: "DocumentDate", label: "Document Date", required: true },
                { field: "PostingDate", label: "Posting Date", required: true },
                // { field: "AssetValueDate", label: "Asset Value Date", required: true }, // Often optional, defaults to PostingDate
                // --- Amount Fields ---
                { field: "AcqnAmtInTransactionCurrency", label: "Acquisition Amount", required: true },
                { field: "TransactionCurrency", label: "Transaction Currency", required: true, maxLength: 3 },
                // --- Account Fields ---
                { field: "OffsettingAccount", label: "Offsetting Account", required: true, maxLength: 10 },
                // --- Optional but commonly used ---
                { field: "ReferenceDocumentItem", label: "Reference Document Item", maxLength: 6 }, // Often optional or defaulted
                { field: "DocumentReferenceID", label: "Document Reference ID", maxLength: 16 },
                { field: "AccountingDocumentHeaderText", label: "Header Text", maxLength: 25 },
                { field: "DocumentItemText", label: "Item Text", maxLength: 50 },
                { field: "QuantityInBaseUnit", label: "Quantity" }, // Optional, but requires Unit if present
                { field: "BaseUnitSAPCode", label: "Base Unit", maxLength: 3 }, // Required if Quantity is present? Add logic below.
                // { field: "BaseUnitISOCode", label: "Base Unit ISO Code", maxLength: 3 }, // Often derived from SAP code
                { field: "AccountingDocumentType", label: "Accounting Document Type", maxLength: 2 }, // Often defaulted
                { field: "AssignmentReference", label: "Assignment Reference", maxLength: 18 },
                // { field: "DebitCreditCode", label: "Debit/Credit Code", maxLength: 1 }, // Often defaulted
                // { field: "FixedAssetYearOfAcqnCode", label: "Fixed Asset Year of Acquisition Code", maxLength: 1 } // Often derived
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
             if (entry.QuantityInBaseUnit && !entry.BaseUnitSAPCode) {
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
                // *** FIX: Only validate if dateValue is a non-empty string ***
                if (dateValue && typeof dateValue === 'string' && !this._isValidDate(dateValue)) {
                    errors.push({ field: field, message: `${label} ('${dateValue}') must be a valid date in format YYYY-MM-DD.` });
                } else if (dateValue && typeof dateValue !== 'string') {
                     // This case should ideally not happen if DataTransformer worked correctly
                     errors.push({ field: field, message: `${label} has an unexpected data type (${typeof dateValue}). Expected YYYY-MM-DD string.` });
                }
            });

            // Amount validation (check if it's a valid number string after transformation)
            // DataTransformer should format it correctly or return null
            if (entry.AcqnAmtInTransactionCurrency === null && entry.Status !== "Invalid") { // Check original raw value if needed
                 // Might indicate parsing/formatting error in transformer if amount was originally present
                 // errors.push({ field: "AcqnAmtInTransactionCurrency", message: "Acquisition Amount could not be processed." });
            } else if (entry.AcqnAmtInTransactionCurrency && typeof entry.AcqnAmtInTransactionCurrency === 'string' && !/^-?\d+(\.\d+)?$/.test(entry.AcqnAmtInTransactionCurrency)) {
                 errors.push({ field: "AcqnAmtInTransactionCurrency", message: `Acquisition Amount ('${entry.AcqnAmtInTransactionCurrency}') is not a valid number format.` });
            }


            // Quantity validation (check if it's a valid number string after transformation)
             if (entry.QuantityInBaseUnit === null && entry.Status !== "Invalid") {
                 // Might indicate parsing/formatting error in transformer if quantity was originally present
                 // errors.push({ field: "QuantityInBaseUnit", message: "Quantity could not be processed." });
             } else if (entry.QuantityInBaseUnit && typeof entry.QuantityInBaseUnit === 'string' && !/^-?\d+(\.\d{1,3})?$/.test(entry.QuantityInBaseUnit)) { // Allow up to 3 decimals
                 errors.push({ field: "QuantityInBaseUnit", message: `Quantity ('${entry.QuantityInBaseUnit}') is not a valid number format (expected up to 3 decimals).` });
            }
        },


        /**
         * Validates business logic rules.
         * @param {object} entry - The entry data.
         * @param {Array<object>} errors - The array to push error objects into.
         * @private
         */
        _validateBusinessLogic: function (entry, errors) {
            // Example: Validate Reference Document Item format if present
            if (entry.ReferenceDocumentItem && !/^\d{1,6}$/.test(entry.ReferenceDocumentItem)) {
                errors.push({ field: "ReferenceDocumentItem", message: "Reference Document Item must be up to 6 digits." });
            }

            // Example: Validate Business Transaction Type format if present
            if (entry.BusinessTransactionType && !/^[A-Z0-9]{3,4}$/.test(entry.BusinessTransactionType)) { // Allow 3 or 4 chars? Check spec
                 errors.push({ field: "BusinessTransactionType", message: "Business Transaction Type must be 3 or 4 uppercase alphanumeric characters." });
            }

             // Example: Validate Currency Code format if present
             if (entry.TransactionCurrency && !/^[A-Z]{3}$/.test(entry.TransactionCurrency)) {
                 errors.push({ field: "TransactionCurrency", message: "Transaction Currency must be a 3-letter uppercase code." });
             }

            // Example: Posting Date should not be in the future (simple check)
            if (entry.PostingDate) {
                try {
                    const postingDate = new Date(entry.PostingDate + "T00:00:00Z"); // Treat as UTC
                    const today = new Date();
                    today.setUTCHours(0, 0, 0, 0); // Set today to UTC start of day

                    if (postingDate > today) {
                        // errors.push({ field: "PostingDate", message: "Posting Date cannot be in the future." });
                         // Warning instead of error? Depends on requirements.
                         console.warn(`Validation Warning: Posting Date ${entry.PostingDate} is in the future.`);
                    }
                } catch (e) { /* Ignore if date parsing failed - handled in format validation */ }
            }

            // Add more complex cross-field validations or business rules here
            // e.g., if (entry.FieldA === 'X' && !entry.FieldB) { errors.push(...) }
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
        }
      }
    );
  }
);
