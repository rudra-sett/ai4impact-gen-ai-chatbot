import BaseAppLayout from "../../../components/base-app-layout";
import Chat from "../../../components/chatbot/chat";

import { useParams, useNavigate, Link } from "react-router-dom";
import { Header, Cards, CollectionPreferences, Box, Tabs, Button, StatusIndicator, SpaceBetween } from "@cloudscape-design/components";
import { useState, useContext, useEffect } from "react";
import Search from "../../../components/search/search";
import useOnFollow from "../../../common/hooks/use-on-follow";
import { ApiClient } from "../../../common/api-client/api-client";
import { AppContext } from "../../../common/app-context";
import diff_match_patch from "diff-match-patch";
import Browse from "../../../components/browse/browse";
import Retrieve from "../../../components/retriever/retriever";

export default function Playground() {
  const { sessionId, chapter, year } = useParams();
  const navigate = useNavigate();
  const onFollow = useOnFollow();
  const appContext = useContext(AppContext);

  const [amendments, setAmendments] = useState<any[]>([]);
  const [searchResults, setSearchResults] = useState([]);

  // this contains the displayed HTML version which has highlighting
  const [actText, setActText] = useState("Enter a chapter and year to retrieve an Act");
  // this is a copy of the current version of the act with no highlighting or HTML
  const [cleanCurrentText, setCleanCurrentText] = useState('');
  // the is a copy of the original version of the act to generate diffs based off of
  const [originalActText, setOriginalActText] = useState("Enter a chapter and year to retrieve an Act");

  const [selectedItems, setSelectedItems] = useState([]);

  const [loading, setLoading] = useState(false);
  const [insertionLoading, setInsertionLoading] = useState(false);

  const [activeTab, setActiveTab] = useState("retrieve");

  const [showConformed, setShowConformed] = useState(false);

  const dmp = new diff_match_patch();

  useEffect(() => {
    if (!appContext || !year || !chapter) return;
    (async () => {
      setLoading(true);
      const apiClient = new ApiClient(appContext);
      try {
        const text = await apiClient.acts.getAct(year, chapter);
        setActText(text);
        setOriginalActText(text); // Keep a copy of the original text as a baseline for first load
        setCleanCurrentText(text);
        // Get amendments for this Act
        const amends = await apiClient.acts.getAmendments(year, chapter);
        (amends as any[]).sort((a, b) => {
          const yearA = parseInt(a.amending_act.match(/of (\d{4})/)[1], 10);
          const yearB = parseInt(b.amending_act.match(/of (\d{4})/)[1], 10);
          return yearA - yearB;
        });
        setAmendments(amends as any[]);
      } catch (e) {
        console.error("Error loading act or amendments:", e);
      }
      setLoading(false);
    })();
  }, [appContext, year, chapter]);

  const changeActPage = (year: string, chapter: string) => {
    navigate(`/chatbot/playground/${sessionId}/${year}/${chapter}`)
  };

  const applyAmendment = async (amendingYear: string, amendingChapter: string) => {
    if (!appContext || !year || !chapter) return;
    const apiClient = new ApiClient(appContext);
    setInsertionLoading(true);
    try {
      let conformed = await apiClient.acts.insertAmendment(year, chapter, amendingYear, amendingChapter,cleanCurrentText);
      // Here we do a diff between the old text and the newly conformed text
      const diffs = dmp.diff_main(originalActText, conformed);
      setCleanCurrentText(conformed)
      dmp.diff_cleanupSemantic(diffs);
      const highlightedHtml = highlightDiff(diffs);
      setActText(highlightedHtml);
    } catch (e) {
      console.error(e);
    }
    setInsertionLoading(false);
  }

  /**
   * Converts a list of diffs into HTML with insertions highlighted in green and deletions in red.
   * Unchanged text remains normal.
   */
  const highlightDiff = (diffs: [number, string][]): string => {
    return diffs
      .map(([op, data]) => {
        switch (op) {
          case diff_match_patch.DIFF_INSERT:
            return `<span style="background-color: #d4edda;">${escapeHtml(data)}</span>`;
          case diff_match_patch.DIFF_DELETE:
            return `<span style="background-color: #f8d7da; text-decoration: line-through;">${escapeHtml(data)}</span>`;
          case diff_match_patch.DIFF_EQUAL:
          default:
            return escapeHtml(data);
        }
      })
      .join("");
  };

  const escapeHtml = (str: string) => {
    return str.replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  };

  return (
    <BaseAppLayout
      info={
        <SpaceBetween size="s">
          <Box textAlign="center" margin={{ top: "xxxl" }}>
            <Button onClick={() => {setShowConformed(!showConformed)}}>
              {showConformed ? "Hide Conformed Version" : "Show Conformed Version"}
            </Button>
          </Box>
        <Cards
          onSelectionChange={({ detail }) => setSelectedItems(detail.selectedItems)}
          selectedItems={selectedItems}
          ariaLabels={{
            itemSelectionLabel: (e, item) => `select ${item.amending_act}`,
            selectionGroupLabel: "Item selection",
          }}
          cardDefinition={{
            header: (item) => (
              <Link
                to={`/chatbot/playground/${sessionId}/${item.amending_act.split(" ").slice(-1)}/${item.amending_act.split(" ")[1]}`}>
                {item.amending_act}
              </Link>
            ),
            sections: [
              {
                id: "description",
                header: "Amendment Description",
                content: (item) => item.amendment_description,
              }              
            ],
          }}
          cardsPerRow={[{ cards: 1 }, { minWidth: 500, cards: 2 }]}
          items={amendments}
          loadingText="Loading amendments..."
          trackBy="amending_act"
          visibleSections={["description", "tools"]}
          loading={loading}
          empty={
            <Box margin={{ vertical: "xs" }} textAlign="center" color="inherit">
              <b>No amendments found</b>
            </Box>
          }
          header={
            <Header
              counter={
                selectedItems.length
                  ? `(${selectedItems.length}/${amendments.length})`
                  : `(${amendments.length})`
              }
            >
              Amendments
            </Header>
          }
          preferences={
            <CollectionPreferences
              title="Preferences"
              confirmLabel="Confirm"
              cancelLabel="Cancel"
              preferences={{
                pageSize: 6,
                visibleContent: ["description"],
              }}
              pageSizePreference={{
                title: "Page size",
                options: [
                  { value: 6, label: "6 items" },
                  { value: 12, label: "12 items" },
                ],
              }}
            />
          }
        />
        </SpaceBetween>
      }
      toolsWidth={300}
      content={
        <div>
          <Tabs
            tabs={[
      
              {
                label: "Retrieve",
                id: "retrieve",
                content: (
                  <Retrieve
                    originalActText={originalActText}
                    actText={actText}
                    setActText={setActText}
                    sessionId={sessionId}
                    setAmendments={setAmendments}
                    setLoading={setLoading}
                    chapter={chapter}
                    year={year}
                    changeAct={changeActPage}
                    showConformed={showConformed}
                    amendmentList={amendments}
                    applyAmendment={applyAmendment}
                    insertionLoading={insertionLoading}
                  />
                )
              },
        
              {
                label: "Search",
                id: "search",
                content: (
                  <Search
                    sessionId={sessionId}
                    searchResults={searchResults}
                    setSearchResults={setSearchResults}
                    changeTab={setActiveTab}
                  />
                )
              },
              {
                label: "Browse",
                id: "browse",
                content: (
                  <Browse sessionId={sessionId} changeTab={setActiveTab}/>                  
                )
              },
              {
                label: "Chat",
                id: "chat",
                content: (
                  <Chat
                    //actText={actText}
                    //setActText={setActText}
                    sessionId={sessionId}
                    //setAmendments={setAmendments}
                    //setLoading={setLoading}
                    //chapter={chapter}
                    //year={year}
                    //changeAct={changeActPage}
                  />
                )
              }
            
  
            ]}
            activeTabId={activeTab}
            onChange={({ detail: { activeTabId } }) => {
              setActiveTab(activeTabId);
            }}
          />
        </div>
      }
    />
  );
}
