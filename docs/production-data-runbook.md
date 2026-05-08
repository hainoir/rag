# 生产资源接入与真实数据闭环验收教程

这份教程用于完成阶段一最后的生产资源接入：把项目连接到真实 PostgreSQL、真实 Redis，并跑通官方来源同步、队列化 ingestion、Postgres 检索和社区内容审核。

教程默认你已经在本机进入项目目录：

```bash
cd D:\code\Project\rag
```

## 0. 最终目标

完成后，你应该能证明：

- PostgreSQL 中已经创建项目表结构。
- 官方来源可以同步到 `documents / document_versions / chunks / ingestion_runs`。
- Redis 队列可以入队 ingestion job，并由 worker 消费。
- `search-service` 可以从 Postgres 检索真实 chunks。
- 社区内容如果开启，会经过文本审核接口。
- GitHub Actions 可以定时执行官方源同步。

不能只看本地 seed demo。seed demo 只能证明演示链路，不能证明真实数据闭环。

## 1. 准备清单

你需要准备：

- 一个托管 PostgreSQL 实例。
- 一个托管 Redis 实例。
- 一个 GitHub 仓库权限账号，可以配置 Actions Secrets。
- 可选：一个文本审核 API key，接口兼容 `/moderations`。
- 本地 Node.js 环境和当前项目依赖。

先确认本地依赖可用：

```bash
npm ci
npm run lint
npm run format:check
npm run build
```

如果 `npm run build` 后 `next-env.d.ts` 被 Next.js 自动改成 `.next/types`，把它恢复为仓库原来的 `.next/dev/types`，不要把构建副作用当成功能改动提交。

## 2. 创建 PostgreSQL

可以使用任意托管 PostgreSQL。选择时看四点：

- 支持外部连接。
- 支持 SSL 连接。
- 支持 `pgcrypto` 和 `pg_trgm`。
- 最好支持自动备份。

如果后续要做向量检索，还需要支持 `pgvector`。

创建完成后，你会得到一个连接串：

```bash
DATABASE_URL=postgres://USER:PASSWORD@HOST:5432/DBNAME?sslmode=require
```

如果平台给的是分段配置，就自己拼成：

```bash
postgres://用户名:密码@主机:端口/数据库名?sslmode=require
```

注意：

- 密码里如果有 `@`、`#`、`:`、`/` 等特殊字符，需要 URL encode。
- 生产连接串不要写进 Git。
- 本地只写入 `.env.local`。
- GitHub Actions 只写入 Secrets。

## 3. 创建 Redis

可以使用任意托管 Redis。要求支持这些命令：

- `LPUSH`
- `RPOP`
- `GET`
- `SET`
- `INCR`
- `EXPIRE`

创建完成后，你会得到：

```bash
REDIS_URL=rediss://default:PASSWORD@HOST:PORT
```

如果平台只支持非 TLS，本地测试可以是：

```bash
REDIS_URL=redis://default:PASSWORD@HOST:PORT
```

生产建议优先使用 `rediss://`。

## 4. 配置本地环境变量

复制 `.env.example`：

```bash
Copy-Item .env.example .env.local
```

打开 `.env.local`，至少填这些：

```bash
DATABASE_URL=postgres://USER:PASSWORD@HOST:5432/DBNAME?sslmode=require
REDIS_URL=rediss://default:PASSWORD@HOST:PORT
SEARCH_DATABASE_SCHEMA=public
SEARCH_SERVICE_PROVIDER=postgres
SEARCH_SERVICE_URL=http://localhost:8080/api/search
INGEST_QUEUE_NAME=campus-rag:ingestion
```

官方来源建议先保持默认：

```bash
INGEST_SOURCE_IDS=tjcu-main-notices,tjcu-library,tjcu-academic-affairs,tjcu-undergrad-admissions,tjcu-grad-admissions
INGEST_FETCH_LIMIT=12
INGEST_HTTP_TIMEOUT_MS=15000
INGEST_CONCURRENCY=4
INGEST_RETRY_ATTEMPTS=2
INGEST_RETRY_DELAY_MS=500
```

社区来源先不要急着打开。需要测试时再配置：

```bash
INGEST_COMMUNITY_SOURCE_IDS=tjcu-tieba
CONTENT_MODERATION_MODE=report
CONTENT_MODERATION_API_KEY=你的审核接口 key
CONTENT_MODERATION_BASE_URL=https://api.openai.com/v1
CONTENT_MODERATION_MODEL=omni-moderation-latest
CONTENT_MODERATION_TIMEOUT_MS=8000
```

模式选择：

- `off`：不审核。
- `report`：审核并记录风险，但仍允许入库。
- `enforce`：命中风险或审核 API 失败时跳过社区文章。

第一次接社区源建议用 `report`，稳定后再改 `enforce`。

## 5. 初始化数据库

执行：

```bash
npm run db:init
```

成功标准：

- 命令没有报错。
- PostgreSQL 中能看到这些表：
  - `source_registry`
  - `documents`
  - `document_versions`
  - `chunks`
  - `ingestion_runs`
  - `ingestion_run_items`
  - `search_feedback`
  - `search_query_logs`

如果失败：

- 检查 `DATABASE_URL` 是否正确。
- 检查数据库是否允许公网或当前 IP 访问。
- 检查是否必须带 `sslmode=require`。
- 检查数据库用户是否有创建 extension 和 table 的权限。

## 6. 跑官方来源同步

先直接跑一次官方源，不经过队列：

```bash
npm run ingest:official
```

成功时会输出每个 source 的统计，例如：

```text
source=tjcu-library fetched=... stored=... deduped=... stale=... skipped=... chunks=... errors=0
```

然后查看 ingestion 状态：

```bash
npm run inspect:ingestion
```

成功标准：

- 至少 3 到 5 个官方 source 有文档。
- `latestVersionChunks` 大于 0。
- 最近一次 run 不是全部 failed。

如果某个 source 失败，不一定代表整体失败。先看是否还有其他官方源成功。阶段一目标是先稳定 3 到 5 个官方源。

## 7. 验证 Postgres 检索

执行：

```bash
npm run smoke:postgres
```

成功标准：

- 能找到健康 source。
- 能用真实 query 命中 Postgres chunks。
- 无命中 query 不会误判成成功。

再跑 Postgres 集成测试：

```bash
npm run test:ingestion:postgres
```

如果这两个都通过，说明真实数据库链路已经基本闭合。

也可以一键跑：

```bash
npm run verify:real-data
```

它会串起：

```bash
npm run db:init
npm run ingest:official
npm run inspect:ingestion
npm run smoke:postgres
npm run test:ingestion:postgres
```

## 8. 验证 Redis 队列

先入队一个官方同步任务：

```bash
npm run ingest:enqueue -- official
```

你应该看到类似：

```text
queued ingestion job id=... kind=official sources=tjcu-main-notices,...
```

然后消费一次：

```bash
npm run ingest:worker -- --once
```

成功时会看到：

```text
processing ingestion job id=... kind=official sources=...
job=... source=... fetched=... stored=... deduped=... stale=... skipped=... chunks=... errors=...
```

也可以直接跑便捷脚本：

```bash
npm run ingest:scheduled:official
```

这个脚本等价于：

```bash
npm run ingest:enqueue -- official
npm run ingest:worker -- --once
```

如果失败：

- 检查 `REDIS_URL`。
- 检查 Redis 是否允许当前 IP 访问。
- 如果是 TLS Redis，连接串必须用 `rediss://`。
- 检查 `INGEST_QUEUE_NAME` 是否和 workflow 中一致。

## 9. 验证 search-service 使用真实数据

开一个终端启动 search-service：

```bash
npm run search-service
```

确认健康状态：

```bash
curl http://localhost:8080/health
```

然后搜索一个真实问题：

```bash
curl "http://localhost:8080/api/search?q=图书馆借书需要什么证件"
```

成功标准：

- 返回 `status: "ok"` 或至少不是服务错误。
- `sources` 来自 Postgres ingestion 数据。
- 来源里有 `sourceName`、`publishedAt`、`fetchedAt`、`lastVerifiedAt` 等字段。

如果返回 seed 数据，检查：

```bash
SEARCH_SERVICE_PROVIDER=postgres
DATABASE_URL=...
```

如果你使用 `SEARCH_SERVICE_PROVIDER=auto`，数据库失败时可能回退 seed。验收真实闭环时建议强制用 `postgres`。

## 10. 验证前端读取真实上游

开两个终端。

终端 1：

```bash
npm run search-service
```

终端 2：

```bash
npm run dev
```

浏览器访问：

```text
http://localhost:3000
```

搜索一个真实问题。成功标准：

- 页面能进入结果页。
- 结果不是固定 seed fallback。
- 来源卡片展示真实来源信息。
- 如果无答案，页面进入无答案兜底，而不是崩溃。

## 11. 配置 GitHub Actions Secrets

进入 GitHub 仓库：

```text
Settings -> Secrets and variables -> Actions
```

添加 Secrets：

```text
DATABASE_URL
REDIS_URL
CONTENT_MODERATION_API_KEY
```

添加 Variables：

```text
SEARCH_DATABASE_SCHEMA=public
INGEST_QUEUE_NAME=campus-rag:ingestion
CONTENT_MODERATION_MODE=report
CONTENT_MODERATION_BASE_URL=https://api.openai.com/v1
CONTENT_MODERATION_MODEL=omni-moderation-latest
RUN_COMMUNITY_INGESTION=false
INGEST_SOURCE_IDS=tjcu-main-notices,tjcu-library,tjcu-academic-affairs,tjcu-undergrad-admissions,tjcu-grad-admissions
INGEST_COMMUNITY_SOURCE_IDS=tjcu-tieba
```

先保持：

```text
RUN_COMMUNITY_INGESTION=false
CONTENT_MODERATION_MODE=report
```

等官方同步稳定后，再考虑：

```text
RUN_COMMUNITY_INGESTION=true
CONTENT_MODERATION_MODE=enforce
```

## 12. 手动触发 GitHub Actions

进入 GitHub：

```text
Actions -> Scheduled Ingestion -> Run workflow
```

成功标准：

- `Skip when DATABASE_URL is not configured` 没有触发。
- `Skip queued ingestion when REDIS_URL is not configured` 没有触发。
- `Run official ingestion` 成功。
- 日志中能看到 `queued ingestion job`。
- 日志中能看到 `processing ingestion job`。
- 最终能看到每个 source 的 fetched/stored/chunks/errors 统计。

当前 workflow 调度：

- 官方源：UTC 18:00，香港时间 02:00。
- 社区源：每小时检查一次，但只有 `RUN_COMMUNITY_INGESTION=true` 执行。

## 13. 社区源上线流程

不要一开始就打开所有社区源。建议顺序：

1. 只开 `tjcu-tieba`。
2. `CONTENT_MODERATION_MODE=report`。
3. 手动跑：

```bash
npm run ingest:scheduled:community
```

4. 看日志里是否有：

```text
community_content.flagged
```

5. 看 `inspect:ingestion` 中社区源是否有稳定 chunks。
6. 确认没有明显风险后，GitHub Variables 设置：

```text
RUN_COMMUNITY_INGESTION=true
CONTENT_MODERATION_MODE=enforce
```

社区源的产品口径必须保持：

- 低权重。
- 经验补充。
- 不作为高置信事实依据。
- 优先展示官方来源。

## 14. 最终验收清单

阶段一只有满足下面条件，才算完成：

- `npm run lint` 通过。
- `npm run format:check` 通过。
- `npm run build` 通过。
- `npm run db:init` 在真实 PostgreSQL 上通过。
- `npm run ingest:official` 在真实 PostgreSQL 上通过。
- `npm run inspect:ingestion` 能看到真实 source、documents、chunks。
- `npm run smoke:postgres` 通过。
- `npm run test:ingestion:postgres` 通过。
- `npm run ingest:scheduled:official` 在真实 Redis + PostgreSQL 下通过。
- `npm run search-service` 能用 Postgres provider 返回真实 sources。
- GitHub Actions 手动触发官方同步成功。
- 如果开启社区源，`CONTENT_MODERATION_MODE` 已设置为 `report` 或 `enforce`。

## 15. 常见问题

### `DATABASE_URL is required`

说明 `.env.local` 没有加载到 `DATABASE_URL`，或变量为空。检查 `.env.local` 和命令执行目录。

### `permission denied to create extension`

数据库用户没有创建 extension 权限。需要在数据库控制台手动启用 `pgcrypto` 和 `pg_trgm`，或换有权限的用户初始化。

### `queued ingestion` 失败

优先检查：

- `REDIS_URL` 是否为空。
- `redis://` / `rediss://` 是否和平台要求一致。
- Redis 是否限制 IP。
- 密码是否需要 URL encode。

### `smoke:postgres` 没有健康来源

通常是 ingestion 没同步到有效 chunks。先跑：

```bash
npm run inspect:ingestion
```

确认至少几个官方源有 `documents > 0` 和 `latestVersionChunks > 0`。

### GitHub Actions 跳过任务

如果日志显示：

```text
DATABASE_URL secret is not configured
```

或：

```text
REDIS_URL secret is not configured
```

说明 Secrets 没配，或者配在了错误仓库/环境。

### 社区内容全部被跳过

如果 `CONTENT_MODERATION_MODE=enforce`，审核 API 失败也会跳过。先改成：

```bash
CONTENT_MODERATION_MODE=report
```

确认审核接口稳定后再切回 `enforce`。

## 16. 建议提交前记录

完成真实验收后，建议把以下信息记录到项目报告或 issue：

- PostgreSQL provider。
- Redis provider。
- `db:init` 时间。
- 官方 ingestion run 时间。
- 成功 source 数。
- documents 数。
- chunks 数。
- `smoke:postgres` 结果。
- GitHub Actions run 链接。
- 社区审核模式。

不要记录任何密钥、连接串、数据库密码或 API key。
