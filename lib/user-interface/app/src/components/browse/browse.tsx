
import { useContext, useEffect, useState, useRef, SetStateAction } from "react"
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

  const [currentYearActPages, setCurrentYearActPages] = useState<any[]>([]);
  const [currentYearActs, setCurrentYearActs] = useState<any[]>([]);

  const turnPage = useRef(false);

  const [
    selectedYear,
    setSelectedYear
  ] = useState({ label: "2024", value: "2024" });

  const [preferences, setPreferences] = useState({
    pageSize: 10,    
  });

    async function getList(resetPageIndex = false) {
      setLoading(true);    
      const query = selectedYear.value;
      const apiClient = new ApiClient(appContext);
      let results: any[];
      if (resetPageIndex)  {
        results = await apiClient.acts.listActs(query, 0, preferences.pageSize);
      } else {
        results = await apiClient.acts.listActs(query,(currentPageIndex - 1) * preferences.pageSize,preferences.pageSize);
      }    
      if (results.length === 0) {
        setCurrentPageIndex(currentPageIndex - 1)
        setLoading(false);
        return;
      }
      if (resetPageIndex) {
        turnPage.current = false;
        setCurrentPageIndex(1);
        setCurrentYearActPages([results]);
      } else {
        setCurrentYearActPages((prev) => {
          prev[currentPageIndex] = results;
          return prev;
        });
      }
      setCurrentYearActs(results);    
      setLoading(false);
    }

    useEffect(() => {
      console.log(`Current page index changed to ${currentPageIndex}`);
      console.log(`Turning page: ${turnPage.current}`);
      if (turnPage.current) {      
        if (currentYearActPages[currentPageIndex]) {
          setCurrentYearActs(currentYearActPages[currentPageIndex]);   
          turnPage.current = false;   
          return
        } else {
          getList();
          turnPage.current = false;
          return
        }
      } else {
        return
      }
    }, [currentPageIndex]);

    useEffect(() => {
      console.log(`Year changed to ${selectedYear.value}`);    
      getList(true);    
    }, [preferences.pageSize,selectedYear.value]);

  return (
    <div>
      <SpaceBetween size="m">      
      
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
      trackBy="location"
      visibleSections={["content"]}
      empty={
        <Box margin={{ vertical: "xs" }} textAlign="center" color="inherit">
          <b>No results found</b>
        </Box>
      }      
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
          pagesCount={currentYearActPages.length}
          openEnd={true}
          onChange={({ detail }) => {setCurrentPageIndex(detail.currentPageIndex); turnPage.current = true}}
        />
      }
      loading={loading}
      preferences={
        <CollectionPreferences
          title="Preferences"
          confirmLabel="Confirm"
          cancelLabel="Cancel"
          preferences={preferences}
          pageSizePreference={{
            title: "Page size",
            options: [
              { value: 10, label: "10 Acts" },
              { value: 20, label: "20 Acts" },
            ],
          }}
          onConfirm={({ detail }) => setPreferences({pageSize : detail.pageSize})}          
        />
      }
    />   
    </SpaceBetween>
    </div>

    
  )
}