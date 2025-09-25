sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap/base/Log"
], (Controller,Log) => {
    "use strict";

    return Controller.extend("hmelpaper.controller.Transfer", {
        onInit: function () {
            this.getOwnerComponent().getRouter()
                .getRoute("RouteTransfer")
                .attachPatternMatched(this._onObjectMatched, this);
        },
        

_onObjectMatched: function (oEvent) {
    const sTradeNumber = oEvent.getParameter("arguments").tradeNumber;

    // Use JSON model if available (from list selection)
    const oSelModel = this.getOwnerComponent().getModel("SelectedTradeNumber");
    if (oSelModel) {
        this.getView().setModel(oSelModel, "SelectedTradeNumber");
        console.log("SelectedTradeNumber:", oSelModel.getData());
    } else {
        console.warn("No SelectedTradeNumber JSON model found, probably page refresh.");
    }

    // Always use OData model to fetch fresh entity
    const oODataModel = this.getOwnerComponent().getModel("oDataTradeEntry");
    if (oODataModel) {
        this.getView().setModel(oODataModel, "oDataTradeEntry");

        const sPath = `/TradeEntry('${sTradeNumber}')`;

        // 🔑 Unbind old context to clear stale data
        this.getView().unbindElement("oDataTradeEntry");

        // Rebind to new TradeEntry and manage busy state
        this.getView().bindElement({
    path: sPath,
    model: "oDataTradeEntry",
    parameters: {
        expand: "counterpart,trader,strategy,transferFrom,transferTo,transferLocation,transferOperator,transferStrategy"
    },
    events: {
        dataRequested: () => this.getView().setBusy(true),
        dataReceived: () => this.getView().setBusy(false)
    }
});

    } else {
        console.warn("No oDataTradeEntry model found, check manifest.json or Component.js");
    }
},

	onListItemPress: function (oEvent) {
 
            const sToPageId = oEvent.getParameter("listItem").getCustomData()[0].getValue();
            this.getSplitAppObj().toDetail(this.createId(sToPageId));
        },
 
        getSplitAppObj: function () {
            const result = this.byId("splitAppDemo");
            if (!result) {
                Log.info("SplitApp object can't be found");
            }
            return result;
        }
    });
});
