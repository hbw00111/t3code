import { useAtomValue } from "@effect/atom-react";
import { useCallback, useEffect, useMemo } from "react";

import {
  CommandId,
  MessageId,
  type EnvironmentId,
  type ModelSelection,
  type ProviderInteractionMode,
  type RuntimeMode,
  type ThreadId,
} from "@t3tools/contracts";
import { safeErrorLogAttributes } from "@t3tools/client-runtime/errors";
import {
  isAtomCommandInterrupted,
  squashAtomCommandFailure,
} from "@t3tools/client-runtime/state/runtime";
import { deriveActiveWorkStartedAt } from "@t3tools/shared/orchestrationTiming";

import { makeQueuedMessageMetadata } from "../lib/commandMetadata";
import {
  convertPastedImagesToAttachments,
  pasteComposerClipboard,
  pickComposerImages,
} from "../lib/composerImages";
import type { DraftComposerImageAttachment } from "../lib/composerImages";
import { scopedThreadKey } from "../lib/scopedEntities";
import { uuidv4 } from "../lib/uuid";
import { buildThreadFeed } from "../lib/threadActivity";
import {
  canExecuteThreadGoalCommand,
  dispatchThreadGoalCommand,
  resolveThreadGoalProviderDriver,
  resolveThreadComposerSubmission,
} from "../lib/threadGoalCommands";
import { appAtomRegistry } from "../state/atom-registry";
import {
  appendComposerDraftAttachments,
  appendComposerDraftText,
  clearComposerDraftContent,
  composerDraftsAtom,
  ensureComposerDraftsLoaded,
  getComposerDraftSnapshot,
  mergeComposerDraftContent,
  removeComposerDraftAttachment,
  setComposerDraftText,
  updateComposerDraftSettings,
  useComposerDraft,
} from "./use-composer-drafts";
import { setPendingConnectionError } from "../state/use-remote-environment-registry";
import { useAtomCommand } from "./use-atom-command";
import { useEnvironmentServerConfig } from "./entities";
import { useSelectedThreadDetail } from "../state/use-thread-detail";
import { useThreadSelection } from "../state/use-thread-selection";
import { enqueueThreadOutboxMessage } from "./thread-outbox";
import { useThreadOutboxMessages } from "./use-thread-outbox";
import { threadEnvironment } from "./threads";
import { findThreadGoalCommandReceipt } from "../features/threads/ThreadLiveStatusStrip.logic";
import {
  beginPendingGoalCommand,
  clearPendingGoalCommand,
  clearPendingGoalCommandsForEnvironment,
  usePendingGoalCommands,
} from "./thread-goal-command-state";

export function appendReviewCommentToDraft(input: {
  readonly environmentId: EnvironmentId;
  readonly threadId: ThreadId;
  readonly text: string;
  readonly attachments?: ReadonlyArray<DraftComposerImageAttachment>;
}): void {
  const threadKey = scopedThreadKey(input.environmentId, input.threadId);
  const existing = appAtomRegistry.get(composerDraftsAtom)[threadKey]?.text ?? "";
  const separator = existing.trim().length > 0 && !existing.endsWith("\n") ? "\n\n" : "";
  setComposerDraftText(threadKey, `${existing}${separator}${input.text}`);
  if (input.attachments && input.attachments.length > 0) {
    appendComposerDraftAttachments(threadKey, input.attachments);
  }
}

export function useThreadDraftForThread(input: {
  readonly environmentId?: EnvironmentId;
  readonly threadId?: ThreadId;
}) {
  const threadKey =
    input.environmentId && input.threadId
      ? scopedThreadKey(input.environmentId, input.threadId)
      : null;
  const draft = useComposerDraft(threadKey);

  return {
    draftMessage: draft.text,
    draftAttachments: draft.attachments,
  };
}

export function useThreadComposerState() {
  const { selectedThread: selectedThreadShell, selectedEnvironmentRuntime } = useThreadSelection();
  const selectedThreadDetail = useSelectedThreadDetail();
  const serverConfig = useEnvironmentServerConfig(selectedThreadShell?.environmentId ?? null);
  const composerDrafts = useAtomValue(composerDraftsAtom);
  const queuedMessagesByThreadKey = useThreadOutboxMessages();
  const setThreadGoal = useAtomCommand(threadEnvironment.setGoal, { reportFailure: false });
  const getThreadGoal = useAtomCommand(threadEnvironment.getGoal, { reportFailure: false });
  const pauseThreadGoal = useAtomCommand(threadEnvironment.pauseGoal, { reportFailure: false });
  const resumeThreadGoal = useAtomCommand(threadEnvironment.resumeGoal, { reportFailure: false });
  const clearThreadGoal = useAtomCommand(threadEnvironment.clearGoal, { reportFailure: false });
  const pendingGoalCommands = usePendingGoalCommands();

  useEffect(() => {
    ensureComposerDraftsLoaded();
  }, []);

  const selectedThreadKey = selectedThreadShell
    ? scopedThreadKey(selectedThreadShell.environmentId, selectedThreadShell.id)
    : null;
  useEffect(() => {
    const connectionState = selectedEnvironmentRuntime?.connectionState;
    if (connectionState === undefined || connectionState === "connected") return;
    const environmentId = selectedThreadShell?.environmentId;
    if (!environmentId) return;
    clearPendingGoalCommandsForEnvironment(environmentId);
  }, [selectedEnvironmentRuntime?.connectionState, selectedThreadShell?.environmentId]);

  useEffect(() => {
    const pending = selectedThreadKey ? pendingGoalCommands[selectedThreadKey] : undefined;
    if (!pending || pending.threadKey !== selectedThreadKey || !selectedThreadDetail) {
      return;
    }
    const receipt = findThreadGoalCommandReceipt(
      selectedThreadDetail.activities,
      pending.commandId,
    );
    if (!receipt) return;

    clearPendingGoalCommand(pending.threadKey, pending.commandId);
    if (receipt.failed) {
      setPendingConnectionError(receipt.detail ?? "The goal command failed.");
    }
  }, [pendingGoalCommands, selectedThreadDetail, selectedThreadKey]);
  const selectedThreadQueuedMessages = useMemo(
    () => (selectedThreadKey ? (queuedMessagesByThreadKey[selectedThreadKey] ?? []) : []),
    [queuedMessagesByThreadKey, selectedThreadKey],
  );
  const selectedThreadFeed = useMemo(
    () => (selectedThreadDetail ? buildThreadFeed(selectedThreadDetail) : []),
    [selectedThreadDetail],
  );

  const selectedDraft = selectedThreadKey ? composerDrafts[selectedThreadKey] : null;
  const draftMessage = selectedDraft?.text ?? "";
  const draftAttachments = selectedDraft?.attachments ?? [];
  const selectedThreadQueueCount = selectedThreadQueuedMessages.length;
  const selectedThread = selectedThreadDetail ?? selectedThreadShell;
  const modelSelection = selectedDraft?.modelSelection ?? selectedThread?.modelSelection ?? null;
  const runtimeMode = selectedDraft?.runtimeMode ?? selectedThread?.runtimeMode ?? null;
  const interactionMode = selectedDraft?.interactionMode ?? selectedThread?.interactionMode ?? null;
  const goalProviderDriver = resolveThreadGoalProviderDriver({
    sessionProviderInstanceId: selectedThread?.session?.providerInstanceId,
    modelSelectionInstanceId: modelSelection?.instanceId,
    providers: serverConfig?.providers,
  });
  const environmentConnected = selectedEnvironmentRuntime?.connectionState === "connected";
  const goalControlsDisabled = !canExecuteThreadGoalCommand({
    connectionState: selectedEnvironmentRuntime?.connectionState,
    providerDriver: goalProviderDriver,
  });

  const selectedThreadSessionActivity = useMemo(() => {
    const selectedThread = selectedThreadDetail ?? selectedThreadShell;
    if (!selectedThread?.session) {
      return null;
    }

    return {
      orchestrationStatus: selectedThread.session.status,
      activeTurnId: selectedThread.session.activeTurnId ?? undefined,
    };
  }, [selectedThreadDetail, selectedThreadShell]);

  const activeWorkStartedAt = useMemo(() => {
    const selectedThread = selectedThreadDetail ?? selectedThreadShell;
    if (!selectedThread) {
      return null;
    }

    return deriveActiveWorkStartedAt(
      selectedThread.latestTurn,
      selectedThreadSessionActivity,
      null,
    );
  }, [selectedThreadDetail, selectedThreadSessionActivity, selectedThreadShell]);

  const activeThreadBusy =
    !!selectedThread &&
    (selectedThread.session?.status === "running" || selectedThread.session?.status === "starting");

  const executeGoalCommand = useCallback(
    async (
      command: Parameters<typeof dispatchThreadGoalCommand>[0]["command"],
    ): Promise<boolean> => {
      if (!selectedThreadShell) return false;
      if (!environmentConnected) {
        setPendingConnectionError("Reconnect this environment before using /goal.");
        return false;
      }
      if (goalControlsDisabled) {
        setPendingConnectionError(
          "Goals require Codex. Switch to a Codex model before using /goal.",
        );
        return false;
      }
      const threadKey = scopedThreadKey(selectedThreadShell.environmentId, selectedThreadShell.id);

      const commandId = CommandId.make(uuidv4());
      const pending = {
        environmentId: selectedThreadShell.environmentId,
        threadKey,
        commandId,
        action: command.action,
      };
      if (!beginPendingGoalCommand(pending)) return false;
      setPendingConnectionError(null);

      const withCommandId = <Input extends { readonly input: { readonly threadId: ThreadId } }>(
        input: Input,
      ) => ({
        ...input,
        input: { ...input.input, commandId },
      });
      const result = await dispatchThreadGoalCommand({
        command,
        target: {
          environmentId: selectedThreadShell.environmentId,
          threadId: selectedThreadShell.id,
        },
        operations: {
          getGoal: (input) => getThreadGoal(withCommandId(input)),
          setGoal: (input) => setThreadGoal(withCommandId(input)),
          pauseGoal: (input) => pauseThreadGoal(withCommandId(input)),
          resumeGoal: (input) => resumeThreadGoal(withCommandId(input)),
          clearGoal: (input) => clearThreadGoal(withCommandId(input)),
        },
      });
      if (result._tag !== "Failure") return true;

      clearPendingGoalCommand(threadKey, commandId);
      if (!isAtomCommandInterrupted(result)) {
        const error = squashAtomCommandFailure(result);
        setPendingConnectionError(
          error instanceof Error ? error.message : "The goal command failed.",
        );
      }
      return false;
    },
    [
      clearThreadGoal,
      getThreadGoal,
      environmentConnected,
      goalControlsDisabled,
      pauseThreadGoal,
      resumeThreadGoal,
      selectedThreadShell,
      setThreadGoal,
    ],
  );

  const onSendMessage = useCallback(async () => {
    if (!selectedThreadShell) {
      return null;
    }

    const threadKey = scopedThreadKey(selectedThreadShell.environmentId, selectedThreadShell.id);
    const draft = getComposerDraftSnapshot(threadKey);
    const thread = selectedThreadDetail ?? selectedThreadShell;
    const text = draft.text.trim();
    const attachments = draft.attachments;
    const submission = resolveThreadComposerSubmission({
      text: draft.text,
      attachmentCount: attachments.length,
    });
    if (submission.kind === "empty") {
      return null;
    }

    if (submission.kind === "goal") {
      const accepted = await executeGoalCommand(submission.command);
      if (!accepted) return null;

      clearComposerDraftContent(threadKey);
      return null;
    }

    const metadata = makeQueuedMessageMetadata();
    const messageId = MessageId.make(metadata.messageId);
    // Enqueue publishes the queued atom synchronously (the durable write
    // happens behind it), so clearing the draft here gives send feedback on
    // the tap frame instead of after file I/O. If the write fails the message
    // is rolled out of the queue and the content is merged back into the
    // draft, preserving anything typed since.
    const enqueuePromise = enqueueThreadOutboxMessage({
      environmentId: selectedThreadShell.environmentId,
      threadId: selectedThreadShell.id,
      messageId,
      commandId: CommandId.make(metadata.commandId),
      text,
      attachments,
      modelSelection: draft.modelSelection ?? thread.modelSelection,
      runtimeMode: draft.runtimeMode ?? thread.runtimeMode,
      interactionMode: draft.interactionMode ?? thread.interactionMode,
      createdAt: metadata.createdAt,
    });
    clearComposerDraftContent(threadKey);
    enqueuePromise.catch((error: unknown) => {
      // Restore text via merge (idempotent) but attachments via the uncapped
      // append: the merge path slots existing attachments first and truncates
      // at the send limit, which would silently drop this message's images if
      // the user attached new ones while the write was in flight.
      void mergeComposerDraftContent(threadKey, { text, attachments: [] });
      appendComposerDraftAttachments(threadKey, attachments);
      setPendingConnectionError(
        error instanceof Error ? error.message : "Failed to save the queued message.",
      );
    });
    return messageId;
  }, [executeGoalCommand, selectedThreadDetail, selectedThreadShell]);

  const onSetGoal = useCallback(
    (objective: string) => executeGoalCommand({ action: "set", objective }),
    [executeGoalCommand],
  );
  const onPauseGoal = useCallback(
    () => executeGoalCommand({ action: "pause" }),
    [executeGoalCommand],
  );
  const onResumeGoal = useCallback(
    () => executeGoalCommand({ action: "resume" }),
    [executeGoalCommand],
  );
  const onClearGoal = useCallback(
    () => executeGoalCommand({ action: "clear" }),
    [executeGoalCommand],
  );

  const onChangeDraftMessage = useCallback(
    (value: string) => {
      if (!selectedThreadShell) {
        return;
      }

      const threadKey = scopedThreadKey(selectedThreadShell.environmentId, selectedThreadShell.id);
      setComposerDraftText(threadKey, value);
    },
    [selectedThreadShell],
  );

  const onPickDraftImages = useCallback(async () => {
    if (!selectedThreadShell) {
      return;
    }

    const threadKey = scopedThreadKey(selectedThreadShell.environmentId, selectedThreadShell.id);
    const result = await pickComposerImages({
      existingCount: composerDrafts[threadKey]?.attachments.length ?? 0,
    });
    if (result.images.length > 0) {
      appendComposerDraftAttachments(threadKey, result.images);
    }
    if (result.error) {
      setPendingConnectionError(result.error);
    }
  }, [composerDrafts, selectedThreadShell]);

  const onPasteIntoDraft = useCallback(async () => {
    if (!selectedThreadShell) {
      return;
    }

    const threadKey = scopedThreadKey(selectedThreadShell.environmentId, selectedThreadShell.id);
    const result = await pasteComposerClipboard({
      existingCount: composerDrafts[threadKey]?.attachments.length ?? 0,
    });
    if (result.images.length > 0) {
      appendComposerDraftAttachments(threadKey, result.images);
    }
    if (result.text) {
      appendComposerDraftText(threadKey, result.text);
    }
    if (result.error) {
      setPendingConnectionError(result.error);
    }
  }, [composerDrafts, selectedThreadShell]);

  const onNativePasteImages = useCallback(
    async (uris: ReadonlyArray<string>) => {
      if (!selectedThreadShell || uris.length === 0) {
        return;
      }

      const threadKey = scopedThreadKey(selectedThreadShell.environmentId, selectedThreadShell.id);
      try {
        const images = await convertPastedImagesToAttachments({
          uris,
          existingCount: composerDrafts[threadKey]?.attachments.length ?? 0,
        });
        if (images.length > 0) {
          appendComposerDraftAttachments(threadKey, images);
        }
      } catch (error) {
        console.error("[native paste] error converting images", {
          environmentId: selectedThreadShell.environmentId,
          threadId: selectedThreadShell.id,
          uriCount: uris.length,
          ...safeErrorLogAttributes(error),
        });
      }
    },
    [composerDrafts, selectedThreadShell],
  );

  const onRemoveDraftImage = useCallback(
    (imageId: string) => {
      if (!selectedThreadShell) {
        return;
      }

      const threadKey = scopedThreadKey(selectedThreadShell.environmentId, selectedThreadShell.id);
      removeComposerDraftAttachment(threadKey, imageId);
    },
    [selectedThreadShell],
  );

  const onUpdateModelSelection = useCallback(
    (value: ModelSelection) => {
      if (!selectedThreadKey) {
        return;
      }
      updateComposerDraftSettings(selectedThreadKey, { modelSelection: value });
    },
    [selectedThreadKey],
  );

  const onUpdateRuntimeMode = useCallback(
    (value: RuntimeMode) => {
      if (!selectedThreadKey) {
        return;
      }
      updateComposerDraftSettings(selectedThreadKey, { runtimeMode: value });
    },
    [selectedThreadKey],
  );

  const onUpdateInteractionMode = useCallback(
    (value: ProviderInteractionMode) => {
      if (!selectedThreadKey) {
        return;
      }
      updateComposerDraftSettings(selectedThreadKey, { interactionMode: value });
    },
    [selectedThreadKey],
  );

  return {
    selectedThreadFeed,
    selectedThreadQueueCount,
    activeWorkStartedAt,
    draftMessage,
    draftAttachments,
    modelSelection,
    runtimeMode,
    interactionMode,
    activeThreadBusy,
    goalControlsDisabled,
    goal: selectedThreadDetail?.goal ?? null,
    pendingGoalAction: selectedThreadKey
      ? (pendingGoalCommands[selectedThreadKey]?.action ?? null)
      : null,
    onChangeDraftMessage,
    onPickDraftImages,
    onPasteIntoDraft,
    onNativePasteImages,
    onRemoveDraftImage,
    onSendMessage,
    onSetGoal,
    onPauseGoal,
    onResumeGoal,
    onClearGoal,
    onUpdateModelSelection,
    onUpdateRuntimeMode,
    onUpdateInteractionMode,
  };
}
