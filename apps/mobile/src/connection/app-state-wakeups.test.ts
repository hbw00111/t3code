import { describe, expect, it } from "@effect/vitest";

import { mobileApplicationActiveWakeup } from "./app-state-wakeups";

describe("mobileApplicationActiveWakeup", () => {
  it("uses a fast probe when activation has no preceding background transition", () => {
    expect(mobileApplicationActiveWakeup(null)).toBe("application-active-probe");
  });

  it("replaces the session immediately after any real background suspension", () => {
    expect(mobileApplicationActiveWakeup(20_000)).toBe("application-active-reconnect");
  });
});
