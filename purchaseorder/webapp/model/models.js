sap.ui.define([
    "sap/ui/model/json/JSONModel",
    "sap/ui/Device"
],
    function (JSONModel, Device) {
        "use strict";

        return {
            /**
             * Provides runtime information for the device the UI5 app is running on as a JSONModel.
             * @returns {sap.ui.model.json.JSONModel} The device model.
             */
            createDeviceModel: function () {
                var oModel = new JSONModel(Device);
                oModel.setDefaultBindingMode("OneWay");
                return oModel;
            },

            /**
             * Creates a new mock purchase orders model for search dialog
             * @returns {sap.ui.model.json.JSONModel} JSON model with sample purchase orders
             */
            createPurchaseOrdersModel: function () {
                return new JSONModel({
                    purchaseOrders: [
                        {
                            Sequence: "1",
                            LegacyPurchasingDocumentNumber: "LEG123456",
                            CompanyCode: "1000",
                            PurchasingDocumentType: "NB",
                            SupplierAccountNumber: "26000055",
                            PurchasingOrganization: "1000",
                            PurchasingGroup: "P01",
                            PurchasingDocumentDate: new Date("2025-04-01"),
                            PurchasingDocumentNumber: "",
                            ItemNumberOfPurchasingDocument: "00010",
                            AccountAssignmentCategory: "K",
                            ProductNumber: "MAT-001",
                            Plant: "1001",
                            StorageLocation: "SL01",
                            OrderQuantity: "10",
                            DeliveryDays: "5",
                            NetPrice: "1000.00",
                            PriceUnit: "1",
                            TaxCode: "V1",
                            Return: "Return PO",
                            PurchaseContract: "4600000123",
                            PurchaseContractItem: "00010",
                            AccountAssignmentNumber: "ACC123",
                            WBSElementExternalID: "WBS-1000-01",
                            CostCenter: "CC1001",
                            GLAccountNumber: "61020060",
                            ItemText: "Test Purchase Order Item"
                        },
                        {
                            Sequence: "2",
                            LegacyPurchasingDocumentNumber: "LEG654321",
                            CompanyCode: "1000",
                            PurchasingDocumentType: "NB",
                            SupplierAccountNumber: "26000088",
                            PurchasingOrganization: "1000",
                            PurchasingGroup: "P02",
                            PurchasingDocumentDate: new Date("2025-04-05"),
                            PurchasingDocumentNumber: "",
                            ItemNumberOfPurchasingDocument: "00020",
                            AccountAssignmentCategory: "F",
                            ProductNumber: "MAT-002",
                            Plant: "1002",
                            StorageLocation: "SL02",
                            OrderQuantity: "25",
                            DeliveryDays: "7",
                            NetPrice: "2500.00",
                            PriceUnit: "1",
                            TaxCode: "V0",
                            Return: "Return PO",
                            PurchaseContract: "4600000456",
                            PurchaseContractItem: "00020",
                            AccountAssignmentNumber: "ACC456",
                            WBSElementExternalID: "WBS-2000-02",
                            CostCenter: "CC2002",
                            GLAccountNumber: "61030070",
                            ItemText: "Second PO Item Example"
                        }
                    ]
                });
            }
        };
    }
);
