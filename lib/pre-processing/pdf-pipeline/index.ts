import * as path from 'path';

import * as cdk from 'aws-cdk-lib';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as iam from 'aws-cdk-lib/aws-iam';

import { Bucket, EventType } from 'aws-cdk-lib/aws-s3';
import { Queue } from 'aws-cdk-lib/aws-sqs';
import { Construct } from 'constructs';
import { S3EventSourceV2, SqsEventSource } from 'aws-cdk-lib/aws-lambda-event-sources';

interface PDFPipelineStackProps {
  readonly inputBucket: Bucket;
  readonly outputBucket: Bucket;
  readonly pdfQueue: Queue;
}

export class PDFPipelineStack extends Construct {


  constructor(scope: Construct, id: string, props: PDFPipelineStackProps) {
    super(scope, id);

    const textractFunction = new lambda.Function(this, 'TextractFunction', {
      runtime: lambda.Runtime.PYTHON_3_12, // Choose any supported Node.js runtime
      code: lambda.Code.fromAsset(path.join(__dirname, 'textract')), // Points to the lambda directory
      handler: 'lambda_function.lambda_handler', // Points to the 'hello' file in the lambda directory
      environment: {
        "QUEUE": props.pdfQueue.queueName
      },
      memorySize: 8192,
      timeout: cdk.Duration.seconds(300)
    }
    )

    textractFunction.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ['s3:GetObject', 's3:ListBucket'],
        resources: [props.inputBucket.bucketArn, `${props.inputBucket.bucketArn}/*`],
      })
    );

    textractFunction.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ["textract:StartDocumentTextDetection",
          "textract:StartDocumentAnalysis",
          "textract:GetDocumentTextDetection",
          "textract:GetDocumentAnalysis"],
        resources: ['*'],
      })
    );

    textractFunction.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ['sqs:GetQueueAttributes','sqs:GetQueueUrl','sqs:SendMessage'],
        resources: [props.pdfQueue.queueArn],
      })
    );

    textractFunction.addEventSource(
      new S3EventSourceV2(props.inputBucket, {
        events: [EventType.OBJECT_CREATED],
      })
    );

    const splitterFunction = new lambda.Function(this, 'SplitterFunction', {
      runtime: lambda.Runtime.PYTHON_3_12, 
      code: lambda.Code.fromAsset(path.join(__dirname, 'splitter')), 
      handler: 'lambda_function.lambda_handler', 
      environment: {
        "BUCKET": props.outputBucket.bucketName
      },
      memorySize: 8192,
      timeout: cdk.Duration.seconds(900)
    }
    )

    splitterFunction.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ['sqs:ReceiveMessage', 'sqs:DeleteMessage', 'sqs:GetQueueAttributes'],
        resources: [props.pdfQueue.queueArn],
      })
    );

    splitterFunction.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ["textract:StartDocumentTextDetection",
          "textract:StartDocumentAnalysis",
          "textract:GetDocumentTextDetection",
          "textract:GetDocumentAnalysis"],
        resources: ['*'],
      })
    );

    splitterFunction.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ['s3:PutObject', 's3:GetObject', 's3:ListBucket'],
        resources: [props.outputBucket.bucketArn, `${props.outputBucket.bucketArn}/*`],
      })
    );

    splitterFunction.addEventSource(new SqsEventSource(props.pdfQueue,{
      batchSize: 1
    }));
    
    // TODO: incorporate cleaning function if we can't find a better way to split up the documents
    // TODO: automatically download the PDFs via a custom resource trigger, but this can only run
    // after the textract function and trigger are in place
  
  }

}