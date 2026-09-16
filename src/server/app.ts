import express from "express";
import { z, ZodError } from "zod";
import type { Config } from "./config.js";
import { liveMissing } from "./config.js";
import type { Database } from "./storage/db.js";
import {
  eventsAfter,
  getRun,
  listRuns,
  toolsForRun,
  addEvent,
  updateStatus,
} from "./storage/store.js";
import { scenarios } from "./runtime/scenarios.js";
import { handleWebhook } from "./vapi/webhook.js";
import { startOutbound } from "./runtime/outbound.js";
import { simulate } from "./runtime/simulate.js";
import { gateway, type CallGateway } from "./vapi/client.js";
import { authorized, equalSecret, localOpen, session } from "./auth.js";
export function createApp(db: Database, c: Config, api?: CallGateway) {
  const app = express();
  app.disable("x-powered-by");
  app.set("trust proxy", 1);
  app.use("/api", (_req, res, next) => {
    res.set("Cache-Control", "no-store");
    res.set("X-Content-Type-Options", "nosniff");
    next();
  });
  app.use(express.json({ limit: "512kb" }));
  app.get("/api/health", (_req, res) => res.json({ ok: true }));
  app.post("/api/vapi/webhook", async (req, res) => {
    if (
      c.mode !== "live" ||
      !c.webhookSecret ||
      !equalSecret(req.get("authorization") || "", `Bearer ${c.webhookSecret}`)
    ) {
      res.status(401).json({ error: "Webhook authentication failed" });
      return;
    }
    res.json(await handleWebhook(db, c, req.body));
  });
  app.get("/api/session", (req, res) =>
    res.json({
      authenticated: authorized(c, req.get("cookie")),
      local: localOpen(c),
    }),
  );
  app.post("/api/session", (req, res) => {
    if (
      !c.accessToken ||
      typeof req.body?.token !== "string" ||
      !equalSecret(req.body.token, c.accessToken)
    ) {
      res.status(401).json({ error: "访问口令不正确" });
      return;
    }
    res.cookie("demo_session", session(c), {
      httpOnly: true,
      secure: c.deployed,
      sameSite: "strict",
      maxAge: 8 * 60 * 60 * 1000,
      path: "/",
    });
    res.json({ ok: true });
  });
  app.use("/api", (req, res, next) => {
    if (!authorized(c, req.get("cookie"))) {
      res.status(401).json({ error: "请先输入演示访问口令" });
      return;
    }
    // JSON-only mutations + Strict cookies prevent cross-site form submissions.
    if (req.method === "POST" && !req.is("application/json")) {
      res.status(415).json({ error: "Expected JSON" });
      return;
    }
    next();
  });
  app.get("/api/scenarios", (_req, res) =>
    res.json({
      mode: c.mode,
      storage: db.kind,
      inboundNumber: c.inboundNumber || null,
      testNumber: c.testNumber ? `+1 ••• ••• ${c.testNumber.slice(-4)}` : null,
      inboundScenario: c.inboundScenario,
      liveMissing: liveMissing(c),
      scenarios: scenarios.map((s) => ({
        id: s.id,
        version: s.version,
        name: s.name,
        description: s.description,
        tools: s.tools.map((t) => ({
          name: t.name,
          description: t.description,
        })),
        outboundReady: !!c.assistantMap[s.id],
      })),
    }),
  );
  app.get("/api/runs", async (_req, res) => res.json(await listRuns(db)));
  app.get("/api/runs/:id", async (req, res) => {
    const run = await getRun(db, req.params.id);
    if (!run) {
      res.status(404).json({ error: "通话不存在" });
      return;
    }
    res.json({ run, tools: await toolsForRun(db, run.id) });
  });
  app.get("/api/runs/:id/events", async (req, res) => {
    const after = z.coerce
      .number()
      .int()
      .min(0)
      .max(Number.MAX_SAFE_INTEGER)
      .parse(req.query.after ?? 0);
    res.json(await eventsAfter(db, req.params.id, after));
  });
  app.post("/api/calls", async (req, res) => {
    const body = z
      .object({
        requestId: z.uuid(),
        scenarioId: z
          .string()
          .refine(
            (id) => scenarios.some((s) => s.id === id),
            "Unknown scenario",
          ),
      })
      .strict()
      .parse(req.body);
    res.json(
      await startOutbound(
        db,
        c,
        api ?? gateway(c),
        body.requestId,
        body.scenarioId,
      ),
    );
  });
  app.post("/api/simulations", async (req, res) => {
    const body = z
      .object({
        scenarioId: z.string(),
        direction: z.enum(["inbound", "outbound"]),
        failure: z.boolean().default(false),
      })
      .strict()
      .parse(req.body);
    res.json(
      await simulate(db, c, body.scenarioId, body.direction, body.failure),
    );
  });
  app.post("/api/runs/:id/reconcile", async (req, res) => {
    if (c.mode !== "live") {
      res.status(409).json({ error: "仅适用于真实通话" });
      return;
    }
    const { callId } = z
      .object({ callId: z.string().min(1).max(100) })
      .strict()
      .parse(req.body);
    const call = await (api ?? gateway(c)).get(callId);
    const run = await getRun(db, req.params.id);
    if (
      !run ||
      run.mode !== "live" ||
      run.direction !== "outbound" ||
      call.name !== `demo:${run.id}` ||
      c.assistantMap[run.scenarioId] !== call.assistantId
    ) {
      res.status(409).json({ error: "Vapi 通话与此运行不匹配" });
      return;
    }
    await db.transaction(async (tx) => {
      const locked = await getRun(tx, run.id, true);
      if (locked?.callId && locked.callId !== callId)
        throw new Error("Call ID mismatch");
      await tx.query("UPDATE runs SET call_id=$2 WHERE id=$1", [
        run.id,
        callId,
      ]);
      await updateStatus(
        tx,
        run.id,
        (["queued", "ringing", "in-progress", "forwarding", "ended"].includes(
          call.status || "",
        )
          ? call.status
          : "queued") as import("../shared/types.js").RunStatus,
        call.endedReason,
      );
      await addEvent(tx, run.id, "call-reconciled", { callId });
    });
    res.json(await getRun(db, run.id));
  });
  app.use("/api", (_req, res) => res.status(404).json({ error: "接口不存在" }));
  const errorHandler: express.ErrorRequestHandler = (
    error,
    _req,
    res,
    _next,
  ) => {
    if (error instanceof ZodError) {
      res.status(400).json({
        error: "请求参数无效",
        details: error.issues.map((i) => i.message),
      });
      return;
    }
    // Provider errors can include credentials/request headers. Do not serialize them.
    console.error(
      "Request failed:",
      error instanceof Error ? error.name : "UnknownError",
    );
    res.status(500).json({
      error: "操作未完成，请检查配置或服务端日志；真实外呼请先核对通话记录。",
    });
  };
  app.use(errorHandler);
  return app;
}
