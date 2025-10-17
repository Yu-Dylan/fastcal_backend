# CalendarSync Design Changes

## Changes from Assignment 2

### 1. Mock Implementation for Phase 1
Original: Full integration with Google Calendar API, Outlook Graph API, etc.
Changed: Mock/stub implementation simulating provider APIs
Reason: External API integration is complex, requires OAuth setup, API keys. Focus on concept structure first.

### 2. Simplified Conflict Detection
Original: Complex conflict detection with attendee availability checking
Changed: Time overlap and buffer violation checking only
Reason: Attendee availability requires access to other users' calendars, which is complex. Core conflict detection sufficient for now.

### 3. Provider Enum
Original: Open-ended provider support
Changed: Fixed enum of 4 providers: google, outlook, apple, zoom
Reason: Covers most common use cases, easier to type-check and test

### 4. Reschedule Ranking Algorithm
Original: Multi-factor ranking with ML-based preference learning
Changed: Simple heuristic ranking (proximity to original time, time-of-day similarity)
Reason: Sufficient for demonstrating the concept, complex ranking can be added later

### 5. Bidirectional Sync Deferred
Original: Full bidirectional sync (detect provider-side changes)
Changed: One-way sync (FastCal → providers) with notes for future enhancement
Reason: Bidirectional sync requires webhooks, polling, and conflict resolution. Too complex for initial implementation.