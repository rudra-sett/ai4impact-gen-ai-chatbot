import json
import boto3
from datetime import datetime

# Initialize the DynamoDB client
dynamodb = boto3.client('dynamodb', region_name='us-east-1')

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
        params = {
            'TableName': 'UserFeedbackTableGLOTool',
            'Item': {
                'type': {'S': type_},
                'topic': {'S': topic},
                'message': {'S': message},
                'timestamp': {'S': datetime.utcnow().isoformat()}
            }
        }

        # Store the item in DynamoDB
        dynamodb.put_item(**params)

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
