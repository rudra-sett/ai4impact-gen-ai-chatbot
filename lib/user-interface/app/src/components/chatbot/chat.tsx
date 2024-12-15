import { useContext, useEffect, useState, Fragment } from "react";
import {
  ChatBotHistoryItem,
  ChatBotMessageType,
  FeedbackData
} from "./types";
import { Auth } from "aws-amplify";
import { SpaceBetween, StatusIndicator, Alert, Flashbar, ColumnLayout, Input, Button, TextContent, Spinner, Box } from "@cloudscape-design/components";
import { v4 as uuidv4 } from "uuid";
import { AppContext } from "../../common/app-context";
import { ApiClient } from "../../common/api-client/api-client";
import ChatMessage from "./chat-message";
import ChatInputPanel, { ChatScrollState } from "./chat-input-panel";
import styles from "../../styles/chat.module.scss";
import { CHATBOT_NAME } from "../../common/constants";
import { useNotifications } from "../notif-manager";
import { Utils } from "../../common/utils";

export default function Chat(props: {
  sessionId?: string,
  setAmendments: React.Dispatch<React.SetStateAction<any[]>>,
  setLoading: React.Dispatch<React.SetStateAction<boolean>>,
  chapter: string,
  year: string,
  changeAct : (year: string, chapter: string) => void
}) {
  const appContext = useContext(AppContext);
  const [running, setRunning] = useState<boolean>(true);
  const [session, setSession] = useState<{ id: string; loading: boolean }>({
    id: props.sessionId ?? uuidv4(),
    loading: typeof props.sessionId !== "undefined",
  });

  const { notifications, addNotification } = useNotifications();

  const [messageHistory, setMessageHistory] = useState<ChatBotHistoryItem[]>(
    []
  );

  const [year, setYear] = useState(props.year);
  const [act, setAct] = useState(props.chapter);
  const [actText, setActText] = useState("Enter a chapter and year to retrieve an Act");
  const [actLoading, setActLoading] = useState(false);



  /** Loads session history */
  useEffect(() => {
    if (!appContext) return;
    setMessageHistory([]);

    (async () => {
      /** If there is no session ID, then this must be a new session
       * and there is no need to load one from the backend.
       * However, even if a session ID is set and there is no saved session in the 
       * backend, there will be no errors - the API will simply return a blank session
       */
      if (!props.sessionId) {
        setSession({ id: uuidv4(), loading: false });
        return;
      }

      setSession({ id: props.sessionId, loading: true });
      const apiClient = new ApiClient(appContext);
      try {
        // const result = await apiClient.sessions.getSession(props.sessionId);
        let username;
        await Auth.currentAuthenticatedUser().then((value) => username = value.username);
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
      } catch (error) {
        console.log(error);
        addNotification("error", error.message)
        addNotification("info", "Please refresh the page")
      }
    })();
  }, [appContext, props.sessionId]);

  /** Adds some metadata to the user's feedback */
  const handleFeedback = (feedbackType: 1 | 0, idx: number, message: ChatBotHistoryItem, feedbackTopic?: string, feedbackProblem?: string, feedbackMessage?: string) => {
    if (props.sessionId) {
      console.log("submitting feedback...")

      const prompt = messageHistory[idx - 1].content
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

  /** Makes the API call via the ApiClient to submit the feedback */
  const addUserFeedback = async (feedbackData: FeedbackData) => {
    if (!appContext) return;
    const apiClient = new ApiClient(appContext);
    await apiClient.userFeedback.sendUserFeedback(feedbackData);
  }

  useEffect(() => {
    if (!appContext) return;
    setActLoading(true);
    (async () => 
    {const apiClient = new ApiClient(appContext);
    const text = await apiClient.acts.getAct(props.year, props.chapter);
    setYear(props.year);
    setAct(props.chapter);
    setActText(text);
    getAmendments();
    setActLoading(false);})();    
  }, [props.year,props.chapter])

  const getAct = async () => {
    props.changeAct(year,act)
  }

  const getAmendments = async () => {
    let username: string;
    await Auth.currentAuthenticatedUser().then((value) => username = value.username);
    if (!username) return;

    try {      
      props.setLoading(true);
      const apiClient = new ApiClient(appContext);
      let amendments = await apiClient.acts.getAct(props.year, props.chapter);
      (amendments as any[]).sort((a, b) => {
        const yearA = parseInt(a.amending_act.match(/of (\d{4})/)[1], 10);
        const yearB = parseInt(b.amending_act.match(/of (\d{4})/)[1], 10);
        return yearA - yearB;
      });

      props.setAmendments(amendments as any[])

    } catch (error) {
      console.error('Could not get amendments:', error);            
      props.setLoading(false);
    }
  }

  return (
    <div>
      <ColumnLayout columns={2}>
        <div className={styles.chat_container}>
          <SpaceBetween direction="vertical" size="m">

            {messageHistory.length == 0 && !session?.loading && (
              <Alert
                statusIconAriaLabel="Info"
                header=""
              >
                AI Models can make mistakes. Be mindful in validating important information.
              </Alert>)}


            {messageHistory.map((message, idx) => (
              <ChatMessage
                key={idx}
                message={message}
                onThumbsUp={() => handleFeedback(1, idx, message)}
                onThumbsDown={(feedbackTopic: string, feedbackType: string, feedbackMessage: string) => handleFeedback(0, idx, message, feedbackTopic, feedbackType, feedbackMessage)}
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
            { actLoading? <Box textAlign="center"><StatusIndicator type="loading">Loading law</StatusIndicator></Box>:
            <Box textAlign="center">
            <TextContent>
              {/* {actText} */}
              {actText.split('\n').map((line, index) => (
                <Fragment key={index}>
                  {line}
                  <br />
                </Fragment>
              ))}
            </TextContent>
            </Box>
            }
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
              <Button variant="primary" onClick={getAct} >Retrieve</Button>
              {/* <Button variant="primary" onClick={getAmendments} >Amendments</Button> */}
            </SpaceBetween>
          </div>
        </div>
      </ColumnLayout>
    </div>
  );
}
