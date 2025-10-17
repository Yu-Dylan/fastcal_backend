# FastCal Backend - Application Design

## Overview

FastCal converts natural language scheduling messages into structured, conflict-free calendar events with smart reminders across multiple calendar providers.

## Concept Architecture

The application consists of 4 independent concepts:

1. **IntentParser** - Converts natural language utterances into structured event data
2. **EventDrafts** - Manages draft events through validation workflow (Created → Proposed → Validated)
3. **ReminderPolicy** - Generates personalized reminders based on event tags and learned user behavior
4. **CalendarSync** - Commits events to external providers (Google, Outlook, etc.) and detects conflicts

## Design Changes from Assignment 2

### Concept Synchronizations Simplified

**Original synchronizations**:
- Complex multi-step workflows with tight coupling between concepts
- Some synchronizations required concepts to query each other's state

**Changed to**:
- Looser coupling through data passing (not direct concept calls)
- Application layer orchestrates concept interactions
- Each concept maintains full independence

**Rationale**: Concept independence is crucial for modularity and testability. Synchronizations should be implemented at the application layer, not within concepts.

### Mock Implementations for Phase 1

**Decision**: Implement IntentParser and CalendarSync with mock/stub implementations instead of full external API integration.

**Rationale**:
- Focus on concept structure and state management first
- External API integration (LLM, calendar providers) is complex and can be added incrementally
- Allows complete testing without external dependencies
- Demonstrates concept design principles without implementation complexity

### Tag-Based Integration

**Design**: Tags serve as the primary integration point between EventDrafts and ReminderPolicy.

**Flow**:
1. IntentParser extracts event type tags from natural language
2. EventDrafts stores tags with draft events
3. ReminderPolicy uses tags to select appropriate policies
4. Tags like "class", "meeting", "appointment" drive different reminder strategies

## Interesting Moments

None yet.

## Implementation Approach

### Concept Independence

Each concept:
- Uses its own MongoDB collections with namespace prefixes
- Defines all types using primitive values or IDs (no composite objects in action signatures)
- Has no dependencies on other concepts
- Can be implemented and tested in isolation

### Database Strategy

- Single MongoDB database with collection-per-concept namespacing
- Test database created fresh for each test run (all collections dropped)
- ID generation using UUID v7 for sortable, unique identifiers
- DateTime stored as native JavaScript Date objects

### Testing Strategy

Each concept has:
- 1 operational principle test (happy path)
- 3-5 interesting scenario tests (edge cases, errors, complex flows)
- Programmatic assertions (assertEquals, etc.)
- Human-readable console output
- No manual state setup (only use concept actions)

## Future Work

None yet.

## Lessons Learned

None yet.