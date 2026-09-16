import type { Scenario } from "./types.js";
export const echo: Scenario = {
  id: "echo_demo",
  version: "1",
  name: "留言实验",
  description: "用一次留言验证对话、工具调用与持久化的完整路径。",
  systemPrompt:
    "你是 Nyquiste 的 AI 语音演示助手，用简洁自然的中文交流。请用户留一句话，然后调用 save_demo_note 保存。只有工具返回成功才能说保存成功。工具失败时说明没有保存成功。不要编造执行结果。",
  greeting: {
    inbound: "你好，我是 Nyquiste 的 AI 演示助手。你想留一句什么话？",
    outbound: "你好，这是 Nyquiste 的 AI 测试回访。可以请你留一句测试留言吗？",
  },
  context: { inbound: {}, outbound: { purpose: "受控测试回访" } },
  tools: [
    {
      name: "save_demo_note",
      description: "保存用户明确提供的一句留言。",
      parameters: {
        type: "object",
        properties: { note: { type: "string", minLength: 1, maxLength: 500 } },
        required: ["note"],
        additionalProperties: false,
      },
      execute: (args, ctx) => ({
        saved: true,
        recordId: ctx.toolCallId,
        note: args.note,
      }),
    },
  ],
  sample: {
    name: "save_demo_note",
    args: { note: "框架先跑通，场景以后再替换。" },
    user: "帮我记一下：框架先跑通，场景以后再替换。",
  },
};
