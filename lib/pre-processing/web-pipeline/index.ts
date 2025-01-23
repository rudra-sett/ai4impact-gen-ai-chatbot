import * as path from 'path';

import * as cdk from 'aws-cdk-lib';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as cr from 'aws-cdk-lib/custom-resources'
import * as scheduler from 'aws-cdk-lib/aws-scheduler';

import { Bucket } from 'aws-cdk-lib/aws-s3';
import { Queue } from 'aws-cdk-lib/aws-sqs';
import { Construct } from 'constructs';
import { SqsEventSource } from 'aws-cdk-lib/aws-lambda-event-sources';
import { CfnKnowledgeBase, CfnDataSource } from 'aws-cdk-lib/aws-bedrock';

interface WebPipelineStackProps {
  readonly outputBucket: Bucket;
  readonly yearQueue: Queue;
  readonly amendmentQueue: Queue;
  readonly knowledgeBase: CfnKnowledgeBase;
  readonly knowledgeBaseSource: CfnDataSource;
}

export class WebPipelineStack extends Construct {


  constructor(scope: Construct, id: string, props: WebPipelineStackProps) {
    super(scope, id);

    const crawlYearFunction = new lambda.Function(this, 'CrawlYearFunction', {
      runtime: lambda.Runtime.PYTHON_3_12,
      code: lambda.Code.fromAsset(path.join(__dirname, 'crawler'), {
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
        "QUEUE": props.yearQueue.queueName,
        "AMENDMENT_QUEUE": props.amendmentQueue.queueName,
        "KB" : props.knowledgeBase.attrKnowledgeBaseId,
        "KB_SOURCE" : props.knowledgeBaseSource.attrDataSourceId
      },
      memorySize: 8192,
      timeout: cdk.Duration.seconds(900)
    }
    )

    crawlYearFunction.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ['sqs:ReceiveMessage', 'sqs:DeleteMessage', 'sqs:GetQueueAttributes', 'sqs:GetQueueUrl', 'sqs:SendMessage'],
        resources: [props.yearQueue.queueArn, props.amendmentQueue.queueArn],
      })
    );

    crawlYearFunction.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ['s3:PutObject', 's3:GetObject', 's3:ListBucket'],
        resources: [props.outputBucket.bucketArn, `${props.outputBucket.bucketArn}/*`],
      })
    );

    crawlYearFunction.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ['bedrock:*'],
        resources: [props.knowledgeBase.attrKnowledgeBaseArn],
      })
    );

    crawlYearFunction.addEventSource(new SqsEventSource(props.yearQueue, {
      // batch size of 1 so that one lambda instance doesn't crawl more than a year (it'd hit the timeout otherwise)
      batchSize: 1,
      // adding max concurrency of 2 so we're not crawling the website too fast
      maxConcurrency: 2
    }));

    const addYearsFunction = new lambda.Function(this, 'AddYearsFunction', {
      runtime: lambda.Runtime.PYTHON_3_12,
      code: lambda.Code.fromAsset(path.join(__dirname, 'add-years')),
      handler: 'lambda_function.lambda_handler',
      environment: {
        "QUEUE": props.yearQueue.queueName
      },
      memorySize: 8192,
      timeout: cdk.Duration.seconds(900)
    }
    )

    addYearsFunction.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ['sqs:GetQueueAttributes', 'sqs:GetQueueUrl', 'sqs:SendMessage'],
        resources: [props.yearQueue.queueArn],
      })
    );

    const addYearsProvider = new cr.Provider(
      this,
      "AddYearsFunctionCustomProvider", {
      onEventHandler: addYearsFunction
    }
    )

    const addYearsCustomResource = new cdk.CustomResource(
      this,
      "AddYearsFunctionCustomResource", {
      serviceToken: addYearsProvider.serviceToken,
    }
    )

    const webCrawlSchedulerRole = new iam.Role(this, "WebCrawlSchedulerRole", {
      assumedBy: new iam.ServicePrincipal("scheduler.amazonaws.com"),
     });
    
     webCrawlSchedulerRole.addToPolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: ['lambda:InvokeFunction'],
      resources: [crawlYearFunction.functionArn],      
    }))

    const webCrawlSchedule = new scheduler.CfnSchedule(this, 'WebCrawlSchedule', {
      flexibleTimeWindow:{
        maximumWindowInMinutes: 15,
        mode:"FLEXIBLE"
      },
      scheduleExpression:'rate(14 days)',
      target: {
        arn: crawlYearFunction.functionArn,
        roleArn: webCrawlSchedulerRole.roleArn
      },
      description: 'Crawls the Massachusetts Legislature website for the latest Acts of this year.',
    }
    )


  }
}