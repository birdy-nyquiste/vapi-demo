import type { Scenario, ScenarioTool } from "./types.js";
// Page snapshot 2026-09-16: https://router.nyquiste.com/plan-config
// The page uses "$" but does not establish currency code or billing period.
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
    currencyCode: null,
    billingPeriod: null,
    previewOnly: true,
    selection: a,
  };
}
const tools: ScenarioTool[] = [
  {
    name: "get_bundle_quote",
    description: "使用完整配置计算页面快照报价；未选项也必须明确填入。",
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
  version: "1",
  name: "全家桶示例",
  description: "可替换的示例：咨询配置报价，或回访配置进度。",
  systemPrompt:
    "你是 Nyquiste AI 全家桶演示助手，使用中文。已知资料：基础组合包含 ChatGPT Plus、Claude Pro、Google AI Pro；可选 ChatGPT Pro、Claude Max、Google Ultra、香港或美国漫游流量以及美区 Apple ID。不要自行描述各订阅的具体权益、模型版本、用量、可用性或服务承诺；资料未给出时明确说尚未确认。价格必须通过 get_bundle_quote 计算，所有选项都要传参；明确未选的升级填 false，未选漫游填 none。页面只是预览；报价工具的 displaySymbol 为 $，currencyCode 为 null，billingPeriod 为 null。报金额时可以说“预览金额 2098，页面显示 $ 符号”，绝不能说“美元”“美金”或推断币种、计费周期；不支持真实付款。来电以咨询和记录意向为主，外呼根据提供的上下文询问配置进度。用户改变选项时重新报价。只有用户明确表示购买意向时才调用 save_purchase_interest；仅在工具成功后确认记录成功。配置状态只记录用户口述，不冒充系统验证。不要自动安排回访。",
  greeting: {
    inbound: "你好，我是 Nyquiste 的 AI 助手。想了解全家桶内容，还是配置报价？",
    outbound:
      "你好，我是 Nyquiste 的 AI 助手，来跟进你的全家桶配置。现在各项服务用起来顺利吗？",
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
