import boto3
import json
import regex as re
import os

bedrock = boto3.client('bedrock-runtime')
modelId = 'anthropic.claude-3-5-sonnet-20240620-v1:0'
bucket_name = os.environ['BUCKET']
ddb_table_name = os.environ['DDB_TABLE_NAME']
use_nova=True
overwrite=False

ddb = boto3.resource('dynamodb')
table = ddb.Table(ddb_table_name)



def get_act_text(year, chapter):
    s3 = boto3.client('s3')
    response = s3.get_object(Bucket=bucket_name, Key=f'acts/{year}/chapter-{chapter}.txt')
    body = response['Body'].read().decode('utf-8', 'ignore')
    return body

def get_act_text_from_key(key):
    s3 = boto3.client('s3')
    try:
        response = s3.get_object(Bucket=bucket_name, Key=key)
        body = response['Body'].read().decode('utf-8', 'ignore')
        return body
    except Exception as e:
        return "Could not find the requested Act."

def number_to_words(num):
    units = ['', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight',
             'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen',
             'sixteen', 'seventeen', 'eighteen', 'nineteen']
    tens = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy',
            'eighty', 'ninety']
    if num < 20:
        return units[num]
    if num < 100:
        return tens[num // 10]  + ("-" + units[num % 10] if num % 10 != 0 else '')
    if num < 2000:
        return units[num // 100] + ' hundred' + (' and ' + number_to_words(num % 100) if num % 100 != 0 else '')    
    return str(num)

def split_sections(text: str):
    sections = re.findall(r'(SECTION \d+\..*?)(?=SECTION \d+\.|\Z)', text, re.DOTALL)
    if len(sections) == 0:
        # if there are no sections, the act is short enough to just use the whole thing
        return [text]
    return sections

def lambda_handler(event, context):
    global overwrite
    data = json.loads(event['body'])
    amended_year = data['year']
    amended_chapter = data['chapter']
    amending_year = data['amend_year']
    amending_chapter = data['amend_chapter']
    overwrite = 'overwrite' in data
    use_cached = 'use_cached' in data
    if overwrite:
        print("Overwrite requested")
    use_key = 'use_key' in data and data['use_key']

    # handle new functionality where client is requesting an existing versioned copy based
    # on an original chapter and year and a known amending chapter and year
    if use_cached:
        key = f"versioned/acts/{amended_year}/chapter-{amended_chapter}-version-{amending_year}-{amending_chapter}.txt"
        return {
            "statusCode" : 200,
            "body" : json.dumps(get_act_text_from_key(key))
        }
        
    if 'client_text' in data:
        # sometimes we may pass the original text as 'client_text'
        original = data['client_text']
        if use_key:
            # and sometimes we may pass a key as 'client_text'            
            key = data['client_text']
            original = get_act_text_from_key(key)
    else:
        original = get_act_text(amended_year, amended_chapter)
    amendment = get_act_text(amending_year, amending_chapter)  

    # for the more recent, larger acts, split them into section
    # cannot do this for older ones due to OCR noise
    amendments = [amendment.replace("\r\n"," ")]
    if int(amending_year) > 1959:
        amendments = split_sections(amendment.replace("\r\n"," "))
    
    # filter sections for those that contain the chapter number or the chapter number in the form of a word
    amendments = [amendment for amendment in amendments if f"{amended_chapter}" in amendment or f"{number_to_words(int(amended_chapter))}" in amendment]  

    new_text = process_amendments(original.replace("\r\n"," "), f"Chapter {amended_chapter} of the Acts of {amended_year}", amendments, amended_year, amended_chapter, amending_year, amending_chapter)

    if use_key:
        new_key = f"versioned/acts/{amended_year}/chapter-{amended_chapter}-version-{amending_year}-{amending_chapter}.txt"
        s3 = boto3.client('s3')
        s3.put_object(Bucket=bucket_name, Key=new_key, Body=new_text)
        new_text = new_key

    return {
        "statusCode" : 200,
        "body" : json.dumps(new_text)
    }

def process_amendments(original_text, original_chapter, amendments, amended_year, amended_chapter, amending_year, amending_chapter):
    
    print(f"Processing {len(amendments)} amendments...")

    current_text = original_text
    successful_edits = []

    pk = f"INSERTION-{amended_year}-{amended_chapter}"
    sk = f"{amending_year}-{amending_chapter}"

    existing_record = table.get_item(Key={'Amended': pk, 'AmendedBy': sk})
    if 'Item' in existing_record:
        print("Found existing structured amendments in DynamoDB. Skipping LLM call.")
        successful_edits = existing_record['Item']['tool_calls']

    if len(successful_edits) > 0 and not overwrite:
        for call in successful_edits:
            current_text = apply_structured_amendment(current_text, call)
        return current_text
    
    i = 1
    for amendment in amendments:
        print(f"Inserting amendment from SECTION {i}")
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
                successful_edits.append(call)
                current_text = apply_structured_amendment(current_text, call, amendment)
        i+=1
    
    if len(successful_edits) > 0:
        # Store the successful edits in DDB
        table.put_item(
                Item={
                    'Amended': pk,
                    'AmendedBy': sk,
                    'tool_calls': successful_edits
                }
            )
    return current_text


def structure_amendment(amendment_text, original_text, chapter_name, amended_year, amended_chapter, amending_year, amending_chapter, max_attempts=3):    
    
    # TODO: add an overwrite mode

    # If not found in DDB, call the LLM in a loop until successful or max attempts reached
    response_messages = []
    successful_edits = []
    current_text = original_text
    # print(current_text)
    stop = False
    while not stop:
        
        if use_nova:
            tool_call_blocks, content = call_nova_for_tool_calls(current_text, chapter_name, amendment_text, response_messages)
        else:
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
                if use_nova:
                    response_messages.append({
                        "role" : "user",
                        "content" : [{"text" : "Thanks! If there are edits that need to be made, please use the tool now."}]
                    })
                else:
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
        print("got successful edits!")
        return successful_edits
    # If we reach here, we failed to get valid tool calls after all attempts
    print("Could not produce valid tool calls after multiple attempts.")
    return None


def call_llm_for_tool_calls(original_text, chapter_name, amendment_text, feedback_messages):
    system_prompt = """
                    Role:
                    You are a skilled legal document editor tasked with accurately applying amendments from an amending Session Law to an original Session Law. You will be given a specific section of the amending act, which may or may not have a relevant amendment.
                    
                    Key Responsibilities:
                    
                    1. Amendment Application:
                    
                    - Identify and apply specific changes from the amending act.
                    
                    - Focus on explicit modifications to the original text.
                    
                    - Ignore amendments to other chapters or acts, particularly General Laws. 
                    
                    2. Precision:
                    
                    - Maintain exact wording from both original and amending texts, including any errors.
                    
                    3. Formatting Guidelines:
                    
                    - Minor Changes (single words, phrases, or sentences):
                    Use: target_text: [exact text to replace]
                    new_text: [exact replacement text]
                    
                    - Major Changes (multiple sentences, paragraphs, or sections):
                    Use: original_start_selector: [unique phrase marking start of replaced section]
                    original_end_selector: [unique phrase marking end of replaced section]
                    amendment_start_selector: [unique phrase marking start of new text]
                    amendment_end_selector: [unique phrase marking end of new text]
                    
                    - Always use selectors for sections and paragraphs; never provide new_text or target_text when using selectors.
                    
                    - To select a section, use the section header, and the last couple of words of the section. Do not use the next section's header, only the few words before. 
                    
                    4. Selector Best Practices:
                    
                    - Choose selectors verbatim from the text.
                    
                    - Ensure selectors are unique within their respective document segment.
                    
                    - Include headers or punctuation for context.
                    
                    - Use original_start_selector and original_end_selector from the original text only.
                    
                    - Use amendment_start_selector and amendment_end_selector from the amendment text only.
                    
                    5. Process:
                    
                    - Before editing, use <thinking> tags to explain the change and reasoning.
                    
                    - Include a <verification_check> to confirm:
                    
                    a. Selectors are found in their respective texts.
                    
                    b. Selectors are non-overlapping and appropriate for the change.
                    
                    c. Non-standard punctuation or errors are preserved.
                    
                    - Provide a list of proposed edits and verify selectors are concise and accurate.
                    
                    6. Goal:
                    Apply all amendments comprehensively while preserving the integrity and accuracy of the legal document.

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
                            "description": "The text-editing action to perform."
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

def call_nova_for_tool_calls(original_text, chapter_name, amendment_text, feedback_messages):
    system_prompt = """
                    <system_prompt>
                        <role>
                            You are a specialized legal document editor. Your task is to precisely incorporate amendments from a modifying Session Law into an original Session Law.
                        </role>
                        <primary_duties>
                            <duty>
                                <title>Amendment Execution</title>
                                <description>
                                    Detect and implement designated changes from the modifying act. Concentrate solely on the specified alterations to the original text. Disregard any amendments pertaining to different chapters or acts, especially General Laws.
                                </description>
                            </duty>
                            <duty>
                                <title>Accuracy</title>
                                <description>
                                    Preserve the exact wording from both the original and modifying texts, including any mistakes.
                                </description>
                            </duty>
                            <duty>
                                <title>Formatting Instructions</title>
                                <description>
                                    <minor_adjustments>
                                        Utilize: 
                                        target_text: [precise text to substitute]
                                        new_text: [precise replacement text]
                                    </minor_adjustments>
                                    <significant_adjustments>
                                        Utilize: 
                                        original_start_indicator: [distinct phrase marking the beginning of the substituted section]
                                        original_end_indicator: [distinct phrase marking the conclusion of the substituted section]
                                        amendment_start_indicator: [distinct phrase marking the beginning of the new text]
                                        amendment_end_indicator: [distinct phrase marking the conclusion of the new text]
                                        Always employ indicators for sections and paragraphs; never supply new_text or target_text when utilizing indicators.
                                        To pinpoint a section, use the section title and the final few words of the section. Do not utilize the succeeding section's title; only the few words preceding it.
                                    </significant_adjustments>
                                </description>
                            </duty>
                            <duty>
                                <title>Indicator Best Practices</title>
                                <description>
                                    Opt for indicators that are verbatim from the text. Guarantee that indicators are exclusive within their individual document segment. Incorporate headers or punctuation for clarity. Utilize original_start_indicator and original_end_indicator exclusively from the original text. Utilize amendment_start_indicator and amendment_end_indicator exclusively from the amendment text.
                                </description>
                            </duty>
                            <duty>
                                <title>Procedure</title>
                                <description>
                                    Prior to editing, employ thinking tags to elucidate the modification and rationale. Incorporate a verification_check to validate: Indicators are situated in their corresponding texts.
                                </description>
                            </duty>
                        </primary_duties>
                    </system_prompt>


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
                        "text": user_message
                    }
                ]
            },
        ] + feedback_messages
    
    system_list = [
            {
                "text": system_prompt
            }
    ]

    
    inf_params = {"maxTokens": 4096, "temperature": 0}

    tool_config = {"tools" : [
            {
                "toolSpec" : {
                    "name": "small_text_edit",
                    "description": "Makes insertions, replacements, or deletions of content in text using direct text references.",
                    "inputSchema": {
                        "json" : {
                                  "type": "object",
                                  "properties": {
                                    "amendment_type": {
                                      "type": "string",
                                      "enum": ["insert", "replace", "strike"],
                                      "description": "The text-editing action to perform."
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
                                    }
                                  },
                                  "required": ["amendment_type", "target_text", "new_text", "position"]
                                  }
                                

                    }
                }
            },
            {
                "toolSpec" : {
                    "name": "large_text_edit",
                    "description": "Makes insertions, replacements, or deletions of large amounts of content in text using selectors.",
                    "inputSchema": {
                        "json" : {
                                  "type": "object",
                                  "properties": {
                                    "amendment_type": {
                                      "type": "string",
                                      "enum": ["insert", "replace", "strike"],
                                      "description": "The text-editing action to perform."
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
                                  "required": [
                                    "amendment_type",
                                    "position",
                                    "original_start_selector",
                                    "original_end_selector",
                                    "amendment_start_selector",
                                    "amendment_end_selector"
                                  ]
                                }
                    }
                }
            }
        ]}
        
    body = {
        "schemaVersion": "messages-v1",
        "system": system_list,
        "messages": messages,
        "toolConfig": tool_config,
        "inferenceConfig": inf_params,
    }

    response = bedrock.converse(
        modelId="us.anthropic.claude-3-5-sonnet-20241022-v2:0",
        # modelId="us.amazon.nova-pro-v1:0",
        # modelId='anthropic.claude-3-5-sonnet-20240620-v1:0',
        # modelId="us.anthropic.claude-3-5-haiku-20241022-v1:0",
        # body=json.dumps(body)
        messages=messages,
        system=system_list,
        toolConfig=tool_config,
        inferenceConfig=inf_params
    )
    
    # print(response)
    
    # response_body = json.loads(response['body'].read().decode('utf-8'))
    # print(response_body)
    content = response['output']['message']['content']
    tool_call_blocks = []
    for block in content:
        print(block)
        if 'toolUse' in block:
            tool_call_blocks.append(block['toolUse'])

    return tool_call_blocks, content

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
            if use_nova:
                response_messages.append({
                    "toolResult" : {
                        "toolUseId" : tool_call['toolUseId'],
                        "content" : [{"text":"Success!"}]
                    }
                })
            else:
                response_messages.append({
                    "type" : "tool_result",
                    "tool_use_id" : tool_call['id'],
                    "content" : "Success!"
                })
            successful_calls.append(call)
            print("success")
        except ValueError as e:
            # If we raise a ValueError for known errors in apply, we catch here
            if use_nova:
                response_messages.append({
                    "toolResult" : {
                        "toolUseId" : tool_call['toolUseId'],
                        "content" : [{"text":str(e)}]
                    }
                })
            else:
                response_messages.append({
                    "type" : "tool_result",
                    "tool_use_id" : tool_call['id'],
                    "content" : str(e)
                })  
            print("failed")
            # return False, response_messages
        except Exception as e:
            # Any unexpected error
            if use_nova:
                response_messages.append({
                    "toolResult" : {
                        "toolUseId" : tool_call['toolUseId'],
                        "content" : [{"text":str(e)}]
                    }
                })
            else:
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
        
        start_esc = "".join(f"{char}[-]?" if char.isalnum() else re.escape(char) for char in start_marker) #re.escape(start_marker)
        end_esc = "".join(f"{char}[-]?" if char.isalnum() else re.escape(char) for char in end_marker)
        
        # if end_marker in start_marker or start_marker in end_marker:
        #     if dry_run:
        #         raise ValueError("Start and end markers overlap, please change one of them.")
        
        pattern = rf'(?P<content>{start_esc}.*?{end_esc})'
        match = re.search(pattern, amendment_text, flags=re.DOTALL | re.IGNORECASE)
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
        
        start_esc = "".join(f"{char}[-]?" if char.isalnum() else re.escape(char) for char in start) #re.escape(start_marker)
        end_esc = "".join(f"{char}[-]?" if char.isalnum() else re.escape(char) for char in end)

        if "SECTION" in end and structured_amendment.get('amendment_type','') == 'replace':
            raise ValueError("Please do not use section headers as the end of an original text selection, because it will get overwritten. Use the last words of the amended section instead.")
        
        pattern = rf'(?P<content>{start_esc}.*?{end_esc})'
        match = re.search(pattern, original_text, flags=re.DOTALL | re.IGNORECASE)
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

    fuzzy_pattern = f"({''.join(f'{char}[-]?' if char.isalnum() else re.escape(char) for char in target_text)})"

    if amendment_type == 'replace':
        replaced_text = re.sub(fuzzy_pattern, new_text, original_text, flags = re.DOTALL | re.IGNORECASE)
        if replaced_text == original_text:
            error_msg = f"Could not (fuzzily) find target text for replace: {target_text}"
            print(error_msg)
            if dry_run:
                raise ValueError(error_msg)
        return replaced_text
    
    elif amendment_type == 'insert':
        match = re.search(fuzzy_pattern, original_text, flags = re.DOTALL | re.IGNORECASE)
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
        struck_text = re.sub(fuzzy_pattern, '', original_text, flags = re.DOTALL | re.IGNORECASE)
        if struck_text == original_text:
            error_msg = f"Could not (fuzzily) find target text for strike: {target_text}"
            print(error_msg)
            if dry_run:
                raise ValueError(error_msg)
        return struck_text
    
    return original_text