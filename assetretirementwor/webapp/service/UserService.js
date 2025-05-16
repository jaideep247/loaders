sap.ui.define([
  "sap/ui/model/json/JSONModel"
  // Add other dependencies like jQuery.ajax if making direct calls
], function(JSONModel) {
  "use strict";

  return class UserService {
      constructor(options = {}) {
          if (!options.controller) {
              throw new Error("UserService requires a controller instance.");
          }
          this.oController = options.controller;
          this._errorHandler = options.errorHandler;
          console.log("UserService initialized.");
          // Removed "someObject" reference error cause if it was here
      }

      loadUserInfo() {
          return new Promise((resolve, reject) => {
              let sUserInfoUrl = "";
              try {
                  // Check if controller and method exist before calling
                  if (!this.oController || typeof this.oController.getBaseURL !== 'function') {
                       throw new Error("Controller or getBaseURL method is not available.");
                  }
                  const sBaseUrl = this.oController.getBaseURL(); // Call the method safely

                  // *** ADJUST THIS URL ***
                  sUserInfoUrl = sBaseUrl + "/user-api/currentUser"; // Example endpoint

                  console.log("Attempting to load user info from:", sUserInfoUrl);

                  // Using fetch API example
                  fetch(sUserInfoUrl)
                      .then(response => {
                          if (!response.ok) {
                              // Throw specific error for 404
                              if (response.status === 404) {
                                   throw new Error(`User API endpoint not found (${response.status}): ${sUserInfoUrl}`);
                              }
                              throw new Error(`HTTP error! Status: ${response.status}`);
                          }
                          return response.json();
                      })
                      .then(userData => {
                          console.log("User info loaded:", userData);
                          const oUserModel = new JSONModel(userData);
                          this.oController.getOwnerComponent().setModel(oUserModel, "userInfo");
                          resolve(userData);
                      })
                      .catch(error => {
                          console.error(`Error loading user info from ${sUserInfoUrl}:`, error);
                          // Use errorHandler if available, show warning otherwise
                          if (this._errorHandler?.showWarning) { // Optional chaining
                              this._errorHandler.showWarning(`Could not load user information: ${error.message}`);
                          } else {
                               console.warn(`Could not load user information: ${error.message}`);
                          }
                          reject(error); // Reject the promise
                      });

              } catch (error) {
                  console.error("Error preparing user info request:", error);
                  if (this._errorHandler?.showError) {
                       this._errorHandler.showError(`Internal error preparing user info request: ${error.message}`);
                   }
                  reject(error);
              }
          });
      }
  };
});