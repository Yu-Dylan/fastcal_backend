---
timestamp: 'Thu Oct 16 2025 22:33:32 GMT-0400 (Eastern Daylight Time)'
parent: '[[..\20251016_223332.e0fe99bd.md]]'
content_id: 33f215aaf447625cc4d801aceee45fdc8c76063d68b2677d9859263404383d6b
---

# file: src/concepts/CalendarSync/CalendarSyncConcept.ts

```typescript
import { Collection, Db } from "npm:mongodb";
import { ID, Empty, DateTime } from "@utils/types.ts"; // Assuming @utils/types.ts provides these
import { freshID } from "@utils/database.ts"; // Assuming @utils/database.ts provides freshID

// Declare collection prefix, use concept name
const PREFIX = "CalendarSync" + ".";

/**
 * @concept CalendarSync
 * @purpose commit events to external calendar providers and maintain consistency across multiple accounts
 * @principle after committing an event, it appears across all connected calendar accounts;
 * conflicts are detected by querying existing events across accounts;
 * system proposes ranked reschedule options when conflicts occur;
 * updates and cancellations propagate to all providers;
 * provider-specific event IDs are maintained for bidirectional sync
 */

// --- Internal Types ---

/**
 * Represents the type of calendar provider.
 */
type Provider = "google" | "outlook" | "apple" | "zoom";

/**
 * Represents the connection status of an account.
 */
type SyncStatus = "connected" | "disconnected" | "error";

/**
 * A user in the system, represented by a generic ID.
 */
type User = ID;

/**
 * An internal event ID, representing a SyncedEvent within FastCal.
 */
type EventId = ID;

/**
 * Credentials for a provider account. In a real system, this would be encrypted and likely
 * contain OAuth tokens, refresh tokens, and expiration times.
 * Using `Record<string, any>` for flexibility in mock, as `Map` is typically
 * serialized to a plain object in JSON/BSON.
 */
type Credentials = Record<string, any>;

/**
 * A basic draft event structure for conflict detection and rescheduling.
 * This represents an event not yet committed.
 */
interface DraftEvent {
  start: DateTime;
  end: DateTime;
  title: string;
  description?: string;
  location?: string;
  attendees?: string[]; // E.g., email addresses
  // In a real system, could include more fields like buffer times, travel time.
}

/**
 * An event that is ready to be committed. For this mock, it extends DraftEvent,
 * but in a real system, it might have more finalized validation or properties.
 */
interface CommittableEvent extends DraftEvent {
  // No additional fields for this mock.
}

/**
 * A time slot definition, used for rescheduling suggestions.
 */
interface Timespan {
  start: DateTime;
  end: DateTime;
}

/**
 * @state a set of Account with
 * a user User
 * a provider Provider // "google", "outlook", "apple", "zoom"
 * credentials Map<String,Any> // OAuth tokens, refresh tokens (stored as Record<string,any> in MongoDB)
 * a syncStatus SyncStatus // "connected", "disconnected", "error"
 * a lastSync DateTime
 */
interface Account {
  _id: ID; // Unique ID for this account connection (e.g., "acc:google:user:alice")
  user: User;
  provider: Provider;
  /**
   * NOTE: In a real system, credentials would be encrypted at rest (e.g., AES-256).
   * For this mock, they are stored as a plain object.
   */
  credentials: Credentials;
  syncStatus: SyncStatus;
  lastSync: DateTime;
}

/**
 * @state a set of SyncedEvent with
 * a user User
 * an internalId EventId // FastCal internal event ID (mapped to _id)
 * providerIds Map<Provider,String> // provider-specific event IDs (stored as Record<Provider,string>)
 * a syncedAt DateTime
 * accounts Set<Account> // which accounts have this event (stored as an array of Account IDs)
 *
 * Additionally, event details like title, start, and end are stored to allow for updates
 * and queries without always needing to fetch from providers.
 */
interface SyncedEvent {
  _id: EventId; // This is the internal FastCal event ID
  user: User;
  providerIds: Record<Provider, string>; // Maps provider to its specific event ID (e.g., { google: "abc123", outlook: "xyz789" })
  syncedAt: DateTime;
  accounts: ID[]; // Array of Account IDs (e.g., ["acc:google:user:alice", "acc:outlook:user:alice"])
  // Event details, mirrored from CommittableEvent
  title: string;
  start: DateTime;
  end: DateTime;
  description?: string;
  location?: string;
  attendees?: string[];
}

/**
 * @state a set of Conflict with
 * a user User
 * a draftEvent DraftEvent
 * existingEvents Set<EventId> // conflicting events (FastCal internal IDs for SyncedEvents)
 * a reason String // "time_overlap", "buffer_violation", "double_booking"
 */
interface Conflict {
  _id: ID; // Unique ID for the conflict instance
  user: User;
  draftEvent: DraftEvent;
  existingEvents: EventId[]; // IDs of SyncedEvents that conflict (if known internally)
  reason: string;
  // A real system might also store details about the external conflicting event if no internal ID exists.
}

// --- Mock Provider State (for detectConflicts/suggestReschedules) ---
// In a real system, these would be fetched via live API calls to external providers.
// For this mock, we simulate some existing events in external calendars.
interface MockProviderEvent {
  provider: Provider;
  providerId: string;
  user: User;
  start: DateTime;
  end: DateTime;
  title: string;
  location?: string;
}

const mockProviderEvents: MockProviderEvent[] = [];

/**
 * CalendarSyncConcept provides functionality to synchronize calendar events across multiple external providers.
 * It manages account connections, event commitment, conflict detection, rescheduling suggestions,
 * updates, cancellations, and account management.
 */
export default class CalendarSyncConcept {
  private accounts: Collection<Account>;
  private syncedEvents: Collection<SyncedEvent>;
  private conflicts: Collection<Conflict>;

  constructor(private readonly db: Db) {
    this.accounts = this.db.collection(PREFIX + "accounts");
    this.syncedEvents = this.db.collection(PREFIX + "syncedEvents");
    this.conflicts = this.db.collection(PREFIX + "conflicts");

    // Initialize mock provider events for testing conflict detection.
    // These events are "external" and would normally be fetched via provider APIs.
    // Ensure this only runs once to avoid duplicating mock data on concept instantiation.
    if (mockProviderEvents.length === 0) {
      const userA = "user:Alice" as User;
      const userB = "user:Bob" as User;

      // Event 1 (Alice - Google): Conflicts with 2pm-3pm Tuesday
      mockProviderEvents.push({
        provider: "google",
        providerId: "mock-google-event-1",
        user: userA,
        start: new Date(2024, 6, 9, 14, 0), // July 9th, 2pm (Tuesday)
        end: new Date(2024, 6, 9, 15, 0), // 3pm
        title: "Meeting with Team X (Google)",
      });

      // Event 2 (Alice - Outlook): Conflicts with 2:30pm-4pm Tuesday (overlap with event 1 and 2pm draft)
      mockProviderEvents.push({
        provider: "outlook",
        providerId: "mock-outlook-event-1",
        user: userA,
        start: new Date(2024, 6, 9, 14, 30), // July 9th, 2:30pm (Tuesday)
        end: new Date(2024, 6, 9, 16, 0), // 4pm
        title: "Project Review (Outlook)",
      });

      // Event 3 (Bob - Google): No conflict with Alice's 2pm Tuesday
      mockProviderEvents.push({
        provider: "google",
        providerId: "mock-google-event-2",
        user: userB,
        start: new Date(2024, 6, 9, 10, 0), // July 9th, 10am (Tuesday)
        end: new Date(2024, 6, 9, 11, 0), // 11am
        title: "Daily Standup (Bob's Google)",
      });
    }
  }

  /**
   * @action connectAccount
   * @description Creates an account connection to an external calendar provider.
   * @param {object} params - The action parameters.
   * @param {User} params.user - The ID of the user.
   * @param {Provider} params.provider - The name of the calendar provider (e.g., "google", "outlook").
   * @param {Record<string, any>} params.credentials - OAuth tokens or other authentication details.
   * @requires credentials are valid, provider is supported
   * @effect creates account connection and validates credentials with provider
   * @note returns account ID and sets syncStatus to "connected"
   * @note stores encrypted credentials for future API calls
   *
   * @returns {{ accountId: ID } | { error: string }} The ID of the new account, or an error object.
   */
  async connectAccount(
    params: { user: User; provider: Provider; credentials: Record<string, any> },
  ): Promise<{ accountId: ID } | { error: string }> {
    const { user, provider, credentials } = params;

    // MOCK: Simulate credential validation with provider.
    // In a real system, this would involve an API call to the provider
    // to exchange tokens, verify scopes, etc.
    // For now, we assume credentials are always valid unless specific mock failure.
    if (!credentials || Object.keys(credentials).length === 0) {
      return { error: "Credentials must be provided." };
    }
    // Simulate some "invalid" credentials for demonstration purposes
    if (credentials["accessToken"] === "invalid_token") {
      return { error: "Invalid credentials provided." };
    }

    const newAccountId = freshID();
    const newAccount: Account = {
      _id: newAccountId,
      user,
      provider,
      // NOTE: In a real system, credentials would be encrypted before storage (e.g., using a KMS or strong encryption library).
      credentials, // Storing raw for mock, but highlight for real impl.
      syncStatus: "connected",
      lastSync: new Date(),
    };

    try {
      await this.accounts.insertOne(newAccount);
      return { accountId: newAccountId };
    } catch (e: any) {
      console.error(`Error connecting account: ${e}`);
      return { error: `Failed to connect account: ${e.message}` };
    }
  }

  /**
   * @action commit
   * @description Creates an event in each specified provider's calendar.
   * @param {object} params - The action parameters.
   * @param {User} params.user - The ID of the user.
   * @param {CommittableEvent} params.event - The event details to commit.
   * @param {ID[]} params.accounts - A list of Account IDs to sync the event to.
   * @requires event is validated, accounts belong to user, all accounts are connected
   * @effect creates event in each provider's calendar via API calls
   * @note stores mapping of internal ID to provider-specific IDs
   * @note returns synced event with all provider IDs
   * @note sets syncedAt timestamp for tracking
   *
   * @returns {SyncedEvent | { error: string }} The created SyncedEvent, or an error object.
   */
  async commit(
    params: { user: User; event: CommittableEvent; accounts: ID[] },
  ): Promise<SyncedEvent | { error: string }> {
    const { user, event, accounts: accountIds } = params;

    // Check requires: accounts belong to user and are connected
    const connectedAccounts = await this.accounts.find({
      _id: { $in: accountIds },
      user: user,
      syncStatus: "connected",
    }).toArray();

    if (connectedAccounts.length !== accountIds.length) {
      const disconnectedOrInvalidAccountIds = accountIds.filter(id =>
        !connectedAccounts.some(acc => acc._id === id)
      );
      if (disconnectedOrInvalidAccountIds.length > 0) {
        return {
          error:
            `Some accounts are not connected or do not belong to the user: ${disconnectedOrInvalidAccountIds.join(", ")}`,
        };
      }
      // This case should ideally be caught by the above, but as a fallback:
      return { error: "One or more accounts are invalid or not connected." };
    }

    const internalEventId = freshID();
    const providerIds: Record<Provider, string> = {};
    const failedProviders: Provider[] = [];

    for (const account of connectedAccounts) {
      // MOCK: Simulate API call to provider to create the event.
      // In a real system:
      // - Use account.provider to select the correct API client (e.g., Google Calendar API, Outlook Graph API).
      // - Use account.credentials for authentication (e.g., OAuth access token).
      // - Map CommittableEvent fields to the provider-specific schema.
      // - Make the actual API call (e.g., `googleCalendarApi.events.insert(...)`, `outlookGraphApi.me.calendars.events.post(...)`).
      try {
        // Simulate a provider-specific event ID
        const mockProviderEventId = `p:${account.provider}:${freshID()}`;
        providerIds[account.provider] = mockProviderEventId;
        console.log(
          `MOCK: Event '${event.title}' created in ${account.provider} with ID: ${mockProviderEventId}`,
        );
      } catch (e: any) {
        console.error(
          `MOCK: Failed to create event in ${account.provider}: ${e.message}`,
        );
        failedProviders.push(account.provider);
        // In a real system, we might mark the account as 'error', implement retry logic, or log for administrative review.
      }
    }

    if (Object.keys(providerIds).length === 0) {
      return { error: "Failed to commit event to any connected account." };
    }

    const newSyncedEvent: SyncedEvent = {
      _id: internalEventId,
      user,
      providerIds,
      syncedAt: new Date(),
      accounts: connectedAccounts.map((acc) => acc._id),
      // Copy event details directly from the CommittableEvent
      title: event.title,
      start: event.start,
      end: event.end,
      description: event.description,
      location: event.location,
      attendees: event.attendees,
    };

    try {
      await this.syncedEvents.insertOne(newSyncedEvent);
      return newSyncedEvent;
    } catch (e: any) {
      console.error(`Error committing synced event to DB: ${e}`);
      return { error: `Failed to store synced event internally: ${e.message}` };
    }
  }

  /**
   * @action detectConflicts
   * @description Queries all connected accounts for events overlapping with a draft time range.
   * @param {object} params - The action parameters.
   * @param {User} params.user - The ID of the user.
   * @param {DraftEvent} params.draft - The draft event to check for conflicts.
   * @requires draft exists
   * @effect queries all connected accounts for events overlapping with draft time range
   * @note checks both exact time overlap and buffer violations (simplified for mock)
   * @note returns set of conflicts with reasons
   * @note considers travel time buffers if specified in draft constraints (not implemented in mock)
   *
   * @returns {Conflict[] | { error: string }} An array of detected conflicts, or an error object.
   */
  async detectConflicts(
    params: { user: User; draft: DraftEvent },
  ): Promise<Conflict[] | { error: string }> {
    const { user, draft } = params;
    const conflicts: Conflict[] = [];

    // Helper to check for time range overlap
    const doTimeRangesOverlap = (
      start1: DateTime,
      end1: DateTime,
      start2: DateTime,
      end2: DateTime,
    ) => {
      return (start1 < end2 && end1 > start2);
    };

    // MOCK: Simulate querying provider calendars.
    // In a real system:
    // 1. Fetch connected accounts for the user from `this.accounts`.
    // 2. For each account, use its provider and credentials to call the calendar API
    //    (e.g., Google Calendar Events List with timeMin/timeMax, Outlook Calendar Get Events).
    // 3. Filter events that fall within the draft event's time range.
    // 4. For each conflicting event from a provider, check if it corresponds to an internal SyncedEvent.
    //    If yes, add its `EventId`. If no (it's purely external), then a `Conflict` might not have `existingEvents`.

    // For this mock, we'll check against:
    // a) Our internal `syncedEvents` collection for the user.
    // b) Our `mockProviderEvents` (simulating external events not managed by FastCal yet).

    // 1. Check against internally synced events for the user
    const internalEvents = await this.syncedEvents.find({ user }).toArray();
    for (const existingEvent of internalEvents) {
      if (doTimeRangesOverlap(draft.start, draft.end, existingEvent.start, existingEvent.end)) {
        conflicts.push({
          _id: freshID(),
          user,
          draftEvent: draft,
          existingEvents: [existingEvent._id], // We have an internal ID for this conflict
          reason: "time_overlap (internal event)",
        });
      }
    }

    // 2. Check against mock external provider events for the user
    for (const mockEvent of mockProviderEvents) {
      if (mockEvent.user !== user) continue; // Only check events for the current user

      // Check if this mock event is already linked to an internal SyncedEvent to avoid double counting
      const isAlreadySynced = internalEvents.some(
        (se) => se.providerIds[mockEvent.provider] === mockEvent.providerId,
      );
      if (isAlreadySynced) continue; // Already handled as an internal conflict

      if (doTimeRangesOverlap(draft.start, draft.end, mockEvent.start, mockEvent.end)) {
        conflicts.push({
          _id: freshID(),
          user,
          draftEvent: draft,
          existingEvents: [], // No internal EventId for this purely mock external event
          reason: `time_overlap (external ${mockEvent.provider} event: ${mockEvent.title})`,
        });
      }
    }

    // Store conflicts for auditing/retrieval (optional, but good for debugging/history)
    if (conflicts.length > 0) {
      try {
        // Insert many if there are multiple conflicts
        await this.conflicts.insertMany(conflicts);
      } catch (e: any) {
        console.warn(`Warning: Failed to store detected conflicts: ${e.message}`);
        // Do not block returning conflicts if storage fails, just log.
      }
    }

    return conflicts;
  }

  /**
   * @action suggestReschedules
   * @description Proposes alternative time slots that avoid conflicts.
   * @param {object} params - The action parameters.
   * @param {User} params.user - The ID of the user.
   * @param {DraftEvent} params.draft - The original draft event that had conflicts.
   * @param {Record<string, any>} params.constraints - Additional constraints for rescheduling (e.g., working hours, day boundaries).
   * @requires draft exists, conflicts were detected
   * @effect proposes alternative time slots that avoid conflicts
   * @note ranks suggestions by: proximity to original time, attendee availability, time-of-day preferences
   * @note respects constraints like working hours, day boundaries, minimum/maximum offsets
   * @note returns ranked list of timespans (start, end)
   *
   * @returns {Timespan[] | { error: string }} A ranked list of suggested timespans, or an error object.
   */
  async suggestReschedules(
    params: { user: User; draft: DraftEvent; constraints: Record<string, any> },
  ): Promise<Timespan[] | { error: string }> {
    const { user, draft, constraints } = params;

    // MOCK: Simulate rescheduling logic.
    // In a real system:
    // 1. Retrieve all known busy times for the user across all connected accounts and, potentially, attendees.
    //    This involves querying `this.syncedEvents` and making live API calls to external providers.
    // 2. Generate candidate time slots around the original draft time.
    // 3. Filter out slots that overlap with detected busy times.
    // 4. Rank remaining slots based on heuristics (proximity to original, time-of-day preferences, attendee availability).

    const suggestions: Timespan[] = [];
    const eventDurationMs = draft.end.getTime() - draft.start.getTime();

    // Helper to add minutes to a date
    const addMinutes = (date: Date, minutes: number) =>
      new Date(date.getTime() + minutes * 60 * 1000);

    // Helper to check if a proposed timespan conflicts with any *known* event for the user.
    // This combines internal SyncedEvents and mock external events.
    const checkMockConflicts = async (
      suggStart: DateTime,
      suggEnd: DateTime,
    ): Promise<boolean> => {
      // Check against internally synced events for the user
      const internalConflicts = await this.syncedEvents.countDocuments({
        user,
        start: { $lt: suggEnd }, // proposed start is before existing end
        end: { $gt: suggStart }, // proposed end is after existing start
      });
      if (internalConflicts > 0) return true;

      // Check against mock external provider events for the user
      for (const mockEvent of mockProviderEvents) {
        if (mockEvent.user === user && suggStart < mockEvent.end && suggEnd > mockEvent.start) {
          return true;
        }
      }
      return false;
    };

    // Generate candidate suggestions:
    // Ranked by proximity:
    // 1. 30 minutes later
    // 2. 1 hour later
    // 3. 2 hours later
    // 4. Same time next day
    const candidates = [
      { offset: 30, unit: "minutes" },
      { offset: 60, unit: "minutes" },
      { offset: 120, unit: "minutes" },
      { offset: 1, unit: "days" },
    ];

    for (const candidate of candidates) {
      let newStart: DateTime;
      let newEnd: DateTime;

      if (candidate.unit === "minutes") {
        newStart = addMinutes(draft.start, candidate.offset);
        newEnd = addMinutes(draft.end, candidate.offset);
      } else { // "days"
        newStart = new Date(draft.start);
        newStart.setDate(draft.start.getDate() + candidate.offset);
        newEnd = new Date(draft.end);
        newEnd.setDate(draft.end.getDate() + candidate.offset);
      }

      // Respect constraints (mock: simple check for working hours 9am-5pm)
      const workingHoursStart = constraints["workingHoursStart"] || 9; // Default 9 AM
      const workingHoursEnd = constraints["workingHoursEnd"] || 17; // Default 5 PM
      const isWithinWorkingHours = newStart.getHours() >= workingHoursStart &&
        newEnd.getHours() <= workingHoursEnd &&
        newEnd.getHours() > newStart.getHours(); // Ensure it doesn't end before it starts

      if (isWithinWorkingHours && !(await checkMockConflicts(newStart, newEnd))) {
        suggestions.push({ start: newStart, end: newEnd });
      }
    }

    // In a real system, `suggestions` would then be sorted based on various heuristics.
    // For this mock, the generation order implies ranking.

    return suggestions;
  }

  /**
   * @action update
   * @description Propagates changes to a synced event across all connected providers.
   * @param {object} params - The action parameters.
   * @param {User} params.user - The ID of the user.
   * @param {EventId} params.eventId - The internal ID of the synced event to update.
   * @param {Record<string, any>} params.changes - A map/object of field names to their new values.
   * @requires eventId is synced, changes contain valid field names
   * @effect propagates changes to all providers using stored provider IDs
   * @note handles partial failures gracefully (retries, marks account sync error)
   * @note updates syncedAt timestamp
   *
   * @returns {Empty | { error: string }} An empty object on success, or an error object.
   */
  async update(
    params: { user: User; eventId: EventId; changes: Record<string, any> },
  ): Promise<Empty | { error: string }> {
    const { user, eventId, changes } = params;

    const syncedEvent = await this.syncedEvents.findOne({ _id: eventId, user });
    if (!syncedEvent) {
      return { error: `Synced event with ID ${eventId} not found or doesn't belong to user.` };
    }

    const failedProviders: Provider[] = [];
    const updatedFields: Record<string, any> = {};

    // Validate and prepare fields for update
    for (const key in changes) {
      // Basic validation: only allow updating fields present in SyncedEvent
      if (Object.prototype.hasOwnProperty.call(syncedEvent, key)) {
        updatedFields[key] = changes[key];
      } else {
        console.warn(`Attempted to update unknown or disallowed field: ${key}`);
      }
    }

    if (Object.keys(updatedFields).length === 0) {
      return { error: "No valid fields provided for update." };
    }

    // Propagate changes to external providers
    for (const accountId of syncedEvent.accounts) {
      const account = await this.accounts.findOne({ _id: accountId });
      if (!account || account.syncStatus !== "connected") {
        console.warn(
          `Skipping update for account ${accountId} (not found or disconnected).`,
        );
        continue; // Skip if account is not active
      }

      const provider = account.provider;
      const providerEventId = syncedEvent.providerIds[provider];

      if (!providerEventId) {
        console.warn(
          `No provider ID found for event ${eventId} in ${provider} calendar, cannot update.`,
        );
        continue;
      }

      // MOCK: Simulate API call to provider to update the event.
      // In a real system:
      // - Use account.provider and credentials.
      // - Map `updatedFields` to the provider-specific update request body.
      // - Make the API call (e.g., `googleCalendarApi.events.patch(providerEventId, updatedData)`).
      try {
        console.log(
          `MOCK: Updating event '${syncedEvent.title}' (Provider ID: ${providerEventId}) in ${provider} with changes:`,
          updatedFields,
        );
        // Simulate success
      } catch (e: any) {
        console.error(
          `MOCK: Failed to update event ${providerEventId} in ${provider}: ${e.message}`,
        );
        failedProviders.push(provider);
        // In a real system, here we would implement retry logic, mark the specific account's sync status for this event,
        // or notify the user of a partial failure.
      }
    }

    // Update the internal SyncedEvent in the database
    try {
      await this.syncedEvents.updateOne(
        { _id: eventId },
        { $set: { ...updatedFields, syncedAt: new Date() } },
      );
    } catch (e: any) {
      console.error(`Error updating synced event in DB: ${e}`);
      return { error: `Failed to update internal synced event: ${e.message}` };
    }

    if (failedProviders.length > 0) {
      return {
        error: `Partial update: Failed for providers: ${failedProviders.join(", ")}`,
      };
    }

    return {};
  }

  /**
   * @action cancel
   * @description Removes an event from all connected providers.
   * @param {object} params - The action parameters.
   * @param {User} params.user - The ID of the user.
   * @param {EventId} params.eventId - The internal ID of the synced event to cancel.
   * @requires eventId is synced
   * @effect removes event from all providers using stored provider IDs
   * @note removes SyncedEvent from state after successful deletion
   * @note handles partial failures (marks which providers succeeded)
   *
   * @returns {Empty | { error: string }} An empty object on success, or an error object.
   */
  async cancel(
    params: { user: User; eventId: EventId },
  ): Promise<Empty | { error: string }> {
    const { user, eventId } = params;

    const syncedEvent = await this.syncedEvents.findOne({ _id: eventId, user });
    if (!syncedEvent) {
      return { error: `Synced event with ID ${eventId} not found or doesn't belong to user.` };
    }

    const failedProviders: Provider[] = [];

    // Attempt to delete event from all associated providers
    for (const accountId of syncedEvent.accounts) {
      const account = await this.accounts.findOne({ _id: accountId });
      if (!account || account.syncStatus !== "connected") {
        console.warn(
          `Skipping cancellation for account ${accountId} (not found or disconnected).`,
        );
        continue;
      }

      const provider = account.provider;
      const providerEventId = syncedEvent.providerIds[provider];

      if (!providerEventId) {
        console.warn(
          `No provider ID found for event ${eventId} in ${provider} calendar during cancellation.`,
        );
        continue;
      }

      // MOCK: Simulate API call to provider to delete the event.
      // In a real system:
      // - Use account.provider and credentials.
      // - Make the API call (e.g., `googleCalendarApi.events.delete(providerEventId)`).
      try {
        console.log(
          `MOCK: Deleting event '${syncedEvent.title}' (Provider ID: ${providerEventId}) from ${provider}.`,
        );
        // Simulate success
      } catch (e: any) {
        console.error(
          `MOCK: Failed to delete event ${providerEventId} from ${provider}: ${e.message}`,
        );
        failedProviders.push(provider);
        // In a real system, mark this provider as failed for this event, potentially retry later.
      }
    }

    // Only remove the SyncedEvent from internal state if at least one provider succeeded
    // or if the intent is to remove it from FastCal even if external deletion fails partially.
    // The spec says "removes SyncedEvent from state after successful deletion" (plural),
    // implying all or most. For this implementation, we will remove if at least one succeeded.
    if (failedProviders.length < syncedEvent.accounts.length) { // Means at least one provider succeeded or was skipped
      try {
        await this.syncedEvents.deleteOne({ _id: eventId });
      } catch (e: any) {
        console.error(`Error deleting synced event from DB: ${e}`);
        return { error: `Failed to remove internal synced event: ${e.message}` };
      }
    } else {
      // If all providers failed, we don't remove it from our internal state,
      // as it's still "live" on all external calendars.
      return { error: `Failed to cancel event on all providers.` };
    }

    if (failedProviders.length > 0) {
      return {
        error: `Partial cancellation: Failed for providers: ${failedProviders.join(", ")}`,
      };
    }

    return {};
  }

  /**
   * @action disconnectAccount
   * @description Revokes credentials and marks an account as disconnected.
   * @param {object} params - The action parameters.
   * @param {User} params.user - The ID of the user.
   * @param {ID} params.accountId - The ID of the account to disconnect.
   * @requires account exists, account belongs to user
   * @effect revokes credentials and marks account disconnected
   * @note does not delete events already committed to provider
   * @note removes account from future sync operations
   *
   * @returns {Empty | { error: string }} An empty object on success, or an error object.
   */
  async disconnectAccount(
    params: { user: User; accountId: ID },
  ): Promise<Empty | { error: string }> {
    const { user, accountId } = params;

    const account = await this.accounts.findOne({ _id: accountId, user });
    if (!account) {
      return { error: `Account with ID ${accountId} not found or doesn't belong to user.` };
    }

    // MOCK: Simulate revoking credentials with the provider.
    // In a real system:
    // - Use account.provider and credentials to call the provider's API
    //   to revoke the OAuth token or similar (e.g., `googleOAuth.revokeToken(...)`).
    try {
      console.log(
        `MOCK: Revoking credentials for account ${accountId} (provider: ${account.provider}).`,
      );
      // Simulate success
    } catch (e: any) {
      console.error(
        `MOCK: Failed to revoke credentials for ${account.provider}: ${e.message}`,
      );
      // Even if provider revocation fails, we update our internal state as the user expects it disconnected.
      // A real system might re-attempt revocation or flag it for manual intervention.
    }

    try {
      await this.accounts.updateOne(
        { _id: accountId },
        { $set: { syncStatus: "disconnected", lastSync: new Date() } },
      );
      // Optionally remove credentials from DB here, as they are no longer valid/useful.
      // await this.accounts.updateOne({ _id: accountId }, { $unset: { credentials: "" } });
      return {};
    } catch (e: any) {
      console.error(`Error disconnecting account in DB: ${e}`);
      return { error: `Failed to disconnect account: ${e.message}` };
    }
  }

  /**
   * @action refreshSync
   * @description Refreshes OAuth tokens if needed and validates connection with the provider.
   * @param {object} params - The action parameters.
   * @param {User} params.user - The ID of the user.
   * @param {ID} params.accountId - The ID of the account to refresh.
   * @requires account exists, account is connected
   * @effect refreshes OAuth tokens if needed, validates connection
   * @note updates lastSync timestamp and syncStatus
   * @note can detect provider-side changes for bidirectional sync (future enhancement)
   *
   * @returns {Empty | { error: string }} An empty object on success, or an error object.
   */
  async refreshSync(
    params: { user: User; accountId: ID },
  ): Promise<Empty | { error: string }> {
    const { user, accountId } = params;

    const account = await this.accounts.findOne({ _id: accountId, user });
    if (!account) {
      return { error: `Account with ID ${accountId} not found or doesn't belong to user.` };
    }
    if (account.syncStatus !== "connected") {
      return { error: `Account ${accountId} is not connected.` };
    }

    // MOCK: Simulate OAuth token refresh and connection validation.
    // In a real system:
    // - Check if account.credentials.accessToken is expired or nearing expiration.
    // - If so, use account.credentials.refreshToken to call the provider's OAuth token endpoint
    //   to get a new accessToken (and potentially a new refreshToken).
    // - Make a simple API call (e.g., get calendar list) to validate the new token/connection.
    try {
      console.log(
        `MOCK: Refreshing sync for account ${accountId} (provider: ${account.provider}).`,
      );
      // Simulate potential refresh failure based on mock credentials
      if (account.credentials["simulateRefreshFailure"]) {
        throw new Error("Simulated refresh failure.");
      }
      // Simulate token refresh by updating the access token
      account.credentials["accessToken"] = `new_mock_token_${Date.now()}`;
      await this.accounts.updateOne(
        { _id: accountId },
        {
          $set: {
            credentials: account.credentials, // Save updated credentials (if refresh changed them)
            lastSync: new Date(),
            syncStatus: "connected",
          },
        },
      );
      return {};
    } catch (e: any) {
      console.error(
        `MOCK: Failed to refresh sync for ${account.provider} account ${accountId}: ${e.message}`,
      );
      // If refresh fails, mark the account's syncStatus as 'error'.
      await this.accounts.updateOne(
        { _id: accountId },
        { $set: { syncStatus: "error", lastSync: new Date() } },
      );
      return { error: `Failed to refresh sync: ${e.message}` };
    }
  }

  /**
   * @query _getAccountStatus
   * @description Returns all accounts for a user with their sync status and last sync time.
   * @param {User} user - The ID of the user.
   * @effect returns all accounts for user with sync status and last sync time
   *
   * @returns {Omit<Account, "credentials">[] | { error: string }} An array of account objects (excluding sensitive credentials), or an error object.
   */
  async _getAccountStatus(
    user: User,
  ): Promise<Omit<Account, "credentials">[] | { error: string }> {
    try {
      // Project only necessary fields to avoid returning sensitive credentials
      const accounts = await this.accounts.find(
        { user },
        { projection: { _id: 1, user: 1, provider: 1, syncStatus: 1, lastSync: 1 } },
      ).toArray();
      // Cast is safe due to projection, Omit<Account, "credentials">
      return accounts as Omit<Account, "credentials">[];
    } catch (e: any) {
      console.error(`Error getting account status for user ${user}: ${e}`);
      return { error: `Failed to retrieve account statuses: ${e.message}` };
    }
  }

  /**
   * @query _getSyncedEvent
   * @description Returns a synced event with its provider IDs, or null if not synced.
   * @param {EventId} eventId - The internal ID of the synced event.
   * @effect returns synced event with provider IDs, or null if not synced
   *
   * @returns {SyncedEvent | null | { error: string }} The synced event, null if not found, or an error object.
   */
  async _getSyncedEvent(
    eventId: EventId,
  ): Promise<SyncedEvent | null | { error: string }> {
    try {
      const syncedEvent = await this.syncedEvents.findOne({ _id: eventId });
      return syncedEvent;
    } catch (e: any) {
      console.error(`Error getting synced event ${eventId}: ${e}`);
      return { error: `Failed to retrieve synced event: ${e.message}` };
    }
  }
}
```

Please create comprehensive tests for the CalendarSync concept.

Required test scenarios:

1. Operational principle test: Connect accounts → detect conflicts → suggest reschedules → commit event → update → cancel
   * Should demonstrate the full sync workflow described in the spec
   * Use mock providers (google, outlook)

2. Account management: Test connecting, disconnecting, and getting account status
   * Multiple accounts for same user
   * Verify syncStatus transitions

3. Event commitment: Test committing events to multiple providers
   * Single provider, multiple providers
   * Verify provider IDs are stored correctly
   * Test with mock CommittableEvent structure

4. Conflict detection: Test detectConflicts with various scenarios
   * No conflicts (clean calendar)
   * Time overlap conflicts
   * Buffer violation conflicts
   * Multiple conflicts

5. Reschedule suggestions: Test suggestReschedules
   * Verify suggestions avoid conflicts
   * Verify ranking (proximity to original time)
   * Test with constraints (working hours, etc.)

6. Update and cancel: Test propagating changes
   * Update event across providers
   * Cancel event from all providers
   * Verify cleanup after cancellation

7. Error cases: Connection failures, invalid account IDs, non-existent events

Note: Tests should work with the mock implementation. Use realistic provider names and IDs.

Use Deno testing framework with programmatic assertions and console output.
