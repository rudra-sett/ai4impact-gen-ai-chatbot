import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  PutCommand,
  QueryCommand
} from '@aws-sdk/lib-dynamodb';

import ClaudeModel from "./lib/llm.mjs";
import { search } from './lib/oss.mjs';

const ddbClient = new DynamoDBClient({ region: 'us-east-1' });
const dynamo = DynamoDBDocumentClient.from(ddbClient);

let SYS_PROMPT = `
You are a careful, highly precise assistant tasked with reviewing a set of session law excerpts to identify amendments to a given chapter of the Acts of a given year.

### Key Instructions:
1. **Process Every Excerpt Individually:** Ensure no relevant amendment is missed.
2. **Err on the Side of Inclusion:** If unsure, include it.
3. **Handle Overlaps Carefully:** Consolidate multiple amendments from the same act.
4. **Known False Positives:** Double-check references to confirm they actually amend the chapter.
5. **Empty List:** If no known amendments are found, produce a helpful general response.
6. **Non-Amendment Reference:** If an excerpt references but does not amend the law, explain the reference.
`;

// Function to convert numbers to words
function numberToWords(num) {
  const units = ['', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight',
    'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen',
    'sixteen', 'seventeen', 'eighteen', 'nineteen'];
  const tens = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy',
    'eighty', 'ninety'];

  if (num < 20) return units[num];
  if (num < 100) {
    return tens[Math.floor(num / 10)] + (num % 10 !== 0 ? units[num % 10] : '');
  }
  if (num < 2000) {
    return units[Math.floor(num / 100)] + ' hundred' +
      (num % 100 !== 0 ? ' and ' + numberToWords(num % 100) : '');
  }
  // Extend this function as needed for larger numbers
  return num.toString(); // Fallback to numeric form if not handled
}

async function findFutureReferences(year, type, chapter, section) {
  // Convert numbers to words
  const chapterWord = numberToWords(chapter);
  const yearWord = numberToWords(year);
  const sectionWord = section ? numberToWords(section) : null;

  const amendmentWords = [
    "amends",
    "amended",
    "repealed",
    "inserted",
    "altered",
    "revised",
    "substituted",
    "added",
    "deleted",
    "omitted",
    "changed",
    "renumbered",
    "updated",
    "reinstated",
    "repeal",
    "modified",
    "enacted",
    "clarified",
    "reorganized",
    "superseded",
    "transferred",
    "codified",
    "supplemented"
  ];


  let query = {
    'size': 10000,
    "query": {
      "span_or": {
        "clauses": [
          {
            "span_near": {
              "clauses": [
                {
                  "span_or": {
                    "clauses": amendmentWords.map((word) => {
                      return { "span_term": { "text_field": word } };
                    })
                  }
                },
                {
                  "span_near": {
                    "clauses": [
                      { "span_term": { "text_field": "chapter" } },
                      {
                        "span_or": {
                          "clauses": [
                            { "span_term": { "text_field": chapter.toString() } },
                            {
                              "span_near": {
                                "clauses": chapterWord.split(" ").map((word) => {
                                  return { "span_term": { "text_field": word } };
                                })
                              }
                            }
                          ]
                        }
                      },
                    ],
                    "slop": 7
                  }
                },

                { "span_term": { "text_field": type } },

                {
                  "span_or": {
                    "clauses": [
                      { "span_term": { "text_field": year.toString() } },
                      {
                        "span_near": {
                          "clauses": yearWord.split(" ").map((word) => {
                            return { "span_term": { "text_field": word } };
                          })
                        }
                      }
                    ]
                  }
                }
              ],
              "slop": 16,
              "in_order": true
            }
          },
          {
            "span_near": {
              "clauses": [
                {
                  "span_near": {
                    "clauses": [
                      { "span_term": { "text_field": "chapter" } },
                      {
                        "span_or": {
                          "clauses": [
                            { "span_term": { "text_field": chapter.toString() } },
                            {
                              "span_near": {
                                "clauses": chapterWord.split(" ").map((word) => {
                                  return { "span_term": { "text_field": word } };
                                })
                              }
                            }
                          ]
                        }
                      },
                    ],
                    "slop" : 7
                  }
                },
                { "span_term": { "text_field": type } },
                {
                  "span_or": {
                    "clauses": [
                      { "span_term": { "text_field": year.toString() } },
                      {
                        "span_near": {
                          "clauses": yearWord.split(" ").map((word) => {
                            return { "span_term": { "text_field": word } };
                          })
                        }
                      }
                    ]
                  }
                },
                {
                  "span_or": {
                    "clauses": amendmentWords.map((word) => {
                      return { "span_term": { "text_field": word } };
                    })
                  }
                }
              ],
              "slop": 16,
              "in_order": true
            }
          }
        ]
      }
    }
  }

  if (type === "general laws") {
    query.query.span_near.clauses = [
      { "span_term": { "text_field": "chapter" } },
      {
        "span_or": {
          "clauses": [
            { "span_term": { "text_field": chapter.toString() } },
            { "span_term": { "text_field": chapterWord } }
          ]
        }
      },
      { "span_term": { "text_field": "general" } },
      { "span_term": { "text_field": "laws" } },
    ]
  }

  if (section) {
    query.query.span_near.clauses.push({
      "span_or": {
        "clauses": [
          { "span_term": { "text_field": section.toString() } },
          { "span_term": { "text_field": sectionWord } }
        ]
      }
    });
    query.query.span_near.slop = 19;
    query.query.span_near.in_order = false;
  }

  const response = await search(query);

  return response;
}

async function getAmendmentsForChapter(chapter, year) {
  const params = {
    TableName: process.env.AMENDMENT_TABLE,
    KeyConditionExpression: 'Amended = :amendedKey',
    ExpressionAttributeValues: {
      ':amendedKey': `${chapter}-${year}`, 
    },
  };

  try {
    const command = new QueryCommand(params);
    const result = await dynamo.send(command);
    console.log('Amendments retrieved successfully:', result.Items);
    return result.Items || [];
  } catch (error) {
    console.error('Error retrieving amendments:', error);
    return [];
  }
}

export const handler = async (event) => {
  let chapter, year;
  try {
    const body = typeof event.body === 'string' ? JSON.parse(event.body) : event.body;
    chapter = body.chapter;
    year = body.year;
  } catch (err) {
    console.error("Invalid input format:", err);
    return {
      statusCode: 400,
      body: JSON.stringify({ error: "Invalid input. Ensure 'chapter' and 'year' are provided." })
    };
  }

  if (!chapter || !year) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: "Missing required parameters 'chapter' or 'year'." })
    };
  }

  try {
    let amendments = await getAmendmentsForChapter(chapter, year);

    if (amendments.length > 0) {
      // Amendments found, return them directly
      let processedAmendments = []
      for (const amendment of amendments) {
        console.log(amendment)
        console.log(amendment['AmendedBy'])
        const processedAmendment = {
          "amending_act": amendment.AmendedBy.split("|")[0],
          "amendment_description": amendment.Description
        }
        processedAmendments.push(processedAmendment)
      }
      return {
        statusCode: 200,
        body: JSON.stringify(processedAmendments)
      };
    } else {
      // No amendments found, use LLM to generate them
      const claude = new ClaudeModel();
      // the prompt for the model to search with
      let userMessage = `Please return a structured list of amendments for chapter ${chapter} of the acts of ${year} using send_amendments_to_client.`;
      // Assemble history
      let history = claude.assembleHistory([],userMessage)
      // Flag to stop loop once tool use is over
      let completed = false;
      
      while (!completed) {
          // Call Claude with the system prompt and user message.
          const modelResponse = await claude.getResponse(SYS_PROMPT, history);
    
          let toolUses = []
          
          for (const output of modelResponse.content) {
            if (output.type == "tool_use") {
                toolUses.push(output)
            }
          }
          
          let toolUseMessage = {
            "role": "assistant",
            "content": modelResponse.content
          }
          
          
          history.push(toolUseMessage)

          // Just in case something goes very wrong and the model does not generate any tool uses:
          if (toolUses.length == 0) {
            return {
                statusCode: 404,
                body: JSON.stringify({ body: "No amendments found!" })
            };
          }
        
          
          for (const toolUse of toolUses) {
              let toolResult = "Unable to use tool correctly!"
              
              if (toolUse.name == "find_references") {
                  const futureReferences = await findFutureReferences(toolUse.input.year, toolUse.input.law_type, toolUse.input.chapter, toolUse.input.section)
                  toolResult = futureReferences
              }
              
              if (toolUse.name == "send_amendments_to_client") {
                  completed = true
                  for (const amendment of toolUse.input.amendments) {
                    const params = {
                      TableName: process.env.AMENDMENT_TABLE, 
                      Item: {
                        Amended: `${chapter}-${year}`,
                        AmendedBy: amendment.amending_act + `| ${Math.random()}`,
                        Description: amendment.amendment_description
                      },
                    };

                    try {
                      const command = new PutCommand(params);
                      const result = await dynamo.send(command);
                      console.log('Item saved successfully:', result);
                    } catch (error) {
                      console.error('Error saving item:', error);
                    }

                  }
                  return {
                    statusCode: 200,
                    body: JSON.stringify(toolUse.input.amendments)
                  };
              }
              
              let toolResponse = {
                  "role": "user",
                  "content": [
                    {
                      "type": "tool_result",
                      "tool_use_id": toolUse.id,
                      "content": toolResult
                    }
                  ]
                };

                history.push(toolResponse);
          }
      }
    }
  } catch (error) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "Internal server error fetching amendments" })
    };
  }
}
