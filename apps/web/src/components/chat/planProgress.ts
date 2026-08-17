export interface PlanProgressSnapshot {
  readonly completedSteps: number;
  readonly totalSteps: number;
  readonly steps: ReadonlyArray<{
    readonly status: "pending" | "inProgress" | "completed";
  }>;
}

export function currentPlanStepOrdinal(plan: PlanProgressSnapshot): number {
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
