# Nyquiste Voice Lab

可替换场景的 Vapi 电话 Agent 实验框架。React + Vite、Express + TypeScript、Postgres；提供 Vercel 部署配置。

```sh
npm ci
cp .env.example .env
npm run dev
```

打开 http://127.0.0.1:5173 。默认本地模拟模式不会拨打电话，可运行来电/外呼模拟、切换场景、注入工具参数错误，查看持久化事件与工具结果。

- [本地运行、Vercel 与真实电话接入](docs/local-and-vercel.md)
- [框架实现规格](docs/demo-framework-spec.md)
- [官方文档调研](docs/vapi-capabilities-research.md)

已包含留言实验与全家桶示例。新增场景只需独立模块和注册，页面与通话框架复用。

真实电话需要 Vapi、Telnyx 美国号码、测试手机和托管 Postgres；仅模拟通过不表示真实电话或云部署已经验收。
