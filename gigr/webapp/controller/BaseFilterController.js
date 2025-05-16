sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap/ui/model/Filter",
    "sap/ui/model/FilterOperator",
    "sap/m/MessageToast"
], function (
    Controller, 
    Filter, 
    FilterOperator, 
    MessageToast
) {
    "use strict";

    return Controller.extend("gigr.controller.BaseFilterController", {
        /**
         * Initialize filtering-related properties
         * @private
         */
        _initFilterProperties: function() {
            // Default filter view state
            this._sTableView = "All";
            this._sSearchQuery = "";
        },

        /**
         * Reset filters to default values
         * @private
         */
        _resetFilters: function () {
            try {
                // Clear filter values
                const aFilterControls = [
                    "statusFilterComboBox",
                    "sequenceFilter",
                    "materialFilter",
                    "documentDateFilter",
                    "purchaseOrderFilter",
                    "storageLocationFilter",
                    "plantFilter",
                    "itemSearchField"
                ];
                
                // Clear each filter control
                aFilterControls.forEach(controlId => {
                    const control = this.byId(controlId);
                    if (control && control.setValue) {
                        control.setValue("");
                    } else if (control && control.setSelectedKey) {
                        control.setSelectedKey("All");
                    }
                });

                // Clear search query and view selection
                this._sSearchQuery = "";
                this._sTableView = "All";
                
                // Sync the filter controls
                this._syncFilterControls("All");
            } catch (error) {
                console.error("Error resetting filters:", error);
            }
        },

        /**
         * Synchronize filter controls to show consistent selection
         * @param {string} sKey - The selected filter key
         * @private
         */
        _syncFilterControls: function (sKey) {
            // Sync ComboBox
            const oStatusFilter = this.byId("statusFilterComboBox");
            if (oStatusFilter && oStatusFilter.getSelectedKey() !== sKey) {
                oStatusFilter.setSelectedKey(sKey);
            }

            // Sync SegmentedButton
            const oViewSelector = this.byId("tableViewSelector");
            if (oViewSelector && oViewSelector.getSelectedKey() !== sKey) {
                oViewSelector.setSelectedKey(sKey);
            }
            
            // Store current view selection
            this._sTableView = sKey;
        },

        /**
         * Update the filtered count in the material documents model
         * @private
         */
        _updateFilteredCount: function () {
            try {
                const oTable = this.byId("itemsTable");
                if (!oTable) return;

                const oBinding = oTable.getBinding("items");
                if (!oBinding) return;

                const filteredCount = oBinding.getLength();
                
                const oMaterialDocumentsModel = this.getView().getModel("materialDocuments");
                if (oMaterialDocumentsModel) {
                    oMaterialDocumentsModel.setProperty("/filteredCount", filteredCount);
                }
            } catch (error) {
                console.error("Error updating filtered count:", error);
            }
        },

        /**
         * Apply filters to the material documents table
         * @private
         */
        _applyFilters: function () {
            try {
                const oTable = this.byId("itemsTable");
                if (!oTable) {
                    console.warn("Table with ID 'itemsTable' not found");
                    return;
                }

                const oBinding = oTable.getBinding("items");
                if (!oBinding) {
                    console.warn("Table binding not found");
                    return;
                }

                // Get filter values
                const aFilters = [];

                // Get references to all filter controls
                const oStatusFilter = this.byId("statusFilterComboBox");
                const oDateRangeFilter = this.byId("documentDateFilter");
                const oSequenceFilter = this.byId("sequenceFilter");
                const oMaterialFilter = this.byId("materialFilter");
                const oPurchaseOrderFilter = this.byId("purchaseOrderFilter");
                const oStorageLocationFilter = this.byId("storageLocationFilter");
                const oPlantFilter = this.byId("plantFilter");

                // 1. Status filter
                if (this._sTableView && this._sTableView !== "All") {
                    aFilters.push(new Filter("Status", FilterOperator.EQ, this._sTableView));
                }

                // 2. Document Date range filter
                if (oDateRangeFilter && oDateRangeFilter.getValue()) {
                    const sDateRange = oDateRangeFilter.getValue();
                    if (sDateRange) {
                        const aDates = sDateRange.split(" - ");
                        if (aDates.length === 2) {
                            try {
                                const oStartDate = new Date(aDates[0]);
                                const oEndDate = new Date(aDates[1]);
                                oEndDate.setHours(23, 59, 59, 999); // Include end date fully

                                aFilters.push(new Filter({
                                    path: "DocumentDate",
                                    operator: FilterOperator.BT,
                                    value1: oStartDate,
                                    value2: oEndDate
                                }));
                            } catch (e) {
                                console.error("Error parsing date range:", e);
                            }
                        }
                    }
                }

                // 3. Sequence ID filter
                if (oSequenceFilter && oSequenceFilter.getValue()) {
                    const sSequence = oSequenceFilter.getValue().trim();
                    if (sSequence) {
                        aFilters.push(new Filter("SequenceNumber", FilterOperator.Contains, sSequence));
                    }
                }

                // 4. Material filter
                if (oMaterialFilter && oMaterialFilter.getValue()) {
                    const sMaterial = oMaterialFilter.getValue().trim();
                    if (sMaterial) {
                        aFilters.push(new Filter("Material", FilterOperator.Contains, sMaterial));
                    }
                }

                // 5. Purchase Order filter
                if (oPurchaseOrderFilter && oPurchaseOrderFilter.getValue()) {
                    const sPurchaseOrder = oPurchaseOrderFilter.getValue().trim();
                    if (sPurchaseOrder) {
                        aFilters.push(new Filter("PurchaseOrder", FilterOperator.Contains, sPurchaseOrder));
                    }
                }

                // 6. Storage Location filter
                if (oStorageLocationFilter && oStorageLocationFilter.getValue()) {
                    const sStorageLocation = oStorageLocationFilter.getValue().trim();
                    if (sStorageLocation) {
                        aFilters.push(new Filter("StorageLocation", FilterOperator.Contains, sStorageLocation));
                    }
                }

                // 7. Plant filter
                if (oPlantFilter && oPlantFilter.getValue()) {
                    const sPlant = oPlantFilter.getValue().trim();
                    if (sPlant) {
                        aFilters.push(new Filter("Plant", FilterOperator.Contains, sPlant));
                    }
                }

                // Apply combined filters
                let oCombinedFilter = aFilters.length > 0 ?
                    new Filter({ filters: aFilters, and: true }) : null;

                // Apply filters to binding
                oBinding.filter(oCombinedFilter);

                // Update filtered count after a short delay
                setTimeout(() => {
                    this._updateFilteredCount();
                }, 100);
            } catch (error) {
                console.error("Error applying filters:", error);
                // Assuming error handler is available, if not, use MessageToast
                if (this._errorHandler) {
                    this._errorHandler.showError("Error applying filters: " + error.message);
                } else {
                    MessageToast.show("Error applying filters: " + error.message);
                }
            }
        },

        /**
         * Handler for status filter change
         * @param {sap.ui.base.Event} oEvent - The filter change event
         */
        onStatusFilterChange: function (oEvent) {
            try {
                let sKey = "All"; // Default value

                // Check event source type to determine how to get the selected key
                const oSource = oEvent.getSource();

                if (oSource.getMetadata().getName() === "sap.m.ComboBox") {
                    // ComboBox source
                    sKey = oSource.getSelectedKey();
                }
                else if (oSource.getMetadata().getName() === "sap.m.SegmentedButtonItem") {
                    // SegmentedButtonItem source
                    sKey = oSource.getKey();
                }
                else if (oEvent.getParameter("selectedItem")) {
                    // Selection change event with selectedItem parameter
                    sKey = oEvent.getParameter("selectedItem").getKey();
                }
                else if (oEvent.getParameter("key")) {
                    // Selection change event with key parameter
                    sKey = oEvent.getParameter("key");
                }

                // Sync the UI controls to show consistent selection
                this._syncFilterControls(sKey);

                // Apply the filters
                this._applyFilters();
            } catch (error) {
                console.error("Error handling status filter change:", error);
            }
        },

        /**
         * Handle date range filter change
         */
        onDateRangeChange: function () {
            this._applyFilters();
        },

        /**
         * Generic handler for filter changes
         */
        onFilterChange: function () {
            this._applyFilters();
        },

        /**
         * Reset filters button handler
         */
        onResetFilters: function () {
            this._resetFilters();
            this._applyFilters();
            MessageToast.show("Filters reset");
        },

        /**
         * Table view filter change handler
         * @param {sap.ui.base.Event} oEvent - The filter change event
         */
        onTableViewChange: function(oEvent) {
            try {
                let sKey = "All"; // Default value
                
                // The event for SegmentedButton is different than ComboBox
                if (oEvent.getParameter("key")) {
                    sKey = oEvent.getParameter("key");
                } else {
                    const oSource = oEvent.getSource();
                    if (oSource && oSource.getSelectedKey) {
                        sKey = oSource.getSelectedKey();
                    }
                }
                
                // Store the current view selection
                this._sTableView = sKey;
                
                // Sync the filter controls
                this._syncFilterControls(sKey);
                
                // Apply filters
                this._applyFilters();
            } catch (error) {
                console.error("Error in table view change:", error);
            }
        },

        /**
         * Enhanced search function for material documents
         * @param {sap.ui.base.Event} oEvent - The search event
         */
        onSearchItems: function (oEvent) {
            try {
                // Get the search string
                const sQuery = oEvent.getParameter("query");
                const oTable = this.byId("itemsTable");
                const oBinding = oTable ? oTable.getBinding("items") : null;

                if (!oBinding) {
                    return;
                }

                const aFilters = [];

                if (sQuery && sQuery.length > 0) {
                    // Create filters for each searchable field
                    const aFieldFilters = [
                        new Filter("GRNDocumentNumber", FilterOperator.Contains, sQuery),
                        new Filter("Material", FilterOperator.Contains, sQuery),
                        new Filter("Plant", FilterOperator.Contains, sQuery),
                        new Filter("PurchaseOrder", FilterOperator.Contains, sQuery),
                        new Filter("Status", FilterOperator.Contains, sQuery)
                    ];

                    // Combine filters with OR operator
                    aFilters.push(
                        new Filter({
                            filters: aFieldFilters,
                            and: false
                        })
                    );
                }

                // Store the current application filters
                const aExistingFilters = oBinding.aApplicationFilters || [];

                // Apply search filters
                oBinding.filter(aFilters, "search");

                // Reapply application filters if any
                if (aExistingFilters.length > 0) {
                    oBinding.filter(aExistingFilters);
                }

                // Update filtered count
                setTimeout(() => {
                    this._updateFilteredCount();
                }, 100);
            } catch (error) {
                console.error("Error during search:", error);
            }
        }
    });
});