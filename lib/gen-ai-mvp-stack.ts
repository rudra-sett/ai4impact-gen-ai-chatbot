import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { ChatBotApi } from "./chatbot-api";
import { cognitoDomainName } from "./constants"
import { AuthorizationStack } from "./authorization"
import { UserInterface } from "./user-interface"
import { DataStack } from "./pre-processing"
import { IndexingStack } from './indexing';

// import * as sqs from 'aws-cdk-lib/aws-sqs';

export class GenAiMvpStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // The code that defines your stack goes here

    // example resource
    // const queue = new sqs.Queue(this, 'GenAiMvpQueue', {
    //   visibilityTimeout: cdk.Duration.seconds(300)
    // });
    // let authentication;
    // if (AUTHENTICATION) {
    //   authentication = new AuthorizationStack(this, "Authorization")
    // }
    const authentication = new AuthorizationStack(this, "Authorization")
    const chatbotAPI = new ChatBotApi(this, "ChatbotAPI", {authentication});
    const userInterface = new UserInterface(this, "UserInterface",
     {userPoolId : authentication.userPool.userPoolId,
      userPoolClientId : authentication.userPoolClient.userPoolClientId,
      cognitoDomain : cognitoDomainName,
      api : chatbotAPI
    })
    const dataStack = new DataStack(this, "DataPipeline", {
      knowledgeBucket: chatbotAPI.filesBucket,
      amendmentFunction: chatbotAPI.amendmentFunction,
    });
    const indexingStack = new IndexingStack(this, "Indexing", {
      api: chatbotAPI
    });
    
  }
}
