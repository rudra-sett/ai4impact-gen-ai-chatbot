import urllib.request
from bs4 import BeautifulSoup
import boto3
import os
from datetime import datetime
import json
import time


# URL of the site to fetch
url = 'https://malegislature.gov/Laws/SessionLaws/Acts/'
bucket_name = os.environ['BUCKET']
queue_name = os.environ['QUEUE']
start_time = time.time()

s3 = boto3.client('s3')
sqs = boto3.resource('sqs')


def pull_page(year, act):
    with urllib.request.urlopen(url + str(year) + "/" + "Chapter" +str(act)) as response:
        html = response.read().decode('utf-8') 
            
        soup = BeautifulSoup(html, 'html.parser')
        
        class_list = ['col-xs-12', 'col-md-8']
        target_div = soup.find('div', class_=" ".join(class_list))
        paragraphs = target_div.find_all('p')
        
        text = ""
        for p in paragraphs:
            text = text + "\n" + p.get_text().replace('\xa0', ' ')
        title = soup.find("h2", class_="chapterTitle").text
        
        return title + "\n\n" + text
    

def process_year(year,start=1):
    
    error = False
    act = start
    error_count = 0

    while not error:

        # if this has been running for over 14 minutes already,
        # stop crawling and add this to the queue for a new Lambda instance to continue

        if time.time() - start_time > 840:
            queue = sqs.get_queue_by_name(
                QueueName=queue_name,
            )
            queue.send_message(                
                MessageBody=json.dumps({'year': year, 'start' : act}),
                MessageAttributes={},
                MessageGroupId=str(year) + str(act),
                MessageDeduplicationId=str(year) + str(act)
            )
            print("stopped crawling, passing job to next worker")
            error=True
        try:
            print("Act: "+ str(act))
            page = pull_page(year,act)
            key = f"acts/{year}/chapter-{act}.txt"
            s3.put_object(Bucket=bucket_name, Key=key, Body=page.encode('utf-8'))
            act += 1
            error_count = 0
        except urllib.error.HTTPError as e:
            if error_count > 2:
                print("ran out of pages to crawl, next year!")
                print(f"Error: {e.code} - {e.reason}")
                error = True
                continue
            else:
                print(f"Error: {e.code} - {e.reason}")
                # sometimes, an individual page is missing, but the rest are available after
                # so, just move on to the next one, and only if more than 2 in a row are missing
                # can you say for sure that the you've reached the end
                error_count += 1
                act += 1

def lambda_handler(event, context):
    # go through each year, though technically this should only receive one at a time
    print(event)
    
    if 'Records' in event:
        for message in event['Records']:
            body = json.loads(message['body'])
            print("Year: "+ str(body['year']))
            if 'start' in body:
                print("Starting from: "+ str(body['start']))
                start = body['start']
                year = body['year']
                process_year(year,start)
            else:
                process_year(year)
            
    elif 'source' in event:
        year = str(datetime.now().year)
        print(f"Got EventBridge trigger, now crawling {year}")
        # this came from eventbridge schedule, so we know for sure we want to crawl this year's acts only
        # TODO: scan the S3 bucket for the newest chapter we already have for this year so we know which specific chapter to start from
        # this will reduce duplicate crawls of the malegislature site though it's not actually a huge issue
        process_year(year)