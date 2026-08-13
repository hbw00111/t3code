import * as Effect from "effect/Effect";
import * as SqlClient from "effect/unstable/sql/SqlClient";

export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;
  const columns = yield* sql<{ readonly name: string }>`
    PRAGMA table_info(projection_threads)
  `;

  if (!columns.some((column) => column.name === "goal_json")) {
    yield* sql`
      ALTER TABLE projection_threads
      ADD COLUMN goal_json TEXT
    `;
  }

  yield* sql`
    WITH valid_goal_activities AS (
      SELECT
        goal_event.stream_id AS thread_id,
        goal_event.sequence,
        json_extract(goal_event.payload_json, '$.activity.payload.goal') AS goal_json
      FROM orchestration_events AS goal_event
      WHERE goal_event.event_type = 'thread.activity-appended'
        AND json_extract(goal_event.payload_json, '$.activity.kind') IN (
          'provider.thread.goal.updated',
          'provider.thread.goal.read',
          'provider.thread.goal.synced'
        )
        AND NOT EXISTS (
          SELECT 1
          FROM orchestration_events AS synced_event
          WHERE json_type(
              goal_event.payload_json,
              '$.activity.payload.requestStartedAt'
            ) = 'text'
            AND synced_event.stream_id = goal_event.stream_id
            AND synced_event.sequence < goal_event.sequence
            AND synced_event.event_type = 'thread.activity-appended'
            AND json_extract(synced_event.payload_json, '$.activity.kind') =
              'provider.thread.goal.synced'
            AND json_extract(synced_event.payload_json, '$.activity.createdAt') >=
              json_extract(
                goal_event.payload_json,
                '$.activity.payload.requestStartedAt'
              )
        )
        AND (
          json_type(goal_event.payload_json, '$.activity.payload.goal') = 'null'
          OR (
            json_type(goal_event.payload_json, '$.activity.payload.goal') = 'object'
            AND json_type(
              goal_event.payload_json,
              '$.activity.payload.goal.objective'
            ) = 'text'
            AND length(trim(
              json_extract(
                goal_event.payload_json,
                '$.activity.payload.goal.objective'
              ),
              char(
                9, 10, 11, 12, 13, 32, 160, 5760, 8192, 8193, 8194, 8195,
                8196, 8197, 8198, 8199, 8200, 8201, 8202, 8232, 8233, 8239,
                8287, 12288, 65279
              )
            )) > 0
            AND json_type(
              goal_event.payload_json,
              '$.activity.payload.goal.status'
            ) = 'text'
            AND json_extract(
              goal_event.payload_json,
              '$.activity.payload.goal.status'
            ) IN (
              'active',
              'paused',
              'blocked',
              'complete',
              'budgetLimited',
              'usageLimited'
            )
            AND json_type(
              goal_event.payload_json,
              '$.activity.payload.goal.tokensUsed'
            ) IN (
              'integer',
              'real'
            )
            AND json_extract(
              goal_event.payload_json,
              '$.activity.payload.goal.tokensUsed'
            ) BETWEEN
              0 AND 9007199254740991
            AND json_extract(
              goal_event.payload_json,
              '$.activity.payload.goal.tokensUsed'
            ) = CAST(
              json_extract(
                goal_event.payload_json,
                '$.activity.payload.goal.tokensUsed'
              ) AS INTEGER
            )
            AND json_type(
              goal_event.payload_json,
              '$.activity.payload.goal.timeUsedSeconds'
            ) IN (
              'integer',
              'real'
            )
            AND json_extract(
              goal_event.payload_json,
              '$.activity.payload.goal.timeUsedSeconds'
            ) BETWEEN
              0 AND 9007199254740991
            AND json_extract(
              goal_event.payload_json,
              '$.activity.payload.goal.timeUsedSeconds'
            ) = CAST(
              json_extract(
                goal_event.payload_json,
                '$.activity.payload.goal.timeUsedSeconds'
              ) AS INTEGER
            )
            AND (
              json_type(
                goal_event.payload_json,
                '$.activity.payload.goal.tokenBudget'
              ) IS NULL
              OR json_type(
                goal_event.payload_json,
                '$.activity.payload.goal.tokenBudget'
              ) = 'null'
              OR (
                json_type(
                  goal_event.payload_json,
                  '$.activity.payload.goal.tokenBudget'
                ) IN (
                  'integer',
                  'real'
                )
                AND json_extract(
                  goal_event.payload_json,
                  '$.activity.payload.goal.tokenBudget'
                ) BETWEEN
                  0 AND 9007199254740991
                AND json_extract(
                  goal_event.payload_json,
                  '$.activity.payload.goal.tokenBudget'
                ) = CAST(
                  json_extract(
                    goal_event.payload_json,
                    '$.activity.payload.goal.tokenBudget'
                  ) AS INTEGER
                )
              )
            )
          )
        )
    ),
    latest_goal_activities AS (
      SELECT thread_id, goal_json
      FROM (
        SELECT
          thread_id,
          goal_json,
          ROW_NUMBER() OVER (
            PARTITION BY thread_id
            ORDER BY sequence DESC
          ) AS row_number
        FROM valid_goal_activities
      )
      WHERE row_number = 1
    )
    UPDATE projection_threads
    SET goal_json = (
      SELECT latest_goal_activities.goal_json
      FROM latest_goal_activities
      WHERE latest_goal_activities.thread_id = projection_threads.thread_id
    )
    WHERE EXISTS (
      SELECT 1
      FROM latest_goal_activities
      WHERE latest_goal_activities.thread_id = projection_threads.thread_id
    )
  `;
});
