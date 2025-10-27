/* global QUnit */
QUnit.config.autostart = false;

sap.ui.require(["operations/test/integration/AllJourneys"
], function () {
	QUnit.start();
});
