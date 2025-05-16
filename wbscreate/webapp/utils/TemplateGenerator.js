sap.ui.define([
    "wbscreate/utils/XlsxFormatter" // Depends on XlsxFormatter for default template
], function (XlsxFormatter) {
    "use strict";

    return class ProjectElementTemplateGenerator {

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

                        // Create headers based on the Project Element API schema
                        const headers = [
                            // Core Project Element Fields
                            "Project Element (Required)",
                            "Project UUID",
                            "Project Element Description",
                            "Planned Start Date",
                            "Planned End Date",

                            // Organizational Fields
                            "Responsible Cost Center",
                            "Company Code",
                            "Profit Center",
                            "Controlling Area",

                            // Boolean and Special Fields
                            "WBS Element is Billing Element",

                            // Custom Extension Fields
                            "Old Project Site ID",
                            "Exact WBS Code",
                            "Site Type (OF/ON)",
                            "ATM ID",

                            // Additional Custom Fields
                            "Address",
                            "State",
                            "Bank Name",
                            "ATM Count",
                            "Nature of WBS",
                            "SAP Site ID Report",
                            "Address and Postal Code",
                            "Deployment",
                            "Bank Load ATM Discount %",
                            "ERP Relocation Ref ATM ID",
                            "ERP Site ID Report",
                            "UDF3",
                            "Categorization",
                            "UDF1",
                            "Postal Code",
                            "UDF2",
                            "ERP Relocation Ref Site ID"
                        ];

                        // Example row with sample data for all fields
                        const exampleRow = {
                            // Core Fields
                            "Project Element (Required)": "B-SBP-OF-00TS889",
                            "Project UUID": "123e4567-e89b-12d3-a456-426614174000",
                            "Project Element Description": "00TSSB91_Updated_Test",
                            "Planned Start Date": "2024-01-01",
                            "Planned End Date": "2024-12-31",

                            // Organizational Fields
                            "Responsible Cost Center": "CC001",
                            "Company Code": "1000",
                            "Profit Center": "PROFIT001",
                            "Controlling Area": "CA01",

                            // Boolean and Special Fields
                            "WBS Element is Billing Element": "Yes",

                            // Custom Extension Fields
                            "Old Project Site ID": "OLDSITE001",
                            "Exact WBS Code": "B-SBP-OF-EXACT001",
                            "Site Type (OF/ON)": "Offsite",
                            "ATM ID": "ATM-001",

                            // Additional Custom Fields
                            "Address": "Sample Address",
                            "State": "Sample State",
                            "Bank Name": "Sample Bank",
                            "ATM Count": "1",
                            "Nature of WBS": "Site",
                            "SAP Site ID Report": "SAPSITEID",
                            "Address and Postal Code": "Sample Address, 12345",
                            "Deployment": "Urban",
                            "Bank Load ATM Discount %": "0.5",
                            "ERP Relocation Ref ATM ID": "RELOCATEATM",
                            "ERP Site ID Report": "ERPSITEID",
                            "UDF3": "User Defined Field 3",
                            "Categorization": "Category A",
                            "UDF1": "User Defined Field 1",
                            "Postal Code": "12345",
                            "UDF2": "User Defined Field 2",
                            "ERP Relocation Ref Site ID": "RELOCATESITE"
                        };

                        const wb = await this._xlsxFormatter.createWorkbookForTemplate(headers, exampleRow);
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
         * Gets the desired template filename, preferring custom processor.
         * @returns {string} The template filename.
         */
        getTemplateFileName() {
            let defaultName = "Project_Element_Template.xlsx";
            if (this._customProcessor && typeof this._customProcessor.getTemplateFileName === 'function') {
                try {
                    return this._customProcessor.getTemplateFileName() || defaultName;
                } catch (e) { /* ignore error, use default */ }
            }
            return defaultName;
        }
    };
});