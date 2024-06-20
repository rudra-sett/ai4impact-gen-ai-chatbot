import os
import re
import requests
import boto3
from requests.auth import HTTPBasicAuth
# Retrieve environment variables for Kendra index and source index
kendra_index = os.environ['KENDRA']
source_index = os.environ['SOURCE']

# Initialize a Kendra client
client = boto3.client('kendra')

def lambda_handler(event, context):
    help_center_endpoint = os.environ.get("HELP_CENTER_ENDPOINT")   
    username = os.environ.get("USERNAME")
    password = os.environ.get("PASSWORD")

    pages = []
    try:
        data = requests.get(help_center_endpoint,auth=HTTPBasicAuth(username, password)).json()
    except:
        print("Caught error: Zendesk crawl error")
        return
    for article in data["articles"]: 
        pages.append(article)
    next_page = data["next_page"]
    while next_page:
        data = requests.get(next_page,auth=HTTPBasicAuth(username, password)).json()
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
    print("starting kendra sync for zendesk")
    try:
        client.start_data_source_sync_job(
                        Id=source_index,
                        IndexId=kendra_index)
    except:
        print("Caught error: Zendesk Kendra sync error")
