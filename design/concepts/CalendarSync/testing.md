# prompt: create tests for CalendarSync concept

[@testing-concepts](../../background/testing-concepts.md)

[@CalendarSync specification](CalendarSync.md)

[@CalendarSync implementation](/src/concepts/CalendarSync/CalendarSyncConcept.ts)

Please create comprehensive tests for the CalendarSync concept.

Required test scenarios:

1. Operational principle test: Connect accounts → detect conflicts → suggest reschedules → commit event → update → cancel
   - Should demonstrate the full sync workflow described in the spec
   - Use mock providers (google, outlook)

2. Account management: Test connecting, disconnecting, and getting account status
   - Multiple accounts for same user
   - Verify syncStatus transitions

3. Event commitment: Test committing events to multiple providers
   - Single provider, multiple providers
   - Verify provider IDs are stored correctly
   - Test with mock CommittableEvent structure

4. Conflict detection: Test detectConflicts with various scenarios
   - No conflicts (clean calendar)
   - Time overlap conflicts
   - Buffer violation conflicts
   - Multiple conflicts

5. Reschedule suggestions: Test suggestReschedules
   - Verify suggestions avoid conflicts
   - Verify ranking (proximity to original time)
   - Test with constraints (working hours, etc.)

6. Update and cancel: Test propagating changes
   - Update event across providers
   - Cancel event from all providers
   - Verify cleanup after cancellation

7. Error cases: Connection failures, invalid account IDs, non-existent events

Note: Tests should work with the mock implementation. Use realistic provider names and IDs.

Use Deno testing framework with programmatic assertions and console output.

# response:

```typescript
// file: src/concepts/CalendarSync/CalendarSyncConcept.test.ts

import { assertEquals, assertExists, assertNotEquals, assertObjectMatch } from "jsr:@std/assert";
import { testDb } from "@utils/database.ts";
import CalendarSyncConcept from "./CalendarSyncConcept.ts";
import { ID, Empty, DateTime } from "@utils/types.ts";

// --- Internal Types (re-declared for clarity in tests) ---
type Provider = "google" | "outlook" | "apple" | "zoom";
type SyncStatus = "connected" | "disconnected" | "error";
type User = ID;
type EventId = ID;
type Credentials = Record<string, any>;
interface DraftEvent {
  start: DateTime;
  end: DateTime;
  title: string;
  description?: string;
  location?: string;
  attendees?: string[];
}
interface CommittableEvent extends DraftEvent {}
interface Timespan {
  start: DateTime;
  end: DateTime;
}
interface Account { // Simplified for assertion, actual object has more fields
  _id: ID;
  user: User;
  provider: Provider;
  syncStatus: SyncStatus;
  lastSync: DateTime;
}
interface SyncedEvent { // Simplified for assertion
  _id: EventId;
  user: User;
  providerIds: Record<Provider, string>;
  syncedAt: DateTime;
  accounts: ID[];
  title: string;
  start: DateTime;
  end: DateTime;
}
interface Conflict { // Simplified for assertion
  _id: ID;
  user: User;
  draftEvent: DraftEvent;
  existingEvents: EventId[];
  reason: string;
}

// --- Common Test Data & Helpers ---
const USER_ALICE = "user:Alice" as ID;
const USER_BOB = "user:Bob" as ID;
const USER_CAROL = "user:Carol" as ID;

const GOOGLE_PROVIDER = "google" as Provider;
const OUTLOOK_PROVIDER = "outlook" as Provider;
const APPLE_PROVIDER = "apple" as Provider;

// Reference date for tests: July 9th, 2024 (a Tuesday)
const REFERENCE_YEAR = 2024;
const REFERENCE_MONTH = 7; // July is month 7 (0-indexed is 6)
const REFERENCE_DAY_TUESDAY = 9;

/**
 * Creates a Date object relative to REFERENCE_DATE.
 * @param dayOffset 0 for July 9th, 1 for July 10th (Wednesday), etc.
 * @param hour 0-23
 * @param minute 0-59
 */
const createTestDate = (
  dayOffset: number,
  hour: number,
  minute: number = 0,
): Date => {
  return new Date(
    REFERENCE_YEAR,
    REFERENCE_MONTH - 1, // Month is 0-indexed in Date constructor
    REFERENCE_DAY_TUESDAY + dayOffset,
    hour,
    minute,
    0,
    0,
  );
};

/**
 * Creates a DraftEvent object for testing conflicts, relative to REFERENCE_DATE.
 * @param startHour 0-23
 * @param endHour 0-23
 * @param title Event title
 * @param dayOffset 0 for July 9th (Tuesday)
 */
const createTestDraftEvent = (
  startHour: number,
  endHour: number,
  title: string,
  dayOffset: number = 0,
  description?: string,
  location?: string,
  attendees?: string[],
): DraftEvent => {
  const start = createTestDate(dayOffset, startHour);
  const end = createTestDate(dayOffset, endHour);
  return { start, end, title, description, location, attendees };
};

// Helper to convert DraftEvent to CommittableEvent (they have same structure for this concept)
const toCommittableEvent = (draft: DraftEvent): CommittableEvent => draft;

// --- Test Cases ---

Deno.test("CalendarSyncConcept: Operational Principle Trace", async (test) => {
  const [db, client] = await testDb();
  const concept = new CalendarSyncConcept(db);

  // # trace: after user connects Google Calendar and Outlook accounts,
  // user creates a validated draft event for 2pm Tuesday;
  // detectConflicts queries both accounts and finds existing event at 2pm in Google Calendar;
  // suggestReschedules proposes alternative times (3pm, 4pm, 1pm) that avoid conflicts;
  // user selects 3pm reschedule;
  // commit creates event in both Google Calendar and Outlook with provider-specific IDs;
  // later, user updates location;
  // update propagates change to both providers using stored IDs

  let googleAccountId: ID;
  let outlookAccountId: ID;
  let draftEventForPrinciple: DraftEvent;
  let committedEvent: SyncedEvent;
  let selectedReschedule: Timespan;

  await test.step("1. Connect Google and Outlook accounts for Alice", async () => {
    const googleResult = await concept.connectAccount({
      user: USER_ALICE,
      provider: GOOGLE_PROVIDER,
      credentials: { accessToken: "google_token_alice" },
    });
    assertExists(googleResult);
    assertEquals((googleResult as { error?: string }).error, undefined);
    googleAccountId = (googleResult as { accountId: ID }).accountId;

    const outlookResult = await concept.connectAccount({
      user: USER_ALICE,
      provider: OUTLOOK_PROVIDER,
      credentials: { accessToken: "outlook_token_alice" },
    });
    assertExists(outlookResult);
    assertEquals((outlookResult as { error?: string }).error, undefined);
    outlookAccountId = (outlookResult as { accountId: ID }).accountId;

    const status = await concept._getAccountStatus(USER_ALICE);
    assertEquals(Array.isArray(status), true);
    assertEquals((status as Account[]).length, 2);
    assertEquals((status as Account[])[0].syncStatus, "connected");
    assertEquals((status as Account[])[1].syncStatus, "connected");
  });

  await test.step("2. User creates a validated draft event for 2pm Tuesday", async () => {
    // This draft should conflict with the mock events (Meeting with Team X (Google) 2-3pm, Project Review (Outlook) 2:30-4pm)
    draftEventForPrinciple = createTestDraftEvent(
      14, // 2 PM
      15, // 3 PM
      "My Important Draft Meeting",
      0, // July 9th, Tuesday
      "Discuss project strategy",
      "Virtual Room 1",
      ["attendee1@example.com"],
    );
    assertExists(draftEventForPrinciple);
  });

  await test.step("3. Detect conflicts for the 2pm Tuesday draft", async () => {
    const conflicts = await concept.detectConflicts({
      user: USER_ALICE,
      draft: draftEventForPrinciple,
    });
    assertExists(conflicts);
    assertEquals((conflicts as { error?: string }).error, undefined);
    assertEquals((conflicts as Conflict[]).length > 0, true);

    // Expecting at least two conflicts from the mockProviderEvents setup:
    // 1. "Meeting with Team X (Google)" (2pm-3pm)
    // 2. "Project Review (Outlook)" (2:30pm-4pm)
    const conflictList = conflicts as Conflict[];
    assertExists(
      conflictList.find((c) => c.reason.includes("Meeting with Team X")),
      "Conflict with Google mock event should be found",
    );
    assertExists(
      conflictList.find((c) => c.reason.includes("Project Review")),
      "Conflict with Outlook mock event should be found",
    );
  });

  await test.step("4. Suggest reschedules and select 3pm Tuesday", async () => {
    const suggestions = await concept.suggestReschedules({
      user: USER_ALICE,
      draft: draftEventForPrinciple,
      constraints: { workingHoursStart: 9, workingHoursEnd: 17 },
    });
    assertExists(suggestions);
    assertEquals((suggestions as { error?: string }).error, undefined);
    assertEquals((suggestions as Timespan[]).length > 0, true);

    const suggestionList = suggestions as Timespan[];

    // The mock logic suggests 30, 60, 120 mins later, then next day.
    // The 2pm-3pm original conflicts.
    // 2:30-3:30 (30 min offset) still conflicts with Outlook's 2:30-4pm.
    // 3pm-4pm (60 min offset) should be clear (original end 3pm, Outlook ends 4pm, 3-4pm is clear).
    // 4pm-5pm (120 min offset) should also be clear.

    // Find the 3pm-4pm suggestion (relative to the original 2pm start)
    selectedReschedule = suggestionList.find(
      (s) =>
        s.start.getHours() === 15 && s.start.getMinutes() === 0 &&
        s.end.getHours() === 16 && s.end.getMinutes() === 0,
    )!;
    assertExists(selectedReschedule, "3pm-4pm slot should be suggested.");
  });

  await test.step("5. Commit event at 3pm Tuesday to both Google and Outlook", async () => {
    const eventToCommit = toCommittableEvent({
      ...draftEventForPrinciple,
      start: selectedReschedule.start,
      end: selectedReschedule.end,
      title: "My Rescheduled Important Meeting",
    });

    const commitResult = await concept.commit({
      user: USER_ALICE,
      event: eventToCommit,
      accounts: [googleAccountId, outlookAccountId],
    });
    assertExists(commitResult);
    assertEquals((commitResult as { error?: string }).error, undefined);

    committedEvent = commitResult as SyncedEvent;
    assertExists(committedEvent._id);
    assertEquals(committedEvent.user, USER_ALICE);
    assertEquals(Object.keys(committedEvent.providerIds).length, 2);
    assertExists(committedEvent.providerIds[GOOGLE_PROVIDER]);
    assertExists(committedEvent.providerIds[OUTLOOK_PROVIDER]);
    assertEquals(committedEvent.accounts.length, 2);
    assertEquals(committedEvent.title, eventToCommit.title);
    assertEquals(committedEvent.start.getTime(), eventToCommit.start.getTime());
    assertEquals(committedEvent.end.getTime(), eventToCommit.end.getTime());
  });

  await test.step("6. User updates event location", async () => {
    const updatedLocation = "Virtual Room 2 (Updated)";
    const updateResult = await concept.update({
      user: USER_ALICE,
      eventId: committedEvent._id,
      changes: { location: updatedLocation },
    });
    assertExists(updateResult);
    assertEquals((updateResult as { error?: string }).error, undefined);

    const fetchedEvent = await concept._getSyncedEvent(committedEvent._id);
    assertExists(fetchedEvent);
    assertEquals((fetchedEvent as SyncedEvent).location, updatedLocation);
    assertNotEquals(
      (fetchedEvent as SyncedEvent).syncedAt.getTime(),
      committedEvent.syncedAt.getTime(),
    ); // syncedAt should be updated
    committedEvent = fetchedEvent as SyncedEvent; // Update reference
  });

  await test.step("7. Cancel the event", async () => {
    const cancelResult = await concept.cancel({
      user: USER_ALICE,
      eventId: committedEvent._id,
    });
    assertExists(cancelResult);
    assertEquals((cancelResult as { error?: string }).error, undefined);

    const fetchedEvent = await concept._getSyncedEvent(committedEvent._id);
    assertEquals(fetchedEvent, null, "Synced event should be removed after cancellation.");
  });

  await client.close();
});

Deno.test("CalendarSyncConcept: Account Management", async (test) => {
  const [db, client] = await testDb();
  const concept = new CalendarSyncConcept(db);

  let googleAccountId: ID;
  let outlookAccountId: ID;

  await test.step("1. Connect Google account for Bob", async () => {
    const result = await concept.connectAccount({
      user: USER_BOB,
      provider: GOOGLE_PROVIDER,
      credentials: { accessToken: "bob_google_token" },
    });
    assertExists(result);
    assertEquals((result as { error?: string }).error, undefined);
    googleAccountId = (result as { accountId: ID }).accountId;
  });

  await test.step("2. Connect Outlook account for Bob", async () => {
    const result = await concept.connectAccount({
      user: USER_BOB,
      provider: OUTLOOK_PROVIDER,
      credentials: { accessToken: "bob_outlook_token" },
    });
    assertExists(result);
    assertEquals((result as { error?: string }).error, undefined);
    outlookAccountId = (result as { accountId: ID }).accountId;
  });

  await test.step("3. Get account status for Bob - expect two connected accounts", async () => {
    const status = await concept._getAccountStatus(USER_BOB);
    assertEquals(Array.isArray(status), true);
    assertEquals((status as Account[]).length, 2);
    const googleAccount = (status as Account[]).find((a) => a.provider === GOOGLE_PROVIDER);
    const outlookAccount = (status as Account[]).find((a) => a.provider === OUTLOOK_PROVIDER);
    assertExists(googleAccount);
    assertExists(outlookAccount);
    assertEquals(googleAccount!.syncStatus, "connected");
    assertEquals(outlookAccount!.syncStatus, "connected");
  });

  await test.step("4. Disconnect Google account for Bob", async () => {
    const result = await concept.disconnectAccount({
      user: USER_BOB,
      accountId: googleAccountId,
    });
    assertEquals((result as { error?: string }).error, undefined);
  });

  await test.step("5. Get account status for Bob - expect Google disconnected, Outlook connected", async () => {
    const status = await concept._getAccountStatus(USER_BOB);
    assertEquals(Array.isArray(status), true);
    assertEquals((status as Account[]).length, 2);
    const googleAccount = (status as Account[]).find((a) => a.provider === GOOGLE_PROVIDER);
    const outlookAccount = (status as Account[]).find((a) => a.provider === OUTLOOK_PROVIDER);
    assertExists(googleAccount);
    assertExists(outlookAccount);
    assertEquals(googleAccount!.syncStatus, "disconnected");
    assertEquals(outlookAccount!.syncStatus, "connected");
  });

  await test.step("6. Refresh sync for connected Outlook account", async () => {
    const result = await concept.refreshSync({
      user: USER_BOB,
      accountId: outlookAccountId,
    });
    assertEquals((result as { error?: string }).error, undefined);

    const status = await concept._getAccountStatus(USER_BOB);
    const outlookAccount = (status as Account[]).find((a) => a.provider === OUTLOOK_PROVIDER);
    assertExists(outlookAccount);
    assertEquals(outlookAccount!.syncStatus, "connected");
    assertExists(outlookAccount!.lastSync); // Should be updated
  });

  await test.step("7. Refresh sync for disconnected Google account - expect error", async () => {
    const result = await concept.refreshSync({
      user: USER_BOB,
      accountId: googleAccountId,
    });
    assertExists(result);
    assertEquals((result as { error: string }).error, `Account ${googleAccountId} is not connected.`);
  });

  await test.step("8. Refresh sync with simulated failure - expect status 'error'", async () => {
    const appleConnectResult = await concept.connectAccount({
      user: USER_BOB,
      provider: APPLE_PROVIDER,
      credentials: { accessToken: "bob_apple_token", simulateRefreshFailure: true },
    });
    const appleAccountId = (appleConnectResult as { accountId: ID }).accountId;

    const refreshResult = await concept.refreshSync({
      user: USER_BOB,
      accountId: appleAccountId,
    });
    assertExists(refreshResult);
    assertNotEquals((refreshResult as { error?: string }).error, undefined);

    const status = await concept._getAccountStatus(USER_BOB);
    const appleAccount = (status as Account[]).find((a) => a.provider === APPLE_PROVIDER);
    assertExists(appleAccount);
    assertEquals(appleAccount!.syncStatus, "error");
  });

  await client.close();
});

Deno.test("CalendarSyncConcept: Event Commitment", async (test) => {
  const [db, client] = await testDb();
  const concept = new CalendarSyncConcept(db);

  let aliceGoogleAccId: ID;
  let aliceOutlookAccId: ID;
  let bobGoogleAccId: ID;

  await test.step("1. Setup: Connect accounts for Alice and Bob", async () => {
    aliceGoogleAccId = (await concept.connectAccount({
      user: USER_ALICE,
      provider: GOOGLE_PROVIDER,
      credentials: { accessToken: "alice_google" },
    }) as { accountId: ID }).accountId;
    aliceOutlookAccId = (await concept.connectAccount({
      user: USER_ALICE,
      provider: OUTLOOK_PROVIDER,
      credentials: { accessToken: "alice_outlook" },
    }) as { accountId: ID }).accountId;
    bobGoogleAccId = (await concept.connectAccount({
      user: USER_BOB,
      provider: GOOGLE_PROVIDER,
      credentials: { accessToken: "bob_google" },
    }) as { accountId: ID }).accountId;
  });

  await test.step("2. Commit event to a single provider (Alice, Google)", async () => {
    const draft = createTestDraftEvent(9, 10, "Morning Standup", 1); // Wednesday
    const result = await concept.commit({
      user: USER_ALICE,
      event: toCommittableEvent(draft),
      accounts: [aliceGoogleAccId],
    });
    assertExists(result);
    assertEquals((result as { error?: string }).error, undefined);

    const committedEvent = result as SyncedEvent;
    assertExists(committedEvent._id);
    assertEquals(committedEvent.user, USER_ALICE);
    assertEquals(Object.keys(committedEvent.providerIds).length, 1);
    assertExists(committedEvent.providerIds[GOOGLE_PROVIDER]);
    assertEquals(committedEvent.accounts, [aliceGoogleAccId]);
    assertEquals(committedEvent.title, draft.title);
  });

  await test.step("3. Commit event to multiple providers (Alice, Google & Outlook)", async () => {
    const draft = createTestDraftEvent(11, 12, "Client Demo", 1); // Wednesday
    const result = await concept.commit({
      user: USER_ALICE,
      event: toCommittableEvent(draft),
      accounts: [aliceGoogleAccId, aliceOutlookAccId],
    });
    assertExists(result);
    assertEquals((result as { error?: string }).error, undefined);

    const committedEvent = result as SyncedEvent;
    assertExists(committedEvent._id);
    assertEquals(committedEvent.user, USER_ALICE);
    assertEquals(Object.keys(committedEvent.providerIds).length, 2);
    assertExists(committedEvent.providerIds[GOOGLE_PROVIDER]);
    assertExists(committedEvent.providerIds[OUTLOOK_PROVIDER]);
    assertEquals(committedEvent.accounts.length, 2);
    assertEquals(committedEvent.title, draft.title);
  });

  await test.step("4. Commit event with a disconnected account - expect error", async () => {
    await concept.disconnectAccount({ user: USER_ALICE, accountId: aliceGoogleAccId });

    const draft = createTestDraftEvent(14, 15, "Disconnected Account Test", 1);
    const result = await concept.commit({
      user: USER_ALICE,
      event: toCommittableEvent(draft),
      accounts: [aliceGoogleAccId, aliceOutlookAccId],
    });
    assertExists(result);
    assertNotEquals((result as { error: string }).error, undefined);
    assert((result as { error: string }).error.includes(aliceGoogleAccId));

    // Verify it *did* commit to the connected account (Outlook in this case, implicitly)
    // The current mock commit logic will succeed for connected accounts even if others fail
    // Re-check Alice's Outlook for a new event with the title
    const events = await concept._getSyncedEvent((result as SyncedEvent)._id);
    assertEquals(events?.title, draft.title);
    assertEquals(Object.keys(events!.providerIds).length, 1);
    assertExists(events!.providerIds[OUTLOOK_PROVIDER]);
  });

  await test.step("5. Commit event to a non-existent account - expect error", async () => {
    const draft = createTestDraftEvent(16, 17, "Non-Existent Account Test", 1);
    const result = await concept.commit({
      user: USER_BOB,
      event: toCommittableEvent(draft),
      accounts: [bobGoogleAccId, "non-existent-id" as ID],
    });
    assertExists(result);
    assertNotEquals((result as { error: string }).error, undefined);
    assert((result as { error: string }).error.includes("non-existent-id"));
    // Expect it still commits to the valid account (bobGoogleAccId)
    const events = await concept._getSyncedEvent((result as SyncedEvent)._id);
    assertEquals(events?.title, draft.title);
    assertExists(events!.providerIds[GOOGLE_PROVIDER]);
  });

  await client.close();
});

Deno.test("CalendarSyncConcept: Conflict Detection", async (test) => {
  const [db, client] = await testDb();
  const concept = new CalendarSyncConcept(db);

  let aliceGoogleAccId: ID;

  await test.step("1. Setup: Connect Google account for Alice", async () => {
    aliceGoogleAccId = (await concept.connectAccount({
      user: USER_ALICE,
      provider: GOOGLE_PROVIDER,
      credentials: { accessToken: "alice_google_token" },
    }) as { accountId: ID }).accountId;
  });

  await test.step("2. Detect conflicts for an event that overlaps with mock external events (2pm Tuesday)", async () => {
    // Mock provider events are:
    // Alice - Google: July 9th, 2pm-3pm
    // Alice - Outlook: July 9th, 2:30pm-4pm
    const draft = createTestDraftEvent(14, 15, "Conflicting Meeting", 0); // July 9th, 2pm-3pm
    const conflicts = await concept.detectConflicts({ user: USER_ALICE, draft });
    assertExists(conflicts);
    assertEquals(Array.isArray(conflicts), true);
    assertEquals((conflicts as Conflict[]).length, 2); // Expect 2 conflicts from mockProviderEvents

    const conflictReasons = (conflicts as Conflict[]).map((c) => c.reason);
    assert(
      conflictReasons.some((r) => r.includes("Meeting with Team X")),
      "Should conflict with Google mock event",
    );
    assert(
      conflictReasons.some((r) => r.includes("Project Review")),
      "Should conflict with Outlook mock event",
    );
  });

  await test.step("3. Detect conflicts for an event with no conflicts (10am Wednesday)", async () => {
    const draft = createTestDraftEvent(10, 11, "Clear Slot Meeting", 1); // July 10th, 10am-11am
    const conflicts = await concept.detectConflicts({ user: USER_ALICE, draft });
    assertExists(conflicts);
    assertEquals(Array.isArray(conflicts), true);
    assertEquals((conflicts as Conflict[]).length, 0);
  });

  let committedEventId: EventId;
  await test.step("4. Commit an event for Alice (6pm Tuesday)", async () => {
    const draft = createTestDraftEvent(18, 19, "Evening Webinar", 0); // July 9th, 6pm-7pm
    const result = await concept.commit({
      user: USER_ALICE,
      event: toCommittableEvent(draft),
      accounts: [aliceGoogleAccId],
    });
    assertExists(result);
    assertEquals((result as { error?: string }).error, undefined);
    committedEventId = (result as SyncedEvent)._id;
  });

  await test.step("5. Detect conflicts for a new event overlapping with the internally committed event", async () => {
    const draft = createTestDraftEvent(18, 19, "Another Evening Event", 0); // July 9th, 6pm-7pm, direct overlap
    const conflicts = await concept.detectConflicts({ user: USER_ALICE, draft });
    assertExists(conflicts);
    assertEquals(Array.isArray(conflicts), true);
    assertEquals((conflicts as Conflict[]).length, 1);
    assertEquals((conflicts as Conflict[])[0].existingEvents[0], committedEventId);
    assertEquals((conflicts as Conflict[])[0].reason, "time_overlap (internal event)");
  });

  await test.step("6. Detect conflicts for a new event overlapping partially with the internally committed event", async () => {
    const draft = createTestDraftEvent(18, 18, 30, "Partial Evening Event", 0); // July 9th, 6pm-6:30pm
    const conflicts = await concept.detectConflicts({ user: USER_ALICE, draft });
    assertExists(conflicts);
    assertEquals(Array.isArray(conflicts), true);
    assertEquals((conflicts as Conflict[]).length, 1);
    assertEquals((conflicts as Conflict[])[0].existingEvents[0], committedEventId);
  });

  await client.close();
});

Deno.test("CalendarSyncConcept: Reschedule Suggestions", async (test) => {
  const [db, client] = await testDb();
  const concept = new CalendarSyncConcept(db);

  let carolGoogleAccId: ID;

  await test.step("1. Setup: Connect Google account for Carol", async () => {
    carolGoogleAccId = (await concept.connectAccount({
      user: USER_CAROL,
      provider: GOOGLE_PROVIDER,
      credentials: { accessToken: "carol_google_token" },
    }) as { accountId: ID }).accountId;
  });

  await test.step("2. Commit an event for Carol (10am Tuesday) to create an internal conflict", async () => {
    const draft = createTestDraftEvent(10, 11, "Carol's Morning Meeting", 0); // July 9th, 10am-11am
    const result = await concept.commit({
      user: USER_CAROL,
      event: toCommittableEvent(draft),
      accounts: [carolGoogleAccId],
    });
    assertEquals((result as { error?: string }).error, undefined);
  });

  await test.step("3. Suggest reschedules for a draft event that conflicts with Carol's Morning Meeting (10:30am Tuesday)", async () => {
    const conflictingDraft = createTestDraftEvent(10, 30, 11, 30, "Carol's Draft Conflict", 0);
    const suggestions = await concept.suggestReschedules({
      user: USER_CAROL,
      draft: conflictingDraft,
      constraints: { workingHoursStart: 9, workingHoursEnd: 17 },
    });
    assertExists(suggestions);
    assertEquals((suggestions as { error?: string }).error, undefined);
    assertEquals((suggestions as Timespan[]).length > 0, true);

    const suggestionList = suggestions as Timespan[];

    // Expected suggestions, avoiding 10am-11am:
    // Original: 10:30-11:30
    // +30 min: 11:00-12:00 (should be clear)
    // +60 min: 11:30-12:30 (should be clear)
    // +120 min: 12:30-13:30 (should be clear)

    assertExists(
      suggestionList.find((s) => s.start.getHours() === 11 && s.end.getHours() === 12),
      "Should suggest 11:00-12:00",
    );
    assertExists(
      suggestionList.find((s) => s.start.getHours() === 11 && s.start.getMinutes() === 30 && s.end.getHours() === 12 && s.end.getMinutes() === 30),
      "Should suggest 11:30-12:30",
    );
    assertExists(
      suggestionList.find((s) => s.start.getHours() === 12 && s.start.getMinutes() === 30 && s.end.getHours() === 13 && s.end.getMinutes() === 30),
      "Should suggest 12:30-13:30",
    );
  });

  await test.step("4. Suggest reschedules with tight working hours constraints (e.g., event 4pm-5pm, constraints 9am-4:30pm)", async () => {
    const draft = createTestDraftEvent(16, 17, "Late Day Meeting", 0); // July 9th, 4pm-5pm
    const suggestions = await concept.suggestReschedules({
      user: USER_CAROL,
      draft: draft,
      constraints: { workingHoursStart: 9, workingHoursEnd: 16 }, // End at 4 PM
    });
    assertExists(suggestions);
    assertEquals((suggestions as { error?: string }).error, undefined);

    const suggestionList = suggestions as Timespan[];
    // All original candidates (4:30-5:30, 5:00-6:00, etc.) should be filtered out by workingHoursEnd constraint
    // Only next-day options within working hours will remain if any.
    // Given the simple mock, it might not find any within tight constraints after the first day.
    // The current mock has `newEnd.getHours() <= workingHoursEnd` which will exclude 4pm-5pm if end is 4.
    // Let's refine the test to expect fewer or specific suggestions.

    // Original event 4pm-5pm. Constraints: 9am-4pm.
    // Suggest 30min later: 4:30-5:30 -> Exceeds workingHoursEnd
    // Suggest 60min later: 5:00-6:00 -> Exceeds workingHoursEnd
    // Suggest 120min later: 6:00-7:00 -> Exceeds workingHoursEnd
    // Suggest same time next day (4pm-5pm Wednesday) -> Exceeds workingHoursEnd for Wednesday.
    // It should suggest empty if none found *within* constraints.
    assertEquals(suggestionList.length, 0); // Expect no suggestions given the tight constraint.
  });

  await client.close();
});

Deno.test("CalendarSyncConcept: Update and Cancel Events", async (test) => {
  const [db, client] = await testDb();
  const concept = new CalendarSyncConcept(db);

  let aliceGoogleAccId: ID;
  let aliceOutlookAccId: ID;
  let eventToManage: SyncedEvent;

  await test.step("1. Setup: Connect Google and Outlook accounts for Alice", async () => {
    aliceGoogleAccId = (await concept.connectAccount({
      user: USER_ALICE,
      provider: GOOGLE_PROVIDER,
      credentials: { accessToken: "alice_google_token" },
    }) as { accountId: ID }).accountId;
    aliceOutlookAccId = (await concept.connectAccount({
      user: USER_ALICE,
      provider: OUTLOOK_PROVIDER,
      credentials: { accessToken: "alice_outlook_token" },
    }) as { accountId: ID }).accountId;
  });

  await test.step("2. Commit an event for Alice to both providers", async () => {
    const draft = createTestDraftEvent(9, 10, "Daily Sync-up", 2); // Thursday
    const result = await concept.commit({
      user: USER_ALICE,
      event: toCommittableEvent(draft),
      accounts: [aliceGoogleAccId, aliceOutlookAccId],
    });
    assertExists(result);
    assertEquals((result as { error?: string }).error, undefined);
    eventToManage = result as SyncedEvent;
    assertEquals(eventToManage.title, draft.title);
    assertEquals(eventToManage.location, undefined); // No location initially
  });

  await test.step("3. Update the event's title and location", async () => {
    const newTitle = "Daily Sync-up (Updated)";
    const newLocation = "Conference Room A";
    const updateResult = await concept.update({
      user: USER_ALICE,
      eventId: eventToManage._id,
      changes: { title: newTitle, location: newLocation },
    });
    assertExists(updateResult);
    assertEquals((updateResult as { error?: string }).error, undefined);

    const fetchedEvent = await concept._getSyncedEvent(eventToManage._id);
    assertExists(fetchedEvent);
    assertEquals((fetchedEvent as SyncedEvent).title, newTitle);
    assertEquals((fetchedEvent as SyncedEvent).location, newLocation);
    assertNotEquals((fetchedEvent as SyncedEvent).syncedAt, eventToManage.syncedAt); // Timestamp should be updated
    eventToManage = fetchedEvent as SyncedEvent; // Update reference for next step
  });

  await test.step("4. Update with an invalid field - expect warning but successful update for valid fields", async () => {
    const newDescription = "Updated description text.";
    const updateResult = await concept.update({
      user: USER_ALICE,
      eventId: eventToManage._id,
      changes: { description: newDescription, unknownField: "should_be_ignored" },
    });
    assertExists(updateResult);
    assertEquals((updateResult as { error?: string }).error, undefined); // Should still succeed for valid fields

    const fetchedEvent = await concept._getSyncedEvent(eventToManage._id);
    assertExists(fetchedEvent);
    assertEquals((fetchedEvent as SyncedEvent).description, newDescription);
    // Ensure unknownField was NOT added
    assertEquals(Object.prototype.hasOwnProperty.call(fetchedEvent, "unknownField"), false);
  });

  await test.step("5. Update an event belonging to another user - expect error", async () => {
    const updateResult = await concept.update({
      user: USER_BOB, // Wrong user
      eventId: eventToManage._id,
      changes: { title: "Attempted malicious update" },
    });
    assertExists(updateResult);
    assertNotEquals((updateResult as { error: string }).error, undefined);
    assert((updateResult as { error: string }).error.includes("not found or doesn't belong to user"));
  });

  await test.step("6. Update a non-existent event - expect error", async () => {
    const updateResult = await concept.update({
      user: USER_ALICE,
      eventId: "non-existent-event" as ID,
      changes: { title: "Non-existent update" },
    });
    assertExists(updateResult);
    assertNotEquals((updateResult as { error: string }).error, undefined);
    assert((updateResult as { error: string }).error.includes("not found or doesn't belong to user"));
  });

  await test.step("7. Cancel the event from all providers", async () => {
    const cancelResult = await concept.cancel({
      user: USER_ALICE,
      eventId: eventToManage._id,
    });
    assertExists(cancelResult);
    assertEquals((cancelResult as { error?: string }).error, undefined);

    const fetchedEvent = await concept._getSyncedEvent(eventToManage._id);
    assertEquals(fetchedEvent, null, "Synced event should be removed after cancellation.");
  });

  await test.step("8. Cancel a non-existent event - expect error", async () => {
    const cancelResult = await concept.cancel({
      user: USER_ALICE,
      eventId: "another-non-existent-event" as ID,
    });
    assertExists(cancelResult);
    assertNotEquals((cancelResult as { error: string }).error, undefined);
    assert((cancelResult as { error: string }).error.includes("not found or doesn't belong to user"));
  });

  let partialEvent: SyncedEvent;
  await test.step("9. Test partial cancellation: disconnect one account before cancelling", async () => {
    // Commit a new event
    const draft = createTestDraftEvent(10, 11, "Partial Cancel Test", 3); // Friday
    const commitResult = await concept.commit({
      user: USER_ALICE,
      event: toCommittableEvent(draft),
      accounts: [aliceGoogleAccId, aliceOutlookAccId],
    });
    assertExists(commitResult);
    partialEvent = commitResult as SyncedEvent;

    // Disconnect Google account
    await concept.disconnectAccount({ user: USER_ALICE, accountId: aliceGoogleAccId });

    // Cancel the event
    const cancelResult = await concept.cancel({
      user: USER_ALICE,
      eventId: partialEvent._id,
    });
    assertExists(cancelResult);
    // The current mock logic simply logs skips for disconnected accounts, and removes the internal event
    // if at least one provider was successfully acted upon (or skipped gracefully).
    // So, it should succeed, as Outlook is still connected and would have "deleted" it.
    assertEquals((cancelResult as { error?: string }).error, undefined); // No error, as Outlook succeeded.

    const fetchedEvent = await concept._getSyncedEvent(partialEvent._id);
    assertEquals(fetchedEvent, null, "Internal event should be removed even with one account disconnected.");
  });

  await client.close();
});

Deno.test("CalendarSyncConcept: Error Cases", async (test) => {
  const [db, client] = await testDb();
  const concept = new CalendarSyncConcept(db);

  await test.step("1. connectAccount with invalid credentials (mocked)", async () => {
    const result = await concept.connectAccount({
      user: USER_ALICE,
      provider: GOOGLE_PROVIDER,
      credentials: { accessToken: "invalid_token" }, // This triggers mock error
    });
    assertExists(result);
    assertNotEquals((result as { error?: string }).error, undefined);
    assertEquals((result as { error: string }).error, "Invalid credentials provided.");
  });

  await test.step("2. connectAccount with missing credentials", async () => {
    const result = await concept.connectAccount({
      user: USER_ALICE,
      provider: OUTLOOK_PROVIDER,
      credentials: {}, // Empty credentials
    });
    assertExists(result);
    assertNotEquals((result as { error?: string }).error, undefined);
    assertEquals((result as { error: string }).error, "Credentials must be provided.");
  });

  await test.step("3. commit to an account that doesn't belong to the user", async () => {
    const aliceGoogleAccId = (await concept.connectAccount({
      user: USER_ALICE,
      provider: GOOGLE_PROVIDER,
      credentials: { accessToken: "alice_token" },
    }) as { accountId: ID }).accountId;

    const draft = createTestDraftEvent(9, 10, "Unauthorized Commit", 4); // Saturday
    const result = await concept.commit({
      user: USER_BOB, // Bob is trying to commit to Alice's account
      event: toCommittableEvent(draft),
      accounts: [aliceGoogleAccId],
    });
    assertExists(result);
    assertNotEquals((result as { error?: string }).error, undefined);
    assert((result as { error: string }).error.includes("Some accounts are not connected or do not belong to the user"));
  });

  await test.step("4. refreshSync for a non-existent account", async () => {
    const result = await concept.refreshSync({
      user: USER_ALICE,
      accountId: "non-existent-account-id" as ID,
    });
    assertExists(result);
    assertNotEquals((result as { error?: string }).error, undefined);
    assert((result as { error: string }).error.includes("not found or doesn't belong to user"));
  });

  await client.close();
});
```