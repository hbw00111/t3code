import { describe, expect, it } from "@effect/vitest";
import type { SelfHostedTunnelSettings } from "@t3tools/contracts";
import * as Deferred from "effect/Deferred";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Sink from "effect/Sink";
import * as Stream from "effect/Stream";
import * as TestClock from "effect/testing/TestClock";
import { ChildProcess, ChildProcessSpawner } from "effect/unstable/process";

import { ServerActivation } from "../serverActivation.ts";
import * as ServerSettings from "../serverSettings.ts";
import * as SelfHostedTunnelRuntime from "./SelfHostedTunnelRuntime.ts";

const ENABLED_SETTINGS: SelfHostedTunnelSettings = {
  enabled: true,
  sshHost: "relay.example.com",
  sshUser: "t3",
  sshPort: 2222,
  identityFile: "~/.ssh/t3-relay",
  remoteBindHost: "127.0.0.1",
  remotePort: 43883,
  publicBaseUrl: "https://t3.example.com",
};

function makeHandle(input: {
  readonly pid: number;
  readonly exitCode: Effect.Effect<ChildProcessSpawner.ExitCode>;
  readonly onKill: () => void;
}) {
  let running = true;
  return ChildProcessSpawner.makeHandle({
    pid: ChildProcessSpawner.ProcessId(input.pid),
    exitCode: input.exitCode,
    isRunning: Effect.sync(() => running),
    kill: () =>
      Effect.sync(() => {
        running = false;
        input.onKill();
      }),
    unref: Effect.succeed(Effect.void),
    stdin: Sink.drain,
    stdout: Stream.empty,
    stderr: Stream.empty,
    all: Stream.empty,
    getInputFd: () => Sink.drain,
    getOutputFd: () => Stream.empty,
  });
}

const buildRuntime = (spawner: ReturnType<typeof ChildProcessSpawner.make>) =>
  Effect.gen(function* () {
    const context = yield* Layer.build(
      SelfHostedTunnelRuntime.layerWithOptions({
        resolveLocalPort: Effect.succeed(3773),
      }).pipe(
        Layer.provide(
          Layer.mergeAll(
            Layer.succeed(ChildProcessSpawner.ChildProcessSpawner, spawner),
            ServerSettings.layerTest(),
            Layer.succeed(ServerActivation, Effect.never),
          ),
        ),
      ),
    );
    return yield* SelfHostedTunnelRuntime.SelfHostedTunnelRuntime.pipe(Effect.provide(context));
  });

describe("SelfHostedTunnelRuntime", () => {
  it.effect("starts a reverse tunnel and replaces it when settings change", () =>
    Effect.gen(function* () {
      const commands: Array<ChildProcess.StandardCommand> = [];
      const killed: Array<number> = [];
      let nextPid = 4100;
      const spawner = ChildProcessSpawner.make((command) =>
        Effect.gen(function* () {
          if (!ChildProcess.isStandardCommand(command)) throw new Error("Expected ssh command.");
          commands.push(command);
          const pid = nextPid++;
          const handle = makeHandle({
            pid,
            exitCode: Effect.never,
            onKill: () => killed.push(pid),
          });
          yield* Effect.addFinalizer(() => handle.kill().pipe(Effect.ignore));
          return handle;
        }),
      );
      const runtime = yield* buildRuntime(spawner);

      yield* runtime.applyConfig(ENABLED_SETTINGS, 3773);
      yield* Effect.yieldNow;
      yield* TestClock.adjust(750);
      expect(yield* runtime.getStatus).toEqual({ state: "connected", pid: 4100 });

      yield* runtime.applyConfig({ ...ENABLED_SETTINGS, remotePort: 43884 }, 3773);
      yield* Effect.yieldNow;
      yield* TestClock.adjust(750);
      expect(yield* runtime.getStatus).toEqual({ state: "connected", pid: 4101 });
      expect(killed).toContain(4100);
      expect(commands.map((command) => command.args.slice(-3))).toEqual([
        ["-R", "127.0.0.1:43883:127.0.0.1:3773", "t3@relay.example.com"],
        ["-R", "127.0.0.1:43884:127.0.0.1:3773", "t3@relay.example.com"],
      ]);
    }),
  );

  it.effect("retries with backoff after SSH exits", () =>
    Effect.gen(function* () {
      const firstExit = yield* Deferred.make<ChildProcessSpawner.ExitCode>();
      let spawnCount = 0;
      const spawner = ChildProcessSpawner.make(() =>
        Effect.gen(function* () {
          spawnCount += 1;
          const pid = 4200 + spawnCount;
          const handle = makeHandle({
            pid,
            exitCode: spawnCount === 1 ? Deferred.await(firstExit) : Effect.never,
            onKill: () => {},
          });
          yield* Effect.addFinalizer(() => handle.kill().pipe(Effect.ignore));
          return handle;
        }),
      );
      const runtime = yield* buildRuntime(spawner);

      yield* runtime.applyConfig(ENABLED_SETTINGS, 3773);
      yield* Effect.yieldNow;
      yield* TestClock.adjust(750);
      expect(yield* runtime.getStatus).toEqual({ state: "connected", pid: 4201 });

      yield* Deferred.succeed(firstExit, ChildProcessSpawner.ExitCode(255));
      yield* Effect.yieldNow;
      expect(yield* runtime.getStatus).toEqual({
        state: "retrying",
        attempt: 1,
        retryDelayMs: 1_000,
        message: "SSH exited with code 255.",
      });

      yield* TestClock.adjust(1_000);
      yield* Effect.yieldNow;
      expect(yield* runtime.getStatus).toEqual({ state: "connecting", attempt: 2 });
      yield* TestClock.adjust(750);
      expect(yield* runtime.getStatus).toEqual({ state: "connected", pid: 4202 });
      expect(spawnCount).toBe(2);
    }),
  );

  it.effect("surfaces invalid settings without spawning SSH", () =>
    Effect.gen(function* () {
      let spawnCount = 0;
      const spawner = ChildProcessSpawner.make(() => {
        spawnCount += 1;
        return Effect.die("unexpected spawn");
      });
      const runtime = yield* buildRuntime(spawner);

      yield* runtime.applyConfig({ ...ENABLED_SETTINGS, sshHost: "" }, 3773);

      expect(yield* runtime.getStatus).toEqual({
        state: "failed",
        message: "SSH host is required and must not contain whitespace.",
      });
      expect(spawnCount).toBe(0);
    }),
  );
});
