sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap/ui/model/Filter",
    "sap/ui/model/FilterOperator",
    "sap/m/Input", // Added for type checking
    "sap/m/SearchField", // Added for type checking
    "sap/m/ComboBox", // Added for type checking
    "sap/m/MultiComboBox", // Added for new filter type
    "sap/m/Select", // Added for type checking
    "sap/m/DatePicker", // Added for new filter type
    "sap/m/DateRangeSelection", // Added for new filter type
    "sap/m/SegmentedButton" // Added for type checking
], function (Controller, Filter, FilterOperator, Input, SearchField, ComboBox, MultiComboBox, Select, DatePicker, DateRangeSelection, SegmentedButton) {
    "use strict";

    return Controller.extend("wbscreate.controller.BaseFilterController", {
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

            // _filterValues will now be populated by applyFilters based on current UI state
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
                // Clear internal filter values storage
                this._filterValues = {};
                console.log("Resetting filters...");

                // Reset filter UI elements
                for (const filterId in this._filterFields) {
                    const filterControl = this.byId(filterId);

                    if (!filterControl) {
                        console.warn(`Control not found for ID: ${filterId}. Skipping reset.`);
                        continue; // Skip to next control
                    }

                    const controlType = filterControl.getMetadata().getName();
                    console.log(`Attempting to reset control: ${filterId}, type: ${controlType}`);

                    try {
                        if (filterControl instanceof Input || filterControl instanceof SearchField) {
                            filterControl.setValue("");
                        } else if (filterControl instanceof ComboBox || filterControl instanceof Select) {
                            // For single-select, set to empty or a default 'All' key if it exists
                            // Assuming "All" is a common key for reset in ComboBoxes
                            const allItem = filterControl.getItems().find(item => item.getKey() === "All");
                            if (allItem) {
                                filterControl.setSelectedKey("All");
                            } else {
                                filterControl.setSelectedKey(""); // Clear selection
                            }
                        } else if (filterControl instanceof MultiComboBox) {
                            filterControl.setSelectedKeys([]); // Clear all selected keys
                        } else if (filterControl instanceof DatePicker) {
                            filterControl.setValue(""); // Clear the date input
                        } else if (filterControl instanceof DateRangeSelection) {
                            filterControl.setFrom(""); // Clear from date
                            filterControl.setTo("");   // Clear to date
                        } else if (filterControl instanceof SegmentedButton) {
                            // Find the "All" button or select the first one if "All" is not present
                            const allButton = filterControl.getItems().find(item =>
                                item.getKey() === "All" || item.getText().toLowerCase() === "all");
                            if (allButton) {
                                filterControl.setSelectedButton(allButton);
                            } else if (filterControl.getItems().length > 0) {
                                filterControl.setSelectedButton(filterControl.getItems()[0]);
                            }
                        } else {
                            console.warn(`Unsupported control type ${controlType} for ID ${filterId}. Manual reset may be required.`);
                        }
                    } catch (controlError) {
                        console.warn(`Could not reset control ${filterId} (${controlType}): ${controlError.message}`);
                    }
                }

                // Apply empty filters to refresh the table
                this.applyFilters();
                console.log("All filters reset successfully");
            } catch (error) {
                console.error("Error resetting filters:", error);
                // If you have an errorHandler service injected, use it here
                if (this._errorHandler && typeof this._errorHandler.showError === 'function') {
                    this._errorHandler.showError("Failed to reset filters: " + error.message);
                }
            }
        },

        /**
         * Helper method to get the current value(s) from a filter control.
         * @param {sap.ui.core.Control} oControl - The UI5 control.
         * @returns {any|Array} The value(s) of the control.
         * @private
         */
        _getControlValue: function (oControl) {
            if (!oControl) {
                return null;
            }
            const controlType = oControl.getMetadata().getName();

            if (oControl instanceof Input || oControl instanceof SearchField) {
                return oControl.getValue();
            } else if (oControl instanceof ComboBox || oControl instanceof Select || oControl instanceof SegmentedButton) {
                return oControl.getSelectedKey();
            } else if (oControl instanceof MultiComboBox) {
                return oControl.getSelectedKeys(); // Returns an array of keys
            } else if (oControl instanceof DatePicker) {
                return oControl.getDateValue(); // Returns a Date object
            } else if (oControl instanceof DateRangeSelection) {
                return {
                    from: oControl.getFrom(), // Returns a Date object
                    to: oControl.getTo()      // Returns a Date object
                };
            }
            console.warn(`_getControlValue: Unsupported control type ${controlType} for value extraction.`);
            return null;
        },

        /**
         * Apply current filters to the table
         */
        applyFilters: function () {
            try {
                // Get the table binding
                let oTable = this.byId(this._tableId);
                if (!oTable) {
                    console.warn(`Table with ID '${this._tableId}' not found in view ${this.getView().getId()}. Attempting global lookup.`);
                    oTable = sap.ui.getCore().byId(this._tableId); // Fallback to global lookup
                    if (!oTable) {
                        console.error(`Table with ID '${this._tableId}' could not be found.`);
                        return;
                    }
                }

                let oBinding = oTable.getBinding("items");
                if (!oBinding) {
                    console.warn("Table has no binding for 'items'. Checking for 'rows' binding.");
                    oBinding = oTable.getBinding("rows"); // For sap.ui.table.Table
                    if (!oBinding) {
                        console.error("Table has no binding for 'items' or 'rows'. Cannot apply filters.");
                        return;
                    }
                }

                // Create filter array
                const aFilters = [];
                // Clear previous filter values before populating new ones from UI
                this._filterValues = {};

                console.log("Collecting filter values from UI controls...");
                for (const filterId in this._filterFields) {
                    const modelProperty = this._filterFields[filterId];
                    const filterControl = this.byId(filterId);

                    if (!filterControl) {
                        console.warn(`Filter control with ID '${filterId}' not found. Skipping.`);
                        continue;
                    }

                    let controlValue = this._getControlValue(filterControl);

                    // Store the current value for potential future reference
                    this._filterValues[filterId] = controlValue;

                    // --- Handle special cases first ---
                    if (controlValue === null || controlValue === undefined || controlValue === "") {
                        continue;
                    }

                    // For ComboBox or SegmentedButton, if "All" is selected, skip filtering
                    if ((filterControl instanceof ComboBox || filterControl instanceof SegmentedButton) && controlValue === "All") {
                        continue;
                    }

                    // For MultiComboBox, if "All" is selected or no keys selected, skip
                    if (filterControl instanceof MultiComboBox && (controlValue.length === 0 || controlValue.includes("All"))) {
                        continue;
                    }

                    // --- Apply filters based on field type ---
                    if (filterControl instanceof MultiComboBox) {
                        // Handle MultiComboBox
                        const multiFilters = controlValue.map(key => new Filter(modelProperty, FilterOperator.EQ, key));
                        if (multiFilters.length > 0) {
                            aFilters.push(new Filter({ filters: multiFilters, and: false }));
                            console.log(`Added MultiComboBox filter for ${modelProperty}: ${controlValue.join(', ')}`);
                        }
                    } else if (filterControl instanceof DatePicker) {
                        // Handle DatePicker
                        const date = controlValue;
                        if (date instanceof Date && !isNaN(date.getTime())) {
                            date.setHours(0, 0, 0, 0);
                            const nextDay = new Date(date);
                            nextDay.setDate(date.getDate() + 1);
                            aFilters.push(new Filter(modelProperty, FilterOperator.GE, date));
                            aFilters.push(new Filter(modelProperty, FilterOperator.LT, nextDay));
                            console.log(`Added DatePicker filter for ${modelProperty}: ${date.toISOString()}`);
                        }
                    } else if (filterControl instanceof DateRangeSelection) {
                        // Handle DateRangeSelection
                        const { from, to } = controlValue;
                        if (from instanceof Date && !isNaN(from.getTime())) {
                            from.setHours(0, 0, 0, 0);
                            aFilters.push(new Filter(modelProperty, FilterOperator.GE, from));
                        }
                        if (to instanceof Date && !isNaN(to.getTime())) {
                            const nextDayAfterTo = new Date(to);
                            nextDayAfterTo.setDate(to.getDate() + 1);
                            nextDayAfterTo.setHours(0, 0, 0, 0);
                            aFilters.push(new Filter(modelProperty, FilterOperator.LT, nextDayAfterTo));
                        }
                    } else {
                        // Default handling for text and single select controls
                        let operator = FilterOperator.Contains; // Default for text

                        // Use EQ for dropdowns, IDs, and Status
                        if (filterControl instanceof ComboBox || filterControl instanceof Select ||
                            filterControl instanceof SegmentedButton ||
                            modelProperty.toLowerCase().includes("id") ||
                            modelProperty === "Status") {
                            operator = FilterOperator.EQ;
                        }

                        console.log(`Adding filter: ${modelProperty}=${controlValue} using operator ${operator}`);
                        aFilters.push(new Filter(modelProperty, operator, controlValue));
                    }
                }

                // Apply filters to binding
                if (aFilters.length > 0) {
                    console.log(`Applying ${aFilters.length} filters to table binding`);
                    const combinedFilter = new Filter({
                        filters: aFilters,
                        and: true // Combine all individual filters with AND logic
                    });
                    oBinding.filter(combinedFilter);
                } else {
                    console.log("No filters to apply, clearing all filters");
                    oBinding.filter([]); // Clear all filters if no active filter values
                }

                // Update filtered count in the model (requires implementation in concrete controller)
                // Note: For client-side JSONModel, getLength() is synchronous and accurate.
                // For ODataModel, getLength() might return the total count before filtering,
                // or require a dataReceived event handler to get the actual filtered count.
                const filteredCount = oBinding.getLength();
                this._updateFilteredCount(filteredCount); // Placeholder for concrete implementation
                console.log("Filters applied successfully", {
                    filterCount: aFilters.length,
                    resultCount: filteredCount
                });

                // Update UI elements to indicate active filters (requires implementation in concrete controller)
                this._updateFilterIndicators(); // Placeholder for concrete implementation
            } catch (error) {
                console.error("Error applying filters:", error);
                console.log("Current filter values (before error):", this._filterValues);
                console.log("Current filter fields:", this._filterFields);
                // If you have an errorHandler service injected, use it here
                if (this._errorHandler && typeof this._errorHandler.showError === 'function') {
                    this._errorHandler.showError("Failed to apply filters: " + error.message);
                }
            }
        },

        /**
         * Placeholder method to update the displayed count of filtered items.
         * This should be implemented in the concrete controller (e.g., wbscreate.controller.wbscreate)
         * and typically updates a JSONModel property.
         * @param {number} count - The number of filtered items.
         * @private
         */
        _updateFilteredCount: function (count) {
            console.warn("'_updateFilteredCount' not implemented in BaseFilterController. Implement in your concrete controller.");
            // Example implementation in wbscreate.controller.wbscreate:
            // const oUploadSummaryModel = this._modelManager.getModel("uploadSummary");
            // if (oUploadSummaryModel) {
            //     oUploadSummaryModel.setProperty("/filteredCount", count);
            // }
        },

        /**
         * Placeholder method to update UI elements to indicate active filters.
         * This could involve changing icons, showing a summary text, etc.
         * This should be implemented in the concrete controller (e.g., wbscreate.controller.wbscreate).
         * @private
         */
        _updateFilterIndicators: function () {
            console.warn("'_updateFilterIndicators' not implemented in BaseFilterController. Implement in your concrete controller.");
            // Example implementation in wbscreate.controller.wbscreate:
            // const oFilterBar = this.byId("filterBar");
            // if (oFilterBar) {
            //     const activeFilters = Object.values(this._filterValues).filter(val =>
            //         val !== null && val !== undefined && val !== "" && !(Array.isArray(val) && val.length === 0)
            //     ).length;
            //     oFilterBar.setShowClearButton(activeFilters > 0);
            //     oFilterBar.setFilterBarExpanded(activeFilters === 0); // Collapse if no filters
            // }
        },

        /**
         * Parse date filter value (kept for backward compatibility or if plain Input is used for dates)
         * @param {string} dateValue - Date value to parse
         * @returns {Date|null} Parsed date or null
         * @private
         */
        _parseDateFilter: function (dateValue) {
            if (!dateValue) {
                return null;
            }
            try {
                // Try multiple date parsing formats
                const parseFormats = [
                    new Date(dateValue), // ISO format
                    new Date(dateValue.replace(/(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})/, '$3-$2-$1')), // DD/MM/YYYY or DD-MM-YYYY
                    new Date(dateValue.replace(/(\d{4})[/.-](\d{1,2})[/.-](\d{1,2})/, '$1-$2-$3'))  //YYYY/MM/DD or YYYY-MM-DD
                ];

                // Find first valid date
                const validDate = parseFormats.find(date => date instanceof Date && !isNaN(date.getTime()));

                return validDate || null;
            } catch (error) {
                console.warn("Error parsing date filter:", error);
                return null;
            }
        },

        /**
         * Convert a field name to a more readable format
         * @param {String} fieldName - The field name to convert
         * @returns {String} A more readable field name
         * @private
         */
        _getReadableFieldName: function (fieldName) {
            // Map of field names to readable labels for Project Elements
            const fieldLabels = {
                "ProjectElement": "Project Element",
                "ProjectElementDescription": "Description",
                "PlannedStartDate": "Start Date",
                "PlannedEndDate": "End Date",
                "ResponsibleCostCenter": "Cost Center",
                "CompanyCode": "Company Code",
                "ProfitCenter": "Profit Center",
                "ControllingArea": "Controlling Area",
                "Status": "Status",
                "YY1_Categorization1_PTD": "Site Type",
                "YY1_ATMID_PTD": "ATM ID",
                "YY1_OldProjectSiteID_PTD": "Old Project Site ID",
                // Add any new business-relevant fields here
                "ProjectID": "Project ID",
                "Plant": "Plant",
                "CreationDate": "Creation Date"
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