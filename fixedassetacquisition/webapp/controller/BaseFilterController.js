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

    return Controller.extend("fixedassetacquisition.controller.BaseFilterController", {
        /**
         * Initialize filtering-related properties
         * @private
         */
        _initFilterProperties: function () {
            // Default filter view state
            this._sTableView = "All";
            this._sSearchQuery = "";

            // Debounce timers
            this._liveSearchTimer = null;
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
                    "companyCodeFilter",
                    "masterFixedAssetFilter",
                    "fixedAssetFilter",
                    "businessTransactionTypeFilter",
                    "offsettingAccountFilter",
                    "documentReferenceIDFilter",
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
         * Update the filtered count in the fixed asset entries model
         * @private
         */
        _updateFilteredCount: function () {
            try {
                const oTable = this.byId("fixedAssetEntriesTable");
                if (!oTable) return;

                const oBinding = oTable.getBinding("items");
                if (!oBinding) return;

                const filteredCount = oBinding.getLength();
                const totalCount = this.getView().getModel("fixedAssetEntries").getProperty("/entries").length;

                const oUploadSummaryModel = this.getView().getModel("uploadSummary");
                if (oUploadSummaryModel) {
                    oUploadSummaryModel.setProperty("/FilteredCount", filteredCount);
                    oUploadSummaryModel.setProperty("/TotalCount", totalCount);

                    // Update filter panel header with count
                    const oFilterPanel = this.byId("filtersPanel");
                    if (oFilterPanel) {
                        oFilterPanel.setHeaderText(`Filters (${filteredCount} of ${totalCount} items)`);
                    }
                }
            } catch (error) {
                console.error("Error updating filtered count:", error);
            }
        },

        /**
         * Apply filters to the fixed asset entries table
         * @private
         */
        _applyFilters: function () {
            try {
                const oTable = this.byId("fixedAssetEntriesTable");
                if (!oTable) {
                    console.warn("Table with ID 'fixedAssetEntriesTable' not found");
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
                const oCompanyCodeFilter = this.byId("companyCodeFilter");
                const oMasterFixedAssetFilter = this.byId("masterFixedAssetFilter");
                const oFixedAssetFilter = this.byId("fixedAssetFilter");
                const oBusinessTransactionTypeFilter = this.byId("businessTransactionTypeFilter");
                const oOffsettingAccountFilter = this.byId("offsettingAccountFilter");
                const oDocumentReferenceIDFilter = this.byId("documentReferenceIDFilter");
                const oSearchField = this.byId("itemSearchField");

                // 1. Status filter
                if (this._sTableView && this._sTableView !== "All") {
                    aFilters.push(new Filter("Status", FilterOperator.EQ, this._sTableView));
                }

                // 2. Company Code filter
                if (oCompanyCodeFilter && oCompanyCodeFilter.getValue()) {
                    const sCompanyCode = oCompanyCodeFilter.getValue().trim();
                    if (sCompanyCode) {
                        aFilters.push(new Filter("CompanyCode", FilterOperator.Contains, sCompanyCode));
                    }
                }

                // 3. Master Fixed Asset filter
                if (oMasterFixedAssetFilter && oMasterFixedAssetFilter.getValue()) {
                    const sMasterFixedAsset = oMasterFixedAssetFilter.getValue().trim();
                    if (sMasterFixedAsset) {
                        aFilters.push(new Filter("MasterFixedAsset", FilterOperator.Contains, sMasterFixedAsset));
                    }
                }

                // 4. Fixed Asset filter
                if (oFixedAssetFilter && oFixedAssetFilter.getValue()) {
                    const sFixedAsset = oFixedAssetFilter.getValue().trim();
                    if (sFixedAsset) {
                        aFilters.push(new Filter("FixedAsset", FilterOperator.Contains, sFixedAsset));
                    }
                }

                // 5. Business Transaction Type filter
                if (oBusinessTransactionTypeFilter && oBusinessTransactionTypeFilter.getValue()) {
                    const sBusinessTransactionType = oBusinessTransactionTypeFilter.getValue().trim();
                    if (sBusinessTransactionType) {
                        aFilters.push(new Filter("BusinessTransactionType", FilterOperator.Contains, sBusinessTransactionType));
                    }
                }

                // 6. Offsetting Account filter
                if (oOffsettingAccountFilter && oOffsettingAccountFilter.getValue()) {
                    const sOffsettingAccount = oOffsettingAccountFilter.getValue().trim();
                    if (sOffsettingAccount) {
                        aFilters.push(new Filter("OffsettingAccount", FilterOperator.Contains, sOffsettingAccount));
                    }
                }

                // 7. Document Reference ID filter
                if (oDocumentReferenceIDFilter && oDocumentReferenceIDFilter.getValue()) {
                    const sDocumentReferenceID = oDocumentReferenceIDFilter.getValue().trim();
                    if (sDocumentReferenceID) {
                        aFilters.push(new Filter("DocumentReferenceID", FilterOperator.Contains, sDocumentReferenceID));
                    }
                }

                // 8. Search field
                if (oSearchField && oSearchField.getValue()) {
                    const sSearchText = oSearchField.getValue().trim();
                    if (sSearchText) {
                        // Create global search across multiple fields
                        const aSearchFilters = [
                            new Filter("SequenceID", FilterOperator.Contains, sSearchText),
                            new Filter("MasterFixedAsset", FilterOperator.Contains, sSearchText),
                            new Filter("FixedAsset", FilterOperator.Contains, sSearchText),
                            new Filter("BusinessTransactionType", FilterOperator.Contains, sSearchText),
                            new Filter("OffsettingAccount", FilterOperator.Contains, sSearchText),
                            new Filter("DocumentReferenceID", FilterOperator.Contains, sSearchText),
                            new Filter("AccountingDocumentHeaderText", FilterOperator.Contains, sSearchText),
                            new Filter("DocumentItemText", FilterOperator.Contains, sSearchText),
                            new Filter("TransactionCurrency", FilterOperator.Contains, sSearchText),
                            new Filter("CompanyCode", FilterOperator.Contains, sSearchText)
                        ];

                        // Add combined OR filter for search
                        aFilters.push(new Filter({
                            filters: aSearchFilters,
                            and: false
                        }));
                    }
                }

                // Apply combined filters (all filters combined with AND)
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
         * Handler for live search field changes
         * @param {sap.ui.base.Event} oEvent - The search event
         */
        onLiveSearch: function (oEvent) {
            try {
                // Clear any pending timer
                if (this._liveSearchTimer) {
                    clearTimeout(this._liveSearchTimer);
                }

                // Create debounce effect - wait 300ms before applying filter
                this._liveSearchTimer = setTimeout(() => {
                    this._applyFilters();
                }, 300);
            } catch (error) {
                console.error("Error in live search:", error);
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
        onTableViewChange: function (oEvent) {
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
         * Standard search function (triggered by search button)
         * @param {sap.ui.base.Event} oEvent - The search event
         */
        onSearchItems: function (oEvent) {
            try {
                // Get the search string
                const sQuery = oEvent.getParameter("query") || "";

                // Apply filters - the search field value will be used in _applyFilters
                this._applyFilters();
            } catch (error) {
                console.error("Error during search:", error);
            }
        }
    });
});