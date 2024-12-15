import { defaultProvider } from '@aws-sdk/credential-provider-node';
import { Client } from '@opensearch-project/opensearch'
import { AwsSigv4Signer } from '@opensearch-project/opensearch/aws'

const ENDPOINT = process.env.OPENSEARCH_ENDPOINT;

const client = new Client({
  node: ENDPOINT,
  ...AwsSigv4Signer({
    region: 'us-east-1',
    service: 'aoss',
    getCredentials: () => {
      const credentialsProvider = defaultProvider();
      return credentialsProvider();
    },
  }),
});

export async function search(query) {
  const response = await client.search({
    index: 'knowledge-base-index',
    body: query,
  });
  // console.log(response)
  // console.log(JSON.stringify(response.body.hits.hits));
  let searchResult;
  const hits = response.body.hits.hits;

  for (const hit of hits) {
    console.log(hit._source['x-amz-bedrock-kb-source-uri'])
  }

  console.log(`Got ${hits.length} matches!`)
  if (hits.length < 124) {
    searchResult = hits.map((result,index) => {
      return `<amendment_data index="${index}"><amending_act_file_name>` + result._source['x-amz-bedrock-kb-source-uri'] + "</amending_act_file_name><amendment_chunk_content>" + result._source.text_field + "</amendment_chunk_content></amendment_data>"
    })
  } else {
    searchResult = hits.map(result => {
      const text = result._source.text_field;
      const keywordIndex = text.search("amend");
      const start = Math.max(0, keywordIndex - 1500); 
      const end = keywordIndex + 1500;

      return "<amendment_data><amending_act_file>" + result._source['x-amz-bedrock-kb-source-uri'] + "</amending_act_file>\n\n<amendment_chunk_content>" + text.slice(start, end) + + "</amendment_chunk_content></amendment_data>"

    })
  }
  return "<amendments_list>" + searchResult.join("") + "</amendments_list>"
}