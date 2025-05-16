sap.ui.define(
  [
    "sap/m/MessageBox",
    "sap/m/MessageToast",
    "gigr/service/ValidationManager",
    "gigr/utils/DataTransformer",
    "gigr/utils/ErrorHandler"
  ],
  function (e, t, r, o, s) {
    "use strict";
    return class n {
      constructor(e = {}) {
        this.oController = e.controller;
        this._validationManager = e.validationManager || new r();
        this._dataTransformer = e.dataTransformer || new o();
        this._errorHandler = e.errorHandler || new s();
      }
      processExcelFile(t) {
        return new Promise((r, o) => {
          const s = new FileReader();
          s.onerror = (e) => {
            console.error("FileReader error:", e);
            this._errorHandler.showError(
              "Error reading file. Please try again."
            );
            o(e);
          };
          s.onload = (s) => {
            try {
              if (!window.XLSX) {
                throw new Error("XLSX library not loaded");
              }
              this._errorHandler.showSuccess("Processing file...");
              const e = window.XLSX.read(s.target.result, {
                type: "array",
                cellDates: true,
                cellText: false,
                cellStyles: true
              });
              const o = this._findGIGRDocumentSheet(e);
              if (!o.found) {
                throw new Error(o.message);
              }
              const n = this._parseGiGrDocumentSheet(e, o.sheetName);
              const i = this._validationManager.validateGiGrDocuments(
                n.entries
              );
              this._updateModels(i);
              this._showProcessingResults(i, t.name);
              this._clearFileUploader();
              r(i);
            } catch (r) {
              console.error("Excel Processing Error", r);
              e.error(`Error processing file: ${t.name}`, {
                details: r.message,
                actions: [e.Action.CLOSE]
              });
              o(r);
            }
          };
          s.readAsArrayBuffer(t);
        });
      }
      _findGIGRDocumentSheet(e) {
        const t = e.SheetNames.map((e) => e.toLowerCase().replace(/\s+/g, ""));
        for (let t of e.SheetNames) {
          const e = t.toLowerCase().trim();
          if (e === "goods receipts" || e === "goods issues") {
            return { found: true, sheetName: t };
          }
        }
        return {
          found: false,
          message: `Missing required sheet: "Goods Receipts" or "Goods Issues". Available sheets: ${e.SheetNames.join(
            ", "
          )}. Please check your Excel file.`
        };
      }
      _parseGiGrDocumentSheet(e, t) {
        try {
          const r = e.Sheets[t];
          if (!r) {
            throw new Error(
              `Sheet "${t}" not found in workbook. Available sheets: ${e.SheetNames.join(
                ", "
              )}`
            );
          }
          console.group("📄 Detailed Material Document Parsing");
          console.log("Parsing sheet:", t);
          const o = window.XLSX.utils.sheet_to_json(r, {
            raw: false,
            defval: "",
            dateNF: "yyyy-mm-dd"
          });
          console.log("Sheet data rows:", o.length);
          if (o.length === 0) {
            throw new Error(
              `Sheet "${t}" contains no data or headers could not be parsed`
            );
          }
          const s = o.map((e, t) => {
            const r = this._dataTransformer.mapColumnNames(e);
            const o = Object.entries(r).reduce((e, [t, r]) => {
              if (
                !t.includes("EMPTY") &&
                !t.startsWith("__") &&
                !t.startsWith("_EMPTY")
              ) {
                e[t] = r;
              }
              return e;
            }, {});
            const s = {
              id: t + 1,
              Status: "Valid",
              ValidationErrors: [],
              EntryUnit: r.EntryUnit || "EA",
              ...o,
              DocumentDate: this._dataTransformer.parseDate(r.DocumentDate),
              PostingDate: this._dataTransformer.parseDate(r.PostingDate),
              SequenceNumber: r.SequenceNumber?.toString() || `${t + 1}`,
              RawData: Object.entries(e).reduce((e, [t, r]) => {
                if (
                  !t.includes("EMPTY") &&
                  !t.startsWith("__") &&
                  !t.startsWith("_EMPTY")
                ) {
                  e[t] = r;
                }
                return e;
              }, {})
            };
            return s;
          });
          console.log(`✅ Parsed ${s.length} entries successfully`);
          console.log("Sample parsed entry:", s[0]);
          console.groupEnd();
          return { entries: s };
        } catch (e) {
          console.error("❌ Error parsing material document sheet:", e);
          console.groupEnd();
          throw e;
        }
      }
      _updateModels(e) {
        console.group("🔄 Updating GI/GR Document Models");
        try {
          if (!this.oController) {
            console.warn("Controller not available, skipping model updates");
            console.groupEnd();
            return;
          }
          const t = this.oController.getView().getModel("uploadSummary");
          const r = this.oController.getView().getModel("gigrDocuments");
          if (!t || !r) {
            console.warn(
              "Required models not available, skipping model updates"
            );
            console.groupEnd();
            return;
          }
          const o = e.entries || [];
          const s = o.filter((e) => e.Status === "Valid");
          const n = o.filter((e) => e.Status === "Invalid");
          console.log("Total Entries:", o.length);
          console.log("Valid Entries:", s.length);
          console.log("Invalid Entries:", n.length);
          t.setProperty("/TotalEntries", o.length);
          t.setProperty("/SuccessfulEntries", s.length);
          t.setProperty("/FailedEntries", n.length);
          t.setProperty("/ValidationErrors", e.errors || []);
          t.setProperty("/IsSubmitEnabled", s.length > 0);
          t.setProperty("/HasBeenSubmitted", false);
          t.setProperty("/LastUploadDate", new Date());
          t.setProperty("/ProcessingComplete", true);
          if (o.length > 0) {
            const t = o.map((e) => {
              const { id: t, RawData: r, ...o } = e;
              return { ...o, Status: e.Status };
            });
            console.log("Processed Entries for display:", t.length);
            r.setProperty("/entries", t);
            r.setProperty("/validationStatus", e.isValid ? "Valid" : "Invalid");
            r.setProperty("/filteredCount", t.length);
            r.refresh(true);
          }
          console.groupEnd();
        } catch (e) {
          console.error("Error updating models:", e);
          console.groupEnd();
        }
      }
      _showProcessingResults(e, r) {
        t.show(
          `File processed: ${e.entries.length} entries found (${e.validCount} valid, ${e.errorCount} invalid)`
        );
        if (!e.isValid && this.oController && this.oController._uiManager) {
          this.oController._uiManager.handleValidationErrors(e.errors);
        }
      }
      _clearFileUploader() {
        if (this.oController) {
          const e = this.oController.getView().byId("fileUploader");
          if (e) {
            e.clear();
          }
        }
      }
      exportInvalidRecords(r) {
        try {
          if (!window.XLSX) {
            throw new Error("XLSX library not loaded");
          }
          const e = window.XLSX.utils.book_new();
          const o = window.XLSX.utils.json_to_sheet(
            r.map((e) => {
              const t = e.ValidationErrors
                ? e.ValidationErrors.map((e) => {
                    if (typeof e === "string") return e;
                    return e.message || JSON.stringify(e);
                  }).join("; ")
                : "";
              return { ...e, ValidationErrorMessages: t };
            })
          );
          window.XLSX.utils.book_append_sheet(e, o, "Invalid Records");
          const s = new Date();
          const n = s.toISOString().slice(0, 10);
          const i = `Invalid_Material_Documents_${n}.xlsx`;
          window.XLSX.writeFile(e, i);
          t.show(`Invalid records exported to ${i}`);
        } catch (t) {
          console.error("Error exporting invalid records:", t);
          e.error("Failed to export invalid records: " + t.message);
        }
      }
      createTemplateFile() {
        try {
          if (!window.XLSX) {
            throw new Error("XLSX library not loaded");
          }
          const e = window.XLSX.utils.book_new();
          const t = [
            "Sequence Number",
            "GRN Document Number",
            "Document Date",
            "Posting Date",
            "Material",
            "Plant",
            "Storage Location",
            "Goods Movement Type",
            "Purchase Order",
            "Purchase Order Item",
            "Goods Movement Ref Doc Type",
            "Quantity In Entry Unit",
            "Entry Unit"
          ];
          const r = [
            {
              "Sequence Number": "1",
              "GRN Document Number": "5000000123",
              "Document Date": new Date().toISOString().slice(0, 10),
              "Posting Date": new Date().toISOString().slice(0, 10),
              Material: "MAT001",
              Plant: "1000",
              "Storage Location": "0001",
              "Goods Movement Type": "101",
              "Purchase Order": "4500000123",
              "Purchase Order Item": "00010",
              "Goods Movement Ref Doc Type": "",
              "Quantity In Entry Unit": "10.000",
              "Entry Unit": "EA"
            },
            t.reduce((e, t) => {
              e[t] = "";
              return e;
            }, {})
          ];
          const o = window.XLSX.utils.json_to_sheet(r);
          window.XLSX.utils.book_append_sheet(e, o, "Material Documents");
          this._addHelpSheet(e);
          return window.XLSX.write(e, { bookType: "xlsx", type: "array" });
        } catch (t) {
          console.error("Error creating template file:", t);
          e.error("Failed to create template file: " + t.message);
          return null;
        }
      }
      _addHelpSheet(e) {
        const t = this._validationManager.getFieldConstraintsDescription();
        const r = Object.keys(t).map((e) => ({
          "Field Name": e,
          Description: t[e]
        }));
        r.unshift(
          {
            "Field Name": "INSTRUCTIONS",
            Description:
              "This template is used for uploading material documents. Fill in all required fields."
          },
          {
            "Field Name": "",
            Description: "Fields marked as 'Required' must not be left empty."
          },
          {
            "Field Name": "",
            Description:
              "Dates must be in YYYY-MM-DD format (e.g., 2023-04-17)."
          },
          { "Field Name": "", Description: "" }
        );
        const o = window.XLSX.utils.json_to_sheet(r);
        window.XLSX.utils.book_append_sheet(e, o, "Help");
      }
    };
  }
); 