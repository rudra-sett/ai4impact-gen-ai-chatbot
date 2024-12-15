import boto3
import json
import re
import os

bedrock = boto3.client('bedrock-runtime')
modelId = 'anthropic.claude-3-5-sonnet-20240620-v1:0'
bucket_name = os.environ['BUCKET']

def get_act_text(year, chapter):
    s3 = boto3.client('s3')
    response = s3.get_object(Bucket=bucket_name, Key=f'acts/{year}/chapter-{chapter}.txt')
    body = response['Body'].read().decode('utf-8')
    return body

def lambda_handler(event, context):
    data = json.loads(event['body'])
    amended_year = data['year']
    amended_chapter = data['chapter']
    amending_year = data['amend_year']
    amending_chapter = data['amend_chapter']
    original = get_act_text(amended_year,amended_chapter)
    amendment = get_act_text(amending_year, amending_chapter)

    return process_amendments(original,f"Chapter {amended_chapter} of the Acts of {amended_year}", [amendment])

# the function is designed to be able to accept multiple amendments, but we will only give it one
# if you were to pass in a full list of amendments, this could take as long as 2-3 minutes to finish
# hence, it will be used to insert amendments one-by-one
def process_amendments(original_text, original_chapter, amendments):
    current_text = original_text
    for amendment in amendments:
        structured = structure_amendment(amendment, current_text, original_chapter)
        if structured:
            for call in structured:
                current_text = apply_structured_amendment(current_text, call, amendment)
    return current_text

def structure_amendment(amendment_text, original_text, chapter_name):
    body = {
        "anthropic_version": "bedrock-2023-05-31",
        "system": """
                    You are a legal document editor. You will be given an original Session Law tagged as <original_text> and an amending Session Law tagged as <amending_act>. You will use a text editor to look for statements in the amending act that change content in the original act.
                    You will use a text editing tool to apply those changes to the original session law. You will make insertions, replacments, or deletions of words, sentences, paragraphs, or even full sections. 
                    You can make direct replacements of small amounts of text, or use selectors to select large sections of texts for edits. Selectors are short phrases that denote the start or end of large portions of text. 
                    Follow these guidelines:
                    
                    Focus only on actual amendment content, excluding introductory statements.
                    Use exact wording from original and amendment texts, including any errors.
                    Choose the appropriate format based on the change:
                    A. Small Changes (for individual words, phrases, or sentences): Use: target_text: [exact text to replace] new_text: [exact replacement text]
                    
                    B. Large Changes (for multiple paragraphs or sections): Use: original_start_selector: [unique phrase marking start of replaced section] original_end_selector: [unique phrase marking end of replaced section] amendment_start_selector: [unique phrase marking start of new text] amendment_end_selector: [unique phrase marking end of new text]
                    
                    Important:
                    
                    Use small changes for precise, confined modifications.
                    Use large changes for anything spanning multiple sentences or paragraphs.
                    All text between AND INCLUDING the selectors will be replaced/selected.
                    Selectors should be short, unique phrases naturally occurring in the text.
                    Never mix formats; use either small or large change format for each modification.
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
        "temperature": 0.27
    }
    
    response = bedrock.invoke_model(
        modelId=modelId,
        body=json.dumps(body)
    )
    
    response_body = json.loads(response['body'].read().decode('utf-8'))
    tool_calls = []
    for block in response_body['content']:
        if block['type'] == 'tool_use':
            tool_calls.append(block['input'])
    
    if tool_calls:
        return tool_calls
    return None

def apply_structured_amendment(original_text, structured_amendment, amendment_text=None):
    """
    original_text: The original legal text.
    structured_amendment: A dict containing details like amendment_type, start/end selectors, etc.
    amendment_text: The full text of the amendment from which we may need to extract a subset.
    """
    print(structured_amendment)
    # Check if we need to extract the new_text from a subset of the amendment_text
    if amendment_text and 'amendment_start_selector' in structured_amendment and 'amendment_end_selector' in structured_amendment:
        start_marker = structured_amendment['amendment_start_selector']
        end_marker = structured_amendment['amendment_end_selector']
        
        # Escape special regex chars if necessary
        start_esc = re.escape(start_marker)
        end_esc = re.escape(end_marker)
        
        # Use a regex to find the portion of amendment_text between these selectors
        pattern = rf'(?P<content>{start_esc}.*?{end_esc})'
        match = re.search(pattern, amendment_text, flags=re.DOTALL)
        if not match:
            print(f"Could not find amendment text between {start_marker} and {end_marker}")
            return original_text
        
        # Extract the relevant portion of the amendment text
        extracted_new_text = match.group('content').strip()
        structured_amendment['new_text'] = extracted_new_text

    # Now proceed as before with the original logic using structured_amendment:
    if 'original_start_selector' in structured_amendment and 'original_end_selector' in structured_amendment:
        # Handle partial section replacement in the original text
        start = structured_amendment['original_start_selector']
        end = structured_amendment['original_end_selector']
        
        # Escape special regex chars if necessary
        start_esc = re.escape(start)
        end_esc = re.escape(end)
        
        # partial_pattern = rf'{start_esc}.*?{end_esc}'
        pattern = rf'(?P<content>{start_esc}.*?{end_esc})'
        match = re.search(pattern, original_text, flags=re.DOTALL)
        if not match:
            print(f"Could not find original text between {start} and {end}")
            return original_text
            
        extracted_original_text = match.group('content').strip()
        structured_amendment['target_text'] = extracted_original_text
        
        # new_text = structured_amendment.get('new_text', '')
        # return re.sub(partial_pattern, new_text, original_text, flags=re.DOTALL)
    
    # Otherwise handle small changes as before:
    amendment_type = structured_amendment['amendment_type']
    if amendment_type == 'replace':
        return original_text.replace(
            structured_amendment['target_text'],
            structured_amendment['new_text']
        )
    elif amendment_type == 'insert':
        idx = original_text.find(structured_amendment['target_text'])
        if idx == -1:
            print(f"Could not find target text: {structured_amendment['target_text']}")
            return original_text
        if structured_amendment['position'] == 'after':
            idx += len(structured_amendment['target_text'])
        return original_text[:idx] + " " + structured_amendment['new_text'] + original_text[idx:]
    elif amendment_type == 'strike':
        return original_text.replace(structured_amendment['target_text'], '')

    return original_text

