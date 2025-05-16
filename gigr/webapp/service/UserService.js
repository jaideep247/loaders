sap.ui.define([
    "sap/ui/model/json/JSONModel"
  ], function (JSONModel) {
    "use strict";
  
    /**
     * UserService
     * Responsible for user authentication and profile data
     */
    return function (oController) {
      this.oController = oController;
  
      /**
       * Get current user information
       * Loads user data from server or uses mock data
       */
      this.getUserInfo = function () {
        const url = this.oController.getBaseURL() + "/user-api/currentUser";
        var oModel = new JSONModel();
        var mock = {
          firstname: "Dummy",
          lastname: "User",
          email: "dummy.user@com",
          name: "dummy.user@com",
          displayName: "Dummy User (dummy.user@com)"
        };
        console.log("Using fallback user data due to API unavailability");
        oModel.loadData(url);
        oModel.dataLoaded()
          .then(() => {
            //check if data has been loaded
            //for local testing, set mock data
            if (!oModel.getData().email) {
              oModel.setData(mock);
            }
            this.oController.getView().setModel(oModel, "userInfo");
            console.log(oModel.getData());
          })
          .catch(() => {
            oModel.setData(mock);
            this.oController.getView().setModel(oModel, "userInfo");
          });
      };
  
      /**
       * Get user display name
       * @returns {string} User's formatted name for display
       */
      this.getUserDisplayName = function () {
        const userModel = this.oController.getView().getModel("userInfo");
        if (!userModel) return "Unknown User";
  
        const userData = userModel.getData();
        return userData.displayName ||
          (userData.firstname + " " + userData.lastname) ||
          userData.email ||
          "Unknown User";
      };
  
      /**
       * Get username in compact format
       * @returns {string} Username for document creation
       */
      this.getCompactUsername = function () {
        const userModel = this.oController.getView().getModel("userInfo");
        if (!userModel) return "Unknown";
  
        const userData = userModel.getData();
        return (userData.firstname + "." + userData.lastname.slice(0, 1) || "Unknown User").slice(0, 12);
      };
    };
  });