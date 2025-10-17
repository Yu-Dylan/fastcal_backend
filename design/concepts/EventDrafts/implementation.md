# prompt: implement EventDrafts concept

[@implementing-concepts](../../background/implementing-concepts.md)

[@EventDrafts specification](EventDrafts.md)

Please implement the EventDrafts concept following the specification above and the implementation guidelines.

Key requirements:
- Use MongoDB collections with PREFIX namespace separation
- Define all internal types (DraftEvent, Tag as IDs)
- Implement all actions from the specification
- Use proper TypeScript types with the ID type from @utils/types.ts
- Follow the pattern shown in LikertSurvey example
- Include clear JSDoc comments
- Handle error cases appropriately (throw errors with descriptive messages)
- Ensure all state invariants are maintained

The concept should export a class with a constructor that takes a Db instance and implements all the actions as methods.

# response:

```typescript
import { Collection, Db } from "npm:mongodb";
import { ID, Empty } from "@utils/types.ts";
import { freshID } from "@utils/database.ts";

// Declare collection prefix, use concept name
const PREFIX = "EventDrafts" + ".";

/**
 * @concept EventDrafts
 * @purpose hold structured events before committing and track validation status
 * @principle after creating a draft, it can be validated and modified before final commitment;
 * a draft transitions from Created → Proposed → Validated (or Conflicted);
 * drafts that are validated can be prepared for calendar commitment;
 * users can attach constraints like buffer times and room requirements;
 * drafts maintain separation from committed calendar events
 * @operational-principle after user creates a draft event with title, time, location, and attendees,
 * the system validates basic constraints (end time after start time, non-empty title);
 * if validation passes, status becomes Proposed;
 * external systems can check for calendar conflicts;
 * if no conflicts, draft is marked Validated;
 * user can then finalize the validated draft for commitment to calendars
 */
export default class EventDraftsConcept {
  // Generic types used within this concept.
  // User: Represents a user ID.
  // DraftEvent: Represents a draft event ID.
  // Tag: Represents a tag ID.

  /**
   * Status represents the current state of a draft event.
   * Invariants:
   * - every DraftEvent has exactly one status
   * - status is one of: Created, Proposed, Validated, Conflicted
   *
   * "Created": Draft was just created, needs validation.
   * "Proposed": Basic validation passed, awaiting conflict check.
   * "Validated": Ready for commitment to calendars.
   * "Conflicted": Validation or conflict check failed.
   */
  type Status = "Created" | "Proposed" | "Validated" | "Conflicted";

  /**
   * Represents a draft event document stored in MongoDB.
   * State: a set of DraftEvent with
   * - a user User
   * - a title String
   * - a startTime DateTime
   * - an endTime DateTime
   * - a location String
   * - attendees Set<String>
   * - tags Set<Tag>
   * - a status Status
   * Invariants:
   * - endTime is after startTime for all drafts
   */
  interface DraftEventDoc {
    _id: ID; // The unique ID for this draft event.
    user: ID; // The ID of the user who owns this draft.
    title: string;
    startTime: Date; // Corresponds to DateTime
    endTime: Date; // Corresponds to DateTime
    location: string;
    attendees: string[]; // Corresponds to Set<String>
    tags: ID[]; // Corresponds to Set<Tag>
    status: Status;
  }

  /**
   * Represents constraints associated with a draft event.
   * State: a set of Constraints with
   * - a draftEvent DraftEvent
   * - a bufferBefore Number // minutes before event
   * - a bufferAfter Number // minutes after event
   * - a requiresRoom Boolean
   * - a virtualLink String? // optional video conferencing link
   * Invariants:
   * - every Constraints belongs to exactly one DraftEvent
   * - buffer times are non-negative
   */
  interface ConstraintsDoc {
    _id: ID; // The ID of the associated DraftEvent, ensuring a 1:1 relationship.
    draftEvent: ID; // Explicit reference to the DraftEvent ID (redundant but can be useful).
    bufferBefore: number; // Minutes before the event.
    bufferAfter: number; // Minutes after the event.
    requiresRoom: boolean;
    virtualLink: string | null; // Optional link for virtual meetings.
  }

  // MongoDB Collections for EventDrafts state.
  draftEvents: Collection<DraftEventDoc>;
  constraints: Collection<ConstraintsDoc>;

  /**
   * Constructs the EventDraftsConcept, initializing MongoDB collections.
   * @param db - The MongoDB database instance.
   */
  constructor(private readonly db: Db) {
    this.draftEvents = this.db.collection(PREFIX + "draftEvents");
    this.constraints = this.db.collection(PREFIX + "constraints");
  }

  /**
   * Creates a new draft event with specified details and default constraints.
   *
   * @param params - Object containing all necessary details for the draft event.
   * @param params.user - The ID of the user creating the draft.
   * @param params.title - The title of the draft event.
   * @param params.startTime - The start time of the event (as a Date object).
   * @param params.endTime - The end time of the event (as a Date object).
   * @param params.location - The physical location of the event.
   * @param params.attendees - An array of attendee IDs (strings).
   * @param params.tags - An array of tag IDs.
   * @returns An object containing the ID of the newly created draft event on success,
   *          or an error object if preconditions are not met or an internal error occurs.
   *
   * @requires `title` is non-empty, `endTime` is after `startTime`.
   * @effects Creates a new draft event with `status: "Created"` and default constraints (zero buffers for `bufferBefore` and `bufferAfter`).
   */
  async create(
    params: {
      user: ID;
      title: string;
      startTime: Date;
      endTime: Date;
      location: string;
      attendees: string[];
      tags: ID[];
    },
  ): Promise<{ draft: ID } | { error: string }> {
    const { user, title, startTime, endTime, location, attendees, tags } =
      params;

    // Requires: title is non-empty
    if (!title.trim()) {
      return { error: "Title cannot be empty." };
    }
    // Requires: endTime is after startTime
    if (endTime <= startTime) {
      return { error: "End time must be after start time." };
    }

    const draftId = freshID();

    const newDraft: DraftEventDoc = {
      _id: draftId,
      user,
      title,
      startTime,
      endTime,
      location,
      attendees,
      tags,
      status: "Created",
    };

    const defaultConstraints: ConstraintsDoc = {
      _id: draftId, // Link constraints to draft event using the same ID for 1:1 mapping
      draftEvent: draftId,
      bufferBefore: 0,
      bufferAfter: 0,
      requiresRoom: false,
      virtualLink: null,
    };

    try {
      await this.draftEvents.insertOne(newDraft);
      await this.constraints.insertOne(defaultConstraints);
      return { draft: draftId };
    } catch (e) {
      console.error("EventDraftsConcept.create - Error creating draft:", e);
      return { error: "Failed to create draft event." };
    }
  }

  /**
   * Validates the basic constraints of a draft event.
   * This includes checking if the title is non-empty and `endTime` is after `startTime`.
   *
   * @param params - Object containing the ID of the draft event to validate.
   * @param params.draft - The ID of the draft event.
   * @returns An object containing the resulting `status` ("Proposed" or "Conflicted") on success,
   *          or an error object if the draft does not exist or an internal error occurs.
   *
   * @requires The `draft` event must exist.
   * @effects Checks basic constraints (time ordering, non-empty title).
   * If valid, the draft's `status` becomes "Proposed"; if invalid, the `status` becomes "Conflicted".
   */
  async validate(
    params: { draft: ID },
  ): Promise<{ status: Status } | { error: string }> {
    const { draft: draftId } = params;

    // Requires: draft exists
    const draft = await this.draftEvents.findOne({ _id: draftId });
    if (!draft) {
      return { error: `Draft event with ID ${draftId} not found.` };
    }

    let newStatus: Status;
    // Check basic constraints: title non-empty, endTime after startTime
    if (!draft.title.trim() || draft.endTime <= draft.startTime) {
      newStatus = "Conflicted";
    } else {
      newStatus = "Proposed";
    }

    try {
      await this.draftEvents.updateOne(
        { _id: draftId },
        { $set: { status: newStatus } },
      );
      return { status: newStatus };
    } catch (e) {
      console.error("EventDraftsConcept.validate - Error validating draft:", e);
      return { error: "Failed to validate draft event." };
    }
  }

  /**
   * Attaches or updates constraints for a specific draft event.
   * Constraints include buffer times, room requirements, and virtual meeting links.
   *
   * @param params - Object containing the draft ID and constraint details.
   * @param params.draft - The ID of the draft event to attach constraints to.
   * @param params.bufferBefore - Buffer time in minutes before the event start.
   * @param params.bufferAfter - Buffer time in minutes after the event end.
   * @param params.requiresRoom - A boolean indicating if the event requires a physical room.
   * @param params.virtualLink - An optional video conferencing link (string or null).
   * @returns An empty object (`{}`) on success, or an error object if preconditions are not met or an internal error occurs.
   *
   * @requires The `draft` event must exist. `bufferBefore` and `bufferAfter` must be non-negative.
   * @effects Updates or creates a `Constraints` document for the specified draft event.
   */
  async attachConstraints(
    params: {
      draft: ID;
      bufferBefore: number;
      bufferAfter: number;
      requiresRoom: boolean;
      virtualLink?: string | null;
    },
  ): Promise<Empty | { error: string }> {
    const { draft: draftId, bufferBefore, bufferAfter, requiresRoom, virtualLink = null } = params;

    // Requires: draft exists
    const draftExists = await this.draftEvents.countDocuments({ _id: draftId });
    if (draftExists === 0) {
      return { error: `Draft event with ID ${draftId} not found.` };
    }

    // Requires: buffer times are non-negative
    if (bufferBefore < 0 || bufferAfter < 0) {
      return { error: "Buffer times cannot be negative." };
    }

    const updatedConstraints: Partial<ConstraintsDoc> = {
      bufferBefore,
      bufferAfter,
      requiresRoom,
      virtualLink,
    };

    try {
      await this.constraints.updateOne(
        { _id: draftId }, // Using draftId as _id for the constraints document
        { $set: updatedConstraints, $setOnInsert: { draftEvent: draftId } }, // Ensure draftEvent ID is set on insert if new
        { upsert: true }, // Create the constraints document if it doesn't exist
      );
      return {};
    } catch (e) {
      console.error(
        "EventDraftsConcept.attachConstraints - Error attaching constraints:",
        e,
      );
      return { error: "Failed to attach or update constraints." };
    }
  }

  /**
   * Updates specific fields of an existing draft event.
   * After any update, the draft's status is reset to "Created" to enforce re-validation.
   *
   * @param params - Object containing the draft ID and the fields to update.
   * @param params.draft - The ID of the draft event to update.
   * @param params.updates - A dictionary where keys are field names (e.g., "title", "startTime") and values are the new values.
   * @returns An empty object (`{}`) on success, or an error object if the draft does not exist,
   *          an invalid field is provided, or an internal error occurs.
   *
   * @requires The `draft` event must exist. `updates` must contain valid field names that are allowed to be updated.
   * @effects Applies updates to the draft fields (`title`, `startTime`, `endTime`, `location`, `attendees`, `tags`).
   * The draft's `status` is reset to "Created" to require re-validation after changes.
   */
  async updateDraft(
    params: { draft: ID; updates: Record<string, any> },
  ): Promise<Empty | { error: string }> {
    const { draft: draftId, updates } = params;

    // Requires: draft exists
    const draft = await this.draftEvents.findOne({ _id: draftId });
    if (!draft) {
      return { error: `Draft event with ID ${draftId} not found.` };
    }

    // Define allowed updateable fields
    const validFields: (keyof DraftEventDoc)[] = [
      "title",
      "startTime",
      "endTime",
      "location",
      "attendees",
      "tags",
    ];
    const updatePayload: Record<string, any> = {};

    for (const key in updates) {
      if (validFields.includes(key as keyof DraftEventDoc)) {
        updatePayload[key] = updates[key];
      } else {
        return { error: `Invalid field for update: ${key}` };
      }
    }

    // Effect: resets status to "Created" to require re-validation
    updatePayload.status = "Created";

    try {
      await this.draftEvents.updateOne(
        { _id: draftId },
        { $set: updatePayload },
      );
      return {};
    } catch (e) {
      console.error("EventDraftsConcept.updateDraft - Error updating draft:", e);
      return { error: "Failed to update draft event." };
    }
  }

  /**
   * Marks a draft event's status as "Validated".
   * This action is typically called after external conflict checking systems confirm no conflicts.
   *
   * @param params - Object containing the ID of the draft event to mark.
   * @param params.draft - The ID of the draft event.
   * @returns An empty object (`{}`) on success, or an error object if the draft does not exist,
   *          its status is not "Proposed", or an internal error occurs.
   *
   * @requires The `draft` event must exist. The draft's `status` must currently be "Proposed".
   * @effects Sets the draft's `status` to "Validated".
   */
  async markValidated(
    params: { draft: ID },
  ): Promise<Empty | { error: string }> {
    const { draft: draftId } = params;

    // Requires: draft exists
    const draft = await this.draftEvents.findOne({ _id: draftId });
    if (!draft) {
      return { error: `Draft event with ID ${draftId} not found.` };
    }

    // Requires: draft status is "Proposed"
    if (draft.status !== "Proposed") {
      return {
        error: `Draft event status must be "Proposed" to be marked as "Validated". Current status: "${draft.status}"`,
      };
    }

    try {
      await this.draftEvents.updateOne(
        { _id: draftId },
        { $set: { status: "Validated" } },
      );
      return {};
    } catch (e) {
      console.error(
        "EventDraftsConcept.markValidated - Error marking draft as validated:",
        e,
      );
      return { error: "Failed to mark draft event as validated." };
    }
  }

  /**
   * Marks a draft event's status as "Conflicted".
   * This action is typically called when external conflict checking systems detect conflicts or
   * if initial validation fails.
   *
   * @param params - Object containing the ID of the draft event to mark.
   * @param params.draft - The ID of the draft event.
   * @returns An empty object (`{}`) on success, or an error object if the draft does not exist or an internal error occurs.
   *
   * @requires The `draft` event must exist.
   * @effects Sets the draft's `status` to "Conflicted".
   */
  async markConflicted(
    params: { draft: ID },
  ): Promise<Empty | { error: string }> {
    const { draft: draftId } = params;

    // Requires: draft exists
    const draftExists = await this.draftEvents.countDocuments({ _id: draftId });
    if (draftExists === 0) {
      return { error: `Draft event with ID ${draftId} not found.` };
    }

    try {
      await this.draftEvents.updateOne(
        { _id: draftId },
        { $set: { status: "Conflicted" } },
      );
      return {};
    } catch (e) {
      console.error(
        "EventDraftsConcept.markConflicted - Error marking draft as conflicted:",
        e,
      );
      return { error: "Failed to mark draft event as conflicted." };
    }
  }

  /**
   * Retrieves all data for a specific draft event and its associated constraints.
   *
   * @param params - Object containing the ID of the draft event to retrieve.
   * @param params.draft - The ID of the draft event.
   * @returns A dictionary containing the draft event data and its constraints on success,
   *          or an error object if the draft does not exist or an internal error occurs.
   *
   * @requires The `draft` event must exist.
   * @effects Returns draft event data, its current status, and associated constraint details.
   */
  async getDraft(
    params: { draft: ID },
  ): Promise<
    | ({
      draft: Omit<DraftEventDoc, "_id"> & { id: ID };
      constraints: Omit<ConstraintsDoc, "_id" | "draftEvent">;
    })
    | { error: string }
  > {
    const { draft: draftId } = params;

    // Requires: draft exists
    const draft = await this.draftEvents.findOne({ _id: draftId });
    if (!draft) {
      return { error: `Draft event with ID ${draftId} not found.` };
    }

    // Retrieve associated constraints (if any)
    const constraints = await this.constraints.findOne({ _id: draftId });

    // Prepare draft data, changing _id to id for API consistency
    const draftData = {
      id: draft._id,
      user: draft.user,
      title: draft.title,
      startTime: draft.startTime,
      endTime: draft.endTime,
      location: draft.location,
      attendees: draft.attendees,
      tags: draft.tags,
      status: draft.status,
    };

    // Prepare constraints data, providing defaults if not found
    const constraintsData = {
      bufferBefore: constraints?.bufferBefore ?? 0,
      bufferAfter: constraints?.bufferAfter ?? 0,
      requiresRoom: constraints?.requiresRoom ?? false,
      virtualLink: constraints?.virtualLink ?? null,
    };

    return { draft: draftData, constraints: constraintsData };
  }

  /**
   * Retrieves all draft event IDs for a specific user.
   *
   * @param params - Object containing the ID of the user.
   * @param params.user - The ID of the user whose drafts are to be retrieved.
   * @returns An object containing an array of draft event IDs (`ID[]`) for the user on success,
   *          or an error object if an internal error occurs.
   *
   * @effects Returns all draft event IDs associated with the specified user.
   */
  async getByUser(
    params: { user: ID },
  ): Promise<{ drafts: ID[] } | { error: string }> {
    const { user } = params;

    try {
      const userDrafts = await this.draftEvents.find(
        { user: user },
        { projection: { _id: 1 } }, // Only retrieve the _id field
      ).toArray();
      const draftIds = userDrafts.map((d) => d._id);
      return { drafts: draftIds };
    } catch (e) {
      console.error(
        "EventDraftsConcept.getByUser - Error getting drafts by user:",
        e,
      );
      return { error: "Failed to retrieve drafts for the user." };
    }
  }

  /**
   * Deletes a draft event and its associated constraints from the system.
   *
   * @param params - Object containing the ID of the draft event to delete.
   * @param params.draft - The ID of the draft event.
   * @returns An empty object (`{}`) on success, or an error object if the draft does not exist or an internal error occurs.
   *
   * @requires The `draft` event must exist.
   * @effects Removes the draft event document and its corresponding constraints document from the state.
   */
  async deleteDraft(
    params: { draft: ID },
  ): Promise<Empty | { error: string }> {
    const { draft: draftId } = params;

    try {
      const deleteDraftResult = await this.draftEvents.deleteOne({
        _id: draftId,
      });

      // Check if the draft event was actually found and deleted
      if (deleteDraftResult.deletedCount === 0) {
        return { error: `Draft event with ID ${draftId} not found.` };
      }

      // Also delete associated constraints, if they exist.
      // We don't check deletedCount for constraints as they are tightly coupled and might not exist if the draft was created without them.
      await this.constraints.deleteOne({ _id: draftId });

      return {};
    } catch (e) {
      console.error(
        "EventDraftsConcept.deleteDraft - Error deleting draft:",
        e,
      );
      return { error: "Failed to delete draft event and its constraints." };
    }
  }
}
```