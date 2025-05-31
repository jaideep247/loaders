sap.ui.define([], function() {
    "use strict";
    
    return function() {
        this._startTime = null;
        this._processed = 0;
        this._total = 0;
        this._successCount = 0;
        this._failureCount = 0;
        this._successRecords = [];
        this._errorRecords = [];
        this._sequenceMap = new Map(); // Add a map to track records by sequence
        
        /**
         * Start tracking with a given total
         * @param {number} total - Total number of items to process
         */
        this.start = function(total) {
            this._startTime = new Date();
            this._total = total;
            this._processed = 0;
            this._successCount = 0;
            this._failureCount = 0;
            this._successRecords = [];
            this._errorRecords = [];
            this._sequenceMap = new Map(); // Reset sequence map
        };
        
        /**
         * Extract sequence from record, checking various possible properties
         * @param {Object} record - Record to extract sequence from
         * @returns {string} Extracted sequence or "Unknown"
         * @private
         */
        this._extractSequence = function(record) {
            if (!record) return "Unknown";
            
            return record.OriginalSequence || 
                   record.originalSequence || 
                   record.Sequence || 
                   (record.entry ? (record.entry.Sequence || record.entry.OriginalSequence) : null) ||
                   (record.OriginalRequest ? record.OriginalRequest.Sequence : null) ||
                   "Unknown";
        };
        
        /**
         * Ensure record has consistent sequence information
         * @param {Object} record - Record to enhance with sequence info
         * @returns {Object} Enhanced record
         * @private
         */
        this._enhanceRecordWithSequence = function(record) {
            if (!record) return record;
            
            // Extract sequence from various possible properties
            const sequence = this._extractSequence(record);
            
            // Create a copy of the record to avoid modifying the original
            const enhancedRecord = { ...record };
            
            // Set both naming conventions for maximum compatibility
            enhancedRecord.OriginalSequence = sequence;
            enhancedRecord.originalSequence = sequence;
            
            // Also ensure the entry has the sequence if it exists
            if (enhancedRecord.entry) {
                enhancedRecord.entry.OriginalSequence = sequence;
                if (!enhancedRecord.entry.Sequence) {
                    enhancedRecord.entry.Sequence = sequence;
                }
            }
            
            return enhancedRecord;
        };
        
        /**
         * Update progress with processed items
         * @param {number} count - Number of items processed
         * @param {boolean} success - Whether the operation was successful
         * @param {Array} records - Records that were processed
         */
        this.update = function(count, success, records = []) {
            this._processed += count;
            
            if (success) {
                this._successCount += count;
                
                // Process and store success records with sequence information
                if (records && records.length) {
                    const enhancedRecords = records.map(record => {
                        const enhancedRecord = this._enhanceRecordWithSequence(record);
                        
                        // Store in sequence map for quick lookup
                        this._sequenceMap.set(enhancedRecord.OriginalSequence, {
                            record: enhancedRecord,
                            status: 'success'
                        });
                        
                        return enhancedRecord;
                    });
                    
                    this._successRecords.push(...enhancedRecords);
                }
            } else {
                this._failureCount += count;
                
                // Process and store error records with sequence information
                if (records && records.length) {
                    const enhancedRecords = records.map(record => {
                        const enhancedRecord = this._enhanceRecordWithSequence(record);
                        
                        // Store in sequence map for quick lookup
                        this._sequenceMap.set(enhancedRecord.OriginalSequence, {
                            record: enhancedRecord,
                            status: 'error'
                        });
                        
                        return enhancedRecord;
                    });
                    
                    this._errorRecords.push(...enhancedRecords);
                }
            }
        };
        
        /**
         * Get current progress with additional sequence information
         * @returns {Object} Progress information
         */
        this.getProgress = function() {
            const elapsed = (new Date() - this._startTime) / 1000;
            const rate = this._processed > 0 ? this._processed / elapsed : 0;
            const remainingSeconds = rate > 0 ? Math.ceil((this._total - this._processed) / rate) : 0;
            
            // Format time remaining
            const hours = Math.floor(remainingSeconds / 3600);
            const minutes = Math.floor((remainingSeconds % 3600) / 60);
            const seconds = remainingSeconds % 60;
            
            let timeRemaining = "Calculating...";
            if (remainingSeconds > 0) {
                if (hours > 0) {
                    timeRemaining = `${hours}h ${minutes}m ${seconds}s`;
                } else if (minutes > 0) {
                    timeRemaining = `${minutes}m ${seconds}s`;
                } else {
                    timeRemaining = `${seconds}s`;
                }
            }
            
            // Ensure all records have consistent sequence information
            const enhancedSuccessRecords = this._successRecords.map(record => 
                this._enhanceRecordWithSequence(record)
            );
            
            const enhancedErrorRecords = this._errorRecords.map(record => 
                this._enhanceRecordWithSequence(record)
            );
            
            return {
                processed: this._processed,
                total: this._total,
                successCount: this._successCount,
                failureCount: this._failureCount,
                successRecords: enhancedSuccessRecords,
                errorRecords: enhancedErrorRecords,
                percentage: this._total > 0 ? Math.round((this._processed / this._total) * 100) : 0,
                timeRemaining: timeRemaining,
                elapsedTime: elapsed,
                sequenceMap: this._sequenceMap // Include sequence map for lookup
            };
        };
        
        /**
         * Look up a record by its sequence
         * @param {string} sequence - Sequence to look up
         * @returns {Object|null} The record data if found, null otherwise
         */
        this.getRecordBySequence = function(sequence) {
            if (!sequence || !this._sequenceMap.has(sequence)) {
                return null;
            }
            
            return this._sequenceMap.get(sequence);
        };
        
        /**
         * Get all tracked sequence identifiers
         * @returns {Array} Array of all sequence identifiers
         */
        this.getAllSequences = function() {
            return Array.from(this._sequenceMap.keys());
        };
    };
});