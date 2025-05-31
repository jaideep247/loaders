sap.ui.define([
  "sap/ui/base/Object",
  "sap/m/MessageToast",
  "sap/ui/model/odata/v2/ODataModel",
  "sap/ui/thirdparty/jquery" // Ensure jQuery is available for AJAX for CSRF token
], function (BaseObject, MessageToast, ODataModel, jQuery) { // Add jQuery to the function parameters
  "use strict";

  return BaseObject.extend("supplierinvoice.service.ODataService", {

    // Constants for batch processing and retries
    BATCH_SIZE: 10, // Number of transactions per OData batch request
    MAX_RETRIES: 3, // Maximum number of retries for a failed batch
    RETRY_DELAY: 2000, // Delay in milliseconds before retrying a batch

    constructor: function (baseURL) {
      this.SERVICE_URL = (baseURL || "") + "/sap/opu/odata/sap/API_SUPPLIERINVOICE_PROCESS_SRV";
      console.log("ODataService: Initializing with SERVICE_URL:", this.SERVICE_URL);

      // Create OData model
      this.oModel = new ODataModel(this.SERVICE_URL, {
        useBatch: true, // Enable batch processing
        defaultUpdateMethod: "PUT", // Set default update method
        tokenHandling: true // Enable automatic CSRF token handling by the model (though we're fetching it manually too for initial check)
      });

      // Initialize batch processing metrics
      this._processingMetrics = {
        totalBatches: 0,
        processedBatches: 0,
        currentBatchNumber: 0,
        totalEntries: 0,
        processedEntries: 0,
        startTime: null,
        estimatedTimeRemaining: null,
        batchTimes: [] // Store processing time for each batch to estimate remaining time
      };

      // Public functions to set UI update callbacks
      this._updateProgressIndicator = null; // Callback for overall progress
      this._updateProcessDisplay = null; // Callback for detailed process messages
    },

    /**
     * Sets the callback function for updating batch processing display.
     * @param {function(object)} batchDisplayUpdateFn - A function that takes an object with batch processing details.
     * @public
     */
    setBatchProcessingDisplay: function (batchDisplayUpdateFn) {
      this._updateProcessDisplay = batchDisplayUpdateFn;
    },

    /**
     * Groups invoices by Sequence ID, separating header_credits and debits
     * @param {Array<object>} invoices - Array of invoice objects
     * @returns {Array<object>} Array of grouped invoice objects
     * @private
     */
    _groupInvoicesBySequenceId: function (invoices) {
      console.log("ODataService: Grouping invoices by Sequence ID");

      // Ensure we're working with an array - your data structure is different
      let invoiceArray;
      if (Array.isArray(invoices)) {
        invoiceArray = invoices;
      } else if (invoices && typeof invoices === 'object') {
        // If it's an object, try to convert to array
        invoiceArray = Object.values(invoices);
      } else {
        console.error("ODataService: Invalid invoices parameter:", invoices);
        return [];
      }

      // Your data structure already has header and debits, so just return as is
      return invoiceArray;
    },

    /**
     * Uploads supplier invoices in chunks using OData batch processing.
     * @param {Array<object>} validTransactions - An array of supplier invoice data to upload.
     * @returns {Promise<object>} A promise that resolves with the combined results (success/failed entries).
     */
    uploadSupplierInvoices: function (validTransactions) {
      console.log("ODataService: Starting uploadSupplierInvoices with", validTransactions.length, "transactions.");
      return new Promise((resolve, reject) => {
        // Add a small delay to ensure UI components are ready and to allow initial rendering
        setTimeout(() => {
          // Group invoices by Sequence ID before processing
          const groupedInvoices = this._groupInvoicesBySequenceId(validTransactions);

          // Reset processing metrics for a new upload cycle
          this._resetProcessingMetrics(groupedInvoices.length);
          this._updateBatchProcessingDisplay({ status: "Starting upload process..." });

          // First fetch the CSRF token. The ODataModel typically handles this,
          // but an explicit fetch can ensure it's fresh before complex operations.
          this._fetchCSRFToken()
            .then((token) => {
              console.log("ODataService: CSRF token fetched successfully.");

              // Split the grouped transactions into manageable chunks
              const transactionChunks = this._chunkTransactions(groupedInvoices);

              // Update metrics with batch information
              this._processingMetrics.totalBatches = transactionChunks.length;

              console.log(
                `ODataService: Processing ${groupedInvoices.length} grouped invoices in ${transactionChunks.length} batches.`
              );

              // Display initial batch information to user
              this._updateBatchProcessingDisplay({
                status: `Divided into ${transactionChunks.length} batches. Starting upload...`
              });

              // Process chunks sequentially to avoid overwhelming the server
              return this._processChunksSequentially(token, transactionChunks);
            })
            .then((results) => {
              console.log("ODataService: All chunks processed. Combining results.");
              // Combine all results from individual chunk processing
              const combinedResults = this._combineResults(results);
              console.log("ODataService: Upload process finished. Combined Results:", combinedResults);
              resolve(combinedResults);
            })
            .catch((error) => {
              console.error("ODataService: Supplier invoice upload failed during initial setup or chunk processing:", error);
              // Update process display with error
              this._updateBatchProcessingDisplay({
                error: error.message || "Upload process failed during initial setup or chunk processing.",
                status: "Upload failed"
              });
              reject(error);
            });
        }, 500); // Increase to 500ms for more reliable initialization
      });
    },

    /**
     * Resets the internal processing metrics.
     * @param {number} totalEntries - The total number of entries to be processed.
     * @private
     */
    _resetProcessingMetrics: function (totalEntries) {
      this._processingMetrics = {
        totalBatches: 0,
        processedBatches: 0,
        currentBatchNumber: 0,
        totalEntries: totalEntries || 0,
        processedEntries: 0,
        startTime: new Date(),
        estimatedTimeRemaining: null,
        batchTimes: []
      };
      console.log("ODataService: Processing metrics reset.");
    },

    /**
     * Updates the UI display with current batch processing information.
     * This method calls a registered callback `_updateProcessDisplay` if available.
     * @param {object} [options] - Options for the display update, e.g., status, error.
     * @private
     */
    _updateBatchProcessingDisplay: function (options = {}) {
      // Calculate estimated remaining time based on average batch processing time
      if (this._processingMetrics.batchTimes.length > 0) {
        const avgBatchTime = this._processingMetrics.batchTimes.reduce((sum, time) => sum + time, 0) /
          this._processingMetrics.batchTimes.length;

        const remainingBatches = this._processingMetrics.totalBatches - this._processingMetrics.processedBatches;
        this._processingMetrics.estimatedTimeRemaining = avgBatchTime * remainingBatches;
      }

      console.log("ODataService: Updating batch display with data:", {
        totalBatches: this._processingMetrics.totalBatches,
        currentBatch: this._processingMetrics.currentBatchNumber,
        processedBatches: this._processingMetrics.processedBatches,
        totalEntries: this._processingMetrics.totalEntries,
        processedEntries: this._processingMetrics.processedEntries,
        estimatedTimeRemaining: this._formatTimeRemaining(this._processingMetrics.estimatedTimeRemaining),
        status: options.status || "Processing",
        error: options.error || null
      });

      // Call the process display update function if provided by the consuming controller/view
      if (this._updateProcessDisplay) {
        this._updateProcessDisplay({
          totalBatches: this._processingMetrics.totalBatches,
          currentBatch: this._processingMetrics.currentBatchNumber,
          processedBatches: this._processingMetrics.processedBatches,
          totalEntries: this._processingMetrics.totalEntries,
          processedEntries: this._processingMetrics.processedEntries,
          progress: this._calculateOverallProgress(),
          estimatedTimeRemaining: this._formatTimeRemaining(this._processingMetrics.estimatedTimeRemaining),
          error: options.error || null,
          status: options.status || "processing"
        });
      }
    },

    /**
     * Formats milliseconds into a human-readable time string.
     * @param {number} milliseconds - Time in milliseconds.
     * @returns {string} Formatted time string.
     * @private
     */
    _formatTimeRemaining: function (milliseconds) {
      if (milliseconds === null || isNaN(milliseconds)) return "Calculating...";

      // Convert to seconds
      const seconds = Math.floor(milliseconds / 1000);

      if (seconds < 60) {
        return `${seconds} second${seconds !== 1 ? 's' : ''}`;
      } else if (seconds < 3600) {
        const minutes = Math.floor(seconds / 60);
        return `${minutes} minute${minutes !== 1 ? 's' : ''}`;
      } else {
        const hours = Math.floor(seconds / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);
        return `${hours} hour${hours !== 1 ? 's' : ''} ${minutes} minute${minutes !== 1 ? 's' : ''}`;
      }
    },

    /**
     * Calculates the overall progress as a percentage.
     * @returns {number} Progress percentage (0-100).
     * @private
     */
    _calculateOverallProgress: function () {
      if (this._processingMetrics.totalBatches === 0) return 0;
      return Math.round((this._processingMetrics.processedBatches / this._processingMetrics.totalBatches) * 100);
    },

    /**
     * Chunks a list of transactions into smaller arrays based on BATCH_SIZE.
     * @param {Array<object>} transactions - The list of transactions to chunk.
     * @returns {Array<Array<object>>} An array of transaction chunks.
     * @private
     */
    _chunkTransactions: function (transactions) {
      const chunks = [];
      // Ensure we're working with an array
      const validTransactions = Array.isArray(transactions) ? transactions : Object.values(transactions);

      for (let i = 0; i < validTransactions.length; i += this.BATCH_SIZE) {
        chunks.push(validTransactions.slice(i, i + this.BATCH_SIZE));
      }
      console.log("ODataService: Transactions chunked into", chunks.length, "batches.");
      return chunks;
    },

    /**
     * Processes an array of transaction chunks sequentially.
     * @param {string} token - The CSRF token.
     * @param {Array<Array<object>>} chunks - An array of transaction chunks.
     * @returns {Promise<Array<object>>} A promise that resolves with the results of each chunk.
     * @private
     */
    _processChunksSequentially: function (token, chunks) {
      const results = [];
      let currentChunkIndex = 0;

      const processNextChunk = () => {
        if (currentChunkIndex >= chunks.length) {
          console.log("ODataService: All chunks processed successfully.");
          return Promise.resolve(results); // All chunks processed
        }

        const chunk = chunks[currentChunkIndex];
        this._processingMetrics.currentBatchNumber = currentChunkIndex + 1; // Update current batch number for display

        this._updateBatchProcessingDisplay({
          status: `Processing batch ${this._processingMetrics.currentBatchNumber} of ${this._processingMetrics.totalBatches}`
        });

        console.log(
          `ODataService: Processing batch ${this._processingMetrics.currentBatchNumber} of ${this._processingMetrics.totalBatches} (${chunk.length} entries)`
        );

        const batchStartTime = new Date();

        // Process this chunk with retry capability
        return this._processChunkWithRetry(token, chunk, 0).then(
          (chunkResult) => {
            results.push(chunkResult); // Collect result from this chunk

            // Update metrics
            this._processingMetrics.processedBatches++;
            this._processingMetrics.processedEntries += chunk.length; // Assume all in chunk were attempted

            // Store batch processing time for time estimation
            const batchEndTime = new Date();
            const batchProcessingTime = batchEndTime - batchStartTime;
            this._processingMetrics.batchTimes.push(batchProcessingTime);

            // Update batch processing display (e.g., progress bar)
            this._updateBatchProcessingDisplay();

            // Call progress indicator if available
            if (this._updateProgressIndicator) {
              this._updateProgressIndicator(this._calculateOverallProgress());
            }

            currentChunkIndex++; // Move to the next chunk
            return processNextChunk(); // Recursively call for the next chunk
          }
        ).catch(err => {
          console.error("ODataService: Error processing chunk, stopping sequential process:", err);
          // If a chunk fails critically after retries, reject the whole process
          return Promise.reject(err);
        });
      };

      // Start processing the first chunk
      return processNextChunk();
    },

    /**
     * Processes a single chunk with retry mechanism.
     * @param {string} token - The CSRF token.
     * @param {Array<object>} chunk - The current chunk of transactions.
     * @param {number} retryCount - Current retry attempt count.
     * @returns {Promise<object>} A promise that resolves with the result of the chunk processing.
     * @private
     */
    _processChunkWithRetry: function (token, chunk, retryCount) {
      return new Promise((resolve, reject) => {
        if (retryCount > 0) {
          console.log(`Retry ${retryCount} for chunk after error`);
        }

        this._createSupplierInvoicesViaOData(token, chunk)
          .then((result) => {
            resolve(result);
          })
          .catch((error) => {
            console.error("Detailed batch error:", error);

            // Enhanced error logging
            if (error.response) {
              console.error("Response status:", error.response.status);
              console.error("Response data:", error.response.data);
            }

            if (retryCount < this.MAX_RETRIES && this._isRetriableError(error)) {
              setTimeout(() => {
                this._processChunkWithRetry(token, chunk, retryCount + 1)
                  .then(resolve)
                  .catch(reject);
              }, this.RETRY_DELAY);
            } else {
              // Return structured error result
              resolve({
                status: "ERROR",
                message: error.message,
                failedEntries: chunk.map((tx) => ({
                  "Sequence ID": tx["Sequence ID"] || tx["Sequence Id"],
                  uploadStatus: "FAILED",
                  statusMessage: error.message
                })),
                successEntries: []
              });
            }
          });
      });
    },

    /**
     * Creates supplier invoices via OData batch request.
     * @param {string} csrfToken - The CSRF token.
     * @param {Array<object>} invoices - An array of invoice data for the current chunk.
     * @returns {Promise<object>} A promise that resolves with the processed batch results.
     * @private
     */
    _createSupplierInvoicesViaOData: function (csrfToken, invoices) {
      console.log("ODataService: Creating invoices via OData with", invoices.length, "invoices");

      // 1. Ensure model is initialized
      if (!this.oModel) {
        console.error("ODataModel not initialized!");
        return Promise.reject("Model not initialized");
      }

      // Set deferred group for these operations to ensure they are batched
      this.oModel.setDeferredGroups(["supplierInvoiceBatch"]);

      // 3. Create batch operations
      invoices.forEach((invoice, index) => {
        try {
          const payload = this._convertToODataFormat(invoice);
          debugger
          console.log(`Creating entry ${index + 1}/${invoices.length}`);

          // Create entry with explicit Content-ID and assign to the deferred group
          this.oModel.createEntry("/A_SupplierInvoice", {
            properties: payload,
            groupId: "supplierInvoiceBatch"
          });
        } catch (e) {
          console.error("Error converting invoice to OData format for entry:", invoice["Sequence ID"] || invoice["Sequence Id"], e);
        }
      });

      // 4. Submit batch
      return new Promise((resolve, reject) => {
        const pendingChanges = this.oModel.hasPendingChanges(true);
        if (!pendingChanges || Object.keys(this.oModel.getPendingChanges()).length === 0) {
          console.warn("No pending changes to submit for batch.");
          resolve(this._processBatchResults(null, invoices, true));
          return;
        }

        this.oModel.submitChanges({
          groupId: "supplierInvoiceBatch",
          success: (data) => {
            console.log("Batch success", data);
            resolve(this._processBatchResults(data, invoices));
          },
          error: (error) => {
            console.error("Batch error", error);
            reject({
              status: "ERROR",
              message: "Batch request failed: " + (error.message || JSON.stringify(error)),
              response: error.response
            });
          }
        });
      });
    },

    /**
     * Determines if an error is transient and can be retried.
     * @param {object} error - The error object.
     * @returns {boolean} True if the error is retriable, false otherwise.
     * @private
     */
    _isRetriableError: function (error) {
      // Common retriable HTTP status codes: 500 (Internal Server Error, if transient), 503 (Service Unavailable), 429 (Too Many Requests)
      // OData specific errors might include: "The backend system is currently busy." etc.
      const statusCode = error.statusCode || (error.response && error.response.statusCode);
      if (statusCode === 500 || statusCode === 503 || statusCode === 429) {
        return true;
      }
      // Check for specific messages that might indicate transient issues
      const errorMessage = (error.message || "").toLowerCase();
      if (errorMessage.includes("service unavailable") || errorMessage.includes("timeout")) {
        return true;
      }
      return false;
    },

    /**
     * Converts grouped invoice to OData format with multiple line items
     * @param {object} groupedInvoice - The grouped invoice object with header and line items
     * @returns {object} The OData formatted payload
     * @private
     */
    /*   _convertToODataFormat: function (groupedInvoice) {
         console.log("Converting grouped invoice to OData format:", groupedInvoice["Sequence ID"] || groupedInvoice["Sequence Id"]);
   
         try {
           // Extract header data - check if it's nested or direct
           const headerInvoice = groupedInvoice.header || groupedInvoice;
   
           // Base invoice properties from header
           const oDataInvoice = {
             CompanyCode: String(headerInvoice["CompanyCode"]),
             DocumentDate: this._formatDate(headerInvoice["DocumentDate"]),
             PostingDate: this._formatDate(headerInvoice["PostingDate"]),
             SupplierInvoiceIDByInvcgParty: String(headerInvoice["SupplierInvoiceIDByInvcgParty"]),
             InvoicingParty: String(headerInvoice["InvoicingParty"]),
             DocumentCurrency: headerInvoice["DocumentCurrency"],
             InvoiceGrossAmount: String(headerInvoice["InvoiceGrossAmount"]),
             DocumentHeaderText: headerInvoice["DocumentHeaderText"] || "",
             PaymentTerms: String(headerInvoice["PaymentTerms"]),
             SupplierPostingLineItemText: headerInvoice["Supplierlineitemtext"] || "",
             AccountingDocumentType: headerInvoice["AccountingDocumentType"] || "KR",
             InvoiceReference: String(headerInvoice["InvoiceReference"] || ""),
             InvoiceReferenceFiscalYear: String(headerInvoice["InvoiceReferenceFiscalYear"] || ""),
             AssignmentReference: headerInvoice["AssignmentReference"] || "",
             TaxIsCalculatedAutomatically: headerInvoice["TaxIsCalculatedAutomatically"] === "X" ||
               headerInvoice["TaxIsCalculatedAutomatically"] === true,
             BusinessPlace: String(headerInvoice["BusinessPlace"] || ""),
             BusinessSectionCode: String(headerInvoice["BusinessSectionCode"] || ""),
             TaxDeterminationDate: this._formatDate(headerInvoice["TaxDeterminationDate"] || headerInvoice["DocumentDate"]),
             IN_GSTPartner: String(headerInvoice["GSTPartner"] || ""),
             IN_GSTPlaceOfSupply: headerInvoice["GSTPlaceOfSupply"] || "",
             "__metadata": { // Add metadata type for the header
               "type": "API_SUPPLIERINVOICE_PROCESS_SRV.A_SupplierInvoiceType"
             }
           };
   
           // Initialize to_Item for deep insert of line items
           oDataInvoice.to_Item = {
             results: []
           };
   
           // Process line items for G/L Account Items and Withholding Tax Items
           const lineItems = groupedInvoice.debits || [];
   
           lineItems.forEach((lineItem, index) => {
             const itemNumber = (index + 1).toString().padStart(3, '0'); // Generate item number, e.g., "001", "002"
   
             // Create the main invoice item
             const oDataItem = {
               "SupplierInvoiceItem": itemNumber,
               "DocumentCurrency": lineItem["DocumentCurrency"] || oDataInvoice.DocumentCurrency,
               "SupplierInvoiceItemAmount": String(lineItem["SupplierInvoiceItemAmount"]), // Ensure it's string
               "TaxCode": lineItem["TaxCode"] || "",
               "TaxJurisdiction": lineItem["TaxJurisdiction"] || "", // Assuming this might come from lineItem, add if available
               "SupplierInvoiceItemText": lineItem["SupplierInvoiceItemText"] || lineItem["Supplierlineitemtext"] || "",
               "TaxDeterminationDate": this._formatDate(lineItem["TaxDeterminationDate"] || headerInvoice["TaxDeterminationDate"] || headerInvoice["DocumentDate"]),
               "__metadata": { // Add metadata type for the item
                 "type": "API_SUPPLIERINVOICE_PROCESS_SRV.A_SupplierInvoiceItemType"
               }
               // Add other A_SupplierInvoiceItemType properties as needed from your Excel data and metadata
               // e.g., Quantity, PurchaseOrder, etc.
             };
   
             // G/L Account Items (Debits) - nested under the current invoice item
             if (lineItem["GLAccount"]) {
               oDataItem.to_SupplierInvoiceItemAcctAssgmt = {
                 results: [{
                   "SupplierInvoiceItem": itemNumber, // Link back to parent item
                   "CompanyCode": String(lineItem["s-CompanyCode"] || lineItem["CompanyCode"] || oDataInvoice.CompanyCode), // Ensure company code is derived
                   "CostCenter": lineItem["CostCenter"] || "",
                   "ControllingArea": lineItem["ControllingArea"] || "A000", // Default to A000 if not in Excel
                   "GLAccount": String(lineItem["GLAccount"]),
                   "WBSElement": lineItem["WBSElement"] || "",
                   "DocumentCurrency": lineItem["DocumentCurrency"] || oDataItem.DocumentCurrency,
                   "SupplierInvoiceItemAmount": String(lineItem["SupplierInvoiceItemAmount"]),
                   "TaxCode": lineItem["TaxCode"] || "",
                   "DebitCreditCode": lineItem["DebitCreditCode"] || "S",
                   "SupplierInvoiceItemText": lineItem["SupplierInvoiceItemText"] || lineItem["Supplierlineitemtext"] || "",
                   "AssignmentReference": lineItem["AssignmentReference"] || "",
                   "Quantity": String(lineItem["Quantity"] || "0"), // Ensure quantity is string, default to "0"
                   "__metadata": { // Add metadata type
                     "type": "API_SUPPLIERINVOICE_PROCESS_SRV.A_SuplrInvcItemAcctAssgmtType"
                   }
                   // Add other A_SuplrInvcItemAcctAssgmtType properties as needed
                 }]
               };
             }
   
             // Withholding Tax Items - nested under the current invoice item
             if (lineItem["TDSTAXTYPE"]) {
               oDataItem.to_SuplrInvcItemWhldgTax = { // Correct navigation property name from metadata
                 results: [{
                   "SupplierInvoiceItem": itemNumber, // Link back to parent item
                   "WithholdingTaxType": lineItem["TDSTAXTYPE"] || "",
                   "DocumentCurrency": lineItem["TDSCurrency"] || oDataItem.DocumentCurrency,
                   "WithholdingTaxCode": lineItem["TDSTAXCODE"] || "",
                   // Add other A_SuplrInvcItemWhldgTaxType properties as needed
                   "__metadata": { // Add metadata type
                     "type": "API_SUPPLIERINVOICE_PROCESS_SRV.A_SuplrInvcItemWhldgTaxType"
                   }
                 }]
               };
             }
             // Push the created invoice item (with its nested GL and WHT) to the main invoice's items array
             oDataInvoice.to_Item.results.push(oDataItem);
           });
   
           // Validate numeric fields from header
           if (isNaN(parseFloat(headerInvoice["InvoiceGrossAmount"]))) {
             throw new Error(`Invalid InvoiceGrossAmount: ${headerInvoice["InvoiceGrossAmount"]}`);
           }
   
           // Validate line item amounts (now from the constructed oDataInvoice.to_Item.results)
           oDataInvoice.to_Item.results.forEach((item, index) => {
             if (isNaN(parseFloat(item.SupplierInvoiceItemAmount))) {
               throw new Error(`Invalid SupplierInvoiceItemAmount for line item ${index + 1}: ${item.SupplierInvoiceItemAmount}`);
             }
           });
   
           console.log("Final OData payload:", JSON.stringify(oDataInvoice, null, 2)); // Use JSON.stringify for better logging
           return oDataInvoice;
         } catch (error) {
           console.error('Error in _convertToODataFormat:', error);
           throw error;
         }
       },*/
    _convertToODataFormat: function (groupedInvoice) {
      console.log("Converting grouped invoice to OData format:", groupedInvoice["Sequence ID"] || groupedInvoice["Sequence Id"]);

      try {
        // Extract header data - check if it's nested or direct
        const headerInvoice = groupedInvoice.header || groupedInvoice;

        // Base invoice properties from header
        const oDataInvoice = {
          CompanyCode: String(headerInvoice["CompanyCode"]),
          DocumentDate: this._formatDate(headerInvoice["DocumentDate"]),
          PostingDate: this._formatDate(headerInvoice["PostingDate"]),
          SupplierInvoiceIDByInvcgParty: String(headerInvoice["SupplierInvoiceIDByInvcgParty"]),
          InvoicingParty: String(headerInvoice["InvoicingParty"]),
          DocumentCurrency: headerInvoice["DocumentCurrency"],
          InvoiceGrossAmount: String(headerInvoice["InvoiceGrossAmount"]),
          DocumentHeaderText: headerInvoice["DocumentHeaderText"] || "",
          PaymentTerms: String(headerInvoice["PaymentTerms"]),
          SupplierPostingLineItemText: headerInvoice["Supplierlineitemtext"] || "",
          AccountingDocumentType: headerInvoice["AccountingDocumentType"] || "KR",
          InvoiceReference: String(headerInvoice["InvoiceReference"] || ""),
          InvoiceReferenceFiscalYear: String(headerInvoice["InvoiceReferenceFiscalYear"] || ""),
          AssignmentReference: headerInvoice["AssignmentReference"] || "",
          TaxIsCalculatedAutomatically: headerInvoice["TaxIsCalculatedAutomatically"] === "X" ||
            headerInvoice["TaxIsCalculatedAutomatically"] === true,
          BusinessPlace: String(headerInvoice["BusinessPlace"] || ""),
          BusinessSectionCode: String(headerInvoice["BusinessSectionCode"] || ""),
          TaxDeterminationDate: this._formatDate(headerInvoice["TaxDeterminationDate"] || headerInvoice["DocumentDate"]),
          IN_GSTPartner: String(headerInvoice["GSTPartner"] || ""),
          IN_GSTPlaceOfSupply: headerInvoice["GSTPlaceOfSupply"] || ""
        };

        // Process line items for G/L Account Items - your structure has debits property
        const lineItems = groupedInvoice.debits || [];
        const glAccountItems = [];
        const whldgTaxItems = [];

        lineItems.forEach((lineItem, index) => {
          // G/L Account Items (Debits)
          if (lineItem["GLAccount"]) {
            glAccountItems.push({
              SupplierInvoiceItem: (index + 1).toString(),
              CompanyCode: String(lineItem["s-CompanyCode"] || lineItem["CompanyCode"]),
              CostCenter: lineItem["CostCenter"] || "",
              ControllingArea: "A000",
              GLAccount: String(lineItem["GLAccount"]),
              WBSElement: lineItem["WBSElement"] || "",
              DocumentCurrency: lineItem["DocumentCurrency"] || "INR",
              SupplierInvoiceItemAmount: String(lineItem["SupplierInvoiceItemAmount"]),
              TaxCode: lineItem["TaxCode"] || "",
              DebitCreditCode: lineItem["DebitCreditCode"] || "S",
              SupplierInvoiceItemText: lineItem["SupplierInvoiceItemText"] || lineItem["Supplierlineitemtext"] || "",
              AssignmentReference: lineItem["AssignmentReference"] || "",
              Quantity: "0"
            });
          }

          // Withholding Tax Items
          if (lineItem["TDSTAXTYPE"]) {
            whldgTaxItems.push({
              WithholdingTaxType: lineItem["TDSTAXTYPE"] || "",
              DocumentCurrency: lineItem["TDSCurrency"] || lineItem["DocumentCurrency"] || "INR",
              WithholdingTaxCode: lineItem["TDSTAXCODE"] || ""
            });
          }
        });

        // Add G/L Account Items if any exist
        if (glAccountItems.length > 0) {
          oDataInvoice.to_SupplierInvoiceItemGLAcct = {
            results: glAccountItems
          };
        }

        // Add Withholding Tax Items if any exist  
        if (whldgTaxItems.length > 0) {
          oDataInvoice.to_SupplierInvoiceWhldgTax = {
            results: whldgTaxItems
          };
        }

        // Validate numeric fields
        if (isNaN(parseFloat(headerInvoice["InvoiceGrossAmount"]))) {
          throw new Error(`Invalid InvoiceGrossAmount: ${headerInvoice["InvoiceGrossAmount"]}`);
        }

        // Validate line item amounts
        glAccountItems.forEach((item, index) => {
          if (isNaN(parseFloat(item.SupplierInvoiceItemAmount))) {
            throw new Error(`Invalid SupplierInvoiceItemAmount for line item ${index + 1}: ${item.SupplierInvoiceItemAmount}`);
          }
        });

        console.log("Final OData payload:", oDataInvoice);
        return oDataInvoice;
      } catch (error) {
        console.error('Error in _convertToODataFormat:', error);
        throw error;
      }
    },

    /**
     * Processes the raw batch response from the ODataModel.
     * @param {object} data - The response data from oModel.submitBatch().
     * @param {Array<object>} originalInvoices - The original array of invoices sent in the batch.
     * @param {boolean} [noOperations=false] - True if no OData operations were performed.
     * @returns {object} An object containing success and failed entries.
     * @private
     */
    _processBatchResults: function (data, originalInvoices, noOperations = false) {
      const results = {
        successEntries: [],
        failedEntries: [],
        allEntries: []
      };

      if (noOperations) {
        console.log("ODataService: No operations were performed in this batch (e.g., all conversion errors).");
        originalInvoices.forEach(invoice => {
          results.failedEntries.push({
            "Sequence ID": invoice["Sequence ID"] || invoice["Sequence Id"],
            uploadStatus: "FAILED",
            statusMessage: "No OData operation performed (data conversion error or empty chunk)."
          });
        });
        results.allEntries = [...results.failedEntries];
        return {
          status: "ERROR",
          message: "No OData operations performed for this chunk due to conversion errors or empty data.",
          ...results
        };
      }

      if (data.__batchResponses) {
        data.__batchResponses.forEach((response, index) => {
          // Each __batchResponses entry can be a __changeResponses (for change sets) or a single response
          if (response.__changeResponses) {
            // This handles the case where you have multiple operations within a single changeset
            response.__changeResponses.forEach((changeResponse, changeIndex) => {
              this._handleSingleResponse(changeResponse, originalInvoices, results, `ChangeSet Index ${changeIndex}`);
            });
          } else {
            // This handles a single operation response directly within the batch response
            this._handleSingleResponse(response, originalInvoices, results, `Batch Response Index ${index}`);
          }
        });
      } else {
        console.warn("ODataService: No '__batchResponses' found in the batch data, check ODataModel response structure.");
        // Fallback: If for some reason __batchResponses is missing, treat all as failed for safety
        originalInvoices.forEach(invoice => {
          results.failedEntries.push({
            "Sequence ID": invoice["Sequence ID"] || invoice["Sequence Id"],
            uploadStatus: "FAILED",
            statusMessage: "Unexpected batch response structure from OData service."
          });
        });
      }

      // Add original invoices that were potentially skipped due to conversion errors
      const processedSequenceIds = new Set(results.allEntries.map(e => e["Sequence ID"]));
      originalInvoices.forEach(invoice => {
        const sequenceId = invoice["Sequence ID"] || invoice["Sequence Id"];
        if (!processedSequenceIds.has(sequenceId)) {
          results.failedEntries.push({
            "Sequence ID": sequenceId,
            uploadStatus: "FAILED",
            statusMessage: "Invoice not processed by OData batch (likely conversion error before request)."
          });
          results.allEntries.push({
            "Sequence ID": sequenceId,
            uploadStatus: "FAILED",
            statusMessage: "Invoice not processed by OData batch (likely conversion error before request)."
          });
        }
      });

      const status = results.failedEntries.length === 0 ? "SUCCESS" :
        results.successEntries.length > 0 ? "PARTIAL" : "ERROR";

      console.log("ODataService: Processed batch results:", { status, ...results });
      return {
        status: status,
        message: status === "SUCCESS" ? "All entries processed successfully in this batch." :
          status === "PARTIAL" ? "Some entries failed in this batch." :
            "All entries failed in this batch.",
        ...results
      };
    },

    /**
     * Helper to handle a single response within a batch.
     * @param {object} response - The single response object.
     * @param {Array<object>} originalInvoices - The original array of invoices.
     * @param {object} results - The results object to populate.
     * @param {string} debugIdentifier - A string for logging context.
     * @private
     */
    _handleSingleResponse: function (response, originalInvoices, results, debugIdentifier) {
      // Match the response with the original invoice based on index/order or payload data
      // This is crucial. The ODataModel's batch responses often map directly to the order of createEntry calls.
      // If the original payload has a unique identifier, it's best to use that to map.
      // For now, we'll rely on the index of the response matching the index of the original invoice in the chunk.

      // Note: OData v2 batch responses often return responses in the order of the requests.
      // The `__batchResponses` array elements directly correspond to the order of operations within the batch.
      // The "id" field in the response might refer to the URL, not a Content-ID.

      // The `__metadata` property within successful data often contains the URI including key properties.
      // For errors, the `response.response.body` or `response.message` needs parsing.

      const responseContentID = response.__requestUri?.split('$batch/')[1]?.split('?')[0] || response.headers?.['Content-ID'];
      let originalInvoice = null;

      // Attempt to find the original invoice using the Content-ID or sequential order
      if (responseContentID && !isNaN(parseInt(responseContentID))) {
        // If Content-ID was explicitly set and is numeric, use it.
        // Assuming Content-ID starts from 1.
        originalInvoice = originalInvoices[parseInt(responseContentID) - 1];
      } else {
        // Fallback: If Content-ID isn't reliable or available, try to match by tracking index
        // This is less robust but might work if the ODataModel preserves order.
        // This implies you might need to pass the original index with the request.
        // For simplicity, let's assume `originalInvoices` refers to the chunk passed to _createSupplierInvoicesViaOData
        // and the response order matches the request order.
        const allProcessed = results.successEntries.length + results.failedEntries.length;
        originalInvoice = originalInvoices[allProcessed];
      }

      const sequenceId = originalInvoice ? (originalInvoice["Sequence ID"] || originalInvoice["Sequence Id"]) : "Unknown";

      if (response.statusCode && response.statusCode >= 200 && response.statusCode < 300) {
        // Success
        let documentNumber = "N/A";
        let companyCode = "N/A";
        let fiscalYear = "N/A";

        try {
          const data = JSON.parse(response.response.body); // Parse response body for successful data
          documentNumber = data.SupplierInvoice;
          companyCode = data.CompanyCode;
          fiscalYear = data.FiscalYear;
        } catch (e) {
          console.warn(`ODataService: Could not parse success response body for sequence ID ${sequenceId}.`, e);
        }

        const successEntry = {
          "Sequence ID": sequenceId,
          uploadStatus: "SUCCESS",
          statusMessage: "Supplier invoice created successfully.",
          documentNumber: documentNumber,
          companyCode: companyCode,
          fiscalYear: fiscalYear
        };
        results.successEntries.push(successEntry);
        results.allEntries.push(successEntry);
      } else {
        // Error or status code outside 2xx
        let errorMessage = "Unknown error during processing.";
        if (response.response && response.response.body) {
          try {
            const errorData = JSON.parse(response.response.body);
            errorMessage = errorData.error.message.value || errorData.error.message || JSON.stringify(errorData);
          } catch (e) {
            errorMessage = response.response.body; // Fallback to raw body if not JSON
          }
        } else if (response.message) {
          errorMessage = response.message;
        } else if (response.statusCode) {
          errorMessage = `HTTP Status ${response.statusCode}: ${response.statusText || 'Error'}`;
        }

        const failedEntry = {
          "Sequence ID": sequenceId,
          uploadStatus: "FAILED",
          statusMessage: errorMessage
        };
        results.failedEntries.push(failedEntry);
        results.allEntries.push(failedEntry);
      }
    },

    /**
     * Fetches the CSRF token from the OData service.
     * @returns {Promise<string>} A promise that resolves with the CSRF token.
     * @private
     */
    _fetchCSRFToken: function () {
      return new Promise((resolve, reject) => {
        jQuery.ajax({
          url: this.SERVICE_URL,
          type: "HEAD",
          headers: {
            "X-CSRF-Token": "Fetch",
            "Accept": "application/json"
          },
          success: (data, textStatus, xhr) => {
            const token = xhr.getResponseHeader("X-CSRF-Token");
            if (token) {
              // Set token on model for all future requests
              this.oModel.setHeaders({
                "X-CSRF-Token": token
              });
              resolve(token);
            } else {
              reject("No CSRF token received");
            }
          },
          error: (xhr) => {
            reject(`CSRF token fetch failed: ${xhr.statusText}`);
          }
        });
      });
    },

    /**
     * Combines results from multiple chunk processing operations.
     * @param {Array<object>} chunkResults - An array of results from each processed chunk.
     * @returns {object} A combined result object.
     * @private
     */
    _combineResults: function (chunkResults) {
      console.log("ODataService: Combining results from", chunkResults.length, "chunks.");
      const combined = {
        status: "SUCCESS",
        failedEntries: [],
        successEntries: [],
        allEntries: []
      };

      if (!Array.isArray(chunkResults)) {
        console.error("ODataService: _combineResults received non-array chunkResults:", chunkResults);
        return { status: "ERROR", message: "Internal error combining results.", failedEntries: [], successEntries: [], allEntries: [] };
      }

      const processedSequenceIds = new Set(); // To prevent duplicate entries if retries cause overlaps

      chunkResults.forEach((result) => {
        if (result.status === "ERROR" || result.status === "PARTIAL") {
          combined.status = "PARTIAL";
        }

        // Process failed entries from the current chunk
        if (result.failedEntries && Array.isArray(result.failedEntries)) {
          result.failedEntries.forEach(entry => {
            const sequenceId = entry["Sequence ID"] || entry["Sequence Id"];
            if (sequenceId && !processedSequenceIds.has(sequenceId)) {
              combined.failedEntries.push(entry);
              combined.allEntries.push(entry);
              processedSequenceIds.add(sequenceId);
            } else if (!sequenceId) { // Add entries without sequence ID directly
              combined.failedEntries.push(entry);
              combined.allEntries.push(entry);
            }
          });
        }

        // Process successful entries from the current chunk
        if (result.successEntries && Array.isArray(result.successEntries)) {
          result.successEntries.forEach(entry => {
            const sequenceId = entry["Sequence ID"] || entry["Sequence Id"];
            if (sequenceId && !processedSequenceIds.has(sequenceId)) {
              combined.successEntries.push(entry);
              combined.allEntries.push(entry);
              processedSequenceIds.add(sequenceId);
            } else if (!sequenceId) { // Add entries without sequence ID directly
              combined.successEntries.push(entry);
              combined.allEntries.push(entry);
            }
          });
        }
      });

      // If all entries failed, set status to ERROR
      if (combined.failedEntries.length > 0 && combined.successEntries.length === 0) {
        combined.status = "ERROR";
      }

      this._updateBatchProcessingDisplay({
        status: combined.status === "SUCCESS" ? "Upload completed successfully!" :
          combined.status === "PARTIAL" ? "Upload completed with some errors." :
            "Upload failed with errors."
      });

      // Add final processing metrics to the result
      combined.processingMetrics = {
        totalBatches: this._processingMetrics.totalBatches,
        processedBatches: this._processingMetrics.processedBatches,
        totalEntries: this._processingMetrics.totalEntries,
        processedEntries: this._processingMetrics.processedEntries,
        processingTime: new Date() - this._processingMetrics.startTime,
        estimatedTimeRemaining: this._processingMetrics.estimatedTimeRemaining
      };

      console.log("ODataService: Combined results:", combined);
      return combined;
    },

    /**
     * Formats a date value into an OData-compatible date string (YYYY-MM-DDTHH:mm:ssZ).
     * @param {string|Date} date - The date to format.
     * @returns {string|null} The formatted date string or null if invalid.
     * @private
     */
    _formatDate: function (date) {
      if (!date) return null;

      try {
        let dateObj;
        if (date instanceof Date) {
          dateObj = date;
        } else if (typeof date === 'string') {
          // Handle YYYY-MM-DD format specifically for consistency with dates without time
          if (/^\d{4}-\d{2}-\d{2}$/.test(date)) {
            // Append time and Z for UTC interpretation if only date part
            dateObj = new Date(date + 'T00:00:00Z');
          } else {
            // Attempt to parse other string formats
            dateObj = new Date(date);
          }
        } else {
          dateObj = new Date(date);
        }

        if (isNaN(dateObj.getTime())) {
          console.warn('ODataService: Invalid date provided to _formatDate:', date);
          return null;
        }

        // Return ISO string format without milliseconds and Z (e.g., "2023-10-26T10:00:00")
        return dateObj.toISOString().replace(/\.\d{3}Z$/, '');
      } catch (error) {
        console.error('ODataService: Error formatting date:', date, error);
        return null;
      }
    },

    /**
     * Sets the callback function for updating an overall progress indicator.
     * @param {function(number)} progressUpdateFn - A function that takes a number (0-100) as progress.
     * @public
     */
    setProgressIndicator: function (progressUpdateFn) {
      this._updateProgressIndicator = progressUpdateFn;
    },

    /**
     * Sets the callback function for updating detailed process display messages.
     * @param {function(object)} processDisplayUpdateFn - A function that takes an object with process details.
     * @public
     */
    setProcessDisplayUpdate: function (processDisplayUpdateFn) {
      this._updateProcessDisplay = processDisplayUpdateFn;
    },

    /**
     * Returns the current processing metrics.
     * @returns {object} The current processing metrics.
     * @public
     */
    getProcessingMetrics: function () {
      return this._processingMetrics;
    }
  });
});