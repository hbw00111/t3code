import { describe, expect, it } from "@effect/vitest";

import { webApplicationActiveWakeup } from "./app-state-wakeups.ts";

describe("webApplicationActiveWakeup", () => {
  it("probes when the page did not leave the foreground", () => {
    expect(webApplicationActiveWakeup(false)).toBe("application-active-probe");
  });

  it("replaces the connection after the page was hidden", () => {
    expect(webApplicationActiveWakeup(true)).toBe("application-active-reconnect");
  });
});
