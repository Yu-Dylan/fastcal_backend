---
timestamp: 'Thu Oct 16 2025 21:56:38 GMT-0400 (Eastern Daylight Time)'
parent: '[[..\20251016_215638.0484caa9.md]]'
content_id: a55ef89e59d5a505a7e6ff44f8300b2bfd6b75727b45d39270d5a90801566723
---

# file: src/concepts/ReminderPolicy/ReminderPolicyConcept.test.ts

```typescript
import { testDb } from "@utils/database.ts";
import {
  assertEquals,
  assertExists,
  assertInstanceOf,
  assertNotEquals,
  assertNull,
  assertObjectMatch,
  assertRejects,
  assertThrows,
} from "jsr:@std/assert";
import ReminderPolicyConcept from "./ReminderPolicyConcept.ts";
import { freshID } from "@utils/database.ts";
import { ID } from "@utils/types.ts";

// Re-declare types for convenience in test file (or import if exported)
type User = ID;
type Policy = ID;
type Tag = string;
type ReminderType = "notification" | "email" | "sms";
type DateTime = Date;

interface Rule {
  offset: number; // minutes before event
  type: ReminderType;
}

interface Reminder {
  time: DateTime;
  type: ReminderType;
}

// Helper to create a date for event start, e.g., "tomorrow at 2 PM"
const createEventDate = (daysAhead: number, hours: number, minutes: number): DateTime => {
  const date = new Date();
  date.setDate(date.getDate() + daysAhead);
  date.setHours(hours, minutes, 0, 0); // Set seconds and milliseconds to 0 for consistent comparison
  return date;
};

// Helper for approximate date comparison within a small delta
const assertDateAlmostEquals = (
  actual: DateTime,
  expected: DateTime,
  deltaMillis: number,
  message?: string,
) => {
  const diff = Math.abs(actual.getTime() - expected.getTime());
  if (diff > deltaMillis) {
    throw new Error(
      `${
        message ? message + ": " : ""
      }Dates are not almost equal. Actual: ${actual.toISOString()}, Expected: ${expected.toISOString()}, Difference: ${diff}ms, Allowed Delta: ${deltaMillis}ms`,
    );
  }
};

Deno.test("ReminderPolicyConcept", async (t) => {
  const [db, client] = await testDb();
  const concept = new ReminderPolicyConcept(db);

  const user1: User = freshID();
  const user2: User = freshID(); // For testing multi-user scenarios

  // Test data
  const defaultRules: Rule[] = [
    { offset: 1440, type: "email" }, // 24 hours before
    { offset: 30, type: "notification" }, // 30 minutes before
  ];

  // # trace: Operational principle test
  await t.step("1. Operational Principle Test: Learning and Adaptation", async () => {
    // 1.1 User creates a policy "Class Reminders" for tag "class" with rules
    const policyName = "Class Reminders";
    const tags = new Set<Tag>(["class", "study"]);
    const classPolicyIdResult = await concept.createPolicy({
      user: user1,
      name: policyName,
      tags: tags,
      rules: defaultRules,
    });
    assertNotEquals(typeof classPolicyIdResult, "object", `Error: ${classPolicyIdResult}`);
    const classPolicyId = classPolicyIdResult as Policy;

    // Verify policy was created
    const createdPolicy = await concept._getPolicy({ policy: classPolicyId });
    assertExists(createdPolicy);
    assertEquals(createdPolicy?.get("name"), policyName);
    assertEquals(createdPolicy?.get("tags"), Array.from(tags));
    assertEquals(createdPolicy?.get("rules"), defaultRules);

    // 1.2 User attaches "class" tag to an event starting at 2pm tomorrow; selectPolicy returns "Class Reminders"
    const eventTags = new Set<Tag>(["class"]);
    const selectedPolicyIdResult = await concept.selectPolicy({ user: user1, tags: eventTags });
    assertEquals(selectedPolicyIdResult, classPolicyId, "Should select the 'Class Reminders' policy.");

    // 1.3 Instantiate generates reminders at 2pm today (email) and 1:30pm tomorrow (notification)
    const eventStart = createEventDate(1, 14, 0); // Tomorrow 2 PM
    const remindersBeforeLearningResult = await concept.instantiate({
      user: user1,
      policy: classPolicyId,
      eventStart,
    });
    assertInstanceOf(remindersBeforeLearningResult, Array);
    const remindersBeforeLearning = remindersBeforeLearningResult as Reminder[];
    assertEquals(remindersBeforeLearning.length, 2);

    // Verify initial reminder times (uses exact rule offsets as no personalization exists)
    const expectedTime1 = new Date(eventStart.getTime());
    expectedTime1.setMinutes(expectedTime1.getMinutes() - 1440); // 24 hours before
    assertDateAlmostEquals(remindersBeforeLearning[0].time, expectedTime1, 1000, "Initial 24h email time");
    assertEquals(remindersBeforeLearning[0].type, "email");

    const expectedTime2 = new Date(eventStart.getTime());
    expectedTime2.setMinutes(expectedTime2.getMinutes() - 30); // 30 minutes before
    assertDateAlmostEquals(remindersBeforeLearning[1].time, expectedTime2, 1000, "Initial 30m notification time");
    assertEquals(remindersBeforeLearning[1].type, "notification");

    // 1.4 Over time, user dismisses 30-min notifications early; learn() records that 45-min offset is more effective
    // Feedback: user found 45 mins before to be effective for 'class' events.
    await concept.learn({ user: user1, tag: "class", actualOffset: 45, wasEffective: true });

    // Verify personalization data was created/updated
    const personalizationAfterLearn1 = await concept._getPersonalization({
      user: user1,
      tag: "class",
    });
    assertExists(personalizationAfterLearn1);
    // Initial avgOffset is actualOffset (45), then effectiveness adjusted from 0.5 to 0.6 (0.5 + 0.1)
    assertEquals(personalizationAfterLearn1?.get("avgOffset"), 45);
    assertEquals(personalizationAfterLearn1?.get("effectiveness"), 0.6);

    // 1.5 Future instantiate() calls blend 30min rule with 45min learned offset based on effectiveness score
    const remindersAfterLearning1Result = await concept.instantiate({
      user: user1,
      policy: classPolicyId,
      eventStart,
    });
    assertInstanceOf(remindersAfterLearning1Result, Array);
    const remindersAfterLearning1 = remindersAfterLearning1Result as Reminder[];
    assertEquals(remindersAfterLearning1.length, 2);

    // Calculate expected adjusted offsets for `avgOffset=45`, `effectiveness=0.6`:
    // Adjusted Offset = ruleOffset * (1 - effectiveness) + learnedOffset * effectiveness
    // Rule 1 (email, offset: 1440): 1440 * (1 - 0.6) + 45 * 0.6 = 1440 * 0.4 + 27 = 576 + 27 = 603 minutes
    // Rule 2 (notification, offset: 30): 30 * (1 - 0.6) + 45 * 0.6 = 30 * 0.4 + 27 = 12 + 27 = 39 minutes

    // Reminder 1 (email) adaptation
    const expectedTime1_adapted = new Date(eventStart.getTime());
    expectedTime1_adapted.setMinutes(expectedTime1_adapted.getMinutes() - 603);
    assertDateAlmostEquals(remindersAfterLearning1[0].time, expectedTime1_adapted, 1000, "Adapted 24h email time");
    assertEquals(remindersAfterLearning1[0].type, "email");

    // Reminder 2 (notification) adaptation
    const expectedTime2_adapted = new Date(eventStart.getTime());
    expectedTime2_adapted.setMinutes(expectedTime2_adapted.getMinutes() - 39);
    assertDateAlmostEquals(remindersAfterLearning1[1].time, expectedTime2_adapted, 1000, "Adapted 30m notification time");
    assertEquals(remindersAfterLearning1[1].type, "notification");

    // 1.6 Simulate more learning: user snoozes, suggesting shorter lead time appropriate (e.g., 20 mins)
    await concept.learn({ user: user1, tag: "class", actualOffset: 20, wasEffective: false });

    // Verify personalization data updated again
    const personalizationAfterLearn2 = await concept._getPersonalization({
      user: user1,
      tag: "class",
    });
    assertExists(personalizationAfterLearn2);
    // Previous: avgOffset = 45, effectiveness = 0.6
    // New avgOffset = (1 - 0.3) * 45 + 0.3 * 20 = 0.7 * 45 + 6 = 31.5 + 6 = 37.5
    // New effectiveness = 0.6 - 0.1 = 0.5
    assertEquals(personalizationAfterLearn2?.get("avgOffset"), 37.5);
    assertEquals(personalizationAfterLearn2?.get("effectiveness"), 0.5);

    // 1.7 Instantiate reminders *after* second learning -> verify further adaptation
    const remindersAfterLearning2Result = await concept.instantiate({
      user: user1,
      policy: classPolicyId,
      eventStart,
    });
    assertInstanceOf(remindersAfterLearning2Result, Array);
    const remindersAfterLearning2 = remindersAfterLearning2Result as Reminder[];
    assertEquals(remindersAfterLearning2.length, 2);

    // Calculate expected adjusted offsets for `avgOffset=37.5`, `effectiveness=0.5`:
    // Rule 1 (email, offset: 1440): 1440 * (1 - 0.5) + 37.5 * 0.5 = 720 + 18.75 = 738.75 minutes
    // Rule 2 (notification, offset: 30): 30 * (1 - 0.5) + 37.5 * 0.5 = 15 + 18.75 = 33.75 minutes

    // Reminder 1 (email) adaptation
    const expectedTime1_adapted2 = new Date(eventStart.getTime());
    expectedTime1_adapted2.setMinutes(expectedTime1_adapted2.getMinutes() - 738.75);
    assertDateAlmostEquals(remindersAfterLearning2[0].time, expectedTime1_adapted2, 1000, "Further adapted 24h email time");
    assertEquals(remindersAfterLearning2[0].type, "email");

    // Reminder 2 (notification) adaptation
    const expectedTime2_adapted2 = new Date(eventStart.getTime());
    expectedTime2_adapted2.setMinutes(expectedTime2_adapted2.getMinutes() - 33.75);
    assertDateAlmostEquals(remindersAfterLearning2[1].time, expectedTime2_adapted2, 1000, "Further adapted 30m notification time");
    assertEquals(remindersAfterLearning2[1].type, "notification");
  });

  await t.step("2. Policy Creation and Selection", async (t) => {
    const user = user2; // Use a different user for isolation

    await t.step("2.1 createPolicy: Success with default setting for new tags", async () => {
      const policy1Rules: Rule[] = [{ offset: 60, type: "notification" }];
      const policy1IdResult = await concept.createPolicy({
        user,
        name: "Meeting Alerts",
        tags: new Set(["meeting", "work"]),
        rules: policy1Rules,
      });
      assertNotEquals(typeof policy1IdResult, "object", `Error: ${policy1IdResult}`);
      const policy1Id = policy1IdResult as Policy;

      const defaultForMeeting = await concept.defaultPolicies.findOne({ user, tag: "meeting" });
      assertExists(defaultForMeeting);
      assertEquals(defaultForMeeting?.policy, policy1Id);

      const defaultForWork = await concept.defaultPolicies.findOne({ user, tag: "work" });
      assertExists(defaultForWork);
      assertEquals(defaultForWork?.policy, policy1Id);
    });

    await t.step("2.2 createPolicy: Fails on invalid input", async () => {
      const emptyNameResult = await concept.createPolicy({
        user,
        name: "   ",
        tags: new Set(["tag"]),
        rules: defaultRules,
      });
      assertObjectMatch(emptyNameResult, { error: "Policy name cannot be empty." });

      const emptyRulesResult = await concept.createPolicy({
        user,
        name: "Empty Rules",
        tags: new Set(["tag"]),
        rules: [],
      });
      assertObjectMatch(emptyRulesResult, { error: "Policy must have at least one rule." });

      const negativeOffsetResult = await concept.createPolicy({
        user,
        name: "Negative Offset",
        tags: new Set(["tag"]),
        rules: [{ offset: -10, type: "notification" }],
      });
      assertObjectMatch(negativeOffsetResult, { error: "All rule offsets must be positive." });

      const zeroOffsetResult = await concept.createPolicy({
        user,
        name: "Zero Offset",
        tags: new Set(["tag"]),
        rules: [{ offset: 0, type: "notification" }],
      });
      assertObjectMatch(zeroOffsetResult, { error: "All rule offsets must be positive." });

      const emptyTagStringResult = await concept.createPolicy({
        user,
        name: "Empty Tag String",
        tags: new Set(["valid", " "]), // Empty string tag
        rules: defaultRules,
      });
      assertObjectMatch(emptyTagStringResult, { error: "Tags cannot be empty strings." });
    });

    await t.step("2.3 selectPolicy: Prioritizes maximum tag overlap", async () => {
      const policyAIdResult = await concept.createPolicy({
        user,
        name: "Project Meeting",
        tags: new Set(["meeting", "project", "work"]),
        rules: [{ offset: 120, type: "email" }],
      });
      assertNotEquals(typeof policyAIdResult, "object");
      const policyAId = policyAIdResult as Policy;

      const policyBIdResult = await concept.createPolicy({
        user,
        name: "Daily Standup",
        tags: new Set(["meeting"]),
        rules: [{ offset: 15, type: "notification" }],
      });
      assertNotEquals(typeof policyBIdResult, "object");
      const policyBId = policyBIdResult as Policy;

      // Query: meeting, project (2 tags overlap with Policy A, 1 with Policy B)
      const selected1 = await concept.selectPolicy({ user, tags: new Set(["meeting", "project"]) });
      assertEquals(selected1, policyAId, "Should select policyA (2 tags overlap) over policyB (1 tag overlap)");

      // Query: meeting (1 tag overlap with Policy A, 1 with Policy B)
      // The implementation picks the first one encountered with max overlap.
      // This is okay for "prioritizes policies with maximum tag overlap" but is non-deterministic for ties.
      // For this specific test, both policyA and policyB match "meeting".
      // Let's create a clear case where policyB is a better specific match.
      // If we query only "meeting", policyB is a more focused policy.
      // The current implementation is simple: if 1 match is max, it picks the first.
      // Let's check: PolicyA has 'meeting', PolicyB has 'meeting'. Both 1 overlap.
      // It depends on the order `policies.find({user})` returns them.
      // For testing, let's assume the loop picks one deterministically (e.g., based on creation order or _id).
      const selected2 = await concept.selectPolicy({ user, tags: new Set(["meeting"]) });
      assertExists(selected2); // It should find one of them.
      // It could be policyBId or policyAId. To make it deterministic for test, let's create a single-tag policy for a new tag.

      const policyCIdResult = await concept.createPolicy({
        user,
        name: "Solo Tag Policy",
        tags: new Set(["solo-tag"]),
        rules: [{ offset: 5, type: "notification" }],
      });
      assertNotEquals(typeof policyCIdResult, "object");
      const policyCId = policyCIdResult as Policy;

      const selectedC = await concept.selectPolicy({ user, tags: new Set(["solo-tag"]) });
      assertEquals(selectedC, policyCId, "Should select specific policy for 'solo-tag'");

      const selectedNoMatch = await concept.selectPolicy({ user, tags: new Set(["non-existent-tag"]) });
      assertNull(selectedNoMatch, "Should return null for no matching policy and no default for the input tags");
    });

    await t.step("2.4 selectPolicy: Default policy fallback", async () => {
      // User 2 already has a default policy for "work" (policy1Id from 2.1) and "meeting" (policy1Id from 2.1).
      // Let's ensure a default policy is picked when no direct policy has tag overlap.
      const user3 = freshID();
      const defaultGeneralPolicyIdResult = await concept.createPolicy({
        user: user3,
        name: "User3 Default General",
        tags: new Set(["general-event"]),
        rules: [{ offset: 90, type: "email" }],
      });
      assertNotEquals(typeof defaultGeneralPolicyIdResult, "object");
      const defaultGeneralPolicyId = defaultGeneralPolicyIdResult as Policy;
      await concept.setDefaultPolicy({
        user: user3,
        tag: "general-event",
        policy: defaultGeneralPolicyId,
      });

      // If queried tags have no overlap with any policies, it should then check *input tags* for defaults.
      const selectedDefaultViaInputTag = await concept.selectPolicy({ user: user3, tags: new Set(["general-event"]) });
      assertEquals(
        selectedDefaultViaInputTag,
        defaultGeneralPolicyId,
        "Should select default policy if query tag matches the default tag, and no other specific policy has higher overlap.",
      );

      const selectedNoDefaultFallback = await concept.selectPolicy({ user: user3, tags: new Set(["unrelated-tag"]) });
      assertNull(selectedNoDefaultFallback, "Should be null if no direct match and no default for queried tags");
    });

    await t.step("2.5 selectPolicy: Fails on empty tags", async () => {
      const result = await concept.selectPolicy({ user, tags: new Set() });
      assertObjectMatch(result as object, { error: "Tags cannot be empty for policy selection." });
    });
  });

  await t.step("3. Reminder Instantiation", async (t) => {
    const user = user1; // Re-use user1 which has existing personalization for 'class'
    const eventStart = createEventDate(2, 9, 0); // Day after tomorrow, 9 AM

    await t.step("3.1 instantiate: Without personalization (new tag, no learning)", async () => {
      const policyIdResult = await concept.createPolicy({
        user,
        name: "New Event Policy",
        tags: new Set(["new-event"]),
        rules: [{ offset: 120, type: "email" }, { offset: 15, type: "notification" }],
      });
      assertNotEquals(typeof policyIdResult, "object");
      const policyId = policyIdResult as Policy;

      const remindersResult = await concept.instantiate({ user, policy: policyId, eventStart });
      assertInstanceOf(remindersResult, Array);
      const reminders = remindersResult as Reminder[];
      assertEquals(reminders.length, 2);

      const expectedTime1 = new Date(eventStart.getTime());
      expectedTime1.setMinutes(expectedTime1.getMinutes() - 120);
      assertDateAlmostEquals(reminders[0].time, expectedTime1, 1000);
      assertEquals(reminders[0].type, "email");

      const expectedTime2 = new Date(eventStart.getTime());
      expectedTime2.setMinutes(expectedTime2.getMinutes() - 15);
      assertDateAlmostEquals(reminders[1].time, expectedTime2, 1000);
      assertEquals(reminders[1].type, "notification");
    });

    await t.step("3.2 instantiate: With personalization (existing 'class' tag from operational principle)", async () => {
      // Use the 'class' policy and personalization from the operational principle test.
      // Current personalization for 'class' (user1) should be avgOffset=37.5, effectiveness=0.5
      const classPolicy = await concept.policies.findOne({ user, name: "Class Reminders" });
      assertExists(classPolicy);

      const remindersResult = await concept.instantiate({
        user,
        policy: classPolicy._id,
        eventStart,
      });
      assertInstanceOf(remindersResult, Array);
      const reminders = remindersResult as Reminder[];
      assertEquals(reminders.length, 2);

      // Expected values based on avgOffset=37.5, effectiveness=0.5, rules: 1440, 30
      // Rule 1 (email, offset: 1440): 1440 * (1 - 0.5) + 37.5 * 0.5 = 720 + 18.75 = 738.75 minutes
      // Rule 2 (notification, offset: 30): 30 * (1 - 0.5) + 37.5 * 0.5 = 15 + 18.75 = 33.75 minutes

      const expectedTime1_adapted = new Date(eventStart.getTime());
      expectedTime1_adapted.setMinutes(expectedTime1_adapted.getMinutes() - 738.75);
      assertDateAlmostEquals(reminders[0].time, expectedTime1_adapted, 1000, "Adapted email time with personalization");
      assertEquals(reminders[0].type, "email");

      const expectedTime2_adapted = new Date(eventStart.getTime());
      expectedTime2_adapted.setMinutes(expectedTime2_adapted.getMinutes() - 33.75);
      assertDateAlmostEquals(reminders[1].time, expectedTime2_adapted, 1000, "Adapted notification time with personalization");
      assertEquals(reminders[1].type, "notification");
    });

    await t.step("3.3 instantiate: Fails on invalid input", async () => {
      const invalidPolicyId: Policy = freshID();
      const result1 = await concept.instantiate({ user, policy: invalidPolicyId, eventStart });
      assertObjectMatch(result1 as object, { error: "Policy not found or does not belong to the user." });

      const result2 = await concept.instantiate({
        user: freshID(), // Different user
        policy: (await concept.policies.findOne({ user: user1 }))!._id, // User1's policy
        eventStart,
      });
      assertObjectMatch(result2 as object, { error: "Policy not found or does not belong to the user." });

      const result3 = await concept.instantiate({
        user,
        policy: (await concept.policies.findOne({ user: user1 }))!._id,
        eventStart: "invalid-date" as unknown as DateTime,
      });
      assertObjectMatch(result3 as object, { error: "eventStart must be a valid Date object." });

      const result4 = await concept.instantiate({
        user,
        policy: (await concept.policies.findOne({ user: user1 }))!._id,
        eventStart: new Date("invalid date string"),
      });
      assertObjectMatch(result4 as object, { error: "eventStart must be a valid Date object." });
    });
  });

  await t.step("4. Learning Algorithm (`learn` action)", async (t) => {
    const user = freshID();
    const tag = "exercise";
    const initialEffectiveness = 0.5; // As per notes

    await t.step("4.1 learn: Creates new personalization entry", async () => {
      const actualOffset1 = 60;
      const result = await concept.learn({ user, tag, actualOffset: actualOffset1, wasEffective: true });
      assertEquals(result, {}, "Learn should return empty object on success");

      const personalization = await concept._getPersonalization({ user, tag });
      assertExists(personalization);
      assertEquals(personalization?.get("avgOffset"), actualOffset1);
      assertEquals(personalization?.get("effectiveness"), initialEffectiveness + 0.1); // 0.5 + 0.1 = 0.6
    });

    await t.step("4.2 learn: Updates existing personalization with positive feedback", async () => {
      // Current state from previous step: avgOffset=60, effectiveness=0.6
      const actualOffset2 = 75; // User found 75 mins more effective
      await concept.learn({ user, tag, actualOffset: actualOffset2, wasEffective: true });

      const personalization = await concept._getPersonalization({ user, tag });
      assertExists(personalization);
      // avgOffset = (1 - 0.3) * 60 + 0.3 * 75 = 0.7 * 60 + 22.5 = 42 + 22.5 = 64.5
      assertEquals(personalization?.get("avgOffset"), 64.5);
      // effectiveness = 0.6 + 0.1 = 0.7
      assertEquals(personalization?.get("effectiveness"), 0.7);
    });

    await t.step("4.3 learn: Updates existing personalization with negative feedback", async () => {
      // Current state: avgOffset=64.5, effectiveness=0.7
      const actualOffset3 = 50; // User found 50 mins less effective
      await concept.learn({ user, tag, actualOffset: actualOffset3, wasEffective: false });

      const personalization = await concept._getPersonalization({ user, tag });
      assertExists(personalization);
      // avgOffset = (1 - 0.3) * 64.5 + 0.3 * 50 = 0.7 * 64.5 + 15 = 45.15 + 15 = 60.15
      assertEquals(personalization?.get("avgOffset"), 60.15);
      // effectiveness = 0.7 - 0.1 = 0.6
      assertEquals(personalization?.get("effectiveness"), 0.6);
    });

    await t.step("4.4 learn: Effectiveness clamps at 0.0 and 1.0", async () => {
      // Push effectiveness to 1.0
      await concept.personalizations.updateOne({ user, tag }, { $set: { effectiveness: 0.95 } });
      await concept.learn({ user, tag, actualOffset: 80, wasEffective: true });
      let personal = (await concept._getPersonalization({ user, tag }))!;
      assertEquals(personal?.get("effectiveness"), 1.0); // Should clamp to 1.0

      // Push effectiveness to 0.0
      await concept.personalizations.updateOne({ user, tag }, { $set: { effectiveness: 0.05 } });
      await concept.learn({ user, tag, actualOffset: 20, wasEffective: false });
      personal = (await concept._getPersonalization({ user, tag }))!;
      assertEquals(personal?.get("effectiveness"), 0.0); // Should clamp to 0.0
    });

    await t.step("4.5 learn: Fails on invalid input", async () => {
      const result1 = await concept.learn({ user, tag, actualOffset: -10, wasEffective: true });
      assertObjectMatch(result1, { error: "actualOffset must be positive." });

      const result2 = await concept.learn({ user, tag, actualOffset: 0, wasEffective: true });
      assertObjectMatch(result2, { error: "actualOffset must be positive." });

      const result3 = await concept.learn({ user, tag: "  ", actualOffset: 10, wasEffective: true });
      assertObjectMatch(result3, { error: "Tag cannot be empty." });
    });
  });

  await t.step("5. Policy Management", async (t) => {
    const user = freshID();
    const policyIdResult = await concept.createPolicy({
      user,
      name: "Original Policy",
      tags: new Set(["tag1", "tag2"]),
      rules: [{ offset: 60, type: "notification" }, { offset: 120, type: "email" }],
    });
    assertNotEquals(typeof policyIdResult, "object");
    const createdPolicyId = policyIdResult as Policy;

    await t.step("5.1 _getPolicy and _getUserPolicies", async () => {
      const policyData = await concept._getPolicy({ policy: createdPolicyId });
      assertExists(policyData);
      assertEquals(policyData?.get("name"), "Original Policy");

      const userPolicies = await concept._getUserPolicies({ user });
      assertEquals(userPolicies.size, 1);
      assert(userPolicies.has(createdPolicyId));

      const nonExistentPolicy = await concept._getPolicy({ policy: freshID() });
      assertNull(nonExistentPolicy);

      const nonExistentUserPolicies = await concept._getUserPolicies({ user: freshID() });
      assertEquals(nonExistentUserPolicies.size, 0);
    });

    await t.step("5.2 updatePolicy: Update name and rules", async () => {
      const newName = "Updated Policy Name";
      const newRules: Rule[] = [{ offset: 45, type: "sms" }];
      const updateResult = await concept.updatePolicy({
        policy: createdPolicyId,
        name: newName,
        rules: newRules,
      });
      assertEquals(updateResult, {}, "Update policy should return empty object on success");

      const updatedPolicy = await concept._getPolicy({ policy: createdPolicyId });
      assertExists(updatedPolicy);
      assertEquals(updatedPolicy?.get("name"), newName);
      assertEquals(updatedPolicy?.get("rules"), newRules);

      // Verify instantiation uses new rules
      const eventStart = createEventDate(1, 10, 0);
      const remindersResult = await concept.instantiate({ user, policy: createdPolicyId, eventStart });
      assertInstanceOf(remindersResult, Array);
      const reminders = remindersResult as Reminder[];
      assertEquals(reminders.length, 1);
      const expectedTime = new Date(eventStart.getTime());
      expectedTime.setMinutes(expectedTime.getMinutes() - 45);
      assertDateAlmostEquals(reminders[0].time, expectedTime, 1000);
      assertEquals(reminders[0].type, "sms");
    });

    await t.step("5.3 updatePolicy: Update name only", async () => {
      const newName = "Name Only Update";
      const updateResult = await concept.updatePolicy({
        policy: createdPolicyId,
        name: newName,
      });
      assertEquals(updateResult, {});

      const updatedPolicy = await concept._getPolicy({ policy: createdPolicyId });
      assertEquals(updatedPolicy?.get("name"), newName);
      // Rules should remain the same as previous update
      assertEquals((updatedPolicy?.get("rules") as Rule[])[0].offset, 45);
    });

    await t.step("5.4 updatePolicy: Update rules only", async () => {
      const latestRules: Rule[] = [{ offset: 10, type: "notification" }];
      const updateResult = await concept.updatePolicy({
        policy: createdPolicyId,
        rules: latestRules,
      });
      assertEquals(updateResult, {});

      const updatedPolicy = await concept._getPolicy({ policy: createdPolicyId });
      assertEquals(updatedPolicy?.get("rules"), latestRules);
      // Name should remain the same
      assertEquals(updatedPolicy?.get("name"), "Name Only Update");
    });

    await t.step("5.5 updatePolicy: Fails on invalid input", async () => {
      const result1 = await concept.updatePolicy({
        policy: createdPolicyId,
        name: "   ",
      });
      assertObjectMatch(result1 as object, { error: "Policy name cannot be empty if provided." });

      const result2 = await concept.updatePolicy({
        policy: createdPolicyId,
        rules: [],
      });
      assertObjectMatch(result2 as object, { error: "If rules are provided, they cannot be empty." });

      const result3 = await concept.updatePolicy({
        policy: createdPolicyId,
        rules: [{ offset: -5, type: "notification" }],
      });
      assertObjectMatch(result3 as object, { error: "All rule offsets must be positive." });

      const result4 = await concept.updatePolicy({
        policy: freshID(), // Non-existent policy
        name: "Non Existent",
      });
      assertObjectMatch(result4 as object, { error: "Policy not found." });

      const result5 = await concept.updatePolicy({
        policy: createdPolicyId,
        name: undefined,
        rules: undefined,
      });
      assertObjectMatch(result5 as object, { error: "No update fields provided." });
    });

    await t.step("5.6 deletePolicy: Deletes policy and associated defaults", async () => {
      await concept.setDefaultPolicy({ user, tag: "tag1", policy: createdPolicyId });
      await concept.setDefaultPolicy({ user, tag: "tag2", policy: createdPolicyId });

      let default1 = await concept.defaultPolicies.findOne({ user, tag: "tag1" });
      assertExists(default1);
      let default2 = await concept.defaultPolicies.findOne({ user, tag: "tag2" });
      assertExists(default2);

      const deleteResult = await concept.deletePolicy({ policy: createdPolicyId });
      assertEquals(deleteResult, {});

      const deletedPolicy = await concept._getPolicy({ policy: createdPolicyId });
      assertNull(deletedPolicy);

      default1 = await concept.defaultPolicies.findOne({ user, tag: "tag1" });
      assertNull(default1, "Default policy for tag1 should be deleted");
      default2 = await concept.defaultPolicies.findOne({ user, tag: "tag2" });
      assertNull(default2, "Default policy for tag2 should be deleted");
    });

    await t.step("5.7 deletePolicy: Fails on non-existent policy", async () => {
      const result = await concept.deletePolicy({ policy: freshID() });
      assertObjectMatch(result as object, { error: "Policy not found." });
    });
  });

  await t.step("6. setDefaultPolicy", async (t) => {
    const user = freshID();
    const policyAIdResult = await concept.createPolicy({
      user,
      name: "Policy A",
      tags: new Set(["tagX", "tagY"]),
      rules: defaultRules,
    });
    assertNotEquals(typeof policyAIdResult, "object");
    const policyAId = policyAIdResult as Policy;

    const policyBIdResult = await concept.createPolicy({
      user,
      name: "Policy B",
      tags: new Set(["tagX", "tagZ"]),
      rules: defaultRules,
    });
    assertNotEquals(typeof policyBIdResult, "object");
    const policyBId = policyBIdResult as Policy;

    await t.step("6.1 setDefaultPolicy: Sets a new default", async () => {
      const result = await concept.setDefaultPolicy({ user, tag: "tagX", policy: policyAId });
      assertEquals(result, {});

      const defaultPolicy = await concept.defaultPolicies.findOne({ user, tag: "tagX" });
      assertExists(defaultPolicy);
      assertEquals(defaultPolicy?.policy, policyAId);
    });

    await t.step("6.2 setDefaultPolicy: Replaces an existing default", async () => {
      const result = await concept.setDefaultPolicy({ user, tag: "tagX", policy: policyBId });
      assertEquals(result, {});

      const defaultPolicy = await concept.defaultPolicies.findOne({ user, tag: "tagX" });
      assertExists(defaultPolicy);
      assertEquals(defaultPolicy?.policy, policyBId);
    });

    await t.step("6.3 setDefaultPolicy: Fails on invalid input", async () => {
      const result1 = await concept.setDefaultPolicy({ user, tag: "non-existent-tag", policy: policyAId });
      assertObjectMatch(result1 as object, { error: `Policy '${policyAId}' does not contain the tag 'non-existent-tag'.` });

      const result2 = await concept.setDefaultPolicy({ user, tag: "tagX", policy: freshID() });
      assertObjectMatch(result2 as object, { error: "Policy not found or does not belong to the user." });

      const otherUser = freshID();
      const result3 = await concept.setDefaultPolicy({ user: otherUser, tag: "tagX", policy: policyAId });
      assertObjectMatch(result3 as object, { error: "Policy not found or does not belong to the user." });

      const result4 = await concept.setDefaultPolicy({ user, tag: "  ", policy: policyAId });
      assertObjectMatch(result4 as object, { error: "Tag cannot be empty." });
    });
  });

  await t.step("7. Query Methods (`_getPersonalization`)", async (t) => {
    const user = freshID();
    const tag = "query-tag";

    await t.step("7.1 _getPersonalization: Returns data if exists", async () => {
      await concept.learn({ user, tag, actualOffset: 100, wasEffective: true });
      const personalization = await concept._getPersonalization({ user, tag });
      assertExists(personalization);
      assertEquals(personalization?.get("avgOffset"), 100);
    });

    await t.step("7.2 _getPersonalization: Returns null if not exists", async () => {
      const personalization = await concept._getPersonalization({ user, tag: "non-existent" });
      assertNull(personalization);
    });

    await t.step("7.3 _getPersonalization: Returns null for empty tag", async () => {
      const personalization = await concept._getPersonalization({ user, tag: "   " });
      assertNull(personalization);
    });
  });

  await client.close();
});
```
