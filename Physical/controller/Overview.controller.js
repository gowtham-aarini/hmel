sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap/ui/model/json/JSONModel",
    'sap/m/p13n/Engine',
	'sap/m/p13n/SelectionController',
	'sap/m/p13n/SortController',
	'sap/m/p13n/GroupController',
	'sap/m/p13n/MetadataHelper',
	'sap/ui/model/Sorter',
	'sap/ui/core/library',
    'sap/ui/model/Filter',
	'sap/m/table/ColumnWidthController',
    'sap/ui/comp/smartvariants/PersonalizableInfo'
], (Controller, JSONModel, Engine, SelectionController, SortController, GroupController, MetadataHelper, Sorter, CoreLibrary, Filter, ColumnWidthController,PersonalizableInfo) => {
    "use strict";

    return Controller.extend("hmel.com.tradeuiapp.controller.Overview", {
        onInit: function () {
			var oRouter = sap.ui.core.UIComponent.getRouterFor(this);
            oRouter.getRoute("RouteOverview").attachPatternMatched(this._onObjectMatched, this);

			var oModel = this.getOwnerComponent().getModel("s4HanaModel");

			if (!oModel) {
				sap.m.MessageToast.show("OData model 's4HanaModel' not found in component!");
				return;
			}
			this.getView().setModel(oModel);
			
			// var oSmartFilterBar = this.byId("smartFilterBar");
			// oSmartFilterBar.attachInitialise(function () {
			// 	var oBasicSearch = oSmartFilterBar.getBasicSearchControl();
			// 	if (oBasicSearch) {
			// 		oBasicSearch.setVisible(false);
			// 	}
			// });

			var oAppModel = this.getOwnerComponent().getModel("appModel");
			// Get params

			var oComponentData = this.getOwnerComponent().getComponentData();
			var sValue;
			if (oComponentData && oComponentData.startupParameters) {
				var oParams = oComponentData.startupParameters;
				// Example: If parameter name = "myParam"
				if (oParams.tradeType) {
					sValue = oParams.tradeType[0]; // values are arrays
					console.log("Parameter value:", sValue);
				} else {
					sValue = "";
				}
			}
			
			if (sValue === "PHYSICAL"){
				oAppModel.setProperty("/TradeType", "1");
			} else if(sValue === "PAPER"){
				oAppModel.setProperty("/TradeType", "2");
			} else {
				oAppModel.setProperty("/TradeType", "1");
			}

			this.getDraftData(oAppModel);
		},

		_onObjectMatched: function () {
			// This will run every time user navigates BACK to Overview
			var oAppModel = this.getOwnerComponent().getModel("appModel");
			this.getDraftData(oAppModel);
			// sap.m.MessageToast.show("Overview refreshed!");
		},


		getDraftData: function () {
			var oAppModel = this.getOwnerComponent().getModel("appModel");
			var sTradeType = oAppModel.getProperty("/TradeType")
			// Prepare and set the template model
            var oDraftModel = new sap.ui.model.json.JSONModel();
            this.getView().setModel(oDraftModel, "draftModel");

			var s4Model = this.getOwnerComponent().getModel("s4HanaModel");

			var aFilters = [
				new sap.ui.model.Filter({
					filters: [
						new sap.ui.model.Filter("TrdStat", sap.ui.model.FilterOperator.EQ, "D"),
						new sap.ui.model.Filter("TrdMtype", sap.ui.model.FilterOperator.EQ, sTradeType)
					],
					and: true 
				})
			];
			var oBusyDialog = new sap.m.BusyDialog();
            oBusyDialog.open();
			s4Model.read("/ZTA_TRADE_ENTRYSet", {
                filters: aFilters,
                success: function(oData) {
                    oBusyDialog.close();
					var tradeDetails = oData.results || [];
					oDraftModel.setProperty("/DraftTemplate", tradeDetails);
					oDraftModel.setProperty("/OriginalDraftTEMPLATE", tradeDetails);
                }.bind(this),
                error: function(oError) {
                    oBusyDialog.close();
                    console.error("Error retrieving trade data:", oError);
                }
            });
		},

		onCreate: function(oEvent) {
			var oAppModel = this.getOwnerComponent().getModel("appModel");
			var tradeKey = oAppModel.getProperty("/TradeType")
            const oRouter = this.getOwnerComponent().getRouter();
			if (tradeKey === '2') {
				oRouter.navTo("RoutePaperTrade", {
					"tradeNumber": "CREATE"
				});
			} else {
				if (!this._oPhyNewPopover) { 
					this._oPhyNewPopover = sap.ui.xmlfragment("hmel.com.tradeuiapp.fragments.PhyNew", this);
					this.getView().addDependent(this._oPhyNewPopover);
				}
				this._oPhyNewPopover.openBy(oEvent.getSource());
			}
			
		},

		onActionPress: function (oEvent) {
			var sText = oEvent.getSource().getText();
			var sTradeType = this.getOwnerComponent().getModel("appModel").getProperty("/TradeType");
			// var sFilterUrl = `tradeMain/TRADEID eq '${sTradeType}' and STATUS ne 'D'`;

			if (sText === "Lift from Term") {
				if (!this._oLiftDialog) {
					this._oLiftDialog = new sap.m.Dialog({
						title: "Lift from Term",
						content: [
							new sap.m.VBox({
								items: [
									new sap.m.Label({ text: "Trade No :" }),
									new sap.m.ComboBox("tradeNoCombo", {
										placeholder: "Select Trade No",
										width: "20rem",
										items: {
											path: 's4HanaModel>/ZTA_TRADE_ENTRYSet',
											 filters: [
												new sap.ui.model.Filter("TrdNumP", sap.ui.model.FilterOperator.EQ, "T"),
												new sap.ui.model.Filter("TrdMtype", sap.ui.model.FilterOperator.EQ, sTradeType),
												new sap.ui.model.Filter("TrdStat", sap.ui.model.FilterOperator.NE, "D")
											],
											template: new sap.ui.core.ListItem({
												key: "{s4HanaModel>TrdNum}",
												text: "{s4HanaModel>TrdNum}"
											}),
											templateShareable: false
										}
									}).addStyleClass("sapUiSmallMarginTop")
								]
							}).addStyleClass("sapUiSmallMargin")
						],
						beginButton: new sap.m.Button({
							text: "OK",
							press: function () {
								var sTradeNo = sap.ui.getCore().byId("tradeNoCombo").getSelectedKey();
								if (sTradeNo) {
									this._oLiftDialog.close();
									var oRouter = this.getOwnerComponent().getRouter();
									oRouter.navTo("RouteTradeView", {
										status: "LIFTTERM",
										tradeNumber: sTradeNo
									});
								} else {
									sap.m.MessageToast.show("Please select a Trade No");
								}
							}.bind(this)
						}),
						endButton: new sap.m.Button({
							text: "Cancel",
							press: function () {
								this._oLiftDialog.close();
							}.bind(this)
						})
					});
					this.getView().addDependent(this._oLiftDialog);
				}
				this._oLiftDialog.open();

			} else {
				var oRouter = this.getOwnerComponent().getRouter();
				oRouter.navTo("RouteTradeView", {
					"status": sText.toUpperCase(),
					"tradeNumber": "CREATE"
				});
			}
		},

		onShowDraftPressed: function (oEvent) {
			if (!this._oPopover) {
				this._oPopover = sap.ui.xmlfragment("hmel.com.tradeuiapp.fragments.DraftSheet", this);
				this.getView().addDependent(this._oPopover);
			}
			this._oPopover.openBy(oEvent.getSource());
		},

		onSearchTrade: function (oEvent) {
			const sQuery = oEvent.getParameter("value").toLowerCase();
			const oDraftModel = this.getView().getModel("draftModel");
			let aOriginalData = oDraftModel.getProperty("/OriginalDraftTEMPLATE");
			if (!aOriginalData || !Array.isArray(aOriginalData)) {
				console.error("Model data not found or invalid!");
				return;
			}

			let aFilteredData = aOriginalData;

			if (sQuery) {
				aFilteredData = aOriginalData.filter((oItem) => {
					return oItem.TrdNum && oItem.TrdNum.toLowerCase().includes(sQuery);
				});
			}
			oDraftModel.setProperty("/DraftTemplate", aFilteredData);
		},

		onTemplatePress: function (oEvent) {
			// get the pressed list item
			var oItem = oEvent.getSource();
			// get binding context from draftModel
			var oCtx = oItem.getBindingContext("draftModel");
			// get full object of the pressed item
			var oData = oCtx.getObject();
			// retrieve ID (assuming your entity has "ID" field)
			var sId = oData.TrdNum;
			var oAppModel = this.getOwnerComponent().getModel("appModel");
			var tradeKey = oAppModel.getProperty("/TradeType")
            const oRouter = this.getOwnerComponent().getRouter();
			if (tradeKey === '1') {
				oRouter.navTo("RouteTradeView", {
					"status": "DRAFT",
					"tradeNumber": sId
				});
			} else if(tradeKey === '2') {
				oRouter.navTo("RoutePaperTrade", {
					"tradeNumber": oData.TrdNum
				});
			}
		},

		onBeforeRebindTable: function (oEvent) {
			var oBindingParams = oEvent.getParameter("bindingParams");
			var sTradeType = this.getOwnerComponent().getModel("appModel").getProperty("/TradeType");

			var aMandatoryFilters = [];

			if (sTradeType) {
				aMandatoryFilters.push(new sap.ui.model.Filter("TrdMtype", sap.ui.model.FilterOperator.EQ, sTradeType));
			}
			aMandatoryFilters.push(new sap.ui.model.Filter("TrdStat", sap.ui.model.FilterOperator.NE, "D"));
			aMandatoryFilters.push(new sap.ui.model.Filter("TrdNumP", sap.ui.model.FilterOperator.NE, "T"));

			
			if (aMandatoryFilters.length) {
				if (!oBindingParams.filters) {
					oBindingParams.filters = [];
				}

				oBindingParams.filters.push(new sap.ui.model.Filter({
					filters: aMandatoryFilters,
					and: true
				}));
			}
		},

		handleSelectionChange: function(oEvent) {
            var oListItem = oEvent.getParameter("listItem");
			var oContext = oListItem.getBindingContext();
			var oData = oContext.getObject();

			var oAppModel = this.getOwnerComponent().getModel("appModel");
			var tradeKey = oAppModel.getProperty("/TradeType");
			const oRouter = this.getOwnerComponent().getRouter();
			if (tradeKey === '1') {
				oRouter.navTo("RouteTradeView", {
					"status": "PHYSICAL",
					"tradeNumber": oData.TrdNum
				});
			} else if(tradeKey === '2') {
				oRouter.navTo("RoutePaperTrade", {
					"tradeNumber": oData.TrdNum
				});
			}
			            
        },

		onBeforeExport: function (oEvt) {
			var mExcelSettings = oEvt.getParameter("exportSettings");
			mExcelSettings.worker = false;
		},


    });
});