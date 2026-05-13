# 第三阶段运维与可靠性运行手册

## 1. 适用范围

这份手册对应第三阶段第一轮落地后的真实边界：

- `web` 只负责 `/api/search` 与 `/api/feedback` 的前端入口，不再直接连接 Postgres。
- `search-service` 同时负责搜索、feedback 持久化、query log 持久化、服务事件日志和健康检查。
- Postgres 既是检索与 ingestion 的主存储，也是当前持久化观测后端。
- Redis 仍然只作为缓存、限流和 ingestion queue 的可选增强项，不是 demo / 本地开发硬依赖。

不在本手册范围内的内容：

- Prometheus / Grafana / Sentry / ELK 等外部监控平台接入
- 管理后台、来源治理后台、人工审核后台
- 第四阶段和第五阶段的发布包装物料

## 2. 部署拓扑

推荐保持三段式部署：

1. `web`
   - 只暴露 Next.js 页面与 `/api/search`、`/api/feedback`
   - 所有搜索和 telemetry 写入都代理到 `search-service`
2. `search-service`
   - 暴露 `/api/search`、`/api/feedback`、`/api/query-logs`、`/health`、`/metrics`
   - 负责 Postgres 检索、feedback / query log / service event 落库
3. `Postgres`
   - 存储 `documents / document_versions / chunks / ingestion_runs / ingestion_run_items`
   - 存储 `search_feedback / search_query_logs / service_event_logs`

本地 Docker Compose 仍用：

```bash
npm run compose:up
```

## 3. 环境变量矩阵

### 3.1 web

最小必需：

```bash
SEARCH_SERVICE_URL=https://your-search-service.example.com/api/search
SEARCH_SERVICE_METHOD=POST
SEARCH_SERVICE_TIMEOUT_MS=8000
```

可选但推荐：

```bash
SEARCH_TELEMETRY_TIMEOUT_MS=1500
SEARCH_SERVICE_API_KEY=...
SEARCH_SERVICE_AUTH_HEADER=Authorization
```

说明：

- `web` 不再需要 `DATABASE_URL`
- 如果 `search-service` 开启了 API key 校验，`web` 也必须配置同一组 `SEARCH_SERVICE_API_KEY / SEARCH_SERVICE_AUTH_HEADER`
- query log 代理默认短超时 fail-open；feedback 代理会等待上游返回，以便把失败明确回给前端

### 3.2 search-service

搜索与持久化最小必需：

```bash
SEARCH_SERVICE_PROVIDER=postgres
SEARCH_ANSWER_MODE=extractive
DATABASE_URL=postgres://...
```

可选增强：

```bash
REDIS_URL=redis://127.0.0.1:6379/0
SEARCH_SERVICE_API_KEY=...
SEARCH_SERVICE_AUTH_HEADER=Authorization
LLM_API_KEY=...
LLM_MODEL=...
EMBEDDING_API_KEY=...
EMBEDDING_MODEL=text-embedding-3-small
RERANK_API_KEY=...
RERANK_BASE_URL=https://your-rerank-provider.example.com/v1
RERANK_MODEL=your-rerank-model
```

说明：

- `DATABASE_URL` 同时服务于检索、ingestion 和持久化观测
- `REDIS_URL` 影响缓存、限流和队列，但缺失时仍允许 demo 与 seed 路径继续运行
- `/health` 和 `/metrics` 不要求认证；`/api/search`、`/api/feedback`、`/api/query-logs` 在配置了 `SEARCH_SERVICE_API_KEY` 后共用同一套校验

### 3.3 GitHub Actions / 定时同步

至少需要：

```bash
DATABASE_URL=...
REDIS_URL=...
```

常用变量：

```bash
SEARCH_DATABASE_SCHEMA=public
INGEST_SOURCE_IDS=tjcu-main-notices,tjcu-library,tjcu-academic-affairs,tjcu-undergrad-admissions
RUN_COMMUNITY_INGESTION=false
INGEST_COMMUNITY_SOURCE_IDS=tjcu-tieba
INGEST_QUEUE_NAME=campus-rag:ingestion
```

## 4. 启动前检查

### 4.1 初始化数据库 schema

```bash
npm run db:init
```

这一步会确保 `search_feedback`、`search_query_logs`、`service_event_logs` 以及 ingestion 相关表都存在。

### 4.2 本地基线检查

```bash
npm run smoke:search-service
npm run test:unit
npm run build
```

### 4.3 带数据库的 telemetry 检查

```bash
npm run test:telemetry:postgres
```

这个脚本会执行：

- `db:init`
- 启动本地 `search-service`
- 写入一条 query log
- 写入一条 feedback
- 校验 `/health` 的 `checks.telemetryWritable`
- 校验 `/metrics.persistent`

## 5. 健康检查与观测入口

### 5.1 `/health`

排查重点字段：

- `status`
  - `ok`：当前模式可服务
  - `degraded`：存在数据库或 telemetry 降级，但不一定阻断 seed / fallback 路径
  - `error`：例如 `SEARCH_SERVICE_PROVIDER=postgres` 且数据库不可达
- `databaseRequired` / `telemetryRequired`
  - `true`：当前模式下数据库和持久化观测应视为必需
  - `false`：例如 `seed` demo 模式，即使进程环境里残留 `DATABASE_URL`，也不应把数据库不可达当成阻断告警
- `mode`
  - `provider`
  - `answerMode`
  - `retrievalMode`
  - `rerankMode`
- `checks`
  - `databaseReachable`
  - `telemetryWritable`
  - `scheduledIngestionConfigured`
  - `optionalFeatures`

手工检查命令：

```bash
curl http://127.0.0.1:8080/health
```

### 5.2 `/metrics`

`/metrics` 现在分两层：

- 顶层 runtime metrics：当前进程内请求计数、平均耗时、provider 分布、status 分布
- `persistent`：最近 24 小时的 Postgres 聚合结果

重点字段：

- `persistent.enabled`
- `persistent.requestsTotal`
- `persistent.averageDurationMs`
- `persistent.byStatus`
- `persistent.byCacheStatus`
- `persistent.byErrorCode`
- `persistent.recentIngestionFailures`

手工检查命令：

```bash
curl http://127.0.0.1:8080/metrics
```

### 5.3 自动告警检查脚本

第二轮新增了仓库内的自动化检查入口：

```bash
npm run check:phase-three-ops
```

默认读取：

- `SEARCH_SERVICE_URL`
- 或显式 `SEARCH_SERVICE_HEALTH_URL` / `SEARCH_SERVICE_METRICS_URL`

可调阈值：

```bash
OPS_ALLOW_DEGRADED=false
OPS_REQUIRE_PERSISTENT=auto
OPS_MAX_ERROR_RATE=0.2
OPS_MAX_AVERAGE_DURATION_MS=3000
OPS_MAX_UPSTREAM_TIMEOUTS=5
OPS_MAX_RECENT_INGESTION_FAILURES=0
OPS_REQUEST_TIMEOUT_MS=5000
OPS_OUTPUT_PATH=reports/ops-health-check.json
```

这个脚本会：

- 拉取 `/health`
- 拉取 `/metrics`
- 校验 `status`、`databaseRequired`、`telemetryRequired`、`databaseReachable`、`telemetryWritable`
- 按阈值检查 `persistent.errorRate`、平均耗时、`upstream_timeout` 数量和最近 ingestion 失败数
- 输出一份 JSON 报告，并在违规时返回非零退出码

`OPS_REQUIRE_PERSISTENT=auto` 现在按 `/health.telemetryRequired` 自动判断，而不是简单按“是否配置了 `DATABASE_URL`”判定。这意味着：

- 真实 Postgres / auto-with-database 部署仍会把持久化观测视为必需
- seed / demo 模式不会因为本地遗留的 `DATABASE_URL` 配置而被误判成必须通过持久化指标

如果你要在本机验证纯 seed / demo 路径，而 `.env.local` 默认带了数据库配置，可以这样启动：

```powershell
$env:SEARCH_SERVICE_DISABLE_ENV_FILE='1'
$env:SEARCH_SERVICE_PROVIDER='seed'
$env:SEARCH_SERVICE_URL='http://127.0.0.1:8080/api/search'
node search-service/server.cjs
```

然后在另一终端执行：

```powershell
$env:SEARCH_SERVICE_URL='http://127.0.0.1:8080/api/search'
$env:OPS_REQUIRE_PERSISTENT='never'
npm run check:phase-three-ops
```

### 5.4 GitHub Actions 定时检查

仓库现在额外提供 `.github/workflows/ops-health-check.yml`，用于对已部署的 `search-service` 做定时或手动检查。

最小配置：

- `OPS_SEARCH_SERVICE_URL` secret

可选变量：

- `OPS_SEARCH_SERVICE_HEALTH_URL`
- `OPS_SEARCH_SERVICE_METRICS_URL`
- `OPS_ALLOW_DEGRADED`
- `OPS_REQUIRE_PERSISTENT`
- `OPS_MAX_ERROR_RATE`
- `OPS_MAX_AVERAGE_DURATION_MS`
- `OPS_MAX_UPSTREAM_TIMEOUTS`
- `OPS_MAX_RECENT_INGESTION_FAILURES`

workflow 会把检查结果写到 `reports/ops-health-check.json` 并上传为 artifact。

## 6. 常用排障 SQL

### 6.1 最近 query logs

```sql
select
  request_id,
  query,
  status,
  cache_status,
  error_code,
  gateway_event,
  duration_ms,
  created_at
from search_query_logs
order by created_at desc
limit 20;
```

### 6.2 最近 feedback

```sql
select
  request_id,
  query,
  rating,
  reason,
  created_at
from search_feedback
order by created_at desc
limit 20;
```

### 6.3 最近服务事件

```sql
select
  service,
  level,
  event,
  request_id,
  error_code,
  message,
  created_at
from service_event_logs
order by created_at desc
limit 50;
```

### 6.4 最近 ingestion 失败

```sql
select
  service,
  event,
  message,
  payload,
  created_at
from service_event_logs
where level = 'error'
  and (event like 'ingestion%' or event like 'scheduled_ingestion.%')
order by created_at desc
limit 20;
```

## 7. 备份与恢复

### 7.1 逻辑备份

```bash
pg_dump "$env:DATABASE_URL" --format=custom --file campus-rag-backup.dump
```

如果只想导出 schema：

```bash
pg_dump "$env:DATABASE_URL" --schema-only --file campus-rag-schema.sql
```

### 7.2 恢复

```bash
pg_restore --clean --if-exists --dbname "$env:DATABASE_URL" campus-rag-backup.dump
```

恢复后至少复验：

```bash
npm run smoke:postgres
npm run test:telemetry:postgres
```

## 8. Docker / Compose 回滚

### 8.1 web 或 search-service 回滚

1. 保留上一版镜像 tag，不要只覆盖 `latest`
2. 在 Compose 或部署平台中把 `web` / `search-service` 指回上一版镜像
3. 先检查 `/health`
4. 再跑 `npm run smoke:search-service`

### 8.2 数据回滚

只在 schema 变更或坏数据污染确认后执行：

1. 停掉 ingestion worker 与定时任务
2. 用最近一次 `pg_dump` 备份恢复
3. 跑 `npm run db:init` 补新表或缺列
4. 复验 `npm run smoke:postgres` 与 `npm run test:telemetry:postgres`

## 9. 当前仍未完成的第三阶段事项

这轮已经补齐的是：

- `web` 与 Postgres 的边界纠正
- `search-service` 的 telemetry 持久化入口
- `/health` 的运行时 checks
- `/metrics.persistent`
- scheduled ingestion 的结构化事件留痕
- 第三阶段 runbook 与验证脚本

仍未完成的是：

- 外部监控平台接入
- 外部通知链路
- 备份 / 恢复 / 回滚的真实演练记录
- 更完整的来源治理与后台看板
