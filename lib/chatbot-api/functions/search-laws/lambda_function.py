import os
import boto3
import json

bedrock_runtime = boto3.client('bedrock-agent-runtime')
KB_ID = os.environ['KB_ID']

def retrieve_from_knowledge_base(query):
    response = bedrock_runtime.retrieve(
        retrievalQuery={
            'text': query
        },
        knowledgeBaseId=KB_ID,
        retrievalConfiguration={
            'vectorSearchConfiguration': {
                'numberOfResults': 100,                
            }
        }
    )
    results = response['retrievalResults']

    clean_results = []
    for result in enumerate(results):
        #results[i]['content']['text'] = result['content']['text'][:150] + "..."
        clean_results.append({
           "content" : result['content']['text'][:150] + "...",
           "chapter" : result['location']['s3Location']['uri']
        })

    return clean_results


def handler(event, context):
  body = json.loads(event['body'])
  query = body.get('query','')
  if query == '':
     return {
        "statusCode" : 500,
        'headers': {
                'Access-Control-Allow-Origin': '*'
            },
        "body" : json.dumps("Please provide a query!")
     }
  else:
     return {
        "statusCode" : 200,
        'headers': {
                'Access-Control-Allow-Origin': '*'
            },
          "body" : retrieve_from_knowledge_base(query)
     }
