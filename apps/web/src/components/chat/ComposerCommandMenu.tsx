import {
  type ProjectEntry,
  type ProviderDriverKind,
  type ServerProviderSkill,
  type ServerProviderSlashCommand,
} from "@t3tools/contracts";
import {
  ArchiveIcon,
  BoxIcon,
  BotIcon,
  BugIcon,
  CircleGaugeIcon,
  ClockIcon,
  DownloadIcon,
  EraserIcon,
  GitForkIcon,
  HammerIcon,
  LightbulbIcon,
  MessageCircleIcon,
  MessageSquareMoreIcon,
  NetworkIcon,
  ScanSearchIcon,
  SquareTerminalIcon,
  TargetIcon,
  type LucideIcon,
  ZapIcon,
} from "lucide-react";
import { memo, useLayoutEffect, useMemo, useRef } from "react";
import { useTranslation } from "react-i18next";

import { type ComposerSlashCommand, type ComposerTriggerKind } from "../../composer-logic";
import { formatProviderSkillInstallSource } from "~/providerSkillPresentation";
import { cn } from "~/lib/utils";
import {
  Command,
  CommandGroup,
  CommandGroupLabel,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "../ui/command";
import { PierreEntryIcon } from "./PierreEntryIcon";

export type ComposerCommandItem =
  | {
      id: string;
      type: "path";
      path: string;
      pathKind: ProjectEntry["kind"];
      label: string;
      description: string;
    }
  | {
      id: string;
      type: "slash-command";
      command: ComposerSlashCommand;
      label: string;
      description: string;
    }
  | {
      id: string;
      type: "provider-slash-command";
      provider: ProviderDriverKind;
      command: ServerProviderSlashCommand;
      label: string;
      description: string;
    }
  | {
      id: string;
      type: "skill";
      provider: ProviderDriverKind;
      skill: ServerProviderSkill;
      label: string;
      description: string;
    };

type ComposerCommandGroup = {
  id: string;
  label: string | null;
  items: ComposerCommandItem[];
};

const BUILT_IN_COMMAND_ICONS: Record<ComposerSlashCommand, LucideIcon> = {
  clear: EraserIcon,
  compact: ArchiveIcon,
  model: BotIcon,
  plan: LightbulbIcon,
  debug: BugIcon,
  default: HammerIcon,
  review: ScanSearchIcon,
  fork: GitForkIcon,
  side: MessageCircleIcon,
  status: CircleGaugeIcon,
  subagents: NetworkIcon,
  fast: ZapIcon,
  export: DownloadIcon,
  goal: TargetIcon,
  feedback: MessageSquareMoreIcon,
  automation: ClockIcon,
};

function BuiltInCommandGlyph({ command }: { readonly command: ComposerSlashCommand }) {
  const Icon = BUILT_IN_COMMAND_ICONS[command];
  return <Icon className="size-4 shrink-0 text-icon-muted" />;
}

function groupCommandItems(
  items: ComposerCommandItem[],
  triggerKind: ComposerTriggerKind | null,
  groupSlashCommandSections: boolean,
  labels: { skills: string; builtIn: string; provider: string },
): ComposerCommandGroup[] {
  if (triggerKind === "skill") {
    return items.length > 0 ? [{ id: "skills", label: labels.skills, items }] : [];
  }
  if (triggerKind !== "slash-command" || !groupSlashCommandSections) {
    return [{ id: "default", label: null, items }];
  }

  const builtInItems = items.filter((item) => item.type === "slash-command");
  const providerItems = items.filter((item) => item.type === "provider-slash-command");
  const skillItems = items.filter((item) => item.type === "skill");

  const groups: ComposerCommandGroup[] = [];
  if (builtInItems.length > 0) {
    groups.push({ id: "built-in", label: labels.builtIn, items: builtInItems });
  }
  if (providerItems.length > 0) {
    groups.push({ id: "provider", label: labels.provider, items: providerItems });
  }
  if (skillItems.length > 0) {
    groups.push({ id: "skills", label: labels.skills, items: skillItems });
  }
  return groups;
}

export const ComposerCommandMenu = memo(function ComposerCommandMenu(props: {
  items: ComposerCommandItem[];
  resolvedTheme: "light" | "dark";
  isLoading: boolean;
  triggerKind: ComposerTriggerKind | null;
  groupSlashCommandSections?: boolean;
  emptyStateText?: string;
  activeItemId: string | null;
  onHighlightedItemChange: (itemId: string | null) => void;
  onSelect: (item: ComposerCommandItem) => void;
}) {
  const { t } = useTranslation();
  const listRef = useRef<HTMLDivElement>(null);
  const groups = useMemo(
    () =>
      groupCommandItems(props.items, props.triggerKind, props.groupSlashCommandSections ?? true, {
        skills: t("chat.skills"),
        builtIn: t("chat.builtInCommands"),
        provider: t("chat.providerCommands"),
      }),
    [props.groupSlashCommandSections, props.items, props.triggerKind, t],
  );

  useLayoutEffect(() => {
    if (!props.activeItemId || !listRef.current) return;
    const el = listRef.current.querySelector<HTMLElement>(
      `[data-composer-item-id="${CSS.escape(props.activeItemId)}"]`,
    );
    el?.scrollIntoView({ block: "nearest" });
  }, [props.activeItemId]);

  return (
    <Command
      autoHighlight={false}
      mode="none"
      onItemHighlighted={(highlightedValue) => {
        props.onHighlightedItemChange(
          typeof highlightedValue === "string" ? highlightedValue : null,
        );
      }}
    >
      <div
        ref={listRef}
        className="dropdown-glass relative w-full overflow-hidden rounded-[20px] **:data-[slot=scroll-area-scrollbar]:data-[orientation=vertical]:my-4"
      >
        {props.items.length > 0 ? (
          <CommandList className="max-h-[min(34rem,55vh)]">
            {groups.map((group, groupIndex) => (
              <div key={group.id}>
                {groupIndex > 0 ? <CommandSeparator className="my-0.5" /> : null}
                <CommandGroup>
                  {group.label ? (
                    <CommandGroupLabel className="px-3 pt-2 pb-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-secondary-label">
                      {group.label}
                    </CommandGroupLabel>
                  ) : null}
                  {group.items.map((item) => (
                    <ComposerCommandMenuItem
                      key={item.id}
                      item={item}
                      resolvedTheme={props.resolvedTheme}
                      isActive={props.activeItemId === item.id}
                      onHighlight={props.onHighlightedItemChange}
                      onSelect={props.onSelect}
                    />
                  ))}
                </CommandGroup>
              </div>
            ))}
          </CommandList>
        ) : (
          <div className="px-5 py-3.5">
            {props.triggerKind === "skill" ? (
              <CommandGroup>
                <CommandGroupLabel className="px-0 pt-0 pb-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-secondary-label">
                  {t("chat.skills")}
                </CommandGroupLabel>
                <p className="text-secondary-label text-xs">
                  {props.isLoading
                    ? t("chat.searchingWorkspaceSkills")
                    : (props.emptyStateText ?? t("chat.noSkillsFound"))}
                </p>
              </CommandGroup>
            ) : (
              <p className="text-secondary-label text-xs">
                {props.isLoading
                  ? t("chat.searchingWorkspaceFiles")
                  : (props.emptyStateText ??
                    (props.triggerKind === "path"
                      ? t("chat.noMatchingFilesOrFolders")
                      : t("chat.noMatchingCommand")))}
              </p>
            )}
          </div>
        )}
      </div>
    </Command>
  );
});

const ComposerCommandMenuItem = memo(function ComposerCommandMenuItem(props: {
  item: ComposerCommandItem;
  resolvedTheme: "light" | "dark";
  isActive: boolean;
  onHighlight: (itemId: string | null) => void;
  onSelect: (item: ComposerCommandItem) => void;
}) {
  const skillSourceLabel =
    props.item.type === "skill" ? formatProviderSkillInstallSource(props.item.skill) : null;

  return (
    <CommandItem
      value={props.item.id}
      data-composer-item-id={props.item.id}
      className={cn(
        "cursor-pointer select-none gap-2 hover:bg-transparent hover:text-inherit data-highlighted:bg-transparent data-highlighted:text-inherit",
        props.isActive && "bg-accent! text-accent-foreground!",
      )}
      onMouseMove={() => {
        if (!props.isActive) props.onHighlight(props.item.id);
      }}
      onMouseDown={(event) => {
        event.preventDefault();
      }}
      onClick={() => {
        props.onSelect(props.item);
      }}
    >
      {props.item.type === "path" ? (
        <PierreEntryIcon
          pathValue={props.item.path}
          kind={props.item.pathKind}
          theme={props.resolvedTheme}
        />
      ) : null}
      {props.item.type === "slash-command" ? (
        <BuiltInCommandGlyph command={props.item.command} />
      ) : null}
      {props.item.type === "provider-slash-command" ? (
        <span className="inline-flex size-4 shrink-0 items-center justify-center text-icon-muted">
          <SquareTerminalIcon className="size-3.5" />
        </span>
      ) : null}
      {props.item.type === "skill" ? (
        <span className="inline-flex size-4 shrink-0 items-center justify-center text-icon-muted">
          <BoxIcon className="size-3.5" />
        </span>
      ) : null}
      <span className="flex min-w-0 flex-1 items-center gap-2">
        <span className="shrink-0">{props.item.label}</span>
        <span className="min-w-0 flex-1 truncate text-secondary-label text-xs">
          {props.item.description}
        </span>
      </span>
      {props.item.type === "slash-command" ? (
        <span className="shrink-0 pl-2 text-secondary-label text-xs">/{props.item.command}</span>
      ) : skillSourceLabel ? (
        <span className="shrink-0 pl-2 text-secondary-label text-xs">{skillSourceLabel}</span>
      ) : null}
    </CommandItem>
  );
});
