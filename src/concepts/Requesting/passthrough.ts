/**
 * The Requesting concept exposes passthrough routes by default,
 * which allow POSTs to the route:
 *
 * /{REQUESTING_BASE_URL}/{Concept name}/{action or query}
 *
 * to passthrough directly to the concept action or query.
 * This is a convenient and natural way to expose concepts to
 * the world, but should only be done intentionally for public
 * actions and queries.
 *
 * This file allows you to explicitly set inclusions and exclusions
 * for passthrough routes:
 * - inclusions: those that you can justify their inclusion
 * - exclusions: those to exclude, using Requesting routes instead
 */

/**
 * INCLUSIONS
 *
 * Each inclusion must include a justification for why you think
 * the passthrough is appropriate (e.g. public query).
 *
 * inclusions = {"route": "justification"}
 */

export const inclusions: Record<string, string> = {
  // EventDrafts - Read operations
  "/api/EventDrafts/getDraft": "public query to get draft details",
  "/api/EventDrafts/getByUser": "public query to get user's drafts",
  "/api/EventDrafts/updateDraft": "allow direct draft updates",
  "/api/EventDrafts/deleteDraft": "allow direct draft deletion",
  "/api/EventDrafts/validate": "allow manual validation",
  "/api/EventDrafts/attachConstraints": "allow attaching constraints",
  "/api/EventDrafts/markValidated": "allow marking as validated",
  "/api/EventDrafts/markConflicted": "allow marking as conflicted",
  
  // CalendarSync - OAuth and queries
  "/api/CalendarSync/getGoogleLoginUrl": "OAuth login flow requires passthrough",
  "/api/CalendarSync/handleGoogleLogin": "OAuth login callback requires passthrough",
  "/api/CalendarSync/getGoogleAuthUrl": "OAuth calendar flow requires passthrough",
  "/api/CalendarSync/handleGoogleCallback": "OAuth calendar callback requires passthrough",
  "/api/CalendarSync/_getAccountStatus": "public query for account status",
  "/api/CalendarSync/_getSyncedEvent": "public query for synced events",
  "/api/CalendarSync/connectAccount": "allow direct account connection",
  "/api/CalendarSync/disconnectAccount": "allow direct account disconnection",
  "/api/CalendarSync/refreshSync": "allow manual sync refresh",
  "/api/CalendarSync/syncToGoogle": "external API call needs fast passthrough to avoid timeout",
  
  // Session - Authentication
  "/api/Session/getSession": "public query to get session info",
  "/api/Session/end": "allow logout",
  "/api/Session/cleanupExpired": "maintenance operation",
  
  // CalendarSync - Legacy operations (keeping for backward compatibility)
  "/api/CalendarSync/commit": "legacy commit operation",
  "/api/CalendarSync/detectConflicts": "legacy conflict detection",
  "/api/CalendarSync/suggestReschedules": "legacy reschedule suggestions",
  "/api/CalendarSync/update": "legacy update operation",
  "/api/CalendarSync/cancel": "legacy cancel operation",
  
  // IntentParser - Manual operations
  "/api/IntentParser/parseManually": "allow manual parsing fallback",
  "/api/IntentParser/accept": "allow accepting parsed events",
  "/api/IntentParser/reject": "allow rejecting parsed events",
  "/api/IntentParser/refineWithAI": "allow AI refinement",
  "/api/IntentParser/_getAlternatives": "public query for alternatives",
  
  // ReminderPolicy - All operations (no auth needed yet)
  "/api/ReminderPolicy/clamp": "public utility function",
  "/api/ReminderPolicy/createPolicy": "allow policy creation",
  "/api/ReminderPolicy/selectPolicy": "allow policy selection",
  "/api/ReminderPolicy/instantiate": "allow policy instantiation",
  "/api/ReminderPolicy/learn": "allow learning from user behavior",
  "/api/ReminderPolicy/_getPolicy": "public query for policy",
  "/api/ReminderPolicy/_getUserPolicies": "public query for user policies",
  "/api/ReminderPolicy/updatePolicy": "allow policy updates",
  "/api/ReminderPolicy/deletePolicy": "allow policy deletion",
  "/api/ReminderPolicy/setDefaultPolicy": "allow setting default",
  "/api/ReminderPolicy/_getPersonalization": "public query for personalization",
  
  // LikertSurvey - Keep examples for reference
  "/api/LikertSurvey/_getSurveyQuestions": "this is a public query",
  "/api/LikertSurvey/_getSurveyResponses": "responses are public",
  "/api/LikertSurvey/_getRespondentAnswers": "answers are visible",
  "/api/LikertSurvey/submitResponse": "allow anyone to submit response",
  "/api/LikertSurvey/updateResponse": "allow anyone to update their response",
};

/**
 * EXCLUSIONS
 *
 * Excluded routes fall back to the Requesting concept, and will
 * instead trigger the normal Requesting.request action. As this
 * is the intended behavior, no justification is necessary.
 *
 * exclusions = ["route"]
 */

export const exclusions: Array<string> = [
  // Session - Authentication syncs
  "/api/Session/create", // Create session after Google login
  "/api/Session/verify", // Verify session token
  
  // EventDrafts - Actions requiring syncs
  "/api/EventDrafts/create", // Auto-validate after creation
  
  // CalendarSync - Actions requiring syncs
  "/api/CalendarSync/deleteGoogleEvent", // Check authorization
  "/api/CalendarSync/getGoogleEvents", // Check account connection
  
  // IntentParser - Actions requiring syncs
  "/api/IntentParser/parseWithAI", // Log for analytics and monitoring
  
  // LikertSurvey - Keep examples for reference
  "/api/LikertSurvey/createSurvey",
  "/api/LikertSurvey/addQuestion",
];
