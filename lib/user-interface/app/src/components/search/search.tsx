
import { useState } from "react"
import SearchBar from "./search-bar"
import { Box, Cards, CollectionPreferences, Header, Pagination, SpaceBetween, TextFilter } from "@cloudscape-design/components"

export default function Search() {

  const [searchResults, setSearchResults] = useState<any[]>([])

  const [selectedItems, setSelectedItems] = useState([]);
  const [currentPageIndex, setCurrentPageIndex] = useState(1);

  return (
    <div>
      <SpaceBetween size="m">
      <SearchBar setSearchItems={setSearchResults}/>   

      <Cards
      onSelectionChange={({ detail }) => setSelectedItems(detail.selectedItems)}
      selectedItems={selectedItems}
      ariaLabels={{
        itemSelectionLabel: (e, item) => `select ${item.chapter}`,
        selectionGroupLabel: "Item selection",
      }}
      cardDefinition={{
        header: (item) => (
          
            item.chapter
          
        ),
        sections: [
          {
            id: "content",
            header: "Preview",
            content: (item) => item.content,
          },
        ],
      }}
      cardsPerRow={[{ cards: 1 }, { minWidth: 500, cards: 2 }]}
      items={searchResults}
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
              ? `(${selectedItems.length}/${searchResults.length})`
              : `(${searchResults.length})`
          }
        >
          Results
        </Header>
      }
      pagination={
        <Pagination
          currentPageIndex={currentPageIndex}
          pagesCount={Math.ceil(searchResults.length / 6)}
          onChange={({ detail }) => setCurrentPageIndex(detail.currentPageIndex)}
        />
      }
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