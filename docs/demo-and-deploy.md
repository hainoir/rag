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
- 摄取任务：手动运行 `npm run ingest:official` 和按需运行 `npm run ingest:community`；发布环境优先使用 `npm run ingest:scheduled:official` 和 scheduled ingestion workflow。
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
RERANK_TOP_K=8
RERANK_TIMEOUT_MS=25000
```

rerank 只重排 Postgres 候选来源，失败时会记录结构化日志并保留原排序。普通请求默认不启用 rerank；只有显式设置 `SEARCH_RERANK_MODE=on|auto` 时才会参与实验性重排。

## 发布前检查

```bash
npm run verify:release:local
npm run verify:release:postgres
npm run verify:release:ops
```

`verify:release:local` 不依赖数据库，串联格式、lint、契约、seed demo、unit、build 和 e2e。`verify:release:postgres` 依赖 `DATABASE_URL`、真实 ingestion 数据和 embedding 条件，会串联真实数据闭环、向量检索评估、telemetry Postgres 集成和后台 Postgres 集成。`verify:release:ops` 依赖可访问的 search-service、真实 webhook 和临时恢复库，会串联运维检查、通知和备份恢复演练。

如果没有配置 `DATABASE_URL`，`npm run verify:release:postgres` 会被环境检查阻断；这时只能证明 seed demo 和前端流程可用，不能声称当前 release 的真实数据库闭环已通过。所有通过、失败、blocked 和 skipped 结果都应写入 `docs/release-acceptance-report.md`。

## 定时摄取

仓库内置 `.github/workflows/scheduled-ingestion.yml`。它支持手动触发，并配置了两类定时任务：

- 官方源：每天 UTC 18:00 执行 `npm run ingest:scheduled:official`
- 社区源：每小时检查一次；只有 `RUN_COMMUNITY_INGESTION=true` 时才执行 `npm run ingest:scheduled:community`

这条 workflow 只有在 `DATABASE_URL` 和 `REDIS_URL` 都已配置时才会真正执行队列化 ingestion。可用 GitHub Actions variables 覆盖：

- `SEARCH_DATABASE_SCHEMA`
- `INGEST_SOURCE_IDS`
- `RUN_COMMUNITY_INGESTION`
- `INGEST_COMMUNITY_SOURCE_IDS`

默认不在定时任务里自动跑社区来源；把 `RUN_COMMUNITY_INGESTION=true` 后，workflow 才会额外执行 `npm run ingest:scheduled:community`。这样可以先把官方来源作为稳定基线，社区来源按合规和质量策略逐步打开。

## 错误分类与降级

上游 search-service 的 HTTP 错误 payload 会返回稳定 `error` code，例如 `invalid_json`、`database_unavailable`、`upstream_timeout` 和 `search_service_error`。Next.js 搜索代理不会把这些字段扩展进 `SearchResponse`，而是记录结构化日志并继续给前端返回既有 `status: "error"`。

`SEARCH_SERVICE_PROVIDER=auto` 时，Postgres 失败会按错误分类记录 `fallbackReason`，然后回退 seed corpus；`SEARCH_SERVICE_PROVIDER=postgres` 时不会回退，适合验证真实数据链路。

## 观测入口

`search-service` 暴露两个本地排查端点：

- `/health`：服务存活、provider、数据库配置状态、telemetry 可写性和当前模式是否要求持久化
- `/metrics`：runtime 请求统计、状态分布、provider 分布、fallback、错误分类计数，以及 Postgres `persistent` 聚合指标

当前仓库还提供 `check:phase-three-ops`、`notify:phase-three-ops` 和 `backup:drill`。这些入口能生成运维检查、webhook 通知和备份恢复演练证据；生产发布仍需要接入真实外部监控平台，并在 release acceptance report 中记录真实通知和恢复结果。

E2E 默认会启动 seed 搜索服务和 Next.js dev server，覆盖首页搜索、结果页渲染、来源展开、无结果和错误态。首次运行如果本机没有浏览器二进制，需要先执行：

```bash
npx playwright install chromium
```
