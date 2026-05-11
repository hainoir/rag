# 阶段一：数据与基建落地说明

这份说明对应“阶段一：夯实数据与基建”。目标是让当前项目从本地 demo 进入可接生产资源的状态：依赖可复现、校验可阻断、PostgreSQL/Redis 可接入、ingestion 可队列化调度、社区内容可审核。

## 1. 依赖与强校验

当前仓库已经满足阶段一的基础要求：

- `package-lock.json` 固定 npm 依赖解析结果。
- `package.json` 中依赖版本使用精确版本号。
- `npm run lint` 使用 `eslint . --max-warnings=0`，warning 也会阻断。
- `npm run format:check` 使用 Prettier 检查 README、docs、package、Compose、ESLint 和 GitHub Actions 配置。
- `npm run audit:high` 检查 high 级别及以上依赖风险。
- CI 已串联 `audit:high`、`lint`、`format:check`、contract、demo、evaluation、unit、build 和 e2e。

阶段一提交前至少跑：

```bash
npm run audit:high
npm run lint
npm run format:check
npm run verify:search-contract
npm run test:ingestion:unit
npm run build
```

## 2. PostgreSQL 与 Redis 生产实例

生产环境需要两个托管资源：

- PostgreSQL：保存来源注册、文档版本、chunks、ingestion runs、feedback、query logs。
- Redis：搜索网关缓存、限流，以及 queued ingestion 的任务队列。

推荐配置：

| 资源       | 最低建议                            | 说明                                                  |
| ---------- | ----------------------------------- | ----------------------------------------------------- |
| PostgreSQL | 托管 Postgres 16，开启自动备份      | 需要支持 `pgcrypto`、`pg_trgm`；向量检索需 `pgvector` |
| Redis      | 托管 Redis，启用 TLS 和持久化或副本 | 队列与限流共用，建议单独 key prefix                   |
| Secrets    | 部署平台或 GitHub Secrets 管理      | 禁止写入仓库                                          |

必需变量：

```bash
DATABASE_URL=postgres://...
REDIS_URL=redis://...
SEARCH_DATABASE_SCHEMA=public
INGEST_QUEUE_NAME=campus-rag:ingestion
```

初始化数据库：

```bash
npm run db:init
```

真实数据验收：

```bash
npm run ingest:official
npm run inspect:ingestion
npm run smoke:postgres
npm run test:ingestion:postgres
```

## 3. 队列化摄取任务

阶段一新增了 Redis-backed ingestion queue：

- 入队：`npm run ingest:enqueue -- official`
- 入队社区源：`npm run ingest:enqueue -- community`
- 入队指定源：`npm run ingest:enqueue -- source tjcu-library`
- 消费一次：`npm run ingest:worker -- --once`
- 持续消费：`npm run ingest:worker`

便捷脚本：

```bash
npm run ingest:scheduled:official
npm run ingest:scheduled:community
```

这两个脚本会先入队，再启动 worker 消费一次，适合 GitHub Actions、cron 或云平台 scheduled job。

当前 GitHub Actions 调度：

- 官方源：每天 UTC 18:00 执行。
- 社区源：每小时检查一次，只有 `RUN_COMMUNITY_INGESTION=true` 时执行。

社区源默认仍保持保守策略。没有审核、质量阈值和人工复核前，不建议扩大默认社区来源范围。

## 4. 社区文本审核

阶段一新增 OpenAI-compatible `/moderations` 接口接入。它只作用于 `community_thread` 清洗后的正文。

环境变量：

```bash
CONTENT_MODERATION_MODE=off
CONTENT_MODERATION_API_KEY=...
CONTENT_MODERATION_BASE_URL=https://api.openai.com/v1
CONTENT_MODERATION_MODEL=omni-moderation-latest
CONTENT_MODERATION_TIMEOUT_MS=8000
```

模式说明：

- `off`：默认关闭，不调用审核接口。
- `report`：调用审核接口，命中风险时记录结构化日志，但仍允许入库。
- `enforce`：调用审核接口，命中风险或审核接口失败时跳过该社区文章。

生产建议：

- 官方源可不走文本审核。
- 社区源首次接入建议先使用 `CONTENT_MODERATION_MODE=report`，先观察风险命中和误杀情况。
- 官方同步和审核接口稳定后，再切到 `enforce`，同时保持社区来源低权重。

## 5. 阶段一验收清单

- `npm run lint` 通过。
- `npm run format:check` 通过。
- `npm run build` 通过。
- `npm run test:ingestion:unit` 通过。
- PostgreSQL 实例已配置 `DATABASE_URL` 并完成 `npm run db:init`。
- Redis 实例已配置 `REDIS_URL`。
- `npm run ingest:scheduled:official` 能完成一次官方源入队和消费。
- 如开启社区源，`CONTENT_MODERATION_MODE` 已明确设为 `report` 或 `enforce`。
- `npm run inspect:ingestion` 能看到 ingestion run 和 chunk 统计。

## 6. 当前边界

本仓库已补齐项目侧接入点，但真实生产实例仍需要在云平台手动创建或通过 IaC 创建。没有可连接的 `DATABASE_URL` 和 `REDIS_URL` 时，只能证明代码路径和本地 demo 可用，不能声称真实生产数据闭环已经上线。
