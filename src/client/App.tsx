import { useEffect, useRef, useState } from "react";
import {
  ArrowDownLeft,
  ArrowUpRight,
  Phone,
  Play,
  Radio,
  Terminal,
  ChevronRight,
  Check,
  AlertCircle,
  FlaskConical,
  LogIn,
  RefreshCw,
} from "lucide-react";
import type {
  AppConfig,
  Run,
  RunEvent,
  ToolExecution,
  Direction,
} from "../shared/types.js";
import { terminal } from "../shared/types.js";
async function request<T>(url: string, body?: unknown): Promise<T> {
  const res = await fetch(url, {
    credentials: "same-origin",
    ...(body === undefined
      ? {}
      : {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }),
  });
  const data = await res.json().catch(() => {
    throw new Error("后端没有返回有效响应，请确认本地 API 已启动。");
  });
  if (!res.ok) throw new Error(data.error || `请求失败 (${res.status})`);
  return data;
}
const statusLabel: Record<string, string> = {
  creating: "正在创建",
  queued: "等待接通",
  ringing: "响铃中",
  "in-progress": "通话中",
  forwarding: "转接中",
  ended: "已结束",
  failed: "失败",
  "outcome-unknown": "待核对",
};
const time = (value: string) =>
  new Date(value).toLocaleTimeString("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
export function App() {
  const [authenticated, setAuthenticated] = useState<boolean | null>(null);
  const [token, setToken] = useState("");
  const [error, setError] = useState("");
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [runs, setRuns] = useState<Run[]>([]);
  const [selected, setSelected] = useState("");
  const [scenario, setScenario] = useState("echo_demo");
  const [direction, setDirection] = useState<Direction>("inbound");
  const [failure, setFailure] = useState(false);
  const [busy, setBusy] = useState(false);
  const [detail, setDetail] = useState<{
    run: Run;
    tools: ToolExecution[];
  } | null>(null);
  const [events, setEvents] = useState<RunEvent[]>([]);
  const [view, setView] = useState<"timeline" | "transcript">("timeline");
  const [pollError, setPollError] = useState("");
  const cursor = useRef(0);
  const [reconcileId, setReconcileId] = useState("");
  useEffect(() => {
    request<{ authenticated: boolean }>("/api/session")
      .then((s) => setAuthenticated(s.authenticated))
      .catch((e) => setError(e.message));
  }, []);
  useEffect(() => {
    if (!authenticated) return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    const load = async () => {
      try {
        const [c, r] = await Promise.all([
          request<AppConfig>("/api/scenarios"),
          request<Run[]>("/api/runs"),
        ]);
        if (stopped) return;
        setConfig(c);
        setScenario((prev) =>
          c.scenarios.some((s) => s.id === prev)
            ? prev
            : c.scenarios[0]?.id || "",
        );
        setRuns(r);
        setPollError("");
        setSelected((prev) => prev || r[0]?.id || "");
      } catch (e) {
        if (!stopped) setPollError((e as Error).message);
      } finally {
        if (!stopped) timer = setTimeout(load, 2000);
      }
    };
    void load();
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [authenticated]);
  useEffect(() => {
    setDetail(null);
    setEvents([]);
    cursor.current = 0;
    if (!selected) return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    const load = async () => {
      try {
        const [d, ev] = await Promise.all([
          request<{ run: Run; tools: ToolExecution[] }>(
            `/api/runs/${selected}`,
          ),
          request<RunEvent[]>(
            `/api/runs/${selected}/events?after=${cursor.current}`,
          ),
        ]);
        if (stopped) return;
        setDetail(d);
        setEvents((prev) => {
          const ids = new Set(prev.map((e) => e.cursor));
          return [...prev, ...ev.filter((e) => !ids.has(e.cursor))];
        });
        if (ev.length) cursor.current = ev[ev.length - 1]!.cursor;
        setPollError("");
      } catch (e) {
        if (!stopped) setPollError((e as Error).message);
      } finally {
        if (!stopped) timer = setTimeout(load, 2000);
      }
    };
    void load();
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [selected]);
  async function login(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await request("/api/session", { token });
      setToken("");
      setAuthenticated(true);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function start() {
    if (!config) return;
    setBusy(true);
    setError("");
    try {
      let r: Run;
      if (config.mode === "mock")
        r = await request("/api/simulations", {
          scenarioId: scenario,
          direction,
          failure,
        });
      else {
        const saved = sessionStorage.getItem("pending-call");
        const pending = saved
          ? JSON.parse(saved)
          : { requestId: crypto.randomUUID(), scenarioId: scenario };
        sessionStorage.setItem("pending-call", JSON.stringify(pending));
        r = await request("/api/calls", pending);
        sessionStorage.removeItem("pending-call");
      }
      setRuns((prev) => [r, ...prev.filter((x) => x.id !== r.id)]);
      setSelected(r.id);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const activeScenario = config?.scenarios.find((s) => s.id === scenario);
  const liveBlocked =
    config?.mode === "live" &&
    (!!config.liveMissing.length ||
      !activeScenario?.outboundReady ||
      runs.some(
        (r) =>
          r.mode === "live" &&
          r.direction === "outbound" &&
          !terminal(r.status),
      ));
  const visibleEvents = events.filter(
    (e) =>
      !e.kind.startsWith("transcript") ||
      e.payload.transcriptType !== "partial",
  );
  const shown = visibleEvents.filter(
    (e) => view === "timeline" || e.kind.startsWith("transcript"),
  );
  return (
    <div className="app-shell">
      <header>
        <a className="brand" href="/">
          <span className="brand-symbol">
            <Radio size={19} />
          </span>
          nyquiste
          <span className="brand-divider" />
          Voice Lab
        </a>
        <span className="header-note">Vapi + Telnyx</span>
        <span className={`mode ${config?.mode === "live" ? "live" : ""}`}>
          <span />
          {config?.mode === "live" ? "真实电话" : "本地模拟"}
        </span>
      </header>
      {authenticated === false ? (
        <main className="login">
          <LogIn size={28} />
          <h1>进入实验台</h1>
          <p>输入演示访问口令，查看通话与执行记录。</p>
          <form onSubmit={login}>
            <label htmlFor="token">访问口令</label>
            <input
              id="token"
              type="password"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              required
              autoComplete="current-password"
            />
            <button className="primary" disabled={busy}>
              {busy ? "正在验证…" : "进入"}
            </button>
          </form>
          {error && (
            <p role="alert" className="error">
              {error}
            </p>
          )}
        </main>
      ) : (
        <main>
          <div className="page-heading">
            <div>
              <h1>让每一次执行都有迹可循。</h1>
              <p>接入电话，替换场景，观察 Agent 如何完成任务。</p>
            </div>
            <span className="version">FRAMEWORK / 0.1</span>
          </div>
          {(error || pollError) && (
            <div className="error banner" role="alert">
              <AlertCircle size={17} />
              {error || pollError}
            </div>
          )}
          {!config ? (
            <div className="empty">
              {error ? "后端尚未连接。请检查服务配置。" : "正在连接实验台…"}
            </div>
          ) : (
            <>
              <section className="launchpad" aria-label="通话控制">
                <div className="launch-head">
                  <h2>
                    <Phone size={18} />
                    通话入口
                  </h2>
                  <span>
                    {config.mode === "mock"
                      ? "模拟事件经过同一套工具与存储逻辑，不会拨打电话。"
                      : "真实电话通过 Vapi 与 Telnyx 接入。"}
                  </span>
                </div>
                <div className="launch-grid">
                  <div className="inbound">
                    <div className="field-title">
                      <ArrowDownLeft size={16} />
                      拨入
                    </div>
                    <strong className="phone-number">
                      {config.inboundNumber || "号码尚未配置"}
                    </strong>
                    <p>
                      当前场景 ·{" "}
                      {config.scenarios.find(
                        (s) => s.id === config.inboundScenario,
                      )?.name || config.inboundScenario}
                    </p>
                  </div>
                  <div className="launch-form">
                    <label htmlFor="scenario">
                      {config.mode === "mock" ? "实验场景" : "外呼场景"}
                    </label>
                    <select
                      id="scenario"
                      value={scenario}
                      onChange={(e) => setScenario(e.target.value)}
                    >
                      {config.scenarios.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name} · v{s.version}
                        </option>
                      ))}
                    </select>
                    <p>{activeScenario?.description}</p>
                  </div>
                  <div className="launch-action">
                    {config.mode === "mock" ? (
                      <>
                        <div
                          className="direction-picker"
                          aria-label="模拟通话方向"
                        >
                          <button
                            aria-pressed={direction === "inbound"}
                            onClick={() => setDirection("inbound")}
                          >
                            <ArrowDownLeft size={15} />
                            来电
                          </button>
                          <button
                            aria-pressed={direction === "outbound"}
                            onClick={() => setDirection("outbound")}
                          >
                            <ArrowUpRight size={15} />
                            外呼
                          </button>
                        </div>
                        <label className="checkbox">
                          <input
                            type="checkbox"
                            checked={failure}
                            onChange={(e) => setFailure(e.target.checked)}
                          />
                          注入无效工具参数
                        </label>
                      </>
                    ) : (
                      <p>测试手机 · {config.testNumber || "尚未配置"}</p>
                    )}
                    <button
                      className="primary"
                      disabled={busy || !!liveBlocked}
                      onClick={() => void start()}
                    >
                      {busy ? (
                        <RefreshCw size={16} />
                      ) : config.mode === "mock" ? (
                        <Play size={16} />
                      ) : (
                        <Phone size={16} />
                      )}{" "}
                      {busy
                        ? "正在创建…"
                        : config.mode === "mock"
                          ? "运行模拟实验"
                          : "拨打测试电话"}
                    </button>
                  </div>
                </div>
                <div className="launch-footer">
                  <span>
                    <Terminal size={14} />
                    {activeScenario?.tools.length} 个已注册工具
                  </span>
                  <span>{config.storage}</span>
                  {config.mode === "live" && config.liveMissing.length > 0 && (
                    <span className="warning">
                      待配置：{config.liveMissing.join("、")}
                    </span>
                  )}
                  {config.mode === "live" && !activeScenario?.outboundReady && (
                    <span className="warning">
                      此场景尚未绑定 Vapi Assistant
                    </span>
                  )}
                </div>
              </section>
              <section className="workspace">
                <aside className="run-list">
                  <div className="section-heading">
                    <h2>最近通话</h2>
                    <span>{runs.length}</span>
                  </div>
                  {!runs.length ? (
                    <div className="empty small">
                      <FlaskConical size={24} />
                      <p>还没有通话记录</p>
                      <span>运行一次模拟实验，验证事件闭环。</span>
                    </div>
                  ) : (
                    runs.map((r) => (
                      <button
                        key={r.id}
                        className={`run-item ${selected === r.id ? "selected" : ""}`}
                        onClick={() => setSelected(r.id)}
                      >
                        <div className="run-top">
                          <span>
                            {r.direction === "inbound" ? (
                              <ArrowDownLeft size={16} />
                            ) : (
                              <ArrowUpRight size={16} />
                            )}{" "}
                            {r.direction === "inbound" ? "来电" : "外呼"}
                          </span>
                          <time>{time(r.createdAt)}</time>
                        </div>
                        <strong>
                          {config.scenarios.find((s) => s.id === r.scenarioId)
                            ?.name || r.scenarioId}
                        </strong>
                        <div className="run-bottom">
                          <span className={`status ${r.status}`}>
                            {statusLabel[r.status]}
                          </span>
                          <span>
                            {r.mode === "mock" ? "模拟" : "真实"} · v
                            {r.scenarioVersion}
                          </span>
                        </div>
                      </button>
                    ))
                  )}
                </aside>
                <div className="inspector">
                  {!detail ? (
                    <div className="empty inspector-empty">
                      <Radio size={36} />
                      <h2>{selected ? "加载通话…" : "从一通电话开始"}</h2>
                      <p>对话、工具输入和执行结果将在这里出现。</p>
                      <div className="flow">
                        <span>通话</span>
                        <ChevronRight size={16} />
                        <span>工具</span>
                        <ChevronRight size={16} />
                        <span>结果</span>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="detail-heading">
                        <div>
                          <h2>
                            {
                              config.scenarios.find(
                                (s) => s.id === detail.run.scenarioId,
                              )?.name
                            }{" "}
                            <span className={`status ${detail.run.status}`}>
                              {statusLabel[detail.run.status]}
                            </span>
                          </h2>
                          <p className="mono">
                            {detail.run.callId || detail.run.id}
                          </p>
                        </div>
                        <span className="detail-mode">
                          {detail.run.mode === "mock"
                            ? "模拟记录 · 未拨打电话"
                            : "真实电话记录"}
                        </span>
                      </div>
                      {(detail.run.status === "outcome-unknown" ||
                        detail.run.status === "creating") && (
                        <div className="reconcile">
                          <p>
                            外呼结果待核对。请在 Vapi Dashboard 查找 name =
                            demo:运行ID 对应的通话，不要重复拨号。
                          </p>
                          <form
                            onSubmit={async (e) => {
                              e.preventDefault();
                              setBusy(true);
                              try {
                                await request(
                                  `/api/runs/${detail.run.id}/reconcile`,
                                  { callId: reconcileId },
                                );
                                setReconcileId("");
                              } catch (e) {
                                setError((e as Error).message);
                              } finally {
                                setBusy(false);
                              }
                            }}
                          >
                            <input
                              aria-label="Vapi Call ID"
                              placeholder="粘贴 Vapi Call ID"
                              value={reconcileId}
                              onChange={(e) => setReconcileId(e.target.value)}
                              required
                            />
                            <button disabled={busy}>核对关联</button>
                          </form>
                        </div>
                      )}
                      <nav className="tabs" aria-label="通话详情视图">
                        <button
                          aria-pressed={view === "timeline"}
                          onClick={() => setView("timeline")}
                        >
                          执行时间线 <span>{visibleEvents.length}</span>
                        </button>
                        <button
                          aria-pressed={view === "transcript"}
                          onClick={() => setView("transcript")}
                        >
                          对话字幕
                        </button>
                        <span className="poll-status">每 2 秒同步</span>
                      </nav>
                      <div className="event-list">
                        {shown.length === 0 ? (
                          <div className="empty small">
                            等待{view === "transcript" ? "字幕" : "事件"}…
                          </div>
                        ) : (
                          shown.map((e) => (
                            <EventRow key={e.cursor} event={e} />
                          ))
                        )}
                      </div>
                      <details className="context-panel">
                        <summary>本次场景上下文</summary>
                        <pre>{JSON.stringify(detail.run.context, null, 2)}</pre>
                        <p>
                          接通时间：
                          {detail.run.startedAt
                            ? time(detail.run.startedAt)
                            : "未收到供应商时间"}{" "}
                          · 结束时间：
                          {detail.run.endedAt
                            ? time(detail.run.endedAt)
                            : "未收到供应商时间"}
                        </p>
                      </details>
                      <div className="detail-footer">
                        <span>结束原因：{detail.run.endedReason || "—"}</span>
                        <span>
                          {detail.tools.filter((t) => t.ok).length} 次工具成功 ·{" "}
                          {detail.tools.filter((t) => !t.ok).length} 次失败
                        </span>
                      </div>
                    </>
                  )}
                </div>
              </section>
              <footer>
                <span>业务场景可替换，通话与观察框架保持不变。</span>
                <span>工具耗时仅指后端执行时间</span>
              </footer>
            </>
          )}
        </main>
      )}
    </div>
  );
}
function EventRow({ event: e }: { event: RunEvent }) {
  const p = e.payload;
  const tool = e.kind === "tool-result";
  const transcript = e.kind.startsWith("transcript");
  return (
    <article className={`event-row ${tool ? "tool-event" : ""}`}>
      <div
        className={`event-dot ${tool ? (p.ok ? "success" : "failure") : ""}`}
      >
        {tool ? (
          p.ok ? (
            <Check size={13} />
          ) : (
            <AlertCircle size={13} />
          )
        ) : transcript ? (
          <Radio size={12} />
        ) : (
          <span />
        )}
      </div>
      <div className="event-content">
        <div className="event-title">
          <strong>
            {tool
              ? String(p.name)
              : transcript
                ? p.role === "user"
                  ? "用户"
                  : "助手"
                : e.kind === "status-update"
                  ? "通话状态"
                  : e.kind === "end-of-call-report"
                    ? "通话结束"
                    : e.kind}
          </strong>
          <time>{time(e.receivedAt)}</time>
        </div>
        {transcript ? (
          <p className="transcript">
            {String(p.transcript || "")}
          </p>
        ) : tool ? (
          <>
            <p className={p.ok ? "tool-success" : "warning"}>
              {p.ok ? "执行成功，结果已保存" : "执行失败"}
              <span className="duration">{String(p.durationMs)} ms</span>
            </p>
            <details>
              <summary>查看输入与结果</summary>
              <div className="json-grid">
                <div>
                  <span>输入参数</span>
                  <pre>{JSON.stringify(p.args, null, 2)}</pre>
                </div>
                <div>
                  <span>执行结果</span>
                  <pre>{JSON.stringify(p.result, null, 2)}</pre>
                </div>
              </div>
            </details>
          </>
        ) : (
          <p className="event-meta">
            {p.status
              ? statusLabel[String(p.status)]
              : p.endedReason
                ? String(p.endedReason)
                : p.message
                  ? String(p.message)
                  : "事件已接收"}
          </p>
        )}
      </div>
    </article>
  );
}
