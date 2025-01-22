import os
import boto3
import json
import re

s3_client = boto3.client('s3')

def lambda_handler(event, context):
  # Get the year from the API Gateway request
  year = event['queryStringParameters']['year']
  start_index = int(event['queryStringParameters'].get('startIndex', 0))
  page_size = int(event['queryStringParameters'].get('pageSize', 10))
  
  # Get the bucket name from environment variables
  bucket_name = os.environ['BUCKET_NAME']
  
  # Define the prefix
  prefix = f'acts/{year}/'
  
  # List objects in the bucket with the specified prefix
  response = s3_client.list_objects_v2(Bucket=bucket_name, Prefix=prefix)
  
  # Initialize the list to store the items
  items = []
  
  # Iterate over the contents of the response
  if 'Contents' in response:
    # Sort contents
    contents = sorted(
      response.get('Contents', []),
      key=lambda x: int(re.search(r'\d+', x['Key'].split('/')[-1].split('-')[1]).group())
      )  
    for obj in contents[start_index:start_index + page_size]:
      key = obj['Key']
      # Read the contents of the file
      file_obj = s3_client.get_object(Bucket=bucket_name, Key=key)
      # Get the first 300 characters
      preview = file_obj['Body'].read().decode('utf-8','ignore')[:300]
      # Extract the chapter number from the key
      chapter_number = key.split('/')[-1].split('-')[1].split('.')[0]
      # Create the item dictionary
      item = {
        'key': key,
        'name': f'Chapter {chapter_number} of the Acts of {year}',
        'chapter_number': chapter_number,
        'year': year,
        'preview' : preview
      }
      items.append(item)
        
  return {
    'statusCode': 200,
    'body': json.dumps(items)
  }