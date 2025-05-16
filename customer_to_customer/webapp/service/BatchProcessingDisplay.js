sap.ui.define([
  "sap/ui/core/Control",
  "sap/m/VBox",
  "sap/m/HBox",
  "sap/m/ProgressIndicator",
  "sap/m/Text",
  "sap/m/Label",
  "sap/ui/core/library",
  "sap/m/MessageStrip"
], function (Control, VBox, HBox, ProgressIndicator, Text, Label, coreLibrary, MessageStrip) {
  "use strict";

  const ValueState = coreLibrary.ValueState;

  /**
   * BatchProcessingDisplay
   * A custom control to display batch processing information
   */
  return Control.extend("customertocustomer.control.BatchProcessingDisplay", {
    metadata: {
      properties: {
        visible: { type: "boolean", defaultValue: false },
        totalBatches: { type: "int", defaultValue: 0 },
        currentBatch: { type: "int", defaultValue: 0 },
        processedBatches: { type: "int", defaultValue: 0 },
        totalEntries: { type: "int", defaultValue: 0 },
        processedEntries: { type: "int", defaultValue: 0 },
        estimatedTimeRemaining: { type: "string", defaultValue: "Calculating..." },
        status: { type: "string", defaultValue: "Ready" },
        error: { type: "string", defaultValue: null }
      },
      aggregations: {
        _mainContent: { type: "sap.ui.core.Control", multiple: false, visibility: "hidden" }
      },
      events: {
        cancel: {}
      }
    },

    init: function () {
      const that = this;

      // Create the control structure
      const mainContent = new VBox({
        width: "100%",
        items: [
          // Status information
          new HBox({
            justifyContent: "SpaceBetween",
            alignItems: "Center",
            items: [
              new Label({ text: "Status:" }),
              new Text({
                text: {
                  path: "status",
                  formatter: function (status) {
                    return status || "Ready";
                  }
                }
              })
            ]
          }).addStyleClass("sapUiTinyMarginBottom"),

          // Error message if present
          new MessageStrip({
            text: {
              path: "error"
            },
            type: "Error",
            showIcon: true,
            visible: {
              path: "error",
              formatter: function (error) {
                return error !== null && error !== "";
              }
            }
          }).addStyleClass("sapUiTinyMarginBottom"),

          // Progress information
          new HBox({
            justifyContent: "SpaceBetween",
            alignItems: "Center",
            items: [
              new Text({ text: "Batch progress:" }),
              new Text({
                text: {
                  parts: ["currentBatch", "totalBatches", "processedEntries", "totalEntries"],
                  formatter: function (currentBatch, totalBatches, processedEntries, totalEntries) {
                    return (currentBatch || 0) + " of " + (totalBatches || 0) + " batches (" +
                      (processedEntries || 0) + " of " + (totalEntries || 0) + " entries)";
                  }
                }
              })
            ]
          }).addStyleClass("sapUiTinyMarginBottom"),

          // Progress bar
          new ProgressIndicator({
            percentValue: {
              parts: ["currentBatch", "totalBatches"],
              formatter: function (currentBatch, totalBatches) {
                return Math.round(((currentBatch || 0) / Math.max((totalBatches || 1), 1)) * 100);
              }
            },
            displayValue: {
              parts: ["currentBatch", "totalBatches"],
              formatter: function (currentBatch, totalBatches) {
                return Math.round(((currentBatch || 0) / Math.max((totalBatches || 1), 1)) * 100) + "%";
              }
            },
            state: ValueState.Information,
            width: "100%",
            height: "20px"
          }).addStyleClass("sapUiTinyMarginBottom"),

          // Estimated time remaining
          new HBox({
            justifyContent: "SpaceBetween",
            alignItems: "Center",
            visible: {
              parts: ["processedBatches", "currentBatch", "totalBatches"],
              formatter: function (processedBatches, currentBatch, totalBatches) {
                return (processedBatches > 0) && (currentBatch < totalBatches);
              }
            },
            items: [
              new Text({ text: "Estimated time remaining:" }),
              new Text({
                text: {
                  path: "estimatedTimeRemaining"
                }
              })
            ]
          }).addStyleClass("sapUiTinyMarginBottom")
        ]
      }).addStyleClass("sapUiSmallMargin");

      // Create a model for this control
      const oModel = new sap.ui.model.json.JSONModel(this.getMetadata().getProperties());
      this.setModel(oModel);

      // Bind the control elements to the model
      mainContent.bindObject("/");

      this.setAggregation("_mainContent", mainContent);
    },

    // Override the property setters to update the model
    setVisible: function (bValue) {
      this.setProperty("visible", bValue, true); // true = suppress rerendering
      this.getModel().setProperty("/visible", bValue);
      return this;
    },

    setTotalBatches: function (iValue) {
      this.setProperty("totalBatches", iValue, true);
      this.getModel().setProperty("/totalBatches", iValue);
      return this;
    },

    setCurrentBatch: function (iValue) {
      this.setProperty("currentBatch", iValue, true);
      this.getModel().setProperty("/currentBatch", iValue);
      return this;
    },

    setProcessedBatches: function (iValue) {
      this.setProperty("processedBatches", iValue, true);
      this.getModel().setProperty("/processedBatches", iValue);
      return this;
    },

    setTotalEntries: function (iValue) {
      this.setProperty("totalEntries", iValue, true);
      this.getModel().setProperty("/totalEntries", iValue);
      return this;
    },

    setProcessedEntries: function (iValue) {
      this.setProperty("processedEntries", iValue, true);
      this.getModel().setProperty("/processedEntries", iValue);
      return this;
    },

    setEstimatedTimeRemaining: function (sValue) {
      this.setProperty("estimatedTimeRemaining", sValue, true);
      this.getModel().setProperty("/estimatedTimeRemaining", sValue);
      return this;
    },

    setStatus: function (sValue) {
      this.setProperty("status", sValue, true);
      this.getModel().setProperty("/status", sValue);
      return this;
    },

    setError: function (sValue) {
      this.setProperty("error", sValue, true);
      this.getModel().setProperty("/error", sValue);
      return this;
    },
    // Add to your JournalEntryService's error handling code:

    // Extract transaction ID from SOAP response if available
    _extractTransactionIdFromSoapResponse: function (responseText) {
      if (!responseText) return null;

      try {
        // Check for transaction ID in a SOAP fault
        const transactionIdMatch = responseText.match(/Transaction ID\s*([A-Z0-9]+)/i);
        if (transactionIdMatch && transactionIdMatch.length > 1) {
          return transactionIdMatch[1];
        }
      } catch (error) {
        console.error("Error extracting transaction ID:", error);
      }

      return null;
    },

    // Update your SOAP error handling to extract and display transaction IDs:
    // Add in the error callback of your AJAX call
    error: function (xhr, status, error) {
      let errorMessage = error;
      let transactionId = null;

      // Try to extract transaction ID from SOAP response
      if (xhr.responseText) {
        transactionId = this._extractTransactionIdFromSoapResponse(xhr.responseText);

        // Try to extract SOAP fault message for better error display
        const faultStringMatch = xhr.responseText.match(/<faultstring[^>]*>(.*?)<\/faultstring>/s);
        if (faultStringMatch && faultStringMatch.length > 1) {
          errorMessage = faultStringMatch[1].trim();
        }
      }

      // Update batch processing display with error and transaction ID
      if (this._updateProcessDisplay) {
        this._updateProcessDisplay({
          status: "Failed with errors",
          error: errorMessage,
          transactionId: transactionId
        });
      }

      // Include transaction ID in the error object for better error handling
      reject({
        status: "ERROR",
        message: errorMessage,
        details: xhr.responseText,
        statusCode: xhr.status,
        transactionId: transactionId
      });
    },
    onCancelPress: function () {
      // Fire cancel event to allow parent to handle cancellation
      this.fireCancel();
    },

    renderer: function (oRm, oControl) {
      oRm.openStart("div", oControl);
      oRm.class("batchProcessingDisplay");

      if (!oControl.getVisible()) {
        oRm.style("display", "none");
      }

      oRm.openEnd();

      // Render the main content
      oRm.renderControl(oControl.getAggregation("_mainContent"));

      oRm.close("div");
    }
  });
});