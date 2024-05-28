export const AUTHENTICATION = true;

// change these as needed
// kendraIndexName - must be unique to your account
export const kendraIndexName = 'eea-grants-navigator-index'
// must be unique globally or the deployment will fail
export const cognitoDomainName = "genaimvp-auth-eea"
// this can be anything that would be understood easily, but you must use the same name
// when setting up a sign-in provider in Cognito
export const OIDCIntegrationName = "Azure-OIDC"
// this MUST be unique to your account
export const stackName = "GenAiChatStack-eea"