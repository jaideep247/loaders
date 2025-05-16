sap.ui.define([
    "sap/ui/core/UIComponent",
    "wbsupload/model/models"
], function (UIComponent, models) {
    "use strict";

    function loadScript(url, id) {
        return new Promise(function (resolve, reject) {
            console.log("Loading script:", url);
            jQuery.sap.includeScript(url, id, function () {
                console.log("Successfully loaded:", id);
                resolve();
            }, function () {
                reject(new Error("Failed to load script: " + url));
            });
        });
    }

    function loadExcelJS() {
        return new Promise(function (resolve, reject) {
            if (window.ExcelJS) {
                console.log("ExcelJS library already available.");
                resolve();
            } else {
                loadScript(sap.ui.require.toUrl("utils/exceljs.min.js"), "exceljs")
                    .then(resolve)
                    .catch(reject);
            }
        });
    }
    return UIComponent.extend("wbsupload.Component", {
        metadata: {
            manifest: "json",
            interfaces: ["sap.ui.core.IAsyncContentCreation"]
        },

        init: function () {
            // Call the parent init first
            UIComponent.prototype.init.apply(this, arguments);

            // Set the device model and initialize routing
            this.setModel(models.createDeviceModel(), "device");
            this.getRouter().initialize();

            // Load scripts asynchronously in a separate execution context
            // to avoid returning a Promise from init()
            (async function () {
                try {
                    await loadScript(sap.ui.require.toUrl("utils/xlsx.full.min.js"), "xlsx");
                    console.log("XLSX library loaded successfully.");

                    await loadExcelJS();
                    console.log("ExcelJS library loaded successfully.");
                } catch (error) {
                    console.error(error.message);
                    let msgBox = sap.ui.getCore().byId("messageBox");
                    if (msgBox) msgBox.setText("Error: " + error.message);
                }
            })();
            
            // No return statement or operations after the async IIFE
        }
    });
});