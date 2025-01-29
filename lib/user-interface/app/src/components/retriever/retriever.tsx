import { Dispatch, memo, SetStateAction, useContext, useEffect, useState } from "react";

import { SpaceBetween, StatusIndicator, Alert, ColumnLayout, Input, Button, TextContent, Box, SelectProps, Modal, Select, Spinner } from "@cloudscape-design/components";
import { AppContext } from "../../common/app-context";
import { ApiClient } from "../../common/api-client/api-client";
import styles from "../../styles/chat.module.scss";
import { useNotifications } from "../notif-manager";

import TextareaAutosize from "react-textarea-autosize";

export default function Retrieve(props: {
  sessionId?: string,
  setAmendments: React.Dispatch<React.SetStateAction<any[]>>,
  setLoading: React.Dispatch<React.SetStateAction<boolean>>,
  chapter: string,
  year: string,
  actText: string,
  setActText: React.Dispatch<React.SetStateAction<string>>
  changeAct: (year: string, chapter: string) => void
  showConformed: boolean
  amendmentList: any[]
  applyAmendment: (amendingYear: string, amendingChapter: string) => Promise<void>
  originalActText: string
  insertionLoading: boolean
}) {
  const appContext = useContext(AppContext);
  const apiClient = new ApiClient(appContext);

  const [year, setYear] = useState(props.year);
  const [act, setAct] = useState(props.chapter);
  const [actLoading, setActLoading] = useState(false);

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

  const [
    selectedOption,
    setSelectedOption
  ] = useState(null);

  const [options, setOptions] = useState<SelectProps.Option[]>([]);

  useEffect(() => {
    let processedAmendmentList = Array.from(new Set(props.amendmentList.map((amendment) => amendment.amending_act))).map((amending_act) => ({
      label: 'As amended by: ' + amending_act,
      value: amending_act,
    })).reverse()

    if (processedAmendmentList.length > 0) {
      setOptions(processedAmendmentList)
      setSelectedOption(processedAmendmentList[0])
      props.applyAmendment(processedAmendmentList[0].value.split(" ").slice(-1)[0], processedAmendmentList[0].value.split(" ")[1])
    }

  }, [props.amendmentList]);


  const { notifications, addNotification } = useNotifications();

  function showFlashMessage(
    type: "info" | "success" | "warning" | "error",
    content: React.ReactNode,
    duration = 3000
  ) {
    addNotification(type, content.toString());
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

  const FeedbackModal = memo(({
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
              fontSize: "1rem",
              fontFamily: "Arial, sans-serif",
              borderColor: "#ccc",
              resize: "none"
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

  const FeedbackTab = memo(({ onFeedbackDown, onFeedbackUp }: FeedbackTabProps) => {
    return (
      <div style={{
        display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center", textAlign: "center"
      }}>
        <div style={{
          // border: "0.01rem outset #000716",
          borderRadius: "10px",
          display: "inline-block",
          padding: "4px 8px",
          flexDirection: "column",
          justifyContent: "center",
          alignItems: "center",
          textAlign: "center",

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


  return (
    <div>
      <ColumnLayout columns={props.showConformed ? 2 : 1} variant="text-grid">
        <div className={styles.chat_container}>
          {actLoading ? (
            <Box textAlign="center">
              <StatusIndicator type="loading">Loading law</StatusIndicator>
            </Box>
          ) : (
            <Box textAlign="center">
              <TextContent>
                {props.originalActText}
              </TextContent>
            </Box>
          )}
        </div>
        {props.showConformed && (
          <SpaceBetween size="m">
            <Select
              selectedOption={selectedOption}
              onChange={({ detail }) => {
                setSelectedOption(detail.selectedOption)
                props.applyAmendment(detail.selectedOption.value.split(" ").slice(-1)[0], detail.selectedOption.value.split(" ")[1])
              }}
              options={options}
              placeholder="Select an amendment"
              empty="No amendments available"
            />
            <div className={styles.chat_container}>
              <Box textAlign="center">
                {props.insertionLoading ? (
                  <StatusIndicator type="loading">Loading amended copy</StatusIndicator>
                ) : (
                <TextContent>
                  <div dangerouslySetInnerHTML={{ __html: props.actText }} />
                </TextContent>
                )}
              </Box>
              <Box textAlign="center" margin={{ top: "m" }}>
                {`This conformed version of Chapter ${props.chapter} of the Acts of ${props.year} was partially generated using Generative AI. Please verify all information.`}
              </Box>
            </div>
          </SpaceBetween>
        )}

      </ColumnLayout>
      <div style={{ marginTop: "1rem", textAlign: "center" }}>
        <FeedbackContainer
          apiClient={apiClient}
          showFlashMessage={showFlashMessage}
        />
      </div>
      <div className={styles.retrieval_input_container} >
        <div className={styles.centered_input}>
          <SpaceBetween direction="horizontal" size="m">
            <div>
              <label htmlFor="year-input" style={{ marginLeft: "1px", fontWeight: "bold" }}>Year</label>
              <Input
                id="year-input"
                onChange={({ detail }) => setYear(detail.value)}
                value={year}
                placeholder="Year"
              />
            </div>
            <div>
              <label htmlFor="chapter-input" style={{ marginLeft: "1px", fontWeight: "bold" }}>Chapter</label>
              <Input
                id="chapter-input"
                onChange={({ detail }) => setAct(detail.value)}
                value={act}
                placeholder="Chapter"
              />
            </div>
            <div style={{ alignContent: "end", height: "100%" }}>
              <Button variant="primary" onClick={getAct}>
                Retrieve
              </Button>
            </div>
          </SpaceBetween>
        </div>
      </div>
    </div>
  );
}  
