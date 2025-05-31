/*global QUnit*/

sap.ui.define([
	"supplierinvoice/controller/supplierinvoice.controller"
], function (Controller) {
	"use strict";

	QUnit.module("supplierinvoice Controller");

	QUnit.test("I should test the supplierinvoice controller", function (assert) {
		var oAppController = new Controller();
		oAppController.onInit();
		assert.ok(oAppController);
	});

});
