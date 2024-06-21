// import {
//   BreadcrumbGroup,
//   ContentLayout,
//   Header,
//   SpaceBetween,
// } from "@cloudscape-design/components";
// import useOnFollow from "../../common/hooks/use-on-follow";
// import BaseAppLayout from "../../components/base-app-layout";
// import DocumentsTab from "./documents-tab";
// import { CHATBOT_NAME } from "../../common/constants";

// export default function WorkspacePane() {
//   const onFollow = useOnFollow();

//   return (
//     <BaseAppLayout
//       contentType="cards"
//       breadcrumbs={
//         <BreadcrumbGroup
//           onFollow={onFollow}
//           items={[
//             {
//               text: CHATBOT_NAME,
//               href: "/",
//             },
//             {
//               text: "View Data",
//               href: "/admin/data",
//             },            
//           ]}
//         />
//       }
//       content={
//         <ContentLayout
//           header={
//             <Header
//               variant="h1"
//             >
//               Data Dashboard
//             </Header>
//           }
//         >
//           <SpaceBetween size="l">
//             <DocumentsTab              
//               documentType="file"
//             />
//           </SpaceBetween>
//         </ContentLayout>
//       }
//     />
//   );
// }
