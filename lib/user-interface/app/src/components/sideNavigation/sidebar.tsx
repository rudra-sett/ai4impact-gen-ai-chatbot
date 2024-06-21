// import { useState, useEffect, useContext, useCallback, useRef, FC } from "react";
// import { v4 as uuidv4 } from "uuid";
// import { Link } from "react-router-dom";
// import { useCollection } from "@cloudscape-design/collection-hooks";
// import RouterButton from "../wrappers/router-button";
// import { ApiClient } from "../../common/api-client/api-client";
// import { AppConfig } from "../../common/types";
// import { ContentType } from "../chatbot/types";
// import Sessions from "../chatbot/sessions";
// import { SessionsClient } from "../../common/api-client/sessions-client";
// import { SessionsProps } from "../chatbot/sessions";
// import { BreadcrumbGroup } from "@cloudscape-design/components";
// import { ChatBotHistoryItem } from "../chatbot/types";
// import { ChatInputPanelProps } from "../chatbot/chat-input-panel";
// import {
//     BrowserRouter,
//     HashRouter,
//     Outlet,
//     Route,
//     Routes,
//   } from "react-router-dom";
// import { SidebarContent } from "./content-props";
// // add in import for the API client 
// // import { listSessionsByUserId } from '.lambda whatever' 
// import { AppContext } from "../../common/app-context";

// interface SidebarProps {
//     contentType: ContentType
//     showSidebar: boolean 
// }
// export function SidebarV1({ contentType, showSidebar }) {
//     const appContext = useContext(AppContext);
//     const apiClient = new ApiClient(appContext);
//     const userId = "0";

//     const [sessions, setSessions] = useState([]);
//     // const {
//     //     folders, chats
//     // } = useContext(appContext)
//     const sessionsList = apiClient.sessions.getSessions(userId);

//     useEffect(() => {
//         const fetchSessions = async () => {
//             // const [sessions, setSessions] = useState([]); 
//             const sessionsList = await apiClient.sessions.getSessions(userId); // hardcoded in user ID
//             setSessions(sessionsList);
//         };
//         fetchSessions();
//     }, [appContext]);



//     // const renderSidebar = (
//     //     contentType: ContentType,
//     //     // change could make it instead just chats
//     //     data: any[]
//     // ) => {
//     //     return (
//     //     );
//     // };


// }

// // OPTION Two
// export default function SidebarSessions() {
//     const appContext = useContext(AppContext)
//     const[sessions, setSessions] = useState([])
//     const apiClient = new ApiClient(appContext)
//     const userId = "0"; 
    
//     // const [session, setSession] = useState<{ id: string; loading: boolean }>({
//     //     id: props.sessionId ?? uuidv4(),
//     //     loading: typeof props.sessionId !== "undefined",
//     //   });
//     //const messageHistoryRef = useRef<ChatBotHistoryItem[]>([]);
//     useEffect(() => {
//         const fetchSessions = async () => {
//             // const [sessions, setSessions] = useState([]); 
//             const sessionsList = await apiClient.sessions.getSessions(userId); // hardcoded in user ID
//             setSessions(sessionsList);
//         }; 
//             fetchSessions(); 
//         }, [appContext]);
    
    
//     // seEffect(() => {
//     //     if (!appContext) return;
//     //     const apiClient = new ApiClient(appContext.config);
//     //     const fetchSessions = async () => {
//     //         const sessionsData = await apiClient.sessions.getSessions(appContext.userId);
//     //         setSessions(sessionsData);
//     //     };

//     //     fetchSessions();
//     // }, [appContext]);
//     // need to send it back after retrieving the list 

//     // ONE WAY TO DO 
//     // return (
//     //     <div>
//     //         {sessions.map(session => ( // need to change this
//     //             <Link key={session.sessionId} to={`/chatbot/sessions/${session.sessionId}`}>
        
//     //             </Link>
//     //         ))}
//     //     </div>
//     //     // <BreadcrumbGroup 
//     //     // items={[]}>
        
        
//     //     // </BreadcrumbGroup>
//     // );


            


// // || `Session from ${new Date(session.timestamp).toLocaleString()}`

// // const renderSidebar = (
// //     contentType: ContentType, 
// //     // change could make it instead just chats
// //     data: any[], // could make list of chats from api client 
// // ) => {
// //     return (
// //         <SidebarContent contentType={contentType} data={data} />
// //     )
// // }

// return (
    
//    <div> 
//         {/* {sessions.map((session) => (
//             <Link
//             key={session.session_id}
//             to={`/chatbot/sessions/${session.session_id}`}
//             >
//             Session ID: 
//         ))} */}
//     </div>
    
// )
// }
