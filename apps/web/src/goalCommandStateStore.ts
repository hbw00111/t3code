import { parseScopedThreadKey } from "@t3tools/client-runtime/environment";
import type { CommandId, EnvironmentId } from "@t3tools/contracts";
import { create } from "zustand";

export type ThreadGoalAction = "get" | "set" | "pause" | "resume" | "clear";
export const GOAL_COMMAND_PENDING_TIMEOUT_MS = 60_000;

const pendingTimeouts = new Map<string, ReturnType<typeof setTimeout>>();

function cancelPendingTimeout(threadKey: string): void {
  const timeout = pendingTimeouts.get(threadKey);
  if (timeout === undefined) return;
  clearTimeout(timeout);
  pendingTimeouts.delete(threadKey);
}

export interface PendingThreadGoalCommand {
  readonly commandId: CommandId;
  readonly action: ThreadGoalAction;
}

export interface ThreadGoalEditorSession {
  readonly draftObjective: string;
  readonly submittedObjective: string | null;
}

interface GoalCommandState {
  readonly pendingByThreadKey: Record<string, PendingThreadGoalCommand>;
  readonly editorByThreadKey: Record<string, ThreadGoalEditorSession>;
  readonly begin: (threadKey: string, command: PendingThreadGoalCommand) => boolean;
  readonly clear: (threadKey: string, commandId: CommandId) => void;
  readonly clearEnvironment: (environmentId: EnvironmentId) => void;
  readonly setEditor: (threadKey: string, editor: ThreadGoalEditorSession | null) => void;
}

export const useGoalCommandStateStore = create<GoalCommandState>((set, get) => ({
  pendingByThreadKey: {},
  editorByThreadKey: {},
  begin: (threadKey, command) => {
    if (get().pendingByThreadKey[threadKey] !== undefined) return false;
    set((state) => ({
      pendingByThreadKey: {
        ...state.pendingByThreadKey,
        [threadKey]: command,
      },
    }));
    cancelPendingTimeout(threadKey);
    pendingTimeouts.set(
      threadKey,
      setTimeout(() => {
        pendingTimeouts.delete(threadKey);
        get().clear(threadKey, command.commandId);
      }, GOAL_COMMAND_PENDING_TIMEOUT_MS),
    );
    return true;
  },
  clear: (threadKey, commandId) => {
    if (get().pendingByThreadKey[threadKey]?.commandId !== commandId) return;
    cancelPendingTimeout(threadKey);
    set((state) => {
      if (state.pendingByThreadKey[threadKey]?.commandId !== commandId) return state;
      const pendingByThreadKey = { ...state.pendingByThreadKey };
      delete pendingByThreadKey[threadKey];
      return { pendingByThreadKey };
    });
  },
  clearEnvironment: (environmentId) => {
    const clearedThreadKeys = Object.keys(get().pendingByThreadKey).filter(
      (threadKey) => parseScopedThreadKey(threadKey)?.environmentId === environmentId,
    );
    if (clearedThreadKeys.length === 0) return;
    for (const threadKey of clearedThreadKeys) cancelPendingTimeout(threadKey);
    set((state) => {
      const pendingByThreadKey = Object.fromEntries(
        Object.entries(state.pendingByThreadKey).filter(
          ([threadKey]) => parseScopedThreadKey(threadKey)?.environmentId !== environmentId,
        ),
      );
      return { pendingByThreadKey };
    });
  },
  setEditor: (threadKey, editor) => {
    set((state) => {
      if (editor !== null) {
        return {
          editorByThreadKey: {
            ...state.editorByThreadKey,
            [threadKey]: editor,
          },
        };
      }
      if (state.editorByThreadKey[threadKey] === undefined) return state;
      const editorByThreadKey = { ...state.editorByThreadKey };
      delete editorByThreadKey[threadKey];
      return { editorByThreadKey };
    });
  },
}));
