sap.ui.define([
  "sap/ui/base/Object",
  "sap/m/MessageToast"
], function (BaseObject, MessageToast) {
  "use strict";

  return BaseObject.extend("customer_to_customer.service.SOAPService", {
    constructor: function () {
      this.CHUNK_SIZE = 50; // Configure the chunk size based on your environment
      this.MAX_RETRIES = 3;
      this.RETRY_DELAY = 2000; // 2 seconds

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
    },

    uploadJournalEntries: function (validTransactions) {
      return new Promise((resolve, reject) => {
        // Add a small delay to ensure UI components are ready
        setTimeout(() => {
          // Reset processing metrics
          this._resetProcessingMetrics(validTransactions.length);

          // First fetch the CSRF token
          this._fetchCSRFToken()
            .then((token) => {
              // Split the transactions into manageable chunks
              const transactionChunks = this._chunkTransactions(validTransactions);

              // Update metrics with batch information
              this._processingMetrics.totalBatches = transactionChunks.length;

              console.log(
                `Processing ${validTransactions.length} transactions in ${transactionChunks.length} batches`
              );

              // Display initial batch information to user
              this._updateBatchProcessingDisplay();

              // Process chunks sequentially to avoid overwhelming the server
              return this._processChunksSequentially(token, transactionChunks);
            })
            .then((results) => {
              // Combine all results
              const combinedResults = this._combineResults(results);
              resolve(combinedResults);
            })
            .catch((error) => {
              console.error("Journal entry upload failed:", error);
              // Update process display with error
              this._updateBatchProcessingDisplay({
                error: error.message || "Upload process failed"
              });
              reject(error);
            });
        }, 500); // Increase to 500ms for more reliable initialization
      });
    },

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
    },

    _updateBatchProcessingDisplay: function (options = {}) {
      // This will update any UI elements that show batch processing information
      // It can be connected to a dedicated status area in the UI

      // Calculate estimated remaining time based on average batch processing time
      if (this._processingMetrics.batchTimes.length > 0) {
        const avgBatchTime = this._processingMetrics.batchTimes.reduce((sum, time) => sum + time, 0) /
          this._processingMetrics.batchTimes.length;

        const remainingBatches = this._processingMetrics.totalBatches - this._processingMetrics.processedBatches;
        this._processingMetrics.estimatedTimeRemaining = avgBatchTime * remainingBatches;
      }
      console.log("SOAPService updating batch display with data:", {
        totalBatches: this._processingMetrics.totalBatches,
        currentBatch: this._processingMetrics.currentBatchNumber,
        processedBatches: this._processingMetrics.processedBatches,
        totalEntries: this._processingMetrics.totalEntries,
        processedEntries: this._processingMetrics.processedEntries,
        estimatedTimeRemaining: this._formatTimeRemaining(this._processingMetrics.estimatedTimeRemaining),
        status: options.status || "Processing",
        error: options.error || null
      });
      // Call the process display update function if provided
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

    _formatTimeRemaining: function (milliseconds) {
      if (!milliseconds) return "Calculating...";

      // Convert to seconds
      const seconds = Math.floor(milliseconds / 1000);

      if (seconds < 60) {
        return `${seconds} seconds`;
      } else if (seconds < 3600) {
        const minutes = Math.floor(seconds / 60);
        return `${minutes} minute${minutes > 1 ? 's' : ''}`;
      } else {
        const hours = Math.floor(seconds / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);
        return `${hours} hour${hours > 1 ? 's' : ''} ${minutes} minute${minutes > 1 ? 's' : ''}`;
      }
    },

    _calculateOverallProgress: function () {
      if (this._processingMetrics.totalBatches === 0) return 0;

      return Math.round((this._processingMetrics.processedBatches / this._processingMetrics.totalBatches) * 100);
    },

    _chunkTransactions: function (transactions) {
      // Group transactions by Sequence ID first
      const entriesBySequenceId = this._groupTransactionsByJournalEntry(transactions);

      // Then chunk the grouped entries
      const chunks = [];
      // Fix: Ensure we're working with an array, not an object
      const entries = Array.isArray(entriesBySequenceId) ?
        entriesBySequenceId : Object.values(entriesBySequenceId);

      for (let i = 0; i < entries.length; i += this.CHUNK_SIZE) {
        chunks.push(entries.slice(i, i + this.CHUNK_SIZE));
      }

      return chunks;
    },

    _processChunksSequentially: function (token, chunks) {
      const results = [];
      let currentChunk = 0;

      // Define a function to process the current chunk and then move to the next
      const processNextChunk = () => {
        if (currentChunk >= chunks.length) {
          return Promise.resolve(results);
        }

        const chunk = chunks[currentChunk];
        currentChunk++;

        // Update metrics
        this._processingMetrics.currentBatchNumber = currentChunk;

        // Update process display
        this._updateBatchProcessingDisplay({
          status: `Processing batch ${currentChunk} of ${chunks.length}`
        });

        console.log(
          `Processing batch ${currentChunk} of ${chunks.length} (${chunk.length} entries)`
        );

        // Record batch start time
        const batchStartTime = new Date();

        // Process this chunk with retry capability
        return this._processChunkWithRetry(token, chunk, 0).then(
          (chunkResult) => {
            results.push(chunkResult);

            // Update metrics
            this._processingMetrics.processedBatches++;

            // Calculate entries processed in this batch
            let entriesInBatch = 0;
            if (Array.isArray(chunk)) {
              entriesInBatch = chunk.reduce((sum, item) => {
                // Count the number of actual transactions in each journal entry
                const glCount = item && item.vendorLines ? item.vendorLines.length : 0;
                const debtorCount = item && item.customerLines ? item.customerLines.length : 0;
                return sum + glCount + debtorCount;
              }, 0);
            }

            this._processingMetrics.processedEntries += entriesInBatch;

            // Store batch processing time for time estimation
            const batchEndTime = new Date();
            const batchProcessingTime = batchEndTime - batchStartTime;
            this._processingMetrics.batchTimes.push(batchProcessingTime);

            // Update progress for the UI
            const progress = Math.round((currentChunk / chunks.length) * 100);

            // Update batch processing display
            this._updateBatchProcessingDisplay();

            // Call progress indicator if available
            if (this._updateProgressIndicator) {
              this._updateProgressIndicator(progress);
            }

            // Process the next chunk
            return processNextChunk();
          }
        );
      };

      // Start processing the first chunk
      return processNextChunk();
    },

    _processChunkWithRetry: function (token, chunk, retryCount) {
      return new Promise((resolve, reject) => {
        // Flatten the journal entries back to transactions for processing
        const chunkTransactions = this._flattenJournalEntries(chunk);

        // Create a unique change set ID for this chunk
        const changeSetId = `CS_${new Date().getTime()}_${Math.floor(
          Math.random() * 1000
        )}`;

        // Update the batch process display with retry information if applicable
        if (retryCount > 0) {
          this._updateBatchProcessingDisplay({
            status: `Retry ${retryCount} for batch ${this._processingMetrics.currentBatchNumber}`
          });
        }

        // Process the chunk
        this._sendSOAPRequestWithChangeSet(
          token,
          chunkTransactions,
          changeSetId
        )
          .then((result) => {
            resolve(result);
          })
          .catch((error) => {
            // Retry logic for retriable errors
            if (
              retryCount < this.MAX_RETRIES &&
              this._isRetriableError(error)
            ) {
              console.log(
                `Retry ${retryCount + 1} for chunk after error:`,
                error.message
              );

              // Update batch processing display with retry information
              this._updateBatchProcessingDisplay({
                status: `Error in batch ${this._processingMetrics.currentBatchNumber}. Retrying (${retryCount + 1}/${this.MAX_RETRIES})...`
              });

              // Wait before retrying
              setTimeout(() => {
                this._processChunkWithRetry(token, chunk, retryCount + 1)
                  .then(resolve)
                  .catch(reject);
              }, this.RETRY_DELAY);
            } else {
              // If max retries reached or non-retriable error, return error result
              // Update batch processing display with error information
              this._updateBatchProcessingDisplay({
                status: `Batch ${this._processingMetrics.currentBatchNumber} failed after ${retryCount} retries`
              });

              resolve({
                status: "ERROR",
                message: error.message || "Chunk processing failed",
                failedEntries: chunkTransactions.map((tx) => ({
                  "Sequence ID": tx["Sequence ID"],
                  uploadStatus: "FAILED",
                  statusMessage:
                    error.message || "Processing failed after retries"
                })),
                successEntries: []
              });
            }
          });
      });
    },

    _isRetriableError: function (error) {
      // Define which errors should be retried (e.g., network issues, timeouts)
      const retriableStatusCodes = [408, 429, 500, 502, 503, 504];
      return (
        retriableStatusCodes.includes(error.statusCode) ||
        error.message.includes("timeout") ||
        error.message.includes("network")
      );
    },

    _flattenJournalEntries: function (journalEntries) {
      // Convert grouped journal entries back to flat transactions for processing
      const flattenedTransactions = [];

      // Fix: Ensure journalEntries is iterable before using forEach
      if (Array.isArray(journalEntries)) {
        journalEntries.forEach((entry) => {
          // Fix: Check if entry and its properties exist before accessing
          if (entry && entry.vendorLines && Array.isArray(entry.vendorLines)) {
            entry.vendorLines.forEach((tx) => {
              flattenedTransactions.push(tx);
            });
          }

          // Fix: Check if entry and its properties exist before accessing
          if (entry && entry.customerLines && Array.isArray(entry.customerLines)) {
            entry.customerLines.forEach((tx) => {
              flattenedTransactions.push(tx);
            });
          }
        });
      } else {
        console.error("journalEntries is not an array in _flattenJournalEntries");
      }

      return flattenedTransactions;
    },

    _combineResults: function (chunkResults) {
      // Combine the results from all chunks
      const combined = {
        status: "SUCCESS",
        failedEntries: [],
        successEntries: [],
        allEntries: []
      };

      // Fix: Ensure chunkResults is an array before using forEach
      if (!Array.isArray(chunkResults)) {
        console.error("chunkResults is not an array in _combineResults");
        chunkResults = [];
      }

      // Track processed sequence IDs to prevent duplicates
      const processedSequenceIds = new Set();

      chunkResults.forEach((result) => {
        if (result.status === "ERROR" || result.status === "PARTIAL") {
          combined.status = "PARTIAL";
        }

        if (result.failedEntries && Array.isArray(result.failedEntries)) {
          // Only add failed entries with unique sequence IDs
          result.failedEntries.forEach(entry => {
            const sequenceId = entry["Sequence ID"];
            if (sequenceId && !processedSequenceIds.has(sequenceId)) {
              combined.failedEntries.push(entry);
              processedSequenceIds.add(sequenceId);
            }
          });
        }

        if (result.successEntries && Array.isArray(result.successEntries)) {
          // Only add successful entries with unique sequence IDs
          result.successEntries.forEach(entry => {
            const sequenceId = entry["Sequence ID"];
            if (sequenceId && !processedSequenceIds.has(sequenceId)) {
              combined.successEntries.push(entry);
              processedSequenceIds.add(sequenceId);
            }
          });
        }

        if (result.allEntries && Array.isArray(result.allEntries)) {
          // Only add entries with unique sequence IDs
          result.allEntries.forEach(entry => {
            const sequenceId = entry["Sequence ID"];
            if (sequenceId && !processedSequenceIds.has(sequenceId)) {
              combined.allEntries.push(entry);
              processedSequenceIds.add(sequenceId);
            }
          });
        }
      });

      // If all entries failed, set status to ERROR
      if (
        combined.failedEntries.length > 0 &&
        combined.successEntries.length === 0
      ) {
        combined.status = "ERROR";
      }

      // Update batch processing display with final status
      this._updateBatchProcessingDisplay({
        status: combined.status === "SUCCESS" ? "Completed successfully" :
          combined.status === "PARTIAL" ? "Completed with some errors" :
            "Failed with errors"
      });

      // Add processing metrics to the result
      combined.processingMetrics = {
        totalBatches: this._processingMetrics.totalBatches,
        processedBatches: this._processingMetrics.processedBatches,
        totalEntries: this._processingMetrics.totalEntries,
        processedEntries: this._processingMetrics.processedEntries,
        processingTime: new Date() - this._processingMetrics.startTime
      };

      return combined;
    },

    _fetchCSRFToken: function () {
      return new Promise((resolve, reject) => {
        // Update batch processing display
        this._updateBatchProcessingDisplay({
          status: "Fetching security token..."
        });

        $.ajax({
          url: "sap/bc/srt/scs_ext/sap/journalentrycreaterequestconfi",
          type: "HEAD",
          headers: {
            "X-CSRF-Token": "Fetch",
            Accept: "application/xml",
            "Content-Type": "text/html"
          },
          xhrFields: {
            withCredentials: true
          },
          timeout: 30000, // 30 second timeout for token fetch
          success: function (data, textStatus, xhr) {
            const token = xhr.getResponseHeader("X-CSRF-Token");
            if (token) {
              // Update batch processing display
              this._updateBatchProcessingDisplay({
                status: "Token received, preparing data..."
              });
              resolve(token);
            } else {
              // Update batch processing display with error
              this._updateBatchProcessingDisplay({
                status: "Failed to get security token",
                error: "Could not retrieve CSRF token"
              });
              reject({
                status: "ERROR",
                message: "Could not retrieve CSRF token"
              });
            }
          }.bind(this),
          error: function (xhr, status, error) {
            const token = xhr.getResponseHeader("X-CSRF-Token");
            if (token) {
              resolve(token);
            } else {
              console.error("CSRF Token Fetch Error:", {
                status: xhr.status,
                responseText: xhr.responseText,
                error: error
              });

              // Update batch processing display with error
              this._updateBatchProcessingDisplay({
                status: "Failed to get security token",
                error: `Failed to fetch CSRF token: ${error}`
              });

              reject({
                status: "ERROR",
                message: "Failed to fetch CSRF token",
                details: xhr.responseText,
                statusCode: xhr.status
              });
            }
          }.bind(this)
        });
      });
    },

    _sendSOAPRequestWithChangeSet: function (
      csrfToken,
      transactions,
      changeSetId
    ) {
      return new Promise((resolve, reject) => {
        // Fix: Check if transactions is an array before proceeding
        if (!Array.isArray(transactions)) {
          console.error("transactions is not an array in _sendSOAPRequestWithChangeSet");
          reject({
            status: "ERROR",
            message: "Invalid transactions data format",
            statusCode: 400
          });
          return;
        }

        const soapEnvelope = this._createSOAPEnvelopeWithChangeSet(
          transactions,
          changeSetId
        );

        $.ajax({
          url: "sap/bc/srt/scs_ext/sap/journalentrycreaterequestconfi",
          type: "POST",
          dataType: "xml",
          data: soapEnvelope,
          contentType: "text/xml; charset=utf-8",
          headers: {
            SOAPAction: "sap/bc/srt/scs_ext/sap/journalentrycreaterequestconfi",
            "X-CSRF-Token": csrfToken,
            "X-Requested-With": "XMLHttpRequest",
            "X-Change-Set-Id": changeSetId // Add change set ID to header
          },
          xhrFields: {
            withCredentials: true
          },
          timeout: 120000, // 2-minute timeout for large batches
          success: function (data) {
            try {
              const $response = $(data);
              const uploadResults = this._parseSOAPResponse(
                $response,
                transactions
              );

              const overallStatus = {
                status: uploadResults.every(
                  (result) => result.uploadStatus === "SUCCESS"
                )
                  ? "SUCCESS"
                  : "PARTIAL",
                failedEntries: uploadResults.filter(
                  (result) => result.uploadStatus === "FAILED"
                ),
                successEntries: uploadResults.filter(
                  (result) => result.uploadStatus === "SUCCESS"
                ),
                allEntries: uploadResults
              };

              resolve(overallStatus);
            } catch (parseError) {
              console.error("Error processing SOAP response:", parseError);
              reject({
                status: "ERROR",
                message: "Failed to process SOAP response: " + parseError.message,
                statusCode: 500
              });
            }
          }.bind(this),
          error: function (xhr, status, error) {
            // Handle timeout specifically
            if (status === "timeout") {
              console.error(
                "SOAP request timed out for change set:",
                changeSetId
              );
              reject({
                status: "ERROR",
                message:
                  "Request timed out. The server took too long to respond.",
                statusCode: 408
              });
              return;
            }

            console.error("SOAP Service Error:", {
              status: xhr.status,
              responseText: xhr.responseText,
              error: error
            });

            // Check for SOAP fault message and extract transaction ID if available
            let extractedMessage = error;
            let transactionId = null;

            try {
              if (xhr.responseText && xhr.responseText.includes("<faultstring")) {
                // Parse the SOAP fault message
                const responseXml = $.parseXML(xhr.responseText);
                const $xmlResponse = $(responseXml);

                // Extract the fault string
                const faultString = $xmlResponse.find("faultstring").text();
                if (faultString) {
                  extractedMessage = faultString;

                  // Extract transaction ID if present
                  const transactionIdMatch = faultString.match(/Transaction ID ([A-Z0-9]+)/);
                  if (transactionIdMatch && transactionIdMatch.length > 1) {
                    transactionId = transactionIdMatch[1];
                  }
                }
              }
            } catch (parseError) {
              console.error("Error parsing SOAP fault:", parseError);
            }

            reject({
              status: "ERROR",
              message: extractedMessage,
              details: xhr.responseText,
              statusCode: xhr.status,
              transactionId: transactionId
            });
          }
        });
      });
    },

    _createSOAPEnvelopeWithChangeSet: function (transactions, changeSetId) {
      // Create a unique message ID
      const messageId = `MSG_${new Date()
        .toISOString()
        .replace(/[-:.]/g, "")
        .slice(0, 15)}`;
      const currentDateTime = new Date().toISOString();

      // Start the SOAP envelope with change set ID
      let soapEnvelope = `
            <soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:sfin="http://sap.com/xi/SAPSCORE/SFIN">
                <soapenv:Header>
                    <sfin:ChangeSetID>${changeSetId}</sfin:ChangeSetID>
                </soapenv:Header>
                <soapenv:Body>
                    <sfin:JournalEntryBulkCreateRequest>
                        <MessageHeader>
                            <ID>${messageId}</ID>
                            <CreationDateTime>${currentDateTime}</CreationDateTime>
                        </MessageHeader>`;

      // Group transactions by document reference (journal entry)
      const journalEntriesObj = this._groupTransactionsByJournalEntry(transactions);

      // Fix: Convert journalEntriesObj to an array
      const journalEntries = Object.values(journalEntriesObj);

      // Add each journal entry to the request
      journalEntries.forEach((entry, index) => {
        // Fix: Skip entries that don't have the required structure
        if (!entry || !entry.header) {
          console.warn(`Skipping malformed journal entry at index ${index}`);
          return;
        }
        // Include sequence ID in the message ID to trace it back
        const sequenceId = entry.header["Sequence ID"];
        const subMessageId = `${changeSetId}_${sequenceId}`;
        let itemIndex = 1;

        soapEnvelope += `
                        <JournalEntryCreateRequest>
                            <MessageHeader>
                                <ID>${subMessageId}</ID>
                                <CreationDateTime>${currentDateTime}</CreationDateTime>
                            </MessageHeader>
                            <JournalEntry>
                                <OriginalReferenceDocumentType>BKPFF</OriginalReferenceDocumentType>
                                <BusinessTransactionType>RFBU</BusinessTransactionType>
                                <AccountingDocumentType>${entry.header["Accounting Document Type"] || "KR"}</AccountingDocumentType>
                                <DocumentReferenceID>${entry.header["Document Reference ID"]}</DocumentReferenceID>
                                <DocumentHeaderText>${entry.header["Document Header Text"] || "Header Text not provided"}</DocumentHeaderText> 
                                <CreatedByUser>${entry.header["Created By"] || "Cust.Coll."}</CreatedByUser>
                                <CompanyCode>${entry.header["Company Code"] || "1000"}</CompanyCode>
                                <DocumentDate>${this._formatDate(entry.header["Document Date"])}</DocumentDate>
                                <PostingDate>${this._formatDate(entry.header["Posting Date"])}</PostingDate>
                                <TaxDeterminationDate>${this._formatDate(entry.header["Document Date"])}</TaxDeterminationDate>`;

        if (entry.vendorLines && Array.isArray(entry.vendorLines)) {
          entry.vendorLines.forEach((item) => {

            soapEnvelope += `<CreditorItem>
                                <ReferenceDocumentItem>${itemIndex}</ReferenceDocumentItem>
                                <Creditor>${item["Vendor Code"]}</Creditor>
                                <AmountInTransactionCurrency currencyCode="${item['Currency'] || 'INR'}">${item['Indicator'] === 'H' ? -Math.abs(item['Amount']) : Math.abs(item['Amount'])}</AmountInTransactionCurrency>
                                <DebitCreditCode>${item["Indicator"]}</DebitCreditCode>
                                <DocumentItemText>${item["Item Text"] || "Creditor Transaction"}</DocumentItemText>
                                <AssignmentReference>${item["Assignment"] || ""}</AssignmentReference>
                                <Reference1IDByBusinessPartner>${item["Reference Key 1"]}</Reference1IDByBusinessPartner>
                                <Reference3IDByBusinessPartner>${item["Reference Key 3"]}</Reference3IDByBusinessPartner>                                                                                                                                       
                                <BusinessPlace>${item["Business Place"] || ""}</BusinessPlace>
                                </CreditorItem>`;
            itemIndex++;
          });
        }

        if (entry.customerLines && Array.isArray(entry.customerLines)) {
          entry.customerLines.forEach((item) => {
            soapEnvelope += `<DebtorItem>
                                <ReferenceDocumentItem>${itemIndex}</ReferenceDocumentItem>
                                <Debtor>${item["Customer Code"]}</Debtor>
                                <AmountInTransactionCurrency currencyCode="${item['Currency'] || 'INR'}">${item['Indicator'] === 'H' ? -Math.abs(item['Amount']) : Math.abs(item['Amount'])}</AmountInTransactionCurrency>
                                <DebitCreditCode>${item["Indicator"]}</DebitCreditCode>
                                <DocumentItemText>${item["Item Text"] || "Debtor Transaction"}</DocumentItemText>
                                <AssignmentReference>${item["Assignment"] || ""}</AssignmentReference>
                                <Reference1IDByBusinessPartner>${item["Reference Key 1"]}</Reference1IDByBusinessPartner>
                                <Reference3IDByBusinessPartner>${item["Reference Key 3"]}</Reference3IDByBusinessPartner>                                                                                                       
                                <BusinessPlace>${item["Business Place"] || ""}</BusinessPlace>
                                </DebtorItem>`;
            itemIndex++;
          });
        }

        soapEnvelope += `
                            </JournalEntry>
                        </JournalEntryCreateRequest>`;
      });

      // Close the SOAP envelope
      soapEnvelope += `
                    </sfin:JournalEntryBulkCreateRequest>
                </soapenv:Body>
            </soapenv:Envelope>`;

      return soapEnvelope;
    },

    _groupTransactionsByJournalEntry: function (transactions) {
      // Group transactions by Sequence ID
      const entriesBySequenceId = {};

      // Fix: Check if transactions is an array before using forEach
      if (!Array.isArray(transactions)) {
        console.error("transactions is not an array in _groupTransactionsByJournalEntry");
        return {};
      }

      transactions.forEach((transaction) => {
        // Fix: Skip null/undefined transactions
        if (!transaction) return;

        const sequenceId = transaction["Sequence ID"];
        if (!sequenceId) {
          console.warn("Transaction missing Sequence ID, skipping:", transaction);
          return;
        }

        if (!entriesBySequenceId[sequenceId]) {
          entriesBySequenceId[sequenceId] = {
            header: transaction,
            vendorLines: [],
            customerLines: []
          };
        }

        if (transaction["Sheet"] === "Vendor Lines") {
          entriesBySequenceId[sequenceId].vendorLines.push(transaction);
        } else {
          entriesBySequenceId[sequenceId].customerLines.push(
            transaction
          );
        }
      });

      return entriesBySequenceId;
    },

    _formatDate: function (dateString) {
      if (!dateString) return new Date().toISOString().split("T")[0];

      try {
        // Parse the date string and format it as YYYY-MM-DD
        const date = new Date(dateString);
        return date.toISOString().split("T")[0];
      } catch (e) {
        console.error("Invalid date format:", dateString);
        return new Date().toISOString().split("T")[0];
      }
    },

    _parseSOAPResponse: function ($response, validTransactions) {
      const uploadResults = [];
      const processedSequenceIds = new Set(); // Track processed sequence IDs

      try {
        console.log("Processing SOAP response");

        // Check if there's a SOAP fault in the response
        const soapFault = $response.find("Fault, soap\\:Fault, soap-env\\:Fault");
        if (soapFault.length > 0) {
          // Extract fault information
          const faultCode = soapFault.find("faultcode").text();
          const faultString = soapFault.find("faultstring").text();

          // Extract transaction ID if available
          let transactionId = null;
          const transactionIdMatch = faultString.match(/Transaction ID ([A-Z0-9]+)/i);

          if (transactionIdMatch && transactionIdMatch.length > 1) {
            transactionId = transactionIdMatch[1];
          }

          console.log("SOAP Fault detected:", { faultCode, faultString, transactionId });

          // Create a single error entry for each affected sequence ID
          this._addSOAPFaultErrors(uploadResults, validTransactions, faultString, transactionId);

          return uploadResults;
        }

        // Find all JournalEntryCreateConfirmation elements (there are two levels of them)
        const confirmationContainers = $response.find("JournalEntryCreateConfirmation");

        confirmationContainers.each(function () {
          // For each container, find the inner JournalEntryCreateConfirmation that has actual document data
          const innerConfirmation = $(this).find("JournalEntryCreateConfirmation");

          if (innerConfirmation.length > 0) {
            // Extract message header ID (contains the sequence ID reference)
            const messageHeaderId = $(this).find("MessageHeader > ReferenceID").text();
            console.log("Found confirmation with message ID:", messageHeaderId);

            // Extract document details - clean and format them properly
            const rawDocNumber = innerConfirmation.find("AccountingDocument").text().trim();
            const rawCompanyCode = innerConfirmation.find("CompanyCode").text().trim();
            const rawFiscalYear = innerConfirmation.find("FiscalYear").text().trim();

            // Clean and format document details properly
            const documentNumber = rawDocNumber; // No formatting needed, keep the actual document number
            const companyCode = rawCompanyCode; // No formatting needed, keep the actual company code
            const fiscalYear = rawFiscalYear; // No formatting needed, keep the actual fiscal year

            // Extract status message from Log > Item > Note
            let statusMessage = $(this).find("Log > Item > Note").text();
            if (!statusMessage) {
              statusMessage = documentNumber ?
                `Document posted successfully: BKPFF ${documentNumber}${companyCode}${fiscalYear}` :
                "Unknown error";
            }

            // Extract sequence ID from the message ID
            // Expected format of messageHeaderId: CS_timestamp_random_sequenceId
            let sequenceId = "";
            if (messageHeaderId && messageHeaderId.includes("_")) {
              const parts = messageHeaderId.split("_");
              if (parts.length >= 3) {
                sequenceId = parts[parts.length - 1]; // Last part should be sequence ID
              }
            }

            console.log(`Parsed: Document=${documentNumber}, Company=${companyCode}, Year=${fiscalYear}, Sequence=${sequenceId}`);

            // Mark this sequence ID as processed
            if (sequenceId) {
              processedSequenceIds.add(sequenceId);
            }

            // Create result entry
            uploadResults.push({
              DocumentReferenceID: messageHeaderId,
              "Sequence ID": sequenceId,
              companyCode: companyCode,
              documentNumber: documentNumber,
              errorDetails: [],
              fiscalYear: fiscalYear,
              statusMessage: statusMessage,
              uploadStatus: documentNumber ? "SUCCESS" : "FAILED"
            });
          }
        });

        // Check for any sequence IDs in the original transactions that weren't processed
        this._addMissingSequenceResults(uploadResults, validTransactions, processedSequenceIds);

      } catch (error) {
        console.error("Error parsing SOAP response:", error);
        this._handleParseError(uploadResults, validTransactions, error);
      }

      return uploadResults;
    },

    /**
     * Add SOAP fault errors to the results for each affected sequence ID
     * @param {array} uploadResults - Results array to add to
     * @param {array} validTransactions - Original transactions
     * @param {string} faultString - SOAP fault message
     * @param {string} transactionId - Transaction ID from the fault message
     */
    _addSOAPFaultErrors: function (uploadResults, validTransactions, faultString, transactionId) {
      if (!Array.isArray(validTransactions)) {
        console.warn("validTransactions is not an array in _addSOAPFaultErrors");
        return;
      }

      // Get unique sequence IDs from the transactions
      const uniqueSequenceIds = new Set();
      validTransactions.forEach(tx => {
        if (tx && tx["Sequence ID"]) {
          uniqueSequenceIds.add(tx["Sequence ID"]);
        }
      });

      // Format the error message nicely
      let formattedMessage = "Web service processing error";
      if (transactionId) {
        formattedMessage += ` (Transaction ID: ${transactionId})`;
      }

      // Add one error entry per sequence ID
      uniqueSequenceIds.forEach(sequenceId => {
        uploadResults.push({
          DocumentReferenceID: "",
          "Sequence ID": sequenceId,
          companyCode: "",
          documentNumber: "",
          errorDetails: [{
            message: faultString,
            transactionId: transactionId
          }],
          fiscalYear: "",
          statusMessage: formattedMessage,
          uploadStatus: "FAILED"
        });
      });
    },

    // Helper method to add results for missing sequence IDs
    _addMissingSequenceResults: function (uploadResults, validTransactions, processedSequenceIds) {
      if (!Array.isArray(validTransactions)) {
        console.warn("validTransactions is not an array in _addMissingSequenceResults");
        return;
      }

      // Get unique sequence IDs from the transactions
      const uniqueSequenceIds = new Set();
      validTransactions.forEach(tx => {
        if (tx && tx["Sequence ID"]) {
          uniqueSequenceIds.add(tx["Sequence ID"]);
        }
      });

      // Add entries for sequence IDs that weren't processed
      uniqueSequenceIds.forEach(seqId => {
        if (!processedSequenceIds.has(seqId)) {
          console.log(`Adding missing result for sequence ID: ${seqId}`);
          uploadResults.push({
            DocumentReferenceID: "",
            "Sequence ID": seqId,
            companyCode: "",
            documentNumber: "",
            errorDetails: [],
            fiscalYear: "",
            statusMessage: "No response received for this sequence",
            uploadStatus: "FAILED"
          });
        }
      });
    },

    // Helper method to handle parse errors
    _handleParseError: function (uploadResults, validTransactions, error) {
      if (!Array.isArray(validTransactions)) {
        console.warn("validTransactions is not an array in _handleParseError");
        return;
      }

      // Get unique sequence IDs from the transactions
      const uniqueSequenceIds = new Set();
      validTransactions.forEach(tx => {
        if (tx && tx["Sequence ID"]) {
          uniqueSequenceIds.add(tx["Sequence ID"]);
        }
      });

      // Add error entries for all sequence IDs
      uniqueSequenceIds.forEach(seqId => {
        uploadResults.push({
          DocumentReferenceID: "",
          "Sequence ID": seqId,
          uploadStatus: "FAILED",
          statusMessage: "Error processing response: " + error.message,
          errorDetails: [error.message],
          documentNumber: "",
          companyCode: "",
          fiscalYear: ""
        });
      });
    },

    // Set the progress indicator function
    setProgressIndicator: function (progressUpdateFn) {
      this._updateProgressIndicator = progressUpdateFn;
    },

    // Set the process display update function
    setProcessDisplayUpdate: function (processDisplayUpdateFn) {
      this._updateProcessDisplay = processDisplayUpdateFn;
    },

    // Get processing metrics
    getProcessingMetrics: function () {
      return this._processingMetrics;
    }
  });
});