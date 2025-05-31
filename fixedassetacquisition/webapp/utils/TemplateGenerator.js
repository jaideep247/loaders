sap.ui.define([
    "fixedassetacquisition/utils/XlsxFormatter" // Adjust path if needed
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

                        // --- Define Headers based on the NEW structure ---
                        const headers = [
                            "Sequence ID", "Reference Document Item", "Business Transaction Type", "Company Code",
                            "Master Fixed Asset", "Fixed Asset", "Document Date", "Posting Date", "Asset Value Date",
                            "Debit Credit Code", "Fixed Asset Year Of Acquisition Code", "Document Reference ID",
                            "Accounting Document Header Text", "Transaction Currency", "Acquisition Amount In Transaction Currency",
                            "Quantity In Base Unit", "Base Unit SAP Code", "Base Unit ISO Code", "Accounting Document Type",
                            "Assignment Reference", "Document Item Text", "Offsetting Account"
                        ];
              
                        // --- Create Example Row ---
                        const today = new Date();
                        const formattedDate = today.toISOString().slice(0, 10); // YYYY-MM-DD
                        const exampleRow = {
                            "Sequence ID": "1",
                            "Reference Document Item": "000001",
                            "Business Transaction Type": "RA10",
                            "Company Code": "1000",
                            "Master Fixed Asset": "ASSET-001",
                            "Fixed Asset": "0000",
                            "Document Date": formattedDate,
                            "Posting Date": formattedDate,
                            "Asset Value Date": formattedDate,
                            "Debit Credit Code": "S",
                            "Fixed Asset Year Of Acquisition Code": "1",  // FIXED
                            "Document Reference ID": "Reference 0001",
                            "Accounting Document Header Text": "Acquisition XYZ",
                            "Transaction Currency": "INR",
                            "Acquisition Amount In Transaction Currency": "1500.00",  // FIXED
                            "Quantity In Base Unit": "1",
                            "Base Unit SAP Code": "EA",
                            "Base Unit ISO Code": "EA",
                            "Accounting Document Type": "AA",
                            "Assignment Reference": "Project ABC",
                            "Document Item Text": "Asset Item Description",
                            "Offsetting Account": "1234567890"
                        };
                        // Use XlsxFormatter to create the workbook with data and help sheet
                        const wb = await this._xlsxFormatter.createWorkbookForTemplate(
                            headers,
                            exampleRow,
                            "Fixed Asset Acquisitions", // Sheet name
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
            let defaultName = "FixedAssetAcquisition_Template.xlsx"; // Updated default name
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
                return null;
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
                    { "Field Name (Excel Header)": "Sheet Name", "Technical Field Name": "", "Description & Constraints": "Ensure the data is in a sheet named 'Fixed Asset Acquisitions'." },
                    { "Field Name (Excel Header)": "Data Format", "Technical Field Name": "", "Description & Constraints": "Enter data starting from the second row. Do not modify the header row." },
                    { "Field Name (Excel Header)": "Required Fields", "Technical Field Name": "", "Description & Constraints": "Fields marked as (Required) must have a value." },
                    { "Field Name (Excel Header)": "Dates", "Technical Field Name": "", "Description & Constraints": "Use YYYY-MM-DD format (e.g., 2025-12-31)." },
                    { "Field Name (Excel Header)": "Amounts/Numbers", "Technical Field Name": "", "Description & Constraints": "Enter numbers without currency symbols or thousands separators (e.g., 1234.50)." },
                    { "Field Name (Excel Header)": "--- FIELD DETAILS ---", "Technical Field Name": "", "Description & Constraints": "" }
                );

                return helpData;

            } catch (error) {
                console.error("Error preparing help sheet data:", error);
                return null;
            }
        }
    };
});