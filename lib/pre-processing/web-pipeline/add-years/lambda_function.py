import boto3
import json
import os
from datetime import datetime

sqs = boto3.resource('sqs')
queue_name = os.environ['QUEUE']

def lambda_handler(event, context):
    try:        
        current_year = datetime.now().year
        years = list(range(1997, current_year + 1))              
        for year in years:
            queue = sqs.get_queue_by_name(
                QueueName=queue_name,
            )
            response = queue.send_message(                
                MessageBody=json.dumps({'year': year}),
                MessageAttributes={},
                MessageGroupId=str(year),
                MessageDeduplicationId=str(year)
            )
            print(f"Sent message for year {year}, MessageId: {response['MessageId']}")
        
        return {
            'statusCode': 200,
            'body': json.dumps(f"Successfully added {len(years)} years to the SQS queue")
        }
    
    except Exception as e:
        print(f"Error: {str(e)}")
        return {
            'statusCode': 500,
            'body': json.dumps("Failed to add years to the SQS queue")
        }
