sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap/ui/model/Filter",
    "sap/ui/model/FilterOperator"
], function (Controller, Filter, FilterOperator) {
    "use strict";

    return Controller.extend("serviceentrysheet.controller.BaseFilterController", {
        /**
         * Initialize filter functionality
         * Call this method in the onInit of inheriting controllers
         * @param {Object} filterFieldMappings - Map of control IDs to model property names
         * @param {String} tableId - ID of the table to be filtered
         * @param {String} modelName - Name of the model containing the data (optional)
         */
        initializeFilters: function (filterFieldMappings, tableId, modelName) {
            // Store filter configuration
            this._filterFields = filterFieldMappings || {};
            this._tableId = tableId;
            this._modelName = modelName || "";

            // Initialize filter values storage
            this._filterValues = {};

            // Log initialization for debugging
            console.log("Filter initialization:", {
                filterFields: this._filterFields,
                tableId: this._tableId,
                modelName: this._modelName
            });
        },

        /**
         * Reset all filters to their initial state
         */
        resetFilters: function () {
            try {
                // Clear filter values
                this._filterValues = {};
                console.log("Resetting filters...");

                // Reset filter UI elements
                for (const filterId in this._filterFields) {
                    const filterControl = this.byId(filterId);

                    if (!filterControl) {
                        console.warn(`Control not found for ID: ${filterId}`);
                        continue; // Skip to next control
                    }

                    // Handle different control types
                    const controlType = filterControl.getMetadata().getName();
                    console.log(`Resetting control: ${filterId}, type: ${controlType}`);

                    try {
                        // Handle ComboBox and Select controls
                        if (filterControl.setSelectedKey) {
                            if (filterId.toLowerCase().includes("status") ||
                                controlType.includes("ComboBox") ||
                                controlType.includes("Select")) {
                                filterControl.setSelectedKey("All");
                                console.log(`Reset ${filterId} to 'All' using setSelectedKey`);
                            }
                        }
                        // Handle Input controls
                        else if (filterControl.setValue) {
                            filterControl.setValue("");
                            console.log(`Reset ${filterId} to blank using setValue`);
                        }
                        // Handle SegmentedButton
                        else if (controlType.includes("SegmentedButton")) {
                            // Find the "All" button in the segmented button
                            const allButton = filterControl.getItems().find(item =>
                                item.getKey() === "All" ||
                                item.getText() === "All" ||
                                item.getId().includes("all"));

                            if (allButton) {
                                filterControl.setSelectedButton(allButton);
                                console.log(`Reset SegmentedButton ${filterId} to 'All' button`);
                            } else if (filterControl.getItems().length > 0) {
                                // If no "All" button, select the first one
                                filterControl.setSelectedButton(filterControl.getItems()[0]);
                                console.log(`Reset SegmentedButton ${filterId} to first button`);
                            }
                        }
                        // Handle SearchField
                        else if (controlType.includes("SearchField")) {
                            filterControl.setValue("");
                            console.log(`Reset SearchField ${filterId} to blank`);
                        }
                        // Handle other controls
                        else {
                            console.warn(`Unknown control type ${controlType} for ${filterId}, cannot reset`);
                        }
                    } catch (controlError) {
                        console.warn(`Could not reset control ${filterId}: ${controlError.message}`);
                    }
                }

                // Apply empty filters to refresh the table
                this.applyFilters();
                console.log("All filters reset successfully");
            } catch (error) {
                console.error("Error resetting filters:", error);
                if (this._errorHandler) {
                    this._errorHandler.showError("Failed to reset filters: " + error.message);
                }
            }
        },

        /**
         * Apply current filters to the table
         */
        applyFilters: function () {
            try {
                // Get the table binding
                let oTable = this.byId(this._tableId);
                if (!oTable) {
                    console.warn(`Table with ID '${this._tableId}' not found in view ${this.getView().getId()}`);

                    // Try as a direct ID without view prefix
                    const directTable = sap.ui.getCore().byId(this._tableId);
                    if (directTable) {
                        console.log("Found table without view prefix");
                        oTable = directTable;
                    } else {
                        return;
                    }
                }

                let oBinding = oTable.getBinding("items");
                if (!oBinding) {
                    console.warn("Table has no binding for 'items'");

                    // Check if table has a different binding like 'rows'
                    const alternativeBinding = oTable.getBinding("rows");
                    if (alternativeBinding) {
                        console.log("Found alternative binding 'rows'");
                        oBinding = alternativeBinding;
                    } else {
                        return;
                    }
                }

                // Create filter array
                const aFilters = [];

                // Add text filters
                console.log("Current filter values:", JSON.stringify(this._filterValues));
                for (const filterId in this._filterValues) {
                    const filterValue = this._filterValues[filterId];
                    if (filterValue) {
                        const filterField = this._filterFields[filterId];
                        if (filterField) {
                            // Choose appropriate filter operator based on field type
                            let operator = FilterOperator.Contains;

                            // Use exact match for status and numeric fields
                            if (filterField === "Status" ||
                                filterId.toLowerCase().includes("status") ||
                                filterField === "SequenceNumber" ||
                                filterField.toLowerCase().includes("id") ||
                                filterField.toLowerCase().includes("number")) {
                                operator = FilterOperator.EQ;
                                console.log(`Using EQ operator for ${filterField}`);
                            }

                            console.log(`Adding filter: ${filterField}=${filterValue} using operator ${operator}`);
                            aFilters.push(new Filter(filterField, operator, filterValue));
                        } else {
                            console.warn(`No field mapping found for filter ID: ${filterId}`);
                        }
                    }
                }

                // Apply filters to binding
                if (aFilters.length > 0) {
                    console.log(`Applying ${aFilters.length} filters to table binding`);
                    const combinedFilter = new Filter({
                        filters: aFilters,
                        and: true
                    });
                    oBinding.filter(combinedFilter);
                } else {
                    console.log("No filters to apply, clearing all filters");
                    oBinding.filter([]);
                }

                // Update filtered count in the model if available
                const filteredCount = oBinding.getLength();
                this._updateFilteredCount(filteredCount);
                console.log("Filters applied successfully", {
                    filterCount: aFilters.length,
                    resultCount: filteredCount
                });

                // Update UI elements to indicate active filters
                this._updateFilterIndicators();
            } catch (error) {
                console.error("Error applying filters:", error);
                console.log("Current filter values:", this._filterValues);
                console.log("Current filter fields:", this._filterFields);
                if (this._errorHandler) {
                    this._errorHandler.showError("Failed to apply filters: " + error.message);
                }
            }
        },

        /**
         * Handle text filter change event
         * @param {sap.ui.base.Event} oEvent The event object
         */
        onFilterChange: function (oEvent) {
            try {
                const oSource = oEvent.getSource();

                // More reliable ID resolution that handles different UI5 ID patterns
                let sFilterId = oSource.getId();

                // Try to remove view prefix if it exists
                if (this.getView()) {
                    const viewPrefix = this.getView().getId() + "--";
                    if (sFilterId.startsWith(viewPrefix)) {
                        sFilterId = sFilterId.replace(viewPrefix, "");
                    } else {
                        // Try standard ID splitting
                        const parts = sFilterId.split("--");
                        if (parts.length > 1) {
                            sFilterId = parts[parts.length - 1];
                        }
                    }
                }

                const sValue = oSource.getValue ? oSource.getValue() : "";

                console.log("Filter changed:", {
                    originalId: oSource.getId(),
                    resolvedId: sFilterId,
                    value: sValue
                });

                // Store filter value
                this._filterValues[sFilterId] = sValue;

                // Debug log filter values
                console.log("Current filter values:", JSON.stringify(this._filterValues));

                // Apply filters
                this.applyFilters();
            } catch (error) {
                console.error("Error in filter change:", error);
                if (this._errorHandler) {
                    this._errorHandler.showError("Failed to update filter: " + error.message);
                }
            }
        },

        /**
         * Handle status filter change - works with both SegmentedButtonItem press and ComboBox selection
         * @param {sap.ui.base.Event} oEvent The event object
         */
        onStatusFilterChange: function (oEvent) {
            try {
                let selectedKey;
                let sourceId;

                // Case 1: Called from ComboBox selection - has selectedItem parameter
                if (oEvent.getParameter && oEvent.getParameter("selectedItem")) {
                    selectedKey = oEvent.getParameter("selectedItem").getKey();
                    if (oEvent.getSource && typeof oEvent.getSource === 'function') {
                        sourceId = oEvent.getSource().getId();
                        console.log("Status filter from ComboBox:", selectedKey);
                    } else {
                        // For simulated events that might not have a real source
                        sourceId = "statusFilterComboBox"; // Default ID for the main status filter
                        console.log("Status filter from simulated ComboBox event:", selectedKey);
                    }
                }
                // Case 2: Called from SegmentedButtonItem press - get key from source
                else if (oEvent.getSource && typeof oEvent.getSource === 'function' && oEvent.getSource().getKey) {
                    selectedKey = oEvent.getSource().getKey();
                    sourceId = oEvent.getSource().getId();
                    console.log("Status filter from SegmentedButton:", selectedKey);
                }
                // Case 3: Special case for TabFilter buttons which have their own ID pattern
                else if (oEvent.getSource && typeof oEvent.getSource === 'function') {
                    const source = oEvent.getSource();
                    // Try to get ID and key from button
                    sourceId = source.getId();
                    // Check if this is a button with a specific filter value set as custom data
                    if (source.data && typeof source.data === 'function') {
                        selectedKey = source.data("filterValue") || source.getText();
                        console.log("Status filter from custom button:", selectedKey);
                    } else {
                        // If no custom data, try to get from button text or ID
                        selectedKey = source.getText ? source.getText() :
                            (sourceId.includes("invalid") ? "Invalid" :
                                sourceId.includes("valid") ? "Valid" :
                                    sourceId.includes("all") ? "All" : "All");
                        console.log("Status filter inferred from button:", selectedKey);
                    }
                }
                // Case 4: Direct call with a specific key (fallback)
                else if (typeof oEvent === 'string') {
                    selectedKey = oEvent;
                    sourceId = "statusFilterComboBox"; // Default
                    console.log("Status filter from direct key:", selectedKey);
                }
                // Case 5: Last fallback for simulated events
                else if (oEvent && typeof oEvent === 'object') {
                    // Try to extract key from the event object directly
                    if (oEvent.key) {
                        selectedKey = oEvent.key;
                    } else if (oEvent.selectedKey) {
                        selectedKey = oEvent.selectedKey;
                    } else {
                        selectedKey = "All"; // Default fallback
                    }
                    sourceId = oEvent.id || "statusFilterComboBox";
                    console.log("Status filter from object:", selectedKey);
                }

                // If we couldn't get a key, log error and return
                if (!selectedKey) {
                    console.warn("Status filter change: Could not determine selected key");
                    console.log("Event object:", oEvent);
                    return;
                }

                // Use default filter ID if none was determined
                if (!sourceId) {
                    sourceId = "statusFilterComboBox";
                }

                // Get filter ID from source ID (removing view prefix if needed)
                let filterId = sourceId;
                if (this.getView()) {
                    const viewPrefix = this.getView().getId() + "--";
                    if (filterId.startsWith(viewPrefix)) {
                        filterId = filterId.replace(viewPrefix, "");
                    } else {
                        // Try standard ID splitting
                        const parts = filterId.split("--");
                        if (parts.length > 1) {
                            filterId = parts[parts.length - 1];
                        }
                    }
                }

                console.log("Status filter info:", {
                    sourceId: sourceId,
                    filterId: filterId,
                    selectedKey: selectedKey
                });

                // Special handling for segmented buttons with IDs that don't match filter fields
                if (filterId.includes("itemsBtn") || filterId.includes("validItemsBtn") || filterId.includes("invalidItemsBtn")) {
                    // Map segment button IDs to status values
                    if (filterId.includes("invalidItemsBtn")) {
                        filterId = "statusFilter";
                        selectedKey = "Invalid";
                    } else if (filterId.includes("validItemsBtn")) {
                        filterId = "statusFilter";
                        selectedKey = "Valid";
                    } else if (filterId.includes("allItemsBtn")) {
                        filterId = "statusFilter";
                        selectedKey = "All";
                    }
                }

                // Check if we have a mapping for this filter ID
                let filterField = this._filterFields[filterId];

                // If no mapping exists but it's a status filter, use default status mapping
                if (!filterField && (filterId.includes("status") || filterId.includes("Status"))) {
                    filterId = "statusFilter";
                    filterField = "Status";
                    this._filterFields[filterId] = filterField;
                }

                console.log("Mapped filter:", {
                    filterId: filterId,
                    filterField: filterField,
                    selectedKey: selectedKey
                });

                // IMPORTANT: When All is selected, clear ALL status filters
                if (selectedKey === "All") {
                    // Clear all status-related filters
                    Object.keys(this._filterValues).forEach(key => {
                        if (key.toLowerCase().includes("status") ||
                            this._filterFields[key] === "Status" ||
                            key.includes("itemsBtn")) {
                            console.log(`Removing status filter: ${key}`);
                            delete this._filterValues[key];
                        }
                    });
                } else {
                    // For non-All selections, set the specific filter
                    this._filterValues[filterId] = selectedKey;
                }

                // Apply filters
                console.log("Current filter values after status change:", JSON.stringify(this._filterValues));
                this.applyFilters();
            } catch (error) {
                console.error("Error in status filter change:", error);
                if (this._errorHandler) {
                    this._errorHandler.showError("Failed to update status filter: " + error.message);
                }
            }
        },
        /**
         * Handle search in items table
         * @param {sap.ui.base.Event} oEvent The search event
         */
        onSearchItems: function (oEvent) {
            try {
                const sQuery = oEvent.getParameter("query");
                console.log("Search query:", sQuery);

                const oTable = this.byId(this._tableId);
                if (!oTable) {
                    console.warn(`Table with ID '${this._tableId}' not found`);
                    return;
                }

                const oBinding = oTable.getBinding("items");
                if (!oBinding) {
                    console.warn("Table has no binding");
                    return;
                }

                let aFilters = [];

                if (sQuery && sQuery.length > 0) {
                    // Get search fields from filter fields, but use all if not specified
                    let searchFields = Object.values(this._filterFields);
                    if (!searchFields.length) {
                        // Default search fields if none defined
                        searchFields = [
                            "ServiceEntrySheetName",
                            "Supplier",
                            "PurchaseOrder",
                            "SequenceNumber",
                            "Plant"
                        ];
                    }

                    console.log("Searching across fields:", searchFields);

                    const aSearchFilters = searchFields.map(field =>
                        new Filter(field, FilterOperator.Contains, sQuery)
                    );

                    // Combine with OR
                    aFilters.push(new Filter({
                        filters: aSearchFilters,
                        and: false
                    }));
                }

                // Apply search filters
                console.log(`Applying ${aFilters.length > 0 ? aFilters.length : 'no'} search filters`);
                oBinding.filter(aFilters);

                // Update filtered count
                this._updateFilteredCount(oBinding.getLength());
            } catch (error) {
                console.error("Error in search:", error);
                if (this._errorHandler) {
                    this._errorHandler.showError("Search failed: " + error.message);
                }
            }
        },

        /**
         * Update the filtered count in the model
         * @param {Number} count - Number of filtered items
         * @private
         */
        _updateFilteredCount: function (count) {
            try {
                // Update in model if it exists
                const modelName = this._modelName || "serviceEntrySheets";
                const model = this.getView().getModel(modelName);
                if (model) {
                    model.setProperty("/filteredCount", count);
                    console.log(`Updated filtered count to ${count} in model ${modelName}`);
                } else {
                    console.warn(`Model '${modelName}' not found for updating filtered count`);
                }
            } catch (error) {
                console.error("Error updating filtered count:", error);
            }
        },
        /**
         * Update UI elements to indicate which filters are active
         * @private
         */
        _updateFilterIndicators: function () {
            try {
                // Get the filter info panel if it exists
                const filterInfoPanel = this.byId("filterInfoPanel");
                if (!filterInfoPanel) {
                    return; // No panel to update
                }

                // Count active filters
                const textFilterCount = Object.keys(this._filterValues).length;
                const totalFilterCount = textFilterCount + dateFilterCount;

                // Update filter count text
                const filterCountText = this.byId("filterCountText");
                if (filterCountText) {
                    filterCountText.setText(`Active Filters: ${totalFilterCount}`);
                    filterCountText.setVisible(totalFilterCount > 0);
                }

                // Update filter info panel visibility
                filterInfoPanel.setVisible(totalFilterCount > 0);

                // Optionally add filter chips for each active filter
                const filterChipContainer = this.byId("filterChipContainer");
                if (filterChipContainer) {
                    // Clear existing chips
                    filterChipContainer.destroyItems();

                    // Add chips for text filters
                    for (const filterId in this._filterValues) {
                        const filterValue = this._filterValues[filterId];
                        const filterField = this._filterFields[filterId] || filterId;

                        // Create a readable label
                        const fieldLabel = this._getReadableFieldName(filterField);

                        // Create a chip
                        const chip = new sap.m.Chip({
                            text: `${fieldLabel}: ${filterValue}`,
                            press: function () {
                                // Allow clicking on chip to remove filter
                                delete this._filterValues[filterId];
                                this.applyFilters();
                            }.bind(this)
                        });

                        filterChipContainer.addItem(chip);
                    }
                }
            } catch (error) {
                console.error("Error updating filter indicators:", error);
            }
        },
        // In the BaseFilterController.js file, add this to the return statement:
        /**
         * Handle account assignment filter change event
         * @param {sap.ui.base.Event} oEvent The event object
         */
        onAccountAssignmentFilterChange: function (oEvent) {
            try {
                const oSource = oEvent.getSource();
                const selectedItem = oEvent.getParameter("selectedItem");

                if (!selectedItem) {
                    return;
                }

                const selectedKey = selectedItem.getKey();
                let sFilterId = oSource.getId();

                // Remove view prefix if it exists
                if (this.getView()) {
                    const viewPrefix = this.getView().getId() + "--";
                    if (sFilterId.startsWith(viewPrefix)) {
                        sFilterId = sFilterId.replace(viewPrefix, "");
                    } else {
                        // Standard ID splitting
                        const parts = sFilterId.split("--");
                        if (parts.length > 1) {
                            sFilterId = parts[parts.length - 1];
                        }
                    }
                }

                console.log("Account Assignment filter changed:", {
                    originalId: oSource.getId(),
                    resolvedId: sFilterId,
                    selectedKey: selectedKey
                });

                // When "All" is selected, clear the filter
                if (selectedKey === "All") {
                    delete this._filterValues[sFilterId];
                } else {
                    // Store filter value
                    this._filterValues[sFilterId] = selectedKey;
                }

                // Apply filters
                this.applyFilters();
            } catch (error) {
                console.error("Error in account assignment filter change:", error);
                if (this._errorHandler) {
                    this._errorHandler.showError("Failed to update account assignment filter: " + error.message);
                }
            }
        },
        /**
         * Handle reset filters button press
         */
        onResetFilters: function () {
            this.resetFilters();
            sap.m.MessageToast.show("Filters reset");
        },
        /**
         * Convert a field name to a more readable format
         * @param {String} fieldName - The field name to convert
         * @returns {String} A more readable field name
         * @private
         */
        _getReadableFieldName: function (fieldName) {
            // Map of field names to readable labels
            const fieldLabels = {
                "SequenceNumber": "Sequence No.",
                "Supplier": "Supplier",
                "PurchaseOrder": "PO Number",
                "ServiceEntrySheetName": "SES Name",
                "Plant": "Plant",
                "Status": "Status",
                "CostCenter": "Cost Center",
                "GLAccount": "G/L Account",
                "WBSElement": "WBS Element",
                "PurchasingOrganization": "Purchasing Org",
                "PurchasingGroup": "Purchasing Group",
                "ServicePerformanceDate": "Service Date",
                "PostingDate": "Posting Date",
                "DocumentDate": "Document Date"
            };

            // Return the mapped label or format the field name
            return fieldLabels[fieldName] || this._formatFieldName(fieldName);
        },

        /**
         * Format a camelCase or PascalCase field name into a space-separated label
         * @param {String} fieldName - The field name to format
         * @returns {String} The formatted field name
         * @private
         */
        _formatFieldName: function (fieldName) {
            // Insert a space before each capital letter and trim
            return fieldName
                .replace(/([A-Z])/g, ' $1')
                .replace(/^./, function (str) { return str.toUpperCase(); })
                .trim();
        }
    });
});