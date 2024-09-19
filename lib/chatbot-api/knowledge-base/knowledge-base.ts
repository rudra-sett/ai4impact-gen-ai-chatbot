import * as cdk from 'aws-cdk-lib';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as path from 'path';
import * as lambda from 'aws-cdk-lib/aws-lambda'
import * as triggers from 'aws-cdk-lib/triggers'
import * as cr from 'aws-cdk-lib/custom-resources'

import { aws_opensearchserverless as opensearchserverless } from 'aws-cdk-lib';
import { aws_bedrock as bedrock } from 'aws-cdk-lib';

import { Construct } from "constructs";
import { stackName } from "../../constants"
import { OpenSearchStack } from "../opensearch/opensearch"

export interface KnowledgeBaseStackProps {
  readonly openSearch: OpenSearchStack,
  readonly s3bucket : s3.Bucket
}

export class KnowledgeBaseStack extends cdk.Stack {

  public readonly knowledgeBase: bedrock.CfnKnowledgeBase;
  public readonly dataSource: bedrock.CfnDataSource;

  constructor(scope: Construct, id: string, props: KnowledgeBaseStackProps) {
    super(scope, id);

    // add AOSS access to the role
    props.openSearch.knowledgeBaseRole.addToPolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ['aoss:APIAccessAll'],
        resources: [
          `arn:aws:aoss:${cdk.Stack.of(this).region}:${cdk.Stack.of(this).account}:collection/${props.openSearch.openSearchCollection.attrId}`
        ]
      }
      )
    )

    // add s3 access to the role
    props.openSearch.knowledgeBaseRole.addToPolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        's3:*'
      ],
      resources: [props.s3bucket.bucketArn, props.s3bucket.bucketArn + "/*"]
    }));

    // add bedrock access to the role
    props.openSearch.knowledgeBaseRole.addToPolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: ['bedrock:InvokeModel'],
      resources: [
        `arn:aws:bedrock:${cdk.Stack.of(this).region}::foundation-model/amazon.titan-embed-text-v2:0`
      ]
    }
    )
    )


    const knowledgeBase = new bedrock.CfnKnowledgeBase(scope, 'KnowledgeBase', {
      knowledgeBaseConfiguration: {
        type: 'VECTOR',
        vectorKnowledgeBaseConfiguration: {
          embeddingModelArn: `arn:aws:bedrock:${cdk.Stack.of(this).region}::foundation-model/amazon.titan-embed-text-v2:0`,
        },
      },
      name: `${stackName}-kb`,
      roleArn: props.openSearch.knowledgeBaseRole.roleArn,
      storageConfiguration: {
        type: 'OPENSEARCH_SERVERLESS',

        // the properties below are optional
        opensearchServerlessConfiguration: {
          collectionArn: props.openSearch.openSearchCollection.attrArn,
          fieldMapping: {
            metadataField: 'metadata_field',
            textField: 'text_field',
            vectorField: 'vector_field',
          },
          vectorIndexName: 'knowledge-base-index',
        },
      },

      // the properties below are optional
      description: `Bedrock Knowledge Base for ${stackName}`,
    });

    knowledgeBase.addDependency(props.openSearch.openSearchCollection);
    knowledgeBase.node.addDependency(props.openSearch.lambdaCustomResource)

    const dataSource = new bedrock.CfnDataSource(scope, 'S3DataSource', {
      dataSourceConfiguration: {
        type: 'S3',
        s3Configuration: {
          bucketArn: props.s3bucket.bucketArn,
        },

      },
      knowledgeBaseId: knowledgeBase.attrKnowledgeBaseId,
      name: `${stackName}-kb-datasource`,

      // the properties below are optional      
      description: 'S3 data source',
      vectorIngestionConfiguration: {
        chunkingConfiguration: {
          chunkingStrategy: 'FIXED_SIZE',

          // the properties below are optional
          fixedSizeChunkingConfiguration: {
            maxTokens: 300,
            overlapPercentage: 10,
          },

          // hierarchicalChunkingConfiguration: {
          //   levelConfigurations: [{
          //     maxTokens: 123,
          //   }],
          //   overlapTokens: 123,
          // },
          // semanticChunkingConfiguration: {
          //   breakpointPercentileThreshold: 123,
          //   bufferSize: 123,
          //   maxTokens: 123,
          // },
        },
        // parsingConfiguration: {
        //   parsingStrategy: 'parsingStrategy',

        //   // the properties below are optional
        //   bedrockFoundationModelConfiguration: {
        //     modelArn: 'modelArn',

        //     // the properties below are optional
        //     parsingPrompt: {
        //       parsingPromptText: 'parsingPromptText',
        //     },
        //   },
        // },
      },
    });

    dataSource.addDependency(knowledgeBase);    

    this.knowledgeBase = knowledgeBase;
    this.dataSource = dataSource;
  }
}