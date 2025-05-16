sap.ui.define([
    "sap/m/List",
    "sap/m/StandardListItem"
], function(List, StandardListItem) {
    "use strict";

    return {
        entryDetails: {
            title: function(data) { 
                return `Details: ${data.Sequence || data.id}`;
            },
            content: function(data) {
                return [
                    new List({
                        items: Object.entries(data).map(function([key, value]) {
                            return new StandardListItem({
                                title: key,
                                description: String(value)
                            });
                        })
                    })
                ];
            },
            defaultButtons: [{
                text: "Close",
                type: "Default",
                handler: function() { 
                    this.getParent().close(); 
                }
            }]
        }
    };
});