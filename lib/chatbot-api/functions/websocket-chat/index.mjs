import { ApiGatewayManagementApiClient, PostToConnectionCommand, DeleteConnectionCommand} from '@aws-sdk/client-apigatewaymanagementapi';
import { KendraClient, RetrieveCommand } from "@aws-sdk/client-kendra";
import { QueryCommand } from "@aws-sdk/client-kendra";
import ClaudeModel from "./models/claude3Sonnet.js";
//import Llama13BModel from "./models/llama13b.js";
//import Mistral7BModel from "./models/mistral7b.js"
/*global fetch*/

const ENDPOINT = process.env.mvp_websocket__api_endpoint_test;
const wsConnectionClient = new ApiGatewayManagementApiClient({ endpoint: ENDPOINT});
const WARNING_STRING = "For security and ethical reasons, I can't fulfill your request. Please try again with a different question that is relevant...";

async function processBedrockStream(id, modelStream, model, new_prompt, links){

  try {
    let model_response = ''
    for await (const event of modelStream) {
      const chunk = JSON.parse(new TextDecoder().decode(event.chunk.bytes));
      const parsedChunk = await model.parseChunk(chunk);
      if (parsedChunk) {
        let responseParams = {
          ConnectionId: id,
          Data: parsedChunk.toString()
        }
        model_response = model_response.concat(parsedChunk)
        // model_response = model_response.concat(links)
        let command = new PostToConnectionCommand(responseParams);
        // new command and send with metadata of sources - cit
        try {
          await wsConnectionClient.send(command);
        } catch {
          
        }
      }
    }
    // send end of stream message
    let eofParams = {
          ConnectionId: id,
          Data: "!<|EOF_STREAM|>!"
        }
    let command = new PostToConnectionCommand(eofParams);
    await wsConnectionClient.send(command);
    
    // send sources
    let responseParams = {
      ConnectionId: id,
      Data: JSON.stringify(links)
    }
    command = new PostToConnectionCommand(responseParams);
    await wsConnectionClient.send(command);
    
   } catch (error) {
     console.error("Stream processing error:", error);
   }
}

async function retrieveKendraDocs(query, kendra, kendraIndex) {
  const params = {
    QueryText: query.slice(0,999),
    IndexId: kendraIndex,
    PageSize: 10,
    PageNumber: 1,
    SortingConfiguration: {
      DocumentAttributeKey: '_last_updated_at', // Using the built-in attribute for last updated timestamp
      SortOrder: 'DESC' // Ensure latest documents come first
    }
  };

  try {
    const { ResultItems } = await kendra.send(new RetrieveCommand(params));
    const fullContent = ResultItems.map(item => 
      `Content: ${item.Content}; Title: ${item.DocumentTitle}; Link: ${item.DocumentURI}`
      ).join('\n');
    const documentUris = ResultItems.map(item => {
      return {title : item.DocumentTitle, uri : item.DocumentURI};});
    const flags = new Set();
    const uniqueUris = documentUris.filter(entry => {
        if (flags.has(entry.uri)) {
            return false;
        }
        flags.add(entry.uri);
        return true;
    });
  console.log(fullContent);
    //Returning both full content and list of document URIs
    return {
      content: fullContent,
      uris: uniqueUris
    };
  } catch (error) {
    console.error("Error in retrieving Kendra documents:", error);
    return {
      content: '',
      uris: []
    };
  }
}

function injectKendraDocsInPrompt(prompt, docs) {
    // Assuming buildPrompt concatenates query and docs into a single string
    console.log(docs);
    return `Context: ${docs}, Instructions: ${prompt}. You must cite exact links provided in the context. Don't include link if not found.`;
}

const getUserResponse = async (id, requestJSON) => {
  try {
    const data = requestJSON.data;
    const projectId = data.projectId;
    const systemPrompt = data.systemPrompt;
    const userMessage = data.userMessage;
    const kendra = new KendraClient({ region: 'us-east-1' });
    const projectIDToKendraIndex = {
      "rkdg062824": "dd8dea5b-a884-46b3-a9ab-b8d51253d339",
      "rkdg000555": "1fd3fa88-cb5b-4719-a201-b8b9d440e5f6",
    };
    if (!projectIDToKendraIndex[projectId]) {
      throw new Error("ProjectID is incorrect or not found.");
    }
    const docString = await retrieveKendraDocs(userMessage, kendra, projectIDToKendraIndex[projectId]);
    const enhancedSystemPrompt = injectKendraDocsInPrompt(systemPrompt, docString.content);
    let claude = new ClaudeModel();
    const stream = await claude.getStreamedResponse(enhancedSystemPrompt, userMessage);
    
    await processBedrockStream(id, stream, claude, userMessage, docString.uris);
    
    const input = { 
       ConnectionId: id, 
    };
     await wsConnectionClient.send(new DeleteConnectionCommand(input));

  } catch (error) {
    console.error("Error:", error);
  }
}

export const handler = async (event) => {
  if (event.requestContext) {
    const connectionId = event.requestContext.connectionId;
    const routeKey = event.requestContext.routeKey;
    let body = {};
    try {
      if (event.body) {
        body = JSON.parse(event.body);
      }
    } catch (err) {
      // Handle Error
    }
    
    switch (routeKey) {
      case '$connect':
        console.log('CONNECT')
          return {statusCode: 200};
      case '$disconnect':
        console.log('DISCONNECT')
          return {statusCode: 200};
      case '$default':
        console.log('DEFAULT')
        return {'action':'Default Response Triggered'}
      case "getChatbotResponse":
        console.log('GET CHATBOT RESPONSE')
        await getUserResponse(connectionId, body)
        return {statusCode: 200};
      default:
        console.log('????')
        // Do Nothing?
    }
  }
  return {
    statusCode: 200,
  };
};