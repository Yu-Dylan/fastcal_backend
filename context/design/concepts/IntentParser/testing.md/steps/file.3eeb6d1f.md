---
timestamp: 'Thu Oct 16 2025 22:54:56 GMT-0400 (Eastern Daylight Time)'
parent: '[[..\20251016_225456.c5fd7e6e.md]]'
content_id: 3eeb6d1f390b1a0a12cf8aa68de74a31863e06ada40ea1cb6cc8d9071a35a93b
---

# file: src/concepts/IntentParser/IntentParserConcept.ts

```typescript
```

Please create comprehensive tests for the IntentParser concept.

Required test scenarios:

1. Operational principle test: Parse utterance → get alternatives → accept selected draft
   * Use a clear utterance like "meeting tomorrow at 3pm in room 123"
   * Verify confidence score, draft structure, alternatives

2. AI parsing with different confidence levels: Test parseWithAI with various utterances
   * High confidence: complete info like "team sync Tuesday 2pm-3pm in 32-123"
   * Medium confidence: partial info like "lunch with Sarah tomorrow"
   * Low confidence: vague like "catch up sometime"
   * Verify confidence scores and number of alternatives

3. Manual parsing: Test parseManually as fallback
   * Simple structured input
   * Verify parsingMethod is set to "Manual"

4. Refinement: Test refineWithAI with user feedback
   * Initial parse, then refine with "make it 30 minutes longer"
   * Verify updated endTime in refined draft

5. Accept and reject: Test workflow completion
   * Accept a draft and verify ParsedEvent is removed
   * Reject a draft and verify cleanup

6. Error cases: Invalid inputs, non-existent ParsedEvent IDs

Note: Tests should work with the mock implementation. Use realistic test dates and times for readability.

Use Deno testing framework with programmatic assertions and console output.
