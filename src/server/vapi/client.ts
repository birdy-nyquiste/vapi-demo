import { VapiClient, VapiError, type Vapi } from "@vapi-ai/server-sdk";
import type { Config } from "../config.js";
export class CallRejected extends Error {}
export interface CallGateway {
  create(payload: Vapi.CreateCallDto): Promise<{ id: string }>;
  get(id: string): Promise<{
    id: string;
    name?: string;
    assistantId?: string;
    status?: string;
    endedReason?: string;
  }>;
}
export function gateway(config: Config, fetcher?: typeof fetch): CallGateway {
  const vapi = new VapiClient({
    token: config.apiKey || "",
    maxRetries: 0,
    fetch: fetcher,
    timeoutInSeconds: 12,
  });
  return {
    async create(payload) {
      let result;
      try {
        result = await vapi.calls.create(payload);
      } catch (error) {
        if (
          error instanceof VapiError &&
          [400, 401, 403, 404, 422].includes(error.statusCode ?? 0)
        )
          throw new CallRejected(
            `Vapi 拒绝创建通话 (${error.statusCode})，请检查号码、助手和凭据配置。`,
          );
        throw error;
      }
      if (!("id" in result) || typeof result.id !== "string")
        throw new Error("Missing call ID");
      return { id: result.id };
    },
    async get(id) {
      const result = await vapi.calls.get({ id });
      return result as Awaited<ReturnType<CallGateway["get"]>>;
    },
  };
}
