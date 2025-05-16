sap.ui.define([
  "sap/m/Dialog",
  "sap/m/Button",
  "sap/m/MessageBox",
  "./UIManagerTemplates" // Contains pre-configured dialog templates
], function(Dialog, Button, MessageBox, Templates) {
  "use strict";

  return {
      createDialog: function(config) {
          const template = Templates[config.type];
          if (!template) {
              MessageBox.error("Invalid dialog type: " + config.type);
              return null;
          }

          const dialog = new Dialog({
              title: template.title(config.data),
              content: template.content(config.data),
              buttons: this._createButtons(config.buttons || template.defaultButtons),
              afterClose: function() {
                  dialog.destroy();
              }
          });

          return {
              open: function() { dialog.open(); },
              close: function() { dialog.close(); },
              addStyleClass: function(style) { dialog.addStyleClass(style); }
          };
      },

      _createButtons: function(buttonConfigs) {
          return buttonConfigs.map(config => new Button({
              text: config.text,
              type: config.type,
              press: config.handler
          }));
      }
  };
});