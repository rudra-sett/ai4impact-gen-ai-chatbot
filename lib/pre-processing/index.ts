import * as cdk from 'aws-cdk-lib';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as sqs from 'aws-cdk-lib/aws-sqs';
import * as scheduler from 'aws-cdk-lib/aws-scheduler';
import * as sfn from 'aws-cdk-lib/aws-stepfunctions';
import { Construct } from 'constructs';
import { SqsEventSource } from 'aws-cdk-lib/aws-lambda-event-sources';

import { PDFPipelineStack } from './pdf-pipeline'
import { WebPipelineStack } from './web-pipeline'
import { ChatBotApi } from '../chatbot-api'
import { Effect, Policy, PolicyDocument, PolicyStatement, Role, ServicePrincipal } from 'aws-cdk-lib/aws-iam';

export interface DataStackProps {
  readonly api: ChatBotApi;
}

export class DataStack extends Construct {

  constructor(scope: Construct, id: string, props: DataStackProps) {
    super(scope, id);

    const inputBucket = new s3.Bucket(this, 'InputBucket', {
      versioned: true,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    const pdfQueue = new sqs.Queue(this, 'PDFQueue', {
      fifo: true,
      visibilityTimeout: cdk.Duration.minutes(30)
    });


    const pdfPipeline = new PDFPipelineStack(this, 'PDFPipelineStack', {
      inputBucket: inputBucket,
      pdfQueue: pdfQueue,
      outputBucket: props.api.filesBucket
    })


    const yearQueue = new sqs.Queue(this, 'YearQueue', {
      fifo: true,
      visibilityTimeout: cdk.Duration.minutes(30)
    });

    /*
      1. the amendment refresh queue is a FIFO queue that should be used to re-process any acts. 
         primarily, this will be used to refresh the data for acts that are newly amended by a crawl
      2. the state machine will read messages from the queue, process them, and delete them
      3. the webpipeline will add older acts that require refreshing to the queue as it pulls in new data
      4. an eventbridge scheduler will trigger the state machine every few hours to work through the queue
      4a. this is definitely not the most efficient, but the alternative was to use a dynanmoDB table to track acts that need
          refreshing, which would have been more expensive. 
    */

    const amendmentQueue = new sqs.Queue(this, 'AmendmentRefreshQueue', {
      fifo: true,
      visibilityTimeout: cdk.Duration.minutes(30),
    });

    const amendmentRefreshMachineDefinition = {
      "Comment": "Processes messages from the AmendmentsRefreshQueue to refresh amendment lists and chapter versions",
      "StartAt": "Read messages from SQS queue",
      "QueryLanguage": "JSONata",
      "States": {
        "Read messages from SQS queue": {
          "Type": "Task",
          "Resource": "arn:aws:states:::aws-sdk:sqs:receiveMessage",
          "Next": "Are there messages to process?",
          "Arguments": {
            "QueueUrl": amendmentQueue.queueUrl,
            "AttributeNames": [
              "All"
            ],
            "MaxNumberOfMessages": 10,
            "VisibilityTimeout": 1800,
            "WaitTimeSeconds": 20
          }
        },
        "Are there messages to process?": {
          "Type": "Choice",
          "Default": "Finish",
          "Choices": [
            {
              "Next": "Process Messages",
              "Condition": "{% $exists($states.input.Messages) %}"
            }
          ]
        },
        "Process Messages": {
          "Type": "Map",
          "Next": "Finish",
          "ItemProcessor": {
            "StartAt": "GetAmendments",
            "ProcessorConfig": {
              "Mode": "DISTRIBUTED",
              "ExecutionType": "STANDARD"
            },
            "States": {
              "GetAmendments": {
                "Type": "Task",
                "Resource": "arn:aws:states:::aws-sdk:lambda:invoke",
                "Arguments": {
                  "FunctionName": props.api.amendmentFunction.functionName,
                  "Payload": {
                    "body": {
                      "year": "{% $parse($states.input.Body).year %}",
                      "chapter": "{% $parse($states.input.Body).chapter %}",
                      "overwrite": "true"
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
                  "original_year": "{% $parse($states.input.Body).year %}",
                  "original_chapter": "{% $parse($states.input.Body).chapter %}",
                  "ReceiptHandle": "{% $states.input.ReceiptHandle %}"
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
                  "use_key": "true",
                  "overwrite": "true"
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
                  "use_key": "true",
                  "overwrite": "true"
                },
                "Next": "InsertAmendment"
              },
              "InsertAmendment": {
                "Type": "Task",
                "Resource": "arn:aws:states:::lambda:invoke",
                "Output": "{% $states.result.Payload %}",
                "Arguments": {
                  "FunctionName": props.api.insertAmendmentFunction.functionName,
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
                "Next": "DeleteMessage"
              },
              "Pass": {
                "Type": "Pass",
                "Next": "DeleteMessage"
              },
              "DeleteMessage": {
                "Type": "Task",
                "Arguments": {
                  "QueueUrl": amendmentQueue.queueUrl,
                  "ReceiptHandle": "{% $ReceiptHandle %}"
                },
                "Resource": "arn:aws:states:::aws-sdk:sqs:deleteMessage",
                "End": true
              }
            }
          },
          "Items": "{% $states.input.Messages %}",
          "Label": "ProcessMessages",
          "MaxConcurrency": 4,
          "ToleratedFailurePercentage": 50
        },
        "Finish": {
          "Type": "Succeed"
        }
      }
    }

    const amendmentRefreshMachine = new sfn.StateMachine(this, 'StateMachine', {
      definitionBody: sfn.DefinitionBody.fromString(JSON.stringify(amendmentRefreshMachineDefinition)),
    });

    amendmentQueue.grantConsumeMessages(amendmentRefreshMachine)
    props.api.amendmentFunction.grantInvoke(amendmentRefreshMachine)
    props.api.insertAmendmentFunction.grantInvoke(amendmentRefreshMachine)

    const policy = new Policy(this, 'statemachine-policy', {
      document: new PolicyDocument({
        statements: [new PolicyStatement({ resources: [amendmentRefreshMachine.stateMachineArn], actions: ['states:*'] })],
      }),
    })

    const refreshQueuePollerRole = new Role(this, "RefreshQueuePollerRole", {
      assumedBy: new ServicePrincipal("scheduler.amazonaws.com"),
    });

    amendmentRefreshMachine.grantStartExecution(refreshQueuePollerRole)

    const refreshAmendmentsSchedule = new scheduler.CfnSchedule(this, 'RefreshQueuePollerSchedule', {
      flexibleTimeWindow: {
        maximumWindowInMinutes: 15,
        mode: "FLEXIBLE"
      },
      scheduleExpression: 'rate(2 hours)',
      target: {
        arn: amendmentRefreshMachine.stateMachineArn,
        roleArn: refreshQueuePollerRole.roleArn
      },
      description: 'Polls the amendment refresh queue (SQS) for amendments that need to be refreshed.',
    }
    )

    const webPipeline = new WebPipelineStack(this, 'WebPipelineStack', {
      yearQueue: yearQueue,
      outputBucket: props.api.filesBucket,
      amendmentQueue: amendmentQueue,
      knowledgeBase: props.api.knowledgeBaseStack.knowledgeBase,
      knowledgeBaseSource: props.api.knowledgeBaseStack.dataSource
    })

  }
}