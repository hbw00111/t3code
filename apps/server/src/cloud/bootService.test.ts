import * as NodeServices from "@effect/platform-node/NodeServices";
import { expect, it } from "@effect/vitest";
import {
  HostProcessArguments,
  HostProcessExecutablePath,
  HostProcessPlatform,
} from "@t3tools/shared/hostProcess";
import * as ConfigProvider from "effect/ConfigProvider";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Path from "effect/Path";
import * as ChildProcessSpawner from "effect/unstable/process/ChildProcessSpawner";

import * as ProcessRunner from "../processRunner.ts";
import * as BootService from "./bootService.ts";
import { pinnedRuntimePaths } from "./pinnedRuntime.ts";
import {
  parseServiceState,
  SERVICE_LAUNCHER_PROTOCOL,
  serviceStateHasPendingUpdate,
} from "./serviceProtocol.ts";

it("keeps systemd pinned to the stable launcher rather than a versioned server", () => {
  const unit = BootService.renderBootServiceUnit({
    nodePath: "/usr/bin/node",
    launcherPath: "/home/theo/.t3/runtime/service-launcher.mjs",
    baseDir: "/home/theo/.t3",
    logPath: "/home/theo/.t3/userdata/logs/boot-service.log",
    unitPath: "/home/theo/.config/systemd/user/t3code.service",
    environment: { ELECTRON_RUN_AS_NODE: "1" },
  });

  expect(unit).toContain("ExecStart=/usr/bin/node /home/theo/.t3/runtime/service-launcher.mjs");
  expect(unit).toContain("KillMode=mixed");
  expect(unit).toContain("Environment=ELECTRON_RUN_AS_NODE=1");
  expect(unit).not.toContain("versions/1.2.3");
});

it("survives the kernel OOM-killing a greedy agent child", () => {
  const unit = BootService.renderBootServiceUnit({
    nodePath: "/usr/bin/node",
    launcherPath: "/home/theo/.t3/runtime/service-launcher.mjs",
    baseDir: "/home/theo/.t3",
    logPath: "/home/theo/.t3/userdata/logs/boot-service.log",
    unitPath: "/home/theo/.config/systemd/user/t3code.service",
  });

  expect(unit).toContain("OOMPolicy=continue");
});

it("renders a self-restarting macOS LaunchAgent with a wake assertion", () => {
  const unit = BootService.renderBootServiceLaunchAgent({
    nodePath: "/usr/local/bin/node",
    launcherPath: "/Users/theo/T3 & Code/runtime/service-launcher.mjs",
    baseDir: "/Users/theo/T3 & Code",
    logPath: "/Users/theo/T3 & Code/userdata/logs/boot-service.log",
    unitPath: "/Users/theo/Library/LaunchAgents/com.t3tools.t3code.service.plist",
    environment: { ELECTRON_RUN_AS_NODE: "1" },
  });

  expect(unit).toContain("<string>com.t3tools.t3code.service</string>");
  expect(unit).toContain("<string>/Users/theo/T3 &amp; Code</string>");
  expect(unit).toContain("<key>T3_SERVICE_KEEP_AWAKE</key>");
  expect(unit).toContain("<key>ELECTRON_RUN_AS_NODE</key>\n    <string>1</string>");
  expect(unit).toContain("<key>KeepAlive</key>\n  <true/>");
  expect(unit).not.toContain("versions/1.2.3");
});

const makeHarness = Effect.fn("test.make_boot_service_harness")(function* (
  platform: NodeJS.Platform = "linux",
  usePinnedLauncher = false,
) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const home = yield* fs.makeTempDirectoryScoped({ prefix: "t3-boot-service-test-" });
  const baseDir = path.join(home, ".t3");
  const sourceLauncher = path.join(home, "service-launcher.mjs");
  const statePath = path.join(baseDir, "runtime", "service-state.json");
  yield* fs.writeFileString(sourceLauncher, "export {};\n");
  const runtime = pinnedRuntimePaths(path, baseDir, "1.2.3");
  yield* fs.makeDirectory(path.dirname(runtime.entryPath), { recursive: true });
  yield* fs.writeFileString(runtime.entryPath, "export {};\n");
  yield* fs.writeFileString(
    path.join(path.dirname(runtime.entryPath), "service-launcher.mjs"),
    "export const source = 'pinned runtime';\n",
  );
  yield* fs.writeFileString(runtime.sentinelPath, "1.2.3\n");

  const commands: string[] = [];
  const control: { failCommand: string | undefined } = { failCommand: undefined };
  const runner = ProcessRunner.ProcessRunner.of({
    run: (input) =>
      Effect.sync(() => {
        const command = `${input.command} ${input.args.join(" ")}`;
        commands.push(command);
        return {
          stdout: input.args[1] === "--version" ? "t3 v1.2.3\n" : "",
          stderr: "",
          code: ChildProcessSpawner.ExitCode(command === control.failCommand ? 1 : 0),
          timedOut: false,
          stdoutTruncated: false,
          stderrTruncated: false,
        };
      }),
  });
  const makeService = (options?: {
    readonly execPath?: string;
    readonly runtimeSource?: "registry" | "desktop-bundle";
    readonly bundledRuntimeDir?: string;
  }) =>
    BootService.make({
      baseDir,
      logsDir: path.join(baseDir, "userdata", "logs"),
      cliVersion: "1.2.3",
      ...(options?.runtimeSource === undefined ? {} : { runtimeSource: options.runtimeSource }),
      ...(options?.bundledRuntimeDir === undefined
        ? {}
        : { bundledRuntimeDir: options.bundledRuntimeDir }),
      host: {
        execPath: options?.execPath ?? "/usr/bin/node",
        uid: 501,
        ...(usePinnedLauncher ? {} : { launcherSourcePath: sourceLauncher }),
      },
    }).pipe(
      Effect.provideService(ProcessRunner.ProcessRunner, runner),
      Effect.provide(
        Layer.mergeAll(
          Layer.succeed(HostProcessPlatform, platform),
          Layer.succeed(HostProcessExecutablePath, "/usr/bin/node"),
          Layer.succeed(HostProcessArguments, ["/usr/bin/node", path.join(home, "bin.mjs")]),
          ConfigProvider.layer(ConfigProvider.fromEnv({ env: { HOME: home } })),
        ),
      ),
    );
  const service = yield* makeService();
  return { service, makeService, fs, statePath, commands, control };
});

it.layer(NodeServices.layer)("boot service install", (it) => {
  it.effect("installs, reports current state, and uninstalls", () =>
    Effect.gen(function* () {
      const { service, fs, statePath, commands } = yield* makeHarness();
      const plan = yield* service.install;

      expect(parseServiceState(yield* fs.readFileString(statePath))).toEqual({
        protocol: SERVICE_LAUNCHER_PROTOCOL,
        activeVersion: "1.2.3",
        runtimeSource: "registry",
        desktopBootstrapToken: expect.stringMatching(/^[0-9a-f]{48}$/),
      });
      expect(yield* fs.readFileString(plan.launcherPath)).toBe("export {};\n");
      expect((yield* service.status).current).toBe(true);
      // @effect-diagnostics-next-line preferSchemaOverJson:off - fixed launcher-owned test document.
      const pendingState = JSON.stringify({
        protocol: SERVICE_LAUNCHER_PROTOCOL,
        activeVersion: "1.2.3",
        runtimeSource: "registry",
        desktopBootstrapToken: "persistent-desktop-credential",
        update: {
          id: "u",
          fromVersion: "1.2.3",
          targetVersion: "1.2.4",
          dbPath: "/tmp/state.sqlite",
          status: "pending",
        },
      });
      yield* fs.writeFileString(statePath, pendingState);
      expect((yield* service.status).current).toBe(false);
      expect(yield* service.uninstall).toBe(true);
      expect((yield* service.status).installed).toBe(false);
      expect(commands.some((command) => command.startsWith("npm "))).toBe(false);
    }),
  );

  it.effect("copies the launcher from the prepared pinned runtime", () =>
    Effect.gen(function* () {
      const { service, fs } = yield* makeHarness("linux", true);
      const plan = yield* service.install;

      expect(yield* fs.readFileString(plan.launcherPath)).toBe(
        "export const source = 'pinned runtime';\n",
      );
    }),
  );

  it.effect("recognizes a current desktop-managed service from the standalone CLI", () =>
    Effect.gen(function* () {
      const { makeService, fs, statePath } = yield* makeHarness();
      const desktopService = yield* makeService({
        execPath: "/Applications/T3 Code.app/Contents/MacOS/T3 Code",
        runtimeSource: "desktop-bundle",
        bundledRuntimeDir: "/Applications/T3 Code.app/Contents/Resources/service-runtime",
      });
      yield* desktopService.install;

      const standaloneCliService = yield* makeService({ execPath: "/usr/bin/node" });
      expect((yield* standaloneCliService.status).current).toBe(true);

      const plan = yield* standaloneCliService.install;
      expect(plan.nodePath).toBe("/usr/bin/node");
      expect(parseServiceState(yield* fs.readFileString(statePath))?.runtimeSource).toBe(
        "registry",
      );
    }),
  );

  it.effect("preserves the desktop credential while repairing the service", () =>
    Effect.gen(function* () {
      const { service, fs, statePath } = yield* makeHarness();
      yield* service.install;
      const first = parseServiceState(yield* fs.readFileString(statePath));
      expect(first).toBeDefined();

      yield* service.install;
      const second = parseServiceState(yield* fs.readFileString(statePath));
      expect(second?.desktopBootstrapToken).toBe(first?.desktopBootstrapToken);
    }),
  );

  it.effect("installs and removes a loaded macOS LaunchAgent", () =>
    Effect.gen(function* () {
      const { service, commands } = yield* makeHarness("darwin");
      const plan = yield* service.install;

      expect(plan.unitPath).toContain("/Library/LaunchAgents/com.t3tools.t3code.service.plist");
      expect((yield* service.status).current).toBe(true);
      expect(commands.some((command) => command.startsWith("systemctl "))).toBe(false);
      expect(commands).toContain(`launchctl bootstrap gui/501 ${plan.unitPath}`);

      expect(yield* service.uninstall).toBe(true);
      expect(commands).toContain(`launchctl bootout gui/501 ${plan.unitPath}`);
      expect((yield* service.status).installed).toBe(false);
    }),
  );

  it.effect("restarts an installed service when repair fails", () =>
    Effect.gen(function* () {
      const { service, commands, control } = yield* makeHarness();
      yield* service.install;
      commands.length = 0;
      control.failCommand = "systemctl --user daemon-reload";

      const error = yield* service.install.pipe(Effect.flip);
      expect(error._tag).toBe("BootServiceCommandError");
      expect(commands.filter((command) => command.startsWith("systemctl "))).toEqual([
        "systemctl --user stop t3code.service",
        "systemctl --user daemon-reload",
        "systemctl --user restart t3code.service",
      ]);
    }),
  );

  it.effect("restarts without overwriting a pending remote update", () =>
    Effect.gen(function* () {
      const { service, fs, statePath, commands } = yield* makeHarness();
      yield* service.install;
      // @effect-diagnostics-next-line preferSchemaOverJson:off - fixed launcher-owned test document.
      const pendingState = JSON.stringify({
        protocol: SERVICE_LAUNCHER_PROTOCOL - 1,
        activeVersion: "1.2.3",
        update: {
          id: "remote-update",
          fromVersion: "1.2.3",
          targetVersion: "1.2.4",
          status: "pending",
        },
      });
      yield* fs.writeFileString(statePath, pendingState);
      commands.length = 0;

      expect((yield* service.install.pipe(Effect.flip))._tag).toBe("BootServiceUpdatePendingError");
      expect(serviceStateHasPendingUpdate(yield* fs.readFileString(statePath))).toBe(true);
      expect(commands.filter((command) => command.startsWith("systemctl "))).toEqual([]);
    }),
  );

  it.effect("fails closed off supported service-manager platforms", () =>
    Effect.gen(function* () {
      const { service } = yield* makeHarness("win32");
      expect((yield* service.status).supported).toBe(false);
      expect((yield* service.install.pipe(Effect.flip))._tag).toBe("BootServiceUnsupportedError");
    }),
  );
});
