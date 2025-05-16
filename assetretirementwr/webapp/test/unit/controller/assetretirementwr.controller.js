/*global QUnit*/

sap.ui.define([
	"assetretirementwr/controller/assetretirementwr.controller"
], function (Controller) {
	"use strict";

	QUnit.module("assetretirementwr Controller");

	QUnit.test("I should test the assetretirementwr controller", function (assert) {
		var oAppController = new Controller();
		oAppController.onInit();
		assert.ok(oAppController);
	});

});
