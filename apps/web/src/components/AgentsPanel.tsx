/**
 * Agents right-panel surface: the fleet view over the native subagent fold,
 * and the ONLY place the roster renders (the chat carries one CTA row per
 * spawn batch).
 *
 * Visualization rules (from live-test feedback):
 * - Spawn order is stable. Activity and completion update rows in place.
 * - Collapsed agent rows reserve three fixed lines; details only affect height
 *   after the user explicitly opens a row.
 * - A user's open/closed choice is presentation state and survives live data
 *   updates for that stable agent identity.
 * - Workflow expansion is presentation state. A live run stays expanded when
 *   it settles; older collapsed runs can still be opened at run granularity.
 * - Static status dots, DOM-write elapsed timers, plain token counters.
 */
import { useAtomValue } from "@effect/atom-react";
import type {
  AgentPanelModel,
  AgentPanelWorkflowGroup,
  RuntimeSubagent,
} from "@t3tools/client-runtime/state/subagentRuntime";
import {
  formatSubagentModelLabel,
  formatSubagentTokenCount,
} from "@t3tools/client-runtime/state/subagentRuntime";
import type { EnvironmentId, ThreadId } from "@t3tools/contracts";
import { Bot, Braces, Check, ChevronDown, ChevronRight, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import { cn } from "~/lib/utils";
import { orchestrationEnvironment } from "~/state/orchestration";
import { ScrollArea } from "~/components/ui/scroll-area";

/**
 * In-flight states all present as Working (one steady state, per the
 * monitoring-pill design: detail belongs in the activity sub-line, and a
 * stalled/waiting/queued subagent is still the fleet doing its job, not a
 * user problem). Only settled states differentiate.
 */
const STATUS_DOT_CLASSES: Record<RuntimeSubagent["status"], string> = {
  pending: "bg-info",
  running: "bg-info",
  waiting: "bg-info",
  // Idle reads as settled (muted, not sky): a resting Codex child looks done
  // unless resumed — live-test: sky idle dots read as stuck in-progress.
  idle: "bg-muted-foreground/50",
  completed: "bg-success",
  failed: "bg-destructive",
  cancelled: "bg-muted-foreground/60",
  interrupted: "bg-muted-foreground/60",
};

function statusTranslationKey(status: RuntimeSubagent["status"]): string {
  switch (status) {
    case "pending":
    case "running":
      return "agents.statusWorking";
    case "waiting":
      return "agents.statusWaiting";
    case "idle":
      return "agents.statusIdleResumable";
    case "completed":
      return "agents.statusCompleted";
    case "failed":
      return "agents.statusFailed";
    case "cancelled":
    case "interrupted":
      return "agents.statusStopped";
  }
}

function StatusDot({ status }: { status: RuntimeSubagent["status"] }) {
  return (
    <span
      aria-hidden
      className={cn("size-1.5 shrink-0 rounded-full", STATUS_DOT_CLASSES[status])}
    />
  );
}

function formatElapsedSeconds(totalSeconds: number): string {
  const seconds = Math.max(0, Math.floor(totalSeconds));
  const minutes = Math.floor(seconds / 60);
  if (minutes === 0) {
    return `${seconds}s`;
  }
  const hours = Math.floor(minutes / 60);
  if (hours === 0) {
    return `${minutes}m ${String(seconds % 60).padStart(2, "0")}s`;
  }
  return `${hours}h ${String(minutes % 60).padStart(2, "0")}m`;
}

function elapsedBetween(startedAt: string, endIso: string | null): string {
  const start = Date.parse(startedAt);
  const end = endIso ? Date.parse(endIso) : Date.now();
  if (Number.isNaN(start) || Number.isNaN(end)) {
    return "";
  }
  return formatElapsedSeconds((end - start) / 1000);
}

/**
 * Elapsed time for the current activation. Live agents self-tick via DOM
 * writes (zero React commits per tick); settled agents freeze at completedAt.
 */
function AgentElapsed({ agent }: { agent: RuntimeSubagent }) {
  const textRef = useRef<HTMLSpanElement>(null);
  const live = agent.status === "running" || agent.status === "waiting";
  const startedAt = agent.startedAt;

  useEffect(() => {
    if (!live || !startedAt) {
      return;
    }
    const update = () => {
      if (textRef.current) {
        textRef.current.textContent = elapsedBetween(startedAt, null);
      }
    };
    update();
    const id = setInterval(update, 1000);
    return () => clearInterval(id);
  }, [live, startedAt]);

  if (!startedAt) {
    return null;
  }
  return (
    <span ref={textRef} className="tabular-nums">
      {elapsedBetween(startedAt, live ? null : agent.completedAt)}
    </span>
  );
}

/**
 * Status-dependent activity line. Live rows lead with what is happening now;
 * settled rows lead with the outcome. Errors are the only inline previews on
 * failed rows because they explain a red row at a glance.
 */
function agentActivityText(agent: RuntimeSubagent): string | null {
  const live =
    agent.status === "running" || agent.status === "pending" || agent.status === "waiting";
  if (live) {
    return (
      agent.progress ??
      (agent.lastToolName ? `▸ ${agent.lastToolName}` : null) ??
      agent.result ??
      agent.error
    );
  }
  return (
    agent.error ??
    agent.result ??
    agent.progress ??
    (agent.lastToolName ? `▸ ${agent.lastToolName}` : null)
  );
}

function formatActivityTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

function usageDetails(agent: RuntimeSubagent): ReadonlyArray<[string, string]> {
  const usage = agent.usage;
  if (!usage) return [];
  return [
    ["agents.usageTotal", formatSubagentTokenCount(usage.totalTokens)],
    ...(usage.inputTokens === undefined
      ? []
      : [["agents.usageInput", formatSubagentTokenCount(usage.inputTokens)] as [string, string]]),
    ...(usage.cachedInputTokens === undefined
      ? []
      : [
          ["agents.usageCached", formatSubagentTokenCount(usage.cachedInputTokens)] as [
            string,
            string,
          ],
        ]),
    ...(usage.outputTokens === undefined
      ? []
      : [["agents.usageOutput", formatSubagentTokenCount(usage.outputTokens)] as [string, string]]),
    ...(usage.reasoningOutputTokens === undefined
      ? []
      : [
          ["agents.usageReasoning", formatSubagentTokenCount(usage.reasoningOutputTokens)] as [
            string,
            string,
          ],
        ]),
    ...(usage.toolUses === undefined
      ? []
      : [["agents.usageTools", String(usage.toolUses)] as [string, string]]),
  ];
}

/** Stable collapsed summary with a user-controlled live detail view. */
export function AgentRow({
  agent,
  defaultOpen = false,
}: {
  agent: RuntimeSubagent;
  defaultOpen?: boolean;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(defaultOpen);
  const statusLabel = t(statusTranslationKey(agent.status));
  const activity = agentActivityText(agent);
  const modelLabel = formatSubagentModelLabel(agent.model, agent.effort);
  const role =
    agent.role?.trim().toLocaleLowerCase() === agent.title.trim().toLocaleLowerCase()
      ? null
      : agent.role;
  const metadata = [
    modelLabel,
    agent.usage
      ? t("agents.tokensShort", { count: formatSubagentTokenCount(agent.usage.totalTokens) })
      : t("agents.tokensUnavailable"),
    agent.usage?.toolUses !== undefined
      ? t("agents.toolsShort", { count: agent.usage.toolUses })
      : null,
    agent.activationCount > 1 ? t("agents.runShort", { count: agent.activationCount }) : null,
  ].filter((value): value is string => value !== null);
  const details = usageDetails(agent);
  const hasOutcome = Boolean(agent.error || agent.result);

  return (
    <article
      className={cn("rounded-md border border-transparent", open && "border-border/60 bg-card/35")}
      data-agent-id={agent.id}
      data-agent-expanded={open ? "true" : "false"}
    >
      <button
        type="button"
        className="grid h-[3.875rem] w-full grid-cols-[0.375rem_minmax(0,1fr)_auto_auto] grid-rows-[1.25rem_1.125rem_1rem] items-center gap-x-2 rounded-md px-1.5 py-1 text-left hover:bg-accent/35 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
      >
        <span className="col-start-1 row-start-1 flex items-center">
          <StatusDot status={agent.status} />
        </span>
        <span className="col-start-2 row-start-1 flex min-w-0 items-baseline gap-2">
          <span className="min-w-0 truncate text-sm font-medium">{agent.title}</span>
          {role ? (
            <span className="max-w-28 shrink-0 truncate rounded-sm border border-border/60 px-1 font-mono text-[.65rem] text-muted-foreground">
              {role}
            </span>
          ) : null}
        </span>
        <span className="col-start-3 row-start-1 min-w-14 text-right font-mono text-[.7rem] text-muted-foreground/80">
          <span className="inline-flex items-center gap-1">
            <AgentElapsed agent={agent} />
            {agent.status === "completed" ? (
              <Check aria-hidden className="size-3 text-success" />
            ) : null}
          </span>
        </span>
        <span className="col-start-4 row-start-1 text-muted-foreground/70">
          {open ? (
            <ChevronDown aria-hidden className="size-3.5" />
          ) : (
            <ChevronRight aria-hidden className="size-3.5" />
          )}
        </span>
        <span
          className={cn(
            "col-start-2 col-end-5 row-start-2 block truncate text-xs",
            agent.status === "failed" ? "text-destructive-foreground" : "text-muted-foreground",
          )}
        >
          {activity ?? statusLabel}
        </span>
        <span className="col-start-2 col-end-5 row-start-3 truncate font-mono text-[.7rem] tabular-nums text-muted-foreground/70">
          {metadata.join(" · ")}
        </span>
        <span className="sr-only">{statusLabel}</span>
        <span className="sr-only">
          {t(open ? "agents.collapseAgent" : "agents.expandAgent", { name: agent.title })}
        </span>
      </button>

      {open ? (
        <div className="border-t border-border/50 px-3 pb-3 pt-2" data-agent-details="true">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
            <span className="inline-flex items-center gap-1.5 font-medium">
              <StatusDot status={agent.status} />
              {statusLabel}
            </span>
            {agent.role ? (
              <span className="font-mono text-[.7rem] text-muted-foreground">{agent.role}</span>
            ) : null}
            {agent.phaseTitle ? (
              <span className="text-muted-foreground">{agent.phaseTitle}</span>
            ) : null}
          </div>

          {activity ? (
            <p
              className={cn(
                "mt-2 whitespace-pre-wrap break-words font-mono text-[.72rem] leading-relaxed",
                agent.status === "failed" ? "text-destructive-foreground" : "text-foreground/85",
              )}
              data-agent-current-activity="complete"
            >
              {activity}
            </p>
          ) : null}

          {agent.recentActivity.length > 0 ? (
            <div className="mt-3" data-agent-activity-timeline="true">
              <div className="text-[.65rem] font-medium uppercase text-muted-foreground">
                {t("agents.recentActivity")}
              </div>
              <ol className="mt-1.5 space-y-0">
                {agent.recentActivity.map((entry, index) => (
                  <li
                    key={`${entry.at}:${entry.summary}`}
                    className="grid grid-cols-[3.5rem_0.5rem_minmax(0,1fr)] gap-x-1.5"
                  >
                    <time className="pt-0.5 text-right font-mono text-[.62rem] tabular-nums text-muted-foreground/65">
                      {formatActivityTime(entry.at)}
                    </time>
                    <span className="relative flex justify-center" aria-hidden>
                      {index < agent.recentActivity.length - 1 ? (
                        <span className="absolute bottom-0 top-2 w-px bg-border/65" />
                      ) : null}
                      <span className="relative mt-1.5 size-1.5 rounded-full bg-muted-foreground/50" />
                    </span>
                    <span className="min-w-0 whitespace-pre-wrap break-words pb-2 font-mono text-[.7rem] leading-relaxed text-foreground/80">
                      {entry.summary}
                    </span>
                  </li>
                ))}
              </ol>
            </div>
          ) : null}

          {details.length > 0 || modelLabel || agent.activationCount > 1 ? (
            <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 border-t border-border/45 pt-2 text-[.68rem] sm:grid-cols-3">
              {modelLabel ? (
                <div className="min-w-0">
                  <dt className="text-muted-foreground">{t("agents.model")}</dt>
                  <dd className="truncate font-mono text-foreground/80">{modelLabel}</dd>
                </div>
              ) : null}
              {details.map(([label, value]) => (
                <div key={label} className="min-w-0">
                  <dt className="text-muted-foreground">{t(label)}</dt>
                  <dd className="font-mono tabular-nums text-foreground/80">{value}</dd>
                </div>
              ))}
              {agent.activationCount > 1 ? (
                <div>
                  <dt className="text-muted-foreground">{t("agents.run")}</dt>
                  <dd className="font-mono tabular-nums text-foreground/80">
                    {agent.activationCount}
                  </dd>
                </div>
              ) : null}
            </dl>
          ) : null}

          {hasOutcome ? (
            <div
              className={cn(
                "mt-2 border-t border-border/45 pt-2",
                agent.error && "text-destructive-foreground",
              )}
            >
              <div className="text-[.65rem] font-medium uppercase text-muted-foreground">
                {t(agent.error ? "agents.error" : "agents.result")}
              </div>
              <p className="mt-1 whitespace-pre-wrap break-words text-xs leading-relaxed">
                {agent.error ?? agent.result}
              </p>
            </div>
          ) : null}
        </div>
      ) : null}
    </article>
  );
}

function workflowIsLive(group: AgentPanelWorkflowGroup): boolean {
  const status = group.workflow.status;
  return (
    status !== "completed" &&
    status !== "failed" &&
    status !== "cancelled" &&
    status !== "interrupted"
  );
}

function workflowMembers(group: AgentPanelWorkflowGroup): ReadonlyArray<RuntimeSubagent> {
  return [...group.phases.flatMap((phase) => phase.members), ...group.unphasedMembers];
}

/**
 * Phase rail: the run's shape at a glance. One segment per phase in order,
 * separated by chevrons; each segment shows title + one dot per member.
 * The whole arc (done → live → pending) is visible without scrolling the
 * member list.
 */
function PhaseRail({ group }: { group: AgentPanelWorkflowGroup }) {
  if (group.phases.length === 0) {
    return null;
  }
  return (
    <div className="flex flex-wrap items-center gap-x-1 gap-y-1 px-1.5 pb-1 pt-1.5">
      {group.phases.map((phase, index) => (
        <div key={phase.index} className="flex items-center gap-1">
          {index > 0 ? (
            <ChevronRight aria-hidden className="size-3 text-muted-foreground/40" />
          ) : null}
          <div
            className={cn(
              "flex items-center gap-1 rounded-sm border px-1.5 py-0.5",
              phase.state === "running"
                ? "border-info/40"
                : phase.state === "done"
                  ? "border-success/30"
                  : "border-border/50",
            )}
          >
            <span
              className={cn(
                "font-mono text-[.65rem]",
                phase.state === "running"
                  ? "text-info-foreground"
                  : phase.state === "done"
                    ? "text-success-foreground"
                    : "text-muted-foreground/70",
              )}
            >
              {phase.state === "done" ? "✓ " : ""}
              {phase.title}
            </span>
            <span className="flex items-center gap-0.5">
              {phase.members.length === 0 ? (
                <span className="font-mono text-[.6rem] text-muted-foreground/50">–</span>
              ) : (
                phase.members.map((member) => <StatusDot key={member.id} status={member.status} />)
              )}
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}

/**
 * Read-only workflow script viewer, fetched through the contained
 * getWorkflowScript RPC (never a raw filesystem read from the client).
 */
function WorkflowScriptView({
  environmentId,
  threadId,
  scriptPath,
  onClose,
}: {
  environmentId: EnvironmentId;
  threadId: ThreadId;
  scriptPath: string;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const result = useAtomValue(
    orchestrationEnvironment.workflowScript({ environmentId, input: { threadId, scriptPath } }),
  );
  return (
    <div className="mx-1.5 mb-1 rounded-md border border-border/60 bg-background/60">
      <div className="flex items-center gap-2 border-b border-border/50 px-2 py-1">
        <Braces aria-hidden className="size-3 text-muted-foreground" />
        <span className="truncate font-mono text-[.65rem] text-muted-foreground">
          {scriptPath.split("/").at(-1)}
        </span>
        <button
          type="button"
          onClick={onClose}
          aria-label={t("agents.closeScript")}
          className="ml-auto text-muted-foreground hover:text-foreground"
        >
          <X aria-hidden className="size-3" />
        </button>
      </div>
      <div className="max-h-72 overflow-auto p-2">
        {result._tag === "Success" ? (
          <pre className="whitespace-pre-wrap break-words font-mono text-[.7rem] leading-relaxed text-foreground/90">
            {result.value.contents}
            {result.value.truncated ? `\n${t("agents.truncated")}` : ""}
          </pre>
        ) : result._tag === "Failure" ? (
          <p className="text-xs text-destructive-foreground">{t("agents.scriptLoadFailed")}</p>
        ) : (
          <p className="text-xs text-muted-foreground">{t("common.loading")}</p>
        )}
      </div>
    </div>
  );
}

/**
 * Collapsible phase section. A phase opens when it becomes active, then keeps
 * that shape as it settles so completion never yanks rows out from under the
 * user. Manual toggles stick until a later activation begins.
 */
function PhaseSection({
  phase,
  defaultOpen = false,
}: {
  phase: AgentPanelWorkflowGroup["phases"][number];
  defaultOpen?: boolean;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(defaultOpen || phase.state === "running");
  const previousState = useRef(phase.state);

  useEffect(() => {
    if (previousState.current !== "running" && phase.state === "running") {
      setOpen(true);
    }
    previousState.current = phase.state;
  }, [phase.state]);

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        className={cn(
          "mt-2 flex w-full items-center gap-1.5 rounded-sm px-1.5 text-left text-[.65rem] font-medium uppercase hover:bg-accent/40",
          phase.state === "done"
            ? "text-success-foreground"
            : phase.state === "running"
              ? "text-info-foreground"
              : "text-muted-foreground/70",
        )}
      >
        {open ? (
          <ChevronDown aria-hidden className="size-3 shrink-0" />
        ) : (
          <ChevronRight aria-hidden className="size-3 shrink-0" />
        )}
        {phase.state === "done" ? <Check aria-hidden className="size-3" /> : null}
        <span>{phase.title}</span>
        <span className="font-normal normal-case text-muted-foreground/70">
          {phase.state === "pending" && phase.members.length === 0
            ? t("agents.phasePending")
            : phase.state === "done"
              ? t("agents.phaseDone", { count: phase.settledCount })
              : t("agents.phaseProgress", {
                  active: phase.activeCount,
                  settled: phase.settledCount,
                })}
        </span>
        {!open && phase.members.length > 0 ? (
          <span className="ml-auto flex items-center gap-0.5">
            {phase.members.map((member) => (
              <StatusDot key={member.id} status={member.status} />
            ))}
          </span>
        ) : null}
      </button>
      {open ? phase.members.map((member) => <AgentRow key={member.id} agent={member} />) : null}
    </div>
  );
}

/** Expanded workflow: phase rail + full phase tree. */
function ExpandedWorkflowSection({
  group,
  environmentId,
  threadId,
  onCollapse,
}: {
  group: AgentPanelWorkflowGroup;
  environmentId: EnvironmentId | null;
  threadId: ThreadId | null;
  onCollapse: () => void;
}) {
  const { t } = useTranslation();
  const [scriptOpen, setScriptOpen] = useState(false);
  const members = workflowMembers(group);
  const settled = members.filter(
    (member) =>
      member.status === "completed" ||
      member.status === "failed" ||
      member.status === "cancelled" ||
      member.status === "interrupted",
  ).length;
  const scriptPath = group.workflow.runHandles?.scriptPath;
  const canShowScript = scriptPath !== undefined && environmentId !== null && threadId !== null;
  return (
    <section className="rounded-lg border border-border/50 bg-card/30 p-1.5">
      <div className="flex items-center gap-2 px-1.5 pt-0.5 text-[.65rem] font-medium uppercase text-muted-foreground">
        <StatusDot status={group.workflow.status} />
        <span className="min-w-0 truncate">
          {group.workflow.workflowName ?? group.workflow.title}
        </span>
        {canShowScript ? (
          <button
            type="button"
            onClick={() => setScriptOpen((value) => !value)}
            className={cn(
              "rounded-sm border border-border/60 px-1 font-mono normal-case hover:text-foreground",
              scriptOpen && "text-foreground",
            )}
            aria-expanded={scriptOpen}
          >
            {"{}"} {t("agents.script")}
          </button>
        ) : null}
        <span className="ml-auto font-mono normal-case text-muted-foreground/80">
          {t("agents.workflowSettled", { settled, total: members.length })}
        </span>
        <button
          type="button"
          onClick={onCollapse}
          aria-label={t("agents.collapseWorkflow")}
          className="text-muted-foreground hover:text-foreground"
        >
          <ChevronDown aria-hidden className="size-3" />
        </button>
      </div>
      <PhaseRail group={group} />
      {scriptOpen && canShowScript ? (
        <WorkflowScriptView
          environmentId={environmentId}
          threadId={threadId}
          scriptPath={scriptPath}
          onClose={() => setScriptOpen(false)}
        />
      ) : null}
      {group.phases.map((phase) => (
        <PhaseSection key={phase.index} phase={phase} defaultOpen={!workflowIsLive(group)} />
      ))}
      {group.unphasedMembers.map((member) => (
        <AgentRow key={member.id} agent={member} />
      ))}
      {group.phases.length === 0 && group.unphasedMembers.length === 0 ? (
        <AgentRow agent={group.workflow} />
      ) : null}
    </section>
  );
}

/**
 * Collapsed workflow: one summary line. The parent owns expansion so a live
 * workflow keeps its shape when it settles.
 */
export function CollapsedWorkflowSection({
  group,
  onExpand,
}: {
  group: AgentPanelWorkflowGroup;
  onExpand: () => void;
}) {
  const { t } = useTranslation();
  const members = workflowMembers(group);
  const failed = members.filter((member) => member.status === "failed").length;
  const summaryStatus = failed > 0 ? "failed" : group.workflow.status;
  // Coordinator usage may already aggregate members (panel-footer rule):
  // count it only when there are no member rows to sum.
  const totalTokens = members.reduce(
    (sum, member) => sum + (member.usage?.totalTokens ?? 0),
    members.length === 0 ? (group.workflow.usage?.totalTokens ?? 0) : 0,
  );
  const elapsed =
    group.workflow.startedAt && group.workflow.completedAt
      ? elapsedBetween(group.workflow.startedAt, group.workflow.completedAt)
      : null;
  return (
    <section>
      <button
        type="button"
        onClick={onExpand}
        className="flex w-full items-center gap-2 rounded-md px-1.5 py-1 text-left hover:bg-accent/40"
        aria-expanded={false}
      >
        <StatusDot status={summaryStatus} />
        <span className="sr-only">{t(statusTranslationKey(summaryStatus))}</span>
        <span className="truncate text-sm">
          {group.workflow.workflowName ?? group.workflow.title}
        </span>
        <span className="ml-auto flex items-center gap-1.5 font-mono text-[.7rem] text-muted-foreground/80">
          {failed > 0 ? (
            <span className="text-destructive-foreground">
              {t("agents.failedCount", { count: failed })}
            </span>
          ) : null}
          <span>{t("agents.agentCount", { count: members.length })}</span>
          <span className="tabular-nums">
            · {t("agents.tokensShort", { count: formatSubagentTokenCount(totalTokens) })}
          </span>
          {elapsed ? <span className="tabular-nums">· {elapsed}</span> : null}
          <ChevronRight aria-hidden className="size-3" />
        </span>
      </button>
    </section>
  );
}

/** A workflow's open state is presentation state, not a status derivative. */
function WorkflowSection({
  group,
  environmentId,
  threadId,
}: {
  group: AgentPanelWorkflowGroup;
  environmentId: EnvironmentId | null;
  threadId: ThreadId | null;
}) {
  const [open, setOpen] = useState(() => workflowIsLive(group));
  return open ? (
    <ExpandedWorkflowSection
      group={group}
      environmentId={environmentId}
      threadId={threadId}
      onCollapse={() => setOpen(false)}
    />
  ) : (
    <CollapsedWorkflowSection group={group} onExpand={() => setOpen(true)} />
  );
}

export function AgentsPanel({
  model,
  environmentId = null,
  threadId = null,
}: {
  model: AgentPanelModel;
  environmentId?: EnvironmentId | null;
  threadId?: ThreadId | null;
}) {
  const { t } = useTranslation();
  if (!model.hasAgents) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 p-6 text-center">
        <Bot aria-hidden className="size-6 text-muted-foreground/60" />
        <p className="text-sm font-medium">{t("agents.emptyTitle")}</p>
        <p className="max-w-56 text-xs text-muted-foreground">{t("agents.emptyDescription")}</p>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <ScrollArea className="min-h-0 flex-1">
        <div className="flex flex-col gap-2 p-2">
          {model.workflows.map((group) => (
            <WorkflowSection
              key={group.workflow.id}
              group={group}
              environmentId={environmentId}
              threadId={threadId}
            />
          ))}
          {model.directAgents.length > 0 ? (
            <section>
              <div className="px-1.5 pt-1 text-[.65rem] font-medium uppercase text-muted-foreground">
                {t("agents.directSpawns")}
              </div>
              {model.directAgents.map((agent) => (
                <AgentRow key={agent.id} agent={agent} />
              ))}
            </section>
          ) : null}
        </div>
      </ScrollArea>
      <footer className="flex items-center justify-between border-t border-border/60 px-3 py-1.5 font-mono text-[.7rem] text-muted-foreground">
        <span className="flex items-center gap-2">
          {model.runningCount + model.waitingCount > 0 ? (
            <span className="text-info-foreground">
              ● {t("agents.workingCount", { count: model.runningCount + model.waitingCount })}
            </span>
          ) : null}
          {model.idleCount > 0 ? (
            <span>{t("agents.idleCount", { count: model.idleCount })}</span>
          ) : null}
          {model.settledCount > 0 ? (
            <span>{t("agents.settledCount", { count: model.settledCount })}</span>
          ) : null}
        </span>
        <span className="tabular-nums">
          Σ {t("agents.tokensShort", { count: formatSubagentTokenCount(model.totalTokens) })}
        </span>
      </footer>
    </div>
  );
}
