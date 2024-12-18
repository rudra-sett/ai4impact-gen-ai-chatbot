import { useContext, useEffect, useState } from "react";
import {
  ChatBotHistoryItem,
  ChatBotMessageType,
  FeedbackData
} from "./types";
import { Auth } from "aws-amplify";
import { SpaceBetween, StatusIndicator, Alert, ColumnLayout, Input, Button, TextContent, Box } from "@cloudscape-design/components";
import { v4 as uuidv4 } from "uuid";
import { AppContext } from "../../common/app-context";
import { ApiClient } from "../../common/api-client/api-client";
import ChatMessage from "./chat-message";
import ChatInputPanel, { ChatScrollState } from "./chat-input-panel";
import styles from "../../styles/chat.module.scss";
import { CHATBOT_NAME } from "../../common/constants";
import { useNotifications } from "../notif-manager";

export default function Chat(props: {
  sessionId?: string,
  setAmendments: React.Dispatch<React.SetStateAction<any[]>>,
  setLoading: React.Dispatch<React.SetStateAction<boolean>>,
  chapter: string,
  year: string,
  actText: string,
  setActText: React.Dispatch<React.SetStateAction<string>>
  changeAct: (year: string, chapter: string) => void
}) {
  const appContext = useContext(AppContext);
  const [running, setRunning] = useState<boolean>(true);
  const [session, setSession] = useState<{ id: string; loading: boolean }>({
    id: props.sessionId ?? uuidv4(),
    loading: typeof props.sessionId !== "undefined",
  });

  const { notifications, addNotification } = useNotifications();
  const [messageHistory, setMessageHistory] = useState<ChatBotHistoryItem[]>([]);
  const [year, setYear] = useState(props.year);
  const [act, setAct] = useState(props.chapter);
  const [actLoading, setActLoading] = useState(false);

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
        let username;
        await Auth.currentAuthenticatedUser().then((value) => (username = value.username));
        if (!username) return;
        const hist = await apiClient.sessions.getSession(props.sessionId, username);

        if (hist) {
          ChatScrollState.skipNextHistoryUpdate = true;
          ChatScrollState.skipNextScrollEvent = true;

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
      } catch (error: any) {
        console.log(error);
        addNotification("error", error.message);
        addNotification("info", "Please refresh the page");
      }
    })();
  }, [appContext, props.sessionId]);

  const handleFeedback = (
    feedbackType: 1 | 0,
    idx: number,
    message: ChatBotHistoryItem,
    feedbackTopic?: string,
    feedbackProblem?: string,
    feedbackMessage?: string
  ) => {
    if (props.sessionId) {
      console.log("submitting feedback...");
      const prompt = messageHistory[idx - 1]?.content ?? "";
      const completion = message.content;

      const feedbackData = {
        sessionId: props.sessionId,
        feedback: feedbackType,
        prompt: prompt,
        completion: completion,
        topic: feedbackTopic,
        problem: feedbackProblem,
        comment: feedbackMessage,
        sources: JSON.stringify(message.metadata.Sources)
      };
      addUserFeedback(feedbackData);
    }
  };

  const addUserFeedback = async (feedbackData: FeedbackData) => {
    if (!appContext) return;
    const apiClient = new ApiClient(appContext);
    await apiClient.userFeedback.sendUserFeedback(feedbackData);
  };

  useEffect(() => {
    if (!appContext) return;
    (async () => {
      setActLoading(true);
      const apiClient = new ApiClient(appContext);
      const text = await apiClient.acts.getAct(props.year, props.chapter);
      setYear(props.year);
      setAct(props.chapter);
      props.setActText(text);
      // We rely on Playground to fetch and highlight amendments, so no diff logic here.
      setActLoading(false);
    })();
  }, [props.year, props.chapter]);

  const getAct = () => {
    props.changeAct(year, act);
  };

  return (
    <div>
      <ColumnLayout columns={2}>
        <div className={styles.chat_container}>
          <SpaceBetween direction="vertical" size="m">
            {messageHistory.length == 0 && !session?.loading && (
              <Alert statusIconAriaLabel="Info" header="">
                AI Models can make mistakes. Be mindful in validating important information.
              </Alert>
            )}

            {messageHistory.map((message, idx) => (
              <ChatMessage
                key={idx}
                message={message}
                onThumbsUp={() => handleFeedback(1, idx, message)}
                onThumbsDown={(feedbackTopic: string, feedbackType: string, feedbackMessage: string) =>
                  handleFeedback(0, idx, message, feedbackTopic, feedbackType, feedbackMessage)
                }
              />
            ))}
          </SpaceBetween>
          <div className={styles.welcome_text}>
            {messageHistory.length == 0 && !session?.loading && (
              <center>{CHATBOT_NAME}</center>
            )}
            {session?.loading && (
              <center>
                <StatusIndicator type="loading">Loading session</StatusIndicator>
              </center>
            )}
          </div>
          <div className={styles.input_container}>
            <ChatInputPanel
              session={session}
              running={running}
              setRunning={setRunning}
              messageHistory={messageHistory}
              setMessageHistory={(history) => setMessageHistory(history)}
            />
          </div>
        </div>
        <div>
          <div className={styles.chat_container}>
            {actLoading ? (
              <Box textAlign="center">
                <StatusIndicator type="loading">Loading law</StatusIndicator>
              </Box>
            ) : (
              // Now the actText may contain HTML tags due to diff highlighting
              <Box textAlign="center">
                <TextContent>
                  <div dangerouslySetInnerHTML={{ __html: props.actText }} />
                </TextContent>
              </Box>
            )}
          </div>
          <div className={styles.input_container}>
            <SpaceBetween direction="horizontal" size="xs">
              <Input
                onChange={({ detail }) => setYear(detail.value)}
                value={year}
                placeholder="Year"
              />
              <Input
                onChange={({ detail }) => setAct(detail.value)}
                value={act}
                placeholder="Chapter"
              />
              <Button variant="primary" onClick={getAct}>
                Retrieve
              </Button>
            </SpaceBetween>
          </div>
        </div>
      </ColumnLayout>
    </div>
  );
}
