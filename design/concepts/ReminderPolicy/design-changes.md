# ReminderPolicy Design Changes

## Changes from Assignment 2

### 1. Simplified Personalization Model
Original: Complex multi-dimensional learning with multiple behavioral factors
Changed: Two-parameter model (avgOffset, effectiveness) with simple blending
Reason: Easier to implement and test while still demonstrating adaptive behavior

### 2. Explicit Learning Rate
Original: Adaptive learning rate based on confidence
Changed: Fixed alpha = 0.3 for exponential moving average
Reason: Simpler to reason about, still provides good balance between stability and adaptation

### 3. Rule Structure
Original: Rules had complex conditions and priorities
Changed: Rules are simple offset + type pairs in a sequence
Reason: Sufficient for reminder generation, maintains concept simplicity

### 4. Reminder Type Enum
Original: Open-ended delivery mechanisms
Changed: Fixed enum: "notification", "email", "sms"
Reason: Clear type safety, covers common use cases, easy to extend

### 5. Tag-Based Policy Selection
Original: Multiple criteria for policy selection
Changed: Primary criterion is tag overlap count
Reason: Intuitive matching strategy, enables flexible policy application

## Implementation Issues

### Learning Algorithm Details
- Exponential moving average: `newAvg = current x (1 - α) + new x α`
- Effectiveness adjustment: ±0.1 per feedback event, bounded [0.0, 1.0]
- Blending formula ensures smooth transition between rule-based and learned behavior

### Reminder Generation
- Instantiate produces reminders with absolute DateTime values
- Multiple reminders per event (sequence of rules)
- Personalization applied independently for each rule