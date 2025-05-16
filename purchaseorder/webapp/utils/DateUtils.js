sap.ui.define([
    "sap/ui/core/format/DateFormat"
], function (DateFormat) {
    "use strict";

    return {
        /**
         * Parse Excel date values without any conversion
         * @param {any} value - Date value from Excel
         * @returns {string} Original date string
         */
        parseExcelDate: function (value) {
            if (!value) return "";

            // If it's already a Date object, convert to string
            if (value instanceof Date && !isNaN(value)) {
                return this.DateFormat.parse(dateStr);
            }

            // If it's a string, return as-is after trimming
            if (typeof value === 'string') {
                // Check for different date formats
                const formats = [
                    /^\d{4}-\d{2}-\d{2}$/, // yyyy-mm-dd
                    /^\d{2}\.\d{2}\.\d{4}$/, // dd.mm.yyyy
                    /^\d{2}-\d{2}-\d{4}$/, // dd-mm-yyyy
                ];

                const matchedFormat = formats.find(regex => regex.test(value.trim()));

                return matchedFormat ? value.trim() : "";
            }

            // For Excel date serial numbers, convert to original format
            if (typeof value === 'number') {
                // Excel's epoch starts on January 0, 1900
                const excelEpoch = new Date(1899, 11, 30);
                const dateMsFromEpoch = value * 24 * 60 * 60 * 1000;
                const calculatedDate = new Date(excelEpoch.getTime() + dateMsFromEpoch);

                return this._formatOriginalDate(calculatedDate);
            }

            console.warn("parseExcelDate: Could not parse date, returning empty string:", value);
            return "";
        },

        /**
         * Format date to original input format
         * @private
         * @param {Date} date - Date object to format
         * @returns {string} Formatted date string
         */
        _formatOriginalDate: function (date) {
            if (!date) return "";

            // Format as DD.MM.YYYY
            return `${String(date.getDate()).padStart(2, '0')
                }.${String(date.getMonth() + 1).padStart(2, '0')
                }.${date.getFullYear()
                }`;
        },

        /**
         * Format date specifically for OData service
         * @param {string} date - Date string to convert
         * @returns {string} Date in OData format (yyyy-MM-dd)
         */
        formatDateForOData: function (date) {
            if (!date) return null;

            // Handle different input formats
            try {
                // DD.MM.YYYY format
                const ddmmyyyyRegex = /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/;
                const ddmmyyyyMatch = date.trim().match(ddmmyyyyRegex);

                if (ddmmyyyyMatch) {
                    const [, day, month, year] = ddmmyyyyMatch;
                    // Ensure zero-padding for month and day
                    return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
                }

                // yyyy-mm-dd format
                const yyyymmddRegex = /^(\d{4})-(\d{2})-(\d{2})$/;
                const yyyymmddMatch = date.trim().match(yyyymmddRegex);

                if (yyyymmddMatch) {
                    return date.trim();
                }

                // If no valid format found, return as-is
                return date;
            } catch (error) {
                console.warn("formatDateForOData: Could not format date", date, error);
                return date;
            }
        },

        /**
         * Custom date formatter for UI bindings
         * @param {string} date - Date string to format
         * @returns {Date|null} Date object for UI binding
         */
        formatDateForUIBinding: function (date) {
            if (!date) return null;

            try {
                // DD.MM.YYYY format
                const ddmmyyyyRegex = /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/;
                const ddmmyyyyMatch = date.trim().match(ddmmyyyyRegex);

                if (ddmmyyyyMatch) {
                    const [, day, month, year] = ddmmyyyyMatch;
                    // Create a valid Date object
                    return new Date(
                        parseInt(year),
                        parseInt(month) - 1,
                        parseInt(day)
                    );
                }

                // yyyy-mm-dd format
                const yyyymmddRegex = /^(\d{4})-(\d{2})-(\d{2})$/;
                const yyyymmddMatch = date.trim().match(yyyymmddRegex);

                if (yyyymmddMatch) {
                    const [, year, month, day] = yyyymmddMatch;
                    return new Date(
                        parseInt(year),
                        parseInt(month) - 1,
                        parseInt(day)
                    );
                }

                // If no valid parsing possible
                return null;
            } catch (error) {
                console.warn("formatDateForUIBinding: Could not format date", date, error);
                return null;
            }
        },

        /**
         * Get current date in original format
         * @returns {string} Current date in DD.MM.YYYY format
         */
        getCurrentDate: function () {
            const now = new Date();
            return this._formatOriginalDate(now);
        }
    };
});