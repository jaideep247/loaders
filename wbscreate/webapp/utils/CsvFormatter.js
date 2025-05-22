sap.ui.define([], function () {
    "use strict";

    /**
     * CsvFormatter - Optimized for essential fields only
     * Utility class for CSV file operations using SheetJS library
     */
    var CsvFormatter = function () {
        console.log("CsvFormatter initialized");
        
        // FIXED: Define essential fields only - same as PDF and Excel formatters
        this.essentialFields = [
            "Status",
            "ProjectElement", 
            "ProjectElementDescription",
            "Message",
            "CompanyCode",
            "ResponsibleCostCenter",
            "ProfitCenter",
            "ProcessingStatus",
            "WBSElementIsBillingElement",
            "YY1_ATMID_PTD",
            "YY1_Address_PTD", 
        ];

        // FIXED: Define readable headers for essential fields only
        this.fieldDisplayNames = {
            "Status": "Status",
            "ProjectElement": "WBS Element",
            "ProjectElementDescription": "Description", 
            "Message": "Message",
            "CompanyCode": "Company Code",
            "ResponsibleCostCenter": "Responsible Cost Center",
            "ProfitCenter": "Profit Center",
            "ProcessingStatus": "Processing Status",
            "WBSElementIsBillingElement": "Billing Element",
            "YY1_ATMID_PTD": "ATM ID",
            "YY1_Address_PTD": "District",
            "YY1_State_PTD": "State", 
        };
    };

    // Helper to ensure XLSX utils are loaded for CSV conversion
    const checkXLSXUtils = () => {
        if (typeof window.XLSX === 'undefined' || typeof window.XLSX.utils === 'undefined') {
            throw new Error("XLSX library utils not loaded. CSV export requires them for robust conversion.");
        }
    };

    /**
     * Returns the file extension for CSV format.
     * @returns {string} The file extension.
     */
    CsvFormatter.prototype.getFileExtension = function () {
        return "csv";
    };

    /**
     * Returns the MIME type for CSV format.
     * @returns {string} The MIME type.
     */
    CsvFormatter.prototype.getMimeType = function () {
        return "text/csv;charset=utf-8;";
    };

    /**
     * FIXED: Exports only essential fields to CSV file
     * @param {Array<object>} data - Array of processed data objects.
     * @param {Array<string>} headers - Array of header column names (ignored).
     * @param {String} sheetName - Name of the worksheet (ignored).
     * @param {String} fileName - Name of the file to download (ignored).
     * @returns {Promise<Blob>} Promise resolving with the CSV Blob.
     */
    CsvFormatter.prototype.exportToCsv = function (data, headers, sheetName, fileName) {
        return new Promise((resolve, reject) => {
            try {
                checkXLSXUtils();

                if (!data || data.length === 0) {
                    reject(new Error("No data provided for CSV export."));
                    return;
                }

                console.log(`CsvFormatter: Starting export of ${data.length} records`);

                // FIXED: Process data to include only essential fields
                const processedData = this._processDataForExport(data);

                if (processedData.length === 0) {
                    reject(new Error("No valid data after processing"));
                    return;
                }

                // FIXED: Create headers using display names for essential fields only
                const fieldNames = Object.keys(processedData[0]);
                const headers = fieldNames.map(fieldName => 
                    this.fieldDisplayNames[fieldName] || fieldName
                );

                console.log(`CsvFormatter: Creating CSV with ${fieldNames.length} columns:`, headers);

                // Create worksheet with internal field names
                const worksheet = window.XLSX.utils.json_to_sheet(processedData, {
                    header: fieldNames
                });

                // FIXED: Add formatted header row
                window.XLSX.utils.sheet_add_aoa(worksheet, [headers], { origin: "A1" });

                // Convert to CSV
                const csvContent = window.XLSX.utils.sheet_to_csv(worksheet);

                // Add BOM for UTF-8 compatibility in Excel
                const blob = new Blob(["\uFEFF" + csvContent], { type: this.getMimeType() });
                
                console.log(`CsvFormatter: CSV export completed successfully with ${processedData.length} rows`);
                resolve(blob);
                
            } catch (error) {
                console.error("CsvFormatter: Error formatting CSV:", error);
                reject(error);
            }
        });
    };

    /**
     * FIXED: Process data for CSV export - only essential fields, remove UUID/dates/irrelevant fields
     * @param {Array<object>} data - Raw data array.
     * @returns {Array<object>} Processed data with only essential fields.
     * @private
     */
    CsvFormatter.prototype._processDataForExport = function (data) {
        if (!Array.isArray(data) || data.length === 0) return [];

        console.log(`CsvFormatter: Processing ${data.length} records for export`);
        
        const processedRecords = [];

        data.forEach(record => {
            // Clean the record to remove unwanted fields
            const cleanRecord = this._cleanRecord(record);
            
            // Ensure required fields
            this._ensureRequiredFields(cleanRecord);
            
            processedRecords.push(cleanRecord);
        });

        // Get only essential fields that are present in the data
        const activeFields = this._getActiveEssentialFields(processedRecords);
        
        console.log(`CsvFormatter: Using ${activeFields.length} essential fields:`, activeFields);

        // Create final export records with only essential fields in preferred order
        return processedRecords.map(record => {
            const exportRecord = {};
            
            activeFields.forEach(fieldName => {
                let value = record[fieldName];
                
                // FIXED: Format values consistently for CSV
                if (fieldName === 'WBSElementIsBillingElement') {
                    exportRecord[fieldName] = (value === true || value === 'true' || value === 'X') ? 'X' : '';
                } else if (fieldName === 'ProcessingStatus') {
                    if (value === '00' || value === 0) {
                        exportRecord[fieldName] = 'Active';
                    } else if (value === '99') {
                        exportRecord[fieldName] = 'Completed';
                    } else {
                        exportRecord[fieldName] = value ? String(value) : '';
                    }
                } else {
                    // Clean up value for CSV (remove line breaks, quotes, etc.)
                    let cleanValue = (value !== undefined && value !== null) ? String(value).trim() : '';
                    cleanValue = cleanValue.replace(/[\r\n]/g, ' ').replace(/"/g, '""'); // Escape quotes and remove line breaks
                    exportRecord[fieldName] = cleanValue;
                }
            });
            
            return exportRecord;
        });
    };

    /**
     * FIXED: Clean individual record - remove unwanted fields (same as Excel formatter)
     * @param {Object} record - Single record to clean
     * @returns {Object} Cleaned record with only relevant fields
     * @private
     */
    CsvFormatter.prototype._cleanRecord = function (record) {
        const cleanRecord = {};

        // FIXED: Fields to exclude - comprehensive list same as Excel formatter
        const fieldsToExclude = [
            // UUID fields
            'ProjectUUID', 'ProjectElementUUID', 'ParentObjectUUID',
            
            // Date fields  
            'PlannedStartDate', 'PlannedEndDate', 'YY1_UDF1_PTD', 'YY1_UDF2_PTD',
            'CreationDateTime', 'LastChangeDateTime', 'ActualStartDate_fc', 'ActualEndDate_fc',
            'PlannedStartDate_fc', 'PlannedEndDate_fc', 'ForecastedEndDate_fc',
            
            // Internal/system fields
            '_rawResponse', '_originalIndex', '_processingError', '_sapui_batchId',
            '_sapui_requestType', '_sapui_url', '_sheetName', '_originalData',
            'CreatedByUser', 'LastChangedByUser', 'Timestamp',
            
            // SAP field control and navigation fields
            'ProjectElement_fc', 'ProjectElementDescription_fc', 'ControllingArea_fc',
            'CostCenter_fc', 'CostingSheet_fc', 'FactoryCalendar_fc', 'FunctionalArea_fc',
            'FunctionalLocation_fc', 'InvestmentProfile_fc', 'IsMainMilestone_fc',
            'Location_fc', 'MilestoneApprovalStatus_fc', 'Plant_fc', 'ProfitCenter_fc',
            'ResponsibleCostCenter_fc', 'ResultAnalysisInternalID_fc', 'TaxJurisdiction_fc',
            'WBSElementIsBillingElement_fc',
            
            // Navigation properties
            'to_EntProjElmntBlkFunc', 'to_EntProjElmntBlkFunc_oc', 'to_EntProjElmntDlvbrl',
            'to_EntProjElmntDlvbrl_oc', 'to_EntProjElmntWorkItem', 'to_EntProjElmntWorkItem_oc',
            'to_EntProjectElementJVA', 'to_EntProjectElmntPublicSector', 'to_EnterpriseProject',
            'to_ParentProjElement', 'to_SubProjElement', 'to_SubProjElement_oc',
            
            // Action control fields
            'ChangeEntProjElmntPosition_ac', 'ChangeEntProjElmntProcgStatus_ac',
            'ChangePeriodDistributionOption_ac', 'Delete_mc', 'Update_mc',
            
            // Redundant fields
            'Type', 'Code', 'SuccessMessage', 'ErrorMessage',
            
            // Less important organizational/technical fields
            'ControllingArea', 'CostCenter', 'CostingSheet', 'EntProjectElementType',
            'FactoryCalendar', 'FunctionalArea', 'FunctionalLocation', 'InvestmentProfile',
            'IsMainMilestone', 'IsProjectMilestone', 'Location', 'MilestoneApprovalStatus',
            'Plant', 'ResultAnalysisInternalID', 'TaxJurisdiction', 'WBSElementInternalID',
            'ProjectElementOrdinalNumber', 'WBSIsStatisticalWBSElement',
            
            // Less important YY1 fields
            'YY1_ATMCount_PTD', 'YY1_NatureOfWBS_PTD', 'YY1_SAPsiteIDReport_PTD',
            'YY1_Addressandpostalco_PTD', 'YY1_Deployment_PTD', 'YY1_BankLoadATMDiscoun_PTD',
            'YY1_ERPRelocationRefAT_PTD', 'YY1_ERPsiteIDReport_PTD', 'YY1_UDF3_PTD',
            'YY1_Categorization_PTD', 'YY1_ERPRelocationRefer_PTD',
            
            // Export-specific cleanup fields
            'BatchIndex', 'EntityId', 'Source'
        ];

        // Copy all fields except excluded ones
        Object.keys(record).forEach(key => {
            if (!fieldsToExclude.includes(key)) {
                cleanRecord[key] = record[key];
            }
        });

        // Handle Details field specially - flatten if it's an object
        if (record.Details) {
            if (typeof record.Details === 'string') {
                try {
                    const parsedDetails = JSON.parse(record.Details);
                    // Only merge essential fields from Details
                    this.essentialFields.forEach(field => {
                        if (parsedDetails[field] && !cleanRecord[field]) {
                            cleanRecord[field] = parsedDetails[field];
                        }
                    });
                } catch (e) {
                    console.warn("CsvFormatter: Error parsing Details field:", e);
                }
            } else if (typeof record.Details === 'object') {
                // Only merge essential fields from Details object
                this.essentialFields.forEach(field => {
                    if (record.Details[field] && !cleanRecord[field]) {
                        cleanRecord[field] = record.Details[field];
                    }
                });
            }
        }

        return cleanRecord;
    };

    /**
     * FIXED: Ensure required fields are present
     * @param {Object} record - Record to check
     * @private
     */
    CsvFormatter.prototype._ensureRequiredFields = function (record) {
        // Ensure Status field
        if (!record.Status) {
            record.Status = (record.ErrorMessage || record.message || record.ErrorCode) ? "Error" : "Success";
        }

        // Ensure Message field
        if (!record.Message) {
            if (record.Status === "Error") {
                record.Message = record.ErrorMessage || record.message || "Error during processing";
            } else {
                record.Message = record.SuccessMessage || 
                    `WBS Element ${record.ProjectElement || ""} processed successfully`;
            }
        }

        // Consolidate ErrorCode
        if (!record.ErrorCode && record.Code) {
            record.ErrorCode = record.Code;
        }
    };

    /**
     * FIXED: Get only essential fields that are actually present in the data with smart detection
     * @param {Array} processedRecords - The processed data records
     * @returns {Array} Array of essential field names present in data
     * @private
     */
    CsvFormatter.prototype._getActiveEssentialFields = function (processedRecords) {
        const activeFields = [];
        
        // FIXED: Check which essential fields are present in at least 25% of records
        // This handles success records having YY1 fields but error records not having them
        this.essentialFields.forEach(fieldName => {
            const recordsWithField = processedRecords.filter(record => 
                record.hasOwnProperty(fieldName) && 
                record[fieldName] !== undefined && 
                record[fieldName] !== null &&
                String(record[fieldName]).trim() !== ""
            ).length;
            
            const fieldPresencePercent = (recordsWithField / processedRecords.length) * 100;
            
            // Include field if present in at least 25% of records OR if it's a core field
            const coreFields = ["Status", "ProjectElement", "ProjectElementDescription", "Message", "CompanyCode"];
            const shouldInclude = fieldPresencePercent >= 25 || coreFields.includes(fieldName);
            
            if (shouldInclude) {
                activeFields.push(fieldName);
                console.log(`CsvFormatter: Including field '${fieldName}' (${fieldPresencePercent.toFixed(1)}% presence)`);
            } else {
                console.log(`CsvFormatter: Excluding field '${fieldName}' (${fieldPresencePercent.toFixed(1)}% presence)`);
            }
        });

        // Ensure we always have at least core mandatory fields
        const mandatoryFields = ["Status", "ProjectElement", "Message"];
        mandatoryFields.forEach(field => {
            if (!activeFields.includes(field)) {
                activeFields.unshift(field);
                console.log(`CsvFormatter: Force-adding mandatory field '${field}'`);
            }
        });

        return activeFields;
    };

    // Return the CsvFormatter constructor
    return CsvFormatter;
});