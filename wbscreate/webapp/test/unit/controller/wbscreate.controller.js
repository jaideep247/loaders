/*global QUnit*/

sap.ui.define([
	"wbscreate/controller/wbscreate.controller"
], function (Controller) {
	"use strict";

	QUnit.module("wbscreate Controller");

	QUnit.test("I should test the wbscreate controller", function (assert) {
		var oAppController = new Controller();
		oAppController.onInit();
		assert.ok(oAppController);
	});

});
