import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Fiber from "effect/Fiber";
import * as Stream from "effect/Stream";

import { mobileNetworkPathWakeups } from "./network-path-wakeups";

describe("mobileNetworkPathWakeups", () => {
  it.effect("ignores the baseline and emits repeated online notifications", () =>
    Effect.gen(function* () {
      const listenerRef: {
        current: ((state: { readonly isConnected: boolean }) => void) | null;
      } = { current: null };
      let removed = false;
      let resolveRegistered: () => void = () => undefined;
      const registered = new Promise<void>((resolve) => {
        resolveRegistered = resolve;
      });
      let emitted = 0;
      const eventsFiber = yield* mobileNetworkPathWakeups<{ readonly isConnected: boolean }>(
        (next) => {
          listenerRef.current = next;
          resolveRegistered();
          return {
            remove: () => {
              removed = true;
            },
          };
        },
      ).pipe(
        Stream.tap(() =>
          Effect.sync(() => {
            emitted += 1;
          }),
        ),
        Stream.take(2),
        Stream.runCollect,
        Effect.forkChild,
      );

      yield* Effect.promise(() => registered);
      expect(listenerRef.current).not.toBeNull();
      listenerRef.current?.({ isConnected: false });
      yield* Effect.yieldNow;
      expect(emitted).toBe(0);

      listenerRef.current?.({ isConnected: true });
      listenerRef.current?.({ isConnected: true });

      const events = yield* Fiber.join(eventsFiber);
      expect(events).toEqual(["network-path-changed", "network-path-changed"]);
      expect(removed).toBe(true);
    }),
  );
});
