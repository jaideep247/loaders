sap.ui.define([], function () {
    "use strict";

    return {
        /**
         * Extract error message from an error object, handling various formats
         * @param {Object} error - Error object
         * @returns {string} Extracted error message
         */
        extractErrorMessage: function (error) {
            if (!error) {
                return "Unknown error occurred";
            }

            try {
                // Handle string errors
                if (typeof error === "string") {
                    return error;
                }

                // Handle Error objects
                if (error instanceof Error) {
                    return error.message || error.toString();
                }

                // Handle OData error responses with message property
                if (error.message) {
                    return error.message;
                }

                // Handle detailed OData error responses
                if (error.error && error.error.message) {
                    return error.error.message;
                }

                // Handle SAP UI5 OData error format
                if (error.response) {
                    // For v4 OData errors
                    if (error.response.body) {
                        try {
                            const errorBody = JSON.parse(error.response.body);
                            if (errorBody.error && errorBody.error.message) {
                                return errorBody.error.message.value || errorBody.error.message;
                            }
                        } catch (e) {
                            // If parsing fails, return the response status or message
                            return error.response.statusText || `Error ${error.response.status}`;
                        }
                    }
                    
                    // Return statusText if available
                    if (error.response.statusText) {
                        return `${error.response.statusText} (${error.response.status})`;
                    }
                }

                // Handle SAP Gateway errors
                if (error.responseText) {
                    try {
                        const errorResponse = JSON.parse(error.responseText);
                        if (errorResponse.error && errorResponse.error.message) {
                            return errorResponse.error.message.value || errorResponse.error.message;
                        }
                    } catch (e) {
                        // If parsing fails, return the raw response text (truncated)
                        const maxLength = 100;
                        return error.responseText.length > maxLength ? 
                            error.responseText.substring(0, maxLength) + "..." : 
                            error.responseText;
                    }
                }

                // Fallback to toString() for unknown error formats
                return error.toString();
            } catch (e) {
                console.error("Error extracting error message:", e);
                return "Could not extract error message";
            }
        },

        /**
         * Create a standardized error record for failed entries
         * @param {Object} entry - The entry that failed processing
         * @param {Object} error - Error information
         * @param {number} index - Index of the entry
         * @returns {Object} Standardized error record
         */
        createErrorRecord: function (entry, error, index) {
            const errorMessage = this.extractErrorMessage(error);
            const timestamp = new Date().toISOString();
            
            // Extract sequence from entry or set a default
            const sequence = entry.Sequence || entry.OriginalSequence || `Error-${index}`;
            
            return {
                entry: entry,
                Status: "Error",
                ProcessedAt: timestamp,
                Message: errorMessage,
                OriginalSequence: sequence,
                originalSequence: sequence, // Add both naming conventions for compatibility
                error: errorMessage,
                details: (error.error && error.error.message) || errorMessage,
                errorCode: (error.error && error.error.code) || "ERROR",
                timestamp: timestamp
            };
        },
        
        /**
         * Format validation errors for display
         * @param {Array} invalidEntries - List of invalid entries with validation errors
         * @returns {Array} Formatted validation errors
         */
        formatValidationErrors: function(invalidEntries) {
            if (!invalidEntries || !Array.isArray(invalidEntries)) {
                return [];
            }
            
            return invalidEntries.flatMap(entry => {
                // Extract sequence from multiple possible locations
                const sequence = entry.Sequence || entry.OriginalSequence || "Unknown";
                
                // If no validation errors, create a generic one
                if (!entry.ValidationErrors || entry.ValidationErrors.length === 0) {
                    return [{
                        sequenceId: sequence,
                        field: "Unknown",
                        message: "Entry validation failed",
                        timestamp: new Date().toISOString()
                    }];
                }
                
                // Format each validation error with sequence information
                return entry.ValidationErrors.map(error => ({
                    sequenceId: sequence,
                    field: error.field || "Unknown",
                    message: error.message || "Validation failed",
                    timestamp: new Date().toISOString()
                }));
            });
        },
        
        /**
         * Enhance error records with sequence information
         * @param {Array} errorRecords - Array of error records
         * @returns {Array} Enhanced error records with sequence information
         */
        enhanceErrorRecordsWithSequence: function(errorRecords) {
            if (!errorRecords || !Array.isArray(errorRecords)) {
                return [];
            }
    
            return errorRecords.map(record => {
                // Extract sequence from multiple possible locations
                const sequence = 
                    record.OriginalSequence || 
                    record.originalSequence || 
                    record.Sequence || 
                    (record.entry ? (record.entry.Sequence || record.entry.OriginalSequence) : null) ||
                    "Unknown";
                
                // Create a shallow copy to avoid modifying the original
                const enhancedRecord = { ...record };
                
                // Set sequence information consistently
                enhancedRecord.OriginalSequence = sequence;
                enhancedRecord.originalSequence = sequence;
                
                // If there's an entry, ensure it also has the sequence
                if (enhancedRecord.entry) {
                    enhancedRecord.entry.OriginalSequence = sequence;
                    if (!enhancedRecord.entry.Sequence) {
                        enhancedRecord.entry.Sequence = sequence;
                    }
                }
                
                return enhancedRecord;
            });
        }
    };
});