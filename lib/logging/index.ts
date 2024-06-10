import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as cloudwatch from 'aws-cdk-lib/aws-cloudwatch';
import * as sns from 'aws-cdk-lib/aws-sns';
import * as actions from "aws-cdk-lib/aws-cloudwatch-actions";
import { alertEmails } from '../constants';

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

    /*const feedbackAdminFilter = props.feedbackFunction.logGroup.addMetricFilter("FeedbackHandlerAdminFilter", {      
      metricNamespace: 'Feedback Handler',
      metricName: 'Admin Access Errors',
      filterPattern: logs.FilterPattern.exists('admin access'),      
    })*/

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

    const chatModelKendraRelevancyFilter = props.chatFunction.logGroup.addMetricFilter("ChatHandlerKendraRelevancyFilter", {      
      metricNamespace: 'Chat Handler',
      metricName: 'Kendra Relevancy Errors',
      filterPattern: logs.FilterPattern.exists('no relevant sources'),      
    })

    const chatModelKendraRetrieveFilter = props.chatFunction.logGroup.addMetricFilter("ChatHandlerKendraRetrieveFilter", {      
      metricNamespace: 'Chat Handler',
      metricName: 'Kendra Retrieval Errors',
      filterPattern: logs.FilterPattern.exists('could not retreive'),      
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

    let alarms : cloudwatch.Alarm[] = []

    const feedbackHandlerDDBAlarm = new cloudwatch.Alarm(this, 'FeedbackHandlerDDBAlarm', {
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
      threshold: 100,
      evaluationPeriods: 1,
      metric: feedbackDDBFilter.metric()
    });
    alarms.push(feedbackHandlerDDBAlarm)

    /*const feedbackHandlerAdminAlarm = new cloudwatch.Alarm(this, 'FeedbackHandlerAdminAlarm', {
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
      threshold: 10,
      evaluationPeriods: 1,
      metric: feedbackAdminFilter.metric()
    });
    alarms.push(feedbackHandlerAdminAlarm)*/

    const sessionHandlerDDBAlarm = new cloudwatch.Alarm(this, 'SessionHandlerDDBAlarm', {
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
      threshold: 100,
      evaluationPeriods: 1,
      metric: sessionsDDBFilter.metric()
    });    
    alarms.push(sessionHandlerDDBAlarm)

    const chatHandlerInvokeAlarm = new cloudwatch.Alarm(this, 'ChatHandlerInvokeAlarm', {
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
      threshold: 100,
      evaluationPeriods: 1,
      metric: chatModelInvokeFilter.metric()
    });
    alarms.push(chatHandlerInvokeAlarm)

    const chatHandlerRelevancyAlarm = new cloudwatch.Alarm(this, 'ChatHandlerRelevanceAlarm', {
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
      threshold: 100,
      evaluationPeriods: 1,
      metric: chatModelKendraRelevancyFilter.metric()
    });
    alarms.push(chatHandlerRelevancyAlarm)

    const chatHandlerRetrieveAlarm = new cloudwatch.Alarm(this, 'ChatHandlerRetrivalAlarm', {
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
      threshold: 100,
      evaluationPeriods: 1,
      metric: chatModelKendraRetrieveFilter.metric()
    });
    alarms.push(chatHandlerRetrieveAlarm)
    
    const zendeskCrawlAlarm = new cloudwatch.Alarm(this, 'ZendeskCrawlAlarm', {
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
      threshold: 2,
      evaluationPeriods: 1,
      metric: zendeskCrawlFilter.metric()
    });
    alarms.push(zendeskCrawlAlarm)

    const zendeskSyncAlarm = new cloudwatch.Alarm(this, 'ZendeskSyncAlarm', {
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
      threshold: 2,
      evaluationPeriods: 1,
      metric: zendeskSyncFilter.metric()
    });
    alarms.push(zendeskSyncAlarm)

    // create the SNS topic that will be used by each alarm
    const alertTopic = new sns.Topic(this, 'AlertTopic');
    alertEmails.forEach((value) => {
      new sns.Subscription(this, 'Subscription', {
        topic: alertTopic,
        endpoint: value,
        protocol: sns.SubscriptionProtocol.EMAIL,      
      });
    })

    // add this topic to each alarm
    alarms.forEach((value) => {
      value.addAlarmAction(new actions.SnsAction(alertTopic))
    })
        


  }
}
