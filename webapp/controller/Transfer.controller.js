sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap/base/Log",
    "sap/m/MessageBox",
    "sap/m/MessageToast",
    "../model/formatter"
], (Controller, Log, MessageBox, MessageToast, formatter) => {
    "use strict";

    return Controller.extend("operations.controller.Transfer", {
        formatter: formatter,
        /**
         * Called when the controller is instantiated.
         * Initialize models and preload required data.
         */
        onInit: function () {
            var oAppModel = this.getOwnerComponent().getModel("appModel");
            var oS4Model = this.getOwnerComponent().getModel("s4HanaModel");

            // Initialize UI flags and structures used across the view
            oAppModel.setProperty("/IsEditMode", false);
            oAppModel.setProperty("/TradeDetails", {}); // single object for selected trade
            oAppModel.setProperty("/IsCreateEnabled", false);
            oAppModel.setProperty("/IsSaveEnabled", false);
            oAppModel.setProperty("/IsEditEnabled", true);
            oAppModel.setProperty("/IsEditable", false);
            oAppModel.setProperty("/ShowLoadPortPanel", true);
            oAppModel.setProperty("/ShowDischargePortPanel", false);


            // Button visibility controls
            oAppModel.setProperty("/IsEditBtnVisible", true);
            oAppModel.setProperty("/IsSaveBtnVisible", false);

            // Create 3 discharge port placeholders (DP1, DP2, DP3) and set ActivePortNo = 1
            this._createThreePorts();

            // Preload trade list for ComboBox (non-blocking) — keep for quick local debug
            if (oS4Model) {
                oS4Model.read("/ZTA_TRADE_ENTRYSet", {
                    success: function (oData) {
                        Log.info("ZTA_TRADE_ENTRYSet loaded, count: " + (oData && oData.results ? oData.results.length : 0));
                    },
                    error: function (err) {
                        Log.error("Failed to preload ZTA_TRADE_ENTRYSet", err);
                    }
                });
            } else {
                Log.warn("s4HanaModel not found during onInit preload");
            }

            //Set Cost Model
            var oCostModel = new sap.ui.model.json.JSONModel();
            this.getView().setModel(oCostModel, "costModel");
            //For COST table
            oAppModel.setProperty("/IsCOSTSelectionActive", false);
            oAppModel.setProperty("/IsCOSTSaveActive", false);
            oAppModel.refresh(true);
        },
//         onNumberLiveChange: function (oEvent) {
//     let input = oEvent.getSource();
//     let path = input.getBinding("value").getPath();  // model path ex: /TradeDetails/0/TrdDemday
    
//     // Remove commas
//     let raw = oEvent.getParameter("value").replace(/,/g, "");

//     // Save RAW VALUE back to MODEL (very important)
//     this.getView().getModel("appModel").setProperty(path, raw);

//     // Display formatted
//     if (!isNaN(raw)) {
//         input.setValue(Number(raw).toLocaleString("en-US"));
//     }
// },


// onCostNumberLiveChange: function (oEvent) {
//     let input = oEvent.getSource();
//     let ctx = input.getBindingContext("costModel");
//     let field = input.getBinding("value").getPath(); // e.g., CstTotval
//     let path = ctx.getPath() + "/" + field;

//     let raw = oEvent.getParameter("value").replace(/,/g, "");
//     this.getView().getModel("costModel").setProperty(path, raw);

//     if (!isNaN(raw)) {
//         input.setValue(Number(raw).toLocaleString("en-US"));
//     }
// },

        /**
         * Create discharge port definitions and store in appModel>/DischargePorts
         * By default, only 1 port is shown. Users can add more using the "Add" button.
         * Each port item contains the mapping to backend field names and also UI fields.
         */
        _createThreePorts: function () {
            var oAppModel = this.getOwnerComponent().getModel("appModel");

            // Initialize with only 1 discharge port by default
            var aPorts = [
                {
                    PortNo: 1,
                    // UI-friendly keys (we'll populate values from TradeDetails using backend names)
                    QtyBBLField: "DP1_QTYBBL",
                    QtyMTField: "DP1_QTYMT",
                    TmpField: "DP1_TMP",
                    ApiField: "DP1_API",
                    ApiUomField: "DP1_APIUOM",
                    TrnDtField: "DP1_TRNDT",
                    MiscField: "DP1_MSC",
                    MiscUomField: "DP1_MSCUOM",

                    // values displayed in UI (initially empty)
                    QuantityBBL: "",
                    QuantityMT: "",
                    Temperature: 40,
                    API: "",
                    APICurrency: "",
                    TransferDate: null,
                    MiscOther: "",
                    MiscCurrency: ""
                }
            ];

            oAppModel.setProperty("/DischargePorts", aPorts);
            // show the first port by default (UI can use this property if needed)
            oAppModel.setProperty("/ActivePortNo", 1);
            oAppModel.refresh(true);
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

                // Unbind old context to clear stale data
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
                        dataReceived: (oEvent) => {
                            this.getView().setBusy(false);

                            // Check if data was received successfully
                            const oData = oEvent.getParameter("data");
                            if (!oData) {
                                console.warn("No data received for trade:", sTradeNumber);
                                sap.m.MessageToast.show("Trade data could not be loaded");
                                return;
                            }

                            // Sanitize invalid dates in the received data
                            this._sanitizeDates(oData);

                            console.log("Trade data loaded successfully:", sTradeNumber);
                        },
                        change: (oEvent) => {
                            // Handle binding errors
                            const oBinding = oEvent.getSource();
                            if (oBinding && oBinding.getContext()) {
                                console.log("Binding changed successfully");
                            } else {
                                console.warn("Binding error - context not available");
                            }
                        }
                    }
                });

            } else {
                console.warn("No oDataTradeEntry model found, check manifest.json or Component.js");
            }
        },

        onEditPress: function () {
            const oView = this.getView();
            const oAppModel = this.getOwnerComponent().getModel("appModel");

            // Enable main trade fields
            oAppModel.setProperty("/IsEditable", true);

            // Toggle buttons visibility
            oAppModel.setProperty("/IsEditBtnVisible", false);
            oAppModel.setProperty("/IsSaveBtnVisible", true);

            sap.m.MessageToast.show("Edit mode enabled");
        },


        //  UPDATED SAVE FUNCTION (works with OData V4)
        onSavePress: async function () {
            const oView = this.getView();
            const oAppModel = this.getOwnerComponent().getModel("appModel");
            const oODataModel = this.getOwnerComponent().getModel(); // OData V4 (default as per manifest)
            const oTradeData = oAppModel.getProperty("/TradeDetails");


            if (!oTradeData || !(oTradeData.TrdNum || oTradeData.TRADE_NO || oTradeData.TRADEID)) {
                MessageBox.error("Trade number/key is missing. Cannot save.");
                return;
            }

            // Determine key property: prefer TrdNum (s4 fields), fallback to common other names
            const sKey = oTradeData.TrdNum || oTradeData.TRADE_NO || oTradeData.TRADEID;
            try {
                // Build entity path for the specific TradeEntry in your backend entity
                // You use ZTA_TRADE_ENTRYSet in view, but your V4 default model might map the entity by type used here.
                // We'll attempt to bind context to the TradeEntry using key field TrdNum.
                const sPath = `/ZTA_TRADE_ENTRYSet('${sKey}')`;

                // Bind a context for the entity
                const oContext = oODataModel.bindContext(sPath);

                // Ensure the entity is loaded
                await oContext.requestObject();

                // Set properties from the JSON model into the OData V4 context.
                // We only set properties that are defined on the JSON object.
                Object.entries(oTradeData).forEach(([key, value]) => {
                    try {
                        oContext.setProperty(key, value);
                    } catch (e) {
                        // It's okay if some properties don't exist on the entity; log debug
                        Log.debug(`Could not set property ${key}: ${e}`);
                    }
                });

                // Submit changes using a batch/group id.
                // If your manifest/model defines an updateGroupId, consider using that instead of "updateGroup"
                try {
                    await oODataModel.submitBatch("updateGroup");
                } catch (e) {
                    // fallback to submit without group if group not configured
                    Log.warn("submitBatch with 'updateGroup' failed, trying submitBatch() without group", e);
                    await oODataModel.submitBatch();
                }

                MessageToast.show("Data saved successfully!");

                // Reset UI to non-editable state
                oAppModel.setProperty("/IsEditable", false);
                var btnEdit2 = oView.byId("btnEdit") || oView.byId("editBtn");
                var btnSave2 = oView.byId("btnSave") || oView.byId("saveBtn");
                if (btnEdit2) btnEdit2.setVisible(true);
                if (btnSave2) btnSave2.setVisible(false);
            } catch (err) {
                Log.error("Save failed", err);
                MessageBox.error("Failed to save data. See console for details.");
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
        cleanNumberValue(value) {
                if (value === null || value === undefined) return "0.000";
                value = value.toString().trim();
                // Remove all commas
                value = value.replace(/,/g, "");
 
                // If empty or only dot or only "-", return empty
                if (value === "" || value === "." || value === "-") return value;
 
                // Allow only digits, one dot, and minus sign
                value = value.replace(/[^0-9.-]/g, "");
 
                // Ensure minus only at the beginning
                if (value.includes("-")) {
                    // Remove all "-" then add only at first position if originally present
                    value = "-" + value.replace(/-/g, "").trim();
                }
 
                // Split integer & decimal parts
                let parts = value.split(".");
                let intPart = parts[0] || "0";
                let decimalPart = parts[1] || "";
 
                // Limit decimals to max 3 digits
                if (decimalPart.length > 3) {
                    decimalPart = decimalPart.substring(0, 3);
                }
 
                // Rebuild final value
                return decimalPart ? `${intPart}.${decimalPart}` : intPart;
            },

        //  Updated onchangetradeno: reads selected trade from s4HanaModel and writes into appModel>/TradeDetails
        onchangetradeno: function (oEvent) {
            const oView = this.getView();
            const oAppModel = this.getOwnerComponent().getModel("appModel");
            const oS4Model = this.getOwnerComponent().getModel("s4HanaModel");

            // Get the ComboBox control
            const oComboBox = oEvent.getSource();

            // Get selected trade number from ComboBox
            const sTradeNo = oComboBox.getSelectedKey();
            const oSelectedItem = oEvent.getParameter("selectedItem");

            //  VALIDATION: Only proceed if an item was actually selected from dropdown
            // This prevents triggering when user is just typing
            if (!oSelectedItem && !sTradeNo) {
                console.log("=== TRADE SELECTION SKIPPED ===");
                console.log("Reason: No item selected from dropdown (user is typing)");
                return;
            }

            // Additional check: Ensure we have a valid trade number
            if (!sTradeNo || sTradeNo.trim() === "") {
                console.log("=== TRADE SELECTION SKIPPED ===");
                console.log("Reason: Empty or invalid trade number");
                return;
            }

            // Reset port panels and trade data before loading new trade
            oAppModel.setProperty("/ShowLoadPortPanel", false);
            oAppModel.setProperty("/ShowDischargePortPanel", false);
            oAppModel.setProperty("/TradeDetails", []);
            sap.ui.getCore().applyChanges();

            // Disable editing and reset button visibility
            oAppModel.setProperty("/IsEditable", false);
            oAppModel.setProperty("/IsEditBtnVisible", true);
            oAppModel.setProperty("/IsSaveBtnVisible", false);

            // Show busy indicator while fetching
            oView.setBusy(true);

            //  DETAILED DEBUG: Log everything about the selection
            console.log("=== TRADE NUMBER SELECTION DEBUG ===");
            console.log("ComboBox ID:", oComboBox.getId());
            console.log("Selected Key (getSelectedKey):", oComboBox.getSelectedKey());
            console.log("Selected Item (getSelectedItem):", oComboBox.getSelectedItem());
            if (oComboBox.getSelectedItem()) {
                console.log("Selected Item Key:", oComboBox.getSelectedItem().getKey());
                console.log("Selected Item Text:", oComboBox.getSelectedItem().getText());
            }
            console.log("ComboBox Value (getValue):", oComboBox.getValue());
            console.log("Event parameter 'selectedItem':", oSelectedItem);
            console.log("Extracted Trade Number:", sTradeNo);
            console.log("Current appModel>/TrdNum BEFORE setting:", oAppModel.getProperty("/TrdNum"));

            // Set the selected trade number IMMEDIATELY to prevent ComboBox from changing
            oAppModel.setProperty("/TrdNum", sTradeNo);
            console.log("Set appModel>/TrdNum to:", sTradeNo);
            console.log("Verify appModel>/TrdNum AFTER setting:", oAppModel.getProperty("/TrdNum"));

            // Build path to read specific trade entry from ZTA_TRADE_ENTRYSet using $filter
            // NOTE: The entity has a composite key (TrdNum, TrdNumP), so we need to filter by both
            const sPath = "/ZTA_TRADE_ENTRYSet";
            const aFilters = [
                new sap.ui.model.Filter("TrdNum", sap.ui.model.FilterOperator.EQ, sTradeNo),
                new sap.ui.model.Filter("TrdNumP", sap.ui.model.FilterOperator.EQ, "")  // Empty string for TrdNumP
            ];

            console.log("=== OData Request Details ===");
            console.log("Path:", sPath);
            console.log("Filter 1: TrdNum eq '" + sTradeNo + "'");
            console.log("Filter 2: TrdNumP eq ''");
            console.log("Filter value type:", typeof sTradeNo);
            console.log("Generated filter objects:", aFilters);
            console.log("Expected URL parameter: $filter=(TrdNum eq '" + sTradeNo + "' and TrdNumP eq '')");
            this.filterCostTable();
            oS4Model.read(sPath, {
                filters: aFilters,
                success: function (oData) {
                    console.log("=== OData Response Received ===");
                    console.log("Full response:", oData);
                    console.log("Results count:", oData && oData.results ? oData.results.length : 0);

                    if (oData && oData.results && oData.results.length > 0) {
                        //  CRITICAL: Check if we got multiple results
                        if (oData.results.length > 1) {
                            console.warn(" WARNING: Multiple results returned! Expected 1, got:", oData.results.length);
                            console.log("All returned trade numbers:", oData.results.map(r => r.TrdNum));
                        }

                        // store the selected trade object inside appModel
                        const oTradeData = oData.results[0];
                        const oView = this.getView();
                        const oAppModel = this.getOwnerComponent().getModel("appModel");
                        oView.setModel(oAppModel, "appModel");

                        //  VERIFY: Check if the returned data matches what was requested
                        console.log("=== DATA VERIFICATION ===");
                        console.log("REQUESTED Trade Number:", sTradeNo);
                        console.log("RECEIVED Trade Number (TrdNum):", oTradeData.TrdNum);
                        console.log("Match:", sTradeNo === oTradeData.TrdNum ? "✓ YES" : "✗ NO - DATA MISMATCH!");

                        // Log the trade data to see what properties we have
                        console.log("Trade data loaded:", oTradeData);
                        console.log("Trader value (TrdTrdr):", oTradeData.TrdTrdr);
                        console.log("Counterparty (TrdCnpty):", oTradeData.TrdCnpty);

                        // Wrap in array for table binding
                        oAppModel.setProperty("/TradeDetails", [oTradeData]);
                        oAppModel.setProperty("/SelectedTrade", oTradeData);
                        console.log("======== COMMODITY/GRADE DEBUG ========");
                        console.log("TrdCmdty (Grade Code):", oTradeData.TrdCmdty, "Type:", typeof oTradeData.TrdCmdty, "IsEmpty:", oTradeData.TrdCmdty === "" || oTradeData.TrdCmdty === null || oTradeData.TrdCmdty === undefined);
                        console.log("Mtart (Commodity Type):", oTradeData.Mtart, "Type:", typeof oTradeData.Mtart);
                        console.log("TrdPrdtyp (Product Type):", oTradeData.TrdPrdtyp, "Type:", typeof oTradeData.TrdPrdtyp);
                        console.log("TrdCmdtyDesc (Grade Desc):", oTradeData.TrdCmdtyDesc);
                        console.log("All fields containing 'cmdty' or 'Cmdty':");
                        Object.keys(oTradeData).forEach(function(key) {
                            if (key.toLowerCase().includes('cmdty') || key.toLowerCase().includes('commodity') || key.toLowerCase().includes('grade') || key.toLowerCase().includes('product')) {
                                console.log("  " + key + ":", oTradeData[key]);
                            }
                        });
                        console.log("======== TEMPERATURE DEBUG ========");
                        console.log("Raw MAT TEMP from Backend:", oTradeData.TrdMattemp);
                        console.log("Raw TEST TEMP from Backend:", oTradeData.TrdTsttemp);
                        console.log("Raw DP Ullage Temp:", oTradeData.Dp1Tmp);
                        console.log("===================================");
                        console.log("FULL TRADE DATA OBJECT:", oTradeData);
                        console.log(oTradeData);

                        oS4Model.read("/ZCDS_VEHICLE", {
    success: function (data) {
        console.log("==== VEHICLE CDS RECORD ====");
        console.log(data.results[0]);
        console.log("==== VEHICLE CDS FIELDS ====");
        console.log(Object.keys(data.results[0]));
    },
    error: function (err) {
        console.error("Vehicle CDS read failed:", err);
    }
});


                        // Debug: Load and inspect ZTA_PRODUCTSet
                        console.log("======== DEBUGGING ZTA_PRODUCTSet ========");
                        oS4Model.read("/ZTA_PRODUCTSet", {
                            success: function(oProductData) {
                                console.log("ZTA_PRODUCTSet total records:", oProductData.results.length);
                                if (oProductData.results.length > 0) {
                                    console.log("First product record:", oProductData.results[0]);
                                    console.log("Fields in ZTA_PRODUCTSet:", Object.keys(oProductData.results[0]));
                                }
                                // Find the product matching current TrdCmdty
                                var matchedProduct = oProductData.results.find(p => p.TrdCmdty === oTradeData.TrdCmdty);
                                if (matchedProduct) {
                                    console.log("Matched product for TrdCmdty '" + oTradeData.TrdCmdty + "':", matchedProduct);
                                } else {
                                    console.log("No product found for TrdCmdty:", oTradeData.TrdCmdty);
                                }
                            },
                            error: function(err) {
                                console.error("Failed to load ZTA_PRODUCTSet", err);
                            }
                        });

                        // Debug: Load and inspect ZCDS_COMMODITY
                        console.log("======== DEBUGGING ZCDS_COMMODITY ========");
                        oS4Model.read("/ZCDS_COMMODITY", {
                            success: function(oCommodityData) {
                                console.log("ZCDS_COMMODITY total records:", oCommodityData.results.length);
                                if (oCommodityData.results.length > 0) {
                                    console.log("First commodity record:", oCommodityData.results[0]);
                                    console.log("Fields in ZCDS_COMMODITY:", Object.keys(oCommodityData.results[0]));
                                }
                                // Find commodity matching current Mtart
                                var matchedCommodity = oCommodityData.results.find(c => c.Mtart === oTradeData.Mtart);
                                if (matchedCommodity) {
                                    console.log("Matched commodity for Mtart '" + oTradeData.Mtart + "':", matchedCommodity);
                                } else {
                                    console.log("No commodity found for Mtart:", oTradeData.Mtart);
                                }
                            },
                            error: function(err) {
                                console.error("Failed to load ZCDS_COMMODITY", err);
                            }
                        });



// ================= LOAD PORT LOOKUP =====================
let loadPortCode = oTradeData.TrdLdprt;

oS4Model.read("/ZCDS_LOAD_PORT", {
    success: function (oPortData) {

        let portMatch = oPortData.results.find(p => p.TrdLdprt == loadPortCode);

        let portDesc = portMatch ? portMatch.TrdLdprtD : "";

        console.log("Load Port Description:", portDesc);

        // Store description for Input binding
        oAppModel.setProperty("/TradeDetails/0/TrdLdprtD", portDesc);
        oAppModel.refresh(true);
    },
    error: function (err) {
        console.error("Load Port lookup failed:", err);
    }
});
// ================= DELIVERY TERM LOOKUP =====================
let dlvCode = oTradeData.TrdDlvtrm;

oS4Model.read("/ZTA_DLV_TRMSSet", {
    success: function (oDlvData) {

        let match = oDlvData.results.find(d => d.TrdDlvtrm == dlvCode);

        let dlvDesc = match ? match.TrdDlvtrmD : "";

        console.log("Delivery Term Description:", dlvDesc);

        oAppModel.setProperty("/TradeDetails/0/TrdDlvtrmD", dlvDesc);
        oAppModel.refresh(true);
    },
    error: function (err) {
        console.error("Delivery Term lookup failed:", err);
    }
});
// ================= VEHICLE LOOKUP =====================
let vehCode = oTradeData.TrdVeh;   // backend code like "1"

oS4Model.read("/ZCDS_VEHICLE", {
    success: function (oVehicleData) {

        // Find vehicle where TrdVeh (code) matches
        let match = oVehicleData.results.find(v => v.TrdVeh == vehCode);

        let vehDesc = match ? match.TrdVehD : "";

        console.log("Vehicle Description:", vehDesc);

        // Set description into model so Input can display it
        oAppModel.setProperty("/TradeDetails/0/TrdVehD", vehDesc);
        oAppModel.refresh(true);
    },
    error: function (err) {
        console.error("Vehicle lookup failed:", err);
    }
});

// ================= COUNTERPARTY LOOKUP =====================
let cnptyCode = oTradeData.TrdCnpty;

oS4Model.read("/ZCDS_CNTRPRTY", {
    success: function (oCnptyData) {

        // Match by counterparty code
        let match = oCnptyData.results.find(c => c.TrdCnpty == cnptyCode);

        let name = match ? match.Name1 : "";

        console.log("Counterparty Name:", name);

        // Store using the SAME property name used in UI → Name1
        oAppModel.setProperty("/TradeDetails/0/Name1", name);

        oAppModel.refresh(true);
        
    },
    error: function (err) {
        console.error("Counterparty lookup failed:", err);
    }
});




                        // Store original data for delta tracking
                        oAppModel.setProperty("/OriginalTradeDetails", JSON.parse(JSON.stringify(oTradeData)));

                        //  DO NOT set /TrdNum again here - it's already set above to prevent ComboBox from changing

                        // mirror common keys if needed
                        if (oTradeData.TrdNum) {
                            oAppModel.setProperty("/TRADE_NO", oTradeData.TrdNum);
                        }

                        // Force model refresh to update all bindings
                        oAppModel.refresh(true);
// ================= COMMODITY & GRADE LOOKUP LOGIC =====================
// ================= COMMODITY & GRADE LOOKUP + TEMP LOGIC =====================
// ================= COMMODITY & GRADE LOOKUP + TEMP LOGIC =====================
let materialCode = oTradeData.TrdCmdty;

oS4Model.read("/ZCDS_COMMODITY", {
    success: function (oCommodityData) {

        // Match commodity by material code (TrdCmdty)
        let matched = oCommodityData.results.find(item => item.TrdCmdty == materialCode);

        let mtbezDesc = matched ? (matched.Mtbez || "") : "";
        let maktxDesc = matched ? (matched.Maktx || "") : "";

        console.log("Commodity (Mtbez):", mtbezDesc);
        console.log("Grade (Maktx):", maktxDesc);

        // Update UI fields
        oAppModel.setProperty("/TradeDetails/0/Mtbez", mtbezDesc);
        oAppModel.setProperty("/TradeDetails/0/Maktx", maktxDesc);

        // ============ TEMPERATURE LOGIC (NUMERIC & SAFE) ============

        let descLower = mtbezDesc.toLowerCase().trim();

        // Convert raw backend values to numbers
        let dpTempNum   = Number(oTradeData.Dp1Tmp);
        let matTempNum  = Number(oTradeData.TrdMattemp);
        let testTempNum = Number(oTradeData.TrdTsttemp);

        console.log("TEMP LOGIC → Mtbez:", descLower);
        console.log("Raw DP Temp:", oTradeData.Dp1Tmp, "→", dpTempNum);
        console.log("Raw Mat Temp:", oTradeData.TrdMattemp, "→", matTempNum);
        console.log("Raw Test Temp:", oTradeData.TrdTsttemp, "→", testTempNum);

        // CRUDE  → default 40/40
        if (descLower.includes("crude")) {
            matTempNum  = 40;
            testTempNum = 40;
            console.log("CRUDE detected → 40 / 40");
        }

        // NAPHTHA → MatTemp from DP temp, TestTemp = 15
        else if (descLower.includes("naphtha") || descLower.includes("naptha")) {
            // only use DP temp if it's a valid number
            if (!isNaN(dpTempNum)) {
                matTempNum = dpTempNum;
            }
            // if DP temp is invalid/empty, keep existing matTempNum
            testTempNum = 15;
            console.log("NAPHTHA detected → MatTemp = DP Temp (if valid), TestTemp = 15");
        }

        // Apply final numeric temps back to the model
        oAppModel.setProperty("/TradeDetails/0/TrdMattemp",  Number(matTempNum || 0));
        oAppModel.setProperty("/TradeDetails/0/TrdTsttemp", Number(testTempNum || 0));

        oAppModel.refresh(true);
    },
    error: function (err) {
        console.error("Failed to lookup commodity and grade", err);
    }
});


// j

// let cmdtyCode = oTradeData.Mtbez;

// oS4Model.read("/ZTA_PRODUCTSet", {
//     success: function (oCommodityData) {

//         // Find matching commodity description
//         let matched = oCommodityData.results.find(item => item.Mtbez == cmdtyCode);

//         let desc = matched ? (matched.Mtbez || "") : "";
//         desc = desc.toLowerCase().trim();

//         console.log("Grade Description (from ZTA_PRODUCTSet):", desc);

//         let dpTemp = oTradeData.Dp1Tmp;
//         let matTemp = oTradeData.TrdMattemp;
//         let testTemp = oTradeData.TrdTsttemp;

//         // === CRUDE DETECTION ===
//         if (desc.includes("crude")) {
//             matTemp = 40;
//             testTemp = 40;
//         }

//         // === NAPHTHA DETECTION ===
//         else if (desc.includes("naptha") || desc.includes("naphtha")) {
//             matTemp = dpTemp || matTemp;
//             testTemp = 15;
//         }

//         // Apply final values to model
//         oAppModel.setProperty("/TradeDetails/0/TrdMattemp", matTemp);
//         oAppModel.setProperty("/TradeDetails/0/TrdTsttemp", testTemp);
//         oAppModel.refresh(true);
//     },
//     error: function(err){
//         console.log("Commodity lookup failed", err);
//     }
// }); 

                        // === Handle Incoterm-based panel visibility ===
                        let sIncoterm = "";
                        const rawIncoterm = oTradeData.TrdDlvtrm;

                        console.log("=== Checking Incoterm Field ===");
                        console.log("Raw Incoterm Value:", rawIncoterm);
                        console.log("Type of rawIncoterm:", typeof rawIncoterm);

                        //  Step 1: Normalize value (trim, remove zeros, uppercase)
                        const normalize = val => String(val || "").trim().replace(/^0+/, "").toUpperCase();
                        const code = normalize(rawIncoterm);

                        //  Step 2: Determine final Incoterm description
                        // You can map numeric codes to terms here (only if needed)
                        const codeToTermMap = {
                            "3": "DAP",
                            "00": "DAP",
                            "00": "DAP",
                            // Add others here *only if* DAP appears as numeric code.
                        };

                        // If backend gives a known code, map it — else use as-is
                        sIncoterm = codeToTermMap[code] || code;

                        console.log("Resolved Incoterm:", sIncoterm);

                        //  Step 3: Show correct panel
                        if (sIncoterm === "DAP") {
                            //  Only for DAP
                            oAppModel.setProperty("/ShowLoadPortPanel", false);
                            oAppModel.setProperty("/ShowDischargePortPanel", true);
                            MessageToast.show("Incoterm: DAP → Showing Discharge Port panel");
                        } else {
                            //  All other terms (FOB, CFR, CIF, EXW, etc.)
                            oAppModel.setProperty("/ShowLoadPortPanel", true);
                            oAppModel.setProperty("/ShowDischargePortPanel", false);
                            MessageToast.show("Incoterm: " + sIncoterm + " → Showing Load Port panel");
                        }

                        // Step 4: Apply immediately
                        sap.ui.getCore().applyChanges();


                        // Debug: Log the TradeDetails array to verify
                        console.log("TradeDetails array in appModel:", oAppModel.getProperty("/TradeDetails"));
                        console.log("=== END DEBUG ===");

                        oView.setBusy(false);
                        MessageToast.show("Trade data loaded: " + oTradeData.TrdNum);
                    } else {
                        console.warn("No results returned for trade number:", sTradeNo);
                        oView.setBusy(false);
                        MessageBox.warning("No trade found with number: " + sTradeNo);
                    }
                }.bind(this),
                error: function (err) {
                    oView.setBusy(false);
                    Log.error("Failed to fetch Trade Entry with filter TrdNum=" + sTradeNo, err);
                    MessageBox.error("Unable to load selected trade details. Check console for details.");
                }.bind(this)
            });
        },

        //Cost Section
        filterCostTable: function () {
            var oAppModel = this.getOwnerComponent().getModel("appModel");
            var tradeNo = oAppModel.getProperty("/TrdNum");
            oAppModel.setProperty("/IsCOSTSaveActive", true);
            var oBusyDialog = new sap.m.BusyDialog();
            oBusyDialog.open();

            // s4 call...
            var s4Model = this.getOwnerComponent().getModel("s4HanaModel");
            s4Model.read('/ZTA_COSTSet', {
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
                error: function (err) {
                    oBusyDialog.close();
                    console.error("Error fetching cost data: ", err);
                    // Show error message to user
                    sap.m.MessageBox.error("Error loading cost data for this trade. Some cost records may have invalid dates.");
                }.bind(this)
            });
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
                        aSelectedIndices.sort((a, b) => b - a);

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
            var tradeNumber = appModel.getProperty("/TrdNum");
            var oNewRow = {
                "TrdNum": tradeNumber || "",
                "CstUuid": "",
                "TrdNumP": "",
                "CstType": "",
                "CstEstfn": "1",
                "CstStas": "",
                "CstPrctyp": "1",
                "CstTotval": "",
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

        },

        onPostCost: function (tradeNo, trdNump, isNewReq, status) {
            var that = this;
            function convertToISO(dateStr) {
                if (!dateStr) return null;

                // Convert to string if it's a Date object or other type
                if (typeof dateStr !== 'string') {
                    if (dateStr instanceof Date) {
                        return `${dateStr.getFullYear()}-${String(dateStr.getMonth() + 1).padStart(2, "0")}-${String(dateStr.getDate()).padStart(2, "0")}T00:00:00`;
                    }
                    dateStr = String(dateStr);
                }

                // Case 1: YYYYMMDD
                if (/^\d{8}$/.test(dateStr)) {
                    if (/^0+$/.test(dateStr)) {
                        return null;
                    } else {
                        const year = dateStr.substring(0, 4);
                        const month = dateStr.substring(4, 6);
                        const day = dateStr.substring(6, 8);
                        return `${year}-${month}-${day}T00:00:00`;
                    }

                }

                // Case 2: MM/DD/YY or MM/DD/YYYY
                if (dateStr.includes("/")) {
                    const parts = dateStr.split("/");
                    let month = parts[0].padStart(2, "0");
                    let day = parts[1].padStart(2, "0");
                    let year = parts[2].length === 2 ? "20" + parts[2] : parts[2]; // handle YY → 20YY
                    return `${year}-${month}-${day}T00:00:00`;
                }

                // Case 3: yyyy-MM-dd (ISO date format from DatePicker valueFormat)
                if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
                    return `${dateStr}T00:00:00`;
                }

                // Case 4: dd-MM-yyyy (display format)
                if (/^\d{2}-\d{2}-\d{4}$/.test(dateStr)) {
                    const parts = dateStr.split("-");
                    const day = parts[0];
                    const month = parts[1];
                    const year = parts[2];
                    return `${year}-${month}-${day}T00:00:00`;
                }

                // Default: try native Date parsing
                const d = new Date(dateStr);
                if (!isNaN(d)) {
                    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}T00:00:00`;
                }

                return null; // invalid date
            }

            return new Promise(function (resolve, reject) {
                var oCostModel = this.getView().getModel("costModel");
                var aData = oCostModel.getProperty("/") || [];

                // Filter only rows that are editable
                var aEditableData = aData.filter(function (item) {
                    return item.isRowEditable === true;
                });

                // Build payload
                var aPayload = aEditableData.map(function (item) {
                    return {
                        TrdNum: isNewReq ? tradeNo : item.TrdNum || "",
                        CstUuid: item.CstUuid ? item.CstUuid : "", //String(new Date().getTime())
                        TrdNumP: isNewReq ? trdNump : item.TrdNumP || "",
                        CstType: item.CstType || "",
                        CstEstfn: item.CstEstfn || "",
                        CstStas: item.CstStas ? item.CstStas : status,
                        CstPrctyp: item.CstPrctyp || "",
                        CstTotval: that.cleanNumberValue(item.CstTotval || "0.00"),
                        CstExrt: that.cleanNumberValue(item.CstExrt),
                        CstExpcur: item.CstExpcur || "",
                        CstStcur: item.CstStcur || "",
                        CstPaydt: item.CstPaydt ? convertToISO(item.CstPaydt) : null,
                        CstComp: item.CstComp || "",
                        CstPrfor: item.CstPrfor || ""
                    };
        }.bind(this));
                var oModel = this.getOwnerComponent().getModel("s4HanaModel");

                // Use individual create calls with Promises (like Physical project)
                // The model's default useBatch:true setting will handle batching automatically
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

        //Cost End


        onAddDischargePort: function () {
            var oAppModel = this.getOwnerComponent().getModel("appModel");
            var aPorts = oAppModel.getProperty("/DischargePorts") || [];

            // Only allow up to 3 discharge ports
            if (aPorts.length >= 3) {
                sap.m.MessageBox.warning("Maximum 3 discharge ports allowed");
                return;
            }

            var nextPortNo = aPorts.length + 1;
            var sPrefix = "DP" + nextPortNo + "_";

            var oNewPort = {
                PortNo: nextPortNo,
                QtyBBLField: sPrefix + "QTYBBL",
                QtyMTField: sPrefix + "QTYMT",
                TmpField: sPrefix + "TMP",
                ApiField: sPrefix + "API",
                ApiUomField: sPrefix + "APIUOM",
                TrnDtField: sPrefix + "TRNDT",
                MiscField: sPrefix + "MSC",
                MiscUomField: sPrefix + "MSCUOM",
                QuantityBBL: "",
                QuantityMT: "",
                Temperature: 40,
                API: "",
                APICurrency: "",
                TransferDate: null,
                MiscOther: "",
                MiscCurrency: ""
            };

            aPorts.push(oNewPort);
            oAppModel.setProperty("/DischargePorts", aPorts);
            oAppModel.refresh(true);

            sap.m.MessageToast.show("Discharge Port " + nextPortNo + " added");
        },
        onExecutePOCreation: function () {
            MessageToast.show("Execute PO Creation clicked");

            var oModel = this.getView().getModel();
            if (!oModel) {
                MessageBox.error("OData model not found!");
                return;
            }

            // Example: Read PO-related data from backend
            oModel.read("/TransferFrom", {
                success: function (oData) {
                    MessageBox.success("Data fetched successfully!");
                },
                error: function (oError) {
                    MessageBox.error("Error fetching data from backend.");
                }
            });
        },

        onSubmitPOCreation: async function () {
            try {
                const oModel = this.getView().getModel();
                const oBinding = oModel.bindList("/ZTA_TRADE_ENTRYSet");
                await oBinding.create({
                    TRADE_NO: "5844",  // example
                    // ... other fields
                });
                sap.m.MessageToast.show("Trade Entry Created Successfully");
            } catch (e) {
                sap.m.MessageBox.error("Failed to create Trade Entry: " + e.message);
            }
        }
        ,
        onRemoveDischargePort: function (oEvent) {
            var oAppModel = this.getOwnerComponent().getModel("appModel");
            var aPorts = oAppModel.getProperty("/DischargePorts") || [];

            // Get binding context of the clicked remove button
            var oContext = oEvent.getSource().getBindingContext("appModel");
            if (!oContext) return;

            // Extract the array index from the binding path
            var iIndex = parseInt(oContext.getPath().split("/").pop(), 10);

            if (aPorts.length > 1) {
                // Remove the selected port
                aPorts.splice(iIndex, 1);

                // Re-index PortNo for all remaining ports
                aPorts.forEach(function (port, idx) {
                    port.PortNo = idx + 1;
                });

                // Update model
                oAppModel.setProperty("/DischargePorts", aPorts);
                oAppModel.refresh(true);

                sap.m.MessageToast.show("Discharge Port removed");
            } else {
                sap.m.MessageBox.warning("At least one discharge port must exist.");
            }
        },

        onAddDischargePortGRN: function () {
            var oAppModel = this.getOwnerComponent().getModel("appModel");
            var aPorts = oAppModel.getProperty("/DischargePorts") || [];

            // Only allow up to 3 discharge ports
            if (aPorts.length >= 3) {
                sap.m.MessageBox.warning("Maximum 3 discharge ports allowed");
                return;
            }

            var nextPortNo = aPorts.length + 1;
            var sPrefix = "DP" + nextPortNo + "_";

            var oNewPort = {
                PortNo: nextPortNo,
                QtyBBLField: sPrefix + "QTYBBL",
                QtyMTField: sPrefix + "QTYMT",
                TmpField: sPrefix + "TMP",
                ApiField: sPrefix + "API",
                ApiUomField: sPrefix + "APIUOM",
                TrnDtField: sPrefix + "TRNDT",
                MiscField: sPrefix + "MSC",
                MiscUomField: sPrefix + "MSCUOM",
                QuantityBBL: "",
                QuantityMT: "",
                Temperature: 40,
                API: "",
                APICurrency: "",
                TransferDate: null,
                MiscOther: "",
                MiscCurrency: ""
            };

            aPorts.push(oNewPort);
            oAppModel.setProperty("/DischargePorts", aPorts);
            oAppModel.refresh(true);

            sap.m.MessageToast.show("Discharge Port " + nextPortNo + " added");
        },

        onRemoveDischargePortGRN: function (oEvent) {
            var oAppModel = this.getOwnerComponent().getModel("appModel");
            var aPorts = oAppModel.getProperty("/DischargePorts") || [];

            // Get binding context of the clicked remove button
            var oContext = oEvent.getSource().getBindingContext("appModel");
            if (!oContext) return;

            // Extract the array index from the binding path
            var iIndex = parseInt(oContext.getPath().split("/").pop(), 10);

            if (aPorts.length > 1) {
                // Remove the selected port
                aPorts.splice(iIndex, 1);

                // Re-index PortNo for all remaining ports
                aPorts.forEach(function (port, idx) {
                    port.PortNo = idx + 1;
                });

                // Update model
                oAppModel.setProperty("/DischargePorts", aPorts);
                oAppModel.refresh(true);

                sap.m.MessageToast.show("Discharge Port removed");
            } else {
                sap.m.MessageBox.warning("At least one discharge port must exist.");
            }
        },

        onExecuteGRNCreation: function () {
            MessageToast.show("Execute GRN Creation clicked");

            var oModel = this.getView().getModel();
            if (!oModel) {
                MessageBox.error("OData model not found!");
                return;
            }

            // Example: Read GRN-related data from backend
            oModel.read("/TransferFrom", {
                success: function (oData) {
                    MessageBox.success("Data fetched successfully!");
                },
                error: function (oError) {
                    MessageBox.error("Error fetching data from backend.");
                }
            });
        },

        onSubmitGRNCreation: async function () {
            try {
                const oModel = this.getView().getModel();
                const oBinding = oModel.bindList("/ZTA_TRADE_ENTRYSet");
                await oBinding.create({
                    TRADE_NO: "5844",  // example
                    // ... other fields
                });
                sap.m.MessageToast.show("GRN Entry Created Successfully");
            } catch (e) {
                sap.m.MessageBox.error("Failed to create GRN Entry: " + e.message);
            }
        },
        onPressEdit: function () {
            const oView = this.getView();
            const oAppModel = this.getOwnerComponent().getModel("appModel");

            // Make inputs editable
            oAppModel.setProperty("/IsEditable", true);

            // Toggle buttons
            var btnEdit = oView.byId("editBtn");
            var btnSave = oView.byId("saveBtn");
            if (btnEdit) btnEdit.setVisible(false);
            if (btnSave) btnSave.setVisible(true);

            MessageToast.show("Edit mode enabled");
        },
        onPressSave: async function (oEvent) {
            var sAction = oEvent.getSource().data("action");
            var appModel = this.getView().getModel("appModel");
            var tradeData = appModel.getProperty("/TradeDetails");

            // TradeDetails is an array, get the first element
            if (Array.isArray(tradeData) && tradeData.length > 0) {
                tradeData = tradeData[0];
            }

            var tradeNumber = appModel.getProperty("/TrdNum");
            var tradeCreDate = appModel.getProperty("/TradeCreationDate");

            // TrdNumP is always blank for filtering
            var trdNump = "";
            var status;
            if (sAction == 'draft') {
                status = "D";
            } else if (sAction == 'save') {
                status = 'A';
            } else {
                status = "A";
            }

            // --- Updated Save Logic using costModel ---
            try {
                var oModel = this.getView().getModel("costModel");
                var oBinding = oModel.bindList("/ZTA_TRADE_ENTRYSet");

                var oPayload = {
                    TradeNo: tradeNumber,
                    Commodity: tradeData.Commodity,
                    Quantity: tradeData.Quantity,
                    GRN: tradeData.GRN,
                    CostCenter: tradeData.CostCenter || "" // cost-specific field
                    // Include any other fields from tradeData if needed
                };

                await oBinding.create(oPayload, {
                    success: function (oData) {
                        sap.m.MessageToast.show("Entry saved successfully in Cost Model!");
                        // Keep any additional success logic here
                    },
                    error: function (oError) {
                        sap.m.MessageBox.error("Error saving entry: " + oError.message);
                        // Keep any additional error handling here
                    }
                });
            } catch (err) {
                sap.m.MessageBox.error("Unexpected error: " + err.message);
            }
            // --- End of costModel Save Logic ---
        },



        onPressDraft: function (oEvent) {
            // Call the common save function with status "D" for Draft
            this._saveTradeEntry("D");
        },

        onPressSave: function (oEvent) {
            // Call the common save function with status "A" for Active/Approved
            this._saveTradeEntry("A");
        },

        _saveTradeEntry: function (status) {
            var appModel = this.getView().getModel("appModel");
            var tradeData = appModel.getProperty("/TradeDetails");

            // TradeDetails is an array, get the first element
            if (Array.isArray(tradeData) && tradeData.length > 0) {
                tradeData = tradeData[0];
            }

            var tradeNumber = appModel.getProperty("/TrdNum");
            var tradeCreDate = appModel.getProperty("/TradeCreationDate");

            // TrdNumP is always blank for filtering
            var trdNump = "";

            var oModel = this.getOwnerComponent().getModel(); // OData V2 model

            function convertToISO(dateStr) {
                if (!dateStr) return null;

                // Convert to string if it's a Date object or other type
                if (typeof dateStr !== 'string') {
                    if (dateStr instanceof Date) {
                        return `${dateStr.getFullYear()}-${String(dateStr.getMonth() + 1).padStart(2, "0")}-${String(dateStr.getDate()).padStart(2, "0")}T00:00:00`;
                    }
                    dateStr = String(dateStr);
                }

                // Case 1: YYYYMMDD
                if (/^\d{8}$/.test(dateStr)) {
                    if (/^0+$/.test(dateStr)) {
                        return null;
                    } else {
                        const year = dateStr.substring(0, 4);
                        const month = dateStr.substring(4, 6);
                        const day = dateStr.substring(6, 8);
                        return `${year}-${month}-${day}T00:00:00`;
                    }

                }

                // Case 2: MM/DD/YY or MM/DD/YYYY
                if (dateStr.includes("/")) {
                    const parts = dateStr.split("/");
                    let month = parts[0].padStart(2, "0");
                    let day = parts[1].padStart(2, "0");
                    let year = parts[2].length === 2 ? "20" + parts[2] : parts[2]; // handle YY → 20YY
                    return `${year}-${month}-${day}T00:00:00`;
                }

                // Case 3: yyyy-MM-dd (ISO date format from DatePicker valueFormat)
                if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
                    return `${dateStr}T00:00:00`;
                }

                // Case 4: dd-MM-yyyy (display format)
                if (/^\d{2}-\d{2}-\d{4}$/.test(dateStr)) {
                    const parts = dateStr.split("-");
                    const day = parts[0];
                    const month = parts[1];
                    const year = parts[2];
                    return `${year}-${month}-${day}T00:00:00`;
                }

                // Default: try native Date parsing
                const d = new Date(dateStr);
                if (!isNaN(d)) {
                    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}T00:00:00`;
                }

                return null; // invalid date
            }

            // Calculate Payment Due Date based on BL Date and payment terms
            var sDueDate = null;
            var sBlDateInput = tradeData.BlDate; // Read from model data directly

            console.log("=== CHECKING PAYMENT DUE DATE REQUIREMENTS ===");
            console.log("BlDate from model:", sBlDateInput, "Type:", typeof sBlDateInput);
            console.log("TrdPtndays:", tradeData.TrdPtndays, "Type:", typeof tradeData.TrdPtndays);
            console.log("TrnPtndaysc:", tradeData.TrnPtndaysc, "Type:", typeof tradeData.TrnPtndaysc);
            console.log("Condition met?", !!(sBlDateInput && tradeData.TrdPtndays && tradeData.TrnPtndaysc));

            if (sBlDateInput && tradeData.TrdPtndays && tradeData.TrnPtndaysc) {
                var iFirstDays = parseInt(tradeData.TrdPtndays, 10) || 0;
                var iSecondDays = parseInt(tradeData.TrnPtndaysc, 10) || 0;
                var iDays = iFirstDays + iSecondDays - 1;

                // Convert BlDate string to Date object
                var sStartDate = sBlDateInput;
                var oStartDate = new Date(sStartDate);
                console.log("Date object created:", oStartDate, "Is valid?", !isNaN(oStartDate));

                if (!isNaN(oStartDate)) {
                    oStartDate.setDate(oStartDate.getDate() + iDays);
                    sDueDate = oStartDate.toISOString().split("T")[0];

                    console.log("=== PAYMENT DUE DATE CALCULATION ===");
                    console.log("BL Date (from model data):", sStartDate);
                    console.log("TrdPtndays (iFirstDays):", iFirstDays);
                    console.log("TrnPtndaysc (iSecondDays):", iSecondDays);
                    console.log("Total Days (iFirstDays + iSecondDays - 1):", iDays);
                    console.log("Calculated Due Date (before convertToISO):", sDueDate);
                }
            } else {
                console.log("Payment due date calculation SKIPPED - missing required fields");
            }

            // Helper functions for formatting
            function formatDecimals(value) {
                // Convert empty or undefined to 0
                var num = parseFloat(value);
                if (isNaN(num)) {
                    num = 0;
                }
                // Return value
                return num.toFixed(3);
            }

            function formatToFiveDecimals(value) {
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
                if (!oCheckBox || typeof oCheckBox.getSelected !== "function") {
                    return "";
                }
                var bSelected = oCheckBox.getSelected(); // returns true if checked, false if unchecked

                // Convert to 'X' or ''
                var sValue = bSelected ? "X" : "";
                return sValue;
            }

            // tradeData.0.Dp1Qtabbl
            var oSavePayload = {
                // TradeEntry
                "TrdNum": tradeNumber || "",
                "TrdNumP": trdNump,
                "TnfrStat": status,

                "RefTrdnum": tradeData.RefTrdnum,
                "TrdStat": tradeData.TrdStat,
                "TrdMtype": tradeData.TrdMtype,
                "TrdBysl": tradeData.TrdBysl || "",
                "TrdExedt": tradeData.TrdExedt, // Read-only
                "TrdCrdt": tradeData.TrdCrdt,
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
                "TrdDlvtrm": tradeData.TrdDlvtrm || "", // Read-only
                "TrdLdprt": tradeData.TrdLdprt || "", // Read-only
                "TrdDsprt": tradeData.TrdDsprt || "", // Read-only
                "TrdCntry": tradeData.TrdCntry || "",
                "TrdDlvsdt": convertToISO(tradeData.TrdDlvsdt) || null,
                "TrdDlvedt": convertToISO(tradeData.TrdDlvedt) || null,
                "TrdPrctyp": tradeData.TrdPrctyp || "",
                "TrdForm": tradeData.TrdForm || "",
                "TrdPrcFNam": this.getView().byId("formulacb") ? this.getView().byId("formulacb").getValue() : tradeData.TrdPrcFNam || "",
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
                // "TrdValusd": tradeData.TrdValusd || "0.00",
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
                "TrdFinpdt": convertToISO(tradeData.TrdFinpdt) || null,
                "DateRound": tradeData.DateRound || "0",
                "CurveRound": tradeData.CurveRound || "0",
                "AverageRound": tradeData.AverageRound || "0",
                "TotalRound": tradeData.TotalRound || "0",
                "DateCeil": getCeilValue(tradeData.DateCeil),
                "CurveCeil": getCeilValue(tradeData.CurveCeil),
                "AverageCeil": getCeilValue(tradeData.AverageCeil),
                "TotalCeil": getCeilValue(tradeData.TotalCeil),
                "Reference": tradeData.Reference || "",
                "TrdMattemp": this.cleanNumberValue(tradeData.TrdMattemp || "0"),
                "TrdTsttemp": this.cleanNumberValue(tradeData.TrdTsttemp || "0"),
                "TrdLpdenst": this.cleanNumberValue( this.byId("loadPortDensityNaptha")? this.byId("loadPortDensityNaptha").getValue() : tradeData.TrdLpdenst || "0.00"),
                 "TrdOptdsel": tradeData.TrdOptdsel || "",
                "BtchNum": tradeData.BtchNum || "",
                "TrdDemday": tradeData.TrdDemday || "",

                //Operation Payload
                // Vehicle field
                "TrdVeh": tradeData.TrdVeh || "",
                "TrdVehimo": tradeData.TrdVehimo || "",

                // Date fields - use getValue() to get formatted string value
                "TrdWsdt": convertToISO(this.byId("windowStartDate") && this.byId("windowStartDate").getValue() ? this.byId("windowStartDate").getValue() : tradeData.TrdWsdt) || null,
                "TrdWedt": convertToISO(this.byId("windowEndDate") && this.byId("windowEndDate").getValue() ? this.byId("windowEndDate").getValue() : tradeData.TrdWedt) || null,
                "NorDate": convertToISO(this.byId("norDate") && this.byId("norDate").getValue() ? this.byId("norDate").getValue() : tradeData.NorDate) || null,
                "DschDate": convertToISO(this.byId("dschDate") && this.byId("dschDate").getValue() ? this.byId("dschDate").getValue() : tradeData.DschDate) || null,
                "BlDate": convertToISO(this.byId("blDate") && this.byId("blDate").getValue() ? this.byId("blDate").getValue() : tradeData.BlDate) || null,
                "TrdTtldat": convertToISO(this.byId("TtlDate") && this.byId("TtlDate").getValue() ? this.byId("TtlDate").getValue() : tradeData.TrdTtldat) || null,

                // Payment due dates - calculated from BL Date and payment terms
                // "TrdFinpdt": convertToISO(tradeData.TrdFinpdt) || null, //sDueDate ? convertToISO(sDueDate) : null,
                // "TrdPaydt": sDueDate ? convertToISO(sDueDate) : null,

                // "TrdDlvtrm": tradeData.TrdDlvtrm || "", // Read-only
                // "TrdQty": tradeData.TrdQty || "0.00", // Read-only
                // "TrdDsprt": tradeData.TrdDsprt || "", // Read-only

                "TnfrNum": tradeData.TnfrNum || "",
                 "TrdApp": "OPERATIONS",
                // TrdApp will be added conditionally after payload is built

                // Load Port fields - static controls
               "Lp1Qtybbl": this.cleanNumberValue(this.byId("loadPortQtyBbl") ? this.byId("loadPortQtyBbl").getValue() : tradeData.Lp1Qtybbl || "0.00"),
"Lp1Qtymt": this.cleanNumberValue(this.byId("loadPortQtyMt") ? this.byId("loadPortQtyMt").getValue() : tradeData.Lp1Qtymt || "0.00"),
"Lp1Tmp": this.cleanNumberValue(this.byId("loadPortTmp") ? this.byId("loadPortTmp").getValue() : tradeData.Lp1Tmp || "0.00"),
"Lp1Api": this.cleanNumberValue(this.byId("loadPortApi") ? this.byId("loadPortApi").getValue() : tradeData.Lp1Api || "0.00"),
"Lp1Apiuom": tradeData.Lp1Apiuom || "",
"Lp1Trndt": convertToISO(this.byId("loadPortTrndt") && this.byId("loadPortTrndt").getValue() ? this.byId("loadPortTrndt").getValue() : tradeData.Lp1Trndt) || null,
"Lp1Msc": this.cleanNumberValue(this.byId("loadPortMsc") ? this.byId("loadPortMsc").getValue() : tradeData.Lp1Msc || "0.00"),
"Lp1Mscuom": this.byId("loadPortMscuom") ? this.byId("loadPortMscuom").getSelectedKey() : tradeData.Lp1Mscuom || "",

                // Discharge Port fields - static controls
                "Dp1Qtybbl": this.cleanNumberValue(this.byId("discPortQtyBbl") ? this.byId("discPortQtyBbl").getValue() : tradeData.Dp1Qtybbl || "0.00"),
"Dp1Qtymt": this.cleanNumberValue(this.byId("discPortQtyMt") ? this.byId("discPortQtyMt").getValue() : tradeData.Dp1Qtymt || "0.00"),
"Dp1Tmp": this.cleanNumberValue(this.byId("discPortTmp") ? this.byId("discPortTmp").getValue() : tradeData.Dp1Tmp || "0.00"),
"Dp1Api": this.cleanNumberValue(this.byId("discPortApi") ? this.byId("discPortApi").getValue() : tradeData.Dp1Api || "0.00"),
"Dp1Apiuom": tradeData.Dp1Apiuom || "",
"Dp1Trndt": convertToISO(this.byId("discPortTrndt") && this.byId("discPortTrndt").getValue() ? this.byId("discPortTrndt").getValue() : tradeData.Dp1Trndt) || null,
"Dp1Msc": this.cleanNumberValue(this.byId("discPortMsc") ? this.byId("discPortMsc").getValue() : tradeData.Dp1Msc || "0.00"),
"Dp1Mscuom": this.byId("discPortMscuom") ? this.byId("discPortMscuom").getSelectedKey() : tradeData.Dp1Mscuom || "",
               
                // GRN Discharge Port fields - get from view controls or fallback to data
                "GrDp1Qtybbl": this.cleanNumberValue(this.byId("grnQtyBbl") ? this.byId("grnQtyBbl").getValue() : tradeData.GrDp1Qtybbl || "0.00"),
               "GrDp1Qtymt": this.cleanNumberValue(this.byId("grnQtyMt") ? this.byId("grnQtyMt").getValue() : tradeData.GrDp1Qtymt || "0.00"),
                "GrDp1Tmp": this.cleanNumberValue(this.byId("grnTmp") ? this.byId("grnTmp").getValue() : tradeData.GrDp1Tmp || "0.00"),
                   "GrDp1Api": this.cleanNumberValue(this.byId("grnApi") ? this.byId("grnApi").getValue() : tradeData.GrDp1Api || "0.00"),
                 "GrDp1Trndt": convertToISO(this.byId("grnTrndt") && this.byId("grnTrndt").getValue() ? this.byId("grnTrndt").getValue() : tradeData.GrDp1Trndt) || null,

                  //Chartering Entry Payload
                    // Chartering
                "TrdLoc": tradeData.TrdLoc || "",
                "TrdDemday": tradeData.TrdDemday || "",
                "TrdDemrat": tradeData.TrdDemrat || "0.00",
                "TrdDemuom": tradeData.TrdDemuom || "",
                "CstType": tradeData.CstType || "",
                "CstUom": tradeData.CstUom || "",
                "CstCur": tradeData.CstCur || "",
                "CstCurval": tradeData.CstCurval || "0.00",
                "CstEstfn": tradeData.CstEstfn || ""      
              

            }

            // // Only add TrdApp if TnfrNum is empty/0 - otherwise omit it completely
            // if (!tradeData.TnfrNum || tradeData.TnfrNum === "" || tradeData.TnfrNum === "0") {
            //     oSavePayload.TrdApp = "OPERATIONS";
            // }

            // this.postS4hana(oSavePayload);
            console.log("=== SAVE PAYLOAD ===", oSavePayload);
            console.log("=== FINAL PAYLOAD FOR PAYMENT DATES ===");
            console.log("sDueDate (raw):", sDueDate);
            console.log("TrdFinpdt (after convertToISO):", oSavePayload.TrdFinpdt);
            console.log("TrdPaydt (after convertToISO):", oSavePayload.TrdPaydt);
            var oModel = this.getOwnerComponent().getModel("s4HanaModel");

            if (!oModel) {
                sap.m.MessageBox.error("s4HanaModel not found!");
                console.error("s4HanaModel is not available");
                return;
            }

            // Operations module only updates existing trades, never creates new ones
            if (!tradeNumber) {
                sap.m.MessageBox.error("No trade number selected. Please select a trade to update.");
                return;
            }

            // Show busy indicator
            sap.ui.core.BusyIndicator.show(0);

            // Exactly like Physical - just call create() with the payload directly
            console.log("=== CALLING CREATE (LIKE PHYSICAL) ===");
            console.log("TnfrNum value:", tradeData.TnfrNum);
            console.log("TrdApp value being sent:", oSavePayload.TrdApp);
            console.log("Full payload:", oSavePayload);

            oModel.create("/ZTA_TRADE_ENTRYSet", oSavePayload, {
                success: function (oData) {
                    console.log("=== CREATE SUCCESS ===", oData);
                    sap.ui.core.BusyIndicator.hide();

                    var sMessage = status === "D"
                        ? "Trade Entry " + tradeNumber + " saved as Draft!"
                        : "Trade Entry " + tradeNumber + " successfully updated!";

                    sap.m.MessageBox.success(sMessage);

                    const oAppModel = this.getOwnerComponent().getModel("appModel");
                    oAppModel.setProperty("/IsEditable", false);
                    oAppModel.setProperty("/IsEditBtnVisible", true);
                    oAppModel.setProperty("/IsSaveBtnVisible", false);

                    // Refresh the model
                    oModel.refresh();

                }.bind(this),
                error: function (oError) {
                    console.error("=== CREATE FAILED ===", oError);
                    console.error("=== ERROR DETAILS ===", oError.responseText);
                    sap.ui.core.BusyIndicator.hide();

                    var errorMsg = "Error updating Trade Entry";
                    try {
                        var errorResponse = JSON.parse(oError.responseText);
                        console.error("=== PARSED ERROR ===", errorResponse);
                        if (errorResponse.error && errorResponse.error.message && errorResponse.error.message.value) {
                            errorMsg = errorResponse.error.message.value;
                        }
                    } catch (e) {
                        console.error("Could not parse error response", e);
                    }
                    sap.m.MessageBox.error(errorMsg);
                }.bind(this)
            });

        },

        /**
         * Sanitize invalid dates in the received data
         * Converts invalid date formats like '00.00.0000' to null
         */
        _sanitizeDates: function(oData) {
            if (!oData) return;

            // List of date fields that might have invalid values
            const aDateFields = [
                'TrdExedt', 'TrdCrdt', 'TrdDcldt', 'TrdDlvsdt', 'TrdDlvedt',
                'TrdPrcsdt', 'TrdPrcedt', 'TrdPpstdt', 'TrdPpendt', 'TrdPaydt',
                'TrdLcedt', 'TrdBgedt', 'TentDate', 'TrdFinpdt',
                'TrdWsdt', 'TrdWedt', 'NorDate', 'DschDate', 'BlDate',
                'Lp1Trndt', 'Dp1Trndt', 'GrDp1Trndt'
            ];

            aDateFields.forEach(function(sField) {
                if (oData[sField]) {
                    const sDateValue = String(oData[sField]);
                    // Check for invalid date patterns
                    if (/^0+$/.test(sDateValue) ||
                        sDateValue === '00000000' ||
                        sDateValue === '0000-00-00' ||
                        sDateValue === '00.00.0000' ||
                        sDateValue === '00/00/0000' ||
                        sDateValue.includes('0000') ||
                        sDateValue.trim() === '') {
                        oData[sField] = null;
                        console.log(`Sanitized invalid date field: ${sField} = ${sDateValue} -> null`);
                    }
                }
            });
        }

    });
});
