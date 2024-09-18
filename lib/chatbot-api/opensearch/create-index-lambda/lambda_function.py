import os
import boto3
from opensearchpy import OpenSearch, RequestsHttpConnection, AWSV4SignerAuth
from botocore.awsrequest import AWSRequest
import json
import time

def lambda_handler(event, context):
    # 1. Defining the request body for the index and field creation
    host = os.environ["COLLECTION_ENDPOINT"]
    print(f"Collection Endpoint: " + host)
    index_name = os.environ["INDEX_NAME"]
    print(f"Index name: " + index_name)    
        
    payload = {
      "settings": {
        "index": {
          "knn": True,
          "knn.algo_param.ef_search": 512
        }
      },
      "mappings": { #how do we store, 
        "properties": {
          "vector_field": {
            "type": "knn_vector", #we are going to put 
            "dimension": os.environ["EMBEDDING_DIM"],
            "method": {
              "name": "hnsw",
              "space_type": "innerproduct",
              "engine": "faiss",
              "parameters": {
                "ef_construction": 512,
                "m": 16
              }
            }
          },
          "metadata_field" : {"type": "text", "index": False},
          "text_field" : {"type": "text"},
        }
      }
    }
    
    # 2. Obtaining AWS credentials and signing the AWS API request 
    region = os.environ["REGION"]
    service = 'aoss'
    credentials = boto3.Session().get_credentials()    
    payload_json = json.dumps(payload)
    auth = AWSV4SignerAuth(credentials, region, service)

    client = OpenSearch(
            hosts=[{"host": host, "port": 443}],
            http_auth=auth,
            use_ssl=True,
            verify_certs=True,
            connection_class=RequestsHttpConnection,
            pool_maxsize=20,
        )
    
    try:
      response = client.indices.create(index_name, body=payload_json)  
      time.sleep(60)   
      return response
    except Exception as e:
       print("Index creation failed! It most likely already exists!")
       print(e)
       return False
    