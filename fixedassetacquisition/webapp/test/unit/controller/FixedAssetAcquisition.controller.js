/*global QUnit*/

sap.ui.define([
	"fixedassetacquisition/controller/FixedAssetAcquisition.controller"
], function (Controller) {
	"use strict";

	QUnit.module("FixedAssetAcquisition Controller");

	QUnit.test("I should test the FixedAssetAcquisition controller", function (assert) {
		var oAppController = new Controller();
		oAppController.onInit();
		assert.ok(oAppController);
	});

});
