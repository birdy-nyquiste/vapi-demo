import { randomUUID } from "node:crypto";
import type { Config } from "../config.js";
import type { Database } from "../storage/db.js";
import { createRun, getRun } from "../storage/store.js";
import { handleWebhook } from "../vapi/webhook.js";
import { scenarioById } from "./scenarios.js";
import type { Direction } from "../../shared/types.js";
export async function simulate(
  db: Database,
  c: Config,
  scenarioId: string,
  direction: Direction,
  failure: boolean,
) {
  if (c.mode !== "mock") throw new Error("Simulation disabled");
  const s = scenarioById(scenarioId);
  const sample =
    direction === "outbound" ? (s.outboundSample ?? s.sample) : s.sample;
  const id = randomUUID();
  const callId = `mock-${randomUUID()}`;
  const config = { ...c, assistantMap: { [s.id]: `mock-${s.id}` } };
  await createRun(db, {
    id,
    callId,
    scenarioId: s.id,
    scenarioVersion: s.version,
    direction,
    mode: "mock",
    status: "queued",
    context: s.context[direction],
  });
  const call = {
    id: callId,
    assistantId: `mock-${s.id}`,
    type: direction === "inbound" ? "inboundPhoneCall" : "outboundPhoneCall",
  };
  const deliver = (data: Record<string, unknown>) =>
    handleWebhook(db, config, { message: { ...data, call } });
  await deliver({ type: "status-update", status: "in-progress" });
  await deliver({
    type: "transcript",
    role: "assistant",
    transcriptType: "final",
    transcript: s.greeting[direction],
  });
  await deliver({
    type: "transcript",
    role: "user",
    transcriptType: "final",
    transcript: sample.user,
  });
  await deliver({
    type: "tool-calls",
    toolCallList: [
      {
        id: `tool-${id}`,
        function: {
          name: sample.name,
          arguments: failure ? {} : sample.args,
        },
      },
    ],
  });
  await deliver({
    type: "end-of-call-report",
    endedReason: "simulation-complete",
  });
  return getRun(db, id);
}
