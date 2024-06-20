import {
  BreadcrumbGroup,
  ContentLayout,
  Header,
  SpaceBetween,
  Alert
} from "@cloudscape-design/components";
import {
  Authenticator,
  Heading,
  useTheme,
} from "@aws-amplify/ui-react";
import BaseAppLayout from "../../components/base-app-layout";
import useOnFollow from "../../common/hooks/use-on-follow";
import FeedbackTab from "./feedback-tab";
import FeedbackPanel from "../../components/feedback-panel";
import { CHATBOT_NAME } from "../../common/constants";
import { useState, useEffect } from "react";
import { Auth } from "aws-amplify";


export default function UserFeedbackPage() {
  const onFollow = useOnFollow();  
  const [feedback, setFeedback] = useState<any>({});
  const [admin, setAdmin] = useState<boolean>(false);

  /** Check if the signed-in user is an admin */
  useEffect(() => {
    (async () => {
      const result = await Auth.currentAuthenticatedUser();
      // console.log(result);  
      if (!result || Object.keys(result).length === 0) {
        console.log("Signed out!")
        Auth.signOut();
        return;
      }

      try {
        const result = await Auth.currentAuthenticatedUser();
        const admin = result?.signInUserSession?.idToken?.payload["custom:role"]
        if (admin) {
          const data = JSON.parse(admin);
          if (data.includes("Admin")) {
            setAdmin(true);
          }
        }
      }
      catch (e){
        // const userName = result?.attributes?.email;
        console.log(e);
      }
    })();
  }, []);

  /** If they are not an admin, show a page indicating so */
  if (!admin) {
    return (
      <div
        style={{
          height: "90vh",
          width: "100%",
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
        }}
      >
        <Alert header="Configuration error" type="error">
          You are not authorized to view this page!
        </Alert>
      </div>
    );
  }

  return (    
    <BaseAppLayout
      contentType="cards"
      breadcrumbs={
        <BreadcrumbGroup
          onFollow={onFollow}
          items={[
            {
              text: CHATBOT_NAME,
              href: "/",
            },

            {
              text: "View Feedback",
              href: "/admin/user-feedback",
            },
          ]}
        />
      }
      splitPanel={<FeedbackPanel selectedFeedback={feedback}/>}
      content={
        <ContentLayout header={<Header variant="h1">View Feedback</Header>}>
          <SpaceBetween size="l">
                <FeedbackTab updateSelectedFeedback={setFeedback}/>
          </SpaceBetween>
        </ContentLayout>
      }
    />
  );
}
