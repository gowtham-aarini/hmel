sap.ui.define([], function () {
    "use strict";
    return {

        formatDate: function (oDateValue) {
            if (!oDateValue) return "";

            // Handle OData date format like /Date(1761091200000)/
            if (typeof oDateValue === "string" && oDateValue.indexOf("/Date") === 0) {
                oDateValue = parseInt(oDateValue.replace(/[^0-9]/g, ""), 10);
            }

            var oDate = new Date(oDateValue);
            var oOptions = { year: "numeric", month: "short", day: "2-digit" };
            return oDate.toLocaleDateString("en-US", oOptions); // Example: Oct 22, 2025
        }


    };
});
