import type { Scenario, ScenarioTool } from "./types.js";
// Page snapshot 2026-09-16: https://router.nyquiste.com/plan-config
// Bundle prices are denominated in USD; the billing period is not established.
const properties = {
  chatgptPro: { type: "boolean" },
  claudeMax: { type: "boolean" },
  googleUltra: { type: "boolean" },
  roaming: { type: "string", enum: ["none", "hk", "us"] },
  appleId: { type: "boolean" },
};
const selection = {
  type: "object",
  properties,
  required: Object.keys(properties),
  additionalProperties: false,
};
function quote(a: Record<string, unknown>) {
  return {
    amount:
      999 +
      (a.chatgptPro ? 1099 : 0) +
      (a.claudeMax ? 1099 : 0) +
      (a.googleUltra ? 1099 : 0) +
      (a.roaming === "hk" ? 300 : a.roaming === "us" ? 500 : 0) +
      (a.appleId ? 20 : 0),
    displaySymbol: "$",
    currencyCode: "USD",
    billingPeriod: null,
    previewOnly: true,
    selection: a,
  };
}
const tools: ScenarioTool[] = [
  {
    name: "get_bundle_quote",
    description: "根据完整配置计算美元参考报价；未选项也必须明确填入。",
    parameters: selection,
    execute: quote,
  },
  {
    name: "save_purchase_interest",
    description: "用户确认后，保存配置和购买意向；不是订单或付款。",
    parameters: selection,
    execute: (a, c) => ({
      saved: true,
      recordId: c.toolCallId,
      kind: "purchase_interest",
      quote: quote(a),
    }),
  },
  {
    name: "save_setup_status",
    description:
      "记录用户口述的配置状态与后续意愿；不代表系统验证，也不自动外呼。",
    parameters: {
      type: "object",
      properties: {
        chatgpt: {
          type: "string",
          enum: ["ready", "blocked", "not_started", "unknown"],
        },
        claude: {
          type: "string",
          enum: ["ready", "blocked", "not_started", "unknown"],
        },
        google: {
          type: "string",
          enum: ["ready", "blocked", "not_started", "unknown"],
        },
        notes: { type: "string", maxLength: 1000 },
      },
      required: ["chatgpt", "claude", "google", "notes"],
      additionalProperties: false,
    },
    execute: (a, c) => ({
      saved: true,
      recordId: c.toolCallId,
      source: "user_reported",
      ...a,
      followUpScheduled: false,
    }),
  },
];
export const bundle: Scenario = {
  id: "nyquiste_bundle",
  version: "3",
  name: "Nyquiste 组合套餐",
  description: "咨询套餐配置与报价，或跟进配置进度。",
  systemPrompt: [
    "你是 Nyquiste 组合套餐的 AI 咨询助理。请使用礼貌、准确、简洁的中文与用户交流，避免向用户提及内部工具、字段名称或技术实现。",
    "套餐信息：基础组合包含 ChatGPT Plus、Claude Pro 和 Google AI Pro。可选项目包括 ChatGPT Pro、Claude Max、Google Ultra、香港或美国漫游流量，以及美区 Apple ID。资料未明确的订阅权益、模型版本、用量、可用性和服务承诺，均应说明尚未确认，不得自行补充。",
    "报价规则：每次报价都必须调用 get_bundle_quote，并传入所有选项。未选择的升级项目填 false，未选择漫游流量填 none。用户修改配置后，应重新计算报价。向用户报出工具返回的金额时，明确使用美元，并说明这是根据所选配置计算的参考报价。计费周期尚未确认，不得自行推断。当前无法在通话中完成付款。",
    "来电时，协助用户了解套餐、确认配置并提供参考报价。外呼时，根据已提供的上下文了解配置进度。只有用户明确表达购买意向后，才调用 save_purchase_interest；仅在工具返回成功后，才能告知用户意向已记录。配置状态仅记录用户口述，不得声称已由系统核实。不要自行安排回访。",
  ].join("\n"),
  greeting: {
    inbound:
      "您好，我是 Nyquiste 的 AI 咨询助理。请问您希望了解组合套餐，还是获取配置报价？",
    outbound:
      "您好，我是 Nyquiste 的 AI 咨询助理，来了解您的套餐配置进度。请问目前各项服务的配置情况如何？",
  },
  context: {
    inbound: {},
    outbound: {
      customer: "演示客户",
      purchased: ["ChatGPT Plus", "Claude Pro", "Google AI Pro"],
      setup: "待用户确认",
    },
  },
  tools,
  outboundSample: {
    name: "save_setup_status",
    args: {
      chatgpt: "ready",
      claude: "blocked",
      google: "unknown",
      notes: "用户希望明天下午联系；未安排拨号",
    },
    user: "ChatGPT 已经好了，Claude 还没弄好，明天下午再联系我。",
  },
  sample: {
    name: "get_bundle_quote",
    args: {
      chatgptPro: false,
      claudeMax: true,
      googleUltra: false,
      roaming: "none",
      appleId: false,
    },
    user: "先不要流量了，改成升级 Claude，帮我重新报价。",
  },
};
