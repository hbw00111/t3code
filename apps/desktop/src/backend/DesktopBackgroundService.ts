import { fetchRemoteEnvironmentDescriptor } from "@t3tools/client-runtime/environment";
import {
  DESKTOP_SERVICE_BUNDLED_RUNTIME_ENV,
  type ExecutionEnvironmentDescriptor,
} from "@t3tools/contracts";
import { isLoopbackHost } from "@t3tools/shared/preview";
import * as Context from "effect/Context";
import * as Duration from "effect/Duration";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import * as Schema from "effect/Schema";
import * as HttpClient from "effect/unstable/http/HttpClient";
import * as ChildProcess from "effect/unstable/process/ChildProcess";
import * as ChildProcessSpawner from "effect/unstable/process/ChildProcessSpawner";

import * as DesktopEnvironment from "../app/DesktopEnvironment.ts";
import * as DesktopObservability from "../app/DesktopObservability.ts";

const SERVICE_LAUNCHER_PROTOCOL = 3;
const SERVICE_STATE_FILE = "service-state.json";
const SERVER_RUNTIME_STATE_FILE = "server-runtime.json";
const ENVIRONMENT_ID_FILE = "environment-id";
const DEFAULT_DISCOVERY_ATTEMPTS = 60;
const DEFAULT_DISCOVERY_INTERVAL = Duration.millis(500);
const SERVICE_COMMAND_TIMEOUT = Duration.minutes(2);

const ServiceStateDocument = Schema.Struct({
  protocol: Schema.Literal(SERVICE_LAUNCHER_PROTOCOL),
  activeVersion: Schema.String,
  runtimeSource: Schema.Literal("desktop-bundle"),
  desktopBootstrapToken: Schema.String,
});

const ServerRuntimeStateDocument = Schema.Struct({
  version: Schema.Literal(1),
  pid: Schema.Int,
  port: Schema.Int,
  origin: Schema.String,
});

const decodeServiceState = Schema.decodeUnknownEffect(Schema.fromJsonString(ServiceStateDocument));
const decodeServerRuntimeState = Schema.decodeUnknownEffect(
  Schema.fromJsonString(ServerRuntimeStateDocument),
);

export interface PreparedDesktopBackgroundService {
  readonly httpBaseUrl: URL;
  readonly port: number;
  readonly desktopBootstrapToken: string;
  readonly environmentId: string;
  readonly entryPath: string;
}

export class DesktopBackgroundServicePreparationError extends Schema.TaggedErrorClass<DesktopBackgroundServicePreparationError>()(
  "DesktopBackgroundServicePreparationError",
  {
    operation: Schema.Literals([
      "check-bundle",
      "install",
      "read-state",
      "decode-state",
      "validate-state",
      "fetch-descriptor",
      "uninstall",
    ]),
    cause: Schema.optional(Schema.Defect()),
  },
) {
  override get message(): string {
    return `Desktop background service preparation failed while ${this.operation}.`;
  }
}

export class DesktopBackgroundService extends Context.Reference<{
  readonly prepare: Effect.Effect<Option.Option<PreparedDesktopBackgroundService>>;
}>("@t3tools/desktop/backend/DesktopBackgroundService", {
  defaultValue: () => ({ prepare: Effect.succeed(Option.none()) }),
}) {}

export interface DesktopBackgroundServiceEnvironment {
  readonly isPackaged: boolean;
  readonly platform: NodeJS.Platform;
  readonly baseDir: string;
  readonly stateDir: string;
  readonly homeDirectory: string;
  readonly appVersion: string;
  readonly bundledServiceRuntimeDir: string;
  readonly bundledServiceEntryPath: string;
}

export interface DesktopBackgroundServiceDependencies {
  readonly runServiceCommand: (
    action: "install" | "uninstall",
  ) => Effect.Effect<void, DesktopBackgroundServicePreparationError>;
  readonly fetchDescriptor: (
    httpBaseUrl: string,
  ) => Effect.Effect<ExecutionEnvironmentDescriptor, DesktopBackgroundServicePreparationError>;
  readonly discoveryAttempts?: number;
  readonly discoveryInterval?: Duration.Duration;
}

const { logInfo, logWarning } = DesktopObservability.makeComponentLogger(
  "desktop-background-service",
);

export const makeWithDependencies = Effect.fn("desktop.backgroundService.makeWithDependencies")(
  function* (
    environment: DesktopBackgroundServiceEnvironment,
    dependencies: DesktopBackgroundServiceDependencies,
  ) {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;

    const fail = (
      operation: DesktopBackgroundServicePreparationError["operation"],
      cause?: unknown,
    ) =>
      new DesktopBackgroundServicePreparationError({
        operation,
        ...(cause === undefined ? {} : { cause }),
      });

    const discover = Effect.fn("desktop.backgroundService.discover")(function* () {
      const serviceStatePath = path.join(environment.baseDir, "runtime", SERVICE_STATE_FILE);
      const runtimeStatePath = path.join(environment.stateDir, SERVER_RUNTIME_STATE_FILE);
      const environmentIdPath = path.join(environment.stateDir, ENVIRONMENT_ID_FILE);
      const [serviceStateRaw, runtimeStateRaw, environmentIdRaw] = yield* Effect.all([
        fs.readFileString(serviceStatePath),
        fs.readFileString(runtimeStatePath),
        fs.readFileString(environmentIdPath),
      ]).pipe(Effect.mapError((cause) => fail("read-state", cause)));
      const [serviceState, runtimeState] = yield* Effect.all([
        decodeServiceState(serviceStateRaw),
        decodeServerRuntimeState(runtimeStateRaw),
      ]).pipe(Effect.mapError((cause) => fail("decode-state", cause)));
      const environmentId = environmentIdRaw.trim();
      const desktopBootstrapToken = serviceState.desktopBootstrapToken.trim();

      const httpBaseUrl = yield* Effect.try({
        try: () => new URL(runtimeState.origin),
        catch: (cause) => fail("validate-state", cause),
      });
      if (
        serviceState.activeVersion !== environment.appVersion ||
        desktopBootstrapToken.length === 0 ||
        environmentId.length === 0 ||
        runtimeState.port <= 0 ||
        runtimeState.port > 65_535 ||
        httpBaseUrl.protocol !== "http:" ||
        !isLoopbackHost(httpBaseUrl.hostname) ||
        httpBaseUrl.port !== String(runtimeState.port)
      ) {
        return yield* fail("validate-state");
      }

      const descriptor = yield* dependencies.fetchDescriptor(httpBaseUrl.href);
      if (
        descriptor.serverVersion !== environment.appVersion ||
        descriptor.environmentId !== environmentId
      ) {
        return yield* fail("validate-state");
      }

      return {
        httpBaseUrl,
        port: runtimeState.port,
        desktopBootstrapToken,
        environmentId,
        entryPath: environment.bundledServiceEntryPath,
      } satisfies PreparedDesktopBackgroundService;
    });

    const discoverWithRetry = (
      attemptsRemaining: number,
    ): Effect.Effect<PreparedDesktopBackgroundService, DesktopBackgroundServicePreparationError> =>
      discover().pipe(
        Effect.catch((error) =>
          attemptsRemaining <= 1
            ? Effect.fail(error)
            : Effect.sleep(dependencies.discoveryInterval ?? DEFAULT_DISCOVERY_INTERVAL).pipe(
                Effect.andThen(discoverWithRetry(attemptsRemaining - 1)),
              ),
        ),
      );

    let reconciled = false;
    const prepareOnce = Effect.gen(function* () {
      if (
        !environment.isPackaged ||
        (environment.platform !== "darwin" && environment.platform !== "linux")
      ) {
        return Option.none<PreparedDesktopBackgroundService>();
      }
      const entryExists = yield* fs
        .exists(environment.bundledServiceEntryPath)
        .pipe(Effect.mapError((cause) => fail("check-bundle", cause)));
      if (!entryExists) {
        yield* logWarning("bundled desktop background service is missing; using embedded backend", {
          entryPath: environment.bundledServiceEntryPath,
        });
        return Option.none<PreparedDesktopBackgroundService>();
      }

      yield* dependencies.runServiceCommand("install");
      reconciled = true;
      const prepared = yield* discoverWithRetry(
        Math.max(1, dependencies.discoveryAttempts ?? DEFAULT_DISCOVERY_ATTEMPTS),
      );
      yield* logInfo("desktop background service ready", {
        origin: prepared.httpBaseUrl.href,
        version: environment.appVersion,
      });
      return Option.some(prepared);
    }).pipe(
      Effect.catch((error) =>
        (reconciled ? dependencies.runServiceCommand("uninstall") : Effect.void).pipe(
          Effect.catch((uninstallError) =>
            logWarning("failed to remove incomplete desktop background service", {
              error: uninstallError.message,
            }),
          ),
          Effect.andThen(
            logWarning("desktop background service unavailable; using embedded backend", {
              error: error.message,
            }),
          ),
          Effect.as(Option.none<PreparedDesktopBackgroundService>()),
        ),
      ),
    );

    const prepare = yield* Effect.cached(prepareOnce);
    return DesktopBackgroundService.of({ prepare });
  },
);

export const make = Effect.gen(function* () {
  const environment = yield* DesktopEnvironment.DesktopEnvironment;
  const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
  const httpClient = yield* HttpClient.HttpClient;

  const runServiceCommand = Effect.fn("desktop.backgroundService.runServiceCommand")(function* (
    action: "install" | "uninstall",
  ) {
    const command = ChildProcess.make(
      process.execPath,
      [environment.bundledServiceEntryPath, "service", action, "--base-dir", environment.baseDir],
      {
        cwd: environment.homeDirectory,
        env: {
          ELECTRON_RUN_AS_NODE: "1",
          [DESKTOP_SERVICE_BUNDLED_RUNTIME_ENV]: environment.bundledServiceRuntimeDir,
        },
        extendEnv: true,
        stdout: "ignore",
        stderr: "ignore",
        killSignal: "SIGTERM",
        forceKillAfter: "5 seconds",
      },
    );
    const exitCode = yield* Effect.scoped(
      spawner.spawn(command).pipe(Effect.flatMap((child) => child.exitCode)),
    ).pipe(
      Effect.timeoutOption(SERVICE_COMMAND_TIMEOUT),
      Effect.mapError(
        (cause) => new DesktopBackgroundServicePreparationError({ operation: action, cause }),
      ),
    );
    if (Option.isNone(exitCode) || Number(exitCode.value) !== 0) {
      return yield* new DesktopBackgroundServicePreparationError({ operation: action });
    }
  });

  return yield* makeWithDependencies(
    {
      isPackaged: environment.isPackaged,
      platform: environment.platform,
      baseDir: environment.baseDir,
      stateDir: environment.stateDir,
      homeDirectory: environment.homeDirectory,
      appVersion: environment.appVersion,
      bundledServiceRuntimeDir: environment.bundledServiceRuntimeDir,
      bundledServiceEntryPath: environment.bundledServiceEntryPath,
    },
    {
      runServiceCommand,
      fetchDescriptor: (httpBaseUrl) =>
        fetchRemoteEnvironmentDescriptor({ httpBaseUrl, timeoutMs: 1_000 }).pipe(
          Effect.mapError(
            (cause) =>
              new DesktopBackgroundServicePreparationError({
                operation: "fetch-descriptor",
                cause,
              }),
          ),
          Effect.provideService(HttpClient.HttpClient, httpClient),
        ),
    },
  );
});

export const layer = Layer.effect(DesktopBackgroundService, make);
