import { ApiGatewayManagementApiClient, PostToConnectionCommand, DeleteConnectionCommand } from '@aws-sdk/client-apigatewaymanagementapi';
import { KendraClient, RetrieveCommand } from "@aws-sdk/client-kendra";
import { LambdaClient, InvokeCommand } from "@aws-sdk/client-lambda"
import { QueryCommand } from "@aws-sdk/client-kendra";
import ClaudeModel from "./models/claude3Sonnet.mjs";
import Llama13BModel from "./models/llama13b.mjs";
import Mistral7BModel from "./models/mistral7b.mjs"

/*global fetch*/

const ENDPOINT = process.env.WEBSOCKET_API_ENDPOINT;
const SYS_PROMPT = process.env.PROMPT;
const wsConnectionClient = new ApiGatewayManagementApiClient({ endpoint: ENDPOINT });
let admin = false;

/* This function takes a model stream from Bedrock and parses and sends each chunk
to the client. */
async function processBedrockStream(id, modelStream, model) {
  try {
    // store the full model response for saving to sessions later
    let modelResponse = ''
    // iterate through each chunk from the model stream
    for await (const event of modelStream) {
      const chunk = JSON.parse(new TextDecoder().decode(event.chunk.bytes));
      const parsedChunk = await model.parseChunk(chunk);
      if (parsedChunk) {
        let responseParams = {
          ConnectionId: id,
          Data: parsedChunk.toString()
        }
        modelResponse = modelResponse.concat(parsedChunk)

        let command = new PostToConnectionCommand(responseParams);

        try {
          await wsConnectionClient.send(command);
        } catch (error) {
          console.error("Error sending chunk:", error);
        }
      }
    }
    return modelResponse;
  } catch (error) {
    console.error("Stream processing error:", error);
    let responseParams = {
      ConnectionId: id,
      Data: `<!ERROR!>: ${error}`
    }
    let command = new PostToConnectionCommand(responseParams);
    await wsConnectionClient.send(command);
  }
}

/* Enhances a user's prompt given past chat history so that prompts
that need context to make sense can still be passed to Kendra for relevant results */
async function getPromptWithHistoricalContext(prompt, history) {
  try {
    // we do not want to enhance a prompt if there is no history to enhance it with
    if (history.length > 0) {
      let enhancer = new Mistral7BModel();
      const CONTEXT_COMPLETION_INSTRUCTIONS = "Given a chat history and the latest user question \
      which might reference context in the chat history, formulate a standalone question \
      which can be understood without the chat history. Do NOT answer the question, \
      just reformulate it if needed using relevant keywords from the chat history and otherwise return it as is.";
      const newHistory = history.slice(-3);
      const enhancerHistory = enhancer.assembleHistory(CONTEXT_COMPLETION_INSTRUCTIONS, newHistory, prompt);
      const enhancedPrompt = await enhancer.getPromptedResponse(enhancerHistory.concat("Sure, the rephrased user prompt and only the prompt with no additional comments is: "), 200);
      // Sometimes, the enhanced prompt will contain fluff such as, "sure, this prompt is a rephrased..." and we want to just check for that sometimes
      console.log(enhancedPrompt);
      return enhancedPrompt.replaceAll('"', '');
    } else {
      return prompt.replaceAll('"', '');
    }
  }
  catch (error) {
    console.error("Error in getting prompt with historical context:", error);
    console.error("Caught error: prompt enhancer failed")
    return prompt.replaceAll('"', '');
  }
}

/* Retrieves documents from a Kendra index */
async function retrieveKendraDocs(query, kendra, kendraIndex) {
  let params = {
    QueryText: query.slice(0, 999),
    IndexId: kendraIndex,
    PageSize: 12,
    PageNumber: 1,
    SortingConfiguration: {
      DocumentAttributeKey: '_last_updated_at', // Using the built-in attribute for last updated timestamp
      SortOrder: 'DESC' // Ensure latest documents come first
    }
  };

  /** Filters out Zendesk results for non-admins
   * It is here as a PoC, this can be changed in the future
   * to hide Zendesk results from customers while allowing them to be visible
   * to staff members
   */
  if (!admin) {    
    params = {
      QueryText: query.slice(0, 999),
      IndexId: kendraIndex,
      PageSize: 12,
      PageNumber: 1,
      AttributeFilter: { EqualsTo: { "Key": "_data_source_id", "Value": { "StringValue": "da6b5acb-f9d8-404d-9579-c78c04dce75a" } } },
      SortingConfiguration: {
        DocumentAttributeKey: '_last_updated_at', // Using the built-in attribute for last updated timestamp
        SortOrder: 'DESC' // Ensure latest documents come first
      }
    };
  }

  try {
    const { ResultItems } = await kendra.send(new RetrieveCommand(params));
    console.log(ResultItems)
    // filter the items based on confidence, we do not want LOW confidence results
    const confidenceFilteredResults = ResultItems.filter(item =>
      item.ScoreAttributes.ScoreConfidence == "VERY_HIGH"
      || item.ScoreAttributes.ScoreConfidence == "HIGH"
      || item.ScoreAttributes.ScoreConfidence == "MEDIUM"
    )
    console.log(confidenceFilteredResults)
    let fullContent = confidenceFilteredResults.map(item => item.Content).join('\n');
    const documentUris = confidenceFilteredResults.map(item => {
      return { title: item.DocumentTitle, uri: item.DocumentURI }
    });

    // removes duplicate sources based on URI
    const flags = new Set();
    const uniqueUris = documentUris.filter(entry => {
      if (flags.has(entry.uri)) {
        return false;
      }
      flags.add(entry.uri);
      return true;
    });

    // console.log(fullContent);

    //Returning both full content and list of document URIs
    if (fullContent == '') {
      fullContent = `No knowledge available! This query is likely outside the scope of the RIDE.
      Please provide a general answer but do not attempt to provide specific details.`
      console.log("Warning: no relevant sources found")
    }

    return {
      content: fullContent,
      uris: uniqueUris
    };
  } catch (error) {
    console.error("Caught error: could not retreive Kendra documents:", error);
    // return no context
    return {
      content: `No knowledge available! This query is likely outside the scope of the RIDE.
      Please provide a general answer but do not attempt to provide specific details.`,
      uris: []
    };
  }
}

/* Inject the documents into the system prompt */
function injectKendraDocsInPrompt(prompt, docs) {
  // Assuming buildPrompt concatenates query and docs into a single string
  console.log(docs);
  return `Knowledge: ${docs}\nInstructions: ${prompt}`;
}


const getUserResponse = async (id, requestJSON) => {
  try {
    const data = requestJSON.data;

    // this information no longer comes from the client
    // const projectId = data.projectId;
    // const systemPrompt = data.systemPrompt;

    const userMessage = data.userMessage;
    const userId = data.user_id;
    const sessionId = data.session_id;
    const chatHistory = data.chatHistory;
    const kendra = new KendraClient({ region: 'us-east-1' });

    if (!process.env.INDEX_ID) {
      throw new Error("ProjectID is not found.");
    }

    // enhance the user prompt for better RAG search
    const enhancedUserPrompt = await getPromptWithHistoricalContext(userMessage, chatHistory);
    // get the full block of context from Kendra
    const docString = await retrieveKendraDocs(enhancedUserPrompt, kendra, process.env.INDEX_ID);
    // enhance the system prompt with Kendra-retrived context
    const enhancedSystemPrompt = injectKendraDocsInPrompt(SYS_PROMPT, docString.content);

    // retrieve a model response based on the last 5 messages
    let claude = new ClaudeModel();
    let lastFiveMessages = chatHistory.slice(-5);
    const stream = await claude.getStreamedResponse(enhancedSystemPrompt, lastFiveMessages, userMessage);
    let modelResponse = await processBedrockStream(id, stream, claude);

    let command;
    let links = JSON.stringify(docString.uris)
    // send end of stream message
    try {
      let eofParams = {
        ConnectionId: id,
        Data: "!<|EOF_STREAM|>!"
      }
      command = new PostToConnectionCommand(eofParams);
      await wsConnectionClient.send(command);

      // send sources
      let responseParams = {
        ConnectionId: id,
        Data: links
      }
      command = new PostToConnectionCommand(responseParams);
      await wsConnectionClient.send(command);
    } catch (e) {
      console.error("Error sending EOF_STREAM and sources:", e);
    }


    const sessionRequest = {
      body: JSON.stringify({
        "operation": "get_session",
        "user_id": userId,
        "session_id": sessionId
      })
    }
    const client = new LambdaClient({});
    const lambdaCommand = new InvokeCommand({
      FunctionName: process.env.SESSION_HANDLER,
      Payload: JSON.stringify(sessionRequest),
    });

    const { Payload, LogResult } = await client.send(lambdaCommand);
    const result = Buffer.from(Payload).toString();

    // Check if the request was successful
    if (!result) {
      throw new Error(`Error retriving session data!`);
    }

    // Parse the JSON
    let output = {};
    try {
      const response = JSON.parse(result);
      output = JSON.parse(response.body);
      console.log('Parsed JSON:', output);
    } catch (error) {
      console.error('Failed to parse JSON:', error);
      let responseParams = {
        ConnectionId: id,
        Data: '<!ERROR!>: Unable to load past messages, please retry your query'
      }
      command = new PostToConnectionCommand(responseParams);
      await wsConnectionClient.send(command);
      return; // Optional: Stop further execution in case of JSON parsing errors
    }

    // Continue processing the data
    const retrievedHistory = output.chat_history;
    let operation = '';
    let title = ''; // Ensure 'title' is initialized if used later in your code

    // Further logic goes here

    let newChatEntry = { "user": userMessage, "chatbot": modelResponse, "metadata": links };
    if (retrievedHistory === undefined) {
      operation = 'add_session';
      let titleModel = new Mistral7BModel();
      const CONTEXT_COMPLETION_INSTRUCTIONS =
        `<s>[INST]Generate a concise title for this chat session based on the initial user prompt and response. The title should succinctly capture the essence of the chat's main topic without adding extra content.[/INST]
      [INST]${userMessage}[/INST]
      ${modelResponse} </s>
      Here's your session title:`;
      title = await titleModel.getPromptedResponse(CONTEXT_COMPLETION_INSTRUCTIONS, 25);
      title = title.replaceAll(`"`, '');
    } else {
      operation = 'update_session';
    }

    const sessionSaveRequest = {
      body: JSON.stringify({
        "operation": operation,
        "user_id": userId,
        "session_id": sessionId,
        "new_chat_entry": newChatEntry,
        "title": title
      })
    }

    const lambdaSaveCommand = new InvokeCommand({
      FunctionName: process.env.SESSION_HANDLER,
      Payload: JSON.stringify(sessionSaveRequest),
    });

    // const { SessionSavePayload, SessionSaveLogResult } = 
    await client.send(lambdaSaveCommand);

    const input = {
      ConnectionId: id,
    };
    await wsConnectionClient.send(new DeleteConnectionCommand(input));

  } catch (error) {
    console.error("Error:", error);
    let responseParams = {
      ConnectionId: id,
      Data: `<!ERROR!>: ${error}`
    }
    let command = new PostToConnectionCommand(responseParams);
    await wsConnectionClient.send(command);
  }
}

const draftEmailResponse = async (id, requestJSON) => {
  try {
    const data = requestJSON.data;
    const history = data.chatHistory;

    let emailPrompt = `Given this chat history, please draft an email that summarizes the policies that were discussed. Use the following format:
    Dear [Customer Name],

    I received your inquiry on "<<TOPIC SUMMARY>>"}.

    "<<Fill in the email with a policy quote if possible and answer the question briefly. Reference FTA guidelines where possible>>"}
    <<Make sure to close out the letter in a polite way>>

    Best,
    [Your Name Here]`;

    let claude = new ClaudeModel();
    const stream = await claude.getStreamedResponse(emailPrompt, history, "Turn this into an email")
    await processBedrockStream(id, stream, claude)

    const input = {
      ConnectionId: id,
    };
    await wsConnectionClient.send(new DeleteConnectionCommand(input));
  }

  catch (e) {
    console.log(e)
    console.log("Caught error: could not generate email")
  }
}

export const handler = async (event) => {
  if (event.requestContext) {
    try {
      const claims = event.requestContext.authorizer
      const roles = JSON.parse(claims['role'])
      if (roles.includes("Admin")) {
        console.log("authorized")
        admin = true;
      } else {
        console.log("not an admin")
      }
    } catch (e) {
      console.log(e)
      console.log("could not check admin access")
    }
    const connectionId = event.requestContext.connectionId;
    const routeKey = event.requestContext.routeKey;
    let body = {};
    try {
      if (event.body) {
        body = JSON.parse(event.body);
      }
    } catch (err) {
      console.error("Failed to parse JSON:", err)
    }
    console.log(routeKey);

    switch (routeKey) {
      case '$connect':
        console.log('CONNECT')
        return { statusCode: 200 };
      case '$disconnect':
        console.log('DISCONNECT')
        return { statusCode: 200 };
      case '$default':
        console.log('DEFAULT')
        return { 'action': 'Default Response Triggered' }
      case "getChatbotResponse":
        console.log('GET CHATBOT RESPONSE')
        await getUserResponse(connectionId, body)
        return { statusCode: 200 };
      case "generateEmail":
        console.log('email')
        await draftEmailResponse(connectionId, body)
        return { status: 200 };
      default:
        return {
          statusCode: 404,  // 'Not Found' status code
          body: JSON.stringify({
            error: "The requested route is not recognized."
          })
        };
    }
  }
  return {
    statusCode: 200,
  };
};
