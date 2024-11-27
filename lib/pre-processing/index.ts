import * as cdk from 'aws-cdk-lib';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as sqs from 'aws-cdk-lib/aws-sqs';
import { Construct } from 'constructs';

import { PDFPipelineStack } from './pdf-pipeline'
import { WebPipelineStack } from './web-pipeline'

export interface DataStackProps {
  readonly knowledgeBucket: s3.Bucket; 
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
    
    const webPipeline = new WebPipelineStack(this, 'WebPipelineStack', {      
      yearQueue: yearQueue,
      outputBucket: props.knowledgeBucket
    })
  
  }
}