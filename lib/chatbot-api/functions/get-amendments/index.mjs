import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  PutCommand,
  QueryCommand,
  DeleteCommand
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
5. **Empty List:** If no known amendments are found, produce an empty list.
6. **Non-Amendment Reference:** If an excerpt references but does not amend the law, explain the reference.
7. **Date Extensions** If multiple amendments seem to make iterative changes, such as extending dates, please include the full chain.

Use <thinking> tags to walk through the process and verify that you have every relevant amendment before using the send_amendments_to_client tool. Keep the analysis brief; just a few words per amendment.
`;

// overwrite mode
let overwrite = false;

// Function to convert numbers to words
function numberToWords(num) {
  const units = ['', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight',
    'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen',
    'sixteen', 'seventeen', 'eighteen', 'nineteen'];
  const tens = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy',
    'eighty', 'ninety'];

  if (num < 20) return units[num];
  if (num < 100) {
    return tens[Math.floor(num / 10)] + (num % 10 !== 0 ? " " + units[num % 10] : '');
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
              "slop": 20,
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
                },
                {
                  "span_or": {
                    "clauses": amendmentWords.map((word) => {
                      return { "span_term": { "text_field": word } };
                    })
                  }
                }
              ],
              "slop": 20,
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

    if (overwrite === 'true') {
      // delete all the retrieved items
      for (const item of result.Items) {
        console.log(item.Amended)
        const deleteParams = {
          TableName: process.env.AMENDMENT_TABLE,
          Key: {
            Amended: item.Amended,
            AmendedBy: item.AmendedBy
          },
        };
        console.log(deleteParams)
        try {
          const deleteCommand = new DeleteCommand(deleteParams);
          const deleteResult = await dynamo.send(deleteCommand);
          console.log('Item deleted successfully:', deleteResult);          
        } catch (error) {
          console.error('Error deleting item:', error);
          return result.Items || [];
        }
      }

      return [];

    } else {
      return result.Items || [];
    }

  } catch (error) {
    console.error('Error retrieving amendments:', error);
    return [];
  }
}

async function checkProcessed(chapter, year) {
  const params = {
    TableName: process.env.AMENDMENT_TABLE,
    KeyConditionExpression: 'Amended = :amendedKey',
    ExpressionAttributeValues: {
      ':amendedKey': `PROCESSED-${chapter}-${year}`,
    },
  };

  try {
    const command = new QueryCommand(params);
    const result = await dynamo.send(command);
    return result.Items && result.Items.length > 0;
  } catch (error) {
    console.error('Error retrieving chapter status:', error);
    return false;
  }
}

async function markProcessed(chapter, year) {
  const markProcessedParams = {
    TableName: process.env.AMENDMENT_TABLE,
    Item: {
      Amended: `PROCESSED-${chapter}-${year}`,
      AmendedBy: 'TRUE'
    },
  };

  try {
    const markProcessedCommand = new PutCommand(markProcessedParams);
    const result = await dynamo.send(markProcessedCommand);
    console.log('Item saved successfully:', result);
  } catch (error) {
    console.error('Error saving item:', error);
  }
}

export const handler = async (event) => {
  let chapter, year;
  try {
    // work with SQS    
    if (event.Records) {
      const record = event.Records[0];
      const body = JSON.parse(record.body);
      chapter = body.chapter;
      year = body.year;
      overwrite = body.overwrite;
    } else {
      // work with API Gateway/Step Function
      const body = typeof event.body === 'string' ? JSON.parse(event.body) : event.body;
      chapter = body.chapter;
      year = body.year;
      overwrite = body.overwrite;
    }
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

      // amending_act is in the format of "Chapter X of the Acts of XXXX"
      // sort them by year and then chapter
      processedAmendments.sort((a, b) => {
        const yearA = parseInt(a.amending_act.split(" ").slice(-1));
        const yearB = parseInt(b.amending_act.split(" ").slice(-1));
        const chapterA = parseInt(a.amending_act.split(" ")[1]);
        const chapterB = parseInt(b.amending_act.split(" ")[1]);
        if (yearA !== yearB) {
          return yearA - yearB;
        }
        return chapterA - chapterB;
      });

      return {
        statusCode: 200,
        body: JSON.stringify(processedAmendments)
      };
    } else {
      // No amendments found, check if this has been processed before
      let processed = await checkProcessed(chapter, year)
      if (overwrite === 'true') {
        processed = false
      }
      // If this has truly been processed before and found to have no amendments, return a blank list
      if (processed) {
        return {
          statusCode: 200,
          body: JSON.stringify([])
        };
      }
      // early exit condition if there are no amendments, no need to call the LLM unnecessarily
      const amendmentsCheck = await findFutureReferences(year, "acts", chapter)
      if (amendmentsCheck == '<amendments_list></amendments_list>') {
        await markProcessed(chapter, year)
        return {
          statusCode: 200,
          body: JSON.stringify([])
        };
      }
      // This chapter has not been processed before and there are amendments, let's use the LLM to generate the amendment list
      const claude = new ClaudeModel();
      // the prompt for the model to search with
      let userMessage = `Please return a structured list of amendments for chapter ${chapter} of the acts of ${year} using send_amendments_to_client.`;
      // Assemble history
      let history = claude.assembleHistory([], userMessage)
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
            body: JSON.stringify("No amendments found!")
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
                  AmendedBy: `Chapter ${amendment.amendment_chapter} of the Acts of ${amendment.amendment_year}` + `| ${Math.random()}`,
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

            await markProcessed(chapter, year)

            let initialAmendments = toolUse.input.amendments;

            // sort them
            initialAmendments.sort((a, b) => {
              const yearA = parseInt(a.amendment_year);
              const yearB = parseInt(b.amendment_year);
              const chapterA = parseInt(a.amendment_chapter);
              const chapterB = parseInt(b.amendment_chapter);
              if (yearA !== yearB) {
                return yearA - yearB;
              }
              return chapterA - chapterB;
            });

            let transformedAmendments = initialAmendments.map(amendment => {
              return {
                "amending_act": `Chapter ${amendment.amendment_chapter} of the Acts of ${amendment.amendment_year}`,
                "amendment_description": amendment.amendment_description
              };
            });

            return {
              statusCode: 200,
              body: JSON.stringify(transformedAmendments)
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
    console.error("Error fetching amendments:", error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "Internal server error fetching amendments" })
    };
  }
}
