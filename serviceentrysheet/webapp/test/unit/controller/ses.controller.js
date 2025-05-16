/*global QUnit*/

sap.ui.define([
	"serviceentrysheet/controller/ses.controller"
], function (Controller) {
	"use strict";

	QUnit.module("ses Controller");

	QUnit.test("I should test the ses controller", function (assert) {
		var oAppController = new Controller();
		oAppController.onInit();
		assert.ok(oAppController);
	});

});
