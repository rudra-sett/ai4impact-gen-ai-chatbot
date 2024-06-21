import React, { useRef, useState } from 'react';
import { useEffect } from 'react';
import { ColumnLayout, Container, ContentLayout, Header, Link, SpaceBetween, SplitPanel, TextContent, } from '@cloudscape-design/components';
import { Auth } from 'aws-amplify';
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import styles from "../styles/chat.module.scss";

export interface FeedbackPanelProps {  
  selectedFeedback : any;
}

export default function EmailPanel(props: FeedbackPanelProps) {

  useEffect(() => {
    console.log(props.selectedFeedback)
  }, [props.selectedFeedback]);

  return (
    <div>
        <SplitPanel header="Selected Feedback">
          <ColumnLayout columns={2}>
            <SpaceBetween size="m">
            <Container
                header={
                  <Header
                    variant="h2"                  
                  >
                    User Prompt
                  </Header>
                }
              >
                {props.selectedFeedback.UserPrompt? props.selectedFeedback.UserPrompt : "No feedback selected"}
              </Container>
              
              <Container
                header={
                  <Header
                    variant="h2"                  
                  >
                    User Comments
                  </Header>
                }
              >
                {props.selectedFeedback.FeedbackComments? props.selectedFeedback.FeedbackComments : "No feedback selected"}
              </Container>             
            </SpaceBetween> 
            <Container
                header={
                  <Header
                    variant="h2"                  
                  >
                    Chatbot Response
                  </Header>
                }
              >
                {props.selectedFeedback.ChatbotMessage? props.selectedFeedback.ChatbotMessage : "No feedback selected"}
              </Container>             
            </ColumnLayout>
        </SplitPanel>
      </div>
  );
}