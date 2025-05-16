sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap/ui/model/Filter",
    "sap/ui/model/FilterOperator"
], function (Controller, Filter, FilterOperator) {
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

                            // Use exact match for status and specific fields
                            if (filterField === "Status" ||
                                filterId.toLowerCase().includes("status") ||
                                filterField === "ProjectElement" ||
                                filterField.toLowerCase().includes("id")) {
                                operator = FilterOperator.EQ;
                                console.log(`Using EQ operator for ${filterField}`);
                            }

                            // Special handling for date fields
                            if (filterField.toLowerCase().includes("date")) {
                                // Try to parse date and use exact match
                                const parsedDate = this._parseDateFilter(filterValue);
                                if (parsedDate) {
                                    aFilters.push(new Filter(filterField, FilterOperator.EQ, parsedDate));
                                    console.log(`Added date filter: ${filterField}=${parsedDate}`);
                                    continue;
                                }
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
         * Parse date filter value
         * @param {string} dateValue - Date value to parse
         * @returns {Date|null} Parsed date or null
         * @private
         */
        _parseDateFilter: function (dateValue) {
            try {
                // Try multiple date parsing formats
                const parseFormats = [
                    // ISO format
                    new Date(dateValue),
                    // Try different separators and formats
                    new Date(dateValue.replace(/(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})/, '$3-$2-$1')),
                    new Date(dateValue.replace(/(\d{4})[/.-](\d{1,2})[/.-](\d{1,2})/, '$1-$2-$3'))
                ];

                // Find first valid date
                const validDate = parseFormats.find(date => !isNaN(date.getTime()));

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
                "YY1_OldProjectSiteID_PTD": "Old Project Site ID"
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