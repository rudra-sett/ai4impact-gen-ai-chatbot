import {
  BedrockRuntimeClient,
  InvokeModelWithResponseStreamCommand,
  InvokeModelCommand
} from "@aws-sdk/client-bedrock-runtime";

export default class ClaudeModel {
  constructor() {
    this.client = new BedrockRuntimeClient({
      region: "us-east-1",
    });
    this.modelId = "anthropic.claude-3-5-sonnet-20240620-v1:0";
  }

  assembleHistory(hist, prompt) {
    var history = []
    hist.forEach((element) => {
      history.push({ "role": "user", "content": [{ "type": "text", "text": element.user }] });
      history.push({ "role": "assistant", "content": [{ "type": "text", "text": element.chatbot }] });
    });
    history.push({ "role": "user", "content": [{ "type": "text", "text": prompt }] });
    return history;
  }
  parseChunk(chunk) {
    if (chunk.type == 'content_block_delta') {
      if (chunk.delta.type == 'text_delta') {
        return chunk.delta.text
      }
      if (chunk.delta.type == "input_json_delta") {
        return chunk.delta.partial_json
      }
    } else if (chunk.type == "content_block_start") {
      if (chunk.content_block.type == "tool_use") {
        return chunk.content_block
      }
    } else if (chunk.type == "message_delta") {
      if (chunk.delta.stop_reason == "tool_use") {
        return chunk.delta
      }
      else {
        return chunk.delta
      }
    }
  }

  async getStreamedResponse(system, history) {

    const payload = {
      "anthropic_version": "bedrock-2023-05-31",
      "system": system,
      "max_tokens": 2048,
      "messages": history,
      "temperature": 0.01,
      "tools": [
        {
          "name": "query_db",
          "description": "Query a semantic search database for search results based around key words or less specific queries.",
          "input_schema": {
            "type": "object",
            "properties": {
              "query": {
                "type": "string",
                "description": "The query you want to make to the vector database."
              }
            },
            "required": [
              "query"
            ]
          }

        },
        {
          "name": "get_act_or_resolve",
          "description": "Retrieve a specific Act or Resolve from 1960 to 2010, by chapter.",
          "input_schema": {
            "type": "object",
            "properties": {
              "year": {
                "type": "string",
                "description": "The year of the Act or Resolve you are going to retrieve."
              },
              "chapter" : {
                "type": "string",
                "description": "An integer that represents the chapter number."
              },
              "law_type" : {
                "type" : "string",
                "enum" : ["acts", "resolves"],
                "description" : "Whether you want to pull an Act or Resolve."
              }
            },
            "required": [
              "year",
              "chapter",
              "law_type"
            ]
          }

        }
      ],
    };

    try {
      const command = new InvokeModelWithResponseStreamCommand({ body: JSON.stringify(payload), contentType: 'application/json', modelId: this.modelId });
      const apiResponse = await this.client.send(command);
      return apiResponse.body
    } catch (e) {
      console.error("Caught error: model invoke error")
    }

  }

  async getResponse(system, history, message) {
    const hist = this.assembleHistory(history, message);
    const payload = {
      "anthropic_version": "bedrock-2023-05-31",
      "system": system,
      "max_tokens": 2048,
      "messages": hist,
      "temperature": 0,
      "amazon-bedrock-guardrailDetails": {
        "guardrailId": "ii43q6095rvh",
        "guardrailVersion": "Version 1"
      }
    };
    // Invoke the model with the payload and wait for the API to respond.
    const modelId = "anthropic.claude-3-sonnet-20240229-v1:0";
    const command = new InvokeModelCommand({
      contentType: "application/json",
      body: JSON.stringify(payload),
      modelId,
    });
    const apiResponse = await this.client.send(command);
    console.log(new TextDecoder().decode(apiResponse.body));
    return JSON.parse(new TextDecoder().decode(apiResponse.body)).content[0].text;
  }
}

// module.exports = ClaudeModel;