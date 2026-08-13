import type { ReactElement } from "react";
import type { ThreadGoalSnapshot } from "@t3tools/contracts";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

import { visitElements } from "../../test/reactElementTree";
import { reactHookHarness as hooks } from "../../test/reactHookHarness";

vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react")>();
  const { reactHookHarness } = await import("../../test/reactHookHarness");
  return {
    ...actual,
    useEffect: reactHookHarness.useEffect,
    useRef: reactHookHarness.useRef,
    useState: reactHookHarness.useState,
  };
});

vi.mock("react/compiler-runtime", async () => {
  const { reactHookHarness } = await import("../../test/reactHookHarness");
  return { c: reactHookHarness.useMemoCache };
});

vi.mock("react-i18next", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-i18next")>();
  return {
    ...actual,
    useTranslation: () => ({ t: (key: string) => key }),
  };
});

import {
  ComposerLiveStatusStrip,
  type ComposerLiveStatusStripProps,
} from "./ComposerLiveStatusStrip";

const callbacks = {
  onSetGoal: vi.fn(),
  onEditorSessionChange: vi.fn(),
  onPauseGoal: vi.fn(),
  onResumeGoal: vi.fn(),
  onClearGoal: vi.fn(),
};

function goal(overrides: Partial<ThreadGoalSnapshot> = {}): ThreadGoalSnapshot {
  return {
    objective: "Ship reliable live status",
    status: "active",
    tokensUsed: 1_250,
    timeUsedSeconds: 125,
    tokenBudget: 5_000,
    ...overrides,
  };
}

function renderStrip(
  overrides: Partial<ComposerLiveStatusStripProps> = {},
): ReactElement<Record<string, unknown>> | null {
  hooks.beginRender();
  return ComposerLiveStatusStrip({
    plan: null,
    goal: goal(),
    editorSession: null,
    pendingGoalAction: null,
    ...callbacks,
    ...overrides,
  }) as ReactElement<Record<string, unknown>> | null;
}

function elementWithText(row: ReactElement<Record<string, unknown>>, text: string) {
  return visitElements(row, (element) => element.props.children === text);
}

function action(row: ReactElement<Record<string, unknown>>, label: string) {
  return visitElements(
    row,
    (element) => element.props.label === label && typeof element.props.onClick === "function",
  );
}

describe("ComposerLiveStatusStrip", () => {
  beforeEach(() => {
    hooks.reset();
    callbacks.onSetGoal.mockReset();
    callbacks.onEditorSessionChange.mockReset();
    callbacks.onPauseGoal.mockReset();
    callbacks.onResumeGoal.mockReset();
    callbacks.onClearGoal.mockReset();
  });

  it("shows the current plan step, completion count, and goal usage", () => {
    const row = renderStrip({
      plan: {
        currentStep: "Verify the composer integration",
        completedSteps: 2,
        totalSteps: 4,
      },
    });
    expect(row).not.toBeNull();
    if (!row) return;

    const planStatus = visitElements(
      row,
      (element) => element.props["data-composer-plan-status"] === "true",
    );
    const goalStatus = visitElements(
      row,
      (element) => element.props["data-composer-goal-status"] === "active",
    );
    const progress = visitElements(
      row,
      (element) => (element.props.style as { width?: string } | undefined)?.width === "50%",
    );
    const completion = visitElements(
      row,
      (element) =>
        Array.isArray(element.props.children) &&
        element.props.children[0] === 2 &&
        element.props.children[2] === 4,
    );
    const usage = visitElements(
      row,
      (element) =>
        Array.isArray(element.props.children) &&
        element.props.children.includes("1.25K/5K") &&
        element.props.children.includes("2m"),
    );

    expect(planStatus).not.toBeNull();
    expect(elementWithText(row, "Verify the composer integration")).not.toBeNull();
    expect(progress).not.toBeNull();
    expect(completion).not.toBeNull();
    expect(goalStatus).not.toBeNull();
    expect(elementWithText(row, "Ship reliable live status")).not.toBeNull();
    expect(elementWithText(row, "chat.liveGoalActive")).not.toBeNull();
    expect(usage).not.toBeNull();
  });

  it("saves an edited objective with Enter", () => {
    const initial = renderStrip();
    expect(initial).not.toBeNull();
    if (!initial) return;

    (action(initial, "chat.editGoal")?.props.onClick as (() => void) | undefined)?.();
    const editing = renderStrip({
      editorSession: { draftObjective: "Ship reliable live status", submittedObjective: null },
    });
    expect(editing).not.toBeNull();
    if (!editing) return;

    const input = visitElements(editing, (element) => element.type === "input");
    (
      input?.props.onChange as ((event: { currentTarget: { value: string } }) => void) | undefined
    )?.({ currentTarget: { value: "  Ship the tested status strip  " } });

    const changed = renderStrip({
      editorSession: {
        draftObjective: "  Ship the tested status strip  ",
        submittedObjective: null,
      },
    });
    expect(changed).not.toBeNull();
    if (!changed) return;
    const changedInput = visitElements(changed, (element) => element.type === "input");
    const preventDefault = vi.fn();
    (
      changedInput?.props.onKeyDown as
        | ((event: { key: string; preventDefault: () => void }) => void)
        | undefined
    )?.({ key: "Enter", preventDefault });

    expect(preventDefault).toHaveBeenCalledOnce();
    expect(callbacks.onSetGoal).toHaveBeenCalledWith("Ship the tested status strip");
  });

  it("keeps an edited objective open when the save is rejected", async () => {
    callbacks.onSetGoal.mockResolvedValueOnce(false);
    const initial = renderStrip();
    expect(initial).not.toBeNull();
    if (!initial) return;
    (action(initial, "chat.editGoal")?.props.onClick as (() => void) | undefined)?.();

    const editing = renderStrip({
      editorSession: { draftObjective: "Ship reliable live status", submittedObjective: null },
    });
    expect(editing).not.toBeNull();
    if (!editing) return;
    const input = visitElements(editing, (element) => element.type === "input");
    (
      input?.props.onChange as ((event: { currentTarget: { value: string } }) => void) | undefined
    )?.({ currentTarget: { value: "Keep this draft" } });

    const changed = renderStrip({
      editorSession: { draftObjective: "Keep this draft", submittedObjective: null },
    });
    expect(changed).not.toBeNull();
    if (!changed) return;
    (action(changed, "common.save")?.props.onClick as (() => void) | undefined)?.();
    await Promise.resolve();

    const rejected = renderStrip({
      editorSession: { draftObjective: "Keep this draft", submittedObjective: null },
    });
    expect(callbacks.onSetGoal).toHaveBeenCalledWith("Keep this draft");
    expect(visitElements(rejected, (element) => element.type === "input")?.props.value).toBe(
      "Keep this draft",
    );
  });

  it("keeps an accepted edit open until the goal snapshot reflects it", async () => {
    callbacks.onSetGoal.mockResolvedValueOnce(true);
    const initial = renderStrip();
    expect(initial).not.toBeNull();
    if (!initial) return;
    (action(initial, "chat.editGoal")?.props.onClick as (() => void) | undefined)?.();

    const editing = renderStrip({
      editorSession: { draftObjective: "Ship reliable live status", submittedObjective: null },
    });
    expect(editing).not.toBeNull();
    if (!editing) return;
    const input = visitElements(editing, (element) => element.type === "input");
    (
      input?.props.onChange as ((event: { currentTarget: { value: string } }) => void) | undefined
    )?.({ currentTarget: { value: "Wait for the provider receipt" } });

    const changed = renderStrip({
      editorSession: { draftObjective: "Wait for the provider receipt", submittedObjective: null },
    });
    expect(changed).not.toBeNull();
    if (!changed) return;
    (action(changed, "common.save")?.props.onClick as (() => void) | undefined)?.();
    await Promise.resolve();

    const accepted = renderStrip({
      editorSession: {
        draftObjective: "Wait for the provider receipt",
        submittedObjective: "Wait for the provider receipt",
      },
    });
    expect(callbacks.onSetGoal).toHaveBeenCalledWith("Wait for the provider receipt");
    expect(visitElements(accepted, (element) => element.type === "input")?.props.value).toBe(
      "Wait for the provider receipt",
    );
  });

  it("closes an accepted edit after the matching goal snapshot arrives", async () => {
    callbacks.onSetGoal.mockResolvedValueOnce(true);
    const objective = "Use the synchronized objective";
    const initial = renderStrip();
    hooks.flushEffects();
    expect(initial).not.toBeNull();
    if (!initial) return;
    (action(initial, "chat.editGoal")?.props.onClick as (() => void) | undefined)?.();

    const editing = renderStrip({
      editorSession: { draftObjective: "Ship reliable live status", submittedObjective: null },
    });
    hooks.flushEffects();
    expect(editing).not.toBeNull();
    if (!editing) return;
    const input = visitElements(editing, (element) => element.type === "input");
    (
      input?.props.onChange as ((event: { currentTarget: { value: string } }) => void) | undefined
    )?.({ currentTarget: { value: objective } });

    const changed = renderStrip({
      editorSession: { draftObjective: objective, submittedObjective: null },
    });
    hooks.flushEffects();
    expect(changed).not.toBeNull();
    if (!changed) return;
    (action(changed, "common.save")?.props.onClick as (() => void) | undefined)?.();
    await Promise.resolve();

    const synchronized = renderStrip({
      goal: goal({ objective }),
      editorSession: { draftObjective: objective, submittedObjective: objective },
    });
    expect(synchronized).not.toBeNull();
    if (!synchronized) return;
    expect(visitElements(synchronized, (element) => element.type === "input")).not.toBeNull();
    hooks.flushEffects();
    expect(callbacks.onEditorSessionChange).toHaveBeenCalledWith(null);

    const settled = renderStrip({ goal: goal({ objective }) });
    expect(settled).not.toBeNull();
    if (!settled) return;
    expect(visitElements(settled, (element) => element.type === "input")).toBeNull();
    expect(elementWithText(settled, objective)).not.toBeNull();
  });

  it("cancels an edited objective with Escape", () => {
    const initial = renderStrip();
    expect(initial).not.toBeNull();
    if (!initial) return;
    (action(initial, "chat.editGoal")?.props.onClick as (() => void) | undefined)?.();

    const editing = renderStrip({
      editorSession: { draftObjective: "Ship reliable live status", submittedObjective: null },
    });
    expect(editing).not.toBeNull();
    if (!editing) return;
    const input = visitElements(editing, (element) => element.type === "input");
    (
      input?.props.onChange as ((event: { currentTarget: { value: string } }) => void) | undefined
    )?.({ currentTarget: { value: "Discard this draft" } });

    const changed = renderStrip({
      editorSession: { draftObjective: "Discard this draft", submittedObjective: null },
    });
    expect(changed).not.toBeNull();
    if (!changed) return;
    const changedInput = visitElements(changed, (element) => element.type === "input");
    const preventDefault = vi.fn();
    (
      changedInput?.props.onKeyDown as
        | ((event: { key: string; preventDefault: () => void }) => void)
        | undefined
    )?.({ key: "Escape", preventDefault });

    const cancelled = renderStrip();
    expect(preventDefault).toHaveBeenCalledOnce();
    expect(callbacks.onSetGoal).not.toHaveBeenCalled();
    expect(cancelled).not.toBeNull();
    if (!cancelled) return;
    expect(visitElements(cancelled, (element) => element.type === "input")).toBeNull();
    expect(elementWithText(cancelled, "Ship reliable live status")).not.toBeNull();
  });

  it("disables goal operations while an action is pending", () => {
    const pending = renderStrip({ pendingGoalAction: "pause" });
    expect(pending).not.toBeNull();
    if (!pending) return;

    expect(action(pending, "chat.editGoal")).toBeNull();
    expect(action(pending, "chat.pauseGoal")).toBeNull();
    expect(action(pending, "chat.clearGoal")).toBeNull();
    expect(
      visitElements(pending, (element) => element.props["aria-label"] === "common.loading"),
    ).not.toBeNull();
  });

  it("shows pending feedback while saving and keeps local cancel available", () => {
    const pending = renderStrip({
      editorSession: { draftObjective: "Wait for the provider", submittedObjective: null },
      pendingGoalAction: "set",
      disabled: true,
    });
    expect(pending).not.toBeNull();
    if (!pending) return;

    expect(action(pending, "common.save")).toBeNull();
    expect(action(pending, "common.cancel")?.props.disabled).not.toBe(true);
    expect(
      visitElements(pending, (element) => element.props["aria-label"] === "common.loading"),
    ).not.toBeNull();

    (action(pending, "common.cancel")?.props.onClick as (() => void) | undefined)?.();
    expect(callbacks.onEditorSessionChange).toHaveBeenCalledWith(null);
  });

  it("dispatches pause, resume, and confirmed clear actions", () => {
    const active = renderStrip();
    expect(active).not.toBeNull();
    if (!active) return;
    (action(active, "chat.pauseGoal")?.props.onClick as (() => void) | undefined)?.();

    const paused = renderStrip({ goal: goal({ status: "paused" }) });
    expect(paused).not.toBeNull();
    if (!paused) return;
    (action(paused, "chat.resumeGoal")?.props.onClick as (() => void) | undefined)?.();
    (action(paused, "chat.clearGoal")?.props.onClick as (() => void) | undefined)?.();

    const confirming = renderStrip({ goal: goal({ status: "paused" }) });
    expect(confirming).not.toBeNull();
    if (!confirming) return;
    const dialog = visitElements(
      confirming,
      (element) => element.props.open === true && typeof element.props.onOpenChange === "function",
    );
    const confirmClear = visitElements(
      confirming,
      (element) =>
        element.props.variant === "destructive" && typeof element.props.onClick === "function",
    );

    expect(dialog).not.toBeNull();
    (confirmClear?.props.onClick as (() => void) | undefined)?.();
    const cleared = renderStrip({ goal: goal({ status: "paused" }) });

    expect(callbacks.onPauseGoal).toHaveBeenCalledOnce();
    expect(callbacks.onResumeGoal).toHaveBeenCalledOnce();
    expect(callbacks.onClearGoal).toHaveBeenCalledOnce();
    expect(
      visitElements(
        cleared,
        (element) =>
          element.props.open === false && typeof element.props.onOpenChange === "function",
      ),
    ).not.toBeNull();
  });
});
