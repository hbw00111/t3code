import * as NodeServices from "@effect/platform-node/NodeServices";
import { assert, describe, it } from "@effect/vitest";
import { DEFAULT_CLIENT_SETTINGS, type UiLanguage } from "@t3tools/contracts";
import * as Deferred from "effect/Deferred";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Queue from "effect/Queue";

import type * as Electron from "electron";

import * as ElectronApp from "../electron/ElectronApp.ts";
import * as ElectronDialog from "../electron/ElectronDialog.ts";
import * as ElectronMenu from "../electron/ElectronMenu.ts";
import * as DesktopApplicationMenu from "./DesktopApplicationMenu.ts";
import * as DesktopConfig from "../app/DesktopConfig.ts";
import * as DesktopEnvironment from "../app/DesktopEnvironment.ts";
import * as DesktopClientSettings from "../settings/DesktopClientSettings.ts";
import * as DesktopUpdates from "../updates/DesktopUpdates.ts";
import * as DesktopWindow from "./DesktopWindow.ts";

const environmentInput = {
  dirname: "/repo/apps/desktop/dist-electron",
  homeDirectory: "/Users/alice",
  platform: "linux",
  processArch: "arm64",
  appVersion: "1.2.3",
  appPath: "/repo",
  isPackaged: false,
  resourcesPath: "/repo/resources",
  runningUnderArm64Translation: false,
} satisfies DesktopEnvironment.MakeDesktopEnvironmentInput;

const electronAppLayer = Layer.succeed(ElectronApp.ElectronApp, {
  metadata: Effect.die("unexpected metadata read"),
  name: Effect.succeed("T3 Code"),
  whenReady: Effect.void,
  quit: Effect.void,
  exit: () => Effect.void,
  relaunch: () => Effect.void,
  setPath: () => Effect.void,
  setName: () => Effect.void,
  setAboutPanelOptions: () => Effect.void,
  setAppUserModelId: () => Effect.void,
  getAppMetrics: Effect.succeed([]),
  isDefaultProtocolClient: () => Effect.succeed(false),
  setAsDefaultProtocolClient: () => Effect.succeed(true),
  setDesktopName: () => Effect.void,
  setDockIcon: () => Effect.void,
  appendCommandLineSwitch: () => Effect.void,
  onBeforeQuitForUpdate: () => Effect.void,
  removeCommandLineSwitch: () => Effect.void,
  on: () => Effect.void,
} satisfies ElectronApp.ElectronApp["Service"]);

const electronDialogLayer = Layer.succeed(ElectronDialog.ElectronDialog, {
  pickFolder: () => Effect.succeed(Option.none()),
  pickFiles: () => Effect.succeed([]),
  confirm: () => Effect.succeed(false),
  showMessageBox: () => Effect.succeed({ response: 0, checkboxChecked: false }),
  showErrorBox: () => Effect.void,
} satisfies ElectronDialog.ElectronDialog["Service"]);

const desktopUpdatesLayer = Layer.succeed(DesktopUpdates.DesktopUpdates, {
  getState: Effect.die("unexpected getState"),
  emitState: Effect.void,
  disabledReason: Effect.succeed(Option.none()),
  configure: Effect.void,
  setChannel: () => Effect.die("unexpected setChannel"),
  check: () => Effect.die("unexpected check"),
  download: Effect.die("unexpected download"),
  install: Effect.die("unexpected install"),
} satisfies DesktopUpdates.DesktopUpdates["Service"]);

const makeDesktopWindowLayer = (selectedAction: Deferred.Deferred<string>) =>
  Layer.succeed(DesktopWindow.DesktopWindow, {
    createMain: Effect.die("unexpected createMain"),
    ensureMain: Effect.die("unexpected ensureMain"),
    revealOrCreateMain: Effect.die("unexpected revealOrCreateMain"),
    activate: Effect.void,
    createMainIfBackendReady: Effect.void,
    showConnectingSplash: Effect.void,
    handleBackendReady: () => Effect.void,
    handleBackendNotReady: Effect.void,
    flushMainWindowBounds: Effect.void,
    dispatchMenuAction: (action) => Deferred.succeed(selectedAction, action).pipe(Effect.asVoid),
    zoomMain: (direction) =>
      Deferred.succeed(selectedAction, `zoom-${direction}`).pipe(Effect.asVoid),
    syncAppearance: Effect.void,
  } satisfies DesktopWindow.DesktopWindow["Service"]);

const makeElectronMenuLayer = (
  applicationMenuTemplate: Deferred.Deferred<readonly Electron.MenuItemConstructorOptions[]>,
) =>
  Layer.succeed(ElectronMenu.ElectronMenu, {
    setApplicationMenu: (template) =>
      Deferred.succeed(applicationMenuTemplate, template).pipe(Effect.asVoid),
    popupTemplate: () => Effect.void,
    showContextMenu: () => Effect.succeed(Option.none()),
  } satisfies ElectronMenu.ElectronMenu["Service"]);

const makeQueuedElectronMenuLayer = (
  applicationMenuTemplates: Queue.Queue<readonly Electron.MenuItemConstructorOptions[]>,
) =>
  Layer.succeed(ElectronMenu.ElectronMenu, {
    setApplicationMenu: (template) =>
      Queue.offer(applicationMenuTemplates, template).pipe(Effect.asVoid),
    popupTemplate: () => Effect.void,
    showContextMenu: () => Effect.succeed(Option.none()),
  } satisfies ElectronMenu.ElectronMenu["Service"]);

const makeMenuLayer = (
  selectedAction: Deferred.Deferred<string>,
  electronMenuLayer: Layer.Layer<ElectronMenu.ElectronMenu>,
  uiLanguage: UiLanguage,
  platform: NodeJS.Platform = environmentInput.platform,
) =>
  DesktopApplicationMenu.layer.pipe(
    Layer.provideMerge(electronMenuLayer),
    Layer.provideMerge(makeDesktopWindowLayer(selectedAction)),
    Layer.provideMerge(desktopUpdatesLayer),
    Layer.provideMerge(electronDialogLayer),
    Layer.provideMerge(electronAppLayer),
    Layer.provideMerge(
      DesktopClientSettings.layerTest(Option.some({ ...DEFAULT_CLIENT_SETTINGS, uiLanguage })),
    ),
    Layer.provideMerge(
      DesktopEnvironment.layer({ ...environmentInput, platform }).pipe(
        Layer.provide(Layer.mergeAll(NodeServices.layer, DesktopConfig.layerTest({}))),
      ),
    ),
  );

const configureMenu = (
  selectedAction: Deferred.Deferred<string>,
  applicationMenuTemplate: Deferred.Deferred<readonly Electron.MenuItemConstructorOptions[]>,
  uiLanguage: UiLanguage = "en",
  platform: NodeJS.Platform = environmentInput.platform,
) =>
  Effect.gen(function* () {
    const menu = yield* DesktopApplicationMenu.DesktopApplicationMenu;
    yield* menu.configure;
  }).pipe(
    Effect.provide(
      makeMenuLayer(
        selectedAction,
        makeElectronMenuLayer(applicationMenuTemplate),
        uiLanguage,
        platform,
      ),
    ),
    Effect.scoped,
  );

describe("DesktopApplicationMenu", () => {
  it.effect("installs the native menu and routes Settings through DesktopWindow", () =>
    Effect.gen(function* () {
      const selectedAction = yield* Deferred.make<string>();
      const applicationMenuTemplate =
        yield* Deferred.make<readonly Electron.MenuItemConstructorOptions[]>();

      yield* configureMenu(selectedAction, applicationMenuTemplate);

      const template = yield* Deferred.await(applicationMenuTemplate);
      const fileMenu = template.find((item) => item.label === "File");
      assert.isDefined(fileMenu);
      if (!Array.isArray(fileMenu.submenu)) {
        throw new Error("Expected File menu submenu to be an array.");
      }
      const settingsItem = fileMenu.submenu.find((item) => item.label === "Settings...");
      assert.isDefined(settingsItem);
      const settingsClick = settingsItem.click;
      if (typeof settingsClick !== "function") {
        throw new Error("Expected Settings menu item to have a click handler.");
      }

      settingsClick({} as Electron.MenuItem, {} as Electron.BrowserWindow, {} as KeyboardEvent);
      assert.equal(yield* Deferred.await(selectedAction), "open-settings");
    }),
  );

  it.effect("builds the initial menu from the persisted UI language", () =>
    Effect.gen(function* () {
      const selectedAction = yield* Deferred.make<string>();
      const applicationMenuTemplate =
        yield* Deferred.make<readonly Electron.MenuItemConstructorOptions[]>();

      yield* configureMenu(selectedAction, applicationMenuTemplate, "zh-CN");

      const template = yield* Deferred.await(applicationMenuTemplate);
      assert.isDefined(template.find((item) => item.label === "文件"));
      assert.isDefined(template.find((item) => item.label === "视图"));

      const editMenu = template.find((item) => item.label === "编辑");
      assert.isDefined(editMenu);
      if (!Array.isArray(editMenu.submenu)) {
        throw new Error("Expected Edit menu submenu to be an array.");
      }
      assert.deepEqual(
        editMenu.submenu
          .filter((item) =>
            ["undo", "redo", "cut", "copy", "paste", "selectAll"].includes(item.role ?? ""),
          )
          .map(({ role, label }) => ({ role, label })),
        [
          { role: "undo", label: "撤销" },
          { role: "redo", label: "重做" },
          { role: "cut", label: "剪切" },
          { role: "copy", label: "复制" },
          { role: "paste", label: "粘贴" },
          { role: "selectAll", label: "全选" },
        ],
      );

      const windowMenu = template.find((item) => item.label === "窗口");
      assert.isDefined(windowMenu);
      if (!Array.isArray(windowMenu.submenu)) {
        throw new Error("Expected Window menu submenu to be an array.");
      }
      assert.deepEqual(
        windowMenu.submenu.map(({ role, label }) => ({ role, label })),
        [
          { role: "minimize", label: "最小化" },
          { role: "zoom", label: "缩放" },
          { role: "close", label: "关闭" },
        ],
      );
    }),
  );

  it.effect("preserves macOS-specific native menu roles in Chinese", () =>
    Effect.gen(function* () {
      const selectedAction = yield* Deferred.make<string>();
      const applicationMenuTemplate =
        yield* Deferred.make<readonly Electron.MenuItemConstructorOptions[]>();

      yield* configureMenu(selectedAction, applicationMenuTemplate, "zh-CN", "darwin");

      const template = yield* Deferred.await(applicationMenuTemplate);
      const editMenu = template.find((item) => item.label === "编辑");
      assert.isDefined(editMenu);
      if (!Array.isArray(editMenu.submenu)) {
        throw new Error("Expected Edit menu submenu to be an array.");
      }
      assert.deepEqual(
        editMenu.submenu
          .filter((item) => ["pasteAndMatchStyle", "delete", "selectAll"].includes(item.role ?? ""))
          .map(({ role, label }) => ({ role, label })),
        [
          { role: "pasteAndMatchStyle", label: "粘贴并匹配样式" },
          { role: "delete", label: "删除" },
          { role: "selectAll", label: "全选" },
        ],
      );
      assert.isDefined(editMenu.submenu.find((item) => item.label === "替换"));
      assert.isDefined(editMenu.submenu.find((item) => item.label === "语音"));

      const windowMenu = template.find((item) => item.label === "窗口");
      assert.isDefined(windowMenu);
      if (!Array.isArray(windowMenu.submenu)) {
        throw new Error("Expected Window menu submenu to be an array.");
      }
      assert.deepEqual(
        windowMenu.submenu
          .filter((item) => item.role !== undefined)
          .map(({ role, label }) => ({ role, label })),
        [
          { role: "minimize", label: "最小化" },
          { role: "zoom", label: "缩放" },
          { role: "front", label: "全部移到最前面" },
        ],
      );
    }),
  );

  it.effect("rebuilds the menu after the UI language setting changes", () =>
    Effect.gen(function* () {
      const selectedAction = yield* Deferred.make<string>();
      const applicationMenuTemplates =
        yield* Queue.unbounded<readonly Electron.MenuItemConstructorOptions[]>();

      yield* Effect.gen(function* () {
        const menu = yield* DesktopApplicationMenu.DesktopApplicationMenu;
        const settings = yield* DesktopClientSettings.DesktopClientSettings;
        yield* menu.configure;
        const initialTemplate = yield* Queue.take(applicationMenuTemplates);
        assert.isDefined(initialTemplate.find((item) => item.label === "File"));

        yield* Effect.yieldNow;
        yield* settings.set({ ...DEFAULT_CLIENT_SETTINGS, uiLanguage: "zh-CN" });

        const updatedTemplate = yield* Queue.take(applicationMenuTemplates);
        assert.isDefined(updatedTemplate.find((item) => item.label === "文件"));
        assert.equal(updatedTemplate.find((item) => item.role === "help")?.label, "帮助");
      }).pipe(
        Effect.provide(
          makeMenuLayer(
            selectedAction,
            makeQueuedElectronMenuLayer(applicationMenuTemplates),
            "en",
          ),
        ),
        Effect.scoped,
      );
    }),
  );

  // Zoom must route through DesktopWindow.zoomMain instead of the Electron
  // zoom roles: the roles zoom whichever webContents has focus, which breaks
  // app zoom while an embedded preview WebContentsView holds focus.
  it.effect("routes View menu zoom to the main window instead of zoom roles", () =>
    Effect.gen(function* () {
      const selectedAction = yield* Deferred.make<string>();
      const applicationMenuTemplate =
        yield* Deferred.make<readonly Electron.MenuItemConstructorOptions[]>();

      yield* configureMenu(selectedAction, applicationMenuTemplate);

      const template = yield* Deferred.await(applicationMenuTemplate);
      const viewMenu = template.find((item) => item.label === "View");
      assert.isDefined(viewMenu);
      if (!Array.isArray(viewMenu.submenu)) {
        throw new Error("Expected View menu submenu to be an array.");
      }

      assert.isUndefined(
        viewMenu.submenu.find((item) => item.role?.toLowerCase().includes("zoom")),
      );

      const zoomIn = viewMenu.submenu.find((item) => item.label === "Zoom In");
      assert.isDefined(zoomIn);
      assert.equal(zoomIn.accelerator, "CmdOrCtrl+=");
      if (typeof zoomIn.click !== "function") {
        throw new Error("Expected Zoom In menu item to have a click handler.");
      }

      zoomIn.click({} as Electron.MenuItem, {} as Electron.BrowserWindow, {} as KeyboardEvent);
      assert.equal(yield* Deferred.await(selectedAction), "zoom-in");
    }),
  );
});
