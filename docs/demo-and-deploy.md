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
- 摄取任务：手动运行 `npm run ingest:official` 和按需运行 `npm run ingest:community`；后续部署时可放进 cron / scheduled job。
- 可选向量任务：`npm run vector:init` 初始化一次，之后用 `npm run embed:chunks` 增量补 embedding。

## Docker 镜像

仓库根目录的 `Dockerfile` 提供两个目标：

```bash
docker build --target web -t campus-rag-web .
docker build --target search-service -t campus-rag-search-service .
```

运行时仍保持同一条边界：web 容器只需要 `SEARCH_SERVICE_URL`，search-service 容器通过 `SEARCH_SERVICE_PROVIDER` 决定读取 seed 或 Postgres。

```bash
docker run --rm -p 8080:8080 campus-rag-search-service
docker run --rm -p 3000:3000 -e SEARCH_SERVICE_URL=http://host.docker.internal:8080/api/search campus-rag-web
```

## Docker Compose

完整本地编排使用 `docker-compose.yml`：

```bash
npm run compose:up
```

它会启动 `postgres`、`search-service` 和 `web`。前端容器通过 Compose 内部 DNS 访问 `http://search-service:8080/api/search`，宿主机访问 `http://localhost:3000`。停止服务：

```bash
npm run compose:down
```

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

可选 embedding 环境变量：

```bash
EMBEDDING_API_KEY=...
EMBEDDING_BASE_URL=https://api.openai.com/v1
EMBEDDING_MODEL=text-embedding-3-small
EMBEDDING_DIMENSIONS=1536
```

启用 pgvector 后，search-service 会把 lexical / pg_trgm 候选和 vector 候选合并排序；前端仍只消费同一个 `SearchResponse`。未配置 embedding key 或数据库没有 `chunks.embedding` 时，服务不会调用 embedding API。

可选 rerank 环境变量：

```bash
RERANK_API_KEY=...
RERANK_BASE_URL=https://your-rerank-provider.example.com/v1
RERANK_MODEL=your-rerank-model
RERANK_TOP_K=20
RERANK_TIMEOUT_MS=8000
```

rerank 只重排 Postgres 候选来源，失败时会记录结构化日志并保留原排序。

## 发布前检查

```bash
npm run smoke:search-service
npm run test:embedding-client
npm run test:rerank-client
npm run verify:demo
npm run verify:search-contract
npm run test:unit
npm run verify:real-data
npm run smoke:vector
npm run build
npm run e2e
```

`npm run test:unit` 不依赖数据库，覆盖 adapter、清洗、去重、seed 搜索和搜索代理归一化逻辑。`npm run verify:real-data` 依赖 `DATABASE_URL`，会初始化 schema、同步官方来源、检查 ingestion 状态、跑 Postgres smoke 和 Postgres 集成测试。`npm run smoke:vector` 还要求 pgvector schema、已写入 embedding 的 chunks 和可用 embedding key。

如果没有配置 `DATABASE_URL`，`npm run verify:real-data` 会失败；这时只能证明 seed demo 和前端流程可用，不能声称真实数据库闭环已验证。发布前至少要让 Postgres smoke 检查和 Postgres 集成测试都通过。

## 定时摄取

仓库内置 `.github/workflows/scheduled-ingestion.yml`。它每天 UTC 20:00 运行，也支持手动触发；只有配置了 `DATABASE_URL` secret 时才执行 `npm run verify:real-data`。可用 GitHub Actions variables 覆盖：

- `SEARCH_DATABASE_SCHEMA`
- `INGEST_SOURCE_IDS`
- `RUN_COMMUNITY_INGESTION`
- `INGEST_COMMUNITY_SOURCE_IDS`

默认不在定时任务里自动跑社区来源；把 `RUN_COMMUNITY_INGESTION=true` 后，workflow 才会额外执行 `npm run ingest:community`。这样可以先把官方来源作为稳定基线，社区来源按合规和质量策略逐步打开。

## 错误分类与降级

上游 search-service 的 HTTP 错误 payload 会返回稳定 `error` code，例如 `invalid_json`、`database_unavailable`、`upstream_timeout` 和 `search_service_error`。Next.js 搜索代理不会把这些字段扩展进 `SearchResponse`，而是记录结构化日志并继续给前端返回既有 `status: "error"`。

`SEARCH_SERVICE_PROVIDER=auto` 时，Postgres 失败会按错误分类记录 `fallbackReason`，然后回退 seed corpus；`SEARCH_SERVICE_PROVIDER=postgres` 时不会回退，适合验证真实数据链路。

## 观测入口

`search-service` 暴露两个本地排查端点：

- `/health`：服务存活、provider、数据库配置状态
- `/metrics`：请求总数、平均耗时、状态分布、provider 分布、fallback 和错误分类计数

当前 metrics 是进程内 JSON 计数器，适合本地和 demo 排查；生产环境仍应接入日志聚合、告警和持久化指标平台。

E2E 默认会启动 seed 搜索服务和 Next.js dev server，覆盖首页搜索、结果页渲染、来源展开、无结果和错误态。首次运行如果本机没有浏览器二进制，需要先执行：

```bash
npx playwright install chromium
```
