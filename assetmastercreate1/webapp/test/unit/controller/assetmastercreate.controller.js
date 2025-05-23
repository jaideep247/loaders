/*global QUnit*/

sap.ui.define([
	"assetmastercreate/controller/assetmastercreate.controller"
], function (Controller) {
	"use strict";

	QUnit.module("assetmastercreate Controller");

	QUnit.test("I should test the assetmastercreate controller", function (assert) {
		var oAppController = new Controller();
		oAppController.onInit();
		assert.ok(oAppController);
	});

});
