// import {
//   Box,
//   SpaceBetween,
//   Table,
//   Pagination,
//   Button,
//   Header,
//   Modal,
//   Spinner,
// } from "@cloudscape-design/components";
// import { useCallback, useContext, useEffect, useState } from "react";
// import RouterButton from "../../components/wrappers/router-button";
// import { RagDocumentType } from "../../common/types";
// import { TableEmptyState } from "../../components/table-empty-state";
// import { ApiClient } from "../../common/api-client/api-client";
// import { AppContext } from "../../common/app-context";
// // import { getColumnDefinition } from "./columns";
// import { Utils } from "../../common/utils";
// import { useCollection } from "@cloudscape-design/collection-hooks";
// // import { DocumentsResult } from "../../../API";

// export interface DocumentsTabProps {
//   // workspaceId?: string;
//   documentType: RagDocumentType;
// }

// export default function DocumentsTab(props: DocumentsTabProps) {
//   const appContext = useContext(AppContext);
//   const apiClient = new ApiClient(appContext);
//   const [loading, setLoading] = useState(true);
//   const [syncing, setSyncing] = useState(false);
//   const [currentPageIndex, setCurrentPageIndex] = useState(1);
//   const [pages, setPages] = useState<any[]>([]);
//   const [selectedItems, setSelectedItems] = useState<any[]>([]);
//   const [showModalDelete, setShowModalDelete] = useState(false);

//   const { items, collectionProps, paginationProps } = useCollection(pages, {
//     filtering: {
//       empty: (
//         <Box margin={{ vertical: "xs" }} textAlign="center" color="inherit">
//           <SpaceBetween size="m">
//             <b>No sessions</b>
//           </SpaceBetween>
//         </Box>
//       ),
//     },
//     pagination: { pageSize: 5 },
//     sorting: {
//       defaultState: {
//         sortingColumn: {
//           sortingField: "Key",
//         },
//         isDescending: true,
//       },
//     },
//     selection: {},
//   });

//   const getDocuments = useCallback(
//     async (params: { continuationToken?: string; pageIndex?: number }) => {
//       setLoading(true);


//       try {
//         const result = await apiClient.knowledgeManagement.getDocuments(params?.continuationToken, params?.pageIndex)

//         setPages((current) => {
//           if (typeof params.pageIndex !== "undefined") {
//             current[params.pageIndex - 1] = result;
//             return [...current];
//           } else {
//             return [...current, result];
//           }
//         });
//       } catch (error) {
//         console.error(Utils.getErrorMessage(error));
//       }

//       console.log(pages);
//       setLoading(false);
//     },
//     [appContext, props.documentType]
//   );


//   useEffect(() => {
//     getDocuments({});
//   }, [getDocuments]);

//   const onNextPageClick = async () => {
//     const continuationToken = pages[currentPageIndex - 1]?.NextContinuationToken;

//     if (continuationToken) {
//       if (pages.length <= currentPageIndex) {
//         await getDocuments({ continuationToken });
//       }
//       setCurrentPageIndex((current) => Math.min(pages.length + 1, current + 1));
//     }
//   };


//   const onPreviousPageClick = async () => {
//     setCurrentPageIndex((current) =>
//       Math.max(1, Math.min(pages.length - 1, current - 1))
//     );
//   };

//   const refreshPage = async () => {
//     // console.log(pages[Math.min(pages.length - 1, currentPageIndex - 1)]?.Contents!)
//     if (currentPageIndex <= 1) {
//       await getDocuments({ pageIndex: currentPageIndex });
//     } else {
//       const continuationToken = pages[currentPageIndex - 2]?.NextContinuationToken!;
//       await getDocuments({ continuationToken });
//     }
//   };


//   const columnDefinitions = getColumnDefinition(props.documentType);

//   const deleteSelectedFiles = async () => {
//     if (!appContext) return;

//     setLoading(true);
//     setShowModalDelete(false);
//     const apiClient = new ApiClient(appContext);
//     await Promise.all(
//       selectedItems.map((s) => apiClient.knowledgeManagement.deleteFile(s.Key!))
//     );
//     await getDocuments({ pageIndex: currentPageIndex });
//     setSelectedItems([])
//     setLoading(false);
//   };

//   useEffect(() => {
//     if (!appContext) return;
//     const apiClient = new ApiClient(appContext);

//     const getStatus = async () => {
//       try {
//         const result = await apiClient.knowledgeManagement.kendraIsSyncing();
//         setSyncing(result == "STILL SYNCING");
//       } catch (error) {
//         console.error(error);
//       }
//     };

//     const interval = setInterval(getStatus, 5000);
//     getStatus();

//     return () => clearInterval(interval);
//   });

//   const syncKendra = async () => {    
//     if (syncing) {
//       // setSyncing(false)
//       return;
//     }
//     setSyncing(true);
//     try {
//       await apiClient.knowledgeManagement.syncKendra();
      
//     } catch (error) {
//       console.log(error);
//       setSyncing(false)
//     }
//   }

//   return (
//     <><Modal
//       onDismiss={() => setShowModalDelete(false)}
//       visible={showModalDelete}
//       footer={
//         <Box float="right">
//           <SpaceBetween direction="horizontal" size="xs">
//             {" "}
//             <Button variant="link" onClick={() => setShowModalDelete(false)}>
//               Cancel
//             </Button>
//             <Button variant="primary" onClick={deleteSelectedFiles}>
//               Ok
//             </Button>
//           </SpaceBetween>{" "}
//         </Box>
//       }
//       header={"Delete session" + (selectedItems.length > 1 ? "s" : "")}
//     >
//       Do you want to delete{" "}
//       {selectedItems.length == 1
//         ? `file ${selectedItems[0].Key!}?`
//         : `${selectedItems.length} files?`}
//     </Modal>
//       <Table
//         {...collectionProps}
//         loading={loading}
//         loadingText={`Loading files`}
//         columnDefinitions={columnDefinitions}
//         selectionType="multi"
//         onSelectionChange={({ detail }) => {
//           console.log(detail);
//           setSelectedItems(detail.selectedItems);
//         }}
//         selectedItems={selectedItems}
//         items={pages[Math.min(pages.length - 1, currentPageIndex - 1)]?.Contents!}
//         trackBy="Key"
//         header={
//           <Header
//             actions={
//               <SpaceBetween direction="horizontal" size="xs">
//                 <Button iconName="refresh" onClick={refreshPage} />
//                 <RouterButton
//                   // href={`/rag/workspaces/add-data?workspaceId=${props.workspaceId}&tab=${props.documentType}`}
//                   href={`/admin/add-data`}
//                 >
//                   {'Add Files'}
//                 </RouterButton>
//                 <Button
//                   variant="primary"
//                   disabled={selectedItems.length == 0}
//                   onClick={() => {
//                     if (selectedItems.length > 0) setShowModalDelete(true);
//                   }}
//                   data-testid="submit">
//                   Delete
//                 </Button>
//                 <Button
//                   variant="primary"
//                   disabled={syncing}
//                   onClick={() => {
//                     syncKendra();
//                   }}
//                 // data-testid="submit"
//                 >
//                   {syncing ? (
//                     <>
//                       Syncing data...&nbsp;&nbsp;
//                       <Spinner />
//                     </>
//                   ) : (
//                     "Sync data now"
//                   )}
//                 </Button>
//               </SpaceBetween>
//             }
//             description="Please expect a delay for your changes to be reflected. Press the refresh button to see the latest changes."
//           >
//             {"Files"}
//           </Header>
//         }
//         empty={
//           <TableEmptyState
//             resourceName={"File"}
//             // createHref={`/rag/workspaces/add-data?workspaceId=${props.workspaceId}&tab=${props.documentType}`}
//             createHref={`/admin/add-data`}
//             createText={"Add Files"}
//           />
//         }
//         pagination={
//           pages.length === 0 ? null : (
//             <Pagination
//               openEnd={true}
//               pagesCount={pages.length}
//               currentPageIndex={currentPageIndex}
//               onNextPageClick={onNextPageClick}
//               onPreviousPageClick={onPreviousPageClick}
//             />
//           )
//         }
//       />
//     </>
//   );
// }
