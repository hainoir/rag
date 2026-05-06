# 本地 Postgres 与真实检索闭环

本项目现在支持两种上游搜索模式：

- `SEARCH_SERVICE_PROVIDER=seed`：只使用内置 seed corpus，适合无数据库演示。
- `SEARCH_SERVICE_PROVIDER=postgres`：只读取 Postgres 中的 ingestion 结果，适合验证真实数据闭环。
- `SEARCH_SERVICE_PROVIDER=auto`：默认模式；配置了 `DATABASE_URL` 时优先读 Postgres，数据库请求失败时回退 seed。

回答模式独立于搜索模式：`SEARCH_ANSWER_MODE=extractive` 不调用模型；`SEARCH_ANSWER_MODE=llm` 会在检索命中后调用 OpenAI-compatible LLM，并要求回答绑定已有 sourceId。

## 启动数据库

```bash
docker compose up -d postgres
```

`.env.local` 至少需要：

```bash
DATABASE_URL=postgres://postgres:postgres@127.0.0.1:5432/postgres
SEARCH_DATABASE_SCHEMA=public
SEARCH_SERVICE_PROVIDER=postgres
SEARCH_SERVICE_URL=http://localhost:8080/api/search
SEARCH_ANSWER_MODE=extractive
```

Next.js、`search-service` 和 ingestion CLI 都会读取 `.env.local`；命令行显式设置的环境变量优先级更高。

## 一键本地编排

`docker-compose.yml` 现在包含 `postgres`、`search-service` 和 `web` 三个服务。需要完整本地部署时：

```bash
npm run compose:up
```

服务端口：

- `web`：`http://localhost:3000`
- `search-service`：`http://localhost:8080`
- `postgres`：`127.0.0.1:5432`

容器内前端通过 `http://search-service:8080/api/search` 调用搜索服务，仍然不直连数据库。停止和清理容器时：

```bash
npm run compose:down
```

## 初始化、摄取和检查

```bash
npm run smoke:search-service
npm run db:init
npm run ingest:official
npm run inspect:ingestion
npm run smoke:postgres
npm run test:ingestion:postgres
```

默认同步 5 个官方源：主站、图书馆、教务处、本科招生网、研究生招生网。需要扩展时可设置：

```bash
INGEST_SOURCE_IDS=tjcu-main-notices,tjcu-library,tjcu-academic-affairs,tjcu-student-affairs,tjcu-logistics,tjcu-career,tjcu-undergrad-admissions,tjcu-grad-admissions
```

社区来源使用单独命令，默认只同步 `tjcu-tieba`，也可以显式指定 `tjcu-zhihu`：

```bash
npm run ingest:community
npm run ingest:community -- tjcu-zhihu
```

社区内容会按 `community_thread` profile 清洗，并隐藏手机号、邮箱和常见微信 / QQ 联系方式。它的 `trustWeight` 低于官方来源，搜索结果中只能作为经验补充。

`npm run smoke:postgres` 是本地闭环的最小自动验收：默认要求至少 3 个官方源已有文档和最新 chunk，`图书馆` 能在 Postgres 中命中，`明天校园集市几点开始` 保持 `empty`。Postgres 检索会使用 `ILIKE` 候选、`pg_trgm` 相似度和应用层来源权重共同排序。如果需要替换演示 query，可以通过 `SEARCH_SMOKE_HIT_QUERY`、`SEARCH_SMOKE_EMPTY_QUERY` 和 `SEARCH_SMOKE_MIN_SOURCES` 覆盖。

如果只想跑不依赖数据库的 ingestion 单元测试，使用 `npm run test:ingestion:unit`。`npm run test:ingestion:postgres` 会强制要求可连接的 `DATABASE_URL`，避免把本地 seed 或跳过数据库的测试误判成真实闭环。

需要一条命令复验真实链路时，使用：

```bash
npm run verify:real-data
```

## 可选 pgvector

如果数据库支持 pgvector，并且已完成 `db:init` 与至少一次 ingestion，可以增加向量字段和 embedding：

```bash
npm run vector:init
npm run embed:chunks
npm run smoke:vector
```

需要的最小环境变量：

```bash
EMBEDDING_API_KEY=...
EMBEDDING_BASE_URL=https://api.openai.com/v1
EMBEDDING_MODEL=text-embedding-3-small
EMBEDDING_DIMENSIONS=1536
```

`vector:init` 会创建 `vector` extension，并给 `chunks` 增加 `embedding / embedding_model / embedded_at` 字段与向量索引。`embed:chunks` 只处理最新 active document version 中尚未写入 embedding 的 chunk。没有 `EMBEDDING_API_KEY` 时，它会输出 skip/dry-run 信息，不会伪装成已完成 embedding。

搜索服务会自动检测 `chunks.embedding` 字段和 embedding key。条件满足时走 lexical + vector hybrid retrieval；条件不满足或 query embedding 失败时，Postgres 搜索继续回到 lexical / pg_trgm 路径。

## 可选 rerank

如果配置了兼容 `/rerank` 的 cross-encoder 服务，Postgres 候选会进入二阶段重排：

```bash
RERANK_API_KEY=...
RERANK_BASE_URL=https://your-rerank-provider.example.com/v1
RERANK_MODEL=your-rerank-model
RERANK_TOP_K=20
```

没有这些环境变量时，rerank 默认关闭。rerank 失败只会记录 `rerank.failed`，不会让搜索请求失败。

## Metrics

搜索服务提供轻量 JSON metrics：

```bash
curl http://localhost:8080/metrics
```

当前记录请求总数、平均耗时、resolved provider、结果状态、fallback 原因和错误分类。它适合本地 smoke 和后续接监控前的轻量排查，不替代生产监控系统。

## 运行查询链路

```bash
npm run search-service
npm run dev
```

然后访问 `http://localhost:3000/search?q=图书馆借书`。如果 `SEARCH_SERVICE_PROVIDER=postgres` 且数据库没有命中，页面应该进入 `empty` 或 `partial`，而不是返回 seed corpus 的演示数据。

成功标准：

- `npm run smoke:search-service` 在无数据库场景下能证明上游 HTTP 服务和 seed fallback 可用。
- `npm run inspect:ingestion` 至少显示 3 个官方源有 `documents > 0` 且 `latestVersionChunks > 0`。
- `npm run smoke:postgres` 输出 `Postgres smoke passed`。
- `npm run test:ingestion:postgres` 输出 `PASS postgres integration`。
- `SEARCH_SERVICE_PROVIDER=postgres` 时，预期无命中 query 不应因为 `校园`、`通知` 这类泛词返回演示答案。
