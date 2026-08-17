import { describe, expect, it } from "vite-plus/test";

import {
  BUILT_IN_COMPOSER_SLASH_COMMANDS,
  BUILT_IN_COMPOSER_SLASH_COMMAND_DEFINITIONS,
  buildAutomationPrompt,
  buildReviewPrompt,
  buildSubagentsPrompt,
  isBuiltInComposerSlashCommandName,
  normalizeComposerSlashCommandName,
  parseComposerSlashInvocation,
  parseFastSlashCommandAction,
  shouldKeepProviderSlashCommand,
} from "./composerSlashCommands.ts";

describe("composer slash commands", () => {
  it("keeps the complete built-in command catalog in display order", () => {
    expect(BUILT_IN_COMPOSER_SLASH_COMMANDS).toEqual([
      "clear",
      "compact",
      "model",
      "plan",
      "debug",
      "default",
      "review",
      "fork",
      "side",
      "status",
      "subagents",
      "fast",
      "export",
      "goal",
      "feedback",
      "automation",
    ]);
    expect(BUILT_IN_COMPOSER_SLASH_COMMAND_DEFINITIONS.map((entry) => entry.command)).toEqual(
      BUILT_IN_COMPOSER_SLASH_COMMANDS,
    );
    expect(BUILT_IN_COMPOSER_SLASH_COMMAND_DEFINITIONS[1]?.title).toBe("Compact Context");
  });

  it("normalizes command names before matching", () => {
    expect(normalizeComposerSlashCommandName(" //GoAl ")).toBe("goal");
    expect(isBuiltInComposerSlashCommandName("/STATUS")).toBe(true);
    expect(isBuiltInComposerSlashCommandName("/provider-only")).toBe(false);
  });

  it("removes provider commands that collide with app-owned commands", () => {
    expect(shouldKeepProviderSlashCommand("review")).toBe(false);
    expect(shouldKeepProviderSlashCommand("/goal")).toBe(false);
    expect(shouldKeepProviderSlashCommand("doctor")).toBe(true);
  });

  it("parses standalone built-in invocations with arguments", () => {
    expect(parseComposerSlashInvocation(" /goal Ship reconnect fixes ")).toEqual({
      command: "goal",
      args: "Ship reconnect fixes",
    });
    expect(parseComposerSlashInvocation("/provider-only")).toBeNull();
    expect(parseComposerSlashInvocation("text /status")).toBeNull();
  });

  it("builds the executable prompt commands", () => {
    expect(buildSubagentsPrompt("Inspect reconnecting")).toContain("Inspect reconnecting");
    expect(buildSubagentsPrompt("")).toContain("Delegate distinct work");
    expect(buildReviewPrompt("base-branch")).toContain("base branch");
    expect(buildAutomationPrompt("Every weekday at 9, summarize issues")).toContain(
      "Every weekday at 9, summarize issues",
    );
    expect(parseFastSlashCommandAction("/fast")).toBe("toggle");
    expect(parseFastSlashCommandAction("/fast status")).toBe("status");
    expect(parseFastSlashCommandAction("/fast maybe")).toBe("invalid");
  });
});
