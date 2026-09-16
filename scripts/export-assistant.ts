import { assistantConfig } from "../src/server/vapi/assistant.js";
import "dotenv/config";
import { writeFile, mkdir } from "node:fs/promises";
import { scenarioById } from "../src/server/runtime/scenarios.js";
const s = scenarioById(process.argv[2] || "echo_demo");
for (const key of [
  "PUBLIC_BASE_URL",
  "VAPI_CREDENTIAL_ID",
  "VAPI_MODEL",
  "VAPI_VOICE_PROVIDER",
  "VAPI_VOICE_ID",
  "VAPI_TRANSCRIBER_PROVIDER",
  "VAPI_TRANSCRIBER_MODEL",
  "VAPI_TRANSCRIBER_LANGUAGE",
])
  if (!process.env[key]) throw new Error(`Missing ${key}`);
const base = new URL(process.env.PUBLIC_BASE_URL!);
if (base.protocol !== "https:")
  throw new Error("PUBLIC_BASE_URL must use HTTPS");
const server = {
  url: new URL("/api/vapi/webhook", base).href,
  credentialId: process.env.VAPI_CREDENTIAL_ID,
};
const config = assistantConfig(s, server, process.env);
await mkdir(".local", { recursive: true });
await writeFile(
  `.local/${s.id}.assistant.json`,
  JSON.stringify(config, null, 2),
);
console.log(`Exported .local/${s.id}.assistant.json (no remote changes)`);
