import json
import boto3
import os


def lambda_handler(event, context):
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
    payload = json.loads(event['body'])

    try:
        s3 = boto3.resource('s3')
        return s3.Object(os.environ['BUCKET'], payload['KEY']).delete()
    except:

        return {
            'statusCode': 502,
            'body': json.dumps('FAILED')
        }
