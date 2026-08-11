import { ThreadId } from "@t3tools/contracts";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it } from "vite-plus/test";

import { i18n } from "../i18n/i18n";
import { ThreadStatusLabel, ThreadWorktreeIndicator } from "./ThreadStatusIndicators";

afterEach(async () => {
  await i18n.changeLanguage("en");
});

describe("ThreadStatusLabel", () => {
  it("translates semantic thread states at render time", async () => {
    await i18n.changeLanguage("zh-CN");

    const markup = renderToStaticMarkup(
      <ThreadStatusLabel
        status={{
          kind: "pending-approval",
          label: "Pending Approval",
          colorClass: "text-amber-600",
          dotClass: "bg-amber-500",
          pulse: false,
        }}
      />,
    );

    expect(markup).toContain('aria-label="等待批准"');
    expect(markup).toContain("等待批准");
    expect(markup).not.toContain("Pending Approval");
  });
});

describe("ThreadWorktreeIndicator", () => {
  it("renders the worktree folder and branch in an accessible label", () => {
    const markup = renderToStaticMarkup(
      <ThreadWorktreeIndicator
        thread={{
          id: ThreadId.make("thread-1"),
          branch: "feature/sidebar-indicator",
          worktreePath: "/tmp/worktrees/sidebar-indicator",
        }}
      />,
    );

    expect(markup).toContain('role="img"');
    expect(markup).toContain(
      'aria-label="Worktree: sidebar-indicator (feature/sidebar-indicator)"',
    );
    expect(markup).toContain('data-testid="thread-worktree-thread-1"');
  });

  it.each([null, "", "   "])("renders nothing for an absent worktree path", (worktreePath) => {
    const markup = renderToStaticMarkup(
      <ThreadWorktreeIndicator
        thread={{
          id: ThreadId.make("thread-1"),
          branch: "main",
          worktreePath,
        }}
      />,
    );

    expect(markup).toBe("");
  });
});
