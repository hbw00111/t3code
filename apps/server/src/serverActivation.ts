import * as Context from "effect/Context";
import * as Deferred from "effect/Deferred";
import * as Effect from "effect/Effect";
import type * as Scope from "effect/Scope";

export class ServerActivation extends Context.Reference<Effect.Effect<void> | undefined>(
  "t3/serverActivation",
  { defaultValue: () => undefined },
) {}

export class ServerPostReady extends Context.Reference<Effect.Effect<void> | undefined>(
  "t3/serverPostReady",
  { defaultValue: () => undefined },
) {}

const forkParkedAt = <A, E, R>(
  gate: Effect.Effect<void> | undefined,
  effect: Effect.Effect<A, E, R>,
): Effect.Effect<void, never, Scope.Scope | R> =>
  Effect.gen(function* () {
    if (gate === undefined) {
      yield* Effect.forkScoped(effect);
      return;
    }
    const parked = yield* Deferred.make<void>();
    yield* Effect.forkScoped(
      Deferred.succeed(parked, undefined).pipe(Effect.andThen(gate), Effect.andThen(effect)),
    );
    yield* Deferred.await(parked);
  });

/** Forks a long-running root before commit and proves it is parked at the activation boundary. */
export const forkParked = <A, E, R>(
  effect: Effect.Effect<A, E, R>,
): Effect.Effect<void, never, Scope.Scope | R> =>
  Effect.gen(function* () {
    const activation = yield* ServerActivation;
    yield* forkParkedAt(activation, effect);
  });

/** Forks background work before startup and releases it only after the ready event is published. */
export const forkAfterServerReady = <A, E, R>(
  effect: Effect.Effect<A, E, R>,
): Effect.Effect<void, never, Scope.Scope | R> =>
  Effect.gen(function* () {
    const postReady = yield* ServerPostReady;
    yield* forkParkedAt(postReady, effect);
  });
