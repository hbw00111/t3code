import { describe, expect, it } from "@effect/vitest";
import {
  CommandId,
  EventId,
  THREAD_GOAL_UPDATED_ACTIVITY_KIND,
  THREAD_GOAL_UPDATE_FAILED_ACTIVITY_KIND,
  type OrchestrationThreadActivity,
} from "@t3tools/contracts";

import {
  estimateThreadLiveStatusHeight,
  findThreadGoalCommandReceipt,
  formatThreadGoalTime,
  reduceGoalObjectiveEditor,
  threadGoalStatusLabel,
  type GoalObjectiveEditorState,
} from "./ThreadLiveStatusStrip.logic";

const editingState: GoalObjectiveEditorState = {
  editing: true,
  draftObjective: "Keep this draft",
  submittedObjective: null,
};

function activity(input: {
  readonly id: string;
  readonly kind: string;
  readonly commandId: CommandId;
  readonly detail?: string;
}): OrchestrationThreadActivity {
  return {
    id: EventId.make(input.id),
    tone: input.kind === THREAD_GOAL_UPDATE_FAILED_ACTIVITY_KIND ? "error" : "info",
    kind: input.kind,
    summary: "Goal receipt",
    payload: {
      commandId: input.commandId,
      operation: "set",
      ...(input.detail ? { detail: input.detail } : {}),
    },
    turnId: null,
    createdAt: "2026-08-12T00:00:00.000Z",
  };
}

describe("mobile thread live status", () => {
  it("estimates the initial composer inset for every visible row", () => {
    const plan = {
      currentStep: "Test mobile",
      completedSteps: 1,
      totalSteps: 3,
      steps: [
        { step: "Inspect mobile", status: "completed" as const },
        { step: "Test mobile", status: "inProgress" as const },
        { step: "Ship mobile", status: "pending" as const },
      ],
    };
    expect(estimateThreadLiveStatusHeight({ plan: null, hasGoal: false })).toBe(0);
    expect(estimateThreadLiveStatusHeight({ plan, hasGoal: false })).toBe(50);
    expect(estimateThreadLiveStatusHeight({ plan: null, hasGoal: true })).toBe(66);
    expect(estimateThreadLiveStatusHeight({ plan, hasGoal: true })).toBe(106);
  });

  it("formats goal status, usage time, and long durations", () => {
    expect(threadGoalStatusLabel("budgetLimited")).toBe("Budget limited");
    expect(formatThreadGoalTime(45)).toBe("45s");
    expect(formatThreadGoalTime(125)).toBe("2m");
    expect(formatThreadGoalTime(7_500)).toBe("2h 5m");
  });

  it("keeps an accepted objective edit open until the matching snapshot arrives", () => {
    const accepted = reduceGoalObjectiveEditor(editingState, {
      type: "submitAccepted",
      objective: "Ship the strip",
      snapshotObjective: "Old objective",
    });
    expect(accepted).toEqual({
      ...editingState,
      submittedObjective: "Ship the strip",
    });
    expect(
      reduceGoalObjectiveEditor(accepted, { type: "sync", objective: "Old objective" }),
    ).toEqual(accepted);
    expect(
      reduceGoalObjectiveEditor(accepted, { type: "sync", objective: "Ship the strip" }),
    ).toEqual({
      editing: false,
      draftObjective: "Ship the strip",
      submittedObjective: null,
    });
  });

  it("preserves the objective draft when a mutation is not accepted", () => {
    expect(editingState).toEqual({
      editing: true,
      draftObjective: "Keep this draft",
      submittedObjective: null,
    });
  });

  it("matches goal receipts by command id and surfaces provider failure detail", () => {
    const pendingId = CommandId.make("pending-goal-command");
    const otherId = CommandId.make("other-goal-command");
    const activities = [
      activity({
        id: "other",
        kind: THREAD_GOAL_UPDATED_ACTIVITY_KIND,
        commandId: otherId,
      }),
      activity({
        id: "pending",
        kind: THREAD_GOAL_UPDATE_FAILED_ACTIVITY_KIND,
        commandId: pendingId,
        detail: "Provider rejected the objective",
      }),
    ];

    expect(findThreadGoalCommandReceipt(activities, pendingId)).toEqual({
      failed: true,
      detail: "Provider rejected the objective",
    });
    expect(findThreadGoalCommandReceipt(activities, CommandId.make("missing"))).toBeNull();
  });
});
