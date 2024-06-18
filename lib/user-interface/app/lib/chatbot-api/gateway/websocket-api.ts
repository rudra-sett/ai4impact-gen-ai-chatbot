import * as cdk from "aws-cdk-lib";
import { aws_apigatewayv2 as apigwv2 } from "aws-cdk-lib";
import { Construct } from "constructs";

// import { NagSuppressions } from "cdk-nag";

interface WebsocketBackendAPIProps {  
  // readonly userPool: UserPool;
  // readonly api: appsync.GraphqlApi;
}

export class WebsocketBackendAPI extends Construct {
  public readonly wsAPI : apigwv2.WebSocketApi;
  public readonly wsAPIStage : apigwv2.WebSocketStage;
  constructor(
    scope: Construct,
    id: string,
    props: WebsocketBackendAPIProps
  ) {
    super(scope, id);
    // Create the main Message Topic acting as a message bus
    const webSocketApi = new apigwv2.WebSocketApi(this, 'WS-API');
    const webSocketApiStage =  new apigwv2.WebSocketStage(this, 'WS-API-prod', {
      webSocketApi,
      stageName: 'prod',
      autoDeploy: true,      
    });
    
    this.wsAPI = webSocketApi;
    this.wsAPIStage = webSocketApiStage;
    
  }

}
