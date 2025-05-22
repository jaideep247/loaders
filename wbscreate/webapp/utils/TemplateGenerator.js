sap.ui.define([
    "wbscreate/utils/XlsxFormatter",
    "wbscreate/utils/DataTransformer"
], function (XlsxFormatter,DataTransformer) {
    "use strict";

    return class TemplateGenerator {

        constructor(options = {}) {
            // Inject XlsxFormatter for default template generation
            this._xlsxFormatter = options.xlsxFormatter || new XlsxFormatter();
            // Inject custom processor if provided
            this._customProcessor = options.customExcelProcessor;
        }

        /**
         * Generates the Project Element template file Blob, preferring custom processor.
         * @returns {Promise<Blob>} Promise resolving with the template Blob.
         */
        generateTemplateBlob() {
            return new Promise(async (resolve, reject) => {
                try {
                    let blob = null;
                    // Try custom processor first
                    if (this._customProcessor && typeof this._customProcessor.createTemplateBlob === 'function') {
                        try {
                            console.debug("ProjectElementTemplateGenerator: Using custom processor.");
                            blob = await this._customProcessor.createTemplateBlob();
                            if (!(blob instanceof Blob)) blob = null; // Fallback if it doesn't return a Blob
                        } catch (customError) {
                            console.warn("ProjectElementTemplateGenerator: Custom processor failed, using default.", customError);
                            blob = null;
                        }
                    }

                    // Fallback to default if no blob generated yet
                    if (!blob) {
                        console.debug("ProjectElementTemplateGenerator: Using default XLSX template generation.");

                        // Define technical field names and their business-friendly display names
                        const dataTransformer = new DataTransformer();
                        const fieldMappings = dataTransformer.getFieldMappingsForTemplate();
                        // Create the headers with business-friendly display names
                        const headers = fieldMappings.map(mapping => mapping.displayName);

                        // Create the mapping of technical field names for the example row data
                        const fieldNames = fieldMappings.map(mapping => mapping.field);

                        // Example row with sample data for all fields (using same data as provided)
                        const exampleRowData = {
                            "ProjectElement": "B-SBP-OF-00TS5976",
                            "ProjectUUID": "159b9e67-d1a9-1eef-aea9-b582a1b144e5",
                            "ProjectElementDescription": "00TSSB91",
                            "PlannedStartDate": "2024-12-01",
                            "PlannedEndDate": "2024-12-31",
                            "ResponsibleCostCenter": "1AP_BLA001",
                            "CompanyCode": "1000",
                            "ProfitCenter": "1AP_BLA001",
                            "ControllingArea": "A000",
                            "WBSElementIsBillingElement": "X",
                            "YY1_OldProjectSiteID_PTD": "OLD123",
                            "YY1_ExactWBScode_PTD": "B-SBP-OF-00TSSB91",
                            "YY1_Categorization1_PTD": "Offsite",
                            "YY1_ATMID_PTD": "ATM-12345",
                            "YY1_Address_PTD": "Jhajjhar",
                            "YY1_State_PTD": "Haryana",
                            "YY1_Project_PTD": "SBI BANK",
                            "YY1_ATMCount_PTD": "1",
                            "YY1_NatureOfWBS_PTD": "SITE",
                            "YY1_SAPsiteIDReport_PTD": "ERTSAPSITE",
                            "YY1_Addressandpostalco_PTD": "DORA GUA VILLAGE",
                            "YY1_Deployment_PTD": "URBAN",
                            "YY1_BankLoadATMDiscoun_PTD": "0.02",
                            "YY1_ERPRelocationRefAT_PTD": "ERP RELOCATIONATM",
                            "YY1_ERPsiteIDReport_PTD": "ERPSAP ITE",
                            "YY1_UDF3_PTD": "UDF-1",
                            "YY1_Categorization_PTD": "GOLD",
                            "YY1_UDF1_PTD": "2024-12-01",
                            "YY1_Postalcode_PTD": "122001",
                            "YY1_UDF2_PTD": "2024-12-01",
                            "YY1_ERPRelocationRefer_PTD": "RELOCATION"
                        };

                        // Format example row to maintain the correct order based on fieldNames
                        const exampleRow = {};
                        fieldNames.forEach((field, index) => {
                            exampleRow[headers[index]] = exampleRowData[field];
                        });

                        // Create the workbook with business-friendly headers and example data
                        const wb = await this._xlsxFormatter.createWorkbookForTemplate(headers, exampleRow);

                        // Add hidden technical field mapping in a separate sheet
                        this._addFieldMappingSheet(wb, fieldMappings);

                        blob = await this._xlsxFormatter.workbookToBlob(wb);
                    }

                    resolve(blob);

                } catch (error) {
                    console.error("Error generating Project Element template blob:", error);
                    reject(error);
                }
            });
        }

        /**
         * Adds a hidden sheet with field mappings to help with data processing
         * @param {object} workbook - The XLSX workbook object
         * @param {Array} fieldMappings - Array of field mapping objects
         * @private
         */
        _addFieldMappingSheet(workbook, fieldMappings) {
            if (!workbook || !workbook.SheetNames || !workbook.Sheets) {
                console.warn("Invalid workbook object, can't add field mapping sheet");
                return;
            }

            try {
                // Create sheet name for field mappings
                const sheetName = "_FieldMappings";

                // Add the sheet to the workbook
                workbook.SheetNames.push(sheetName);

                // Prepare the sheet data with headers and mapping rows
                const mappingData = [
                    ["TechnicalFieldName", "DisplayName"],
                    ...fieldMappings.map(mapping => [mapping.field, mapping.displayName])
                ];

                // Convert to worksheet format
                const worksheet = {};
                mappingData.forEach((row, rowIndex) => {
                    row.forEach((cellValue, colIndex) => {
                        const cellAddress = this._getCellAddress(rowIndex, colIndex);
                        worksheet[cellAddress] = { v: cellValue };
                    });
                });

                // Set range
                const range = {
                    s: { c: 0, r: 0 },
                    e: { c: 1, r: fieldMappings.length }
                };
                worksheet['!ref'] = this._getRange(range);

                // Add the worksheet to the workbook
                workbook.Sheets[sheetName] = worksheet;

                // Set the sheet to hidden
                if (!workbook.Workbook) {
                    workbook.Workbook = { Sheets: [] };
                }
                if (!workbook.Workbook.Sheets) {
                    workbook.Workbook.Sheets = [];
                }

                // Ensure there's an entry for each sheet
                while (workbook.Workbook.Sheets.length < workbook.SheetNames.length) {
                    workbook.Workbook.Sheets.push({});
                }

                // Set the mapping sheet to hidden
                workbook.Workbook.Sheets[workbook.SheetNames.indexOf(sheetName)].Hidden = 1;

            } catch (error) {
                console.error("Error adding field mapping sheet:", error);
                // Continue without the mapping sheet rather than failing completely
            }
        }

        /**
         * Utility function to get cell address from row and column indices
         * @param {number} rowIndex - Zero-based row index
         * @param {number} colIndex - Zero-based column index
         * @returns {string} Cell address (e.g., "A1")
         * @private
         */
        _getCellAddress(rowIndex, colIndex) {
            const colChar = String.fromCharCode(65 + colIndex); // A, B, C, etc.
            return colChar + (rowIndex + 1);
        }

        /**
         * Utility function to get range string from range object
         * @param {object} range - Range object with s and e properties
         * @returns {string} Range string (e.g., "A1:B10")
         * @private
         */
        _getRange(range) {
            const startCol = String.fromCharCode(65 + range.s.c);
            const endCol = String.fromCharCode(65 + range.e.c);
            return `${startCol}${range.s.r + 1}:${endCol}${range.e.r + 1}`;
        }

        /**
         * Gets the desired template filename, preferring custom processor.
         * @returns {string} The template filename.
         */
        getTemplateFileName() {
            let defaultName = "WBS_Element_Upload_Template.xlsx";
            if (this._customProcessor && typeof this._customProcessor.getTemplateFileName === 'function') {
                try {
                    return this._customProcessor.getTemplateFileName() || defaultName;
                } catch (e) { /* ignore error, use default */ }
            }
            return defaultName;
        }
    };
});