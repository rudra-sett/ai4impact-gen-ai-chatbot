import { Storage } from "aws-amplify";
import { Dispatch, SetStateAction } from "react";
import {
  ChatBotAction,
  ChatBotHistoryItem,
  ChatBotMessageResponse,
  ChatBotMessageType,
} from "./types";

export function updateMessageHistory(
  sessionId: string,
  messageHistory: ChatBotHistoryItem[],
  setMessageHistory: Dispatch<SetStateAction<ChatBotHistoryItem[]>>,
  response: ChatBotMessageResponse
) {
  if (response.data?.sessionId !== sessionId) return;

  if (
    response.action === ChatBotAction.LLMNewToken ||
    response.action === ChatBotAction.FinalResponse ||
    response.action === ChatBotAction.Error
  ) {
    const content = response.data?.content;
    let metadata = response.data?.metadata;
    const token = response.data?.token;
    const hasContent = typeof content !== "undefined";
    const hasToken = typeof token !== "undefined";
    const hasMetadata = typeof metadata !== "undefined";

    if (
      messageHistory.length > 0 &&
      messageHistory[messageHistory.length - 1]["type"] !==
        ChatBotMessageType.Human
    ) {
      const lastMessage = messageHistory[messageHistory.length - 1];
      lastMessage.tokens = lastMessage.tokens || [];
      if (hasToken) {
        lastMessage.tokens.push(token);
      }

      lastMessage.tokens.sort((a, b) => a.sequenceNumber - b.sequenceNumber);
      if (lastMessage.tokens.length > 0) {
        const lastRunId =
          lastMessage.tokens[lastMessage.tokens.length - 1].runId;
        if (lastRunId) {
          lastMessage.tokens = lastMessage.tokens.filter(
            (c) => c.runId === lastRunId
          );
        }
      }

      if (!hasMetadata) {
        metadata = lastMessage.metadata;
      }

      if (hasContent) {
        setMessageHistory((history) => [
          ...history.slice(0, history.length - 1),
          {
            ...lastMessage,
            type: ChatBotMessageType.AI,
            content,
            metadata,
            tokens: lastMessage.tokens,
          },
        ]);
      } else {
        const contentFromTokens = lastMessage.tokens
          .map((c) => c.value)
          .join("");

        setMessageHistory((history) => [
          ...history.slice(0, history.length - 1),
          {
            ...lastMessage,
            type: ChatBotMessageType.AI,
            content: contentFromTokens,
            metadata,
            tokens: lastMessage.tokens,
          },
        ]);
      }
    } else {
      if (hasContent) {
        const tokens = hasToken ? [token] : [];
        setMessageHistory((history) => [
          ...history,
          {
            type: ChatBotMessageType.AI,
            content,
            metadata,
            tokens,
          },
        ]);
      } else if (typeof token !== "undefined") {
        setMessageHistory((history) => [
          ...history,
          {
            type: ChatBotMessageType.AI,
            content: token.value,
            metadata,
            tokens: [token],
          },
        ]);
      }
    }
  } else {
    console.error(`Unrecognized type ${response.action}`);
  }
}

export function updateMessageHistoryRef(
  sessionId: string,
  messageHistory: ChatBotHistoryItem[],
  response: ChatBotMessageResponse
) {
  if (response.data?.sessionId !== sessionId) return;

  if (
    response.action === ChatBotAction.LLMNewToken ||
    response.action === ChatBotAction.FinalResponse ||
    response.action === ChatBotAction.Error
  ) {
    const content = response.data?.content;
    let metadata = response.data?.metadata;
    const token = response.data?.token;
    const hasContent = typeof content !== "undefined";
    const hasToken = typeof token !== "undefined";
    const hasMetadata = typeof metadata !== "undefined";
    if (
      messageHistory.length > 0 &&
      messageHistory.at(-1)?.type !== ChatBotMessageType.Human
    ) {
      const lastMessage = messageHistory.at(-1)!;
      lastMessage.tokens = lastMessage.tokens ?? [];
      if (hasToken) {
        lastMessage.tokens.push(token);
      }

      lastMessage.tokens.sort((a, b) => a.sequenceNumber - b.sequenceNumber);
      if (lastMessage.tokens.length > 0) {
        const lastRunId =
          lastMessage.tokens[lastMessage.tokens.length - 1].runId;
        if (lastRunId) {
          lastMessage.tokens = lastMessage.tokens.filter(
            (c) => c.runId === lastRunId
          );
        }
      }

      if (!hasMetadata) {
        metadata = lastMessage.metadata;
      }

      if (hasContent || lastMessage.content.length > 0) {
        messageHistory[messageHistory.length - 1] = {
          ...lastMessage,
          type: ChatBotMessageType.AI,
          content: content ?? lastMessage.content,
          metadata,
          tokens: lastMessage.tokens,
        };
      } else {
        messageHistory[messageHistory.length - 1] = {
          ...lastMessage,
          type: ChatBotMessageType.AI,
          content: "",
          metadata,
          tokens: lastMessage.tokens,
        };
      }
    } else {
      if (hasContent) {
        const tokens = hasToken ? [token] : [];
        messageHistory.push({
          type: ChatBotMessageType.AI,
          content,
          metadata,
          tokens,
        });
      } else if (typeof token !== "undefined") {
        messageHistory.push({
          type: ChatBotMessageType.AI,
          content: token.value,
          metadata,
          tokens: [token],
        });
      }
    }
  } else {
    console.error(`Unrecognized type ${response.action}`);
  }
}

function pairwise(arr: ChatBotHistoryItem[], func) {
  for (var i = 0; i < arr.length - 1; i++) {
    func(arr[i], arr[i + 1])
  }
}

export function assembleHistory(history: ChatBotHistoryItem[]) {
  var hist: Object[] = [];
  for (var i = 0; i < history.length - 1; i++) {
    if (history[i].type == ChatBotMessageType.Human) {
      hist.push({ "user": history[i].content, "chatbot": history[i+1].content, "metadata" : JSON.stringify(history[i+1].metadata)})
    }
  }
  
  // pairwise(history, function (current: ChatBotHistoryItem, next: ChatBotHistoryItem) {
  //   hist.push({ "user": current.content, "chatbot": next.content })
  // })
  
  return hist;
}


export async function getSignedUrl(key: string) {
  const signedUrl = await Storage.get(key as string);
  return signedUrl;
}