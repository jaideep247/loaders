sap.ui.define([
    "sap/ui/core/UIComponent",
    "assetmastercreate/model/models",
    "sap/m/MessageBox"
], (UIComponent, models, MessageBox) => {
    "use strict";

    function loadScript(url) {
        return new Promise(function (resolve, reject) {
            jQuery.sap.includeScript(
                url,
                "script",  // Changed from "xlsx" to a generic id
                function () {
                    resolve();
                },
                function () {
                    reject(new Error("Failed to load script: " + url));
                }
            );
        });
    }

    return UIComponent.extend("assetmastercreate.Component", {
        metadata: {
            manifest: "json",
            interfaces: [
                "sap.ui.core.IAsyncContentCreation"
            ]
        },

        init() {
            // Call the init function of the parent
            UIComponent.prototype.init.apply(this, arguments);

            // Set the device model first
            this.setModel(models.createDeviceModel(), "device");

            // Create a promise to track when libraries are loaded
            let librariesLoaded = Promise.resolve();

            try {
                // Load XLSX library
                librariesLoaded = librariesLoaded.then(() =>
                    loadScript(sap.ui.require.toUrl("utils/xlsx.full.min.js"))
                        .then(() => console.log("XLSX library loaded successfully."))
                        .catch(error => {
                            console.error(error.message);
                            MessageBox.error("Error: XLSX library is required for this functionality.");
                        })
                );

                // Load PDF library
                librariesLoaded = librariesLoaded.then(() =>
                    loadScript(sap.ui.require.toUrl("utils/pdfmake.min.js"))
                        .then(() => console.log("PDF library loaded successfully."))
                        .catch(error => {
                            console.error(error.message);
                            MessageBox.error("Error: PDF library is required for this functionality.");
                        })
                );

                // Load Fonts library
                librariesLoaded = librariesLoaded.then(() =>
                    loadScript(sap.ui.require.toUrl("utils/vfs_fonts.js"))
                        .then(() => console.log("Fonts library loaded successfully."))
                        .catch(error => {
                            console.error(error.message);
                            MessageBox.error("Error: Fonts library is required for this functionality.");
                        })
                );

                // Initialize router after libraries are loaded
                librariesLoaded.then(() => {
                    // Enable routing
                    this.getRouter().initialize();
                });
            } catch (error) {
                console.error("Error initializing component:", error);
                MessageBox.error("An error occurred while initializing the application.");
            }
        }
    });
});