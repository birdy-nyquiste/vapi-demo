import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { Config } from "../config.js";
import type { Database } from "../storage/db.js";
import {
  addEvent,
  byCallId,
  createRun,
  getRun,
  updateStatus,
} from "../storage/store.js";
import { executeTool } from "../runtime/tools.js";
import { scenarioById } from "../runtime/scenarios.js";
import type { RunStatus } from "../../shared/types.js";
const toolCall = z.object({
  id: z.string().min(1).max(200),
  name: z.string().optional(),
  parameters: z.unknown().optional(),
  function: z.object({ name: z.string(), arguments: z.unknown() }).optional(),
});
const envelope = z.object({
  message: z
    .object({
      type: z.string(),
      call: z.object({
        id: z.string().min(1),
        assistantId: z.string().optional(),
        type: z.enum(["inboundPhoneCall", "outboundPhoneCall"]),
        name: z.string().optional(),
        startedAt: z.iso.datetime().nullish(),
        endedAt: z.iso.datetime().nullish(),
      }),
      assistant: z.object({ id: z.string() }).optional(),
      status: z.string().optional(),
      endedReason: z.string().optional(),
      timestamp: z.union([z.number(), z.string()]).optional(),
      transcript: z.string().optional(),
      transcriptType: z.string().optional(),
      role: z.string().optional(),
      toolCallList: z.array(toolCall).max(20).optional(),
      toolWithToolCallList: z
        .array(z.object({ name: z.string().optional(), toolCall }))
        .max(20)
        .optional(),
    })
    .passthrough(),
});
export async function handleWebhook(
  db: Database,
  config: Config,
  body: unknown,
) {
  const m = envelope.parse(body).message;
  return db.transaction(async (tx) => {
    const assistantId = m.call.assistantId ?? m.assistant?.id;
    const scenarioId = Object.entries(config.assistantMap).find(
      ([, id]) => id === assistantId,
    )?.[0];
    if (!scenarioId) throw new Error("Webhook assistant is not registered");
    const scenario = scenarioById(scenarioId);
    const direction =
      m.call.type === "inboundPhoneCall" ? "inbound" : "outbound";
    let r = await byCallId(tx, m.call.id);
    if (!r && direction === "outbound") {
      const requestId = m.call.name?.startsWith("demo:")
        ? m.call.name.slice(5)
        : undefined;
      if (typeof requestId !== "string")
        throw new Error("Outbound call has no known run");
      r = await getRun(tx, requestId, true);
      if (
        !r ||
        r.scenarioId !== scenarioId ||
        r.direction !== "outbound" ||
        r.mode !== config.mode ||
        (r.callId && r.callId !== m.call.id)
      )
        throw new Error("Outbound run mismatch");
      await tx.query("UPDATE runs SET call_id=$2 WHERE id=$1", [
        r.id,
        m.call.id,
      ]);
    }
    if (!r) {
      const id = randomUUID();
      await createRun(tx, {
        id,
        callId: m.call.id,
        scenarioId,
        scenarioVersion: scenario.version,
        direction,
        mode: config.mode,
        status: "queued",
        context: scenario.context.inbound,
      });
      r = await byCallId(tx, m.call.id);
    }
    r = await getRun(tx, r!.id, true);
    if (
      !r ||
      r.scenarioId !== scenarioId ||
      r.mode !== config.mode ||
      r.direction !== direction
    )
      throw new Error("Call binding mismatch");
    await tx.query(
      "UPDATE runs SET started_at=COALESCE(started_at,$2::timestamptz), ended_at=COALESCE(ended_at,$3::timestamptz) WHERE id=$1",
      [r.id, m.call.startedAt ?? null, m.call.endedAt ?? null],
    );
    // Retain only display-safe fields; raw Call objects may contain credentials/configuration.
    const payload: Record<string, unknown> = {
      source: config.mode === "mock" ? "simulation" : "vapi",
      timestamp: m.timestamp ?? null,
    };
    if (m.type.startsWith("transcript"))
      Object.assign(payload, {
        role: m.role,
        transcript: m.transcript,
        transcriptType: m.transcriptType ?? "final",
      });
    if (m.status) payload.status = m.status;
    if (m.endedReason) payload.endedReason = m.endedReason;
    if (m.type === "tool-calls") {
      const calls =
        m.toolCallList ??
        m.toolWithToolCallList?.map((t) => ({
          ...t.toolCall,
          name: t.toolCall.name ?? t.name,
        })) ??
        [];
      if (!calls.length) throw new Error("Missing tool calls");
      const results = [];
      for (const call of calls) {
        const name = call.function?.name ?? call.name ?? "";
        let args = call.function?.arguments ?? call.parameters;
        if (typeof args === "string") {
          try {
            args = JSON.parse(args);
          } catch {
            /* validation reports malformed arguments */
          }
        }
        const result = await executeTool(tx, r, call.id, name, args);
        results.push({
          name,
          toolCallId: call.id,
          result: JSON.stringify(result.result),
        });
      }
      return { results };
    }
    // Repeated informational events are harmless; retain delivery history for inspection.
    await addEvent(tx, r.id, m.type, payload);
    const allowed = ["queued", "ringing", "in-progress", "forwarding", "ended"];
    if (m.type === "status-update" && allowed.includes(m.status || ""))
      await updateStatus(tx, r.id, m.status as RunStatus, m.endedReason);
    if (m.type === "end-of-call-report")
      await updateStatus(tx, r.id, "ended", m.endedReason);
    return { ok: true };
  });
}
