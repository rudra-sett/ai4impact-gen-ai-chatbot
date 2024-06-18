export const AUTHENTICATION = true;

// change these as needed
// kendraIndexName - must be unique to your account
export const kendraIndexName = 'gen-ai-chatbot-index'
// must be unique globally or the deployment will fail
export const cognitoDomainName = "genaimvp-auth"
// this can be anything that would be understood easily, but you must use the same name
// when setting up a sign-in provider in Cognito
// leave it empty if you do not have an OIDC provider, otherwise new users will not be able to sign in 
export const OIDCIntegrationName = ""
// this MUST be unique to your account
export const stackName = "GenAiChatStack"
// include a list of emails you want error alerts to be sent to
// these alerts will be sent when a large number of errors occur at once, indicating immediate need
// for attention
export const alertEmails = ["sett.r@ai4impact.ai"]
// optionally scrub all emails (but keep domains, i.e. mbta.com, transdev.com) from 
// scraped zendesk documents
// can be "TRUE" or "FALSE"
export const removeZendeskEmails = "FALSE"