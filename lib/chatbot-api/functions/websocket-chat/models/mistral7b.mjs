import {
  BedrockRuntimeClient,
  InvokeModelWithResponseStreamCommand,
  InvokeModelCommand,
} from "@aws-sdk/client-bedrock-runtime";


export default class Mistral7BModel {
  constructor() {
    this.client = new BedrockRuntimeClient({
      region: "us-east-1",
    });
    this.modelId = 'mistral.mistral-7b-instruct-v0:2';
  }
  
  assembleHistory(system,hist,prompt) {
      var history = ""
      history = history.concat(`<s>[INST]\n ${system} [/INST]\n`)
      hist.forEach((element) => {
        history = history.concat(`[INST]\n ${element.user} [/INST]\n`)
        history = history.concat(`${element.chatbot}`)
      });
      history = history.concat(`\n </s>[INST]\n ${prompt} [/INST]\n\n`)
      return history
  }
  
  parseChunk(chunk) {
    return chunk.generation;
  }
  
  async getStreamedResponse(system,history,message) {
      const hist = this.assembleHistory(system,history,message);
      const payload = {
        prompt: hist,
        max_tokens: 2000,
        temperature: 0.05
      };
      // Invoke the model with the payload and wait for the API to respond.
      const command = new InvokeModelWithResponseStreamCommand({
        contentType: "application/json",
        body: JSON.stringify(payload),
        modelId : this.modelId,
      });
      const apiResponse = await this.client.send(command);
      console.log(apiResponse.body)
      return apiResponse.body;
  }
  
  async getResponse(system,history,message) {
    const hist = this.assembleHistory(system,history,message);
    const payload = {
      prompt: hist,
      max_tokens: 999,
      temperature: 0.05
    };
    // Invoke the model with the payload and wait for the API to respond.
    const command = new InvokeModelCommand({
      contentType: "application/json",
      body: JSON.stringify(payload),
      modelId : this.modelId,
    });
    const apiResponse = await this.client.send(command);
    return JSON.parse(new TextDecoder().decode(apiResponse.body)).outputs[0].text;
  }
  
  async getPromptedResponse(prompt, len) {
    const payload = {
      prompt: prompt,
      max_tokens: len,
      temperature: 0,
      stop: ["?\n",'?"\n']
    };
    // Invoke the model with the payload and wait for the API to respond.
    const command = new InvokeModelCommand({
      contentType: "application/json",
      body: JSON.stringify(payload),
      modelId : this.modelId,
    });
    const apiResponse = await this.client.send(command);
    const output = JSON.parse(new TextDecoder().decode(apiResponse.body))
    console.log(output)
    return output.outputs[0].text;
  }
  
}

// module.exports = Mistral7BModel;