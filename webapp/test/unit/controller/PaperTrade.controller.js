/*global QUnit*/

sap.ui.define([
	"operations/controller/PaperTrade.controller"
], function (Controller) {
	"use strict";

	QUnit.module("PaperTrade Controller");

	QUnit.test("I should test the PaperTrade controller", function (assert) {
		var oAppController = new Controller();
		oAppController.onInit();
		assert.ok(oAppController);
	});

});
