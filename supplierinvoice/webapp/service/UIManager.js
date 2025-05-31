sap.ui.define([
  "sap/m/Dialog",
  "sap/m/Button",
  "sap/m/MessageStrip",
  "sap/m/NavContainer",
  "sap/m/Page",
  "sap/m/List",
  "sap/m/StandardListItem",
  "sap/m/GroupHeaderListItem",
  "sap/m/VBox",
  "sap/m/ObjectHeader",
  "sap/m/ObjectAttribute",
  "sap/m/ObjectStatus",
  "sap/m/Panel",
  "sap/m/Table",
  "sap/m/Column",
  "sap/m/ColumnListItem",
  "sap/m/Text",
  "sap/m/Title",
  "sap/m/FlexBox",
  "sap/m/ObjectNumber",
  "sap/m/ProgressIndicator",
  "sap/m/IconTabBar",
  "sap/m/IconTabFilter",
  "sap/m/Link",
  "sap/ui/model/json/JSONModel",
  "sap/ui/core/Fragment",
  "sap/ui/core/library"
], function (
  Dialog, Button, MessageStrip, NavContainer, Page, List,
  StandardListItem, GroupHeaderListItem, VBox, ObjectHeader,
  ObjectAttribute, ObjectStatus, Panel, Table, Column,
  ColumnListItem, Text, Title, FlexBox, ObjectNumber,
  ProgressIndicator, IconTabBar, IconTabFilter, Link,
  JSONModel, Fragment, coreLibrary
) {
  "use strict";

  const ValueState = coreLibrary.ValueState;

  /**
   * UIManager
   * Responsible for handling UI components, dialogs, and views
   */
  return function (oController) {
    this.oController = oController;
    this._dialogs = {};

    /**
     * Handle validation errors
     * @param {array} errors - Array of validation errors
     */
    this.handleValidationErrors = function (errors) {
      console.log(errors);
      if (!errors || !errors.length) {
        return;
      }

      // Deduplicate errors by creating a Map using message+sequenceId as keys
      const uniqueErrorsMap = new Map();
      errors.forEach(error => {
        const errorObj = typeof error === "string" ? { message: error } : error;
        const key = `${errorObj.sequenceId || "NA"}-${errorObj.message || error}`;
        uniqueErrorsMap.set(key, errorObj);
      });

      // Convert back to array
      const uniqueErrors = Array.from(uniqueErrorsMap.values());

      // Group errors by type for better display
      const groupedErrors = uniqueErrors.reduce((groups, error) => {
        // Extract error message from error object or use the error itself if it's a string
        const errorMessage = error.message || error;
        const errorType = errorMessage.includes('not balanced') ? 'Balance' :
          errorMessage.includes('must have') ? 'Missing Entries' : 'Data Validation';

        if (!groups[errorType]) {
          groups[errorType] = [];
        }
        groups[errorType].push(error);
        return groups;
      }, {});

      // Display detailed validation errors in a dialog
      const errorDialog = new Dialog({
        title: "Validation Errors",
        titleAlignment: "Center",
        state: ValueState.Error,
        icon: "sap-icon://message-error",
        contentWidth: "650px",
        content: [
          new MessageStrip({
            text: "Please fix the following issues before submitting entries",
            type: "Error",
            showIcon: true
          }).addStyleClass("sapUiSmallMarginTop sapUiSmallMarginBottom"),
          new NavContainer({
            pages: [
              new Page({
                showHeader: false,
                content: [
                  new List({
                    mode: "None",
                    items: Object.entries(groupedErrors).map(([category, categoryErrors]) =>
                      new GroupHeaderListItem({
                        title: category + " Errors (" + categoryErrors.length + ")",
                        upperCase: false
                      }).addStyleClass("sapUiSmallMarginTop")
                    ).concat(
                      Object.entries(groupedErrors).flatMap(([, categoryErrors]) =>
                        categoryErrors.map((error) => {
                          // Extract data from error object or use defaults if it's a string
                          const errorObj = typeof error === "string" ? { message: error } : error;
                          const sequenceId = errorObj.sequenceId || "N/A";
                          const message = errorObj.message || error;

                          return new StandardListItem({
                            title: message,
                            icon: "sap-icon://error",
                            iconInset: false,
                            info: `Seq: ${sequenceId}`,
                            infoState: ValueState.Error
                          });
                        })
                      )
                    )
                  })
                ]
              })
            ]
          })
        ],
        beginButton: new Button({
          text: "Close",
          press: function () {
            errorDialog.close();
          }
        }),
        endButton: new Button({
          text: "Export Errors",
          icon: "sap-icon://excel-attachment",
          press: () => {
            // OLD: this._exportErrorList(groupedErrors);
            // NEW: Use ExportManager
            if (this.oController._exportManager) {
              this.oController._exportManager.exportValidationErrors(groupedErrors);
            }
            errorDialog.close();
          }
        }),
        afterClose: function () {
          errorDialog.destroy();
        }
      });

      errorDialog.open();
    };

    this._formatErrorMessage = function (error) {
      if (error === null || error === undefined) {
        return "Unknown error";
      }

      // If error is already a string, return it
      if (typeof error === "string") {
        return error;
      }

      // Handle objects with message property
      if (typeof error === "object") {
        // First check for common error properties
        if (error.message) {
          return error.message;
        }

        // Check for sequenceId and field
        let formattedMessage = "";

        if (error.sequenceId && error.field) {
          formattedMessage = `Sequence ID ${error.sequenceId}: `;
        } else if (error.sequenceId) {
          formattedMessage = `Sequence ID ${error.sequenceId}: `;
        }

        // Add the main error text
        if (error.text) {
          formattedMessage += error.text;
        } else if (error.field && error.value) {
          formattedMessage += `Invalid value "${error.value}" for field "${error.field}"`;
        } else if (error.field) {
          formattedMessage += `Error in field "${error.field}"`;
        } else {
          // Try to extract something useful from the object
          const errorKeys = Object.keys(error).filter(key =>
            typeof error[key] === "string" && key !== "sequenceId" && key !== "sheet"
          );

          if (errorKeys.length > 0) {
            formattedMessage += error[errorKeys[0]];
          } else {
            // Last resort - convert to JSON string
            try {
              formattedMessage = JSON.stringify(error);
            } catch (e) {
              formattedMessage = "Error object could not be formatted";
            }
          }
        }

        return formattedMessage;
      }

      // For any other type, convert to string
      return String(error);
    };

    /**
     * Show invoice details dialog (replaces missing showInvoiceDetailsDialog)
     * @param {object} oInvoice - Invoice data object
     */
    this.showInvoiceDetailsDialog = function (oInvoice) {
      this.showEntryDetailsDialog(oInvoice);
    };

    /**
     * Display entry details dialog
     * @param {object} oEntry - Entry data object
     */
    this.showEntryDetailsDialog = function (oEntry) {
      // Create a formatted display of all entry details
      console.log("Entry to display:", oEntry);

      const entryType = oEntry["Entry Type"] || "";
      const sheetType = oEntry["Sheet"] || "";
      // Ensure the entry object is valid
      if (!oEntry || typeof oEntry !== 'object') {
        sap.m.MessageBox.error("Cannot display entry details: Invalid entry data");
        return;
      }

      // Define field sets for different sections
      const headerFields = [
        "SupplierInvoice",
        "FiscalYear",
        "CompanyCode",
        "DocumentDate",
        "PostingDate",
        "DocumentCurrency",
        "InvoiceGrossAmount",
        "SupplierInvoiceIDByInvcgParty",
        "InvoicingParty",
        "DocumentHeaderText"
      ];

      const itemFields = [
        "Sequence Id",
        "SupplierInvoiceItem",
        "GLAccount",
        "SupplierInvoiceItemAmount",
        "TaxCode",
        "DebitCreditCode",
        "SupplierInvoiceItemText"
      ];

      // Helper function to format field values
      function formatValue(value) {
        if (value === undefined || value === null) return "";
        return value.toString();
      }

      // Helper function to get field value with multiple possible key formats
      function getFieldValue(fieldName, obj) {
        // Try various formats of the key
        const variations = [
          fieldName,
          fieldName.replace(/-/g, " "),
          fieldName.replace(/\s/g, ""),
          fieldName.toLowerCase(),
          fieldName.toLowerCase().replace(/-/g, " "),
          fieldName.toLowerCase().replace(/\s/g, "")
        ];

        for (const variation of variations) {
          if (obj[variation] !== undefined && obj[variation] !== null) {
            return obj[variation].toString();
          }
        }

        return "";
      }

      // Create field collections for different sections
      const headerDetails = [];
      const itemDetails = [];
      const otherDetails = [];
      const processedFields = new Set();

      // Process header fields
      headerFields.forEach(fieldName => {
        const value = getFieldValue(fieldName, oEntry);
        if (value) {
          headerDetails.push({ key: fieldName, value });
        }
      });

      // Process item fields
      itemFields.forEach(fieldName => {
        const normalizedField = fieldName.toLowerCase().replace(/[\s-]/g, "");
        if (processedFields.has(normalizedField)) return;

        const value = getFieldValue(fieldName, oEntry);
        itemDetails.push({ key: fieldName, value: value || "" });
        processedFields.add(normalizedField);
      });

      // Add any remaining fields
      const excludedKeys = ["validationErrors", "status", "ValidationErrors"];

      Object.entries(oEntry).forEach(([key, value]) => {
        if (!excludedKeys.includes(key) &&
          !headerFields.includes(key) &&
          !itemFields.includes(key) &&
          !processedFields.has(key.toLowerCase().replace(/[\s-]/g, "")) &&
          value !== null &&
          value !== undefined) {
          otherDetails.push({ key, value: formatValue(value) });
        }
      });

      // Get key values for object header
      const sequenceId = getFieldValue("Sequence Id", oEntry) || "N/A";
      const amount = getFieldValue("InvoiceGrossAmount", oEntry) || "0";
      const currency = getFieldValue("DocumentCurrency", oEntry) || "";

      // Create a dialog to display entry details
      const dialogTitle = sheetType === "Header_and_Credits"
        ? "Supplier Invoice Header Details"
        : sheetType === "Debits"
          ? "Supplier Invoice Debit Line Details"
          : "Supplier Invoice Entry Details";

      const detailsDialog = new sap.m.Dialog({
        title: dialogTitle,
        contentWidth: "600px",
        content: [
          new sap.m.VBox({
            items: [
              // Object header with key information
              new sap.m.ObjectHeader({
                title: "Sequence ID: " + sequenceId,
                number: amount,
                numberUnit: currency,
                attributes: [
                  new sap.m.ObjectAttribute({
                    text: "Company Code: " + (getFieldValue("CompanyCode", oEntry) || "N/A")
                  }),
                  new sap.m.ObjectAttribute({
                    text: "Invoicing Party: " + (getFieldValue("InvoicingParty", oEntry) || "N/A")
                  })
                ],
                statuses: [
                  new sap.m.ObjectStatus({
                    text: sheetType === "Header_and_Credits" ? "Header Entry" :
                      sheetType === "Debits" ? "Debit Line" : "Supplier Invoice",
                    state: sap.ui.core.ValueState.Information
                  }),
                  new sap.m.ObjectStatus({
                    text: oEntry.status || "",
                    state: oEntry.status === "Valid"
                      ? sap.ui.core.ValueState.Success
                      : sap.ui.core.ValueState.Error
                  })
                ]
              }),

              // Document header information
              new sap.m.Panel({
                headerText: "Header Information",
                expandable: true,
                expanded: true,
                content: [
                  new sap.m.Table({
                    columns: [
                      new sap.m.Column({ header: new sap.m.Text({ text: "Field" }) }),
                      new sap.m.Column({ header: new sap.m.Text({ text: "Value" }) })
                    ],
                    items: headerDetails.map(detail =>
                      new sap.m.ColumnListItem({
                        cells: [
                          new sap.m.Text({ text: detail.key }),
                          new sap.m.Text({ text: detail.value })
                        ]
                      })
                    )
                  })
                ]
              }),

              // Item-specific information - only show if there are item fields to display
              ...(itemDetails.length > 0 ? [
                new sap.m.Panel({
                  headerText: sheetType === "Debits" ? "Debit Line Information" : "Item Information",
                  expandable: true,
                  expanded: true,
                  content: [
                    new sap.m.Table({
                      columns: [
                        new sap.m.Column({ header: new sap.m.Text({ text: "Field" }) }),
                        new sap.m.Column({ header: new sap.m.Text({ text: "Value" }) })
                      ],
                      items: itemDetails.map(detail =>
                        new sap.m.ColumnListItem({
                          cells: [
                            new sap.m.Text({
                              text: detail.key,
                              emphasize: ["Sequence Id", "GLAccount", "SupplierInvoiceItemAmount"].includes(detail.key)
                            }),
                            new sap.m.Text({
                              text: detail.value,
                              emphasize: ["Sequence Id", "GLAccount", "SupplierInvoiceItemAmount"].includes(detail.key)
                            })
                          ]
                        })
                      )
                    })
                  ]
                })
              ] : []),

              // Additional fields (if any)
              ...(otherDetails.length > 0 ? [
                new sap.m.Panel({
                  headerText: "Additional Information",
                  expandable: true,
                  expanded: false,
                  content: [
                    new sap.m.Table({
                      columns: [
                        new sap.m.Column({ header: new sap.m.Text({ text: "Field" }) }),
                        new sap.m.Column({ header: new sap.m.Text({ text: "Value" }) })
                      ],
                      items: otherDetails.map(detail =>
                        new sap.m.ColumnListItem({
                          cells: [
                            new sap.m.Text({ text: detail.key }),
                            new sap.m.Text({ text: detail.value })
                          ]
                        })
                      )
                    })
                  ]
                })
              ] : [])
            ]
          })
        ],
        beginButton: new sap.m.Button({
          text: "Close",
          press: function () {
            detailsDialog.close();
          }
        }),
        afterClose: function () {
          detailsDialog.destroy();
        }
      });

      // Add validation errors section if present
      try {
        const validationErrors = oEntry.validationErrors || oEntry.ValidationErrors;

        if (validationErrors && validationErrors.length > 0) {
          console.log("Processing validation errors:", validationErrors);

          const errorArray = Array.isArray(validationErrors) ? validationErrors : [validationErrors];
          const formattedErrors = [];

          errorArray.forEach(error => {
            if (error) {
              let errorMessage = "";
              let errorType = "Field Validation";
              let fieldName = "";

              if (typeof error === 'string') {
                errorMessage = error;
              } else if (typeof error === 'object') {
                errorMessage = error.message || JSON.stringify(error);
                errorType = error.sheet === "Balance" ? "Balance Validation" : "Field Validation";
                fieldName = error.field ? ` (${error.field})` : "";
              }

              if (errorMessage) {
                formattedErrors.push({
                  message: errorMessage,
                  type: errorType,
                  field: fieldName
                });
              }
            }
          });

          if (formattedErrors.length > 0) {
            // Group errors by type
            const errorsByType = formattedErrors.reduce((groups, error) => {
              if (!groups[error.type]) {
                groups[error.type] = [];
              }
              groups[error.type].push(error);
              return groups;
            }, {});

            const errorPanels = Object.entries(errorsByType).map(([type, errors]) => {
              const items = errors.map(error => {
                return new StandardListItem({
                  title: error.message,
                  description: error.field ? `Field: ${error.field}` : "",
                  icon: type === "Balance Validation" ? "sap-icon://accounting-document-verification" : "sap-icon://error",
                  iconInset: false,
                  type: "Inactive"
                });
              });

              return new Panel({
                headerText: `${type} (${errors.length})`,
                expandable: true,
                expanded: true,
                content: [
                  new List({
                    items: items,
                    mode: "None"
                  })
                ]
              }).addStyleClass("sapUiSmallMarginTop");
            });

            // Add main validation errors panel
            const mainErrorPanel = new Panel({
              headerText: `Validation Errors (${formattedErrors.length})`,
              expandable: true,
              expanded: true,
              content: errorPanels
            }).addStyleClass("sapUiMediumMarginTop");

            // Insert the error panel before the close button
            const dialogContent = detailsDialog.getContent()[0];
            if (dialogContent && dialogContent.addItem) {
              dialogContent.addItem(mainErrorPanel);
            } else {
              detailsDialog.addContent(mainErrorPanel);
            }
          }
        }
      } catch (e) {
        console.error("Error processing validation errors:", e);
        const errorPanel = new Panel({
          headerText: "Validation Errors",
          expandable: true,
          expanded: true,
          content: [
            new Text({
              text: "Error displaying validation details: " + e.message
            })
          ]
        }).addStyleClass("sapUiSmallMarginTop");

        const dialogContent = detailsDialog.getContent()[0];
        if (dialogContent && dialogContent.addItem) {
          dialogContent.addItem(errorPanel);
        } else {
          detailsDialog.addContent(errorPanel);
        }
      }

      // Open the dialog
      detailsDialog.open();

      // Log the full entry object for debugging
      console.log("Full Entry Object:", JSON.stringify(oEntry, null, 2));
    };

    /**
      * Prepare error summary data by grouping by sequence ID
      * @param {array} errors - Error array
      * @returns {array} Grouped errors
      * @private
      */
    this._prepareErrorSummaryData = function (errors) {
      // Group errors by sequence ID to avoid duplicates
      const errorsBySequenceId = {};

      errors.forEach(error => {
        let sequenceId = "Unknown";
        let errorMessage = "";
        let transactionId = null;

        // Handle string or object errors
        if (typeof error === 'string') {
          errorMessage = error;
          // Try to extract sequence ID from the message
          const seqMatch = error.match(/Sequence ID\s*([0-9]+)/i);
          if (seqMatch && seqMatch.length > 1) sequenceId = seqMatch[1];
        } else if (error && typeof error === 'object') {
          sequenceId = error.sequenceId || error["Sequence ID"] || "Unknown";
          errorMessage = error.message || error.statusMessage || JSON.stringify(error);
          transactionId = error.transactionId;

          // Try to extract transaction ID from message if not directly available
          if (!transactionId && typeof errorMessage === 'string') {
            const match = errorMessage.match(/Transaction ID\s*([A-Z0-9]+)/i);
            if (match && match.length > 1) transactionId = match[1];
          }
        }

        // Create or update entry for this sequence ID
        if (!errorsBySequenceId[sequenceId]) {
          errorsBySequenceId[sequenceId] = {
            sequenceId: sequenceId,
            messages: [],
            transactionId: null
          };
        }

        // Add this error message if it's unique
        if (errorMessage && !errorsBySequenceId[sequenceId].messages.includes(errorMessage)) {
          errorsBySequenceId[sequenceId].messages.push(errorMessage);
        }

        // Set transaction ID if available
        if (transactionId && !errorsBySequenceId[sequenceId].transactionId) {
          errorsBySequenceId[sequenceId].transactionId = transactionId;
        }
      });

      // Convert to array for display
      return Object.values(errorsBySequenceId);
    };

    /**
     * Populate the error summary dialog with data
     * @param {array} groupedErrors - Grouped error data
     * @param {object} exportManager - Reference to export manager
     * @private
     */
    this._populateErrorSummaryDialog = function (groupedErrors, exportManager) {
      // Create a model for the error data
      const oModel = new JSONModel({
        errors: groupedErrors,
        errorCount: groupedErrors.length
      });

      // Set the model on the dialog
      this._dialogs.errorSummaryDialog.setModel(oModel, "errorSummary");

      // Store export manager reference for later use
      this._currentExportManager = exportManager;
    };

    /**
     * Show error summary dialog (with fallback if fragment not found)
     * @param {array} errors - Validation errors
     * @param {object} exportManager - Reference to export manager
     */
    this.showErrorSummaryDialog = function (errors, exportManager) {
      // Group errors by sequence ID to avoid duplicates
      const groupedErrors = this._prepareErrorSummaryData(errors);

      // Try to load fragment, but provide fallback
      if (!this._dialogs.errorSummaryDialog) {
        // Create fallback dialog if fragment loading fails
        this._createFallbackErrorDialog(groupedErrors, exportManager);
      } else {
        // Dialog already exists, just update the data and open it
        this._populateErrorSummaryDialog(groupedErrors, exportManager);
        this._dialogs.errorSummaryDialog.open();
      }
    };

    /**
     * Create fallback error dialog when fragment is not available
     * @param {array} groupedErrors - Grouped error data
     * @param {object} exportManager - Reference to export manager
     * @private
     */
    this._createFallbackErrorDialog = function (groupedErrors, exportManager) {
      const errorItems = groupedErrors.map(error => {
        return new StandardListItem({
          title: `Sequence ID: ${error.sequenceId}`,
          description: error.messages[0] || "Unknown error",
          icon: "sap-icon://error",
          iconInset: false,
          info: error.transactionId || "",
          infoState: ValueState.Warning
        });
      });

      const errorDialog = new Dialog({
        title: "Error Summary",
        titleAlignment: "Center",
        state: ValueState.Error,
        icon: "sap-icon://message-error",
        contentWidth: "650px",
        content: [
          new MessageStrip({
            text: `Found ${groupedErrors.length} errors. Please review and correct the issues.`,
            type: "Error",
            showIcon: true
          }).addStyleClass("sapUiSmallMarginTop sapUiSmallMarginBottom"),
          new List({
            mode: "None",
            items: errorItems
          })
        ],
        beginButton: new Button({
          text: "Close",
          press: function () {
            errorDialog.close();
          }
        }),
        endButton: new Button({
          text: "Export Errors",
          icon: "sap-icon://excel-attachment",
          press: () => {
            if (this.oController._exportManager) {
              this.oController._exportManager.exportValidationErrors(groupedErrors);
            }
            errorDialog.close();
          }
        }),
        afterClose: function () {
          errorDialog.destroy();
        }
      });

      this._dialogs.errorSummaryDialog = errorDialog;
      errorDialog.open();
    };

    /**
    * Show help dialog with application instructions
    */
    this.showHelpDialog = function () {
      // Create fallback help dialog since fragment might not exist
      if (!this._dialogs.helpDialog) {
        this._createFallbackHelpDialog();
      } else {
        this._dialogs.helpDialog.open();
      }
    };

    /**
     * Create fallback help dialog
     * @private
     */
    this._createFallbackHelpDialog = function () {
      const helpDialog = new Dialog({
        title: "Help - Supplier Invoice Upload",
        titleAlignment: "Center",
        icon: "sap-icon://hint",
        contentWidth: "700px",
        content: [
          new VBox({
            items: [
              new Title({
                text: "How to Use the Supplier Invoice Upload Tool",
                level: "H3"
              }).addStyleClass("sapUiMediumMarginBottom"),

              new Panel({
                headerText: "Step 1: Download Template",
                expandable: true,
                expanded: true,
                content: [
                  new Text({
                    text: "Click 'Download Template' to get the Excel template with the correct format and sample data."
                  })
                ]
              }).addStyleClass("sapUiSmallMarginBottom"),

              new Panel({
                headerText: "Step 2: Fill Template",
                expandable: true,
                expanded: true,
                content: [
                  new Text({
                    text: "Fill in your supplier invoice data in the template. Make sure to follow the format shown in the sample rows."
                  })
                ]
              }).addStyleClass("sapUiSmallMarginBottom"),

              new Panel({
                headerText: "Step 3: Upload File",
                expandable: true,
                expanded: true,
                content: [
                  new Text({
                    text: "Click 'Choose File' and select your completed Excel file, then click 'Upload' to process the invoices."
                  })
                ]
              }).addStyleClass("sapUiSmallMarginBottom"),

              new Panel({
                headerText: "Troubleshooting",
                expandable: true,
                expanded: false,
                content: [
                  new Text({
                    text: "• Make sure all required fields are filled\n• Check that amounts are numeric\n• Verify company codes exist\n• Ensure dates are in correct format"
                  })
                ]
              })
            ]
          })
        ],
        beginButton: new Button({
          text: "Close",
          press: function () {
            helpDialog.close();
          }
        }),
        afterClose: function () {
          helpDialog.destroy();
        }
      });

      this._dialogs.helpDialog = helpDialog;
      helpDialog.open();
    };

    /**
     * Show success dialog with document information
     * @param {array} successEntries - Successfully submitted entries
     */
    this.showSuccessWithDocuments = function (successEntries) {
      if (!successEntries.length) {
        sap.m.MessageBox.success("All supplier invoices submitted successfully!");
        return;
      }

      // Create rich document display instead of plain text
      const formattedDocuments = this._formatDocumentsForDisplay(successEntries);
      this._showSuccessDialog(formattedDocuments, successEntries.length);
    };

    /**
     * Show success dialog with document details
     * @param {array} formattedDocuments - Formatted document objects
     * @param {number} entryCount - Number of successful entries
     */
    this._showSuccessDialog = function (formattedDocuments, entryCount) {
      const documentItems = formattedDocuments.map(doc => {
        return new StandardListItem({
          title: doc.displayText,
          description: doc.message,
          icon: "sap-icon://accept",
          iconInset: false,
          info: doc.statusCode,
          infoState: ValueState.Success
        });
      });

      const successDialog = new Dialog({
        title: "Upload Successful",
        titleAlignment: "Center",
        state: ValueState.Success,
        icon: "sap-icon://accept",
        contentWidth: "650px",
        content: [
          new MessageStrip({
            text: `${entryCount} supplier invoices submitted successfully.`,
            type: "Success",
            showIcon: true
          }).addStyleClass("sapUiSmallMarginTop sapUiSmallMarginBottom"),
          new List({
            mode: "None",
            items: documentItems
          })
        ],
        beginButton: new Button({
          text: "Close",
          press: function () {
            successDialog.close();
          }
        }),
        afterClose: function () {
          successDialog.destroy();
        }
      });

      this._dialogs.successDialog = successDialog;
      successDialog.open();
    };

    /**
     * Show partial success dialog with document and error details
     * @param {array} successEntries - Successfully submitted entries
     * @param {array} failedEntries - Failed entries
     * @param {number} successCount - Number of successful entries
     * @param {number} failedCount - Number of failed entries
     */
    this.showPartialSuccessWithDocuments = function (successEntries, failedEntries, successCount, failedCount) {
      // Format documents and errors
      const formattedDocuments = this._formatDocumentsForDisplay(successEntries);
      const formattedErrors = this._formatErrorsForDisplay(failedEntries);
      this._showPartialSuccessDialog(formattedDocuments, formattedErrors, successCount, failedCount);
    };

    /**
     * Show partial success dialog with formatted data
     * @param {array} formattedDocuments - Formatted document objects
     * @param {array} formattedErrors - Formatted error objects
     * @param {number} successCount - Number of successful entries
     * @param {number} failedCount - Number of failed entries
     */
    this._showPartialSuccessDialog = function (formattedDocuments, formattedErrors, successCount, failedCount) {
      const successItems = formattedDocuments.map(doc => {
        return new StandardListItem({
          title: doc.displayText,
          description: doc.message,
          icon: "sap-icon://accept",
          iconInset: false,
          info: "Success",
          infoState: ValueState.Success
        });
      });

      const errorItems = formattedErrors.map(error => {
        return new StandardListItem({
          title: `Sequence ID: ${error.sequenceId}`,
          description: error.statusMessage,
          icon: "sap-icon://error",
          iconInset: false,
          info: error.statusCode,
          infoState: ValueState.Error
        });
      });

      const partialDialog = new Dialog({
        title: "Partial Upload Success",
        titleAlignment: "Center",
        state: ValueState.Warning,
        icon: "sap-icon://warning",
        contentWidth: "700px",
        content: [
          new MessageStrip({
            text: `${successCount} invoices uploaded successfully, ${failedCount} failed.`,
            type: "Warning",
            showIcon: true
          }).addStyleClass("sapUiSmallMarginTop sapUiSmallMarginBottom"),
          new IconTabBar({
            items: [
              new IconTabFilter({
                text: `Successful (${successCount})`,
                icon: "sap-icon://accept",
                iconColor: "Positive",
                content: [
                  new List({
                    mode: "None",
                    items: successItems
                  })
                ]
              }),
              new IconTabFilter({
                text: `Failed (${failedCount})`,
                icon: "sap-icon://error",
                iconColor: "Negative",
                content: [
                  new List({
                    mode: "None",
                    items: errorItems
                  })
                ]
              })
            ]
          })
        ],
        beginButton: new Button({
          text: "Close",
          press: function () {
            partialDialog.close();
          }
        }),
        endButton: new Button({
          text: "Export Results",
          icon: "sap-icon://excel-attachment",
          press: () => {
            // OLD: this._exportPartialResults(formattedDocuments, formattedErrors);
            // NEW: Use ExportManager
            if (this.oController._exportManager) {
              this.oController._exportManager.exportPartialResults(formattedDocuments, formattedErrors);
            }
            partialDialog.close();
          }
        }),
        afterClose: function () {
          partialDialog.destroy();
        }
      });

      this._dialogs.partialSuccessDialog = partialDialog;
      partialDialog.open();
    };

    /**
     * Show error details dialog for failed submissions
     * @param {array} failedEntries - Failed entries
     */
    this.showErrorWithDetails = function (failedEntries) {
      // Format errors
      const formattedErrors = this._formatErrorsForDisplay(failedEntries);
      this._showErrorDialog(formattedErrors, failedEntries.length);
    };

    /**
     * Show error dialog with formatted errors
     * @param {array} formattedErrors - Formatted error objects
     * @param {number} errorCount - Number of failed entries
     */
    this._showErrorDialog = function (formattedErrors, errorCount) {
      const errorItems = formattedErrors.map(error => {
        return new StandardListItem({
          title: `Sequence ID: ${error.sequenceId}`,
          description: error.statusMessage,
          icon: "sap-icon://error",
          iconInset: false,
          info: error.statusCode,
          infoState: ValueState.Error
        });
      });

      const errorDialog = new Dialog({
        title: "Upload Failed",
        titleAlignment: "Center",
        state: ValueState.Error,
        icon: "sap-icon://message-error",
        contentWidth: "650px",
        content: [
          new MessageStrip({
            text: `${errorCount} supplier invoices failed to upload.`,
            type: "Error",
            showIcon: true
          }).addStyleClass("sapUiSmallMarginTop sapUiSmallMarginBottom"),
          new List({
            mode: "None",
            items: errorItems
          })
        ],
        beginButton: new Button({
          text: "Close",
          press: function () {
            errorDialog.close();
          }
        }),
        endButton: new Button({
          text: "Export Errors",
          icon: "sap-icon://excel-attachment",
          press: () => {
            // OLD: this._exportErrorDetails(formattedErrors);
            // NEW: Use ExportManager  
            if (this.oController._exportManager) {
              this.oController._exportManager.exportErrorDetails(formattedErrors);
            }
            errorDialog.close();
          }
        }),
        afterClose: function () {
          errorDialog.destroy();
        }
      });

      this._dialogs.errorDialog = errorDialog;
      errorDialog.open();
    };

    /**
     * Initialize batch processing display (simplified version)
     * @param {object} container - The container to add the batch display to
     * @returns {Promise} Promise resolving with the batch processing display
     */
    this.initBatchProcessingDisplay = function (container) {
      console.log("initBatchProcessingDisplay called with container:", container);

      return new Promise((resolve, reject) => {
        if (!container) {
          console.error("No container provided for batch processing display");
          reject(new Error("No container provided for batch processing display"));
          return;
        }

        // Create a simple batch processing display without fragments
        console.log("Creating simple batch processing display...");

        // Create a model for batch display data
        const oModel = new JSONModel({
          status: "Ready",
          error: "",
          totalBatches: 0,
          currentBatch: 0,
          processedBatches: 0,
          totalEntries: 0,
          processedEntries: 0,
          timeRemaining: "Calculating..."
        });

        // Create simple UI elements
        const statusText = new Text({
          text: "{batchDisplay>/status}"
        });

        const progressText = new Text({
          text: "Processing batch {batchDisplay>/currentBatch} of {batchDisplay>/totalBatches}"
        });

        const progressIndicator = new ProgressIndicator({
          width: "100%",
          percentValue: 0,
          displayValue: "0%"
        });

        const errorMessage = new MessageStrip({
          text: "{batchDisplay>/error}",
          type: "Error",
          visible: "{= ${batchDisplay>/error} !== ''}"
        });

        const batchDisplay = new VBox({
          id: container.getId() + "-batchProcessingDisplay",
          visible: false,
          items: [
            new Title({ text: "Batch Processing Status", level: "H4" }),
            statusText,
            progressText,
            progressIndicator,
            errorMessage
          ]
        }).addStyleClass("sapUiMediumMargin");

        // Add to container
        container.addContent(batchDisplay);

        // Set the model on the view
        this.oController.getView().setModel(oModel, "batchDisplay");

        // Create batch display object with update methods
        this._batchProcessingDisplay = {
          _model: oModel,
          _progressIndicator: progressIndicator,

          setVisible: function (bVisible) {
            batchDisplay.setVisible(bVisible);
            return this;
          },

          setStatus: function (sStatus) {
            console.log("Setting status to:", sStatus);
            this._model.setProperty("/status", sStatus || "Ready");
            return this;
          },

          getStatus: function () {
            return this._model.getProperty("/status");
          },

          setError: function (sError) {
            console.log("Setting error to:", sError);
            this._model.setProperty("/error", sError || "");
            return this;
          },

          setTotalBatches: function (iValue) {
            console.log("Setting totalBatches to:", iValue);
            this._model.setProperty("/totalBatches", iValue || 0);
            this._updateProgress();
            return this;
          },

          setCurrentBatch: function (iValue) {
            console.log("Setting currentBatch to:", iValue);
            this._model.setProperty("/currentBatch", iValue || 0);
            this._updateProgress();
            return this;
          },

          setProcessedBatches: function (iValue) {
            console.log("Setting processedBatches to:", iValue);
            this._model.setProperty("/processedBatches", iValue || 0);
            return this;
          },

          setTotalEntries: function (iValue) {
            console.log("Setting totalEntries to:", iValue);
            this._model.setProperty("/totalEntries", iValue || 0);
            return this;
          },

          setProcessedEntries: function (iValue) {
            console.log("Setting processedEntries to:", iValue);
            this._model.setProperty("/processedEntries", iValue || 0);
            return this;
          },

          setEstimatedTimeRemaining: function (sValue) {
            console.log("Setting timeRemaining to:", sValue);
            this._model.setProperty("/timeRemaining", sValue || "Calculating...");
            return this;
          },

          _updateProgress: function () {
            const totalBatches = this._model.getProperty("/totalBatches") || 1;
            const currentBatch = this._model.getProperty("/currentBatch") || 0;
            const percentage = Math.round((currentBatch / totalBatches) * 100);

            this._progressIndicator.setPercentValue(percentage);
            this._progressIndicator.setDisplayValue(percentage + "%");
          }
        };

        console.log("Simple batch processing display initialized:", this._batchProcessingDisplay);
        resolve(this._batchProcessingDisplay);
      });
    };

    /**
     * Set batch processing display reference
     * @param {object} display - Batch processing display control
     */
    this.setBatchProcessingDisplay = function (display) {
      this._batchProcessingDisplay = display;
    };

    /**
     * Update batch processing display with new data
     * @param {object} data - Batch processing data
     */
    this.updateBatchProcessingDisplay = function (data) {
      console.log("Updating batch processing display with data:", data);

      if (!this._batchProcessingDisplay) {
        console.warn("Batch processing display not initialized");
        return;
      }

      // Simple, direct updates to each property
      if (data.status !== undefined) {
        this._batchProcessingDisplay.setStatus(data.status);
      }

      if (data.error !== undefined) {
        this._batchProcessingDisplay.setError(data.error);
      }

      if (data.totalBatches !== undefined) {
        this._batchProcessingDisplay.setTotalBatches(data.totalBatches);
      }

      if (data.currentBatch !== undefined) {
        this._batchProcessingDisplay.setCurrentBatch(data.currentBatch);
      }

      if (data.processedBatches !== undefined) {
        this._batchProcessingDisplay.setProcessedBatches(data.processedBatches);
      }

      if (data.totalEntries !== undefined) {
        this._batchProcessingDisplay.setTotalEntries(data.totalEntries);
      }

      if (data.processedEntries !== undefined) {
        this._batchProcessingDisplay.setProcessedEntries(data.processedEntries);
      }

      if (data.estimatedTimeRemaining !== undefined) {
        this._batchProcessingDisplay.setEstimatedTimeRemaining(data.estimatedTimeRemaining);
      }
    };

    /**
     * Format documents for display
     * @param {array} entries - Entry objects
     * @returns {array} Formatted document objects
     */
    this._formatDocumentsForDisplay = function (entries) {
      return entries.map(entry => {
        let documentNumber = "";
        let companyCode = "";
        let fiscalYear = "";

        // Extract document information from entry
        if (entry.documentInfo) {
          documentNumber = entry.documentInfo.documentNumber || "";
          companyCode = entry.documentInfo.companyCode || "";
          fiscalYear = entry.documentInfo.fiscalYear || "";
        } else if (entry.documentNumber) {
          documentNumber = entry.documentNumber || "";
          companyCode = entry.companyCode || "";
          fiscalYear = entry.fiscalYear || "";
        }

        // Try to extract from supplier invoice fields
        if (!documentNumber && entry.SupplierInvoice) {
          documentNumber = entry.SupplierInvoice;
        }
        if (!companyCode && entry.CompanyCode) {
          companyCode = entry.CompanyCode;
        }
        if (!fiscalYear && entry.FiscalYear) {
          fiscalYear = entry.FiscalYear;
        }

        // If document info is missing, try to extract from status message
        if (entry.statusMessage && entry.statusMessage.includes("Document")) {
          const docMatch = entry.statusMessage.match(/Document\s+(\w+)/);
          if (docMatch && docMatch[1]) {
            documentNumber = docMatch[1];
          }
        }

        // Format for display
        const formattedDocNumber = `${documentNumber}/${companyCode}/${fiscalYear}`;

        return {
          sequenceId: entry["Sequence Id"] || entry.sequenceId,
          documentNumber: documentNumber,
          companyCode: companyCode,
          fiscalYear: fiscalYear,
          formattedDocNumber: formattedDocNumber,
          message: entry.statusMessage || "",
          statusCode: entry.statusCode || "",
          displayText: `Document ${documentNumber} (${companyCode}/${fiscalYear})`
        };
      });
    };

    /**
     * Format errors for display
     * @param {array} entries - Failed entry objects
     * @returns {array} Formatted error objects
     */
    this._formatErrorsForDisplay = function (entries) {
      return entries.map(entry => {
        // Extract detailed error messages and transaction ID
        const errorDetails = [];
        let transactionId = null;

        if (entry.errorDetails && Array.isArray(entry.errorDetails)) {
          entry.errorDetails.forEach(detail => {
            if (typeof detail === 'string') {
              errorDetails.push(detail);
              // Try to extract transaction ID from the message
              const match = detail.match(/Transaction ID ([A-Z0-9]+)/i);
              if (match && match.length > 1) transactionId = match[1];
            } else if (detail && typeof detail === 'object') {
              errorDetails.push(detail.message || JSON.stringify(detail));
              // Use transaction ID if directly provided
              if (detail.transactionId) transactionId = detail.transactionId;
            }
          });
        }

        // Check in status message if no transaction ID found yet
        if (!transactionId && entry.statusMessage) {
          const match = entry.statusMessage.match(/Transaction ID ([A-Z0-9]+)/i);
          if (match && match.length > 1) transactionId = match[1];
        }

        // Use status message if no detailed errors available
        if (errorDetails.length === 0 && entry.statusMessage) {
          errorDetails.push(entry.statusMessage);
        }

        return {
          sequenceId: entry["Sequence Id"] || entry.sequenceId,
          statusCode: entry.statusCode || "",
          statusMessage: entry.statusMessage || "Unknown error",
          errorDetails: errorDetails,
          transactionId: transactionId,
          timestamp: new Date().toISOString()
        };
      });
    };


  };
});