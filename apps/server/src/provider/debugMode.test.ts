import { describe, expect, it } from "vite-plus/test";

import { PROVIDER_DEBUG_MODE_PROMPT_PREFIX, withProviderDebugModePrompt } from "./debugMode.ts";

describe("provider debug mode", () => {
  it("adds the evidence-first instructions to debug turns", () => {
    expect(
      withProviderDebugModePrompt({ text: "Fix reconnecting", interactionMode: "debug" }),
    ).toBe(`${PROVIDER_DEBUG_MODE_PROMPT_PREFIX}\n\nFix reconnecting`);
  });

  it("leaves default and plan turns unchanged", () => {
    expect(withProviderDebugModePrompt({ text: "Inspect this", interactionMode: "default" })).toBe(
      "Inspect this",
    );
    expect(withProviderDebugModePrompt({ text: "Plan this", interactionMode: "plan" })).toBe(
      "Plan this",
    );
  });

  it("does not duplicate an existing prefix", () => {
    const text = `${PROVIDER_DEBUG_MODE_PROMPT_PREFIX}\n\nAlready prepared`;
    expect(withProviderDebugModePrompt({ text, interactionMode: "debug" })).toBe(text);
  });
});
