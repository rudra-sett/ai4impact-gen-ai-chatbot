import {
  Box,
  Button,
  Container,
  Popover,
  Spinner,
  StatusIndicator,
  TextContent,
  SpaceBetween,
  ButtonDropdown,
  Modal,
  FormField,
  Input,
  Select
} from "@cloudscape-design/components";
import * as React from "react";
import { useState } from 'react';
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import styles from "../../styles/chat.module.scss";
import {
  ChatBotConfiguration,
  ChatBotHistoryItem,
  ChatBotMessageType,
} from "./types";


import "react-json-view-lite/dist/index.css";
import "../../styles/app.scss";
import { useNotifications } from "../notif-manager";
import { Utils } from "../../common/utils";
import {feedbackCategories, feedbackTypes} from '../../common/constants'

export interface ChatMessageProps {
  message: ChatBotHistoryItem;  
  onThumbsUp: () => void;
  onThumbsDown: (feedbackTopic : string, feedbackType : string, feedbackMessage: string) => void;
  onSendEmail: () => void;
  isLastMessage: boolean;
}



export default function ChatMessage(props: ChatMessageProps) {
  const [loading, setLoading] = useState<boolean>(false);
  const [selectedIcon, setSelectedIcon] = useState<1 | 0 | null>(null);
  const { addNotification, removeNotification } = useNotifications();
  const [modalVisible, setModalVisible] = useState(false);
  const [selectedTopic, setSelectedTopic] = React.useState({label: "Select a Topic", value: "1"});
  const [selectedFeedbackType, setSelectedFeedbackType] = React.useState({label: "Select a Problem", value: "1"});
  const [value, setValue] = useState("");


  const content =
    props.message.content && props.message.content.length > 0
      ? props.message.content
      : "";

  const showSources = props.message.metadata?.Sources && (props.message.metadata.Sources as any[]).length > 0;
  

  return (
    <div>
      <Modal
      onDismiss={() => setModalVisible(false)}
      visible={modalVisible}
      footer={
        <Box float = "right">
          <SpaceBetween direction="horizontal" size="xs">
            <Button variant="link" onClick={() => {
              setModalVisible(false)
            setValue("")
            setSelectedTopic({label: "Select a Topic", value: "1"})
            setSelectedFeedbackType({label: "Select a Topic", value: "1"})
            }}
            >Cancel</Button>
            <Button variant="primary" onClick={() => {
              if (!selectedTopic.value || !selectedFeedbackType.value || selectedTopic.value === "1" || selectedFeedbackType.value === "1" || value.trim() === "") {
                const id = addNotification("error","Please fill out all fields.")
                Utils.delay(3000).then(() => removeNotification(id));
                return;
              } else {
              setModalVisible(false)
              setValue("")

              const id = addNotification("success","Your feedback has been submitted.")
              Utils.delay(3000).then(() => removeNotification(id));
              
              props.onThumbsDown(selectedTopic.value, selectedFeedbackType.value,value.trim());
              setSelectedIcon(0);

              setSelectedTopic({label: "Select a Topic", value: "1"})
              setSelectedFeedbackType({label: "Select a Problem", value: "1"})
              
              
            }}}>Ok</Button>
          </SpaceBetween>
        </Box>
      }
      header="Provide Feedback"
      >
        <SpaceBetween size="xs">
        <Select
        selectedOption = {selectedTopic}
        onChange = {({detail}) => setSelectedTopic({label: detail.selectedOption.label,value: detail.selectedOption.value})}
        options ={feedbackCategories}
        />
        <Select
        selectedOption = {selectedFeedbackType}
        onChange = {({detail}) => setSelectedFeedbackType({label: detail.selectedOption.label,value: detail.selectedOption.value})}
        options ={feedbackTypes}
        />
        <FormField label="Please enter feedback here">
          <Input
          onChange={({detail}) => setValue(detail.value)}
          value={value}
          />
        </FormField>
        </SpaceBetween>
      </Modal>
      {props.message?.type === ChatBotMessageType.AI && (
        <Container
          footer={
            showSources && (
              <SpaceBetween direction="horizontal" size="s">
              <ButtonDropdown
              items={(props.message.metadata.Sources as any[]).map((item) => { return {id: "id", disabled: false, text : item.title, href : item.uri, external : true, externalIconAriaLabel: "(opens in new tab)"}})}
        
              >Sources</ButtonDropdown>
              {props.isLastMessage?
              <Button onClick={() => {
                   props.onSendEmail()
                  }}>Generate Email</Button> : <></>}
              </SpaceBetween>
            )
          }
        >
          {content?.length === 0 ? (
            <Box>
              <Spinner />
            </Box>
          ) : null}
          {props.message.content.length > 0 ? (
            <div className={styles.btn_chabot_message_copy}>
              <Popover
                size="medium"
                position="top"
                triggerType="custom"
                dismissButton={false}
                content={
                  <StatusIndicator type="success">
                    Copied to clipboard
                  </StatusIndicator>
                }
              >
                <Button
                  variant="inline-icon"
                  iconName="copy"
                  onClick={() => {
                    navigator.clipboard.writeText(props.message.content);
                  }}
                />
              </Popover>
            </div>
          ) : null}
          <ReactMarkdown
            children={content}
            remarkPlugins={[remarkGfm]}
            components={{
              pre(props) {
                const { children, ...rest } = props;
                return (
                  <pre {...rest} className={styles.codeMarkdown}>
                    {children}
                  </pre>
                );
              },
              table(props) {
                const { children, ...rest } = props;
                return (
                  <table {...rest} className={styles.markdownTable}>
                    {children}
                  </table>
                );
              },
              th(props) {
                const { children, ...rest } = props;
                return (
                  <th {...rest} className={styles.markdownTableCell}>
                    {children}
                  </th>
                );
              },
              td(props) {
                const { children, ...rest } = props;
                return (
                  <td {...rest} className={styles.markdownTableCell}>
                    {children}
                  </td>
                );
              },
            }}
          />
          <div className={styles.thumbsContainer}>
            {(selectedIcon === 1 || selectedIcon === null) && (
              <Button
                variant="icon"
                iconName={selectedIcon === 1 ? "thumbs-up-filled" : "thumbs-up"}
                onClick={() => {
                  props.onThumbsUp();
                  const id = addNotification("success","Thank you for your valuable feedback!")
                  Utils.delay(3000).then(() => removeNotification(id));
                  setSelectedIcon(1);
                }}
              />
            )}
            {(selectedIcon === 0 || selectedIcon === null) && (
              <Button
                iconName={
                  selectedIcon === 0 ? "thumbs-down-filled" : "thumbs-down"
                }
                variant="icon"
                onClick={() => {
                  // props.onThumbsDown();
                  // setSelectedIcon(0);
                  setModalVisible(true);
                }}
              />
            )}
          </div>
        </Container>
      )}
      {loading && (
        <Box float="left">
          <Spinner />
        </Box>
      )}      
      {props.message?.type === ChatBotMessageType.Human && (
        <TextContent>
          <strong>{props.message.content}</strong>
        </TextContent>
      )}
    </div>
  );
}