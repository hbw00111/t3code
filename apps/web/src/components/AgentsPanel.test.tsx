import type { ReactElement } from "react";
import type {
  AgentPanelWorkflowGroup,
  RuntimeSubagent,
} from "@t3tools/client-runtime/state/subagentRuntime";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

import { visitElements } from "../test/reactElementTree";
import { reactHookHarness as hooks } from "../test/reactHookHarness";

vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react")>();
  const { reactHookHarness } = await import("../test/reactHookHarness");
  return {
    ...actual,
    useState: reactHookHarness.useState,
  };
});

vi.mock("react/compiler-runtime", async () => {
  const { reactHookHarness } = await import("../test/reactHookHarness");
  return { c: reactHookHarness.useMemoCache };
});

vi.mock("react-i18next", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-i18next")>();
  return {
    ...actual,
    useTranslation: () => ({ t: (key: string) => key }),
  };
});

import { AgentRow, CollapsedWorkflowSection } from "./AgentsPanel";

const initialCommand =
  'pnpm --filter @t3tools/web exec playwright test src/components/AgentsPanel.spec.ts --project="Desktop Chromium" --grep "shows the complete command without clipping its arguments"';
const updatedCommand =
  'pnpm --filter @t3tools/web exec playwright test src/components/AgentsPanel.spec.ts --project="Mobile Safari" --grep "keeps expanded details visible after a live update" --reporter=line';

function runtimeAgent(progress: string): RuntimeSubagent {
  return {
    id: "agent-command-runner",
    kind: "subagent",
    title: "Command runner",
    role: "worker",
    model: "gpt-5.3-codex",
    effort: "high",
    status: "running",
    activationCount: 1,
    usage: { totalTokens: 4_200, toolUses: 2 },
    progress,
    lastToolName: "exec_command",
    result: null,
    error: null,
    outputFile: null,
    parentAgentId: null,
    agentIndex: 0,
    phaseIndex: null,
    phaseTitle: null,
    attempt: null,
    workflowName: null,
    phases: [],
    runHandles: null,
    recentActivity: [],
    firstSeenAt: "2026-08-12T06:00:00.000Z",
    startedAt: "2026-08-12T06:00:01.000Z",
    completedAt: null,
    updatedAt: "2026-08-12T06:00:02.000Z",
  };
}

function renderAgent(agent: RuntimeSubagent): ReactElement<Record<string, unknown>> {
  hooks.beginRender();
  return AgentRow({ agent }) as ReactElement<Record<string, unknown>>;
}

function agentButton(row: ReactElement<Record<string, unknown>>) {
  return visitElements(row, (element) => element.type === "button");
}

function agentDetails(row: ReactElement<Record<string, unknown>>) {
  return visitElements(row, (element) => element.props["data-agent-details"] === "true");
}

function currentActivity(row: ReactElement<Record<string, unknown>>) {
  return visitElements(
    row,
    (element) => element.props["data-agent-current-activity"] === "complete",
  );
}

function srOnlyAction(row: ReactElement<Record<string, unknown>>) {
  return visitElements(
    row,
    (element) =>
      element.type === "span" &&
      element.props.className === "sr-only" &&
      (element.props.children === "agents.expandAgent" ||
        element.props.children === "agents.collapseAgent"),
  );
}

describe("AgentRow", () => {
  beforeEach(() => {
    hooks.reset();
  });

  it("starts collapsed and reveals the complete command when clicked", () => {
    const agent = runtimeAgent(initialCommand);
    const collapsed = renderAgent(agent);
    const collapsedButton = agentButton(collapsed);

    expect(collapsedButton?.props["aria-expanded"]).toBe(false);
    expect(agentDetails(collapsed)).toBeNull();

    (collapsedButton?.props.onClick as (() => void) | undefined)?.();
    const expanded = renderAgent(agent);
    const expandedActivity = currentActivity(expanded);

    expect(agentButton(expanded)?.props["aria-expanded"]).toBe(true);
    expect(agentDetails(expanded)).not.toBeNull();
    expect(expandedActivity?.props.children).toBe(initialCommand);
    expect(expandedActivity?.props.className).not.toContain("truncate");
  });

  it("keeps visible row content in the accessible name and exposes the toggle action separately", () => {
    const agent = runtimeAgent(initialCommand);
    const collapsed = renderAgent(agent);
    const collapsedButton = agentButton(collapsed);

    expect(collapsedButton?.props["aria-label"]).toBeUndefined();
    expect(srOnlyAction(collapsed)?.props.children).toBe("agents.expandAgent");

    (collapsedButton?.props.onClick as (() => void) | undefined)?.();
    const expanded = renderAgent(agent);

    expect(agentButton(expanded)?.props["aria-label"]).toBeUndefined();
    expect(srOnlyAction(expanded)?.props.children).toBe("agents.collapseAgent");
  });

  it("keeps the row expanded when live agent data rerenders", () => {
    const initialAgent = runtimeAgent(initialCommand);
    const collapsedButton = agentButton(renderAgent(initialAgent));
    (collapsedButton?.props.onClick as (() => void) | undefined)?.();

    const updatedAgent = {
      ...initialAgent,
      progress: updatedCommand,
      usage: { totalTokens: 5_700, toolUses: 3 },
      updatedAt: "2026-08-12T06:00:05.000Z",
    } satisfies RuntimeSubagent;
    const rerendered = renderAgent(updatedAgent);

    expect(agentButton(rerendered)?.props["aria-expanded"]).toBe(true);
    expect(rerendered.props["data-agent-expanded"]).toBe("true");
    expect(currentActivity(rerendered)?.props.children).toBe(updatedCommand);
  });
});

describe("CollapsedWorkflowSection", () => {
  beforeEach(() => {
    hooks.reset();
  });

  it("exposes the workflow status in its accessible text", () => {
    const workflow = {
      ...runtimeAgent("Coordinator finished"),
      id: "workflow-1",
      kind: "workflow" as const,
      status: "completed" as const,
      completedAt: "2026-08-12T06:00:03.000Z",
    };
    const group: AgentPanelWorkflowGroup = {
      workflow,
      phases: [],
      unphasedMembers: [],
    };

    const row = CollapsedWorkflowSection({ group, onExpand: vi.fn() }) as ReactElement<
      Record<string, unknown>
    >;

    expect(
      visitElements(row, (element) => element.props.children === "agents.statusCompleted"),
    ).not.toBeNull();
  });
});
