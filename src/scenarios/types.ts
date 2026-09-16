import type { Direction } from "../shared/types.js";
export interface ToolContext {
  runId: string;
  callId: string;
  toolCallId: string;
}
// Tools return records; the runtime saves their result atomically. External writes need a separate idempotency strategy.
export interface ScenarioTool {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  execute: (
    args: Record<string, unknown>,
    context: ToolContext,
  ) => unknown | Promise<unknown>;
}
export interface Scenario {
  id: string;
  version: string;
  name: string;
  description: string;
  systemPrompt: string;
  greeting: Record<Direction, string>;
  context: Record<Direction, Record<string, unknown>>;
  tools: ScenarioTool[];
  sample: { name: string; args: Record<string, unknown>; user: string };
  outboundSample?: {
    name: string;
    args: Record<string, unknown>;
    user: string;
  };
}
