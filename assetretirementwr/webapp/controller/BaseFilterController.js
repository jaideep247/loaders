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

    return Controller.extend("assetretirementwr.controller.BaseFilterController", {
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
                const filterControls = [
                    "statusFilterCombo",
                    "_IDGenInput",
                    "_IDGenInput1",
                    "_IDGenInput2",
                    "_IDGenInput3",
                    "retirementTypeFilter",
                    "documentReferenceIDFilter",
                    "accountingDocumentTypeFilter",
                    "assignmentReferenceFilter",
                    "itemSearchField"
                ];

                filterControls.forEach(controlId => {
                    const control = this.byId(controlId);
                    if (control) {
                        if (control.setValue) control.setValue("");
                        if (control.setSelectedKey) control.setSelectedKey("All");
                    }
                });

                // Reset table view
                const oSegmentedButton = this.byId("tableViewSelector");
                if (oSegmentedButton) {
                    oSegmentedButton.setSelectedKey("All");
                }

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
            try {
                console.log("Syncing filter controls with key:", sKey);

                // First attempt to get the specific control instances
                const oStatusFilter = this.byId("statusFilterCombo");
                const oSegmentedButton = this.byId("tableViewSelector");

                // Debug which controls were found
                console.log("Found controls:", {
                    statusFilter: !!oStatusFilter,
                    segmentedButton: !!oSegmentedButton
                });

                // Sync each control if it exists
                if (oStatusFilter && oStatusFilter.getSelectedKey() !== sKey) {
                    console.log(`Syncing statusFilterCombo to key: ${sKey}`);
                    oStatusFilter.setSelectedKey(sKey);
                }

                if (oSegmentedButton && oSegmentedButton.getSelectedKey() !== sKey) {
                    console.log(`Syncing tableViewSelector to key: ${sKey}`);
                    oSegmentedButton.setSelectedKey(sKey);
                }

                // Store current view selection
                this._sTableView = sKey;

                // Verify synchronization with a slight delay
                setTimeout(() => {
                    // Check if controls are properly synced
                    if (oStatusFilter && oStatusFilter.getSelectedKey() !== sKey) {
                        console.warn("Status filter not properly synced. Retry...");
                        oStatusFilter.setSelectedKey(sKey);
                    }
                }, 50);
            } catch (error) {
                console.error("Error in _syncFilterControls:", error);
            }
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
                const fixedAssetModel = this.getView().getModel("fixedAssetEntries");

                if (!fixedAssetModel) return;

                const entries = fixedAssetModel.getProperty("/entries") || [];
                const totalCount = entries.length;

                // Count valid and invalid entries
                const validCount = entries.filter(entry => entry.Status === "Valid").length;
                const invalidCount = entries.filter(entry => entry.Status === "Invalid").length;

                // Update panel header with count
                const oFilterPanel = this.byId("filtersPanel");
                if (oFilterPanel) {
                    oFilterPanel.setHeaderText(`Filters (${filteredCount} of ${totalCount} items)`);
                }

                console.log("Filter counts:", {
                    total: totalCount,
                    filtered: filteredCount,
                    valid: validCount,
                    invalid: invalidCount
                });
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
                console.log("Applying filters started");

                const oTable = this.byId("fixedAssetEntriesTable");
                if (!oTable) {
                    console.error("Table not found!");
                    return;
                }

                const oBinding = oTable.getBinding("items");
                if (!oBinding) {
                    console.error("Table binding not found!");
                    return;
                }

                // Get filter controls
                const oStatusFilter = this.byId("statusFilterCombo");
                const oCompanyCodeFilter = this.byId("_IDGenInput");
                const oMasterFixedAssetFilter = this.byId("_IDGenInput1");
                const oFixedAssetFilter = this.byId("_IDGenInput2");
                const oBusinessTransactionTypeFilter = this.byId("_IDGenInput3");
                const oRetirementTypeFilter = this.byId("retirementTypeFilter");
                const oDocumentReferenceIDFilter = this.byId("documentReferenceIDFilter");
                const oAccountingDocumentTypeFilter = this.byId("accountingDocumentTypeFilter");
                const oAssignmentReferenceFilter = this.byId("assignmentReferenceFilter");
                const oSearchField = this.byId("itemSearchField");

                // Debug filter values for troubleshooting
                console.log("Filter Values:", {
                    status: oStatusFilter ? oStatusFilter.getSelectedKey() : "Not found",
                    companyCode: oCompanyCodeFilter ? oCompanyCodeFilter.getValue() : "Not found",
                    masterFixedAsset: oMasterFixedAssetFilter ? oMasterFixedAssetFilter.getValue() : "Not found",
                    fixedAsset: oFixedAssetFilter ? oFixedAssetFilter.getValue() : "Not found",
                    businessTransactionType: oBusinessTransactionTypeFilter ? oBusinessTransactionTypeFilter.getValue() : "Not found",
                    retirementType: oRetirementTypeFilter ? oRetirementTypeFilter.getValue() : "Not found",
                    documentReferenceID: oDocumentReferenceIDFilter ? oDocumentReferenceIDFilter.getValue() : "Not found",
                    accountingDocumentType: oAccountingDocumentTypeFilter ? oAccountingDocumentTypeFilter.getValue() : "Not found",
                    assignmentReference: oAssignmentReferenceFilter ? oAssignmentReferenceFilter.getValue() : "Not found",
                    search: oSearchField ? oSearchField.getValue() : "Not found"
                });

                // Prepare filters array
                const aFilters = [];

                // 1. Status Filter
                if (oStatusFilter) {
                    const sStatusKey = oStatusFilter.getSelectedKey();
                    if (sStatusKey && sStatusKey !== "All") {
                        aFilters.push(new Filter("Status", FilterOperator.EQ, sStatusKey));
                    }
                }

                // Helper function to add contains filter if value exists
                const addContainsFilter = (sField, oControl) => {
                    if (oControl) {
                        const sValue = oControl.getValue().trim();
                        if (sValue) {
                            console.log(`Adding filter for ${sField} with value: ${sValue}`);
                            aFilters.push(new Filter(sField, FilterOperator.Contains, sValue));
                        }
                    }
                };

                // 2. Add filters for each input field
                addContainsFilter("CompanyCode", oCompanyCodeFilter);
                addContainsFilter("MasterFixedAsset", oMasterFixedAssetFilter);
                addContainsFilter("FixedAsset", oFixedAssetFilter);
                addContainsFilter("BusinessTransactionType", oBusinessTransactionTypeFilter);

                // Special handling for retirement type filter
                if (oRetirementTypeFilter) {
                    const sValue = oRetirementTypeFilter.getValue().trim();
                    if (sValue) {
                        console.log(`Adding retirement type filter with value: ${sValue}`);
                        aFilters.push(new Filter("FixedAssetRetirementType", FilterOperator.Contains, sValue));
                    }
                }

                addContainsFilter("DocumentReferenceID", oDocumentReferenceIDFilter);
                addContainsFilter("AccountingDocumentType", oAccountingDocumentTypeFilter);
                addContainsFilter("AssignmentReference", oAssignmentReferenceFilter);

                // 3. Global Search Filter
                if (oSearchField) {
                    const sSearchText = oSearchField.getValue().trim();
                    if (sSearchText) {
                        const aSearchFilters = [
                            new Filter("SequenceID", FilterOperator.Contains, sSearchText),
                            new Filter("CompanyCode", FilterOperator.Contains, sSearchText),
                            new Filter("MasterFixedAsset", FilterOperator.Contains, sSearchText),
                            new Filter("FixedAsset", FilterOperator.Contains, sSearchText),
                            new Filter("BusinessTransactionType", FilterOperator.Contains, sSearchText),
                            new Filter("FixedAssetRetirementType", FilterOperator.Contains, sSearchText),
                            new Filter("DocumentReferenceID", FilterOperator.Contains, sSearchText),
                            new Filter("AccountingDocumentType", FilterOperator.Contains, sSearchText),
                            new Filter("AssignmentReference", FilterOperator.Contains, sSearchText)
                        ];

                        // Combine search filters with OR condition
                        const oSearchFilter = new Filter({
                            filters: aSearchFilters,
                            and: false
                        });

                        aFilters.push(oSearchFilter);
                    }
                }

                // Apply filters
                const oFinalFilter = aFilters.length > 0
                    ? new Filter({
                        filters: aFilters,
                        and: true
                    })
                    : null;

                // Log filter being applied
                console.log("Applying final filter:", oFinalFilter);
                oBinding.filter(oFinalFilter);

                // Update filtered count
                this._updateFilteredCount();

                console.log("Filters applied successfully:", aFilters);
            } catch (error) {
                console.error("Error applying filters:", error);
                MessageToast.show("Error applying filters: " + error.message);
            }
        },

        /**
         * Handler for live search field changes
         * @param {sap.ui.base.Event} oEvent - The search event
         */
        onSearchLiveChange: function (oEvent) {
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
                // Get the selected key directly from the source control
                const sKey = oEvent.getSource().getSelectedKey();
                console.log("Status Filter Change:", sKey);

                // Sync all filter controls including the segmented button
                this._syncFilterControls(sKey);

                // Apply filters with the new selection
                this._applyFilters();
            } catch (error) {
                console.error("Error in status filter change:", error);
                MessageToast.show("Error changing status filter");
            }
        },

        onSearchItems: function (oEvent) {
            this._applyFilters();
        },

        /**
         * Generic handler for filter changes
         */
        onFilterChange: function () {
            this._applyFilters();
        },

        /**
         * Specific filter change handlers for retirement fields
         */
        onCompanyCodeFilterChange: function () {
            this._applyFilters();
        },

        onMasterFixedAssetFilterChange: function () {
            this._applyFilters();
        },

        onFixedAssetFilterChange: function () {
            this._applyFilters();
        },

        onBusinessTransactionTypeFilterChange: function () {
            this._applyFilters();
        },

        onRetirementTypeFilterChange: function () {
            this._applyFilters();
        },

        onReferenceDocumentItemFilterChange: function () {
            this._applyFilters();
        },

        onRetirementAmountFilterChange: function () {
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
         * Apply filters button handler
         */
        onApplyFilters: function () {
            this._applyFilters();
            MessageToast.show("Filters applied");
        },

        /**
         * Table view filter change handler
         * @param {sap.ui.base.Event} oEvent - The filter change event
         */
        onTableViewChange: function (oEvent) {
            try {
                console.log("Table View Change Event Triggered");

                // Get the selected key directly from the event source
                const oSource = oEvent.getSource();
                let sKey = oSource.getSelectedKey();

                console.log("Selected Key from SegmentedButton:", sKey);

                // Default to 'All' if no key was found
                if (!sKey) {
                    console.warn("No valid key found. Defaulting to 'All'");
                    sKey = "All";
                }

                // Store the current view selection
                this._sTableView = sKey;

                // Update other filter controls with the same key
                this._syncFilterControls(sKey);

                // Apply filters based on the selection
                this._applyFilters();

            } catch (error) {
                console.error("Error in table view change:", error);
                MessageToast.show("Error changing table view: " + error.message);
            }
        },

        /**
         * Date range filter change handlers
         */
        onDateRangeChange: function (oEvent) {
            this._applyFilters();
        },

        onPostingDateRangeChange: function (oEvent) {
            this._applyFilters();
        },

        onAssetValueDateRangeChange: function (oEvent) {
            this._applyFilters();
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