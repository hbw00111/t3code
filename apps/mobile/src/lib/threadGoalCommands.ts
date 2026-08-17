import type {
  EnvironmentId,
  ProviderDriverKind,
  ProviderInstanceId,
  ServerProvider,
  ServerProviderSkill,
  ServerProviderSlashCommand,
  ThreadId,
} from "@t3tools/contracts";
import type { EnvironmentConnectionPhase } from "@t3tools/client-runtime/connection";
import {
  BUILT_IN_COMPOSER_SLASH_COMMAND_DEFINITIONS,
  type BuiltInComposerSlashCommand,
  shouldKeepProviderSlashCommand,
} from "@t3tools/shared/composerSlashCommands";
import {
  insertRankedSearchResult,
  normalizeSearchQuery,
  scoreQueryMatch,
} from "@t3tools/shared/searchRanking";

export type ComposerGoalCommand =
  | { readonly action: "get" }
  | { readonly action: "set"; readonly objective: string }
  | { readonly action: "pause" | "resume" | "clear" };

export type ExecutableComposerGoalCommand = ComposerGoalCommand;

export type ThreadComposerSubmission =
  | { readonly kind: "empty" }
  | { readonly kind: "goal"; readonly command: ComposerGoalCommand }
  | { readonly kind: "message" };

export type ThreadComposerSlashCommandItem =
  | {
      readonly id: string;
      readonly type: "slash-command";
      readonly command: BuiltInComposerSlashCommand;
      readonly label: string;
      readonly description: string;
    }
  | {
      readonly id: string;
      readonly type: "provider-slash-command";
      readonly command: ServerProviderSlashCommand;
      readonly label: string;
      readonly description: string;
    }
  | {
      readonly id: string;
      readonly type: "skill";
      readonly skill: ServerProviderSkill;
      readonly label: string;
      readonly description: string;
    };

type ThreadComposerBuiltInSlashCommandItem = Extract<
  ThreadComposerSlashCommandItem,
  { readonly type: "slash-command" }
>;

export function providerSupportsThreadGoals(providerDriver: string | null | undefined): boolean {
  return providerDriver === "codex";
}

export function canExecuteThreadGoalCommand(input: {
  readonly connectionState: EnvironmentConnectionPhase | undefined;
  readonly providerDriver: string | null | undefined;
}): boolean {
  return input.connectionState === "connected" && providerSupportsThreadGoals(input.providerDriver);
}

export function resolveThreadGoalProviderDriver(input: {
  readonly sessionProviderInstanceId?: ProviderInstanceId | null;
  readonly modelSelectionInstanceId?: ProviderInstanceId | null;
  readonly providers:
    | ReadonlyArray<Pick<ServerProvider, "instanceId" | "driver">>
    | null
    | undefined;
}): ProviderDriverKind | null {
  const providerInstanceId =
    input.sessionProviderInstanceId ?? input.modelSelectionInstanceId ?? null;
  if (providerInstanceId === null) return null;

  return (
    input.providers?.find((provider) => provider.instanceId === providerInstanceId)?.driver ?? null
  );
}

export function buildThreadComposerSlashCommandItems(input: {
  readonly query: string;
  readonly providerDriver: string | null | undefined;
  readonly providerCommands: ReadonlyArray<ServerProviderSlashCommand>;
  readonly providerSkills?: ReadonlyArray<ServerProviderSkill>;
  readonly showInteractionModeToggle: boolean;
}): ThreadComposerSlashCommandItem[] {
  const builtIn: ThreadComposerBuiltInSlashCommandItem[] =
    BUILT_IN_COMPOSER_SLASH_COMMAND_DEFINITIONS.filter(
      (definition) =>
        input.showInteractionModeToggle ||
        (definition.command !== "plan" && definition.command !== "default"),
    ).map((definition) => ({
      id: `cmd:${definition.command}`,
      type: "slash-command",
      command: definition.command,
      label: definition.label,
      description: definition.description,
    }));
  const providerItems: ThreadComposerSlashCommandItem[] = input.providerCommands
    .filter((command) => shouldKeepProviderSlashCommand(command.name))
    .map((command) => ({
      id: `pcmd:${command.name}`,
      type: "provider-slash-command",
      command,
      label: `/${command.name}`,
      description: command.description ?? command.input?.hint ?? "",
    }));
  const skillItems: ThreadComposerSlashCommandItem[] = (input.providerSkills ?? [])
    .filter((skill) => skill.enabled)
    .map((skill) => ({
      id: `skill:${skill.name}`,
      type: "skill",
      skill,
      label: skill.displayName ?? skill.name,
      description: skill.shortDescription ?? skill.description ?? "",
    }));
  const items = [...builtIn, ...providerItems, ...skillItems];
  const query = normalizeSearchQuery(input.query, { trimLeadingPattern: /^\/+/ });
  if (!query) return items;

  const ranked: Array<{
    item: ThreadComposerSlashCommandItem;
    score: number;
    tieBreaker: string;
  }> = [];
  for (const item of items) {
    const primary =
      item.type === "slash-command"
        ? item.command
        : item.type === "provider-slash-command"
          ? item.command.name
          : item.skill.name;
    const scores = [
      scoreQueryMatch({
        value: primary.toLowerCase(),
        query,
        exactBase: 0,
        prefixBase: 2,
        boundaryBase: 4,
        includesBase: 6,
        fuzzyBase: 100,
        boundaryMarkers: ["-", "_", "/"],
      }),
      scoreQueryMatch({
        value: item.label.toLowerCase(),
        query,
        exactBase: 1,
        prefixBase: 3,
        boundaryBase: 5,
        includesBase: 7,
        fuzzyBase: 110,
        boundaryMarkers: ["-", "_", "/", " "],
      }),
      scoreQueryMatch({
        value: item.description.toLowerCase(),
        query,
        exactBase: 20,
        prefixBase: 22,
        boundaryBase: 24,
        includesBase: 26,
      }),
    ].filter((score): score is number => score !== null);
    if (scores.length === 0) continue;
    insertRankedSearchResult(
      ranked,
      { item, score: Math.min(...scores), tieBreaker: item.id },
      Number.POSITIVE_INFINITY,
    );
  }
  return ranked.map((entry) => entry.item);
}

export function parseComposerGoalCommand(text: string): ComposerGoalCommand | null {
  const match = /^\/goal(?:\s+([\s\S]*))?$/i.exec(text.trim());
  if (!match) return null;

  const argument = match[1]?.trim() ?? "";
  if (!argument) return { action: "get" };

  const action = argument.toLowerCase();
  if (action === "pause" || action === "resume" || action === "clear") {
    return { action };
  }
  return { action: "set", objective: argument };
}

export function resolveThreadComposerSubmission(input: {
  readonly text: string;
  readonly attachmentCount: number;
}): ThreadComposerSubmission {
  if (input.text.trim().length === 0 && input.attachmentCount === 0) {
    return { kind: "empty" };
  }
  if (input.attachmentCount === 0) {
    const command = parseComposerGoalCommand(input.text);
    if (command) {
      return { kind: "goal", command };
    }
  }
  return { kind: "message" };
}

interface GoalCommandTarget {
  readonly environmentId: EnvironmentId;
  readonly threadId: ThreadId;
}

export interface ThreadGoalOperations<Result> {
  readonly getGoal: (input: {
    readonly environmentId: EnvironmentId;
    readonly input: { readonly threadId: ThreadId };
  }) => Promise<Result>;
  readonly setGoal: (input: {
    readonly environmentId: EnvironmentId;
    readonly input: { readonly threadId: ThreadId; readonly objective: string };
  }) => Promise<Result>;
  readonly pauseGoal: (input: {
    readonly environmentId: EnvironmentId;
    readonly input: { readonly threadId: ThreadId };
  }) => Promise<Result>;
  readonly resumeGoal: (input: {
    readonly environmentId: EnvironmentId;
    readonly input: { readonly threadId: ThreadId };
  }) => Promise<Result>;
  readonly clearGoal: (input: {
    readonly environmentId: EnvironmentId;
    readonly input: { readonly threadId: ThreadId };
  }) => Promise<Result>;
}

export function dispatchThreadGoalCommand<Result>(input: {
  readonly command: ExecutableComposerGoalCommand;
  readonly target: GoalCommandTarget;
  readonly operations: ThreadGoalOperations<Result>;
}): Promise<Result> {
  const target = {
    environmentId: input.target.environmentId,
    input: { threadId: input.target.threadId },
  };
  switch (input.command.action) {
    case "get":
      return input.operations.getGoal(target);
    case "set":
      return input.operations.setGoal({
        environmentId: target.environmentId,
        input: { ...target.input, objective: input.command.objective },
      });
    case "pause":
      return input.operations.pauseGoal(target);
    case "resume":
      return input.operations.resumeGoal(target);
    case "clear":
      return input.operations.clearGoal(target);
  }
}
