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
// import FeedbackTab from "./feedback-tab";
// import FeedbackPanel from "../../components/feedback-panel";
// import { CHATBOT_NAME } from "../../common/constants";
// import { useState } from "react";

// export default function UserFeedbackPage() {
//   const onFollow = useOnFollow();
//   const { tokens } = useTheme();
//   const [feedback, setFeedback] = useState<any>({});
  
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
//               text: "View Feedback",
//               href: "/admin/user-feedback",
//             },
//           ]}
//         />
//       }
//       splitPanel={<FeedbackPanel selectedFeedback={feedback}/>}
//       content={
//         <ContentLayout header={<Header variant="h1">View Feedback</Header>}>
//           <SpaceBetween size="l">
//                 <FeedbackTab updateSelectedFeedback={setFeedback}/>
//           </SpaceBetween>
//         </ContentLayout>
//       }
//     />
//   );
// }
