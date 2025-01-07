import * as cdk from 'aws-cdk-lib';
import * as sfn from 'aws-cdk-lib/aws-stepfunctions';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as s3 from 'aws-cdk-lib/aws-s3';
import { Construct } from 'constructs';
import { Policy, PolicyDocument, PolicyStatement } from 'aws-cdk-lib/aws-iam';

interface CacheAmendmentsStackProps {
  amendmentFunction: lambda.Function;
  actsBucket: s3.Bucket;
}

export class CacheAmendments extends Construct {
  constructor(scope: Construct, id: string, props: CacheAmendmentsStackProps) {
    super(scope, id);

    const jsonDef = {
      "QueryLanguage": "JSONata",
      "Comment": "State Machine to cache all amendments",
      "StartAt": "S3 object keys",
      "States": {
        "S3 object keys": {
          "Type": "Map",
          "ItemProcessor": {
            "ProcessorConfig": {
              "Mode": "DISTRIBUTED",
              "ExecutionType": "STANDARD"
            },
            "StartAt": "Lambda Invoke",
            "States": {
              "Lambda Invoke": {
                "Type": "Task",
                "Resource": "arn:aws:states:::lambda:invoke",
                "Output": "{% $states.result.Payload %}",
                "Arguments": {
                  "FunctionName": props.amendmentFunction.functionName,
                  "Payload": {
                    "body": {
                      "year": "{% $split($states.input.Key, '/')[1] %}",
                      "chapter": "{% $substringBefore($substringAfter($split($states.input.Key, '/')[2], 'chapter-'), '.txt') %}"
                    }
                  }
                },
                "Retry": [
                  {
                    "ErrorEquals": [
                      "Lambda.ServiceException",
                      "Lambda.AWSLambdaException",
                      "Lambda.SdkClientException",
                      "Lambda.TooManyRequestsException"
                    ],
                    "IntervalSeconds": 1,
                    "MaxAttempts": 3,
                    "BackoffRate": 2,
                    "JitterStrategy": "FULL"
                  }
                ],
                "End": true
              }
            }
          },
          "ItemReader": {
            "Resource": "arn:aws:states:::s3:listObjectsV2",
            "Arguments": {
              "Bucket": props.actsBucket.bucketName,
              "Prefix": "acts/"
            }
          },
          "MaxConcurrency": 4,
          "Label": "S3objectkeys",
          "End": true,
          "ToleratedFailurePercentage": 50
        }
      }
    }

    // Define the state machine
    const stateMachine = new sfn.StateMachine(this, 'StateMachine', {
      definitionBody: sfn.DefinitionBody.fromString(JSON.stringify(jsonDef)),            
    });

    props.actsBucket.grantRead(stateMachine);
    props.amendmentFunction.grantInvoke(stateMachine);
    
    const policy = new Policy(this, 'sfn-map-policy', {
      document: new PolicyDocument({
        statements: [new PolicyStatement({ resources: [stateMachine.stateMachineArn], actions: ['states:StartExecution'] })],
      }),
    })

    policy.attachToRole(stateMachine.role)

  }
}