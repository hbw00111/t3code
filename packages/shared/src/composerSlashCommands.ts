export const BUILT_IN_COMPOSER_SLASH_COMMANDS = [
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
] as const;

export type BuiltInComposerSlashCommand = (typeof BUILT_IN_COMPOSER_SLASH_COMMANDS)[number];

export interface BuiltInComposerSlashCommandDefinition {
  readonly command: BuiltInComposerSlashCommand;
  readonly title: string;
  readonly label: `/${BuiltInComposerSlashCommand}`;
  readonly description: string;
}

const TITLES: Record<BuiltInComposerSlashCommand, string> = {
  clear: "Clear",
  compact: "Compact Context",
  model: "Model",
  plan: "Plan Mode",
  debug: "Debug Mode",
  default: "Default Mode",
  review: "Code Review",
  fork: "Fork",
  side: "Sidechat",
  status: "Status",
  subagents: "Subagents",
  fast: "Fast Mode",
  export: "Export",
  goal: "Goal",
  feedback: "Feedback",
  automation: "Automation",
};

const DESCRIPTIONS: Record<BuiltInComposerSlashCommand, string> = {
  clear: "Start a fresh thread and clear the current conversation context",
  compact: "Compact the current thread context to free space",
  model: "Switch response model for this thread",
  plan: "Switch this thread into plan mode",
  debug: "Switch this thread into evidence-first debug mode",
  default: "Switch this thread back to normal chat mode",
  review: "Start a code review for current changes",
  fork: "Fork this thread into local or a new worktree",
  side: "Open a guarded side thread from this thread",
  status: "Show context usage and current thread status",
  subagents: "Insert a prompt that asks the assistant to delegate work",
  fast: "Turn fast mode on or off for this thread",
  export: "Download this thread as a ZIP archive",
  goal: "Set, edit, pause, resume, or clear this thread's persistent goal",
  feedback: "Send feedback about T3 Code",
  automation: "Create a scheduled automation from this prompt",
};

export const BUILT_IN_COMPOSER_SLASH_COMMAND_DEFINITIONS = BUILT_IN_COMPOSER_SLASH_COMMANDS.map(
  (command) => ({
    command,
    title: TITLES[command],
    label: `/${command}` as const,
    description: DESCRIPTIONS[command],
  }),
) satisfies ReadonlyArray<BuiltInComposerSlashCommandDefinition>;

const BUILT_IN_COMMAND_SET = new Set<string>(BUILT_IN_COMPOSER_SLASH_COMMANDS);

export function normalizeComposerSlashCommandName(value: string): string {
  return value.trim().replace(/^\/+/, "").toLowerCase();
}

export function isBuiltInComposerSlashCommandName(
  value: string,
): value is BuiltInComposerSlashCommand {
  return BUILT_IN_COMMAND_SET.has(normalizeComposerSlashCommandName(value));
}

export function shouldKeepProviderSlashCommand(name: string): boolean {
  return !isBuiltInComposerSlashCommandName(name);
}

export interface ComposerSlashInvocation {
  readonly command: BuiltInComposerSlashCommand;
  readonly args: string;
}

export function parseComposerSlashInvocation(text: string): ComposerSlashInvocation | null {
  const match = /^\/([a-z-]+)(?:\s+([\s\S]*))?$/i.exec(text.trim());
  if (!match) return null;
  const command = normalizeComposerSlashCommandName(match[1] ?? "");
  if (!isBuiltInComposerSlashCommandName(command)) return null;
  return { command, args: (match[2] ?? "").trim() };
}

export type FastSlashCommandAction = "toggle" | "on" | "off" | "status" | "invalid";

export function parseFastSlashCommandAction(text: string): FastSlashCommandAction | null {
  const invocation = parseComposerSlashInvocation(text);
  if (!invocation || invocation.command !== "fast") return null;
  const action = invocation.args.toLowerCase();
  if (!action) return "toggle";
  if (action === "on" || action === "off" || action === "status") return action;
  return "invalid";
}

export function buildSubagentsPrompt(existingPrompt: string): string {
  const instruction =
    "Run subagents for distinct tasks when delegation is useful. Delegate distinct work in parallel, then synthesize and verify the results.";
  const prompt = existingPrompt.trim();
  return prompt.length > 0 ? `${prompt}\n\n${instruction}` : instruction;
}

export function buildReviewPrompt(target: "changes" | "base-branch" = "changes"): string {
  const instruction =
    "Review the local code changes for bugs, risks, behavioral regressions, and missing tests. Put findings first, ordered by severity.";
  return target === "base-branch"
    ? `${instruction}\nFocus on the current branch diff against its base branch.`
    : `${instruction}\nFocus on the current uncommitted changes.`;
}

export function buildAutomationPrompt(task: string): string {
  return [
    "Create a persistent scheduled automation on this machine for the task below.",
    "Infer the schedule only from the user's wording. If the schedule is missing, ask one concise question before creating it. Use the available scheduling tools, verify the saved automation, and report its next run time.",
    task.trim(),
  ]
    .filter((part) => part.length > 0)
    .join("\n\n");
}
