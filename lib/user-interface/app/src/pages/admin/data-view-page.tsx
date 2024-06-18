import {
  BreadcrumbGroup,
  ContentLayout,
  Header,
  SpaceBetween,
  Alert,
  Tabs,
  Container
} from "@cloudscape-design/components";
import useOnFollow from "../../common/hooks/use-on-follow";
import BaseAppLayout from "../../components/base-app-layout";
import DocumentsTab from "./documents-tab";
import { CHATBOT_NAME } from "../../common/constants";
import { useState, useEffect, useContext } from "react";
import { fetchAuthSession , signIn, signOut } from "aws-amplify/auth";
import DataFileUpload from "./file-upload-tab";
import { ApiClient } from "../../common/api-client/api-client";
import { AppContext } from "../../common/app-context";

export default function DataPage() {
  const onFollow = useOnFollow();
  const [admin, setAdmin] = useState<boolean>(false);
  const [activeTab, setActiveTab] = useState("file");
  const appContext = useContext(AppContext);
  const apiClient = new ApiClient(appContext);
  const [lastSyncTime, setLastSyncTime] = useState("")
  const [showUnsyncedAlert, setShowUnsyncedAlert] = useState(false);

  /** Function to get the last synced time */
  const refreshSyncTime = async () => {
    try {
      const lastSync = await apiClient.knowledgeManagement.lastKendraSync();    
      setLastSyncTime(lastSync);
    } catch (e) {
      console.log(e);
    }
  }

  /** Checks for admin status */
  useEffect(() => {
    (async () => {
      try {
        const result = await fetchAuthSession();
        if (!result || Object.keys(result).length === 0) {
          console.log("Signed out!")
          signOut();
          return;
        }
        const admin = result?.tokens?.idToken?.payload["custom:role"]
        if (admin) {
          const data = JSON.parse(admin);
          if (data.includes("Admin")) {
            setAdmin(true);
          }
        }
      }
      /** If there is some issue checking for admin status, just do nothing and the
       * error page will show up
        */
      catch (e) {
        console.log(e);
      }
    })();
  }, []);

  /** If the admin status check fails, just show an access denied page*/
  if (!admin) {
    return (
      <div
        style={{
          height: "90vh",
          width: "100%",
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
        }}
      >
        <Alert header="Configuration error" type="error">
          You are not authorized to view this page!
        </Alert>
      </div>
    );
  }

  return (
    <BaseAppLayout
      contentType="cards"
      breadcrumbs={
        <BreadcrumbGroup
          onFollow={onFollow}
          items={[
            {
              text: CHATBOT_NAME,
              href: "/",
            },
            {
              text: "View Data",
              href: "/admin/data",
            },
          ]}
        />
      }
      content={
        <ContentLayout
          header={
            <Header
              variant="h1"
            >
              Data Dashboard
            </Header>
          }
        >
          <SpaceBetween size="l">
            <Container
              header={
                <Header
                  variant="h3"
                  // description="Container description"
                >
                  Last successful sync: {lastSyncTime}
                </Header>                
              }
            >
              <SpaceBetween size="xxs">
              Manage the chatbot's data here. You can view, add, or remove data for the chatbot to reference.

              Please make sure to sync data with the chatbot when you are done adding or removing new files.
              <br></br>
              {showUnsyncedAlert && (
                <Alert
                  type="warning"
                  dismissAriaLabel="Close alert"
                  // dismissible
                  onDismiss={() => setShowUnsyncedAlert(false)}
                >
                  Some files have been added or modified since the last sync.
                  Please sync the data to ensure the chatbot has the latest
                  information.
                </Alert>
              )}
              </SpaceBetween>
            </Container>
            <Tabs
              tabs={[
                {
                  label: "Current Files",
                  id: "file",
                  content: (
                    <DocumentsTab
                      tabChangeFunction={() => setActiveTab("add-data")}
                      documentType="file"
                      statusRefreshFunction={refreshSyncTime}
                      lastSyncTime={lastSyncTime}
                      setShowUnsyncedAlert={setShowUnsyncedAlert}
                    />
                  ),
                },
                {
                  label: "Add Files",
                  id: "add-data",
                  content: (
                    <DataFileUpload 
                      tabChangeFunction={() => setActiveTab("file")}
                    />
                  ),
                },
              ]}
              activeTabId={activeTab}
              onChange={({ detail: { activeTabId } }) => {
                setActiveTab(activeTabId);
              }}
            />

          </SpaceBetween>
        </ContentLayout>
      }
    />
  );
}
