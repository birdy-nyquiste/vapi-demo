import "dotenv/config";
import type { Mode } from "../shared/types.js";
export interface Config {
  mode: Mode;
  deployed: boolean;
  databaseUrl?: string;
  accessToken?: string;
  webhookSecret?: string;
  apiKey?: string;
  phoneNumberId?: string;
  inboundNumber?: string;
  testNumber?: string;
  assistantMap: Record<string, string>;
  inboundScenario: string;
}
export function readConfig(): Config {
  const deployed =
    !!process.env.VERCEL || process.env.NODE_ENV === "production";
  const mode = process.env.DEMO_MODE ?? (deployed ? "live" : "mock");
  if (mode !== "mock" && mode !== "live")
    throw new Error("DEMO_MODE must be mock or live");
  const map: unknown = JSON.parse(process.env.VAPI_ASSISTANT_MAP || "{}");
  if (
    !map ||
    Array.isArray(map) ||
    typeof map !== "object" ||
    Object.values(map).some((v) => typeof v !== "string" || !v)
  )
    throw new Error("Invalid VAPI_ASSISTANT_MAP");
  if (new Set(Object.values(map)).size !== Object.keys(map).length)
    throw new Error("Each scenario requires its own Assistant ID");
  return {
    mode,
    deployed,
    databaseUrl: process.env.DATABASE_URL,
    accessToken: process.env.DEMO_ACCESS_TOKEN,
    webhookSecret: process.env.VAPI_WEBHOOK_SECRET,
    apiKey: process.env.VAPI_API_KEY,
    phoneNumberId: process.env.VAPI_PHONE_NUMBER_ID,
    inboundNumber: process.env.INBOUND_PHONE_NUMBER,
    testNumber: process.env.TEST_PHONE_NUMBER,
    assistantMap: map as Record<string, string>,
    inboundScenario: process.env.INBOUND_SCENARIO_ID || "echo_demo",
  };
}
export function liveMissing(c: Config) {
  return [
    !c.databaseUrl && "DATABASE_URL",
    !c.accessToken && "DEMO_ACCESS_TOKEN",
    !c.webhookSecret && "VAPI_WEBHOOK_SECRET",
    !c.apiKey && "VAPI_API_KEY",
    !c.phoneNumberId && "VAPI_PHONE_NUMBER_ID",
    !/^\+1\d{10}$/.test(c.testNumber || "") && "TEST_PHONE_NUMBER（美国号码）",
  ].filter(Boolean) as string[];
}
