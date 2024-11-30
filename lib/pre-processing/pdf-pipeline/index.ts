import * as path from 'path';

import * as cdk from 'aws-cdk-lib';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as cr from 'aws-cdk-lib/custom-resources'
import * as sqs from 'aws-cdk-lib/aws-sqs';

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
        actions: ['sqs:GetQueueAttributes', 'sqs:GetQueueUrl', 'sqs:SendMessage'],
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

    splitterFunction.addEventSource(new SqsEventSource(props.pdfQueue, {
      batchSize: 1,
      maxConcurrency: 10
    }));

    // TODO: incorporate cleaning function if we can't find a better way to split up the documents    

    const downloadFunction = new lambda.Function(this, 'DownloadFunction', {
      runtime: lambda.Runtime.PYTHON_3_12,
      code: lambda.Code.fromAsset(path.join(__dirname, 'get-pdfs')),
      handler: 'lambda_function.lambda_handler',
      environment: {
        "BUCKET": props.inputBucket.bucketName
      },
      memorySize: 8192,
      timeout: cdk.Duration.seconds(900)
    }
    )

    downloadFunction.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ['s3:PutObject', 's3:GetObject', 's3:ListBucket'],
        resources: [props.inputBucket.bucketArn, `${props.inputBucket.bucketArn}/*`],
      })
    );

    const downloadDocumentsProvider = new cr.Provider(
      this,
      "DownloadDocumentsCustomProvider", {
      onEventHandler: downloadFunction
    }
    )

    const downloadDocumentsCustomResource = new cdk.CustomResource(
      this,
      "DownloadDocumentsCustomResource", {
      serviceToken: downloadDocumentsProvider.serviceToken,
    }
    )

    // this should only run after the textract function is provisioned and ready to accept PDFs
    downloadDocumentsCustomResource.node.addDependency(textractFunction)
  
    const archiveYearQueue = new sqs.Queue(this, 'ArchiveYearQueue',{
      fifo: true,
      visibilityTimeout: cdk.Duration.minutes(15)
    });

    const archivePageQueue = new sqs.Queue(this, 'ArchivePageQueue',{
      fifo: true,
      visibilityTimeout: cdk.Duration.minutes(15)
    });

    /** This will add the URLs for each year's pages to the Year Queue  */
    const addYearsFunction = new lambda.Function(this, 'ArchiveAddYearsFunction', {
      runtime: lambda.Runtime.PYTHON_3_12,
      code: lambda.Code.fromAsset(path.join(__dirname, 'crawl-archives/add-years'), {
        bundling: {
          image: lambda.Runtime.PYTHON_3_12.bundlingImage,
          command: [
            'bash', '-c',
            'pip install -r requirements.txt -t /asset-output && cp -au . /asset-output'
          ],
        },
      }),
      handler: 'lambda_function.lambda_handler',
      environment: {                
        "YEAR_QUEUE" : archiveYearQueue.queueName
      },
      memorySize: 8192,
      timeout: cdk.Duration.seconds(900)
    }
    )

    addYearsFunction.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ['sqs:ReceiveMessage', 'sqs:DeleteMessage', 'sqs:GetQueueAttributes', 'sqs:GetQueueUrl', 'sqs:SendMessage'],
        resources: [archiveYearQueue.queueArn],
      })
    );

    /** This will take one year at a time from the Year Queue and add all the pages to the Page Queue */
    const crawlArchiveYearsFunction = new lambda.Function(this, 'ArchiveYearCrawlerFunction', {
      runtime: lambda.Runtime.PYTHON_3_12,
      code: lambda.Code.fromAsset(path.join(__dirname, 'crawl-archives/crawl-years'), {
        bundling: {
          image: lambda.Runtime.PYTHON_3_12.bundlingImage,
          command: [
            'bash', '-c',
            'pip install -r requirements.txt -t /asset-output && cp -au . /asset-output'
          ],
        },
      }),
      handler: 'lambda_function.lambda_handler',
      environment: {                
        "PAGE_QUEUE" : archivePageQueue.queueName
      },
      memorySize: 8192,
      timeout: cdk.Duration.seconds(900)
    }
    )
    
    crawlArchiveYearsFunction.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ['sqs:ReceiveMessage', 'sqs:DeleteMessage', 'sqs:GetQueueAttributes', 'sqs:GetQueueUrl', 'sqs:SendMessage'],
        resources: [archivePageQueue.queueArn],
      })
    );

    crawlArchiveYearsFunction.addEventSource(new SqsEventSource(archiveYearQueue, {
      batchSize: 1,
      maxConcurrency: 10
    }));

    /** This will take a page from the Page Queue and save the PDF to S3 */
    const crawlArchivePagesFunction = new lambda.Function(this, 'ArchivePageCrawlerFunction', {
      runtime: lambda.Runtime.PYTHON_3_12,
      code: lambda.Code.fromAsset(path.join(__dirname, 'crawl-archives/crawl-pages'), {
        bundling: {
          image: lambda.Runtime.PYTHON_3_12.bundlingImage,
          command: [
            'bash', '-c',
            'pip install -r requirements.txt -t /asset-output && cp -au . /asset-output'
          ],
        },
      }),
      handler: 'lambda_function.lambda_handler',
      environment: {
        "BUCKET": props.outputBucket.bucketName,    
        "QUEUE": props.pdfQueue.queueName    
      },
      memorySize: 8192,
      timeout: cdk.Duration.seconds(900)
    }
    )

    crawlArchivePagesFunction.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ['s3:PutObject', 's3:GetObject', 's3:ListBucket'],
        resources: [props.outputBucket.bucketArn, `${props.outputBucket.bucketArn}/*`],
      })
    );

    crawlArchivePagesFunction.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ["textract:StartDocumentTextDetection",
          "textract:StartDocumentAnalysis",
          "textract:GetDocumentTextDetection",
          "textract:GetDocumentAnalysis"],
        resources: ['*'],
      })
    );

    crawlArchivePagesFunction.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ['sqs:ReceiveMessage', 'sqs:DeleteMessage', 'sqs:GetQueueAttributes', 'sqs:GetQueueUrl', 'sqs:SendMessage'],
        resources: [props.pdfQueue.queueArn],
      })
    );

    crawlArchivePagesFunction.addEventSource(new SqsEventSource(archivePageQueue, {
      batchSize: 1,
      maxConcurrency: 10
    }));  
  
  }

}