import os
import re
import requests
import boto3
from requests.auth import HTTPBasicAuth
# Retrieve environment variables for Knowledge Base and Data Source
kb_index = os.environ['KB_ID']
source_index = os.environ['SOURCE']

# Initialize a Bedrock client
client = boto3.client('bedrock-agent')

def lambda_handler(event, context):
    help_center_endpoint = os.environ.get("HELP_CENTER_ENDPOINT")   
    username = os.environ.get("USERNAME")
    password = os.environ.get("PASSWORD")
    client_id = os.environ.get("CLIENT_ID")
    client_secret = os.environ.get("CLIENT_SECRET")

    pages = []
    
    token_req_body = {"grant_type": "password", "client_id": client_id, 
            "client_secret": client_secret, "scope": "read",
            "username": username, "password": password}
    token_response = requests.post('https://trac.zendesk.com/oauth/tokens',data=token_req_body)
    token = token_response.json()["access_token"]
    headers = {"Authorization" : f"Bearer {token}"}
        
    try:
        
        data = requests.get(help_center_endpoint,headers=headers).json()
        print(data)
    except Exception as e:
        print(e)
        print("Caught error: Zendesk crawl error")
        return
    for article in data["articles"]: 
        pages.append(article)
    next_page = data["next_page"]
    while next_page:
        data = requests.get(next_page,headers=headers).json()
        for article in data["articles"]: 
            pages.append(article)
        next_page = data["next_page"]
        print(next_page)
    print("completed scan")
    
    
    if os.environ.get("REMOVE_EMAILS", "FALSE") == "TRUE":
        filtered_pages = []
        for page in pages:
            matches = re.findall(r'[\w.+-]+@[\w-]+\.[\w.-]+', page["body"])
            filtered = page
            for match in matches:
                domain = match.split("@")[1]
                filtered["body"] = re.sub(match,f'[EMAIL REDACTED, domain was {domain}]',filtered["body"])            
            filtered_pages.append(filtered)
        pages = filtered_pages
    
    
    s3 = boto3.client('s3')
    article_bucket = os.environ["ARTICLE_BUCKET"]    
    print("saving pages")
    for page in pages:
      file_name = f"{page["title"]+' (Zendesk)'+'.html'}"
      s3.put_object(Bucket=article_bucket, Key=file_name, Body=page["body"])
    print("starting kb sync for zendesk")
    try:
        client.start_ingestion_job(
                    dataSourceId=source_index,
                    knowledgeBaseId=kb_index
            )
    except:
        print("Caught error: Zendesk KB sync error")
