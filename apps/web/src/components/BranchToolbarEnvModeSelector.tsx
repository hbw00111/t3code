import { FolderGit2Icon, FolderGitIcon, FolderIcon, HistoryIcon } from "lucide-react";
import { memo, useMemo } from "react";
import { useTranslation } from "react-i18next";

import { type EnvMode } from "./BranchToolbar.logic";
import {
  Select,
  SelectGroup,
  SelectGroupLabel,
  SelectItem,
  SelectPopup,
  SelectTrigger,
  SelectValue,
} from "./ui/select";

export const PREVIOUS_WORKTREE_SELECT_VALUE = "previous-worktree";

interface BranchToolbarEnvModeSelectorProps {
  envLocked: boolean;
  effectiveEnvMode: EnvMode;
  activeWorktreePath: string | null;
  onEnvModeChange: (mode: EnvMode) => void;
  previousWorktreeLabel?: string | null;
  onUsePreviousWorktree?: () => void;
}

export const BranchToolbarEnvModeSelector = memo(function BranchToolbarEnvModeSelector({
  envLocked,
  effectiveEnvMode,
  activeWorktreePath,
  onEnvModeChange,
  previousWorktreeLabel,
  onUsePreviousWorktree,
}: BranchToolbarEnvModeSelectorProps) {
  const { t } = useTranslation();
  const showPreviousWorktree = Boolean(previousWorktreeLabel && onUsePreviousWorktree);
  const envModeItems = useMemo(
    () => [
      {
        value: "local",
        label: activeWorktreePath
          ? t("branchToolbar.currentWorktree")
          : t("branchToolbar.currentCheckout"),
      },
      { value: "worktree", label: t("branchToolbar.newWorktree") },
      ...(showPreviousWorktree && previousWorktreeLabel
        ? [{ value: PREVIOUS_WORKTREE_SELECT_VALUE, label: previousWorktreeLabel }]
        : []),
    ],
    [activeWorktreePath, previousWorktreeLabel, showPreviousWorktree, t],
  );

  if (envLocked) {
    return (
      <span className="inline-flex h-7 shrink-0 items-center gap-1 border border-transparent px-[calc(--spacing(3)-1px)] text-sm font-medium text-muted-foreground/70 sm:h-6 sm:text-xs">
        {activeWorktreePath ? (
          <>
            <FolderGitIcon className="size-3" />
            {t("branchToolbar.worktree")}
          </>
        ) : (
          <>
            <FolderIcon className="size-3" />
            {t("branchToolbar.localCheckout")}
          </>
        )}
      </span>
    );
  }

  return (
    <Select
      modal={false}
      value={effectiveEnvMode}
      onValueChange={(value: string | null) => {
        if (value === PREVIOUS_WORKTREE_SELECT_VALUE) {
          onUsePreviousWorktree?.();
          return;
        }
        onEnvModeChange(value as EnvMode);
      }}
      items={envModeItems}
    >
      <SelectTrigger
        variant="ghost"
        size="xs"
        className="min-w-0 shrink font-medium"
        aria-label={t("branchToolbar.workspace")}
      >
        {effectiveEnvMode === "worktree" ? (
          <FolderGit2Icon className="size-3" />
        ) : activeWorktreePath ? (
          <FolderGitIcon className="size-3" />
        ) : (
          <FolderIcon className="size-3" />
        )}
        <span
          data-composer-label
          className="min-w-0 max-w-[240px] truncate transition-[max-width,opacity] duration-300 ease-out group-data-[compact]/composer-context:max-w-0 group-data-[compact]/composer-context:opacity-0"
        >
          <SelectValue />
        </span>
      </SelectTrigger>
      <SelectPopup>
        <SelectGroup>
          <SelectGroupLabel>{t("branchToolbar.workspace")}</SelectGroupLabel>
          <SelectItem value="local">
            <span className="inline-flex items-center gap-1.5">
              {activeWorktreePath ? (
                <FolderGitIcon className="size-3" />
              ) : (
                <FolderIcon className="size-3" />
              )}
              {activeWorktreePath
                ? t("branchToolbar.currentWorktree")
                : t("branchToolbar.currentCheckout")}
            </span>
          </SelectItem>
          <SelectItem value="worktree">
            <span className="inline-flex items-center gap-1.5">
              <FolderGit2Icon className="size-3" />
              {t("branchToolbar.newWorktree")}
            </span>
          </SelectItem>
          {showPreviousWorktree && previousWorktreeLabel ? (
            <SelectItem value={PREVIOUS_WORKTREE_SELECT_VALUE}>
              <span className="inline-flex items-center gap-1.5">
                <HistoryIcon className="size-3" />
                {previousWorktreeLabel}
              </span>
            </SelectItem>
          ) : null}
        </SelectGroup>
      </SelectPopup>
    </Select>
  );
});
