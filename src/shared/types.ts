export type Direction = "inbound" | "outbound";
export type Mode = "mock" | "live";
export type RunStatus =
  | "creating"
  | "queued"
  | "ringing"
  | "in-progress"
  | "forwarding"
  | "ended"
  | "failed"
  | "outcome-unknown";
export interface Run {
  id: string;
  callId: string | null;
  scenarioId: string;
  scenarioVersion: string;
  direction: Direction;
  mode: Mode;
  status: RunStatus;
  context: Record<string, unknown>;
  createdAt: string;
  startedAt: string | null;
  endedAt: string | null;
  endedReason: string | null;
}
export interface RunEvent {
  cursor: number;
  runId: string;
  kind: string;
  receivedAt: string;
  payload: Record<string, unknown>;
}
export interface ToolExecution {
  id: string;
  name: string;
  args: unknown;
  result: unknown;
  ok: boolean;
  durationMs: number;
}
export interface ScenarioSummary {
  id: string;
  version: string;
  name: string;
  description: string;
  tools: { name: string; description: string }[];
  outboundReady: boolean;
}
export interface AppConfig {
  mode: Mode;
  storage: string;
  inboundNumber: string | null;
  testNumber: string | null;
  inboundScenario: string;
  liveMissing: string[];
  scenarios: ScenarioSummary[];
}
export const terminal = (status: RunStatus) =>
  status === "ended" || status === "failed";
