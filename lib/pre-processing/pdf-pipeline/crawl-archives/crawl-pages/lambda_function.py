import boto3
import json
import urllib.request
import os
import time
from bs4 import BeautifulSoup

s3 = boto3.client('s3')
textract = boto3.client('textract')
sqs = boto3.resource("sqs")

bucket_name = os.environ['BUCKET']
queue_name = os.environ['QUEUE']

host = 'https://archives.lib.state.ma.us'

def start_job(bucket_name, object_name):
    response = textract.start_document_analysis(
        DocumentLocation={
            'S3Object': {
                'Bucket': bucket_name,
                'Name': object_name
            }
        },
        FeatureTypes=['LAYOUT']
    )
    return response['JobId']

def add_to_queue(message_body, index):    
    try:
        queue = sqs.get_queue_by_name(
            QueueName=queue_name,
        )
        response = queue.send_message(
            MessageBody=message_body, MessageAttributes={},MessageGroupId=index,
            MessageDeduplicationId=str(index)
        )
    except Exception as error:
        print("Send message failed: %s", message_body)
        raise error
    else:
        return response

def download_page(link):
    act_page_response = urllib.request.urlopen(link)
    act_html = act_page_response.read().decode('utf-8')
    act_soup = BeautifulSoup(act_html, 'html.parser')
    act_dls = act_soup.find_all('ds-file-download-link')
    dl_url = act_dls[-1].find('a')['href']
    dl_name = act_dls[-1].find('a').get_text().split(".")[0]
    item_id = dl_url.split('/')[-2]
    
    # retry = 6
    while True:
        try:
            file = urllib.request.urlopen(host + f'/server/api/core/bitstreams/{item_id}/content').read()
            year = dl_name[:4]
            key = f"archives/acts/{year}/acts-and-resolves-{year}-chapter-{int(dl_name[-4:])}.pdf"
            s3.put_object(Bucket=bucket_name, Key=key, Body=file)
            if (int(year) > 1959):
                job_id = start_job(bucket_name,key)
                add_to_queue(key + " job id - " + job_id,job_id)
        except urllib.error.HTTPError as e:
            print(e)
            time.sleep(15)            
            continue 
        
def lambda_handler(event, context):
    
    print(event['Records'])
        
    for message in event['Records']:
        item = json.loads(message['body'])
        download_page(item['url'])