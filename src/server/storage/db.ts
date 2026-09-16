import { Pool } from "pg";
import { mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import type { Config } from "../config.js";
export interface Sql {
  query<T = Record<string, unknown>>(
    text: string,
    values?: unknown[],
  ): Promise<{ rows: T[] }>;
}
export interface Database extends Sql {
  transaction<T>(fn: (tx: Sql) => Promise<T>): Promise<T>;
  close(): Promise<void>;
  kind: string;
}
export async function openDatabase(
  config: Pick<Config, "databaseUrl" | "mode" | "deployed">,
  localPath = ".local/postgres",
): Promise<Database> {
  if (config.databaseUrl) {
    const pool = new Pool({
      connectionString: config.databaseUrl,
      max: 3,
      connectionTimeoutMillis: 5000,
      idleTimeoutMillis: 10000,
    });
    return {
      kind: "Postgres",
      query: async <T>(text: string, values?: unknown[]) => ({
        rows: (await pool.query(text, values)).rows as T[],
      }),
      transaction: async (fn) => {
        const client = await pool.connect();
        try {
          await client.query("BEGIN");
          const result = await fn({
            query: async <T>(text: string, values?: unknown[]) => ({
              rows: (await client.query(text, values)).rows as T[],
            }),
          });
          await client.query("COMMIT");
          return result;
        } catch (e) {
          await client.query("ROLLBACK");
          throw e;
        } finally {
          client.release();
        }
      },
      close: () => pool.end(),
    };
  }
  if (config.deployed || config.mode === "live")
    throw new Error("DATABASE_URL is required outside local mock mode");
  const { PGlite } = await import("@electric-sql/pglite");
  if (!localPath.startsWith("memory://"))
    await mkdir(dirname(localPath), { recursive: true });
  const db = new PGlite(localPath);
  return {
    kind: "本地 Postgres · 模拟专用",
    query: (text, values) => db.query(text, values),
    transaction: (fn) =>
      db.transaction((tx) =>
        fn({ query: (text, values) => tx.query(text, values) }),
      ),
    close: () => db.close(),
  };
}
export async function migrate(db: Sql) {
  // Individual statements work with both pg and embedded Postgres.
  for (const statement of [
    `CREATE TABLE IF NOT EXISTS runs (id text PRIMARY KEY, call_id text UNIQUE, scenario_id text NOT NULL, scenario_version text NOT NULL, direction text NOT NULL, mode text NOT NULL, status text NOT NULL, context jsonb NOT NULL DEFAULT '{}', created_at timestamptz NOT NULL DEFAULT now(), ended_reason text)`,
    `CREATE TABLE IF NOT EXISTS events (cursor bigserial PRIMARY KEY, run_id text NOT NULL REFERENCES runs(id), kind text NOT NULL, received_at timestamptz NOT NULL DEFAULT now(), payload jsonb NOT NULL)`,
    `ALTER TABLE runs ADD COLUMN IF NOT EXISTS started_at timestamptz`,
    `ALTER TABLE runs ADD COLUMN IF NOT EXISTS ended_at timestamptz`,
    `CREATE INDEX IF NOT EXISTS events_run_cursor ON events(run_id,cursor)`,
    `CREATE TABLE IF NOT EXISTS tool_executions (run_id text NOT NULL REFERENCES runs(id), id text NOT NULL, name text NOT NULL, args jsonb NOT NULL, result jsonb NOT NULL, ok boolean NOT NULL, duration_ms integer NOT NULL, PRIMARY KEY(run_id,id))`,
  ])
    await db.query(statement);
}
