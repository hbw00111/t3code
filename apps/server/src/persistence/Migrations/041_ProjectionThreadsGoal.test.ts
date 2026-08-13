import { assert, it } from "@effect/vitest";
import { ThreadGoalSnapshot } from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Schema from "effect/Schema";
import * as SqlClient from "effect/unstable/sql/SqlClient";

import { runMigrations } from "../Migrations.ts";
import * as NodeSqliteClient from "../NodeSqliteClient.ts";

const layer = it.layer(Layer.mergeAll(NodeSqliteClient.layerMemory()));
const decodeProjectedGoal = Schema.decodeUnknownSync(
  Schema.NullOr(Schema.fromJsonString(ThreadGoalSnapshot)),
);

layer("041_ProjectionThreadsGoal", (it) => {
  it.effect("backfills the latest valid goal snapshot without reviving cleared goals", () =>
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;
      yield* runMigrations({ toMigrationInclusive: 40 });
      yield* sql`
        INSERT INTO projection_projects (
          project_id, title, workspace_root, scripts_json, created_at, updated_at
        ) VALUES ('project-1', 'Project', '/tmp/project', '[]', '2026-01-01', '2026-01-01')
      `;
      yield* sql`
        INSERT INTO projection_threads (
          thread_id, project_id, title, model_selection_json, runtime_mode,
          interaction_mode, created_at, updated_at
        ) VALUES
          ('thread-valid-latest', 'project-1', 'Valid latest',
           '{"instanceId":"codex","model":"gpt-5.4"}', 'full-access',
           'default', '2026-01-01', '2026-01-01'),
          ('thread-invalid-objective', 'project-1', 'Invalid objective',
           '{"instanceId":"codex","model":"gpt-5.4"}', 'full-access',
           'default', '2026-01-01', '2026-01-01'),
          ('thread-invalid-status', 'project-1', 'Invalid status',
           '{"instanceId":"codex","model":"gpt-5.4"}', 'full-access',
           'default', '2026-01-01', '2026-01-01'),
          ('thread-invalid-tokens', 'project-1', 'Invalid tokens',
           '{"instanceId":"codex","model":"gpt-5.4"}', 'full-access',
           'default', '2026-01-01', '2026-01-01'),
          ('thread-invalid-time', 'project-1', 'Invalid time',
           '{"instanceId":"codex","model":"gpt-5.4"}', 'full-access',
           'default', '2026-01-01', '2026-01-01'),
          ('thread-invalid-budget', 'project-1', 'Invalid budget',
           '{"instanceId":"codex","model":"gpt-5.4"}', 'full-access',
           'default', '2026-01-01', '2026-01-01'),
          ('thread-cleared', 'project-1', 'Cleared',
           '{"instanceId":"codex","model":"gpt-5.4"}', 'full-access',
           'default', '2026-01-01', '2026-01-01'),
          ('thread-clear-fallback', 'project-1', 'Clear fallback',
           '{"instanceId":"codex","model":"gpt-5.4"}', 'full-access',
           'default', '2026-01-01', '2026-01-01'),
          ('thread-rpc-race', 'project-1', 'RPC race',
           '{"instanceId":"codex","model":"gpt-5.4"}', 'full-access',
           'default', '2026-01-01', '2026-01-01')
      `;
      yield* sql`
        INSERT INTO orchestration_events (
          event_id, aggregate_kind, stream_id, stream_version, event_type,
          occurred_at, command_id, causation_event_id, correlation_id, actor_kind,
          payload_json, metadata_json
        ) VALUES
          ('event-valid-old', 'thread', 'thread-valid-latest', 1,
           'thread.activity-appended', '2026-01-01', 'command-valid-old', NULL, NULL, 'server',
           '{"threadId":"thread-valid-latest","activity":{"kind":"provider.thread.goal.updated","payload":{"goal":{"objective":"Old valid","status":"paused","tokensUsed":1,"timeUsedSeconds":2}}}}', '{}'),
          ('event-valid-new', 'thread', 'thread-valid-latest', 2,
           'thread.activity-appended', '2026-01-02', 'command-valid-new', NULL, NULL, 'server',
           '{"threadId":"thread-valid-latest","activity":{"kind":"provider.thread.goal.updated","payload":{"goal":{"objective":"Latest valid","status":"active","tokensUsed":5,"timeUsedSeconds":3,"tokenBudget":1000}}}}', '{}'),
          ('event-objective-old', 'thread', 'thread-invalid-objective', 1,
           'thread.activity-appended', '2026-01-01', 'command-objective-old', NULL, NULL, 'server',
           '{"threadId":"thread-invalid-objective","activity":{"kind":"provider.thread.goal.updated","payload":{"goal":{"objective":"Objective fallback","status":"active","tokensUsed":2,"timeUsedSeconds":3}}}}', '{}'),
          ('event-objective-invalid', 'thread', 'thread-invalid-objective', 2,
           'thread.activity-appended', '2026-01-02', 'command-objective-invalid', NULL, NULL, 'server',
           '{"threadId":"thread-invalid-objective","activity":{"kind":"provider.thread.goal.updated","payload":{"goal":{"objective":42,"status":"active","tokensUsed":2,"timeUsedSeconds":3}}}}', '{}'),
          ('event-objective-blank', 'thread', 'thread-invalid-objective', 3,
           'thread.activity-appended', '2026-01-03', 'command-objective-blank', NULL, NULL, 'server',
           '{"threadId":"thread-invalid-objective","activity":{"kind":"provider.thread.goal.updated","payload":{"goal":{"objective":"\t\n","status":"active","tokensUsed":2,"timeUsedSeconds":3}}}}', '{}'),
          ('event-status-old', 'thread', 'thread-invalid-status', 1,
           'thread.activity-appended', '2026-01-01', 'command-status-old', NULL, NULL, 'server',
           '{"threadId":"thread-invalid-status","activity":{"kind":"provider.thread.goal.read","payload":{"goal":{"objective":"Status fallback","status":"paused","tokensUsed":3,"timeUsedSeconds":4}}}}', '{}'),
          ('event-status-invalid', 'thread', 'thread-invalid-status', 2,
           'thread.activity-appended', '2026-01-02', 'command-status-invalid', NULL, NULL, 'server',
           '{"threadId":"thread-invalid-status","activity":{"kind":"provider.thread.goal.read","payload":{"goal":{"objective":"Invalid status","status":"unknown","tokensUsed":3,"timeUsedSeconds":4}}}}', '{}'),
          ('event-tokens-old', 'thread', 'thread-invalid-tokens', 1,
           'thread.activity-appended', '2026-01-01', 'command-tokens-old', NULL, NULL, 'server',
           '{"threadId":"thread-invalid-tokens","activity":{"kind":"provider.thread.goal.synced","payload":{"goal":{"objective":"Tokens fallback","status":"blocked","tokensUsed":4,"timeUsedSeconds":5}}}}', '{}'),
          ('event-tokens-invalid', 'thread', 'thread-invalid-tokens', 2,
           'thread.activity-appended', '2026-01-02', 'command-tokens-invalid', NULL, NULL, 'server',
           '{"threadId":"thread-invalid-tokens","activity":{"kind":"provider.thread.goal.synced","payload":{"goal":{"objective":"Invalid tokens","status":"active","tokensUsed":-1,"timeUsedSeconds":5}}}}', '{}'),
          ('event-time-old', 'thread', 'thread-invalid-time', 1,
           'thread.activity-appended', '2026-01-01', 'command-time-old', NULL, NULL, 'server',
           '{"threadId":"thread-invalid-time","activity":{"kind":"provider.thread.goal.updated","payload":{"goal":{"objective":"Time fallback","status":"budgetLimited","tokensUsed":5,"timeUsedSeconds":6}}}}', '{}'),
          ('event-time-invalid', 'thread', 'thread-invalid-time', 2,
           'thread.activity-appended', '2026-01-02', 'command-time-invalid', NULL, NULL, 'server',
           '{"threadId":"thread-invalid-time","activity":{"kind":"provider.thread.goal.updated","payload":{"goal":{"objective":"Invalid time","status":"active","tokensUsed":5,"timeUsedSeconds":1.5}}}}', '{}'),
          ('event-budget-old', 'thread', 'thread-invalid-budget', 1,
           'thread.activity-appended', '2026-01-01', 'command-budget-old', NULL, NULL, 'server',
           '{"threadId":"thread-invalid-budget","activity":{"kind":"provider.thread.goal.updated","payload":{"goal":{"objective":"Budget fallback","status":"usageLimited","tokensUsed":6,"timeUsedSeconds":7,"tokenBudget":null}}}}', '{}'),
          ('event-budget-invalid', 'thread', 'thread-invalid-budget', 2,
           'thread.activity-appended', '2026-01-02', 'command-budget-invalid', NULL, NULL, 'server',
           '{"threadId":"thread-invalid-budget","activity":{"kind":"provider.thread.goal.updated","payload":{"goal":{"objective":"Invalid budget","status":"active","tokensUsed":6,"timeUsedSeconds":7,"tokenBudget":"1000"}}}}', '{}'),
          ('event-cleared-old', 'thread', 'thread-cleared', 1,
           'thread.activity-appended', '2026-01-01', 'command-cleared-old', NULL, NULL, 'server',
           '{"threadId":"thread-cleared","activity":{"kind":"provider.thread.goal.updated","payload":{"goal":{"objective":"Clear me","status":"complete","tokensUsed":7,"timeUsedSeconds":8}}}}', '{}'),
          ('event-cleared-new', 'thread', 'thread-cleared', 2,
           'thread.activity-appended', '2026-01-02', 'command-cleared-new', NULL, NULL, 'server',
           '{"threadId":"thread-cleared","activity":{"kind":"provider.thread.goal.synced","payload":{"goal":null}}}', '{}'),
          ('event-clear-fallback-old', 'thread', 'thread-clear-fallback', 1,
           'thread.activity-appended', '2026-01-01', 'command-clear-fallback-old', NULL, NULL, 'server',
           '{"threadId":"thread-clear-fallback","activity":{"kind":"provider.thread.goal.synced","payload":{"goal":null}}}', '{}'),
          ('event-clear-fallback-invalid', 'thread', 'thread-clear-fallback', 2,
           'thread.activity-appended', '2026-01-02', 'command-clear-fallback-invalid', NULL, NULL, 'server',
           '{"threadId":"thread-clear-fallback","activity":{"kind":"provider.thread.goal.synced","payload":{"goal":{"objective":"Invalid after clear","status":"active","tokensUsed":6,"timeUsedSeconds":7,"tokenBudget":-1}}}}', '{}'),
          ('event-rpc-race-request', 'thread', 'thread-rpc-race', 1,
           'thread.goal-requested', '2026-01-01T00:00:01.000Z', 'command-rpc-race-request', NULL, NULL, 'user',
           '{"threadId":"thread-rpc-race","operation":"get","createdAt":"2026-01-01T00:00:01.000Z"}', '{}'),
          ('event-rpc-race-sync', 'thread', 'thread-rpc-race', 2,
           'thread.activity-appended', '2026-01-01T00:00:02.000Z', 'command-rpc-race-sync', NULL, NULL, 'server',
           '{"threadId":"thread-rpc-race","activity":{"kind":"provider.thread.goal.synced","createdAt":"2026-01-01T00:00:02.000Z","payload":{"goal":{"objective":"Fresh synced goal","status":"active","tokensUsed":8,"timeUsedSeconds":9}}}}', '{}'),
          ('event-rpc-race-receipt', 'thread', 'thread-rpc-race', 3,
           'thread.activity-appended', '2026-01-01T00:00:03.000Z', 'command-rpc-race-receipt', NULL, NULL, 'server',
           '{"threadId":"thread-rpc-race","activity":{"kind":"provider.thread.goal.read","createdAt":"2026-01-01T00:00:03.000Z","payload":{"requestStartedAt":"2026-01-01T00:00:01.000Z","goal":{"objective":"Stale RPC goal","status":"paused","tokensUsed":1,"timeUsedSeconds":2}}}}', '{}')
      `;

      yield* runMigrations({ toMigrationInclusive: 41 });
      const rows = yield* sql<{ readonly threadId: string; readonly goal: string | null }>`
        SELECT thread_id AS "threadId", goal_json AS goal
        FROM projection_threads
        ORDER BY thread_id
      `;
      assert.deepStrictEqual(
        rows.map((row) => ({
          threadId: row.threadId,
          goal: decodeProjectedGoal(row.goal),
        })),
        [
          { threadId: "thread-clear-fallback", goal: null },
          { threadId: "thread-cleared", goal: null },
          {
            threadId: "thread-invalid-budget",
            goal: {
              objective: "Budget fallback",
              status: "usageLimited",
              tokensUsed: 6,
              timeUsedSeconds: 7,
              tokenBudget: null,
            },
          },
          {
            threadId: "thread-invalid-objective",
            goal: {
              objective: "Objective fallback",
              status: "active",
              tokensUsed: 2,
              timeUsedSeconds: 3,
            },
          },
          {
            threadId: "thread-invalid-status",
            goal: {
              objective: "Status fallback",
              status: "paused",
              tokensUsed: 3,
              timeUsedSeconds: 4,
            },
          },
          {
            threadId: "thread-invalid-time",
            goal: {
              objective: "Time fallback",
              status: "budgetLimited",
              tokensUsed: 5,
              timeUsedSeconds: 6,
            },
          },
          {
            threadId: "thread-invalid-tokens",
            goal: {
              objective: "Tokens fallback",
              status: "blocked",
              tokensUsed: 4,
              timeUsedSeconds: 5,
            },
          },
          {
            threadId: "thread-rpc-race",
            goal: {
              objective: "Fresh synced goal",
              status: "active",
              tokensUsed: 8,
              timeUsedSeconds: 9,
            },
          },
          {
            threadId: "thread-valid-latest",
            goal: {
              objective: "Latest valid",
              status: "active",
              tokensUsed: 5,
              timeUsedSeconds: 3,
              tokenBudget: 1000,
            },
          },
        ],
      );
    }),
  );
});
