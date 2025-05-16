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
  return Controller.extend("customervendor.controller.BaseFilterController", {
    /**
     * Initializes filter model with customer-vendor configuration
     */
    _initCustomerVendorFilterModel: function () {
      const filterModel = {
        status: "All",
        sheet: "All",
        indicator: "All",
        vendorCode: "",
        customerCode: "",
        referenceKey: "",
        businessPlace: "",
        companyCode: "",
        searchQuery: ""
      };

      const oAdvancedFilterModel = new JSONModel(filterModel);
      this.getView().setModel(oAdvancedFilterModel, "advancedFilter");
      return oAdvancedFilterModel;
    },

    /**
     * Applies comprehensive filters to the journal entries table
     */
    _applyCustomerVendorFilters: function () {
      try {
        const oTable = this.getView().byId("journalEntriesTable");
        if (!oTable) {
          console.error("Journal entries table not found");
          return;
        }

        const oFilterModel = this.getView().getModel("advancedFilter");
        const filterData = oFilterModel.getData();
        const aFilters = [];

        // Helper function to ensure string values
        const ensureString = (value) => {
          if (value === null || value === undefined) return "";
          return value.toString();
        };

        // Status filter
        if (filterData.status && filterData.status !== "All") {
          aFilters.push(new Filter("status", FilterOperator.EQ, ensureString(filterData.status)));
        }

        // Sheet filter
        if (filterData.sheet && filterData.sheet !== "All") {
          aFilters.push(new Filter("Sheet", FilterOperator.EQ, ensureString(filterData.sheet)));
        }

        // Indicator filter
        if (filterData.indicator && filterData.indicator !== "All") {
          aFilters.push(new Filter("Indicator", FilterOperator.EQ, ensureString(filterData.indicator)));
        }

        // Vendor code filter
        if (filterData.vendorCode) {
          aFilters.push(new Filter("Vendor Code", FilterOperator.Contains, ensureString(filterData.vendorCode)));
        }

        // Customer code filter
        if (filterData.customerCode) {
          aFilters.push(new Filter("Customer Code", FilterOperator.Contains, ensureString(filterData.customerCode)));
        }

        // Reference key filter
        if (filterData.referenceKey) {
          aFilters.push(new Filter("Reference Key 1", FilterOperator.Contains, ensureString(filterData.referenceKey)));
        }

        // Business place filter
        if (filterData.businessPlace) {
          aFilters.push(new Filter("Business Place", FilterOperator.Contains, ensureString(filterData.businessPlace)));
        }

        // Company code filter
        if (filterData.companyCode) {
          aFilters.push(new Filter("Company Code", FilterOperator.Contains, ensureString(filterData.companyCode)));
        }

        // Search filter
        if (filterData.searchQuery) {
          const searchQuery = ensureString(filterData.searchQuery);
          const searchFilters = [
            new Filter("Sequence ID", FilterOperator.Contains, searchQuery),
            new Filter("Accounting Document Type", FilterOperator.Contains, searchQuery),
            new Filter("Vendor Code", FilterOperator.Contains, searchQuery),
            new Filter("Customer Code", FilterOperator.Contains, searchQuery),
            new Filter("status", FilterOperator.Contains, searchQuery)
          ];
          aFilters.push(new Filter({ filters: searchFilters, and: false }));
        }

        // Apply filters
        const oBinding = oTable.getBinding("items");
        oBinding.filter(aFilters);

        // Update filtered count
        this._updateFilteredCount(oTable);

      } catch (error) {
        console.error("Error applying filters:", error);
        MessageToast.show("Error applying filters: " + error.message);
      }
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
        customerCode: "",
        referenceKey: "",
        businessPlace: "",
        companyCode: "",
        searchQuery: ""
      });

      // Reset UI controls
      this.byId("statusFilterComboBox").setSelectedKey("All");
      this.byId("sheetFilterComboBox").setSelectedKey("All");
      this.byId("indicatorFilterComboBox").setSelectedKey("All");
      this.byId("vendorCodeFilter").setValue("");
      this.byId("customerCodeFilter").setValue("");
      this.byId("referenceKeyFilter").setValue("");
      this.byId("businessPlaceFilter").setValue("");
      this.byId("companyCodeFilter").setValue("");
      this.byId("entriesSearchField").setValue("");
      this.byId("tableViewSelector").setSelectedKey("All");

      // Reset table filters
      this.byId("journalEntriesTable").getBinding("items").filter([]);
      this._updateFilteredCount(this.byId("journalEntriesTable"));

      MessageToast.show("All filters have been reset");
    }
  });
});