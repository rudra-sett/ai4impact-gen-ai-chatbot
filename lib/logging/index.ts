import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as cloudwatch from 'aws-cdk-lib/aws-cloudwatch';

export interface LoggingStackProps {
  chatFunction : lambda.Function,
  feedbackFunction : lambda.Function,
  sessionFunction : lambda.Function,
  zendeskFunction : lambda.Function,  
}

export class LoggingStack extends Construct {
  
  constructor(scope: Construct, id: string, props: LoggingStackProps) {
    super(scope, id);
    
    /* Filters */
    const feedbackDDBFilter = props.feedbackFunction.logGroup.addMetricFilter("FeedbackHandlerDDBFilter", {      
      metricNamespace: 'Feedback Handler',
      metricName: 'DynamoDB Errors',
      filterPattern: logs.FilterPattern.exists('DynamoDB'),      
    })    

    const feedbackAdminFilter = props.feedbackFunction.logGroup.addMetricFilter("FeedbackHandlerAdminFilter", {      
      metricNamespace: 'Feedback Handler',
      metricName: 'Admin Access Errors',
      filterPattern: logs.FilterPattern.exists('admin access'),      
    })

    const sessionsDDBFilter = props.sessionFunction.logGroup.addMetricFilter("SessionHandlerDDBFilter", {      
      metricNamespace: 'Session Handler',
      metricName: 'DynamoDB Errors',
      filterPattern: logs.FilterPattern.exists('DynamoDB'),      
    })
    

    const chatModelInvokeFilter = props.chatFunction.logGroup.addMetricFilter("ChatHandlerInvokeFilter", {      
      metricNamespace: 'Chat Handler',
      metricName: 'Model Invoke Errors',
      filterPattern: logs.FilterPattern.exists('invoke error'),      
    })

    const zendeskCrawlFilter = props.zendeskFunction.logGroup.addMetricFilter("ZendeskCrawlFilter", {      
      metricNamespace: 'Zendesk Sync',
      metricName: 'Crawl Errors',
      filterPattern: logs.FilterPattern.exists('crawl error'),      
    })

    const zendeskSyncFilter = props.zendeskFunction.logGroup.addMetricFilter("ZendeskSyncFilter", {      
      metricNamespace: 'Zendesk Sync',
      metricName: 'Kendra Sync Errors',
      filterPattern: logs.FilterPattern.exists('Kendra sync error'),      
    })

    /* Alarms */

    const feedbackHandlerDDBAlarm = new cloudwatch.Alarm(this, 'FeedbackHandlerDDBAlarm', {
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
      threshold: 100,
      evaluationPeriods: 1,
      metric: feedbackDDBFilter.metric()
    });

    const feedbackHandlerAdminAlarm = new cloudwatch.Alarm(this, 'FeedbackHandlerAdminAlarm', {
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
      threshold: 10,
      evaluationPeriods: 1,
      metric: feedbackAdminFilter.metric()
    });

    const sessionHandlerDDBAlarm = new cloudwatch.Alarm(this, 'SessionHandlerDDBAlarm', {
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
      threshold: 100,
      evaluationPeriods: 1,
      metric: sessionsDDBFilter.metric()
    });    

    const chatHandlerInvokeAlarm = new cloudwatch.Alarm(this, 'ChatHandlerInvokeAlarm', {
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
      threshold: 100,
      evaluationPeriods: 1,
      metric: chatModelInvokeFilter.metric()
    });

    const zendeskCrawlAlarm = new cloudwatch.Alarm(this, 'ZendeskCrawlAlarm', {
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
      threshold: 2,
      evaluationPeriods: 1,
      metric: zendeskCrawlFilter.metric()
    });

    const zendeskSyncAlarm = new cloudwatch.Alarm(this, 'ZendeskSyncAlarm', {
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
      threshold: 2,
      evaluationPeriods: 1,
      metric: zendeskSyncFilter.metric()
    });


  }
}
