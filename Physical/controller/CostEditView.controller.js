sap.ui.define([
    "sap/ui/core/mvc/Controller"
], (Controller) => {
    "use strict";

    return Controller.extend("hmel.com.tradeuiapp.controller.CostEditView", {
        onInit() {
            const oRouter = this.getOwnerComponent().getRouter();
			oRouter.getRoute("RouteCostEditView").attachPatternMatched(this.onObjectMatched, this);
        },

		onObjectMatched(oEvent) {
			var tradeNo = oEvent.getParameter("arguments").costType;
            this.getOwnerComponent().getModel("appModel").setProperty("/CostType", tradeNo);
            this.getCostData(tradeNo);
		},

        getCostData: function (tradeNo) {
            var oAppModel = this.getOwnerComponent().getModel("appModel");
            // Bind to the created path
            var oModel = this.getOwnerComponent().getModel();
            // Create a filter url for TRADE_NO
            var sFilterUrl = `TRADE_NO eq '${tradeNo}'`;
            var sPath = `/TradeEntry?$filter=${encodeURIComponent(sFilterUrl)}`;
            var oContextBinding = oModel.bindContext(sPath, undefined, undefined);
            var oBusyDialog = new sap.m.BusyDialog();
            oBusyDialog.open();
            oContextBinding.requestObject().then(function (oData) {
                oBusyDialog.close();
                var costDetails = oData.value[0] || [];
                
                oAppModel.setProperty("/CostDetails", costDetails);
                oAppModel.refresh();
            }.bind(this)).catch(function (oError) {
                oBusyDialog.close();
                oAppModel.setProperty("/CostDetails", [])
                console.error("Error fetching project data: ", oError);
            });
        },

    });
});