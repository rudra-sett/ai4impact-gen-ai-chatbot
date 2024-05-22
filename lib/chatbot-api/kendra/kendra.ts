import * as cdk from 'aws-cdk-lib';
import * as kendra from 'aws-cdk-lib/aws-kendra';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as iam from 'aws-cdk-lib/aws-iam';
import { Construct } from "constructs";
import { kendraIndexName } from "../../constants"

export interface KendraIndexStackProps {
  s3Bucket: s3.Bucket,
  zendeskBucket: s3.Bucket
}

export class KendraIndexStack extends cdk.Stack {
  public readonly kendraIndex : kendra.CfnIndex;
  public readonly kendraSource : kendra.CfnDataSource;
  public readonly zendeskSource : kendra.CfnDataSource;

  constructor(scope: Construct, id: string, props: KendraIndexStackProps) {
    super(scope, id);

    const kendraIndexRole = new iam.Role(scope, 'KendraIndexRole', {
      assumedBy: new iam.ServicePrincipal('kendra.amazonaws.com'),
    });

    kendraIndexRole.addToPolicy(
      new iam.PolicyStatement({
        actions: ['s3:GetObject', 's3:ListBucket'],
        resources: [
          `arn:aws:s3:::${props.s3Bucket.bucketName}`,
          `arn:aws:s3:::${props.s3Bucket.bucketName}/*`,
        ],
      })
    );


    // Add the CloudWatch permissions
    kendraIndexRole.addToPolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ['cloudwatch:PutMetricData'],
        resources: ['*'],
        conditions: {
          StringEquals: {
            'cloudwatch:namespace': 'AWS/Kendra',
          },
        },
      })
    );

    // Add the CloudWatch Logs permissions
    kendraIndexRole.addToPolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ['logs:DescribeLogGroups'],
        resources: ['*'],
      })
    );

    kendraIndexRole.addToPolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ['logs:CreateLogGroup'],
        resources: [`arn:aws:logs:${this.region}:${this.account}:log-group:/aws/kendra/*`],
      })
    );

    kendraIndexRole.addToPolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ['logs:DescribeLogStreams', 'logs:CreateLogStream', 'logs:PutLogEvents'],
        resources: [`arn:aws:logs:${this.region}:${this.account}:log-group:/aws/kendra/*:log-stream:*`],
      })
    );

    // Create a new Kendra index
    const index = new kendra.CfnIndex(scope, 'KendraIndex', {
      name: kendraIndexName,
      roleArn: kendraIndexRole.roleArn,
      description: 'Gen AI Chatbot Kendra Index',
      edition: 'DEVELOPER_EDITION',
    });


    const kendraDataSourceRole = new iam.Role(scope, 'KendraDataSourceRole', {
      assumedBy: new iam.ServicePrincipal('kendra.amazonaws.com'),
    });

    kendraDataSourceRole.addToPolicy(
      new iam.PolicyStatement({
        actions: ['s3:GetObject', 's3:ListBucket'],
        resources: [
          `arn:aws:s3:::${props.s3Bucket.bucketName}`,
          `arn:aws:s3:::${props.s3Bucket.bucketName}/*`,
        ],
      })
    );

    kendraDataSourceRole.addToPolicy(
      new iam.PolicyStatement({
        actions: ["kendra:BatchPutDocument", "kendra:BatchDeleteDocument"],
        resources: [
          index.attrArn
        ],
      })
    );

    // Use the provided S3 bucket for the data source and FAQ
    const dataSource = new kendra.CfnDataSource(scope, 'KendraS3DataSource', {
      indexId: index.attrId,
      name: 's3-source',
      type: 'S3',
      roleArn : kendraDataSourceRole.roleArn,
      dataSourceConfiguration: {
        s3Configuration: {
          bucketName: props.s3Bucket.bucketName,
        },
      }
    });


    const zendeskDataSourceRole = new iam.Role(scope, 'ZendeskDataSourceRole', {
      assumedBy: new iam.ServicePrincipal('kendra.amazonaws.com'),
    });

    zendeskDataSourceRole.addToPolicy(
      new iam.PolicyStatement({
        actions: ['s3:GetObject', 's3:ListBucket'],
        resources: [
          `arn:aws:s3:::${props.zendeskBucket.bucketName}`,
          `arn:aws:s3:::${props.zendeskBucket.bucketName}/*`,
        ],
      })
    );

    zendeskDataSourceRole.addToPolicy(
      new iam.PolicyStatement({
        actions: ["kendra:BatchPutDocument", "kendra:BatchDeleteDocument"],
        resources: [
          index.attrArn
        ],
      })
    );

    const zendeskSource = new kendra.CfnDataSource(scope, 'ZendeskS3DataSource', {
      indexId: index.attrId,
      name: 'zendesk-source',
      type: 'S3',
      roleArn : zendeskDataSourceRole.roleArn,
      dataSourceConfiguration: {
        s3Configuration: {
          bucketName: props.zendeskBucket.bucketName,
        },
      }
    });

    this.zendeskSource = zendeskSource;
    dataSource.addDependency(index);
    this.kendraIndex = index;
    this.kendraSource = dataSource;
  }
}
