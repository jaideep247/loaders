sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap/ui/model/Filter",
    "sap/ui/model/FilterOperator",
    "sap/ui/model/json/JSONModel",
    "sap/m/MessageToast"
], function (Controller, Filter, FilterOperator, JSONModel, MessageToast) {
    "use strict";

    return Controller.extend("assetmastercreate.controller.BaseFilterController", {

        /**
         * Initialize filter model with all required fields
         */
        onInitFilters: function () {
            if (!this.getView().getModel("filterModel")) {
                const oFilterModel = new JSONModel({
                    // Basic Filters
                    companyCode: "",
                    assetClass: "",
                    description: "",

                    // Business Critical Filters
                    wbsElement: "",
                    plant: "",
                    costCenter: "",
                    serialNumber: "",
                    depreciationKey: "",

                    // Status Filters
                    status: "all",

                    // Date Range Filters
                    acquisitionDateFrom: null,
                    acquisitionDateTo: null,

                    // Additional Filters
                    assetBlock: "",
                    capitalizationYear: ""
                });
                this.getView().setModel(oFilterModel, "filterModel");
            }

            // Initialize default date range (current year)
            this._initializeDefaultDateRange();
        },

        /**
         * Sets default date range to current year
         */
        _initializeDefaultDateRange: function () {
            const oFilterModel = this.getView().getModel("filterModel");
            if (!oFilterModel.getProperty("/acquisitionDateFrom")) {
                const today = new Date();
                const firstDayOfYear = new Date(today.getFullYear(), 0, 1);
                oFilterModel.setProperty("/acquisitionDateFrom", firstDayOfYear);
                oFilterModel.setProperty("/acquisitionDateTo", today);
            }
        },

        /**
         * Apply all filters to the asset table
         */
        applyFilters: function () {
            const oTable = this.byId("assetTable");
            const oBinding = oTable.getBinding("items");
            const oFilterModel = this.getView().getModel("filterModel");

            if (!oBinding) {
                console.error("Cannot find table binding for assetTable");
                return;
            }

            if (!oFilterModel) {
                console.error("Cannot find filter model");
                return;
            }

            // Create an array of filters
            const aFilters = [];

            // Company Code filter
            if (oFilterModel.getProperty("/companyCode")) {
                aFilters.push(new sap.ui.model.Filter("CompanyCode", sap.ui.model.FilterOperator.Contains,
                    oFilterModel.getProperty("/companyCode")));
            }

            // Asset Class filter
            if (oFilterModel.getProperty("/assetClass")) {
                aFilters.push(new sap.ui.model.Filter("AssetClass", sap.ui.model.FilterOperator.Contains,
                    oFilterModel.getProperty("/assetClass")));
            }

            // Description filter
            if (oFilterModel.getProperty("/description")) {
                aFilters.push(new sap.ui.model.Filter("FixedAssetDescription", sap.ui.model.FilterOperator.Contains,
                    oFilterModel.getProperty("/description")));
            }

            // WBS Element filter
            if (oFilterModel.getProperty("/wbsElement")) {
                aFilters.push(new sap.ui.model.Filter("YY1_WBS_ELEMENT", sap.ui.model.FilterOperator.Contains,
                    oFilterModel.getProperty("/wbsElement")));
            }

            // Status filter
            const status = oFilterModel.getProperty("/status");
            if (status && status !== "all") {
                // Use a function filter for case-insensitive comparison
                aFilters.push(new Filter({
                    path: "Status",
                    test: function (oValue) {
                        if (!oValue) return false;
                        return oValue.toLowerCase() === status.toLowerCase();
                    }
                }));
            }
            // Apply filters
            if (aFilters.length > 0) {
                const oFilter = new sap.ui.model.Filter({
                    filters: aFilters,
                    and: true
                });
                oBinding.filter(oFilter);
            } else {
                oBinding.filter([]);
            }

            // Update filtered count
            const filteredCount = oBinding.getLength();
            const totalCount = this.getView().getModel("assetMasterEntries").getProperty("/entries").length;

            // Update the filteredCount property
            this.getView().getModel("assetMasterEntries").setProperty("/filteredCount", filteredCount);

            // Show message
            sap.m.MessageToast.show(`Showing ${filteredCount} of ${totalCount} entries`);
        },


        /**
         * Updates the filtered count in the model
         */
        _updateFilteredCount: function (oBinding) {
            const iFilteredCount = oBinding.getLength();
            const oAssetModel = this.getView().getModel("assetMasterEntries");

            // Check if the model exists
            if (!oAssetModel) {
                console.error("assetMasterEntries model not found");
                return;
            }

            // Set the filtered count
            oAssetModel.setProperty("/filteredCount", iFilteredCount);

            // Show message with filter results
            MessageToast.show(`Showing ${iFilteredCount} of ${oAssetModel.getProperty("/entries").length} entries`);
        },
        /**
         * Handles filter change events
         */
        onFilterChange: function () {
            this.applyFilters();
        },

        /**
         * Handles status filter change
         */
        /**
         * Handles status filter change
         */
        onStatusFilterChange: function (oEvent) {
            const selectedItem = oEvent.getParameter("selectedItem");
            if (selectedItem) {
                const selectedKey = selectedItem.getKey();
                console.log("BaseFilterController: Status filter changed to", selectedKey);

                // Update status in filter model
                this.getView().getModel("filterModel").setProperty("/status", selectedKey);

                // Apply filters
                this.applyFilters();
            }
        },
        /**
         * Resets all filters to their default values
         */
        onResetFilters: function () {
            const oFilterModel = this.getView().getModel("filterModel");

            // Reset all filter values
            oFilterModel.setData({
                companyCode: "",
                assetClass: "",
                description: "",
                wbsElement: "",
                plant: "",
                costCenter: "",
                serialNumber: "",
                depreciationKey: "",
                assetBlock: "",
                status: "all"
            });

            // Reset date range to current year
            this._initializeDefaultDateRange();

            // Clear all filters from table binding
            const oTable = this.getView().byId("assetTable");
            const oBinding = oTable.getBinding("items");

            if (oBinding) {
                oBinding.filter([]);
                this._updateFilteredCount(oBinding);
            }

            // Show confirmation message
            MessageToast.show("All filters have been reset");
        }
    });
});