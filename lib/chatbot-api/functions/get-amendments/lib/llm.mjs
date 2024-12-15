import {
  BedrockRuntimeClient,
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

  async getResponse(system, history) {

    let tools = [            
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
      {
        "name": "send_amendments_to_client",
        "description": "Send a full list of amendments to a specified act to the client. You will need to use the find_references tool before using this tool. Carefully go consider each result to build out a full list.",
        "input_schema": {
          "type": "object",
          "properties": {
            "amendments": {
              "type": "array",
              "description": "A full list of all amendments to a specific law being amended.",
              "items": {
                "type": "object",
                "properties": {                    
                  "amending_act": { "type": "string" },
                  "amendment_description" : {
                    "type" : "string", 
                    "amendment_description" : {"type" : "string", "description" : "A detailed summary of the amendment. If multiple changes are made, include everything."}}
                },
                "required": ["amending_act","amendment_description"]
              }
            },              
          },
          "required": [
            "amendments"              
          ]
        }
      }     
    ]

    const payload = {
      "anthropic_version": "bedrock-2023-05-31",
      "system": system,
      "max_tokens": 8192,
      "messages": history,
      "temperature": 0,
      "tools": tools,
    };
    // Invoke the model with the payload and wait for the API to respond.
    const modelId = "anthropic.claude-3-5-sonnet-20240620-v1:0";
    const command = new InvokeModelCommand({
      contentType: "application/json",
      body: JSON.stringify(payload),
      modelId,
    });
    const apiResponse = await this.client.send(command);
    console.log(new TextDecoder().decode(apiResponse.body));
    return JSON.parse(new TextDecoder().decode(apiResponse.body));
  }
}