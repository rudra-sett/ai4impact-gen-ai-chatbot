import boto3
import json
import regex as re
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
    
    # original = get_act_text(amended_year, amended_chapter)
    if 'client_text' in data:
        original = data['client_text']
    else:
        original = get_act_text(amended_year, amended_chapter)
    amendment = get_act_text(amending_year, amending_chapter)

    return {
        "statusCode" : 200,
        "body" : json.dumps(process_amendments(original.replace("\r\n"," "), f"Chapter {amended_chapter} of the Acts of {amended_year}", [amendment.replace("\r\n"," ")], amended_year, amended_chapter, amending_year, amending_chapter))
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


def structure_amendment(amendment_text, original_text, chapter_name, amended_year, amended_chapter, amending_year, amending_chapter, max_attempts=3):
    # Check DynamoDB first
    ddb = boto3.resource('dynamodb')
    table = ddb.Table(ddb_table_name)

    pk = f"INSERTION-{amended_year}-{amended_chapter}"
    sk = f"{amending_year}-{amending_chapter}"

    existing_record = table.get_item(Key={'Amended': pk, 'AmendedBy': sk})
    if 'Item' in existing_record:
        print("Found existing structured amendments in DynamoDB. Skipping LLM call.")
        return existing_record['Item']['tool_calls']

    # If not found in DDB, call the LLM in a loop until successful or max attempts reached
    response_messages = []
    successful_edits = []
    current_text = original_text
    # print(current_text)
    stop = False
    while not stop:
        tool_call_blocks, content = call_llm_for_tool_calls(current_text, chapter_name, amendment_text, response_messages)
        
        if not tool_call_blocks or len(tool_call_blocks) == 0:            
            if len(response_messages) == 0:
                # No messages returned, this means the model never did anything in the first place. 
                # Let's try again to make sure
                # print(content)
                response_messages.append({
                    "role" : "assistant",
                    "content" : content
                })
                response_messages.append({
                    "role" : "user",
                    "content" : "Thanks! If there are edits that need to be made, please use the tool now."
                })
                stop = False
            else:
                # No tool calls returned, means we're done!
                stop = True                
            continue
        
        response_messages.append({
            "role" : "assistant",
            "content" : content
        })

        # Validate tool calls by attempting a dry run
        success, responses, amended_text = validate_tool_calls(current_text, tool_call_blocks, amendment_text)

        if len(success) > 0:
            # store the sucessful edits
            successful_edits += success
            current_text = amended_text
        
        response_messages.append({
            "role" : "user",
            "content" : responses
            })

    if len(successful_edits) > 0:
        # Store the successful edits in DDB
        table.put_item(
                Item={
                    'Amended': pk,
                    'AmendedBy': sk,
                    'tool_calls': successful_edits
                }
            )
        print("got successful edits!")
        return successful_edits
    # If we reach here, we failed to get valid tool calls after all attempts
    print("Could not produce valid tool calls after multiple attempts.")
    return None


def call_llm_for_tool_calls(original_text, chapter_name, amendment_text, feedback_messages):
    system_prompt = """
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
                    
                    If you are having issues with the editor telling you it cannot find text, then it is best to try the selector method with smaller phrases. 
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
                    Your thinking process should include a <verification_check> on your chosen edits to confirm new text and target text, or original and amendment selectors are **found in their respective texts**, **non-overlapping**, and **will make the appropriate changes**.
                    
                    You will be comprehensive with this task, making as many edits as needed to capture all amendments.
                    
                    By following these guidelines, you'll effectively edit legal documents while preserving their integrity and accuracy. 

                    """

    user_message = f"""
    <original_text name={chapter_name}>
    {original_text}
    </original_text>

    <amending_act>
    {amendment_text}
    </amending_act>
    """
    messages = [
            {
                "role": "user",
                "content": [
                    {
                        "type": "text",
                        "text": user_message
                    }
                ]
            },
        ] + feedback_messages
    # print(feedback_messages)
    body = {
        "anthropic_version": "bedrock-2023-05-31",
        "system": system_prompt,
        "messages": messages,
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
        "temperature": 0.2
    }

    response = bedrock.invoke_model(
        modelId=modelId,
        body=json.dumps(body)
    )
    response_body = json.loads(response['body'].read().decode('utf-8'))
    content = response_body['content']
    tool_call_blocks = []
    for block in content:
        print(block)
        if block['type'] == 'tool_use':
            tool_call_blocks.append(block)

    return tool_call_blocks, content #if tool_call_blocks else None


def validate_tool_calls(original_text, tool_call_blocks, amendment_text):
    """Attempt to apply each tool call in a dry run to see if it succeeds.
       Return (success, errors).
    """
    temp_text = original_text
    successful_calls = []
    response_messages = []
    for tool_call in tool_call_blocks:
        call = tool_call['input']
        try:
            temp_text_new = apply_structured_amendment(temp_text, call, amendment_text, dry_run=True)
            if temp_text_new == temp_text:
                # Could indicate a failure if we expected a change
                # but let's not assume it's always an error; sometimes no change needed.
                pass
            temp_text = temp_text_new
            response_messages.append({
                "type" : "tool_result",
                "tool_use_id" : tool_call['id'],
                "content" : "Success!"
            })
            successful_calls.append(call)
            print("success")
        except ValueError as e:
            # If we raise a ValueError for known errors in apply, we catch here
            response_messages.append({
                "type" : "tool_result",
                "tool_use_id" : tool_call['id'],
                "content" : str(e)
            })  
            print("failed")
            # return False, response_messages
        except Exception as e:
            # Any unexpected error
            response_messages.append({
                "type" : "tool_result",
                "tool_use_id" : tool_call['id'],
                "content" : str(e)
            }) 
            print("failed for some other reason")
            # return False, response_messages
    return successful_calls, response_messages, temp_text


def apply_structured_amendment(original_text, structured_amendment, amendment_text=None, dry_run=False):
    print(structured_amendment)
    # Extract new_text from amendment_text if needed
    if 'target_text' in structured_amendment and 'original_start_selector' not in structured_amendment:
        if len(structured_amendment['target_text']) > 1500:
            raise ValueError("Excessively long direct replacement, please use selectors!")
    if 'new_text' in structured_amendment and 'amendment_start_selector' not in structured_amendment:
        if len(structured_amendment['new_text']) > 1500:
            raise ValueError("Excessively long direct replacement, please use selectors!")

    if amendment_text and 'amendment_start_selector' in structured_amendment and 'amendment_end_selector' in structured_amendment:
        start_marker = structured_amendment['amendment_start_selector']
        end_marker = structured_amendment['amendment_end_selector']
        
        start_esc = re.escape(start_marker)
        end_esc = re.escape(end_marker)        
        
        pattern = rf'(?P<content>{start_esc}.*?{end_esc}){{s<=0,e<=0}}'
        match = re.search(pattern, amendment_text, flags=re.DOTALL)
        if not match:
            if start_marker == end_marker:
                structured_amendment['new_text'] = start_marker
                print("Start and end markers were the same - doing simple replace")
            else:
                error_msg = f"Could not find amendment text between {start_marker} and {end_marker}"
                print(error_msg)
                if dry_run:
                    raise ValueError(error_msg)
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

        if "SECTION" in end and structured_amendment.get('amendment_type','') == 'replace':
            raise ValueError("Please do not use section headers as the end of an original text selection, because it will get overwritten. Use the last words of the amended section instead.")
        
        pattern = rf'(?P<content>{start_esc}.*?{end_esc}){{s<=0,e<=0}}'
        match = re.search(pattern, original_text, flags=re.DOTALL)
        if not match:
            if start_esc == end_esc:
                structured_amendment['target_text'] = structured_amendment['original_start_selector']
                print("Start and end markers were the same - doing simple replace")
            else:
                error_msg = f"Could not find original text between {start} and {end}"
                print(error_msg)
                if dry_run:
                    raise ValueError(error_msg)
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

    # Apply the changes
    amendment_type = structured_amendment['amendment_type']
    
    target_text = structured_amendment.get('target_text', '')
    new_text = structured_amendment.get('new_text', '')

    max_subs = 0 #max(3,len(target_text) // 15)
    max_errs = 0 #max(3,len(target_text) // 15)

    if not target_text and amendment_type != 'insert':
        # If there's no target text for a replace/strike, something's off
        # This might be a scenario to raise an error
        error_msg = "No target_text provided for a non-insert operation."
        print(error_msg)
        if dry_run:
            raise ValueError(error_msg)
        return original_text

    fuzzy_pattern = f"({re.escape(target_text)}){{s<={max_subs},e<={max_errs}}}"

    if amendment_type == 'replace':
        replaced_text = re.sub(fuzzy_pattern, new_text, original_text)
        if replaced_text == original_text:
            error_msg = f"Could not (fuzzily) find target text for replace: {target_text}"
            print(error_msg)
            if dry_run:
                raise ValueError(error_msg)
        return replaced_text
    
    elif amendment_type == 'insert':
        match = re.search(fuzzy_pattern, original_text)
        if not match:
            error_msg = f"Could not (fuzzily) find target text for insert: {target_text}"
            print(error_msg)
            if dry_run:
                raise ValueError(error_msg)
            return original_text
        
        if structured_amendment.get('position') == 'after':
            insert_idx = match.end()
        else:
            insert_idx = match.start()

        return original_text[:insert_idx] + new_text + original_text[insert_idx:]
    
    elif amendment_type == 'strike':
        struck_text = re.sub(fuzzy_pattern, '', original_text)
        if struck_text == original_text:
            error_msg = f"Could not (fuzzily) find target text for strike: {target_text}"
            print(error_msg)
            if dry_run:
                raise ValueError(error_msg)
        return struck_text
    
    return original_text
