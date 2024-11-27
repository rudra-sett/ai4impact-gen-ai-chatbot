import urllib.request
from bs4 import BeautifulSoup
import boto3
import os
from datetime import datetime


# URL of the site to fetch
url = 'https://malegislature.gov/Laws/SessionLaws/Acts/'
bucket_name = os.environ['BUCKET']
s3 = boto3.client('s3')

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
    

def process_year(year):
    
    error = False
    act = 1
    
    while not error:
        try:
            print("Act: "+ str(act))
            page = pull_page(year,act)
            key = f"acts/{year}/chapter-{act}.txt"
            s3.put_object(Bucket=bucket_name, Key=key, Body=page.encode('utf-8'))
            act += 1
        except urllib.error.HTTPError as e:
            print("ran out of pages to crawl, next year!")
            print(f"Error: {e.code} - {e.reason}")
            error = True
            continue

def lambda_handler(event, context):
    # go through each year, though technically this should only receive one at a time
    print(event)
    
    if 'Records' in event:
        for message in event['Records']:
            year = message['body']
            print("Year: "+ str(year))
            process_year(year)
            
    elif 'source' in event:
        year = str(datetime.now().year)
        print(f"Got EventBridge trigger, now crawling {year}")
        # this came from eventbridge schedule, so we know for sure we want to crawl this year's acts only
        # TODO: scan the S3 bucket for the newest chapter we already have for this year so we know which specific chapter to start from
        # this will reduce duplicate crawls of the malegislature site though it's not actually a huge issue
        process_year(year)