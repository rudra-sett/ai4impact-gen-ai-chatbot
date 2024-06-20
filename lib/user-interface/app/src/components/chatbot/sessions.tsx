import {
  Box,
  SpaceBetween,
  Table,
  Pagination,
  Button,
  TableProps,
  Header,
  CollectionPreferences,
  Modal,
  ContentLayout,
} from "@cloudscape-design/components";
import { useState, useEffect, useContext, useCallback } from "react";
import { Link } from "react-router-dom";
import { v4 as uuidv4 } from "uuid";
import { Auth } from  'aws-amplify'
import { useCollection } from "@cloudscape-design/collection-hooks";
import { ApiClient } from "../../common/api-client/api-client";
import { AppContext } from "../../common/app-context";
import RouterButton from "../wrappers/router-button";
import { DateTime } from "luxon";
// import { Session } from "../../API";

export interface SessionsProps {
  readonly toolsOpen: boolean;
}

export default function Sessions(props: SessionsProps) {
  const appContext = useContext(AppContext);
  const [sessions, setSessions] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedItems, setSelectedItems] = useState<any[]>([]);
  const [preferences, setPreferences] = useState({ pageSize: 20 });
  const [showModalDelete, setShowModalDelete] = useState(false);
  const [deleteAllSessions, setDeleteAllSessions] = useState(false);

  const { items, collectionProps, paginationProps } = useCollection(sessions, {
    filtering: {
      empty: (
        <Box margin={{ vertical: "xs" }} textAlign="center" color="inherit">
          <SpaceBetween size="m">
            <b>No sessions</b>
          </SpaceBetween>
        </Box>
      ),
    },
    pagination: { pageSize: preferences.pageSize },
    sorting: {
      defaultState: {
        sortingColumn: {
          sortingField: "time_stamp",
        },
        isDescending: true,
      },
    },
    selection: {},
  });

  const getSessions = useCallback(async () => {
    if (!appContext) return;
    let username;
    const apiClient = new ApiClient(appContext);
    try {
      await Auth.currentAuthenticatedUser().then((value) => username = value.username);
      if (username) {
        const result = await apiClient.sessions.getSessions(username,true);
        setSessions(result);
      }
    } catch (e) {
      console.log(e);
      setSessions([]);
    }
  }, [appContext]);

  useEffect(() => {
    if (!appContext) return;

    (async () => {
      setIsLoading(true);
      await getSessions();
      setIsLoading(false);
    })();
  }, [appContext, getSessions, props.toolsOpen]);

  const deleteSelectedSessions = async () => {
    if (!appContext) return;
    let username;
    await Auth.currentAuthenticatedUser().then((value) => username = value.username);
    setIsLoading(true);
    const apiClient = new ApiClient(appContext);
    await Promise.all(
      selectedItems.map((s) => apiClient.sessions.deleteSession(s.session_id, username))
    );
    setSelectedItems([])
    setShowModalDelete(false);
    await getSessions();
    setIsLoading(false);
  };

  /** Deletes all user sessions, functionality is intentionally not available  */
  const deleteUserSessions = async () => {
    if (!appContext) return;

    setIsLoading(true);
    const apiClient = new ApiClient(appContext);
    // await apiClient.sessions.deleteSessions();
    await getSessions();
    setIsLoading(false);
  };

  return (
    <>
      <Modal
        onDismiss={() => setShowModalDelete(false)}
        visible={showModalDelete}
        footer={
          <Box float="right">
            <SpaceBetween direction="horizontal" size="xs">
              {" "}
              <Button variant="link" onClick={() => setShowModalDelete(false)}>
                Cancel
              </Button>
              <Button variant="primary" onClick={deleteSelectedSessions}>
                Ok
              </Button>
            </SpaceBetween>{" "}
          </Box>
        }
        header={"Delete session" + (selectedItems.length > 1 ? "s" : "")}
      >
        Do you want to delete{" "}
        {selectedItems.length == 1
          ? `session ${selectedItems[0].session_id}?`
          : `${selectedItems.length} sessions?`}
      </Modal>
      {/* This Modal allows for the deletion of ALL sessions
      We decided this was too powerful and deliberately left it out
      The API connector in sessions-client also does not include
      functionality to delete all sessions for the same reason.
      However, the API itself does have the functionality, albeit inaccessible
      aside from a manual authenticated API call */}
      {/* <Modal
        onDismiss={() => setDeleteAllSessions(false)}
        visible={deleteAllSessions}
        footer={
          <Box float="right">
            <SpaceBetween direction="horizontal" size="xs">
              {" "}
              <Button
                variant="link"
                onClick={() => setDeleteAllSessions(false)}
              >
                Cancel
              </Button>
              <Button variant="primary" onClick={deleteUserSessions}>
                Ok
              </Button>
            </SpaceBetween>{" "}
          </Box>
        }
        header={"Delete all sessions"}
      >
        {`Do you want to delete ${sessions.length} sessions?`}
      </Modal> */}
      <ContentLayout header={<Header variant="h1">Session History</Header>}>
      <Table
        {...collectionProps}
        // variant="full-page"
        items={items}
        onSelectionChange={({ detail }) => {
          console.log(detail);
          setSelectedItems(detail.selectedItems);
        }}
        selectedItems={selectedItems}
        selectionType="multi"
        trackBy="session_id"
        empty={
          <Box margin={{ vertical: "xs" }} textAlign="center" color="inherit">
            <SpaceBetween size="m">
              <b>No sessions</b>
            </SpaceBetween>
          </Box>
        }
        ariaLabels={{
          selectionGroupLabel: "Items selection",
          allItemsSelectionLabel: ({ selectedItems }) =>
            `${selectedItems.length} ${selectedItems.length === 1 ? "item" : "items"
            } selected`,
          itemSelectionLabel: (e, item) => item.title!,
        }}
        pagination={<Pagination {...paginationProps} />}
        loadingText="Loading history"
        loading={isLoading}
        resizableColumns
        // stickyHeader={true}
        preferences={
          <CollectionPreferences
            onConfirm={({ detail }) =>
              setPreferences({ pageSize: detail.pageSize ?? 20 })
            }
            title="Preferences"
            confirmLabel="Confirm"
            cancelLabel="Cancel"
            preferences={preferences}
            pageSizePreference={{
              title: "Page size",
              options: [
                { value: 10, label: "10" },
                { value: 20, label: "20" },
                { value: 50, label: "50" },
              ],
            }}
          />
        }
        header={
          <Header
            // description="List of past sessions"
            // variant="awsui-h1-sticky"
            actions={
              <SpaceBetween direction="horizontal" size="m">
                <RouterButton
                  iconName="add-plus"
                  href={`/chatbot/playground/${uuidv4()}`}
                  // variant="inline-link"
                  // onClick={() => getSessions()}
                >
                  New session
                </RouterButton>
                <Button
                  iconAlt="Refresh list"
                  iconName="refresh"
                  // variant="inline-link"
                  onClick={() => getSessions()}
                >
                  Refresh
                </Button>
                <Button
                  disabled={selectedItems.length == 0}
                  iconAlt="Delete"
                  iconName="remove"
                  // variant="inline-link"
                  onClick={() => {
                    if (selectedItems.length > 0) setShowModalDelete(true);
                  }}
                >
                  Delete
                </Button>
                {/* <Button
                  iconAlt="Delete all sessions"
                  iconName="delete-marker"
                  variant="inline-link"
                  onClick={() => setDeleteAllSessions(true)}
                >
                  Delete all sessions
                </Button> */}
              </SpaceBetween>
            }
            description="View or delete any of your past 100 sessions"
          >     
          {"Sessions"}       
          </Header>
        }
        columnDefinitions={
          [
            {
              id: "title",
              header: "Title",
              sortingField: "title",
              width: 800,
              minWidth: 200,
              cell: (e) => (
                <Link to={`/chatbot/playground/${e.session_id}`}>{e.title}</Link>
              ),
              isRowHeader: true,
            },
            {
              id: "time",
              header: "Time",
              sortingField: "time_stamp",
              cell: (e) =>
                DateTime.fromISO(
                  new Date(e.time_stamp).toISOString()
                ).toLocaleString(DateTime.DATETIME_SHORT),
              sortingComparator: (a, b) => {
                return (
                  new Date(b.time_stamp).getTime() -
                  new Date(a.time_stamp).getTime()
                );
              },
            },
          ] as TableProps.ColumnDefinition<any>[]
        }
      />
      </ContentLayout>
    </>
  );
}
