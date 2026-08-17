import { HostProcessExecutablePath, HostProcessPlatform } from "@t3tools/shared/hostProcess";
import * as Config from "effect/Config";
import * as Context from "effect/Context";
import * as Crypto from "effect/Crypto";
import * as DateTime from "effect/DateTime";
import * as Duration from "effect/Duration";
import * as Effect from "effect/Effect";
import * as Encoding from "effect/Encoding";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import * as Schema from "effect/Schema";

import * as ProcessRunner from "../processRunner.ts";
import {
  ensurePinnedRuntimeInstalled,
  pinnedRuntimePaths,
  PinnedRuntimeInstallError,
} from "./pinnedRuntime.ts";
import {
  SERVICE_LAUNCHER_FILE,
  SERVICE_LAUNCHER_PROTOCOL,
  SERVICE_KEEP_AWAKE_ENV,
  SERVICE_STATE_FILE,
  parseServiceState,
  serviceStateHasPendingUpdate,
  type ServiceRuntimeSource,
  type ServiceState,
} from "./serviceProtocol.ts";

const BOOT_SERVICE_NAME = "t3code";
export const BOOT_SERVICE_UNIT_FILE = `${BOOT_SERVICE_NAME}.service`;
export const BOOT_SERVICE_UNIT_ENV = "T3_BOOT_SERVICE_UNIT";
export const BOOT_SERVICE_LAUNCH_AGENT_LABEL = "com.t3tools.t3code.service";
export const BOOT_SERVICE_LAUNCH_AGENT_FILE = `${BOOT_SERVICE_LAUNCH_AGENT_LABEL}.plist`;

/** systemd expands `%` specifiers, including in unquoted append-log paths. */
export function escapeSystemdSpecifiers(value: string): string {
  return value.replaceAll("%", "%%");
}

export function quoteSystemdValue(value: string): string {
  const escaped = escapeSystemdSpecifiers(value);
  return /[\s"'\\]/.test(escaped)
    ? `"${escaped.replaceAll("\\", "\\\\").replaceAll('"', '\\"')}"`
    : escaped;
}

export interface BootServicePlan {
  readonly nodePath: string;
  readonly launcherPath: string;
  readonly baseDir: string;
  readonly logPath: string;
  readonly unitPath: string;
  readonly environment?: Readonly<Record<string, string>>;
}

function escapePlistValue(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

/** Pure renderer: service units cannot rely on the user's shell or PATH. */
export function renderBootServiceUnit(plan: BootServicePlan): string {
  // The user manager has no reliable network-online target; server networking retries itself.
  return [
    "[Unit]",
    "Description=T3 Code server",
    "StartLimitIntervalSec=300",
    "StartLimitBurst=5",
    "",
    "[Service]",
    "Type=simple",
    "WorkingDirectory=%h",
    `Environment=T3CODE_HOME=${quoteSystemdValue(plan.baseDir)}`,
    `Environment=${BOOT_SERVICE_UNIT_ENV}=${BOOT_SERVICE_UNIT_FILE}`,
    ...Object.entries(plan.environment ?? {})
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, value]) => `Environment=${key}=${quoteSystemdValue(value)}`),
    `ExecStart=${quoteSystemdValue(plan.nodePath)} ${quoteSystemdValue(plan.launcherPath)}`,
    // Let the launcher mark an explicit stop before it signals the server.
    // systemd still SIGKILLs the whole cgroup if graceful shutdown times out.
    "KillMode=mixed",
    // Agent tool calls run as children of the server, so they share this cgroup.
    // With the systemd default of OOMPolicy=stop, the kernel killing one greedy
    // child stops the whole unit: the server, every live agent, and the user's
    // connection. Keep running and let Restart=always cover the main process.
    "OOMPolicy=continue",
    "Restart=always",
    "RestartSec=5",
    `StandardOutput=append:${escapeSystemdSpecifiers(plan.logPath)}`,
    `StandardError=append:${escapeSystemdSpecifiers(plan.logPath)}`,
    "",
    "[Install]",
    "WantedBy=default.target",
    "",
  ].join("\n");
}

/** Pure renderer: LaunchAgents run without a login shell or inherited PATH. */
export function renderBootServiceLaunchAgent(plan: BootServicePlan): string {
  const string = (value: string) => `<string>${escapePlistValue(value)}</string>`;
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "https://www.apple.com/DTDs/PropertyList-1.0.dtd">',
    '<plist version="1.0">',
    "<dict>",
    "  <key>Label</key>",
    `  ${string(BOOT_SERVICE_LAUNCH_AGENT_LABEL)}`,
    "  <key>ProgramArguments</key>",
    "  <array>",
    `    ${string(plan.nodePath)}`,
    `    ${string(plan.launcherPath)}`,
    "  </array>",
    "  <key>EnvironmentVariables</key>",
    "  <dict>",
    "    <key>T3CODE_HOME</key>",
    `    ${string(plan.baseDir)}`,
    `    <key>${BOOT_SERVICE_UNIT_ENV}</key>`,
    `    ${string(BOOT_SERVICE_LAUNCH_AGENT_FILE)}`,
    `    <key>${SERVICE_KEEP_AWAKE_ENV}</key>`,
    "    <string>1</string>",
    ...Object.entries(plan.environment ?? {})
      .sort(([left], [right]) => left.localeCompare(right))
      .flatMap(([key, value]) => [
        `    <key>${escapePlistValue(key)}</key>`,
        `    ${string(value)}`,
      ]),
    "  </dict>",
    "  <key>KeepAlive</key>",
    "  <true/>",
    "  <key>RunAtLoad</key>",
    "  <true/>",
    "  <key>ThrottleInterval</key>",
    "  <integer>5</integer>",
    "  <key>ExitTimeOut</key>",
    "  <integer>10</integer>",
    "  <key>StandardOutPath</key>",
    `  ${string(plan.logPath)}`,
    "  <key>StandardErrorPath</key>",
    `  ${string(plan.logPath)}`,
    "</dict>",
    "</plist>",
    "",
  ].join("\n");
}

export class BootServiceUnsupportedError extends Schema.TaggedErrorClass<BootServiceUnsupportedError>()(
  "BootServiceUnsupportedError",
  { platform: Schema.String },
) {
  override get message(): string {
    return `Background setup supports Linux with systemd and macOS with launchd; this machine reports '${this.platform}'.`;
  }
}

export class BootServiceCommandError extends Schema.TaggedErrorClass<BootServiceCommandError>()(
  "BootServiceCommandError",
  {
    step: Schema.String,
    exitCode: Schema.optional(Schema.Number),
    stdoutLength: Schema.optional(Schema.Number),
    stderrLength: Schema.optional(Schema.Number),
    cause: Schema.optional(Schema.Defect()),
  },
) {
  override get message(): string {
    return this.exitCode === undefined
      ? `Background setup failed while ${this.step}.`
      : `Background setup failed while ${this.step} (exit code ${this.exitCode}).`;
  }
}

export class BootServiceInstallError extends Schema.TaggedErrorClass<BootServiceInstallError>()(
  "BootServiceInstallError",
  { cause: Schema.Defect() },
) {
  override get message(): string {
    return "Could not set up the T3 Code background service.";
  }
}

export class BootServiceUpdatePendingError extends Schema.TaggedErrorClass<BootServiceUpdatePendingError>()(
  "BootServiceUpdatePendingError",
  {},
) {
  override get message(): string {
    return "A remote server update is still pending. Wait for it to finish, then retry.";
  }
}

export type BootServiceError =
  | BootServiceUnsupportedError
  | BootServiceCommandError
  | BootServiceInstallError
  | BootServiceUpdatePendingError;

export interface BootServiceStatus {
  readonly supported: boolean;
  readonly installed: boolean;
  readonly current: boolean;
  readonly unitPath: string;
  readonly logPath: string;
}

export class BootService extends Context.Service<
  BootService,
  {
    readonly install: Effect.Effect<BootServicePlan, BootServiceError>;
    readonly uninstall: Effect.Effect<boolean, BootServiceError>;
    readonly status: Effect.Effect<BootServiceStatus, BootServiceError>;
  }
>()("t3/cloud/bootService") {}

export interface BootServiceHost {
  readonly execPath: string;
  readonly launcherSourcePath?: string;
  readonly uid?: number;
}

export const make = Effect.fn("cloud.boot_service.make")(function* (input: {
  readonly baseDir: string;
  readonly logsDir: string;
  readonly cliVersion: string;
  readonly runtimeSource?: ServiceRuntimeSource;
  readonly bundledRuntimeDir?: string;
  readonly serviceEnvironment?: Readonly<Record<string, string>>;
  readonly host?: BootServiceHost;
}) {
  const hostExecPath = yield* HostProcessExecutablePath;
  const platform = yield* HostProcessPlatform;
  const homeDir = yield* Config.string("HOME").pipe(Config.withDefault(""));
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const runner = yield* ProcessRunner.ProcessRunner;
  const crypto = yield* Crypto.Crypto;
  const host = input.host ?? { execPath: hostExecPath };
  const uid = host.uid ?? (typeof process.getuid === "function" ? process.getuid() : undefined);
  const isLinux = platform === "linux";
  const isMac = platform === "darwin";
  const runtimeSource = input.runtimeSource ?? "registry";
  const bundledRuntimeDir = input.bundledRuntimeDir;
  const serviceEnvironment = {
    ...(runtimeSource === "desktop-bundle" ? { ELECTRON_RUN_AS_NODE: "1" } : {}),
    ...input.serviceEnvironment,
  };

  const unitDir = isMac
    ? path.join(homeDir, "Library", "LaunchAgents")
    : path.join(homeDir, ".config", "systemd", "user");
  const unitFile = isMac ? BOOT_SERVICE_LAUNCH_AGENT_FILE : BOOT_SERVICE_UNIT_FILE;
  const unitPath = path.join(unitDir, unitFile);
  const logPath = path.join(input.logsDir, "boot-service.log");
  const launcherPath = path.join(input.baseDir, "runtime", SERVICE_LAUNCHER_FILE);
  const statePath = path.join(input.baseDir, "runtime", SERVICE_STATE_FILE);
  const runtimePaths = pinnedRuntimePaths(path, input.baseDir, input.cliVersion);
  const launcherSourcePath =
    host.launcherSourcePath ??
    path.join(path.dirname(runtimePaths.entryPath), SERVICE_LAUNCHER_FILE);
  const writeDurably = (filePath: string, contents: string) =>
    Effect.scoped(
      Effect.gen(function* () {
        const directory = path.dirname(filePath);
        yield* fs.makeDirectory(directory, { recursive: true });
        const tempPath = yield* fs.makeTempFileScoped({ directory, prefix: ".service-write-" });
        yield* fs.writeFileString(tempPath, contents, { mode: 0o600 });
        yield* (yield* fs.open(tempPath, { flag: "r" })).sync;
        yield* fs.rename(tempPath, filePath);
        yield* (yield* fs.open(directory, { flag: "r" })).sync;
      }),
    ).pipe(Effect.mapError((cause) => new BootServiceInstallError({ cause })));
  const plan: BootServicePlan = {
    nodePath: host.execPath,
    launcherPath,
    baseDir: input.baseDir,
    logPath,
    unitPath,
    ...(Object.keys(serviceEnvironment).length === 0 ? {} : { environment: serviceEnvironment }),
  };
  const launchdDomain = `gui/${String(uid ?? "unknown")}`;
  const launchdServiceTarget = `${launchdDomain}/${BOOT_SERVICE_LAUNCH_AGENT_LABEL}`;
  const renderServiceDefinition = () =>
    isMac ? renderBootServiceLaunchAgent(plan) : renderBootServiceUnit(plan);

  const requireSupportedPlatform = Effect.gen(function* () {
    if ((!isLinux && !isMac) || homeDir === "" || (isMac && uid === undefined)) {
      return yield* new BootServiceUnsupportedError({ platform });
    }
  });

  const runStep = Effect.fn("cloud.boot_service.run_step")(function* (
    step: string,
    command: string,
    args: ReadonlyArray<string>,
    options?: { readonly timeout?: Duration.Input },
  ) {
    return yield* runner.run({ command, args, timeout: options?.timeout }).pipe(
      Effect.mapError((cause) => new BootServiceCommandError({ step, cause })),
      Effect.filterOrFail(
        (result) => result.code === 0,
        (result) =>
          new BootServiceCommandError({
            step,
            exitCode: Number(result.code),
            stdoutLength: result.stdout.length,
            stderrLength: result.stderr.length,
          }),
      ),
      Effect.tapError((error) =>
        DateTime.now.pipe(
          Effect.flatMap((now) =>
            fs.writeFileString(logPath, `${DateTime.formatIso(now)} ${error.message}\n`, {
              flag: "a",
            }),
          ),
          Effect.ignore,
        ),
      ),
    );
  });

  const isLaunchAgentLoaded = Effect.fn("cloud.boot_service.launch_agent_loaded")(function* () {
    const result = yield* runner
      .run({ command: "launchctl", args: ["print", launchdServiceTarget] })
      .pipe(
        Effect.mapError(
          (cause) =>
            new BootServiceCommandError({ step: "checking the macOS background service", cause }),
        ),
      );
    return result.code === 0;
  });

  const stopService = Effect.fn("cloud.boot_service.stop")(function* () {
    if (isLinux) {
      yield* runStep("stopping the installed service", "systemctl", [
        "--user",
        "stop",
        BOOT_SERVICE_UNIT_FILE,
      ]);
      return;
    }
    yield* runStep("stopping the installed service", "launchctl", [
      "bootout",
      launchdDomain,
      unitPath,
    ]);
  });

  const startService = Effect.fn("cloud.boot_service.start")(function* (step: string) {
    if (isLinux) {
      yield* runStep(step, "systemctl", ["--user", "restart", BOOT_SERVICE_UNIT_FILE]);
      return;
    }
    yield* runStep(step, "launchctl", ["bootstrap", launchdDomain, unitPath]);
  });

  const install: BootService["Service"]["install"] = Effect.gen(function* () {
    yield* requireSupportedPlatform;
    if (runtimeSource === "desktop-bundle" && bundledRuntimeDir === undefined) {
      return yield* new BootServiceInstallError({
        cause: new Error("The bundled desktop service runtime is missing."),
      });
    }
    yield* fs
      .makeDirectory(input.logsDir, { recursive: true })
      .pipe(Effect.mapError((cause) => new BootServiceInstallError({ cause })));

    // Prepare every immutable artifact before stopping the installed unit.
    yield* ensurePinnedRuntimeInstalled({
      baseDir: input.baseDir,
      version: input.cliVersion,
      source:
        runtimeSource === "desktop-bundle" && bundledRuntimeDir !== undefined
          ? {
              type: "bundled-directory" as const,
              directory: bundledRuntimeDir,
            }
          : { type: "registry" as const },
      fs,
      path,
      runner,
      validate: (runtime) =>
        runner
          .run({
            command: host.execPath,
            args: [runtime.entryPath, "--version"],
            ...(Object.keys(serviceEnvironment).length === 0 ? {} : { env: serviceEnvironment }),
            timeout: Duration.seconds(30),
          })
          .pipe(
            Effect.mapError(
              (cause) =>
                new PinnedRuntimeInstallError({
                  step: "verifying the pinned t3 runtime",
                  cause,
                }),
            ),
            Effect.flatMap((result) => {
              const reportedVersion = /\bv(\S+)\s*$/.exec(result.stdout)?.[1];
              return result.code === 0 && reportedVersion === input.cliVersion
                ? Effect.void
                : Effect.fail(
                    new PinnedRuntimeInstallError({
                      step: "verifying the pinned t3 runtime",
                      exitCode: Number(result.code),
                      stdoutLength: result.stdout.length,
                      stderrLength: result.stderr.length,
                    }),
                  );
            }),
          ),
    }).pipe(
      Effect.mapError((error) =>
        error._tag === "PinnedRuntimeInstallError"
          ? new BootServiceCommandError({
              step: error.step,
              exitCode: error.exitCode,
              stdoutLength: error.stdoutLength,
              stderrLength: error.stderrLength,
              cause: error,
            })
          : new BootServiceInstallError({ cause: error }),
      ),
    );
    const launcherSource = yield* fs
      .readFileString(launcherSourcePath)
      .pipe(Effect.mapError((cause) => new BootServiceInstallError({ cause })));

    const installed = yield* fs
      .exists(unitPath)
      .pipe(Effect.mapError((cause) => new BootServiceInstallError({ cause })));
    const previousStateText = installed
      ? yield* fs.readFileString(statePath).pipe(Effect.option)
      : Option.none<string>();
    if (Option.isSome(previousStateText) && serviceStateHasPendingUpdate(previousStateText.value)) {
      return yield* new BootServiceUpdatePendingError();
    }
    const previousState = Option.isSome(previousStateText)
      ? parseServiceState(previousStateText.value)
      : undefined;
    const desktopBootstrapToken =
      previousState?.desktopBootstrapToken ?? Encoding.encodeHex(yield* crypto.randomBytes(24));
    const wasRunning = installed && (isLinux || (yield* isLaunchAgentLoaded()));
    if (wasRunning) {
      yield* stopService();
    }

    yield* Effect.gen(function* () {
      yield* fs
        .makeDirectory(unitDir, { recursive: true })
        .pipe(Effect.mapError((cause) => new BootServiceInstallError({ cause })));
      yield* writeDurably(launcherPath, launcherSource);
      yield* writeDurably(
        statePath,
        // @effect-diagnostics-next-line preferSchemaOverJson:off - fixed launcher-owned document.
        `${JSON.stringify(
          {
            protocol: SERVICE_LAUNCHER_PROTOCOL,
            activeVersion: input.cliVersion,
            runtimeSource,
            desktopBootstrapToken,
          } satisfies ServiceState,
          null,
          2,
        )}\n`,
      );
      yield* writeDurably(unitPath, renderServiceDefinition());

      if (isLinux) {
        yield* runStep("reloading systemd user units", "systemctl", ["--user", "daemon-reload"]);
        yield* runStep("enabling the service", "systemctl", [
          "--user",
          "enable",
          BOOT_SERVICE_UNIT_FILE,
        ]);
        yield* runStep("enabling lingering for this user", "loginctl", ["enable-linger"]);
      }
      // Start last. No administrative state write occurs after this succeeds.
      yield* startService("starting the service");
    }).pipe(
      Effect.tapError(() =>
        wasRunning
          ? startService("restarting the service after a failed update").pipe(Effect.ignore)
          : Effect.void,
      ),
    );
    return plan;
  }).pipe(
    Effect.mapError((error) =>
      error._tag === "PlatformError" ? new BootServiceInstallError({ cause: error }) : error,
    ),
    Effect.withSpan("cloud.boot_service.install"),
  );

  const uninstall: BootService["Service"]["uninstall"] = Effect.gen(function* () {
    yield* requireSupportedPlatform;
    if (
      !(yield* fs
        .exists(unitPath)
        .pipe(Effect.mapError((cause) => new BootServiceInstallError({ cause }))))
    )
      return false;
    if (isLinux) {
      yield* runStep("stopping the service", "systemctl", [
        "--user",
        "disable",
        "--now",
        BOOT_SERVICE_UNIT_FILE,
      ]);
    } else if (yield* isLaunchAgentLoaded()) {
      yield* runStep("stopping the service", "launchctl", ["bootout", launchdDomain, unitPath]);
    }
    yield* fs
      .remove(unitPath)
      .pipe(Effect.mapError((cause) => new BootServiceInstallError({ cause })));
    if (isLinux) {
      yield* runStep("reloading systemd user units", "systemctl", ["--user", "daemon-reload"]);
    }
    return true;
  }).pipe(Effect.withSpan("cloud.boot_service.uninstall"));

  const status: BootService["Service"]["status"] = Effect.gen(function* () {
    if ((!isLinux && !isMac) || homeDir === "" || (isMac && uid === undefined)) {
      return { supported: false, installed: false, current: false, unitPath, logPath };
    }
    if (!(yield* fs.exists(unitPath))) {
      return { supported: true, installed: false, current: false, unitPath, logPath };
    }
    const [unit, launcherExists, runtimeEntryExists, runtimeSentinel, stateText] =
      yield* Effect.all([
        fs.readFileString(unitPath),
        fs.exists(launcherPath),
        fs.exists(runtimePaths.entryPath),
        fs.readFileString(runtimePaths.sentinelPath).pipe(Effect.option),
        fs.readFileString(statePath).pipe(Effect.option),
      ]);
    const state = Option.isSome(stateText) ? parseServiceState(stateText.value) : undefined;
    const serviceLoaded = isLinux || (yield* isLaunchAgentLoaded());
    // A standalone CLI cannot reconstruct the desktop executable path. Status may adopt the
    // launcher-owned source; install and update still render from the caller's explicit plan.
    const adoptsInstalledRuntimeForStatus =
      input.runtimeSource === undefined &&
      state !== undefined &&
      state.runtimeSource !== runtimeSource;
    return {
      supported: true,
      installed: true,
      current:
        serviceLoaded &&
        (adoptsInstalledRuntimeForStatus || unit === renderServiceDefinition()) &&
        launcherExists &&
        runtimeEntryExists &&
        Option.isSome(runtimeSentinel) &&
        runtimeSentinel.value.trim() === input.cliVersion &&
        state?.activeVersion === input.cliVersion &&
        (adoptsInstalledRuntimeForStatus || state.runtimeSource === runtimeSource) &&
        state?.update?.status !== "pending",
      unitPath,
      logPath,
    };
  }).pipe(
    Effect.mapError((cause) =>
      cause._tag === "BootServiceCommandError" ? cause : new BootServiceInstallError({ cause }),
    ),
    Effect.withSpan("cloud.boot_service.status"),
  );

  return BootService.of({ install, uninstall, status });
});

export const layer = (input: {
  readonly baseDir: string;
  readonly logsDir: string;
  readonly cliVersion: string;
  readonly runtimeSource?: ServiceRuntimeSource;
  readonly bundledRuntimeDir?: string;
  readonly serviceEnvironment?: Readonly<Record<string, string>>;
  readonly host?: BootServiceHost;
}) => Layer.effect(BootService, make(input));
