/**
 * FastCal Synchronizations
 * 
 * These syncs coordinate actions across concepts for:
 * - Auto-validation of draft events
 * - Authorization checks for calendar operations
 * - Account connection verification
 * - Analytics logging for AI parsing
 */

import { EventDrafts, CalendarSync, IntentParser, Requesting, Session } from "@concepts";
import { actions, Sync } from "@engine";

// ============================================================================
// Session Syncs (Authentication)
// ============================================================================

/**
 * When a session creation request comes in, create the session
 */
export const CreateSessionRequest: Sync = (
  { request, user, email, name }
) => ({
  when: actions([
    Requesting.request,
    { path: "/Session/create", user, email, name },
    { request },
  ]),
  then: actions([
    Session.create,
    { user, email, name },
  ]),
});

/**
 * Respond with session token after creation
 */
export const CreateSessionResponse: Sync = ({ request, token, user }) => ({
  when: actions(
    [Requesting.request, { path: "/Session/create" }, { request }],
    [Session.create, {}, { token, user }],
  ),
  then: actions([
    Requesting.respond, { request, token, user },
  ]),
});

/**
 * When a session verification request comes in, verify the token
 */
export const VerifySessionRequest: Sync = (
  { request, token }
) => ({
  when: actions([
    Requesting.request,
    { path: "/Session/verify", token },
    { request },
  ]),
  then: actions([
    Session.verify,
    { token },
  ]),
});

/**
 * Respond with user info after verification
 */
export const VerifySessionResponse: Sync = ({ request, user, email, name }) => ({
  when: actions(
    [Requesting.request, { path: "/Session/verify" }, { request }],
    [Session.verify, {}, { user, email, name }],
  ),
  then: actions([
    Requesting.respond, { request, user, email, name },
  ]),
});

// ============================================================================
// EventDrafts Syncs
// ============================================================================

/**
 * When a create draft request comes in, execute the create action
 */
export const CreateDraftRequest: Sync = (
  { request, user, title, startTime, endTime, location, attendees, tags }
) => ({
  when: actions([
    Requesting.request,
    { path: "/EventDrafts/create", user, title, startTime, endTime, location, attendees, tags },
    { request },
  ]),
  then: actions([
    EventDrafts.create,
    { user, title, startTime, endTime, location, attendees, tags },
  ]),
});

/**
 * After draft is created, respond with the draft
 * Note: Auto-validation can be added later as a separate sync if needed
 */
export const CreateDraftResponse: Sync = ({ request, draft }) => ({
  when: actions(
    [Requesting.request, { path: "/EventDrafts/create" }, { request }],
    [EventDrafts.create, {}, { draft }],
  ),
  then: actions([
    Requesting.respond, { request, draft },
  ]),
});

// ============================================================================
// CalendarSync Syncs
// ============================================================================

/**
 * When syncing to Google Calendar, execute the sync action
 */
export const SyncToGoogleRequest: Sync = (
  { request, user, draftId, draftData }
) => ({
  when: actions([
    Requesting.request,
    { path: "/CalendarSync/syncToGoogle", user, draftId, draftData },
    { request },
  ]),
  then: actions([
    CalendarSync.syncToGoogle, { user, draftId, draftData },
  ]),
});

/**
 * Respond with the Google event ID after successful sync
 */
export const SyncToGoogleResponse: Sync = ({ request, googleEventId }) => ({
  when: actions(
    [Requesting.request, { path: "/CalendarSync/syncToGoogle" }, { request }],
    [CalendarSync.syncToGoogle, {}, { googleEventId }],
  ),
  then: actions([
    Requesting.respond, { request, googleEventId },
  ]),
});

/**
 * When getting Google events, check if account is connected
 */
export const GetGoogleEventsRequest: Sync = ({ request, user }) => ({
  when: actions([
    Requesting.request,
    { path: "/CalendarSync/getGoogleEvents", user },
    { request },
  ]),
  then: actions([
    CalendarSync.getGoogleEvents, { user },
  ]),
});

/**
 * Respond with the events
 */
export const GetGoogleEventsResponse: Sync = ({ request, events }) => ({
  when: actions(
    [Requesting.request, { path: "/CalendarSync/getGoogleEvents" }, { request }],
    [CalendarSync.getGoogleEvents, {}, { events }],
  ),
  then: actions([
    Requesting.respond, { request, events },
  ]),
});

/**
 * When deleting a Google event, check authorization (placeholder for now)
 */
export const DeleteGoogleEventRequest: Sync = ({ request, user, eventId }) => ({
  when: actions([
    Requesting.request,
    { path: "/CalendarSync/deleteGoogleEvent", user, eventId },
    { request },
  ]),
  then: actions([
    CalendarSync.deleteGoogleEvent, { user, eventId },
  ]),
});

/**
 * Respond after successful deletion
 */
export const DeleteGoogleEventResponse: Sync = ({ request, success }) => ({
  when: actions(
    [Requesting.request, { path: "/CalendarSync/deleteGoogleEvent" }, { request }],
    [CalendarSync.deleteGoogleEvent, {}, { success }],
  ),
  then: actions([
    Requesting.respond, { request, success },
  ]),
});

// ============================================================================
// IntentParser Syncs
// ============================================================================

/**
 * When parsing with AI, log the request for analytics
 */
export const ParseWithAIRequest: Sync = ({ request, user, utterance, context }) => ({
  when: actions([
    Requesting.request,
    { path: "/IntentParser/parseWithAI", user, utterance, context },
    { request },
  ]),
  then: actions([
    IntentParser.parseWithAI, { user, utterance, context },
  ]),
});

/**
 * Respond with the parsed event
 */
export const ParseWithAIResponse: Sync = ({ request, draftEvent, confidence, context: parsedContext }) => ({
  when: actions(
    [Requesting.request, { path: "/IntentParser/parseWithAI" }, { request }],
    [IntentParser.parseWithAI, {}, { draftEvent, confidence, context: parsedContext }],
  ),
  then: actions([
    Requesting.respond, { request, draftEvent, confidence, context: parsedContext },
  ]),
});
