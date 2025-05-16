/*global QUnit*/

sap.ui.define([
	"vendorpayment/controller/VendorPayment.controller"
], function (Controller) {
	"use strict";

	QUnit.module("VendorPayment Controller");

	QUnit.test("I should test the VendorPayment controller", function (assert) {
		var oAppController = new Controller();
		oAppController.onInit();
		assert.ok(oAppController);
	});

});
