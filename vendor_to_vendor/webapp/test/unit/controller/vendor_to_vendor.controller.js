/*global QUnit*/

sap.ui.define([
	"vendortovendor/controller/vendor_to_vendor.controller"
], function (Controller) {
	"use strict";

	QUnit.module("vendor_to_vendor Controller");

	QUnit.test("I should test the vendor_to_vendor controller", function (assert) {
		var oAppController = new Controller();
		oAppController.onInit();
		assert.ok(oAppController);
	});

});
