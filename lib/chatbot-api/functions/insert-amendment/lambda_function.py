import boto3
import json
import re
import os

bedrock = boto3.client('bedrock-runtime')
modelId = 'anthropic.claude-3-5-sonnet-20240620-v1:0'
bucket_name = os.environ['BUCKET']
ddb_table_name = os.environ['DDB_TABLE_NAME']

def get_act_text(year, chapter):
    s3 = boto3.client('s3')
    response = s3.get_object(Bucket=bucket_name, Key=f'acts/{year}/chapter-{chapter}.txt')
    body = response['Body'].read().decode('utf-8', 'ignore')
    return body

def lambda_handler(event, context):
    data = json.loads(event['body'])
    amended_year = data['year']
    amended_chapter = data['chapter']
    amending_year = data['amend_year']
    amending_chapter = data['amend_chapter']
    original = get_act_text(amended_year, amended_chapter)
    amendment = get_act_text(amending_year, amending_chapter)

    return {
        "statusCode" : 200,
        "body" : json.dumps(process_amendments(original, f"Chapter {amended_chapter} of the Acts of {amended_year}", [amendment], amended_year, amended_chapter, amending_year, amending_chapter))
    }

def process_amendments(original_text, original_chapter, amendments, amended_year, amended_chapter, amending_year, amending_chapter):
    current_text = original_text
    for amendment in amendments:
        structured = structure_amendment(
            amendment_text=amendment, 
            original_text=current_text, 
            chapter_name=original_chapter,
            amended_year=amended_year, 
            amended_chapter=amended_chapter, 
            amending_year=amending_year, 
            amending_chapter=amending_chapter
        )
        if structured:
            for call in structured:
                current_text = apply_structured_amendment(current_text, call, amendment)
    return current_text

def structure_amendment(amendment_text, original_text, chapter_name, amended_year, amended_chapter, amending_year, amending_chapter):
    # First, check DynamoDB if the structured amendments are already stored
    ddb = boto3.resource('dynamodb')
    table = ddb.Table(ddb_table_name)

    pk = f"INSERTION-{amended_year}-{amended_chapter}"
    sk = f"{amending_year}-{amending_chapter}"

    # Attempt to retrieve from DynamoDB first
    existing_record = table.get_item(Key={'Amended': pk, 'AmendedBy': sk})
    if 'Item' in existing_record:
        # If we already have the structured amendments, return them directly
        print("Found existing structured amendments in DynamoDB. Skipping LLM call.")
        return existing_record['Item']['tool_calls']

    # If not found in DDB, call the LLM
    body = {
        "anthropic_version": "bedrock-2023-05-31",
        "system": """
                    You are a skilled, precise legal document editor. Your task is to accurately apply changes from an amending Session Law to an original Session Law using a text editing tool. Here's how to approach this task:

                    Key Responsibilities:
                    
                    Amendment Focus:
                    
                    Identify and apply specific modifications stated in the amending act.
                    Concentrate on explicit alterations to the original text.
                    Precise Wording:
                    
                    Maintain exact wording from both original and amending texts.
                    Replicate the text as written, including any existing errors.
                    Formatting Guidelines: For minor changes (single words, phrases, or sentences): Use: target_text: [exact text to replace] new_text: [exact replacement text]
                    
                    For major changes (multiple sentences, paragraphs, or sections): Use: original_start_selector: [unique phrase marking start of replaced section] original_end_selector: [unique phrase marking end of replaced section] amendment_start_selector: [unique phrase marking start of new text] amendment_end_selector: [unique phrase marking end of new text]
                    
                    Important:
                    
                    Use the major change format with selectors for larger, multi-paragraph modifications.
                    Apply a single format (either minor or major) for each modification.
                    Selector Best Practices:
                    
                    Choose selectors verbatim from the text.
                    Ensure selectors are unique within their respective document segment.
                    Include necessary headers or punctuation to maintain legal structure and context.
                    Use original_start_selector and original_end_selector from the original text only.
                    Use amendment_start_selector and amendment_end_selector from the amendment text only.
                    Process: Before executing edits, use <thinking> tags to briefly explain the intended change and your reasoning.
                    Additionally, do a verification check on your chosen edits to make sure new text and target text, or original and amendment selectors are **found in their respective texts**, **non-overlapping**, and **will make the appropriate changes**.
                    
                    By following these guidelines, you'll effectively edit legal documents while preserving their integrity and accuracy. You will not receive a tool response or output, so please make multiple edit tool calls at once.
        """,
        "messages": [
            {
                "role": "user",
                "content": [
                    {
                        "type": "text",
                        "text": f"""
                                    <original_text name={chapter_name}>
                                    {original_text}
                                    </original_text>
                                    
                                    <amending_act>
                                    {amendment_text}
                                    </amending_act>
                                """
                    }
                ]
            }
        ],
        "tools": [
            {
                "name": "text_editor",
                "description": "Makes insertions, replacements, or deletions of content in text.",
                "input_schema": {
                    "type": "object",
                    "properties": {
                        "amendment_type": {
                            "type": "string",
                            "enum": ["insert", "replace", "strike"],
                            "description": "The type of amendment"
                        },
                        "target_text": {
                            "type": "string",
                            "description": "The exact text being modified, use this for small changes like individual words or sentences."
                        },
                        "new_text": {
                            "type": "string",
                            "description": "The replacement text, use this for small changes like individual words or sentences."
                        },
                        "position": {
                            "type": "string",
                            "enum": ["before", "after"],
                            "description": "For insertions, whether to insert before or after."
                        },
                        "original_start_selector": {
                            "type": "string",
                            "description": "Short phrase marking start of section change. Use this only for large changes."
                        },
                        "original_end_selector": {
                            "type": "string",
                            "description": "Short phrase marking end of section change. Use this only for large changes."
                        },
                        "amendment_start_selector": {
                            "type": "string",
                            "description": "Short phrase marking the start of the relevant portion in the amendment text. Use this only for large changes."
                        },
                        "amendment_end_selector": {
                            "type": "string",
                            "description": "Short phrase marking the end of the relevant portion in the amendment text. Use this only for large changes."
                        }
                    },
                    "required": ["amendment_type"]
                }
            }
        ],
        "max_tokens": 8192,
        "temperature": 0
    }
    
    response = bedrock.invoke_model(
        modelId=modelId,
        body=json.dumps(body)
    )
    
    response_body = json.loads(response['body'].read().decode('utf-8'))
    tool_calls = []
    for block in response_body['content']:
        print(block)
        if block['type'] == 'tool_use':
            tool_calls.append(block['input'])
    
    # If we got tool_calls from LLM, store them in DynamoDB for future use
    if tool_calls:
        table.put_item(
            Item={
                'Amended': pk,
                'AmendedBy': sk,
                'tool_calls': tool_calls
            }
        )
        return tool_calls
    
    return None

def apply_structured_amendment(original_text, structured_amendment, amendment_text=None):
    print(structured_amendment)
    # Check if we need to extract the new_text from a subset of the amendment_text
    if amendment_text and 'amendment_start_selector' in structured_amendment and 'amendment_end_selector' in structured_amendment:
        start_marker = structured_amendment['amendment_start_selector']
        end_marker = structured_amendment['amendment_end_selector']
        
        start_esc = re.escape(start_marker)
        end_esc = re.escape(end_marker)
        
        pattern = rf'(?P<content>{start_esc}.*?{end_esc})'
        match = re.search(pattern, amendment_text, flags=re.DOTALL)
        if not match:
            if start_marker == end_marker:
                structured_amendment['new_text'] = start_marker
                print("Start and end markers were the same - doing simple replace")
            else:
                print(f"Could not find amendment text between {start_marker} and {end_marker}")
                return original_text
        else:
            extracted_new_text = match.group('content').strip()
            structured_amendment['new_text'] = extracted_new_text

    # Handle major changes (original_start_selector and original_end_selector)
    if 'original_start_selector' in structured_amendment and 'original_end_selector' in structured_amendment:
        start = structured_amendment['original_start_selector']
        end = structured_amendment['original_end_selector']
        
        start_esc = re.escape(start)
        end_esc = re.escape(end)
        
        pattern = rf'(?P<content>{start_esc}.*?{end_esc})'
        match = re.search(pattern, original_text, flags=re.DOTALL)
        if not match:
            if start_esc == end_esc:
                structured_amendment['target_text'] = structured_amendment['original_start_selector']
                print("Start and end markers were the same - doing simple replace")
            else:
                print(f"Could not find original text between {start} and {end}")
                return original_text
        else:
            extracted_original_text = match.group('content').strip()
            structured_amendment['target_text'] = extracted_original_text

    # handle cases where only one selector is present
    if 'original_start_selector' in  structured_amendment and 'original_end_selector' not in structured_amendment:
        structured_amendment['target_text'] = structured_amendment['original_start_selector']
    
    if 'original_end_selector' in  structured_amendment and 'original_start_selector' not in structured_amendment:
        structured_amendment['target_text'] = structured_amendment['original_end_selector']

    if 'position' not in structured_amendment and structured_amendment['amendment_type'] == 'insert':
        structured_amendment['amendment_type'] = 'replace'

    # Apply the changes according to the amendment_type
    amendment_type = structured_amendment['amendment_type']
    if amendment_type == 'replace':
        return original_text.replace(
            structured_amendment['target_text'],
            '[REPLACED:]' + structured_amendment['new_text']
        )
    elif amendment_type == 'insert':        
        idx = original_text.find(structured_amendment['target_text'])
        if idx == -1:
            print(f"Could not find target text: {structured_amendment['target_text']}")
            return original_text
        if structured_amendment['position'] == 'after':
            idx += len(structured_amendment['target_text'])
        return original_text[:idx] + " [INSERTED:] " + structured_amendment['new_text'] + original_text[idx:]
    elif amendment_type == 'strike':
        return original_text.replace(structured_amendment['target_text'], '[REMOVED]')

    return original_text
