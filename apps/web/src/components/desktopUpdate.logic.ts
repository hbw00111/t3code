import type { DesktopUpdateActionResult, DesktopUpdateState } from "@t3tools/contracts";
import type { TFunction } from "i18next";
import { i18n } from "../i18n";
import { isWindowsPlatform } from "../lib/utils";

export type DesktopUpdateButtonAction = "download" | "install" | "none";

const DESKTOP_RELEASE_TAG_URL = "https://github.com/pingdotgg/t3code/releases/tag";

/**
 * The main process fills `downloadedVersion` from the updater's `update-downloaded`
 * event, which is dispatched on its own fiber. A download RPC can therefore resolve
 * before that write lands, so fall back to the version the download was started for.
 */
export function getDesktopUpdateDownloadedVersion(state: DesktopUpdateState): string | null {
  return state.downloadedVersion ?? state.availableVersion;
}

/** Release notes for an exact downloaded build; nightly suffixes are part of the tag. */
export function getDesktopUpdateReleaseUrl(version: string | null): string | null {
  const normalizedVersion = version?.trim();
  if (!normalizedVersion) return null;
  return `${DESKTOP_RELEASE_TAG_URL}/v${encodeURIComponent(normalizedVersion)}`;
}

export function resolveDesktopUpdateButtonAction(
  state: DesktopUpdateState,
): DesktopUpdateButtonAction {
  if (state.downloadedVersion) {
    return "install";
  }
  if (state.status === "available") {
    return "download";
  }
  if (state.status === "error") {
    if (state.errorContext === "download" && state.availableVersion) {
      return "download";
    }
  }
  return "none";
}

export function shouldShowDesktopUpdateButton(state: DesktopUpdateState | null): boolean {
  if (!state || !state.enabled) {
    return false;
  }
  if (state.status === "downloading") {
    return true;
  }
  return resolveDesktopUpdateButtonAction(state) !== "none";
}

export function shouldShowArm64IntelBuildWarning(state: DesktopUpdateState | null): boolean {
  return state?.hostArch === "arm64" && state.appArch === "x64";
}

export function isDesktopUpdateButtonDisabled(state: DesktopUpdateState | null): boolean {
  return state?.status === "downloading";
}

export function getArm64IntelBuildWarningDescription(
  state: DesktopUpdateState,
  t: TFunction = i18n.t.bind(i18n),
): string {
  if (!shouldShowArm64IntelBuildWarning(state)) {
    return t("desktopUpdate.correctArchitecture");
  }

  const action = resolveDesktopUpdateButtonAction(state);
  if (action === "download") {
    return t("desktopUpdate.arm64WarningDownload");
  }
  if (action === "install") {
    return t("desktopUpdate.arm64WarningInstall");
  }
  return t("desktopUpdate.arm64WarningNextUpdate");
}

export function getDesktopUpdateButtonTooltip(
  state: DesktopUpdateState,
  t: TFunction = i18n.t.bind(i18n),
): string {
  if (state.status === "available") {
    return state.availableVersion
      ? t("desktopUpdate.tooltipReadyToDownloadVersion", { version: state.availableVersion })
      : t("desktopUpdate.tooltipReadyToDownload");
  }
  if (state.status === "downloading") {
    return typeof state.downloadPercent === "number"
      ? t("desktopUpdate.tooltipDownloadingPercent", {
          percent: Math.floor(state.downloadPercent),
        })
      : t("desktopUpdate.tooltipDownloading");
  }
  if (state.status === "downloaded") {
    const version = state.downloadedVersion ?? state.availableVersion;
    return version
      ? t("desktopUpdate.tooltipDownloadedVersion", { version })
      : t("desktopUpdate.tooltipDownloaded");
  }
  if (state.status === "error") {
    if (state.errorContext === "download" && state.availableVersion) {
      return t("desktopUpdate.tooltipDownloadFailed", { version: state.availableVersion });
    }
    if (state.errorContext === "install" && state.downloadedVersion) {
      return t("desktopUpdate.tooltipInstallFailed", { version: state.downloadedVersion });
    }
    return state.message ?? t("desktopUpdate.updateFailed");
  }
  return t("desktopUpdate.upToDate");
}

export function getDesktopUpdateInstallConfirmationMessage(
  state: Pick<DesktopUpdateState, "availableVersion" | "downloadedVersion">,
  platform = "",
  t: TFunction = i18n.t.bind(i18n),
): string {
  const version = state.downloadedVersion ?? state.availableVersion;
  const windowsInstallWarning = isWindowsPlatform(platform)
    ? `\n\n${t("desktopUpdate.windowsInstallWarning")}`
    : "";
  const title = version
    ? t("desktopUpdate.installConfirmationVersion", { version })
    : t("desktopUpdate.installConfirmation");
  return `${title}\n\n${t("desktopUpdate.runningTasksInterrupted")}${windowsInstallWarning}`;
}

export function getDesktopUpdateActionError(result: DesktopUpdateActionResult): string | null {
  if (!result.accepted || result.completed) return null;
  if (typeof result.state.message !== "string") return null;
  const message = result.state.message.trim();
  return message.length > 0 ? message : null;
}

export function shouldToastDesktopUpdateActionResult(result: DesktopUpdateActionResult): boolean {
  return getDesktopUpdateActionError(result) !== null;
}

export function shouldHighlightDesktopUpdateError(state: DesktopUpdateState | null): boolean {
  if (!state || state.status !== "error") return false;
  return state.errorContext === "download" || state.errorContext === "install";
}

export function canCheckForUpdate(state: DesktopUpdateState | null): boolean {
  if (!state || !state.enabled) return false;
  return (
    state.status !== "checking" &&
    state.status !== "downloading" &&
    state.status !== "downloaded" &&
    state.status !== "disabled"
  );
}
