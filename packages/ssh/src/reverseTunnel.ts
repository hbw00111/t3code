import * as Effect from "effect/Effect";
import * as Scope from "effect/Scope";
import { ChildProcess, ChildProcessSpawner } from "effect/unstable/process";

import { resolveSshCommand } from "./command.ts";
import { SshCommandError } from "./errors.ts";

export interface ReverseSshTunnelOptions {
  readonly sshHost: string;
  readonly sshUser?: string;
  readonly sshPort?: number;
  readonly identityFile?: string;
  readonly remoteBindHost: string;
  readonly remotePort: number;
  readonly localHost: string;
  readonly localPort: number;
}

export interface ReverseSshTunnelHandle {
  readonly child: ChildProcessSpawner.ChildProcessHandle;
  readonly command: ReadonlyArray<string>;
}

function formatForwardHost(host: string): string {
  return host.includes(":") && !host.startsWith("[") ? `[${host}]` : host;
}

export function buildReverseSshTunnelArgs(options: ReverseSshTunnelOptions): string[] {
  const hostSpec = options.sshUser ? `${options.sshUser}@${options.sshHost}` : options.sshHost;
  const reverseForward = `${formatForwardHost(options.remoteBindHost)}:${options.remotePort}:${formatForwardHost(options.localHost)}:${options.localPort}`;

  return [
    "-o",
    "BatchMode=yes",
    "-o",
    "ConnectTimeout=10",
    "-o",
    "ExitOnForwardFailure=yes",
    "-o",
    "ControlMaster=no",
    "-o",
    "ControlPath=none",
    "-o",
    "ControlPersist=no",
    "-o",
    "ServerAliveInterval=15",
    "-o",
    "ServerAliveCountMax=3",
    ...(options.sshPort === undefined ? [] : ["-p", String(options.sshPort)]),
    ...(options.identityFile === undefined ? [] : ["-i", options.identityFile]),
    "-n",
    "-N",
    "-R",
    reverseForward,
    hostSpec,
  ];
}

export const spawnReverseSshTunnel = Effect.fn("ssh/reverseTunnel.spawn")(function* (
  options: ReverseSshTunnelOptions,
): Effect.fn.Return<
  ReverseSshTunnelHandle,
  SshCommandError,
  ChildProcessSpawner.ChildProcessSpawner | Scope.Scope
> {
  const sshCommand = yield* resolveSshCommand;
  const args = buildReverseSshTunnelArgs(options);
  const command = [sshCommand, ...args];
  const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
  const child = yield* spawner
    .spawn(
      ChildProcess.make(sshCommand, args, {
        detached: false,
        shell: false,
        stdout: "pipe",
        stderr: "pipe",
      }),
    )
    .pipe(
      Effect.mapError(
        (cause) =>
          new SshCommandError({
            command,
            exitCode: null,
            stderr: "",
            message: cause instanceof Error ? cause.message : "Failed to start SSH tunnel.",
            cause,
          }),
      ),
    );

  return { child, command };
});
