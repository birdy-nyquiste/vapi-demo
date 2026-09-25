import { beforeAll, afterAll, describe, it, expect } from "vitest";
import supertest from "supertest";
import { randomUUID } from "node:crypto";
import {
  openDatabase,
  migrate,
  type Database,
} from "../src/server/storage/db.js";
import {
  getRun,
  byCallId,
  eventsAfter,
  toolsForRun,
} from "../src/server/storage/store.js";
import { handleWebhook } from "../src/server/vapi/webhook.js";
import { createApp } from "../src/server/app.js";
import { simulate } from "../src/server/runtime/simulate.js";
import type { Config } from "../src/server/config.js";
let db: Database;
const c: Config = {
  mode: "mock",
  deployed: false,
  assistantMap: {
    echo_demo: "echo-assistant",
    nyquiste_bundle: "bundle-assistant",
  },
  inboundScenario: "echo_demo",
};
const incoming = (
  id: string,
  data: Record<string, unknown>,
  assistantId = "echo-assistant",
) => ({
  message: { call: { id, assistantId, type: "inboundPhoneCall" }, ...data },
});
beforeAll(async () => {
  db = await openDatabase(c, "memory://");
  await migrate(db);
}, 30000);
afterAll(() => db.close());
describe("webhook runtime", () => {
  it("stores only final transcripts", async () => {
    const id = randomUUID();
    for (const [transcriptType, transcript] of [
      ["partial", "您好"],
      ["partial", "您好，请问"],
      ["final", "您好，请问需要什么帮助？"],
    ]) {
      await handleWebhook(
        db,
        c,
        incoming(id, {
          type: "transcript",
          role: "assistant",
          transcriptType,
          transcript,
        }),
      );
    }
    const events = await eventsAfter(db, (await byCallId(db, id)).id, 0);
    expect(events.map((e) => e.payload.transcript)).toEqual([
      "您好，请问需要什么帮助？",
    ]);
  });
  it("persists a tool once across concurrent duplicate deliveries", async () => {
    const id = randomUUID();
    const body = incoming(id, {
      type: "tool-calls",
      toolCallList: [
        {
          id: "note-1",
          function: {
            name: "save_demo_note",
            arguments: JSON.stringify({ note: "hello" }),
          },
        },
      ],
    });
    const [a, b] = await Promise.all([
      handleWebhook(db, c, body),
      handleWebhook(db, c, body),
    ]);
    expect(JSON.parse("results" in a ? a.results![0].result : "{}")).toEqual(
      JSON.parse("results" in b ? b.results![0].result : "{}"),
    );
    const r = await byCallId(db, id);
    expect(await toolsForRun(db, r.id)).toHaveLength(1);
    expect(await eventsAfter(db, r.id, 0)).toHaveLength(1);
  });
  it("returns failure for invalid args and unknown tools without saving a success", async () => {
    const id = randomUUID();
    await handleWebhook(
      db,
      c,
      incoming(id, {
        type: "tool-calls",
        toolCallList: [
          { id: "bad", name: "save_demo_note", parameters: {} },
          { id: "unknown", name: "delete_everything", parameters: {} },
        ],
      }),
    );
    const tools = await toolsForRun(db, (await byCallId(db, id)).id);
    expect(tools.every((t) => !t.ok)).toBe(true);
    expect(
      tools.every((t) => (t.result as { saved: boolean }).saved === false),
    ).toBe(true);
  });
  it("keeps terminal state when an earlier status arrives later", async () => {
    const id = randomUUID();
    await handleWebhook(
      db,
      c,
      incoming(id, {
        type: "end-of-call-report",
        endedReason: "customer-ended-call",
      }),
    );
    await handleWebhook(
      db,
      c,
      incoming(id, { type: "status-update", status: "in-progress" }),
    );
    const run = await byCallId(db, id);
    expect(run.status).toBe("ended");
    expect(run.endedReason).toBe("customer-ended-call");
  });
  it("rejects unregistered assistants before creating a run", async () => {
    const id = randomUUID();
    await expect(
      handleWebhook(
        db,
        c,
        incoming(id, { type: "status-update", status: "ringing" }, "foreign"),
      ),
    ).rejects.toThrow();
    expect(await byCallId(db, id)).toBeUndefined();
  });
  it("uses the same runtime with another registered scenario", async () => {
    const run = await simulate(db, c, "nyquiste_bundle", "inbound", false);
    const tools = await toolsForRun(db, run!.id);
    expect((tools[0].result as { amount: number }).amount).toBe(2098);
    expect((tools[0].result as { currencyCode: string }).currencyCode).toBe("USD");
    expect(run?.mode).toBe("mock");
    expect((await getRun(db, run!.id)).status).toBe("ended");
  });
  it("does not store secrets from a raw Vapi Call object", async () => {
    const id = randomUUID();
    const body = incoming(id, { type: "status-update", status: "ringing" });
    Object.assign(body.message.call, {
      credentials: { secret: "DO_NOT_STORE" },
    });
    await handleWebhook(db, c, body);
    const events = await eventsAfter(db, (await byCallId(db, id)).id, 0);
    expect(JSON.stringify(events)).not.toContain("DO_NOT_STORE");
  });
});
describe("HTTP boundaries", () => {
  it("requires authentication when deployed and protects webhook independently", async () => {
    const app = createApp(db, {
      ...c,
      deployed: true,
      mode: "live",
      accessToken: "test-access",
      webhookSecret: "test-webhook",
    });
    await supertest(app).get("/api/runs").expect(401);
    await supertest(app).post("/api/vapi/webhook").send({}).expect(401);
    const agent = supertest.agent(app);
    await agent.post("/api/session").send({ token: "wrong" }).expect(401);
  });
  it("provides a complete local mock API", async () => {
    const app = createApp(db, c);
    const r = await supertest(app)
      .post("/api/simulations")
      .send({ scenarioId: "echo_demo", direction: "outbound", failure: true })
      .expect(200);
    expect(r.body.status).toBe("ended");
    const d = await supertest(app).get(`/api/runs/${r.body.id}`).expect(200);
    expect(d.body.tools[0].ok).toBe(false);
    await supertest(app)
      .get(`/api/runs/${r.body.id}/events?after=-1`)
      .expect(400);
  });
  it("blocks real calls in mock mode and rejects unexpected destination input", async () => {
    const app = createApp(db, c);
    await supertest(app)
      .post("/api/calls")
      .send({
        requestId: randomUUID(),
        scenarioId: "echo_demo",
        number: "+15555555555",
      })
      .expect(400);
    await supertest(app)
      .post("/api/calls")
      .send({ requestId: randomUUID(), scenarioId: "echo_demo" })
      .expect(500);
  });
});

describe("outbound lifecycle", () => {
  const live: Config = {
    ...c,
    mode: "live",
    databaseUrl: "configured",
    accessToken: "a",
    apiKey: "b",
    webhookSecret: "c",
    phoneNumberId: "number",
    testNumber: "+12025550123",
  };
  it("creates exactly one call when a request ID is replayed", async () => {
    const { startOutbound } = await import("../src/server/runtime/outbound.js");
    let count = 0;
    const id = randomUUID();
    const callId = randomUUID();
    const api = {
      create: async () => {
        count++;
        return { id: callId };
      },
      get: async () => ({ id: callId }),
    };
    const r = await startOutbound(db, live, api, id, "echo_demo");
    expect(r?.callId).toBe(callId);
    await startOutbound(db, live, api, id, "echo_demo");
    expect(count).toBe(1);
    await handleWebhook(db, live, {
      message: {
        type: "end-of-call-report",
        endedReason: "customer-ended-call",
        call: {
          id: callId,
          assistantId: "echo-assistant",
          type: "outboundPhoneCall",
          name: `demo:${id}`,
        },
      },
    });
  });
  it("records a definitive rejection as failed so configuration can be corrected", async () => {
    const { startOutbound } = await import("../src/server/runtime/outbound.js");
    const { CallRejected } = await import("../src/server/vapi/client.js");
    const api = {
      create: async () => {
        throw new CallRejected("rejected");
      },
      get: async () => ({ id: "none" }),
    };
    const first = await startOutbound(db, live, api, randomUUID(), "echo_demo");
    expect(first?.status).toBe("failed");
    const next = await startOutbound(db, live, api, randomUUID(), "echo_demo");
    expect(next?.status).toBe("failed");
  });
  it("does not regress a callback that arrives before call creation returns", async () => {
    const { startOutbound } = await import("../src/server/runtime/outbound.js");
    const id = randomUUID();
    const callId = randomUUID();
    const api = {
      create: async () => {
        await handleWebhook(db, live, {
          message: {
            type: "end-of-call-report",
            endedReason: "customer-ended-call",
            call: {
              id: callId,
              assistantId: "echo-assistant",
              type: "outboundPhoneCall",
              name: `demo:${id}`,
            },
          },
        });
        return { id: callId };
      },
      get: async () => ({ id: callId }),
    };
    const run = await startOutbound(db, live, api, id, "echo_demo");
    expect(run?.status).toBe("ended");
    expect(run?.callId).toBe(callId);
  });
  it("keeps uncertainty after a timeout and blocks another dial", async () => {
    const { startOutbound } = await import("../src/server/runtime/outbound.js");
    let count = 0;
    const id = randomUUID();
    const api = {
      create: async () => {
        count++;
        throw new Error("timeout");
      },
      get: async () => ({ id: "none" }),
    };
    const r = await startOutbound(db, live, api, id, "echo_demo");
    expect(r?.status).toBe("outcome-unknown");
    await startOutbound(db, live, api, id, "echo_demo");
    expect(count).toBe(1);
    await expect(
      startOutbound(db, live, api, randomUUID(), "echo_demo"),
    ).rejects.toThrow("核对");
  });
});

describe("replacement scenario contract", () => {
  it("awaits asynchronous tools and catches asynchronous failures", async () => {
    const { echo } = await import("../src/scenarios/echo.js");
    const original = echo.tools[0].execute;
    try {
      echo.tools[0].execute = async () => ({ saved: true, asynchronous: true });
      const good = await simulate(db, c, "echo_demo", "inbound", false);
      expect((await toolsForRun(db, good!.id))[0].result).toEqual({
        saved: true,
        asynchronous: true,
      });
      echo.tools[0].execute = async () => {
        throw new Error("lookup failed");
      };
      const bad = await simulate(db, c, "echo_demo", "inbound", false);
      expect((await toolsForRun(db, bad!.id))[0].ok).toBe(false);
    } finally {
      echo.tools[0].execute = original;
    }
  });
  it("exports inbound context and outbound variable without credentials", async () => {
    const { assistantConfig } = await import("../src/server/vapi/assistant.js");
    const { echo } = await import("../src/scenarios/echo.js");
    const config = assistantConfig(
      {
        ...echo,
        context: { inbound: { topic: "inbound reference" }, outbound: {} },
      },
      {
        url: "https://example.com/api/vapi/webhook",
        credentialId: "credential-id",
      },
      { VAPI_API_KEY: "hidden-secret" },
    );
    const prompt = config.model.messages[0].content;
    expect(prompt).toContain("inbound reference");
    expect(prompt).toContain("{{demoContext}}");
    expect(config.serverMessages).toContain(
      'transcript[transcriptType="final"]',
    );
    expect(JSON.stringify(config)).not.toContain("hidden-secret");
  });
  it("persists provider timestamps without confusing receipt time with call time", async () => {
    const id = randomUUID();
    const body = incoming(id, {
      type: "end-of-call-report",
      endedReason: "customer-ended-call",
    });
    Object.assign(body.message.call, {
      startedAt: "2026-09-16T12:00:00.000Z",
      endedAt: "2026-09-16T12:01:00.000Z",
    });
    await handleWebhook(db, c, body);
    const run = await byCallId(db, id);
    expect(new Date(run.startedAt!).toISOString()).toBe(
      "2026-09-16T12:00:00.000Z",
    );
    expect(new Date(run.endedAt!).toISOString()).toBe(
      "2026-09-16T12:01:00.000Z",
    );
  });
});

describe("Vapi HTTP adapter", () => {
  it("sends the supported call name field and never retries a rejected call", async () => {
    const { gateway, CallRejected } =
      await import("../src/server/vapi/client.js");
    let count = 0;
    let body: Record<string, unknown> = {};
    const api = gateway(
      { ...c, apiKey: "not-a-real-key" },
      async (_url, options) => {
        count++;
        body = JSON.parse(String(options?.body));
        return new Response(JSON.stringify({ message: "Bad request" }), {
          status: 400,
          headers: { "content-type": "application/json" },
        });
      },
    );
    await expect(
      api.create({ name: "demo:test-id", assistantId: "test-assistant" }),
    ).rejects.toBeInstanceOf(CallRejected);
    expect(count).toBe(1);
    expect(body.name).toBe("demo:test-id");
  });
});
