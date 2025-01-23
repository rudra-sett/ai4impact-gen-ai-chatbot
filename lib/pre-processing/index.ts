import * as cdk from 'aws-cdk-lib';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as sqs from 'aws-cdk-lib/aws-sqs';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import { Construct } from 'constructs';
import { SqsEventSource } from 'aws-cdk-lib/aws-lambda-event-sources';

import { PDFPipelineStack } from './pdf-pipeline'
import { WebPipelineStack } from './web-pipeline'

export interface DataStackProps {
  readonly knowledgeBucket: s3.Bucket; 
  readonly amendmentFunction: lambda.Function;
}

export class DataStack extends Construct {  

  constructor(scope: Construct, id: string, props: DataStackProps) {
    super(scope, id);

    const inputBucket = new s3.Bucket(this, 'InputBucket', {          
      versioned: true,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    const pdfQueue = new sqs.Queue(this, 'PDFQueue',{
      fifo: true,
      visibilityTimeout: cdk.Duration.minutes(30)
    });


    const pdfPipeline = new PDFPipelineStack(this, 'PDFPipelineStack', {
      inputBucket: inputBucket,
      pdfQueue: pdfQueue,
      outputBucket: props.knowledgeBucket
    })
    

    const yearQueue = new sqs.Queue(this, 'YearQueue',{
      fifo: true,
      visibilityTimeout: cdk.Duration.minutes(30)
    });    

    const amendmentQueue = new sqs.Queue(this, 'AmendmentQueue',{
      fifo: true,
      visibilityTimeout: cdk.Duration.minutes(30),      
    });

    amendmentQueue.grantConsumeMessages(props.amendmentFunction);    

    props.amendmentFunction.addEventSource(new SqsEventSource(amendmentQueue, {
      batchSize: 1,
      maxConcurrency: 2
    }));
    
    const webPipeline = new WebPipelineStack(this, 'WebPipelineStack', {      
      yearQueue: yearQueue,
      outputBucket: props.knowledgeBucket,
      amendmentQueue: amendmentQueue
    })
  
  }
}