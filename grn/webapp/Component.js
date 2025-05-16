sap.ui.define([
    "sap/ui/core/UIComponent",
    "grn/model/models"
], (UIComponent, models) => {
    "use strict";
    function loadScript(url) {
        return new Promise(function (resolve, reject) {
            jQuery.sap.includeScript(
                url,
                "xlsx",
                function () {
                    resolve();
                },
                function () {
                    reject(new Error("Failed to load script: " + url));
                }
            );
        });
    }
    return UIComponent.extend("grn.Component", {
        metadata: {
            manifest: "json",
            interfaces: [
                "sap.ui.core.IAsyncContentCreation"
            ]
        },

        init() {
            // call the base component's init function
            UIComponent.prototype.init.apply(this, arguments);

            var that = this;
            loadScript(sap.ui.require.toUrl("utils/xlsx.full.min.js"))
                .then(function () {
                    console.log("XLSX library loaded successfully.");
                    // Set the device model
                    that.setModel(models.createDeviceModel(), "device");
                    // Enable routing
                    that.getRouter().initialize();
                })
                .catch(function (error) {
                    console.error(error.message);
                    sap.ui
                        .getCore()
                        .byId("messageBox")
                        .setText(
                            "Error: XLSX library is required for this functionality."
                        );
                });
            loadScript(sap.ui.require.toUrl("utils/pdfmake.min.js"))
                .then(function () {
                    console.log("PDF library loaded successfully.");
                    // Set the device model
                    that.setModel(models.createDeviceModel(), "device");
                    // Enable routing
                    that.getRouter().initialize();
                })
                .catch(function (error) {
                    console.error(error.message);
                    sap.ui
                        .getCore()
                        .byId("messageBox")
                        .setText(
                            "Error: PDF library is required for this functionality."
                        );
                });
            loadScript(sap.ui.require.toUrl("utils/vfs_fonts.js"))
                .then(function () {
                    console.log("Fonts library loaded successfully.");
                    // Set the device model
                    that.setModel(models.createDeviceModel(), "device");
                    // Enable routing
                    that.getRouter().initialize();
                })
                .catch(function (error) {
                    console.error(error.message);
                    sap.ui
                        .getCore()
                        .byId("messageBox")
                        .setText(
                            "Error: Fonts library is required for this functionality."
                        );
                });
            // enable routing
            this.getRouter().initialize();
        }
    });
});