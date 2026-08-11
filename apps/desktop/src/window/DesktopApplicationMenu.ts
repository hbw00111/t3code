import { DEFAULT_UI_LANGUAGE, type UiLanguage } from "@t3tools/contracts/settings";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Ref from "effect/Ref";
import * as Schema from "effect/Schema";
import type * as Scope from "effect/Scope";
import * as Stream from "effect/Stream";

import type * as Electron from "electron";

import { makeComponentLogger } from "../app/DesktopObservability.ts";
import * as ElectronApp from "../electron/ElectronApp.ts";
import * as ElectronDialog from "../electron/ElectronDialog.ts";
import * as ElectronMenu from "../electron/ElectronMenu.ts";
import * as DesktopEnvironment from "../app/DesktopEnvironment.ts";
import * as DesktopClientSettings from "../settings/DesktopClientSettings.ts";
import * as DesktopUpdates from "../updates/DesktopUpdates.ts";
import * as DesktopWindow from "./DesktopWindow.ts";

interface DesktopApplicationMenuMessages {
  readonly about: string;
  readonly actualSize: string;
  readonly automaticUpdatesUnavailable: string;
  readonly bringAllToFront: string;
  readonly checkForUpdates: string;
  readonly close: string;
  readonly copy: string;
  readonly cut: string;
  readonly delete: string;
  readonly edit: string;
  readonly file: string;
  readonly forceReload: string;
  readonly help: string;
  readonly hide: string;
  readonly hideOthers: string;
  readonly minimize: string;
  readonly newestVersion: (version: string) => string;
  readonly ok: string;
  readonly paste: string;
  readonly pasteAndMatchStyle: string;
  readonly quit: string;
  readonly redo: string;
  readonly reload: string;
  readonly selectAll: string;
  readonly services: string;
  readonly settings: string;
  readonly showSubstitutions: string;
  readonly showAll: string;
  readonly speech: string;
  readonly startSpeaking: string;
  readonly stopSpeaking: string;
  readonly substitutions: string;
  readonly textReplacement: string;
  readonly toggleSmartDashes: string;
  readonly toggleSmartQuotes: string;
  readonly toggleDevTools: string;
  readonly toggleFullscreen: string;
  readonly unknownUpdateError: string;
  readonly undo: string;
  readonly upToDate: string;
  readonly updateCheckFailed: string;
  readonly updateCheckFailedMessage: string;
  readonly updatesUnavailable: string;
  readonly view: string;
  readonly window: string;
  readonly windowZoom: string;
  readonly zoomIn: string;
  readonly zoomOut: string;
}

const MENU_MESSAGES = {
  en: {
    about: "About",
    actualSize: "Actual Size",
    automaticUpdatesUnavailable: "Automatic updates are not available right now.",
    bringAllToFront: "Bring All to Front",
    checkForUpdates: "Check for Updates...",
    close: "Close",
    copy: "Copy",
    cut: "Cut",
    delete: "Delete",
    edit: "Edit",
    file: "File",
    forceReload: "Force Reload",
    help: "Help",
    hide: "Hide",
    hideOthers: "Hide Others",
    minimize: "Minimize",
    newestVersion: (version) => `T3 Code ${version} is currently the newest version available.`,
    ok: "OK",
    paste: "Paste",
    pasteAndMatchStyle: "Paste and Match Style",
    quit: "Quit",
    redo: "Redo",
    reload: "Reload",
    selectAll: "Select All",
    services: "Services",
    settings: "Settings...",
    showAll: "Show All",
    showSubstitutions: "Show Substitutions",
    speech: "Speech",
    startSpeaking: "Start Speaking",
    stopSpeaking: "Stop Speaking",
    substitutions: "Substitutions",
    textReplacement: "Text Replacement",
    toggleSmartDashes: "Smart Dashes",
    toggleSmartQuotes: "Smart Quotes",
    toggleDevTools: "Toggle Developer Tools",
    toggleFullscreen: "Toggle Full Screen",
    unknownUpdateError: "An unknown error occurred. Please try again later.",
    undo: "Undo",
    upToDate: "You're up to date!",
    updateCheckFailed: "Update check failed",
    updateCheckFailedMessage: "Could not check for updates.",
    updatesUnavailable: "Updates unavailable",
    view: "View",
    window: "Window",
    windowZoom: "Zoom",
    zoomIn: "Zoom In",
    zoomOut: "Zoom Out",
  },
  "zh-CN": {
    about: "关于",
    actualSize: "实际大小",
    automaticUpdatesUnavailable: "自动更新当前不可用。",
    bringAllToFront: "全部移到最前面",
    checkForUpdates: "检查更新...",
    close: "关闭",
    copy: "复制",
    cut: "剪切",
    delete: "删除",
    edit: "编辑",
    file: "文件",
    forceReload: "强制重新加载",
    help: "帮助",
    hide: "隐藏",
    hideOthers: "隐藏其他窗口",
    minimize: "最小化",
    newestVersion: (version) => `T3 Code ${version} 已是最新版本。`,
    ok: "确定",
    paste: "粘贴",
    pasteAndMatchStyle: "粘贴并匹配样式",
    quit: "退出",
    redo: "重做",
    reload: "重新加载",
    selectAll: "全选",
    services: "服务",
    settings: "设置...",
    showAll: "全部显示",
    showSubstitutions: "显示替换",
    speech: "语音",
    startSpeaking: "开始朗读",
    stopSpeaking: "停止朗读",
    substitutions: "替换",
    textReplacement: "文本替换",
    toggleSmartDashes: "智能破折号",
    toggleSmartQuotes: "智能引号",
    toggleDevTools: "切换开发者工具",
    toggleFullscreen: "切换全屏",
    unknownUpdateError: "发生未知错误，请稍后重试。",
    undo: "撤销",
    upToDate: "已是最新版本",
    updateCheckFailed: "检查更新失败",
    updateCheckFailedMessage: "未能检查更新。",
    updatesUnavailable: "更新不可用",
    view: "视图",
    window: "窗口",
    windowZoom: "缩放",
    zoomIn: "放大",
    zoomOut: "缩小",
  },
} satisfies Record<UiLanguage, DesktopApplicationMenuMessages>;

export class DesktopApplicationMenuActionError extends Schema.TaggedErrorClass<DesktopApplicationMenuActionError>()(
  "DesktopApplicationMenuActionError",
  {
    action: Schema.String,
    cause: Schema.Defect(),
  },
) {
  override get message(): string {
    return `Desktop menu action "${this.action}" failed.`;
  }
}

export class DesktopApplicationMenu extends Context.Service<
  DesktopApplicationMenu,
  {
    readonly configure: Effect.Effect<void, never, Scope.Scope>;
  }
>()("@t3tools/desktop/window/DesktopApplicationMenu") {}

type DesktopApplicationMenuRuntimeServices =
  | DesktopUpdates.DesktopUpdates
  | DesktopWindow.DesktopWindow
  | ElectronDialog.ElectronDialog;

const { logInfo: logUpdaterInfo } = makeComponentLogger("desktop-updater");

const { logError: logMenuError } = makeComponentLogger("desktop-menu");

const dispatchMenuAction = Effect.fn("desktop.menu.dispatchMenuAction")(function* (
  action: string,
): Effect.fn.Return<void, DesktopWindow.DesktopWindowError, DesktopWindow.DesktopWindow> {
  const desktopWindow = yield* DesktopWindow.DesktopWindow;
  yield* desktopWindow.dispatchMenuAction(action);
});

const zoomMainWindow = Effect.fn("desktop.menu.zoomMainWindow")(function* (
  direction: DesktopWindow.MainWindowZoomDirection,
): Effect.fn.Return<void, never, DesktopWindow.DesktopWindow> {
  const desktopWindow = yield* DesktopWindow.DesktopWindow;
  yield* desktopWindow.zoomMain(direction);
});

const checkForUpdatesFromMenu = Effect.fn("desktop.menu.checkForUpdates")(function* (
  messages: DesktopApplicationMenuMessages,
) {
  const updates = yield* DesktopUpdates.DesktopUpdates;
  const electronDialog = yield* ElectronDialog.ElectronDialog;
  const result = yield* updates.check("menu");
  const updateState = result.state;

  if (updateState.status === "up-to-date") {
    yield* electronDialog.showMessageBox({
      type: "info",
      title: messages.upToDate,
      message: messages.newestVersion(updateState.currentVersion),
      buttons: [messages.ok],
    });
  } else if (updateState.status === "error") {
    yield* electronDialog.showMessageBox({
      type: "warning",
      title: messages.updateCheckFailed,
      message: messages.updateCheckFailedMessage,
      detail: messages.unknownUpdateError,
      buttons: [messages.ok],
    });
  }
});

const handleCheckForUpdatesMenuClick = Effect.fn("desktop.menu.handleCheckForUpdatesClick")(
  function* (messages: DesktopApplicationMenuMessages) {
    const updates = yield* DesktopUpdates.DesktopUpdates;
    const electronDialog = yield* ElectronDialog.ElectronDialog;
    const disabledReason = yield* updates.disabledReason;
    if (Option.isSome(disabledReason)) {
      yield* logUpdaterInfo("manual update check requested, but updates are disabled", {
        disabledReason: disabledReason.value,
      });
      yield* electronDialog.showMessageBox({
        type: "info",
        title: messages.updatesUnavailable,
        message: messages.automaticUpdatesUnavailable,
        buttons: [messages.ok],
      });
      return;
    }

    const desktopWindow = yield* DesktopWindow.DesktopWindow;
    yield* desktopWindow.ensureMain;
    yield* checkForUpdatesFromMenu(messages);
  },
);

export const make = Effect.gen(function* () {
  const electronApp = yield* ElectronApp.ElectronApp;
  const electronMenu = yield* ElectronMenu.ElectronMenu;
  const environment = yield* DesktopEnvironment.DesktopEnvironment;
  const clientSettings = yield* DesktopClientSettings.DesktopClientSettings;
  const appName = yield* electronApp.name;
  const context = yield* Effect.context<DesktopApplicationMenuRuntimeServices>();
  const runPromise = Effect.runPromiseWith(context);
  const activeLanguage = yield* Ref.make<UiLanguage | null>(null);
  const subscriptionStarted = yield* Ref.make(false);

  const runMenuEffect = <E>(
    action: string,
    effect: Effect.Effect<void, E, DesktopApplicationMenuRuntimeServices>,
  ) => {
    void runPromise(
      effect.pipe(
        Effect.annotateLogs({ action }),
        Effect.withSpan("desktop.menu.action"),
        Effect.catchCause((cause) => {
          const error = new DesktopApplicationMenuActionError({ action, cause });
          return logMenuError(error.message, { error });
        }),
      ),
    );
  };

  const installApplicationMenu = (language: UiLanguage) =>
    Effect.gen(function* () {
      const shouldInstall = yield* Ref.modify(activeLanguage, (currentLanguage) =>
        currentLanguage === language ? [false, currentLanguage] : [true, language],
      );
      if (!shouldInstall) return;
      const messages = MENU_MESSAGES[language];
      const checkForUpdatesClick = () => {
        runMenuEffect("check-for-updates", handleCheckForUpdatesMenuClick(messages));
      };
      const settingsClick = () => {
        runMenuEffect("open-settings", dispatchMenuAction("open-settings"));
      };
      const zoomClick = (direction: DesktopWindow.MainWindowZoomDirection) => () => {
        runMenuEffect(`zoom-${direction}`, zoomMainWindow(direction));
      };
      const template: Electron.MenuItemConstructorOptions[] = [];
      const editSubmenu: Electron.MenuItemConstructorOptions[] = [
        { role: "undo", label: messages.undo },
        { role: "redo", label: messages.redo },
        { type: "separator" },
        { role: "cut", label: messages.cut },
        { role: "copy", label: messages.copy },
        { role: "paste", label: messages.paste },
      ];
      const windowSubmenu: Electron.MenuItemConstructorOptions[] = [
        { role: "minimize", label: messages.minimize },
        { role: "zoom", label: messages.windowZoom },
      ];

      if (environment.platform === "darwin") {
        editSubmenu.push(
          { role: "pasteAndMatchStyle", label: messages.pasteAndMatchStyle },
          { role: "delete", label: messages.delete },
          { role: "selectAll", label: messages.selectAll },
          { type: "separator" },
          {
            label: messages.substitutions,
            submenu: [
              { role: "showSubstitutions", label: messages.showSubstitutions },
              { type: "separator" },
              { role: "toggleSmartQuotes", label: messages.toggleSmartQuotes },
              { role: "toggleSmartDashes", label: messages.toggleSmartDashes },
              { role: "toggleTextReplacement", label: messages.textReplacement },
            ],
          },
          {
            label: messages.speech,
            submenu: [
              { role: "startSpeaking", label: messages.startSpeaking },
              { role: "stopSpeaking", label: messages.stopSpeaking },
            ],
          },
        );
        windowSubmenu.push(
          { type: "separator" },
          { role: "front", label: messages.bringAllToFront },
        );
      } else {
        editSubmenu.push(
          { role: "delete", label: messages.delete },
          { type: "separator" },
          { role: "selectAll", label: messages.selectAll },
        );
        windowSubmenu.push({ role: "close", label: messages.close });
      }

      if (environment.platform === "darwin") {
        template.push({
          label: appName,
          submenu: [
            { role: "about", label: `${messages.about} ${appName}` },
            {
              label: messages.checkForUpdates,
              click: checkForUpdatesClick,
            },
            { type: "separator" },
            {
              label: messages.settings,
              accelerator: "CmdOrCtrl+,",
              click: settingsClick,
            },
            { type: "separator" },
            { role: "services", label: messages.services },
            { type: "separator" },
            { role: "hide", label: `${messages.hide} ${appName}` },
            { role: "hideOthers", label: messages.hideOthers },
            { role: "unhide", label: messages.showAll },
            { type: "separator" },
            { role: "quit", label: `${messages.quit} ${appName}` },
          ],
        });
      }

      template.push(
        {
          label: messages.file,
          submenu: [
            ...(environment.platform === "darwin"
              ? []
              : [
                  {
                    label: messages.settings,
                    accelerator: "CmdOrCtrl+,",
                    click: settingsClick,
                  },
                  { type: "separator" as const },
                ]),
            {
              role: environment.platform === "darwin" ? "close" : "quit",
              label: environment.platform === "darwin" ? messages.close : messages.quit,
            },
          ],
        },
        {
          label: messages.edit,
          submenu: editSubmenu,
        },
        {
          label: messages.view,
          submenu: [
            { role: "reload", label: messages.reload },
            { role: "forceReload", label: messages.forceReload },
            { role: "toggleDevTools", label: messages.toggleDevTools },
            { type: "separator" },
            /*
            Not the zoom roles: those act on the focused webContents, so with
            an embedded preview WebContentsView focused they zoom the guest
            page and the app UI appears stuck. These always zoom the main
            window (see DesktopWindow.zoomMain).
          */
            { label: messages.actualSize, accelerator: "CmdOrCtrl+0", click: zoomClick("reset") },
            { label: messages.zoomIn, accelerator: "CmdOrCtrl+=", click: zoomClick("in") },
            {
              label: messages.zoomIn,
              accelerator: "CmdOrCtrl+Plus",
              visible: false,
              click: zoomClick("in"),
            },
            { label: messages.zoomOut, accelerator: "CmdOrCtrl+-", click: zoomClick("out") },
            { type: "separator" },
            { role: "togglefullscreen", label: messages.toggleFullscreen },
          ],
        },
        {
          label: messages.window,
          submenu: windowSubmenu,
        },
        {
          role: "help",
          label: messages.help,
          submenu: [
            {
              label: messages.checkForUpdates,
              click: checkForUpdatesClick,
            },
          ],
        },
      );

      yield* electronMenu.setApplicationMenu(template);
    }).pipe(Effect.withSpan("desktop.menu.install", { attributes: { language } }));

  const configure = Effect.gen(function* () {
    const persistedSettings = yield* clientSettings.get;
    const initialLanguage = Option.match(persistedSettings, {
      onNone: () => DEFAULT_UI_LANGUAGE,
      onSome: (settings) => settings.uiLanguage,
    });
    yield* installApplicationMenu(initialLanguage);

    const wasSubscribed = yield* Ref.getAndSet(subscriptionStarted, true);
    if (wasSubscribed) return;
    yield* clientSettings.changes.pipe(
      Stream.runForEach((settings) => installApplicationMenu(settings.uiLanguage)),
      Effect.forkScoped,
    );
  }).pipe(Effect.withSpan("desktop.menu.configure"));

  return DesktopApplicationMenu.of({
    configure,
  });
});

export const layer = Layer.effect(DesktopApplicationMenu, make);
