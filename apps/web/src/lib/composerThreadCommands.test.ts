import { describe, expect, it } from "vite-plus/test";

import { buildForkedThreadPrompt, buildSideThreadPrompt } from "./composerThreadCommands";

const thread = {
  messages: [
    { role: "user", text: "Fix reconnecting" },
    { role: "assistant", text: "I changed the retry loop" },
  ],
} satisfies Parameters<typeof buildForkedThreadPrompt>[0];

describe("composer thread commands", () => {
  it("carries recent context into forked and side threads", () => {
    expect(buildForkedThreadPrompt(thread, "Add tests")).toContain("Add tests");
    expect(buildForkedThreadPrompt(thread, "Add tests")).toContain("Fix reconnecting");
    expect(buildSideThreadPrompt(thread, "Review the retry loop")).toContain(
      "independent side task",
    );
  });
});
