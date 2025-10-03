sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap/base/Log",
    "sap/m/MessageBox"
], (Controller, Log, MessageBox) => {
    "use strict";

    return Controller.extend("hmelpaper.controller.Transfer", {
        onInit() {
            this.getTradeEntryData();
            this.getOwnerComponent().getModel("appModel").setProperty("/IsEditMode", false); 
        },

        getTradeEntryData: function () {
            var oAppModel = this.getOwnerComponent().getModel("appModel");
            var oModel = this.getOwnerComponent().getModel();
            var sPath = `/TradeEntry`;
            var oContextBinding = oModel.bindContext(sPath, undefined, undefined);
            var oBusyDialog = new sap.m.BusyDialog();
            oBusyDialog.open();
            oContextBinding.requestObject().then(function (oData) {
                oBusyDialog.close();
                var tradeDetails = oData.value || [];
                oAppModel.setProperty("/", tradeDetails[0]);
                oAppModel.refresh();
            }.bind(this)).catch(function (oError) {
                oBusyDialog.close();
                console.error("Error fetching project data: ", oError);
            });
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
        },
        onPressEdit: function () {
            var oAppModel = this.getOwnerComponent().getModel("appModel");
            oAppModel.setProperty("/IsCreateEnabled", true);
            oAppModel.setProperty("/IsSaveEnabled", true);
            oAppModel.setProperty("/IsEditEnabled", false);
        },

        onToggleEdit: function () {
            var oViewModel = this.getView().getModel("viewModel");
            var bEdit = oViewModel.getProperty("/editMode");

            oViewModel.setProperty("/editMode", !bEdit);

            var oButton = this.byId("toggleEditBtn");
            if (!bEdit) {
                oButton.setText("Save");
                oButton.setIcon("sap-icon://save");
            } else {
                oButton.setText("Edit");
                oButton.setIcon("sap-icon://edit");

                var oTable = this.byId("costTableId");
                var oBinding = oTable.getBinding("rows");
                var aData = oBinding.getCurrentContexts().map(function (oCtx) {
                    return oCtx.getObject();
                });

                var aPayload = aData.map(function (oRow) {
                    return {
                        TRADE_NO: oRow.TRADE_NO || "",
                        COSTTYPE: oRow.COSTTYPE || "",
                        COSTID: oRow.COSTID || "",
                        PRICETYPE: oRow.PRICETYPE || "",
                        PRICEPREM: oRow.PRICEPREM || "",
                        COSTCURR: oRow.COSTCURR || "",
                        COSTUOM: oRow.COSTUOM || "",
                        BASED_ON_QTY: oRow.BASED_ON_QTY || "",
                        COST_STATUS: oRow.COST_STATUS || "",
                        PRICING_PRECISION: oRow.PRICING_PRECISION || "",
                        OPERATOR: oRow.OPERATOR || "",
                        SETTLEMENT_CURR: oRow.SETTLEMENT_CURR || "",
                        COMPANY: oRow.COMPANY || "",
                        PAYMENT: oRow.PAYMENT || "",
                        tradetype: oRow.tradetype.TRADENAME || {},
                        pricetype: oRow.pricetype.PRCTYPNAME || {}
                    };
                });

                console.log("Payload to save:", aPayload);
                this.byId("createSaveBtn").setEnabled(false);
            }
        },

        onPressSave: function (oEvent) {
            var sAction = oEvent.getSource().data("action")
            var appModel = this.getView().getModel("appModel");
            var tradeData = appModel.getProperty("/TradeDetails");
            var tradeNumber = appModel.getProperty("/TradeNo");
            var tradeTypeMID = appModel.getProperty("/TradeType");
            var status;
            if (sAction == 'draft') {
                status = "D";
            } else if (sAction == 'save') {
                status = tradeData.STATUS;
            } else {
                status = "A"
            }

            var oModel = this.getOwnerComponent().getModel(); // OData V2 model

            function convertToISO(dateStr) {
                if (!dateStr) return null;

                // Case 1: YYYYMMDD
                if (/^\d{8}$/.test(dateStr)) {
                    const year = dateStr.substring(0, 4);
                    const month = dateStr.substring(4, 6);
                    const day = dateStr.substring(6, 8);
                    return `${year}-${month}-${day}T00:00:00`;
                }

                // Case 2: MM/DD/YY or MM/DD/YYYY
                if (dateStr.includes("/")) {
                    const parts = dateStr.split("/");
                    let month = parts[0].padStart(2, "0");
                    let day = parts[1].padStart(2, "0");
                    let year = parts[2].length === 2 ? "20" + parts[2] : parts[2]; // handle YY → 20YY
                    return `${year}-${month}-${day}T00:00:00`;
                }

                // Default: try native Date parsing
                const d = new Date(dateStr);
                if (!isNaN(d)) {
                    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}T00:00:00`;
                }

                return null; // invalid date
            }

            var oView = this.getView();

            var oSavePayload = {
                "TradeNo": tradeNumber || "",
                "TradeDat": null,
                "DealDate": null,
                "StartDat": null,
                "EndDate": null,
                "Prcprdsd": null,
                "Prcprded": null,
                "Lcopdat": null,
                "Prcsdatlag1": null,
                "Prcedatlag1": null,
                "Prcsdatlag2": null,
                "Prcedatlag2": null,
                "Setlmntdat2": null,
                "Tnsfrcmcnt": null,
                "Tnsfrcmpln": null,
                "Efftvedate": null,
                "Vslnordate": null,
                "Declaredat": null,
                "Cststdate": null,
                "Cstendate": null,
                "Inputdate": null,
                "Payduedat": null,
                "Evtstadat": null,
                "Evtenddat": null,
                "Evtestdat": null,
                "Buyfrmdat": null,
                "Buytodate": null,
                "Rndgnmbr": "0.000",
                "Prcfrml1": "0.000",
                "Prcfrml2": "0.000",
                "Prcfrml3": "0.000",
                "Pymtrmdys": "0.000",
                "Opencredit": "0.000",
                "Lcvalue": "0.000",
                "Mtmfactor": "0.000",
                "Aquantity": oView.byId("transferFromContractQty") ? oView.byId("transferFromContractQty").getValue() || "0.000" : "0.000",
                "Cquantity": oView.byId("transferFromContractQty") ? oView.byId("transferFromContractQty").getValue() || "0.000" : "0.000",
                "Prcrndngoff": "0.000",
                "Price": "0.000",
                "Mndteprice": "0.000",
                "Minquant": "0.000",
                "Maxquant": "0.000",
                "Meanquant": "0.000",
                "Schedldqty": oView.byId("transferFromScheduledQty") ? oView.byId("transferFromScheduledQty").getValue() || "0.000" : "0.000",
                "Demrgedays": "0.000",
                "Demrgerate": "0.000",
                "Grnqty": "0.000",
                "Invoiceqty": oView.byId("transferFromInvoiceQty") ? oView.byId("transferFromInvoiceQty").getValue() || "0.000" : "0.000",
                "Otrnqtypaymt": "0.000",
                "Api": "0.000",
                "Spcfcgrvity": "0.000",
                "Tolernbpct": "0.000",
                "Tolernapct": "0.000",
                "Pricedisc": "0.000",
                "Priceprec": "0.000",
                "Costvalue": "0.000",
                "Prcfxdrat": "0.000",
                "Payrolldd": "0.000",
                "Stlmtnday": "0.000",
                "Stlmntpay": oView.byId("transferFromSettlementAmount") ? oView.byId("transferFromSettlementAmount").getValue() || "0.000" : "0.000",
                "Tradtypmid": tradeTypeMID || "",
                "Zschedule": "",
                "Tradtypid": "",
                "Intercomp": "",
                "TraderId": "",
                "Cntrprtid": "",
                "Ttltrmsid": "",
                "Zlocation": "",
                "Pcmrkrid": "",
                "Rndgrlid": "",
                "Prcgtpid": "",
                "Prcgrlid": "",
                "Prcuomid": "",
                "Pymtrmsid": "",
                "Pymtrmrid": "",
                "Pmtcurrid": oView.byId("transferFromOverridePriceCcyCombo") ? oView.byId("transferFromOverridePriceCcyCombo").getSelectedKey() || "" : "",
                "Crdtrmsid": "",
                "Lccode": "",
                "Mtmcrveid": "",
                "Applawid": "",
                "Gtcid": "",
                "Inmttypid": "",
                "Buysellid": "",
                "Qtyunitid": oView.byId("transferFromContractQty1") ? oView.byId("transferFromContractQty1").getValue() || "" : "",
                "Strategyid": "",
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
                "Vehicleid": oView.byId("transferToVehicleCombo") ? oView.byId("transferToVehicleCombo").getSelectedKey() || "" : "",
                "Tnsfrstid": "",
                "Demrgrtuom": "",
                "Grnqtyuomid": "",
                "Invqtyuomid": oView.byId("transferFromInvoiceQtyUomCombo") ? oView.byId("transferFromInvoiceQtyUomCombo").getSelectedKey() || "" : "",
                "Ournqtyuntid": "",
                "Ctseperatlid": "",
                "Costypeuomid": "",
                "Costypecurid": "",
                "Costypetflid": "",
                "Costbasis": "",
                "Basedonpl": "",
                "Coststats": "",
                "Commdtid": oView.byId("transferToCommodity") ? oView.byId("transferToCommodity").getSelectedKey() || "" : "",
                "Delvtrmsid": "",
                "Delvloadid": "",
                "Delvdchrid": "",
                "Origlctin": "",
                "Origpoint": "",
                "Country": "",
                "Tolernoptn": "",
                "Declaredby": "",
                "Costsched": "",
                "CostReve": "",
                "Company": "",
                "Paymnttrm": "",
                "Prcurrid": oView.byId("transferFromBasePriceCurrencySelect") ? oView.byId("transferFromBasePriceCurrencySelect").getSelectedKey() || "" : "",
                "Priceindx": "",
                "Stlmtcrid": "",
                "Stlmtuum": oView.byId("transferFromSettlementAmountUomCombo") ? oView.byId("transferFromSettlementAmountUomCombo").getSelectedKey() || "" : "",
                "Stlmntlev": "",
                "Pamtasign": "",
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
            this.postS4hana(oSavePayload);
        },

        postS4hana: function (oSavePayload) {
            var oModel = this.getOwnerComponent().getModel("s4HanaModel");
            var sServiceUrl = oModel.sServiceUrl + "/ZTM_TRADE_ENTRYSet";

            function getCsrfToken(sServiceUrl) {
                var sToken;
                $.ajax({
                    url: sServiceUrl,
                    type: "GET",
                    async: false,  // Synchronous request
                    headers: {
                        "X-CSRF-Token": "Fetch"
                    },
                    success: function (data, textStatus, request) {
                        sToken = request.getResponseHeader("X-CSRF-Token");
                    },
                    error: function () {
                        sap.m.MessageBox.error("Failed to fetch CSRF token.");
                    }
                });
                return sToken;
            }

            // Function to send POST request
            $.ajax({
                url: sServiceUrl,
                type: "POST",
                contentType: "application/json",
                data: JSON.stringify(oSavePayload),
                headers: {
                    "X-CSRF-Token": getCsrfToken(sServiceUrl)
                },
                success: function (oData) {
                    sap.m.MessageToast.show("Successfully!");
                    console.log("Success:", oData);
                },
                error: function (jqXHR) {
                    sap.m.MessageBox.error("Error: " + jqXHR.responseText);
                }
            });
        },

        onchangetradeno: function (oEvent) {
            // Show busy indicator
            this.getView().setBusy(true);

            // Get selected key from ComboBox
            const sTradeNo = this.byId("topTradeNumberCombo").getSelectedKey();

            if (!sTradeNo) {
                console.warn("No Trade Number selected");
                this.getView().setBusy(false); // hide busy indicator
                return;
            }
            
            // Create JSON model with selected Trade No
            const oSelModel = new sap.ui.model.json.JSONModel({
                TRADE_NO: sTradeNo
            });
            this.getOwnerComponent().setModel(oSelModel, "SelectedTradeNumber");

            // Get OData V4 model
            const oODATAModel = this.getOwnerComponent().getModel("oDataTradeEntry");
            if (oODATAModel) {
                // Build entity path using selected key
                const sPath = `/TradeEntry('${sTradeNo}')`;

                const oBindingContext = oODATAModel.bindContext(sPath, null, {
                    $expand: "counterpart,transferSection,openquomqty,quantityUnit,commodity,transferGroup1,transferGroup2,schedulequom,nominalquom,taxRegion,transportMot,vehicle,transferCargo,convertedqtyuom,cargoqtyuom"
                });

                oBindingContext.requestObject().then(SelectedTradeNumber => {
                    // Store the fetched entity in the same model if needed
                    oSelModel.setData(SelectedTradeNumber);

                    // Hide busy indicator after data is fetched
                    this.getView().setBusy(false);

                    // Print to console
                    console.log("Fetched TradeEntry entity:", SelectedTradeNumber);
                }).catch(err => {
                    console.error("Error fetching entity", err);
                    this.getView().setBusy(false);
                });
            } else {
                console.warn("No oDataTradeEntry model found");
                this.getView().setBusy(false);
            }
        },

    });
});
