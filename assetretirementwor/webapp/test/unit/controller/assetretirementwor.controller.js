/*global QUnit*/

sap.ui.define([
	"assetretirementwor/controller/assetretirementwor.controller"
], function (Controller) {
	"use strict";

	QUnit.module("assetretirementwor Controller");

	QUnit.test("I should test the assetretirementwor controller", function (assert) {
		var oAppController = new Controller();
		oAppController.onInit();
		assert.ok(oAppController);
	});

});
