# 运行与接入

## 本地模拟

```sh
npm ci
cp .env.example .env
npm run dev
```

打开 http://127.0.0.1:5173 。默认 `DEMO_MODE=mock`，不需要云凭据，不会拨号。选择场景与来电/外呼方向，运行模拟实验；可注入无效工具参数，观察失败结果。工具真实经过校验和数据库保存，但对话内容是预设事件，不代表模型实际表现。

本地使用 PGlite（嵌入式 PostgreSQL），数据保存在被 Git 忽略的 `.local/postgres`，刷新页面和重启服务后保留。只有本地 mock 模式允许缺少数据库连接；Vercel 部署必须连接托管 Postgres。数据库迁移命令为 `npm run db:migrate`。

## Vercel

1. 准备托管 Postgres，使用供应商提供的 TLS/连接池连接串设置 `DATABASE_URL`。
2. 在本地使用目标数据库连接串执行 `npm run db:migrate`。部署函数不会在每次启动时执行 DDL。
3. 导入仓库为一个 Vercel 项目。仓库的 `vercel.json` 构建 Vite 前端，并将 `/api/*` 路由交给 `api/index.ts` 的 Express 应用。
4. 配置环境变量。可先部署 `DEMO_MODE=mock` 验证页面，但必须同时配置 `DATABASE_URL` 和 `DEMO_ACCESS_TOKEN`。真实接入时切换为 `live`。
5. 所有凭据均为服务端环境变量，不能添加 `VITE_` 前缀。
6. Vapi webhook 必须可从外网访问。Vercel Deployment Protection 不应拦截该路径；应用自己对 webhook 验证独立 Bearer 凭据。

此配置提供可构建部署结构；最终云部署、数据库供应商与真实电话仍需实际接入验证。

## Vapi + Telnyx

先在 Telnyx 准备美国语音号码，在 Vapi 导入，绑定 Assistant。Telnyx Outbound Voice Profile 启用美国目标并关联 Vapi 连接。

配置 `.env.example` 中真实模式所需值：

- `DEMO_ACCESS_TOKEN`：页面访问口令。
- `DATABASE_URL`：托管 Postgres。
- `VAPI_API_KEY`、`VAPI_PHONE_NUMBER_ID`。
- `INBOUND_PHONE_NUMBER`：展示的来电号码；`TEST_PHONE_NUMBER`：唯一允许拨出的美国测试号码，E.164 格式。
- `VAPI_WEBHOOK_SECRET`：Vapi Custom Credential 的 Bearer Token 内容。
- `VAPI_CREDENTIAL_ID`：对应 Custom Credential ID，用于导出配置。
- `PUBLIC_BASE_URL`：HTTPS 部署地址。
- `VAPI_ASSISTANT_MAP`：例如 `{"echo_demo":"assistant-id"}`。每个场景对应一个独立保存的助手，助手可以处理两个方向。
- `INBOUND_SCENARIO_ID`：当前号码实际绑定的场景，需与 Dashboard 保持一致。

配置语音管线相关环境变量后运行：

```sh
npm run assistant:export -- echo_demo
```

命令只生成 `.local/echo_demo.assistant.json`，不创建云端资源或发起通话。在 Vapi 中用生成的配置创建/更新 Assistant，核验所选模型和声音支持，再把 ID 写入映射。导出文件包含 credential ID，不含密钥。语音供应商和模型必须自行配置，避免把过时示例模型当成已测试方案。

来电使用助手的默认开场白，外呼会覆盖为该场景外呼开场白，并通过 `assistantOverrides.variableValues.demoContext` 传入固定演示上下文。外呼关联使用 ``name = demo:运行ID``。调用方的电话号码/运行信息不由模型工具参数提供。

## 结果不确定时

创建外呼前先保存运行。Vapi SDK 自动重试被关闭；明确的参数或鉴权拒绝记录为 failed，便于修正配置后重新发起；网络失败后记录 `outcome-unknown`，不会自动再次拨号。若浏览器请求失败，原 request ID 保留在当前标签页，重试将复用该 ID。

在 Vapi Dashboard 查找 `name = demo:运行ID`，使用 Call ID 在详情面板核对关联；后端会向 Vapi 查询并验证归属。不能通过随便填写 Call ID 解除阻塞。若没有创建通话的确定证据，不要删记录后再次拨号。

数据库中未结束或结果不确定的真实外呼会阻止新的外呼。若已确认没有创建通话但 Dashboard 没有可关联记录，需要管理员调查并手工修复运行状态；首版不提供一键跳过。

## 替换场景

复制 `src/scenarios/echo.ts`，提供提示词、两个开场白、固定上下文、工具参数 schema 和处理函数（支持 async），然后在 `src/server/runtime/scenarios.ts` 注册。重新导出助手配置并更新 Vapi 映射；不修改电话接入或页面。

当前工具的持久副作用仅为框架在事务内保存 JSON 结果。不要在处理函数中直接调用支付、邮件等外部写入；外部副作用需要单独实现幂等和失败恢复。历史运行保存场景版本；活动通话期间不要替换该场景版本。

## 验证

```sh
npm run typecheck
npm test
npm run build
```

自动测试使用嵌入式 PostgreSQL 执行 SQL，以及本地 HTTP 请求；不调用 Vapi 或 Telnyx。模拟通过不代表真实电话通过。最后必须验证美国手机真实拨入、真实外呼、工具调用，以及部署域名的 webhook。

2026-09-16 本地验证：17 项自动测试通过，类型检查和生产构建通过；浏览器验证来电模拟、外呼配置跟进、无效参数失败展示、刷新及服务重启后的记录保留。桌面与 390px 手机布局已检查。真实 Vapi/Telnyx 通话、托管 Postgres 和 Vercel 部署尚未验证。
