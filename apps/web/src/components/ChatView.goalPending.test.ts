import type { ReactNode } from "react";
import { EnvironmentId } from "@t3tools/contracts";
import { describe, expect, it, vi } from "vite-plus/test";

vi.mock("./DiffWorkerPoolProvider", () => ({
  DiffWorkerPoolProvider: ({ children }: { readonly children: ReactNode }) => children,
}));

import { clearPendingGoalCommandsAfterConnectionLoss } from "./ChatView";

describe("ChatView goal pending connection lifecycle", () => {
  it("clears every pending thread in an environment after it disconnects", () => {
    const firstEnvironmentId = EnvironmentId.make("environment-1");
    const secondEnvironmentId = EnvironmentId.make("environment-2");
    const clearEnvironment = vi.fn();

    clearPendingGoalCommandsAfterConnectionLoss({
      previous: null,
      current: new Map([
        [firstEnvironmentId, "connected"],
        [secondEnvironmentId, "connected"],
      ]),
      clearEnvironment,
    });
    expect(clearEnvironment).not.toHaveBeenCalled();

    clearPendingGoalCommandsAfterConnectionLoss({
      previous: new Map([
        [firstEnvironmentId, "connected"],
        [secondEnvironmentId, "connected"],
      ]),
      current: new Map([
        [firstEnvironmentId, "reconnecting"],
        [secondEnvironmentId, "connected"],
      ]),
      clearEnvironment,
    });
    expect(clearEnvironment).toHaveBeenCalledOnce();
    expect(clearEnvironment).toHaveBeenCalledWith(firstEnvironmentId);
  });

  it("does not treat mounting offline or another environment reconnecting as a disconnect edge", () => {
    const firstEnvironmentId = EnvironmentId.make("environment-1");
    const secondEnvironmentId = EnvironmentId.make("environment-2");
    const clearEnvironment = vi.fn();

    clearPendingGoalCommandsAfterConnectionLoss({
      previous: null,
      current: new Map([[firstEnvironmentId, "offline"]]),
      clearEnvironment,
    });
    clearPendingGoalCommandsAfterConnectionLoss({
      previous: new Map([
        [firstEnvironmentId, "connected"],
        [secondEnvironmentId, "reconnecting"],
      ]),
      current: new Map([
        [firstEnvironmentId, "connected"],
        [secondEnvironmentId, "offline"],
      ]),
      clearEnvironment,
    });
    expect(clearEnvironment).not.toHaveBeenCalled();
  });
});
