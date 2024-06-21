import BaseAppLayout from "../../../components/base-app-layout";
import Chat from "../../../components/chatbot/chat";

import { Link, useParams } from "react-router-dom";
import { Alert, Header, HelpPanel } from "@cloudscape-design/components";
import "../../../styles/chat.module.scss"; 
export default function Playground() {
  const { sessionId } = useParams();

  return (    
    <BaseAppLayout
      //RIGHT-HAND Side Panel: Customized text HERE
      info={
        <HelpPanel header={<Header variant="h3">Using the search tool</Header>}>
          <p>
            This enhanced search application helps people discover grant opportunities from the State of Massachusetts Executive Office of Energy and Environmental Affairs (EEA)
          </p>
          <h3>More resources</h3>
          <p>
            Discover more about grant programs offered <a href="https://www.mass.gov/orgs/eea-office-of-grants-and-technical-assistance">here</a>.
            <br></br>
            Explore the EEA Homepage <a href="https://www.mass.gov/orgs/executive-office-of-energy-and-environmental-affairs">here</a>.
            <br></br>
            Learn more about the developers <a href="https://burnes.northeastern.edu/ai-for-impact-coop/">here</a>.
            <br></br>
          </p>
          <h3>Feedback?</h3>
          <p>
          Please visit our form to provide our team feedback <a href="https://docs.google.com/forms/d/e/1FAIpQLSfR2SQ5OP4m9P6ALUmMhz3Lf-eZsPvG_BZzGCKTIa6OVPylqg/viewform?usp=sf_link">here</a>.
          <br></br>
          </p>
        
        </HelpPanel>
      }
// toolsWidth={0}
      content={<Chat sessionId={sessionId} />}
    />
  );
}
