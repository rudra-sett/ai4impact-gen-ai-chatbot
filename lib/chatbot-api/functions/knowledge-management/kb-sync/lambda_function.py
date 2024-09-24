import json
import boto3
import os

# Retrieve environment variables for Knowledge Base index and source index
kb_index = os.environ['KB_ID']
source_index = os.environ['SOURCE']

# Initialize a Bedrock Agent client
client = boto3.client('bedrock-agent')

def check_running():
    """
    Check if any sync jobs for the specified data source and index are currently running.

    Returns:
        bool: True if there are any ongoing sync or sync-indexing jobs, False otherwise.
    """
    # List ongoing sync jobs with status 'SYNCING'
    syncing = client.list_ingestion_jobs(
        dataSourceId=source_index,
        knowledgeBaseId=kb_index,
        filters=[{
            'attribute': 'STATUS',
            'operator': 'EQ',
            'values': [
                'IN_PROGRESS',
            ]
        }]
    )
    
    # List ongoing sync jobs with status 'STARTING'
    starting = client.list_ingestion_jobs(
        dataSourceId=source_index,
        knowledgeBaseId=kb_index,
        filters=[{
            'attribute': 'STATUS',
            'operator': 'EQ',
            'values': [
                'STARTING',
            ]
        }]
    )
    
    # Combine the history of both job types
    hist = starting['ingestionJobSummaries'] + syncing['ingestionJobSummaries']
    
    # Check if there are any jobs in the history
    if len(hist) > 0:
        return True

def get_last_sync():    
    syncs = client.list_ingestion_jobs(
        dataSourceId=source_index,
        knowledgeBaseId=kb_index,
        filters=[{
            'attribute': 'STATUS',
            'operator': 'EQ',
            'values': [
                'COMPLETE',
            ]
        }]
    )
    hist = syncs["ingestionJobSummaries"]
    time = hist[0]["updatedAt"].strftime('%B %d, %Y, %I:%M%p UTC')
    return {
                'statusCode': 200,
                'headers': {'Access-Control-Allow-Origin': '*'},
                'body': json.dumps(time)
            }


def lambda_handler(event, context):
    """
    AWS Lambda handler function for handling requests.

    Args:
        event (dict): The event dictionary containing request data.
        context (dict): The context dictionary containing information about the Lambda function execution.

    Returns:
        dict: A response dictionary with a status code, headers, and body.
    """
    
    # Retrieve the resource path from the event dictionary
    resource_path = event.get('rawPath', '')
    
    # Check admin access    
    try:
        claims = event["requestContext"]["authorizer"]["jwt"]["claims"]
        roles = json.loads(claims['custom:role'])
        if "Admin" in roles:                        
            print("admin granted!")
        else:
            return {
                'statusCode': 403,
                'headers': {'Access-Control-Allow-Origin': '*'},
                'body': json.dumps('User is not authorized to perform this action')
            }
    except:
        return {
                'statusCode': 500,
                'headers': {'Access-Control-Allow-Origin': '*'},
                'body': json.dumps('Unable to check user role, please ensure you have Cognito configured correctly with a custom:role attribute.')
            }    
        
    # Check if the request is for syncing Knowledge Base
    if "sync-kb" in resource_path:
        if check_running():
            print("1")

            return {
                'statusCode': 200,
                'headers': {'Access-Control-Allow-Origin': '*'},
                'body': json.dumps('STILL SYNCING')
            }
        
        
        else:
            # Check if the request is for syncing Knowledge Base    
            print("2")
            client.start_ingestion_job(
                    dataSourceId=source_index,
                    knowledgeBaseId=kb_index
            )
        
            return {
                'statusCode': 200,
                'headers': {
                'Access-Control-Allow-Origin': '*'
                },
                'body': json.dumps('STARTED SYNCING')
            }
   
    # Check if the request is for checking the sync status        
    elif "still-syncing" in resource_path:
        status_msg = 'STILL SYNCING' if check_running() else 'DONE SYNCING'
        return {
            'statusCode': 200,
            'headers': {'Access-Control-Allow-Origin': '*'},
            'body': json.dumps(status_msg)
            }
    elif "last-sync" in resource_path:
        return get_last_sync()