import { useState, useEffect, useContext, useCallback } from "react";
import { v4 as uuidv4 } from "uuid";
import { Link } from "react-router-dom";
import { useCollection } from "@cloudscape-design/collection-hooks";
import RouterButton from "../wrappers/router-button";
import { ApiClient } from "../../common/api-client/api-client";
import { SessionsClient } from "../../common/api-client/sessions-client";
import { SessionsProps } from "../chatbot/sessions";
// add in import for the API client 
// import { listSessionsByUserId } from '.lambda whatever' 
import { AppContext } from "../../common/app-context";
import { AppConfig } from "../../common/types";
import { ContentType } from "../chatbot/types";

// interface SideBarCreateButtonProps {
//     contentType: ContentTypehasData: boolean
// }
// export const useChatHandler = () => {
    
    
// }
// export const SidebarCreateButton: FC<SideBarCreateButtonProps> = ({
//     contentType,
//     hasData
// }) => {
//     const { userId, selectedWorkspace} = useContext(ChatbotUIContext)
//     const { handleNewChat } useChatHandler() 

// }


// add in looping function similar to that in the models/index.ts that maps through and pushes 