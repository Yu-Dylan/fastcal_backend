# FastCal Backend - Application Design

## Overview

FastCal is a natural language calendar assistant that integrates with Google Calendar. Users interact through conversational chat to create, search, and manage calendar events using everyday language. The system uses Gemini AI for intent parsing and semantic search, with Google Calendar as the source of truth for event storage.

## Concept Architecture

The application consists of 4 independent concepts:

1. **IntentParser** - Converts natural language utterances into structured event data using Gemini AI, with support for create/edit/delete/query/search intents
2. **EventDrafts** - Manages draft events as temporary staging before Google Calendar sync
3. **CalendarSync** - Full Google Calendar OAuth 2.0 integration with bidirectional sync (create, read, delete)
4. **ReminderPolicy** - Generates personalized reminders based on event tags and learned user behavior (not yet integrated)

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

### Full External API Integration

**Decision**: Implement real Gemini AI and Google Calendar API integration instead of mocks.

**Implementation**:
- **IntentParser**: Uses Gemini 2.5 Flash for natural language understanding
  - Parses create/edit/delete/query/search intents
  - Extracts structured event data (title, time, location, participants)
  - Performs semantic search over existing events
  - Supports custom time frame parsing (e.g., "next week", "in December")
- **CalendarSync**: Full Google Calendar OAuth 2.0 flow
  - OAuth authorization URL generation
  - Token exchange and storage in MongoDB
  - Create, read, delete operations via Google Calendar API
  - 30-day default search window (configurable via user queries)

**Rationale**:
- Natural language interaction is core to the user experience
- Google Calendar integration makes the app immediately useful
- Real API integration validates the concept design under production conditions
- Demonstrates end-to-end functionality

### Google Calendar as Source of Truth

**Design**: Google Calendar is the authoritative source for event data, with local drafts as temporary staging.

**Flow**:
1. User creates event via chat → IntentParser parses → EventDrafts creates local draft
2. User accepts → CalendarSync syncs to Google Calendar → Local draft deleted
3. Calendar view shows only Google Calendar events (blue bars)
4. Search/delete operations work directly on Google Calendar data
5. Local drafts are hidden from UI to avoid duplicate display

**Rationale**:
- Users expect their calendar to be in Google Calendar
- Avoids sync conflicts and duplicate event issues
- Simplifies the data model (single source of truth)
- Local drafts serve only as temporary staging during creation flow

## Interesting Moments

### Semantic Search Implementation

**Challenge**: How to enable users to find events using natural language queries like "all lunches" or "meetings with John"?

**Solution**: Pass all Google Calendar events to Gemini along with the search query. Gemini analyzes the events semantically and returns the IDs of matching events. This enables:
- Fuzzy matching (e.g., "lunches" matches "Lunch with John", "Team Lunch")
- Semantic understanding (e.g., "meetings with John" finds events with John as participant or in title)
- Time frame parsing (e.g., "events next week" automatically filters by date range)

**Result**: Users can search their calendar conversationally without learning query syntax.

### Duplicate Event Problem

**Challenge**: Events were appearing twice - once as local drafts (green) and once from Google Calendar (blue).

**Solution**: Hide local drafts from the UI entirely. Google Calendar is the source of truth. Local drafts exist only as temporary staging during the create flow, then are immediately deleted after sync.

**Result**: Clean, single-source-of-truth calendar view with no duplicates.

### OAuth Callback Flow

**Challenge**: How to handle the OAuth redirect back to the app and store tokens?

**Solution**: Created a simple HTML page at `/api/CalendarSync/oauth/callback` that:
1. Extracts the authorization code from URL params
2. Calls the backend to exchange code for tokens
3. Redirects back to the main app with `?auth=success` param
4. Main app detects the param and sets localStorage flag

**Result**: Seamless OAuth flow with proper token storage and authentication state management.

## Implementation Approach

### Concept Independence

Each concept:
- Uses its own MongoDB collections with namespace prefixes
- Defines all types using primitive values or IDs (no composite objects in action signatures)
- Has no dependencies on other concepts
- Can be implemented and tested in isolation

### Database Strategy

- Single MongoDB database with collection-per-concept namespacing
- ID generation using UUID v7 for sortable, unique identifiers
- DateTime stored as native JavaScript Date objects
- OAuth tokens stored in CalendarSync accounts collection with expiry tracking

### Frontend Architecture

- Vue 3 with Pinia for state management
- TailwindCSS for styling (dark ChatGPT-like theme)
- Axios for API calls
- Event-driven communication between components (CustomEvents for calendar refresh/filter)
- localStorage for authentication state persistence

### API Integration

- **Gemini AI**: Direct API calls via `npm:@google/genai` package
- **Google Calendar**: REST API with OAuth 2.0 bearer token authentication
- Environment variables for API keys and secrets
- Error handling with graceful fallbacks

## Future Work

- **Edit functionality**: Currently only create and delete are implemented
- **ReminderPolicy integration**: Connect reminder generation to calendar events
- **Multi-calendar support**: Allow users to connect multiple Google accounts
- **Recurring events**: Support for repeating events
- **Event updates**: Detect and handle changes to events in Google Calendar
- **Conflict detection**: Warn users about overlapping events
- **Time zone handling**: Better support for events across time zones

## Lessons Learned

1. **Start with real APIs early**: Mocking would have delayed discovering OAuth flow complexities
2. **Single source of truth is crucial**: The duplicate event problem taught us to commit to one authoritative data source
3. **Semantic search is powerful**: Gemini's ability to understand event context enables much more natural search than keyword matching
4. **Delays matter**: Google Calendar API needs time to propagate changes; adding 1-2 second delays before refresh prevents race conditions
5. **Event-driven UI updates**: Using CustomEvents for cross-component communication keeps components decoupled while enabling reactive updates