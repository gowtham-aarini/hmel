sap.ui.define([
    "sap/ui/core/mvc/Controller"
], (Controller) => {
    "use strict";

    return Controller.extend("hmel.com.tradeuiapp.controller.PaperTrade", {
        onInit: function () {
            this.getOwnerComponent().getRouter()
                .getRoute("RoutePaperTrade")
                .attachPatternMatched(this._onObjectMatched, this);

            this._oBusyDialog = new sap.m.BusyDialog();

            // Set Cost Model
            var oCostModel = new sap.ui.model.json.JSONModel();
            this.getView().setModel(oCostModel, "costModel");

            var oAppModel = this.getOwnerComponent().getModel("appModel");

            // Get params
            var oComponentData = this.getOwnerComponent().getComponentData();
            var sValue;
            if (oComponentData && oComponentData.startupParameters) {
                var oParams = oComponentData.startupParameters;
                if (oParams.tradeType) {
                    sValue = oParams.tradeType[0];
                    console.log("Parameter value:", sValue);
                } else {
                    sValue = "";
                }
            }

            if (sValue === "PHYSICAL") {
                oAppModel.setProperty("/TradeType", "1");
            } else if (sValue === "PAPER") {
                oAppModel.setProperty("/TradeType", "2");
            } else {
                oAppModel.setProperty("/TradeType", "2"); // Default to Paper for PaperTrade
            }
        },

        _onObjectMatched: function (oEvent) {
            const sTradeNumber = oEvent.getParameter("arguments").tradeNumber;
            var oAppModel = this.getOwnerComponent().getModel("appModel");
            this.checkFieldEnabled(oAppModel, sTradeNumber);
            var sFilterUrl, sPath;

            // Use JSON model if available (from list selection)
            const oSelModel = this.getOwnerComponent().getModel("SelectedTradeNumber");
            if (oSelModel) {
                this.getView().setModel(oSelModel, "SelectedTradeNumber");
                this.getView().getModel("SelectedTradeNumber").setProperty("/TRADE_NO", sTradeNumber);
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
                    events: {
                        dataRequested: () => this.getView().setBusy(true),
                        dataReceived: () => this.getView().setBusy(false)
                    }
                });
            } else {
                console.warn("No oDataTradeEntry model found, check manifest.json or Component.js");
            }

            if (sTradeNumber !== 'CREATE') {
                sFilterUrl = `TRADE_NO eq '${sTradeNumber}'`;
                sPath = `/TradeEntry?$filter=${encodeURIComponent(sFilterUrl)}`;
                this.getTradeEntryData(sPath);
                this.filterCostTable();
            }
        },

        filterCostTable: function () {
            var oAppModel = this.getOwnerComponent().getModel("appModel");
            var oModel = this.getOwnerComponent().getModel();
            var tradeNo = oAppModel.getProperty("/TradeNo");
            var sFilterUrl = `TRADE_NO eq '${tradeNo}'`;
            var sPath = `/Cost?$expand=tradetype,pricetype&$filter=${encodeURIComponent(sFilterUrl)}`;
            var oContextBinding = oModel.bindContext(sPath, undefined, undefined);
            var oBusyDialog = new sap.m.BusyDialog();
            oBusyDialog.open();
            oContextBinding.requestObject().then(function (oData) {
                oBusyDialog.close();
                var costDetails = oData.value || [];
                costDetails.forEach(row => row.isRowEditable = false);
                this.getView().getModel("costModel").setData(costDetails);
                this.getView().getModel("costModel").refresh();
            }.bind(this)).catch(function (oError) {
                oBusyDialog.close();
                console.error("Error fetching cost data: ", oError);
            });
        },

        checkFieldEnabled: function (oAppModel, tradeNo) {
            if (tradeNo === 'CREATE') {
                this._oBusyDialog = this._oBusyDialog || new sap.m.BusyDialog();
                this._oBusyDialog.open();
                setTimeout(() => {
                    this._oBusyDialog.close();
                }, 7000);
                oAppModel.setProperty("/TradeNo", "");
                oAppModel.setProperty("/IsTradeNumberEnabled", true);
                oAppModel.setProperty("/IsCreateEnabled", true);
                oAppModel.setProperty("/IsEditEnabled", false);
                oAppModel.setProperty("/TradeDetails", []);
                oAppModel.setProperty("/IsSaveEnabled", true);
                oAppModel.setProperty("/IsSaveAsDraftEnabled", true);
                oAppModel.setProperty("/IsMTMCheckboxEnabled", true);
            } else {
                oAppModel.setProperty("/TradeNo", tradeNo);
                oAppModel.setProperty("/IsTradeNumberEnabled", false);
                oAppModel.setProperty("/IsCreateEnabled", false)
                oAppModel.setProperty("/IsEditEnabled", true);
                oAppModel.setProperty("/IsSaveEnabled", false);
                oAppModel.setProperty("/IsSaveAsDraftEnabled", false);
                oAppModel.setProperty("/IsMTMCheckboxEnabled", false);
            }
            oAppModel.refresh();
        },

        getTradeEntryData: function (sPath) {
            var oAppModel = this.getOwnerComponent().getModel("appModel");
            var oModel = this.getOwnerComponent().getModel();
            var oContextBinding = oModel.bindContext(sPath, undefined, undefined);
            var oBusyDialog = new sap.m.BusyDialog();
            oBusyDialog.open();
            oContextBinding.requestObject().then(function (oData) {
                oBusyDialog.close();
                var tradeDetails = oData.value || [];

                oAppModel.setProperty("/TradeDetails", tradeDetails[0]);
                var aTraderNames = [...new Set(tradeDetails.map(function (item) {
                    return item.TRADER_NAME;
                }))].map(function (name) {
                    return { TRADER_NAME: name };
                });

                var aScheduleDetails = [...new Set(tradeDetails.map(function (item) {
                    return item.ZSCHEDULE;
                }))].map(function (schedule) {
                    return { ZSCHEDULE: schedule };
                });

                oAppModel.setProperty("/TraderNames", aTraderNames);
                oAppModel.setProperty("/ScheduleDetails", aScheduleDetails);
                oAppModel.refresh();
            }.bind(this)).catch(function (oError) {
                oBusyDialog.close();
                console.error("Error fetching trade entry data: ", oError);
            });
        },

        onPressSave: function (oEvent) {
            var sAction = oEvent.getSource().data("action")
            var appModel = this.getView().getModel("appModel");
            var oAppModel = this.getOwnerComponent().getModel("appModel");
            var tradeData = appModel.getProperty("/TradeDetails");
            var tradeNumber = appModel.getProperty("/TradeNo");
            var tradeTypeMID = appModel.getProperty("/TradeType");
            // var tradetypeid = this.getView().byId("tradeTypecb1").getSelectedKey();
            var status;
            if (sAction == 'draft') {
                status = "D";
            } else if (sAction == 'save') {
                status = tradeData.STATUS;
            } else {
                status = "A"
            }

            var sellOrBuyValue = "2"; // Default for Paper Trade

            var oModel = this.getOwnerComponent().getModel();

            function convertToISO(dateStr) {
                if (!dateStr) return null;

                if (/^\d{8}$/.test(dateStr)) {
                    const year = dateStr.substring(0, 4);
                    const month = dateStr.substring(4, 6);
                    const day = dateStr.substring(6, 8);
                    return `${year}-${month}-${day}T00:00:00`;
                }

                if (dateStr.includes("/")) {
                    const parts = dateStr.split("/");
                    let month = parts[0].padStart(2, "0");
                    let day = parts[1].padStart(2, "0");
                    let year = parts[2].length === 2 ? "20" + parts[2] : parts[2];
                    return `${year}-${month}-${day}T00:00:00`;
                }

                const d = new Date(dateStr);
                if (!isNaN(d)) {
                    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}T00:00:00`;
                }

                return null;
            }

            var oSavePayload = {
                "TradeNo": tradeNumber,
                "TradeDat": null,
                "DealDate": convertToISO(tradeData.DEAL_DATE),
                "StartDat": convertToISO(tradeData.START_DAT),
                "EndDate": convertToISO(tradeData.END_DATE),
                "Prcprdsd": null,
                "Prcprded": null,
                "Lcopdat": null,
                "Prcsdatlag1": convertToISO(tradeData.PRCSDATLAG1),
                "Prcedatlag1": null,
                "Prcsdatlag2": null,
                "Prcedatlag2": null,
                "Setlmntdat2": null,
                "Tnsfrcmcnt": null,
                "Tnsfrcmpln": null,
                "Efftvedate": null,
                "Vslnordate": null,
                "Declaredat": convertToISO(tradeData.DECLAREDAT),
                "Cststdate": null,
                "Cstendate": null,
                "Inputdate": null,
                "Payduedat": convertToISO(tradeData.PAYDUEDAT),
                "Evtstadat": null,
                "Evtenddat": null,
                "Evtestdat": null,
                "Buyfrmdat": null,
                "Buytodate": null,
                "Rndgnmbr": "0.000",
                "Prcfrml1": tradeData.PRCFRML1 ? Number(tradeData.PRCFRML1).toFixed(3) : "0.000",
                "Prcfrml2": "0.000",
                "Prcfrml3": "0.000",
                "Pymtrmdys": "0.000",
                "Opencredit": tradeData.OPENCREDIT || "0.000",
                "Lcvalue": tradeData.LCVALUE || "0.000",
                "Mtmfactor": tradeData.MTMFACTOR || "0.000",
                "Aquantity": tradeData.AQUANTITY || "0.000",
                "Cquantity": tradeData.CQUANTITY || "0.000",
                "Prcrndngoff": "0.000",
                "Price": "0.000",
                "Mndteprice": "0.000",
                "Minquant": tradeData.MINQUANT || "0.000",
                "Maxquant": tradeData.MAXQUANT || "0.000",
                "Meanquant": tradeData.MEANQUANT || "0.000",
                "Schedldqty": "0.000",
                "Demrgedays": "0.000",
                "Demrgerate": "0.000",
                "Grnqty": "0.000",
                "Invoiceqty": "0.000",
                "Otrnqtypaymt": "0.000",
                "Api": "0.000",
                "Spcfcgrvity": "0.000",
                "Tolernbpct": tradeData.TOLERNBPCT || "0.000",
                "Tolernapct": tradeData.TOLERNAPCT || "0.000",
                "Pricedisc": tradeData.PRICEDISC || "0.000",
                "Priceprec": "0.000",
                "Costvalue": "0.000",
                "Prcfxdrat": "0.000",
                "Payrolldd": "0.000",
                "Stlmtnday": tradeData.STLMTNDAY || "0.000",
                "Stlmntpay": tradeData.STLMNTPAY || "0.000",
                "Tradtypmid": tradeTypeMID || "",
                "Zschedule": tradeData.ZSCHEDULE || "",
                "Tradtypid": tradeData.TRADTYPID || "",
                //"Tradtypid": tradetypeid,
                "Intercomp": tradeData.INTERCOMP || "",
                "TraderId": tradeData.TRADER_ID || "",
                "Cntrprtid": tradeData.CNTRPRTID || "",
                "Ttltrmsid": tradeData.TTLTRMSID || "",
                "Zlocation": tradeData.ZLOCATION || "",
                "Pcmrkrid": tradeData.PCMRKRID || "",
                "Rndgrlid": tradeData.RNDGRLID || "",
                "Prcgtpid": tradeData.PRCGTPID || "",
                "Prcgrlid": tradeData.PRCGRLID || "",
                "Prcuomid": "",
                "Pymtrmsid": tradeData.PYMTRMSID || "",
                "Pymtrmrid": "",
                "Pmtcurrid": "",
                "Crdtrmsid": tradeData.CRDTRMSID || "",
                "Lccode": "",
                "Mtmcrveid": tradeData.MTMCRVEID || "",
                "Applawid": tradeData.APPLAWID || "",
                "Gtcid": tradeData.GTCID || "",
                "Inmttypid": "",
                "Buysellid": sellOrBuyValue,
                "Qtyunitid": "",
                "Strategyid": tradeData.STRATEGYID || "",
                "Setdpccrv1id": "",
                "Setldprccrv2": "",
                "Mtmcurve1id": "",
                "Mtmcurve2id": "",
                "Undphytrade": "",
                "Setlmtdat1id": "",
                "Mdntpcuomid": "",
                "Attchmntsid": "",
                "Transfernum": "",
                "Uomid": "",
                "Vehicleid": "",
                "Tnsfrstid": "",
                "Demrgrtuom": "",
                "Grnqtyuomid": "",
                "Invqtyuomid": "",
                "Ournqtyuntid": "",
                "Ctseperatlid": "",
                "Costypeuomid": "",
                "Costypecurid": "",
                "Costypetflid": "",
                "Costbasis": "",
                "Basedonpl": "",
                "Coststats": "",
                "Commdtid": tradeData.COMMDTID || "",
                "Delvtrmsid": tradeData.DELVTRMSID || "",
                "Delvloadid": tradeData.DELVLOADID || "",
                "Delvdchrid": tradeData.DELVDCHRID || "",
                "Origlctin": "",
                "Origpoint": "",
                "Country": tradeData.COUNTRY || "",
                "Tolernoptn": tradeData.TOLERNOPTN || "",
                "Declaredby": tradeData.DECLAREDBY || "",
                "Costsched": "",
                "CostReve": "",
                "Company": "",
                "Paymnttrm": "",
                "Prcurrid": tradeData.PRCURRID || "",
                "Priceindx": "",
                "Stlmtcrid": tradeData.STLMTCRID || "",
                "Stlmtuum": tradeData.STLMTUUM || "",
                "Stlmntlev": tradeData.STLMNTLEV || "",
                "Pamtasign": tradeData.PAMTASIGN || "",
                "Contconfm": "",
                "Conftradr": "",
                "Confmappr": "",
                "Contevent": "",
                "Evtprcing": "",
                "Evtpaymnt": "",
                "Evtttltnf": "",
                "Zperiodid": "",
                "Zspanid": "",
                "Status": status
            }

            console.log(oSavePayload);

            var oModel = this.getOwnerComponent().getModel("s4HanaModel");
            oModel.create("/ZTM_TRADE_ENTRYSet", oSavePayload, {
                success: function (oData) {
                    sap.m.MessageToast.show("Successfully!");
                    console.log("Created:", oData);
                    oAppModel.setProperty("/IsSaveEnabled", false);
                    oAppModel.setProperty("/IsCreateEnabled", false);
                    oAppModel.setProperty("/IsEditEnabled", true);
                    oAppModel.setProperty("/IsMTMCheckboxEnabled", false);
                }.bind(this),
                error: function (oError) {
                    sap.m.MessageBox.error("Error while creating TradeEntry");
                    console.error("Create failed:", oError);
                }
            });
        },

        onPressEdit: function () {
            var oAppModel = this.getOwnerComponent().getModel("appModel");
            oAppModel.setProperty("/IsCreateEnabled", true);
            oAppModel.setProperty("/IsSaveEnabled", true);
            oAppModel.setProperty("/IsEditEnabled", false);
            oAppModel.setProperty("/IsMTMCheckboxEnabled", true);
        },

        onNavPress: function (oEvent) {
            var oItem = oEvent.getSource();
            var oContext = oItem.getBindingContext("oDataTradeEntry");
            var oData = oContext.getObject();

            var tradeNo = this.getOwnerComponent().getModel("appModel").getProperty("/TradeNo");
            const oRouter = this.getOwnerComponent().getRouter();
            oRouter.navTo("RouteCostEditView", {
                "costType": oData.COSTID
            });
        },
        onRoundSelect: function (oEvent) {
            var bSelected = oEvent.getParameter("selected");
            if (bSelected) {
                var oAppModel = this.getView().getModel("appModel");
                var sValue = oAppModel.getProperty("/TradeDetails/MTMFACTOR");

                if (sValue !== undefined && sValue !== null && sValue !== "") {
                    var fValue = parseFloat(sValue);

                    if (!isNaN(fValue)) {
                        // ✅ round down (floor)
                        var iRounded = Math.floor(fValue).toFixed(3);

                        // update the model
                        oAppModel.setProperty("/TradeDetails/MTMFACTOR", iRounded);

                        // Uncheck the checkbox immediately after rounding
                        oEvent.getSource().setSelected(false);
                    }
                }
            }
        },
        onAddDialog: function (oEvent) {
            var oButton = oEvent.getSource();
            var sFieldName = oButton.data("fieldName");
            var sModelPath = oButton.data("modelPath"); 
            var sIdField = oButton.data("fieldId");
            var sNameField = oButton.data("fieldActName");
            var sStatusField = oButton.data("fieldStatus");

            var sIdKey = oButton.data("idKey");
            var sNameKey = oButton.data("nameKey");
            var sStatusKey = oButton.data("statusKey");

            var sIdPlaceholder = "Enter " + sIdField;
            var sNamePlaceholder = "Enter " + sNameField;
            var sStatusPlaceholder = "Enter " + sStatusField;

            if (!this.oDefaultDialog) {
                this._oIdInput = new sap.m.Input(this.createId("idInput"), { placeholder: sIdPlaceholder });
                this._oNameInput = new sap.m.Input(this.createId("nameInput"), { placeholder: sNamePlaceholder });
                this._oStatusInput = new sap.m.Input(this.createId("statusInput"), { placeholder: sStatusPlaceholder });

                this.oDefaultDialog = new sap.m.Dialog({
                    title: sFieldName,
                    content: new sap.m.VBox({
                        items: [
                            new sap.m.Label({ text: sIdField }),
                            this._oIdInput,
                            new sap.m.Label({ text: sNameField }),
                            this._oNameInput,
                            new sap.m.Label({ text: sStatusField }),
                            this._oStatusInput
                        ]
                    }).addStyleClass("sapUiSmallMargin"),
                    beginButton: new sap.m.Button({
                        type: sap.m.ButtonType.Emphasized,
                        text: "OK",
                        press: function () {
                            var bValid = true;

                            [this._oIdInput, this._oNameInput, this._oStatusInput].forEach(function(oInput) {
                                oInput.setValueState("None");
                            });

                            var sId = this._oIdInput.getValue().trim();
                            var sName = this._oNameInput.getValue().trim();
                            var sStatus = this._oStatusInput.getValue().trim();

                            if (!sId) { this._oIdInput.setValueState("Error"); this._oIdInput.setValueStateText("Please enter " + sIdField); bValid = false; }
                            if (!sName) { this._oNameInput.setValueState("Error"); this._oNameInput.setValueStateText("Please enter " + sNameField); bValid = false; }
                            if (!sStatus) { this._oStatusInput.setValueState("Error"); this._oStatusInput.setValueStateText("Please enter " + sStatusField); bValid = false; }

                            if (!bValid) return;

                            if (sModelPath) {
                                var oModel = this.getOwnerComponent().getModel("s4HanaModel"); 
                                var oPayload = {};
                                oPayload[sIdKey] = sId;
                                oPayload[sNameKey] = sName;
                                oPayload[sStatusKey] = sStatus;

                                oModel.create(`/${sModelPath}`, oPayload, {
                                    success: function () {
                                        sap.m.MessageToast.show(sFieldName + " saved successfully!");
                                    },
                                    error: function (oError) {
                                        sap.m.MessageToast.show("Error saving " + sFieldName);
                                        console.error(oError);
                                    }
                                });
                            }

                            this.oDefaultDialog.close();
                        }.bind(this)
                    }),
                    endButton: new sap.m.Button({
                        text: "Cancel",
                        press: function () { this.oDefaultDialog.close(); }.bind(this)
                    })
                });

                this.getView().addDependent(this.oDefaultDialog);
            } else {
                this.oDefaultDialog.setTitle(sFieldName);
                this._oIdInput.setPlaceholder(sIdPlaceholder).setValue("").setValueState("None");
                this._oNameInput.setPlaceholder(sNamePlaceholder).setValue("").setValueState("None");
                this._oStatusInput.setPlaceholder(sStatusPlaceholder).setValue("").setValueState("None");
            }

            this.oDefaultDialog.open();
        }

    });
});
