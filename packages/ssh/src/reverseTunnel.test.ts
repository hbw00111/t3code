import { describe, expect, it } from "vite-plus/test";

import { buildReverseSshTunnelArgs } from "./reverseTunnel.ts";

describe("buildReverseSshTunnelArgs", () => {
  it("builds a key-based reverse tunnel with keepalive and failure detection", () => {
    expect(
      buildReverseSshTunnelArgs({
        sshHost: "relay.example.com",
        sshUser: "t3",
        sshPort: 2222,
        identityFile: "/Users/dev/.ssh/t3-relay",
        remoteBindHost: "127.0.0.1",
        remotePort: 43883,
        localHost: "127.0.0.1",
        localPort: 3773,
      }),
    ).toEqual([
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
      "-p",
      "2222",
      "-i",
      "/Users/dev/.ssh/t3-relay",
      "-n",
      "-N",
      "-R",
      "127.0.0.1:43883:127.0.0.1:3773",
      "t3@relay.example.com",
    ]);
  });

  it("leaves SSH config defaults intact and brackets IPv6 forward hosts", () => {
    expect(
      buildReverseSshTunnelArgs({
        sshHost: "t3-relay",
        remoteBindHost: "::1",
        remotePort: 43883,
        localHost: "::1",
        localPort: 3773,
      }).slice(-3),
    ).toEqual(["-R", "[::1]:43883:[::1]:3773", "t3-relay"]);
  });
});
