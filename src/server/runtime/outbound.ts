import type { Config } from "../config.js";
import { liveMissing } from "../config.js";
import type { Database } from "../storage/db.js";
import { CallRejected, type CallGateway } from "../vapi/client.js";
import { addEvent, createRun, getRun, updateStatus } from "../storage/store.js";
import { scenarioById } from "./scenarios.js";
export async function startOutbound(
  db: Database,
  c: Config,
  api: CallGateway,
  id: string,
  scenarioId: string,
) {
  const scenario = scenarioById(scenarioId);
  if (c.mode !== "live" || liveMissing(c).length || !c.assistantMap[scenarioId])
    throw new Error("真实外呼尚未配置完成");
  const created = await db.transaction(async (tx) => {
    // Serialize reservations across instances; prevents accidental concurrent demo calls.
    await tx.query("SELECT pg_advisory_xact_lock(771199)");
    const existing = await getRun(tx, id);
    if (existing) return false;
    const pending = await tx.query(
      "SELECT id FROM runs WHERE mode='live' AND direction='outbound' AND status NOT IN ('ended','failed') LIMIT 1",
    );
    if (pending.rows.length)
      throw new Error("已有未结束或结果待核对的外呼，请先核对该通话");
    await createRun(tx, {
      id,
      callId: null,
      scenarioId,
      scenarioVersion: scenario.version,
      direction: "outbound",
      mode: "live",
      status: "creating",
      context: scenario.context.outbound,
    });
    await addEvent(tx, id, "call-requested", { source: "application" });
    return true;
  });
  if (!created) return getRun(db, id);
  try {
    const call = await api.create({
      assistantId: c.assistantMap[scenarioId],
      phoneNumberId: c.phoneNumberId,
      customer: { number: c.testNumber },
      name: `demo:${id}`,
      assistantOverrides: {
        firstMessage: scenario.greeting.outbound,
        variableValues: {
          demoContext: JSON.stringify(scenario.context.outbound),
        },
      },
    });
    await db.transaction(async (tx) => {
      const run = await getRun(tx, id, true);
      if (run?.callId && run.callId !== call.id)
        throw new Error("Call ID mismatch");
      await tx.query("UPDATE runs SET call_id=$2 WHERE id=$1", [id, call.id]);
      await updateStatus(tx, id, "queued");
      await addEvent(tx, id, "call-created", { callId: call.id });
    });
  } catch (error) {
    // Never retry a paid call after a timeout/ambiguous provider or database failure.
    await db.transaction(async (tx) => {
      await getRun(tx, id, true);
      const rejected = error instanceof CallRejected;
      await updateStatus(tx, id, rejected ? "failed" : "outcome-unknown");
      await addEvent(
        tx,
        id,
        rejected ? "call-rejected" : "call-outcome-unknown",
        {
          message: rejected
            ? error.message
            : "外呼创建结果待核对。不会自动重复拨号；请查看 Vapi Dashboard。",
        },
      );
    });
  }
  return getRun(db, id);
}
