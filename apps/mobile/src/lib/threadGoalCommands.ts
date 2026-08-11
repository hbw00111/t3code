import type { EnvironmentId, ServerProviderSlashCommand, ThreadId } from "@t3tools/contracts";

export type ComposerGoalCommand =
  | { readonly action: "set"; readonly objective: string }
  | { readonly action: "pause" | "resume" | "clear" }
  | { readonly action: "missing-objective" };

export type ExecutableComposerGoalCommand = Exclude<
  ComposerGoalCommand,
  { readonly action: "missing-objective" }
>;

export type ThreadComposerSubmission =
  | { readonly kind: "empty" }
  | { readonly kind: "goal"; readonly command: ComposerGoalCommand }
  | { readonly kind: "message" };

export type ThreadComposerSlashCommandItem =
  | {
      readonly id: string;
      readonly type: "slash-command";
      readonly command: "model" | "goal" | "plan" | "default";
      readonly label: string;
      readonly description: string;
    }
  | {
      readonly id: string;
      readonly type: "provider-slash-command";
      readonly command: ServerProviderSlashCommand;
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

export function buildThreadComposerSlashCommandItems(input: {
  readonly query: string;
  readonly providerDriver: string | null | undefined;
  readonly providerCommands: ReadonlyArray<ServerProviderSlashCommand>;
}): ThreadComposerSlashCommandItem[] {
  const query = input.query.toLowerCase();
  const builtIn: ThreadComposerBuiltInSlashCommandItem[] = [
    {
      id: "cmd:model",
      type: "slash-command",
      command: "model",
      label: "/model",
      description: "Switch model",
    },
    ...(providerSupportsThreadGoals(input.providerDriver)
      ? [
          {
            id: "cmd:goal",
            type: "slash-command" as const,
            command: "goal" as const,
            label: "/goal",
            description: "Run this thread with a persistent goal",
          },
        ]
      : []),
    {
      id: "cmd:plan",
      type: "slash-command",
      command: "plan",
      label: "/plan",
      description: "Switch to plan mode",
    },
    {
      id: "cmd:default",
      type: "slash-command",
      command: "default",
      label: "/default",
      description: "Switch to default mode",
    },
  ];

  const matchingBuiltIn = builtIn.filter((item) => item.command.includes(query));
  const matchingProvider = input.providerCommands.flatMap((command) => {
    const normalizedName = command.name.toLowerCase();
    // /goal is reserved for the native Codex goal operation.
    if (normalizedName === "goal" || !normalizedName.includes(query)) {
      return [];
    }
    return [
      {
        id: `pcmd:${command.name}`,
        type: "provider-slash-command" as const,
        command,
        label: `/${command.name}`,
        description: command.description ?? "",
      },
    ];
  });

  return [...matchingBuiltIn, ...matchingProvider];
}

export function parseComposerGoalCommand(text: string): ComposerGoalCommand | null {
  const match = /^\/goal(?:\s+([\s\S]*))?$/i.exec(text.trim());
  if (!match) return null;

  const argument = match[1]?.trim() ?? "";
  if (!argument) return { action: "missing-objective" };

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
