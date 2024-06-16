import boto3
import os
from datetime import datetime, timedelta

cloudwatch = boto3.client('cloudwatch')

def lambda_handler(event, context):
    chat_function_name = os.environ['CHAT_FUNCTION_NAME']
    
    end_time = datetime.utcnow()
    start_time = end_time - timedelta(days=1)
    
    response = cloudwatch.get_metric_statistics(
        Namespace='AWS/Lambda',
        MetricName='Invocations',
        Dimensions=[
            {
                'Name': 'FunctionName',
                'Value': chat_function_name
            },
        ],
        StartTime=start_time,
        EndTime=end_time,
        Period=86400,  # 1 day in seconds
        Statistics=['Sum']
    )
    
    invocations_count = response['Datapoints'][0]['Sum'] if response['Datapoints'] else 0
    
    return {
        'statusCode': 200,
        'body': f"{invocations_count}"
    }