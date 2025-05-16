/*global QUnit*/

sap.ui.define([
	"gigr/controller/gigr.controller"
], function (Controller) {
	"use strict";

	QUnit.module("gigr Controller");

	QUnit.test("I should test the gigr controller", function (assert) {
		var oAppController = new Controller();
		oAppController.onInit();
		assert.ok(oAppController);
	});

});
