/*global QUnit*/

sap.ui.define([
	"customertocustomer/controller/customer_to_customer.controller"
], function (Controller) {
	"use strict";

	QUnit.module("customer_to_customer Controller");

	QUnit.test("I should test the customer_to_customer controller", function (assert) {
		var oAppController = new Controller();
		oAppController.onInit();
		assert.ok(oAppController);
	});

});
