/*global QUnit*/

sap.ui.define([
	"customercollection/controller/CustomerCollection.controller"
], function (Controller) {
	"use strict";

	QUnit.module("CustomerCollection Controller");

	QUnit.test("I should test the CustomerCollection controller", function (assert) {
		var oAppController = new Controller();
		oAppController.onInit();
		assert.ok(oAppController);
	});

});
