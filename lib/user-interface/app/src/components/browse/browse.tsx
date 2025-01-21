
import { useContext, useEffect, useState } from "react"
import { Box, Cards, CollectionPreferences, Header, Pagination, Select, SpaceBetween, TextFilter } from "@cloudscape-design/components"
import { Link } from "react-router-dom";

import { ApiClient } from "../../common/api-client/api-client";
import { AppContext } from "../../common/app-context";

export default function Browse(props: {  
  sessionId: string,
  changeTab: React.Dispatch<React.SetStateAction<string>>    
}) {  

  const [selectedItems, setSelectedItems] = useState([]);
  const [currentPageIndex, setCurrentPageIndex] = useState(1);

  const [loading, setLoading] = useState<boolean>(false);  
  const appContext = useContext(AppContext);

  const [currentYearActs, setCurrentYearActs] = useState<any[]>([]);

  const [
    selectedYear,
    setSelectedYear
  ] = useState({ label: "2024", value: "2024" });


  async function getList() {
    setLoading(true);
    const query = selectedYear.value;
    const apiClient = new ApiClient(appContext);
    const results = await apiClient.acts.listActs(query);
    setCurrentYearActs(results);
    setLoading(false);
  }

  useEffect(() => {
    getList();
  }, [selectedYear]);

  return (
    <div>
      <SpaceBetween size="m">
      {/* <SearchBar setSearchItems={props.setSearchResults}/>    */}
      
      <Select
      selectedOption={selectedYear}
      onChange={({ detail }) => {
        setSelectedYear({label: detail.selectedOption.label, value: detail.selectedOption.value});        
        }
      }      
      options={Array.from({ length: 2024 - 1780 + 1 }, (_, i) => {
        const year = (1780 + i).toString();
        return { label: year, value: year };
      })}
    />

      <Cards
      onSelectionChange={({ detail }) => setSelectedItems(detail.selectedItems)}
      selectedItems={selectedItems}
      ariaLabels={{
        itemSelectionLabel: (e, item) => `select ${item.chapter}`,
        selectionGroupLabel: "Item selection",
      }}
      cardDefinition={{
        header: (item) => (
          
          <Link onClick={() => { props.changeTab("chat")}} to={`/chatbot/playground/${props.sessionId}/${item.year}/${item.chapter_number}`}>
                  {item.name}
                  
              </Link>            
          
        ),
        sections: [
          {
            id: "content",
            header: "Preview",
            content: (item) => item.preview,
          },
        ],
      }}
      cardsPerRow={[{ cards: 1 }, { minWidth: 500, cards: 2 }]}
      items={currentYearActs}
      loadingText="Loading results"
      // selectionType="multi"
      trackBy="location"
      visibleSections={["content"]}
      empty={
        <Box margin={{ vertical: "xs" }} textAlign="center" color="inherit">
          <b>No results found</b>
        </Box>
      }
      // filter={<TextFilter filteringText={""} filteringPlaceholder="Search results" />}
      header={
        <Header
          counter={
            selectedItems.length
              ? `(${selectedItems.length}/${currentYearActs.length})`
              : `(${currentYearActs.length})`
          }
        >
          Results
        </Header>
      }
      pagination={
        <Pagination
          currentPageIndex={currentPageIndex}
          pagesCount={Math.ceil(currentYearActs.length / 6)}
          onChange={({ detail }) => setCurrentPageIndex(detail.currentPageIndex)}
        />
      }
      loading={loading}
      preferences={
        <CollectionPreferences
          title="Preferences"
          confirmLabel="Confirm"
          cancelLabel="Cancel"
          preferences={{
            pageSize: 6,
            // visibleContent: ["description"],
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
          //       options: [{ id: "description", label: " Description" }],
          //     },
          //   ],
          // }}
        />
      }
    />   
    </SpaceBetween>
    </div>

    
  )
}