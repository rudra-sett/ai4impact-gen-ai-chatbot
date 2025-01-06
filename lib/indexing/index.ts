import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';

import { ChatBotApi } from "../chatbot-api";
import { CacheAmendments } from './build-cache/cache';

export interface IndexingStackProps {
  readonly api: ChatBotApi;
}

export class IndexingStack extends Construct {  

  constructor(scope: Construct, id: string, props: IndexingStackProps) {
    super(scope, id);

    /* Building amendment tree*/
    // we just need a step function that calls the amendment function on all acts
    const cacheAmendmentsStepFunction = new CacheAmendments(this, 'CacheAmendmentsStateMachine', {
      amendmentFunction: props.api.amendmentFunction,
      actsBucket: props.api.filesBucket,
    });
    
    /* Building versions of acts*/
    // we also just need a single step function that handles this


  
  }
}