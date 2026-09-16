import type {
  Run,
  RunEvent,
  RunStatus,
  ToolExecution,
} from "../../shared/types.js";
import type { Sql } from "./db.js";
const runColumns = `id,call_id AS "callId",scenario_id AS "scenarioId",scenario_version AS "scenarioVersion",direction,mode,status,context,created_at AS "createdAt",started_at AS "startedAt",ended_at AS "endedAt",ended_reason AS "endedReason"`;
export async function getRun(db: Sql, id: string, lock = false) {
  return (
    await db.query<Run>(
      `SELECT ${runColumns} FROM runs WHERE id=$1 ${lock ? "FOR UPDATE" : ""}`,
      [id],
    )
  ).rows[0];
}
export async function byCallId(db: Sql, id: string) {
  return (
    await db.query<Run>(`SELECT ${runColumns} FROM runs WHERE call_id=$1`, [id])
  ).rows[0];
}
export async function listRuns(db: Sql) {
  return (
    await db.query<Run>(
      `SELECT ${runColumns} FROM runs ORDER BY created_at DESC LIMIT 50`,
    )
  ).rows;
}
export async function createRun(
  db: Sql,
  r: Omit<Run, "createdAt" | "endedReason" | "startedAt" | "endedAt">,
) {
  await db.query(
    `INSERT INTO runs(id,call_id,scenario_id,scenario_version,direction,mode,status,context) VALUES($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT DO NOTHING`,
    [
      r.id,
      r.callId,
      r.scenarioId,
      r.scenarioVersion,
      r.direction,
      r.mode,
      r.status,
      JSON.stringify(r.context),
    ],
  );
}
export async function addEvent(
  db: Sql,
  runId: string,
  kind: string,
  payload: Record<string, unknown>,
) {
  await db.query("INSERT INTO events(run_id,kind,payload) VALUES($1,$2,$3)", [
    runId,
    kind,
    JSON.stringify(payload),
  ]);
}
export async function eventsAfter(db: Sql, runId: string, after: number) {
  return (
    await db.query<RunEvent>(
      `SELECT cursor::float8 AS cursor,run_id AS "runId",kind,received_at AS "receivedAt",payload FROM events WHERE run_id=$1 AND cursor>$2 ORDER BY cursor LIMIT 200`,
      [runId, after],
    )
  ).rows;
}
export async function toolsForRun(db: Sql, id: string) {
  return (
    await db.query<ToolExecution>(
      `SELECT id,name,args,result,ok,duration_ms AS "durationMs" FROM tool_executions WHERE run_id=$1 ORDER BY id`,
      [id],
    )
  ).rows;
}
export async function updateStatus(
  db: Sql,
  id: string,
  next: RunStatus,
  reason?: string,
) {
  // Called with the run row locked. Terminal states never regress; a call report can enrich the reason.
  const r = await getRun(db, id);
  if (!r) return;
  const rank: Record<RunStatus, number> = {
    creating: 0,
    "outcome-unknown": 0,
    queued: 1,
    ringing: 2,
    "in-progress": 3,
    forwarding: 4,
    ended: 5,
    failed: 5,
  };
  if (
    rank[next] >= rank[r.status] &&
    !(rank[r.status] === 5 && next !== r.status)
  )
    await db.query("UPDATE runs SET status=$2 WHERE id=$1", [id, next]);
  if (reason)
    await db.query("UPDATE runs SET ended_reason=$2 WHERE id=$1", [id, reason]);
}
