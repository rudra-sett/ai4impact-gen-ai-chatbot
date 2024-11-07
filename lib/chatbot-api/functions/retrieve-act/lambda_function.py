import boto3
import json
import os

s3 = boto3.client('s3')

def get_s3_chunks(bucket_name, year, chapter):
    
    # Define the prefix for the desired files
    prefix = f"cleaned/acts/{year}/chapter-{chapter}.txt"
    
    # Retrieve all objects with the given prefix
    response = s3.list_objects_v2(Bucket=bucket_name, Prefix=prefix)
    
    # Check if any objects were found
    if 'Contents' not in response:
        print("No files found for the specified year and chapter.")
        return []
    
    # Filter and download each chunk for the specified chapter
    chunks = []
    for obj in response['Contents']:
        key = obj['Key']
        
        # Retrieve the file content
        file_obj = s3.get_object(Bucket=bucket_name, Key=key)
        file_content = file_obj['Body'].read().decode('utf-8')
        
        # Append content to the list of chunks
        chunks.append(file_content)
    
    return chunks

def get_act(year, chapter):    
    bucket_name = os.environ['ACTS_BUCKET']    
    chunks = get_s3_chunks(bucket_name, year, chapter)    
    return " ".join(chunks)


def lambda_handler(event, context):
  data = json.loads(event['body'])
  year = data['year']
  chapter = data['chapter']

  print(f"year: {year}")
  print(f"chapter: {chapter}")
  
  try:
    text = get_act(year,chapter)

    return {
        'statusCode' : 200,
        'body' : json.dumps(text)
    }
  except Exception as e:
    return {
      'statusCode' : 500,
      'body' : json.dumps(e)
    }