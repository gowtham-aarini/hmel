sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap/base/Log",
    "sap/m/MessageBox",
    "sap/m/MessageToast"
], (Controller, Log, MessageBox, MessageToast) => {
    "use strict";

    return Controller.extend("operations.controller.Transfer", {
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
                        dataReceived: () => this.getView().setBusy(false)
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
    var btnEdit = oView.byId("editBtn");
    var btnSave = oView.byId("saveBtn");
    if (btnEdit) btnEdit.setVisible(false);
    if (btnSave) btnSave.setVisible(true);

    sap.m.MessageToast.show("Edit mode enabled ");
},


        // ✅ UPDATED SAVE FUNCTION (works with OData V4)
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

        // ✅ Updated onchangetradeno: reads selected trade from s4HanaModel and writes into appModel>/TradeDetails
        onchangetradeno: function (oEvent) {
            const oView = this.getView();
            const oAppModel = this.getOwnerComponent().getModel("appModel");
            const oS4Model = this.getOwnerComponent().getModel("s4HanaModel");
    oAppModel.setProperty("/IsEditable", false);
var btnEdit = oView.byId("editBtn") || oView.byId("btnEdit");
var btnSave = oView.byId("saveBtn") || oView.byId("btnSave");

if (btnEdit) btnEdit.setVisible(true);
if (btnSave) btnSave.setVisible(false);
            // Show busy indicator while fetching
            oView.setBusy(true);

            // Get the ComboBox control
            const oComboBox = oEvent.getSource();

            // 🔍 DETAILED DEBUG: Log everything about the selection
            console.log("=== TRADE NUMBER SELECTION DEBUG ===");
            console.log("ComboBox ID:", oComboBox.getId());
            console.log("Selected Key (getSelectedKey):", oComboBox.getSelectedKey());
            console.log("Selected Item (getSelectedItem):", oComboBox.getSelectedItem());
            if (oComboBox.getSelectedItem()) {
                console.log("Selected Item Key:", oComboBox.getSelectedItem().getKey());
                console.log("Selected Item Text:", oComboBox.getSelectedItem().getText());
            }
            console.log("ComboBox Value (getValue):", oComboBox.getValue());
            console.log("Event parameter 'selectedItem':", oEvent.getParameter("selectedItem"));

            // Get selected trade number from ComboBox
            const sTradeNo = oComboBox.getSelectedKey();

            console.log("Extracted Trade Number:", sTradeNo);
            console.log("Current appModel>/TrdNum BEFORE setting:", oAppModel.getProperty("/TrdNum"));

            if (!sTradeNo) {
                oView.setBusy(false);
                MessageToast.show("Please select a trade number.");
                return;
            }

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
                        // 🔍 CRITICAL: Check if we got multiple results
                        if (oData.results.length > 1) {
                            console.warn("⚠️ WARNING: Multiple results returned! Expected 1, got:", oData.results.length);
                            console.log("All returned trade numbers:", oData.results.map(r => r.TrdNum));
                        }

                        // store the selected trade object inside appModel
                        const oTradeData = oData.results[0];

                        // 🔍 VERIFY: Check if the returned data matches what was requested
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

                        // Store original data for delta tracking
                        oAppModel.setProperty("/OriginalTradeDetails", JSON.parse(JSON.stringify(oTradeData)));

                        // ⚠️ DO NOT set /TrdNum again here - it's already set above to prevent ComboBox from changing

                        // mirror common keys if needed
                        if (oTradeData.TrdNum) {
                            oAppModel.setProperty("/TRADE_NO", oTradeData.TrdNum);
                        }

                        // Force model refresh to update all bindings
                        oAppModel.refresh(true);

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
            var tradeNumber = appModel.getProperty("/TrdNum");
            var oNewRow = {
                "TrdNum": tradeNumber || "",
                "CstUuid": "",
                "TrdNumP": "",
                "CstType": "",
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

        },

        onPostCost: function (tradeNo, trdNump, isNewReq, status) {
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
                        CstUuid: item.CstUuid? item.CstUuid: "", //String(new Date().getTime())
                        TrdNumP: isNewReq ? trdNump : item.TrdNumP || "",
                        CstType: item.CstType || "",
                        CstEstfn: item.CstEstfn || "",
                        CstStas: item.CstStas ? item.CstStas : status,
                        CstPrctyp: item.CstPrctyp || "",
                        CstExpcur: item.CstExpcur || "",
                        CstStcur: item.CstStcur || "",
                        CstExrt: item.CstExrt || "",
                        CstPaydt: item.CstPaydt ? convertToISO(item.CstPaydt) : null,
                        CstComp: item.CstComp || "",
                        CstPrfor: item.CstPrfor || ""
                    };
                });

                var oModel = this.getOwnerComponent().getModel("s4HanaModel");

                // Use batch mode to send all cost items together so ABAP can generate UUIDs properly
                oModel.setUseBatch(true);
                oModel.setDeferredGroups(["costBatch"]);

                // Add all creates to the batch
                aPayload.forEach(function (oItem) {
                    oModel.create("/ZTA_COSTSet", oItem, {
                        groupId: "costBatch"
                    });
                });

                // Submit the batch
                oModel.submitChanges({
                    groupId: "costBatch",
                    success: function (oData) {
                        oModel.setUseBatch(false); // Reset batch mode
                        resolve(true); // ✅ All cost items saved successfully
                    }.bind(this),
                    error: function (oError) {
                        oModel.setUseBatch(false); // Reset batch mode
                        reject(oError);
                    }.bind(this)
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
 
        onSubmitPOCreation: async function() {
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

        onSubmitGRNCreation: async function() {
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

    // Helper function for safe control value retrieval from dynamic discharge ports
    var getControlValue = function(controlId, parentId, index) {
        try {
            var oParent = this.getView().byId(parentId);
            if (!oParent) {
                console.warn("Parent container not found:", parentId);
                return "0.00";
            }

            var aItems = oParent.getItems();
            if (!aItems || !aItems[index]) {
                console.warn("Item at index", index, "not found in", parentId);
                return "0.00";
            }

            var findControl = function(oContainer, sId) {
                if (oContainer.getId && oContainer.getId().indexOf(sId) > -1) {
                    return oContainer;
                }
                if (oContainer.getItems) {
                    var aChildItems = oContainer.getItems();
                    for (var i = 0; i < aChildItems.length; i++) {
                        var result = findControl(aChildItems[i], sId);
                        if (result) return result;
                    }
                }
                if (oContainer.getContent) {
                    var aContent = oContainer.getContent();
                    for (var j = 0; j < aContent.length; j++) {
                        var result = findControl(aContent[j], sId);
                        if (result) return result;
                    }
                }
                return null;
            };

            var oControl = findControl(aItems[index], controlId);

            if (oControl) {
                if (oControl.getValue) {
                    return oControl.getValue() || "0.00";
                }
                if (oControl.getSelectedKey) {
                    return oControl.getSelectedKey() || "";
                }
                if (oControl.getDateValue) {
                    return oControl.getDateValue() || null;
                }
            } else {
                console.warn("Control not found:", controlId, "in parent:", parentId, "at index:", index);
            }
            return "0.00";
        } catch (e) {
            console.error("Error getting control value for", controlId, e);
            return "0.00";
        }
    }.bind(this);

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

       

        onPressSave: function (oEvent) {
            var sAction = oEvent.getSource().data("action")
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
                status = "A"
            }
          
            // Helper function for safe control value retrieval from dynamic discharge ports
            var getControlValue = function(controlId, parentId, index) {
                try {
                    // Build the full control ID dynamically
                    var oParent = this.getView().byId(parentId);
                    if (!oParent) {
                        console.warn("Parent container not found:", parentId);
                        return "0.00";
                    }

                    // Get the items in the parent container
                    var aItems = oParent.getItems();
                    if (!aItems || !aItems[index]) {
                        console.warn("Item at index", index, "not found in", parentId);
                        return "0.00";
                    }

                    // Find the control within the item by searching recursively
                    var findControl = function(oContainer, sId) {
                        if (oContainer.getId && oContainer.getId().indexOf(sId) > -1) {
                            return oContainer;
                        }
                        if (oContainer.getItems) {
                            var aChildItems = oContainer.getItems();
                            for (var i = 0; i < aChildItems.length; i++) {
                                var result = findControl(aChildItems[i], sId);
                                if (result) return result;
                            }
                        }
                        if (oContainer.getContent) {
                            var aContent = oContainer.getContent();
                            for (var j = 0; j < aContent.length; j++) {
                                var result = findControl(aContent[j], sId);
                                if (result) return result;
                            }
                        }
                        return null;
                    };

                    var oControl = findControl(aItems[index], controlId);

                    if (oControl) {
                        // Handle Input controls
                        if (oControl.getValue) {
                            return oControl.getValue() || "0.00";
                        }
                        // Handle ComboBox/Select controls
                        if (oControl.getSelectedKey) {
                            return oControl.getSelectedKey() || "";
                        }
                        // Handle DatePicker controls
                        if (oControl.getDateValue) {
                            return oControl.getDateValue() || null;
                        }
                    } else {
                        console.warn("Control not found:", controlId, "in parent:", parentId, "at index:", index);
                    }
                    return "0.00";
                } catch (e) {
                    console.error("Error getting control value for", controlId, e);
                    return "0.00";
                }
            }.bind(this);

           
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

                // Default: try native Date parsing
                const d = new Date(dateStr);
                if (!isNaN(d)) {
                    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}T00:00:00`;
                }

                return null; // invalid date
            }
            // tradeData.0.Dp1Qtybbl
            var oSavePayload = {
                "TrdNum": tradeNumber || "",
                "TrdNumP": trdNump,
                "TrdStat": status,
                // Fields visible in Transfer view - editable only
                // "TrdExedt": convertToISO(tradeData.TrdExedt) || null, // Read-only
                // "TrdTrdr": tradeData.TrdTrdr || "", // Read-only
                // "TrdCmdty": tradeData.TrdCmdty || "", // Read-only
                // "TrdCnpty": tradeData.TrdCnpty || "", // Read-only
                // "TrdLdprt": tradeData.TrdLdprt || "", // Read-only
                "TrdWsdt": convertToISO(tradeData.TrdWsdt) || null,
                "TrdWedt": convertToISO(tradeData.TrdWedt) || null,
                // "TrdDlvtrm": tradeData.TrdDlvtrm || "", // Read-only
                // "TrdQty": tradeData.TrdQty || "0.00", // Read-only
                // "TrdDsprt": tradeData.TrdDsprt || "", // Read-only
                // Discharge Port 1 fields - dynamically generated controls
                "Dp1Qtybbl": getControlValue("discPortDp1", "dischargePortsVBox", 0),
                "Dp1Qtymt": getControlValue("discPortQtMt2", "dischargePortsVBox", 0),
                "Dp1Tmp": getControlValue("discPortTmp", "dischargePortsVBox", 0),
                "Dp1Api": getControlValue("discPortApi", "dischargePortsVBox", 0),
                "Dp1Apiuom": tradeData.Dp1Apiuom || "",
                "Dp1Trndt": convertToISO(getControlValue("discPortTrndt", "dischargePortsVBox", 0)) || null,
                "Dp1Msc": getControlValue("discPortMsc", "dischargePortsVBox", 0),
                "Dp1Mscuom": getControlValue("discPortMscuom", "dischargePortsVBox", 0),
                // Discharge Port 2 fields - dynamically generated controls
                "Dp2Qtybbl": getControlValue("discPortDp1", "dischargePortsVBox", 1),
                "Dp2Qtymt": getControlValue("discPortQtMt2", "dischargePortsVBox", 1),
                "Dp2Tmp": getControlValue("discPortTmp", "dischargePortsVBox", 1),
                "Dp2Api": getControlValue("discPortApi", "dischargePortsVBox", 1),
                "Dp2Apiuom": tradeData.Dp2Apiuom || "",
                "Dp2Trndt": convertToISO(getControlValue("discPortTrndt", "dischargePortsVBox", 1)) || null,
                "Dp2Msc": getControlValue("discPortMsc", "dischargePortsVBox", 1),
                "Dp2Mscuom": getControlValue("discPortMscuom", "dischargePortsVBox", 1),
                // Discharge Port 3 fields - dynamically generated controls
                "Dp3Qtybbl": getControlValue("discPortDp1", "dischargePortsVBox", 2),
                "Dp3Qtymt": getControlValue("discPortQtMt2", "dischargePortsVBox", 2),
                "Dp3Tmp": getControlValue("discPortTmp", "dischargePortsVBox", 2),
                "Dp3Api": getControlValue("discPortApi", "dischargePortsVBox", 2),
                "Dp3Apiuom": tradeData.Dp3Apiuom || "",
                "Dp3Trndt": convertToISO(getControlValue("discPortTrndt", "dischargePortsVBox", 2)) || null,
                "Dp3Msc": getControlValue("discPortMsc", "dischargePortsVBox", 2),
                "Dp3Mscuom": getControlValue("discPortMscuom", "dischargePortsVBox", 2),
                // GRN Discharge Port 1 fields - dynamically generated controls
                "GrDp1Qtybbl": getControlValue("discPortDp1GRN", "dischargePortsVBoxGRN", 0),
                "GrDp1Qtymt": getControlValue("discPortQtMt2GRN", "dischargePortsVBoxGRN", 0),
                "GrDp1Tmp": getControlValue("discPortTmpGRN", "dischargePortsVBoxGRN", 0),
                "GrDp1Api": getControlValue("discPortApiGRN", "dischargePortsVBoxGRN", 0),
                "GrDp1Apiuom": tradeData.GrDp1Apiuom || "",
                "GrDp1Trndt": convertToISO(getControlValue("discPortTrndtGRN", "dischargePortsVBoxGRN", 0)) || null,
                "GrDp1Msc": getControlValue("discPortMscGRN", "dischargePortsVBoxGRN", 0),
                "GrDp1Mscuom": getControlValue("discPortMscuomGRN", "dischargePortsVBoxGRN", 0),
                // GRN Discharge Port 2 fields - dynamically generated controls
                "GrDp2Qtybbl": getControlValue("discPortDp1GRN", "dischargePortsVBoxGRN", 1),
                "GrDp2Qtymt": getControlValue("discPortQtMt2GRN", "dischargePortsVBoxGRN", 1),
                "GrDp2Tmp": getControlValue("discPortTmpGRN", "dischargePortsVBoxGRN", 1),
                "GrDp2Api": getControlValue("discPortApiGRN", "dischargePortsVBoxGRN", 1),
                "GrDp2Apiuom": tradeData.GrDp2Apiuom || "",
                "GrDp2Trndt": convertToISO(getControlValue("discPortTrndtGRN", "dischargePortsVBoxGRN", 1)) || null,
                "GrDp2Msc": getControlValue("discPortMscGRN", "dischargePortsVBoxGRN", 1),
                "GrDp2Mscuom": getControlValue("discPortMscuomGRN", "dischargePortsVBoxGRN", 1),
                // GRN Discharge Port 3 fields - dynamically generated controls
                "GrDp3Qtybbl": getControlValue("discPortDp1GRN", "dischargePortsVBoxGRN", 2),
                "GrDp3Qtymt": getControlValue("discPortQtMt2GRN", "dischargePortsVBoxGRN", 2),
                "GrDp3Tmp": getControlValue("discPortTmpGRN", "dischargePortsVBoxGRN", 2),
                "GrDp3Api": getControlValue("discPortApiGRN", "dischargePortsVBoxGRN", 2),
                "GrDp3Apiuom": tradeData.GrDp3Apiuom || "",
                "GrDp3Trndt": convertToISO(getControlValue("discPortTrndtGRN", "dischargePortsVBoxGRN", 2)) || null,
                "GrDp3Msc": getControlValue("discPortMscGRN", "dischargePortsVBoxGRN", 2),
                "GrDp3Mscuom": getControlValue("discPortMscuomGRN", "dischargePortsVBoxGRN", 2)
               
            }
            // this.postS4hana(oSavePayload);
            console.log("=== SAVE PAYLOAD ===", oSavePayload);
            var oModel = this.getOwnerComponent().getModel("s4HanaModel");

            if (!oModel) {
                sap.m.MessageBox.error("s4HanaModel not found!");
                console.error("s4HanaModel is not available");
                return;
            }

            // Show busy indicator
            sap.ui.core.BusyIndicator.show(0);

            if (tradeNumber) {
                // UPDATE existing trade entry - Read-Modify-Write pattern
                var sPath = "/ZTA_TRADE_ENTRYSet(TrdNum='" + tradeNumber + "',TrdNumP='')";
                console.log("=== UPDATE PATH ===", sPath);

                // Step 1: Read the current entity using GET_ENTITYSET with filters
                var aFilters = [
                    new sap.ui.model.Filter("TrdNum", sap.ui.model.FilterOperator.EQ, tradeNumber),
                    new sap.ui.model.Filter("TrdNumP", sap.ui.model.FilterOperator.EQ, "")
                ];

                console.log("=== READING ENTITY ===");
                oModel.read("/ZTA_TRADE_ENTRYSet", {
                    filters: aFilters,
                    success: function (oData) {
                        console.log("=== READ SUCCESS ===", oData);
                        if (oData.results && oData.results.length > 0) {
                            var oCurrentData = oData.results[0];
                            console.log("=== CURRENT DATA ===", oCurrentData);

                            // Step 2: Modify only the editable fields
                            var oUpdatePayload = Object.assign({}, oCurrentData, oSavePayload);
                            console.log("=== FINAL UPDATE PAYLOAD ===", oUpdatePayload);

                            // Step 3: Update with complete payload
                            console.log("=== SENDING UPDATE ===");
                            oModel.update(sPath, oUpdatePayload, {
                                merge: false,
                                success: function (oData) {
                                    console.log("=== UPDATE SUCCESS ===", oData);
                                    sap.ui.core.BusyIndicator.hide();
                                    sap.m.MessageBox.success("Trade Entry " + tradeNumber + " successfully updated!");
                                    const oAppModel = this.getOwnerComponent().getModel("appModel");
    oAppModel.setProperty("/IsEditable", false);

var btnEdit = this.getView().byId("editBtn") || this.getView().byId("btnEdit");
var btnSave = this.getView().byId("saveBtn") || this.getView().byId("btnSave");

if (btnEdit) btnEdit.setVisible(true);
if (btnSave) btnSave.setVisible(false);

                                }.bind(this),
                                error: function (oError) {
                                    console.error("=== UPDATE FAILED ===", oError);
                                    sap.ui.core.BusyIndicator.hide();
                                    var errorMsg = "Error updating Trade Entry";
                                    try {
                                        var errorResponse = JSON.parse(oError.responseText);
                                        console.error("=== ERROR RESPONSE ===", errorResponse);
                                        if (errorResponse.error && errorResponse.error.message && errorResponse.error.message.value) {
                                            errorMsg = errorResponse.error.message.value;
                                        }
                                    } catch (e) {
                                        console.error("Could not parse error response", e);
                                    }
                                    sap.m.MessageBox.error(errorMsg);
                                }.bind(this)
                            });
                        } else {
                            console.error("=== NO RESULTS FROM READ ===");
                            sap.ui.core.BusyIndicator.hide();
                            sap.m.MessageBox.error("Trade Entry not found");
                        }
                    }.bind(this),
                    error: function (oError) {
                        console.error("=== READ FAILED ===", oError);
                        sap.ui.core.BusyIndicator.hide();
                        var errorMsg = "Error reading current Trade Entry";
                        try {
                            var errorResponse = JSON.parse(oError.responseText);
                            if (errorResponse.error && errorResponse.error.message && errorResponse.error.message.value) {
                                errorMsg = errorResponse.error.message.value;
                            }
                        } catch (e) {
                            console.error("Could not parse error response", e);
                        }
                        sap.m.MessageBox.error(errorMsg);
                        console.error("Read failed:", oError);
                    }.bind(this)
                });
            } else {
                // CREATE new trade entry
                oModel.create("/ZTA_TRADE_ENTRYSet", oSavePayload, {
                    success: function (oData) {
                        sap.ui.core.BusyIndicator.hide();
                        var newTradeNumber = oData.TrdNum;
                        sap.m.MessageBox.success("Trade Entry " + newTradeNumber + " successfully created!");
                        this.onPostCost(newTradeNumber, trdNump, true);
                        console.log("Created:", oData);
                    }.bind(this),
                    error: function (oError) {
                        sap.ui.core.BusyIndicator.hide();
                        var errorMsg = "Error creating Trade Entry";
                        try {
                            var errorResponse = JSON.parse(oError.responseText);
                            if (errorResponse.error && errorResponse.error.message && errorResponse.error.message.value) {
                                errorMsg = errorResponse.error.message.value;
                            }
                        } catch (e) {
                            console.error("Could not parse error response", e);
                        }
                        sap.m.MessageBox.error(errorMsg);
                        console.error("Create failed:", oError);
                    }.bind(this)
                });
            }

        },

    });
});
