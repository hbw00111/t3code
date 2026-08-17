import * as NodeWorkerThreads from "node:worker_threads";

import * as NodeServices from "@effect/platform-node/NodeServices";
import { expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as Schema from "effect/Schema";
import * as SqlClient from "effect/unstable/sql/SqlClient";

import { makeSqlitePersistenceLive } from "./Sqlite.ts";

const LOCK_HOLDER_SOURCE = String.raw`
  const { DatabaseSync } = require("node:sqlite");
  const { parentPort, workerData } = require("node:worker_threads");

  const database = new DatabaseSync(workerData.dbPath);
  database.exec("BEGIN IMMEDIATE");
  database.prepare("INSERT INTO busy_timeout_probe (owner) VALUES (?)").run("worker");
  parentPort.postMessage("locked");
  setTimeout(() => {
    database.exec("COMMIT");
    database.close();
  }, 150);
`;

class SqliteLockTestError extends Schema.TaggedErrorClass<SqliteLockTestError>()(
  "SqliteLockTestError",
  { cause: Schema.Defect() },
) {}

const acquireWriteLock = (dbPath: string) =>
  Effect.acquireRelease(
    Effect.tryPromise({
      try: async () => {
        const worker = new NodeWorkerThreads.Worker(LOCK_HOLDER_SOURCE, {
          eval: true,
          workerData: { dbPath },
        });
        const message = await new Promise<unknown>((resolve, reject) => {
          const onMessage = (value: unknown) => {
            worker.off("error", onError);
            resolve(value);
          };
          const onError = (cause: Error) => {
            worker.off("message", onMessage);
            reject(cause);
          };
          worker.once("message", onMessage);
          worker.once("error", onError);
        });
        if (message !== "locked") {
          throw new SqliteLockTestError({
            cause: `Unexpected SQLite lock worker message: ${String(message)}`,
          });
        }
        return worker;
      },
      catch: (cause) => new SqliteLockTestError({ cause }),
    }),
    (worker) => Effect.promise(() => worker.terminate()).pipe(Effect.ignore),
  );

it.layer(NodeServices.layer)("SQLite persistence", (it) => {
  it.effect("waits for a concurrent writer instead of failing with database is locked", () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const tempDir = yield* fs.makeTempDirectoryScoped({ prefix: "t3-sqlite-lock-test-" });
      const dbPath = path.join(tempDir, "state.sqlite");

      yield* Effect.gen(function* () {
        const sql = yield* SqlClient.SqlClient;
        yield* sql.unsafe(
          "CREATE TABLE busy_timeout_probe (id INTEGER PRIMARY KEY, owner TEXT NOT NULL)",
        ).unprepared;

        const timeout = yield* sql.unsafe<{ timeout: number }>("PRAGMA busy_timeout").unprepared;
        expect(timeout[0]?.timeout).toBe(5_000);

        yield* acquireWriteLock(dbPath);
        yield* sql.unsafe("INSERT INTO busy_timeout_probe (owner) VALUES ('main')").unprepared;

        const rows = yield* sql.unsafe<{ owner: string }>(
          "SELECT owner FROM busy_timeout_probe ORDER BY id",
        ).unprepared;
        expect(rows.map((row) => row.owner)).toEqual(["worker", "main"]);
      }).pipe(Effect.provide(makeSqlitePersistenceLive(dbPath)));
    }),
  );
});
