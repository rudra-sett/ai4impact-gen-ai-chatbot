import * as path from "path";
import * as cdk from "aws-cdk-lib";

import { Construct } from "constructs";
import { Duration, aws_apigatewayv2 as apigwv2 } from "aws-cdk-lib";

import * as cognito from "aws-cdk-lib/aws-cognito";
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as iam from "aws-cdk-lib/aws-iam";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as logs from "aws-cdk-lib/aws-logs";
import * as ssm from "aws-cdk-lib/aws-ssm";
// import { Shared } from "../shared";
import * as appsync from "aws-cdk-lib/aws-appsync";
// import { parse } from "graphql";
import { readFileSync } from "fs";
import * as s3 from "aws-cdk-lib/aws-s3";

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
    /*const appSyncLambdaResolver = new lambda.Function(
      this,
      "GraphQLApiHandler",
      {
        code: props.shared.sharedCode.bundleWithLambdaAsset(
          path.join(__dirname, "./functions/api-handler")
        ),
        handler: "index.handler",
        runtime: props.shared.pythonRuntime,
        architecture: props.shared.lambdaArchitecture,
        timeout: cdk.Duration.minutes(10),
        memorySize: 512,
        tracing: lambda.Tracing.ACTIVE,
        logRetention: logs.RetentionDays.ONE_WEEK,        
        environment: {          
        },
      }
    );

    function addPermissions(apiHandler: lambda.Function) {
      if (props.ragEngines?.workspacesTable) {
        props.ragEngines.workspacesTable.grantReadWriteData(apiHandler);
      }

      if (props.ragEngines?.documentsTable) {
        props.ragEngines.documentsTable.grantReadWriteData(apiHandler);
        props.ragEngines?.dataImport.rssIngestorFunction?.grantInvoke(
          apiHandler
        );
      }

      if (props.ragEngines?.auroraPgVector) {
        props.ragEngines.auroraPgVector.database.secret?.grantRead(apiHandler);
        props.ragEngines.auroraPgVector.database.connections.allowDefaultPortFrom(
          apiHandler
        );

        props.ragEngines.auroraPgVector.createAuroraWorkspaceWorkflow.grantStartExecution(
          apiHandler
        );
      }

      if (props.ragEngines?.openSearchVector) {
        apiHandler.addToRolePolicy(
          new iam.PolicyStatement({
            actions: ["aoss:APIAccessAll"],
            resources: [
              props.ragEngines?.openSearchVector.openSearchCollection.attrArn,
            ],
          })
        );

        props.ragEngines.openSearchVector.createOpenSearchWorkspaceWorkflow.grantStartExecution(
          apiHandler
        );
      }

      if (props.ragEngines?.kendraRetrieval) {
        props.ragEngines.kendraRetrieval.createKendraWorkspaceWorkflow.grantStartExecution(
          apiHandler
        );

        props.ragEngines?.kendraRetrieval?.kendraS3DataSourceBucket?.grantReadWrite(
          apiHandler
        );

        if (props.ragEngines.kendraRetrieval.kendraIndex) {
          apiHandler.addToRolePolicy(
            new iam.PolicyStatement({
              actions: [
                "kendra:Retrieve",
                "kendra:Query",
                "kendra:BatchDeleteDocument",
                "kendra:BatchPutDocument",
                "kendra:StartDataSourceSyncJob",
                "kendra:DescribeDataSourceSyncJob",
                "kendra:StopDataSourceSyncJob",
                "kendra:ListDataSourceSyncJobs",
                "kendra:ListDataSources",
                "kendra:DescribeIndex",
              ],
              resources: [
                props.ragEngines.kendraRetrieval.kendraIndex.attrArn,
                `${props.ragEngines.kendraRetrieval.kendraIndex.attrArn}/*`,
              ],
            })
          );
        }

        for (const item of props.config.rag.engines.kendra.external ?? []) {
          if (item.roleArn) {
            apiHandler.addToRolePolicy(
              new iam.PolicyStatement({
                actions: ["sts:AssumeRole"],
                resources: [item.roleArn],
              })
            );
          } else {
            apiHandler.addToRolePolicy(
              new iam.PolicyStatement({
                actions: ["kendra:Retrieve", "kendra:Query"],
                resources: [
                  `arn:${cdk.Aws.PARTITION}:kendra:${
                    item.region ?? cdk.Aws.REGION
                  }:${cdk.Aws.ACCOUNT_ID}:index/${item.kendraId}`,
                ],
              })
            );
          }
        }
      }

      if (props.ragEngines?.fileImportWorkflow) {
        props.ragEngines.fileImportWorkflow.grantStartExecution(apiHandler);
      }

      if (props.ragEngines?.websiteCrawlingWorkflow) {
        props.ragEngines.websiteCrawlingWorkflow.grantStartExecution(
          apiHandler
        );
      }

      if (props.ragEngines?.deleteWorkspaceWorkflow) {
        props.ragEngines.deleteWorkspaceWorkflow.grantStartExecution(
          apiHandler
        );
      }

      if (props.ragEngines?.sageMakerRagModels) {
        apiHandler.addToRolePolicy(
          new iam.PolicyStatement({
            actions: ["sagemaker:InvokeEndpoint"],
            resources: [props.ragEngines.sageMakerRagModels.model.endpoint.ref],
          })
        );
      }

      for (const model of props.models) {
        apiHandler.addToRolePolicy(
          new iam.PolicyStatement({
            actions: ["sagemaker:InvokeEndpoint"],
            resources: [model.endpoint.ref],
          })
        );
      }

      apiHandler.addToRolePolicy(
        new iam.PolicyStatement({
          actions: [
            "comprehend:DetectDominantLanguage",
            "comprehend:DetectSentiment",
          ],
          resources: ["*"],
        })
      );

      props.shared.xOriginVerifySecret.grantRead(apiHandler);
      props.shared.apiKeysSecret.grantRead(apiHandler);
      props.shared.configParameter.grantRead(apiHandler);
      props.modelsParameter.grantRead(apiHandler);
      props.sessionsTable.grantReadWriteData(apiHandler);
      props.userFeedbackBucket.grantReadWrite(apiHandler);
      props.ragEngines?.uploadBucket.grantReadWrite(apiHandler);
      props.ragEngines?.processingBucket.grantReadWrite(apiHandler);

      if (props.config.bedrock?.enabled) {
        apiHandler.addToRolePolicy(
          new iam.PolicyStatement({
            actions: [
              "bedrock:ListFoundationModels",
              "bedrock:ListCustomModels",
              "bedrock:InvokeModel",
              "bedrock:InvokeModelWithResponseStream",
            ],
            resources: ["*"],
          })
        );

        if (props.config.bedrock?.roleArn) {
          apiHandler.addToRolePolicy(
            new iam.PolicyStatement({
              actions: ["sts:AssumeRole"],
              resources: [props.config.bedrock.roleArn],
            })
          );
        }
      }
    }

    addPermissions(appSyncLambdaResolver);*/

  }
}
