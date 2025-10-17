# IntentParser Design Changes

## Changes from Assignment 2

### 1. Mock Implementation for Phase 1
Original: Full LLM integration with Gemini API
Changed: Mock/stub implementation using rule-based parsing
Reason: Focus on concept structure first, LLM integration is complex and will be added later

### 2. DraftEvent Structure
Original: Referenced external EventDrafts concept
Changed: DraftEvent is internal nested structure in ParsedEvent
Reason: Maintains concept independence - parser produces data structure, doesn't depend on EventDrafts concept

### 3. Confidence Score Granularity
Original: Complex confidence calculation with multiple factors
Changed: Simple confidence based on number of extracted fields / total required fields
Reason: Sufficient for mock implementation, real LLM will provide more sophisticated confidence

### 4. Alternatives Generation
Original: Multiple alternative interpretations from LLM
Changed: Mock generates 1-3 alternatives based on ambiguity detection
Reason: Demonstrates the concept without LLM, shows how alternatives work

### 5. Context Structure
Original: Complex context with user preferences and calendar data
Changed: Minimal context: currentDate, timezone, simple preferences
Reason: Easier to test, sufficient for mock implementation

## Implementation Issues

### Mock AI Parsing Strategy
The mock implementation uses regex patterns and heuristics:
- Date patterns: "tomorrow", "next Tuesday", "in 2 days", "YYYY-MM-DD"
- Time patterns: "3pm", "14:00", "3:30 PM"
- Duration: "for 1 hour", "30 minutes", or default 1 hour
- Location: keywords like "in", "at", "room", "zoom"
- Participants: "with" followed by names

### Confidence Calculation
```
confidence = (fieldsExtracted / totalFields)
- title extracted: +0.25
- startTime extracted: +0.25  
- endTime or duration: +0.25
- location extracted: +0.125
- participants extracted: +0.125
```

High: >= 0.8, Medium: 0.5-0.8, Low: < 0.5