import type { ThreadGoalSnapshot, ThreadGoalStatus } from "@t3tools/contracts";
import { formatTokens } from "@t3tools/shared/usageFormat";
import {
  CheckIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  PauseIcon,
  PencilIcon,
  PlayIcon,
  TargetIcon,
  Trash2Icon,
  XIcon,
} from "lucide-react";
import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { useTranslation } from "react-i18next";

import { cn } from "~/lib/utils";
import {
  AlertDialog,
  AlertDialogClose,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogPopup,
  AlertDialogTitle,
} from "~/components/ui/alert-dialog";
import { Button } from "~/components/ui/button";
import { Spinner } from "~/components/ui/spinner";
import { Tooltip, TooltipPopup, TooltipTrigger } from "~/components/ui/tooltip";
import type { ThreadGoalAction, ThreadGoalEditorSession } from "~/goalCommandStateStore";

export interface ComposerPlanStatus {
  readonly currentStep: string;
  readonly completedSteps: number;
  readonly totalSteps: number;
  readonly steps: ReadonlyArray<{
    readonly step: string;
    readonly status: "pending" | "inProgress" | "completed";
  }>;
}

export interface ComposerLiveStatusStripProps {
  readonly plan: ComposerPlanStatus | null;
  readonly goal: ThreadGoalSnapshot | null;
  readonly goalStateReady?: boolean;
  readonly editorSession: ThreadGoalEditorSession | null;
  readonly pendingGoalAction: ThreadGoalAction | null;
  readonly disabled?: boolean;
  readonly onSetGoal: (objective: string) => void | boolean | Promise<boolean>;
  readonly onEditorSessionChange: (session: ThreadGoalEditorSession | null) => void;
  readonly onPauseGoal: () => void;
  readonly onResumeGoal: () => void;
  readonly onClearGoal: () => void;
}

function goalStatusTranslationKey(status: ThreadGoalStatus): string {
  switch (status) {
    case "active":
      return "chat.liveGoalActive";
    case "paused":
      return "chat.liveGoalPaused";
    case "blocked":
      return "chat.liveGoalBlocked";
    case "complete":
      return "chat.liveGoalComplete";
    case "budgetLimited":
      return "chat.liveGoalBudgetLimited";
    case "usageLimited":
      return "chat.liveGoalUsageLimited";
  }
}

function formatGoalTime(totalSeconds: number): string {
  const seconds = Math.max(0, Math.floor(totalSeconds));
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return remainder === 0 ? `${hours}h` : `${hours}h ${remainder}m`;
}

function IconAction({
  label,
  disabled,
  onClick,
  children,
}: {
  readonly label: string;
  readonly disabled?: boolean;
  readonly onClick: () => void;
  readonly children: React.ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            type="button"
            size="icon-xs"
            variant="ghost"
            className="text-muted-foreground hover:text-foreground"
            aria-label={label}
            disabled={disabled}
            onClick={onClick}
          >
            {children}
          </Button>
        }
      />
      <TooltipPopup side="top">{label}</TooltipPopup>
    </Tooltip>
  );
}

export function ComposerLiveStatusStrip({
  plan,
  goal,
  goalStateReady = true,
  editorSession,
  pendingGoalAction,
  disabled = false,
  onSetGoal,
  onEditorSessionChange,
  onPauseGoal,
  onResumeGoal,
  onClearGoal,
}: ComposerLiveStatusStripProps) {
  const { t } = useTranslation();
  const [clearConfirmOpen, setClearConfirmOpen] = useState(false);
  const [planExpanded, setPlanExpanded] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const editing = editorSession !== null;
  const draftObjective = editorSession?.draftObjective ?? goal?.objective ?? "";
  const submittedObjective = editorSession?.submittedObjective ?? null;
  const goalPending = disabled || pendingGoalAction !== null;

  useEffect(() => {
    if (!editing) return;
    inputRef.current?.focus();
    inputRef.current?.select();
  }, [editing]);

  useEffect(() => {
    if (!goalStateReady || goal) return;
    onEditorSessionChange(null);
    setClearConfirmOpen(false);
  }, [goal, goalStateReady, onEditorSessionChange]);

  useEffect(() => {
    if (
      !editing ||
      submittedObjective === null ||
      draftObjective.trim() !== submittedObjective ||
      goal?.objective !== submittedObjective
    ) {
      return;
    }
    onEditorSessionChange(null);
  }, [draftObjective, editing, goal?.objective, onEditorSessionChange, submittedObjective]);

  if (!plan && !goal) return null;

  const planSteps = plan?.steps ?? [];
  const totalSteps = planSteps.length > 0 ? planSteps.length : (plan?.totalSteps ?? 0);
  const completedSteps = plan
    ? planSteps.length > 0
      ? planSteps.filter((step) => step.status === "completed").length
      : Math.max(0, Math.min(plan.completedSteps, plan.totalSteps))
    : 0;
  const saveGoal = () => {
    const objective = draftObjective.trim();
    if (!objective || objective === goal?.objective) {
      if (objective === goal?.objective) onEditorSessionChange(null);
      return;
    }
    onEditorSessionChange({ draftObjective: objective, submittedObjective: null });
    const result = onSetGoal(objective);
    if (result instanceof Promise) {
      void result.then(
        (accepted) => {
          if (accepted) {
            onEditorSessionChange({ draftObjective: objective, submittedObjective: objective });
          }
        },
        () => undefined,
      );
    } else if (result !== false) {
      onEditorSessionChange({ draftObjective: objective, submittedObjective: objective });
    }
  };
  const cancelEdit = () => {
    onEditorSessionChange(null);
  };
  const onEditKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") {
      event.preventDefault();
      saveGoal();
    } else if (event.key === "Escape") {
      event.preventDefault();
      cancelEdit();
    }
  };
  const canResume =
    goal?.status === "paused" ||
    goal?.status === "blocked" ||
    goal?.status === "budgetLimited" ||
    goal?.status === "usageLimited";

  return (
    <>
      <section
        aria-label={t("chat.liveStatus")}
        data-composer-live-status="true"
        className="chat-composer-glass relative z-10 mx-auto mb-1.5 w-full max-w-3xl overflow-hidden rounded-xl border border-border/60 shadow-sm"
      >
        {plan ? (
          <div
            className={cn("text-xs", goal && "border-b border-border/55")}
            data-composer-plan-status="true"
          >
            <button
              type="button"
              aria-expanded={planExpanded}
              data-composer-plan-disclosure="true"
              disabled={planSteps.length === 0}
              onClick={() => setPlanExpanded((expanded) => !expanded)}
              className="grid min-h-9 w-full grid-cols-[auto_auto_minmax(0,1fr)_auto] items-center gap-x-2 px-3 py-1.5 text-left transition-colors hover:bg-accent/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/70 disabled:cursor-default sm:px-4"
            >
              {planExpanded ? (
                <ChevronDownIcon aria-hidden className="size-3.5 text-muted-foreground/70" />
              ) : (
                <ChevronRightIcon aria-hidden className="size-3.5 text-muted-foreground/70" />
              )}
              <span aria-hidden className="hidden h-1 w-14 items-center gap-0.5 sm:flex">
                {planSteps.map((step) => (
                  <span
                    key={step.step}
                    data-composer-plan-segment-status={step.status}
                    className={cn(
                      "h-1 min-w-0 flex-1 rounded-full transition-colors duration-200",
                      step.status === "completed"
                        ? "bg-success"
                        : step.status === "inProgress"
                          ? "bg-primary"
                          : "bg-muted-foreground/25",
                    )}
                  />
                ))}
              </span>
              <span className="min-w-0 truncate font-medium text-foreground">
                {plan.currentStep}
              </span>
              <span className="font-mono text-[.68rem] tabular-nums text-muted-foreground">
                {completedSteps}/{totalSteps}
              </span>
            </button>
            {planExpanded ? (
              <div className="space-y-px px-3 pb-2 pl-10 sm:px-4 sm:pl-[6.75rem]">
                {planSteps.map((step) => (
                  <div
                    key={step.step}
                    data-composer-plan-step-status={step.status}
                    className="flex items-baseline gap-2 leading-5"
                  >
                    <span
                      aria-hidden
                      className={cn(
                        "w-3 shrink-0 text-center font-mono text-[10px]",
                        step.status === "completed"
                          ? "text-success"
                          : step.status === "inProgress"
                            ? "text-primary"
                            : "text-muted-foreground/40",
                      )}
                    >
                      {step.status === "completed" ? "✓" : step.status === "inProgress" ? "●" : "○"}
                    </span>
                    <span
                      className={cn(
                        "min-w-0",
                        step.status === "completed"
                          ? "text-muted-foreground/55"
                          : step.status === "inProgress"
                            ? "text-foreground/90"
                            : "text-muted-foreground/70",
                      )}
                    >
                      {step.step}
                    </span>
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        ) : null}

        {goal ? (
          <div
            className="grid min-h-10 grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-2 px-3 py-1.5 sm:px-4"
            data-composer-goal-status={goal.status}
          >
            <TargetIcon
              aria-hidden
              className={cn(
                "size-3.5",
                goal.status === "complete"
                  ? "text-success-foreground"
                  : goal.status === "blocked" ||
                      goal.status === "budgetLimited" ||
                      goal.status === "usageLimited"
                    ? "text-warning-foreground"
                    : "text-info-foreground",
              )}
            />

            {editing ? (
              <div className="flex min-w-0 items-center gap-1.5">
                <input
                  ref={inputRef}
                  value={draftObjective}
                  onChange={(event) =>
                    onEditorSessionChange({
                      draftObjective: event.currentTarget.value,
                      submittedObjective: null,
                    })
                  }
                  onKeyDown={onEditKeyDown}
                  aria-label={t("chat.editGoalObjective")}
                  disabled={goalPending}
                  className="h-7 min-w-0 flex-1 rounded-md border border-input bg-background/70 px-2 text-sm text-foreground outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/35"
                />
                {pendingGoalAction !== null ? (
                  <span className="flex size-7 items-center justify-center text-muted-foreground">
                    <Spinner aria-label={t("common.loading")} className="size-3.5" />
                  </span>
                ) : (
                  <IconAction
                    label={t("common.save")}
                    disabled={!draftObjective.trim() || goalPending}
                    onClick={saveGoal}
                  >
                    <CheckIcon />
                  </IconAction>
                )}
                <IconAction label={t("common.cancel")} onClick={cancelEdit}>
                  <XIcon />
                </IconAction>
              </div>
            ) : (
              <div className="flex min-w-0 items-baseline gap-2 text-xs">
                <Tooltip>
                  <TooltipTrigger
                    render={
                      <span className="min-w-0 truncate font-medium text-foreground">
                        {goal.objective}
                      </span>
                    }
                  />
                  <TooltipPopup side="top" className="max-w-96 whitespace-normal">
                    {goal.objective}
                  </TooltipPopup>
                </Tooltip>
                <span className="shrink-0 text-muted-foreground">
                  {t(goalStatusTranslationKey(goal.status))}
                </span>
                <span className="hidden shrink-0 font-mono text-[.68rem] tabular-nums text-muted-foreground/75 sm:inline">
                  {goal.tokenBudget == null
                    ? formatTokens(goal.tokensUsed)
                    : `${formatTokens(goal.tokensUsed)}/${formatTokens(goal.tokenBudget)}`}{" "}
                  {t("chat.tokensShort")} · {formatGoalTime(goal.timeUsedSeconds)}
                </span>
              </div>
            )}

            {!editing ? (
              <div className="flex items-center gap-0.5">
                {pendingGoalAction !== null ? (
                  <span className="flex size-7 items-center justify-center text-muted-foreground">
                    <Spinner aria-label={t("common.loading")} className="size-3.5" />
                  </span>
                ) : (
                  <>
                    <IconAction
                      label={t("chat.editGoal")}
                      disabled={goalPending}
                      onClick={() => {
                        onEditorSessionChange({
                          draftObjective: goal.objective,
                          submittedObjective: null,
                        });
                      }}
                    >
                      <PencilIcon />
                    </IconAction>
                    {goal.status === "active" ? (
                      <IconAction
                        label={t("chat.pauseGoal")}
                        disabled={goalPending}
                        onClick={onPauseGoal}
                      >
                        <PauseIcon />
                      </IconAction>
                    ) : canResume ? (
                      <IconAction
                        label={t("chat.resumeGoal")}
                        disabled={goalPending}
                        onClick={onResumeGoal}
                      >
                        <PlayIcon />
                      </IconAction>
                    ) : null}
                    <IconAction
                      label={t("chat.clearGoal")}
                      disabled={goalPending}
                      onClick={() => setClearConfirmOpen(true)}
                    >
                      <Trash2Icon />
                    </IconAction>
                  </>
                )}
              </div>
            ) : null}
          </div>
        ) : null}
      </section>

      <AlertDialog open={clearConfirmOpen} onOpenChange={setClearConfirmOpen}>
        <AlertDialogPopup>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("chat.clearGoalTitle")}</AlertDialogTitle>
            <AlertDialogDescription>{t("chat.clearGoalDescription")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogClose render={<Button variant="outline" />}>
              {t("common.cancel")}
            </AlertDialogClose>
            <Button
              variant="destructive"
              disabled={goalPending}
              onClick={() => {
                setClearConfirmOpen(false);
                onClearGoal();
              }}
            >
              {t("chat.clearGoal")}
            </Button>
          </AlertDialogFooter>
        </AlertDialogPopup>
      </AlertDialog>
    </>
  );
}
