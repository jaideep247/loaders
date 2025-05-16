sap.ui.define([
  "sap/ui/core/mvc/Controller",
  "sap/m/MessageToast",
  "sap/ui/model/json/JSONModel",
  "sap/ui/model/Filter",
  "sap/ui/model/FilterOperator"
], function (
  Controller,
  MessageToast,
  JSONModel,
  Filter,
  FilterOperator
) {
  "use strict";
  return Controller.extend("vendortovendor.controller.BaseFilterController", {
    /**
     * Initializes filter model with vendor-specific configuration
     */
    _initVendorFilterModel: function () {
      const filterModel = {
        status: "All",
        sheet: "All",
        indicator: "All",
        vendorCode: "",
        referenceKey: "",
        businessPlace: "",
        searchQuery: ""
      };

      const oAdvancedFilterModel = new JSONModel(filterModel);
      this.getView().setModel(oAdvancedFilterModel, "advancedFilter");
      return oAdvancedFilterModel;
    },

    /**
     * Applies comprehensive filters to the journal entries table
     */
    _applyVendorFilters: function () {
      const oTable = this.getView().byId("journalEntriesTable");
      const oFilterModel = this.getView().getModel("advancedFilter");
      const filterData = oFilterModel.getData();
      const aFilters = [];

      // Status filter
      if (filterData.status && filterData.status !== "All") {
        aFilters.push(new Filter("status", FilterOperator.EQ, filterData.status));
      }

      // Sheet filter
      if (filterData.sheet && filterData.sheet !== "All") {
        aFilters.push(new Filter("Sheet", FilterOperator.EQ, filterData.sheet));
      }

      // Indicator filter
      if (filterData.indicator && filterData.indicator !== "All") {
        aFilters.push(new Filter("Indicator", FilterOperator.EQ, filterData.indicator));
      }

      // Vendor code filter
      if (filterData.vendorCode) {
        aFilters.push(new Filter("Vendor Code", FilterOperator.Contains, filterData.vendorCode));
      }

      // Reference key filter
      if (filterData.referenceKey) {
        aFilters.push(new Filter("Reference Key 1", FilterOperator.Contains, filterData.referenceKey));
      }

      // Business place filter
      if (filterData.businessPlace) {
        aFilters.push(new Filter("Business Place", FilterOperator.Contains, filterData.businessPlace));
      }

      // Reference key filter
      if (filterData.referenceKey) {
        aFilters.push(new Filter("Reference Key 1", FilterOperator.Contains, filterData.referenceKey));
      }
      // Search filter
      if (filterData.searchQuery) {
        const searchFilters = [
          new Filter("Sequence ID", FilterOperator.Contains, filterData.searchQuery),
          new Filter("Accounting Document Type", FilterOperator.Contains, filterData.searchQuery),
          new Filter("Vendor Code", FilterOperator.Contains, filterData.searchQuery),
          new Filter("status", FilterOperator.Contains, filterData.searchQuery)
        ];
        aFilters.push(new Filter({ filters: searchFilters, and: false }));
      }

      // Apply filters
      oTable.getBinding("items").filter(aFilters);
      this._updateFilteredCount(oTable);
    },

    /**
     * Updates filtered count in the model
     */
    _updateFilteredCount: function (oTable) {
      const oBinding = oTable.getBinding("items");
      const filteredCount = oBinding.getLength();
      const journalEntriesModel = oTable.getModel("journalEntries");
      journalEntriesModel.setProperty("/filteredCount", filteredCount);
    },

    /**
     * Resets all filters to default values
     */
    onResetFilters: function () {
      const oFilterModel = this.getView().getModel("advancedFilter");
      oFilterModel.setData({
        status: "All",
        sheet: "All",
        indicator: "All",
        vendorCode: "",
        referenceKey: "",
        businessPlace: "",
        searchQuery: ""
      });

      // Reset UI controls
      this.byId("statusFilterComboBox").setSelectedKey("All");
      this.byId("sheetFilterComboBox").setSelectedKey("All");
      this.byId("indicatorFilterComboBox").setSelectedKey("All");
      this.byId("vendorCodeFilter").setValue("");
      this.byId("referenceKeyFilter").setValue("");
      this.byId("businessPlaceFilter").setValue("");
      this.byId("entriesSearchField").setValue("");
      this.byId("tableViewSelector").setSelectedKey("All");

      // Reset table filters
      this.byId("journalEntriesTable").getBinding("items").filter([]);
      this._updateFilteredCount(this.byId("journalEntriesTable"));

      MessageToast.show("All filters have been reset");
    }
  });
});