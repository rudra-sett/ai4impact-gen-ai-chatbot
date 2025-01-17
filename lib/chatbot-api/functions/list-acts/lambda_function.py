import os
import boto3
import json

s3_client = boto3.client('s3')

def lambda_handler(event, context):
  # Get the year from the API Gateway request
  year = event['queryStringParameters']['year']
  
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
    for obj in response['Contents']:
      key = obj['Key']
      # Extract the chapter number from the key
      chapter_number = key.split('/')[-1].split('-')[1].split('.')[0]
      # Create the item dictionary
      item = {
        'key': key,
        'name': f'Chapter {chapter_number} of the Acts of {year}',
        'chapter_number': chapter_number,
        'year': year
      }
      items.append(item)
  
  # Return the list of items, sorted by year and chapter number
  items = sorted(items, key=lambda x: (x['year'], x['chapter_number']))
  return {
    'statusCode': 200,
    'body': json.dumps(items)
  }