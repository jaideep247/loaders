sap.ui.define([
    "serviceentrysheet/utils/XlsxFormatter" // Depends on XlsxFormatter for default template generation
], function (XlsxFormatter) {
    "use strict";

    return class TemplateGenerator {

        constructor(options = {}) {
            // Inject XlsxFormatter for default template generation
            this._xlsxFormatter = options.xlsxFormatter || new XlsxFormatter();
            // Inject custom processor if provided
            this._customProcessor = options.customExcelProcessor;
        }

        /**
         * Generates the template file Blob, preferring custom processor.
         * Updated to include Service and QuantityUnit fields
         * @returns {Promise<Blob>} Promise resolving with the template Blob.
         */
        generateTemplateBlob() {
            return new Promise(async (resolve, reject) => {
                try {
                    let blob = null;
                    // Try custom processor first
                    if (this._customProcessor && typeof this._customProcessor.createTemplateBlob === 'function') {
                        try {
                            console.debug("TemplateGenerator: Using custom processor.");
                            blob = await this._customProcessor.createTemplateBlob();
                            if (!(blob instanceof Blob)) blob = null; // Fallback if it doesn't return a Blob
                        } catch (customError) {
                            console.warn("TemplateGenerator: Custom processor failed, using default.", customError);
                            blob = null;
                        }
                    }

                    // Fallback to default if no blob generated yet
                    if (!blob) {
                        console.debug("TemplateGenerator: Using default XLSX template generation with Service and QuantityUnit fields.");
                        
                        // Updated headers to include Service and QuantityUnit fields
                        const headers = [
                            "SL", "PurchasingOrganization", "PurchasingGroup", "Currency", "ServiceEntrySheetName",
                            "Supplier", "PostingDate", "ServiceEntrySheetItem", "AccountAssignmentCategory", 
                            "Service", "QuantityUnit", "ConfirmedQuantity", // Added Service and QuantityUnit
                            "Plant", "NetAmount", "NetPriceAmount", "PurchaseOrder", "PurchaseOrderItem",
                            "ServicePerformanceDate", "ServicePerformanceEndDate", "AccountAssignment",
                            "CostCenter", "GLAccount", "WBS Element", "GRNCreate"
                        ];

                        // Create example data rows
                        const exampleData = this._createExampleData();

                        // Try the XlsxFormatter method first
                        try {
                            const wb = await this._xlsxFormatter.createWorkbookForTemplate(headers, exampleData);
                            blob = await this._xlsxFormatter.workbookToBlob(wb);
                            console.debug("TemplateGenerator: Successfully created template using XlsxFormatter");
                        } catch (xlsxError) {
                            console.warn("TemplateGenerator: XlsxFormatter failed, using fallback method", xlsxError);
                            // Fallback to direct workbook creation
                            blob = await this._createTemplateDirectly(headers, exampleData);
                        }
                    }

                    if (!blob) {
                        throw new Error("Failed to generate template blob using all available methods");
                    }

                    console.debug("TemplateGenerator: Template blob created successfully", {
                        size: blob.size,
                        type: blob.type
                    });

                    resolve(blob);

                } catch (error) {
                    console.error("Error generating template blob:", error);
                    reject(error);
                }
            });
        }

        /**
         * Create example data for the template
         * @private
         * @returns {Array} Array of example row objects
         */
        _createExampleData() {
            // Example row with service fields populated
            const exampleRow1 = {
                "SL": "1",
                "PurchasingOrganization": "2000",
                "PurchasingGroup": "P01",
                "Currency": "INR",
                "ServiceEntrySheetName": "Service Entry Sheet Test Name",
                "Supplier": "22000001",
                "PostingDate": "2025-01-01",
                "ServiceEntrySheetItem": "10",
                "AccountAssignmentCategory": "Z",
                "Service": "SERVICE001", // Example service number
                "QuantityUnit": "EA", // Example unit (Each)
                "ConfirmedQuantity": "1",
                "Plant": "2001",
                "NetAmount": "1000.00",
                "NetPriceAmount": "1000.00",
                "PurchaseOrder": "4300000001",
                "PurchaseOrderItem": "10",
                "ServicePerformanceDate": "2025-01-01",
                "ServicePerformanceEndDate": "2025-01-01",
                "AccountAssignment": "1",
                "CostCenter": "61020050",
                "GLAccount": "",
                "WBS Element": "I-24-DEP-100-ATMDL",
                "GRNCreate": "TRUE"
            };

            // Example row without service fields (both empty - valid scenario)
            const exampleRow2 = {
                "SL": "2",
                "PurchasingOrganization": "2000",
                "PurchasingGroup": "P01",
                "Currency": "INR",
                "ServiceEntrySheetName": "Service Entry Sheet Without Service",
                "Supplier": "22000001",
                "PostingDate": "2025-01-01",
                "ServiceEntrySheetItem": "20",
                "AccountAssignmentCategory": "K",
                "Service": "", // Both empty - valid scenario
                "QuantityUnit": "", // Both empty - valid scenario
                "ConfirmedQuantity": "2",
                "Plant": "2001",
                "NetAmount": "2000.00",
                "NetPriceAmount": "1000.00",
                "PurchaseOrder": "4300000001",
                "PurchaseOrderItem": "20",
                "ServicePerformanceDate": "2025-01-01",
                "ServicePerformanceEndDate": "2025-01-01",
                "AccountAssignment": "1",
                "CostCenter": "61020050",
                "GLAccount": "",
                "WBS Element": "",
                "GRNCreate": "TRUE"
            };

            // Example row with hours-based service
            const exampleRow3 = {
                "SL": "3",
                "PurchasingOrganization": "2000",
                "PurchasingGroup": "P02",
                "Currency": "USD",
                "ServiceEntrySheetName": "Labor Service Entry",
                "Supplier": "22000002",
                "PostingDate": "2025-01-15",
                "ServiceEntrySheetItem": "10",
                "AccountAssignmentCategory": "K",
                "Service": "LABOR001",
                "QuantityUnit": "HR", // Hours
                "ConfirmedQuantity": "8.5",
                "Plant": "1000",
                "NetAmount": "680.00",
                "NetPriceAmount": "80.00",
                "PurchaseOrder": "4500000001",
                "PurchaseOrderItem": "10",
                "ServicePerformanceDate": "2025-01-15",
                "ServicePerformanceEndDate": "2025-01-15",
                "AccountAssignment": "1",
                "CostCenter": "",
                "GLAccount": "4000100",
                "WBS Element": "",
                "GRNCreate": "FALSE"
            };

            return [exampleRow1, exampleRow2, exampleRow3];
        }

        /**
         * Create template directly using XLSX library as fallback
         * @private
         * @param {Array} headers - Column headers
         * @param {Array} data - Example data rows
         * @returns {Promise<Blob>} Template blob
         */
        async _createTemplateDirectly(headers, data) {
            try {
                // Import XLSX library dynamically if available
                const XLSX = window.XLSX || await import('xlsx');
                
                // Create worksheet data array (headers + data rows)
                const wsData = [headers];
                
                // Add data rows
                data.forEach(row => {
                    const rowArray = headers.map(header => row[header] || "");
                    wsData.push(rowArray);
                });

                console.debug("TemplateGenerator: Creating worksheet with data", {
                    headers: headers.length,
                    dataRows: data.length,
                    totalRows: wsData.length
                });

                // Create worksheet
                const ws = XLSX.utils.aoa_to_sheet(wsData);
                
                // Set column widths for better readability
                const colWidths = headers.map(header => {
                    let width = Math.max(header.length, 12); // Minimum width of 12
                    // Special cases for longer content
                    if (header.includes('ServiceEntrySheetName')) width = 30;
                    if (header.includes('ServicePerformance')) width = 20;
                    if (header.includes('WBS')) width = 20;
                    return { wch: width };
                });
                ws['!cols'] = colWidths;

                // Style the header row
                const headerRange = XLSX.utils.decode_range(ws['!ref']);
                for (let col = headerRange.s.c; col <= headerRange.e.c; col++) {
                    const cellAddress = XLSX.utils.encode_cell({ r: 0, c: col });
                    if (!ws[cellAddress]) continue;
                    
                    ws[cellAddress].s = {
                        font: { bold: true },
                        fill: { fgColor: { rgb: "CCCCCC" } },
                        alignment: { horizontal: "center" }
                    };
                }

                // Create workbook
                const wb = XLSX.utils.book_new();
                XLSX.utils.book_append_sheet(wb, ws, "Service Entry Sheets");
                
                // Add metadata
                wb.Props = {
                    Title: "Service Entry Sheet Template",
                    Subject: "Template for uploading service entry sheet data",
                    Author: "SAP UI5 Application",
                    CreatedDate: new Date()
                };

                // Convert to blob
                const wbout = XLSX.write(wb, { 
                    bookType: 'xlsx', 
                    type: 'array',
                    cellStyles: true
                });
                
                const blob = new Blob([wbout], { 
                    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' 
                });

                console.debug("TemplateGenerator: Direct template creation successful");
                return blob;

            } catch (error) {
                console.error("TemplateGenerator: Direct template creation failed", error);
                throw error;
            }
        }

        /**
         * Gets the desired template filename, preferring custom processor.
         * @returns {string} The template filename.
         */
        getTemplateFileName() {
            let defaultName = "ServiceEntrySheet_Template.xlsx"; // Updated version name
            if (this._customProcessor && typeof this._customProcessor.getTemplateFileName === 'function') {
                try {
                    return this._customProcessor.getTemplateFileName() || defaultName;
                } catch (e) { /* ignore error, use default */ }
            }
            return defaultName;
        }

        /**
         * Get field descriptions for template help/instructions
         * @returns {object} Field descriptions object
         */
        getFieldDescriptions() {
            return {
                "SL": "Sequential number for the entry",
                "PurchasingOrganization": "4-character purchasing organization code (Required)",
                "PurchasingGroup": "3-character purchasing group code (Required)",
                "Currency": "5-character currency code like INR, USD (Required)",
                "ServiceEntrySheetName": "Name/description of the service entry sheet (Required, max 40 chars)",
                "Supplier": "10-character supplier/vendor number (Required)",
                "PostingDate": "Posting date in YYYY-MM-DD format (Required)",
                "ServiceEntrySheetItem": "Item number, typically 10, 20, 30... (Required, max 5 chars)",
                "AccountAssignmentCategory": "Single character assignment category like K, Z (Required)",
                "Service": "Service/Product number (Optional, max 40 chars) - Must be provided with QuantityUnit or both must be blank",
                "QuantityUnit": "Unit of measure like HR, EA, KG (Optional, max 3 chars) - Must be provided with Service or both must be blank",
                "ConfirmedQuantity": "Quantity being confirmed (Required, decimal with up to 3 decimal places)",
                "Plant": "4-character plant code (Required)",
                "NetAmount": "Total net amount (Required, decimal with up to 3 decimal places)",
                "NetPriceAmount": "Price per unit (Required, decimal with up to 3 decimal places)",
                "PurchaseOrder": "Purchase order number (Required, max 10 chars)",
                "PurchaseOrderItem": "Purchase order item number (Required, max 5 chars)",
                "ServicePerformanceDate": "Service start date in YYYY-MM-DD format (Required)",
                "ServicePerformanceEndDate": "Service end date in YYYY-MM-DD format (Required)",
                "AccountAssignment": "Account assignment sequence number (Optional, max 2 chars)",
                "CostCenter": "Cost center for accounting (Optional, max 10 chars)",
                "GLAccount": "General Ledger account number (Optional, max 10 chars)",
                "WBS Element": "Work Breakdown Structure element (Optional, max 24 chars)",
                "GRNCreate": "Whether to create GRN (TRUE/FALSE)"
            };
        }

        /**
         * Get validation rules for template users
         * @returns {array} Array of validation rule descriptions
         */
        getValidationRules() {
            return [
                "All fields marked as 'Required' must have values",
                "Service and QuantityUnit must both have values OR both must be blank - mixed states will cause validation errors",
                "Dates must be in YYYY-MM-DD format",
                "Numeric fields (amounts, quantities) should use decimal format with dots (not commas)",
                "String field lengths must not exceed specified maximums",
                "At least one of CostCenter, GLAccount, or WBS Element must be provided for account assignment"
            ];
        }

        /**
         * Debug method to test data structure
         * @returns {object} Debug information about template data
         */
        getDebugInfo() {
            const headers = [
                "SL", "PurchasingOrganization", "PurchasingGroup", "Currency", "ServiceEntrySheetName",
                "Supplier", "PostingDate", "ServiceEntrySheetItem", "AccountAssignmentCategory", 
                "Service", "QuantityUnit", "ConfirmedQuantity",
                "Plant", "NetAmount", "NetPriceAmount", "PurchaseOrder", "PurchaseOrderItem",
                "ServicePerformanceDate", "ServicePerformanceEndDate", "AccountAssignment",
                "CostCenter", "GLAccount", "WBS Element", "GRNCreate"
            ];

            const exampleData = this._createExampleData();

            return {
                headersCount: headers.length,
                dataRowsCount: exampleData.length,
                headers: headers,
                sampleRow: exampleData[0],
                xlsxFormatterAvailable: !!this._xlsxFormatter,
                customProcessorAvailable: !!this._customProcessor
            };
        }
    };
});