import { ApiGatewayManagementApiClient, PostToConnectionCommand, DeleteConnectionCommand } from '@aws-sdk/client-apigatewaymanagementapi';
import { BedrockAgentRuntimeClient, RetrieveCommand as KBRetrieveCommand } from "@aws-sdk/client-bedrock-agent-runtime";
import { LambdaClient, InvokeCommand } from "@aws-sdk/client-lambda"
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import ClaudeModel from "./models/claude3Sonnet.mjs";
import Mistral7BModel from "./models/mistral7b.mjs"

/*global fetch*/

const ENDPOINT = process.env.WEBSOCKET_API_ENDPOINT;
const SYS_PROMPT = process.env.PROMPT;
const wsConnectionClient = new ApiGatewayManagementApiClient({ endpoint: ENDPOINT });

/* Use the Bedrock Knowledge Base*/
async function retrieveKBDocs(query, knowledgeBase, knowledgeBaseID) {
  const input = { // RetrieveRequest
    knowledgeBaseId: knowledgeBaseID, // required
    retrievalQuery: { // KnowledgeBaseQuery
      text: query, // required
    },
    retrievalConfiguration : { 
      vectorSearchConfiguration: {         
         "numberOfResults": 10,         
      }
   },
  }


  try {
    const command = new KBRetrieveCommand(input);
    const response = await knowledgeBase.send(command);

    // filter the items based on confidence, we do not want LOW confidence results
    const confidenceFilteredResults = response.retrievalResults.filter(item =>
      item.score > 0.1
    )
    // console.log(confidenceFilteredResults)
    let fullContent = confidenceFilteredResults.map(item => item.content.text + item.location.s3Location.uri).join('\n');
    const documentUris = confidenceFilteredResults.map(item => {
      return { title: item.location.s3Location.uri.slice((item.location.s3Location.uri).lastIndexOf("/") + 1) + " (Bedrock Knowledge Base)", uri: item.location.s3Location.uri }
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
      fullContent = `No knowledge available! This query is likely outside the scope of your knowledge.
      Please provide a general answer but do not attempt to provide specific details.`
      console.log("Warning: no relevant sources found")
    }

    return {
      content: fullContent,
      uris: uniqueUris
    };
  } catch (error) {
    console.error("Caught error: could not retreive Knowledge Base documents:", error);
    // return no context
    return {
      content: `No knowledge available! There is something wrong with the search tool. Please tell the user to submit feedback.
      Please provide a general answer but do not attempt to provide specific details.`,
      uris: []
    };
  }
}

async function getChapter(year, type, chapter) {
  const bucketName = 'glo-processed'
  const key = `${type}/${year}/chapter-${chapter}.txt`;

  const s3Client = new S3Client({
    region: "us-east-1", // e.g., "us-east-1"    
  });

  try {
    const command = new GetObjectCommand({
      Bucket: bucketName,
      Key: key,
    });
    const response = await s3Client.send(command);

    // Stream the response body
    const chunks = [];
    for await (const chunk of response.Body) {
      chunks.push(chunk);
    }
    const data = Buffer.concat(chunks);
    return data.toString()
  } catch (err) {
    console.log(err)
    if (err.code === 'NoSuchKey' || err.code === 'NotFound' || err.statusCode === 404) {
      console.error(
        `Error from S3 while getting object "${key}" from "${bucketName}". No such key exists.`,
      );
      const adjacentChapters = [chapter - 1, chapter + 1];
      const results = "";

      for (let adjChapter of adjacentChapters) {
        const adjKey = `${type}/${year}/chapter-${adjChapter}.txt`;

        try {
          const command = new GetObjectCommand({
            Bucket: bucketName,
            Key: adjKey,
          });

          const response = await s3Client.send(command);

          const chunks = [];
          for await (const chunk of response.Body) {
            chunks.push(chunk);
          }
          const data = Buffer.concat(chunks);

          results = results.concat(data.toString());

        } catch (adjErr) {
          // Ignore if adjacent chapter doesn't exist
          if (adjErr.code === 'NoSuchKey' || adjErr.code === 'NotFound' || adjErr.statusCode === 404) {
            console.log(adjErr)
            return "Chapter not found!";
          } else {
            throw adjErr; // Throw if other error occurs
          }
        }
      }
    }
  }

}

const getUserResponse = async (id, requestJSON) => {
  try {
    const data = requestJSON.data;

    let userMessage = data.userMessage;
    const userId = data.user_id;
    const sessionId = data.session_id;
    const chatHistory = data.chatHistory;

    const knowledgeBase = new BedrockAgentRuntimeClient({ region: 'us-east-1' });

    if (!process.env.KB_ID) {
      throw new Error("Knowledge Base ID is not found.");
    }

    // retrieve a model response based on the last 5 messages
    // messages come paired, so that's why the slice is only 2 (2 x 2 + the latest prompt = 5)
    let claude = new ClaudeModel();
    let lastFiveMessages = chatHistory.slice(-2);

    let stopLoop = false;
    let modelResponse = ''

    let history = claude.assembleHistory(lastFiveMessages, "Please use your search tool one or more times based on this latest prompt: ".concat(userMessage))
    let fullDocs = { "content": "", "uris": [] }

    while (!stopLoop) {
      console.log("started new stream")
      // console.log(lastFiveMessages)
      // console.log(history)
      history.forEach((historyItem) => {
        console.log(historyItem)
      })
      const stream = await claude.getStreamedResponse(SYS_PROMPT, history);
      try {
        // store the full model response for saving to sessions later

        let toolInput = "";
        let assemblingInput = false
        let usingTool = false;
        let toolId;
        let skipChunk = true;

        let toolUses = []
        // this is for when the assistant uses a tool
        let message = {};
        // this goes in that message
        let toolUse = {}

        // iterate through each chunk from the model stream
        for await (const event of stream) {
          const chunk = JSON.parse(new TextDecoder().decode(event.chunk.bytes));
          const parsedChunk = await claude.parseChunk(chunk);
          if (parsedChunk) {

            // this means that we got tool use input or stopped generating text
            if (parsedChunk.stop_reason) {
              if (parsedChunk.stop_reason == "tool_use") {

                toolUse.input = JSON.parse(toolInput)
                toolInput = ""
                message.content.push(toolUse)
                toolUses.push(message)
                message = {}
                toolUse = {}                

                assemblingInput = false;
                usingTool = true;
                skipChunk = true;
              } else {
                stopLoop = true;
                break;
              }
            }

            // this means that we are collecting tool use input
            if (parsedChunk.type) {
              if (parsedChunk.type == "tool_use") {
                if (assemblingInput == true) {
                  // if this is already true, then we are collecting another tool's input
                  // we need to push the current tool use to the list of tool uses
                  // and clear out the variable to start over for the next tool use
                  toolUse.input = JSON.parse(toolInput)
                  toolInput = ""
                  message.content.push(toolUse)
                  toolUses.push(message)
                  message = {}
                  toolUse = {}
                  // don't parse this header chunk
                  skipChunk = true;
                }
                assemblingInput = true;
                toolId = parsedChunk.id
                message['role'] = 'assistant'
                message['content'] = []
                toolUse['name'] = parsedChunk.name;
                toolUse['type'] = 'tool_use'
                toolUse['id'] = toolId;
                toolUse['input'] = {}
              }
            }

            let toolResult = "Tool use failed!";

            if (usingTool) {

              // get the full block of context from knowledge base
              let docString;
              for (let toolUseMessage of toolUses) {
                // console.log("tool input")
                // console.log(toolInput);
                console.log(toolUseMessage)
                const toolUse = toolUseMessage.content[0];
                // toolUse.content[0].input = JSON.parse(toolInput);

                if (toolUse.name == "query_db") {
                  console.log("using knowledge bases!")
                  docString = await retrieveKBDocs(toolUse.input.query, knowledgeBase, process.env.KB_ID);
                  fullDocs.content = fullDocs.content.concat(docString.content)
                  fullDocs.uris = fullDocs.uris.concat(docString.uris)
                  toolResult = docString.content;
                } else if (toolUse.name == "get_act_or_resolve") {
                  console.log("getting chapter!")
                  const chapterText = await getChapter(toolUse.input.year, toolUse.input.law_type, toolUse.input.chapter)
                  toolResult = chapterText
                }

                // add the tool use message to chat history
                // toolUseMessage.content.push(toolUse)
                history.push(toolUseMessage)

                // add the tool response to chat history
                let toolResponse = {
                  "role": "user",
                  "content": [
                    {
                      "type": "tool_result",
                      "tool_use_id": toolUse.id,
                      "content": toolResult
                    }
                  ]
                };

                history.push(toolResponse);

                console.log("correctly used tool!")
              }
              
              usingTool = false;
              toolInput = ""

            } else {

              if (assemblingInput & !skipChunk) {
                toolInput = toolInput.concat(parsedChunk);
                // toolUse.input.query += parsedChunk;
              } else if (!assemblingInput) {
                // console.log('writing out to user')
                let responseParams = {
                  ConnectionId: id,
                  Data: parsedChunk.toString()
                }
                modelResponse = modelResponse.concat(parsedChunk)
                let command = new PostToConnectionCommand(responseParams);

                try {
                  await wsConnectionClient.send(command);
                } catch (error) {
                  // console.error("Error sending chunk:", error);
                }
              } else if (skipChunk) {
                skipChunk = false;
              }
            }



          }
        }

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

    let command;
    let links = JSON.stringify(fullDocs.uris)
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