import * as cdk from 'aws-cdk-lib';
import * as sfn from 'aws-cdk-lib/aws-stepfunctions';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as s3 from 'aws-cdk-lib/aws-s3';
import { Construct } from 'constructs';
import { Policy, PolicyDocument, PolicyStatement } from 'aws-cdk-lib/aws-iam';

interface VersionedActsStackProps {
  amendmentFunction: lambda.Function;
  insertAmendmentFunction: lambda.Function;
  actsBucket: s3.Bucket;
}

export class VersionedActsStack extends Construct {
  constructor(scope: Construct, id: string, props: VersionedActsStackProps) {
    super(scope, id);

    const jsonDef = {
      "StartAt": "S3 object keys",
      "QueryLanguage": "JSONata",
      "States": {
        "S3 object keys": {
          "Type": "Map",
          "ItemProcessor": {
            "ProcessorConfig": {
              "Mode": "DISTRIBUTED",
              "ExecutionType": "STANDARD"
            },
            "StartAt": "GetAmendments",
            "States": {
              "GetAmendments": {
                "Type": "Task",
                "Resource": "arn:aws:states:::aws-sdk:lambda:invoke",
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
                "Next": "TransformAmendmentList",
                "Assign": {
                  "original_year": "{% $split($states.input.Key, '/')[1] %}",
                  "original_chapter": "{% $substringBefore($substringAfter($split($states.input.Key, '/')[2], 'chapter-'), '.txt') %}"
                }
              },
              "TransformAmendmentList": {
                "Type": "Pass",
                "Next": "Choice",
                "Output": "{% $parse($parse($states.input.Payload).body) %}"
              },
              "Choice": {
                "Type": "Choice",
                "Choices": [
                  {
                    "Next": "Pass",
                    "Condition": "{% $not($exists($states.input[0])) %}"
                  }
                ],
                "Default": "Accumulator"
              },
              "Accumulator": {
                "Type": "Pass",
                "Next": "LoopAmendments",
                "Assign": {
                  "current_text": "",
                  "index": 0,
                  "amendments": "{% $states.input %}"
                }
              },
              "LoopAmendments": {
                "Type": "Choice",
                "Choices": [
                  {
                    "Next": "EndAmendmentsLoop",
                    "Condition": "{% $not($exists($amendments[$index])) %}"
                  }
                ],
                "Default": "CurrentTextExists",
                "Output": "{% \n$amendments[$index]\n\n%}"
              },
              "CurrentTextExists": {
                "Type": "Choice",
                "Choices": [
                  {
                    "Next": "PrepAmendmentWithPrevText",
                    "Condition": "{% $not($length($current_text) = 0) %}"
                  }
                ],
                "Default": "PrepareAmendmentForLambda"
              },
              "PrepAmendmentWithPrevText": {
                "Type": "Pass",
                "Output": {
                  "year": "{% $original_year %}",
                  "chapter": "{% $original_chapter %}",
                  "amend_year": "{% $split($states.input.amending_act, ' ')[-1] %}",
                  "amend_chapter": "{% $split($states.input.amending_act, ' ')[1] %}",
                  "client_text": "{% $current_text %}",
                  "use_key": "true"
                },
                "Next": "InsertAmendment"
              },
              "PrepareAmendmentForLambda": {
                "Type": "Pass",
                "Output": {
                  "year": "{% $original_year %}",
                  "chapter": "{% $original_chapter %}",
                  "amend_year": "{% $split($states.input.amending_act, ' ')[-1] %}",
                  "amend_chapter": "{% $split($states.input.amending_act, ' ')[1] %}",
                  "use_key": "true"
                },
                "Next": "InsertAmendment"
              },
              "InsertAmendment": {
                "Type": "Task",
                "Resource": "arn:aws:states:::lambda:invoke",
                "Output": "{% $states.result.Payload %}",
                "Arguments": {
                  "FunctionName": props.insertAmendmentFunction.functionName,
                  "Payload": {
                    "body": "{% $string($states.input) %}"
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
                "Assign": {
                  "current_text": "{% $parse($states.result.Payload.body) %}",
                  "index": "{% $index + 1 %}"
                },
                "Next": "LoopAmendments"
              },
              "EndAmendmentsLoop": {
                "Type": "Pass",
                "End": true
              },
              "Pass": {
                "Type": "Pass",
                "End": true
              }
            }
          },
          "ItemReader": {
            "Resource": "arn:aws:states:::s3:listObjectsV2",
            "Arguments": {
              "Bucket": props.actsBucket.bucketName,
              "Prefix": "acts/"
            },
            "ReaderConfig": {}
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
    props.insertAmendmentFunction.grantInvoke(stateMachine);
    
    const policy = new Policy(this, 'sfn-map-policy', {
      document: new PolicyDocument({
        statements: [new PolicyStatement({ resources: [stateMachine.stateMachineArn], actions: ['states:StartExecution'] })],
      }),
    })

    policy.attachToRole(stateMachine.role)

  }
}