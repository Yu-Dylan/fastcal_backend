<concept_spec>
concept EventDrafts [User, DraftEvent]

purpose
    hold structured events before committing and track validation status

principle
    after creating a draft, it can be validated and modified before final commitment;
    a draft transitions from Created → Proposed → Validated (or Conflicted);
    drafts that are validated can be prepared for calendar commitment;
    users can attach constraints like buffer times and room requirements;
    drafts maintain separation from committed calendar events

operational principle
    after user creates a draft event with title, time, location, and attendees,
    the system validates basic constraints (end time after start time, non-empty title);
    if validation passes, status becomes Proposed;
    external systems can check for calendar conflicts;
    if no conflicts, draft is marked Validated;
    user can then finalize the validated draft for commitment to calendars

state
    a set of DraftEvent with
        a user User
        a title String
        a startTime DateTime
        an endTime DateTime
        a location String
        attendees Set<String>
        tags Set<Tag>
        a status Status // "Created", "Proposed", "Validated", "Conflicted"
    
    a set of Constraints with
        a draftEvent DraftEvent
        a bufferBefore Number // minutes before event
        a bufferAfter Number // minutes after event
        a requiresRoom Boolean
        a virtualLink String? // optional video conferencing link

    invariants
        every DraftEvent has exactly one status
        status is one of: Created, Proposed, Validated, Conflicted
        endTime is after startTime for all drafts
        every Constraints belongs to exactly one DraftEvent
        buffer times are non-negative

actions
    create(user: User, title: String, startTime: DateTime, endTime: DateTime, location: String, attendees: Set<String>, tags: Set<Tag>): DraftEvent
        requires title is non-empty, endTime is after startTime
        effect creates new draft event with status "Created" and default constraints (zero buffers)
        note returns the created draft event ID

    validate(draft: DraftEvent): Status
        requires draft exists
        effect checks basic constraints (time ordering, non-empty title)
        note if valid, status becomes "Proposed"; if invalid, status becomes "Conflicted"
        note returns the resulting status

    attachConstraints(draft: DraftEvent, bufferBefore: Number, bufferAfter: Number, requiresRoom: Boolean, virtualLink: String?)
        requires draft exists, buffer times are non-negative
        effect updates or creates constraints for the draft
        note allows specifying travel time, room needs, and video links

    updateDraft(draft: DraftEvent, updates: Map<String,Any>)
        requires draft exists, updates contains valid field names
        effect applies updates to draft fields (title, times, location, attendees, tags)
        note resets status to "Created" to require re-validation after changes

    markValidated(draft: DraftEvent)
        requires draft exists, draft status is "Proposed"
        effect sets status to "Validated"
        note typically called after external conflict checking passes

    markConflicted(draft: DraftEvent)
        requires draft exists
        effect sets status to "Conflicted"
        note typically called when external conflict checking fails

    getDraft(draft: DraftEvent): Map<String,Any>
        requires draft exists
        effect returns draft event data, constraints, and current status

    getByUser(user: User): Set<DraftEvent>
        effect returns all draft events for the user

    deleteDraft(draft: DraftEvent)
        requires draft exists
        effect removes draft event and associated constraints from state

notes
    EventDrafts maintains clean separation from calendar systems:
    - Drafts are temporary working copies before commitment
    - External systems (CalendarSync) query drafts for conflict checking
    - Status transitions guide the workflow toward committable events
    
    Constraints enable intelligent scheduling:
    - Buffer times account for travel between locations
    - Room requirements can trigger location booking
    - Virtual links can be pre-attached for remote meetings
    
    State management:
    - Status "Created" means draft was just created, needs validation
    - Status "Proposed" means basic validation passed, awaiting conflict check
    - Status "Validated" means ready for commitment to calendars
    - Status "Conflicted" means validation or conflict check failed
    
    Updates reset status because changes invalidate previous checks
</concept_spec>
