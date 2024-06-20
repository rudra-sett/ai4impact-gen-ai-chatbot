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
        <HelpPanel header={<Header variant="h3">Using the Application</Header>}>
          <p>
            This chatbot allows representatives to ask questions about the RIDE. It is intended
            to help you find answers to riders' questions quickly and easily. You can find information on
            anything about the RIDE, such as payments, scheduling, the NSLC policy, etc. If you are part of TRAC,
            you can also ask questions regarding anything you might find in your Zendesk Help Center.
            
          </p>
          <h3>Know How: Features</h3>
          <p>
            <ol>
           There are many features to support you as a representative!
           <li>Querying: click the new session button in the left side panel or select one of the listed chats under session history, in the left side panel.</li>
           <li>Feedback: select the thumbs up/thumbs down button under each chatbot response to provide feedback.</li>
           <li>Sources: view the sources the chatbot pulled its information from by clicking on the sources button.</li>
           <li>Email Generation: click on the generate email button under each chatbot response to generate an email to send.</li>
           </ol>
          </p>
          <h3>Satisfaction Survey</h3>
          <p>
            Along with the feedback button, please fill out this <Link to="https://forms.gle/9rBkqRKZW1sxFPUZ8">satisfaction survey</Link> if you would like to see improvements to this tool.
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