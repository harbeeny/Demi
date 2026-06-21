import { expect, test } from "bun:test";

import { buildCoachReply, TRAINER_SYSTEM_PROMPT } from "./trainer";

test("keeps the trainer guardrail in the system prompt", () => {
  expect(TRAINER_SYSTEM_PROMPT).toContain("Do not diagnose conditions");
});

test("asks useful follow-up questions for a strength goal", () => {
  const reply = buildCoachReply("I want to get stronger this year");

  expect(reply.text).toContain("equipment");
  expect(reply.prompts).toContain("I train at home");
});

test("routes injury concerns toward a clinician", () => {
  const reply = buildCoachReply("I have knee pain after running");

  expect(reply.text).toContain("clinician");
});
