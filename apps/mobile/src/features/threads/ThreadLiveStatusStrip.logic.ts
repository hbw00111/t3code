import type { CommandId, OrchestrationThreadActivity, ThreadGoalStatus } from "@t3tools/contracts";
import {
  THREAD_GOAL_READ_ACTIVITY_KIND,
  THREAD_GOAL_UPDATED_ACTIVITY_KIND,
  THREAD_GOAL_UPDATE_FAILED_ACTIVITY_KIND,
} from "@t3tools/contracts";

export type ThreadGoalAction = "get" | "set" | "pause" | "resume" | "clear";

export interface ThreadLivePlanStep {
  readonly step: string;
  readonly status: "pending" | "inProgress" | "completed";
}

export interface ThreadLivePlanStatus {
  readonly currentStep: string;
  readonly completedSteps: number;
  readonly totalSteps: number;
  readonly steps: ReadonlyArray<ThreadLivePlanStep>;
}

export function currentThreadPlanStepOrdinal(plan: ThreadLivePlanStatus): number {
  const totalSteps = plan.steps.length > 0 ? plan.steps.length : plan.totalSteps;
  if (totalSteps === 0) return 0;

  if (plan.steps.length === 0) {
    const completedSteps = Math.max(0, Math.min(plan.completedSteps, totalSteps));
    return completedSteps === totalSteps ? totalSteps : completedSteps + 1;
  }

  const activeIndex = plan.steps.findIndex((step) => step.status === "inProgress");
  if (activeIndex >= 0) return activeIndex + 1;

  const pendingIndex = plan.steps.findIndex((step) => step.status === "pending");
  return pendingIndex >= 0 ? pendingIndex + 1 : totalSteps;
}

const PLAN_ROW_HEIGHT = 40;
const GOAL_ROW_HEIGHT = 56;
const STRIP_FRAME_HEIGHT = 10;

export function estimateThreadLiveStatusHeight(input: {
  readonly plan: ThreadLivePlanStatus | null;
  readonly hasGoal: boolean;
}): number {
  if (!input.plan && !input.hasGoal) return 0;
  return (
    STRIP_FRAME_HEIGHT + (input.plan ? PLAN_ROW_HEIGHT : 0) + (input.hasGoal ? GOAL_ROW_HEIGHT : 0)
  );
}

export function formatThreadGoalTime(totalSeconds: number): string {
  const seconds = Math.max(0, Math.floor(totalSeconds));
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return remainder === 0 ? `${hours}h` : `${hours}h ${remainder}m`;
}

export function threadGoalStatusLabel(status: ThreadGoalStatus): string {
  switch (status) {
    case "active":
      return "Active";
    case "paused":
      return "Paused";
    case "blocked":
      return "Blocked";
    case "complete":
      return "Complete";
    case "budgetLimited":
      return "Budget limited";
    case "usageLimited":
      return "Usage limited";
  }
}

export interface GoalObjectiveEditorState {
  readonly editing: boolean;
  readonly draftObjective: string;
  readonly submittedObjective: string | null;
}

export type GoalObjectiveEditorAction =
  | { readonly type: "sync"; readonly objective: string | null }
  | { readonly type: "begin"; readonly objective: string }
  | { readonly type: "change"; readonly objective: string }
  | { readonly type: "cancel"; readonly objective: string }
  | {
      readonly type: "submitAccepted";
      readonly objective: string;
      readonly snapshotObjective: string | null;
    };

export function reduceGoalObjectiveEditor(
  state: GoalObjectiveEditorState,
  action: GoalObjectiveEditorAction,
): GoalObjectiveEditorState {
  switch (action.type) {
    case "sync":
      if (action.objective === null) {
        return { editing: false, draftObjective: "", submittedObjective: null };
      }
      if (!state.editing) {
        return { ...state, draftObjective: action.objective, submittedObjective: null };
      }
      if (state.submittedObjective !== null && action.objective === state.submittedObjective) {
        return {
          editing: false,
          draftObjective: action.objective,
          submittedObjective: null,
        };
      }
      return state;
    case "begin":
      return { editing: true, draftObjective: action.objective, submittedObjective: null };
    case "change":
      return { ...state, draftObjective: action.objective, submittedObjective: null };
    case "cancel":
      return { editing: false, draftObjective: action.objective, submittedObjective: null };
    case "submitAccepted":
      if (action.snapshotObjective === action.objective) {
        return {
          editing: false,
          draftObjective: action.objective,
          submittedObjective: null,
        };
      }
      return { ...state, submittedObjective: action.objective };
  }
}

export interface ThreadGoalCommandReceipt {
  readonly failed: boolean;
  readonly detail: string | null;
}

export function findThreadGoalCommandReceipt(
  activities: ReadonlyArray<OrchestrationThreadActivity>,
  commandId: CommandId,
): ThreadGoalCommandReceipt | null {
  for (let index = activities.length - 1; index >= 0; index -= 1) {
    const activity = activities[index];
    if (
      !activity ||
      (activity.kind !== THREAD_GOAL_UPDATED_ACTIVITY_KIND &&
        activity.kind !== THREAD_GOAL_READ_ACTIVITY_KIND &&
        activity.kind !== THREAD_GOAL_UPDATE_FAILED_ACTIVITY_KIND) ||
      typeof activity.payload !== "object" ||
      activity.payload === null
    ) {
      continue;
    }
    const payload = activity.payload as Record<string, unknown>;
    if (payload.commandId !== commandId) continue;
    return {
      failed: activity.kind === THREAD_GOAL_UPDATE_FAILED_ACTIVITY_KIND,
      detail: typeof payload.detail === "string" ? payload.detail : null,
    };
  }
  return null;
}
