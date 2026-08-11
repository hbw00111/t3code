import {
  type OrchestrationThreadActivity,
  ProviderDriverKind,
  ThreadGoalActivityPayload,
  THREAD_GOAL_READ_ACTIVITY_KIND,
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
  | "chat.goalNotSet"
  | "chat.goalStatusActive"
  | "chat.goalStatusPaused"
  | "chat.goalStatusBlocked"
  | "chat.goalStatusBudgetLimited"
  | "chat.goalStatusComplete"
  | "chat.goalStatusUsageLimited"
  | "chat.goalCommandFailed";

export function threadGoalActivityTranslationKey(
  activity: OrchestrationThreadActivity,
): ThreadGoalActivityTranslationKey | null {
  if (activity.kind === THREAD_GOAL_UPDATE_FAILED_ACTIVITY_KIND) {
    return "chat.goalCommandFailed";
  }
  if (
    activity.kind !== THREAD_GOAL_UPDATED_ACTIVITY_KIND &&
    activity.kind !== THREAD_GOAL_READ_ACTIVITY_KIND
  ) {
    return null;
  }
  if (!isThreadGoalActivityPayload(activity.payload)) {
    return null;
  }
  switch (activity.payload.operation) {
    case "get":
      if (activity.payload.goal === null || activity.payload.goal === undefined) {
        return "chat.goalNotSet";
      }
      switch (activity.payload.goal.status) {
        case "active":
          return "chat.goalStatusActive";
        case "paused":
          return "chat.goalStatusPaused";
        case "blocked":
          return "chat.goalStatusBlocked";
        case "budgetLimited":
          return "chat.goalStatusBudgetLimited";
        case "complete":
          return "chat.goalStatusComplete";
        case "usageLimited":
          return "chat.goalStatusUsageLimited";
      }
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

export function threadGoalActivityTranslationValues(
  activity: OrchestrationThreadActivity,
): Record<string, string | number> | undefined {
  if (!isThreadGoalActivityPayload(activity.payload) || activity.payload.goal == null) {
    return undefined;
  }
  return {
    objective: activity.payload.goal.objective,
    tokensUsed: activity.payload.goal.tokensUsed,
    timeUsedSeconds: activity.payload.goal.timeUsedSeconds,
  };
}
