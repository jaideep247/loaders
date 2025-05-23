sap.ui.define([
  "sap/ui/base/Object",
  "sap/ui/model/json/JSONModel",
  "sap/m/MessageBox",
  "sap/m/MessageToast",
  "assetmastercreate/utils/DataTransformer"
], function (
  BaseObject,
  JSONModel,
  MessageBox,
  MessageToast,
  DataTransformer
) {
  "use strict";

  return BaseObject.extend("assetmastercreate.service.ExcelProcessor", {

    constructor: function (options = {}) {
      if (!options.controller) {
        throw new Error("ExcelProcessor requires a controller instance");
      }

      this.oController = options.controller;
      this._dataTransformer = new DataTransformer();
      this._validationManager = options.validationManager;
      this._uiManager = options.uiManager;
    },

    processExcelFile: function (file) {
      return new Promise((resolve, reject) => {
        if (!this._validateFileType(file)) {
          reject(new Error("Invalid file type. Please upload an Excel file."));
          return;
        }

        const reader = new FileReader();

        reader.onerror = (error) => {
          console.error("FileReader error:", error);
          MessageBox.error("Error reading file. Please try again.");
          reject(error);
        };

        reader.onload = (event) => {
          try {
            if (!window.XLSX) {
              throw new Error("XLSX library not loaded");
            }

            const workbook = window.XLSX.read(event.target.result, {
              type: "array",
              cellDates: true,
              cellText: false,
              cellStyles: true
            });

            const sheetName = this._findAppropriateSheet(workbook);
            const parsedData = this._parseSheet(workbook, sheetName);
            const validationResult = this._validateEntries(parsedData);

            this._updateModels(validationResult);
            this._showProcessingResults(validationResult, file.name);
            this._clearFileUploader();

            resolve(validationResult);
          } catch (error) {
            console.error("Excel Processing Error", error);
            MessageBox.error(`Error processing file: ${file.name}`, {
              details: error.message,
              actions: [MessageBox.Action.CLOSE]
            });
            reject(error);
          }
        };

        reader.readAsArrayBuffer(file);
      });
    },

    _validateFileType: function (file) {
      const validExtensions = [
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'application/vnd.ms-excel',
        'text/csv'
      ];
      return validExtensions.includes(file.type) ||
        /\.(xlsx|xls|csv)$/i.test(file.name);
    },

    _findAppropriateSheet: function (workbook) {
      // First, check for specific sheet names
      const preferredSheets = ['Asset Data', 'Assets', 'Data'];
      for (const sheetName of preferredSheets) {
        if (workbook.SheetNames.includes(sheetName)) {
          return sheetName;
        }
      }

      // Then look for sheets with keywords
      const potentialSheets = workbook.SheetNames.filter(name =>
        name.toLowerCase().includes('asset') ||
        name.toLowerCase().includes('master') ||
        name.toLowerCase().includes('data')
      );

      return potentialSheets[0] || workbook.SheetNames[0];
    },

    /**
     * Parse sheet data with the new column structure
     */
    _parseSheet: function (workbook, sheetName) {
      const sheet = workbook.Sheets[sheetName];

      if (!sheet) {
        throw new Error(`Sheet "${sheetName}" not found`);
      }

      const sheetData = window.XLSX.utils.sheet_to_json(sheet, {
        raw: false,
        defval: "",
        dateNF: "yyyy-mm-dd"
      });

      if (sheetData.length === 0) {
        throw new Error("No data found in the sheet");
      }

      // Process each row with the new transformer
      return sheetData.map((row, index) => {
        // First, map column names to standardized names
        const mappedRow = this._dataTransformer.mapAssetMasterColumns(row);

        // Then transform to structured format (handles the new column pattern)
        const structuredRow = this._dataTransformer.transformFlatToStructured(mappedRow);

        // Add metadata
        return {
          SequenceNumber: structuredRow.SequenceNumber || (index + 1).toString(),
          ...structuredRow,
          Status: "Pending",
          ValidationErrors: []
        };
      });
    },

    /**
     * Enhanced validation for the new structure
     */
    _validateEntries: function (entries) {
      // Additional validation for the new structure
      entries.forEach(entry => {
        // Validate that we have at least one ledger
        if (!entry._Ledger || entry._Ledger.length === 0) {
          entry.ValidationErrors.push({
            message: "No ledger information found. Check column naming.",
            field: "_Ledger"
          });
        }

        // Validate each ledger has at least one valuation
        if (entry._Ledger) {
          entry._Ledger.forEach(ledger => {
            if (!ledger._Valuation || ledger._Valuation.length === 0) {
              entry.ValidationErrors.push({
                message: `Ledger ${ledger.Ledger} has no valuation areas`,
                field: `Ledger_${ledger.Ledger}`
              });
            }
          });
        }
      });

      // Use existing validation manager
      const validationResult = this._validationManager.validateAssetMasterCreateDocuments(entries);

      return {
        entries: validationResult.entries,
        totalCount: entries.length,
        validCount: validationResult.validCount,
        invalidCount: validationResult.errorCount,
        isValid: validationResult.isValid
      };
    },

    _updateModels: function (validationResult) {
      const controller = this.oController;

      const assetMasterModel = controller.getView().getModel("assetMasterEntries");
      assetMasterModel.setProperty("/entries", validationResult.entries);
      assetMasterModel.setProperty("/validationStatus",
        validationResult.isValid ? "Valid" : "Invalid"
      );
      assetMasterModel.setProperty("/filteredCount", validationResult.totalCount);

      const uploadSummaryModel = controller.getView().getModel("uploadSummary");
      uploadSummaryModel.setProperty("/TotalEntries", validationResult.totalCount);
      uploadSummaryModel.setProperty("/SuccessfulEntries", validationResult.validCount);
      uploadSummaryModel.setProperty("/FailedEntries", validationResult.invalidCount);
      uploadSummaryModel.setProperty("/LastUploadDate", new Date());
      uploadSummaryModel.setProperty("/ProcessingComplete", true);
    },

    _showProcessingResults: function (validationResult) {
      MessageToast.show(
        `File processed: ${validationResult.totalCount} entries found ` +
        `(${validationResult.validCount} valid, ${validationResult.invalidCount} invalid)`
      );

      if (!validationResult.isValid && this._uiManager) {
        const invalidEntries = validationResult.entries.filter(e => e.Status === 'Invalid');
        this._uiManager.handleValidationErrors(
          invalidEntries.flatMap(entry => entry.ValidationErrors)
        );
      }
    },

    _clearFileUploader: function () {
      const fileUploader = this.oController.getView().byId("fileUploader");
      if (fileUploader) {
        fileUploader.clear();
      }
    },

    showEntryDetails: function (oEvent) {
      const source = oEvent.getSource();
      let rowIndex = this._getRowIndex(source);

      const assetMasterModel = this.oController.getView().getModel("assetMasterEntries");
      const entries = assetMasterModel.getProperty("/entries");

      if (rowIndex === undefined || rowIndex < 0 || rowIndex >= entries.length) {
        MessageToast.show("Invalid row index");
        return;
      }

      const entry = entries[rowIndex];
      const preparedEntry = this._dataTransformer.prepareEntryDetails(entry);

      const uiManager = this.oController.getUIManager();

      if (uiManager && typeof uiManager.showEntryDetailsDialog === 'function') {
        uiManager.showEntryDetailsDialog(preparedEntry);
      } else {
        MessageBox.show(JSON.stringify(preparedEntry, null, 2), {
          title: "Entry Details",
          actions: [MessageBox.Action.CLOSE]
        });
      }
    },

    _getRowIndex: function (source) {
      const bindingContext = source.getBindingContext("assetMasterEntries");
      if (bindingContext) {
        return parseInt(bindingContext.getPath().split("/").pop(), 10);
      }

      if (source.data && source.data("rowIndex") !== undefined) {
        return source.data("rowIndex");
      }

      let parent = source.getParent();
      while (parent && !parent.getIndex && parent.getParent) {
        parent = parent.getParent();
      }

      return parent && parent.getIndex ? parent.getIndex() : undefined;
    },

    /**
     * Export invalid records with the new column structure
     */
    exportInvalidRecords: function (invalidEntries) {
      try {
        if (!window.XLSX) {
          throw new Error("XLSX library not loaded");
        }

        const wb = window.XLSX.utils.book_new();

        // Flatten the structured data back to Excel format
        const exportData = invalidEntries.map(entry => {
          const flatEntry = {
            Seq_ID: entry.SequenceNumber,
            CompanyCode: entry.CompanyCode,
            AssetClass: entry.AssetClass,
            AssetIsForPostCapitalization: entry.AssetIsForPostCapitalization,
            FixedAssetDescription: entry.FixedAssetDescription,
            AssetAdditionalDescription: entry.AssetAdditionalDescription,
            AssetSerialNumber: entry.AssetSerialNumber,
            BaseUnit: entry.BaseUnit,
            InventoryNote: entry.InventoryNote,
            WBSElementExternalID: entry.WBSElementExternalID,
            Room: entry.Room
          };

          // Add ledger-specific data
          if (entry._Ledger) {
            entry._Ledger.forEach(ledger => {
              flatEntry[`CapDate_${ledger.Ledger}`] = ledger.AssetCapitalizationDate;

              if (ledger._Valuation) {
                ledger._Valuation.forEach(val => {
                  const area = val.AssetDepreciationArea;
                  const tbv = val._TimeBasedValuation?.[0];

                  if (tbv) {
                    flatEntry[`ValidityDate_${area}`] = tbv.ValidityStartDate;
                    flatEntry[`DeprKey_${area}`] = tbv.DepreciationKey;
                    flatEntry[`UsefulLife_${area}`] = tbv.PlannedUsefulLifeInYears;
                    flatEntry[`ScrapPercent_${area}`] = tbv.AcqnProdnCostScrapPercent;
                  }
                });
              }
            });
          }

          // Add custom fields
          if (entry._GlobMasterData?._IN_AssetBlockData) {
            flatEntry.IN_AssetBlock = entry._GlobMasterData._IN_AssetBlockData.IN_AssetBlock;
            flatEntry.IN_AssetPutToUseDate = entry._GlobMasterData._IN_AssetBlockData.IN_AssetPutToUseDate;
            flatEntry.IN_AssetIsPriorYear = entry._GlobMasterData._IN_AssetBlockData.IN_AssetIsPriorYear;
          }

          if (entry._CustomFields) {
            flatEntry.YY1_WBS_ELEMENT = entry._CustomFields.YY1_WBS_ELEMENT;
          }

          // Add validation errors
          flatEntry.ValidationErrors = entry.ValidationErrors
            ? entry.ValidationErrors.map(err =>
              typeof err === 'string' ? err : err.message
            ).join('; ')
            : '';

          return flatEntry;
        });

        const ws = window.XLSX.utils.json_to_sheet(exportData);
        window.XLSX.utils.book_append_sheet(wb, ws, "Invalid Entries");

        const timestamp = new Date().toISOString().slice(0, 10);
        const filename = `Invalid_Asset_Entries_${timestamp}.xlsx`;

        window.XLSX.writeFile(wb, filename);

        MessageToast.show(`Invalid entries exported to ${filename}`);
      } catch (error) {
        console.error("Error exporting invalid records:", error);
        MessageBox.error("Failed to export invalid records: " + error.message);
      }
    }
  });
});