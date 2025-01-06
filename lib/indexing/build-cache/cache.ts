import * as cdk from 'aws-cdk-lib';
import * as sfn from 'aws-cdk-lib/aws-stepfunctions';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as s3 from 'aws-cdk-lib/aws-s3';
import { Construct } from 'constructs';

interface CacheAmendmentsStackProps {
  amendmentFunction: lambda.Function;
  actsBucket: s3.Bucket;
}

export class CacheAmendments extends Construct {
  constructor(scope: Construct, id: string, props: CacheAmendmentsStackProps) {
    super(scope, id);

    const s3Map = new sfn.DistributedMap(this, 'S3 Map', {
      maxConcurrency: 4,
      itemReader: new sfn.S3ObjectsItemReader({ bucket: props.actsBucket, prefix: 'acts/' }),
      label: 'ActBucketMap',
      mapExecutionType: sfn.StateMachineType.STANDARD,           
    });

    
    // Define a task to invoke a Lambda function
    const lambdaInvoke = new sfn.CustomState(this, 'AmendmentFunction', {
      stateJson: {
        "Type": "Task",
            "Resource": "arn:aws:states:::lambda:invoke",
            "Output": "{% $states.result.Payload %}",
            "Arguments": {
              "FunctionName": props.amendmentFunction.functionName,
              "Payload": {
                "body": {
                  "year": "{% $split($states.input.Key, '/')[1] %}",
                  "chapter": "{% $substringBefore($substringAfter($split($states.input.Key, '/')[2], 'chapter-'), '.txt') %}",
                  "overwrite" : "true"
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
      },
    });

    s3Map.itemProcessor(lambdaInvoke);

    // Define the state machine
    const stateMachine = new sfn.StateMachine(this, 'StateMachine', {
      definition: s3Map,      
    });
  }
}