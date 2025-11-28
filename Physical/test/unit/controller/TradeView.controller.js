/*global QUnit*/

sap.ui.define([
	"hmel/com/tradeuiapp/controller/TradeView.controller"
], function (Controller) {
	"use strict";

	QUnit.module("TradeView Controller");

	QUnit.test("I should test the TradeView controller", function (assert) {
		var oAppController = new Controller();
		oAppController.onInit();
		assert.ok(oAppController);
	});

});
