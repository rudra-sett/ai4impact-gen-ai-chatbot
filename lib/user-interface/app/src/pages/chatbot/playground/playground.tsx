import BaseAppLayout from "../../../components/base-app-layout";
import Chat from "../../../components/chatbot/chat";

import { useParams, useNavigate,Link } from "react-router-dom";
import { Header, Cards, CollectionPreferences, Box,Pagination, Spinner, Tabs } from "@cloudscape-design/components";
import { useState } from 'react'
import Search from "../../../components/search/search";
import useOnFollow from "../../../common/hooks/use-on-follow";

export default function Playground() {
  const { sessionId, chapter, year } = useParams();
  const navigate = useNavigate();
  const onFollow = useOnFollow();
  
  const [amendments, setAmendments] = useState([])
  const [searchResults, setSearchResults] = useState([])

  const [selectedItems, setSelectedItems] = useState([]);
  const [currentPageIndex, setCurrentPageIndex] = useState(1);

  const [loading, setLoading] = useState(false);

  const [activeTab, setActiveTab] = useState("chat");
  

  const changeActPage = (year : string, chapter : string) => {
    navigate(`/chatbot/playground/${sessionId}/${year}/${chapter}`)    
  };

  const [activeHref, setActiveHref] = useState(
    window.location.pathname
  );


  return (
    <BaseAppLayout
      info={
        <Cards
          onSelectionChange={({ detail }) => setSelectedItems(detail.selectedItems)}
          selectedItems={selectedItems}
          ariaLabels={{
            itemSelectionLabel: (e, item) => `select ${item.amending_act}`,
            selectionGroupLabel: "Item selection",
          }}
          cardDefinition={{
            header: (item) => (
              <Link to={`/chatbot/playground/${sessionId}/${item.amending_act.split(" ").slice(-1)}/${item.amending_act.split(" ")[1]}`}>
                  {item.amending_act}
              </Link>
            ),
            sections: [
              {
                id: "description",
                header: "Amendment Description",
                content: (item) => item.amendment_description,
              },
            ],
          }}
          cardsPerRow={[{ cards: 1 }, { minWidth: 500, cards: 2 }]}
          items={amendments}
          loadingText="Loading amendments..."
          // selectionType="multi"
          trackBy="amending_act"
          visibleSections={["description"]}
          loading={loading}
          empty={
            <Box margin={{ vertical: "xs" }} textAlign="center" color="inherit">
              <b>No amendments found</b>
            </Box>
          }
          // filter={<TextFilter filteringPlaceholder="Search amendments" />}
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
          // pagination={
          //   <Pagination
          //     currentPageIndex={currentPageIndex}
          //     pagesCount={Math.ceil(amendments.length / 6)}
          //     onChange={({ detail }) => setCurrentPageIndex(detail.currentPageIndex)}
          //   />
          // }
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
              // visibleContentPreference={{
              //   title: "Select visible content",
              //   options: [
              //     {
              //       label: "Card content",
              //       options: [{ id: "description", label: "Amendment Description" }],
              //     },
              //   ],
              // }}
            />
          }
        />
      }
      toolsWidth={300}
      content={
        <div>
          {/* <Chat sessionId={sessionId} /> */}
          <Tabs
        tabs={[
          { label: "Chat",
            id: "chat",
            content:( <Chat sessionId={sessionId} setAmendments={setAmendments} setLoading={setLoading} chapter={chapter} year={year} changeAct={changeActPage}/>)
          },
          {
            label: "Search",
            id: "search",
            content : (<Search sessionId={sessionId} searchResults={searchResults} setSearchResults={setSearchResults}/>)
          }
        ]}
        activeTabId={activeTab}
              onChange={({ detail: { activeTabId } }) => {
                setActiveTab(activeTabId);}}
                />        
        </div>
      }
    />
  );
}
