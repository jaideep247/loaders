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
  return Controller.extend("supplierinvoice.controller.BaseFilterController", {
    /**
     * Initializes filter model with common configuration
     * Can be extended by child controllers
     * @param {Array} additionalFields - Additional fields to add to the filter model
     * @param {Object} defaultValues - Default values to set in the filter model
     * @return {Object} The created filter model
     */
    _initFilterModel: function (additionalFields, defaultValues) {
      // Base filter model with common fields
      const filterModel = {
        status: "All",
        businessPlace: "",
        searchQuery: ""
      };

      // Add supplier specific fields if requested
      if (additionalFields && additionalFields.includes('supplierFields')) {
        filterModel.companyCode = "";
        filterModel.supplierId = "";
        filterModel.invoiceNumber = "";
        filterModel.fiscalYear = "";
      }

      // Add any custom additional fields
      if (additionalFields && Array.isArray(additionalFields)) {
        additionalFields.forEach(field => {
          if (field !== 'supplierFields' && !filterModel[field]) {
            filterModel[field] = "";
          }
        });
      }

      // Override with any provided default values
      if (defaultValues && typeof defaultValues === 'object') {
        Object.keys(defaultValues).forEach(key => {
          filterModel[key] = defaultValues[key];
        });
      }

      const oAdvancedFilterModel = new JSONModel(filterModel);
      this.getView().setModel(oAdvancedFilterModel, "advancedFilter");
      return oAdvancedFilterModel;
    },

    /**
     * Applies filters to the table
     * Should be overridden by child controllers to add specific filters
     * @param {string} tableId - ID of the table to filter
     * @param {string} modelName - Name of the model to update filtered count
     */
    _applyFilters: function (tableId, modelName) {
      const oTable = this.getView().byId(tableId || "supplierInvoicesTable");
      if (!oTable || !oTable.getBinding("items")) {
        console.error("Table or binding not found in _applyFilters");
        return;
      }

      const oFilterModel = this.getView().getModel("advancedFilter");
      if (!oFilterModel) {
        console.error("Filter model not found in _applyFilters");
        return;
      }

      const filterData = oFilterModel.getData();
      const aFilters = [];

      // Status filter (common to all applications)
      if (filterData.status && filterData.status !== "All") {
        aFilters.push(new Filter("status", FilterOperator.EQ, filterData.status));
      }

      // Business place filter (common to all applications)
      if (filterData.businessPlace) {
        aFilters.push(new Filter("BusinessPlace", FilterOperator.Contains, filterData.businessPlace));
      }

      // Search filter (common to all applications, but field names might differ)
      if (filterData.searchQuery) {
        // Fields for supplier invoices
        const searchFields = [
          "Sequence Id",
          "SupplierInvoiceIDByInvcgParty",
          "InvoicingParty",
          "DocumentHeaderText",
          "status"
        ];

        const searchFilters = searchFields.map(field =>
          new Filter(field, FilterOperator.Contains, filterData.searchQuery)
        );

        aFilters.push(new Filter({ filters: searchFilters, and: false }));
      }

      // Apply filters
      oTable.getBinding("items").filter(aFilters);
      this._updateFilteredCount(oTable, modelName);
    },

    /**
     * Updates filtered count in the model
     * @param {Object} oTable - Table to get filtered count from
     * @param {string} modelName - Name of the model to update filtered count
     */
    _updateFilteredCount: function (oTable, modelName) {
      if (!oTable || !oTable.getBinding("items")) {
        console.error("Table or binding not found in _updateFilteredCount");
        return;
      }

      const oBinding = oTable.getBinding("items");
      const filteredCount = oBinding.getLength();

      const modelToUpdate = oTable.getModel(modelName || "supplierInvoices");
      if (modelToUpdate) {
        modelToUpdate.setProperty("/filteredCount", filteredCount);
      }
    },

    /**
     * Resets all filters to default values
     * Should be extended by child controllers to reset specific filters
     */
    onResetFilters: function () {
      const oFilterModel = this.getView().getModel("advancedFilter");
      if (!oFilterModel) {
        console.error("Filter model not found in onResetFilters");
        return;
      }

      // Get current filter data to check which fields exist
      const currentData = oFilterModel.getData();

      // Create reset data with only the fields that exist in the current model
      const resetData = {
        status: "All",
        searchQuery: "",
        businessPlace: ""
      };

      // Reset supplier specific fields if they exist
      if ('companyCode' in currentData) resetData.companyCode = "";
      if ('supplierId' in currentData) resetData.supplierId = "";
      if ('invoiceNumber' in currentData) resetData.invoiceNumber = "";
      if ('fiscalYear' in currentData) resetData.fiscalYear = "";

      // Reset any other fields that might exist
      Object.keys(currentData).forEach(key => {
        if (!(key in resetData)) {
          // Preserve the same type of value (string, boolean, etc.)
          resetData[key] = typeof currentData[key] === 'string' ? "" :
            typeof currentData[key] === 'boolean' ? false :
              Array.isArray(currentData[key]) ? [] : null;
        }
      });

      // Update the model
      oFilterModel.setData(resetData);

      // Reset UI controls - only if they exist
      // Status filter (common)
      const statusFilter = this.byId("statusFilterComboBox");
      if (statusFilter) statusFilter.setSelectedKey("All");

      // Table view selector (common)
      const tableSelector = this.byId("tableViewSelector");
      if (tableSelector) tableSelector.setSelectedKey("All");

      // Search field (common)
      const searchField = this.byId("entriesSearchField");
      if (searchField) searchField.setValue("");

      // Business place filter (common)
      const businessPlaceFilter = this.byId("businessPlaceFilter");
      if (businessPlaceFilter) businessPlaceFilter.setValue("");

      // Supplier specific controls
      const companyCodeFilter = this.byId("companyCodeFilter");
      if (companyCodeFilter) companyCodeFilter.setValue("");

      const supplierIdFilter = this.byId("supplierIdFilter");
      if (supplierIdFilter) supplierIdFilter.setValue("");

      const invoiceNumberFilter = this.byId("invoiceNumberFilter");
      if (invoiceNumberFilter) invoiceNumberFilter.setValue("");

      const fiscalYearFilter = this.byId("fiscalYearFilter");
      if (fiscalYearFilter) fiscalYearFilter.setValue("");

      // Reset table filters
      const oTable = this.byId("supplierInvoicesTable");
      if (oTable && oTable.getBinding("items")) {
        oTable.getBinding("items").filter([]);
        this._updateFilteredCount(oTable, "supplierInvoices");
      }

      MessageToast.show("All filters have been reset");
    }
  });
});