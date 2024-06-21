import { useEffect, useState } from "react";
import {
  ThemeProvider,
  defaultDarkModeOverride,
} from "@aws-amplify/ui-react";
import App from "../app";
import { Amplify, Auth} from "aws-amplify";
import { AppConfig } from "../common/types";
import { AppContext } from "../common/app-context";
import { Alert, StatusIndicator } from "@cloudscape-design/components";
import { StorageHelper } from "../common/helpers/storage-helper";
import { Mode } from "@cloudscape-design/global-styles";
import "@aws-amplify/ui-react/styles.css";
export default function AppConfigured() {
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [error, setError] = useState<boolean | null>(null);
  //const [authenticated, setAuthenticated] = useState<boolean>(null);
  const [theme, setTheme] = useState(StorageHelper.getTheme());
  const [configured, setConfigured] = useState<boolean>(false);
  // this is the authentication provider that Cognito needs
  const federatedIdName : string = "AzureAD-OIDC-MassGov";
  //trigger authentication state when needed
  useEffect(() => {
    (async () => {
      try {
        const result = await fetch("/aws-exports.json");
        const awsExports = await result.json();
        Amplify.configure(awsExports);
        setConfigured(true);
        // const currentUser = await Auth.currentAuthenticatedUser();
        // // console.log("Authenticated user:", currentUser);
        //setAuthenticated(true);
        // console.log(authenticated);
        setConfig(awsExports);
      } catch (e) {
        console.error("Configuration error:", e);
        //setAuthenticated(false);
      }
    })();
  }, []);
  // // whenever the authentication state changes, if it's changed to un-authenticated, re-verify
  // useEffect(() => { 
  //   if (!authenticated && configured) {
  //     console.log("No authenticated user, initiating sign-in.");
  //     Auth.federatedSignIn({ customProvider: federatedIdName });
  //   }
  // }, [authenticated]);
  // dark/light theme
  useEffect(() => {
    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        if (
          mutation.type === "attributes" &&
          mutation.attributeName === "style"
        ) {
          const newValue =
            document.documentElement.style.getPropertyValue(
              "--app-color-scheme"
            );
          const mode = newValue === "dark" ? Mode.Dark : Mode.Light;
          if (mode !== theme) {
            setTheme(mode);
          }
        }
      });
    });
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["style"],
    });
    return () => {
      observer.disconnect();
    };
  }, [theme]);
  // display a loading screen while waiting for the config file to load
  if (!config) {
    if (error) {
      return (
        <div
          style={{
            height: "100%",
            width: "100%",
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
          }}
        >
          <Alert header="Configuration error" type="error">
            Error loading configuration from "
            <a href="/aws-exports.json" style={{ fontWeight: "600" }}>
              /aws-exports.json
            </a>
            "
          </Alert>
        </div>
      );
    }
    return (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
        }}
      >
        <StatusIndicator type="loading">Loading</StatusIndicator>
      </div>
    );
  }
  // the main app - only display it when authenticated
  return (
    <AppContext.Provider value={config}>
      <ThemeProvider
        theme={{
          name: "default-theme",
          overrides: [defaultDarkModeOverride],
        }}
        colorMode={theme === Mode.Dark ? "dark" : "light"}
      >
          <App />
      </ThemeProvider>
    </AppContext.Provider>
  );
}







