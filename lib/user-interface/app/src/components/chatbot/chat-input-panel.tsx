import {
  Button,
  Container,
  SpaceBetween,
  Spinner,
  Box,
  Select,
  SelectProps
} from "@cloudscape-design/components";
import {
  Dispatch,
  SetStateAction,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { useNavigate } from "react-router-dom";
import SpeechRecognition, {
  useSpeechRecognition,
} from "react-speech-recognition";
import TextareaAutosize from "react-textarea-autosize";
import { ReadyState } from "react-use-websocket";
import { ApiClient } from "../../common/api-client/api-client";
import { AppContext } from "../../common/app-context";
import styles from "../../styles/chat.module.scss";
import {
  ChatBotConfiguration,
  ChatBotHistoryItem,
  ChatBotMessageType,
  ChatInputState,
  ImageFile,
} from "./types";
import {
  // getSelectedModelMetadata,
  getSignedUrl,
  updateMessageHistoryRef,
  assembleHistory
} from "./utils";
import { Utils } from "../../common/utils";
import { SessionRefreshContext } from "../../common/session-refresh-context"
import { useNotifications } from "../notif-manager";
import { Autocomplete } from "@aws-amplify/ui-react";

const defaultPrompt = `Based on the project and organization description provided by the user, recommend the most relevant specific grant programs offered by the Massachusetts Energy and Environment Office that would be a good fit. Always provide more than three grant programs that could be related to the users search, formatted as follows:
- **Grant Program Name (as a bold header):**
  - A 3 sentence description of the grant program.
  - **Specific Details:**
    - **Deadline Date:** [Insert Deadline Date] Be as specific as possible
    - **Target Audience:** [Insert Target Audience]
    - **Funding Amount:** [Insert Funding Amount]
    - **Match Requirement:** [Insert Match Requirement]
  - **Additional Information:** Include any extra information that might be important for potential applicants to be aware of. Do not include a link unless certain of its validity.

Ensure each grant program is clearly and concisely described, highlighting its relevance to the users project and organization.`

const farmPrompt = `Based on the project and organization description provided by the user, recommend the most relevant specific grant programs offered by the Massachusetts Energy and Environment Office that would be a good fit for a farm. Always provide more than 3 grant programs that could be related to the users search, formatted as follows:
- **Grant Program Name (as a bold header):**
  - A 3 sentence description of the grant program.
  - **Specific Details:**
    - **Deadline Date:** [Insert Deadline Date] Be as specific as possible
    - **Target Audience:** [Insert Target Audience]
    - **Funding Amount:** [Insert Funding Amount]
    - **Match Requirement:** [Insert Match Requirement]
  - **Additional Information:** Include any extra information that might be important for potential applicants to be aware of. Do not include a link unless certain of its validity.

Ensure each grant program is clearly and concisely described, highlighting its relevance to the users project and organization.`;
const nonprofitPrompt = `Based on the project and organization description provided by the user, recommend the most relevant specific grant programs offered by the Massachusetts Energy and Environment Office that would be a good fit for a nonprofit. Always provide more than three grant programs that could be related to the users search, formatted as follows:
- **Grant Program Name (as a bold header):**
  - A 3 sentence description of the grant program.
  - **Specific Details:**
    - **Deadline Date:** [Insert Deadline Date] Be as specific as possible
    - **Target Audience:** [Insert Target Audience]
    - **Funding Amount:** [Insert Funding Amount]
    - **Match Requirement:** [Insert Match Requirement]
  - **Additional Information:** Include any extra information that might be important for potential applicants to be aware of. Do not include a link unless certain of its validity.

Ensure each grant program is clearly and concisely described, highlighting its relevance to the users project and organization.`
const businessPrompt = `Based on the project and organization description provided by the user, recommend the most relevant specific grant programs offered by the Massachusetts Energy and Environment Office that would be a good fit for a business. Always provide more than three grant programs that could be related to the users search, formatted as follows:
- **Grant Program Name (as a bold header):**
  - A 3 sentence description of the grant program.
  - **Specific Details:**
    - **Deadline Date:** [Insert Deadline Date] Be as specific as possible
    - **Target Audience:** [Insert Target Audience]
    - **Funding Amount:** [Insert Funding Amount]
    - **Match Requirement:** [Insert Match Requirement]
  - **Additional Information:** Include any extra information that might be important for potential applicants to be aware of. Do not include a link unless certain of its validity.

Ensure each grant program is clearly and concisely described, highlighting its relevance to the users project and organization.`
const townPrompt = `Based on the project and organization description provided by the user, recommend the most relevant specific grant programs offered by the Massachusetts Energy and Environment Office that would be a good fit for a municipality or town. Always provide more than three grant programs that could be related to the users search, formatted as follows:
- **Grant Program Name (as a bold header):**
  - A 3 sentence description of the grant program.
  - **Specific Details:**
    - **Deadline Date:** [Insert Deadline Date] Be as specific as possible
    - **Target Audience:** [Insert Target Audience]
    - **Funding Amount:** [Insert Funding Amount]
    - **Match Requirement:** [Insert Match Requirement]
  - **Additional Information:** Include any extra information that might be important for potential applicants to be aware of. Do not include a link unless certain of its validity.

Ensure each grant program is clearly and concisely described, highlighting its relevance to the users project and organization.`;

const AIWarning = () => {
  return (
    <Box textAlign="center">
      <h4 style={{ fontFamily: 'Calibri, sans-serif', fontWeight: '500', fontSize: 15 }}>
        AI Models can make mistakes. Make sure to verify all information.
      </h4>
    </Box>
  );
};

export interface ChatInputPanelProps {
  running: boolean;
  setRunning: Dispatch<SetStateAction<boolean>>;
  session: { id: string; loading: boolean };
  messageHistory: ChatBotHistoryItem[];
  setMessageHistory: (history: ChatBotHistoryItem[]) => void;
  configuration: ChatBotConfiguration;
  setConfiguration: Dispatch<React.SetStateAction<ChatBotConfiguration>>;
}

export abstract class ChatScrollState {
  static userHasScrolled = false;
  static skipNextScrollEvent = false;
  static skipNextHistoryUpdate = false;
}

export default function ChatInputPanel(props: ChatInputPanelProps) {
  const appContext = useContext(AppContext);
  const { needsRefresh, setNeedsRefresh } = useContext(SessionRefreshContext);
  const apiClient = new ApiClient(appContext);
  const navigate = useNavigate();
  const { transcript, listening, browserSupportsSpeechRecognition } =
    useSpeechRecognition();
  const [state, setState] = useState<ChatInputState>({
    value: "",
    systemPrompt: defaultPrompt,
  });
  const [activeButton, setActiveButton] = useState<string>('General');
  const [selectedType, setSelectedType] = useState<SelectProps.Option | null>(null);
  const [configDialogVisible, setConfigDialogVisible] = useState(false);
  const [imageDialogVisible, setImageDialogVisible] = useState(false);
  const [files, setFiles] = useState<ImageFile[]>([]);
  const [readyState, setReadyState] = useState<ReadyState>(
    ReadyState.OPEN
  );
  const messageHistoryRef = useRef<ChatBotHistoryItem[]>([]);

  useEffect(() => {
    messageHistoryRef.current = props.messageHistory;
  }, [props.messageHistory]);

  useEffect(() => {
    if (transcript) {
      setState((state) => ({ ...state, value: transcript }));
    }
  }, [transcript]);

  // THIS IS THE ALL-IMPORTANT MESSAGE SENDING FUNCTION
  const handleSendMessage = async () => {
    // if (!state.selectedModel) return;
    if (props.running) return;
    if (readyState !== ReadyState.OPEN) return
    ChatScrollState.userHasScrolled = false;

    const messageToSend = state.value.trim();
    setState({ value: "", systemPrompt: defaultPrompt });
    try {
      props.setRunning(true);
      let receivedData = '';

      messageHistoryRef.current = [
        {
          type: ChatBotMessageType.Human,
          content: messageToSend,
          metadata: {
            ...props.configuration,
          },
          tokens: [],
        },
        {
          type: ChatBotMessageType.AI,
          tokens: [],
          content: receivedData,
          metadata: {},
        },
        ...messageHistoryRef.current
      ];
      props.setMessageHistory(messageHistoryRef.current);

      let firstTime = false;
      if (messageHistoryRef.current.length < 3) {
        firstTime = true;
      }

      // Connect to WebSocketHandler
      const wsUrl = appContext.wsEndpoint+"/"

      // console.log(TOKEN)
      const ws = new WebSocket(wsUrl);

      let incomingMetadata: boolean = false;
      let sources = {};

      setTimeout(() => {
        if (receivedData == '') {
          ws.close()
          messageHistoryRef.current.pop();
          messageHistoryRef.current.push({
            type: ChatBotMessageType.AI,
            tokens: [],
            content: 'Response timed out!',
            metadata: {},
          })
        }
      }, 60000)

      // Event listener for when the connection is open
      ws.addEventListener('open', function open() {
        console.log('Connected to the WebSocket server');
        // readline.question('What is your question? ', question => {
        const message = JSON.stringify({
          "action": "getChatbotResponse",
          "data": {
            userMessage: messageToSend,
            chatHistory: assembleHistory(messageHistoryRef.current.slice(0, -2)),
            systemPrompt: state.systemPrompt,
            // You are a navigator of grants offered by the Massachusetts Executive Office of Energy and Enviornmental Affairs(EEA). With each
            // user input, you will return the relevant grants offered by the EEA that are most relevant to the user input. The response should be formatted to include
            // the name of the grant as a bolded subheading, a 2-3 sentence description of the grant.
            // On a new bulletpointed line, state the deadline of the grants. Ten on a new bulletpointed line, state the funding available for the grants.
            // Then on a new bulletpointed line, list the match requirement. Then on a new bulletpointed line, list relevant contact information for the person in charge of that particular grant program. 
            // Then, include a link to the webpage where this information was found.
            //After each grant, include a link to the webpage where this information was found.
            //a new line that lists the deadline 
            //use language like "then"
            projectId: 'rkdg062824'
          }
        });
        ws.send(message);
      });
      // Event listener for incoming messages
      ws.addEventListener('message', async function incoming(data) {
        // console.log(data);        
        if (data.data.includes("<!ERROR!>:")) {
          //addNotification("error",data.data);          
          ws.close();
          return;
        }
        if (data.data == '!<|EOF_STREAM|>!') {

          incomingMetadata = true;
          return;
          // return;
        }
        if (!incomingMetadata) {
          receivedData += data.data;
        } else {
          sources = { "Sources": JSON.parse(data.data) }
          console.log(sources);
        }

        // console.log(data.data);
        // Update the chat history state with the new message        
        messageHistoryRef.current = [
          // ...messageHistoryRef.current.slice(0, -2),

          {
            type: ChatBotMessageType.Human,
            content: messageToSend,
            metadata: {
              ...props.configuration,
            },
            tokens: [],
          },
          {
            type: ChatBotMessageType.AI,
            tokens: [],
            content: receivedData,
            metadata: sources,
          },
          ...messageHistoryRef.current.slice(2)
        ];
        // console.log(messageHistoryRef.current)
        props.setMessageHistory(messageHistoryRef.current);
      });
      // Handle possible errors
      ws.addEventListener('error', function error(err) {
        console.error('WebSocket error:', err);
      });
      // Handle WebSocket closure
      ws.addEventListener('close', async function close() {
        // await apiClient.sessions.updateSession("0", props.session.id, messageHistoryRef.current);
        if (firstTime) {
          Utils.delay(1500).then(() => setNeedsRefresh(true));
        }
        props.setRunning(false);
        console.log('Disconnected from the WebSocket server');
      });

    } catch (error) {
      // setMessage('');
      console.error('Error sending message:', error);
      alert('Sorry, something has gone horribly wrong! Please try again or refresh the page.');
      props.setRunning(false);
    }
  };

  const handleClearSearch = () => {
    // Clear the search input state
    setState({ value: "", systemPrompt: defaultPrompt });
    // Clear the message history state
    props.setMessageHistory([]);
  };

  const connectionStatus = {
    [ReadyState.CONNECTING]: "Connecting",
    [ReadyState.OPEN]: "Open",
    [ReadyState.CLOSING]: "Closing",
    [ReadyState.CLOSED]: "Closed",
    [ReadyState.UNINSTANTIATED]: "Uninstantiated",
  }[readyState];

  const addMayflowerStyles = () => {
    const stylesheets = [
      "https://unpkg.com/@massds/mayflower-assets@13.1.0/css/global.min.css",
      "https://unpkg.com/@massds/mayflower-assets@13.1.0/css/layout.min.css",
      "https://unpkg.com/@massds/mayflower-assets@13.1.0/css/brand-banner.min.css",
    ];

    stylesheets.forEach((href) => {
      const link = document.createElement("link");
      link.rel = "stylesheet";
      link.href = href;
      document.head.appendChild(link);
    });
  };

  useEffect(() => {
    addMayflowerStyles();
  }, []);

  const selectPrompt = (type: string) => {
    setActiveButton(type);
    switch (type) {
      case 'Farm':
        setState({ ...state, systemPrompt: farmPrompt });
        break;
      case 'Town':
        setState({ ...state, systemPrompt: townPrompt });
        break;
      case 'Nonprofit':
        setState({ ...state, systemPrompt: nonprofitPrompt });
        break;
      case 'Business':
        setState({ ...state, systemPrompt: businessPrompt });
        break;
      default:
        setState({ ...state, systemPrompt: defaultPrompt });
    }
  };

  const typeOptions: SelectProps.Option[] = [
    { label: "Farm", value: "Farm" },
    { label: "Town", value: "Town" },
    { label: "Nonprofit", value: "Nonprofit" },
    { label: "Business", value: "Business" },
    { label: "Other", value: "General" },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column'}}>
      <main style={{ flex: 1, overflowY: 'auto' }}>
        <SpaceBetween direction="vertical" size="xs">
          <Container>
            <div className={`${styles.input_textarea_container} input_textarea_container`}>
              <span style={{ fontFamily: 'Calibri, sans-serif', fontSize: 18, marginRight: '8px' }}>I am a</span>
              <Select
                options={typeOptions}
                selectedOption={selectedType}
                onChange={({ detail }) => {
                  setSelectedType(detail.selectedOption);
                  selectPrompt(detail.selectedOption.value || 'General');
                }}
                placeholder="Select type"
                expandToViewport
              />
              <span style={{ fontFamily: 'Calibri, sans-serif', fontSize: 18, marginLeft: '8px' }}>looking for grants for</span>
              <TextareaAutosize
                className={`${styles.input_textarea} input_textarea`}
                maxRows={6}
                minRows={1}
                spellCheck={true}
                autoFocus
                onChange={(e) => setState((state) => ({ ...state, value: e.target.value }))}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    handleSendMessage();
                  }
                }}
                value={state.value}
                placeholder={"Enter Search ex. \"energy efficiency\""}
              />
              <Button
                disabled={
                  readyState !== ReadyState.OPEN ||
                  props.running ||
                  state.value.trim().length === 0
                }
                onClick={handleSendMessage}
                iconAlign="left"
                iconName={!props.running ? "search" : undefined}
                variant="primary"
              >
                {props.running ? (
                  <>
                    Loading&nbsp;&nbsp;
                    <Spinner />
                  </>
                ) : (
                  "Search"
                )}
              </Button>
              <Button
                onClick={handleClearSearch}
                iconAlign="left"
                iconName="close"
                variant="link"
              >
                Clear
              </Button>
            </div>
          </Container>
          <div className={styles.info_bar}>
            <div style={{ flex: 1, display: 'flex', justifyContent: 'center' }}>
              <div style={{ marginTop: '30px' }}>
                <AIWarning />
              </div>
            </div>
          </div>
        </SpaceBetween>
      </main>
    </div>
  );
}  