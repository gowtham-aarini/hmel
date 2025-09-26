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
                    console.log(":", oEntity);
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
        //       onSearch: function () {
        //     const aFilters = [];
        //     const oFilterBar = this.byId("tradeFilterBar");

        //     oFilterBar.getFilterGroupItems().forEach(function (oItem) {
        //         const oControl = oItem.getControl();
        //         if (!oControl) { return; }

        //         let vValue;

        //         // Input
        //         if (oControl.getValue && oControl.getValue().trim() !== "") {
        //             vValue = oControl.getValue().trim();
        //             aFilters.push(new sap.ui.model.Filter({
        //                 path: oItem.getName(),
        //                 operator: sap.ui.model.FilterOperator.Contains,
        //                 value1: vValue
        //             }));
        //         }

        //         // MultiComboBox
        //         else if (oControl.getSelectedKeys && oControl.getSelectedKeys().length) {
        //             const aKeys = oControl.getSelectedKeys();
        //             aFilters.push(new sap.ui.model.Filter({
        //                 filters: aKeys.map(function (k) {
        //                     return new sap.ui.model.Filter(oItem.getName(),
        //                         sap.ui.model.FilterOperator.EQ, k);
        //                 }),
        //                 and: false
        //             }));
        //         }

        //         // DatePicker
        //         else if (oControl.getDateValue && oControl.getDateValue() !== null) {
        //             const oDate = oControl.getDateValue();
        //             // Format to OData YYYYMMDD or YYYY-MM-DD depending on your service
        //             const sDate = sap.ui.core.format.DateFormat
        //                 .getDateInstance({ pattern: "yyyyMMdd" }).format(oDate);
        //             aFilters.push(new sap.ui.model.Filter({
        //                 path: oItem.getName(),
        //                 operator: sap.ui.model.FilterOperator.EQ,
        //                 value1: sDate
        //             }));
        //         }
        //     });

        //     const oTable = this.byId("dashboardTable");
        //     const oBinding = oTable && oTable.getBinding("rows");
        //     if (oBinding) {
        //         oBinding.filter(aFilters, "Application");
        //     }
        // },
        onSearch: function () {
            const aFilters = [];
            const oFilterBar = this.byId("tradeFilterBar");

            oFilterBar.getFilterGroupItems().forEach(function (oItem) {
                const oControl = oItem.getControl();
                if (!oControl) { return; }

                // Input
                if (oControl.getValue && oControl.getValue().trim() !== "") {
                    aFilters.push(new sap.ui.model.Filter({
                        path: oItem.getName(),
                        operator: sap.ui.model.FilterOperator.Contains,
                        value1: oControl.getValue().trim()
                    }));
                }

                // MultiComboBox
                else if (oControl.getSelectedKeys && oControl.getSelectedKeys().length) {
                    const aKeys = oControl.getSelectedKeys();
                    aFilters.push(new sap.ui.model.Filter({
                        filters: aKeys.map(function (k) {
                            return new sap.ui.model.Filter({
                                path: oItem.getName(),    // now points to ID field
                                operator: sap.ui.model.FilterOperator.EQ,
                                value1: k
                            });
                        }),
                        and: false
                    }));
                }

                // DatePicker
                else if (oControl.getDateValue && oControl.getDateValue() !== null) {
                    const sDate = sap.ui.core.format.DateFormat
                        .getDateInstance({ pattern: "yyyyMMdd" })
                        .format(oControl.getDateValue());
                    aFilters.push(new sap.ui.model.Filter({
                        path: oItem.getName(),
                        operator: sap.ui.model.FilterOperator.EQ,
                        value1: sDate
                    }));
                }
            });

            const oTable = this.byId("dashboardTable");
            const oBinding = oTable.getBinding("rows");
            if (oBinding) {
                oBinding.filter(aFilters, "Application");
                oTable.setVisibleRowCount(oBinding.getLength());  
                
            }

        },
        onClear: function () {
            var oFilterBar = this.byId("tradeFilterBar");
            var aFilterItems = oFilterBar.getFilterGroupItems();

            aFilterItems.forEach(function (oItem) {
                var oControl = oItem.getControl();
                if (oControl) {
                    if (oControl.setValue) {
                        oControl.setValue("");
                    }
                    if (oControl.setSelectedKeys) {
                        oControl.setSelectedKeys([]);
                    }
                    if (oControl.setSelectedKey) {
                        oControl.setSelectedKey("");
                    }
                    if (oControl.setDateValue) {
                        oControl.setDateValue(null);
                    }
                }
            });

            var oTable = this.byId("dashboardTable");
            var oBinding = oTable.getBinding("rows");
            if (oBinding) {
                oBinding.filter([]);
            }

            oTable.setFirstVisibleRow(0);

            console.log("Filters cleared, table reset to first page with full data.");
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
                oTable.setShowOverlay(false);
            }
        }

    });
});
