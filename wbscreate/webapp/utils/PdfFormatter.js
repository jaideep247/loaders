sap.ui.define([
    "sap/m/MessageBox",
    "sap/m/MessageToast"
], function (MessageBox, MessageToast) {
    "use strict";

    return class PdfFormatter {
        constructor() {
            this.pdfLibraryLoaded = false;

            // FIXED: Define essential fields based on actual SAP response structure
            this.essentialFields = [
                "Status",
                "ProjectElement",
                "Message",
                "CompanyCode",
                "ResponsibleCostCenter",
                "ProfitCenter",
                "WBSElementIsBillingElement",
            ];

            // FIXED: Define field display names for better readability
            this.fieldDisplayNames = {
                "Status": "Status",
                "ProjectElement": "WBS Element",
                "ProjectElementDescription": "Description",
                "Message": "Message",
                "CompanyCode": "Company Code",
                "ResponsibleCostCenter": "Responsible Cost Center",
                "ProfitCenter": "Profit Center",
                "WBSElementIsBillingElement": "Billing Element"
            };
        }

        getFileExtension() { return "pdf"; }
        getMimeType() { return "application/pdf"; }

        /**
         * Loads the PDF libraries asynchronously
         * @returns {Promise} Promise that resolves when libraries are loaded
         */
        _loadPdfLibrary() {
            return new Promise((resolve, reject) => {
                if (this.pdfLibraryLoaded && window.pdfMake && window.pdfMake.vfs) {
                    resolve(); // Already loaded
                    return;
                }

                // Show "loading" message
                MessageToast.show("Loading PDF export library, please wait...");

                // Load pdfmake and fonts
                const scriptPdf = document.createElement("script");
                scriptPdf.src = "./utils/pdfmake.min.js";

                const scriptFonts = document.createElement("script");
                scriptFonts.src = "./utils/vfs_fonts.js";

                let pdfLoaded = false;
                let fontsLoaded = false;

                scriptPdf.onload = () => {
                    console.log("PDF library loaded successfully");
                    pdfLoaded = true;
                    if (pdfLoaded && fontsLoaded) {
                        if (window.pdfMake) {
                            this.pdfLibraryLoaded = true;
                            resolve();
                        } else {
                            reject(new Error("PDFMake library not available after loading"));
                        }
                    } else {
                        document.body.appendChild(scriptFonts); // Append fonts script after pdfmake
                    }
                };

                scriptFonts.onload = () => {
                    console.log("Fonts library loaded successfully");
                    fontsLoaded = true;
                    if (pdfLoaded && fontsLoaded) {
                        if (window.pdfMake) {
                            this.pdfLibraryLoaded = true;
                            resolve();
                        } else {
                            reject(new Error("PDFMake library not available after loading"));
                        }
                    }
                };

                scriptPdf.onerror = (e) => {
                    console.error("Failed to load pdfmake.min.js:", e);
                    reject(new Error("Failed to load pdfmake.min.js: " + e.message));
                };

                scriptFonts.onerror = (e) => {
                    console.error("Failed to load vfs_fonts.js:", e);
                    reject(new Error("Failed to load vfs_fonts.js: " + e.message));
                };

                document.body.appendChild(scriptPdf);
            });
        }

        /**
         * FIXED: Exports only essential fields to PDF - no UUID, dates, or irrelevant fields
         * @param {Array<object>} data - Array of processed data objects.
         * @param {Array<string>} headers - Array of header column names (ignored).
         * @param {String} sheetName - Name of the worksheet (ignored).
         * @param {String} fileName - Name of the file to download (ignored).
         * @param {object} [options={}] - PDF generation options.
         * @returns {Promise<Blob>} Promise resolving with the PDF Blob.
         */
        exportToPdf(data, headers, sheetName, fileName, options = {}) {
            return new Promise((resolve, reject) => {
                this._loadPdfLibrary()
                    .then(() => {
                        try {
                            if (!data || data.length === 0) {
                                reject(new Error("No data provided for PDF export."));
                                return;
                            }

                            const title = options.title || "WBS Element Creation Report";

                            // Preprocess data to flatten and clean
                            const processedData = this._preprocessDataForPdf(data);

                            // FIXED: Use only essential fields instead of all fields
                            const activeColumns = this._getEssentialColumns(processedData);

                            console.log(`PdfFormatter: Using ${activeColumns.length} essential columns:`,
                                activeColumns.map(col => col.name));

                            // Calculate available page width based on orientation
                            const pageWidth = options.orientation === "portrait" ? 515 : 770;

                            // Dynamic column width adjustment
                            this._adjustColumnWidths(activeColumns, pageWidth);

                            // Improved text handling function
                            const formatText = (text) => {
                                if (text === null || text === undefined) return "";
                                const textStr = String(text).trim();

                                // FIXED: Truncate very long text to keep table readable
                                const maxLength = 50;
                                const truncatedText = textStr.length > maxLength ?
                                    textStr.substring(0, maxLength) + "..." : textStr;

                                return {
                                    text: truncatedText,
                                    fontSize: 8,
                                    lineHeight: 1.1
                                };
                            };

                            // Prepare table body with headers
                            const tableBody = [
                                activeColumns.map((col) => ({
                                    text: col.name,
                                    style: "tableHeader",
                                    width: col.width
                                }))
                            ];

                            // Process data rows
                            processedData.forEach((item) => {
                                const row = activeColumns.map((col) => {
                                    let rawValue = item[col.prop] !== undefined ? item[col.prop] : "";

                                    // FIXED: Clean up boolean values for both success and error records
                                    if (col.prop === "WBSElementIsBillingElement") {
                                        rawValue = (rawValue === true || rawValue === "true" || rawValue === "X") ? "Yes" : "No";
                                    }

                                    // Status color coding
                                    const cellContent = formatText(rawValue);

                                    if (col.prop === "Status") {
                                        if (rawValue === "Success") {
                                            cellContent.style = "successText";
                                        } else if (rawValue === "Error") {
                                            cellContent.style = "errorText";
                                        } else if (rawValue === "Warning") {
                                            cellContent.style = "warningText";
                                        }
                                    }

                                    return cellContent;
                                });

                                tableBody.push(row);
                            });

                            // Count different status types
                            const successCount = processedData.filter(item => item.Status === "Success").length;
                            const errorCount = processedData.filter(item => item.Status === "Error").length;
                            const warningCount = processedData.filter(item => item.Status === "Warning").length;
                            const infoCount = processedData.filter(item => item.Status === "Info").length;

                            // FIXED: Create streamlined document definition
                            const docDefinition = {
                                pageOrientation: options.orientation || "landscape",
                                pageSize: options.pageSize || "A4",
                                pageMargins: [20, 40, 20, 40],
                                content: [
                                    {
                                        text: title,
                                        style: "header",
                                        margin: [0, 0, 0, 15]
                                    },
                                    {
                                        columns: [
                                            {
                                                text: `Generated: ${new Date().toLocaleString()}`,
                                                style: "subheader"
                                            },
                                            {
                                                text: `Total Records: ${processedData.length}`,
                                                style: "subheader",
                                                alignment: "right"
                                            }
                                        ],
                                        margin: [0, 0, 0, 15]
                                    },
                                    {
                                        table: {
                                            headerRows: 1,
                                            widths: activeColumns.map((col) => col.width),
                                            body: tableBody,
                                            dontBreakRows: false, // Allow row breaking for long content
                                            keepWithHeaderRows: 1
                                        },
                                        layout: {
                                            fillColor: (rowIndex) => {
                                                return rowIndex === 0 ? "#4472C4" :
                                                    rowIndex % 2 === 0 ? "#F8F9FA" : null;
                                            },
                                            hLineWidth: () => 0.5,
                                            vLineWidth: () => 0.5,
                                            hLineColor: () => "#CCCCCC",
                                            vLineColor: () => "#CCCCCC"
                                        }
                                    },
                                ],
                                styles: {
                                    header: {
                                        fontSize: 20,
                                        bold: true,
                                        color: "#2E5BBA"
                                    },
                                    subheader: {
                                        fontSize: 10,
                                        color: "#666666"
                                    },
                                    tableHeader: {
                                        bold: true,
                                        color: "white",
                                        fontSize: 9,
                                        alignment: "center"
                                    },
                                    successText: {
                                        color: "#28A745",
                                        bold: true
                                    },
                                    errorText: {
                                        color: "#DC3545",
                                        bold: true
                                    },
                                    warningText: {
                                        color: "#FFC107",
                                        bold: true
                                    },
                                    summaryHeader: {
                                        fontSize: 12,
                                        bold: true,
                                        color: "#333333"
                                    },
                                    successSummary: {
                                        fontSize: 11,
                                        color: "#28A745",
                                        bold: true
                                    },
                                    errorSummary: {
                                        fontSize: 11,
                                        color: "#DC3545",
                                        bold: true
                                    },
                                    warningSummary: {
                                        fontSize: 11,
                                        color: "#FFC107",
                                        bold: true
                                    },
                                    infoSummary: {
                                        fontSize: 11,
                                        color: "#17A2B8",
                                        bold: true
                                    }
                                },
                                footer: function (currentPage, pageCount) {
                                    return {
                                        text: `Page ${currentPage} of ${pageCount} | WBS Creation Report`,
                                        alignment: "center",
                                        fontSize: 8,
                                        color: "#666666",
                                        margin: [0, 0, 0, 10]
                                    };
                                },
                                defaultStyle: {
                                    fontSize: 8,
                                    color: "#333333"
                                }
                            };

                            // Create PDF with Blob output
                            const pdfDocGenerator = pdfMake.createPdf(docDefinition);
                            pdfDocGenerator.getBlob((blob) => {
                                console.log(`PdfFormatter: PDF generated successfully with ${activeColumns.length} columns`);
                                resolve(blob);
                            });

                        } catch (error) {
                            console.error("Error generating PDF:", error);
                            reject(error);
                        }
                    })
                    .catch(error => {
                        console.error("Error loading PDF libraries:", error);
                        MessageBox.error(
                            "Failed to load PDF export library. Please try Excel or CSV export instead."
                        );
                        reject(error);
                    });
            });
        }

        /**
         * FIXED: Get only essential columns present in the data with smart field detection
         * @param {Array} processedData - The processed data array
         * @returns {Array} Array of essential column definitions
         * @private
         */
        _getEssentialColumns(processedData) {
            const activeColumns = [];

            // FIXED: Check which essential fields are present in at least 25% of records
            // This handles the case where success records have YY1 fields but error records don't
            this.essentialFields.forEach(fieldName => {
                const recordsWithField = processedData.filter(record =>
                    record.hasOwnProperty(fieldName) &&
                    record[fieldName] !== undefined &&
                    record[fieldName] !== null &&
                    String(record[fieldName]).trim() !== ""
                ).length;

                const fieldPresencePercent = (recordsWithField / processedData.length) * 100;

                // Include field if present in at least 25% of records OR if it's a core field
                const coreFields = ["Status", "ProjectElement", "Message", "ErrorCode", "CompanyCode", "ResponsibleCostCenter",
                    "ProfitCenter", "WBSElementIsBillingElement"];
                const shouldInclude = fieldPresencePercent >= 25 || coreFields.includes(fieldName);

                if (shouldInclude) {
                    activeColumns.push({
                        name: this.fieldDisplayNames[fieldName] || this._formatHeaderName(fieldName),
                        prop: fieldName,
                        width: 'auto'
                    });

                    console.log(`PdfFormatter: Including field '${fieldName}' (${fieldPresencePercent.toFixed(1)}% presence)`);
                } else {
                    console.log(`PdfFormatter: Excluding field '${fieldName}' (${fieldPresencePercent.toFixed(1)}% presence)`);
                }
            });

            // Ensure we always have at least core mandatory fields
            const mandatoryFields = ["Status", "ProjectElement", "Message"];
            const presentFields = activeColumns.map(col => col.prop);

            mandatoryFields.forEach(field => {
                if (!presentFields.includes(field)) {
                    activeColumns.unshift({
                        name: this.fieldDisplayNames[field] || this._formatHeaderName(field),
                        prop: field,
                        width: 'auto'
                    });
                    console.log(`PdfFormatter: Force-adding mandatory field '${field}'`);
                }
            });

            console.log(`PdfFormatter: Selected ${activeColumns.length} columns for PDF export`);
            return activeColumns;
        }

        /**
         * FIXED: Preprocess data - remove UUID, date fields, and other irrelevant fields
         * @param {Array} data - Raw data to process
         * @returns {Array} Cleaned data with only essential fields
         * @private
         */
        _preprocessDataForPdf(data) {
            let processedRecords = [];

            // Handle different data structures
            const successRecords = Array.isArray(data.successRecords) ? data.successRecords : [];
            const errorRecords = Array.isArray(data.errorRecords) ? data.errorRecords : [];

            if (successRecords.length > 0 || errorRecords.length > 0) {
                // Process success records
                successRecords.forEach(record => {
                    const cleanRecord = this._cleanRecord(record);
                    cleanRecord.Status = "Success";
                    cleanRecord.Message = record.Message || record.SuccessMessage ||
                        `WBS Element ${record.ProjectElement || ""} created successfully`;
                    processedRecords.push(cleanRecord);
                });

                // Process error records
                errorRecords.forEach(record => {
                    const cleanRecord = this._cleanRecord(record);
                    cleanRecord.Status = "Error";
                    cleanRecord.Message = record.Message || record.ErrorMessage ||
                        record.message || "Error during processing";
                    cleanRecord.ErrorCode = record.ErrorCode || record.Code || "UNKNOWN_ERROR";
                    processedRecords.push(cleanRecord);
                });

            } else if (Array.isArray(data)) {
                // Standard array processing
                processedRecords = data.map(item => {
                    const cleanRecord = this._cleanRecord(item);

                    // Ensure Status field
                    if (!cleanRecord.Status) {
                        cleanRecord.Status = (cleanRecord.ErrorMessage || cleanRecord.message) ? "Error" : "Success";
                    }

                    // Ensure Message field
                    if (!cleanRecord.Message) {
                        if (cleanRecord.Status === "Error") {
                            cleanRecord.Message = cleanRecord.ErrorMessage || cleanRecord.message || "Error during processing";
                        } else {
                            cleanRecord.Message = cleanRecord.SuccessMessage ||
                                `WBS Element ${cleanRecord.ProjectElement || ""} processed successfully`;
                        }
                    }

                    return cleanRecord;
                });
            }

            console.log(`PdfFormatter: Preprocessed ${processedRecords.length} records for PDF export`);
            return processedRecords;
        }

        /**
         * FIXED: Clean individual record - remove unwanted fields
         * @param {Object} record - Single record to clean
         * @returns {Object} Cleaned record with only relevant fields
         * @private
         */
        _cleanRecord(record) {
            const cleanRecord = {};

            // FIXED: Only copy essential fields and skip UUID, dates, internal fields
            const fieldsToExclude = [
                // UUID fields
                'ProjectUUID',
                'ProjectElementUUID',
                'ParentObjectUUID',

                // Date fields  
                'PlannedStartDate',
                'PlannedEndDate',
                'YY1_UDF1_PTD', // Actual start date
                'YY1_UDF2_PTD', // Actual end date
                'CreationDateTime',
                'LastChangeDateTime',
                'ActualStartDate_fc',
                'ActualEndDate_fc',
                'PlannedStartDate_fc',
                'PlannedEndDate_fc',
                'ForecastedEndDate_fc',

                // Internal/system fields
                '_rawResponse',
                '_originalIndex',
                '_processingError',
                '_sapui_batchId',
                '_sapui_requestType',
                '_sapui_url',
                '_sheetName',
                '_originalData',
                'CreatedByUser',
                'LastChangedByUser',
                'Timestamp',

                // SAP field control and navigation fields
                'ProjectElement_fc',
                'ProjectElementDescription_fc',
                'ControllingArea_fc',
                'CostCenter_fc',
                'CostingSheet_fc',
                'FactoryCalendar_fc',
                'FunctionalArea_fc',
                'FunctionalLocation_fc',
                'InvestmentProfile_fc',
                'IsMainMilestone_fc',
                'Location_fc',
                'MilestoneApprovalStatus_fc',
                'Plant_fc',
                'ProfitCenter_fc',
                'ResponsibleCostCenter_fc',
                'ResultAnalysisInternalID_fc',
                'TaxJurisdiction_fc',
                'WBSElementIsBillingElement_fc',

                // Navigation properties
                'to_EntProjElmntBlkFunc',
                'to_EntProjElmntBlkFunc_oc',
                'to_EntProjElmntDlvbrl',
                'to_EntProjElmntDlvbrl_oc',
                'to_EntProjElmntWorkItem',
                'to_EntProjElmntWorkItem_oc',
                'to_EntProjectElementJVA',
                'to_EntProjectElmntPublicSector',
                'to_EnterpriseProject',
                'to_ParentProjElement',
                'to_SubProjElement',
                'to_SubProjElement_oc',

                // Action control fields
                'ChangeEntProjElmntPosition_ac',
                'ChangeEntProjElmntProcgStatus_ac',
                'ChangePeriodDistributionOption_ac',
                'Delete_mc',
                'Update_mc',

                // Redundant fields
                'Type',
                'Code', // Use ErrorCode instead
                'SuccessMessage', // Use Message instead
                'ErrorMessage', // Use Message instead

                // Less important organizational/technical fields
                'ControllingArea',
                'CostCenter',
                'CostingSheet',
                'EntProjectElementType',
                'FactoryCalendar',
                'FunctionalArea',
                'FunctionalLocation',
                'InvestmentProfile',
                'IsMainMilestone',
                'IsProjectMilestone',
                'Location',
                'MilestoneApprovalStatus',
                'Plant',
                'ResultAnalysisInternalID',
                'TaxJurisdiction',
                'WBSElementInternalID',
                'ProjectElementOrdinalNumber',
                'WBSIsStatisticalWBSElement',
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
                        // If parsing fails, keep Details as string but truncated
                        cleanRecord.Details = record.Details.substring(0, 100) +
                            (record.Details.length > 100 ? "..." : "");
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
        }

        /**
         * Dynamically adjusts column widths based on available page width
         * FIXED: Improved width calculation for essential fields only
         */
        _adjustColumnWidths(columns, pageWidth) {
            // Define preferred widths for specific columns based on actual SAP fields
            const preferredWidths = {
                "Status": 60,
                "WBS Element": 100,
                "Message": 100,
                "Company Code": 70,
                "Responsible Cost Center": 50,
                "Profit Center": 50,
                "Billing Element": 60,
                "ATM ID": 80,
                "District": 80,
                "State": 60,
                "Project/Bank": 90,
                "Site Type": 70,
                "Exact WBS Code": 80,
                "Old Project Site ID": 80,
                "Postal Code": 50
            };

            // Assign preferred widths where available
            let totalFixedWidth = 0;
            let autoColumns = [];

            columns.forEach(col => {
                if (preferredWidths[col.name]) {
                    col.width = preferredWidths[col.name];
                    totalFixedWidth += col.width;
                } else {
                    autoColumns.push(col);
                }
            });

            // Distribute remaining width to auto columns
            if (autoColumns.length > 0) {
                const remainingWidth = Math.max(0, pageWidth - totalFixedWidth);
                const widthPerAutoCol = Math.max(50, remainingWidth / autoColumns.length);

                autoColumns.forEach(col => {
                    col.width = widthPerAutoCol;
                });
            }

            // Scale down if total exceeds page width
            const currentTotalWidth = columns.reduce((sum, col) => sum + col.width, 0);
            if (currentTotalWidth > pageWidth) {
                const scaleFactor = pageWidth / currentTotalWidth;
                columns.forEach(col => {
                    col.width = Math.max(Math.floor(col.width * scaleFactor), 40);
                });
            }

            // Ensure Message column gets adequate width
            const messageCol = columns.find(col => col.name === "Message");
            if (messageCol) {
                messageCol.width = Math.max(messageCol.width, 120);
            }
        }

        /**
         * Converts a field name to readable format
         * @private
         */
        _formatHeaderName(fieldName) {
            if (!fieldName) return "";
            return fieldName
                .replace(/([A-Z])/g, ' $1')
                .replace(/^./, str => str.toUpperCase())
                .trim();
        }
    };
});