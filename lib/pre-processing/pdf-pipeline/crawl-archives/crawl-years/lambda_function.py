import boto3
import urllib.request
import os
import json
import time
import random
from bs4 import BeautifulSoup

sqs = boto3.resource('sqs')

queue_name = os.environ['PAGE_QUEUE']
host = 'https://archives.lib.state.ma.us'

def get_chapter_links(year,link):
    collection_id = link.split('/')[-1]
    
    final_links = []
    
    stop = False
    page = 1
    
    while not stop:
        titles_url = f'https://archives.lib.state.ma.us/browse/title?scope={collection_id}&bbm.rpp=100'
        if page > 1:
            titles_url += f'&bbm.page={page}'
        print(page)
        try:
            with urllib.request.urlopen(titles_url) as response:
                html = response.read().decode('utf-8')  # Read and decode the content
                soup = BeautifulSoup(html, 'html.parser')
                title_class = 'item-list-title'
                act_links = soup.find_all('a', class_=title_class)
                
                print(f'got {len(act_links)} links!')
                
                if len(act_links) == 0:
                    stop = True
                
                for link in act_links:                
                    if link.get_text().strip() == 'Loading...':
                        pass
                    else:
                        title = link.get_text()
                        print(title)
                        url = host + link['href']
                        final_links.append({'title' : title, 'url' : url,'year' : year})                                    
                page += 1
        except urllib.error.HTTPError as e:
            print(e)
            time.sleep(15)
            continue
        
    return final_links
        
def lambda_handler(event, context):
    
    print(event['Records'])
    
    for message in event['Records']:
        body = json.loads(message['body'])
        year_link = body['url']
        year = body['year']
        page_links = get_chapter_links(year,year_link)
        for link in page_links:
            queue = sqs.get_queue_by_name(
                QueueName=queue_name,
            )
            response = queue.send_message(                
                MessageBody=json.dumps(link),
                MessageAttributes={},
                MessageGroupId=str(link['year']),
                MessageDeduplicationId=str(random.randint(1, 100000000))
            )
            print(f"Sent message for year {link['year']}, MessageId: {response['MessageId']}")