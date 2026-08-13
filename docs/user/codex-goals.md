# Keep a Codex thread working toward a goal

Codex threads can keep working toward an objective across turns. Type `/goal` in the message
composer, choose the command, then add the objective:

```text
/goal Finish the requested feature, verify it, and keep fixing issues until the checks pass.
```

Type `/goal` by itself to see the current objective, status, token usage, and elapsed time.

While a goal exists, it stays above the message composer with its status, usage, and elapsed time.
Use the controls there to edit, pause, resume, or clear it. During a turn with a plan, the current
step and completion count stay in the same area so progress remains visible while the chat moves.

Use these commands in the same thread to control the goal:

```text
/goal pause
/goal resume
/goal clear
```

Goals are available for Codex providers. The activity timeline records each goal change, including
status checks and failed updates. A new thread can start with a goal in the current checkout or a
new worktree.
