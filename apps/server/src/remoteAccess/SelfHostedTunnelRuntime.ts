import * as NodeOS from "node:os";

import type { SelfHostedTunnelSettings, SelfHostedTunnelStatus } from "@t3tools/contracts";
import {
  validateSelfHostedTunnelSettings as validateSharedSelfHostedTunnelSettings,
  type ValidatedSelfHostedTunnelSettings,
} from "@t3tools/shared/selfHostedTunnel";
import { spawnReverseSshTunnel } from "@t3tools/ssh/reverseTunnel";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as Layer from "effect/Layer";
import * as PubSub from "effect/PubSub";
import * as Ref from "effect/Ref";
import * as Schema from "effect/Schema";
import * as Scope from "effect/Scope";
import * as Semaphore from "effect/Semaphore";
import * as Stream from "effect/Stream";
import * as HttpServer from "effect/unstable/http/HttpServer";
import * as ChildProcessSpawner from "effect/unstable/process/ChildProcessSpawner";

import { forkParked } from "../serverActivation.ts";
import * as ServerSettings from "../serverSettings.ts";

const SSH_CONNECTION_SETTLE_MS = 750;
const INITIAL_RETRY_DELAY_MS = 1_000;
const MAX_RETRY_DELAY_MS = 30_000;

export class SelfHostedTunnelConfigurationError extends Schema.TaggedErrorClass<SelfHostedTunnelConfigurationError>()(
  "SelfHostedTunnelConfigurationError",
  { message: Schema.String },
) {}

export class SelfHostedTunnelProcessError extends Schema.TaggedErrorClass<SelfHostedTunnelProcessError>()(
  "SelfHostedTunnelProcessError",
  { message: Schema.String },
) {}

export function validateSelfHostedTunnelSettings(
  settings: SelfHostedTunnelSettings,
): Effect.Effect<ValidatedSelfHostedTunnelSettings, SelfHostedTunnelConfigurationError> {
  return Effect.try({
    try: () => validateSharedSelfHostedTunnelSettings(settings),
    catch: (cause) =>
      new SelfHostedTunnelConfigurationError({
        message: cause instanceof Error ? cause.message : "Tunnel configuration is invalid.",
      }),
  });
}

function expandHomePath(path: string): string | undefined {
  if (path.length === 0) return undefined;
  if (path === "~") return NodeOS.homedir();
  return path.startsWith("~/") ? `${NodeOS.homedir()}/${path.slice(2)}` : path;
}

function nextRetryDelay(delayMs: number): number {
  return Math.min(delayMs * 2, MAX_RETRY_DELAY_MS);
}

function configKey(settings: SelfHostedTunnelSettings, localPort: number): string {
  return JSON.stringify({ settings, localPort });
}

export interface SelfHostedTunnelRuntimeShape {
  readonly getStatus: Effect.Effect<SelfHostedTunnelStatus>;
  readonly streamChanges: Stream.Stream<SelfHostedTunnelStatus>;
  readonly subscribeChanges: Effect.Effect<
    Stream.Stream<SelfHostedTunnelStatus>,
    never,
    Scope.Scope
  >;
  readonly applyConfig: (
    settings: SelfHostedTunnelSettings,
    localPort: number,
  ) => Effect.Effect<void>;
}

const disabledRuntime: SelfHostedTunnelRuntimeShape = {
  getStatus: Effect.succeed({ state: "disabled" }),
  streamChanges: Stream.empty,
  subscribeChanges: Effect.succeed(Stream.empty),
  applyConfig: () => Effect.void,
};

export class SelfHostedTunnelRuntime extends Context.Reference<SelfHostedTunnelRuntimeShape>(
  "t3/remoteAccess/SelfHostedTunnelRuntime",
  { defaultValue: () => disabledRuntime },
) {}

export interface SelfHostedTunnelRuntimeOptions<E = never, R = never> {
  readonly resolveLocalPort: Effect.Effect<number, E, R>;
}

export const make = Effect.fn("SelfHostedTunnelRuntime.make")(function* <E, R>(
  options: SelfHostedTunnelRuntimeOptions<E, R>,
) {
  const serverSettings = yield* ServerSettings.ServerSettingsService;
  const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
  const statusRef = yield* Ref.make<SelfHostedTunnelStatus>({ state: "disabled" });
  const statusPubSub = yield* PubSub.unbounded<SelfHostedTunnelStatus>();
  const activeScopeRef = yield* Ref.make<Scope.Closeable | null>(null);
  const activeConfigKeyRef = yield* Ref.make<string | null>(null);
  const applySemaphore = yield* Semaphore.make(1);

  const publishStatus = Effect.fn("SelfHostedTunnelRuntime.publishStatus")(function* (
    status: SelfHostedTunnelStatus,
  ) {
    yield* Ref.set(statusRef, status);
    yield* PubSub.publish(statusPubSub, status);
  });

  const stopActive = Effect.fn("SelfHostedTunnelRuntime.stopActive")(function* () {
    const activeScope = yield* Ref.getAndSet(activeScopeRef, null);
    if (activeScope) {
      yield* Scope.close(activeScope, Exit.void).pipe(Effect.ignore);
    }
  });

  const runAttempt = Effect.fn("SelfHostedTunnelRuntime.runAttempt")(function* (
    settings: ValidatedSelfHostedTunnelSettings,
    localPort: number,
  ) {
    const lastOutputRef = yield* Ref.make<string | null>(null);
    const identityFile = expandHomePath(settings.identityFile);
    const handle = yield* spawnReverseSshTunnel({
      sshHost: settings.sshHost,
      ...(settings.sshUser.length === 0 ? {} : { sshUser: settings.sshUser }),
      ...(settings.sshPort === null ? {} : { sshPort: settings.sshPort }),
      ...(identityFile === undefined ? {} : { identityFile }),
      remoteBindHost: settings.remoteBindHost,
      remotePort: settings.remotePort,
      localHost: "127.0.0.1",
      localPort,
    }).pipe(Effect.provideService(ChildProcessSpawner.ChildProcessSpawner, spawner));

    yield* handle.child.all.pipe(
      Stream.decodeText(),
      Stream.splitLines,
      Stream.map((line) => line.trim()),
      Stream.filter((line) => line.length > 0),
      Stream.runForEach((line) =>
        Ref.set(lastOutputRef, line).pipe(
          Effect.andThen(
            Effect.logDebug("Self-hosted SSH tunnel output", {
              pid: Number(handle.child.pid),
              output: line,
            }),
          ),
        ),
      ),
      Effect.catchCause((cause) =>
        Effect.logWarning("Self-hosted SSH tunnel output observer failed", {
          pid: Number(handle.child.pid),
          cause,
        }),
      ),
      Effect.forkScoped,
    );

    const first = yield* Effect.raceFirst(
      Effect.sleep(SSH_CONNECTION_SETTLE_MS).pipe(Effect.as({ type: "settled" as const })),
      handle.child.exitCode.pipe(
        Effect.map((exitCode) => ({ type: "exit" as const, exitCode: Number(exitCode) })),
      ),
    );
    if (first.type === "exit") {
      const output = yield* Ref.get(lastOutputRef);
      return yield* new SelfHostedTunnelProcessError({
        message: output ?? `SSH exited with code ${first.exitCode}.`,
      });
    }

    const running = yield* handle.child.isRunning.pipe(Effect.orElseSucceed(() => false));
    if (!running) {
      return yield* new SelfHostedTunnelProcessError({
        message: (yield* Ref.get(lastOutputRef)) ?? "SSH exited before the tunnel became ready.",
      });
    }

    yield* publishStatus({ state: "connected", pid: Number(handle.child.pid) });
    const exitCode = yield* handle.child.exitCode.pipe(Effect.map(Number));
    return yield* new SelfHostedTunnelProcessError({
      message: (yield* Ref.get(lastOutputRef)) ?? `SSH exited with code ${exitCode}.`,
    });
  });

  const supervise = Effect.fn("SelfHostedTunnelRuntime.supervise")(function* (
    settings: ValidatedSelfHostedTunnelSettings,
    localPort: number,
  ) {
    let attempt = 1;
    let retryDelayMs = INITIAL_RETRY_DELAY_MS;
    while (true) {
      yield* publishStatus({ state: "connecting", attempt });
      const result = yield* Effect.result(runAttempt(settings, localPort).pipe(Effect.scoped));
      if (result._tag === "Success") return;
      const message = result.failure.message;
      yield* Effect.logWarning("Self-hosted SSH tunnel disconnected; retrying", {
        attempt,
        retryDelayMs,
        message,
      });
      yield* publishStatus({
        state: "retrying",
        attempt,
        retryDelayMs,
        message,
      });
      yield* Effect.sleep(retryDelayMs);
      attempt += 1;
      retryDelayMs = nextRetryDelay(retryDelayMs);
    }
  });

  const applyConfig = (settings: SelfHostedTunnelSettings, localPort: number) =>
    applySemaphore.withPermits(1)(
      Effect.gen(function* () {
        const nextConfigKey = configKey(settings, localPort);
        if ((yield* Ref.get(activeConfigKeyRef)) === nextConfigKey) return;
        yield* Ref.set(activeConfigKeyRef, nextConfigKey);
        yield* stopActive();

        if (!settings.enabled) {
          yield* publishStatus({ state: "disabled" });
          return;
        }

        const validated = yield* Effect.result(validateSelfHostedTunnelSettings(settings));
        if (validated._tag === "Failure") {
          yield* publishStatus({ state: "failed", message: validated.failure.message });
          return;
        }

        const activeScope = yield* Scope.make("sequential");
        yield* Ref.set(activeScopeRef, activeScope);
        yield* Effect.forkIn(supervise(validated.success, localPort), activeScope);
      }),
    );

  const runtime = {
    getStatus: Ref.get(statusRef),
    streamChanges: Stream.fromPubSub(statusPubSub),
    subscribeChanges: PubSub.subscribe(statusPubSub).pipe(
      Effect.map((subscription) => Stream.fromSubscription(subscription)),
    ),
    applyConfig,
  } satisfies SelfHostedTunnelRuntimeShape;

  const watchSettings = Effect.gen(function* () {
    const changes = yield* serverSettings.subscribeChanges;
    yield* serverSettings.ready;
    const localPort = yield* options.resolveLocalPort;
    const initialSettings = yield* serverSettings.getSettings;
    yield* runtime.applyConfig(initialSettings.selfHostedTunnel, localPort);
    yield* Stream.runForEach(changes, (settings) =>
      runtime.applyConfig(settings.selfHostedTunnel, localPort),
    );
  }).pipe(
    Effect.catch((cause) =>
      publishStatus({
        state: "failed",
        message: cause instanceof Error ? cause.message : "Tunnel supervision failed.",
      }).pipe(
        Effect.andThen(
          Effect.logWarning("Self-hosted SSH tunnel settings supervisor failed", { cause }),
        ),
      ),
    ),
  );

  yield* forkParked(watchSettings);
  yield* Effect.addFinalizer(stopActive);
  return runtime;
});

export const layerWithOptions = <E, R>(options: SelfHostedTunnelRuntimeOptions<E, R>) =>
  Layer.effect(SelfHostedTunnelRuntime, make(options));

const resolveHttpServerLocalPort = Effect.fn("SelfHostedTunnelRuntime.resolveLocalPort")(
  function* () {
    const server = yield* HttpServer.HttpServer;
    const address = server.address;
    if (typeof address === "string" || !("port" in address)) {
      return yield* new SelfHostedTunnelConfigurationError({
        message: "The local server port is unavailable.",
      });
    }
    return address.port;
  },
);

export const layer = layerWithOptions({ resolveLocalPort: resolveHttpServerLocalPort() });
