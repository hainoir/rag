# 演示与部署运行手册

## 固定演示问题

固定 query 已沉淀在 [../fixtures/demo-queries.json](../fixtures/demo-queries.json)，用于覆盖主要状态：

- `图书馆借书`：期望 `ok`，展示官方来源、答案摘要和依据片段。
- `宿舍报修流程`：期望 `partial` 或 `ok`，覆盖后勤 / 学生生活类流程问题。
- `社团纳新什么时候开始`：期望 `partial` 或 `ok`，覆盖校园活动类问题。
- `明天校园集市几点开始`：期望 `empty`，用于证明系统不会在无来源时编造答案。

本地可以直接运行：

```bash
npm run verify:demo
```

这个脚本会强制使用 seed provider，检查固定 query 的状态、来源数量和 evidence，不依赖真实数据库。

## 本地服务分工

- Next.js 前端：`npm run dev`，默认 `http://localhost:3000`。
- 上游搜索服务：`npm run search-service`，默认 `http://127.0.0.1:8080/api/search`。
- Postgres：通过 `docker compose up -d postgres` 或托管数据库提供。
- 摄取任务：手动运行 `npm run ingest:official`；后续部署时可放进 cron / scheduled job。

## 部署边界

生产部署时不要让前端直接读数据库。前端仍然只访问 `/api/search`，由 Route Handler 调用 `SEARCH_SERVICE_URL`。搜索服务负责读取 Postgres、排序 chunks、生成 extractive answer；如果配置了 LLM，也只在检索命中后基于 evidence 生成回答，并继续返回同一个 `SearchResponse`。

最低环境变量：

```bash
SEARCH_SERVICE_URL=https://your-search-service.example.com/api/search
SEARCH_SERVICE_METHOD=POST
SEARCH_SERVICE_TIMEOUT_MS=8000
DATABASE_URL=postgres://...
SEARCH_SERVICE_PROVIDER=postgres
SEARCH_ANSWER_MODE=extractive
INGEST_SOURCE_IDS=tjcu-main-notices,tjcu-library,tjcu-academic-affairs,tjcu-undergrad-admissions,tjcu-grad-admissions
```

可选 LLM 环境变量：

```bash
SEARCH_ANSWER_MODE=llm
LLM_API_KEY=...
LLM_BASE_URL=https://api.openai.com/v1
LLM_MODEL=your-chat-model
LLM_TIMEOUT_MS=12000
LLM_TEMPERATURE=0.2
```

`SEARCH_ANSWER_MODE=auto` 也可用：配置了 key/model 时使用 LLM，未配置时保持 extractive。演示时建议先用 `extractive` 跑通数据库 smoke，再切到 `llm` 对比回答质量。

## 发布前检查

```bash
npm run smoke:search-service
npm run verify:demo
npm run verify:search-contract
npm run smoke:postgres
npm run test:ingestion
npm run build
npm run e2e
```

如果没有配置 `DATABASE_URL`，`npm run smoke:postgres` 会失败，`npm run test:ingestion` 也无法证明真实数据库闭环。发布前至少要让 smoke 检查和 Postgres 集成测试都通过。

E2E 默认会启动 seed 搜索服务和 Next.js dev server，覆盖首页搜索、结果页渲染、来源展开、无结果和错误态。首次运行如果本机没有浏览器二进制，需要先执行：

```bash
npx playwright install chromium
```
