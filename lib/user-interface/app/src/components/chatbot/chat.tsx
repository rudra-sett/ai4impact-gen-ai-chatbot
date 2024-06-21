import { useContext, useEffect, useState } from "react";
import {
  ChatBotConfiguration,
  ChatBotHistoryItem,
  ChatBotMessageType,
  FeedbackData,
} from "./types";
import { SpaceBetween, StatusIndicator, Alert, Flashbar, Button } from "@cloudscape-design/components";
import { v4 as uuidv4 } from "uuid";
import { AppContext } from "../../common/app-context";
import { ApiClient } from "../../common/api-client/api-client";
import ChatMessage from "./chat-message";
import Modal from "@cloudscape-design/components/modal";
import ChatInputPanel, { ChatScrollState } from "./chat-input-panel";
import styles from "../../styles/chat.module.scss";
import Box from '@cloudscape-design/components/box';
import BrandBanner from "./BrandBanner"; // Import the new Dropdown component

const DefaultButton = () => {
  return <Button variant="link">Other</Button>;
}
const FarmButton = () => {
  return <Button variant="link">Farm</Button>;
}
const BusinessButton = () => {
  return <Button variant="link">Business</Button>;
}
const NonprofitButton = () => {
  return <Button variant="link">Nonprofit</Button>;
}
const TownButton = () => {
  return <Button variant="link">Town</Button>;
}

const customModalStyle = {
  backgroundColor: '#388557', // Change this to your desired color
  color: '#333', // Optional: Change the text color if needed
  padding: '20px', // Optional: Add some padding
  borderRadius: '10px', // Optional: Add rounded corners
};

import { useNotifications } from "../notif-manager";

export default function Chat(props: { sessionId?: string }) {
  const appContext = useContext(AppContext);
  const [running, setRunning] = useState<boolean>(false);
  const [session, setSession] = useState<{ id: string; loading: boolean }>({
    id: props.sessionId ?? uuidv4(),
    loading: typeof props.sessionId !== "undefined",
  });
  const [configuration, setConfiguration] = useState<ChatBotConfiguration>(
    () => ({
      streaming: true,
      showMetadata: true,
      maxTokens: 512,
      temperature: 0,
      topP: 0.9,
      files: null,
    })
  );

  const { notifications, addNotification } = useNotifications();

  const [messageHistory, setMessageHistory] = useState<ChatBotHistoryItem[]>(
    []
  );

  const [modalVisible, setModalVisible] = useState(true); // State for modal visibility

  useEffect(() => {
    if (!appContext) return;
    setMessageHistory([]);

    (async () => {
      if (!props.sessionId) {
        setSession({ id: uuidv4(), loading: false });
        return;
      }

      setSession({ id: props.sessionId, loading: true });
      const apiClient = new ApiClient(appContext);
      try {
        // const result = await apiClient.sessions.getSession(props.sessionId);
        const hist = await apiClient.sessions.getSession(props.sessionId,"11");

        if (hist) {
          // console.log(hist);
          ChatScrollState.skipNextHistoryUpdate = true;
          ChatScrollState.skipNextScrollEvent = true;
          // console.log("History", result.data.getSession.history);
          setMessageHistory(
            hist
              .filter((x) => x !== null)
              .map((x) => ({
                type: x!.type as ChatBotMessageType,
                metadata: x!.metadata!,
                content: x!.content,
              }))
          );

          window.scrollTo({
            top: 0,
            behavior: "instant",
          });
        }
        setSession({ id: props.sessionId, loading: false });
        setRunning(false);
      } catch (error) {
        console.log(error);
        addNotification("error",error.message)
        addNotification("info","Please refresh the page")
      }
    })();
  }, [appContext, props.sessionId]);

  const handleFeedback = (feedbackType: 1 | 0, idx: number, message: ChatBotHistoryItem, feedbackTopic? : string, feedbackProblem? : string, feedbackMessage? : string) => {
      console.log("submitting feedback...")
      const prompt = messageHistory[idx - 1].content
      const completion = message.content;
      // const model = message.metadata.modelId;
      const feedbackData = {
        sessionId: props.sessionId, //message.metadata.sessionId as string,        
        feedback: feedbackType,
        prompt: prompt,
        completion: completion,
        topic: feedbackTopic,
        problem: feedbackProblem,
        comment: feedbackMessage     
      };
      addUserFeedback(feedbackData);
    // }
  };

  const addUserFeedback = async (feedbackData) => {
    const response = await fetch('https://4eyjyb4lqouzyvvvs5fh6zwwse0spnhw.lambda-url.us-east-1.on.aws/', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body : JSON.stringify({feedbackData})
    });
    console.log(response);
  }

  return (
    <div className={styles.chat_container}> 
     <div className="modal custom-modal">
      <Modal
        onDismiss={() => setModalVisible(false)}
        visible={modalVisible}
        size="large"
        footer={
          <Box float="right">
            <SpaceBetween direction="horizontal" size="xs">
            </SpaceBetween>
          </Box>
        }
        header="Welcome to the Massachusetts EEA Grants Navigator!"
      >
        <p>Discover the grants offered by the EEA from Agriculture, Energy, Environmental, and more!</p>
        <ul>
          <li>Enter your search term. For example: <em>"Composting"</em>, into the search bar and see which grant programs relate to composting.</li>
          <li>Clearing a search is only available after a full response has been generated.</li>
          <li><strong>Select your organization before searching so the results are tailored to you!</strong></li>
        </ul>
      </Modal>
     </div>
      <SpaceBetween direction="vertical" size="m">

      <SpaceBetween direction="vertical" size="m"></SpaceBetween>
      </SpaceBetween>
      <div className={styles.input_container}>
        <SpaceBetween direction="horizontal" size="l">
          </SpaceBetween> 
        <SpaceBetween direction="vertical" size="s">
          <ChatInputPanel
            session={session}
            running={running}
            setRunning={setRunning}
            messageHistory={messageHistory}
            setMessageHistory={setMessageHistory}
            configuration={configuration}
            setConfiguration={setConfiguration} />
        </SpaceBetween>
        <div className={styles.chat_container}>
          <SpaceBetween direction="vertical" size="m">
            {messageHistory.map((message, idx) => (
              <ChatMessage
                key={idx}
                message={message}
                showMetadata={configuration.showMetadata}
                onThumbsUp={() => handleFeedback(1, idx, message)}
                onThumbsDown={() => handleFeedback(0, idx, message)} />
            ))}
          </SpaceBetween>
        </div>
      </div>
      <footer style={{ position: 'fixed', bottom: 0, width: 'calc(100% - 50px)'}}>
        <BrandBanner />
      </footer>
    </div>
  );
};
