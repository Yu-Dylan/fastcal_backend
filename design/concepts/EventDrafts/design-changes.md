# EventDrafts Design Changes

## Changes from Assignment 2

### 1. Simplified Status Transitions
Original: Had complex validation flow with multiple states
Changed: Streamlined to four clear states: Created, Proposed, Validated, Conflicted
Reason: Simpler state machine is easier to implement and test while maintaining necessary workflow

### 2. Constraints as Separate State
Original: Constraints were embedded in draft events
Changed: Constraints stored separately with relationship to DraftEvent
Reason: Follows concept design principle of clear state separation and allows constraints to be optional

### 3. Attendees as String Set
Original: Used Person type from external concept
Changed: Used Set<String> for attendees (email addresses or names)
Reason: Maintains concept independence - no dependency on User/Person concept

### 4. Added updateDraft Action
Original: Had separate actions for updating each field
Changed: Single updateDraft action with Map<String,Any> for updates
Reason: More flexible API, reduces action count, common pattern for updates

### 5. Tags Integrated into Draft
Original: Tags were external associations
Changed: Tags are part of the DraftEvent state
Reason: Tags are essential for reminder policy selection and event categorization