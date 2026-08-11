import type { DesktopBridge, DesktopUpdateState } from "@t3tools/contracts";
import { ArrowRightIcon } from "lucide-react";
import type { TFunction } from "i18next";

import { i18n } from "../i18n";
import {
  getDesktopUpdateDownloadedVersion,
  getDesktopUpdateReleaseUrl,
} from "./desktopUpdate.logic";
import { toastManager } from "./ui/toast";

type DesktopUpdateShell = Pick<DesktopBridge, "openExternal">;

function ReleaseNotesLink({
  shell,
  releaseUrl,
  t,
}: {
  shell: DesktopUpdateShell;
  releaseUrl: string;
  t: TFunction;
}) {
  return (
    <button
      className="ml-2 inline-flex cursor-pointer items-center gap-1 align-baseline text-muted-foreground underline decoration-dotted underline-offset-4 transition-colors hover:text-foreground"
      onClick={() => {
        void (async () => {
          try {
            if (await shell.openExternal(releaseUrl)) return;
          } catch {
            // Surface rejected IPC calls through the same user-visible fallback.
          }
          toastManager.add({
            type: "error",
            title: t("desktopUpdate.unableToOpenReleaseNotes"),
          });
        })();
      }}
      type="button"
    >
      {t("desktopUpdate.readMore")}
      <ArrowRightIcon aria-hidden className="size-3 -rotate-45" strokeWidth={2.25} />
    </button>
  );
}

export function showDesktopUpdateDownloadedToast(
  shell: DesktopUpdateShell,
  state: DesktopUpdateState,
  t: TFunction = i18n.t.bind(i18n),
): void {
  const releaseUrl = getDesktopUpdateReleaseUrl(getDesktopUpdateDownloadedVersion(state));
  toastManager.add({
    type: "success",
    title: t("desktopUpdate.downloadedTitle"),
    description: (
      <>
        {t("desktopUpdate.downloadedDescription")}
        {releaseUrl ? <ReleaseNotesLink releaseUrl={releaseUrl} shell={shell} t={t} /> : null}
      </>
    ),
  });
}
