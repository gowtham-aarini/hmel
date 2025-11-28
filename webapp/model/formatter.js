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
        },

        formatNumberWithComma: function (value) {
            if (value === null || value === undefined || value === "") return "";

            value = value.toString();
            if (value === "." || value === "0." || value.endsWith(".")) {
                return value;
            }
            value = value.replace(/,/g, "");

            let [intPart, decimalPart] = value.split(".");
            if (intPart === "") intPart = "0";
            if (decimalPart && decimalPart.length > 3) {
                decimalPart = decimalPart.substring(0, 3);
            }

            let num = Number(intPart);
            if (isNaN(num)) return value;
            intPart = num.toLocaleString("en-IN");

            return decimalPart ? `${intPart}.${decimalPart}` : intPart;
        }



    };
});
