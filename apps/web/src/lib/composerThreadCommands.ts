import type { OrchestrationThread } from "@t3tools/contracts";

const MAX_HANDOFF_CHARS = 24_000;
type ThreadTranscript = {
  readonly messages: ReadonlyArray<Pick<OrchestrationThread["messages"][number], "role" | "text">>;
};

function recentTranscript(thread: ThreadTranscript): string {
  const rows: string[] = [];
  let length = 0;
  for (let index = thread.messages.length - 1; index >= 0; index -= 1) {
    const message = thread.messages[index];
    if (!message) continue;
    const row = `${message.role === "assistant" ? "Assistant" : "User"}: ${message.text.trim()}`;
    if (rows.length > 0 && length + row.length > MAX_HANDOFF_CHARS) break;
    rows.unshift(row);
    length += row.length;
  }
  return rows.join("\n\n");
}

export function buildForkedThreadPrompt(thread: ThreadTranscript, task: string): string {
  return [
    "Continue this work in a new thread. Treat the transcript below as prior conversation context.",
    task.trim() || "Continue from the current state and verify the result.",
    recentTranscript(thread),
  ]
    .filter((part) => part.length > 0)
    .join("\n\n");
}

export function buildSideThreadPrompt(thread: ThreadTranscript, task: string): string {
  return [
    "Handle this as an independent side task. Do not modify the original thread's goal or assumptions unless the task requires it.",
    task.trim() || "Inspect the current work from a separate angle and report useful findings.",
    "Source thread context:",
    recentTranscript(thread),
  ]
    .filter((part) => part.length > 0)
    .join("\n\n");
}
