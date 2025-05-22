sap.ui.define(["wbscreate/utils/DataTransformer"], function (DataTransformer) {
  "use strict";

  /**
   * EnterpriseProjectElementValidationManager
   * Responsible for validating enterprise project element data based on SAP metadata constraints
   */
  return function (options = {}) {
    this.oController = options.controller;
    this._dataTransformer = options.dataTransformer || new DataTransformer();
    this._errorHandler = options.errorHandler;

    // Mapping to handle different input field names
    this._fieldNameMapping = {
      // Core field mappings
      "Project Element": "ProjectElement",
      "ProjectUUID": "ProjectUUID",
      "Name of WBS": "Description",
      "Description": "Description",
      "Planned Start Date": "PlannedStartDate",
      "Planned End Date": "PlannedEndDate",
      "Responsible Cost Center": "ResponsibleCostCenter",
      "Company Code": "CompanyCode",
      "Profit Center": "ProfitCenter",
      "Controlling Area": "ControllingArea",
      "Billing Element": "WBSElementIsBillingElement",
      "Is Billing Element (X=Yes)": "WBSElementIsBillingElement",

      // Custom field mappings
      "Old Project ID": "YY1_OldProjectSiteID_PTD",
      "Old Project Site ID": "YY1_OldProjectSiteID_PTD",
      "Exact WBS code": "YY1_ExactWBScode_PTD",
      "Exact WBS Code": "YY1_ExactWBScode_PTD",
      "Site type (OF/ON)": "YY1_Categorization1_PTD",
      "Site Type": "YY1_Categorization1_PTD",
      "ATM ID": "YY1_ATMID_PTD",
      "District": "YY1_Address_PTD",
      "State": "YY1_State_PTD",
      "Bank name": "YY1_Project_PTD",
      "Project": "YY1_Project_PTD",
      "ATM count": "YY1_ATMCount_PTD",
      "ATM Count": "YY1_ATMCount_PTD",
      "Nature of WBS": "YY1_NatureOfWBS_PTD",
      "SAP Site ID report": "YY1_SAPsiteIDReport_PTD",
      "Address": "YY1_Addressandpostalco_PTD",
      "Address and Postal Code": "YY1_Addressandpostalco_PTD",
      "Deployment": "YY1_Deployment_PTD",
      "Bank load percentage": "YY1_BankLoadATMDiscoun_PTD",
      "Bank Load ATM Discount": "YY1_BankLoadATMDiscoun_PTD",
      "ERP relocation Ref ATM ID": "YY1_ERPRelocationRefAT_PTD",
      "ERP Site ID report": "YY1_ERPsiteIDReport_PTD",
      "UDF-1": "YY1_UDF3_PTD",
      "Categorization": "YY1_Categorization_PTD",
      "Actual start date": "YY1_UDF1_PTD",
      "Actual Start Date": "YY1_UDF1_PTD",
      "Postal code": "YY1_Postalcode_PTD",
      "Postal Code": "YY1_Postalcode_PTD",
      "Actual end date": "YY1_UDF2_PTD",
      "Actual End Date": "YY1_UDF2_PTD",
      "ERP relocation ref. site id": "YY1_ERPRelocationRefer_PTD"
    };

    // Field constraints (remains the same as in previous version)
    this.fieldConstraints = {
      // Core Project Element Fields
      "ProjectElement": {
        required: true,
        maxLength: 24,
        type: "string",
        description: "Project Element ID"
      },
      "ProjectUUID": {
        required: false,
        type: "string",
        description: "Project UUID"
      },
      "Description": {
        required: false,
        maxLength: 60,
        type: "string",
        description: "Name of WBS"
      },
      "PlannedStartDate": {
        required: false,
        type: "date",
        description: "Planned Start Date"
      },
      "PlannedEndDate": {
        required: false,
        type: "date",
        description: "Planned End Date"
      },
      "ResponsibleCostCenter": {
        required: false,
        maxLength: 10,
        type: "string",
        description: "Responsible Cost Center"
      },
      "CompanyCode": {
        required: false,
        maxLength: 4,
        type: "string",
        description: "Company Code"
      },
      "ProfitCenter": {
        required: false,
        maxLength: 10,
        type: "string",
        description: "Profit Center"
      },
      "ControllingArea": {
        required: false,
        maxLength: 4,
        type: "string",
        description: "Controlling Area"
      },
      "WBSElementIsBillingElement": {
        required: false,
        type: "boolean",
        description: "Billing Element"
      }
    };

    // Custom field constraints (similar to previous version)
    this.customFieldConstraints = {
      "YY1_OldProjectSiteID_PTD": {
        required: false,
        maxLength: 24,
        type: "string",
        description: "Old Project ID"
      },
      "YY1_ExactWBScode_PTD": {
        required: false,
        maxLength: 24,
        type: "string",
        description: "Exact WBS Code"
      },
      "YY1_Categorization1_PTD": {
        required: false,
        maxLength: 20,
        type: "string",
        description: "Site Type (OF/ON)"
      },
      "YY1_ATMID_PTD": {
        required: false,
        maxLength: 20,
        type: "string",
        description: "ATM ID"
      },
      "YY1_Address_PTD": {
        required: false,
        maxLength: 40,
        type: "string",
        description: "District"
      },
      "YY1_State_PTD": {
        required: false,
        maxLength: 30,
        type: "string",
        description: "State"
      },
      "YY1_Project_PTD": {
        required: false,
        maxLength: 50,
        type: "string",
        description: "Bank Name"
      },
      "YY1_ATMCount_PTD": {
        required: false,
        maxLength: 20,
        type: "string",
        description: "ATM Count"
      },
      "YY1_NatureOfWBS_PTD": {
        required: false,
        maxLength: 15,
        type: "string",
        description: "Nature of WBS"
      },
      "YY1_SAPsiteIDReport_PTD": {
        required: false,
        maxLength: 24,
        type: "string",
        description: "SAP Site ID Report"
      },
      "YY1_Addressandpostalco_PTD": {
        required: false,
        maxLength: 250,
        type: "string",
        description: "Address"
      },
      "YY1_Deployment_PTD": {
        required: false,
        maxLength: 15,
        type: "string",
        description: "Deployment"
      },
      "YY1_BankLoadATMDiscoun_PTD": {
        required: false,
        maxLength: 5,
        type: "string",
        description: "Bank Load Percentage"
      },
      "YY1_ERPRelocationRefAT_PTD": {
        required: false,
        maxLength: 24,
        type: "string",
        description: "ERP Relocation Ref ATM ID"
      },
      "YY1_ERPsiteIDReport_PTD": {
        required: false,
        maxLength: 15,
        type: "string",
        description: "ERP Site ID Report"
      },
      "YY1_UDF3_PTD": {
        required: false,
        maxLength: 25,
        type: "string",
        description: "UDF-1"
      },
      "YY1_Categorization_PTD": {
        required: false,
        maxLength: 15,
        type: "string",
        description: "Categorization"
      },
      "YY1_UDF1_PTD": {
        required: false,
        type: "date",
        description: "Actual Start Date"
      },
      "YY1_Postalcode_PTD": {
        required: false,
        maxLength: 8,
        type: "string",
        description: "Postal Code"
      },
      "YY1_UDF2_PTD": {
        required: false,
        type: "date",
        description: "Actual End Date"
      },
      "YY1_ERPRelocationRefer_PTD": {
        required: false,
        maxLength: 24,
        type: "string",
        description: "ERP Relocation Ref. Site ID"
      }
    };

    /**
     * Check if a project element is empty (has no meaningful data)
     * @param {Object} element - Project element to check
     * @returns {boolean} True if the element is empty, false otherwise
     * @private
     */
    this._isEmptyElement = function (element) {
      // If element is not an object, it's considered empty
      if (!element || typeof element !== 'object') {
        return true;
      }

      // Check if the element has any meaningful values in its fields
      const hasData = Object.keys(element).some(key => {
        // Skip internal fields that start with underscore
        if (key.startsWith('_') || key === 'Status' || key === 'ValidationErrors') {
          return false;
        }

        const value = element[key];

        // Check if value is non-empty
        return value !== null &&
          value !== undefined &&
          value !== '' &&
          String(value).trim() !== '';
      });

      return !hasData;
    };

    /**
     * Standardize input project element by mapping field names
     * @param {Object} projectElement - Project element to standardize
     * @returns {Object} Standardized project element
     * @private
     */
    this._standardizeProjectElement = function (projectElement) {
      const standardizedElement = {};

      // Create a case-insensitive mapping
      const caseInsensitiveMapping = {};
      Object.keys(this._fieldNameMapping).forEach(key => {
        caseInsensitiveMapping[key.toLowerCase().trim()] = this._fieldNameMapping[key];
      });

      // Map input fields to standard field names
      Object.keys(projectElement).forEach(key => {
        const trimmedKey = key.trim();

        // First, try exact match
        let standardKey = this._fieldNameMapping[key] ||
          // Then try case-insensitive match
          caseInsensitiveMapping[trimmedKey.toLowerCase()] ||
          // If no match, use original key
          key;

        standardizedElement[standardKey] = projectElement[key];
      });

      return standardizedElement;
    };

    /**
     * Validate enterprise project elements
     * @param {array} projectElements - Project elements to validate
     * @returns {object} Validation result with validated entries and errors
     */
    this.validateProjectElements = function (projectElements) {
      // Ensure projectElements is an array
      if (!Array.isArray(projectElements)) {
        console.error("Invalid project elements input:", projectElements);
        projectElements = projectElements && projectElements.entries ? projectElements.entries : [];
      }

      // Standardize and filter out empty rows
      const standardizedElements = projectElements.map(element =>
        this._standardizeProjectElement(element)
      );

      const nonEmptyElements = standardizedElements.filter(element => !this._isEmptyElement(element));

      console.log(`Filtered out ${projectElements.length - nonEmptyElements.length} empty rows from ${projectElements.length} total rows.`);

      // If all projectElements are empty, return an empty result
      if (nonEmptyElements.length === 0) {
        return {
          isValid: false,
          entries: [],
          validCount: 0,
          errorCount: 0,
          errors: [
            {
              message: "No valid project elements to validate. All rows are empty.",
              sheet: "Project Elements",
              sequenceId: "N/A"
            }
          ]
        };
      }

      const validatedEntries = nonEmptyElements.map((projectElement) => {
        const errors = [];
        const sequenceId = projectElement.ProjectElement || projectElement.ProjectUUID || "Unknown";

        // Validate core fields
        Object.keys(this.fieldConstraints).forEach(fieldName => {
          const constraint = this.fieldConstraints[fieldName];
          const value = projectElement[fieldName];

          // Check if required field exists
          if (constraint.required && (!value || (typeof value === "string" && value.trim() === ""))) {
            errors.push({
              message: `${constraint.description} is required for Project Element ${sequenceId}`,
              sheet: "Project Elements",
              sequenceId: sequenceId,
              field: fieldName
            });
            return;
          }

          // Skip validation if the field doesn't exist
          if (value === undefined || value === null || value === '') return;

          // Type-specific validation
          switch (constraint.type) {
            case "string":
              // Length validation
              if (constraint.maxLength && value.toString().length > constraint.maxLength) {
                errors.push({
                  message: `${constraint.description} exceeds maximum length of ${constraint.maxLength} characters for Project Element ${sequenceId}`,
                  sheet: "Project Elements",
                  sequenceId: sequenceId,
                  field: fieldName
                });
              }
              break;

            case "date":
              const parsedDate = this._dataTransformer.parseDate(value);

              if (!parsedDate) {
                errors.push({
                  message: `Invalid ${constraint.description} for Project Element ${sequenceId}. Must be a valid date.`,
                  sheet: "Project Elements",
                  sequenceId: sequenceId,
                  field: fieldName
                });
              }
              break;

            case "boolean":
              // Check if value is a valid boolean or boolean-equivalent ('X', 'true', true, etc.)
              if (typeof value !== "boolean" &&
                value !== 'X' &&
                value !== 'true' &&
                value !== true &&
                value !== 'false' &&
                value !== false) {
                errors.push({
                  message: `${constraint.description} must be a boolean value for Project Element ${sequenceId}`,
                  sheet: "Project Elements",
                  sequenceId: sequenceId,
                  field: fieldName
                });
              }
              break;
          }
        });

        // Validate custom fields
        Object.keys(this.customFieldConstraints).forEach(fieldName => {
          const constraint = this.customFieldConstraints[fieldName];
          const value = projectElement[fieldName];

          // Skip validation if the field doesn't exist
          if (value === undefined || value === null || value === '') return;

          // Type-specific validation
          switch (constraint.type) {
            case "string":
              // Length validation
              if (constraint.maxLength && value.toString().length > constraint.maxLength) {
                errors.push({
                  message: `${constraint.description} exceeds maximum length of ${constraint.maxLength} characters for Project Element ${sequenceId}`,
                  sheet: "Project Elements",
                  sequenceId: sequenceId,
                  field: fieldName
                });
              }
              break;

            case "date":
              const parsedDate = this._dataTransformer.parseDate(value);

              if (!parsedDate) {
                errors.push({
                  message: `Invalid ${constraint.description} for Project Element ${sequenceId}. Must be a valid date.`,
                  sheet: "Project Elements",
                  sequenceId: sequenceId,
                  field: fieldName
                });
              }
              break;
          }
        });

        // Validate date ranges
        // Planned dates
        if (projectElement.PlannedStartDate && projectElement.PlannedEndDate) {
          const startDate = this._dataTransformer.parseDate(projectElement.PlannedStartDate);
          const endDate = this._dataTransformer.parseDate(projectElement.PlannedEndDate);

          if (startDate && endDate && new Date(startDate) > new Date(endDate)) {
            errors.push({
              message: `Planned Start Date must be before or equal to Planned End Date for Project Element ${sequenceId}`,
              sheet: "Project Elements",
              sequenceId: sequenceId,
              field: "DateRange"
            });
          }
        }

        // Actual dates (stored in extension fields)
        if (projectElement.YY1_UDF1_PTD && projectElement.YY1_UDF2_PTD) {
          const actualStartDate = this._dataTransformer.parseDate(projectElement.YY1_UDF1_PTD);
          const actualEndDate = this._dataTransformer.parseDate(projectElement.YY1_UDF2_PTD);

          if (actualStartDate && actualEndDate && new Date(actualStartDate) > new Date(actualEndDate)) {
            errors.push({
              message: `Actual Start Date must be before or equal to Actual End Date for Project Element ${sequenceId}`,
              sheet: "Project Elements",
              sequenceId: sequenceId,
              field: "DateRange"
            });
          }
        }

        // Update project element with validation results
        return {
          ...projectElement,
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
     * Validate a single Project Element
     * @param {object} projectElement - Project Element to validate
     * @returns {object} Validation result for single entry
     */
    this.validateSingleProjectElement = function (projectElement) {
      // Check if the project element is empty
      if (this._isEmptyElement(projectElement)) {
        return {
          isValid: false,
          entry: null,
          errors: [{
            message: "Empty project element. No data to validate.",
            sheet: "Project Elements",
            sequenceId: "N/A"
          }]
        };
      }

      const result = this.validateProjectElements([projectElement]);
      return {
        isValid: result.isValid,
        entry: result.entries[0],
        errors: result.errors
      };
    };

    // Return the validation manager instance
    return this;
  };
});