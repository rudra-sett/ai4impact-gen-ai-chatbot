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

    let tools = [
      {
        "name": "keyword_search",
        "description": "Query a semantic search database for search results based around key words or less specific queries. Only use this when a specific chapter or year cannot reasonably inferred.",
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
        "description": "Retrieve a specific Act or Resolve from 1960 to 2024, by chapter. Always use this if you have a specific chapter you need.",
        "input_schema": {
          "type": "object",
          "properties": {
            "year": {
              "type": "string",
              "description": "The year of the Act or Resolve you are going to retrieve."
            },
            "chapter": {
              "type": "string",
              "description": "An integer that represents the chapter number."
            },
            "law_type": {
              "type": "string",
              "enum": ["acts", "resolves"],
              "description": "Whether you want to pull an Act or Resolve."
            }
          },
          "required": [
            "year",
            "chapter",
            "law_type"
          ]
        }

      },
      {
        "name": "find_references",
        "description": "Gets a list of snippets of Acts or Resolves that reference a provided Act, Resolve, or General Law. Use this to find amendments to a given law.",
        "input_schema": {
          "type": "object",
          "properties": {
            "year": {
              "type": "string",
              "description": "The year of the Act or Resolve you are trying to find references for. Use NA for General Laws."
            },
            "chapter": {
              "type": "string",
              "description": "The chapter that you are looking for modifications to."
            },
            "section": {
              "type": "string",
              "description": "The specific section that you are looking for modifications to. This will generally apply to general laws but can apply to amendments too. This is optional."
            },
            "law_type": {
              "type": "string",
              "enum": ["acts", "resolves", "general laws"],
              "description": "Whether the current law being modified is an act, resolve, or general law."
            }
          },
          "required": [
            "year",
            "chapter",
            "law_type"
          ]
        }

      },      
    ]

    const payload = {
      "anthropic_version": "bedrock-2023-05-31",
      "system": system,
      "max_tokens": 8192,
      "messages": history,
      "temperature": 0,
      "tools": tools,
    };

    try {
      const command = new InvokeModelWithResponseStreamCommand({ body: JSON.stringify(payload), contentType: 'application/json', modelId: this.modelId });
      const apiResponse = await this.client.send(command);
      return apiResponse.body
    } catch (e) {
      console.log(e)
      console.error("Caught error: model invoke error")
    }

  }
}

// module.exports = ClaudeModel;