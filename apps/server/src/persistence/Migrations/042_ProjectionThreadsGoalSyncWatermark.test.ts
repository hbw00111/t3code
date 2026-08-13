import { assert, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as SqlClient from "effect/unstable/sql/SqlClient";

import { runMigrations } from "../Migrations.ts";
import * as NodeSqliteClient from "../NodeSqliteClient.ts";

const layer = it.layer(Layer.mergeAll(NodeSqliteClient.layerMemory()));

layer("042_ProjectionThreadsGoalSyncWatermark", (it) => {
  it.effect("adds a durable provider goal sync watermark", () =>
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;
      yield* runMigrations({ toMigrationInclusive: 41 });
      yield* sql`
        INSERT INTO projection_projects (
          project_id, title, workspace_root, scripts_json, created_at, updated_at
        ) VALUES ('project-1', 'Project', '/tmp/project', '[]', '2026-01-01', '2026-01-01')
      `;
      yield* sql`
        INSERT INTO projection_threads (
          thread_id, project_id, title, model_selection_json, runtime_mode,
          interaction_mode, created_at, updated_at
        ) VALUES (
          'thread-1', 'project-1', 'Thread',
          '{"instanceId":"codex","model":"gpt-5.4"}', 'full-access',
          'default', '2026-01-01', '2026-01-01'
        )
      `;
      yield* runMigrations({ toMigrationInclusive: 42 });
      const rows = yield* sql<{ readonly goalSyncedAt: string | null }>`
        SELECT goal_synced_at AS "goalSyncedAt"
        FROM projection_threads
        WHERE thread_id = 'thread-1'
      `;
      assert.deepStrictEqual(rows, [{ goalSyncedAt: null }]);
    }),
  );
});
