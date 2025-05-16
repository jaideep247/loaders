sap.ui.define([
    "assetretirementwr/utils/XlsxFormatter" // Adjust path if needed
], function (XlsxFormatter) {
    "use strict";

    return class TemplateGenerator {

        constructor(options = {}) {
            // Ensure XlsxFormatter is instantiated correctly
            this._xlsxFormatter = options.xlsxFormatter || new XlsxFormatter();
            // customExcelProcessor allows overriding template generation (e.g., using ExcelProcessor directly)
            this._customProcessor = options.customExcelProcessor;
            this._validationManager = options.validationManager; // Get ValidationManager for help sheet
        }

        /**
         * Generates the template file Blob, preferring custom processor.
         * @returns {Promise<Blob>} Promise resolving with the template Blob.
         */
        generateTemplateBlob() {
            return new Promise(async (resolve, reject) => {
                try {
                    let blob = null;
                    let useDefault = true;

                    // --- Try Custom Processor First ---
                    if (this._customProcessor && typeof this._customProcessor.createTemplateFile === 'function') {
                        try {
                            console.debug("TemplateGenerator: Attempting template generation via custom ExcelProcessor.");
                            // Assuming createTemplateFile returns ArrayBuffer
                            const arrayBuffer = this._customProcessor.createTemplateFile();
                            if (arrayBuffer instanceof ArrayBuffer) {
                                blob = new Blob([arrayBuffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
                                useDefault = false;
                                console.debug("TemplateGenerator: Used custom processor successfully.");
                            } else {
                                console.warn("TemplateGenerator: Custom processor createTemplateFile did not return ArrayBuffer.");
                            }
                        } catch (customError) {
                            console.warn("TemplateGenerator: Custom processor failed, using default template generation.", customError);
                        }
                    } else {
                        console.debug("TemplateGenerator: No custom ExcelProcessor provided or it lacks createTemplateFile method.");
                    }


                    // --- Default Generation (if custom failed or not available) ---
                    if (useDefault) {
                        console.debug("TemplateGenerator: Using default XLSX template generation.");

                        // --- Define Headers for Fixed Asset Retirement template ---
                        // Include all the requested fields
                        const headers = [
                            "Sequence ID",
                            "Reference Document Item",
                            "Business Transaction Type",
                            "Company Code",
                            "Master Fixed Asset",
                            "Fixed Asset",
                            "Document Date",
                            "Posting Date",
                            "Asset Value Date",
                            "Fixed Asset Retirement Revenue Type",
                            "Asset Revenue Amount In Transaction Currency",
                            "Fixed Asset Retirement Revenue Transaction Currency",
                            "Fixed Asset Retirement Revenue Currency Role",
                            "Fixed Asset Retirement Type",
                            "Document Reference ID",
                            "Accounting Document Header Text",
                            "Base Unit SAP Code",
                            "Base Unit ISO Code",
                            "Accounting Document Type",
                            "Assignment Reference",
                            "Document Item Text"
                        ];

                        // --- Create Example Row for Asset Retirement ---
                        const today = new Date();
                        const formattedDate = today.toISOString().slice(0, 10); // YYYY-MM-DD
                        const exampleRow = {
                            "Sequence ID": "1",
                            "Reference Document Item": "000001",
                            "Business Transaction Type": "RA20",
                            "Company Code": "1000",
                            "Master Fixed Asset": "20002290",
                            "Fixed Asset": "0",
                            "Document Date": formattedDate,
                            "Posting Date": formattedDate,
                            "Asset Value Date": formattedDate,
                            "Fixed Asset Retirement Revenue Type": "1",
                            "Asset Revenue Amount In Transaction Currency": "200",
                            "Fixed Asset Retirement Revenue Transaction Currency": "INR",
                            "Fixed Asset Retirement Revenue Currency Role": "10",
                            "Fixed Asset Retirement Type": "1",
                            "Document Reference ID": "REF-ID",
                            "Accounting Document Header Text": "Header text",
                            "Base Unit SAP Code": "EA",
                            "Base Unit ISO Code": "EA",
                            "Accounting Document Type": "SA",
                            "Assignment Reference": "Ass ref",
                            "Document Item Text": "Item text"
                        };

                        // Use XlsxFormatter to create the workbook with data and help sheet
                        const wb = await this._xlsxFormatter.createWorkbookForTemplate(
                            headers,
                            exampleRow,
                            "Asset Retirements", // Sheet name
                            this._getHelpSheetData()   // Get help data from Validation Manager
                        );

                        blob = await this._xlsxFormatter.workbookToBlob(wb);
                        console.debug("TemplateGenerator: Default template generated.");
                    }

                    if (!(blob instanceof Blob)) {
                        throw new Error("Failed to generate a valid template Blob.");
                    }

                    resolve(blob);
                } catch (error) {
                    console.error("Error generating template blob:", error);
                    reject(error);
                }
            });
        }

        /**
         * Gets the desired template filename.
         * @returns {string} The template filename.
         */
        getTemplateFileName() {
            let defaultName = "FixedAssetRetirement_Template.xlsx"; // Updated default name for retirement
            // Custom processor filename override (optional)
            if (this._customProcessor && typeof this._customProcessor.getTemplateFileName === 'function') {
                try {
                    return this._customProcessor.getTemplateFileName() || defaultName;
                } catch (e) {
                    console.warn("Error getting filename from custom processor:", e);
                }
            }
            return defaultName;
        }

        /**
         * Prepares data for the Help sheet using ValidationManager.
         * @returns {Array|null} Array of objects for the help sheet or null on error.
         * @private
         */
        _getHelpSheetData() {
            if (!this._validationManager || typeof this._validationManager.getFieldConstraintsDescription !== 'function') {
                console.warn("TemplateGenerator: ValidationManager not available for generating help sheet data.");

                // Return basic help data for Asset Retirement template with all fields
                return [
                    { "Field Name (Excel Header)": "--- GENERAL INSTRUCTIONS ---", "Technical Field Name": "", "Description & Constraints": "" },
                    { "Field Name (Excel Header)": "Sheet Name", "Technical Field Name": "", "Description & Constraints": "Ensure the data is in a sheet named 'Asset Retirements'." },
                    { "Field Name (Excel Header)": "Data Format", "Technical Field Name": "", "Description & Constraints": "Enter data starting from the second row. Do not modify the header row." },
                    { "Field Name (Excel Header)": "Required Fields", "Technical Field Name": "", "Description & Constraints": "Fields marked as (Required) must have a value." },
                    { "Field Name (Excel Header)": "Dates", "Technical Field Name": "", "Description & Constraints": "Use YYYY-MM-DD format (e.g., 2025-05-12)." },
                    { "Field Name (Excel Header)": "--- FIELD DETAILS ---", "Technical Field Name": "", "Description & Constraints": "" },
                    { "Field Name (Excel Header)": "Sequence ID", "Technical Field Name": "SequenceID", "Description & Constraints": "Unique identifier for the record (Required)" },
                    { "Field Name (Excel Header)": "Reference Document Item", "Technical Field Name": "ReferenceDocumentItem", "Description & Constraints": "Reference to the document item" },
                    { "Field Name (Excel Header)": "Business Transaction Type", "Technical Field Name": "BusinessTransactionType", "Description & Constraints": "Transaction type code (e.g., RA20, RA21) (Required)" },
                    { "Field Name (Excel Header)": "Company Code", "Technical Field Name": "CompanyCode", "Description & Constraints": "SAP Company Code (Required)" },
                    { "Field Name (Excel Header)": "Master Fixed Asset", "Technical Field Name": "MasterFixedAsset", "Description & Constraints": "Master Fixed Asset number (Required)" },
                    { "Field Name (Excel Header)": "Fixed Asset", "Technical Field Name": "FixedAsset", "Description & Constraints": "Fixed Asset number" },
                    { "Field Name (Excel Header)": "Document Date", "Technical Field Name": "DocumentDate", "Description & Constraints": "Date of the document (YYYY-MM-DD) (Required)" },
                    { "Field Name (Excel Header)": "Posting Date", "Technical Field Name": "PostingDate", "Description & Constraints": "Date of posting (YYYY-MM-DD) (Required)" },
                    { "Field Name (Excel Header)": "Asset Value Date", "Technical Field Name": "AssetValueDate", "Description & Constraints": "Asset value date (YYYY-MM-DD) (Required)" },
                    { "Field Name (Excel Header)": "Fixed Asset Retirement Revenue Type", "Technical Field Name": "FxdAstRetirementRevenueType", "Description & Constraints": "Type of retirement revenue (e.g., 1)" },
                    { "Field Name (Excel Header)": "Asset Revenue Amount In Transaction Currency", "Technical Field Name": "AstRevenueAmountInTransCrcy", "Description & Constraints": "Amount of revenue in transaction currency" },
                    { "Field Name (Excel Header)": "Fixed Asset Retirement Revenue Transaction Currency", "Technical Field Name": "FxdAstRtrmtRevnTransCrcy", "Description & Constraints": "Currency code (e.g., INR, USD)" },
                    { "Field Name (Excel Header)": "Fixed Asset Retirement Revenue Currency Role", "Technical Field Name": "FxdAstRtrmtRevnCurrencyRole", "Description & Constraints": "Currency role code (e.g., 10)" },
                    { "Field Name (Excel Header)": "Fixed Asset Retirement Type", "Technical Field Name": "FixedAssetRetirementType", "Description & Constraints": "Type of retirement (e.g., 1) (Required)" },
                    { "Field Name (Excel Header)": "Document Reference ID", "Technical Field Name": "DocumentReferenceID", "Description & Constraints": "Reference ID for the document" },
                    { "Field Name (Excel Header)": "Accounting Document Header Text", "Technical Field Name": "AccountingDocumentHeaderText", "Description & Constraints": "Header text for accounting document" },
                    { "Field Name (Excel Header)": "Base Unit SAP Code", "Technical Field Name": "BaseUnitSAPCode", "Description & Constraints": "SAP code for the base unit (e.g., EA)" },
                    { "Field Name (Excel Header)": "Base Unit ISO Code", "Technical Field Name": "BaseUnitISOCode", "Description & Constraints": "ISO code for the base unit (e.g., EA)" },
                    { "Field Name (Excel Header)": "Accounting Document Type", "Technical Field Name": "AccountingDocumentType", "Description & Constraints": "Type of accounting document (e.g., SA)" },
                    { "Field Name (Excel Header)": "Assignment Reference", "Technical Field Name": "AssignmentReference", "Description & Constraints": "Reference for the assignment" },
                    { "Field Name (Excel Header)": "Document Item Text", "Technical Field Name": "DocumentItemText", "Description & Constraints": "Text for the document item" }
                ];
            }

            try {
                const fieldInfo = this._validationManager.getFieldConstraintsDescription(); // Expects { fieldName: { description, required, ... } }
                const sortedFields = Object.keys(fieldInfo).sort(); // Optional: Sort for consistency

                const helpData = sortedFields.map(field => {
                    const info = fieldInfo[field];
                    let details = info.description || field;
                    if (info.required) details += " (Required)";
                    if (info.type) details += ` [Type: ${info.type}]`;
                    if (info.maxLength) details += ` (Max Length: ${info.maxLength})`;
                    if (info.pattern) details += ` (Format: ${info.pattern})`;
                    if (info.sap_type) details += ` (SAP Type: ${info.sap_type})`;
                    if (info.precision) details += ` (Precision: ${info.precision}${info.scale ? `, Scale: ${info.scale}` : ''})`;
                    if (info.minValue !== undefined) details += ` (Min: ${info.minValue})`;
                    if (info.maxValue !== undefined) details += ` (Max: ${info.maxValue})`;
                    if (info.allowedValues) details += ` (Allowed: ${info.allowedValues.join(', ')})`;

                    return {
                        "Field Name (Excel Header)": info.excelHeader || field, // Use Excel header from constraint
                        "Technical Field Name": field,
                        "Description & Constraints": details
                    };
                });

                // Add general instructions
                helpData.unshift(
                    { "Field Name (Excel Header)": "--- GENERAL INSTRUCTIONS ---", "Technical Field Name": "", "Description & Constraints": "" },
                    { "Field Name (Excel Header)": "Sheet Name", "Technical Field Name": "", "Description & Constraints": "Ensure the data is in a sheet named 'Asset Retirements'." },
                    { "Field Name (Excel Header)": "Data Format", "Technical Field Name": "", "Description & Constraints": "Enter data starting from the second row. Do not modify the header row." },
                    { "Field Name (Excel Header)": "Required Fields", "Technical Field Name": "", "Description & Constraints": "Fields marked as (Required) must have a value." },
                    { "Field Name (Excel Header)": "Dates", "Technical Field Name": "", "Description & Constraints": "Use YYYY-MM-DD format (e.g., 2025-05-12)." },
                    { "Field Name (Excel Header)": "--- FIELD DETAILS ---", "Technical Field Name": "", "Description & Constraints": "" }
                );

                return helpData;

            } catch (error) {
                console.error("Error preparing help sheet data:", error);

                // Return basic help data for Asset Retirement template with all fields
                return [
                    { "Field Name (Excel Header)": "--- GENERAL INSTRUCTIONS ---", "Technical Field Name": "", "Description & Constraints": "" },
                    { "Field Name (Excel Header)": "Sheet Name", "Technical Field Name": "", "Description & Constraints": "Ensure the data is in a sheet named 'Asset Retirements'." },
                    { "Field Name (Excel Header)": "Data Format", "Technical Field Name": "", "Description & Constraints": "Enter data starting from the second row. Do not modify the header row." },
                    { "Field Name (Excel Header)": "Required Fields", "Technical Field Name": "", "Description & Constraints": "Fields marked as (Required) must have a value." },
                    { "Field Name (Excel Header)": "Dates", "Technical Field Name": "", "Description & Constraints": "Use YYYY-MM-DD format (e.g., 2025-05-12)." },
                    { "Field Name (Excel Header)": "--- FIELD DETAILS ---", "Technical Field Name": "", "Description & Constraints": "" },
                    { "Field Name (Excel Header)": "Sequence ID", "Technical Field Name": "SequenceID", "Description & Constraints": "Unique identifier for the record (Required)" },
                    { "Field Name (Excel Header)": "Reference Document Item", "Technical Field Name": "ReferenceDocumentItem", "Description & Constraints": "Reference to the document item" },
                    { "Field Name (Excel Header)": "Business Transaction Type", "Technical Field Name": "BusinessTransactionType", "Description & Constraints": "Transaction type code (e.g., RA20, RA21) (Required)" },
                    { "Field Name (Excel Header)": "Company Code", "Technical Field Name": "CompanyCode", "Description & Constraints": "SAP Company Code (Required)" },
                    { "Field Name (Excel Header)": "Master Fixed Asset", "Technical Field Name": "MasterFixedAsset", "Description & Constraints": "Master Fixed Asset number (Required)" },
                    { "Field Name (Excel Header)": "Fixed Asset", "Technical Field Name": "FixedAsset", "Description & Constraints": "Fixed Asset number" },
                    { "Field Name (Excel Header)": "Document Date", "Technical Field Name": "DocumentDate", "Description & Constraints": "Date of the document (YYYY-MM-DD) (Required)" },
                    { "Field Name (Excel Header)": "Posting Date", "Technical Field Name": "PostingDate", "Description & Constraints": "Date of posting (YYYY-MM-DD) (Required)" },
                    { "Field Name (Excel Header)": "Asset Value Date", "Technical Field Name": "AssetValueDate", "Description & Constraints": "Asset value date (YYYY-MM-DD) (Required)" },
                    { "Field Name (Excel Header)": "Fixed Asset Retirement Revenue Type", "Technical Field Name": "FxdAstRetirementRevenueType", "Description & Constraints": "Type of retirement revenue (e.g., 1)" },
                    { "Field Name (Excel Header)": "Asset Revenue Amount In Transaction Currency", "Technical Field Name": "AstRevenueAmountInTransCrcy", "Description & Constraints": "Amount of revenue in transaction currency" },
                    { "Field Name (Excel Header)": "Fixed Asset Retirement Revenue Transaction Currency", "Technical Field Name": "FxdAstRtrmtRevnTransCrcy", "Description & Constraints": "Currency code (e.g., INR, USD)" },
                    { "Field Name (Excel Header)": "Fixed Asset Retirement Revenue Currency Role", "Technical Field Name": "FxdAstRtrmtRevnCurrencyRole", "Description & Constraints": "Currency role code (e.g., 10)" },
                    { "Field Name (Excel Header)": "Fixed Asset Retirement Type", "Technical Field Name": "FixedAssetRetirementType", "Description & Constraints": "Type of retirement (e.g., 1) (Required)" },
                    { "Field Name (Excel Header)": "Document Reference ID", "Technical Field Name": "DocumentReferenceID", "Description & Constraints": "Reference ID for the document" },
                    { "Field Name (Excel Header)": "Accounting Document Header Text", "Technical Field Name": "AccountingDocumentHeaderText", "Description & Constraints": "Header text for accounting document" },
                    { "Field Name (Excel Header)": "Base Unit SAP Code", "Technical Field Name": "BaseUnitSAPCode", "Description & Constraints": "SAP code for the base unit (e.g., EA)" },
                    { "Field Name (Excel Header)": "Base Unit ISO Code", "Technical Field Name": "BaseUnitISOCode", "Description & Constraints": "ISO code for the base unit (e.g., EA)" },
                    { "Field Name (Excel Header)": "Accounting Document Type", "Technical Field Name": "AccountingDocumentType", "Description & Constraints": "Type of accounting document (e.g., SA)" },
                    { "Field Name (Excel Header)": "Assignment Reference", "Technical Field Name": "AssignmentReference", "Description & Constraints": "Reference for the assignment" },
                    { "Field Name (Excel Header)": "Document Item Text", "Technical Field Name": "DocumentItemText", "Description & Constraints": "Text for the document item" }
                ];
            }
        }
    };
});