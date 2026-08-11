import { expect, it } from "@effect/vitest";
import * as Deferred from "effect/Deferred";
import * as Effect from "effect/Effect";

import {
  forkAfterServerReady,
  forkParked,
  ServerActivation,
  ServerPostReady,
} from "./serverActivation.ts";

it.effect("proves a root is parked before returning and releases it with one gate", () =>
  Effect.scoped(
    Effect.gen(function* () {
      const activation = yield* Deferred.make<void>();
      const ran = yield* Deferred.make<void>();

      yield* forkParked(Deferred.succeed(ran, undefined)).pipe(
        Effect.provideService(ServerActivation, Deferred.await(activation)),
      );
      expect(yield* Deferred.isDone(ran)).toBe(false);

      yield* Deferred.succeed(activation, undefined);
      yield* Deferred.await(ran);
      expect(yield* Deferred.isDone(ran)).toBe(true);
    }),
  ),
);

it.effect("keeps background work parked until server readiness is released", () =>
  Effect.scoped(
    Effect.gen(function* () {
      const backgroundActivation = yield* Deferred.make<void>();
      const ran = yield* Deferred.make<void>();

      yield* forkAfterServerReady(Deferred.succeed(ran, undefined)).pipe(
        Effect.provideService(ServerPostReady, Deferred.await(backgroundActivation)),
      );
      expect(yield* Deferred.isDone(ran)).toBe(false);

      yield* Deferred.succeed(backgroundActivation, undefined);
      yield* Deferred.await(ran);
      expect(yield* Deferred.isDone(ran)).toBe(true);
    }),
  ),
);
