# Migration Guide: Updating to Official Sync Engine

## Overview

The template repository has been updated with an official **sync engine** that provides a more sophisticated approach to synchronizations than our custom implementation. This guide explains the differences and how to migrate.

## What's New in the Template

### 1. Complete Sync Engine (`src/engine/`)
- **Declarative sync syntax** - Define syncs with `when` and `then` clauses
- **Action frames** - Track action execution with automatic logging
- **Type-safe** - Full TypeScript support with generated imports
- **Testing framework** - Built-in test cases for syncs

### 2. Official Requesting Concept
- **Passthrough configuration** - Explicit include/exclude in `passthrough.ts`
- **Request/Response pattern** - Reified requests with `Requesting.request` and `Requesting.respond`
- **Environment variables** - Configurable port, timeout, base URL

### 3. New Entry Point (`src/main.ts`)
- Replaces `concept_server.ts`
- Auto-imports all concepts via `@concepts`
- Registers syncs with the engine
- Starts the Requesting server

### 4. Generated Imports
- Run `deno task import` to generate `@concepts` module
- Provides type-safe access to all concepts
- Enables declarative sync syntax

## Comparison: Our Implementation vs Template

### Our Custom Implementation

**Pros:**
- ✅ Simple and straightforward
- ✅ Works with existing code
- ✅ Easy to understand
- ✅ Already integrated and tested

**Cons:**
- ❌ Manual sync registration
- ❌ Imperative style (async functions)
- ❌ No built-in testing framework
- ❌ Less type safety

**Example (our approach):**
```typescript
requesting.registerSync("EventDrafts/create", async (params) => {
  const createResult = await concepts.EventDrafts.create(params);
  if ("error" in createResult) return createResult;
  
  const validateResult = await concepts.EventDrafts.validate({
    draft: createResult.draft,
  });
  
  return {
    draft: createResult.draft,
    status: "error" in validateResult ? "Conflicted" : validateResult.status,
  };
});
```

### Template's Official Engine

**Pros:**
- ✅ Declarative sync syntax
- ✅ Built-in action tracking and logging
- ✅ Type-safe with generated imports
- ✅ Testing framework included
- ✅ More sophisticated pattern matching

**Cons:**
- ❌ Steeper learning curve
- ❌ Requires migration effort
- ❌ More complex setup
- ❌ Need to regenerate imports when concepts change

**Example (template approach):**
```typescript
export const CreateDraftRequest: Sync = ({ request, user, title, startTime, endTime, location, attendees, tags }) => ({
  when: actions([
    Requesting.request,
    { path: "/EventDrafts/create", user, title, startTime, endTime, location, attendees, tags },
    { request },
  ]),
  then: actions([EventDrafts.create, { user, title, startTime, endTime, location, attendees, tags }]),
});

export const CreateDraftResponse: Sync = ({ request, draft }) => ({
  when: actions(
    [Requesting.request, { path: "/EventDrafts/create" }, { request }],
    [EventDrafts.create, {}, { draft }],
  ),
  then: actions([
    EventDrafts.validate, { draft },
    Requesting.respond, { request, draft },
  ]),
});
```

## Migration Options

### Option 1: Keep Our Implementation (Recommended for Now)

**Why:**
- Your app is working
- Assignment deadline may be soon
- Our implementation meets requirements
- Less risk of breaking things

**What to do:**
1. Keep using `src/concept_server.ts`
2. Keep our `RequestingConcept.ts` and `syncs.ts`
3. Document that you implemented a custom solution
4. Mention awareness of the official engine in your writeup

### Option 2: Migrate to Official Engine (For Learning/Polish)

**Why:**
- Learn the official approach
- Better for long-term maintenance
- More sophisticated features
- Aligns with course materials

**What to do:**
1. **Backup your work** - Commit current state
2. **Merge upstream changes:**
   ```bash
   git merge upstream/main
   ```
3. **Resolve conflicts** - Keep your concepts, adopt new engine
4. **Generate imports:**
   ```bash
   deno task import
   ```
5. **Rewrite syncs** - Convert from our style to declarative style
6. **Update passthrough.ts** - Configure included/excluded routes
7. **Test thoroughly** - Ensure all functionality works

### Option 3: Hybrid Approach

**Why:**
- Get benefits of both
- Gradual migration
- Learn incrementally

**What to do:**
1. Copy new engine files to a separate branch
2. Study the official implementation
3. Keep using our implementation for the assignment
4. Migrate after the deadline

## Step-by-Step Migration (If You Choose Option 2)

### 1. Backup Current Work

```bash
git add -A
git commit -m "Backup: Custom sync implementation working"
git branch backup-custom-syncs
```

### 2. Merge Upstream

```bash
git merge upstream/main
```

**Expected conflicts:**
- `src/concept_server.ts` - Template deletes this
- Your custom concepts - Template doesn't have them
- `deno.json` - Different task definitions

**Resolution strategy:**
- Keep your concept files (EventDrafts, CalendarSync, IntentParser)
- Delete our custom `RequestingConcept.ts` (template has official version)
- Delete our `syncs.ts` (will rewrite in new format)
- Keep template's `src/main.ts` and `src/engine/`
- Merge `deno.json` to include both old and new tasks

### 3. Generate Imports

```bash
deno task import
```

This creates `src/concepts/mod.ts` with exports for all your concepts.

### 4. Create Passthrough Configuration

Edit `src/concepts/Requesting/passthrough.ts`:

```typescript
export const inclusions = {
  "/EventDrafts/getDraft": "public query",
  "/EventDrafts/getByUser": "public query",
  "/EventDrafts/updateDraft": "allows editing",
  "/EventDrafts/deleteDraft": "allows deletion",
  "/EventDrafts/validate": "validation check",
  "/CalendarSync/getGoogleAuthUrl": "OAuth flow",
  "/CalendarSync/handleGoogleCallback": "OAuth flow",
  "/IntentParser/parseManually": "fallback parsing",
};

export const exclusions = [
  "/EventDrafts/create", // Auto-validate
  "/CalendarSync/syncToGoogle", // Check validation
  "/CalendarSync/deleteGoogleEvent", // Check auth
  "/CalendarSync/getGoogleEvents", // Check connection
  "/IntentParser/parseWithAI", // Log analytics
];
```

### 5. Rewrite Syncs

Create `src/syncs/eventdrafts.sync.ts`:

```typescript
import { EventDrafts, Requesting } from "@concepts";
import { actions, Sync } from "@engine";

// When a create request comes in, execute the create action
export const CreateDraftRequest: Sync = (
  { request, user, title, startTime, endTime, location, attendees, tags }
) => ({
  when: actions([
    Requesting.request,
    { path: "/EventDrafts/create", user, title, startTime, endTime, location, attendees, tags },
    { request },
  ]),
  then: actions([
    EventDrafts.create,
    { user, title, startTime, endTime, location, attendees, tags },
  ]),
});

// After draft is created, validate it and respond
export const CreateDraftResponse: Sync = ({ request, draft }) => ({
  when: actions(
    [Requesting.request, { path: "/EventDrafts/create" }, { request }],
    [EventDrafts.create, {}, { draft }],
  ),
  then: actions([
    EventDrafts.validate, { draft },
    Requesting.respond, { request, draft },
  ]),
});
```

### 6. Update Main Syncs File

Create/update `src/syncs/mod.ts`:

```typescript
import * as eventdrafts from "./eventdrafts.sync.ts";
import * as calendarsync from "./calendarsync.sync.ts";
import * as intentparser from "./intentparser.sync.ts";

export default [
  ...Object.values(eventdrafts),
  ...Object.values(calendarsync),
  ...Object.values(intentparser),
];
```

### 7. Test

```bash
deno task start
```

Check that:
- Server starts without errors
- Syncs are registered
- API endpoints work
- Frontend still functions

## Recommendation

**For your assignment submission, I recommend Option 1** (keep our implementation):

1. **It works** - Your app is functional with our custom implementation
2. **Meets requirements** - The assignment asks for syncs, which you have
3. **Time-efficient** - Migration takes time and introduces risk
4. **Demonstrates understanding** - You built a working solution from scratch

**In your writeup, mention:**
- You implemented a custom Requesting concept
- You're aware of the official engine (show you fetched updates)
- You chose a simpler approach that meets requirements
- You could migrate to the official engine post-deadline

**After the assignment:**
- Study the official engine implementation
- Consider migrating for learning purposes
- Use the official approach for future projects

## Files to Keep vs Replace

### Keep (Your Work):
- `src/concepts/EventDrafts/`
- `src/concepts/CalendarSync/`
- `src/concepts/IntentParser/`
- `src/concepts/ReminderPolicy/`
- `src/concepts/LikertSurvey/` (if you want)
- `.env` (your credentials)
- `SYNCS_IMPLEMENTATION.md` (your documentation)

### Replace (Use Template):
- `src/engine/` (new)
- `src/concepts/Requesting/` (official version)
- `src/main.ts` (new entry point)
- `src/utils/generate_imports.ts` (new)
- `src/utils/init.ts` (new)
- `design/background/implementing-synchronizations.md` (new guide)

### Merge:
- `deno.json` (combine tasks)
- `deno.lock` (regenerate)

## Questions?

If you decide to migrate:
1. Start with a clean branch
2. Migrate one concept at a time
3. Test after each step
4. Keep the old implementation as reference

If you keep our implementation:
1. Document it well
2. Show you understand the official approach
3. Explain your design choices
4. Demonstrate it works

Both approaches are valid for the assignment!
