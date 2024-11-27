
import boto3
import json
import urllib
import random
import os

textract = boto3.client('textract')
s3 = boto3.client('s3')

def start_job(bucket_name, object_name):
    response = textract.start_document_analysis(
        DocumentLocation={
            'S3Object': {
                'Bucket': bucket_name,
                'Name': object_name
            }
        },
        FeatureTypes=['LAYOUT']
    )
    return response['JobId']

def add_to_queue(queue, message_body, index):    
    try:
        response = queue.send_message(
            MessageBody=message_body, MessageAttributes={},MessageGroupId=index,
            MessageDeduplicationId=str(index)
        )
    except Exception as error:
        print("Send message failed: %s", message_body)
        raise error
    else:
        return response

def lambda_handler(event, context):
    print("Received event: " + json.dumps(event, indent=2))

    # Get the object from the event and show its content type
    bucket = event['Records'][0]['s3']['bucket']['name']
    key = urllib.parse.unquote_plus(event['Records'][0]['s3']['object']['key'], encoding='utf-8')
    job = start_job(bucket,key)

    sqs = boto3.resource("sqs")
    queue_name = os.environ['QUEUE']
    queue = sqs.get_queue_by_name(
        QueueName=queue_name,
    )

    index = random.randint(1, 1000000)

    add_to_queue(queue,key + " job id - " + job,str(index))


