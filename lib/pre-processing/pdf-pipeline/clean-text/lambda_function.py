import json
import boto3
import os

def process_chunk(message):
    bedrock = boto3.client('bedrock-runtime')
    modelId = 'anthropic.claude-3-haiku-20240307-v1:0'
    body = {
        "anthropic_version": "bedrock-2023-05-31",
        "system": '''You will take in Session Laws, or fragments of Session Laws. Format the provided text with correct punctuation and spacing, keeping in mind the legal use case. Return the formatted text exactly as provided, without additional comments or explanations. 
        Do not tell me what you are providing, just provide it, because I will be saving your output directly. Keep in mind that you may receive a section of a larger text. Format what you segment you have, while keeping in mind it may have content before or after it.''',
        "messages": [
            {
                "role": "user",
                "content": [
                    {
                        "type": "text",
                        "text": message
                    }
                ]
            }
        ],
        'temperature' : 0.0,
        "max_tokens": 8192
    }
    response = bedrock.invoke_model(
        modelId=modelId,
        body=json.dumps(body)
    )    

    return json.loads(response['body'].read().decode('utf-8'))['content'][0]['text']

def lambda_handler(event, context):
    # Process each message
    print(event['Records'])
    for message in event['Records']:
        # Parse the message body as JSON
        message_body = json.loads(message['body'])
        filename = message_body['filename']
        chunk_index = message_body['chunk_index']
        chunk_content = message_body['chunk_content']

        # Process the chunk
        processed = process_chunk(chunk_content)

        # filename will look like acts/year/chapter-x.txt

        # get the year and chapter from the filename
        year = filename.split('/')[1]
        chapter = filename.split('/')[2].split('-')[1]

        # save the file to s3
        s3 = boto3.client('s3')
        
        s3.put_object(
            Bucket=os.environ['BUCKET'],            
            Key=f'cleaned/acts/{year}/chapter-{chapter}-chunk-{chunk_index}.txt',
            Body=processed.encode('utf-8')
        )
