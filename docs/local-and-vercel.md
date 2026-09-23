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

以下从已推送的 [GitHub 仓库](https://github.com/birdy-nyquiste/vapi-demo)创建一个 Vercel 项目。先用托管数据库运行模拟模式，确认部署链路，再配置真实电话。当前项目已在 Vercel 和 Neon 上验证来电、报价与购买意向记录；外呼配置跟进仍需单独验收。

### 1. 准备数据库并迁移

1. 创建一个可从 Vercel Functions 和执行迁移的电脑访问的托管 PostgreSQL 数据库。取得供应商提供的连接串；如供应商提供 TLS、连接池专用地址，按其要求使用。不要把连接串提交到 Git。
2. 在仓库根目录运行 `npm ci`，复制 `.env.example` 为被 Git 忽略的 `.env`，在 `.env` 中填写**同一个数据库**的 `DATABASE_URL`。
3. 运行 `npm run db:migrate`，确认输出 `Schema ready`。迁移会创建 `runs`、`events` 和 `tool_executions` 等表；后续版本更新也应先执行迁移，再部署依赖新表结构的代码。Vercel Function 启动时不会运行 DDL。

### 2. 从 GitHub 导入项目

1. 在 Vercel Dashboard 选择 **Add New → Project**，连接有权访问该仓库的 GitHub 账号，导入 `birdy-nyquiste/vapi-demo`。
2. 项目根目录选择仓库根目录 `./`；框架选择 **Vite**。确认构建命令为 `npm run build`，输出目录为 `dist`。仓库的 `vercel.json` 已设置这些值，并将 `/api/*` 转给 `api/index.ts` 的 Express Function；无需另建前后端项目。
3. 将 Production Branch 设为 `main`。检查项目 **Settings → Build and Deployment** 中的 Node.js Version 和构建日志；`package.json` 要求至少 Node 22.12，本地已在 22.x 验证。Vercel 也会参考 `package.json` 的 `engines.node` 选择主版本；当前的开放范围可能选到更新的版本。若部署必须固定为 22.x，需要将该范围收窄为 `22.x` 并重新部署。
4. 在首次点击 **Deploy** 前添加下一节的 Production 环境变量。如果也要部署其他分支，在 Preview 环境分别配置数据库、口令和模式；Preview 变量不会自动沿用 Production 的值。

如果先在 Vercel 创建了空项目和 Neon 数据库，之后才在 **Settings → Git** 连接这个已有仓库，连接前已推送的 `main` 提交可能没有触发部署。检查 **Deployments**；若没有任何部署，在该页的操作菜单选择 **Create Deployment**，输入 `main` 对应的 Git 引用并创建 Production 部署。也可以在配置完成后向 `main` 推送一个新提交来触发构建。不要把“Git 已连接”当成“已部署”。参见 Vercel 的 [从 Git 引用创建部署](https://vercel.com/docs/git#creating-a-deployment-from-a-git-reference)。

Vercel 的 [Git 导入流程](https://vercel.com/docs/git)、[Node.js 版本设置](https://vercel.com/docs/functions/runtimes/node-js/node-js-versions)和[环境变量作用范围](https://vercel.com/docs/environment-variables)以官方文档为准。

### 3. 配置首次部署的环境变量

在 Vercel 项目 **Settings → Environment Variables** 中添加以下值，至少勾选 **Production**：

| 变量 | 首次部署的值 | 用途 |
| --- | --- | --- |
| `DEMO_MODE` | `mock` | 仅模拟，不拨打真实电话 |
| `DATABASE_URL` | 第 1 步已迁移的托管 Postgres 连接串 | Vercel 上不能使用本地 PGlite 数据目录 |
| `DEMO_ACCESS_TOKEN` | 自行生成的长随机口令 | 页面登录及管理 API 访问；部署环境不可留空 |

使用 Vercel 的服务端环境变量，**不要**加 `VITE_` 前缀，也不要把私钥写入前端或仓库。部署时 `DATABASE_URL` 必须存在，即使 `DEMO_MODE=mock` 也是如此。每次修改环境变量后都要创建新部署或在 Deployments 中重新部署；旧部署不会自动得到新值。

### 4. 部署并检查模拟模式

1. 点击 **Deploy**，等待构建和 Function 部署完成。从项目的 Production Domains 中复制稳定的 HTTPS 域名，记为 `BASE_URL`。不要用一次性的部署 URL 配置长期 webhook。
2. 访问 `BASE_URL/api/health`，预期 JSON 为 `{"ok":true}`。若返回 503，先核对 `DATABASE_URL`、迁移结果和 Function 日志。
3. 打开 `BASE_URL`，用 `DEMO_ACCESS_TOKEN` 登录。确认场景列表显示 `mock` 和托管 Postgres；分别运行来电及外呼模拟，刷新页面后仍能看到运行和事件。模拟按钮不会拨号。
4. 在 Vercel 的 **Deployments** 查看构建结果，在该部署的 **Logs** 查看 Function 错误。若页面正常但 `/api/health` 失败，优先检查 Function 路由、数据库连接与迁移，而不是只看前端构建状态。

推送到 `main` 会触发后续 Production 部署；非生产分支通常生成 Preview 部署。每个环境都需要对应的数据库与变量。参见 Vercel 的 [Git 部署说明](https://vercel.com/docs/git)。

### 5. 切换到真实电话

模拟部署通过后，在 Vapi 准备号码、Assistant 和 webhook 凭据；需要外呼时再按下方 **Vapi + Telnyx** 一节配置 Telnyx。将以下变量添加到 Vercel 的 **Production** 环境，并把 `DEMO_MODE` 改为 `live`：

| 变量 | 要填的内容 |
| --- | --- |
| `VAPI_API_KEY` | 服务端 Vapi API 私钥 |
| `VAPI_WEBHOOK_SECRET` | Vapi Custom Credential 使用的 Bearer Token 内容，与后端校验值完全一致 |
| `VAPI_PHONE_NUMBER_ID` | Vapi 中的号码 ID；Vapi 免费号码可用于来电测试，外呼需要支持外呼的号码 |
| `TEST_PHONE_NUMBER` | 唯一允许外呼的美国测试手机，格式为 `+1` 加 10 位数字 |
| `INBOUND_PHONE_NUMBER` | 页面展示的来电号码，建议使用 E.164 格式 |
| `VAPI_ASSISTANT_MAP` | 例如 `{"echo_demo":"实际的assistant-id"}`；每个场景使用不同的 Assistant ID |
| `INBOUND_SCENARIO_ID` | 当前来电号码在 Vapi 中实际绑定的场景，例如 `echo_demo` |

`PUBLIC_BASE_URL`、`VAPI_CREDENTIAL_ID` 和语音模型相关变量用于**本地导出 Assistant 配置**；当前 Vercel Function 不读取它们。导出时 `PUBLIC_BASE_URL` 应为上一步确认可访问的稳定 HTTPS 域名，生成的 Assistant webhook URL 应为 `https://你的域名/api/vapi/webhook`。创建或更新 Assistant、绑定来电号码后，将实际 Assistant ID 写入 `VAPI_ASSISTANT_MAP`。

为新变量重新部署 Production。登录页面检查配置缺失提示；再从美国测试手机拨入，核对接通、字幕、工具结果和刷新后的记录。若已配置支持外呼的号码，再从页面向允许的测试手机发起一次外呼。外呼创建请求成功只表示 Vapi 接受了请求，不表示电话已接通。真实电话验证前，确保 Vapi 能从公网访问 webhook：Vercel Deployment Protection 若保护了该域名，会先拦截请求；应用自己的 webhook Bearer 验证仍必须保留。参见 Vercel 的 [Deployment Protection 说明](https://vercel.com/docs/deployment-protection)。

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
