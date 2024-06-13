import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as cloudwatch from 'aws-cdk-lib/aws-cloudwatch';
import * as sns from 'aws-cdk-lib/aws-sns';
import * as actions from "aws-cdk-lib/aws-cloudwatch-actions";
import * as triggers from 'aws-cdk-lib/triggers';

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
    
    const chatTrigger = new triggers.Trigger(this, 'chatTrigger', {
      handler: props.chatFunction,
      timeout: cdk.Duration.minutes(1),
      invocationType: triggers.InvocationType.EVENT,
    });

    const feedbackTrigger = new triggers.Trigger(this, 'feedbackTrigger', {
      handler: props.feedbackFunction,
      timeout: cdk.Duration.minutes(1),
      invocationType: triggers.InvocationType.EVENT,
    });

    const sessionTrigger = new triggers.Trigger(this, 'sessionTrigger', {
      handler: props.sessionFunction,
      timeout: cdk.Duration.minutes(1),
      invocationType: triggers.InvocationType.EVENT,
    });

    const zendeskTrigger = new triggers.Trigger(this, 'zendeskTrigger', {
      handler: props.zendeskFunction,
      timeout: cdk.Duration.minutes(1),
      invocationType: triggers.InvocationType.EVENT,
    });

    /* Filters */
    /** WARNING: Do not attempt to modify these values after deployment.
     * CloudFormation may throw errors in certain cases if you attempt to do so, potentially 
     * destroying your entire stack/requiring manual resolution. You may add NEW filters/alarms,
     * but do not modify existing filters post-deployment. 
     */
    const feedbackDDBFilter = props.feedbackFunction.logGroup.addMetricFilter("FeedbackHandlerDDBFilter", {      
      metricNamespace: 'Feedback Handler',
      metricName: 'DynamoDB Errors',
      filterPattern: logs.FilterPattern.anyTerm('DynamoDB'),  
      defaultValue: 0    
    })    

    feedbackDDBFilter.node.addDependency(feedbackTrigger);
    /*const feedbackAdminFilter = props.feedbackFunction.logGroup.addMetricFilter("FeedbackHandlerAdminFilter", {      
      metricNamespace: 'Feedback Handler',
      metricName: 'Admin Access Errors',
      filterPattern: logs.FilterPattern.anyTerm('admin access'),      
    })*/

    const sessionsDDBFilter = props.sessionFunction.logGroup.addMetricFilter("SessionHandlerDDBFilter", {      
      metricNamespace: 'Session Handler',
      metricName: 'DynamoDB Errors',
      filterPattern: logs.FilterPattern.anyTerm('DynamoDB'),      
      defaultValue: 0
    })
    
    sessionsDDBFilter.node.addDependency(sessionTrigger);

    const chatModelInvokeFilter = props.chatFunction.logGroup.addMetricFilter("ChatHandlerInvokeFilter", {      
      metricNamespace: 'Chat Handler',
      metricName: 'Model Invoke Errors',
      filterPattern: logs.FilterPattern.anyTerm('invoke error'),  
      defaultValue: 0    
    })

    chatModelInvokeFilter.node.addDependency(chatTrigger);

    const chatModelKendraRelevancyFilter = props.chatFunction.logGroup.addMetricFilter("ChatHandlerKendraRelevancyFilter", {      
      metricNamespace: 'Chat Handler',
      metricName: 'Kendra Relevancy Errors',
      filterPattern: logs.FilterPattern.anyTerm('no relevant sources'), 
      defaultValue: 0     
    })

    chatModelKendraRelevancyFilter.node.addDependency(chatTrigger);

    const chatModelKendraRetrieveFilter = props.chatFunction.logGroup.addMetricFilter("ChatHandlerKendraRetrieveFilter", {      
      metricNamespace: 'Chat Handler',
      metricName: 'Kendra Retrieval Errors',
      filterPattern: logs.FilterPattern.anyTerm('could not retreive'),    
      defaultValue: 0  
    })

    chatModelKendraRetrieveFilter.node.addDependency(chatTrigger);

    const zendeskCrawlFilter = props.zendeskFunction.logGroup.addMetricFilter("ZendeskCrawlFilter", {      
      metricNamespace: 'Zendesk Sync',
      metricName: 'Crawl Errors',
      filterPattern: logs.FilterPattern.anyTerm('crawl error'),     
      defaultValue: 0 
    })

    zendeskCrawlFilter.node.addDependency(zendeskTrigger)

    const zendeskSyncFilter = props.zendeskFunction.logGroup.addMetricFilter("ZendeskSyncFilter", {      
      metricNamespace: 'Zendesk Sync',
      metricName: 'Kendra Sync Errors',
      filterPattern: logs.FilterPattern.anyTerm('Kendra sync error'),  
      defaultValue: 0    
    })

    zendeskSyncFilter.node.addDependency(zendeskTrigger)

    /* Alarms */

    let alarms : cloudwatch.Alarm[] = []

    const feedbackHandlerDDBAlarm = new cloudwatch.Alarm(this, 'FeedbackHandlerDDBAlarm', {
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
      threshold: 20,
      evaluationPeriods: 1,
      alarmDescription : "Activates when user feedback handling (adding, updating, loading, etc.) is not functioning correctly.",
      metric: feedbackDDBFilter.metric({statistic : "sum"}),
    });
    alarms.push(feedbackHandlerDDBAlarm)

    /*const feedbackHandlerAdminAlarm = new cloudwatch.Alarm(this, 'FeedbackHandlerAdminAlarm', {
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
      threshold: 10,
      evaluationPeriods: 1,
      metric: feedbackAdminFilter.metric({statistic : "sum"})
    });
    alarms.push(feedbackHandlerAdminAlarm)*/

    const sessionHandlerDDBAlarm = new cloudwatch.Alarm(this, 'SessionHandlerDDBAlarm', {
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
      threshold: 20,
      evaluationPeriods: 1,
      alarmDescription : "Activates when user session handling (adding, updating, loading, etc.) is not functioning correctly.",
      metric: sessionsDDBFilter.metric({statistic : "sum"})
    });    
    alarms.push(sessionHandlerDDBAlarm)

    const chatHandlerInvokeAlarm = new cloudwatch.Alarm(this, 'ChatHandlerInvokeAlarm', {
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
      threshold: 20,
      evaluationPeriods: 1,
      alarmDescription : "Activates when chat functionality is not working.",
      metric: chatModelInvokeFilter.metric({statistic : "sum"})
    });
    alarms.push(chatHandlerInvokeAlarm)

    const chatHandlerRelevancyAlarm = new cloudwatch.Alarm(this, 'ChatHandlerRelevanceAlarm', {
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
      threshold: 20,
      evaluationPeriods: 1,
      alarmDescription : "Activates when Kendra repeatedly retrieves irrelevant data.",
      metric: chatModelKendraRelevancyFilter.metric({statistic : "sum"})
    });
    alarms.push(chatHandlerRelevancyAlarm)

    const chatHandlerRetrieveAlarm = new cloudwatch.Alarm(this, 'ChatHandlerRetrivalAlarm', {
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
      threshold: 20,
      evaluationPeriods: 1,
      alarmDescription : "Activates when Kendra is repeatedly unable to retrieve any data.",
      metric: chatModelKendraRetrieveFilter.metric({statistic : "sum"})
    });
    alarms.push(chatHandlerRetrieveAlarm)
    
    const zendeskCrawlAlarm = new cloudwatch.Alarm(this, 'ZendeskCrawlAlarm', {
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
      threshold: 2,
      evaluationPeriods: 1,
      alarmDescription : "Activates when Zendesk crawling is not working.",
      metric: zendeskCrawlFilter.metric({statistic : "sum"})
    });
    alarms.push(zendeskCrawlAlarm)

    const zendeskSyncAlarm = new cloudwatch.Alarm(this, 'ZendeskSyncAlarm', {
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
      threshold: 2,
      evaluationPeriods: 1,
      alarmDescription : "Activates when Kendra is unable to sync with Zendesk data.",
      metric: zendeskSyncFilter.metric({statistic : "sum"})
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
