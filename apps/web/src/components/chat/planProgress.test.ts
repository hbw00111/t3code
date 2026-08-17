import { describe, expect, it } from "vite-plus/test";

import { currentPlanStepOrdinal } from "./planProgress.ts";

describe("currentPlanStepOrdinal", () => {
  it("shows the active step instead of the number of completed steps", () => {
    expect(
      currentPlanStepOrdinal({
        completedSteps: 0,
        totalSteps: 3,
        steps: [{ status: "inProgress" }, { status: "pending" }, { status: "pending" }],
      }),
    ).toBe(1);
  });

  it("shows the total after every step completes", () => {
    expect(
      currentPlanStepOrdinal({
        completedSteps: 3,
        totalSteps: 3,
        steps: [{ status: "completed" }, { status: "completed" }, { status: "completed" }],
      }),
    ).toBe(3);
  });
});
