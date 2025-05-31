sap.ui.define([
], function () {
  "use strict";

  /**
   * ValidationManager
   * Responsible for validating journal entries data based on WSDL metadata
   */
  return function(oController) {
    this.oController = oController;
    
    /**
     * Field validation constraints from WSDL metadata
     * Used to validate input data against SAP field requirements
     */
    this.fieldConstraints = {
      // Header fields
      "Sequence ID": { required: true, maxLength: 35 },
      "Accounting Document Type": { required: true, maxLength: 5, minLength: 1 },
      "Document Reference ID": { required: true, maxLength: 16, minLength: 1 },
      "Document Header Text": { maxLength: 25 },
      "Company Code": { required: true, maxLength: 4, minLength: 1 },
      "Document Date": { required: true, format: "date" },
      "Posting Date": { required: true, format: "date" },
      "Created By": { maxLength: 12 },
      
      // Transaction line fields
      "Reference Document Item": { required: true, maxLength: 10, minLength: 1 },     
      "Vendor Code": { required: true, maxLength: 10, minLength: 1 },
      "Indicator": { required: true, maxLength: 1, validValues: ["S", "H"] },
      "Currency": { required: true, maxLength: 3, minLength: 3, format: "currencyCode" },
      "Amount": { required: true, format: "amount", minValue: 0.01 },
      "Assignment": { maxLength: 18 },
      "Item Text": { maxLength: 50 },
      "Reference Key": { maxLength: 12 },
      "Reference Key 1": { maxLength: 12 },
      "Business Place": { maxLength: 4 },
      "Account ID": { maxLength: 5 },
      "Special GL Code": { maxLength: 1 },
    };

    /**
     * Download the template Excel file
     */
    this.downloadTemplate = function() {
      const wb = this._createTemplateWorkbook();
      XLSX.writeFile(wb, "Vendor_to_Vendor.xlsx");
    };
    
    /**
     * Create template workbook with sample data
     * @returns {object} XLSX workbook object
     */
    this._createTemplateWorkbook = function() {
      const wb = XLSX.utils.book_new();

      // Header Sheet
      const headerHeaders = [
        "Sequence ID",
        "Accounting Document Type",
        "Document Reference ID",
        "Document Header Text",
        "Company Code",
        "Document Date",
        "Posting Date"
      ];
      const headerData = [
        [
          "1",
          "Z2",
          "REF_001",
          "MTB from Axis",
          "1000",
          "2025-04-10",
          "2025-04-10"
        ]
      ];
      const headerSheet = XLSX.utils.aoa_to_sheet([
        headerHeaders,
        ...headerData
      ]);
      XLSX.utils.book_append_sheet(wb, headerSheet, "Header");

      // Vendor Debit Lines Sheet
      const vendorDrLines = [
        "Sequence ID",
        "Reference Document Item",
        "Indicator (S-Dr, H-Cr.)",
        "Vendor Code",
        "Currency",
        "Amount",
        "Assignment",
        "Reference Key 1",
        "Item Text",       
        "Business Place",
        "Special GL Code"
      ];
      const vendorDrData = [
        [
          "1",
          "1",
          "S",
          "21000014",
          "INR",
          "1000",
          "Axis Vendor",
          "Ref Vendor",
          "Item Vendor",
          "1007",
          "B"
        ]
      ];
      const vendorDrSheet = XLSX.utils.aoa_to_sheet([vendorDrLines, ...vendorDrData]);
      XLSX.utils.book_append_sheet(wb, vendorDrSheet, "Vendor Debit Lines");

      // Vendor Credit Lines Sheet
      const vendorCrLines = [
        "Sequence ID",
        "Reference Document Item",
        "Indicator (S-Dr, H-Cr.)",
        "Vendor Code",
        "Currency",
        "Amount",
        "Assignment",
        "Reference Key 1",       
        "Item Text",
        "Business Place",
        "Special GL Code",
      ];
      const vendorCrData = [
        [
          "1",
          "1",
          "H",
          "21000014",
          "INR",
          "1000",
          "Axis Vendor",
          "Ref Vendor",
          "Item Vendor",
          "1007",
          "B"
        ]
      ];
      const vendorCrSheet = XLSX.utils.aoa_to_sheet([
        vendorCrLines,
        ...vendorCrData
      ]);
      XLSX.utils.book_append_sheet(
        wb,
        vendorCrSheet,
        "Vendor Credit Lines"
      );

      return wb;
    };

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

        // Apply field validation based on constraints
        Object.keys(entry).forEach((field) => {
          if (this.fieldConstraints[field]) {
            const constraints = this.fieldConstraints[field];
            const value = entry[field];
            
            // Required field validation
            if (constraints.required && (!value || value.toString().trim() === "")) {
              errors.push({
                message: `${field} is required for entry with Sequence ID ${sequenceId}`,
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
                  message: `${field} exceeds maximum length of ${constraints.maxLength} characters for entry with Sequence ID ${sequenceId}`,
                  sheet: sheet,
                  sequenceId: sequenceId,
                  field: field
                });
              }
              
              if (constraints.minLength && stringValue.length < constraints.minLength) {
                errors.push({
                  message: `${field} must be at least ${constraints.minLength} characters for entry with Sequence ID ${sequenceId}`,
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
                        message: `${field} has invalid date format for entry with Sequence ID ${sequenceId}. Use YYYY-MM-DD format.`,
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
                        message: `${field} must be a valid number for entry with Sequence ID ${sequenceId}`,
                        sheet: sheet,
                        sequenceId: sequenceId,
                        field: field
                      });
                    } else if (constraints.minValue && amount < constraints.minValue) {
                      errors.push({
                        message: `${field} must be greater than ${constraints.minValue} for entry with Sequence ID ${sequenceId}`,
                        sheet: sheet,
                        sequenceId: sequenceId,
                        field: field
                      });
                    }
                    break;
                    
                  case "currencyCode":
                    if (!/^[A-Z]{3}$/.test(value)) {
                      errors.push({
                        message: `Invalid currency code for entry with Sequence ID ${sequenceId}. Must be 3 uppercase letters.`,
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
                  message: `${field} must be one of the following values: ${constraints.validValues.join(', ')} for entry with Sequence ID ${sequenceId}`,
                  sheet: sheet,
                  sequenceId: sequenceId,
                  field: field
                });
              }
            }
          }
        });

        // Sheet-specific validations
        if (sheet === "Vendor Debit Lines") {
          // Validate Vendor Code format
          if (entry['Vendor Code']) {
            const VendorCode = entry['Vendor Code'].toString();
            // Vendor Codes in SAP are typically 10 characters max
            if (VendorCode.length > 10) {
              errors.push({
                message: `Vendor Code exceeds maximum length of 10 characters for entry with Sequence ID ${sequenceId}`,
                sheet: sheet,
                sequenceId: sequenceId,
                field: 'Vendor Code'
              });
            }
          }
          
          // Ensure only Debit indicator is used for Vendor Debit Lines
          if (entry['Indicator'] && entry['Indicator'] !== "S") {
            errors.push({
              message: `Vendor Debit Lines must use 'S' (Debit) indicator for entry with Sequence ID ${sequenceId}`,
              sheet: sheet,
              sequenceId: sequenceId,
              field: 'Indicator'
            });
          }
        } else if (sheet === "Vendor Credit Lines") {
          // Validate Vendor Code format
          if (entry['Vendor Code']) {
            const VendorCode = entry['Vendor Code'].toString();
            // Vendor Codes in SAP are typically 10 characters max
            if (VendorCode.length > 10) {
              errors.push({
                message: `Vendor Code exceeds maximum length of 10 characters for entry with Sequence ID ${sequenceId}`,
                sheet: sheet,
                sequenceId: sequenceId,
                field: 'Vendor Code'
              });
            }
          }
          
          // Ensure only Credit indicator is used for Vendor Credit Lines
          if (entry['Indicator'] && entry['Indicator'] !== "H") {
            errors.push({
              message: `Vendor Credit Lines must use 'H' (Credit) indicator for entry with Sequence ID ${sequenceId}`,
              sheet: sheet,
              sequenceId: sequenceId,
              field: 'Indicator'
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
      const balanceErrors = this._validateTransactionBalances(sequenceGroups);
      const sheetErrors = this._validateRequiredSheets(sequenceGroups);

      // Collect all errors including balance errors but avoid duplicates
      const allErrors = [
        // Get all validation errors from entries
        ...validatedEntries.flatMap(entry => entry.validationErrors),
        // Add balance errors (which are already at sequence level)
        ...Object.values(balanceErrors).flat(),
        // Add sheet validation errors
        ...Object.values(sheetErrors).flat()
      ];

      // Create final validated entries without adding balance errors to individual entries
      const finalValidatedEntries = validatedEntries.map(entry => {
        const sequenceId = entry['Sequence ID'];
        const hasBalanceError = balanceErrors[sequenceId] && balanceErrors[sequenceId].length > 0;
        const hasSheetError = sheetErrors[sequenceId] && sheetErrors[sequenceId].length > 0;

        return {
          ...entry,
          status: hasBalanceError || hasSheetError ? "Invalid" : entry.status,
          // Keep only the original validation errors for this entry
          // Do NOT add the balance or sheet errors here
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
     * Validate required sheets for each sequence ID
     * Each journal entry requires both Vendor Debit Lines and Vendor Credit Lines entries
     * @param {object} sequenceGroups - Entries grouped by sequence ID
     * @returns {object} Validation errors by sequence ID
     */
    this._validateRequiredSheets = function(sequenceGroups) {
      if (!sequenceGroups || typeof sequenceGroups !== 'object') {
        console.error('Invalid input to _validateRequiredSheets', sequenceGroups);
        return {};
      }
      
      const sheetErrors = {};
      
      // Iterate through each sequence group
      for (const [sequenceId, entries] of Object.entries(sequenceGroups)) {
        if (!Array.isArray(entries)) {
          console.warn(`Entries for Sequence ID ${sequenceId} is not an array`, entries);
          continue;
        }
        
        const groupErrors = [];
        const sheets = new Set(entries.map(entry => entry.Sheet));
        
        // Check if we have both Vendor Debit Lines and Vendor Credit Lines
        if (!sheets.has("Vendor Debit Lines")) {
          groupErrors.push({
            message: `Sequence ID ${sequenceId}: Missing Vendor Debit Lines entry`,
            sheet: "Sheet Validation",
            sequenceId: sequenceId
          });
        }
        
        if (!sheets.has("Vendor Credit Lines")) {
          groupErrors.push({
            message: `Sequence ID ${sequenceId}: Missing Vendor Credit Lines entry`,
            sheet: "Sheet Validation",
            sequenceId: sequenceId
          });
        }
        
        // Store any errors for this transaction
        if (groupErrors.length > 0) {
          sheetErrors[sequenceId] = groupErrors;
        }
      }
      
      return sheetErrors;
    };
    
    /**
     * Check if a value is a valid date in YYYY-MM-DD format
     * @param {string|Date} value - The date value to validate
     * @returns {boolean} True if valid date, false otherwise
     */
    this._isValidDate = function(value) {
      if (value instanceof Date) {
        return !isNaN(value.getTime());
      }
      
      const dateRegex = /^\d{4}-\d{2}-\d{2}$/; // Match YYYY-MM-DD format
      if (!dateRegex.test(value)) {
        return false;
      }
      
      // Additional validation for valid date
      const parts = value.split('-');
      const year = parseInt(parts[0], 10);
      const month = parseInt(parts[1], 10) - 1; // 0-indexed month
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
          vendorDebitLines: { S: false },
          vendorCreditLines: { H: false }
        };

        // Process entries for this sequence
        for (const entry of entries) {
          const indicator = entry["Indicator"];
          const sheetType = entry["Sheet"];
          const amount = parseFloat(entry["Amount"] || 0);

          // Skip invalid amounts
          if (isNaN(amount)) continue;

          // Track total amount (sign depends on indicator)
          totalAmount += indicator === "H" ? amount : -amount;
   
          // Track indicators by sheet type
          if (sheetType === "Vendor Debit Lines") {
            if (indicator === "S") indicators.vendorDebitLines.S = true;
          } else if (sheetType === "Vendor Credit Lines") {
            if (indicator === "H") indicators.vendorCreditLines.H = true;
          }
        }

        // Validate indicator pairing based on SAP journal entry logic
        // For a balanced entry, we need both Vendor Debit Lines with 'S' and Vendor Credit Lines with 'H'
        if (!indicators.vendorDebitLines.S) {
          groupErrors.push({
            message: `Sequence ID ${sequenceId}: Missing 'S' indicator in Vendor Debit Lines`,
            sheet: "Indicator Validation",
            sequenceId: sequenceId
          });
        }

        if (!indicators.vendorCreditLines.H) {
          groupErrors.push({
            message: `Sequence ID ${sequenceId}: Missing 'H' indicator in Vendor Credit Lines`,
            sheet: "Indicator Validation",
            sequenceId: sequenceId
          });
        }

        // Check transaction balance with a small tolerance for floating point
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
          `Sequence ID ${sequenceId}: ${errors.map(err => err.message).join('; ')}`
        )
        .join("\n");

      sap.m.MessageBox.error("Some transactions are not balanced", {
        details: errorMessage
      });
    };
    
    /**
     * Validate SOAP response error and show appropriate messages
     * @param {Object} soapResponse - SOAP response to validate
     * @returns {Object} Error details if present
     */
    this.validateSOAPResponse = function(soapResponse) {
      try {
        // Check for SOAP fault
        const $response = $(soapResponse);
        const faultElement = $response.find('Fault, soap\\:Fault, soap-env\\:Fault');
        
        if (faultElement.length > 0) {
          const faultCode = faultElement.find('faultcode').text();
          const faultString = faultElement.find('faultstring').text();
          
          // Extract transaction ID if available
          let transactionId = null;
          const transactionIdMatch = faultString.match(/Transaction ID ([A-Z0-9]+)/i);
          if (transactionIdMatch && transactionIdMatch.length > 1) {
            transactionId = transactionIdMatch[1];
          }
          
          // Create error object
          const error = {
            code: faultCode,
            message: faultString,
            transactionId: transactionId,
            needsBackendCheck: faultString.includes("Web service processing error")
          };
          
          // Show custom message for backend errors
          if (error.needsBackendCheck) {
            this._showBackendErrorMessage(error);
          }
          
          return error;
        }
        
        return null;
      } catch (e) {
        console.error("Error validating SOAP response:", e);
        return {
          code: "PARSE_ERROR",
          message: "Failed to parse SOAP response: " + e.message
        };
      }
    };
    
    /**
     * Show specific message for backend errors that need monitoring
     * @param {Object} error - Error details
     */
    this._showBackendErrorMessage = function(error) {
      let message = "Web service processing error occurred";
      
      if (error.transactionId) {
        message += `\n\nTransaction ID: ${error.transactionId}`;
      }
      
      message += "\n\nPlease check monitor SOAP application log in backend for more details.";
      
      sap.m.MessageBox.error(message, {
        title: "Backend Processing Error"
      });
    };
  };
});