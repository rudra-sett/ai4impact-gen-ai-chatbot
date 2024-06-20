import {
  SideNavigation,
  SideNavigationProps,
  Header,
  Button,
  Box,
  SpaceBetween,
  StatusIndicator
} from "@cloudscape-design/components";
import useOnFollow from "../common/hooks/use-on-follow";
import { useNavigationPanelState } from "../common/hooks/use-navigation-panel-state";
import { AppContext } from "../common/app-context";
import PencilSquareIcon from "../../public/images/pencil-square.jsx";
import RouterButton from "../components/wrappers/router-button";
import { useContext, useState, useEffect } from "react";
import { ApiClient } from "../common/api-client/api-client";
import { Auth } from "aws-amplify";
import { v4 as uuidv4 } from "uuid";
import { SessionRefreshContext } from "../common/session-refresh-context"
import { useNotifications } from "../components/notif-manager";
import { Utils } from "../common/utils.js";


export default function NavigationPanel() {
  const appContext = useContext(AppContext);
  const apiClient = new ApiClient(appContext);
  const onFollow = useOnFollow();
  const [navigationPanelState, setNavigationPanelState] =
    useNavigationPanelState();
  const [items, setItems] = useState<SideNavigationProps.Item[]>([]);
  const [loaded, setLoaded] = useState<boolean>(false);
  const { needsRefresh, setNeedsRefresh } = useContext(SessionRefreshContext);
  const [loadingSessions, setLoadingSessions] = useState(false);
  const { addNotification, removeNotification } = useNotifications();
  const [activeHref, setActiveHref] = useState(
    window.location.pathname
  );



  // update the list of sessions
  const loadSessions = async () => {
    let username;
    try {
      await Auth.currentAuthenticatedUser().then((value) => username = value.username);
      if (username && needsRefresh) {
        const fetchedSessions = await apiClient.sessions.getSessions(username);
        await updateItems(fetchedSessions);
        console.log("fetched sessions")
        // console.log(fetchedSessions);
        if (!loaded) {
          setLoaded(true);
        }
        setNeedsRefresh(false);
      }
    } catch (error) {
      console.error("Failed to load sessions:", error);
      setLoaded(true);
      addNotification("error", "Could not load sessions:".concat(error.message));
      addNotification("info", "Please refresh the page");
      // const delay = ms => new Promise(res => setTimeout(res, ms));
      // delay(3000).then(() => removeNotification(id));

    } finally {
      setLoadingSessions(false);
    }
  }

  // this hook allows other components (specifically the chat handler)
  // to request a session refresh (such as if a chat has just been created)
  useEffect(() => {
    loadSessions();
  }, [needsRefresh]);


  const onReloadClick = async () => {
    await loadSessions();
    const id = addNotification("success", "Sessions reloaded successfully!");
    Utils.delay(3000).then(() => removeNotification(id))
  };


  const updateItems = async (sessions) => {
    let newItems: SideNavigationProps.Item[] = [
      {
        type: "section",
        text: "Session History",
        items: sessions.map(session => ({
          type: "link",
          text: `${session.title}`,
          href: `/chatbot/playground/${session.session_id}`,
        })).concat([{
          type: "link",
          info: <Box margin="xxs" textAlign="center" >
            <SpaceBetween size="xs">
            <RouterButton href={"/chatbot/sessions"} loading={loadingSessions} variant="link">View All Sessions</RouterButton>
            <Button onClick={onReloadClick} iconName="refresh" loading={loadingSessions} variant="link">Reload Sessions</Button>            
            </SpaceBetween>
            </Box>
        }]),
      },
    ];
    try {
      const result = await Auth.currentAuthenticatedUser();
      const admin = result?.signInUserSession?.idToken?.payload["custom:role"]
      if (admin) {
        const data = JSON.parse(admin);
        if (data.includes("Admin")) {
          console.log("admin found!")
          newItems.push({
            type: "section",
            text: "Admin",
            items: [
              { type: "link", text: "Data", href: "/admin/data" },
              { type: "link", text: "User Feedback", href: "/admin/user-feedback" }
            ],
          },)
        }
      }
    } catch (e) {
      console.log(e)
    }
    setItems(newItems);
  };

  const onChange = ({
    detail,
  }: {
    detail: SideNavigationProps.ChangeDetail;
  }) => {
    // const sectionIndex = items.findIndex(detail.item);
    const sectionIndex = items.indexOf(detail.item);
    setNavigationPanelState({
      collapsedSections: {
        ...navigationPanelState.collapsedSections,
        [sectionIndex]: !detail.expanded,
      },
    });
  };


  return (
    <div>
      <Box margin="xs" padding={{ top: "l" }} textAlign="center">
        <RouterButton
          iconAlign="right"
          iconSvg={<PencilSquareIcon />}
          variant="primary"
          href={`/chatbot/playground/${uuidv4()}`}
          data-alignment="right"
          className="new-chat-button"
          style={{ textAlign: "right" }}
        >
          New session
        </RouterButton>
      </Box>
      {loaded ?
        <SideNavigation
          activeHref={activeHref}
          // onFollow={onFollow}
          onFollow={event => {
            if (!event.detail.external) {
              event.preventDefault();
              setActiveHref(event.detail.href);
              onFollow(event);
            }
          }}
          onChange={onChange}
          items={items}
        /> :
        <Box margin="xs" padding="xs" textAlign="center">
          <StatusIndicator type="loading">Loading sessions...</StatusIndicator>
        </Box>}
    </div>
  );
}