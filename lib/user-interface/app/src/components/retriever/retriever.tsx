import { useContext, useEffect, useState } from "react";

import { SpaceBetween, StatusIndicator, Alert, ColumnLayout, Input, Button, TextContent, Box } from "@cloudscape-design/components";
import { AppContext } from "../../common/app-context";
import { ApiClient } from "../../common/api-client/api-client";
import styles from "../../styles/chat.module.scss";

export default function Retrieve(props: {
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

      return (
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
          <div className={styles.centered_input} >
          <div className={styles.input_container} >
            <SpaceBetween direction="horizontal" size="m">
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
        </div>
      );
  }  
