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
    stop = False
    while not stop:
        try:
            time.sleep(15)
            act_page_response = urllib.request.urlopen(link)
            act_html = act_page_response.read().decode('utf-8')
            print(act_page_response.getcode())
            act_soup = BeautifulSoup(act_html, 'html.parser')
            act_dls = act_soup.find_all('ds-file-download-link')
            print(act_dls) 
            for dl_item in act_dls:
                dl_url = dl_item.find('a')['href']
                dl_info = dl_item.find('a').get_text().split(".")
                dl_name = dl_info[0]
                item_id = dl_url.split('/')[-2]
                file = urllib.request.urlopen(host + f'/server/api/core/bitstreams/{item_id}/content').read()
                year = dl_name[:4]
                law_type = 'acts'
                if "resolve" in dl_name.lower():
                    law_type = 'resolves'
                # skip if there is no chapter number at all
                print(dl_name)                
                if 'pdf' in dl_info[1] and len(act_dls) == 1:
                    if (dl_name[-4:-1].isalpha()):
                        print("this doesn't have a chapter!")
                        stop = True
                        continue
                    if dl_name[-1].isalpha():  
                        key = f"archives/{law_type}/{year}/acts-and-resolves-{year}-chapter-{str(int(dl_name[-5:-1])) + dl_name[-1]}.pdf"
                    else:
                        key = f"archives/{law_type}/{year}/acts-and-resolves-{year}-chapter-{int(dl_name[-4:])}.pdf"
                    print(key)
                    s3.put_object(Bucket=bucket_name, Key=key, Body=file)                    
                    job_id = start_job(bucket_name,key)
                    add_to_queue(key + " job id - " + job_id,job_id)
                    stop = True
                elif 'txt' in dl_info[1]:
                    if (dl_name[-4:-1].isalpha()):
                        print("this doesn't have a chapter!")
                        stop = True
                        continue
                    # handle chapter names like 0025a in addition to 0025
                    if dl_name[-1].isalpha():                        
                        key = f"{law_type}/{year}/chapter-{str(int(dl_name[-5:-1])) + dl_name[-1]}.txt"
                    elif dl_name[-4:].isnumeric() == False and dl_name[-3:].isnumeric():                        
                        key = f"{law_type}/{year}/chapter-{int(dl_name[-3:])}.txt"
                    else:
                        key = f"{law_type}/{year}/chapter-{int(dl_name[-4:])}.txt"
                    print(key)
                    s3.put_object(Bucket=bucket_name, Key=key, Body=file)                
                    stop = True
                    break
            if len(act_dls) == 0:
                raise Exception("Couldn't get any links, put this back into the queue!")
        except urllib.error.HTTPError as e:
            print(e)
            time.sleep(15)            
            continue 
        
def lambda_handler(event, context):
    
    print(event['Records'])
        
    for message in event['Records']:
        item = json.loads(message['body'])
        download_page(item['url'])