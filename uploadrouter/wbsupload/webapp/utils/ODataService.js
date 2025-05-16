// File: utils/ODataService.js
sap.ui.define([
    "sap/ui/model/odata/v2/ODataModel"
], function (ODataModel) {
    "use strict";

    return {
        createRecord: function (url, payload, headers, successCallback, errorCallback) {
            var oModel = new ODataModel(url, {
                json: true,
                useBatch: false,
                headers: headers
            });

            oModel.create("/A_EnterpriseProjectElement", payload, {
                success: successCallback,
                error: errorCallback
            });
        }
    };
});