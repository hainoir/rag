# 第五阶段发布运行手册

这份手册面向 `v0.1.0-rc.1` 发布候选版本。它描述如何部署、验证、回滚和记录验收结果。

## 1. 发布边界

本阶段只做发布收口：

- 不修改 `SearchResponse`。
- 不修改搜索 API。
- 不修改 Postgres schema。
- 不修改后台管理 API。
- 不把真实运维、真实管理员验收或备份恢复写成已完成，除非已经在 `docs/release-acceptance-report.md` 留证。

当前发布口径：

- 项目定位：校园信息检索 / explainable RAG MVP，上线候选版本。
- 默认检索策略：`hybrid`。
- 默认回答模式：`extractive`。
- `rerank`：默认关闭，仅作为显式实验能力。
- LLM answer：可选演示能力，必须保留 evidence-bound 和 fallback。

## 2. 最小部署拓扑

推荐拓扑：

1. `web`
   - Next.js 应用。
   - 只访问 `SEARCH_SERVICE_URL`。
   - 不直连 Postgres。
2. `search-service`
   - 暴露 `/api/search`、`/api/feedback`、`/api/query-logs`、`/api/admin/*`、`/health`、`/metrics`。
   - 负责 Postgres 检索、telemetry、feedback、后台管理 API。
3. `Postgres`
   - 保存 documents、versions、chunks、ingestion runs、query logs、feedback、service event logs、admin governance。
4. `Redis`
   - 用于 ingestion queue、缓存和限流增强。
   - 本地 demo 可缺省，但 release ops/admin gate 需要真实 Redis 验收。
5. `scheduled ingestion`
   - 官方来源定时同步。
   - 社区来源默认关闭或审核后打开。
6. `ops webhook`
   - 接收 `notify:phase-three-ops` 的成功和失败通知。

## 3. 环境变量

### web

```bash
SEARCH_SERVICE_URL=https://your-search-service.example.com/api/search
SEARCH_SERVICE_METHOD=POST
SEARCH_SERVICE_TIMEOUT_MS=8000
SEARCH_SERVICE_API_KEY=...
SEARCH_SERVICE_AUTH_HEADER=Authorization
ADMIN_DASHBOARD_TOKEN=...
```

### search-service

```bash
SEARCH_SERVICE_PROVIDER=postgres
SEARCH_RETRIEVAL_MODE=auto
SEARCH_RERANK_MODE=off
SEARCH_ANSWER_MODE=extractive
DATABASE_URL=postgres://...
REDIS_URL=redis://...
SEARCH_SERVICE_API_KEY=...
SEARCH_SERVICE_AUTH_HEADER=Authorization
```

### ingestion

```bash
SEARCH_DATABASE_SCHEMA=public
INGEST_SOURCE_IDS=tjcu-main-notices,tjcu-library,tjcu-academic-affairs,tjcu-undergrad-admissions
RUN_COMMUNITY_INGESTION=false
INGEST_QUEUE_NAME=campus-rag:ingestion
```

### optional vector / rerank / LLM

```bash
EMBEDDING_API_KEY=...
EMBEDDING_BASE_URL=...
EMBEDDING_MODEL=Qwen/Qwen3-Embedding-8B
EMBEDDING_DIMENSIONS=1024
EMBEDDING_VECTOR_COLUMN=embedding_qwen3_1024
RERANK_API_KEY=...
RERANK_BASE_URL=...
RERANK_MODEL=Qwen/Qwen3-Reranker-8B
LLM_API_KEY=...
LLM_BASE_URL=...
LLM_MODEL=...
```

### ops

```bash
SEARCH_SERVICE_URL=https://your-search-service.example.com/api/search
OPS_ALERT_WEBHOOK_URL=https://your-webhook.example.com/ops
OPS_ALERT_PROVIDER=generic
OPS_ALERT_NOTIFY_ON=always
BACKUP_DRILL_RESTORE_DATABASE_URL=postgres://temporary-restore-db
BACKUP_DRILL_RUN_VERIFY=true
```

## 4. 启动顺序

本地完整编排：

```bash
npm run compose:up
```

手动启动：

```bash
npm run db:init
npm run search-service
npm run dev
```

真实数据初始化：

```bash
npm run verify:real-data
npm run ingest:scheduled:official
```

可选向量初始化：

```bash
npm run vector:init
npm run embed:chunks
npm run smoke:vector
```

## 5. Release Gate

基础本地验收：

```bash
npm run verify:release:local
```

真实数据和后台验收：

```bash
npm run verify:release:postgres
```

这条 gate 会先检查 `DATABASE_URL` 和 `EMBEDDING_API_KEY`，避免把真实检索或 hybrid/vector 评估缺环境误写成通过。

运维验收：

```bash
npm run verify:release:ops
```

这条 gate 会先检查 search-service URL、`OPS_ALERT_WEBHOOK_URL`、`DATABASE_URL` 和 `BACKUP_DRILL_RESTORE_DATABASE_URL`，避免通知跳过或备份只导出不恢复。

验收结果写入：

- `docs/release-acceptance-report.md`
- `reports/search-quality-evaluation-*.md`
- `reports/ops-health-check.md`
- `reports/backup-drills/*`

## 6. 常见故障

### 前端显示错误态

检查：

- `SEARCH_SERVICE_URL` 是否指向 `/api/search`。
- search-service 是否启动。
- search-service 是否要求 `SEARCH_SERVICE_API_KEY`，web 是否配置同一密钥。

处理：

```bash
npm run smoke:search-service
```

### Postgres gate 失败

检查：

- `DATABASE_URL` 是否可连接。
- 数据库是否支持 `pgcrypto` 和 `pg_trgm`。
- 是否已经执行 `npm run db:init`。
- 官方来源是否能成功抓取。

处理：

```bash
npm run db:init
npm run ingest:official
npm run inspect:ingestion
npm run smoke:postgres
```

### Hybrid 评估被 skipped

检查：

- embedding key 是否配置。
- pgvector schema 是否初始化。
- 是否有已写入 embedding 的 chunks。

处理：

```bash
npm run vector:init
npm run embed:chunks
npm run smoke:vector
```

### Ops gate 没有通知

检查：

- `OPS_ALERT_WEBHOOK_URL` 是否配置。
- `OPS_ALERT_PROVIDER` 是否与 webhook 类型匹配。
- `OPS_ALERT_NOTIFY_ON` 是否为 `always` 或当前检查确实失败。

处理：

```bash
npm run check:phase-three-ops
npm run notify:phase-three-ops
```

### Backup drill 阻塞

检查：

- `pg_dump` 和 `pg_restore` 是否可用。
- `BACKUP_DRILL_RESTORE_DATABASE_URL` 是否指向临时恢复库。
- 不要把恢复库指向生产主库。

处理：

```bash
npm run backup:drill
```

## 7. 回滚流程

### web / search-service 回滚

1. 保留上一版镜像或部署 artifact。
2. 将 web 或 search-service 指回上一版。
3. 检查 `/health`。
4. 跑：

```bash
npm run smoke:search-service
npm run check:phase-three-ops
```

### 数据回滚

只在 schema 变更或坏数据污染确认后执行。

1. 停止 ingestion worker 和 scheduled ingestion。
2. 使用最近一次 `backup:drill` 或 `pg_dump` 产物恢复到临时库验证。
3. 确认恢复有效后，再按部署平台流程恢复目标库。
4. 跑：

```bash
npm run smoke:postgres
npm run test:telemetry:postgres
```

## 8. 发布后观察

发布后至少观察 24 小时：

- scheduled ingestion 是否执行。
- `/health` 是否持续可用。
- `/metrics.persistent` 是否有真实请求。
- `service_event_logs` 是否出现阻断错误。
- feedback 是否能写入和处理。
- 后台来源状态是否符合预期。

观察结论写入 `docs/release-acceptance-report.md`。
