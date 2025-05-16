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

  return Controller.extend("customer_collection.controller.BaseFilterController", {
    /**
     * Advanced initialization of filter model with robust configuration
     * @param {sap.ui.core.mvc.View} oView View context
     * @param {string[]} additionalFields Additional custom fields
     * @param {object} [filterConfig] Optional filter configuration
     * @returns {sap.ui.model.json.JSONModel} Initialized filter model
     */
    _initAdvancedFilterModel: function (oView, additionalFields = [], filterConfig = {}) {
      // Default filter model structure
      const baseFilterModel = {
        // Core filters
        status: "All",
        searchQuery: "",

        // Numeric filters
        minAmount: null,
        maxAmount: null,

        // Date filters
        dateRangeStart: null,
        dateRangeEnd: null,

        // Dynamic additional fields
        ...additionalFields.reduce((acc, field) => {
          acc[field] = "";
          return acc;
        }, {})
      };

      // Merge with any custom configuration
      const finalFilterModel = {
        ...baseFilterModel,
        ...filterConfig
      };

      const advancedFilterModel = new JSONModel(finalFilterModel);
      oView.setModel(advancedFilterModel, "advancedFilter");

      return advancedFilterModel;
    },


    /**
     * Add standard filters like status, amount, and date range
     * @param {object} filterData Filter model data
     * @param {sap.ui.model.Filter[]} aFilters Filters array to populate
     * @private
     */
    _addStandardFilters: function (filterData, aFilters) {
      // Status filter
      if (filterData.status && filterData.status !== "All") {
        aFilters.push(new Filter("status", FilterOperator.EQ, filterData.status));
      }

      // Amount range filter
      if (filterData.minAmount !== null && filterData.maxAmount !== null) {
        aFilters.push(new Filter(
          "Amount",
          FilterOperator.BT,
          parseFloat(filterData.minAmount),
          parseFloat(filterData.maxAmount)
        ));
      }       
    },

    /**
  * Add additional specific filters based on configuration
  * @param {object} filterData Filter model data
  * @param {sap.ui.model.Filter[]} aFilters Filters array to populate
  * @param {object} additionalFilters Additional filter configurations
  * @private
  */
    _addAdditionalFilters: function (filterData, aFilters, additionalFilters) {
      Object.keys(additionalFilters).forEach(filterKey => {
        const filterValue = filterData[filterKey];
        if (filterValue == null || filterValue === '') return;

        const filterConfig = additionalFilters[filterKey];
        const processedValue = String(filterValue).trim();
        if (processedValue === '') return;

        try {
          // Special handling for numeric values
          if (filterConfig.numeric) {
            const numericValue = parseFloat(processedValue);
            if (!isNaN(numericValue)) {
              aFilters.push(new Filter(
                filterConfig.modelField,
                filterConfig.operator || FilterOperator.EQ,
                numericValue
              ));
            }
            return;
          }

          // Special handling for date ranges
          if (filterConfig.isDate) {
            aFilters.push(new Filter(
              filterConfig.modelField,
              filterConfig.operator || FilterOperator.EQ,
              new Date(processedValue)
            ));
            return;
          }

          // Default string handling
          aFilters.push(new Filter(
            filterConfig.modelField,
            filterConfig.operator || FilterOperator.Contains,
            processedValue
          ));

        } catch (error) {
          console.error(`Filter creation error for ${filterKey}:`, error);
        }
      });
    },
    /**
     * Create search filters across multiple columns
     * @param {string} sQuery Search query
     * @param {string[]} searchColumns Columns to search
     * @return {sap.ui.model.Filter[]} Search filters
     */
    _createSearchFilters: function (sQuery, searchColumns) {
      if (!sQuery || !searchColumns || searchColumns.length === 0) return [];

      const searchFilters = searchColumns.map(
        columnName => new Filter(columnName, FilterOperator.Contains, sQuery)
      );

      return [new Filter({
        filters: searchFilters,
        and: false
      })];
    },

    /**
     * Update filtered count in the model
     * @param {sap.m.Table} oTable Table to count
     */
    _updateFilteredCount: function (oTable) {
      if (!oTable) return;

      const oBinding = oTable.getBinding("items");
      if (!oBinding) return;

      const filteredCount = oBinding.getLength();
      const oJournalEntriesModel = oTable.getModel("journalEntries");

      if (oJournalEntriesModel) {
        oJournalEntriesModel.setProperty("/filteredCount", filteredCount);
      }
    },

    /**
     * Comprehensive filter reset with enhanced configuration
     * @param {sap.ui.core.mvc.View} oView View context
     * @param {object} [customResetConfig] Custom reset configuration
     */
    _resetAllFilters: function (oView, customResetConfig = {}) {
      const advancedFilterModel = oView.getModel("advancedFilter");

      if (!advancedFilterModel) {
        console.error("Advanced filter model not found");
        return;
      }

      // Default reset configuration
      const defaultResetData = {
        status: "All",
        searchQuery: "",
        minAmount: null,
        maxAmount: null,
        dateRangeStart: null,
        dateRangeEnd: null
      };

      // Merge default and custom reset configuration
      const resetData = {
        ...defaultResetData,
        ...customResetConfig
      };

      // Reset advanced filter model
      advancedFilterModel.setData(resetData);

      // Reset UI components
      this._resetUIFilterComponents(oView);

      // Reset table filters
      this._resetTableFilters(oView);

      MessageToast.show("Filters reset successfully");
    },

    /**
     * Reset UI filter components
     * @param {sap.ui.core.mvc.View} oView View context
     * @private
     */
    _resetUIFilterComponents: function (oView) {
      const resetComponents = [
        { id: "statusFilterComboBox", method: "setSelectedKey", value: "All" },        
        { id: "entriesSearchField", method: "setValue", value: "" },
        { id: "tableViewSelector", method: "setSelectedKey", value: "All" }
      ];

      resetComponents.forEach(component => {
        const control = oView.byId(component.id);
        if (control && control[component.method]) {
          control[component.method](component.value);
        }
      });
    },

    /**
     * Reset table filters
     * @param {sap.ui.core.mvc.View} oView View context
     * @private
     */
    _resetTableFilters: function (oView) {
      const oTable = oView.byId("journalEntriesTable");
      if (oTable) {
        const oBinding = oTable.getBinding("items");
        if (oBinding) {
          oBinding.filter([]);
        }
        this._updateFilteredCount(oTable);
      }
    }
  });
});