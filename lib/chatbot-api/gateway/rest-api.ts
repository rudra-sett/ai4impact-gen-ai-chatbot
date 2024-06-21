import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";
import { Duration, aws_apigatewayv2 as apigwv2 } from "aws-cdk-lib";

export interface RestBackendAPIProps {

}

export class RestBackendAPI extends Construct {
  public readonly restAPI: apigwv2.HttpApi;
  constructor(scope: Construct, id: string, props: RestBackendAPIProps) {
    super(scope, id);

    const httpApi = new apigwv2.HttpApi(this, 'HTTP-API', {
      corsPreflight: {
        allowHeaders: ['*'],
        allowMethods: [
          apigwv2.CorsHttpMethod.GET,
          apigwv2.CorsHttpMethod.HEAD,
          apigwv2.CorsHttpMethod.OPTIONS,
          apigwv2.CorsHttpMethod.POST,
          apigwv2.CorsHttpMethod.DELETE,
        ],
        allowOrigins: ['*'],
        maxAge: Duration.days(10),
      },
    });
    this.restAPI = httpApi;    

  }
}
