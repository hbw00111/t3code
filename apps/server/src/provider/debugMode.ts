import type { ProviderInteractionMode } from "@t3tools/contracts";

export const PROVIDER_DEBUG_MODE_PROMPT_PREFIX = `<t3_debug_mode>
Diagnose the reported defect with an evidence-first loop: observe, reproduce, investigate, fix, verify.

- Inspect the real current state before editing and reproduce locally when practical.
- Form testable hypotheses and narrow them with logs, errors, traces, or runtime observations.
- Fix the smallest root cause, add a regression test when practical, and verify the original symptom.
- Preserve the current permission mode. Debug mode grants no extra access and is not plan mode.
- If blocked, report the evidence obtained, remaining uncertainty, and next concrete step.
</t3_debug_mode>`;

export function withProviderDebugModePrompt(input: {
  readonly text: string;
  readonly interactionMode?: ProviderInteractionMode;
}): string {
  if (
    input.interactionMode !== "debug" ||
    input.text.startsWith(PROVIDER_DEBUG_MODE_PROMPT_PREFIX)
  ) {
    return input.text;
  }
  return input.text.length > 0
    ? `${PROVIDER_DEBUG_MODE_PROMPT_PREFIX}\n\n${input.text}`
    : PROVIDER_DEBUG_MODE_PROMPT_PREFIX;
}
