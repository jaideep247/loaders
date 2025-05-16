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
            this._exportErrorList(groupedErrors);
            errorDialog.close();
          }
        }),
        afterClose: function () {
          errorDialog.destroy();
        }
      });

      errorDialog.open();
    };

    /**
     * Export error list to CSV file
     * @param {object} groupedErrors - Errors grouped by category
     */
    this._exportErrorList = function (groupedErrors) {
      try {
        // Create CSV content with sequence ID and category information
        let csvContent = "SequenceID,Category,Error\n";

        Object.entries(groupedErrors).forEach(([category, categoryErrors]) => {
          categoryErrors.forEach(error => {
            // Handle both object and string error formats
            const errorObj = typeof error === "string" ? { message: error } : error;
            const errorSeqId = errorObj.sequenceId || "N/A"; // Get sequenceId from the error object
            const message = errorObj.message || error;

            // Escape quotes in the error message and wrap in quotes
            const safeError = message.replace(/"/g, '""');
            csvContent += `"${errorSeqId}","${category}","${safeError}"\n`;
          });
        });

        // Create a Blob with the CSV content
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });

        // Create a download link and trigger the download
        const link = document.createElement('a');
        const url = URL.createObjectURL(blob);

        link.setAttribute('href', url);
        link.setAttribute('download', 'validation_errors_' + new Date().toISOString().slice(0, 10) + '.csv');
        link.style.visibility = 'hidden';

        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);

        // Clean up the URL object
        setTimeout(() => {
          URL.revokeObjectURL(url);
        }, 100);

        sap.m.MessageToast.show("Errors exported to CSV file");
      } catch (error) {
        console.error("Error exporting CSV:", error);
        sap.m.MessageBox.error("Failed to export errors: " + error.message);
      }
    };


    /**
     * Show error summary dialog
     * @param {array} errors - Validation errors
     * @param {object} exportManager - Reference to export manager
     */
    this.showErrorSummaryDialog = function (errors, exportManager) {
      // Group errors by type for better display
      const groupedErrors = errors.reduce((groups, error) => {
        let errorType = "General";

        if (typeof error === 'string') {
          if (error.includes('not balanced')) {
            errorType = 'Balance Error';
          } else if (error.includes('must have')) {
            errorType = 'Missing Entries';
          } else if (error.includes('is required')) {
            errorType = 'Missing Fields';
          }
        } else if (typeof error === 'object') {
          errorType = error.context || 'System Error';
          error = error.details?.errorMessage || JSON.stringify(error);
        }

        if (!groups[errorType]) {
          groups[errorType] = [];
        }
        groups[errorType].push(error);
        return groups;
      }, {});

      // Create formatted error list content
      const errorContent = [];

      Object.entries(groupedErrors).forEach(([category, categoryErrors]) => {
        errorContent.push(
          new GroupHeaderListItem({
            title: `${category} (${categoryErrors.length})`,
            upperCase: false
          }).addStyleClass("sapUiSmallMarginTop")
        );

        categoryErrors.forEach(error => {
          errorContent.push(
            new StandardListItem({
              title: typeof error === 'string' ? error : JSON.stringify(error),
              icon: "sap-icon://error",
              iconInset: false
            })
          );
        });
      });

      // Show error summary dialog
      const errorDialog = new Dialog({
        title: "Error Summary",
        titleAlignment: "Center",
        state: ValueState.Error,
        icon: "sap-icon://message-error",
        contentWidth: "650px",
        content: [
          new List({
            mode: "None",
            items: errorContent
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
            exportManager.exportErrorLog(errors);
            errorDialog.close();
          }
        }),
        afterClose: function () {
          errorDialog.destroy();
        }
      });

      errorDialog.open();
    };

    /**
     * Show validation statistics dialog
     * @param {number} total - Total entry count
     * @param {number} successful - Successful entry count
     * @param {number} failed - Failed entry count
     */
    this.showValidationStatsDialog = function (total, successful, failed) {
      // Create chart dialog
      const chartDialog = new Dialog({
        title: "Validation Statistics",
        contentWidth: "400px",
        contentHeight: "300px",
        content: [
          new VBox({
            items: [
              new Title({
                text: "Summary"
              }).addStyleClass("sapUiSmallMarginTop sapUiSmallMarginBegin"),
              new FlexBox({
                justifyContent: "SpaceBetween",
                items: [
                  new VBox({
                    items: [
                      new Text({ text: "Total Entries" }),
                      new ObjectNumber({
                        number: total,
                        emphasized: true
                      })
                    ]
                  }),
                  new VBox({
                    items: [
                      new Text({ text: "Valid Entries" }),
                      new ObjectNumber({
                        number: successful,
                        state: ValueState.Success
                      })
                    ]
                  }),
                  new VBox({
                    items: [
                      new Text({ text: "Invalid Entries" }),
                      new ObjectNumber({
                        number: failed,
                        state: ValueState.Error
                      })
                    ]
                  })
                ]
              }).addStyleClass("sapUiMediumMarginBegin sapUiMediumMarginEnd sapUiSmallMarginTop"),
              new Title({
                text: "Validation Rate"
              }).addStyleClass("sapUiSmallMarginTop sapUiSmallMarginBegin"),
              new FlexBox({
                direction: "Column",
                items: [
                  new ProgressIndicator({
                    percentValue: Math.round((successful / total) * 100),
                    displayValue: Math.round((successful / total) * 100) + "% Valid",
                    state: failed > 0 ? ValueState.Warning : ValueState.Success,
                    width: "100%",
                    height: "2rem"
                  })
                ]
              }).addStyleClass("sapUiMediumMarginBegin sapUiMediumMarginEnd sapUiSmallMarginTop")
            ]
          })
        ],
        beginButton: new Button({
          text: "Close",
          press: function () {
            chartDialog.close();
          }
        }),
        afterClose: function () {
          chartDialog.destroy();
        }
      });

      chartDialog.open();
    };

    /**
     * Show help dialog with application instructions
     * @param {object} controllerContext - Controller context for event handling
     */
    this.showHelpDialog = function (controllerContext) {
      const helpDialog = new Dialog({
        title: "Journal Entry Upload Help",
        contentWidth: "600px",
        content: [
          new IconTabBar({
            expanded: true,
            items: [
              new IconTabFilter({
                icon: "sap-icon://hint",
                text: "Getting Started",
                content: [
                  new VBox({
                    items: [
                      new Title({
                        text: "How to Upload Journal Entries"
                      }).addStyleClass("sapUiSmallMarginTop"),
                      new Text({
                        text: "1. Download the template using the 'Download Template' button."
                      }).addStyleClass("sapUiTinyMarginTop"),
                      new Text({
                        text: "2. Fill out the template with your journal entries."
                      }),
                      new Text({
                        text: "3. Upload the completed file using the 'Choose File' button."
                      }),
                      new Text({
                        text: "4. Review validation results and fix any errors."
                      }),
                      new Text({
                        text: "5. Click 'Submit Journal Entries' to process valid entries."
                      })
                    ]
                  }).addStyleClass("sapUiSmallMarginBegin sapUiSmallMarginEnd")
                ]
              }),
              new IconTabFilter({
                icon: "sap-icon://alert",
                text: "Common Errors",
                content: [
                  new List({
                    items: [
                      new StandardListItem({
                        title: "Unbalanced Transaction",
                        description: "Ensure debits equal credits within each transaction group."
                      }),
                      new StandardListItem({
                        title: "Missing Required Fields",
                        description: "All required fields must be filled in for each entry."
                      }),
                      new StandardListItem({
                        title: "Invalid Date Format",
                        description: "Dates should be in YYYY-MM-DD format."
                      }),
                      new StandardListItem({
                        title: "Missing Debit or Credit Entry",
                        description: "Each transaction must have at least one debit and one credit entry."
                      })
                    ]
                  })
                ]
              }),
              new IconTabFilter({
                icon: "sap-icon://attachment-text-file",
                text: "File Format",
                content: [
                  new VBox({
                    items: [
                      new Text({
                        text: "The Excel file must contain three worksheets:"
                      }).addStyleClass("sapUiSmallMarginTop"),
                      new List({
                        items: [
                          new StandardListItem({
                            title: "Header: Contains document header information"
                          }),
                          new StandardListItem({
                            title: "Bank Lines: Contains Bank entries"
                          }),
                          new StandardListItem({
                            title: "Vendor Lines: Contains Vendor entries"
                          })
                        ]
                      }),
                      new Link({
                        text: "Download Sample Template",
                        press: () => {
                          controllerContext.onDownloadTemplate();
                          helpDialog.close();
                        }
                      }).addStyleClass("sapUiSmallMarginTop")
                    ]
                  }).addStyleClass("sapUiSmallMarginBegin sapUiSmallMarginEnd")
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

      helpDialog.open();
    };

    /**
     * Show success dialog with document information
     * @param {array} successEntries - Successfully submitted entries
     */
    this.showSuccessWithDocuments = function (successEntries) {
      if (!successEntries.length) {
        sap.m.MessageBox.success("All journal entries submitted successfully!");
        return;
      }

      // Create rich document display instead of plain text
      const formattedDocuments = this._formatDocumentsForDisplay(successEntries);

      // Create a custom fragment for better document display
      if (!this._dialogs.successDialog) {
        Fragment.load({
          name: "vendorpayment.view.SuccessDialog",
          controller: this.oController
        }).then(function (oDialog) {
          this._dialogs.successDialog = oDialog;
          this.oController.getView().addDependent(this._dialogs.successDialog);
          this._showSuccessDialog(formattedDocuments, successEntries.length);
        }.bind(this));
      } else {
        this._showSuccessDialog(formattedDocuments, successEntries.length);
      }
    };

    /**
     * Show success dialog with document details
     * @param {array} formattedDocuments - Formatted document objects
     * @param {number} entryCount - Number of successful entries
     */
    this._showSuccessDialog = function (formattedDocuments, entryCount) {
      // Set the model for the dialog
      const oModel = new JSONModel({
        documents: formattedDocuments,
        entryCount: entryCount,
        title: "Submission Successful",
        message: `${entryCount} journal entries submitted successfully.`
      });

      this._dialogs.successDialog.setModel(oModel, "success");
      this._dialogs.successDialog.open();
      // Ensure the close button is bound to the controller function
      const closeButton = this._dialogs.successDialog.getBeginButton();
      if (closeButton) {
        closeButton.detachPress().attachPress(this.oController.onSuccessDialogClose, this.oController);
      }
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

      // Create a custom fragment for better display
      if (!this._dialogs.partialSuccessDialog) {
        Fragment.load({
          name: "vendorpayment.view.PartialSuccessDialog",
          controller: this.oController
        }).then(function (oDialog) {
          this._dialogs.partialSuccessDialog = oDialog;
          this.oController.getView().addDependent(this._dialogs.partialSuccessDialog);
          this._showPartialSuccessDialog(formattedDocuments, formattedErrors, successCount, failedCount);
        }.bind(this));
      } else {
        this._showPartialSuccessDialog(formattedDocuments, formattedErrors, successCount, failedCount);
      }
    };

    /**
     * Show partial success dialog with formatted data
     * @param {array} formattedDocuments - Formatted document objects
     * @param {array} formattedErrors - Formatted error objects
     * @param {number} successCount - Number of successful entries
     * @param {number} failedCount - Number of failed entries
     */
    this._showPartialSuccessDialog = function (formattedDocuments, formattedErrors, successCount, failedCount) {
      // Set the model for the dialog
      const oModel = new JSONModel({
        documents: formattedDocuments,
        errors: formattedErrors,
        successCount: successCount,
        failedCount: failedCount,
        title: "Partial Submission Success",
        message: `${successCount} journal entries submitted successfully. ${failedCount} journal entries failed.`
      });

      this._dialogs.partialSuccessDialog.setModel(oModel, "partial");
      this._dialogs.partialSuccessDialog.open();
    };

    /**
     * Show error details dialog for failed submissions
     * @param {array} failedEntries - Failed entries
     */
    this.showErrorWithDetails = function (failedEntries) {
      // Format errors
      const formattedErrors = this._formatErrorsForDisplay(failedEntries);

      // Create a custom fragment for better error display
      if (!this._dialogs.errorDialog) {
        Fragment.load({
          name: "vendorpayment.view.ErrorDialog",
          controller: this.oController
        }).then(function (oDialog) {
          this._dialogs.errorDialog = oDialog;
          this.oController.getView().addDependent(this._dialogs.errorDialog);
          this._showErrorDialog(formattedErrors, failedEntries.length);
        }.bind(this));
      } else {
        this._showErrorDialog(formattedErrors, failedEntries.length);
      }
    };

    /**
     * Show error dialog with formatted errors
     * @param {array} formattedErrors - Formatted error objects
     * @param {number} errorCount - Number of failed entries
     */
    this._showErrorDialog = function (formattedErrors, errorCount) {
      // Set the model for the dialog
      const oModel = new JSONModel({
        errors: formattedErrors,
        errorCount: errorCount,
        title: "Submission Failed",
        message: `${errorCount} journal entries failed to upload.`
      });

      this._dialogs.errorDialog.setModel(oModel, "error");
      this._dialogs.errorDialog.open();
    };
    /**
    * Show Entry Details Dialog
    * @param {Object} oEntry - Entry object to display
    */
    this.showEntryDetailsDialog = function (oEntry) {
      // Log the entry for debugging
      console.log("Entry to display:", oEntry);

      // Determine entry type - Bank Line or Vendor Line
      const isBank = oEntry["Entry Type"] === "Debit" || oEntry["Sheet"] === "Bank Lines";
      const isVendor = oEntry["Entry Type"] === "Credit" || oEntry["Sheet"] === "Vendor Lines";

      // Define field sets for different sections
      const headerFields = [
        "Accounting Document Type",
        "Document Reference ID",
        "Document Header Text",
        "Company Code",
        "Document Date",
        "Posting Date"
      ];

      const bankLineFields = [
        "Sequence ID",
        "Reference Document Item",
        "Indicator",
        "GL Account",
        "Currency",
        "Amount",
        "Assignment",
        "Reference ID-1",
        "Item Text",
        "House Bank",
        "Account ID",
        "Profit Center",
        "Business Place",
        "Entry Type"
      ];

      const vendorLineFields = [
        "Sequence ID",
        "Reference Document Item",
        "Indicator",
        "Vendor Code",
        "Currency",
        "Amount",
        "Assignment",
        "Reference Key-1",
        "Item Text",
        "Business Place",
        "Special GL Code",
        "Entry Type"
      ];

      // Fix for the field value misalignment in vendor lines
      let correctedEntry = { ...oEntry };

      if (isVendor) {
        // The vendor line mapping issues observed from console logs
        // Item Text contains a numeric value (which should be Business Place)
        // Business Place contains a letter (which should be Special GL Code)

        const itemTextValue = correctedEntry["Item Text"];
        const businessPlaceValue = correctedEntry["Business Place"];

        // Check if the values seem misaligned - Item Text has a numeric value and Business Place has a letter
        if (itemTextValue && /^\d+$/.test(itemTextValue) &&
          businessPlaceValue && businessPlaceValue.length === 1 && isNaN(businessPlaceValue)) {
          console.log("Fixing misaligned vendor line fields");

          // Store the original values first
          const originalItemText = correctedEntry["Item Text"]; // Contains Business Place value
          const originalBusinessPlace = correctedEntry["Business Place"]; // Contains Special GL Code value

          // Apply corrections
          correctedEntry["Business Place"] = originalItemText; // Move item text value to business place
          correctedEntry["Special GL Code"] = originalBusinessPlace; // Move business place value to special GL code
          correctedEntry["Item Text"] = ""; // Clear item text since the original is lost in the mapping

          console.log("Field values after correction:", {
            "Item Text": correctedEntry["Item Text"],
            "Business Place": correctedEntry["Business Place"],
            "Special GL Code": correctedEntry["Special GL Code"]
          });
        }
      }

      if (isBank) {
        // Fix for Reference ID-1 field - use Reference Key 1 if Reference ID-1 is missing
        if (!correctedEntry["Reference ID-1"] && correctedEntry["Reference Key 1"]) {
          correctedEntry["Reference ID-1"] = correctedEntry["Reference Key 1"];
        }
      }

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
      const lineDetails = [];
      const otherDetails = [];

      // Process header fields
      headerFields.forEach(fieldName => {
        const value = getFieldValue(fieldName, correctedEntry);
        if (value) {
          headerDetails.push({ key: fieldName, value });
        }
      });

      // Process line fields based on entry type
      const lineFieldsToUse = isBank ? bankLineFields : vendorLineFields;

      // Keep track of processed fields to avoid duplicates
      const processedFields = new Set();

      lineFieldsToUse.forEach(fieldName => {
        const normalizedField = fieldName.toLowerCase().replace(/[\s-]/g, "");
        if (processedFields.has(normalizedField)) return;

        const value = getFieldValue(fieldName, correctedEntry);

        // Only add non-empty values or important fields
        if (value || ["Sequence ID", "Reference Document Item", "Entry Type"].includes(fieldName)) {
          lineDetails.push({ key: fieldName, value });
          processedFields.add(normalizedField);
        }
      });

      // Add any remaining fields
      const excludedKeys = ["validationErrors", "status", "ValidationErrors", "Sheet"];

      Object.entries(correctedEntry).forEach(([key, value]) => {
        if (!excludedKeys.includes(key) &&
          !headerFields.includes(key) &&
          !lineFieldsToUse.includes(key) &&
          !processedFields.has(key.toLowerCase().replace(/[\s-]/g, "")) &&
          value !== null &&
          value !== undefined) {
          otherDetails.push({ key, value: formatValue(value) });
        }
      });

      // Dialog title and sections based on entry type
      const dialogTitle = isBank ? "Bank Line Entry Details" : "Vendor Line Entry Details";
      const lineHeaderText = isBank ? "Bank Line Information" : "Vendor Line Information";

      // Get key values for object header
      const sequenceId = getFieldValue("Sequence ID", correctedEntry) || "N/A";
      const amount = getFieldValue("Amount", correctedEntry) || "0";
      const currency = getFieldValue("Currency", correctedEntry) || "";

      // Create a dialog to display entry details
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
                attributes: isBank ? [
                  new sap.m.ObjectAttribute({
                    text: "GL Account: " + (getFieldValue("GL Account", correctedEntry) || "N/A")
                  }),
                  new sap.m.ObjectAttribute({
                    text: "House Bank: " + (getFieldValue("House Bank", correctedEntry) || "N/A")
                  })
                ] : [
                  new sap.m.ObjectAttribute({
                    text: "Vendor Code: " + (getFieldValue("Vendor Code", correctedEntry) || "N/A")
                  }),
                  new sap.m.ObjectAttribute({
                    text: "Business Place: " + (getFieldValue("Business Place", correctedEntry) || "N/A")
                  })
                ],
                statuses: [
                  new sap.m.ObjectStatus({
                    text: getFieldValue("Entry Type", correctedEntry),
                    state: getFieldValue("Entry Type", correctedEntry) === "Debit"
                      ? sap.ui.core.ValueState.Information
                      : (getFieldValue("Entry Type", correctedEntry) === "Credit"
                        ? sap.ui.core.ValueState.Warning
                        : sap.ui.core.ValueState.None)
                  }),
                  new sap.m.ObjectStatus({
                    text: correctedEntry.status || "",
                    state: correctedEntry.status === "Valid"
                      ? sap.ui.core.ValueState.Success
                      : sap.ui.core.ValueState.Error
                  })
                ]
              }),

              // Document header information
              new sap.m.Panel({
                headerText: "Document Information",
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

              // Line-specific information
              new sap.m.Panel({
                headerText: lineHeaderText,
                expandable: true,
                expanded: true,
                content: [
                  new sap.m.Table({
                    columns: [
                      new sap.m.Column({ header: new sap.m.Text({ text: "Field" }) }),
                      new sap.m.Column({ header: new sap.m.Text({ text: "Value" }) })
                    ],
                    items: lineDetails.map(detail =>
                      new sap.m.ColumnListItem({
                        cells: [
                          new sap.m.Text({
                            text: detail.key,
                            emphasize: ["Sequence ID", "Amount", "Currency"].includes(detail.key)
                          }),
                          new sap.m.Text({
                            text: detail.value,
                            emphasize: ["Sequence ID", "Amount", "Currency"].includes(detail.key)
                          })
                        ]
                      })
                    )
                  })
                ]
              }),

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
      if (correctedEntry.validationErrors && correctedEntry.validationErrors.length > 0) {
        const errorList = new sap.m.List({
          items: correctedEntry.validationErrors.map(error =>
            new sap.m.StandardListItem({
              title: error,
              icon: "sap-icon://error",
              iconInset: false
            })
          )
        });

        const errorPanel = new sap.m.Panel({
          headerText: "Validation Errors",
          expandable: true,
          expanded: true,
          content: [errorList]
        }).addStyleClass("sapUiSmallMarginTop");

        detailsDialog.addContent(errorPanel);
      }

      // Open the dialog
      detailsDialog.open();

      // Log the full entry object for debugging
      console.log("Full Entry Object:", JSON.stringify(correctedEntry, null, 2));
    };

    /**
     * Initialize batch processing display
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

        console.log("Loading batch processing display fragment...");
        Fragment.load({
          name: "vendorpayment.view.BatchProcessingDisplay",
          controller: this.oController
        }).then(oFragment => {
          console.log("Fragment loaded successfully, adding to container");
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

          // Add the fragment to the container
          container.addContent(oFragment);

          // Set the model on the view
          this.oController.getView().setModel(oModel, "batchDisplay");

          // Get references to all UI elements
          const rootControl = this.oController.byId("batchProcessingDisplay");
          const statusText = this.oController.byId("batchStatusText");
          const errorMessage = this.oController.byId("batchErrorMessage");
          const progressText = this.oController.byId("batchProgressText");
          const progressIndicator = this.oController.byId("batchProgressIndicator");
          const timeRemainingContainer = this.oController.byId("timeRemainingContainer");
          const timeRemainingText = this.oController.byId("timeRemainingText");

          console.log("UI Elements:", {
            rootControl, statusText, errorMessage, progressText,
            progressIndicator, timeRemainingContainer, timeRemainingText
          });

          // Create batch display object with update methods
          const batchProcessingDisplay = {
            // Store UI element references
            _model: oModel,

            // Interface methods
            setVisible: function (bVisible) {
              if (rootControl) {
                rootControl.setVisible(bVisible);
              }
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
              return this;
            },

            setCurrentBatch: function (iValue) {
              console.log("Setting currentBatch to:", iValue);
              this._model.setProperty("/currentBatch", iValue || 0);
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

            _updateProgressText: function () {
              if (this.ui.progressText) {
                const text = `${this.state.currentBatch} of ${this.state.totalBatches} batches ` +
                  `(${this.state.processedEntries} of ${this.state.totalEntries} entries)`;
                console.log("Updating progress text to:", text);
                this.ui.progressText.setText(text);
              }
            },

            _updateProgressIndicator: function () {
              if (this.ui.progressIndicator) {
                const totalBatches = Math.max(this.state.totalBatches, 1);
                const percentage = Math.round((this.state.currentBatch / totalBatches) * 100);
                console.log("Updating progress indicator to:", percentage);
                this.ui.progressIndicator.setPercentValue(percentage);
                this.ui.progressIndicator.setDisplayValue(percentage + "%");
              }
            }
          };

          console.log("Batch processing display initialized:", this._batchProcessingDisplay);
          resolve(this._batchProcessingDisplay);
        }).catch(error => {
          console.error("Error loading batch processing display:", error);
          reject(error);
        });
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

        // If document info is missing, try to extract from status message
        if (entry.statusMessage && entry.statusMessage.includes("BKPFF")) {
          const bkpffMatch = entry.statusMessage.match(/BKPFF\s+(\d+)\s/);
          if (bkpffMatch && bkpffMatch[1]) {
            const fullDocString = bkpffMatch[1];
            // Extract components from the full string
            // Format is typically: document number + company code + fiscal year
            if (fullDocString.length >= 16) { // Ensuring we have enough characters
              // Assuming fiscal year is always the last 4 digits
              fiscalYear = fullDocString.slice(-4);
              // Assuming company code is the 4 digits before fiscal year
              companyCode = fullDocString.slice(-8, -4);
              // Document number is everything else
              documentNumber = fullDocString.slice(0, -8);
            }
          }
        }

        // Format for display
        const formattedDocNumber = `${documentNumber}/${companyCode}/${fiscalYear}`;

        return {
          sequenceId: entry["Sequence ID"],
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
        // Extract detailed error messages
        const errorDetails = entry.errorDetails && entry.errorDetails.length
          ? entry.errorDetails.map(detail => detail.message)
          : [];

        // Use status message if no detailed errors available
        if (!errorDetails.length && entry.statusMessage) {
          errorDetails.push(entry.statusMessage);
        }

        return {
          sequenceId: entry["Sequence ID"],
          statusCode: entry.statusCode || "",
          statusMessage: entry.statusMessage || "Unknown error",
          errorDetails: errorDetails,
          timestamp: new Date().toISOString()
        };
      });
    };

    return this;
  };
});