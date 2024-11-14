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
    for result in results:
        #results[i]['content']['text'] = result['content']['text'][:150] + "..."]        
        label = result['location']['s3Location']['uri']
        parts = label.split("/")
        year = parts[-2]
        chapter_piece = parts[-1]
        chapter = chapter_piece.split("-")[1].split(".")[0]
        law_type = parts[-3]
        if law_type == "acts":
           law_type = "Acts"
        else: 
           law_type == "Resolves"
        clean_results.append({
           "content" : result['content']['text'][:300] + "...",
           "chapter" : f'Chapter {chapter} of the {law_type} of {year}'
        })
    print(clean_results)
    return clean_results


def lambda_handler(event, context):
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
          "body" : json.dumps(retrieve_from_knowledge_base(query))
     }
