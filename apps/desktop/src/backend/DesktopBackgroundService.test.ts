import * as NodeServices from "@effect/platform-node/NodeServices";
import { assert, it } from "@effect/vitest";
import { EnvironmentId } from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Option from "effect/Option";
import * as Path from "effect/Path";

import * as DesktopBackgroundService from "./DesktopBackgroundService.ts";

const makeHarness = Effect.fn("test.makeDesktopBackgroundServiceHarness")(function* (input?: {
  readonly descriptorEnvironmentId?: string;
}) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const root = yield* fs.makeTempDirectoryScoped({ prefix: "t3-desktop-background-service-" });
  const baseDir = path.join(root, ".t3");
  const stateDir = path.join(baseDir, "userdata");
  const bundledRuntimeDir = path.join(root, "bundle", "versions", "0.0.36");
  const bundledServiceEntryPath = path.join(
    bundledRuntimeDir,
    "node_modules",
    "t3",
    "dist",
    "bin.mjs",
  );
  yield* fs.makeDirectory(path.dirname(bundledServiceEntryPath), { recursive: true });
  yield* fs.writeFileString(bundledServiceEntryPath, "export {}\n");

  const actions: Array<"install" | "uninstall"> = [];
  const runServiceCommand = (action: "install" | "uninstall") =>
    Effect.gen(function* () {
      actions.push(action);
      if (action === "uninstall") return;
      yield* fs.makeDirectory(path.join(baseDir, "runtime"), { recursive: true });
      yield* fs.makeDirectory(stateDir, { recursive: true });
      yield* fs.writeFileString(
        path.join(baseDir, "runtime", "service-state.json"),
        // @effect-diagnostics-next-line preferSchemaOverJson:off - launcher-owned fixture.
        JSON.stringify({
          protocol: 3,
          activeVersion: "0.0.36",
          runtimeSource: "desktop-bundle",
          desktopBootstrapToken: "persistent-desktop-token",
        }),
      );
      yield* fs.writeFileString(
        path.join(stateDir, "server-runtime.json"),
        // @effect-diagnostics-next-line preferSchemaOverJson:off - server-owned fixture.
        JSON.stringify({
          version: 1,
          pid: 42,
          port: 3773,
          origin: "http://127.0.0.1:3773",
        }),
      );
      yield* fs.writeFileString(path.join(stateDir, "environment-id"), "environment-1\n");
    }).pipe(
      Effect.mapError(
        (cause) =>
          new DesktopBackgroundService.DesktopBackgroundServicePreparationError({
            operation: action,
            cause,
          }),
      ),
    );

  const service = yield* DesktopBackgroundService.makeWithDependencies(
    {
      isPackaged: true,
      platform: "darwin",
      baseDir,
      stateDir,
      homeDirectory: root,
      appVersion: "0.0.36",
      bundledServiceRuntimeDir: bundledRuntimeDir,
      bundledServiceEntryPath,
    },
    {
      runServiceCommand,
      discoveryAttempts: 1,
      fetchDescriptor: () =>
        Effect.succeed({
          environmentId: EnvironmentId.make(input?.descriptorEnvironmentId ?? "environment-1"),
          label: "Local environment",
          platform: { os: "darwin", arch: "arm64" },
          serverVersion: "0.0.36",
          capabilities: { repositoryIdentity: true },
        }),
    },
  );
  return { service, actions };
});

it.layer(NodeServices.layer)("DesktopBackgroundService", (it) => {
  it.effect("reconciles once and returns the verified persistent service", () =>
    Effect.gen(function* () {
      const { service, actions } = yield* makeHarness();
      const first = yield* service.prepare;
      const second = yield* service.prepare;

      assert.isTrue(Option.isSome(first));
      assert.deepStrictEqual(second, first);
      assert.equal(Option.getOrThrow(first).httpBaseUrl.href, "http://127.0.0.1:3773/");
      assert.equal(Option.getOrThrow(first).desktopBootstrapToken, "persistent-desktop-token");
      assert.deepStrictEqual(actions, ["install"]);
    }),
  );

  it.effect("removes a reconciled service whose live identity does not match", () =>
    Effect.gen(function* () {
      const { service, actions } = yield* makeHarness({
        descriptorEnvironmentId: "different-environment",
      });
      assert.isTrue(Option.isNone(yield* service.prepare));
      assert.deepStrictEqual(actions, ["install", "uninstall"]);
    }),
  );
});
