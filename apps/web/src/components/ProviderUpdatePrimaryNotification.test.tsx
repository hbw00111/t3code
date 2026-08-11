import type { DependencyList, EffectCallback } from "react";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { AsyncResult } from "effect/unstable/reactivity";
import { ProviderDriverKind, ProviderInstanceId, type ServerProvider } from "@t3tools/contracts";

const hooks = vi.hoisted(() => {
  let cursor = 0;
  let slots: unknown[] = [];

  const dependenciesChanged = (previous: DependencyList | undefined, next: DependencyList) =>
    previous === undefined ||
    previous.length !== next.length ||
    previous.some((value, index) => !Object.is(value, next[index]));

  return {
    beginRender() {
      cursor = 0;
    },
    reset() {
      cursor = 0;
      slots = [];
    },
    flushEffects() {
      for (const slot of slots) {
        const effectSlot = slot as
          | {
              cleanup?: void | (() => void);
              effect?: EffectCallback;
              pending?: boolean;
            }
          | undefined;
        if (!effectSlot?.pending || !effectSlot.effect) continue;
        effectSlot.pending = false;
        effectSlot.cleanup?.();
        effectSlot.cleanup = effectSlot.effect();
      }
    },
    useCallback<T>(callback: T, dependencies: DependencyList): T {
      return this.useMemo(() => callback, dependencies);
    },
    useEffect(effect: EffectCallback, dependencies: DependencyList) {
      const index = cursor++;
      const previous = slots[index] as
        | {
            cleanup?: void | (() => void);
            dependencies?: DependencyList;
            effect?: EffectCallback;
            pending?: boolean;
          }
        | undefined;
      if (!previous) {
        slots[index] = { dependencies, effect, pending: true };
        return;
      }
      if (dependenciesChanged(previous.dependencies, dependencies)) {
        previous.dependencies = dependencies;
        previous.effect = effect;
        previous.pending = true;
      }
    },
    useMemo<T>(factory: () => T, dependencies: DependencyList): T {
      const index = cursor++;
      const previous = slots[index] as { dependencies: DependencyList; value: T } | undefined;
      if (!previous || dependenciesChanged(previous.dependencies, dependencies)) {
        const value = factory();
        slots[index] = { dependencies, value };
        return value;
      }
      return previous.value;
    },
    useMemoCache(size: number): unknown[] {
      const index = cursor++;
      if (!slots[index]) {
        slots[index] = Array.from({ length: size }, () => Symbol.for("react.memo_cache_sentinel"));
      }
      return slots[index] as unknown[];
    },
    useRef<T>(initialValue: T): { current: T } {
      const index = cursor++;
      if (!slots[index]) {
        slots[index] = { current: initialValue };
      }
      return slots[index] as { current: T };
    },
  };
});

const testState = vi.hoisted(() => {
  const translations = new Map<string, (key: string, options?: unknown) => string>();
  const translation = (language: string) => {
    const existing = translations.get(language);
    if (existing) return existing;
    const next = (key: string, options?: unknown) =>
      `${language}:${key}${options === undefined ? "" : `:${JSON.stringify(options)}`}`;
    translations.set(language, next);
    return next;
  };

  return {
    language: "en",
    providers: [] as ServerProvider[],
    translation,
    updateProvider: vi.fn(),
    toastAdd: vi.fn(),
    toastClose: vi.fn(),
    toastUpdate: vi.fn(),
  };
});

vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react")>();
  return {
    ...actual,
    useCallback: hooks.useCallback.bind(hooks),
    useEffect: hooks.useEffect.bind(hooks),
    useMemo: hooks.useMemo.bind(hooks),
    useRef: hooks.useRef.bind(hooks),
  };
});

vi.mock("react/compiler-runtime", () => ({ c: hooks.useMemoCache.bind(hooks) }));

vi.mock("react-i18next", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-i18next")>();
  return {
    ...actual,
    useTranslation: () => ({
      t: testState.translation(testState.language),
      i18n: {
        language: testState.language,
        resolvedLanguage: testState.language,
      },
    }),
  };
});

vi.mock("@tanstack/react-router", () => ({ useNavigate: () => vi.fn() }));
vi.mock("@effect/atom-react", () => ({ useAtomValue: () => testState.providers }));
vi.mock("../state/server", () => ({
  primaryServerProvidersAtom: Symbol("providers"),
  serverEnvironment: { updateProvider: Symbol("updateProvider") },
}));
vi.mock("../state/environments", () => ({
  usePrimaryEnvironment: () => ({ environmentId: "primary" }),
}));
vi.mock("../providerUpdateDismissal", () => ({
  useDismissedProviderUpdateNotificationKeys: () => ({
    dismissedNotificationKeys: new Set(),
    dismissNotificationKey: vi.fn(),
  }),
}));
vi.mock("../state/use-atom-command", () => ({
  useAtomCommand: () => testState.updateProvider,
}));
vi.mock("./ui/toast", () => ({
  stackedThreadToast: (toast: unknown) => toast,
  toastManager: {
    add: testState.toastAdd,
    close: testState.toastClose,
    update: testState.toastUpdate,
  },
}));

import { ProviderUpdatePrimaryNotification } from "./ProviderUpdatePrimaryNotification";

const instanceId = ProviderInstanceId.make("codex-primary");
const driver = ProviderDriverKind.make("codex");

function provider(updateState: ServerProvider["updateState"] = undefined): ServerProvider {
  return {
    instanceId,
    driver,
    enabled: true,
    installed: true,
    version: "1.0.0",
    status: "ready",
    auth: { status: "authenticated" },
    checkedAt: "2026-08-11T06:00:00.000Z",
    models: [],
    slashCommands: [],
    skills: [],
    versionAdvisory: {
      status: "behind_latest",
      currentVersion: "1.0.0",
      latestVersion: "1.1.0",
      updateCommand: "npm install -g @openai/codex@latest",
      canUpdate: true,
      checkedAt: "2026-08-11T06:00:00.000Z",
      message: "Update available.",
    },
    ...(updateState ? { updateState } : {}),
  };
}

function renderNotification() {
  hooks.beginRender();
  ProviderUpdatePrimaryNotification();
  hooks.flushEffects();
}

async function flushPromises() {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

describe("ProviderUpdatePrimaryNotification", () => {
  beforeEach(() => {
    hooks.reset();
    testState.language = "en";
    testState.providers = [provider()];
    testState.updateProvider.mockReset();
    testState.toastAdd.mockReset().mockReturnValue(17);
    testState.toastClose.mockReset();
    testState.toastUpdate.mockReset();
  });

  it("retranslates a failed toast and replaces it when a newer update appears", async () => {
    const failedProvider = provider({
      status: "failed",
      startedAt: "2026-08-11T06:01:00.000Z",
      finishedAt: "2026-08-11T06:01:01.000Z",
      message: "Update command exited with code 1.",
      output: null,
    });
    testState.updateProvider.mockResolvedValue(
      AsyncResult.success({ providers: [failedProvider] }),
    );

    renderNotification();
    const prompt = testState.toastAdd.mock.calls[0]?.[0] as {
      actionProps: { onClick: () => void };
    };
    prompt.actionProps.onClick();
    await flushPromises();

    const englishFailure = testState.toastUpdate.mock.calls.at(-1)?.[1] as {
      description: string;
      title: string;
    };
    expect(englishFailure.title).toContain("en:providerUpdate.updateFailed");
    expect(englishFailure.description).toContain("en:providerUpdate.updateCommandExited");

    testState.language = "zh-CN";
    testState.providers = [failedProvider];
    renderNotification();

    const chineseFailure = testState.toastUpdate.mock.calls.at(-1)?.[1] as {
      description: string;
      title: string;
    };
    expect(chineseFailure.title).toContain("zh-CN:providerUpdate.updateFailed");
    expect(chineseFailure.description).toContain("zh-CN:providerUpdate.updateCommandExited");

    const newerProvider = provider();
    testState.providers = [
      {
        ...newerProvider,
        versionAdvisory: {
          ...newerProvider.versionAdvisory!,
          latestVersion: "1.2.0",
        },
      },
    ];
    renderNotification();

    expect(testState.toastClose).toHaveBeenCalledWith(17);
    expect(testState.toastAdd).toHaveBeenCalledTimes(2);
    expect(testState.toastAdd.mock.calls[1]?.[0]).toMatchObject({
      title: expect.stringContaining("zh-CN:providerUpdate.availableNamed"),
    });
  });
});
