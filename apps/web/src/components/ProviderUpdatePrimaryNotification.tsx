import { useNavigate } from "@tanstack/react-router";
import { useAtomValue } from "@effect/atom-react";
import { DownloadIcon } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef } from "react";
import { type ProviderDriverKind, type ProviderInstanceId } from "@t3tools/contracts";
import type { TFunction } from "i18next";
import { useTranslation } from "react-i18next";

import { primaryServerProvidersAtom, serverEnvironment } from "../state/server";
import { usePrimaryEnvironment } from "../state/environments";
import { useDismissedProviderUpdateNotificationKeys } from "../providerUpdateDismissal";
import { PROVIDER_ICON_BY_PROVIDER } from "./chat/providerIconUtils";
import {
  canOneClickUpdateProviderCandidate,
  collectProviderUpdateCandidates,
  collectUpdatedProviderSnapshots,
  firstFailedProviderUpdateMessage,
  getProviderUpdateInitialToastView,
  getProviderUpdateProgressToastView,
  getProviderUpdateRejectedToastView,
  getProviderUpdateRunningToastView,
  providerUpdateNotificationKey,
  type ProviderUpdateToastView,
} from "./ProviderUpdateLaunchNotification.logic";
import { stackedThreadToast, toastManager } from "./ui/toast";
import { useAtomCommand } from "../state/use-atom-command";

const seenProviderUpdateNotificationKeys = new Set<string>();
type ProviderUpdateToastId = ReturnType<typeof toastManager.add>;

type ActiveProviderUpdateToast =
  | { readonly kind: "prompt"; readonly key: string; readonly toastId: ProviderUpdateToastId }
  | {
      readonly kind: "update";
      readonly key: string;
      readonly toastId: ProviderUpdateToastId;
      readonly providerInstanceIds: ReadonlySet<ProviderInstanceId>;
      readonly providerCount: number;
      readonly resolveView?: (t: TFunction) => ProviderUpdateToastView;
    };

function ProviderUpdateToastIcon({ provider }: { provider: ProviderDriverKind }) {
  const ProviderIcon = PROVIDER_ICON_BY_PROVIDER[provider];

  if (!ProviderIcon) {
    return (
      <span className="relative inline-flex size-4 shrink-0 items-center justify-center">
        <DownloadIcon aria-hidden="true" className="size-4 text-success" strokeWidth={2.5} />
      </span>
    );
  }

  return (
    <span className="relative inline-flex size-4 shrink-0 items-center justify-center">
      <ProviderIcon aria-hidden="true" className="size-4" />
      <span className="absolute -right-1 -bottom-1 inline-flex size-3 items-center justify-center rounded-full bg-popover">
        <DownloadIcon aria-hidden="true" className="size-2.5 text-success" strokeWidth={2.5} />
      </span>
    </span>
  );
}

function updateProviderUpdateToast(input: {
  readonly toastId: ProviderUpdateToastId;
  readonly view: ProviderUpdateToastView;
  readonly openSettings: () => void;
  readonly onClose: () => void;
  readonly t: TFunction;
}) {
  if (input.view.type === "loading" || input.view.type === "success") {
    toastManager.update(input.toastId, {
      type: input.view.type,
      title: input.view.title,
      description: input.view.description,
      timeout: 0,
      // Base UI merges toast updates with the existing toast. Explicitly clear
      // the prompt action so its guarded Update handler cannot linger as a
      // visible no-op while the update is running (or after it succeeds).
      actionProps: undefined,
      data: {
        hideCopyButton: true,
        onClose: input.onClose,
        ...(input.view.dismissAfterVisibleMs !== undefined
          ? { dismissAfterVisibleMs: input.view.dismissAfterVisibleMs }
          : {}),
      },
    });
    return;
  }

  toastManager.update(
    input.toastId,
    stackedThreadToast({
      type: input.view.type,
      title: input.view.title,
      description: input.view.description,
      timeout: 0,
      actionProps: {
        children: input.t("common.settings"),
        onClick: input.openSettings,
      },
      actionVariant: "outline",
      data: {
        hideCopyButton: true,
        onClose: input.onClose,
      },
    }),
  );
}

/**
 * The single-prompt provider update notification used when there is only one
 * local environment (no WSL backend). Non-WSL users see exactly this flow — the
 * per-environment split is gated behind WSL presence.
 */
export function ProviderUpdatePrimaryNotification() {
  const { t, i18n } = useTranslation();
  const language = i18n.resolvedLanguage ?? i18n.language;
  const navigate = useNavigate();
  const providers = useAtomValue(primaryServerProvidersAtom);
  const primaryEnvironment = usePrimaryEnvironment();
  const updateProvider = useAtomCommand(serverEnvironment.updateProvider, {
    reportFailure: false,
  });
  const activeToastRef = useRef<ActiveProviderUpdateToast | null>(null);
  const promptLanguageRef = useRef(language);
  const translationRef = useRef(t);
  translationRef.current = t;
  const { dismissedNotificationKeys, dismissNotificationKey } =
    useDismissedProviderUpdateNotificationKeys();

  // If this flow unmounts (e.g. a WSL backend appears and we switch to the
  // per-environment popover), close any prompt it owns so it does not linger.
  useEffect(() => {
    return () => {
      const activeToast = activeToastRef.current;
      if (activeToast) {
        toastManager.close(activeToast.toastId);
        activeToastRef.current = null;
      }
    };
  }, []);

  // Prompt toasts are imperative and otherwise keep the copy from the language
  // they were created with. Recreate only idle prompts; in-flight updates are
  // refreshed by the progress effect below so their operation stays intact.
  useEffect(() => {
    if (promptLanguageRef.current === language) {
      return;
    }
    promptLanguageRef.current = language;
    const activeToast = activeToastRef.current;
    if (activeToast?.kind !== "prompt") {
      return;
    }
    toastManager.close(activeToast.toastId);
    seenProviderUpdateNotificationKeys.delete(activeToast.key);
    activeToastRef.current = null;
  }, [language]);

  const updateProviders = useMemo(() => collectProviderUpdateCandidates(providers), [providers]);
  const notificationKey = useMemo(
    () => providerUpdateNotificationKey(updateProviders),
    [updateProviders],
  );
  const oneClickProviders = useMemo(
    () =>
      updateProviders.filter((provider) => canOneClickUpdateProviderCandidate(provider, providers)),
    [providers, updateProviders],
  );

  const openProviderSettings = useCallback(
    (toastId?: ProviderUpdateToastId) => {
      const activeToast = activeToastRef.current;
      if (toastId !== undefined) {
        toastManager.close(toastId);
      } else if (activeToast) {
        toastManager.close(activeToast.toastId);
      }
      if (activeToast && (toastId === undefined || activeToast.toastId === toastId)) {
        activeToastRef.current = null;
      }
      void navigate({ to: "/settings/providers" });
    },
    [navigate],
  );

  const handleProviderUpdateToastClose = useCallback((toastId: ProviderUpdateToastId) => {
    if (activeToastRef.current?.toastId === toastId) {
      activeToastRef.current = null;
    }
  }, []);

  useEffect(() => {
    const activeToast = activeToastRef.current;
    if (activeToast?.kind !== "update") {
      return;
    }

    const view = activeToast.resolveView
      ? activeToast.resolveView(t)
      : getProviderUpdateProgressToastView(
          {
            providers: providers.filter((provider) =>
              activeToast.providerInstanceIds.has(provider.instanceId),
            ),
            providerCount: activeToast.providerCount,
          },
          t,
        );
    updateProviderUpdateToast({
      toastId: activeToast.toastId,
      view,
      openSettings: () => openProviderSettings(activeToast.toastId),
      onClose: () => handleProviderUpdateToastClose(activeToast.toastId),
      t,
    });

    if (view.phase === "succeeded") {
      activeToastRef.current = null;
    }
  }, [handleProviderUpdateToastClose, language, providers, openProviderSettings, t]);

  useEffect(() => {
    const activeToast = activeToastRef.current;
    const staleReplaceableToast =
      activeToast?.kind === "prompt" ||
      (activeToast?.kind === "update" && activeToast.resolveView !== undefined);
    if (staleReplaceableToast && activeToast.key !== notificationKey) {
      toastManager.close(activeToast.toastId);
      activeToastRef.current = null;
    }

    if (
      !notificationKey ||
      dismissedNotificationKeys.has(notificationKey) ||
      seenProviderUpdateNotificationKeys.has(notificationKey) ||
      activeToastRef.current
    ) {
      return;
    }

    seenProviderUpdateNotificationKeys.add(notificationKey);

    const initialView = getProviderUpdateInitialToastView(
      { updateProviders, oneClickProviders },
      t,
    );

    let toastId!: ProviderUpdateToastId;
    let updateStarted = false;
    const openSettings = () => openProviderSettings(toastId);
    const dismissPrompt = () => {
      dismissNotificationKey(notificationKey);
      handleProviderUpdateToastClose(toastId);
    };

    const runUpdates = () => {
      if (updateStarted || oneClickProviders.length === 0 || !primaryEnvironment) {
        return;
      }
      updateStarted = true;

      const providerCount = oneClickProviders.length;
      const providerInstanceIds = new Set(oneClickProviders.map((provider) => provider.instanceId));
      activeToastRef.current = {
        kind: "update",
        key: notificationKey,
        toastId,
        providerInstanceIds,
        providerCount,
      };

      updateProviderUpdateToast({
        toastId,
        view: getProviderUpdateRunningToastView(providerCount, t),
        openSettings,
        onClose: () => handleProviderUpdateToastClose(toastId),
        t,
      });

      void (async () => {
        const results: Array<Awaited<ReturnType<typeof updateProvider>>> = [];
        for (const provider of oneClickProviders) {
          results.push(
            await updateProvider({
              environmentId: primaryEnvironment.environmentId,
              input: {
                provider: provider.driver,
                instanceId: provider.instanceId,
              },
            }),
          );
        }

        const activeUpdateToast = activeToastRef.current;
        if (activeUpdateToast?.kind !== "update" || activeUpdateToast.toastId !== toastId) {
          return;
        }

        const latestT = translationRef.current;
        const failedMessage = firstFailedProviderUpdateMessage(results, latestT);
        if (failedMessage) {
          const resolveView = (nextT: TFunction) =>
            getProviderUpdateRejectedToastView(
              providerCount,
              firstFailedProviderUpdateMessage(results, nextT) ?? failedMessage,
              nextT,
            );
          activeToastRef.current = { ...activeUpdateToast, resolveView };
          updateProviderUpdateToast({
            toastId,
            view: resolveView(latestT),
            openSettings,
            onClose: () => handleProviderUpdateToastClose(toastId),
            t: latestT,
          });
          return;
        }

        const updatedProviderSnapshots = collectUpdatedProviderSnapshots({
          results,
          providerInstanceIds,
        });
        const view = getProviderUpdateProgressToastView(
          {
            providers: updatedProviderSnapshots,
            providerCount,
          },
          latestT,
        );
        if (view.phase === "failed" || view.phase === "unchanged") {
          activeToastRef.current = {
            ...activeUpdateToast,
            resolveView: (nextT) =>
              getProviderUpdateProgressToastView(
                {
                  providers: updatedProviderSnapshots,
                  providerCount,
                },
                nextT,
              ),
          };
        }
        updateProviderUpdateToast({
          toastId,
          view,
          openSettings,
          onClose: () => handleProviderUpdateToastClose(toastId),
          t: latestT,
        });

        if (view.phase === "succeeded") {
          activeToastRef.current = null;
        }
      })();
    };

    toastId = toastManager.add(
      stackedThreadToast({
        type: initialView.type,
        title: initialView.title,
        description: initialView.description,
        timeout: 0,
        actionProps:
          oneClickProviders.length > 0
            ? {
                children: t("common.update"),
                onClick: runUpdates,
              }
            : {
                children: t("common.settings"),
                onClick: openSettings,
              },
        actionVariant: oneClickProviders.length > 0 ? "default" : "outline",
        data: {
          leadingIcon:
            updateProviders.length === 1 ? (
              <ProviderUpdateToastIcon provider={updateProviders[0]!.driver} />
            ) : undefined,
          hideCopyButton: true,
          onClose: dismissPrompt,
          ...(oneClickProviders.length > 0
            ? {
                secondaryActionProps: {
                  children: t("common.settings"),
                  onClick: openSettings,
                },
                secondaryActionVariant: "outline" as const,
              }
            : {}),
        },
      }),
    );
    activeToastRef.current = { kind: "prompt", key: notificationKey, toastId };
  }, [
    updateProvider,
    dismissNotificationKey,
    dismissedNotificationKeys,
    handleProviderUpdateToastClose,
    language,
    notificationKey,
    oneClickProviders,
    openProviderSettings,
    primaryEnvironment,
    t,
    updateProviders,
  ]);

  return null;
}
