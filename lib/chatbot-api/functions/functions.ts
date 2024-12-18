import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as path from 'path';

// Import Lambda L2 construct
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as iam from 'aws-cdk-lib/aws-iam';
import { Table } from 'aws-cdk-lib/aws-dynamodb';
import * as s3 from "aws-cdk-lib/aws-s3";
import * as bedrock from "aws-cdk-lib/aws-bedrock";
import { aws_opensearchserverless as opensearchserverless } from 'aws-cdk-lib';

import { stackName } from "../../constants"

interface LambdaFunctionStackProps {
  readonly wsApiEndpoint: string;
  readonly sessionTable: Table;
  readonly feedbackTable: Table;
  readonly amendmentTable: Table;
  readonly feedbackBucket: s3.Bucket;
  readonly knowledgeBucket: s3.Bucket;
  readonly knowledgeBase: bedrock.CfnKnowledgeBase;
  readonly knowledgeBaseSource: bedrock.CfnDataSource;
  readonly openSearch: opensearchserverless.CfnCollection
}

export class LambdaFunctionStack extends cdk.Stack {
  public readonly chatFunction: lambda.Function;
  public readonly sessionFunction: lambda.Function;
  public readonly feedbackFunction: lambda.Function;
  public readonly deleteS3Function: lambda.Function;
  public readonly getS3Function: lambda.Function;
  public readonly uploadS3Function: lambda.Function;
  public readonly syncKBFunction: lambda.Function;
  public readonly retrieveActFunction: lambda.Function;
  public readonly searchLawsFunction: lambda.Function;
  public readonly amendmentsFunction : lambda.Function;
  public readonly insertAmendmentFunction : lambda.Function;

  constructor(scope: Construct, id: string, props: LambdaFunctionStackProps) {
    super(scope, id);

    const insertAmendmentFunction = new lambda.Function(scope, 'InsertAmendmentFunction', {
      runtime: lambda.Runtime.PYTHON_3_12, 
      code: lambda.Code.fromAsset(path.join(__dirname, 'insert-amendment'), {
        bundling: {
          image: lambda.Runtime.NODEJS_20_X.bundlingImage,
          command: [
            'bash', '-c',
              'pip install -r requirements.txt -t /asset-output && cp -au . /asset-output'
          ],
        },
      }), 
      handler: 'lambda_function.lambda_handler', 
      environment: {
        "BUCKET": props.knowledgeBucket.bucketName,
        "DDB_TABLE_NAME": props.amendmentTable.tableName
      },
      timeout: cdk.Duration.seconds(30)
    });

    insertAmendmentFunction.addToRolePolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        'bedrock:InvokeModel'
      ],
      resources: ['*']
    }));

    insertAmendmentFunction.addToRolePolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        's3:*'
      ],
      resources: ["arn:aws:s3:::glo-processed", "arn:aws:s3:::glo-processed/*",props.knowledgeBucket.bucketArn, props.knowledgeBucket.bucketArn + "/*" ]
    }));

    insertAmendmentFunction.addToRolePolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        'dynamodb:GetItem',
        'dynamodb:PutItem',
        'dynamodb:UpdateItem',
        'dynamodb:DeleteItem',
        'dynamodb:Query',
        'dynamodb:Scan'
      ],
      resources: [props.amendmentTable.tableArn, props.amendmentTable.tableArn + "/index/*"]
    }));

    this.insertAmendmentFunction = insertAmendmentFunction;

    const searchLawsFunction = new lambda.Function(scope, 'LawSearchFunction', {
      runtime: lambda.Runtime.PYTHON_3_12, // Choose any supported Node.js runtime
      code: lambda.Code.fromAsset(path.join(__dirname, 'search-laws')), // Points to the lambda directory
      handler: 'lambda_function.lambda_handler', // Points to the 'hello' file in the lambda directory
      environment: {
        "KB_ID": props.knowledgeBase.attrKnowledgeBaseId
      },
      timeout: cdk.Duration.seconds(30)
    });

    searchLawsFunction.addToRolePolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        'bedrock:Retrieve'
      ],
      resources: [props.knowledgeBase.attrKnowledgeBaseArn]
    }));

    this.searchLawsFunction = searchLawsFunction;

    const retrieveActFunction = new lambda.Function(scope, 'ActRetrievalFunction', {
      runtime: lambda.Runtime.PYTHON_3_12, // Choose any supported Node.js runtime
      code: lambda.Code.fromAsset(path.join(__dirname, 'retrieve-act')), // Points to the lambda directory
      handler: 'lambda_function.lambda_handler', // Points to the 'hello' file in the lambda directory
      environment: {
        "ACTS_BUCKET": props.knowledgeBucket.bucketName
      },
      timeout: cdk.Duration.seconds(30)
    });

    retrieveActFunction.addToRolePolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        's3:*'
      ],
      resources: ["arn:aws:s3:::glo-processed", "arn:aws:s3:::glo-processed/*",props.knowledgeBucket.bucketArn, props.knowledgeBucket.bucketArn + "/*"]
    }));

    this.retrieveActFunction = retrieveActFunction;

    const sessionAPIHandlerFunction = new lambda.Function(scope, 'SessionHandlerFunction', {
      runtime: lambda.Runtime.PYTHON_3_12, // Choose any supported Node.js runtime
      code: lambda.Code.fromAsset(path.join(__dirname, 'session-handler')), // Points to the lambda directory
      handler: 'lambda_function.lambda_handler', // Points to the 'hello' file in the lambda directory
      environment: {
        "DDB_TABLE_NAME": props.sessionTable.tableName
      },
      timeout: cdk.Duration.seconds(30)
    });

    sessionAPIHandlerFunction.addToRolePolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        'dynamodb:GetItem',
        'dynamodb:PutItem',
        'dynamodb:UpdateItem',
        'dynamodb:DeleteItem',
        'dynamodb:Query',
        'dynamodb:Scan'
      ],
      resources: [props.sessionTable.tableArn, props.sessionTable.tableArn + "/index/*"]
    }));

    this.sessionFunction = sessionAPIHandlerFunction;

    // new function to handle amendments - separated out from the websocket handler
    // to allow for separate efficiency improvements and to avoid using a websocket for it
    // also allows for a queue-based pipeline to cache all amendments
    const amendmentFunction = new lambda.Function(scope, 'AmendmentFunction', {
      runtime: lambda.Runtime.NODEJS_20_X, // Choose any supported Node.js runtime
      code: lambda.Code.fromAsset(path.join(__dirname, 'get-amendments'), {
        bundling: {
          image: lambda.Runtime.NODEJS_20_X.bundlingImage,
          command: [
            'bash', '-c',
            `cp -aur . /asset-output &&
                 cd /asset-output &&
                 mkdir .npm &&
                 export npm_config_cache=.npm &&
                 npm install`,
          ],
        },
      }), // Points to the lambda directory
      handler: 'index.handler', // Points to the 'hello' file in the lambda directory
      environment: {                        
        "OPENSEARCH_ENDPOINT": props.openSearch.attrCollectionEndpoint,
        "AMENDMENT_TABLE": props.amendmentTable.tableName
      },
      timeout: cdk.Duration.seconds(300)
    });

    amendmentFunction.addToRolePolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        'bedrock:InvokeModelWithResponseStream',
        'bedrock:InvokeModel',

      ],
      resources: ["*"]
    }));

    amendmentFunction.addToRolePolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        'aoss:BatchGetCollection',
        'aoss:APIAccessAll'
      ],
      resources: ["*"]
    }));

    const amendmentFunctionAccessPolicy = new opensearchserverless.CfnAccessPolicy(scope, "AFOSSAccessPolicy", {
      name: `${stackName.toLowerCase().slice(0, 8)}-af-oss-access-policy`,
      type: "data",
      policy: JSON.stringify([
        {
          "Rules": [
            {
              "ResourceType": "index",
              "Resource": [
                `index/${stackName.toLowerCase()}-oss-collection/*`,
              ],
              "Permission": [
                "aoss:UpdateIndex",
                "aoss:DescribeIndex",
                "aoss:ReadDocument",
                "aoss:WriteDocument",
                "aoss:CreateIndex",
              ],
            },
            {
              "ResourceType": "collection",
              "Resource": [
                `collection/${stackName.toLowerCase()}-oss-collection`,
              ],
              "Permission": [
                "aoss:DescribeCollectionItems",
                "aoss:CreateCollectionItems",
                "aoss:UpdateCollectionItems",
              ],
            },
          ],
          "Principal": [amendmentFunction.role?.roleArn]
        }
      ])
    })

    amendmentFunction.addToRolePolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        'dynamodb:GetItem',
        'dynamodb:PutItem',
        'dynamodb:UpdateItem',
        'dynamodb:DeleteItem',
        'dynamodb:Query',
        'dynamodb:Scan'
      ],
      resources: [props.amendmentTable.tableArn, props.amendmentTable.tableArn + "/index/*"]
    }));

    this.amendmentsFunction = amendmentFunction;
  
    // Define the Lambda function resource
    const websocketAPIFunction = new lambda.Function(scope, 'ChatHandlerFunction', {
      runtime: lambda.Runtime.NODEJS_20_X, // Choose any supported Node.js runtime
      code: lambda.Code.fromAsset(path.join(__dirname, 'websocket-chat'), {
        bundling: {
          image: lambda.Runtime.NODEJS_20_X.bundlingImage,
          command: [
            'bash', '-c',
            `cp -aur . /asset-output &&
                 cd /asset-output &&
                 mkdir .npm &&
                 export npm_config_cache=.npm &&
                 npm install`,
          ],
        },
      }), // Points to the lambda directory
      handler: 'index.handler', // Points to the 'hello' file in the lambda directory
      environment: {
        "WEBSOCKET_API_ENDPOINT": props.wsApiEndpoint.replace("wss", "https"),
        "PROMPT": `You are a helpful AI chatbot that will answer questions related to Acts and Resolves based on your knowledge. 
            You have access to a search tool that you will use to look up answers to questions. If a user asks for a specific chapter, use the chapter retrieval tool rather than the general search tool.
            In general, prioritize using the tool that looks for a specific act. If the user asks a follow-up question that references a specific act, use the get_act_or_resolve tool.

            Essentially, any time a specific year and chapter are mentioned, you should try to use the tool for retrieving a specfic act or resolve and explain the result.
            Next, If you retrieve any act directly, explain the act's content, list out any amendments this act makes, and also do an additional search using the find references tool for any acts that amend the current act.
            If a user asks follow-up questions about a specific act you have retrieved, make sure to answer it by retrieving the act again. Do not use the keyword search tool. 
            
            If the user directly asks what acts amend a specific act, resolve, or general law, use the tool for that as well.`,
        'KB_ID': props.knowledgeBase.attrKnowledgeBaseId,
        "OPENSEARCH_ENDPOINT": props.openSearch.attrCollectionEndpoint,
        "AMENDMENT_TABLE": props.amendmentTable.tableName
      },
      timeout: cdk.Duration.seconds(300)
    });
    websocketAPIFunction.addToRolePolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        'bedrock:InvokeModelWithResponseStream',
        'bedrock:InvokeModel',

      ],
      resources: ["*"]
    }));
    websocketAPIFunction.addToRolePolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        'bedrock:Retrieve'
      ],
      resources: [props.knowledgeBase.attrKnowledgeBaseArn]
    }));

    websocketAPIFunction.addToRolePolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        'lambda:InvokeFunction'
      ],
      resources: [this.sessionFunction.functionArn]
    }));

    websocketAPIFunction.addToRolePolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        's3:GetObject',
        's3:ListBucket'
      ],
      resources: ["arn:aws:s3:::glo-processed", "arn:aws:s3:::glo-processed/*"]
    }));

    websocketAPIFunction.addToRolePolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        'aoss:BatchGetCollection',
        'aoss:APIAccessAll'
      ],
      resources: ["*"]
    }));

    const wsAccessPolicy = new opensearchserverless.CfnAccessPolicy(scope, "WSOSSAccessPolicy", {
      name: `${stackName.toLowerCase().slice(0, 8)}-ws-oss-access-policy`,
      type: "data",
      policy: JSON.stringify([
        {
          "Rules": [
            {
              "ResourceType": "index",
              "Resource": [
                `index/${stackName.toLowerCase()}-oss-collection/*`,
              ],
              "Permission": [
                "aoss:UpdateIndex",
                "aoss:DescribeIndex",
                "aoss:ReadDocument",
                "aoss:WriteDocument",
                "aoss:CreateIndex",
              ],
            },
            {
              "ResourceType": "collection",
              "Resource": [
                `collection/${stackName.toLowerCase()}-oss-collection`,
              ],
              "Permission": [
                "aoss:DescribeCollectionItems",
                "aoss:CreateCollectionItems",
                "aoss:UpdateCollectionItems",
              ],
            },
          ],
          "Principal": [websocketAPIFunction.role?.roleArn]
        }
      ])
    })

    websocketAPIFunction.addToRolePolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        'dynamodb:GetItem',
        'dynamodb:PutItem',
        'dynamodb:UpdateItem',
        'dynamodb:DeleteItem',
        'dynamodb:Query',
        'dynamodb:Scan'
      ],
      resources: [props.amendmentTable.tableArn, props.amendmentTable.tableArn + "/index/*"]
    }));

    this.chatFunction = websocketAPIFunction;

    const feedbackAPIHandlerFunction = new lambda.Function(scope, 'FeedbackHandlerFunction', {
      runtime: lambda.Runtime.PYTHON_3_12, // Choose any supported Node.js runtime
      code: lambda.Code.fromAsset(path.join(__dirname, 'feedback-handler')), // Points to the lambda directory
      handler: 'lambda_function.lambda_handler', // Points to the 'hello' file in the lambda directory
      environment: {
        "FEEDBACK_TABLE": props.feedbackTable.tableName,
        "FEEDBACK_S3_DOWNLOAD": props.feedbackBucket.bucketName
      },
      timeout: cdk.Duration.seconds(30)
    });

    feedbackAPIHandlerFunction.addToRolePolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        'dynamodb:GetItem',
        'dynamodb:PutItem',
        'dynamodb:UpdateItem',
        'dynamodb:DeleteItem',
        'dynamodb:Query',
        'dynamodb:Scan'
      ],
      resources: [props.feedbackTable.tableArn, props.feedbackTable.tableArn + "/index/*"]
    }));

    feedbackAPIHandlerFunction.addToRolePolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        's3:*'
      ],
      resources: [props.feedbackBucket.bucketArn, props.feedbackBucket.bucketArn + "/*"]
    }));

    this.feedbackFunction = feedbackAPIHandlerFunction;

    const deleteS3APIHandlerFunction = new lambda.Function(scope, 'DeleteS3FilesHandlerFunction', {
      runtime: lambda.Runtime.PYTHON_3_12, // Choose any supported Node.js runtime
      code: lambda.Code.fromAsset(path.join(__dirname, 'knowledge-management/delete-s3')), // Points to the lambda directory
      handler: 'lambda_function.lambda_handler', // Points to the 'hello' file in the lambda directory
      environment: {
        "BUCKET": props.knowledgeBucket.bucketName,
      },
      timeout: cdk.Duration.seconds(30)
    });

    deleteS3APIHandlerFunction.addToRolePolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        's3:*'
      ],
      resources: [props.knowledgeBucket.bucketArn, props.knowledgeBucket.bucketArn + "/*"]
    }));
    this.deleteS3Function = deleteS3APIHandlerFunction;

    const getS3APIHandlerFunction = new lambda.Function(scope, 'GetS3FilesHandlerFunction', {
      runtime: lambda.Runtime.NODEJS_20_X, // Choose any supported Node.js runtime
      code: lambda.Code.fromAsset(path.join(__dirname, 'knowledge-management/get-s3')), // Points to the lambda directory
      handler: 'index.handler', // Points to the 'hello' file in the lambda directory
      environment: {
        "BUCKET": props.knowledgeBucket.bucketName,
      },
      timeout: cdk.Duration.seconds(30)
    });

    getS3APIHandlerFunction.addToRolePolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        's3:*'
      ],
      resources: [props.knowledgeBucket.bucketArn, props.knowledgeBucket.bucketArn + "/*"]
    }));
    this.getS3Function = getS3APIHandlerFunction;


    const kbSyncAPIHandlerFunction = new lambda.Function(scope, 'SyncKBHandlerFunction', {
      runtime: lambda.Runtime.PYTHON_3_12, // Choose any supported Node.js runtime
      code: lambda.Code.fromAsset(path.join(__dirname, 'knowledge-management/kb-sync')), // Points to the lambda directory
      handler: 'lambda_function.lambda_handler', // Points to the 'hello' file in the lambda directory
      environment: {
        "KB_ID": props.knowledgeBase.attrKnowledgeBaseId,
        "SOURCE": props.knowledgeBaseSource.attrDataSourceId
      },
      timeout: cdk.Duration.seconds(30)
    });

    kbSyncAPIHandlerFunction.addToRolePolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        'bedrock:*'
      ],
      resources: [props.knowledgeBase.attrKnowledgeBaseArn]
    }));
    this.syncKBFunction = kbSyncAPIHandlerFunction;

    const uploadS3APIHandlerFunction = new lambda.Function(scope, 'UploadS3FilesHandlerFunction', {
      runtime: lambda.Runtime.NODEJS_20_X, // Choose any supported Node.js runtime
      code: lambda.Code.fromAsset(path.join(__dirname, 'knowledge-management/upload-s3')), // Points to the lambda directory
      handler: 'index.handler', // Points to the 'hello' file in the lambda directory
      environment: {
        "BUCKET": props.knowledgeBucket.bucketName,
      },
      timeout: cdk.Duration.seconds(30)
    });

    uploadS3APIHandlerFunction.addToRolePolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        's3:*'
      ],
      resources: [props.knowledgeBucket.bucketArn, props.knowledgeBucket.bucketArn + "/*"]
    }));
    this.uploadS3Function = uploadS3APIHandlerFunction;

  }
}
