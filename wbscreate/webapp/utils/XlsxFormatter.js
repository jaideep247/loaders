sap.ui.define([], function () {
    "use strict";

    var XlsxFormatter = function () {
        console.log("XlsxFormatter initialized");

        // FIXED: Define essential fields only - same as PDF formatter
        this.essentialFields = [
            "Status",
            "ProjectElement",
            "ProjectElementDescription",
            "Message",
            "CompanyCode",
            "ResponsibleCostCenter",
            "ProfitCenter",
            "YY1_ATMID_PTD",
            "YY1_Address_PTD",
            "YY1_State_PTD",
            "YY1_Project_PTD",
            "YY1_Categorization1_PTD",
            "YY1_ExactWBScode_PTD",
            "YY1_OldProjectSiteID_PTD",
            "YY1_Postalcode_PTD"
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
            "YY1_ATMID_PTD": "ATM ID",
            "YY1_Address_PTD": "District",
            "YY1_State_PTD": "State"
        };
    };

    /**
     * FIXED: Process data for export - only essential fields, remove UUID/dates/irrelevant fields
     * @param {Array<object>} data - Raw data array of records.
     * @returns {Array<object>} Processed data with only essential fields.
     * @private
     */
    XlsxFormatter.prototype._processDataForExport = function (data) {
        if (!Array.isArray(data) || data.length === 0) {
            return [];
        }

        console.log(`XlsxFormatter: Processing ${data.length} records for export`);

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

        console.log(`XlsxFormatter: Using ${activeFields.length} essential fields:`, activeFields);

        // Create final export records with only essential fields in preferred order
        return processedRecords.map(record => {
            const exportRecord = {};

            activeFields.forEach(fieldName => {
                let value = record[fieldName];

                // FIXED: Format values consistently
                if (fieldName === 'WBSElementIsBillingElement') {
                    exportRecord[fieldName] = (value === true || value === 'true' || value === 'X') ? 'X' : '';
                } else {
                    exportRecord[fieldName] = (value !== undefined && value !== null) ? String(value).trim() : '';
                }
            });

            return exportRecord;
        });
    };

    /**
     * FIXED: Clean individual record - remove unwanted fields
     * @param {Object} record - Single record to clean
     * @returns {Object} Cleaned record with only relevant fields
     * @private
     */
    XlsxFormatter.prototype._cleanRecord = function (record) {
        const cleanRecord = {};

        // FIXED: Fields to exclude - same comprehensive list as PDF formatter
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
                    console.warn("XlsxFormatter: Error parsing Details field:", e);
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
    XlsxFormatter.prototype._ensureRequiredFields = function (record) {
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
     * FIXED: Get only essential fields that are actually present in the data
     * @param {Array} processedRecords - The processed data records
     * @returns {Array} Array of essential field names present in data
     * @private
     */
    XlsxFormatter.prototype._getActiveEssentialFields = function (processedRecords) {
        const activeFields = [];

        // Check which essential fields are actually present in the data
        this.essentialFields.forEach(fieldName => {
            const hasField = processedRecords.some(record =>
                record.hasOwnProperty(fieldName) &&
                record[fieldName] !== undefined &&
                record[fieldName] !== null &&
                String(record[fieldName]).trim() !== ""
            );

            if (hasField) {
                activeFields.push(fieldName);
            }
        });

        // Ensure we always have at least Status, WBS Element, and Message
        const mandatoryFields = ["Status", "ProjectElement", "Message"];
        mandatoryFields.forEach(field => {
            if (!activeFields.includes(field)) {
                activeFields.unshift(field);
            }
        });

        return activeFields;
    };

    /**
     * FIXED: Exports only essential fields to Excel
     * @param {Array} data - Array of data objects to export
     * @param {String} fileName - Name of the file to download
     * @returns {Promise<Blob>} Promise resolving with Excel file Blob
     */
    XlsxFormatter.prototype.exportToExcel = function (data, fileName) {
        return new Promise((resolve, reject) => {
            try {
                // Basic validation
                if (!window.XLSX) {
                    throw new Error("XLSX library not loaded. Cannot export to Excel.");
                }

                if (!data || !Array.isArray(data) || data.length === 0) {
                    throw new Error("No data to export");
                }

                console.log(`XlsxFormatter: Starting export of ${data.length} records`);

                // FIXED: Process data to include only essential fields
                const processedData = this._processDataForExport(data);

                if (processedData.length === 0) {
                    throw new Error("No valid data after processing");
                }

                // FIXED: Create headers using display names for essential fields only
                const fieldNames = Object.keys(processedData[0]);
                const headers = fieldNames.map(fieldName =>
                    this.fieldDisplayNames[fieldName] || fieldName
                );

                console.log(`XlsxFormatter: Creating Excel with ${fieldNames.length} columns:`, headers);

                // Create worksheet with processed data
                const ws = window.XLSX.utils.json_to_sheet(processedData, {
                    header: fieldNames
                });

                // FIXED: Add formatted header row
                window.XLSX.utils.sheet_add_aoa(ws, [headers], { origin: "A1" });

                // FIXED: Set appropriate column widths based on field types
                ws['!cols'] = fieldNames.map(fieldName => {
                    const width = this._getColumnWidth(fieldName);
                    return { wch: width };
                });

                // Create workbook
                const wb = window.XLSX.utils.book_new();
                window.XLSX.utils.book_append_sheet(wb, ws, "WBS Creation Results");

                // FIXED: Enhanced workbook properties
                wb.Props = {
                    Title: "WBS Element Creation Results",
                    Subject: "Export of WBS creation batch processing results",
                    Author: "WBS Creation Application",
                    CreatedDate: new Date()
                };

                // Convert to blob
                const wbOut = window.XLSX.write(wb, {
                    bookType: 'xlsx',
                    type: 'array'
                });

                const blob = new Blob([wbOut], {
                    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
                });

                console.log(`XlsxFormatter: Excel export completed successfully with ${processedData.length} rows`);
                resolve(blob);

            } catch (error) {
                console.error("XlsxFormatter: Error exporting to Excel:", error);
                reject(error);
            }
        });
    };

    /**
     * FIXED: Get appropriate column width based on field type
     * @param {string} fieldName - Name of the field
     * @returns {number} Column width
     * @private
     */
    XlsxFormatter.prototype._getColumnWidth = function (fieldName) {
        const widthMap = {
            "Status": 12,
            "ProjectElement": 20,
            "ProjectElementDescription": 25,
            "Message": 40,
            "CompanyCode": 12,
            "ResponsibleCostCenter": 18,
            "ProfitCenter": 15,
            "YY1_ATMID_PTD": 15,
            "YY1_Address_PTD": 20,
            "YY1_State_PTD": 12,
            "YY1_Project_PTD": 18,
            "YY1_Categorization1_PTD": 15,
            "YY1_ExactWBScode_PTD": 20,
            "YY1_OldProjectSiteID_PTD": 18,
            "YY1_Postalcode_PTD": 12
        };

        return widthMap[fieldName] || 15; // Default width
    };

    /**
     * Get file extension
     * @returns {string} File extension
     */
    XlsxFormatter.prototype.getFileExtension = function () {
        return "xlsx";
    };

    /**
     * Get MIME type
     * @returns {string} MIME type
     */
    XlsxFormatter.prototype.getMimeType = function () {
        return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
    };

    return XlsxFormatter;
});