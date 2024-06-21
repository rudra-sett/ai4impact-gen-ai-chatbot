# MBTA RIDE AI Chatbot Project

This is a generative AI chatbot intended for use by the RIDE, an MBTA paratransit service.
When deployed, this project will output a Cloudfront-hosted chatbot application. It will require configuration in Cognito and for data to be added into the knowledge base. 

The `cdk.json` file tells the CDK Toolkit how to execute your app.

## Useful commands

* `npm run build`   compile typescript to js
* `npm run watch`   watch for changes and compile
* `npm run test`    perform the jest unit tests
* `npx cdk deploy`  deploy this stack to your default AWS account/region
* `npx cdk diff`    compare deployed stack with current state
* `npx cdk synth`   emits the synthesized CloudFormation template

## Deployment Instructions:

1. Change the constants in lib/constants.ts
2. Deploy with `npm run build && npx cdk deploy [stack name from constants.ts]`
3. Configure Cognito using the CDK outputs
