import os
import requests
import boto3
from requests.auth import HTTPBasicAuth

def lambda_handler(event, context):
    help_center_endpoint = os.environ.get("HELP_CENTER_ENDPOINT")   
    username = os.environ.get("USERNAME")
    password = os.environ.get("PASSWORD")

    pages = []
    data = requests.get(help_center_endpoint,auth=HTTPBasicAuth(username, password)).json()
    pages.append(*data["articles"])
    next_page = data["next_page"]
    while next_page:
        data = requests.get(next_page,auth=HTTPBasicAuth(username, password)).json()
        pages.append(data["articles"])
        next_page = data["next_page"]
        print(next_page)
    print("completed scan")
    s3 = boto3.client('s3')
    article_bucket = os.environ["ARTICLE_BUCKET"]    
    print("saving pages")
    for page in pages:
      file_name = f"{page["title"]+'.txt'}"
      s3.put_object(Bucket=article_bucket, Key=file_name, Body=page["body"])