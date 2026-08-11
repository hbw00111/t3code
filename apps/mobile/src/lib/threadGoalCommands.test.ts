import { describe, expect, it, vi } from "vite-plus/test";

import { EnvironmentId, ThreadId } from "@t3tools/contracts";

import {
  buildThreadComposerSlashCommandItems,
  dispatchThreadGoalCommand,
  parseComposerGoalCommand,
  resolveThreadComposerSubmission,
} from "./threadGoalCommands";

describe("mobile thread goal commands", () => {
  it("only offers the native /goal command for Codex", () => {
    const commandsFor = (providerDriver: string) =>
      buildThreadComposerSlashCommandItems({
        query: "",
        providerDriver,
        providerCommands: [],
      }).map((item) => item.label);

    expect(commandsFor("codex")).toContain("/goal");
    expect(commandsFor("claudeAgent")).not.toContain("/goal");
    expect(commandsFor("grok")).not.toContain("/goal");
  });

  it("does not expose a provider command that collides with native /goal", () => {
    expect(
      buildThreadComposerSlashCommandItems({
        query: "goal",
        providerDriver: "claudeAgent",
        providerCommands: [{ name: "goal", description: "Provider goal" }],
      }),
    ).toEqual([]);
  });

  it("parses set, pause, resume, clear, and a missing objective", () => {
    expect(parseComposerGoalCommand("/goal Ship the mobile UI")).toEqual({
      action: "set",
      objective: "Ship the mobile UI",
    });
    expect(parseComposerGoalCommand("/goal PAUSE")).toEqual({ action: "pause" });
    expect(parseComposerGoalCommand(" /goal resume ")).toEqual({ action: "resume" });
    expect(parseComposerGoalCommand("/goal clear")).toEqual({ action: "clear" });
    expect(parseComposerGoalCommand("/goal ")).toEqual({ action: "missing-objective" });
    expect(parseComposerGoalCommand("send a normal message")).toBeNull();
  });

  it("routes attachment-free /goal submissions away from the message outbox", () => {
    expect(
      resolveThreadComposerSubmission({ text: "/goal Keep working", attachmentCount: 0 }),
    ).toEqual({
      kind: "goal",
      command: { action: "set", objective: "Keep working" },
    });
    expect(
      resolveThreadComposerSubmission({ text: "/goal Keep working", attachmentCount: 1 }),
    ).toEqual({ kind: "message" });
    expect(resolveThreadComposerSubmission({ text: "hello", attachmentCount: 0 })).toEqual({
      kind: "message",
    });
  });

  it.each(["set", "pause", "resume", "clear"] as const)(
    "dispatches %s through the matching client-runtime operation",
    async (action) => {
      const operations = {
        setGoal: vi.fn(async () => "set"),
        pauseGoal: vi.fn(async () => "pause"),
        resumeGoal: vi.fn(async () => "resume"),
        clearGoal: vi.fn(async () => "clear"),
      };
      const command =
        action === "set" ? ({ action, objective: "Keep working" } as const) : ({ action } as const);
      const result = await dispatchThreadGoalCommand({
        command,
        target: {
          environmentId: EnvironmentId.make("environment-1"),
          threadId: ThreadId.make("thread-1"),
        },
        operations,
      });

      expect(result).toBe(action);
      expect(operations[`${action}Goal`]).toHaveBeenCalledOnce();
      expect(operations[`${action}Goal`]).toHaveBeenCalledWith({
        environmentId: "environment-1",
        input: {
          threadId: "thread-1",
          ...(action === "set" ? { objective: "Keep working" } : {}),
        },
      });
      expect(
        Object.values(operations).filter((operation) => operation.mock.calls.length > 0),
      ).toHaveLength(1);
    },
  );
});
