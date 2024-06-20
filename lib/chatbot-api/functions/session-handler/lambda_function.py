import os
import boto3
from botocore.exceptions import ClientError
import json
from datetime import datetime

# Retrieve DynamoDB table and secondary index names from environment variables
DDB_TABLE_NAME = os.environ["DDB_TABLE_NAME"]
# DDB_SECONDARY_INDEX_NAME = os.environ["DDB_SECONDARY_INDEX_NAME"]

# Initialize a DynamoDB resource using boto3 with a specific AWS region
dynamodb = boto3.resource("dynamodb", region_name='us-east-1')
# Connect to the specified DynamoDB table
table = dynamodb.Table(DDB_TABLE_NAME)

# Define a function to add a session or update an existing one in the DynamoDB table
def add_session(session_id, user_id, chat_history, title, new_chat_entry):
    try:
        # Attempt to add an item to the DynamoDB table with provided details
        response = table.put_item(
            Item={
                'user_id': user_id,  # Identifier for the user
                'session_id': session_id,  # Unique identifier for the session
                'chat_history': [new_chat_entry],  # List of chat history, initiating with the new entry
                "title": title.strip(),  # Title of the session
                "time_stamp": str(datetime.now())  # Current timestamp as a string
            }
        )
        # Return any attributes returned by the DynamoDB operation, default to an empty dictionary if none
        return response.get("Attributes", {})
    except ClientError as error:
        # Check for specific DynamoDB client errors
        print("Caught error: DynamoDB error - could not add new session")
        if error.response["Error"]["Code"] == "ResourceNotFoundException":
            # Return an error message if the DynamoDB resource (e.g., table, item) is not found
            return {'statusCode': 404,
                'headers': {'Access-Control-Allow-Origin': '*'},
                'body': json.dumps(f"No record found with session id: {session_id}")}
        else:
            # Return a general error message for other client errors encountered
            return {'statusCode': 500,
                'headers': {'Access-Control-Allow-Origin': '*'},
                'body': json.dumps(str(error))}


# A function to retrieve a session from DynamoDB based on session_id and user_id
def get_session(session_id, user_id):
    # Initialize a variable to hold the response from DynamoDB
    response = {}
    try:
        # Attempt to retrieve an item using the session_id and user_id as keys
        response = table.get_item(Key={"session_id": session_id, "user_id": user_id})
    except ClientError as error:
        print("Caught error: DynamoDB error - could not get session")
        # Handle specific error when the specified resource is not found in DynamoDB
        if error.response["Error"]["Code"] == "ResourceNotFoundException":
            # Return a 404 Not Found status code and message when the item is not found
            return {
                'statusCode': 404,
                'headers': {'Access-Control-Allow-Origin': '*'},  # Allow all domains for CORS
                'body':  json.dumps(f"No record found with session id: {session_id}")
            }
        else:
            # Return a 500 Internal Server Error status for all other DynamoDB errors
            return {
                'statusCode': 500,
                'headers': {'Access-Control-Allow-Origin': '*'},  # Allow all domains for CORS
                'body': json.dumps('An unexpected error occurred')
            }

    # Prepare the response to the client with a 200 OK status if the item is successfully retrieved
    response_to_client = {
        'statusCode': 200,
        'headers': {
            'Access-Control-Allow-Origin': '*'  # Allow all domains for CORS
        },
        'body': json.dumps(response.get("Item", {}))  # Convert the retrieved item to JSON format
    }
    # Return the prepared response to the client
    return response_to_client

            
def update_session(session_id, user_id, new_chat_entry):
    try:
        # Fetch current session details
        session_response = get_session(session_id, user_id)
        if 'statusCode' in session_response and session_response['statusCode'] != 200:
            return session_response  # Return the error from get_session if any

        session_data = json.loads(session_response['body'])
        
        # Check if 'chat_history' exists in the session data
        current_chat_history = session_data.get('chat_history', [])
        
        # Append the new chat entry to the existing chat history
        updated_chat_history = current_chat_history + [new_chat_entry]
        
        # Update the item in DynamoDB
        response = table.update_item(
            Key={"session_id": session_id, "user_id": user_id},
            UpdateExpression="set chat_history = :chat_history",
            ExpressionAttributeValues={":chat_history": updated_chat_history},
            ReturnValues="UPDATED_NEW"
        )
        return {
            'statusCode': 200,
            'headers': {'Access-Control-Allow-Origin': '*' },
            'body': response.get("Attributes", {})
        }
    except ClientError as error:
        print("Caught error: DynamoDB error - could not update session")
        # Return a structured error message and status code
        error_code = error.response['Error']['Code']
        if error_code == "ResourceNotFoundException":
            return {
                'statusCode': 404,
                'headers': {'Access-Control-Allow-Origin': '*'},
                'error': str(error),
                'body': f"No record found with session id: {session_id}"
            }
        else:
            return {
                'statusCode': 500,
                'headers': {'Access-Control-Allow-Origin': '*'},
                'error': str(error),
                'body': 'Failed to update the session due to a database error.'
            }
    except Exception as general_error:
        print("Caught error: DynamoDB error - could not update session")
        # Return a generic error response for unexpected errors
        return {
            'statusCode': 500,
            'headers': {'Access-Control-Allow-Origin': '*'},
            'error': str(general_error),
            'body': 'An unexpected error occurred while updating the se.'
        }


def delete_session(session_id, user_id):
    try:
        # Attempt to delete an item from the DynamoDB table based on the provided session_id and user_id.
        table.delete_item(Key={"session_id": session_id, "user_id": user_id})
    except ClientError as error:
        print("Caught error: DynamoDB error - could not delete session")
        # Handle specific DynamoDB client errors. If the item cannot be found or another error occurs, return the appropriate message.
        error_code = error.response['Error']['Code']
        if error_code == "ResourceNotFoundException":
            return { 'statusCode': 404, "id": session_id, "deleted": False,'headers': {'Access-Control-Allow-Origin': '*'}, "body": json.dumps(f"No record found with session id: {session_id}")}
        else:
            return { 'statusCode': 500, "id": session_id, "deleted": False,'headers': {'Access-Control-Allow-Origin': '*'}, "body": json.dumps(f"Error occurred: {error}")}

    # If no exceptions are raised, return a response indicating that the deletion was successful.
    return {'statusCode': 200, "id": session_id,'headers': {'Access-Control-Allow-Origin': '*'}, "deleted": True}



def delete_user_sessions(user_id):
    try:
        # Fetch all sessions associated with the given user_id. This function should return a list of session dictionaries.
        sessions = list_sessions_by_user_id(user_id)
        ret_value = []  # Initialize a list to hold the results of the deletion attempts.

        # Iterate through each session fetched from the database.
        for session in sessions:
            # Attempt to delete each session and capture the result.
            result = delete_session(session["SessionId"], user_id)
            # Append the result of the deletion attempt to the ret_value list. 
            # This includes the session ID and whether the deletion was successful.
            ret_value.append({"id": session["SessionId"], "deleted": result["deleted"]})

        # Return a list of dictionaries, each containing the session ID and deletion result.
        return ret_value

    except Exception as error:
        # Handle any unexpected errors that might occur during the process.
        # Return a list containing a single dictionary with an error message.
        return [{"error": str(error)}]
        
        
def list_sessions_by_user_id(user_id, limit = 15):
    items = []  # Initialize an empty list to store the fetched session items

    try:
        last_evaluated_key = None  # Initialize the key to control the pagination loop

        # Keep fetching until we have 15 items or there are no more items to fetch
        while len(items) < limit:
            response = table.query(
                IndexName='TimeIndex',  # Specify the secondary index to perform the query
                ProjectionExpression='session_id, title, time_stamp',  # Limit the fields returned in the results
                KeyConditionExpression="user_id = :user_id",  # Define the key condition for the query
                ExpressionAttributeValues={":user_id": user_id},  # Bind the user_id value to the placeholder in KeyConditionExpression
                ScanIndexForward=False,  # Sort the results in descending order by the sort key
                Limit=limit - len(items),  # Dynamically adjust the query limit based on how many items we've already retrieved
            )
            items.extend(response.get("Items", []))  # Extend the items list with the newly fetched items

            last_evaluated_key = response.get("LastEvaluatedKey")  # Update the pagination key
            if not last_evaluated_key:  # Break the loop if there are no more items to fetch
                break

    except ClientError as error:
        print("Caught error: DynamoDB error - could not list user sessions")
        # More detailed client error handling based on DynamoDB error codes
        error_code = error.response['Error']['Code']
        if error_code == "ResourceNotFoundException":
            return {'statusCode': 404,
            'headers': { 'Access-Control-Allow-Origin': '*'}, 
            'body': f"No record found for user id: {user_id}"}
        elif error_code == "ProvisionedThroughputExceededException":
            return {'statusCode': 429,
            'headers': {
            'Access-Control-Allow-Origin': '*'  # CORS header allowing access from any domain
        }, 'body': "Request limit exceeded"}
        elif error_code == "ValidationException":
            return {'statusCode': 400,
            'headers': {
            'Access-Control-Allow-Origin': '*'  # CORS header allowing access from any domain
        }, 'body': "Invalid input parameters"}
        else:
            return {'statusCode': 500,
            'headers': {
            'Access-Control-Allow-Origin': '*'  # CORS header allowing access from any domain
        }, 'body': "Internal server error"}
    except KeyError as key_error:
        print("Caught error: DynamoDB error - could not list user sessions")
        # Handle errors that might occur if expected keys are missing in the response
        return {'statusCode': 500,
        'headers': {
            'Access-Control-Allow-Origin': '*'  # CORS header allowing access from any domain
        }, 'body': f"Key error: {str(key_error)}"}
    except Exception as general_error:
        print("Caught error: DynamoDB error - could not list user sessions")
        # Generic error handling for any other unforeseen errors
        return {'statusCode': 500,
        'headers': {
            'Access-Control-Allow-Origin': '*'  # CORS header allowing access from any domain
        }, 'body': json.dumps(f"An unexpected error occurred: {str(general_error)}")}

    # Sort the items by 'time_stamp' in descending order to ensure the latest sessions appear first
    sorted_items = sorted(items, key=lambda x: x['time_stamp'], reverse=True)
    sorted_items = list(map(lambda x: {"time_stamp" : x["time_stamp"], "session_id" : x["session_id"], "title" : x["title"].strip()},sorted_items))

    # Prepare the HTTP response object with a status code, headers, and body
    response = {
        'statusCode': 200,  # HTTP status code indicating a successful operation
        'headers': {
            'Access-Control-Allow-Origin': '*'  # CORS header allowing access from any domain
        },
        'body': json.dumps(sorted_items)  # Convert the sorted list of items to JSON format for the response body
    }
    return response  # Return the response object




def lambda_handler(event, context):
    data = json.loads(event['body'])
    operation = data.get('operation')
    user_id = data.get('user_id')
    session_id = data.get('session_id')
    chat_history = data.get('chat_history', None)
    new_chat_entry = data.get('new_chat_entry')
    title = data.get('title', f"Chat on {str(datetime.now())}")
    if operation != 'list_sessions_by_user_id':
        print(operation)
    print(data)
    print(new_chat_entry)

    if operation == 'add_session':
        return add_session(session_id, user_id, chat_history, title, new_chat_entry)
    elif operation == 'get_session':
        return get_session(session_id, user_id)
    elif operation == 'update_session':
        return update_session(session_id, user_id, new_chat_entry)
    elif operation == 'list_sessions_by_user_id':
        return list_sessions_by_user_id(user_id)
    elif operation == 'list_all_sessions_by_user_id':
        return list_sessions_by_user_id(user_id,limit=100)
    elif operation == 'delete_session':
        return delete_session(session_id, user_id)
    elif operation == 'delete_user_sessions':
        return delete_user_sessions(user_id)
    else:
        response = {
            'statusCode': 400,
            'headers': {
                'Access-Control-Allow-Origin': '*'
            },
            'body': json.dumps(f'Operation not found/allowed! Operation Sent: {operation}')
        }
        return response
    
