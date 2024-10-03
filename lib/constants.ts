export const AUTHENTICATION = true;

// change these as needed
// must be unique globally or the deployment will fail
export const cognitoDomainName = "glo-test-auth"
// this can be anything that would be understood easily, but you must use the same name
// when setting up a sign-in provider in Cognito
// make sure to leave it blank if you do not actually have an SSO provider configured in Cognito!
export const OIDCIntegrationName = ""
// this MUST be unique to your account
export const stackName = "glo-test-stack"