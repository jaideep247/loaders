/*global QUnit*/

sap.ui.define([
	"wbsupload/controller/Fileupload.controller"
], function (Controller) {
	"use strict";

	QUnit.module("Fileupload Controller");

	QUnit.test("I should test the Fileupload controller", function (assert) {
		var oAppController = new Controller();
		oAppController.onInit();
		assert.ok(oAppController);
	});

});
