
import * as cdk from "aws-cdk-lib";
import * as lambda from "aws-cdk-lib/aws-lambda"
import * as path from "path";

import { AuthorizationStack } from '../authorization'

import { WebsocketBackendAPI } from "./gateway/websocket-api"
import { RestBackendAPI } from "./gateway/rest-api"
import { LambdaFunctionStack } from "./functions/functions"
import { TableStack } from "./tables/tables"
import { KendraIndexStack } from "./kendra/kendra"
import { S3BucketStack } from "./buckets/buckets"

import { WebSocketLambdaIntegration } from 'aws-cdk-lib/aws-apigatewayv2-integrations';
import { HttpLambdaIntegration } from 'aws-cdk-lib/aws-apigatewayv2-integrations';
import { WebSocketLambdaAuthorizer, HttpUserPoolAuthorizer, HttpJwtAuthorizer  } from 'aws-cdk-lib/aws-apigatewayv2-authorizers';
import { aws_apigatewayv2 as apigwv2 } from "aws-cdk-lib";
import { Construct } from "constructs";

// import { NagSuppressions } from "cdk-nag";

export interface ChatBotApiProps {
  readonly authentication: AuthorizationStack; 
}

export class ChatBotApi extends Construct {
  /* Expose APIs to include endpoints in aws-exports.json*/
  public readonly httpAPI: RestBackendAPI;
  public readonly wsAPI: WebsocketBackendAPI;

  /* Expose these functions in order to create alarms for them */
  public readonly chatFunction : lambda.Function;
  public readonly sessionFunction : lambda.Function;
  public readonly feedbackFunction : lambda.Function;  
  public readonly zendeskSyncFunction : lambda.Function;

  constructor(scope: Construct, id: string, props: ChatBotApiProps) {
    super(scope, id);

    const tables = new TableStack(this, "TableStack");
    const buckets = new S3BucketStack(this, "BucketStack");
    const kendra = new KendraIndexStack(this, "KendraStack", { s3Bucket: buckets.kendraBucket, zendeskBucket : buckets.zendeskBucket });

    const restBackend = new RestBackendAPI(this, "RestBackend", {})
    this.httpAPI = restBackend;
    const websocketBackend = new WebsocketBackendAPI(this, "WebsocketBackend", {})
    this.wsAPI = websocketBackend;

    const lambdaFunctions = new LambdaFunctionStack(this, "LambdaFunctions",
      {
        wsApiEndpoint: websocketBackend.wsAPIStage.url,
        sessionTable: tables.historyTable,
        kendraIndex: kendra.kendraIndex,
        kendraSource: kendra.kendraSource,
        feedbackTable: tables.feedbackTable,
        feedbackBucket: buckets.feedbackBucket,
        knowledgeBucket: buckets.kendraBucket,
        zendeskBucket: buckets.zendeskBucket,
        zendeskSource: kendra.zendeskSource
      })

    this.chatFunction = lambdaFunctions.chatFunction;
    this.sessionFunction = lambdaFunctions.sessionFunction;
    this.feedbackFunction = lambdaFunctions.feedbackFunction;
    this.zendeskSyncFunction = lambdaFunctions.zendeskSyncFunction;

    const wsAuthorizer = new WebSocketLambdaAuthorizer('WebSocketAuthorizer', props.authentication.lambdaAuthorizer, {identitySource: ['route.request.querystring.Authorization']});

    websocketBackend.wsAPI.addRoute('getChatbotResponse', {
      integration: new WebSocketLambdaIntegration('chatbotResponseIntegration', lambdaFunctions.chatFunction),
      // authorizer: wsAuthorizer
    });
    websocketBackend.wsAPI.addRoute('$connect', {
      integration: new WebSocketLambdaIntegration('chatbotConnectionIntegration', lambdaFunctions.chatFunction),
      authorizer: wsAuthorizer
    });
    websocketBackend.wsAPI.addRoute('$default', {
      integration: new WebSocketLambdaIntegration('chatbotConnectionIntegration', lambdaFunctions.chatFunction),
      // authorizer: wsAuthorizer
    });
    websocketBackend.wsAPI.addRoute('$disconnect', {
      integration: new WebSocketLambdaIntegration('chatbotDisconnectionIntegration', lambdaFunctions.chatFunction),
      // authorizer: wsAuthorizer
    });
    websocketBackend.wsAPI.addRoute('generateEmail', {
      integration: new WebSocketLambdaIntegration('emailIntegration', lambdaFunctions.chatFunction),
      // authorizer: wsAuthorizer
    });

    websocketBackend.wsAPI.grantManageConnections(lambdaFunctions.chatFunction);

    
    const httpAuthorizer = new HttpJwtAuthorizer('HTTPAuthorizer', props.authentication.userPool.userPoolProviderUrl,{
      jwtAudience: [props.authentication.userPoolClient.userPoolClientId],
    })

    const sessionAPIIntegration = new HttpLambdaIntegration('SessionAPIIntegration', lambdaFunctions.sessionFunction);
    restBackend.restAPI.addRoutes({
      path: "/user-session",
      methods: [apigwv2.HttpMethod.GET, apigwv2.HttpMethod.POST, apigwv2.HttpMethod.DELETE],
      integration: sessionAPIIntegration,
      authorizer: httpAuthorizer,
    })

    // SESSION_HANDLER
    lambdaFunctions.chatFunction.addEnvironment(
      "SESSION_HANDLER", lambdaFunctions.sessionFunction.functionName)
    

    const feedbackAPIIntegration = new HttpLambdaIntegration('FeedbackAPIIntegration', lambdaFunctions.feedbackFunction);
    restBackend.restAPI.addRoutes({
      path: "/user-feedback",
      methods: [apigwv2.HttpMethod.GET, apigwv2.HttpMethod.POST, apigwv2.HttpMethod.DELETE],
      integration: feedbackAPIIntegration,
      authorizer: httpAuthorizer,
    })

    const feedbackAPIDownloadIntegration = new HttpLambdaIntegration('FeedbackDownloadAPIIntegration', lambdaFunctions.feedbackFunction);
    restBackend.restAPI.addRoutes({
      path: "/user-feedback/download-feedback",
      methods: [apigwv2.HttpMethod.POST],
      integration: feedbackAPIDownloadIntegration,
      authorizer: httpAuthorizer,
    })

    const s3GetAPIIntegration = new HttpLambdaIntegration('S3GetAPIIntegration', lambdaFunctions.getS3Function);
    restBackend.restAPI.addRoutes({
      path: "/s3-bucket-data",
      methods: [apigwv2.HttpMethod.POST],
      integration: s3GetAPIIntegration,
      authorizer: httpAuthorizer,
    })

    const s3DeleteAPIIntegration = new HttpLambdaIntegration('S3DeleteAPIIntegration', lambdaFunctions.deleteS3Function);
    restBackend.restAPI.addRoutes({
      path: "/delete-s3-file",
      methods: [apigwv2.HttpMethod.POST],
      integration: s3DeleteAPIIntegration,
      authorizer: httpAuthorizer,
    })

    const s3UploadAPIIntegration = new HttpLambdaIntegration('S3UploadAPIIntegration', lambdaFunctions.uploadS3Function);
    restBackend.restAPI.addRoutes({
      path: "/signed-url",
      methods: [apigwv2.HttpMethod.POST],
      integration: s3UploadAPIIntegration,
      authorizer: httpAuthorizer,
    })

    const kendraSyncProgressAPIIntegration = new HttpLambdaIntegration('KendraSyncAPIIntegration', lambdaFunctions.syncKendraFunction);
    restBackend.restAPI.addRoutes({
      path: "/kendra-sync/still-syncing",
      methods: [apigwv2.HttpMethod.GET],
      integration: kendraSyncProgressAPIIntegration,
      authorizer: httpAuthorizer,
    })

    const kendraSyncAPIIntegration = new HttpLambdaIntegration('KendraSyncAPIIntegration', lambdaFunctions.syncKendraFunction);
    restBackend.restAPI.addRoutes({
      path: "/kendra-sync/sync-kendra",
      methods: [apigwv2.HttpMethod.GET],
      integration: kendraSyncAPIIntegration,
      authorizer: httpAuthorizer,
    })

    const kendraLastSyncAPIIntegration = new HttpLambdaIntegration('KendraLastSyncAPIIntegration', lambdaFunctions.syncKendraFunction);
    restBackend.restAPI.addRoutes({
      path: "/kendra-sync/get-last-sync",
      methods: [apigwv2.HttpMethod.GET],
      integration: kendraLastSyncAPIIntegration,
      authorizer: httpAuthorizer,
    })
    


      // this.wsAPI = websocketBackend.wsAPI;




    // const api = new appsync.GraphqlApi(this, "ChatbotApi", {
    //   name: "ChatbotGraphqlApi",
    //   definition: appsync.Definition.fromFile(
    //     path.join(__dirname, "schema/schema.graphql")
    //   ),
    //   authorizationConfig: {
    //     additionalAuthorizationModes: [
    //       {
    //         authorizationType: appsync.AuthorizationType.IAM,
    //       },
    //       {
    //         authorizationType: appsync.AuthorizationType.USER_POOL,
    //         userPoolConfig: {
    //           userPool: props.userPool,
    //         },
    //       },
    //     ],
    //   },
    //   logConfig: {
    //     fieldLogLevel: appsync.FieldLogLevel.ALL,
    //     retention: RetentionDays.ONE_WEEK,
    //     role: loggingRole,
    //   },
    //   xrayEnabled: true,
    //   visibility: props.config.privateWebsite ? appsync.Visibility.PRIVATE : appsync.Visibility.GLOBAL
    // });

    // new ApiResolvers(this, "RestApi", {
    //   ...props,
    //   sessionsTable: chatTables.sessionsTable,
    //   byUserIdIndex: chatTables.byUserIdIndex,
    //   api,
    //   userFeedbackBucket: chatBuckets.userFeedbackBucket,
    // });

    // const realtimeBackend = new RealtimeGraphqlApiBackend(this, "Realtime", {
    //   ...props,
    //   api,
    // });

    // realtimeBackend.resolvers.outgoingMessageHandler.addEnvironment(
    //   "GRAPHQL_ENDPOINT",
    //   api.graphqlUrl
    // );

    // api.grantMutation(realtimeBackend.resolvers.outgoingMessageHandler);

    // // Prints out URL
    // new cdk.CfnOutput(this, "GraphqlAPIURL", {
    //   value: api.graphqlUrl,
    // });

    // // Prints out the AppSync GraphQL API key to the terminal
    new cdk.CfnOutput(this, "WS-API - apiEndpoint", {
      value: websocketBackend.wsAPI.apiEndpoint || "",
    });
    new cdk.CfnOutput(this, "HTTP-API - apiEndpoint", {
      value: restBackend.restAPI.apiEndpoint || "",
    });

    // this.messagesTopic = realtimeBackend.messagesTopic;
    // this.sessionsTable = chatTables.sessionsTable;
    // this.byUserIdIndex = chatTables.byUserIdIndex;
    // this.userFeedbackBucket = chatBuckets.userFeedbackBucket;
    // this.filesBucket = chatBuckets.filesBucket;
    // this.graphqlApi = api;

    /**
     * CDK NAG suppression
     */
    // NagSuppressions.addResourceSuppressions(loggingRole, [
    //   {
    //     id: "AwsSolutions-IAM5",
    //     reason:
    //       "Access to all log groups required for CloudWatch log group creation.",
    //   },
    // ]);
  }
}
