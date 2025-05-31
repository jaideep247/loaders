// ValidationManager.js
sap.ui.define([
], function () {
  "use strict";

  /**
   * ValidationManager
   * Responsible for validating supplier invoice data based on metadata
   */
  return function (oController) {
    this.oController = oController;

    /**
     * Field validation constraints from metadata
     */
    this.fieldConstraints = {
      // Header fields
      "Sequence Id": { required: true, maxLength: 10 },
      "CompanyCode": { required: true, maxLength: 4, minLength: 1 },
      "DocumentDate": { required: true, format: "date" },
      "PostingDate": { required: true, format: "date" },
      "SupplierInvoiceIDByInvcgParty": { required: true, maxLength: 16 },
      "InvoicingParty": { required: true, maxLength: 10 },
      "DocumentCurrency": { required: true, maxLength: 5, minLength: 3, format: "currencyCode" },
      "InvoiceGrossAmount": { required: true, format: "amount", minValue: 0.01 },
      "DocumentHeaderText": { maxLength: 25 },
      "PaymentTerms": { maxLength: 4 },
      "AccountingDocumentType": { maxLength: 2 },
      "InvoiceReference": { maxLength: 10 },
      "InvoiceReferenceFiscalYear": { maxLength: 4 },
      "BusinessPlace": { maxLength: 4 },
      "TaxDeterminationDate": { format: "date" },
      "GSTPartner": { maxLength: 10 },
      "GSTPlaceOfSupply": { maxLength: 3 },
      "SupplierInvoiceItem": { maxLength: 6 },
      "s-CompanyCode": { maxLength: 4 },
      "CostCenter": { maxLength: 10 },

      // Debit fields
      "GLAccount": { required: true, maxLength: 10 },
      "WBSElement": { maxLength: 24 },
      "SupplierInvoiceItemAmount": { required: true, format: "amount" },
      "TaxCode": { maxLength: 2 },
      "DebitCreditCode": { required: true, maxLength: 1, validValues: ["S", "H"] },
      "SupplierInvoiceItemText": { maxLength: 50 },
      "AssignmentReference": { maxLength: 18 },
      "TDSTAXTYPE": { maxLength: 2 },
      "TDSTAXCODE": { maxLength: 2 },
      "TDSCurrency": { maxLength: 3 }
    };

    /**
     * Download the supplier invoice template Excel file
     */
    this.downloadTemplate = function () {
      const wb = this._createSupplierInvoiceTemplateWorkbook();
      XLSX.writeFile(wb, "Supplier_Invoice_Template.xlsx");
    };

    /**
     * Create supplier invoice template workbook with sample data
     * @returns {object} XLSX workbook object
     */
    this._createSupplierInvoiceTemplateWorkbook = function () {
      const wb = XLSX.utils.book_new();

      // Header_and_Credits Sheet
      const headerHeaders = [
        "Sequence Id", "CompanyCode", "DocumentDate", "PostingDate",
        "SupplierInvoiceIDByInvcgParty", "InvoicingParty", "DocumentCurrency",
        "InvoiceGrossAmount", "DocumentHeaderText", "PaymentTerms",
        "Supplierlineitemtext", "AccountingDocumentType", "InvoiceReference",
        "InvoiceReferenceFiscalYear", "AssignmentReference", "TaxIsCalculatedAutomatically",
        "BusinessPlace", "BusinessSectionCode", "TaxDeterminationDate",
        "GSTPartner", "GSTPlaceOfSupply", "SupplierInvoiceItem",
        "s-CompanyCode", "CostCenter"
      ];

      const headerData = [
        [
          1, "1000", "2025-01-12", "2025-01-12",
          "INV-001", "22000011", "INR",
          118000, "Office Supplies", "NT30",
          "Monthly office supplies", "KR", "5105600181",
          "2024", "OFFICE-001", "",
          "1007", "", "2025-01-12",
          "22000011", "HR", "1",
          "1000", "TSI"
        ]
      ];

      const headerSheet = XLSX.utils.aoa_to_sheet([headerHeaders, ...headerData]);
      XLSX.utils.book_append_sheet(wb, headerSheet, "Header_and_Credits");

      // Debits Sheet
      const debitHeaders = [
        "Sequence Id", "GLAccount", "WBSElement", "DocumentCurrency",
        "SupplierInvoiceItemAmount", "TaxCode", "DebitCreditCode",
        "SupplierInvoiceItemText", "AssignmentReference", "TDSTAXTYPE",
        "TDSTAXCODE", "TDSCurrency"
      ];

      const debitData = [
        [
          1, "66000110", "C-FINDIP-DL", "INR",
          118000, "G0", "S",
          "Office supplies", "99999 HSN", "3I",
          "I3", "INR"
        ]
      ];

      const debitSheet = XLSX.utils.aoa_to_sheet([debitHeaders, ...debitData]);
      XLSX.utils.book_append_sheet(wb, debitSheet, "Debits");

      return wb;
    };

    /**
     * Validate supplier invoice entries
     * @param {array} entries - Supplier invoice entries to validate
     * @returns {object} Validation result with validated entries and errors
     */
    this.validateSupplierInvoices = function (entries) {
      // Ensure entries is an array
      if (!Array.isArray(entries)) {
        console.error('Invalid entries input:', entries);
        entries = entries ? [entries] : [];
      }

      if (entries.length === 0) {
        return {
          isValid: false,
          entries: [],
          errors: [{
            message: 'No supplier invoice entries to validate',
            sheet: 'All',
            sequenceId: 'N/A'
          }]
        };
      }

      const validatedEntries = entries.map((entry) => {
        const errors = [];
        const sequenceId = entry['Sequence Id'] || 'Unknown';
        const sheet = entry['Sheet'] || 'Unknown';

        // Apply field validation based on constraints
        Object.keys(entry).forEach((field) => {
          if (this.fieldConstraints[field]) {
            const constraints = this.fieldConstraints[field];
            const value = entry[field];

            // Required field validation
            if (constraints.required && (!value || value.toString().trim() === "")) {
              errors.push({
                message: `${field} is required for supplier invoice with Sequence ID ${sequenceId}`,
                sheet: sheet,
                sequenceId: sequenceId,
                field: field
              });
            }

            // Only continue validation if we have a value
            if (value) {
              const stringValue = value.toString();

              // Length validation
              if (constraints.maxLength && stringValue.length > constraints.maxLength) {
                errors.push({
                  message: `${field} exceeds maximum length of ${constraints.maxLength} characters for supplier invoice with Sequence ID ${sequenceId}`,
                  sheet: sheet,
                  sequenceId: sequenceId,
                  field: field
                });
              }

              if (constraints.minLength && stringValue.length < constraints.minLength) {
                errors.push({
                  message: `${field} must be at least ${constraints.minLength} characters for supplier invoice with Sequence ID ${sequenceId}`,
                  sheet: sheet,
                  sequenceId: sequenceId,
                  field: field
                });
              }

              // Format validation
              if (constraints.format) {
                switch (constraints.format) {
                  case "date":
                    if (!this._isValidDate(value)) {
                      errors.push({
                        message: `${field} has invalid date format for supplier invoice with Sequence ID ${sequenceId}. Use YYYY-MM-DD format.`,
                        sheet: sheet,
                        sequenceId: sequenceId,
                        field: field
                      });
                    }
                    break;

                  case "amount":
                    const amount = parseFloat(value);
                    if (isNaN(amount)) {
                      errors.push({
                        message: `${field} must be a valid number for supplier invoice with Sequence ID ${sequenceId}`,
                        sheet: sheet,
                        sequenceId: sequenceId,
                        field: field
                      });
                    } else if (constraints.minValue && amount < constraints.minValue) {
                      errors.push({
                        message: `${field} must be greater than ${constraints.minValue} for supplier invoice with Sequence ID ${sequenceId}`,
                        sheet: sheet,
                        sequenceId: sequenceId,
                        field: field
                      });
                    }
                    break;

                  case "currencyCode":
                    if (!/^[A-Z]{3}$/.test(value)) {
                      errors.push({
                        message: `Invalid currency code for supplier invoice with Sequence ID ${sequenceId}. Must be 3 uppercase letters.`,
                        sheet: sheet,
                        sequenceId: sequenceId,
                        field: field
                      });
                    }
                    break;
                }
              }

              // Validate against allowed values
              if (constraints.validValues && !constraints.validValues.includes(value)) {
                errors.push({
                  message: `${field} must be one of the following values: ${constraints.validValues.join(', ')} for supplier invoice with Sequence ID ${sequenceId}`,
                  sheet: sheet,
                  sequenceId: sequenceId,
                  field: field
                });
              }
            }
          }
        });

        // Sheet-specific validations
        if (sheet === "Debits") {
          // Validate GL Account format
          if (entry['GLAccount']) {
            const glAccount = entry['GLAccount'].toString();
            if (glAccount.length > 10) {
              errors.push({
                message: `GL Account exceeds maximum length of 10 characters for supplier invoice with Sequence ID ${sequenceId}`,
                sheet: sheet,
                sequenceId: sequenceId,
                field: 'GLAccount'
              });
            }
          }

          // Validate Debit/Credit indicator
          if (entry['DebitCreditCode'] && !["S", "H"].includes(entry['DebitCreditCode'])) {
            errors.push({
              message: `Debit/Credit Code must be either 'S' (Debit) or 'H' (Credit) for supplier invoice with Sequence ID ${sequenceId}`,
              sheet: sheet,
              sequenceId: sequenceId,
              field: 'DebitCreditCode'
            });
          }
        }

        return {
          ...entry,
          status: errors.length > 0 ? "Invalid" : "Valid",
          validationErrors: errors
        };
      });

      // Group entries by Sequence ID for balance check
      const sequenceGroups = this._groupEntriesBySequenceId(validatedEntries);
      const balanceErrors = this._validateSupplierInvoiceBalances(sequenceGroups);

      // Add balance errors to the respective entries
      const finalValidatedEntries = validatedEntries.map(entry => {
        const sequenceId = entry['Sequence Id'];
        const balanceErrorsForSequence = balanceErrors[sequenceId] || [];

        // Combine field validation errors with balance errors
        const allErrors = [...entry.validationErrors, ...balanceErrorsForSequence];

        return {
          ...entry,
          status: allErrors.length > 0 ? "Invalid" : "Valid",
          validationErrors: allErrors
        };
      });

      // Collect all errors for the summary
      const allErrors = [
        ...validatedEntries.flatMap(entry => entry.validationErrors),
        ...Object.values(balanceErrors).flat()
      ];

      return {
        isValid: allErrors.length === 0,
        entries: finalValidatedEntries,
        errors: allErrors
      };
    };

    /**
     * Check if a value is a valid date in YYYY-MM-DD format
     * @param {string|Date} value - The date value to validate
     * @returns {boolean} True if valid date, false otherwise
     */
    this._isValidDate = function (value) {
      if (value instanceof Date) {
        return !isNaN(value.getTime());
      }

      const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
      if (!dateRegex.test(value)) {
        return false;
      }

      const parts = value.split('-');
      const year = parseInt(parts[0], 10);
      const month = parseInt(parts[1], 10) - 1;
      const day = parseInt(parts[2], 10);

      const date = new Date(year, month, day);

      return (
        date.getFullYear() === year &&
        date.getMonth() === month &&
        date.getDate() === day
      );
    };

    /**
     * Group entries by Sequence ID
     * @param {array} entries - Entries to group
     * @returns {object} Grouped entries by sequence ID
     */
    this._groupEntriesBySequenceId = function (entries) {
      if (!Array.isArray(entries)) {
        console.warn('Attempted to group non-array entries');
        return {};
      }

      return entries.reduce((groups, entry) => {
        const sequenceId = entry['Sequence Id'];
        if (!sequenceId) {
          console.warn('Entry without Sequence ID:', entry);
          return groups;
        }

        if (!groups[sequenceId]) {
          groups[sequenceId] = [];
        }
        groups[sequenceId].push(entry);
        return groups;
      }, {});
    };

    /**
     * Validate supplier invoice balances
     * For supplier invoices: Header amount should equal the sum of all debit line items
     * @param {object} sequenceGroups - Entries grouped by sequence ID
     * @returns {object} Validation errors by sequence ID
     */
    this._validateSupplierInvoiceBalances = function (sequenceGroups) {
      if (!sequenceGroups || typeof sequenceGroups !== 'object') {
        console.error('Invalid input to _validateSupplierInvoiceBalances', sequenceGroups);
        return {};
      }

      const sequenceErrors = {};

      // Iterate through each sequence group
      for (const [sequenceId, entries] of Object.entries(sequenceGroups)) {
        if (!Array.isArray(entries)) {
          console.warn(`Entries for Sequence ID ${sequenceId} is not an array`, entries);
          continue;
        }

        const groupErrors = [];
        let headerAmount = 0;
        let debitTotal = 0;
        let hasHeader = false;
        let hasDebits = false;
 
        console.log(`Validating balance for Sequence ID ${sequenceId}:`, entries);

        // Process each entry in the sequence group
        for (const entry of entries) {
          const sheet = entry['Sheet'] || '';

          if (sheet === "Header_and_Credits") {
            hasHeader = true;
            const amount = parseFloat(entry['InvoiceGrossAmount'] || 0);
            if (!isNaN(amount)) {
              headerAmount = amount;
              console.log(`Header amount for Sequence ID ${sequenceId}: ${headerAmount}`);
            }
          } else if (sheet === "Debits") {
            hasDebits = true;
            const amount = parseFloat(entry['SupplierInvoiceItemAmount'] || 0);
            if (!isNaN(amount)) {
              // For supplier invoices, debit amounts are positive
              // and should sum up to equal the header gross amount
              debitTotal += Math.abs(amount);
              console.log(`Adding debit amount for Sequence ID ${sequenceId}: ${Math.abs(amount)}, Running total: ${debitTotal}`);
            }
          }
        }

        console.log(`Final totals for Sequence ID ${sequenceId} - Header: ${headerAmount}, Debits: ${debitTotal}`);

        // Validate that we have both header and debit entries
        if (!hasHeader) {
          groupErrors.push({
            message: `Supplier invoice with Sequence ID ${sequenceId} is missing header information`,
            sheet: "Header_and_Credits",
            sequenceId: sequenceId
          });
        }

        if (!hasDebits) {
          groupErrors.push({
            message: `Supplier invoice with Sequence ID ${sequenceId} is missing debit line items`,
            sheet: "Debits",
            sequenceId: sequenceId
          });
        }

        // Check balance: Header gross amount should equal sum of debit line items
        // Using tolerance for floating point comparison
        if (hasHeader && hasDebits && Math.abs(headerAmount - debitTotal) > 0.01) {
          groupErrors.push({
            message: `Supplier invoice with Sequence ID ${sequenceId} is not balanced. ` +
              `Header gross amount: ${headerAmount.toFixed(2)}, Total debit line items: ${debitTotal.toFixed(2)}. ` +
              `Difference: ${Math.abs(headerAmount - debitTotal).toFixed(2)}`,
            sheet: "Balance",
            sequenceId: sequenceId
          });
        }

        // Store any errors for this sequence
        if (groupErrors.length > 0) {
          sequenceErrors[sequenceId] = groupErrors;
        }
      }

      return sequenceErrors;
    };

    /**
     * Handle unbalanced supplier invoices with UI feedback
     * @param {object} unbalancedInvoices - Object of unbalanced invoice errors by sequence ID
     */
    this.handleUnbalancedInvoices = function (unbalancedInvoices) {
      const errorMessage = Object.entries(unbalancedInvoices)
        .map(([sequenceId, errors]) =>
          `Sequence ID ${sequenceId}: ${errors.map(err => err.message).join('; ')}`
        )
        .join("\n");

      sap.m.MessageBox.error("Some supplier invoices are not balanced", {
        details: errorMessage
      });
    };
  };
});