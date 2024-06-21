// import {
//   BreadcrumbGroup,
//   ContentLayout,
//   Header,
//   SpaceBetween,
// } from "@cloudscape-design/components";
// import {
//   Authenticator,
//   Heading,
//   useTheme,
// } from "@aws-amplify/ui-react";
// import BaseAppLayout from "../../components/base-app-layout";
// import useOnFollow from "../../common/hooks/use-on-follow";
// import DataFileUpload from "./data-file-upload";
// import { CHATBOT_NAME } from "../../common/constants";

// export default function AddData() {
//   const onFollow = useOnFollow();
//   const { tokens } = useTheme();
  
//   return (
//     <Authenticator hideSignUp={true}
//     components={{
//       SignIn: {
//         Header: () => {
//           return (
//             <Heading
//               padding={`${tokens.space.xl} 0 0 ${tokens.space.xl}`}
//               level={3}
//             >
//               {CHATBOT_NAME}
//             </Heading>
//           );
//         },
//       },
//     }}>
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
//               text: "Add Data",
//               href: "/admin/add-data",
//             },
//           ]}
//         />
//       }
//       content={
//         <ContentLayout header={<Header variant="h1">Add Data</Header>}>
//           <SpaceBetween size="l">
//                         <DataFileUpload                                           
//                       />
//           </SpaceBetween>
//         </ContentLayout>
//       }
//     />
//     </Authenticator>
//   );
// }
