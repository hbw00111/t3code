import type { Wakeups } from "@t3tools/client-runtime/connection";

export type WebApplicationActiveWakeup = Extract<
  Wakeups.ConnectionWakeup,
  "application-active-probe" | "application-active-reconnect"
>;

export function webApplicationActiveWakeup(wasHidden: boolean): WebApplicationActiveWakeup {
  return wasHidden ? "application-active-reconnect" : "application-active-probe";
}
