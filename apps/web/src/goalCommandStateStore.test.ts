import { CommandId, EnvironmentId } from "@t3tools/contracts";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

import { GOAL_COMMAND_PENDING_TIMEOUT_MS, useGoalCommandStateStore } from "./goalCommandStateStore";

describe("goalCommandStateStore", () => {
  const clearPendingCommands = () => {
    const state = useGoalCommandStateStore.getState();
    for (const [threadKey, command] of Object.entries(state.pendingByThreadKey)) {
      state.clear(threadKey, command.commandId);
    }
    for (const threadKey of Object.keys(state.editorByThreadKey)) {
      state.setEditor(threadKey, null);
    }
  };

  beforeEach(() => {
    clearPendingCommands();
  });
  afterEach(clearPendingCommands);

  it("isolates pending commands by thread and clears only the matching receipt", () => {
    const firstCommandId = CommandId.make("goal-command-1");
    const secondCommandId = CommandId.make("goal-command-2");
    const store = useGoalCommandStateStore.getState();

    expect(store.begin("environment:thread-1", { commandId: firstCommandId, action: "set" })).toBe(
      true,
    );
    expect(store.begin("environment:thread-1", { commandId: secondCommandId, action: "get" })).toBe(
      false,
    );
    expect(
      store.begin("environment:thread-2", { commandId: secondCommandId, action: "pause" }),
    ).toBe(true);

    store.clear("environment:thread-1", secondCommandId);
    expect(useGoalCommandStateStore.getState().pendingByThreadKey).toEqual({
      "environment:thread-1": { commandId: firstCommandId, action: "set" },
      "environment:thread-2": { commandId: secondCommandId, action: "pause" },
    });

    store.clear("environment:thread-1", firstCommandId);
    expect(useGoalCommandStateStore.getState().pendingByThreadKey).toEqual({
      "environment:thread-2": { commandId: secondCommandId, action: "pause" },
    });
  });

  it("clears all pending commands owned by a disconnected environment", () => {
    const firstCommandId = CommandId.make("goal-command-1");
    const secondCommandId = CommandId.make("goal-command-2");
    const store = useGoalCommandStateStore.getState();
    store.begin("environment-1:thread-1", { commandId: firstCommandId, action: "set" });
    store.begin("environment-1:thread-2", { commandId: secondCommandId, action: "pause" });
    store.begin("environment-2:thread-3", { commandId: secondCommandId, action: "resume" });

    store.clearEnvironment(EnvironmentId.make("environment-1"));

    expect(useGoalCommandStateStore.getState().pendingByThreadKey).toEqual({
      "environment-2:thread-3": { commandId: secondCommandId, action: "resume" },
    });
  });

  it("releases a pending command when no receipt or disconnect edge arrives", () => {
    vi.useFakeTimers();
    try {
      const commandId = CommandId.make("goal-command-timeout");
      useGoalCommandStateStore
        .getState()
        .begin("environment-1:thread-timeout", { commandId, action: "set" });

      vi.advanceTimersByTime(GOAL_COMMAND_PENDING_TIMEOUT_MS);

      expect(useGoalCommandStateStore.getState().pendingByThreadKey).toEqual({});
    } finally {
      vi.useRealTimers();
    }
  });

  it("keeps goal editor drafts isolated while switching threads", () => {
    const store = useGoalCommandStateStore.getState();
    store.setEditor("environment-1:thread-1", {
      draftObjective: "Keep the failed draft",
      submittedObjective: "Keep the failed draft",
    });
    store.setEditor("environment-1:thread-2", {
      draftObjective: "Edit another goal",
      submittedObjective: null,
    });

    expect(useGoalCommandStateStore.getState().editorByThreadKey).toEqual({
      "environment-1:thread-1": {
        draftObjective: "Keep the failed draft",
        submittedObjective: "Keep the failed draft",
      },
      "environment-1:thread-2": {
        draftObjective: "Edit another goal",
        submittedObjective: null,
      },
    });

    store.setEditor("environment-1:thread-2", null);
    expect(useGoalCommandStateStore.getState().editorByThreadKey).toEqual({
      "environment-1:thread-1": {
        draftObjective: "Keep the failed draft",
        submittedObjective: "Keep the failed draft",
      },
    });
  });

  it("does not let an old receipt clear a newer command after timeout", () => {
    vi.useFakeTimers();
    try {
      const oldCommandId = CommandId.make("goal-command-old");
      const currentCommandId = CommandId.make("goal-command-current");
      const store = useGoalCommandStateStore.getState();
      store.begin("environment-1:thread-1", { commandId: oldCommandId, action: "set" });

      vi.advanceTimersByTime(GOAL_COMMAND_PENDING_TIMEOUT_MS);
      expect(
        useGoalCommandStateStore
          .getState()
          .begin("environment-1:thread-1", { commandId: currentCommandId, action: "set" }),
      ).toBe(true);

      useGoalCommandStateStore.getState().clear("environment-1:thread-1", oldCommandId);
      expect(useGoalCommandStateStore.getState().pendingByThreadKey).toEqual({
        "environment-1:thread-1": { commandId: currentCommandId, action: "set" },
      });
    } finally {
      vi.useRealTimers();
    }
  });
});
