import { describe, expect, it, vi } from "vite-plus/test";

import {
  EnvironmentId,
  ProviderDriverKind,
  ProviderInstanceId,
  ThreadId,
} from "@t3tools/contracts";

import {
  buildThreadComposerSlashCommandItems,
  canExecuteThreadGoalCommand,
  dispatchThreadGoalCommand,
  parseComposerGoalCommand,
  resolveThreadGoalProviderDriver,
  resolveThreadComposerSubmission,
} from "./threadGoalCommands";

describe("mobile thread goal commands", () => {
  it("only offers the native /goal command for Codex", () => {
    const commandsFor = (providerDriver: string) =>
      buildThreadComposerSlashCommandItems({
        query: "",
        providerDriver,
        providerCommands: [],
        showInteractionModeToggle: true,
      }).map((item) => item.label);

    expect(commandsFor("codex")).toContain("/goal");
    expect(commandsFor("claudeAgent")).not.toContain("/goal");
    expect(commandsFor("grok")).not.toContain("/goal");
  });

  it("requires both a live connection and Codex before executing a goal command", () => {
    expect(
      canExecuteThreadGoalCommand({ connectionState: "connected", providerDriver: "codex" }),
    ).toBe(true);
    expect(
      canExecuteThreadGoalCommand({ connectionState: "reconnecting", providerDriver: "codex" }),
    ).toBe(false);
    expect(
      canExecuteThreadGoalCommand({
        connectionState: "connected",
        providerDriver: "claudeAgent",
      }),
    ).toBe(false);
  });

  it("uses the running session provider before a draft model selection", () => {
    const providers = [
      {
        instanceId: ProviderInstanceId.make("codex-main"),
        driver: ProviderDriverKind.make("codex"),
      },
      {
        instanceId: ProviderInstanceId.make("claude-main"),
        driver: ProviderDriverKind.make("claudeAgent"),
      },
    ];

    expect(
      resolveThreadGoalProviderDriver({
        sessionProviderInstanceId: ProviderInstanceId.make("claude-main"),
        modelSelectionInstanceId: ProviderInstanceId.make("codex-main"),
        providers,
      }),
    ).toBe("claudeAgent");
    expect(
      resolveThreadGoalProviderDriver({
        sessionProviderInstanceId: null,
        modelSelectionInstanceId: ProviderInstanceId.make("codex-main"),
        providers,
      }),
    ).toBe("codex");
    expect(
      resolveThreadGoalProviderDriver({
        sessionProviderInstanceId: ProviderInstanceId.make("missing"),
        modelSelectionInstanceId: ProviderInstanceId.make("codex-main"),
        providers,
      }),
    ).toBeNull();
  });

  it("does not expose a provider command that collides with native /goal", () => {
    expect(
      buildThreadComposerSlashCommandItems({
        query: "goal",
        providerDriver: "claudeAgent",
        providerCommands: [{ name: "goal", description: "Provider goal" }],
        showInteractionModeToggle: true,
      }),
    ).toEqual([]);
  });

  it("hides interaction mode commands when the provider does not support them", () => {
    expect(
      buildThreadComposerSlashCommandItems({
        query: "",
        providerDriver: "grok",
        providerCommands: [],
        showInteractionModeToggle: false,
      }).map((item) => item.label),
    ).not.toEqual(expect.arrayContaining(["/plan", "/default"]));
  });

  it("parses get, set, pause, resume, and clear", () => {
    expect(parseComposerGoalCommand("/goal Ship the mobile UI")).toEqual({
      action: "set",
      objective: "Ship the mobile UI",
    });
    expect(parseComposerGoalCommand("/goal PAUSE")).toEqual({ action: "pause" });
    expect(parseComposerGoalCommand(" /goal resume ")).toEqual({ action: "resume" });
    expect(parseComposerGoalCommand("/goal clear")).toEqual({ action: "clear" });
    expect(parseComposerGoalCommand("/goal ")).toEqual({ action: "get" });
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

  it.each(["get", "set", "pause", "resume", "clear"] as const)(
    "dispatches %s through the matching client-runtime operation",
    async (action) => {
      const operations = {
        getGoal: vi.fn(async () => "get"),
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
