/*global QUnit*/

sap.ui.define([
	"customervendor/controller/Customer_Vendor.controller"
], function (Controller) {
	"use strict";

	QUnit.module("Customer_Vendor Controller");

	QUnit.test("I should test the Customer_Vendor controller", function (assert) {
		var oAppController = new Controller();
		oAppController.onInit();
		assert.ok(oAppController);
	});

});
