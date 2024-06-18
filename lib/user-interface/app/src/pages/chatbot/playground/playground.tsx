import BaseAppLayout from "../../../components/base-app-layout";
import Chat from "../../../components/chatbot/chat";

import { Link, useParams } from "react-router-dom";
import { Alert, Header, HelpPanel } from "@cloudscape-design/components";
import EmailPanel from "../../../components/chatbot/email-panel"
import { useState, useEffect, useRef } from "react";
import { ChatBotHistoryItem } from "../../../components/chatbot/types";

export default function Playground() {
  const { sessionId } = useParams();
  const [emailPanelShown, setEmailPanelShown] = useState<boolean>(false);
  const [messageHistoryForEmail, setMessageHistoryForEmail] = useState<ChatBotHistoryItem[]>([]);
  const [splitPanelOpen, setSplitPanelOpen] = useState<boolean>(false);
  const firstRender = useRef(true);

  useEffect(() => {
    console.log("email history updated")
    console.log(messageHistoryForEmail);
    if (!firstRender.current) {
      setSplitPanelOpen(true);
    } else {
      firstRender.current = false;
    }    
  },[messageHistoryForEmail])
  return (    
    <BaseAppLayout
      info={
        <HelpPanel header={<Header variant="h3">Using the chat</Header>}>
          <p>
            This chatbot application allows users to ask questions about the RIDE, an MBTA
          </p>
          <h3>Settings</h3>
          <p>
            You can configure additional settings for the LLM via the setting
            action at the bottom-right. You can change the Temperature and Top P
            values to be used for the answer generation. You can also enable and
            disable streaming mode for those models that support it (the setting
            is ignored if the model does not support streaming). Turning on
            Metadata displays additional information about the answer, such as
            the prompts being used to interact with the LLM and the document
            passages that might have been retrieved from the RAG storage.
          </p>
          <h3>Multimodal chat</h3>
          <p>
            If you select a multimodal model (like Anthropic Claude 3), you can
            upload images to use in the conversation.
          </p>
          <h3>Session history</h3>
          <p>
            All conversations are saved and can be later accessed via the{" "}
            <Link to="/chatbot/sessions">Session</Link> in the navigation bar.
          </p>
        </HelpPanel>
      }
      toolsWidth={300}
      splitPanelOpen={splitPanelOpen}
      onSplitPanelToggle={({ detail }) =>
        setSplitPanelOpen(detail.open)
      }
      splitPanel={<EmailPanel isHidden={false} messageHistory={messageHistoryForEmail}/>}
      content={
       <div>
      {/* <Chat sessionId={sessionId} /> */}
      
      <Chat sessionId={sessionId} updateEmailFunction={setMessageHistoryForEmail} />
      </div>
     }
    />    
  );
}
