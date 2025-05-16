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
     * Display entry details dialog
     * @param {object} oEntry - Entry data object
     */
    this.showEntryDetailsDialog = function (oEntry) {
      // Create a formatted display of all entry details
      console.log("Entry to display:", oEntry);

      // Ensure the entry object is valid
      if (!oEntry || typeof oEntry !== 'object') {
        sap.m.MessageBox.error("Cannot display entry details: Invalid entry data");
        return;
      }

      // Determine entry type - Vendor Lines or Customer Lines
      const isVendorLine = oEntry["Sheet"] === "Vendor Lines";

      // Define field sets for different sections
      const headerFields = [
        "Accounting Document Type",
        "Document Reference ID",
        "Document Header Text",
        "Company Code",
        "Document Date",
        "Posting Date"
      ];

      const lineFields = [
        "Sequence ID",
        "Reference Document Item",
        "Indicator",
        "Vendor Code",
        "Customer Code",
        "Currency",
        "Amount",
        "Assignment",
        "Reference Key 1",
        "Reference Key 3",
        "Item Text",
        "Business Place"
      ];

      // Log additional debugging information
      console.log("Entry Sheet Type:", oEntry["Sheet"]);
      console.log("Reference Key 1:", oEntry["Reference Key 1"] || oEntry["Reference Key-1"] || "Not Found");
      console.log("Reference Key 3:", oEntry["Reference Key 3"] || oEntry["Reference Key-3"] || "Not Found");

      // Helper function to get field value with multiple possible key formats
      function getFieldValue(fieldName, obj) {
        // Try various formats of the key
        const variations = [
          fieldName,
          fieldName.replace(/-/g, " "),
          fieldName.replace(/\s/g, ""),
          fieldName.replace(/\s/g, "-"),
          fieldName.toLowerCase(),
          fieldName.toLowerCase().replace(/-/g, " "),
          fieldName.toLowerCase().replace(/\s/g, ""),
          fieldName.toLowerCase().replace(/\s/g, "-")
        ];

        for (const variation of variations) {
          if (obj[variation] !== undefined && obj[variation] !== null) {
            return obj[variation].toString().trim();
          }
        }

        return "";
      }

      // Create field collections for different sections
      const headerDetails = [];
      const lineDetails = [];
      const otherDetails = [];
      const processedFields = new Set();

      // Process header fields
      headerFields.forEach(fieldName => {
        const value = getFieldValue(fieldName, oEntry);
        if (value) {
          headerDetails.push({ key: fieldName, value });
        }
      });

      // Process line fields with special handling for Reference Keys
      const lineDetailsWithReferenceKeys = lineFields.map(fieldName => {
        const normalizedField = fieldName.toLowerCase().replace(/[\s-]/g, "");

        // Skip already processed fields
        if (processedFields.has(normalizedField)) return null;

        // Get field value with robust method
        const value = getFieldValue(fieldName, oEntry);

        // Always add Reference Key 1 and 3, even if empty
        if (fieldName === "Reference Key 1" || fieldName === "Reference Key 3") {
          processedFields.add(normalizedField);
          return {
            key: fieldName,
            value: value || "",
            alwaysShow: true  // Force display
          };
        }

        // For other fields
        processedFields.add(normalizedField);
        return {
          key: fieldName,
          value: value || ""
        };
      }).filter(Boolean);  // Remove any null entries

      // Add any remaining fields
      const excludedKeys = ["validationErrors", "status", "ValidationErrors", "Sheet"];

      Object.entries(oEntry).forEach(([key, value]) => {
        if (!excludedKeys.includes(key) &&
          !headerFields.includes(key) &&
          !lineFields.includes(key) &&
          !processedFields.has(key.toLowerCase().replace(/[\s-]/g, "")) &&
          value !== null &&
          value !== undefined) {
          otherDetails.push({ key, value: value.toString() });
        }
      });

      // Dialog title and sections based on entry type
      const dialogTitle = isVendorLine
        ? "Vendor Line Entry Details"
        : "Customer Line Entry Details";

      // Get key values for object header
      const sequenceId = getFieldValue("Sequence ID", oEntry) || "N/A";
      const amount = getFieldValue("Amount", oEntry) || "0";
      const currency = getFieldValue("Currency", oEntry) || "";

      // Determine code field based on line type
      const codeField = isVendorLine ? "Vendor Code" : "Customer Code";
      const codeValue = getFieldValue(codeField, oEntry) || "N/A";

      // Create a dialog to display entry details
      const detailsDialog = new sap.m.Dialog({
        title: dialogTitle,
        contentWidth: "700px",
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
                    text: codeField + ": " + codeValue
                  }),
                  new sap.m.ObjectAttribute({
                    text: "Business Place: " + (getFieldValue("Business Place", oEntry) || "N/A")
                  })
                ],
                statuses: [
                  new sap.m.ObjectStatus({
                    text: isVendorLine ? "Vendor Line" : "Customer Line",
                    state: isVendorLine
                      ? sap.ui.core.ValueState.Warning
                      : sap.ui.core.ValueState.Information
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
                headerText: "Line Information",
                expandable: true,
                expanded: true,
                content: [
                  new sap.m.Table({
                    columns: [
                      new sap.m.Column({ header: new sap.m.Text({ text: "Field" }) }),
                      new sap.m.Column({ header: new sap.m.Text({ text: "Value" }) })
                    ],
                    items: lineDetailsWithReferenceKeys
                      .filter(detail => {
                        // For Vendor Lines, ensure only Vendor Code and non-empty fields are shown
                        if (isVendorLine) {
                          return detail.key === "Vendor Code" ||
                            (detail.key !== "Customer Code" && detail.value) ||
                            ["Reference Key 1", "Reference Key 3"].includes(detail.key);
                        }

                        // For Customer Lines, ensure only Customer Code and non-empty fields are shown
                        return detail.key === "Customer Code" ||
                          (detail.key !== "Vendor Code" && detail.value) ||
                          ["Reference Key 1", "Reference Key 3"].includes(detail.key);
                      })
                      .map(detail => {
                        return new sap.m.ColumnListItem({
                          cells: [
                            new sap.m.Text({
                              text: detail.key,
                              emphasize: [
                                "Sequence ID",
                                "Amount",
                                "Currency",
                                "Vendor Code",
                                "Customer Code",
                                "Reference Key 1",
                                "Reference Key 3"
                              ].includes(detail.key) || detail.alwaysShow
                            }),
                            new sap.m.Text({
                              text: detail.value,
                              emphasize: [
                                "Sequence ID",
                                "Amount",
                                "Currency",
                                "Vendor Code",
                                "Customer Code",
                                "Reference Key 1",
                                "Reference Key 3"
                              ].includes(detail.key) || detail.alwaysShow
                            })
                          ]
                        });
                      })
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
      try {
        if (oEntry.validationErrors) {
          // Make sure validationErrors is an array
          const errorArray = Array.isArray(oEntry.validationErrors)
            ? oEntry.validationErrors
            : [oEntry.validationErrors];

          if (errorArray.length > 0) {
            // Process validation errors to ensure they are formatted properly
            const formattedErrors = [];

            // Safely process the validation errors array
            errorArray.forEach(error => {
              if (error) {
                // For simple string errors
                if (typeof error === 'string') {
                  formattedErrors.push(error);
                }
                // For error objects with message property
                else if (typeof error === 'object' && error.message) {
                  formattedErrors.push(error.message);
                }
                // For other error objects
                else if (typeof error === 'object') {
                  try {
                    formattedErrors.push(JSON.stringify(error));
                  } catch (e) {
                    formattedErrors.push("Error object could not be displayed");
                  }
                }
              }
            });

            // Only create error list if we have formatted errors
            if (formattedErrors.length > 0) {
              const items = formattedErrors.map(errorMessage => {
                return new sap.m.StandardListItem({
                  title: errorMessage,
                  icon: "sap-icon://error",
                  iconInset: false
                });
              });

              const errorList = new sap.m.List({
                items: items
              });

              const errorPanel = new sap.m.Panel({
                headerText: "Validation Errors",
                expandable: true,
                expanded: true,
                content: [errorList]
              }).addStyleClass("sapUiSmallMarginTop");

              detailsDialog.addContent(errorPanel);
            }
          }
        }
      } catch (e) {
        console.error("Error processing validation errors:", e);
        // Add a generic error panel if something goes wrong
        detailsDialog.addContent(
          new sap.m.Panel({
            headerText: "Validation Errors",
            expandable: true,
            expanded: true,
            content: [
              new sap.m.Text({
                text: "Error displaying validation details: " + e.message
              })
            ]
          }).addStyleClass("sapUiSmallMarginTop")
        );
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

      // Get the list from the dialog
      const errorList = sap.ui.core.Fragment.byId("errorSummaryDialog", "errorSummaryList");
      if (!errorList) {
        console.error("Error list not found in fragment");
        return;
      }

      // Clear previous items
      errorList.removeAllItems();

      // Create error content - show one consolidated entry per sequence ID
      const errorItems = groupedErrors.map(error => {
        return new sap.m.CustomListItem({
          type: "Active",
          content: [
            new sap.m.VBox({
              items: [
                // Sequence ID
                new sap.m.HBox({
                  items: [
                    new sap.m.Icon({
                      src: "sap-icon://error",
                      color: "Negative"
                    }).addStyleClass("sapUiTinyMarginEnd"),
                    new sap.m.Title({
                      text: `Sequence ID: ${error.sequenceId}`,
                      level: "H4"
                    })
                  ]
                }),

                // Main error message
                new sap.m.Text({
                  text: error.messages[0] || "Unknown error"
                }).addStyleClass("sapUiTinyMarginTop"),

                // Transaction ID (if available)
                error.transactionId ? new sap.m.HBox({
                  alignItems: "Center",
                  items: [
                    new sap.m.Label({ text: "Transaction ID:" }).addStyleClass("sapUiTinyMarginEnd"),
                    new sap.m.ObjectStatus({
                      text: error.transactionId,
                      state: "Warning"
                    }),
                    new sap.m.Button({
                      icon: "sap-icon://copy",
                      type: "Transparent",
                      tooltip: "Copy Transaction ID",
                      press: function () {
                        const textArea = document.createElement('textarea');
                        textArea.value = error.transactionId;
                        textArea.style.position = 'fixed';
                        document.body.appendChild(textArea);
                        textArea.focus();
                        textArea.select();
                        document.body.removeChild(textArea);
                        sap.m.MessageToast.show("Transaction ID copied to clipboard");
                      }
                    })
                  ]
                }).addStyleClass("sapUiTinyMarginTop") : null,

                // Additional messages (if any)
                error.messages.length > 1 ? new sap.m.List({
                  showNoData: false,
                  items: error.messages.slice(1).map(msg => new sap.m.StandardListItem({
                    title: msg,
                    icon: "sap-icon://message-error"
                  }))
                }).addStyleClass("sapUiTinyMarginTop") : null
              ]
            }).addStyleClass("sapUiSmallMargin")
          ]
        });
      });

      // Add items to the list
      errorList.addItems(errorItems);
    };

    /**
     * Show error summary dialog
     * @param {array} errors - Validation errors
     * @param {object} exportManager - Reference to export manager
     */
    this.showErrorSummaryDialog = function (errors, exportManager) {
      // Group errors by sequence ID to avoid duplicates
      const groupedErrors = this._prepareErrorSummaryData(errors);

      // Load the error summary dialog fragment if it doesn't exist
      if (!this._dialogs.errorSummaryDialog) {
        Fragment.load({
          name: "customervendor.view.ErrorSummaryDialog",
          controller: this.oController
        }).then((oDialog) => {
          // Store the dialog for future use
          this._dialogs.errorSummaryDialog = oDialog;
          // Add dependency to view
          this.oController.getView().addDependent(this._dialogs.errorSummaryDialog);
          // Set up the error data
          this._populateErrorSummaryDialog(groupedErrors, exportManager);
          // Open the dialog
          this._dialogs.errorSummaryDialog.open();
        }).catch((error) => {
          console.error("Error loading fragment:", error);
          // Fallback to standard message box if fragment loading fails
          sap.m.MessageBox.error("Could not display error summary: " + error.message);
        });
      } else {
        // Dialog already exists, just update the data and open it
        this._populateErrorSummaryDialog(groupedErrors, exportManager);
        this._dialogs.errorSummaryDialog.open();
      }
    };

    /**
    * Show help dialog with application instructions
    * @param {object} controllerContext - Controller context for event handling
    */
    this.showHelpDialog = function () {
      // Load the help dialog fragment if it doesn't exist
      if (!this._dialogs.helpDialog) {
        Fragment.load({
          name: "customervendor.view.HelpDialog",
          controller: this.oController
        }).then((oDialog) => {
          // Store the dialog for future use
          this._dialogs.helpDialog = oDialog;
          // Add dependency to view
          this.oController.getView().addDependent(this._dialogs.helpDialog);
          // Open the dialog
          this._dialogs.helpDialog.open();
        }).catch((error) => {
          console.error("Error loading help dialog fragment:", error);
          // Fallback to standard message box if fragment loading fails
          sap.m.MessageBox.information("Help information not available. Please try again later.");
        });
      } else {
        // Dialog already exists, just open it
        this._dialogs.helpDialog.open();
      }
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
          name: "customervendor.view.SuccessDialog",
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
          name: "customervendor.view.PartialSuccessDialog",
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
          name: "customervendor.view.ErrorDialog",
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
          name: "customervendor.view.BatchProcessingDisplay",
          controller: this.oController
        }).then(oFragment => {
          console.log("Fragment loaded successfully, adding to container");
          // Create a model for batch display data
          const oModel = new sap.ui.model.json.JSONModel({
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
          this._batchProcessingDisplay = {
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
      if (data.transactionId !== undefined) {
        this._batchProcessingDisplay.setTransactionId(data.transactionId);
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
          sequenceId: entry["Sequence ID"],
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