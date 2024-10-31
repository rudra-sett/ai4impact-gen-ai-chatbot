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
  if (hits.length < 20) {
    searchResult = hits.map(result => {
      return result._source['x-amz-bedrock-kb-source-uri'] + "\n\n" + result._source.text_field
    })
  } else {
    searchResult = hits.map(result => {
      const text = result._source.text_field;
      const keywordIndex = text.search("amend");
      const start = Math.max(0, keywordIndex - 1500); // Prevents wrapping by ensuring start is at least 0
      const end = keywordIndex + 1500;

      return result._source['x-amz-bedrock-kb-source-uri'] + "\n\n" + text.slice(start, end);

    })
  }
  return JSON.stringify(searchResult);
}