# prompt: implement IntentParser concept

[@implementing-concepts](../../background/implementing-concepts.md)

[@IntentParser specification](IntentParser.md)

Please implement the IntentParser concept following the specification above and the implementation guidelines.

Key requirements:
- Use MongoDB collections with PREFIX namespace separation
- Define internal types: ParsedEvent, DraftEvent (nested structure, not separate collection)
- For the AI parsing, create a **mock/stub implementation** that uses rule-based parsing (no actual LLM integration yet)
  - Comment where real LLM API call would go
  - Mock should handle common patterns: "tomorrow at 3pm", "next Tuesday", "meeting with X"
  - Return confidence scores based on how many fields were successfully extracted
- parseManually should use simpler rule-based extraction
- Store alternatives as array in ParsedEvent document
- Use proper TypeScript types with ID type from @utils/types.ts
- Include clear JSDoc comments explaining the mock vs real implementation
- Handle error cases appropriately

The concept should export a class with all actions as methods.

Note: Real LLM integration will be added in a future assignment. For now, focus on the concept structure and a working mock implementation.

# response:

```typescript
import { Collection, Db } from "npm:mongodb";
import { ID, Empty } from "@utils/types.ts";
import { freshID } from "@utils/database.ts";

// Declare collection prefix, use concept name
const PREFIX = "IntentParser" + ".";

/**
 * @concept IntentParser [User]
 * @purpose convert natural language scheduling messages into structured calendar event data,
 * with AI assistance to handle ambiguous, casual, and incomplete scheduling language
 *
 * @principle after parsing a natural language utterance (e.g., "let's meet next Tuesday at 3 in 32-123"),
 * an LLM analyzes the text with contextual information (current date, timezone, user preferences)
 * to extract structured event information (title, date/time, location, participants);
 * the system provides multiple interpretations when ambiguous, with confidence scores;
 * the parser never writes directly to calendars, only produces structured data;
 * users can fall back to manual parsing if AI fails or confidence is too low
 *
 * @operational_principle after user provides utterance and context,
 * the LLM extracts event details considering natural language patterns, relative dates,
 * implicit information, and common scheduling conventions;
 * if confidence is high (≥ 0.8), a single draft is presented;
 * if confidence is medium (0.5-0.8), multiple alternatives are provided;
 * if confidence is low (< 0.5), the system requests clarification or falls back to manual parsing;
 * user confirms the selected interpretation before any calendar commitment
 */

// Generic types of this concept
type User = ID;
type Person = string; // Using string for simplicity, could be ID if Person was a concept
type Tag = string; // Using string for simplicity, could be ID if Tag was a concept

/**
 * Defines the method used for parsing the event.
 */
type ParsingMethod = "AI" | "Manual";

/**
 * Represents a structured calendar event draft, extracted from an utterance.
 * @state
 * where DraftEvent has
 *     a title String
 *     a startTime DateTime
 *     an endTime DateTime
 *     participants Set<Person>
 *     a location String // physical location or virtual link
 *     tags Set<Tag> // event type: meeting, class, appointment, etc.
 *     a confidence Float // confidence for this specific interpretation
 */
export interface DraftEvent {
  title: string;
  startTime: Date;
  endTime: Date;
  participants: Set<Person>;
  location: string;
  tags: Set<Tag>;
  confidence: number;
}

/**
 * Represents a parsed event attempt, including the original utterance,
 * the primary interpretation, alternative interpretations, and metadata.
 * @state
 * a set of ParsedEvent with
 * a user User
 * an utterance String // original natural language input
 * a draftEvent DraftEvent // primary structured event data
 * alternatives List<DraftEvent> // alternative interpretations
 * a confidence Float // confidence score 0.0-1.0
 * a context Map<String,Any> // current date, timezone, user calendar, preferences
 * a parsingMethod Enum<AI, Manual> // how this was parsed
 */
export interface ParsedEvent {
  _id: ID;
  user: User;
  utterance: string; // original natural language input
  draftEvent: DraftEvent; // primary structured event data
  alternatives: DraftEvent[]; // alternative interpretations
  confidence: number; // confidence score 0.0-1.0 for the whole ParsedEvent
  context: Record<string, any>; // current date, timezone, user calendar, preferences
  parsingMethod: ParsingMethod; // how this was parsed
}

/**
 * @invariants
 *     confidence is between 0.0 and 1.0
 *     draftEvent.endTime is after draftEvent.startTime
 *     every ParsedEvent belongs to exactly one user
 *     alternatives are sorted by confidence (highest first)
 *     if parsingMethod is AI, confidence reflects LLM certainty
 */
export default class IntentParserConcept {
  parsedEvents: Collection<ParsedEvent>;

  constructor(private readonly db: Db) {
    this.parsedEvents = this.db.collection(PREFIX + "parsedEvents");
  }

  /**
   * Helper function for mock LLM parsing.
   * This function simulates an LLM's capability to extract event details from natural language.
   * It uses simple rule-based matching for common patterns.
   *
   * @param utterance The natural language input.
   * @param context Contextual information (currentDate, timezone).
   * @param existingDraft An optional DraftEvent to refine (for `refineWithAI`).
   * @returns An object containing `draftEvent`, `alternatives`, and `confidence` (for the overall parsing).
   */
  private _mockLLMParse(
    utterance: string,
    context: Record<string, any>,
    existingDraft?: DraftEvent,
  ): { draftEvent: DraftEvent; alternatives: DraftEvent[]; confidence: number } {
    const currentDate = context.currentDate
      ? new Date(context.currentDate)
      : new Date();
    const timezone = context.timezone || "America/New_York"; // Default timezone

    let title: string = existingDraft?.title || "Meeting";
    let startTime: Date = existingDraft?.startTime || new Date(currentDate);
    let endTime: Date = existingDraft?.endTime || new Date(startTime.getTime() + 60 * 60 * 1000); // Default 1 hour
    let participants: Set<Person> = existingDraft?.participants || new Set();
    let location: string = existingDraft?.location || "";
    let tags: Set<Tag> = existingDraft?.tags || new Set();
    let draftConfidence: number = existingDraft?.confidence || 0.1; // Confidence for the draft itself

    let overallConfidence = 0.1; // Base confidence

    const lowerUtterance = utterance.toLowerCase();

    // -- Title Extraction --
    const titleMatch = lowerUtterance.match(/(?:meeting|call|sync|lunch|dinner|coffee|chat|event|appointment)\s*(?:with|about|for)?\s*([\w\s'-]+)?/i);
    if (titleMatch && titleMatch[0].length > 5) { // Ensure it's not just a keyword
      title = utterance.substring(0, Math.min(utterance.length, 50)); // Take first part of utterance as title
      overallConfidence += 0.2;
    } else {
      title = existingDraft?.title || "Event";
    }

    // -- Date & Time Extraction --
    let tempStartTime = new Date(startTime); // Start from existing or current date
    let tempEndTime = new Date(endTime);

    const today = new Date(currentDate);
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(today.getDate() + 1);
    const nextWeek = new Date(today);
    nextWeek.setDate(today.getDate() + 7);

    // Relative dates
    if (lowerUtterance.includes("tomorrow")) {
      tempStartTime.setDate(tomorrow.getDate());
      tempStartTime.setMonth(tomorrow.getMonth());
      tempStartTime.setFullYear(tomorrow.getFullYear());
      overallConfidence += 0.2;
    } else if (lowerUtterance.includes("next tuesday")) {
      let day = new Date(currentDate);
      while (day.getDay() !== 2) { // 2 for Tuesday
        day.setDate(day.getDate() + 1);
      }
      tempStartTime.setDate(day.getDate());
      tempStartTime.setMonth(day.getMonth());
      tempStartTime.setFullYear(day.getFullYear());
      overallConfidence += 0.2;
    }

    // Time extraction (e.g., "at 3pm", "15:00")
    const timeMatch = lowerUtterance.match(/at\s*(\d{1,2}(?::\d{2})?\s*(?:am|pm)?)|(\d{1,2}:\d{2})/i);
    if (timeMatch) {
      let timeStr = timeMatch[1] || timeMatch[2];
      let hours = 0;
      let minutes = 0;

      const hourMatch = timeStr.match(/(\d{1,2})/);
      if (hourMatch) hours = parseInt(hourMatch[1], 10);

      const minuteMatch = timeStr.match(/:(\d{2})/);
      if (minuteMatch) minutes = parseInt(minuteMatch[1], 10);

      if (timeStr.toLowerCase().includes("pm") && hours < 12) hours += 12;
      if (timeStr.toLowerCase().includes("am") && hours === 12) hours = 0; // Midnight 12 AM

      tempStartTime.setHours(hours, minutes, 0, 0);
      overallConfidence += 0.2;
      // Default duration is 1 hour
      tempEndTime = new Date(tempStartTime.getTime() + 60 * 60 * 1000);
    } else {
      // If no explicit time, try to infer default times for events like "lunch"
      if (lowerUtterance.includes("lunch")) {
        tempStartTime.setHours(12, 0, 0, 0);
        tempEndTime = new Date(tempStartTime.getTime() + 60 * 60 * 1000); // 1 hour
        overallConfidence += 0.1;
      }
    }

    // Refinement for duration, e.g., "30 minutes longer"
    const durationRefineMatch = userFeedback.match(/(\d+)\s*minutes?\s*(longer|shorter)/i);
    if (durationRefineMatch && existingDraft) {
      const durationChange = parseInt(durationRefineMatch[1], 10) * 60 * 1000; // milliseconds
      if (durationRefineMatch[2] === "longer") {
        tempEndTime = new Date(existingDraft.endTime.getTime() + durationChange);
      } else {
        tempEndTime = new Date(existingDraft.endTime.getTime() - durationChange);
      }
      overallConfidence += 0.1;
    }


    // Ensure end time is after start time
    if (tempEndTime <= tempStartTime) {
      tempEndTime = new Date(tempStartTime.getTime() + 60 * 60 * 1000); // default to 1 hour
    }
    startTime = tempStartTime;
    endTime = tempEndTime;

    // -- Participant Extraction --
    const participantMatch = utterance.match(/(?:with|and)\s+([A-Z][a-z]+(?:(?:\s+and|\s*,\s*)[A-Z][a-z]+)*)/i);
    if (participantMatch && participantMatch[1]) {
      const names = participantMatch[1].split(/\s+(?:and|,)\s+/).map(name => name.trim());
      names.forEach(name => participants.add(name));
      overallConfidence += 0.1 * names.length;
    }

    // -- Location Extraction --
    const locationMatch = utterance.match(/(?:in|at)\s+([\w\d\s.-]+(?:room|building|zoom|meet|office|cafe|restaurant|library)?)/i);
    if (locationMatch && locationMatch[1]) {
      location = locationMatch[1].trim();
      if (location.toLowerCase().includes("zoom") || location.toLowerCase().includes("meet")) {
        tags.add("virtual");
      } else {
        tags.add("physical");
      }
      overallConfidence += 0.1;
    }

    // Clamp overall confidence between 0.0 and 1.0
    overallConfidence = Math.max(0.0, Math.min(1.0, overallConfidence));
    draftConfidence = overallConfidence; // For mock, draft confidence equals overall confidence

    const draft: DraftEvent = {
      title: title || "Event",
      startTime,
      endTime,
      participants,
      location,
      tags,
      confidence: draftConfidence,
    };

    // For mock, generate a simple alternative if confidence is not perfect
    const alternatives: DraftEvent[] = [];
    if (overallConfidence < 0.9 && !existingDraft) {
      const alternativeStartTime = new Date(startTime.getTime() + 30 * 60 * 1000); // 30 min later
      const alternativeEndTime = new Date(alternativeStartTime.getTime() + (endTime.getTime() - startTime.getTime()));
      alternatives.push({
        ...draft,
        title: `${draft.title} (Alternative)`,
        startTime: alternativeStartTime,
        endTime: alternativeEndTime,
        confidence: Math.max(0.1, draftConfidence - 0.1),
      });

      const alternativeLocation = draft.location ? `${draft.location} (nearby)` : "Unspecified location";
      alternatives.push({
        ...draft,
        location: alternativeLocation,
        confidence: Math.max(0.1, draftConfidence - 0.2),
      });
      // Sort alternatives by confidence
      alternatives.sort((a, b) => b.confidence - a.confidence);
    }


    return {
      draftEvent: draft,
      alternatives,
      confidence: overallConfidence,
    };
  }

  /**
   * @action parseWithAI
   * @purpose uses an AI (mock LLM) to analyze a natural language utterance
   * and extract structured calendar event data.
   *
   * @param params An object containing:
   *   - `user`: The ID of the user performing the parsing.
   *   - `utterance`: The natural language input from the user.
   *   - `context`: A dictionary containing contextual information (e.g., `currentDate`, `timezone`).
   *
   * @returns A `ParsedEvent` object with AI-generated draft, alternatives, and confidence.
   *          Returns `{ error: string }` if input is invalid or mock LLM fails.
   *
   * @requires `utterance` is non-empty, `context` includes `currentDate` and `timezone`.
   * @effects A new `ParsedEvent` document is created in the `parsedEvents` collection.
   * @note This is a mock implementation. A real LLM API call would replace `_mockLLMParse`.
   */
  async parseWithAI(
    { user, utterance, context }: {
      user: User;
      utterance: string;
      context: Record<string, any>;
    },
  ): Promise<ParsedEvent | { error: string }> {
    if (!utterance || utterance.trim() === "") {
      return { error: "Utterance cannot be empty." };
    }
    if (!context || !context.currentDate || !context.timezone) {
      return { error: "Context must include currentDate and timezone." };
    }

    try {
      // --- MOCK LLM INTEGRATION POINT ---
      // In a real implementation, this would involve an API call to an LLM.
      // For now, we use a rule-based mock.
      const { draftEvent, alternatives, confidence } = this._mockLLMParse(
        utterance,
        context,
      );
      // --- END MOCK INTEGRATION ---

      const newParsedEvent: ParsedEvent = {
        _id: freshID(),
        user,
        utterance,
        draftEvent,
        alternatives,
        confidence,
        context,
        parsingMethod: "AI",
      };

      await this.parsedEvents.insertOne(newParsedEvent);
      return newParsedEvent;
    } catch (e: any) {
      console.error("Error during AI parsing:", e);
      // For now, if mock LLM fails (e.g., due to unexpected input), return an error.
      // The spec note mentions throwing an error, but for normal errors, we return a record.
      return { error: `AI parsing failed: ${e.message}` };
    }
  }

  /**
   * @action parseManually
   * @purpose Provides a fallback method for parsing structured event data
   * when AI parsing fails or the user prefers manual control.
   * Uses simpler rule-based parsing.
   *
   * @param params An object containing:
   *   - `user`: The ID of the user performing the parsing.
   *   - `utterance`: The natural language input from the user.
   *   - `context`: A dictionary containing contextual information.
   *
   * @returns A `ParsedEvent` object with manually-generated draft and confidence.
   *          Returns `{ error: string }` if input is invalid.
   *
   * @requires `utterance` is non-empty.
   * @effects A new `ParsedEvent` document is created in the `parsedEvents` collection.
   * @note This method might require additional user input for ambiguous cases in a real UI,
   *       but here it performs basic rule-based extraction.
   */
  async parseManually(
    { user, utterance, context }: {
      user: User;
      utterance: string;
      context: Record<string, any>;
    },
  ): Promise<ParsedEvent | { error: string }> {
    if (!utterance || utterance.trim() === "") {
      return { error: "Utterance cannot be empty." };
    }

    const currentDate = context.currentDate
      ? new Date(context.currentDate)
      : new Date();

    let title = "Manual Event";
    let startTime = new Date(currentDate);
    startTime.setHours(new Date().getHours() + 1, 0, 0, 0); // Default to 1 hour from now
    let endTime = new Date(startTime.getTime() + 60 * 60 * 1000); // 1 hour duration
    let participants = new Set<Person>();
    let location = "";
    let tags = new Set<Tag>();
    let confidence = 0.7; // Manual parsing starts with decent confidence if basic info found

    const lowerUtterance = utterance.toLowerCase();

    // Basic title extraction
    if (utterance.length > 5 && utterance.length < 100) {
      title = utterance;
    }

    // Basic time extraction (e.g., "at 3pm")
    const timeMatch = lowerUtterance.match(/at\s*(\d{1,2}(?::\d{2})?\s*(?:am|pm)?)|(\d{1,2}:\d{2})/i);
    if (timeMatch) {
      let timeStr = timeMatch[1] || timeMatch[2];
      let hours = 0;
      let minutes = 0;

      const hourMatch = timeStr.match(/(\d{1,2})/);
      if (hourMatch) hours = parseInt(hourMatch[1], 10);

      const minuteMatch = timeStr.match(/:(\d{2})/);
      if (minuteMatch) minutes = parseInt(minuteMatch[1], 10);

      if (timeStr.toLowerCase().includes("pm") && hours < 12) hours += 12;
      if (timeStr.toLowerCase().includes("am") && hours === 12) hours = 0;

      startTime.setHours(hours, minutes, 0, 0);
      endTime = new Date(startTime.getTime() + 60 * 60 * 1000); // Default 1 hour
    }

    // Basic participant extraction
    const withMatch = utterance.match(/(?:with)\s+([A-Z][a-z]+(?:(?:\s+and|\s*,\s*)[A-Z][a-z]+)*)/i);
    if (withMatch && withMatch[1]) {
      const names = withMatch[1].split(/\s+(?:and|,)\s+/).map(name => name.trim());
      names.forEach(name => participants.add(name));
    }

    // Basic location extraction
    const inMatch = utterance.match(/(?:in|at)\s+([\w\d\s.-]+)/i);
    if (inMatch && inMatch[1]) {
      location = inMatch[1].trim();
    }

    const draftEvent: DraftEvent = {
      title,
      startTime,
      endTime,
      participants,
      location,
      tags,
      confidence: confidence, // Confidence for the draft itself
    };

    const newParsedEvent: ParsedEvent = {
      _id: freshID(),
      user,
      utterance,
      draftEvent,
      alternatives: [], // Manual parsing usually doesn't generate alternatives by default
      confidence: confidence, // Overall confidence
      context,
      parsingMethod: "Manual",
    };

    await this.parsedEvents.insertOne(newParsedEvent);
    return newParsedEvent;
  }

  /**
   * @action accept
   * @purpose Confirms a selected draft event from a `ParsedEvent` for further processing.
   * This typically means the user has reviewed and approved one of the interpretations.
   *
   * @param params An object containing:
   *   - `user`: The ID of the user.
   *   - `parsed`: The `ParsedEvent` object that was previously created.
   *   - `selectedDraft`: The specific `DraftEvent` from `parsed.draftEvent` or `parsed.alternatives`
   *                      that the user has chosen.
   *
   * @returns The confirmed `DraftEvent` object.
   *          Returns `{ error: string }` if the `ParsedEvent` is not found for the user
   *          or `selectedDraft` does not match one of the drafts in `parsed`.
   *
   * @requires `parsed` exists for the given `user`.
   * @effects The `ParsedEvent` document is removed from the `parsedEvents` collection.
   *          The chosen `selectedDraft` is returned for subsequent actions (e.g., creating a calendar event).
   */
  async accept(
    { user, parsed, selectedDraft }: {
      user: User;
      parsed: ParsedEvent;
      selectedDraft: DraftEvent;
    },
  ): Promise<DraftEvent | { error: string }> {
    const existingParsed = await this.parsedEvents.findOne({ _id: parsed._id, user });

    if (!existingParsed) {
      return { error: `ParsedEvent with ID ${parsed._id} not found for user ${user}.` };
    }

    // A simple check to ensure selectedDraft is one of the valid options (primary or alternatives)
    const isPrimaryDraft = JSON.stringify(existingParsed.draftEvent) === JSON.stringify(selectedDraft);
    const isAlternativeDraft = existingParsed.alternatives.some(alt => JSON.stringify(alt) === JSON.stringify(selectedDraft));

    if (!isPrimaryDraft && !isAlternativeDraft) {
      return { error: "Selected draft does not match any interpretation in the ParsedEvent." };
    }

    await this.parsedEvents.deleteOne({ _id: parsed._id, user });
    return selectedDraft;
  }

  /**
   * @action reject
   * @purpose Removes a `ParsedEvent` from the state without creating an event.
   * This typically happens if the user dismisses all interpretations.
   *
   * @param params An object containing:
   *   - `user`: The ID of the user.
   *   - `parsed`: The `ParsedEvent` object to be rejected.
   *
   * @returns An empty object `{}` on success.
   *          Returns `{ error: string }` if the `ParsedEvent` is not found for the user.
   *
   * @requires `parsed` exists for the given `user`.
   * @effects The `ParsedEvent` document is removed from the `parsedEvents` collection.
   */
  async reject(
    { user, parsed }: { user: User; parsed: ParsedEvent },
  ): Promise<Empty | { error: string }> {
    const result = await this.parsedEvents.deleteOne({ _id: parsed._id, user });

    if (result.deletedCount === 0) {
      return { error: `ParsedEvent with ID ${parsed._id} not found for user ${user}.` };
    }
    return {};
  }

  /**
   * @query _getAlternatives
   * @purpose Retrieves the alternative interpretations for a given `ParsedEvent`.
   *
   * @param params An object containing:
   *   - `user`: The ID of the user.
   *   - `parsed`: The `ParsedEvent` for which to retrieve alternatives.
   *
   * @returns A `List<DraftEvent>` (array) of alternative interpretations,
   *          sorted by confidence (highest first).
   *          Returns `{ error: string }` if the `ParsedEvent` is not found for the user.
   *
   * @requires `parsed` exists for the given `user`.
   * @effects None (query method).
   */
  async _getAlternatives(
    { user, parsed }: { user: User; parsed: ParsedEvent },
  ): Promise<DraftEvent[] | { error: string }> {
    const existingParsed = await this.parsedEvents.findOne({ _id: parsed._id, user });

    if (!existingParsed) {
      return { error: `ParsedEvent with ID ${parsed._id} not found for user ${user}.` };
    }

    // Invariants: alternatives are sorted by confidence (highest first)
    // The mock parser already handles this, but we ensure it here too.
    return existingParsed.alternatives.sort((a, b) => b.confidence - a.confidence);
  }

  /**
   * @action refineWithAI
   * @purpose Uses the AI (mock LLM) to refine an existing `ParsedEvent`'s
   * draft interpretation based on additional user feedback.
   *
   * @param params An object containing:
   *   - `user`: The ID of the user.
   *   - `parsed`: The `ParsedEvent` object to be refined.
   *   - `userFeedback`: Additional natural language input from the user (e.g., "make it 30 minutes longer").
   *
   * @returns The updated `ParsedEvent` object.
   *          Returns `{ error: string }` if the `ParsedEvent` is not found,
   *          `userFeedback` is empty, or refinement fails.
   *
   * @requires `parsed` exists for the given `user`, `userFeedback` is non-empty.
   * @effects The `ParsedEvent` document in the `parsedEvents` collection is updated
   *          with the refined `draftEvent`, new `alternatives`, and `confidence`.
   * @note This is a mock implementation. A real LLM API call would replace `_mockLLMParse`.
   */
  async refineWithAI(
    { user, parsed, userFeedback }: {
      user: User;
      parsed: ParsedEvent;
      userFeedback: string;
    },
  ): Promise<ParsedEvent | { error: string }> {
    if (!userFeedback || userFeedback.trim() === "") {
      return { error: "User feedback cannot be empty." };
    }

    const existingParsed = await this.parsedEvents.findOne({ _id: parsed._id, user });

    if (!existingParsed) {
      return { error: `ParsedEvent with ID ${parsed._id} not found for user ${user}.` };
    }

    try {
      // Combine original utterance with feedback for LLM refinement
      const combinedUtterance = `${existingParsed.utterance}. Refine: ${userFeedback}`;

      // --- MOCK LLM INTEGRATION POINT FOR REFINEMENT ---
      const { draftEvent, alternatives, confidence } = this._mockLLMParse(
        combinedUtterance,
        existingParsed.context,
        existingParsed.draftEvent, // Pass existing draft for refinement context
      );
      // --- END MOCK INTEGRATION ---

      const updatedParsedEvent: ParsedEvent = {
        ...existingParsed,
        utterance: combinedUtterance, // Update utterance to reflect feedback for traceability
        draftEvent,
        alternatives,
        confidence,
        parsingMethod: "AI", // Refinement typically uses AI
      };

      await this.parsedEvents.replaceOne(
        { _id: parsed._id, user },
        updatedParsedEvent,
      );

      return updatedParsedEvent;
    } catch (e: any) {
      console.error("Error during AI refinement:", e);
      return { error: `AI refinement failed: ${e.message}` };
    }
  }
}
```