import boto3
import urllib.request
import os
from bs4 import BeautifulSoup
import json

sqs = boto3.resource('sqs')

queue_name = os.environ['YEAR_QUEUE']
host = 'https://archives.lib.state.ma.us'

def get_year_links(year_links_url = 'https://archives.lib.state.ma.us/communities/a3fc05b2-8723-4b83-8654-59385a38f64f?cmcl.page=1&cmcl.rpp=100'):
    with urllib.request.urlopen(year_links_url) as response:
        html = response.read().decode('utf-8')  # Read and decode the content
        soup = BeautifulSoup(html, 'html.parser')
        year_links = soup.find_all('ds-listable-object-component-loader')
        links = []
        for link in year_links:
            url = link.find('a')
            if 'communities' in url['href'] and '1692' not in url.get_text().strip():
                additional_links = get_year_links(host + url['href'] + '?cmcl.page=1&cmcl.rpp=100')
                links += additional_links
            elif '1692' not in url.get_text().strip():
                # links[url.get_text().strip()] =  host + url['href']
                links.append({'year' : url.get_text().strip(), 'url' : host + url['href']})
        return links
        
def lambda_handler(event, context):
    links = get_year_links()
    for link in links:
            if int(link['year']) < 1960:
                queue = sqs.get_queue_by_name(
                    QueueName=queue_name,
                )
                response = queue.send_message(                
                    MessageBody=json.dumps(link),
                    MessageAttributes={},
                    MessageGroupId=str(link['year']),
                    MessageDeduplicationId=str(link['year'])
                )
                print(f"Sent message for year {link['year']}, MessageId: {response['MessageId']}")