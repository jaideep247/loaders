sap.ui.define(
    [
      "sap/ui/core/Fragment",
      "sap/m/MessageBox",
      "sap/m/MessageToast",
      "sap/ui/model/json/JSONModel"
    ],
    function (Fragment, MessageBox, MessageToast, JSONModel) {
      "use strict";
  
      return {
        /**
         * Initialize dialog manager
         * @param {Object} controller - The controller instance
         */
        init: function (controller) {
          controller._dialogs = {};
          controller._dialogModels = {};
        },
  
        /**
         * Load a dialog fragment
         * @param {Object} controller - The controller instance
         * @param {string} fragmentName - The fragment name to load
         * @param {string} dialogId - The ID to store the dialog under
         * @returns {Promise} Promise that resolves with the loaded dialog
         */
        loadDialog: function (controller, fragmentName, dialogId) {
          return new Promise((resolve, reject) => {
            if (controller._dialogs[dialogId]) {
              resolve(controller._dialogs[dialogId]);
              return;
            }
  
            Fragment.load({
              name: fragmentName,
              controller: controller
            })
              .then(function (oDialog) {
                controller._dialogs[dialogId] = oDialog;
                controller.getView().addDependent(oDialog);
                resolve(oDialog);
              })
              .catch(function (error) {
                console.error(`Error loading dialog ${dialogId}:`, error);
                reject(error);
              });
          });
        },
  
        /**
         * Open a dialog
         * @param {Object} controller - The controller instance
         * @param {string} dialogId - The ID of the dialog to open
         * @param {Object} modelData - Optional model data to set before opening
         */
        openDialog: function (controller, dialogId, modelData) {
          const dialog = controller._dialogs[dialogId];
          if (!dialog) {
            console.error(`Dialog ${dialogId} not found`);
            return;
          }
  
          if (modelData) {
            const model = new JSONModel(modelData);
            controller._dialogModels[dialogId] = model;
            dialog.setModel(model);
          }
  
          dialog.open();
        },
  
        /**
         * Close a dialog
         * @param {Object} controller - The controller instance
         * @param {string} dialogId - The ID of the dialog to close
         */
        closeDialog: function (controller, dialogId) {
          const dialog = controller._dialogs[dialogId];
          if (dialog) {
            dialog.close();
          }
        },
  
        /**
         * Close all dialogs
         * @param {Object} controller - The controller instance
         */
        closeAllDialogs: function (controller) {
          Object.values(controller._dialogs).forEach((dialog) => {
            if (dialog.isOpen()) {
              dialog.close();
            }
          });
        },
  
        /**
         * Show a message box
         * @param {Object} controller - The controller instance
         * @param {string} type - The type of message (error, warning, success, info)
         * @param {string} message - The message to display
         */
        showMessage: function (controller, type, message) {
          switch (type.toLowerCase()) {
            case "error":
              MessageBox.error(message);
              break;
            case "warning":
              MessageBox.warning(message);
              break;
            case "success":
              MessageToast.show(message);
              break;
            case "info":
              MessageBox.information(message);
              break;
            default:
              console.warn(`Unknown message type: ${type}`);
          }
        },
  
        /**
         * Show a confirmation dialog
         * @param {Object} controller - The controller instance
         * @param {string} message - The confirmation message
         * @returns {Promise} Promise that resolves with the user's choice
         */
        showConfirmation: function (controller, message) {
          return new Promise((resolve) => {
            MessageBox.confirm(message, {
              onClose: function (action) {
                resolve(action === MessageBox.Action.OK);
              }
            });
          });
        }
      };
    }
  );
  