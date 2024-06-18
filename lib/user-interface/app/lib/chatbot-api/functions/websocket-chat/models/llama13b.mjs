import {
    BedrockRuntimeClient,
    InvokeModelWithResponseStreamCommand,
    InvokeModelCommand,
  } from "@aws-sdk/client-bedrock-runtime";

  
export default class Llama13BModel {
    constructor() {
      this.client = new BedrockRuntimeClient({
        region: "us-east-1",
      });
    }
    
    assembleHistory(system,hist,prompt) {
        var history = ""
        history = history.concat(`[INST]\n ${system} [/INST]\n`)
        hist.forEach((element) => {
          history = history.concat(`[INST]\n ${element.user} [/INST]\n`)
          history = history.concat(`${element.chatbot}`)
        });
        history = history.concat(`[INST]\n ${prompt} [/INST]`)
        return history
    }
    
    parseChunk(chunk) {
      return chunk.generation;
    }
    
    async getStreamedResponse(system,history,message) {
        const hist = this.assembleHistory(system,history,message);
        const payload = {
          prompt: hist,
          max_gen_len: 900,
        };
        // Invoke the model with the payload and wait for the API to respond.
        const modelId = "meta.llama2-13b-chat-v1";
        const command = new InvokeModelWithResponseStreamCommand({
          contentType: "application/json",
          body: JSON.stringify(payload),
          modelId,
        });
        const apiResponse = await this.client.send(command);
        console.log(apiResponse.body)
        return apiResponse.body;
    }
    
    async getResponse(system,history,message) {
      const hist = this.assembleHistory(system,history,message);
      const payload = {
        prompt: hist,
        max_gen_len: 20,
        temperature: 0.05
      };
      // Invoke the model with the payload and wait for the API to respond.
      const modelId = "meta.llama2-13b-chat-v1";
      const command = new InvokeModelCommand({
        contentType: "application/json",
        body: JSON.stringify(payload),
        modelId,
      });
      const apiResponse = await this.client.send(command);
      // console.log(new TextDecoder().decode(apiResponse.body));
      return JSON.parse(new TextDecoder().decode(apiResponse.body)).generation;
    }
    
    async getPromptedResponse(prompt, len) {
      const payload = {
        prompt: prompt,
        max_gen_len: len,
        temperature: 0.05
      };
      // Invoke the model with the payload and wait for the API to respond.
      const modelId = "meta.llama2-13b-chat-v1";
      const command = new InvokeModelCommand({
        contentType: "application/json",
        body: JSON.stringify(payload),
        modelId,
      });
      const apiResponse = await this.client.send(command);
      // console.log(new TextDecoder().decode(apiResponse.body));
      return JSON.parse(new TextDecoder().decode(apiResponse.body)).generation;
    }
    
  }
  
  // module.exports = Llama13BModel;