import { describe, expect, it, vi } from "vite-plus/test";

import { ProjectId, ProviderInstanceId } from "@t3tools/contracts";
import { createModelSelection } from "@t3tools/shared/model";

vi.mock("./composerImages", () => ({
  toUploadChatImageAttachments: vi.fn(() => []),
}));

import { buildProjectThreadGoalInput } from "./projectThreadStartTurn";

describe("buildProjectThreadGoalInput", () => {
  const base = {
    projectId: ProjectId.make("project-1"),
    projectCwd: "/workspace/project",
    threadId: "thread-1",
    commandId: "command-1",
    createdAt: "2026-01-01T00:00:00.000Z",
    objective: "Finish the mobile goal flow",
    modelSelection: createModelSelection(ProviderInstanceId.make("codex"), "gpt-5.4"),
    runtimeMode: "full-access" as const,
    branch: "main",
    worktreePath: "/workspace/project",
    startFromOrigin: false,
    worktreeBranchName: "t3/thread-1",
  };

  it("creates a local thread bootstrap without a user turn", () => {
    expect(buildProjectThreadGoalInput({ ...base, workspaceMode: "local" })).toEqual({
      commandId: "command-1",
      threadId: "thread-1",
      objective: "Finish the mobile goal flow",
      bootstrap: {
        createThread: {
          projectId: "project-1",
          title: "Finish the mobile goal flow",
          modelSelection: createModelSelection(ProviderInstanceId.make("codex"), "gpt-5.4"),
          runtimeMode: "full-access",
          interactionMode: "default",
          branch: "main",
          worktreePath: "/workspace/project",
          createdAt: "2026-01-01T00:00:00.000Z",
        },
      },
      createdAt: "2026-01-01T00:00:00.000Z",
    });
  });

  it("prepares the selected base branch in worktree mode", () => {
    const input = buildProjectThreadGoalInput({
      ...base,
      workspaceMode: "worktree",
      startFromOrigin: true,
    });

    expect(input.bootstrap.createThread.worktreePath).toBeNull();
    expect(input.bootstrap.prepareWorktree).toEqual({
      projectCwd: "/workspace/project",
      baseBranch: "main",
      branch: "t3/thread-1",
      startFromOrigin: true,
    });
    expect(input.bootstrap.runSetupScript).toBe(true);
  });
});
