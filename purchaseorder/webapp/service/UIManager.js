sap.ui.define(
  [
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
  ],
  function (
    Dialog,
    Button,
    MessageStrip,
    NavContainer,
    Page,
    List,
    StandardListItem,
    GroupHeaderListItem,
    VBox,
    ObjectHeader,
    ObjectAttribute,
    ObjectStatus,
    Panel,
    Table,
    Column,
    ColumnListItem,
    Text,
    Title,
    FlexBox,
    ObjectNumber,
    ProgressIndicator,
    IconTabBar,
    IconTabFilter,
    Link,
    JSONModel,
    Fragment,
    coreLibrary
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
      this._errorSummaryDialog = null;
      /**
        * Show validation errors dialog
        * @param {array} errors - Array of validation errors
        */
      /**
       * Show error details dialog
       * @param {array} errorRecords - Array of error records
       */
      this.showErrorDetailsDialog = function (errorRecords) {
        if (!errorRecords || !errorRecords.length) {
          return;
        }

        // Format error records for display with proper null checks
        const formattedErrors = errorRecords.map(record => {
          // Ensure record is not null/undefined
          if (!record) {
            return {
              sequence: "Unknown",
              error: "Unknown error",
              code: "",
              details: ""
            };
          }

          const entry = record.entry || {};
          const error = record.error || record.Message || "Unknown error";
          const errorCode = record.errorCode || "";
          const details = record.details || "";

          return {
            sequence: (entry.Sequence || "Unknown"),
            error: error,
            code: errorCode,
            details: Array.isArray(details)
              ? details.map(d => (d && d.message) || d || "").filter(d => d).join("; ")
              : (typeof details === 'string' ? details : "")
          };
        });

        // Create dialog to display error details
        const errorDialog = new Dialog({
          title: "Error Details",
          contentWidth: "600px",
          content: [
            new List({
              items: formattedErrors.map(error =>
                new StandardListItem({
                  title: `Sequence: ${error.sequence}`,
                  description: error.error,
                  info: error.code,
                  infoState: ValueState.Error,
                  type: "Active",
                  press: function () {
                    // Show detailed information for this error
                    const detailDialog = new Dialog({
                      title: "Error Detail",
                      contentWidth: "500px",
                      content: [
                        new VBox({
                          items: [
                            new Text({ text: `Sequence: ${error.sequence}` }),
                            new Text({ text: `Error: ${error.error}` }),
                            new Text({ text: `Code: ${error.code || "N/A"}` }),
                            new Text({ text: `Details: ${error.details || "N/A"}` })
                          ]
                        }).addStyleClass("sapUiSmallMarginTop sapUiSmallMarginBottom")
                      ],
                      beginButton: new Button({
                        text: "Close",
                        press: function () {
                          detailDialog.close();
                        }
                      }),
                      afterClose: function () {
                        detailDialog.destroy();
                      }
                    });

                    detailDialog.open();
                  }
                })
              )
            })
          ],
          beginButton: new Button({
            text: "Close",
            press: function () {
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
        * Handle batch processing errors with enhanced sequence tracking
        * @param {Array} errorRecords - Array of error records from batch processing
        */
      this.handleBatchProcessingErrors = function (errorRecords) {
        if (!errorRecords || errorRecords.length === 0) {
          return;
        }

        // Format error records for dialog display with sequence information
        const formattedErrors = errorRecords.map(record => {
          // Extract sequence information from various possible sources
          const sequence = record.OriginalSequence ||
            record.originalSequence ||
            record.Sequence ||
            (record.entry ? (record.entry.Sequence || record.entry.OriginalSequence) : null) ||
            "Unknown";

          // Extract error message
          const errorMessage = record.error ||
            record.Message ||
            record.message ||
            "Unknown error";

          // Format record for display
          return {
            sequenceId: sequence,
            message: errorMessage,
            details: record.details || errorMessage,
            timestamp: record.ProcessedAt || record.timestamp || new Date().toISOString(),
            // Include additional contextual information if available
            companyCode: record.entry?.CompanyCode || record.entry?.CompanyCode || "",
            supplier: record.entry?.SupplierAccountNumber || record.entry?.SupplierAccountNumber || "",
            documentType: record.entry?.PurchasingDocumentType || record.entry?.PurchasingDocumentType || ""
          };
        });

        // Create error summary model
        const oErrorModel = new JSONModel({
          errors: formattedErrors,
          totalErrors: formattedErrors.length,
          lastUpdated: new Date().toISOString()
        });

        // Show processing errors dialog
        if (!this._errorSummaryDialog) {
          Fragment.load({
            name: "purchaseorder.view.ProcessingErrorsDialog",
            controller: {
              onClose: function () {
                this._errorSummaryDialog.close();
              }.bind(this),
              onExportErrors: function () {
                // Export errors using export manager if available
                if (this.oController._exportManager) {
                  this.oController._exportManager.exportErrorRecords(formattedErrors);
                } else {
                  MessageToast.show("Export functionality not available");
                }
              }.bind(this)
            }
          }).then(oDialog => {
            this._errorSummaryDialog = oDialog;
            this.oController.getView().addDependent(oDialog);
            oDialog.setModel(oErrorModel, "errorModel");
            oDialog.open();
          });
        } else {
          this._errorSummaryDialog.setModel(oErrorModel, "errorModel");
          this._errorSummaryDialog.open();
        }
      };

      /**
        * Close any open dialogs
        */
      this.closeDialogs = function () {
        if (this._errorSummaryDialog && this._errorSummaryDialog.isOpen()) {
          this._errorSummaryDialog.close();
        }
      };

      /**
         * Handle validation errors by showing detailed dialog with sequence information
         * @param {Array} validationErrors - Array of validation errors
         * @param {Object} exportManager - Export manager for exporting errors
         */
      this.handleValidationErrors = function (validationErrors, exportManager) {
        if (!validationErrors || validationErrors.length === 0) {
          return;
        }

        // Enhanced error model with sequence information
        const enhancedErrors = validationErrors.map(error => {
          // Ensure sequence ID is tracked
          const sequenceId = error.sequenceId ||
            error.sequence ||
            error.OriginalSequence ||
            error.originalSequence ||
            "Unknown";

          return {
            ...error,
            sequenceId: sequenceId,  // Normalized property name
            sequence: sequenceId,     // Alternative property name for compatibility
            message: error.message || "Unknown error",
            field: error.field || "Unknown field",
            timestamp: error.timestamp || new Date().toISOString()
          };
        });

        // Create error summary model
        const oErrorModel = new JSONModel({
          errors: enhancedErrors,
          totalErrors: enhancedErrors.length,
          lastUpdated: new Date().toISOString()
        });

        // Load and show the error summary dialog
        if (!this._errorSummaryDialog) {
          Fragment.load({
            name: "purchaseorder.view.ErrorSummaryDialog",
            controller: {
              onClose: function () {
                this._errorSummaryDialog.close();
              }.bind(this),
              onExportErrors: function () {
                // If export manager is provided, use it to export errors
                if (exportManager && typeof exportManager.exportValidationErrors === "function") {
                  exportManager.exportValidationErrors(enhancedErrors);
                } else {
                  console.error("Export manager not available or missing exportValidationErrors function");
                  MessageToast.show("Export functionality not available");
                }
              }.bind(this)
            }
          }).then(oDialog => {
            this._errorSummaryDialog = oDialog;
            this.oController.getView().addDependent(oDialog);
            oDialog.setModel(oErrorModel, "errorModel");
            oDialog.open();
          });
        } else {
          this._errorSummaryDialog.setModel(oErrorModel, "errorModel");
          this._errorSummaryDialog.open();
        }
      };


      /**
       * Group errors by type for better display (fallback method)
       * @param {Array} errors - Validation errors to group
       * @returns {Object} Grouped errors by category
       * @private
       */
      this._groupErrorsByType = function (errors) {
        if (!errors || !errors.length) {
          return {};
        }

        return errors.reduce((groups, error) => {
          // Default error type
          let errorType = "Data Validation";

          // Create category if it doesn't exist
          if (!groups[errorType]) {
            groups[errorType] = [];
          }

          // Add error to appropriate category
          groups[errorType].push(error);

          return groups;
        }, {});
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
                }).addStyleClass(
                  "sapUiMediumMarginBegin sapUiMediumMarginEnd sapUiSmallMarginTop"
                ),
                new Title({
                  text: "Validation Rate"
                }).addStyleClass("sapUiSmallMarginTop sapUiSmallMarginBegin"),
                new FlexBox({
                  direction: "Column",
                  items: [
                    new ProgressIndicator({
                      percentValue: Math.round((successful / total) * 100),
                      displayValue:
                        Math.round((successful / total) * 100) + "% Valid",
                      state:
                        failed > 0 ? ValueState.Warning : ValueState.Success,
                      width: "100%",
                      height: "2rem"
                    })
                  ]
                }).addStyleClass(
                  "sapUiMediumMarginBegin sapUiMediumMarginEnd sapUiSmallMarginTop"
                )
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
        * Helper function to load and show fragment-based dialogs consistently.
        * Manages dialog caching (prioritizing internal cache), model setting, lifecycle, and error handling.
        */
      this.loadAndShowDialog = function (dialogId, fragmentName, oModel, modelName, oControllerOverride) {
        const sFragmentInstanceId = this.oController.getView().createId(dialogId);

        return new Promise((resolve, reject) => {
          // Check internal cache first
          let oExistingDialog = this._dialogs[dialogId];

          const openDialog = (oDialog) => {
            if (!oDialog || oDialog.bIsDestroyed) {
              const error = new Error(`Attempted to open an invalid or destroyed dialog: ${dialogId}`);
              console.error(`UIManager: ${error.message}`);
              delete this._dialogs[dialogId];
              reject(error);
              return;
            }

            if (oModel) {
              oDialog.setModel(oModel, modelName || undefined);
            }

            if (typeof oDialog.isOpen === 'function') {
              if (!oDialog.isOpen()) {
                oDialog.open();
              } else {
                console.log(`UIManager: Dialog ${dialogId} is already open.`);
              }
            } else {
              console.warn(`UIManager: Control loaded for ${dialogId} might not be a standard dialog.`);
            }

            resolve(oDialog);
          };

          // If found in cache, verify it's not destroyed before reusing
          if (oExistingDialog && !oExistingDialog.bIsDestroyed) {
            // Check if the control still exists in the core
            if (sap.ui.getCore().byId(oExistingDialog.getId())) {
              console.log(`UIManager: Reusing dialog from cache: ${dialogId} (Instance ID: ${oExistingDialog.getId()})`);
              openDialog(oExistingDialog); // Update model and open
              return; // Exit early after reusing dialog
            } else {
              console.warn(`UIManager: Dialog ${dialogId} found in cache but not in core registry. Clearing cache.`);
              delete this._dialogs[dialogId];
              oExistingDialog = null;
            }
          } else if (oExistingDialog && oExistingDialog.bIsDestroyed) {
            console.log(`UIManager: Dialog ${dialogId} found in cache but was destroyed. Clearing cache.`);
            delete this._dialogs[dialogId];
            oExistingDialog = null;
          }

          // Load fragment if not found or destroyed
          console.log(`UIManager: Loading fragment: ${fragmentName} for dialog: ${dialogId} (Instance ID: ${sFragmentInstanceId})`);

          Fragment.load({
            id: sFragmentInstanceId,
            name: fragmentName,
            controller: oControllerOverride || this.oController
          }).then((oDialog) => {
            if (!oDialog) {
              const error = new Error("Fragment.load resolved without a valid control instance.");
              reject(error);
              return;
            }

            const dialogInstance = Array.isArray(oDialog) ? oDialog[0] : oDialog;
            if (!dialogInstance || typeof dialogInstance.addDependent !== 'function') {
              const error = new Error("Loaded fragment root is not a valid control instance.");
              reject(error);
              return;
            }

            this._dialogs[dialogId] = dialogInstance; // Cache the instance
            this.oController.getView().addDependent(dialogInstance);
            console.log(`UIManager: Fragment loaded and added as dependent: ${dialogId}`);
            openDialog(dialogInstance);
          }).catch((error) => {
            const msg = `Could not load dialog fragment: ${fragmentName}`;
            console.error(`UIManager: ${msg}`, error);
            this.errorHandler.showError(msg, error.message || error);
            delete this._dialogs[dialogId]; // Clean cache on error
            reject(error);
          });
        });
      }


      /**
       * Show help dialog with application instructions
       * Uses a Fragment to display help information and reuses instance
       * @param {object} controllerContext - Controller context for event handling
       * @public
       */
      /**
   * Show help dialog with application instructions
   * Uses a Fragment to display help information and reuses instance
   * @param {object} controllerContext - Controller context for event handling
   * @public
   */
      this.showHelpDialog = function (controllerContext) {
        console.log("UIManager: Showing help dialog...");

        // Store controller context for event handling
        this._helpControllerContext = controllerContext &&
          typeof controllerContext.onDownloadTemplate === 'function' ?
          controllerContext : null;

        if (!this._helpControllerContext) {
          console.warn("UIManager: Help dialog context for actions missing.");
        }

        const dialogId = "helpDialog";
        const fragmentName = "purchaseorder.view.HelpDialog"; // Adjust namespace to match your application

        // Check if dialog already exists
        if (this._helpDialog) {
          this._helpDialog.open();
          return;
        }

        // Load the fragment
        sap.ui.core.Fragment.load({
          name: fragmentName,
          controller: {
            // Close dialog without destroying it
            onHelpDialogClose: () => {
              if (this._helpDialog) {
                this._helpDialog.close();
              }
              this._helpControllerContext = null;
            },

            // Download template action
            onDownloadTemplateLinkPress: () => {
              if (this._helpControllerContext) {
                this._helpControllerContext.onDownloadTemplate();
              } else {
                // Show error if context is not available
                sap.m.MessageToast.show("Cannot download template: Application context not available.");
              }
            }
          }
        }).then((oDialog) => {
          // Store dialog reference
          this._helpDialog = oDialog;

          // Add dialog to the UI
          if (controllerContext && controllerContext.getView) {
            controllerContext.getView().addDependent(this._helpDialog);
          } else if (sap.ui.getCore().byId("__xmlview0")) {
            // Fallback to first view if controller context is not available
            sap.ui.getCore().byId("__xmlview0").addDependent(this._helpDialog);
          }

          // Open the dialog
          this._helpDialog.open();
        }).catch((error) => {
          console.error("Error loading help dialog fragment:", error);
          // Fallback to alert if fragment cannot be loaded
          sap.m.MessageBox.error(
            "Could not load help dialog. Please contact your system administrator.",
            { title: "Error" }
          );
        });
      };
      /**
       * Show success dialog with processing results
       * @param {object} result - Processing result object
       */
      this.showProcessingResultDialog = function (result) {
        if (!result) {
          return;
        }

        const successCount = result.successCount || 0;
        const failureCount = result.failureCount || 0;
        const totalCount = result.totalCount || successCount + failureCount;

        if (failureCount === 0) {
          // Show success dialog
          sap.m.MessageBox.success(
            `All ${successCount} entries were processed successfully.`,
            {
              title: "Processing Complete"
            }
          );
        } else if (successCount === 0) {
          // Show error dialog
          sap.m.MessageBox.error(
            `Processing failed for all ${failureCount} entries.`,
            {
              title: "Processing Failed"
            }
          );
        } else {
          // Show partial success dialog
          const dialog = new Dialog({
            title: "Processing Results",
            type: coreLibrary.DialogType.Message,
            state: ValueState.Warning,
            content: [
              new VBox({
                items: [
                  new MessageStrip({
                    text: `${successCount} entries were processed successfully, ${failureCount} entries failed.`,
                    type: "Warning",
                    showIcon: true
                  }).addStyleClass("sapUiSmallMarginBottom"),
                  new ProgressIndicator({
                    percentValue: Math.round((successCount / totalCount) * 100),
                    displayValue: `${successCount} of ${totalCount} (${Math.round((successCount / totalCount) * 100)}%)`,
                    state: ValueState.Warning,
                    width: "100%"
                  })
                ]
              }).addStyleClass("sapUiSmallMarginTop sapUiSmallMarginBottom")
            ],
            beginButton: new Button({
              text: "Show Details",
              press: function () {
                dialog.close();
                // Show detailed error dialog if we have error records
                if (result.errorRecords && result.errorRecords.length > 0) {
                  this.showErrorDetailsDialog(result.errorRecords);
                }
              }.bind(this)
            }),
            endButton: new Button({
              text: "Close",
              press: function () {
                dialog.close();
              }
            }),
            afterClose: function () {
              dialog.destroy();
            }
          });

          dialog.open();
        }
      };

      /**
       * Show error details dialog
       * @param {array} errorRecords - Array of error records
       */
      this.showErrorDetailsDialog = function (errorRecords) {
        if (!errorRecords || !errorRecords.length) {
          return;
        }

        // Format error records for display
        const formattedErrors = errorRecords.map(record => {
          const entry = record.entry || record;
          const error = record.error || "Unknown error";
          const errorCode = record.errorCode || "";
          const details = record.details || [];

          return {
            sequence: entry.Sequence || "Unknown",
            error: error,
            code: errorCode,
            details: details.map(d => d.message || d).join("; ")
          };
        });

        // Create dialog to display error details
        const errorDialog = new Dialog({
          title: "Error Details",
          contentWidth: "600px",
          content: [
            new List({
              items: formattedErrors.map(error =>
                new StandardListItem({
                  title: `Sequence: ${error.sequence}`,
                  description: error.error,
                  info: error.code,
                  infoState: ValueState.Error,
                  type: "Active",
                  press: function () {
                    // Show detailed information for this error
                    const detailDialog = new Dialog({
                      title: "Error Detail",
                      contentWidth: "500px",
                      content: [
                        new VBox({
                          items: [
                            new Text({ text: `Sequence: ${error.sequence}` }),
                            new Text({ text: `Error: ${error.error}` }),
                            new Text({ text: `Code: ${error.code}` }),
                            new Text({ text: `Details: ${error.details}` })
                          ]
                        }).addStyleClass("sapUiSmallMarginTop sapUiSmallMarginBottom")
                      ],
                      beginButton: new Button({
                        text: "Close",
                        press: function () {
                          detailDialog.close();
                        }
                      }),
                      afterClose: function () {
                        detailDialog.destroy();
                      }
                    });

                    detailDialog.open();
                  }
                })
              )
            })
          ],
          beginButton: new Button({
            text: "Close",
            press: function () {
              errorDialog.close();
            }
          }),
          afterClose: function () {
            errorDialog.destroy();
          }
        });

        errorDialog.open();
      };
    };
  }
);