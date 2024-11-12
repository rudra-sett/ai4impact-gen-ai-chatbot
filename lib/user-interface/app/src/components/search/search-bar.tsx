import { Button, Container, SpaceBetween, Spinner } from "@cloudscape-design/components";
import { Dispatch, SetStateAction, useContext, useState } from "react";
import TextareaAutosize from "react-textarea-autosize";

import { ApiClient } from "../../common/api-client/api-client";
import { AppContext } from "../../common/app-context";

import styles from "../../styles/chat.module.scss";


export interface SearchBarProps {  
  setSearchItems: Dispatch<SetStateAction<any[]>>;  
}



export default function SearchBar(props: SearchBarProps){

  const [state, setState] = useState<string>('');

  const appContext = useContext(AppContext);
  
  async function search() {
    const query = state;
    const apiClient = new ApiClient(appContext);
    const results = await apiClient.acts.searchLaws(query);
    props.setSearchItems(results);
  }
  return (
    <SpaceBetween direction="vertical" size="l">
      <Container>
        <div className={styles.input_textarea_container}>
          <SpaceBetween size="xxs" direction="horizontal" alignItems="center">            
          </SpaceBetween>          
          <TextareaAutosize
            className={styles.input_textarea}
            maxRows={6}
            minRows={1}
            spellCheck={true}
            autoFocus
            onChange={(e) =>
              setState(e.target.value)
            }
            onKeyDown={(e) => {
              if (e.key == "Enter" && !e.shiftKey) {
                e.preventDefault();
                search();
              }
            }}
            value={state}
            placeholder={"Search Session Laws"}
          />
          <div style={{ marginLeft: "8px" }}>            
            <Button
              disabled={                
                // props.running ||
                state.trim().length === 0             
              }
              onClick={search}
              iconAlign="right"
              // iconName={!props.running ? "angle-right-double" : undefined}
              variant="primary"
            >
              Search
              {/* {props.running ? (
                <>
                  Loading&nbsp;&nbsp;
                  <Spinner />
                </>
              ) : (
                "Search"
              )} */}
            </Button>
          </div>
        </div>
      </Container>      
    </SpaceBetween>
  );
}