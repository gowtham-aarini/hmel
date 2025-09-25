sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap/ui/model/json/JSONModel",
    "sap/ui/model/odata/v4/ODataModel",
    "sap/ui/comp/smartvariants/PersonalizableInfo",
    "sap/ui/model/Filter",
    "sap/ui/model/FilterOperator"
], (Controller, JSONModel, ODataModel, PersonalizableInfo, Filter, FilterOperator) => {
    "use strict";

    return Controller.extend("hmelpaper.controller.Overview", {

        onInit: function () {
            // ---- SmartVariantManagement + FilterBar Setup ----
            this.oFilterBar = this.byId("tradeFilterBar");
            this.oSmartVariantManagement = this.byId("svm");
            this.oExpandedLabel = this.byId("expandedLabel");
            this.oSnappedLabel = this.byId("snappedLabel");

            if (this.oSmartVariantManagement && this.oFilterBar) {
                var oPersInfo = new PersonalizableInfo({
                    type: "filterBar",
                    keyName: "persistencyKey",
                    dataSource: "",
                    control: this.oFilterBar
                });
                this.oSmartVariantManagement.addPersonalizableControl(oPersInfo);
                this.oSmartVariantManagement.initialise(function () { }, this.oFilterBar);
            }
        },

        // ===== Existing Row Navigation Logic =====
        onRowPress: function (oEvent) {
            const iRowIndex = oEvent.getParameter("row").getIndex();
            const oTable = this.byId("dashboardTable");
            const oContext = oTable.getContextByIndex(iRowIndex);

            if (!oContext) {
                console.error("No context found for row", iRowIndex);
                return;
            }

            const oData = oContext.getObject();

            // store selected row into JSON model
            const oSelModel = new JSONModel(oData);
            this.getOwnerComponent().setModel(oSelModel, "SelectedTradeNumber");

            // get the OData V4 model
            const oODATAModel = this.getOwnerComponent().getModel("oDataTradeEntry");
            if (oODATAModel) {
                const sPath = `/TradeEntry('${oData.TRADE_NO}')`;
                const oBindingContext = oODATAModel.bindContext(sPath);
                oBindingContext.requestObject().then(oEntity => {
                    console.log("Single trade:", oEntity);
                }).catch(err => {
                    console.error("Error fetching entity", err);
                });
            }

            // navigate
            this.getOwnerComponent().getRouter().navTo("RouteTransfer", {
                tradeNumber: oData.TRADE_NO
            });
        },

        onCreate: function () {
            this.getRouter().navTo("RouteTransferNew");
        },

        getRouter: function () {
            return sap.ui.core.UIComponent.getRouterFor(this);
        },

        // ===== FilterBar / Variant Management Methods =====
        onSearch: function () {
            var aFilters = [];

            this.oFilterBar.getFilterGroupItems().forEach(function (oItem) {
                var oControl = oItem.getControl();
                if (oControl && oControl.getValue && oControl.getValue().trim() !== "") {
                    aFilters.push(new Filter({
                        path: oItem.getName(),
                        operator: FilterOperator.EQ,
                        value1: oControl.getValue().trim()
                    }));
                }
            });

            var oTable = this.byId("dashboardTable");
            if (oTable && oTable.getBinding("rows")) {
                oTable.getBinding("rows").filter(aFilters, "Application");
            }

            this._updateLabels();
        },

        onFilterChange: function () {
            if (this.oSmartVariantManagement) {
                this.oSmartVariantManagement.currentVariantSetModified(true);
            }
            this._updateLabels();
        },

        onFilterChangeInput: function () {
            this.onFilterChange();
        },

        onAfterVariantLoad: function () {
            this._updateLabels();
        },

        _updateLabels: function () {
            if (!this.oFilterBar) {
                return;
            }
            var aFiltersWithValues = this.oFilterBar.retrieveFiltersWithValues();

            if (this.oExpandedLabel && this.oSnappedLabel) {
                if (aFiltersWithValues.length === 0) {
                    this.oExpandedLabel.setText("No filters active");
                    this.oSnappedLabel.setText("No filters active");
                } else if (aFiltersWithValues.length === 1) {
                    this.oExpandedLabel.setText("1 filter active");
                    this.oSnappedLabel.setText("1 filter active");
                } else {
                    this.oExpandedLabel.setText(aFiltersWithValues.length + " filters active");
                    this.oSnappedLabel.setText(aFiltersWithValues.length + " filters active");
                }
            }

            var oTable = this.byId("dashboardTable");
            if (oTable) {
                oTable.setShowOverlay(true);
            }
        }

    });
});
