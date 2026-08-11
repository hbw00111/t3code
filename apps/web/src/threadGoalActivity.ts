import {
  type OrchestrationThreadActivity,
  ProviderDriverKind,
  ThreadGoalActivityPayload,
  THREAD_GOAL_UPDATED_ACTIVITY_KIND,
  THREAD_GOAL_UPDATE_FAILED_ACTIVITY_KIND,
} from "@t3tools/contracts";
import * as Schema from "effect/Schema";

const isThreadGoalActivityPayload = Schema.is(ThreadGoalActivityPayload);
const CODEX_PROVIDER = ProviderDriverKind.make("codex");

export function providerSupportsThreadGoals(provider: ProviderDriverKind): boolean {
  return provider === CODEX_PROVIDER;
}

export type ThreadGoalActivityTranslationKey =
  | "chat.goalSet"
  | "chat.goalPaused"
  | "chat.goalResumed"
  | "chat.goalCleared"
  | "chat.goalCommandFailed";

export function threadGoalActivityTranslationKey(
  activity: OrchestrationThreadActivity,
): ThreadGoalActivityTranslationKey | null {
  if (activity.kind === THREAD_GOAL_UPDATE_FAILED_ACTIVITY_KIND) {
    return "chat.goalCommandFailed";
  }
  if (activity.kind !== THREAD_GOAL_UPDATED_ACTIVITY_KIND) {
    return null;
  }
  if (!isThreadGoalActivityPayload(activity.payload)) {
    return null;
  }
  switch (activity.payload.operation) {
    case "set":
      return "chat.goalSet";
    case "pause":
      return "chat.goalPaused";
    case "resume":
      return "chat.goalResumed";
    case "clear":
      return "chat.goalCleared";
  }
}
