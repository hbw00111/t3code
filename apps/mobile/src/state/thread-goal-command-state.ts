import { useAtomValue } from "@effect/atom-react";
import type { CommandId, EnvironmentId } from "@t3tools/contracts";
import { Atom } from "effect/unstable/reactivity";

import type { ThreadGoalAction } from "../features/threads/ThreadLiveStatusStrip.logic";
import { appAtomRegistry } from "./atom-registry";

export const GOAL_COMMAND_PENDING_TIMEOUT_MS = 60_000;

export interface PendingThreadGoalCommand {
  readonly environmentId: EnvironmentId;
  readonly threadKey: string;
  readonly commandId: CommandId;
  readonly action: ThreadGoalAction;
}

export const pendingGoalCommandsAtom = Atom.make<
  Readonly<Record<string, PendingThreadGoalCommand>>
>({}).pipe(Atom.keepAlive, Atom.withLabel("mobile:thread-goal:pending-commands"));

const pendingTimeouts = new Map<string, ReturnType<typeof setTimeout>>();

function cancelPendingTimeout(threadKey: string): void {
  const timeout = pendingTimeouts.get(threadKey);
  if (timeout === undefined) return;
  clearTimeout(timeout);
  pendingTimeouts.delete(threadKey);
}

export function beginPendingGoalCommand(pending: PendingThreadGoalCommand): boolean {
  const current = appAtomRegistry.get(pendingGoalCommandsAtom);
  if (current[pending.threadKey] !== undefined) return false;

  appAtomRegistry.set(pendingGoalCommandsAtom, {
    ...current,
    [pending.threadKey]: pending,
  });
  cancelPendingTimeout(pending.threadKey);
  pendingTimeouts.set(
    pending.threadKey,
    setTimeout(() => {
      pendingTimeouts.delete(pending.threadKey);
      clearPendingGoalCommand(pending.threadKey, pending.commandId);
    }, GOAL_COMMAND_PENDING_TIMEOUT_MS),
  );
  return true;
}

export function clearPendingGoalCommand(threadKey: string, commandId: CommandId): void {
  const current = appAtomRegistry.get(pendingGoalCommandsAtom);
  if (current[threadKey]?.commandId !== commandId) return;

  cancelPendingTimeout(threadKey);
  const next = { ...current };
  delete next[threadKey];
  appAtomRegistry.set(pendingGoalCommandsAtom, next);
}

export function clearPendingGoalCommandsForEnvironment(environmentId: EnvironmentId): void {
  const current = appAtomRegistry.get(pendingGoalCommandsAtom);
  const matching = Object.values(current).filter(
    (pending) => pending.environmentId === environmentId,
  );
  if (matching.length === 0) return;

  const next = { ...current };
  for (const pending of matching) {
    cancelPendingTimeout(pending.threadKey);
    delete next[pending.threadKey];
  }
  appAtomRegistry.set(pendingGoalCommandsAtom, next);
}

export function usePendingGoalCommands(): Readonly<Record<string, PendingThreadGoalCommand>> {
  return useAtomValue(pendingGoalCommandsAtom);
}
