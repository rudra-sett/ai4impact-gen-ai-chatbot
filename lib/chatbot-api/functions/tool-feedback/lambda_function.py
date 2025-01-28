import json
import boto3
import os
from datetime import datetime

# Initialize the DynamoDB client
dynamodb = boto3.resource('dynamodb', region_name='us-east-1')
table = dynamodb.Table(os.environ.get('TOOL_FEEDBACK_TABLE'))

def lambda_handler(event, context):
    try:
        # Parse the event body
        body = json.loads(event.get('body', '{}'))
        type_ = body.get('type')
        topic = body.get('topic')
        message = body.get('message')

        # Validate required fields
        if not type_ or not topic or not message:
            return {
                'statusCode': 400,
                'body': json.dumps({
                    'error': 'Missing required fields'
                })
            }

        # Prepare the DynamoDB item
            item = {
            'type': type_,
            'topic': topic,
            'message': message,
            'timestamp': datetime.utcnow().isoformat()
        }

        # Store the item in DynamoDB
        table.put_item(Item=item)

        return {
            'statusCode': 200,
            'body': json.dumps({
                'message': 'Feedback stored successfully!'
            })
        }

    except Exception as e:
        print(f"Error storing feedback: {e}")
        return {
            'statusCode': 500,
            'body': json.dumps({
                'error': 'Failed to store feedback.'
            })
        }
