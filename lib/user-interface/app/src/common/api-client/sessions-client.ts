// import { Auth } from "aws-amplify";

import {
  ChatBotHistoryItem,
  ChatBotMessageType,
} from "../../components/chatbot/types";

import {
  assembleHistory
} from "../../components/chatbot/utils"

import {
  Utils
} from "../utils"

// import {
//   API
// } from "../constants"
import { AppConfig } from "../types"; 


export class SessionsClient {
  private readonly API;
  constructor(protected _appConfig: AppConfig) {
    this.API = _appConfig.httpEndpoint.slice(0,-1);}



  // Gets all sessions tied to a given user ID
  // Return format: [{"session_id" : "string", "user_id" : "string", "time_stamp" : "dd/mm/yy", "title" : "string"}...]
  async getSessions(
    userId: string
  ) {
    // const auth = await Utils.authenticate();
    let validData = false;
    let output = [];
    let runs = 0;
    let limit = 3;
    let errorMessage = "Could not load sessions"
    while (!validData && runs < limit ) {
      runs += 1;
      const response = await fetch(this.API + '/user-session', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          // 'Authorization': 'Bearer ' + auth,
        },
        body: JSON.stringify({ "operation": "list_sessions_by_user_id", "user_id": userId })
      });
      if (response.status != 200) {
        validData = false;
        let jsonResponse = await response.json()
        // console.log(jsonResponse);
        errorMessage = jsonResponse;
        // errorMessage = body.body;
        break;
      }
      const reader = response.body.getReader();
      const { value, done } = await reader.read();
      const decoder = new TextDecoder();
      const parsed = decoder.decode(value)
      console.log(parsed)
      try{
        output = JSON.parse(parsed);
        validData = true;
      } catch (e) {
        // just retry, we get 3 attempts!
        console.log(e);
      }
    }
    if (!validData) {
      throw new Error(errorMessage);
    }
    console.log(output);
    return output;
  }

  // Returns a chat history given a specific user ID and session ID
  // Return format: a list of ChatBotHistoryItems
  async getSession(
    sessionId: string,
    userId: string,
  ): Promise<ChatBotHistoryItem[]> {
    // const auth = await Utils.authenticate();
    let validData = false;
    let output;
    let runs = 0;
    let limit = 3;
    let errorMessage = "Could not load session";
    while (!validData && runs < limit ) {
      runs += 1;
      const response = await fetch(this.API + '/user-session', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          // 'Authorization': 'Bearer ' + auth,
        },
        body: JSON.stringify({
          "operation": "get_session", "session_id": sessionId,
          "user_id": userId
        })
      });
      // console.log(response.body);
      if (response.status != 200) {
        validData = false;
        errorMessage = await response.json()
        break;
      }
      const reader = response.body.getReader();
      const { value, done } = await reader.read();
      // console.log(value);
      const decoder = new TextDecoder();
      // console.log(decoder.decode(value));    
      try {
        output = JSON.parse(decoder.decode(value)).chat_history! as any[];
        validData = true;
      } catch (e) {
        console.log(e);
      }
    }
    if (!validData) {
      throw new Error(errorMessage)      
    }
    let history: ChatBotHistoryItem[] = [];
    // console.log(output);
    if (output === undefined) {
      return history;
    }
    output.forEach(function (value) {
      let metadata = {}
      if (value.metadata) {
        metadata = { "Sources": JSON.parse(value.metadata) }
      }
      history.push({
        type: ChatBotMessageType.Human,
        content: value.user,
        metadata: {
        },
        tokens: [],
      },
        {
          type: ChatBotMessageType.AI,
          tokens: [],
          content: value.chatbot,
          metadata: metadata,
        },)
    })
    // console.log(history);
    return history;
  }

  async deleteSession(
    sessionId: string,
    userId: string,
  ) {
    try {
      // const auth = await Utils.authenticate();
      const response = await fetch(this.API + '/user-session', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          // 'Authorization': 'Bearer ' + auth,
        },
        body: JSON.stringify({
          "operation": "delete_session", "session_id": sessionId,
          "user_id": userId
        })
      });
    } catch {
      return "FAILED";
    }
    return "DONE";
  }
}
