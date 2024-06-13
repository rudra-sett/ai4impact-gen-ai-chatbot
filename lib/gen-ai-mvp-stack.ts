import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { ChatBotApi } from "./chatbot-api";
import { AUTHENTICATION, cognitoDomainName } from "./constants"
import { AuthorizationStack } from "./authorization"
import { UserInterface } from "./user-interface"
import { LoggingStack } from './logging';

// import * as sqs from 'aws-cdk-lib/aws-sqs';

export class GenAiMvpStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // The code that defines your stack goes here

    /** The authorization module 
     * Authentication is generally pretty hard to remove because sessions and feedback
     * rely on users having their own user IDs
    */
    const authentication = new AuthorizationStack(this, "Authorization")
    /** The API/backend module
     * This contains the Lambda functions, Kendra Index, S3 Buckets, DynamoDB tables, etc.
     */
    const chatbotAPI = new ChatBotApi(this, "ChatbotAPI", { authentication });

    /** Deploys a CloudFront Distribution for the webpage */
    const userInterface = new UserInterface(this, "UserInterface",
      {
        userPoolId: authentication.userPool.userPoolId,
        userPoolClientId: authentication.userPoolClient.userPoolClientId,
        cognitoDomain: cognitoDomainName,
        api: chatbotAPI
      })

    /** Deploys Alarms to alert designated people/teams of frequent errors */
    const logger = new LoggingStack(this, "LoggingStack", {
      feedbackFunction: chatbotAPI.feedbackFunction,
      chatFunction: chatbotAPI.chatFunction,
      sessionFunction: chatbotAPI.sessionFunction,
      zendeskFunction: chatbotAPI.zendeskSyncFunction,
    });

    /** The logger will attempt to execute the lambda functions in order to
     * create the log groups the logger stack needs. The lambda functions/entire backend
     * need to exist before this stack can run at all
     */
    logger.node.addDependency(chatbotAPI)


  }
}
