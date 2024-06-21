// import {
//   SideNavigation,
//   SideNavigationProps,
//   Header,
//   Button,
//   Box,
//   SpaceBetween,
//   StatusIndicator
// } from "@cloudscape-design/components";
// import useOnFollow from "../common/hooks/use-on-follow";
// // import { useNavigationPanelState } from "../common/hooks/use-navigation-panel-state";
// import { AppContext } from "../common/app-context";
// import PencilSquareIcon from "../../public/images/pencil-square.jsx";
// import RouterButton from "../components/wrappers/router-button";
// import { useContext, useState, useEffect } from "react";
// import { ApiClient } from "../common/api-client/api-client";
// import { Auth } from "aws-amplify";
// import { v4 as uuidv4 } from "uuid";
// import {SessionRefreshContext} from "../common/session-refresh-context"
// // import { useNotifications } from "../components/notif-manager";
// import { Utils } from "../common/utils.js";

// export default function NavigationPanel() {
//   const appContext = useContext(AppContext);
//   const apiClient = new ApiClient(appContext);
//   const onFollow = useOnFollow();
//   // const [navigationPanelState, setNavigationPanelState] =
//   //   useNavigationPanelState();
//   const [items, setItems] = useState<SideNavigationProps.Item[]>([]);
//   const [loaded,setLoaded] = useState<boolean>(false);
//   const {needsRefresh, setNeedsRefresh} = useContext(SessionRefreshContext);
//   const [loadingSessions, setLoadingSessions] = useState(false);
//   // const { addNotification, removeNotification } = useNotifications();


  // update the list of sessions every now and then
//   const loadSessions = async () => {
//     let username;
//     try {
//     await Auth.currentAuthenticatedUser().then((value) => username = value.username);
//     if (username && needsRefresh) {
//       // let's wait for about half a second before refreshing the sessions      
//       const fetchedSessions = await apiClient.sessions.getSessions(username);  
//       updateItems(fetchedSessions);
//       console.log("fetched sessions")
//       // console.log(fetchedSessions);
//       if (!loaded) {
//         setLoaded(true);
//       }
//       setNeedsRefresh(false);
//     }
//   }  catch (error) {
//     console.error("Failed to load sessions:", error);
//     setLoaded(true);
//     // addNotification("error", "Could not load sessions:".concat(error.message));
//     // addNotification("info", "Please refresh the page");    
//     // const delay = ms => new Promise(res => setTimeout(res, ms));
//     // delay(3000).then(() => removeNotification(id));
    
//   } finally {
//     setLoadingSessions(false);
//   }
// }
//   useEffect(() => {
   

//     // const interval = setInterval(loadSessions, 1000);
//     // loadSessions();

//     // return () => clearInterval(interval);
//     loadSessions(); 
//   }, [needsRefresh]);


//   // const onReloadClick = async () => {
//   //   await loadSessions();
//   //   const id =addNotification("success", "Sessions reloaded successfully!");
//   //   Utils.delay(3000).then(() => removeNotification(id))
//   // };


//   const updateItems = (sessions) => {
//     const newItems: SideNavigationProps.Item[] = [
//       {
//         type: "section",
//         text: "Session History",
//         items: sessions.map(session => ({
//           type: "link",
//           text: `${session.title}`,
//           href: `/chatbot/playground/${session.session_id}`,
//         })).concat([{
//           type: "link",
//           info: <Box margin="xxs" textAlign="center" ><Button iconName="refresh" loading={loadingSessions} variant="link">Reload Sessions</Button></Box>
//         }]),
//       },
//       {
//         type: "section",
//         text: "Admin",
//         items: [
//           { type: "link", text: "Update Data", href: "/admin/add-data" },
//           { type: "link", text: "Data", href: "/admin/data" },
//           { type: "link", text: "User Feedback", href: "/admin/user-feedback" }
//         ],
//       },
//     ];
//     setItems(newItems);
//   };

  // const onChange = ({
  //   detail,
  // }: {
  //   detail: SideNavigationProps.ChangeDetail;
  // }) => {
  //   // const sectionIndex = items.findIndex(detail.item);
  //   const sectionIndex = items.indexOf(detail.item);
  //   setNavigationPanelState({
  //     collapsedSections: {
  //       ...navigationPanelState.collapsedSections,
  //       [sectionIndex]: !detail.expanded,
  //     },
  //   });
  // };


  // return (
  //   <div>
  //     <Box margin="xs" padding={{ top: "l" }} textAlign="center">
  //       <RouterButton
  //         iconAlign="right"
  //         iconSvg={<PencilSquareIcon />}
  //         variant="primary"
  //         href={`/chatbot/playground/${uuidv4()}`}
  //         data-alignment="right"
  //         className="new-chat-button"
  //         style={{ textAlign: "right"}}
  //       >
  //         New session
  //       </RouterButton>
  //     </Box>            
  //     {loaded ?
  //     <></>: 
  //     <Box margin="xs" padding="xs" textAlign="center">
  //       <StatusIndicator type="loading">Loading sessions...</StatusIndicator>
  //     </Box>}
  //   </div>
  // );
// }
