sap.ui.define([
    "sap/ui/base/Object"
], function(BaseObject) {
    "use strict";

    return BaseObject.extend("wbsupload.util.Helpers", {
        /**
         * Format date to a specific format
         * @param {Date|string} date Date to format
         * @param {string} [format] Format string (default: YYYY-MM-DD)
         * @returns {string} Formatted date
         */
        formatDate: function(date, format = "YYYY-MM-DD") {
            if (!date) return "";

            const dateObj = date instanceof Date ? date : new Date(date);

            if (isNaN(dateObj.getTime())) return "";

            const pad = (num) => num.toString().padStart(2, '0');

            const formatters = {
                "YYYY": dateObj.getFullYear(),
                "MM": pad(dateObj.getMonth() + 1),
                "DD": pad(dateObj.getDate()),
                "HH": pad(dateObj.getHours()),
                "mm": pad(dateObj.getMinutes()),
                "ss": pad(dateObj.getSeconds())
            };

            return format.replace(/(YYYY|MM|DD|HH|mm|ss)/g, matched => formatters[matched]);
        },

        /**
         * Validate email address
         * @param {string} email Email to validate
         * @returns {boolean} Is email valid
         */
        validateEmail: function(email) {
            const re = /^(([^<>()\[\]\\.,;:\s@"]+(\.[^<>()\[\]\\.,;:\s@"]+)*)|(".+"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/;
            return re.test(String(email).toLowerCase());
        },

        /**
         * Deep clone an object
         * @param {Object} obj Object to clone
         * @returns {Object} Cloned object
         */
        deepClone: function(obj) {
            if (obj === null || typeof obj !== 'object') {
                return obj;
            }

            // Handle Date
            if (obj instanceof Date) {
                return new Date(obj.getTime());
            }

            // Handle Array
            if (Array.isArray(obj)) {
                return obj.map(item => this.deepClone(item));
            }

            // Handle Object
            const clonedObj = {};
            for (let key in obj) {
                if (Object.prototype.hasOwnProperty.call(obj, key)) {
                    clonedObj[key] = this.deepClone(obj[key]);
                }
            }

            return clonedObj;
        },

        /**
         * Generate unique identifier
         * @param {number} [length] Length of the ID (default: 8)
         * @returns {string} Unique identifier
         */
        generateUniqueId: function(length = 8) {
            const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
            return Array.from(crypto.getRandomValues(new Uint32Array(length)))
                .map((x) => chars[x % chars.length])
                .join('');
        },

        /**
         * Debounce a function
         * @param {Function} func Function to debounce
         * @param {number} wait Wait time in milliseconds
         * @returns {Function} Debounced function
         */
        debounce: function(func, wait) {
            let timeout;
            return function(...args) {
                const context = this;
                clearTimeout(timeout);
                timeout = setTimeout(() => func.apply(context, args), wait);
            };
        },

        /**
         * Convert CSV to JSON
         * @param {string} csv CSV string
         * @param {Object} [config] Configuration options
         * @returns {Array} Parsed JSON array
         */
        csvToJson: function(csv, config = {}) {
            const {
                separator = ',',
                hasHeaders = true
            } = config;

            const lines = csv.split('\n');
            const headers = hasHeaders ? lines[0].split(separator) : null;
            
            const result = lines
                .slice(hasHeaders ? 1 : 0)
                .map(line => {
                    const values = line.split(separator);
                    return headers 
                        ? headers.reduce((obj, header, index) => {
                            obj[header.trim()] = values[index] ? values[index].trim() : '';
                            return obj;
                        }, {})
                        : values;
                });

            return result;
        },

        /**
         * Sanitize input string
         * @param {string} input Input string to sanitize
         * @returns {string} Sanitized string
         */
        sanitizeInput: function(input) {
            if (!input) return '';
            
            return input
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;')
                .replace(/'/g, '&#x27;')
                .replace(/\//g, '&#x2F;')
                .trim();
        },

        /**
         * Check if an object is empty
         * @param {Object} obj Object to check
         * @returns {boolean} Is object empty
         */
        isEmptyObject: function(obj) {
            return obj === null || 
                   obj === undefined || 
                   (typeof obj === 'object' && Object.keys(obj).length === 0);
        },

        /**
         * Convert bytes to human-readable format
         * @param {number} bytes Number of bytes
         * @param {number} [decimals] Number of decimal places
         * @returns {string} Formatted file size
         */
        formatFileSize: function(bytes, decimals = 2) {
            if (bytes === 0) return '0 Bytes';

            const k = 1024;
            const dm = decimals < 0 ? 0 : decimals;
            const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'];

            const i = Math.floor(Math.log(bytes) / Math.log(k));

            return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
        }
    });
});