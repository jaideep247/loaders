/*global QUnit*/

sap.ui.define([
	"grn/controller/MaterialDocument.controller"
], function (Controller) {
	"use strict";

	QUnit.module("MaterialDocument Controller");

	QUnit.test("I should test the MaterialDocument controller", function (assert) {
		var oAppController = new Controller();
		oAppController.onInit();
		assert.ok(oAppController);
	});

});
