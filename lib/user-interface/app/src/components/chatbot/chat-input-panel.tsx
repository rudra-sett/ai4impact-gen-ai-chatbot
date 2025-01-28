import React, {
  Dispatch,
  SetStateAction,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import {
  Button,
  Container,
  Icon,
  Select,
  SelectProps,
  SpaceBetween,
  Spinner,
  StatusIndicator,
  // --- Added imports ---
  Modal,
  Box,
  Flashbar,
} from "@cloudscape-design/components";
import SpeechRecognition, { useSpeechRecognition } from "react-speech-recognition";
import { Auth } from "aws-amplify";
import TextareaAutosize from "react-textarea-autosize";
import { ReadyState } from "react-use-websocket";
import { ApiClient } from "../../common/api-client/api-client";
import { AppContext } from "../../common/app-context";
import styles from "../../styles/chat.module.scss";

import {  
  ChatBotHistoryItem,  
  ChatBotMessageType,
  ChatInputState,  
} from "./types";

import {  
  assembleHistory
} from "./utils";

import { Utils } from "../../common/utils";
import {SessionRefreshContext} from "../../common/session-refresh-context";
import { useNotifications } from "../notif-manager";

export interface ChatInputPanelProps {
  running: boolean;
  setRunning: Dispatch<SetStateAction<boolean>>;
  session: { id: string; loading: boolean };
  messageHistory: ChatBotHistoryItem[];
  setMessageHistory: (history: ChatBotHistoryItem[]) => void;  
}

export abstract class ChatScrollState {
  static userHasScrolled = false;
  static skipNextScrollEvent = false;
  static skipNextHistoryUpdate = false;
}


// For the FeedbackModal
interface FeedbackModalProps {
  visible: boolean;
  onClose: () => void;
  onSubmit: () => void;
  feedbackType: string;
  setFeedbackType: Dispatch<SetStateAction<string>>;
  feedbackTopic: string;
  setFeedbackTopic: Dispatch<SetStateAction<string>>;
  feedbackMessage: string;
  setFeedbackMessage: Dispatch<SetStateAction<string>>;
}

const FeedbackModal = React.memo(({
  visible,
  onClose,
  onSubmit,
  feedbackType,
  setFeedbackType,
  feedbackTopic,
  setFeedbackTopic,
  feedbackMessage,
  setFeedbackMessage,
}: FeedbackModalProps) => {
  const typeOptions: SelectProps.Option[] = [
    { label: "General", value: "General" },
    { label: "Chatbot", value: "Chatbot" },
    { label: "Search", value: "Search" },
    { label: "Browse", value: "Browse" },
    { label: "Other", value: "Other" },
  ];

  const topicOptions: SelectProps.Option[] = [
    { label: "View", value: "View" },
    { label: "Functionality", value: "Functionality" },
    { label: "Accuracy", value: "Accuracy" },
    { label: "Bug", value: "Bug" },
    { label: "Other", value: "Other" },
  ];

  return (
    <Modal
      visible={visible}
      onDismiss={onClose}
      header="Submit Feedback!"
      footer={
        <Box float="right">
          <Button variant="link" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" onClick={onSubmit}>
            Submit
          </Button>
        </Box>
      }
    >
      <Box margin={{ bottom: "m" }}>
        <Select
          options={typeOptions}
          selectedOption={typeOptions.find((opt) => opt.value === feedbackType) || null}
          onChange={({ detail }) => setFeedbackType(detail.selectedOption.value || "")}
          placeholder="Select Feedback Type"
        />
      </Box>
      <Box margin={{ bottom: "m" }}>
        <Select
          options={topicOptions}
          selectedOption={topicOptions.find((opt) => opt.value === feedbackTopic) || null}
          onChange={({ detail }) => setFeedbackTopic(detail.selectedOption.value || "")}
          placeholder="Select Feedback Topic"
        />
      </Box>
      <Box>
        <TextareaAutosize
          value={feedbackMessage}
          onChange={(e) => setFeedbackMessage(e.target.value)}
          placeholder="Enter Feedback Message"
          minRows={3}
          style={{
            width: "100%",
            padding: "8px",
            fontSize: "14px",
            fontFamily: "Arial, sans-serif",
            borderColor: "#ccc",
          }}
        />
      </Box>
    </Modal>
  );
});

// For the FeedbackTab
interface FeedbackTabProps {
  onFeedbackDown: () => void;
  onFeedbackUp: () => void;
}

const FeedbackTab = React.memo(({ onFeedbackDown, onFeedbackUp }: FeedbackTabProps) => {
  return (
    <div style={{
      display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center", textAlign: "center"
    }}>
      <div style={{
        border: "0.01rem outset #000716",
        borderRadius: "10px",
        display: "inline-block",
        padding: "4px 8px",
        flexDirection: "column",
        justifyContent: "center",
        alignItems: "center",
        textAlign: "center"
      }}>
        <Box>
          <h4 style={{ fontFamily: "Calibri, sans-serif", fontWeight: "500", fontSize: 15 }}>
            Do you have any feedback?
          </h4>
          <Button variant="link" onClick={onFeedbackDown}>
            Yes
          </Button>
          <Button variant="link" onClick={onFeedbackUp}>
            No
          </Button>
        </Box>
      </div>
    </div>
  );
});

// The main container that ties the tab and modal together
interface FeedbackContainerProps {
  apiClient?: ApiClient; // or remove if not needed
  showFlashMessage: (type: "info" | "success" | "warning" | "error", content: React.ReactNode) => void;
}

const FeedbackContainer: React.FC<FeedbackContainerProps> = ({
  apiClient,
  showFlashMessage
}) => {
  const [feedbackModalVisible, setFeedbackModalVisible] = useState(false);
  const [feedbackType, setFeedbackType] = useState("");
  const [feedbackTopic, setFeedbackTopic] = useState("");
  const [feedbackMessage, setFeedbackMessage] = useState("");

  const handleFeedbackUp = () => {
    // Positive feedback
    showFlashMessage("success", "Thank you for your valuable feedback!");
    // Could log it to your server if needed
    console.log("Positive feedback received");
  };

  const handleFeedbackDown = () => {
    // Show the extended feedback modal
    setFeedbackModalVisible(true);
  };

  const submitFeedback = async () => {
    if (!feedbackType || !feedbackTopic || !feedbackMessage) {
      showFlashMessage("error", "Please fill out all fields before submitting feedback.");
      return;
    }
    try {
      const feedbackData = {
        type: feedbackType || "",
        topic: feedbackTopic || "",
        message: feedbackMessage || "",
      };
      await apiClient.userFeedback.sendToolFeedback(feedbackData);
      showFlashMessage("success", "Feedback submitted successfully!");
      setFeedbackModalVisible(false);
    } catch (error) {
      showFlashMessage("error", "Failed to submit feedback. Please try again later.");
    } finally {
      setFeedbackType("");
      setFeedbackTopic("");
      setFeedbackMessage("");
    }
  };

  return (
    <>
      <FeedbackTab onFeedbackUp={handleFeedbackUp} onFeedbackDown={handleFeedbackDown} />
      <FeedbackModal
        visible={feedbackModalVisible}
        onClose={() => setFeedbackModalVisible(false)}
        onSubmit={submitFeedback}
        feedbackType={feedbackType}
        setFeedbackType={setFeedbackType}
        feedbackTopic={feedbackTopic}
        setFeedbackTopic={setFeedbackTopic}
        feedbackMessage={feedbackMessage}
        setFeedbackMessage={setFeedbackMessage}
      />
    </>
  );
};


export default function ChatInputPanel(props: ChatInputPanelProps) {
  const appContext = useContext(AppContext);
  const { needsRefresh, setNeedsRefresh } = useContext(SessionRefreshContext);
  const { transcript, listening, browserSupportsSpeechRecognition } =
    useSpeechRecognition();
  const [state, setState] = useState<ChatInputState>({
    value: "",
  });
  const { notifications, addNotification } = useNotifications();
  const [readyState, setReadyState] = useState<ReadyState>(ReadyState.OPEN);
  const messageHistoryRef = useRef<ChatBotHistoryItem[]>([]);

  const apiClient = new ApiClient(appContext);

  const [flashItems, setFlashItems] = useState([]);

  function showFlashMessage(
    type: "info" | "success" | "warning" | "error",
    content: React.ReactNode,
    duration = 3000
  ) {
    addNotification(type, content.toString());
  }

  useEffect(() => {
    messageHistoryRef.current = props.messageHistory;    
  }, [props.messageHistory]);

  const [
    selectedDataSource,
    setSelectedDataSource
  ] = useState({ label: "Bedrock Knowledge Base", value: "kb" } as SelectProps.ChangeDetail["selectedOption"]);


  /** Speech recognition */
  useEffect(() => {
    if (transcript) {
      setState((state) => ({ ...state, value: transcript }));
    }
  }, [transcript]);

  /**Some amount of auto-scrolling for convenience */
  useEffect(() => {
    const onWindowScroll = () => {
      if (ChatScrollState.skipNextScrollEvent) {
        ChatScrollState.skipNextScrollEvent = false;
        return;
      }

      const isScrollToTheEnd =
        Math.abs(
          window.innerHeight +
            window.scrollY -
            document.documentElement.scrollHeight
        ) <= 10;

      if (!isScrollToTheEnd) {
        ChatScrollState.userHasScrolled = true;
      } else {
        ChatScrollState.userHasScrolled = false;
      }
    };

    window.addEventListener("scroll", onWindowScroll);

    return () => {
      window.removeEventListener("scroll", onWindowScroll);
    };
  }, []);

  useLayoutEffect(() => {
    if (ChatScrollState.skipNextHistoryUpdate) {
      ChatScrollState.skipNextHistoryUpdate = false;
      return;
    }

    if (!ChatScrollState.userHasScrolled && props.messageHistory.length > 0) {
      ChatScrollState.skipNextScrollEvent = true;
      window.scrollTo({
        top: document.documentElement.scrollHeight + 1000,
        behavior: "instant",
      });
    }
  }, [props.messageHistory]);

  /**Sends a message to the chat API */
  const handleSendMessage = async () => {    
    if (props.running) return;
    if (readyState !== ReadyState.OPEN) return;
    ChatScrollState.userHasScrolled = false;

    let username;
    await Auth.currentAuthenticatedUser().then((value) => (username = value.username));
    if (!username) return;

    const messageToSend = state.value.trim();
    if (messageToSend.length === 0) {
      addNotification("error", "Please do not submit blank text!");
      return;
    }

    setState({ value: "" });
    try {
      props.setRunning(true);

      let receivedData = "";

      /**Add the user's query to the message history and a blank dummy message
       * for the chatbot as the response loads
       */
      messageHistoryRef.current = [
        ...messageHistoryRef.current,
        {
          type: ChatBotMessageType.Human,
          content: messageToSend,
          metadata: {},
        },
        {
          type: ChatBotMessageType.AI,
          content: receivedData,
          metadata: {},
        },
      ];
      props.setMessageHistory(messageHistoryRef.current);

      let firstTime = false;
      if (messageHistoryRef.current.length < 3) {
        firstTime = true;
      }

      const TEST_URL = appContext.wsEndpoint + "/";
      // Get a JWT token for the API to authenticate
      const TOKEN = await Utils.authenticate();
      const wsUrl = TEST_URL + "?Authorization=" + TOKEN;
      const ws = new WebSocket(wsUrl);

      let incomingMetadata: boolean = false;
      let sources = {};

      // Time out
      setTimeout(() => {
        if (receivedData === "") {
          ws.close();
          messageHistoryRef.current.pop();
          messageHistoryRef.current.push({
            type: ChatBotMessageType.AI,
            content: "Response timed out!",
            metadata: {},
          });
        }
      }, 60000);

      // On connect
      ws.addEventListener("open", function open() {
        console.log("Connected to the WebSocket server");
        const message = JSON.stringify({
          action: "getChatbotResponse",
          data: {
            userMessage: messageToSend,
            chatHistory: assembleHistory(messageHistoryRef.current.slice(0, -2)),
            systemPrompt: `You are an AI chatbot for the RIDE, an MBTA paratransit service. You will help customer service representatives respond to user complaints and queries.
          Answer questions based on your Context and nothing more. If you are unable to decisively answer a question, direct them to customer service. Do not provide information outside of your given Context.
          Customer service is needed if it is something you cannot answer. Requests for fare history require customer service, as do service complaints like a rude driver or late pickup.
          Highly-specific situations will also require customer service to step in. Remember that RIDE Flex and RIDE are not the same service. 
          Phone numbers:
          TRAC (handles scheduling/booking, trip changes/cancellations, anything time-sensitive): 844-427-7433 (voice/relay) 857-206-6569 (TTY)
          Mobility Center (handles eligibility questions, renewals, and changes to mobility status): 617-337-2727 (voice/relay)
          MBTA Customer support (handles all other queries): 617-222-3200 (voice/relay)`,
            projectId: "rsrs111111",
            user_id: username,
            session_id: props.session.id,
            retrievalSource: selectedDataSource.value, 
          },
        });

        ws.send(message);
      });

      // On incoming messages
      ws.addEventListener("message", async function incoming(data) {
        if (data.data.includes("<!ERROR!>:")) {
          addNotification("error", data.data);
          ws.close();
          return;
        }

        if (data.data === "!<|EOF_STREAM|>!") {
          incomingMetadata = true;
          return;
        }

        if (!incomingMetadata) {
          receivedData += data.data;
        } else {
          let sourceData = JSON.parse(data.data);
          sourceData = sourceData.map((item: any) => {
            if (item.title === "") {
              return {
                title: item.uri.slice(item.uri.lastIndexOf("/") + 1),
                uri: item.uri,
              };
            } else {
              return item;
            }
          });
          sources = { Sources: sourceData };
        }

        // Update the chat history state
        messageHistoryRef.current = [
          ...messageHistoryRef.current.slice(0, -2),
          {
            type: ChatBotMessageType.Human,
            content: messageToSend,
            metadata: {},
          },
          {
            type: ChatBotMessageType.AI,
            content: receivedData,
            metadata: sources,
          },
        ];
        props.setMessageHistory(messageHistoryRef.current);
      });

      // On error
      ws.addEventListener("error", function error(err) {
        console.error("WebSocket error:", err);
      });

      // On close
      ws.addEventListener("close", async function close() {
        if (firstTime) {
          Utils.delay(1500).then(() => setNeedsRefresh(true));
        }
        props.setRunning(false);
        console.log("Disconnected from the WebSocket server");
      });
    } catch (error) {
      console.error("Error sending message:", error);
      alert("Sorry, something has gone horribly wrong! Please try again or refresh the page.");
      props.setRunning(false);
    }
  };

  const connectionStatus = {
    [ReadyState.CONNECTING]: "Connecting",
    [ReadyState.OPEN]: "Open",
    [ReadyState.CLOSING]: "Closing",
    [ReadyState.CLOSED]: "Closed",
    [ReadyState.UNINSTANTIATED]: "Uninstantiated",
  }[readyState];


  return (
    <SpaceBetween direction="vertical" size="l">

      <Container>
        <div className={styles.input_textarea_container}>
          <SpaceBetween size="xxs" direction="horizontal" alignItems="center">
            {browserSupportsSpeechRecognition ? (
              <Button
                iconName={listening ? "microphone-off" : "microphone"}
                variant="icon"
                ariaLabel="microphone-access"
                onClick={() =>
                  listening
                    ? SpeechRecognition.stopListening()
                    : SpeechRecognition.startListening()
                }
              />
            ) : (
              <Icon name="microphone-off" variant="disabled" />
            )}
          </SpaceBetween>
          <TextareaAutosize
            className={styles.input_textarea}
            maxRows={6}
            minRows={1}
            spellCheck={true}
            autoFocus
            onChange={(e) =>
              setState((state) => ({ ...state, value: e.target.value }))
            }
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSendMessage();
              }
            }}
            value={state.value}
            placeholder={"Send a message"}
          />
          <div style={{ marginLeft: "8px" }}>
            <Button
              disabled={
                readyState !== ReadyState.OPEN ||
                props.running ||
                state.value.trim().length === 0 ||
                props.session.loading
              }
              onClick={handleSendMessage}
              iconAlign="right"
              iconName={!props.running ? "angle-right-double" : undefined}
              variant="primary"
            >
              {props.running ? (
                <>
                  Loading&nbsp;&nbsp;
                  <Spinner />
                </>
              ) : (
                "Send"
              )}
            </Button>
          </div>
        </div>
      </Container>

      <div className={styles.input_controls}>
        <div />
        <div className={styles.input_controls_right}>
          <SpaceBetween direction="horizontal" size="xxs" alignItems="center">
            <div style={{ paddingTop: "1px" }}>
            </div>
          </SpaceBetween>
        </div>
      </div>
      <div style={{ marginTop: "1rem", textAlign: "center" }}>
        <FeedbackContainer 
          apiClient={apiClient}
          showFlashMessage={showFlashMessage}
        />
      </div>
    </SpaceBetween>
  );
}
