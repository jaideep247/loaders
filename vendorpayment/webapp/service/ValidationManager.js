sap.ui.define([
], function () {
  "use strict";

  /**
   * ValidationManager
   * Responsible for validating journal entries data
   */
  return function(oController) {
    this.oController = oController;
    
    /**
     * Validate journal entries
     * @param {array} entries - Journal entries to validate
     * @returns {object} Validation result with validated entries and errors
     */
    this.validateJournalEntries = function(entries) {
      // Ensure entries is an array
      if (!Array.isArray(entries)) {
        console.error('Invalid entries input:', entries);
        entries = entries ? [entries] : [];
      }
      
      // If entries is empty, return an invalid result
      if (entries.length === 0) {
        return {
          isValid: false,
          entries: [],
          errors: [{
            message: 'No entries to validate',
            sheet: 'All',
            sequenceId: 'N/A'
          }]
        };
      }

      const validatedEntries = entries.map((entry) => {
        const errors = [];
        const sequenceId = entry['Sequence ID'] || 'Unknown';
        const sheet = entry['Sheet'] || 'Unknown';

        // Validate required fields
        const requiredFields = [
          'Sequence ID',
          'Accounting Document Type',
          'Company Code',
          'Document Date',
          'Posting Date',
        ];

        requiredFields.forEach((field) => {
          if (!entry[field] || entry[field].toString().trim() === "") {
            errors.push({
              message: `${field} is required for entry with Sequence ID ${sequenceId}`,
              sheet: sheet,
              sequenceId: sequenceId
            });
          }
        });

    /*    // Validate GL Account (should be 10 digits for bank entries)
        if (entry['Sheet'] === 'Bank Lines' && entry['GL Account']) {
          const glAccount = entry['GL Account'].toString();
          const glAccountRegex = /^\d{10}$/;
          
          if (!glAccountRegex.test(glAccount)) {
            errors.push({
              message: `GL Account must be a 10-digit number for entry with Sequence ID ${sequenceId}`,
              sheet: sheet,
              sequenceId: sequenceId
            });
          }
        }*/

        // Validate Currency Code
        if (entry['Currency']) {
          const currency = entry['Currency'].toString();
          const currencyRegex = /^[A-Z]{3}$/;
          
          if (!currencyRegex.test(currency)) {
            errors.push({
              message: `Invalid currency code for entry with Sequence ID ${sequenceId}. Must be 3 uppercase letters.`,
              sheet: sheet,
              sequenceId: sequenceId
            });
          }
        }

        // Validate numeric fields
        const numericFields = ['Amount'];

        numericFields.forEach((field) => {
          if (entry[field]) {
            const amount = parseFloat(entry[field]);
            if (isNaN(amount)) {
              errors.push({
                message: `${field} must be a valid number for entry with Sequence ID ${sequenceId}`,
                sheet: sheet,
                sequenceId: sequenceId
              });
            } else if (amount <= 0) {
              errors.push({
                message: `${field} must be greater than zero for entry with Sequence ID ${sequenceId}`,
                sheet: sheet,
                sequenceId: sequenceId
              });
            }
          } else {
            errors.push({
              message: `At least one of Debit or Credit amount must be specified for entry with Sequence ID ${sequenceId}`,
              sheet: sheet,
              sequenceId: sequenceId
            });
          }
        });

        // Validate date fields
        const dateFields = ['Document Date', 'Posting Date'];

        dateFields.forEach((field) => {
          if (entry[field]) {
            const dateValue = entry[field];
            const dateRegex = /^\d{4}-\d{2}-\d{2}$/; // Match YYYY-MM-DD format
            
            if (!(dateValue instanceof Date) && !dateRegex.test(dateValue)) {
              errors.push({
                message: `Invalid ${field.toLowerCase()} format for entry with Sequence ID ${sequenceId}. Use YYYY-MM-DD format.`,
                sheet: sheet,
                sequenceId: sequenceId
              });
            } else if (dateRegex.test(dateValue)) {
              // Additional validation for valid date
              const parts = dateValue.split('-');
              const year = parseInt(parts[0], 10);
              const month = parseInt(parts[1], 10) - 1; // 0-indexed month
              const day = parseInt(parts[2], 10);
              
              const date = new Date(year, month, day);
              
              if (date.getFullYear() !== year || date.getMonth() !== month || date.getDate() !== day) {
                errors.push({
                  message: `Invalid ${field.toLowerCase()} value for entry with Sequence ID ${sequenceId}`,
                  sheet: sheet,
                  sequenceId: sequenceId
                });
              }
            }
          }
        });

        return {
          ...entry,
          status: errors.length > 0 ? "Invalid" : "Valid",
          validationErrors: errors
        };
      });

      // Group entries by Sequence ID for balance check
      const sequenceGroups = this._groupEntriesBySequenceId(validatedEntries);
      const balanceErrors = this._validateTransactionBalances(sequenceGroups);

      // Collect all errors including balance errors but avoid duplicates
      const allErrors = [
        // Get all validation errors from entries
        ...validatedEntries.flatMap(entry => entry.validationErrors),
        // Add balance errors (which are already at sequence level)
        ...Object.values(balanceErrors).flat()
      ];

      // Create final validated entries without adding balance errors to individual entries
      const finalValidatedEntries = validatedEntries.map(entry => {
        const sequenceId = entry['Sequence ID'];
        const hasBalanceError = balanceErrors[sequenceId] && balanceErrors[sequenceId].length > 0;

        return {
          ...entry,
          status: hasBalanceError ? "Invalid" : entry.status,
          // Keep only the original validation errors for this entry
          // Do NOT add the balance errors here
          validationErrors: entry.validationErrors
        };
      });

      return {
        isValid: allErrors.length === 0,
        entries: finalValidatedEntries,
        errors: allErrors
      };
    };
    
    /**
     * Group entries by Sequence ID
     * @param {array} entries - Entries to group
     * @returns {object} Grouped entries by sequence ID
     */
    this._groupEntriesBySequenceId = function(entries) {
      // Ensure entries is an array
      if (!Array.isArray(entries)) {
        console.warn('Attempted to group non-array entries');
        return {};
      }

      return entries.reduce((groups, entry) => {
        const sequenceId = entry['Sequence ID'];
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
     * Validate transaction balances
     * @param {object} sequenceGroups - Entries grouped by sequence ID
     * @returns {object} Validation errors by sequence ID
     */
    this._validateTransactionBalances = function(sequenceGroups) {
      if (!sequenceGroups || typeof sequenceGroups !== 'object') {
        console.error('Invalid input to _validateTransactionBalances', sequenceGroups);
        return {};
      }
      const sequenceErrors = {};

      // Iterate through each sequence group
      for (const [sequenceId, entries] of Object.entries(sequenceGroups)) {
        // Additional defensive check
        if (!Array.isArray(entries)) {
          console.warn(`Entries for Sequence ID ${sequenceId} is not an array`, entries);
          continue;
        }

        const groupErrors = [];
        let totalAmount = 0;

        // Track indicators for this specific sequence
        const indicators = {
          debit: { H: false, S: false },
          credit: { H: false, S: false }
        };

        // Process entries for this sequence
        for (const entry of entries) {
          const indicator = entry["Indicator"];
          const sheetType = entry["Sheet"];
          const amount = parseFloat(entry["Amount"] || 0);

          // Track total amount (sign depends on indicator)
          totalAmount += indicator === "H" ? amount : -amount;
   
          // Track indicators
          if (sheetType === "Bank Lines") {
            if (indicator === "H") indicators.debit.H = true;
            if (indicator === "S") indicators.debit.S = true;
          } else if (sheetType === "Vendor Lines") {
            if (indicator === "H") indicators.credit.H = true;
            if (indicator === "S") indicators.credit.S = true;
          }
        }

        // Validate indicator pairing
        if (indicators.debit.H && !indicators.credit.S) {
          groupErrors.push({
            message: `Sequence ID ${sequenceId}: Missing 'S' indicator in Vendor Lines corresponding to 'H' in Bank Lines`,
            sheet: "Indicator Validation",
            sequenceId: sequenceId
          });
        }

        if (indicators.debit.S && !indicators.credit.H) {
          groupErrors.push({
            message: `Sequence ID ${sequenceId}: Missing 'H' indicator in Vendor Lines corresponding to 'S' in Bank Lines`,
            sheet: "Indicator Validation",
            sequenceId: sequenceId
          });
        }

        // Check transaction balance
        if (Math.abs(totalAmount) > 0.01) {
          groupErrors.push({
            message: `Transaction with Sequence ID ${sequenceId} is not balanced. Total difference: ${totalAmount.toFixed(2)}`,
            sheet: "Balance",
            sequenceId: sequenceId
          });
        }

        // Store any errors for this transaction
        if (groupErrors.length > 0) {
          sequenceErrors[sequenceId] = groupErrors;
        }
      }

      return sequenceErrors;
    };
    
    /**
     * Handle unbalanced transactions with UI feedback
     * @param {object} unbalancedTransactions - Object of unbalanced transaction errors by sequence ID
     */
    this.handleUnbalancedTransactions = function(unbalancedTransactions) {
      const errorMessage = Object.entries(unbalancedTransactions)
        .map(([sequenceId, errors]) =>
          `Sequence ID ${sequenceId}: ${errors.join('; ')}`
        )
        .join("\n");

      sap.m.MessageBox.error("Some transactions are not balanced", {
        details: errorMessage
      });
    };
  };
});