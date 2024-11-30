import re
import boto3
import string
import os

s3 = boto3.client('s3')
client = boto3.client('textract')

bucket_name = os.environ['BUCKET']

# Function to extract the year from the filename
def extract_year(filename):
    match = re.search(r'acts-and-resolves-(\d{4})', filename)
    if match:
        return match.group(1)
    return None

# Function to extract chapter number, accounting for both "Chap." and "Chapter"
def extract_chapter(text):
    match = re.search(r'(Chap|Chapter)\.?\s*(\d+)\.?', text)
    if match:
        return match.group(2)
    return None

# Function to determine if a block is an act or resolve
def is_resolve(text):
    resolve_pattern = r"(Chap(?:ter)?\.?\s*\d+\.?\s*RESOLVE)"
    # Use re.search with the case-insensitive flag to check if "RESOLVE" appears in the relevant context
    return bool(re.search(resolve_pattern, text, flags=re.IGNORECASE))


# Function to save a block to S3
def save_to_s3(bucket_name, key, content):
    s3.put_object(Bucket=bucket_name, Key=key, Body=content.encode('utf-8'))
    
# Function to get all lines from a document
def get_lines(blocks):
    lines = []
    for block in blocks:
        if block['BlockType'] == 'LINE':
            lines.append(block['Text'])
    return lines

# Function to get headers to avoid any confusion
def get_headers(blocks):
    headers = []
    for block in blocks:
        if block['BlockType'] == 'LAYOUT_HEADER':
            headers.append(block)
    return headers

# Preprocess blocks to create an ID-to-block mapping
def build_block_id_map(blocks):
    block_id_map = {block['Id']: block for block in blocks}
    return block_id_map

# Gets the block from a specified ID
def get_block_from_id(id, block_id_map):
    return block_id_map.get(id, None)

# Removes a given header
def remove_header(header_block, blocks, block_id_map):
    children = header_block.get('Relationships', [])[0].get('Ids', [])
    text = ""
    for child in children:
        child_block = get_block_from_id(child, block_id_map)
        if child_block is not None:
            text += child_block.get('Text', '')
    if "Chap" in text or "Chapter" in text or "CHAP" in text or "CHAPTERS" in text:
        for child in children:
            child_block = get_block_from_id(child, block_id_map)
            if child_block in blocks:
                blocks.remove(child_block)
    return text
    
# Splits the full text into acts and resolves
def split_text_by_act(text_chunk):
    # Regular expression to identify the start of each act (e.g., "Chap. X." or "Chapter X.")
    # act_split_pattern = r"(Chap\.\s*\d+\.|Chapter\s*\d+\.|CHAP\.\s*\d+\.|CHAPTER\s*\d+\.)"
    # act_split_pattern = r"(Chap(?:ter)?\s*\d+\s*(?:AN ACT|RESOLVE|ANACT))"
    act_split_pattern = r"(Chap(?:ter)?\.?\s*\d+\.?\s*(?:AN ACT|RESOLVE))"
    # Split the text based on the act pattern
    acts = re.split(act_split_pattern, text_chunk, flags=re.IGNORECASE)
    # Remove empty strings and combine the act numbers with their text
    clean_acts = []
    for i in range(1, len(acts), 2):
        act_number = acts[i].strip()
        act_text = acts[i+1].strip()
        clean_acts.append(f"{act_number} {act_text}")
    return clean_acts

# Function to process the acts and resolves
def process_acts_resolves(acts, filename, bucket_name):
    year = extract_year(filename)
    
    for act in acts:        
        chapter_number = extract_chapter(act)
        
        if chapter_number:
            if is_resolve(act):
                # This is a resolve
                key = f"resolves/{year}/chapter-{chapter_number}.txt"
            else:
                # This is an act
                key = f"acts/{year}/chapter-{chapter_number}.txt"
            
            # Save the act or resolve to the S3 bucket
            save_to_s3(bucket_name, key, act)

# Get full document blocks
def get_full_doc_blocks(job_id):    
    doc = client.get_document_analysis(
            JobId=job_id,
        )
    next_token = doc['NextToken']
    blocks = doc.get("Blocks", [])
    while next_token:
        response = client.get_document_analysis(
            JobId=job_id,
            NextToken=next_token
        )
        blocks.extend(response.get("Blocks", []))
        next_token = response.get("NextToken", None)
    doc["Blocks"] = blocks
    return doc

# The main pipeline
def pipeline(job_id,filename):
    if not check_job_completion(job_id):
        raise Exception(f"Textract job {job_id} is not completed yet.")
    doc = get_full_doc_blocks(job_id)
    print("Got document loaded")
    blocks = doc['Blocks']
    # Get all the headers from the blocks
    headers = get_headers(blocks)
    # Use the functions
    block_id_map = build_block_id_map(blocks)
    # Remove the headers
    for header in headers:
        remove_header(header, blocks, block_id_map)
    # Get all lines from the blocks
    lines = get_lines(blocks)
    print("Got all lines")
    # Join the lines into a single text chunk
    text_chunk = " ".join(lines)
    print("Processed text")
    # Remove punctuation from the text
    # clean_text = text_chunk.translate(str.maketrans('', '', string.punctuation))
    # Turn the lines into acts
    acts = split_text_by_act(text_chunk)
    print("Got acts")
    # Process and save acts and resolves to S3
    process_acts_resolves(acts, filename, bucket_name)
    print(f"Completed {filename}")

# Checks if the Textract job is complete
def check_job_completion(job_id):    
    response = client.get_document_analysis(
        JobId=job_id
    )
    status = response['JobStatus']
    if status == 'SUCCEEDED':
        return True
    elif status == 'FAILED':
        return False
    else:
        return False
    

def lambda_handler(event, context):
    
    print(event['Records'])
    
    for message in event['Records']:
        queue_member = message['body']
        match = re.match(r'(.+\.pdf) job id - ([a-f0-9]+)', queue_member)
        job_id = ""
        filename = ""
        if match:
            filename = match.group(1)
            job_id = match.group(2)
        try:
            print(f"Trying to process {filename}")
            pipeline(job_id, filename)
        except Exception as e:
            print(f"Error processing {filename}: {str(e)}")
            # intentionally raise an error so that the message goes back into the
            # queue to re-try after the SQS visibility timeout
            raise
