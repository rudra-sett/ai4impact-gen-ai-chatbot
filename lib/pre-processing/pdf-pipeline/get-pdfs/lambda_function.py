import urllib.request 
import boto3
import os

# client = boto3.client('textract')
client = boto3.client('s3')

bucket_name = os.environ['BUCKET']
            

def lambda_handler(event, context):
    for i in range(1960,1997):
      url = f'https://www.mass.gov/doc/acts-and-resolves-{i}/download'
      response = ""
      volume = 0
      try:
          response = urllib.request.urlopen(url)
          data = response.read()
          client.put_object(Body=data, Bucket=bucket_name, Key=f"acts-and-resolves-{i}.pdf")
      except:
          # means there are multiple volumes
          for volume in range(1,5):
              url = f'https://www.mass.gov/doc/acts-and-resolves-{i}-volume-{volume}/download'
              try:
                  response = urllib.request.urlopen(url)
                  data = response.read()
                  client.put_object(Body=data, Bucket=bucket_name, Key=f"acts-and-resolves-{i}-volume-{volume}.pdf")
              except:
                  print("no more volumes")
                  break