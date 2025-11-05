/**
 * Synchronizations for FastCal
 * 
 * This file defines the syncs that coordinate actions across concepts.
 * Syncs are executed when excluded actions are requested, enabling:
 * - Authentication and authorization
 * - Automatic side effects (e.g., notifications)
 * - Cross-concept coordination
 * - Validation and conflict detection
 */

import RequestingConcept from "./concepts/Requesting/RequestingConcept.ts";
import EventDraftsConcept from "./concepts/EventDrafts/EventDraftsConcept.ts";
import CalendarSyncConcept from "./concepts/CalendarSync/CalendarSyncConcept.ts";
import IntentParserConcept from "./concepts/IntentParser/IntentParserConcept.ts";

/**
 * Register all syncs with the Requesting concept
 */
export function registerSyncs(
  requesting: RequestingConcept,
  concepts: {
    EventDrafts: EventDraftsConcept;
    CalendarSync: CalendarSyncConcept;
    IntentParser: IntentParserConcept;
  }
) {
  // Sync: When creating a draft event, validate it automatically
  requesting.registerSync("EventDrafts/create", async (params) => {
    // First create the draft
    const createResult = await concepts.EventDrafts.create(params);
    
    if ("error" in createResult) {
      return createResult;
    }

    // Automatically validate the draft
    const validateResult = await concepts.EventDrafts.validate({
      draft: createResult.draft,
    });

    // Return the draft ID with validation status
    return {
      draft: createResult.draft,
      status: "error" in validateResult ? "Conflicted" : validateResult.status,
    };
  });

  // Sync: When syncing to Google Calendar, ensure draft is validated first
  requesting.registerSync("CalendarSync/syncToGoogle", async (params) => {
    const { user, draftId, draftData } = params;

    // Check if draft exists and is validated
    const draftResult = await concepts.EventDrafts.getDraft({ draft: draftId });
    
    if ("error" in draftResult) {
      return { error: "Draft not found or invalid" };
    }

    // Only sync if validated
    if (draftResult.draft.status !== "Validated") {
      return { error: "Draft must be validated before syncing to calendar" };
    }

    // Proceed with sync
    return await concepts.CalendarSync.syncToGoogle({ user, draftId, draftData });
  });

  // Sync: When deleting from Google Calendar, check authorization
  requesting.registerSync("CalendarSync/deleteGoogleEvent", async (params) => {
    const { user, eventId } = params;

    // In a real system, you would check if the user has permission to delete this event
    // For now, we'll just pass through to the concept
    return await concepts.CalendarSync.deleteGoogleEvent({ user, eventId });
  });

  // Sync: When parsing with AI, log the request for analytics
  requesting.registerSync("IntentParser/parseWithAI", async (params) => {
    const { user, utterance, context } = params;

    // Log the parsing request (in a real system, this might go to an analytics service)
    console.log(`[SYNC] User ${user} parsing: "${utterance}"`);

    // Execute the parsing
    const result = await concepts.IntentParser.parseWithAI({ user, utterance, context });

    // In a real system, you might also log the result confidence for monitoring
    if ("confidence" in result) {
      console.log(`[SYNC] Parse confidence: ${result.confidence}`);
    }

    return result;
  });

  // Sync: When getting Google events, ensure account is connected
  requesting.registerSync("CalendarSync/getGoogleEvents", async (params) => {
    const { user } = params;

    // Check if user has a connected Google account
    const accountStatus = await concepts.CalendarSync._getAccountStatus(user);
    
    if ("error" in accountStatus) {
      return { error: "Failed to check account status" };
    }

    const googleAccount = Array.isArray(accountStatus) 
      ? accountStatus.find(acc => acc.provider === "google" && acc.syncStatus === "connected")
      : null;

    if (!googleAccount) {
      return { error: "No connected Google Calendar account. Please connect your account first." };
    }

    // Proceed with getting events
    return await concepts.CalendarSync.getGoogleEvents({ user });
  });
}

/**
 * Define which actions are included (pass through) vs excluded (require syncs)
 */
export const actionConfig = {
  // Included actions: pass through directly to concepts (backward compatible)
  included: [
    "EventDrafts/getDraft",
    "EventDrafts/getByUser",
    "EventDrafts/updateDraft",
    "EventDrafts/deleteDraft",
    "EventDrafts/validate",
    "EventDrafts/attachConstraints",
    "EventDrafts/markValidated",
    "EventDrafts/markConflicted",
    "CalendarSync/getGoogleAuthUrl",
    "CalendarSync/handleGoogleCallback",
    "IntentParser/parseManually",
    "IntentParser/accept",
    "IntentParser/reject",
    "IntentParser/refineWithAI",
  ],
  
  // Excluded actions: converted to request actions, handled by syncs
  excluded: [
    "EventDrafts/create", // Auto-validate after creation
    "CalendarSync/syncToGoogle", // Check validation before sync
    "CalendarSync/deleteGoogleEvent", // Check authorization
    "CalendarSync/getGoogleEvents", // Check account connection
    "IntentParser/parseWithAI", // Log for analytics
  ],
};
