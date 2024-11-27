import * as path from 'path';

import * as cdk from 'aws-cdk-lib';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as iam from 'aws-cdk-lib/aws-iam';

import { Bucket } from 'aws-cdk-lib/aws-s3';
import { Queue } from 'aws-cdk-lib/aws-sqs';
import { Construct } from 'constructs';
import { SqsEventSource } from 'aws-cdk-lib/aws-lambda-event-sources';

interface WebPipelineStackProps {  
  readonly outputBucket: Bucket;
  readonly yearQueue: Queue;
}

export class WebPipelineStack extends Construct {


  constructor(scope: Construct, id: string, props: WebPipelineStackProps) {
    super(scope, id);

    const crawlYearFunction = new lambda.Function(this, 'CrawlYearFunction', {
      runtime: lambda.Runtime.PYTHON_3_12,
      code: lambda.Code.fromAsset(path.join(__dirname, 'crawler')),
      handler: 'lambda_function.lambda_handler',
      environment: {        
        "BUCKET" : props.outputBucket.bucketName
      },
      memorySize: 8192,
      timeout: cdk.Duration.seconds(900)
    }
    )

    crawlYearFunction.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ['sqs:ReceiveMessage', 'sqs:DeleteMessage', 'sqs:GetQueueAttributes'],
        resources: [props.yearQueue.queueArn],
      })
    );

    crawlYearFunction.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ['s3:PutObject', 's3:GetObject', 's3:ListBucket'],
        resources: [props.outputBucket.bucketArn, `${props.outputBucket.bucketArn}/*`],
      })
    );
    
    crawlYearFunction.addEventSource(new SqsEventSource(props.yearQueue));

    // TODO: Eventbridge to run this periodically 
    // add a clause in the function to differentiate between being called by SQS vs EventBridge
    // if it's eventbridge, the function will figure out what to crawl, which will be
    // only the acts of the current year
  }
}