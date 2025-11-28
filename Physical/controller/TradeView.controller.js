sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap/m/MessageBox",
	"sap/ui/model/Filter",
	"sap/ui/model/FilterOperator",
    "../model/formatter"
], (Controller,MessageBox, Filter, FilterOperator, formatter) => {
    "use strict";

    return Controller.extend("hmel.com.tradeuiapp.controller.TradeView", {
        formatter: formatter,
        onInit() {
            const oRouter = this.getOwnerComponent().getRouter();
			oRouter.getRoute("RouteTradeView").attachPatternMatched(this.onObjectMatched, this);
            // this.getTradeEntryData();
            this._oBusyDialog = new sap.m.BusyDialog();
            //Set Cost Model
            var oCostModel = new sap.ui.model.json.JSONModel();
            this.getView().setModel(oCostModel, "costModel");
            this.getView().getModel("costModel").setData([]);
            this.getView().getModel("costModel").refresh();
            var oAppModel = this.getOwnerComponent().getModel("appModel");
            
            var oViewModel = new sap.ui.model.json.JSONModel({
                labelOptions: [
                    { key: "Bbl", text: "$/Bbl" },
                    { key: "Mt", text: "$/Mt" }
                ],
                selectedLabel: "" 
            });
            this.getView().setModel(oViewModel, "viewModel");

            var aDecimals = [
                { key: "0", text: "0" },
                { key: "1", text: "1" },
                { key: "2", text: "2" },
                { key: "3", text: "3" },
                { key: "4", text: "4" },
                { key: "5", text: "5" }
            ];

            oAppModel.setProperty("/DecimalOptions", aDecimals);

             var aRounding = [
                { key: "0", text: "0" },
                { key: "1", text: "1" },
                { key: "2", text: "2" },
                { key: "3", text: "3" },
                { key: "4", text: "4" }
            ];
            oAppModel.setProperty("/RoundingOptions", aRounding);

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

            // Get today's date
            var oToday = new Date();
            var sFormattedDate = oToday.getFullYear() + "-" +
                String(oToday.getMonth() + 1).padStart(2, '0') + "-" +
                String(oToday.getDate()).padStart(2, '0');

            oAppModel.setProperty("/TradeCreationDate", sFormattedDate);

            //Data for Split Weekend
            var splitData = {
                "splits": [
                    {splitKey: "before", splitName: "Before"},
                    {splitKey: "after", splitName: "After"}
                ]
            }
            oAppModel.setProperty("/SplitWeekend", splitData);
            var oSplit = {
                "splitWeekend": [
                    {confirmationKey: "yes", confirmationValue: "Yes"},
                    {confirmationKey: "no", confirmationValue: "No"}
                ]
            }
            oAppModel.setProperty("/ConfirmationSplitWeekend", oSplit);

            // this.removeDuplicateCommodity();
            this._bindFormulaComboBox();
            // this._bindMtmCurveComboBox();
        },

		onObjectMatched(oEvent) {
			var tradeNo = oEvent.getParameter("arguments").tradeNumber;
            var phyTradeStatus = oEvent.getParameter("arguments").status;
            var oAppModel = this.getOwnerComponent().getModel("appModel");
            this.getView().getModel("costModel").setData([]);
            this.getView().getModel("costModel").refresh();
            // Get today's date
            var oToday = new Date();
            var sFormattedDate = oToday.getFullYear() + "-" +
                String(oToday.getMonth() + 1).padStart(2, '0') + "-" +
                String(oToday.getDate()).padStart(2, '0');
            oAppModel.setProperty("/TradeCreationDate", sFormattedDate);

            oAppModel.setProperty("/PhyTradeStatus", phyTradeStatus)
            this.checkFieldEnabled(oAppModel, tradeNo, phyTradeStatus);
            var sFilterUrl, sPath;
            // this.filterCostTable()
            if (tradeNo === 'CREATE') {
                // sFilterUrl = `TRADE_NO eq '${tradeNo}'`;
                sPath = `/TradeEntry`;
            } else {
                sFilterUrl = `TRADE_NO eq '${tradeNo}'`;
                sPath = `/TradeEntry?$filter=${encodeURIComponent(sFilterUrl)}`;
                this.getTradeEntryData(sPath);
                this.filterCostTable();
            }
            
            
		},

        filterCostTable: function () {
            var oAppModel = this.getOwnerComponent().getModel("appModel");
            // Bind to the created path
            var oModel = this.getOwnerComponent().getModel();
            var tradeNo = oAppModel.getProperty("/TradeNo");
            // Create a filter for TRADE_NO
            var sFilterUrl = `TRADE_NO eq '${tradeNo}'`;
            var sPath = `/Cost?$expand=tradetype,pricetype&$filter=${encodeURIComponent(sFilterUrl)}`;
            var oContextBinding = oModel.bindContext(sPath, undefined, undefined);
            var oBusyDialog = new sap.m.BusyDialog();
            oBusyDialog.open();            
            // s4 call...
            var s4Model = this.getOwnerComponent().getModel("s4HanaModel");
            var sFilterUrl = `TRADE_NO eq '${tradeNo}'`;
            var sPath = `/ZTA_COSTSet?$filter=${encodeURIComponent(sFilterUrl)}`;
            s4Model.read('/ZTA_COSTSet',{
                filters: [
                    new sap.ui.model.Filter("TrdNum", sap.ui.model.FilterOperator.EQ, tradeNo)
                ],
                success: function (oData) {
                    oBusyDialog.close();
                    var costDetails = oData.results || [];
                    costDetails.forEach(row => {
                        row.isRowEditable = false;
                        row.IsLocal = false; // flag to indicate this row exists in backend
                    });
                    this.getView().getModel("costModel").setData(costDetails);
                    this.getView().getModel("costModel").refresh();
                }.bind(this), 
                error: function(err) {
                    oBusyDialog.close();
                    console.error("Error fetching project data: ", oError);
                }.bind(this)
            });
        },

        checkFieldEnabled: function (oAppModel, tradeNo, phyTradeStatus) {
            // Show BusyDialog
                this._oBusyDialog.open();

                // Auto close after 7 sec
                setTimeout(() => {
                    this._oBusyDialog.close();
                }, 3000);

            // Value in XXX
            oAppModel.setProperty("/ValueInCurrency", "xxx");

            // Button
            oAppModel.setProperty("/showCaluculateButton", false);
            
            //For Other Primary Cost
            oAppModel.setProperty("/isOSPAvailable", false);
            oAppModel.setProperty("/isPremDiscAvailable", false);
            oAppModel.setProperty("/isOtherPremDiscAvailable", false);
            oAppModel.setProperty("/isAPIAvailable", false);

            //For Pricing Rule
            oAppModel.setProperty("/isSpecificDateRange", false);
            oAppModel.setProperty("/isTentativeDate", false);
            oAppModel.setProperty("/isBeforeAfterDays", false);

            //For Payment Assignment
            oAppModel.setProperty("/isOtherCounterPty", false)

            //For Letter of Credit
            oAppModel.setProperty("/isLCVisible", false);
            oAppModel.setProperty("/isOpenCreditVisible", false);
            oAppModel.setProperty("/isBGVisible", false)
            oAppModel.setProperty("/isOpenCreditFieldVisible", false);
            //For COST table
            oAppModel.setProperty("/IsCOSTSelectionActive", false);
            oAppModel.setProperty("/IsCOSTSaveActive", true);
            oAppModel.setProperty("/ShowHolidayPayment", false);
            oAppModel.setProperty("/ShowHolidayPrice", false);
            oAppModel.setProperty("IsSplitEnabled", true);
            

            if (phyTradeStatus === 'TERM' || phyTradeStatus === 'SPOT' ) {
                
                oAppModel.setProperty("/TradeNo", "");
                oAppModel.setProperty("/IsTradeNumberEnabled", true);
                // oAppModel.setProperty("/TradeDetails", []);
                oAppModel.setProperty("/IsCreateEnabled", true);
                oAppModel.setProperty("/IsEditEnabled", false);
                oAppModel.setProperty("/TradeDetails", []);
                oAppModel.setProperty("/IsSaveEnabled", true);
                oAppModel.setProperty("/IsSaveAsDraftEnabled", true);
                //For COST table
                oAppModel.setProperty("/IsCOSTSaveActive", false);
                oAppModel.setProperty("/showCaluculateButton", false);
                
            }
            // else if (phyTradeStatus === "DRAFT") {
            //     oAppModel.setProperty("/TradeNo", tradeNo);
            //     oAppModel.setProperty("/IsTradeNumberEnabled", false);
            //     oAppModel.setProperty("/IsCreateEnabled", false)
            //     oAppModel.setProperty("/IsEditEnabled", true);
            //     oAppModel.setProperty("/IsSaveEnabled", false);
            //     oAppModel.setProperty("/IsSaveAsDraftEnabled", true);
            // }
            // else if(phyTradeStatus === "TERM") {

            // } else if(phyTradeStatus === "SPOT") {
                
            // } else if(phyTradeStatus === "LIFTTERM") {
                
            // } 
            else {
                oAppModel.setProperty("/TradeNo", tradeNo);
                oAppModel.setProperty("/IsTradeNumberEnabled", false);
                oAppModel.setProperty("/IsCreateEnabled", false)
                oAppModel.setProperty("/IsEditEnabled", true);
                oAppModel.setProperty("/IsSaveEnabled", false);
                oAppModel.setProperty("/IsSaveAsDraftEnabled", false);
                oAppModel.setProperty("/showCaluculateButton", true);
            }

            if (phyTradeStatus === 'TERM' ) {
                oAppModel.setProperty("/showCostTab", false);
            }
            else{
                oAppModel.setProperty("/showCostTab", true);
            }

            var oTitle = this.getView().byId("page");
            if(phyTradeStatus === "LIFTTERM") {
                oTitle.setTitle(`Lifting from Term: ${tradeNo}`)
            } else if(phyTradeStatus === "SPOT") {
                oTitle.setTitle(`Create Trade Entry.`)
            } else if(phyTradeStatus === "TERM") {
                oTitle.setTitle(`Create Term.`)
            }else if(phyTradeStatus === "PHYSICAL") {
                oTitle.setTitle(`#${tradeNo} is now being edited.`)
            }
            oAppModel.refresh();
        },

        onNavPress: function (oEvent) {
            var oItem = oEvent.getSource();  
            var oContext = oItem.getBindingContext();
            var oData = oContext.getObject();

            var tradeNo = this.getOwnerComponent().getModel("appModel").getProperty("/TradeNo");
            const oRouter = this.getOwnerComponent().getRouter();
            oRouter.navTo("RouteCostEditView", {
                "costType": oData.COSTID
                // "costType": tradeNo
            });
        },

        getTradeEntryData: function (sPath) {
            var oAppModel = this.getOwnerComponent().getModel("appModel");
            var tradeNo = oAppModel.getProperty("/TradeNo")

            var s4Model = this.getOwnerComponent().getModel("s4HanaModel"); // example model name
            var oBusyDialog = new sap.m.BusyDialog();
            oBusyDialog.open();

            s4Model.read("/ZTA_TRADE_ENTRYSet", {
                filters: [
                    new sap.ui.model.Filter("TrdNum", sap.ui.model.FilterOperator.EQ, tradeNo)
                ],
                success: function(oData) {
                    oBusyDialog.close();
                    var tradeDetails = oData.results || [];
                    

                    oAppModel.setProperty("/TradeDetails", tradeDetails[0]);
                    // Extract TRADER_NAME (unique, as array of objects)
                    var aTraderNames = [...new Set(tradeDetails.map(function (item) {
                        return item.TRADER_NAME;
                    }))].map(function (name) {
                        return { TRADER_NAME: name };
                    });

                    // Store in model
                    var phyStatus = oAppModel.getProperty("/PhyTradeStatus")
                    if(phyStatus !== "LIFTTERM") {
                        oAppModel.setProperty("/TradeCreationDate", tradeDetails[0].TrdCrdt);
                    }
                    // oAppModel.setProperty("/TradeCreationDate", tradeDetails[0].TrdCrdt);
                    oAppModel.setProperty("/TraderNames", aTraderNames);
                    var tradeList = tradeDetails[0];

                    //If Sell...
                    if(tradeList.TrdBysl == "2") {
                        var oView = this.getView();
                        oView.byId("sellerId").setText("Buyer");
                        oView.byId("buyerId").setText("Seller");
                    }

                    // Calculating DiffVal
                    var trdTotVal = parseFloat(tradeList.TrdTotval) || 0;
                    var trdvalUSD = parseFloat(tradeList.TrdValusd) || 0;
                    var trdDffVal = trdTotVal - trdvalUSD;
                    oAppModel.setProperty("/TradeDetails/TrdDffval", trdDffVal.toFixed(2));

                    //Pricing Rule
                    if(tradeList.TrdPrrul === "1") {
                        oAppModel.setProperty("/isSpecificDateRange", true);
                    } else if (tradeList.TrdPrrul === "2" || tradeList.TrdPrrul === "3" || tradeList.TrdPrrul === "4" || tradeList.TrdPrrul === "5") {
                        oAppModel.setProperty("/isTentativeDate", true);
                    }

                    //Payment Assignment
                    if(tradeList.TrdPayasg === "1") {
                        oAppModel.setProperty("/isOtherCounterPty", true);
                    } 
                    else  {
                        oAppModel.setProperty("/isOtherCounterPty", false);
                    }

                    //Payment Term
                    if (tradeList.TrdPaytrm === "3"){
                        oAppModel.setProperty("/IsSplitEnabled", false);
                    }
                    else{
                        oAppModel.setProperty("/IsSplitEnabled", true);
                    }

                    
                    //For Letter of Credit...
                    if(tradeList.TrdCrtrm == '1') {
                        oAppModel.setProperty("/isOpenCreditVisible", true);
                    } else if(tradeList.TrdCrtrm == '5' || tradeList.TrdCrtrm == '3') {
                        oAppModel.setProperty("/isOpenCreditFieldVisible", true);
                        oAppModel.setProperty("/isOpenCreditVisible", true);
                        oAppModel.setProperty("/isLCVisible", true);

                        var sStartDate = tradeList.TrdDlvsdt;
                        var iNoOfDays = parseInt(tradeList.TrdLcdays, 10); 

                        if (!sStartDate || isNaN(iNoOfDays)) {
                            return; 
                        }

                        var oStartDate = new Date(sStartDate);
                        var oLCDate = new Date(oStartDate);
                        oLCDate.setDate(oStartDate.getDate() + iNoOfDays);
                        var sLCOpenDate = oLCDate.toISOString().split("T")[0];

                        oAppModel.setProperty("/TradeDetails/TrdLcopdt", sLCOpenDate);

                    } else if(tradeList.TrdCrtrm == '4') {
                        // oAppModel.setProperty("/isOpenCreditFieldVisible", true);
                        // oAppModel.setProperty("/isLCVisible", true);
                        // oAppModel.setProperty("/isOpenCreditVisible", true);
                        oAppModel.setProperty("/isBGVisible", true);
                    }
                    //For Other Cost
                    // Convert string to array
                    var aTrdOthcst = tradeList.TrdOthcst?.split(",") || [];

                    // Mapping keys to model properties
                    var oFlagsMap = {
                        "osp": "/isOSPAvailable",
                        "pd": "/isPremDiscAvailable",
                        "opd": "/isOtherPremDiscAvailable",
                        "api": "/isAPIAvailable"
                    };
                    // Reset all flags
                    Object.values(oFlagsMap).forEach(function (sPath) {
                        oAppModel.setProperty(sPath, false);
                    });
                    // Set flags based on array
                    aTrdOthcst.forEach(function (sKey) {
                        if (oFlagsMap[sKey]) {
                            oAppModel.setProperty(oFlagsMap[sKey], true);
                        }
                    });
                    oAppModel.setProperty("/TradeDetails/TrdOthcst", aTrdOthcst);

                    //For Holiday Calendar
                    if(tradeList.Pymntdays === "Banking") {
                        oAppModel.setProperty("/ShowHolidayPayment", true);
                    }

                    // checkBox in Rounding
                    if(tradeList.DateCeil === "x"){
                        this.getView().byId("dateCeil").setSelected(true);
                    } else {
                        this.getView().byId("dateCeil").setSelected(false);
                    }
                    if (tradeList.CurveCeil === "x") {
                        this.getView().byId("curveCeil").setSelected(true);
                    } else {
                        this.getView().byId("curveCeil").setSelected(false);
                    }
                    if (tradeList.AverageCeil === "x") {
                        this.getView().byId("avgCeil").setSelected(true);
                    } else {
                        this.getView().byId("avgCeil").setSelected(false);
                    }
                    if (tradeList.TotalCeil === "x") {
                        this.getView().byId("totalCeil").setSelected(true);
                    } else {
                        this.getView().byId("totalCeil").setSelected(false);
                    }

                    //Currency Set
                    var sCurrency = tradeList.TrdMtmcr || 'xxx';
                    oAppModel.setProperty("/ValueInCurrency", sCurrency);

                    var sReference = tradeList.Reference;
                    var BLdate = tradeList[sReference];
                    if (BLdate) {
                        this._calculatePaymentDueDate(BLdate);
                    }

                    var crRef = tradeList.CrReference;
                    var crDate = tradeList[crRef];
                    if(crDate) {
                        if(tradeList.TrdCrtrm === '4') { //BG
                            this._calculateLCBGDueDate(crDate, false, true);
                        }
                        if(tradeList.TrdCrtrm === '3' || tradeList.TrdCrtrm === '5') { //LC + Open
                            this._calculateLCBGDueDate(crDate, true, false);
                        }
                    }

                    
                    oAppModel.refresh();
                }.bind(this),
                error: function(oError) {
                    oBusyDialog.close();
                    console.error("Error retrieving trade data:", oError);
                }
            });
        },

        onPressSave: function (oEvent) {
            var sAction = oEvent.getSource().data("action")
            var appModel = this.getView().getModel("appModel"); 
            var tradeData = appModel.getProperty("/TradeDetails");
            var tradeNumber = appModel.getProperty("/TradeNo");
            var tradeTypeMID = appModel.getProperty("/TradeType");
            var sStatus = appModel.getProperty("/PhyTradeStatus")
            var tradeCreDate = appModel.getProperty("/TradeCreationDate");
            // var phyTradeStatus = appModel.getProperty("/PhyTradeStatus");

            //Cost table validation
            var oCostModel = this.getView().getModel("costModel");
            var aCostData = oCostModel.getData() || [];
            var bIsCOSTSaveActive = appModel.getProperty("/IsCOSTSaveActive");appModel.getProperty("/PhyTradeStatus");
            // Check if any row is editable
            var bAnyEditable = aCostData.some(function (item) {
                return item.isRowEditable === true;
            });

            if (bAnyEditable && bIsCOSTSaveActive) {
                sap.m.MessageBox.warning("Please save the Cost table before saving the trade entry.");
                return; // Stop further execution
            }
            //
            var trdNump;
            if (sStatus === "TERM") {
                trdNump = "T";
                // tradeNumber = "T" + tradeNumber;
            } else {
                trdNump = "";
            }
            if (sStatus === "DRAFT") {
                trdNump = tradeData.TrdNumP || '';
            }
            var status;
            if (sAction == 'draft') {
                status = "D";
            } else if (sAction == 'save') {
                status = 'A';
            } else {
                status = "A"
            }
            var tradeNumPref
            if(sStatus === "LIFTTERM") {
                tradeNumPref=tradeNumber
                tradeNumber = "";
                trdNump = "";
            } else {
                tradeNumPref = "";
            }



            var oModel = this.getOwnerComponent().getModel(); // OData V2 model

             function convertToISO(dateStr) {
                if (!dateStr) return null;

                // If it's already a Date object
                if (dateStr instanceof Date) {
                    const year = dateStr.getFullYear();
                    const month = String(dateStr.getMonth() + 1).padStart(2, "0");
                    const day = String(dateStr.getDate()).padStart(2, "0");
                    return `${year}-${month}-${day}T00:00:00`;
                }

                // If it's a date string like "Thu Oct 23 2025 00:00:00 GMT+0530 (India Standard Time)"
                const parsedDate = new Date(dateStr);
                if (!isNaN(parsedDate)) {
                    const year = parsedDate.getFullYear();
                    const month = String(parsedDate.getMonth() + 1).padStart(2, "0");
                    const day = String(parsedDate.getDate()).padStart(2, "0");
                    return `${year}-${month}-${day}T00:00:00`;
                }

                return null; // invalid date
            }

            function formatDecimals(value) {
                // If value is empty, null, or undefined
                if (value === "" || value === null || value === undefined) {
                    return "0.000"; // return as string (formatted)
                }
                // Convert empty or undefined to 0
                var num = parseFloat(value);
                if (isNaN(num)) {
                    num = "0.00";
                }
                // Return value
                return num.toFixed(3);
            }

            function formatToFiveDecimals(value) {
                // If value is empty, null, or undefined
                if (value === "" || value === null || value === undefined) {
                    return "0.00000"; // return as string (formatted)
                }
                // Convert empty or undefined to 0
                var num = parseFloat(value);
                if (isNaN(num)) {
                    num = 0;
                }
                // Return value with exactly 5 decimal places
                return num.toFixed(5);
            }
            var that = this;
            function getCeilValue(sID) {
                var oCheckBox = that.getView().byId(sID);
                var bSelected = oCheckBox.getSelected(); // returns true if checked, false if unchecked

                // Convert to 'X' or ''
                var sValue = bSelected ? "x" : "";
                return sValue;
            }

            var oComboBox = this.byId("formulacb");
            var sSelectedKey = oComboBox.getSelectedKey();       
            var sSelectedText = oComboBox.getSelectedItem()?.getText();  

            var oSavePayload = {
                "TrdNum": tradeNumber || "",
                "TrdNumP": trdNump,
                "RefTrdnum": tradeNumPref,
                "TrdStat": status,
                "TrdMtype": tradeTypeMID,
                "TrdBysl": tradeData.TrdBysl || "",
                "TrdExedt": convertToISO(tradeData.TrdExedt) || null, // Read-only
                "TrdCrdt": convertToISO(tradeCreDate) || null,
                "TrdCnpty": tradeData.TrdCnpty || "", // Read-only
                "TrdIntcmp": tradeData.TrdIntcmp || "",
                "TrdTrdr": tradeData.TrdTrdr || "",  // Read-only
                "TrdCmdty": tradeData.TrdCmdty || "", // Read-only
                "TrdPrdtyp": tradeData.TrdPrdtyp || "",
                "TrdApicn": tradeData.TrdApicn || "0.00",
                "TrdApiup": formatDecimals(tradeData.TrdApiup),
                "TrdApilw": formatDecimals(tradeData.TrdApilw),
                "TrdApidsl": formatToFiveDecimals(tradeData.TrdApidsl),
                "TrdApidsf": formatToFiveDecimals(tradeData.TrdApidsf),
                "TrdQtymn": tradeData.TrdQtymn || "0.00",
                "TrdQtymin": tradeData.TrdQtymin || "0.00",
                "TrdQtymax": tradeData.TrdQtymax || "0.00",
                "TrdDclby": tradeData.TrdDclby || "",
                "TrdDcldt": convertToISO(tradeData.TrdDcldt) || null,
                "TrdBlpct": tradeData.TrdBlpct || "0.00",
                "TrdAbpct": tradeData.TrdAbpct || "0.00",
                "TrdOptn": tradeData.TrdOptn || "",
                "TrdQtymt": tradeData.TrdQtymt || "0.00",
                "TrdQtybbl": tradeData.TrdQtybbl || "0.00",
                "TrdStprc": tradeData.TrdStprc || "0.00",
                "TrdStpcuom": tradeData.TrdStpcuom || "0.00",
                "TrdDlvtrm": tradeData.TrdDlvtrm || "", // Read-only
                "TrdLdprt": tradeData.TrdLdprt || "", // Read-only
                "TrdDsprt": tradeData.TrdDsprt || "", // Read-only
                "TrdCntry": tradeData.TrdCntry || "",
                "TrdDlvsdt": convertToISO(tradeData.TrdDlvsdt) || null,
                "TrdDlvedt": convertToISO(tradeData.TrdDlvedt) || null,
                "TrdPrctyp": tradeData.TrdPrctyp || "",
                "TrdForm": tradeData.TrdForm || "",
                "TrdPrcFNam":this.getView().byId("formulacb").getValue(),
                "TrdOthcst": Array.isArray(tradeData.TrdOthcst)
                            ? tradeData.TrdOthcst.join(",")
                            : tradeData.TrdOthcst || "",
                "TrdPrdisc": formatDecimals(tradeData.TrdPrdisc),
                "TrdPrduom": tradeData.TrdPrduom || "",
                "TrdPrdiscr": tradeData.TrdPrdiscr || "",
                "TrdOpdiscuom": tradeData.TrdOpdiscuom,
                "TrdOpdisccr": tradeData.TrdOpdisccr,
                "TrdOspdrp":tradeData.TrdOspdrp || "",
                "TrdOpdisc": formatDecimals(tradeData.TrdOpdisc),
                "TrdSchd": tradeData.TrdSchd || "",
                "TrdPrrul": tradeData.TrdPrrul || "",
                "TrdPrcsdt": convertToISO(tradeData.TrdPrcsdt) || null,
                "TrdPrcedt": convertToISO(tradeData.TrdPrcedt) || null,
                "TrdPrctm": tradeData.TrdPrctm || "",
                "TrdMtmcv": tradeData.TrdMtmcv || "",
                "TrdMtmfc": tradeData.TrdMtmfc || "",
                "TrdMtmcr": tradeData.TrdMtmcr || "",
                "TrdPpstdt": convertToISO(tradeData.TrdPpstdt) || null,
                "TrdPpendt": convertToISO(tradeData.TrdPpendt) || null,
                "TrdQty": tradeData.TrdQty || "0.00", // Read-only
                "TrdValusd": tradeData.TrdValusd || "0.00",
                "TrdStcur": tradeData.TrdStcur || "",
                // "TrdStuom": tradeData.TrdStuom || "",// Commented as it is not required in the ui
                "TrdPaytrm": tradeData.TrdPaytrm || "",
                "TrdPaydt": convertToISO(tradeData.TrdPaydt) || null,
                "TrdPayasg": tradeData.TrdPayasg || "",
                "TrdAlaw": tradeData.TrdAlaw || "",
                "TrdGtc": tradeData.TrdGtc || "",
                "TrdCrtrm": tradeData.TrdCrtrm || "",
                "TrdTotval": tradeData.TrdTotval || "0.00",
                "TrdLc": tradeData.TrdLc || "",
                "TrdLcedt": convertToISO(tradeData.TrdLcedt) || null,
                "TrdLcdays": tradeData.TrdLcdays || "0",
                "TrdBg": tradeData.TrdBg || "",
                "TrdBgedt": convertToISO(tradeData.TrdBgedt) || null,
                "TrdBgdays": tradeData.TrdBgdays || "0.00",
                "TrdOpcrd": tradeData.TrdOpcrd || "0.00",
                "TrdQtymuom": tradeData.TrdQtymuom || "",
                "TrdTvlcur": tradeData.TrdTvlcur || "",
                "TentDate": convertToISO(tradeData.TentDate) || null,
                "NdysBefore": tradeData.NdysBefore || "0.00",
                "NdaysAfter": tradeData.NdaysAfter || "0.00",
                "TrdCnpty2": tradeData.TrdCnpty2 || "",
                "LcPaytrm": tradeData.LcPaytrm || "",
                "BgPaytrm": tradeData.BgPaytrm || "",
                "Pymntdays": tradeData.Pymntdays || "",
                "HolidayPaymnt": tradeData.HolidayPaymnt || "",
                "HolidayPrice": tradeData.HolidayPrice || "",
                "PimsCode":  tradeData.PimsCode || "", // Commented as it is not required in the ui
                "TrdSpwknd": tradeData.TrdSpwknd || "",
                "TrdPtndays": tradeData.TrdPtndays || "0",
                "TrnPtndaysc" : tradeData.TrnPtndaysc || "0",
                "TrdDffval": tradeData.TrdDffval || "0.00",
                "TrdPcalcdt": convertToISO(tradeData.TrdPcalcdt) || null,
                "TrdFinpdt": convertToISO(tradeData.TrdFinpdt) || null,
                "DateRound": tradeData.DateRound || "0",
                "CurveRound": tradeData.CurveRound || "0",
                "AverageRound": tradeData.AverageRound || "0",
                "TotalRound": tradeData.TotalRound || "0",
                "DateCeil": getCeilValue("dateCeil"),
                "CurveCeil": getCeilValue("curveCeil"),
                "AverageCeil": getCeilValue("avgCeil"),
                "TotalCeil": getCeilValue("totalCeil"),
                "Reference": tradeData.Reference || "",
                "TrdCargovl": tradeData.TrdCargovl || "0.00",
                "CrReference": tradeData.CrReference || "",
                //other payload
                 // Vehicle field
                "TrdVeh": tradeData.TrdVeh || "",
                // Date fields - use getValue() to get formatted string value
                "TrdWsdt": tradeData.TrdWsdt || null,
                "TrdWedt": tradeData.TrdWedt || null,
                "NorDate": convertToISO(tradeData.NorDate) || null,
                "DschDate": convertToISO(tradeData.DschDate) || null,
                "BlDate": convertToISO(tradeData.BlDate) || null,
                  // Load Port fields - static controls
                "Lp1Qtybbl": tradeData.Lp1Qtybbl || "0.00",
                "Lp1Qtymt": tradeData.Lp1Qtymt || "0.00",
                "Lp1Tmp": tradeData.Lp1Tmp || "0.00",
                "Lp1Api": tradeData.Lp1Api || "0.00",
                "Lp1Apiuom": tradeData.Lp1Apiuom || "",
                "Lp1Trndt": convertToISO(tradeData.Lp1Trndt) || null,
                "Lp1Msc": tradeData.Lp1Msc || "0.00",
                "Lp1Mscuom": tradeData.Lp1Mscuom || "",
                  // Discharge Port fields - static controls
                "Dp1Qtybbl": tradeData.Dp1Qtybbl || "0.00",
                "Dp1Qtymt": tradeData.Dp1Qtymt || "0.00",
                "Dp1Tmp": tradeData.Dp1Tmp || "0.00",
                "Dp1Api": tradeData.Dp1Api || "0.00",
                "Dp1Apiuom": tradeData.Dp1Apiuom || "",
                "Dp1Trndt": tradeData.Dp1Trndt || null,
                "Dp1Msc": tradeData.Dp1Msc || "0.00",
                "Dp1Mscuom": tradeData.Dp1Mscuom || "",
                    // GRN Discharge Port fields - get from view controls or fallback to data
                "GrDp1Qtybbl": tradeData.GrDp1Qtybbl || "0.00",
                "GrDp1Qtymt": tradeData.GrDp1Qtymt || "0.00",
                "GrDp1Tmp": tradeData.GrDp1Tmp || "0.00",
                "GrDp1Api": tradeData.GrDp1Api || "0.00",
                "GrDp1Trndt": convertToISO(tradeData.GrDp1Trndt) || null,
                // "GrDp1Tmp": tradeData.GrDp1Tmp || "0.00",
                // "GrDp1Api": tradeData.GrDp1Api || "0.00",
                // "GrDp1Apiuom": tradeData.GrDp1Apiuom || "",
                // "GrDp1Trndt": convertToISO(tradeData.GrDp1Trndt) || null,
                // "GrDp1Msc": tradeData.GrDp1Msc || "0.00",
                // "GrDp1Mscuom": tradeData.GrDp1Mscuom || ""
                // GRN Discharge Port 2 fields - dynamically generated controls
                // "GrDp2Qtybbl": getControlValue("discPortDp1GRN", "dischargePortsVBoxGRN", 1),
                // "GrDp2Qtymt": getControlValue("discPortQtMt2GRN", "dischargePortsVBoxGRN", 1),
                // "GrDp2Tmp": getControlValue("discPortTmpGRN", "dischargePortsVBoxGRN", 1),
                // "GrDp2Api": getControlValue("discPortApiGRN", "dischargePortsVBoxGRN", 1),
                // "GrDp2Apiuom": tradeData.GrDp2Apiuom || "",
                // "GrDp2Trndt": convertToISO(getControlValue("discPortTrndtGRN", "dischargePortsVBoxGRN", 1)) || null,
                // "GrDp2Msc": getControlValue("discPortMscGRN", "dischargePortsVBoxGRN", 1),
                // "GrDp2Mscuom": getControlValue("discPortMscuomGRN", "dischargePortsVBoxGRN", 1),
                // // GRN Discharge Port 3 fields - dynamically generated controls

                // "GrDp3Qtybbl": getControlValue("discPortDp1GRN", "dischargePortsVBoxGRN", 2),
                // "GrDp3Qtymt": getControlValue("discPortQtMt2GRN", "dischargePortsVBoxGRN", 2),
                // "GrDp3Tmp": getControlValue("discPortTmpGRN", "dischargePortsVBoxGRN", 2),
                // "GrDp3Api": getControlValue("discPortApiGRN", "dischargePortsVBoxGRN", 2),
                // "GrDp3Apiuom": tradeData.GrDp3Apiuom || "",
                // "GrDp3Trndt": convertToISO(getControlValue("discPortTrndtGRN", "dischargePortsVBoxGRN", 2)) || null,
                // "GrDp3Msc": getControlValue("discPortMscGRN", "dischargePortsVBoxGRN", 2),
                // "GrDp3Mscuom": getControlValue("discPortMscuomGRN", "dischargePortsVBoxGRN", 2)

                // Chartering 
                "TrdLoc": tradeData.TrdLoc || "",
                "TrdDemday": tradeData.TrdDemday || "0.00",
                "TrdDemrat": tradeData.TrdDemrat || "0.00",
                "TrdDemuom": tradeData.TrdDemuom || "",
                "CstType": tradeData.CstType || "",
                "CstUom": tradeData.CstUom || "",
                "CstCur": tradeData.CstCur || "",
                "CstCurval": tradeData.CstCurval || "0.00",
                "CstEstfn": tradeData.CstEstfn || ""      
            }
            // this.postS4hana(oSavePayload);
            console.log(oSavePayload);

            // var bIsRowEditable = appModel.getProperty("/isRowEditable");
            // var bIsCOSTSaveActive = appModel.setProperty("/IsCOSTSaveActive");
            // if (bIsRowEditable && bIsCOSTSaveActive) {
            //     sap.m.MessageBox.error("Please save in Cost Table");
            //     return;
            // }
            var oModel = this.getOwnerComponent().getModel("s4HanaModel");
            oModel.create("/ZTA_TRADE_ENTRYSet", oSavePayload, {
                    success: function (oData) {
                        var sMessage;
                        if (sStatus !== "TERM") {
                            
                            if (!tradeNumber) {
                                sMessage = `${oData.TrdNum} Created Successfully!`
                                this.onPostCost(oData.TrdNum, trdNump, true);
                            }
                            if (!sMessage) {
                                sMessage = `${oData.TrdNum} Saved Successfully!`
                            }
                            sap.m.MessageBox.show(sMessage, {
                                icon: sap.m.MessageBox.Icon.SUCCESS,
                                title: "Success",
                                actions: [sap.m.MessageBox.Action.OK],
                                onClose: function () {
                                    // location.reload(); 
                                    if (sAction == 'draft') {
                                    var oAppModel = this.getView().getModel("appModel");
                                    oAppModel.setProperty("/TradeDetails/IsDraftSaved", true);
                                    oAppModel.setProperty("/TradeNo", oData.TrdNum);
                                    }
                                    else if (sAction == 'save'){
                                        //  Navigate to the Overview page
                                        const oRouter = this.getOwnerComponent().getRouter();
                                        oRouter.navTo("RouteOverview");
                                    }
                                }.bind(this)
                            });
                        } else {
                            if (!tradeNumber) {
                                sMessage = `${oData.TrdNum} Created Successfully!`
                            }
                            if (!sMessage) {
                                sMessage = `${oData.TrdNum} Saved Successfully!`
                            }
                            sap.m.MessageBox.show(sMessage, {
                                icon: sap.m.MessageBox.Icon.SUCCESS,
                                title: "Success",
                                actions: [sap.m.MessageBox.Action.OK],
                                onClose: function () {
                                    //Navigate to the Overview page
                                    const oRouter = this.getOwnerComponent().getRouter();
                                    oRouter.navTo("RouteOverview");
                                }.bind(this)
                            });
                        }
                    }.bind(this),
                    error: function (oError) {
                        sap.m.MessageBox.error("Error while creating TradeEntry");
                        console.error("Create failed:", oError);
                    }
                });
        },

        onPostCost: function (tradeNo, trdNump, isNewReq, status) {
            function convertToISO(dateStr) {
                if (!dateStr) return null;

                // If it's already a Date object
                if (dateStr instanceof Date) {
                    const year = dateStr.getFullYear();
                    const month = String(dateStr.getMonth() + 1).padStart(2, "0");
                    const day = String(dateStr.getDate()).padStart(2, "0");
                    return `${year}-${month}-${day}T00:00:00`;
                }

                // If it's a date string like "Thu Oct 23 2025 00:00:00 GMT+0530 (India Standard Time)"
                const parsedDate = new Date(dateStr);
                if (!isNaN(parsedDate)) {
                    const year = parsedDate.getFullYear();
                    const month = String(parsedDate.getMonth() + 1).padStart(2, "0");
                    const day = String(parsedDate.getDate()).padStart(2, "0");
                    return `${year}-${month}-${day}T00:00:00`;
                }

                return null; // invalid date
            }

            
            return new Promise(function (resolve, reject) {
                var oCostModel = this.getView().getModel("costModel");
                var aData = oCostModel.getProperty("/") || [];
                // If no data, exit early
                if (!aData.length) {
                    resolve(true); // nothing to save
                    return;
                }
                 
                // Filter only rows that are editable
                var aEditableData = aData.filter(function (item) {
                    return item.isRowEditable === true;
                });

                // If no editable rows, exit early
                if (!aEditableData.length) {
                    resolve(true); // nothing to save
                    return;
                }

                // Build payload
                var aPayload = aEditableData.map(function (item) {
                    return {
                        TrdNum: isNewReq ? tradeNo : item.TrdNum || "",
                        CstUuid: item.CstUuid? item.CstUuid: "", //String(new Date().getTime())
                        TrdNumP: isNewReq ? trdNump : item.TrdNumP || "",
                        CstType: item.CstType || "",
                        CstEstfn: item.CstEstfn || "",
                        CstStas: item.CstStas ? item.CstStas : status,
                        CstPrctyp: item.CstPrctyp || "",
                        CstExpcur: item.CstExpcur || "",
                        CstStcur: item.CstStcur || "",
                        CstExrt: item.CstExrt || "",
                        CstPaydt: convertToISO(item.CstPaydt) || null,
                        CstComp: item.CstComp || "",
                        CstPrfor: item.CstPrfor || ""
                    };
                });

                var oModel = this.getOwnerComponent().getModel("s4HanaModel");

                // You can’t post an array directly — must loop through each item
                var aPromises = aPayload.map(function (oItem) {
                    return new Promise(function (resolveEach, rejectEach) {
                        oModel.create("/ZTA_COSTSet", oItem, {
                            success: function () {
                                resolveEach();
                            },
                            error: function (oError) {
                                rejectEach(oError);
                            }
                        });
                    });
                });

                Promise.all(aPromises)
                    .then(function () {
                        resolve(true); // ✅ All cost items saved successfully
                    })
                    .catch(function (oError) {
                        reject(oError);
                    });

            }.bind(this));
        },

        onPressEdit: function () {
            var oAppModel = this.getOwnerComponent().getModel("appModel");
            oAppModel.setProperty("/IsCreateEnabled", true);
            oAppModel.setProperty("/IsSaveEnabled", true);
            oAppModel.setProperty("/IsEditEnabled", false);
            var sStatus = oAppModel.getProperty("/PhyTradeStatus");
            if (sStatus === "DRAFT") {
                oAppModel.setProperty("/IsSaveAsDraftEnabled", true);
            } else {
                oAppModel.setProperty("/IsSaveAsDraftEnabled", false);
            }
            
        },

        onRowSelectionChange: function (oEvent) {
            var oTable = this.byId("costTableId");
            var aSelectedIndices = oTable.getSelectedIndices();
            var appModel = this.getView().getModel("appModel");
            if (aSelectedIndices.length > 0) {
                appModel.setProperty("/IsCOSTSelectionActive", true);
            } else {
                appModel.setProperty("/IsCOSTSelectionActive", false);
            }
            // this.byId("toggleEditBtn").setEnabled(aSelectedIndices.length > 0);
        },

        onToggleEdit: function () {
            var oTable = this.byId("costTableId");
            var aSelectedIndices = oTable.getSelectedIndices();
            var oCostModel = this.getView().getModel("costModel");
            var oData = oCostModel.getData();

            if (aSelectedIndices.length > 0) {
                aSelectedIndices.forEach(function (iIndex) {
                    // Always set to editable (don’t toggle)
                    oData[iIndex].isRowEditable = true;
                });

                oCostModel.refresh(true);
                this.byId("toggleSaveBtn").setEnabled(true);
            } else {
                sap.m.MessageToast.show("Please select at least one row to edit.");
            }
        },

        onToggleDel: function () {
            var oTable = this.byId("costTableId");
            var oModel = this.getView().getModel("costModel");

            var aSelectedIndices = oTable.getSelectedIndices();
            if (aSelectedIndices.length === 0) {
                sap.m.MessageToast.show("Please select at least one row to delete.");
                return;
            }

            sap.m.MessageBox.confirm("Are you sure you want to delete the selected rows?", {
                title: "Confirm Delete",
                onClose: function (sAction) {
                    if (sAction === sap.m.MessageBox.Action.OK) {
                        var aData = oModel.getProperty("/") || [];

                        // Sort descending so we can safely remove from model
                        aSelectedIndices.sort((a,b) => b-a);

                        aSelectedIndices.forEach(function (iIndex) {
                            var oRow = aData[iIndex];

                            if (oRow.IsLocal) {
                                // Row is local, just remove from model
                                aData.splice(iIndex, 1);
                            } else {
                                // Row exists in backend, call delete service
                                var sTrdNum = oRow.TrdNum;
                                var sCstUuid = oRow.CstUuid;

                                // Example OData delete call
                                this.getOwnerComponent().getModel("s4HanaModel").remove(
                                    `/ZTA_COSTSet(TrdNum='${sTrdNum}',CstUuid='${sCstUuid}')`, 
                                    {
                                        success: function () {
                                            console.log("Deleted from backend:", sTrdNum, sCstUuid);
                                            // Remove from model after successful delete
                                            aData.splice(iIndex, 1);
                                            oModel.setProperty("/", aData);
                                        }.bind(this),
                                        error: function (err) {
                                            sap.m.MessageToast.show("Failed to delete: " + sTrdNum);
                                        }
                                    }
                                );
                            }
                        }.bind(this));

                        oModel.setProperty("/", aData);
                        // oTable.removeSelections();
                        sap.m.MessageToast.show("Selected rows deleted successfully!");
                    }
                }.bind(this)
            });
        },

        onToggleAdd: function () {
            // var oTable = this.byId("costTableId");
            var oModel = this.getView().getModel("costModel");
            if (!oModel) {
                console.error("costModel not found");
                return;
            }
            var aData = oModel.getProperty("/") || [];
            if (!Array.isArray(aData)) {
                aData = []; 
            }
            if (aData.length > 0) {
                // aData.forEach(function(oRow) {
                //     oRow.isRowEditable = false;
                // });
            }
            var appModel = this.getView().getModel("appModel"); 
            var tradeNumber = appModel.getProperty("/TradeNo");
            var oNewRow = {
                "TrdNum": tradeNumber || "",
                "CstUuid": "",
                "TrdNumP": "",
                "CstType": "",
                "CstTotval":"",
                "CstEstfn": "",
                "CstStas": "",
                "CstPrctyp": "",
                "CstExpcur": "",
                "CstStcur": "",
                "CstExrt": "",
                "CstPaydt": "",
                "CstComp": "",
                "CstPrfor": "",    
                isRowEditable: true,
                IsLocal: true 
            };

            aData.push(oNewRow);
            oModel.setProperty("/", aData);
            // oTable.clearSelection();
            this.byId("toggleSaveBtn").setEnabled(true);
        },

        onToggleSave: function () {
            this.onPostCost("", "", false, "A")
            .then(function (bSuccess) {
                if (bSuccess) {
                    // Success: do your post-save logic
                    var oCostModel = this.getView().getModel("costModel");
                    var aData = oCostModel.getProperty("/");

                    aData.forEach(function (oRow) {
                        oRow.isRowEditable = false;
                        oRow.IsEditEnabled = false;
                        oRow.IsLocal = false;
                    });
                    oCostModel.setProperty("/", aData);

                    this.byId("toggleSaveBtn").setEnabled(false);
                    sap.m.MessageToast.show("Data saved successfully!");
                }
            }.bind(this))
            .catch(function (oError) {
                sap.m.MessageBox.error("Error while saving cost data: " + oError.message);
            });

            // var oCostModel = this.getView().getModel("costModel");
            // var aData = oCostModel.getProperty("/") || [];

            // // Filter only rows that are editable
            // var aEditableData = aData.filter(function (item) {
            //     return item.isRowEditable === true;
            // });

            // // Build payload only for editable rows
            // var aPayload = aEditableData.map(function (item) {
            //     return {
            //         TrdNum: item.TrdNum || "",
            //         CstUuid: item.CstUuid || "",
            //         TrdNumP: item.TrdNumP || "",
            //         CstType: item.CstType || "",
            //         CstEstfn: item.CstEstfn || "",
            //         CstStas: item.CstStas || "",
            //         CstPrctyp: item.CstPrctyp || "",
            //         CstExpcur: item.CstExpcur || "",
            //         CstStcur: item.CstStcur || "",
            //         CstExrt: item.CstExrt || "",
            //         CstPaydt: item.CstPaydt ? new Date(item.CstPaydt).toISOString() : "",
            //         CstComp: item.CstComp || "",
            //         CstPrfor: item.CstPrfor || ""
            //     };
            // });

            // console.log("Payload to save:", aPayload);
            // var oSave = onPostCost("", "", false)
            // // Reset edit state for all rows after saving
            // aData.forEach(function (oRow) {
            //     oRow.isRowEditable = false;
            //     oRow.IsEditEnabled = false; // optional: reset edit flag too
            //     oRow.IsLocal = false;
            // });
            // oCostModel.setProperty("/", aData);

            // // Disable save button
            // this.byId("toggleSaveBtn").setEnabled(false);

            // sap.m.MessageToast.show("Data saved successfully!");

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
        },

        handleSelectionFinish: function (oEvent) {
            var aSelectedItems = oEvent.getParameter("selectedItems");
            var oAppModel = this.getView().getModel("appModel");

            // Reset all to false
            oAppModel.setProperty("/isOSPAvailable", false);
            oAppModel.setProperty("/isPremDiscAvailable", false);
            oAppModel.setProperty("/isOtherPremDiscAvailable", false);
            oAppModel.setProperty("/isAPIAvailable", false);

            // Loop through selected items and set flags accordingly
            aSelectedItems.forEach(function (oItem) {
                var sKey = oItem.getKey();
                switch (sKey) {
                    case "osp":
                        oAppModel.setProperty("/isOSPAvailable", true);
                        break;
                    case "pd":
                        oAppModel.setProperty("/isPremDiscAvailable", true);
                        break;
                    case "opd":
                        oAppModel.setProperty("/isOtherPremDiscAvailable", true);
                        break;
                    case "api":
                        oAppModel.setProperty("/isAPIAvailable", true);
                        break;
                }
            });
        },

        handlePricingRuleChange: function (oEvent) {
            var oSelectedItem = oEvent.getParameter("selectedItem");
            var oAppModel = this.getView().getModel("appModel");

            if (oSelectedItem) {
                var sText = oSelectedItem.getText();

                if (sText === "Specific Date Range") {
                    oAppModel.setProperty("/isSpecificDateRange", true);
                    oAppModel.setProperty("/isTentativeDate", false);
                    oAppModel.setProperty("/isBeforeAfterDays", false);
                } 
                else {
                    oAppModel.setProperty("/isSpecificDateRange", false);
                    oAppModel.setProperty("/isTentativeDate", true);
                    oAppModel.setProperty("/isBeforeAfterDays", true);
                }
            } 
            else {
                oAppModel.setProperty("/isSpecificDateRange", false);
                oAppModel.setProperty("/isTentativeDate", false);
                oAppModel.setProperty("/isBeforeAfterDays", false);

                oAppModel.setProperty("/TradeDetails/TrdPrcsdt", null);
                oAppModel.setProperty("/TradeDetails/TrdPrcedt", null);
                oAppModel.setProperty("/TradeDetails/TentDate", null);
                oAppModel.setProperty("/TradeDetails/NdysBefore", "0.00");
                oAppModel.setProperty("/TradeDetails/NdaysAfter", "0.00");
            }
        },

        handleCreditTermsChange: function (oEvent) {
            var oSelectedItem = oEvent.getParameter("selectedItem");
            var oAppModel = this.getView().getModel("appModel");
            oAppModel.setProperty("/isLCVisible", false);
            oAppModel.setProperty("/isOpenCreditVisible", false);
            oAppModel.setProperty("/isBGVisible", false);
            oAppModel.setProperty("/isOpenCreditFieldVisible", false);

            if (oSelectedItem) {
                var sSelectedKey = oSelectedItem.getKey();
                switch (sSelectedKey) {
                    case "1": // Open Credit
                        oAppModel.setProperty("/isOpenCreditVisible", true);
                        break;

                    case "3": // LC
                        oAppModel.setProperty("/isLCVisible", true);
                        break;

                    case "4": // BG
                        oAppModel.setProperty("/isBGVisible", true);
                        break;

                    case "5": // LC + Open Credit
                        oAppModel.setProperty("/isOpenCreditFieldVisible", true);
                        oAppModel.setProperty("/isLCVisible", true);
                        oAppModel.setProperty("/isOpenCreditVisible", true);
                        break;
                }
            } else {
                oAppModel.setProperty("/isLCVisible", false);
                oAppModel.setProperty("/isOpenCreditVisible", false);
                oAppModel.setProperty("/isBGVisible", false);
                oAppModel.setProperty("/isOpenCreditFieldVisible", false);

                // Clear Open Credit section
                oAppModel.setProperty("/TradeDetails/TrdOpcrd", "0.00");
                oAppModel.setProperty("/TradeDetails/TrdTotval", "0.00");
                oAppModel.setProperty("/TradeDetails/TrdTvlcur", "");

                // Clear LC section
                oAppModel.setProperty("/TradeDetails/TrdLc", "");
                oAppModel.setProperty("/TradeDetails/LcPaytrm", "");
                oAppModel.setProperty("/TradeDetails/TrdLcdays", "0");
                oAppModel.setProperty("/TradeDetails/TrdLcopdt", null);

                // Clear BG section
                oAppModel.setProperty("/TradeDetails/TrdBg", "");
                oAppModel.setProperty("/TradeDetails/BgPaytrm", "");
                oAppModel.setProperty("/TradeDetails/TrdBgdays", "0.00");
                oAppModel.setProperty("/TradeDetails/TrdBgopdt", null);
            }
        },

        handleFormulaChange: function(oEvent) {
            // var sSelectedKey = oEvent.getParameter("selectedItem").getKey();

            var oComboBox = oEvent.getSource();
            var oSelectedItem = oComboBox.getSelectedItem();

            if (!oSelectedItem) {
                return; 
            }

            var sSelectedKey = oSelectedItem.getKey();   // e.g., "3"
            var sSelectedText = oSelectedItem.getText(); // e.g., "Custom"

            
            // var oView = this.getView();
            this._bindFormulaComboBox();
            // if (sSelectedText !== "Custom") 
            //     return;

            // if (!oView.getModel("formulaModel")) {
            //     oView.setModel(new sap.ui.model.json.JSONModel({ items: [] }), "formulaModel");
            // }
            // if (!this._oFormulaDialog) {
            //     this._oFormulaDialog = sap.ui.xmlfragment(oView.getId(), "hmel.com.tradeuiapp.fragments.FormulaDialog", this);
            //     oView.addDependent(this._oFormulaDialog);
            // }

            // this._oFormulaDialog.open();
        },

        onCustomFormulaPress: function () {
            var oView = this.getView();
            this._bindFormulaComboBox();

            if (!oView.getModel("formulaModel")) {
                oView.setModel(new sap.ui.model.json.JSONModel({ items: [] }), "formulaModel");
            }
            if (!this._oFormulaDialog) {
                this._oFormulaDialog = sap.ui.xmlfragment(oView.getId(), "hmel.com.tradeuiapp.fragments.FormulaDialog", this);
                oView.addDependent(this._oFormulaDialog);
            }
            this._oFormulaDialog.open();
        },

        onAddFormulaRow: function () {
            var oView = this.getView();
            var oModel = oView.getModel("formulaModel");
            oView.byId("formulaNameInput").setEnabled(true);
            oView.byId("formulaDialog").getBeginButton().setEnabled(true);

            var oComboBox = oView.byId("formulaComboBox");
            if (oComboBox) {
                oComboBox.setSelectedKey("");  
                oComboBox.setValue("");        
            }

            var aItems = oModel.getProperty("/items") || [];
            aItems = aItems.filter(function(item) {
                return item.editable;
                            });
            aItems.push({
                curve: "",
                percentage: "",
                editable: true
            });

            oModel.setProperty("/items", aItems);
            oModel.refresh(true);
        },

        onDeleteFormulaRow: function() {
            var oTable = this.byId("formulaTable");
            var aSelectedIndices = oTable.getSelectedIndices();
            var oModel = this.getView().getModel("formulaModel");
            var aItems = oModel.getProperty("/items");

            for (var i = aSelectedIndices.length - 1; i >= 0; i--) {
                aItems.splice(aSelectedIndices[i], 1);
            }
            oModel.setProperty("/items", aItems);
            oTable.clearSelection();
            oModel.refresh();
        },

        onFormulaSelect: function (oEvent) {
            var oSelectedItem = oEvent.getParameter("selectedItem");
            if (!oSelectedItem) return;

            var sFormulaName = oSelectedItem.getText(); 
            var oView = this.getView();
            var oModel = oView.getModel("s4HanaModel");
            var oFormulaModel = oView.getModel("formulaModel");
            var aFilters = [
                new sap.ui.model.Filter("TrdPrcfnam", sap.ui.model.FilterOperator.EQ, sFormulaName)
            ];

            oModel.read("/ZTA_FORMULASet", {
                filters: aFilters,
                success: function (oData) {
                    if (oData.results && oData.results.length > 0) {
                        var aFilteredItems = oData.results
                            .filter(function (item) {
                                return item.TrdPrcfnam === sFormulaName;
                            })
                            .map(function (item) {
                                return {
                                    curve: item.Curve,
                                    percentage: item.Percentage,
                                    editable: false
                                };
                            });

                        oFormulaModel.setProperty("/items", aFilteredItems);

                        oView.byId("formulaNameInput").setEnabled(false);
                        oView.byId("formulaNameInput").setValue("");
                        oView.byId("formulaDialog").getBeginButton().setEnabled(false);
                        oView.byId("curveValue").setEnabled(false);
                        oView.byId("pcentValue").setEnabled(false);
                    } else {
                        oFormulaModel.setProperty("/items", []);
                        sap.m.MessageToast.show("No data found for selected formula.");
                    }
                },
                error: function () {
                    oFormulaModel.setProperty("/items", []);
                    sap.m.MessageToast.show("Failed to fetch formula details.");
                }
            });
        },

        onSubmitFormula: function() {
            var oView = this.getView();
            var oInput = oView.byId("formulaNameInput");
            var sFormulaName = oInput.getValue().trim();
            var oModel = this.getOwnerComponent().getModel("s4HanaModel");

            if (!sFormulaName) {
                oInput.setValueState(sap.ui.core.ValueState.Error);
                oInput.setValueStateText("Formula Name is required");
                return;
            } else {
                oInput.setValueState(sap.ui.core.ValueState.None);
                oInput.setValueStateText("");
            }

            var aData = oView.getModel("formulaModel").getProperty("/items") || [];
            if (aData.length === 0) {
                MessageBox.error("Please add at least one formula row.");
                return;
            }
            // var fTotalPercentage = aData.reduce(function(sum, item) {
            //     return sum + (parseFloat(item.percentage) || 0);
            // }, 0);

            // if (fTotalPercentage !== 100) {
            //     MessageBox.error(
            //         "Total percentage must be exactly 100%. Current total: " + fTotalPercentage + "%"
            //     );
            //     return;
            // }
            // aData.forEach(function(item, index) {
            //     var oPayload = {
            //         TrdFid: new Date().getTime(),
            //         TrdPrcfnam: sFormulaName,
            //         Line: index + 1,
            //         TrdPrctyp: "3",
            //         Curve: item.curve,
            //         Percentage: parseFloat(item.percentage).toFixed(3) 
            //     };

            //     oModel.create("/ZTA_FORMULASet", oPayload, {
            //         success: function() {
            //             console.log("Row saved successfully:", oPayload);
            //             MessageToast.show("Formula saved successfully");
            //         },
            //         error: function(oError) {
            //             MessageBox.error("Error while saving the formula: " + oError.message);
            //         }
            //     });
            //     // console.log("Row saved successfully:", oPayload);
            // });

            // --- Convert to array of promises ---
            var aPromises = aData.map(function(item, index) {
                return new Promise(function(resolve, reject) {
                    var oPayload = {
                        TrdFid: "",//String(new Date().getTime())
                        TrdPrcfnam: sFormulaName,
                        Line: String(index + 1),
                        TrdPrctyp: "3",
                        Curve: item.curve,
                        Percentage: parseFloat(item.percentage).toFixed(3)
                    };

                    oModel.create("/ZTA_FORMULASet", oPayload, {
                        success: function() {
                            console.log("Row saved successfully:", oPayload);
                            resolve();
                        },
                        error: function(oError) {
                            reject(oError);
                        }
                    });
                });
            });

            // --- Wait until all are done ---
            Promise.all(aPromises)
                .then(function() {
                    sap.m.MessageToast.show("All formulas saved successfully!");
                    this._bindFormulaComboBox();
                    // var aFilter = new Filter("TrdPrctyp", FilterOperator.EQ, '3')
                    // var formulaCB = this.getView().byId("formulacb");
                    // var oBinding = formulaCB.getBinding("items");
                    
                    // if (oBinding) {
                    //     oBinding.filter(aFilter);
                    //     oBinding.refresh(); // Reloads only ComboBox data
                    // }
                    //Clear the input value
                    oInput.setValue("");
                    if (this._oFormulaDialog) {
                        // this._oFormulaDialog.destroy()
                        this._oFormulaDialog.close();
                        // Reset the formula model to an empty array
                        var oFormulaModel = this.getView().getModel("formulaModel");
                        if (oFormulaModel) {
                            oFormulaModel.setData([]);  // clear all data
                            oFormulaModel.refresh(true); // optional, to force UI update
                        }
                    }
                }.bind(this))
                .catch(function(oError) {
                    sap.m.MessageBox.error("Error while saving formulas: " + oError.message);
                });

            // new sap.m.MessageToast.show("Formula saved successfully");
            // if (this._oFormulaDialog) {
            //     this._oFormulaDialog.close();
            // }
        },
        onFormulaNameLiveChange: function(oEvent) {
            var oInput = oEvent.getSource();
            var sValue = oInput.getValue().trim();

            if (sValue) {
                oInput.setValueState(sap.ui.core.ValueState.None);
                oInput.setValueStateText("");
            }
        },
        onCancelFormula: function() {
            this._oFormulaDialog.close();
            // this._oFormulaDialog.destroy()
        },

        // removeDuplicateCommodity: function (){
        //     this._uniqueTexts = new Set();
        //     var oComboBox = this.byId("productTypecb");
        //     var oBinding = oComboBox.getBinding("items");

        //     if (oBinding) {
        //         oBinding.attachEventOnce("dataReceived", this._removeEmptyItems.bind(this));
        //     } else {
        //         setTimeout(() => {
        //             var oBind = oComboBox.getBinding("items");
        //             if (oBind) {
        //                 oBind.attachEventOnce("dataReceived", this._removeEmptyItems.bind(this));
        //             }
        //         }, 200);
        //     }
        // },

        // removeDuplicateText: function (sTest) {
        //     if (!this._uniqueTexts) {
        //         this._uniqueTexts = new Set();
        //     }

        //     if (this._uniqueTexts.has(sTest)) {
        //         return ""; 
        //     } else {
        //         this._uniqueTexts.add(sTest);
        //         return sTest;
        //     }
        // },

        // _removeEmptyItems: function () {
        //     var oComboBox = this.byId("productTypecb");
        //     setTimeout(function () {
        //         var aItems = oComboBox.getItems().slice(); 

        //         aItems.forEach(function (oItem) {
        //             if (!oItem.getText() || oItem.getText().trim() === "") {
        //                 oComboBox.removeItem(oItem);
        //             }
        //         });
        //     }, 100);
        // },

       _bindFormulaComboBox: function () {
            var oView = this.getView();
            var oAppModel = this.getOwnerComponent().getModel("appModel");
            var sSelectedPriceType = oAppModel.getProperty("/TradeDetails/TrdPrctyp"); 
            var oModel = this.getOwnerComponent().getModel("s4HanaModel");

            var aFilters = [];
            if (sSelectedPriceType) {
                aFilters.push(new sap.ui.model.Filter("TrdPrctyp", sap.ui.model.FilterOperator.EQ, sSelectedPriceType));
            }

            oModel.read("/ZCDSFORMULA_CURVE", {
                filters: aFilters,
                success: function (oData) {
                    var aData = oData.results;
                    var oSeen = {};
                    var aUniqueData = aData.filter(function (item) {
                        if (!oSeen[item.TrdPrcfnam]) {
                            oSeen[item.TrdPrcfnam] = true;
                            return true;
                        }
                        return false;
                    });

                    var oUniqueModel = new sap.ui.model.json.JSONModel({ items: aUniqueData });
                    oView.setModel(oUniqueModel, "uniqueFormulaModel");
                },
                error: function (oError) {
                    console.error("Error fetching formulas", oError);
                }
            });
        },

        onCurveDataReceived: function () {
            var oComboBox = this.getView().byId("curveCb"); 
            if (!oComboBox) {
                console.error("ComboBox with id 'curveCb' not found!");
                return;
            }

            var oBinding = oComboBox.getBinding("items");
            if (!oBinding) {
                console.warn("Items binding not found for curveCb");
                return;
            }
            var aItems = oBinding.getContexts().map(function (oCtx) {
                return oCtx.getObject();
            });
            var uniqueData = [];
            var seen = new Set();

            aItems.forEach(function (item) {
                if (!seen.has(item.Curve)) {
                    seen.add(item.Curve);
                    uniqueData.push(item);
                }
            });
            var oJSONModel = new sap.ui.model.json.JSONModel({ results: uniqueData });
            oComboBox.setModel(oJSONModel);
            oComboBox.bindItems({
                path: "/results",
                template: new sap.ui.core.Item({
                    key: "{Curve}",
                    text: "{Curve}"
                })
            });
        },

       onProductTypeChange: function (oEvent) {
            var oAppModel = this.getOwnerComponent().getModel("appModel");
            
            var oComboBox = oEvent.getSource();
            var oSelectedItem = oComboBox.getSelectedItem();

            if (!oSelectedItem) {
                return; 
            }

            var sSelectedKey = oSelectedItem.getKey();
            var sSelectedText = oSelectedItem.getText();
            var oView = this.getView();

            var oCommodityCB = oView.byId("commoditycb");
            if (oCommodityCB) {
                //Celar the existing data.
                oCommodityCB.setSelectedKey();
                oCommodityCB.setValue();
                oAppModel.setProperty("/TradeDetails/TrdCmdty", "");
                // var oPimsCB = oView.byId("pimsCodecb");
                // if (oPimsCB) {
                //     //Celar the existing data.
                //     oPimsCB.setSelectedKey();
                //     oPimsCB.setValue();
                //     oAppModel.setProperty("/TradeDetails/PimsCode", "");
                // }
                //Filters..
                var aFilter = [new sap.ui.model.Filter("Mtart", sap.ui.model.FilterOperator.EQ, sSelectedKey)];
                var oBinding = oCommodityCB.getBinding("items");
                if (oBinding) {
                    oBinding.filter(aFilter);
                }
            }

            var oActPriceInput = oView.byId("actPrice");
            if (oActPriceInput) {
                oActPriceInput.setEnabled(false);
            }
        },

        onCommodityChange: function (oEvent) {
            var oAppModel = this.getOwnerComponent().getModel("appModel");
            var oComboBox = oEvent.getSource();
            var oSelectedItem = oComboBox.getSelectedItem();

            if (!oSelectedItem) {
                return; 
            }
            var oSelectedData = oSelectedItem.getBindingContext("s4HanaModel").getObject();
            var pimsCode = oSelectedData.Pimscode;
            oAppModel.setProperty("/TradeDetails/PimsCode", pimsCode);
            // var sSelectedKey = oSelectedItem.getKey();
            // var sSelectedText = oSelectedItem.getText();
            // var oView = this.getView();

            // var oPimsCB = oView.byId("pimsCodecb");
            // if (oPimsCB) {
            //     //Celar the existing data.
            //     oPimsCB.setSelectedKey();
            //     oPimsCB.setValue();
            //     oAppModel.setProperty("/TradeDetails/PimsCode", "");
            //     //Filters..
            //     var aFilter = [new sap.ui.model.Filter("Maktx", sap.ui.model.FilterOperator.EQ, sSelectedText)];
            //     var oBinding = oPimsCB.getBinding("items");
            //     if (oBinding) {
            //         oBinding.filter(aFilter);
            //     }
            // }
        },

        onCalculateMinQty: function () {
            var oView = this.getView();
            var oAppModel = oView.getModel("appModel");
            var oTradeDetails = oAppModel.getProperty("/TradeDetails") || {};

            var meanQty = parseFloat(oView.byId("meanQtyInp").getValue()) || 0;
            var belowPct = parseFloat(oView.byId("belowPctInp").getValue()) || 0;

            var oMeanInput = oView.byId("meanQtyInp");

            if (isNaN(meanQty) || meanQty === 0) {
                if (oMeanInput) {
                    oMeanInput.setValueState(sap.ui.core.ValueState.Error);
                    oMeanInput.setValueStateText("Mean Quantity is required to calculate Minimum Qty");
                }
                oAppModel.setProperty("/TradeDetails/TrdQtymin", "");
                return;
            }
            if (oMeanInput) {
                oMeanInput.setValueState(sap.ui.core.ValueState.None);
                oMeanInput.setValueStateText("");
            }
            var minQty = (meanQty * (100 - belowPct)) / 100;
            oAppModel.setProperty("/TradeDetails/TrdQtymin", minQty.toFixed(2));
        },

        onCalculateMaxQty: function () {
            var oView = this.getView();
            var oAppModel = oView.getModel("appModel");

            var meanQty = parseFloat(oView.byId("meanQtyInp").getValue()) || 0;
            var abovePct = parseFloat(oView.byId("abovePctInp").getValue()) || 0;
            var oMeanInput = oView.byId("meanQtyInp");

            if (isNaN(meanQty) || meanQty === 0) {
                if (oMeanInput) {
                    oMeanInput.setValueState(sap.ui.core.ValueState.Error);
                    oMeanInput.setValueStateText("Mean Quantity is required to calculate Maximum Qty");
                }
                oAppModel.setProperty("/TradeDetails/TrdQtymax", "");
                return;
            }
            if (oMeanInput) {
                oMeanInput.setValueState(sap.ui.core.ValueState.None);
                oMeanInput.setValueStateText("");
            }
            var maxQty = (meanQty * (100 + abovePct)) / 100;
            oAppModel.setProperty("/TradeDetails/TrdQtymax", maxQty.toFixed(2));
        },

      onMeanQtyChange: function () {
            var oView = this.getView();
            var oAppModel = oView.getModel("appModel");
            var sMeanQty = oView.byId("meanQtyInp").getValue().trim();
            var meanQty = parseFloat(sMeanQty);

            var belowPct = parseFloat(oAppModel.getProperty("/TradeDetails/TrdBlpct")) || 0;
            var abovePct = parseFloat(oAppModel.getProperty("/TradeDetails/TrdAbpct")) || 0;

            var oMeanInput = oView.byId("meanQtyInp");
            if (!oMeanInput) return;

            if (sMeanQty !== "" && (isNaN(meanQty) || meanQty <= 0)) {
                oMeanInput.setValueState(sap.ui.core.ValueState.Error);
                oMeanInput.setValueStateText("Please enter a valid Mean Quantity");
                oAppModel.setProperty("/TradeDetails/TrdQtymn", ""); // clear invalid
                return;
            }

            oMeanInput.setValueState(sap.ui.core.ValueState.None);
            oMeanInput.setValueStateText("");

            // ✅ Update model properly
            oAppModel.setProperty("/TradeDetails/TrdQtymn", sMeanQty || "0.00");

            // Trigger dependent calculations
            if (!isNaN(meanQty) && meanQty > 0) {
                if (belowPct !== 0) {
                    this.onCalculateMinQty();
                }
                if (abovePct !== 0) {
                    this.onCalculateMaxQty();
                }
            }
        },
       onMinQtyManualChange: function (oEvent) {
            var oView = this.getView();
            var oAppModel = oView.getModel("appModel");
            var sMinQty = oEvent.getParameter("value");
            var minQty = parseFloat(sMinQty);

            if (sMinQty === "" || !isNaN(minQty)) {
                oAppModel.setProperty("/TradeDetails/TrdBlpct", "");
            }
        },

        onMaxQtyManualChange: function (oEvent) {
            var oView = this.getView();
            var oAppModel = oView.getModel("appModel");
            var sMaxQty = oEvent.getParameter("value");
            var maxQty = parseFloat(sMaxQty);

            if (sMaxQty === "" || !isNaN(maxQty)) {
                oAppModel.setProperty("/TradeDetails/TrdAbpct", "");
            }
        },

        onStartDateChange: function (oEvent) {
            var oView = this.getView();
            var oAppModel = oView.getModel("appModel");
            var sStartDate = oEvent.getParameter("value");
            var oStartDateDP = oView.byId("startdatedp");
            var oEndDateDP = oView.byId("enddatedp");

            if (!sStartDate) {
                oAppModel.setProperty("/TradeDetails/TrdDlvsdt", "");
                oAppModel.setProperty("/TradeDetails/TrdPaydt", "");
                oAppModel.setProperty("/TradeDetails/TrdLcopdt", "");
                oAppModel.setProperty("/TradeDetails/TrdLcdays", "");
                oStartDateDP.setValueState(sap.ui.core.ValueState.None);
                oStartDateDP.setValueStateText("");
                this._clearError("paymentDueDP");
                return;

            }

            var oStartDate = new Date(sStartDate);
            var sEndDate = oAppModel.getProperty("/TradeDetails/TrdDlvedt");

            if (sEndDate) {
                var oEndDate = new Date(sEndDate);
                if (oStartDate >= oEndDate) {
                    oStartDateDP.setValueState(sap.ui.core.ValueState.Error);
                    oStartDateDP.setValueStateText("Start Date must be before End Date.");
                    oAppModel.setProperty("/TradeDetails/TrdDlvsdt", "");
                    oStartDateDP.setValue("");
                    return;
                }
            }
            oStartDateDP.setValueState(sap.ui.core.ValueState.None);
            oStartDateDP.setValueStateText("");
            oAppModel.setProperty("/TradeDetails/TrdDlvsdt", sStartDate);

            
            this._calculatePaymentDueDate();
        },

        onEndDateChange: function (oEvent) {
            var oView = this.getView();
            var oAppModel = oView.getModel("appModel");

            var sEndDate = oEvent.getParameter("value");
            var oEndDateDP = oView.byId("enddatedp");
            var oStartDateDP = oView.byId("startdatedp");

            if (!sEndDate) return;

            var oEndDate = new Date(sEndDate);
            var sStartDate = oAppModel.getProperty("/TradeDetails/TrdDlvsdt");
            if (sStartDate) {
                var oStartDate = new Date(sStartDate);

                if (oEndDate <= oStartDate) {
                    oEndDateDP.setValueState(sap.ui.core.ValueState.Error);
                    oEndDateDP.setValueStateText("End Date must be after Start Date.");
                    oAppModel.setProperty("/TradeDetails/TrdDlvedt", "");
                    oEndDateDP.setValue("");
                    return;
                }
            }
            oEndDateDP.setValueState(sap.ui.core.ValueState.None);
            oEndDateDP.setValueStateText("");
            oAppModel.setProperty("/TradeDetails/TrdDlvedt", sEndDate);
        },

        onPaymentDaysChange: function (oEvent) {
            var sValue = oEvent.getParameter("value");
            var oView = this.getView();
            var oAppModel = oView.getModel("appModel");
            oAppModel.setProperty("/TradeDetails/TrnPtndaysc", sValue);

            var sSelectedTerm = oAppModel.getProperty("/TradeDetails/TrdPaytrm");

            if (!sSelectedTerm) {
                this._setError("paymentTermCB", "Please select Payment Term before entering days", "Please select Payment Term before entering days.");
                return;
            } else {
                this._clearError("paymentTermCB");
            }

            this._calculatePaymentDueDate();
        },
        onPaymentDayChange: function (oEvent) {
            var sValue = oEvent.getParameter("value");
            var oView = this.getView();
            var oAppModel = oView.getModel("appModel");
            oAppModel.setProperty("/TradeDetails/TrdPtndays", sValue);

            var sSelectedTerm = oAppModel.getProperty("/TradeDetails/TrdPaytrm");

            if (!sSelectedTerm) {
                this._setError("paymentTermCB", "Please select Payment Term before entering days", "Please select Payment Term before entering days.");
                return;
            } else {
                this._clearError("paymentTermCB");
            }

            this._calculatePaymentDueDate();
        },

        onPaymentTermChange: function (oEvent) {
            var oView = this.getOwnerComponent();
            var oAppModel = oView.getModel("appModel");

            var oComboBox = oEvent.getSource();
            var sSelectedTerm = oComboBox.getSelectedItem();

            if (!sSelectedTerm) {
                this._setError("paymentTermCB", "Please select a valid Payment Term", "Please select a valid Payment Term.");
                return;
            } else {
                this._clearError("paymentTermCB");
            }

            var oTradeDetails = oAppModel.getProperty("/TradeDetails");
            var oSelectedData = sSelectedTerm.getBindingContext("s4HanaModel").getObject();
            var sReference = oSelectedData.Reference;
            oAppModel.setProperty("/TradeDetails/Reference", sReference);
            var BLdate = oTradeDetails[sReference];

            this._calculatePaymentDueDate(BLdate);
        },

        _calculatePaymentDueDate: function (BLdate) {
            var oView = this.getView();
            var oAppModel = oView.getModel("appModel");
            var oTradeDetails = oAppModel.getProperty("/TradeDetails") || {};

            // var sStartDate = oTradeDetails.TrdDlvsdt;
             // Step 1: Decide which start date to use
            var sStartDate = BLdate ? BLdate : oTradeDetails.TrdDlvsdt;
            var iFirstDays = parseInt(oTradeDetails.TrnPtndaysc, 10); 
            var iSecondDays = parseInt(oTradeDetails.TrdPtndays, 10); 
            var sPaymentTerm = oTradeDetails.TrdPaytrm;

            if (isNaN(iFirstDays)) {
                iFirstDays = 0;
            }

            if (iFirstDays < 0 || iFirstDays > 1) {
                this._setError(
                    "paymentDaysInput",
                    "Invalid Input",
                    "The first number of days must be either 0 or 1."
                );
                oAppModel.setProperty("/TradeDetails/TrdPaydt", "");
                oAppModel.setProperty("/TradeDetails/TrnPtndaysc", "");
                return;
            } else {
                this._clearError("paymentDaysInput");
            }

            if (!sStartDate && (!isNaN(iSecondDays) && sPaymentTerm)) {
                this._setError("paymentDueDP", "Cannot calculate Payment Due Date without Start Date in Delivery Schedule.", "Please select the Start Date in Delivery Schedule.");
                return;
            } else {
                this._clearError("paymentDueDP");
            }

            if (isNaN(iSecondDays)) {
                oAppModel.setProperty("/TradeDetails/TrdPaydt", "");
                return;
            }

            if (iFirstDays > iSecondDays) {
                    this._setError(
                        "paymentDays",
                        "Invalid Input",
                        "The first no. of Days cannot be greater than the second no. of Days."
                    );

                    oAppModel.setProperty("/TradeDetails/TrdPaydt", "");
                    return;
                } else {
                    this._clearError("paymentDays");
                }


            var iDays = iFirstDays + iSecondDays - 1;

            var oStartDate = new Date(sStartDate);
            oStartDate.setDate(oStartDate.getDate() + iDays);

            var sDueDate = oStartDate.toISOString().split("T")[0];
            // oAppModel.setProperty("/TradeDetails/TrdPaydt", sDueDate);

            // if (!BLdate) {
                oAppModel.setProperty("/TradeDetails/TrdPaydt", sDueDate);
                oAppModel.setProperty("/TradeDetails/TrdFinpdt", sDueDate);
                
            // }
            // else {
            //     oAppModel.setProperty("/TradeDetails/TrdFinpdt", BLdate);   
            // }
        },

        _setError: function (controlId, stateText, messageBoxText) {
            var oControl = this.getView().byId(controlId);
            if (oControl) {
                oControl.setValueState(sap.ui.core.ValueState.Error);
                oControl.setValueStateText(stateText);
            }
            this.getView().getModel("appModel").setProperty("/TradeDetails/TrdPaydt", "");
            sap.m.MessageBox.error(messageBoxText);
        },

        _clearError: function (controlId) {
            var oControl = this.getView().byId(controlId);
            if (oControl) {
                oControl.setValueState(sap.ui.core.ValueState.None);
                oControl.setValueStateText("");
            }
        },

        onStartDatesChange: function (oEvent) {
            var oView = this.getView();
            var oAppModel = oView.getModel("appModel");
            var sStartDates = oEvent.getParameter("value");
            var oStartDateDPs = oView.byId("provStartDateDP");
            var sEndDates = oAppModel.getProperty("/TradeDetails/TrdPpendt");

            if (!sStartDates) return;
            var oStartDates = new Date(sStartDates);
            if (sEndDates && oStartDates >= new Date(sEndDates)) {
                oStartDateDPs.setValueState(sap.ui.core.ValueState.Error);
                oStartDateDPs.setValueStateText("Start Date must be before End Date.");
                oStartDateDPs.setValue("");
                oAppModel.setProperty("/TradeDetails/TrdPpstdt", "");

                return;
            }
            oStartDateDPs.setValueState(sap.ui.core.ValueState.None);
            oStartDateDPs.setValueStateText("");
            oAppModel.setProperty("/TradeDetails/TrdPpstdt", sStartDates);
        },

        onEndDatesChange: function (oEvent) {
            var oView = this.getView();
            var oAppModel = oView.getModel("appModel");
            var sEndDates = oEvent.getParameter("value");
            var oEndDateDPs = oView.byId("provEndDateDP");
            var sStartDates = oAppModel.getProperty("/TradeDetails/TrdPpstdt");

            if (!sEndDates) return;

            var oEndDates = new Date(sEndDates);
            if (sStartDates && oEndDates <= new Date(sStartDates)) {
                oEndDateDPs.setValueState(sap.ui.core.ValueState.Error);
                oEndDateDPs.setValueStateText("End Date must be after Start Date.");
                oEndDateDPs.setValue("");
                oAppModel.setProperty("/TradeDetails/TrdPpendt", "");

                return;
            }
            oEndDateDPs.setValueState(sap.ui.core.ValueState.None);
            oEndDateDPs.setValueStateText("");
            oAppModel.setProperty("/TradeDetails/TrdPpendt", sEndDates);
        },

        onStartDatePrcChange: function (oEvent) {
            var oView = this.getView();
            var oAppModel = oView.getModel("appModel");
            var sStartDate = oEvent.getParameter("value");
            var oStartDateDP = oView.byId("prcStartDt");
            var sEndDate = oAppModel.getProperty("/TradeDetails/TrdPrcedt");

            if (!sStartDate) return;

            var oStartDate = new Date(sStartDate);
            if (sEndDate && oStartDate >= new Date(sEndDate)) {
                oStartDateDP.setValueState(sap.ui.core.ValueState.Error);
                oStartDateDP.setValueStateText("Start Date must be before End Date.");
                oStartDateDP.setValue("");
                oAppModel.setProperty("/TradeDetails/TrdPrcsdt", "");

                return;
            }
            oStartDateDP.setValueState(sap.ui.core.ValueState.None);
            oStartDateDP.setValueStateText("");
            oAppModel.setProperty("/TradeDetails/TrdPrcsdt", sStartDate);
        },

        onEndDatePrcChange: function (oEvent) {
            var oView = this.getView();
            var oAppModel = oView.getModel("appModel");
            var sEndDate = oEvent.getParameter("value");
            var oEndDateDP = oView.byId("prcEndDt");
            var sStartDate = oAppModel.getProperty("/TradeDetails/TrdPrcsdt");

            if (!sEndDate) return;

            var oEndDate = new Date(sEndDate);
            if (sStartDate && oEndDate <= new Date(sStartDate)) {
                oEndDateDP.setValueState(sap.ui.core.ValueState.Error);
                oEndDateDP.setValueStateText("End Date must be after Start Date.");
                oEndDateDP.setValue("");
                oAppModel.setProperty("/TradeDetails/TrdPrcedt", "");

                return;
            }
            oEndDateDP.setValueState(sap.ui.core.ValueState.None);
            oEndDateDP.setValueStateText("");
            oAppModel.setProperty("/TradeDetails/TrdPrcedt", sEndDate);
        },

        onBuySellChange: function(oEvent) {
            var oView = this.getView();
            var sSelected = oEvent.getParameter("value");

            if (sSelected === "Sell") { 
                oView.byId("sellerId").setText("Buyer");
                oView.byId("buyerId").setText("Seller");
            } else { 
                oView.byId("buyerId").setText("Buyer");
                oView.byId("sellerId").setText("Seller");
            }
        },

        onLoadPortSelectionChange: function (oEvent) {
            var oSelectedItem = oEvent.getParameter("selectedItem");
            if (!oSelectedItem) return;
            var oContext = oSelectedItem.getBindingContext("s4HanaModel");
            if (!oContext) return;

            var oLoadPortData = oContext.getObject();
            if (!oLoadPortData || !oLoadPortData.Land1) return; 
            var sCountryCode = oLoadPortData.Land1;

            var oAppModel = this.getOwnerComponent().getModel("appModel");
            oAppModel.setProperty("/TradeDetails/TrdCntry", sCountryCode);

            var oCountryCb = this.getView().byId("countryCb");
            if (!oCountryCb) return;

            var aItems = oCountryCb.getItems();
            var bMatch = aItems.find(function (oItem) {
                return oItem.getKey() === sCountryCode;
            });

            if (bMatch) {
                oCountryCb.setSelectedKey(sCountryCode);
            } else {
                oCountryCb.setSelectedKey(sCountryCode);
                oAppModel.setProperty("/TradeDetails/TrdCntry", ""); 
            }
        },

        onDaysChange: function (oEvent) {
            var oSelectedItem = oEvent.getParameter("selectedItem");
            var oAppModel = this.getView().getModel("appModel");

            if (oSelectedItem) {
                var sSelectedText = oSelectedItem.getText();

                if (sSelectedText === "Banking") {
                    oAppModel.setProperty("/ShowHolidayPayment", true);
                    // oAppModel.setProperty("/ShowHolidayPrice", false);
                } 
                else {
                    oAppModel.setProperty("/ShowHolidayPayment", false);
                    // oAppModel.setProperty("/ShowHolidayPrice", false);
                    oAppModel.setProperty("/TradeDetails/HolidayPaymnt", ""); 
                }
            } else {
                oAppModel.setProperty("/ShowHolidayPayment", false);
                // oAppModel.setProperty("/ShowHolidayPrice", false);
                oAppModel.setProperty("/TradeDetails/HolidayPaymnt", ""); 
            }
        },

        onTabSelect: function (oEvent) {
            var sSelectedKey = oEvent.getParameter("key");
            if(sSelectedKey === "tradedetailstab") {
                return;
            }
            var oAppModel = this.getView().getModel("appModel");
            var oTradeDetails = oAppModel.getProperty("/TradeDetails");
            var sTradeType = oAppModel.getProperty("/PhyTradeStatus");
            var oIconTabBar = this.byId("idIconTabBarNoIcons");

            if (sTradeType === "SPOT") { 
               if (sSelectedKey === "tradecoststab") {
                 if (!oTradeDetails.IsDraftSaved) {
                     sap.m.MessageBox.warning(
                         "Please save the Details tab as a draft before accessing the Costs tab."
                     );

                    var sPreviousKey = oAppModel.getProperty("/LastSelectedTab") || "tradedetailstab";
                    oIconTabBar.setSelectedKey("tradedetailstab");
                    return;
                 }
               }
            }
            oAppModel.setProperty("/LastSelectedTab", sSelectedKey);
            this.filterCostTable();
        },

        onPaymentAssignmentChange: function (oEvent) {
            var oSelectedItem = oEvent.getParameter("selectedItem");
            var oAppModel = this.getView().getModel("appModel");

            if (oSelectedItem) {
                var selectedText = oSelectedItem.getText();

                if (selectedText === "YES" || selectedText === "Yes") {
                    oAppModel.setProperty("/isOtherCounterPty", true);
                } else {
                    oAppModel.setProperty("/isOtherCounterPty", false);
                    oAppModel.setProperty("/TradeDetails/TrdCnpty2", "");
                }
            } else {
                oAppModel.setProperty("/isOtherCounterPty", false);
                oAppModel.setProperty("/TradeDetails/TrdCnpty2", "");
            }
        },

        onPaymentTermSelectionChange: function (oEvent) {
            var oSelectedItem = oEvent.getParameter("selectedItem");
            var sSelectedKey = oSelectedItem ? oSelectedItem.getKey() : null;
            var sSelectedText = oSelectedItem ? oSelectedItem.getText() : "";
            var oModel = this.getView().getModel("appModel");

            if (sSelectedText === "Fixed date" || sSelectedKey === "3") {
                oModel.setProperty("/TradeDetails/TrdSpwknd", "");
                oModel.setProperty("/IsSplitEnabled", false);
            } else {
                oModel.setProperty("/IsSplitEnabled", true);
            }

            // if (oSelectedItem) {
            //     // Get the binding context for the selected item
            //     var oContext = oSelectedItem.getBindingContext("s4HanaModel");
            //     if (oContext) {
            //         var oData = oContext.getObject();

            //         // Retrieve the Reference field
            //         var sReference = oData.Reference;

            //         // Set Reference into your appModel (for example)
            //         oModel.setProperty("/TradeDetails/Reference", sReference);
            //         console.log("Selected Reference:", sReference);
            //     }
            // }
        },

        onLCOpeningDateCalculate: function (oEvent) {
            var oView = this.getView();
            var oAppModel = this.getOwnerComponent().getModel("appModel");

            var sStartDate = oAppModel.getProperty("/TradeDetails/TrdDlvsdt");
            var iNoOfDays = parseInt(oEvent.getParameter("value"), 10);
            var sLCEvent = oAppModel.getProperty("/TradeDetails/LcPaytrm");

            var oStartDateDP = oView.byId("startdatedp");
            var oLCEventCB = oView.byId("lcEventComboBox");
            if (!sLCEvent) {
                MessageBox.error("Please select an LC Event before calculating LC Opening Date.");
                oLCEventCB.setValueState("Error");
                oLCEventCB.setValueStateText("LC Event is required.");
                oAppModel.setProperty("/TradeDetails/TrdLcopdt", "");
                oAppModel.setProperty("/TradeDetails/TrdLcdays", "");
                return;
            }

            if (!sStartDate) {
                sap.m.MessageBox.error("Delivery schedule start date cannot be blank.");
                oStartDateDP.setValueState("Error");
                oStartDateDP.setValueStateText("Start date is required");
                oAppModel.setProperty("/TradeDetails/TrdLcopdt", "");
                oAppModel.setProperty("/TradeDetails/TrdLcdays", "");
                oAppModel.refresh();
                return;
            } else {
                oStartDateDP.setValueState("None");
                oStartDateDP.setValueStateText("");
            }

            var oStartDate = new Date(sStartDate);
            if (isNaN(oStartDate.getTime())) {
                oAppModel.setProperty("/TradeDetails/TrdLcopdt", "");
                oAppModel.refresh();
                return;
            }
            oAppModel.setProperty("/TradeDetails/TrdLcdays", oEvent.getParameter("value"));

            var sReference = oAppModel.getProperty("/TradeDetails/CrReference");
            var oTradeDetails = oAppModel.getProperty("/TradeDetails");
            var sDate = oTradeDetails[sReference];
            this._calculateLCBGDueDate(sDate, true, false);
            oAppModel.refresh();
        },

        onLCEventChange: function (oEvent) {
            var oComboBox = oEvent.getSource();
            var sSelectedKey = oComboBox.getSelectedKey();
            var oView = this.getView();
            var oAppModel = oView.getModel("appModel");

            if (!sSelectedKey) {
                oAppModel.setProperty("/TradeDetails/TrdLcdays", "");
                oAppModel.setProperty("/TradeDetails/TrdLcopdt", "");
            } else {
                oComboBox.setValueState("None");
            }
            var oTradeDetails = oAppModel.getProperty("/TradeDetails");
            var sSelectedTerm = oComboBox.getSelectedItem();
            var oSelectedData = sSelectedTerm.getBindingContext("s4HanaModel").getObject();
            var sReference = oSelectedData.Reference;
            oAppModel.setProperty("/TradeDetails/CrReference", sReference);
            var sDate = oTradeDetails[sReference];

            this._calculateLCBGDueDate(sDate, true, false);
        },

        _calculateLCBGDueDate: function (sDate, isLC, isBG) {
            var oView = this.getOwnerComponent();
            var oAppModel = oView.getModel("appModel");
            var oTradeDetails = oAppModel.getProperty("/TradeDetails") || {};

            // var sStartDate = oTradeDetails.TrdDlvsdt;
             // Step 1: Decide which start date to use
            
            var sStartDate = sDate ? sDate : oTradeDetails.TrdDlvsdt;
            var iFirstDays, sTerm; 
            if(isLC) {
                iFirstDays = parseInt(oTradeDetails.TrdLcdays, 10); 
                sTerm = oTradeDetails.LcPaytrm;
            } else if (isBG) {
                iFirstDays = parseInt(oTradeDetails.TrdBgdays, 10); 
                sTerm = oTradeDetails.BgPaytrm;
            } 
            if (isNaN(iFirstDays)) {
                return;
            }

            if(isLC) {
                if (!sStartDate && sTerm) {
                    this._setError("lcOpeningDP", "Cannot calculate Date without Start Date in Delivery Schedule.", "Please select the Start Date in Delivery Schedule.");
                    return;
                } else {
                    this._clearError("lcOpeningDP");
                }
            } else if (isBG) {
                if (!sStartDate  && sTerm) {
                    this._setError("bgOpeningDP", "Cannot calculate Date without Start Date in Delivery Schedule.", "Please select the Start Date in Delivery Schedule.");
                    return;
                } else {
                    this._clearError("bgOpeningDP");
                }
            }


            var iDays = iFirstDays;

            var oStartDate = new Date(sStartDate);
            oStartDate.setDate(oStartDate.getDate() + iDays);

            var sDueDate = oStartDate.toISOString().split("T")[0];
            if(isLC) {
                oAppModel.setProperty("/TradeDetails/TrdLcopdt", sDueDate);
            } else if(isBG) {
                oAppModel.setProperty("/TradeDetails/TrdBgopdt", sDueDate);
            }
        },

        //For BG
        onLCEventChange: function (oEvent) {
            var oComboBox = oEvent.getSource();
            var sSelectedKey = oComboBox.getSelectedKey();
            var oView = this.getView();
            var oAppModel = oView.getModel("appModel");

            if (!sSelectedKey) {
                oAppModel.setProperty("/TradeDetails/TrdBgdays", "");
                oAppModel.setProperty("/TradeDetails/TrdLcopdt", "");
            } else {
                oComboBox.setValueState("None");
            }
            var oTradeDetails = oAppModel.getProperty("/TradeDetails");
            var sSelectedTerm = oComboBox.getSelectedItem();
            var oSelectedData = sSelectedTerm.getBindingContext("s4HanaModel").getObject();
            var sReference = oSelectedData.Reference;
            oAppModel.setProperty("/TradeDetails/CrReference", sReference);
            var sDate = oTradeDetails[sReference];

            this._calculateLCBGDueDate(sDate, true, false);
        },

        onPricingCurrencyChange: function (oEvent) {
            var sText = oEvent.getParameter("selectedItem").getText();
            this.getView().getModel("appModel").setProperty("/ValueInCurrency", sText);
        },

        onPressCal: function () {
            this.filterCostTable();
        }




    });
});