import type { Wakeups } from "@t3tools/client-runtime/connection";
import * as Effect from "effect/Effect";
import * as Queue from "effect/Queue";
import * as Stream from "effect/Stream";

type MobileNetworkPathWakeup = Extract<Wakeups.ConnectionWakeup, "network-path-changed">;

interface NetworkPathSubscription {
  readonly remove: () => void;
}

export function mobileNetworkPathWakeups<State>(
  subscribe: (listener: (state: State) => void) => NetworkPathSubscription,
): Stream.Stream<MobileNetworkPathWakeup> {
  return Stream.callback((queue) =>
    Effect.acquireRelease(
      Effect.sync(() => {
        let receivedBaseline = false;
        return subscribe(() => {
          if (!receivedBaseline) {
            receivedBaseline = true;
            return;
          }
          Queue.offerUnsafe(queue, "network-path-changed");
        });
      }),
      (subscription) => Effect.sync(subscription.remove),
    ).pipe(Effect.asVoid),
  );
}
