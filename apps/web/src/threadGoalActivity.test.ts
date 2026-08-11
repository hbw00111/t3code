import { describe, expect, it } from "@effect/vitest";
import { type OrchestrationThreadActivity, ProviderDriverKind } from "@t3tools/contracts";

import {
  providerSupportsThreadGoals,
  threadGoalActivityTranslationKey,
} from "./threadGoalActivity";

const activity = (kind: string, payload: unknown): OrchestrationThreadActivity => ({
  id: "activity-1" as OrchestrationThreadActivity["id"],
  tone: "info",
  kind,
  summary: "Thread goal updated",
  payload,
  turnId: null,
  createdAt: "2026-01-01T00:00:00.000Z",
});

describe("threadGoalActivityTranslationKey", () => {
  it.each([
    ["set", "chat.goalSet"],
    ["pause", "chat.goalPaused"],
    ["resume", "chat.goalResumed"],
    ["clear", "chat.goalCleared"],
  ] as const)("maps a completed %s operation", (operation, expected) => {
    expect(
      threadGoalActivityTranslationKey(
        activity("provider.thread.goal.updated", {
          commandId: "command-1",
          operation,
        }),
      ),
    ).toBe(expected);
  });

  it("maps provider failures independently of their error payload", () => {
    expect(
      threadGoalActivityTranslationKey(
        activity("provider.thread.goal.update.failed", {
          commandId: "command-1",
          operation: "set",
          detail: "Provider unsupported",
        }),
      ),
    ).toBe("chat.goalCommandFailed");
  });

  it("ignores unrelated and malformed activities", () => {
    expect(threadGoalActivityTranslationKey(activity("tool.completed", {}))).toBeNull();
    expect(
      threadGoalActivityTranslationKey(
        activity("provider.thread.goal.updated", { commandId: "command-1", operation: "stop" }),
      ),
    ).toBeNull();
  });
});

describe("providerSupportsThreadGoals", () => {
  it("only enables native goals for Codex", () => {
    expect(providerSupportsThreadGoals(ProviderDriverKind.make("codex"))).toBe(true);
    expect(providerSupportsThreadGoals(ProviderDriverKind.make("claudeAgent"))).toBe(false);
    expect(providerSupportsThreadGoals(ProviderDriverKind.make("grok"))).toBe(false);
  });
});
