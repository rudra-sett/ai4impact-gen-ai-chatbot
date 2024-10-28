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
  const hits = response.body.hits.hits;
  const searchResult = hits.map(result => {    
    return result._source['x-amz-bedrock-kb-source-uri'] + "\n\n" + result._source.text_field
  })
  return JSON.stringify(searchResult);
}