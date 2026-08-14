/**
 * ThreadPlanProgressService - in-memory per-thread plan progress for the
 * Working indicators (sidebar rows, in-chat working line).
 *
 * Plans are a progress annotation, not a surface of their own: the useful
 * kernel of a turn.plan.updated event is "which step is the agent on right
 * now". Ingestion records the current step here and the shell query reads it
 * at mapping time — no persistence, no migration (same pattern as
 * ThreadBackgroundLivenessService). Cleared when the turn settles or the
 * session dies, so a finished plan never lingers as stale UI.
 *
 * @module ThreadPlanProgressService
 */
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";

export interface ThreadPlanProgress {
  readonly step: string;
  readonly completedSteps: number;
  readonly totalSteps: number;
  readonly steps: ReadonlyArray<PlanStepInput>;
}

export interface PlanStepInput {
  readonly step: string;
  readonly status: "pending" | "inProgress" | "completed";
}

export class ThreadPlanProgressService extends Context.Service<
  ThreadPlanProgressService,
  {
    /**
     * Feed one turn.plan.updated payload. The final all-completed snapshot is
     * retained until the turn settles so clients can render the real total.
     */
    readonly recordPlanProgress: (threadId: string, plan: ReadonlyArray<PlanStepInput>) => void;

    /** Turn settled or session died: the working indicator reverts to plain. */
    readonly clearThreadPlanProgress: (threadId: string) => void;

    readonly getThreadPlanProgress: (threadId: string) => ThreadPlanProgress | null;
  }
>()("t3/orchestration/ThreadPlanProgress/ThreadPlanProgressService") {}

export function make(): ThreadPlanProgressService["Service"] {
  const progressByThreadId = new Map<string, ThreadPlanProgress>();

  return {
    recordPlanProgress: (threadId, plan) => {
      const totalSteps = plan.length;
      const completedSteps = plan.filter((step) => step.status === "completed").length;
      // Current step: the in-progress one, else the first pending one (a
      // plan that was just written has no in-progress step yet).
      const current =
        plan.find((step) => step.status === "inProgress") ??
        plan.find((step) => step.status !== "completed") ??
        plan.at(-1);
      if (totalSteps === 0 || current === undefined) {
        progressByThreadId.delete(threadId);
        return;
      }
      progressByThreadId.set(threadId, {
        step: current.step,
        completedSteps,
        totalSteps,
        steps: plan.map((step) => ({ ...step })),
      });
    },

    clearThreadPlanProgress: (threadId) => {
      progressByThreadId.delete(threadId);
    },

    getThreadPlanProgress: (threadId) => progressByThreadId.get(threadId) ?? null,
  };
}

export const layer = Layer.effect(ThreadPlanProgressService, Effect.sync(make));
