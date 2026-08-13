import { CommandId, EnvironmentId } from "@t3tools/contracts";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

import { appAtomRegistry } from "./atom-registry";
import {
  beginPendingGoalCommand,
  clearPendingGoalCommand,
  clearPendingGoalCommandsForEnvironment,
  GOAL_COMMAND_PENDING_TIMEOUT_MS,
  pendingGoalCommandsAtom,
} from "./thread-goal-command-state";

function clearPendingCommands(): void {
  const current = appAtomRegistry.get(pendingGoalCommandsAtom);
  for (const pending of Object.values(current)) {
    clearPendingGoalCommand(pending.threadKey, pending.commandId);
  }
}

describe("mobile thread goal command state", () => {
  beforeEach(clearPendingCommands);
  afterEach(clearPendingCommands);

  it("isolates pending commands by thread and clears only a matching receipt", () => {
    const environmentId = EnvironmentId.make("environment-1");
    const firstCommandId = CommandId.make("goal-command-1");
    const secondCommandId = CommandId.make("goal-command-2");

    expect(
      beginPendingGoalCommand({
        environmentId,
        threadKey: "environment-1:thread-1",
        commandId: firstCommandId,
        action: "set",
      }),
    ).toBe(true);
    expect(
      beginPendingGoalCommand({
        environmentId,
        threadKey: "environment-1:thread-1",
        commandId: secondCommandId,
        action: "get",
      }),
    ).toBe(false);
    expect(
      beginPendingGoalCommand({
        environmentId,
        threadKey: "environment-1:thread-2",
        commandId: secondCommandId,
        action: "pause",
      }),
    ).toBe(true);

    clearPendingGoalCommand("environment-1:thread-1", secondCommandId);
    expect(appAtomRegistry.get(pendingGoalCommandsAtom)).toEqual({
      "environment-1:thread-1": {
        environmentId,
        threadKey: "environment-1:thread-1",
        commandId: firstCommandId,
        action: "set",
      },
      "environment-1:thread-2": {
        environmentId,
        threadKey: "environment-1:thread-2",
        commandId: secondCommandId,
        action: "pause",
      },
    });
  });

  it("clears pending commands for a disconnected environment", () => {
    const firstEnvironmentId = EnvironmentId.make("environment-1");
    const secondEnvironmentId = EnvironmentId.make("environment-2");
    const firstCommandId = CommandId.make("goal-command-1");
    const secondCommandId = CommandId.make("goal-command-2");

    beginPendingGoalCommand({
      environmentId: firstEnvironmentId,
      threadKey: "environment-1:thread-1",
      commandId: firstCommandId,
      action: "set",
    });
    beginPendingGoalCommand({
      environmentId: secondEnvironmentId,
      threadKey: "environment-2:thread-2",
      commandId: secondCommandId,
      action: "resume",
    });

    clearPendingGoalCommandsForEnvironment(firstEnvironmentId);

    expect(appAtomRegistry.get(pendingGoalCommandsAtom)).toEqual({
      "environment-2:thread-2": {
        environmentId: secondEnvironmentId,
        threadKey: "environment-2:thread-2",
        commandId: secondCommandId,
        action: "resume",
      },
    });
  });

  it("releases a command after the receipt timeout", () => {
    vi.useFakeTimers();
    try {
      const environmentId = EnvironmentId.make("environment-1");
      beginPendingGoalCommand({
        environmentId,
        threadKey: "environment-1:thread-timeout",
        commandId: CommandId.make("goal-command-timeout"),
        action: "set",
      });

      vi.advanceTimersByTime(GOAL_COMMAND_PENDING_TIMEOUT_MS);

      expect(appAtomRegistry.get(pendingGoalCommandsAtom)).toEqual({});
    } finally {
      vi.useRealTimers();
    }
  });

  it("does not let an old receipt clear a newer command", () => {
    vi.useFakeTimers();
    try {
      const environmentId = EnvironmentId.make("environment-1");
      const threadKey = "environment-1:thread-1";
      const oldCommandId = CommandId.make("goal-command-old");
      const currentCommandId = CommandId.make("goal-command-current");
      beginPendingGoalCommand({
        environmentId,
        threadKey,
        commandId: oldCommandId,
        action: "set",
      });

      vi.advanceTimersByTime(GOAL_COMMAND_PENDING_TIMEOUT_MS);
      expect(
        beginPendingGoalCommand({
          environmentId,
          threadKey,
          commandId: currentCommandId,
          action: "set",
        }),
      ).toBe(true);

      clearPendingGoalCommand(threadKey, oldCommandId);
      expect(appAtomRegistry.get(pendingGoalCommandsAtom)[threadKey]?.commandId).toBe(
        currentCommandId,
      );
    } finally {
      vi.useRealTimers();
    }
  });
});
