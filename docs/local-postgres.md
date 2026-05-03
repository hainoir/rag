# 本地 Postgres 与真实检索闭环

本项目现在支持两种上游搜索模式：

- `SEARCH_SERVICE_PROVIDER=seed`：只使用内置 seed corpus，适合无数据库演示。
- `SEARCH_SERVICE_PROVIDER=postgres`：只读取 Postgres 中的 ingestion 结果，适合验证真实数据闭环。
- `SEARCH_SERVICE_PROVIDER=auto`：默认模式；配置了 `DATABASE_URL` 时优先读 Postgres，数据库请求失败时回退 seed。

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
```

Next.js、`search-service` 和 ingestion CLI 都会读取 `.env.local`；命令行显式设置的环境变量优先级更高。

## 初始化、摄取和检查

```bash
npm run db:init
npm run ingest:official
npm run inspect:ingestion
npm run smoke:postgres
```

默认同步 5 个官方源：主站、图书馆、教务处、本科招生网、研究生招生网。需要扩展时可设置：

```bash
INGEST_SOURCE_IDS=tjcu-main-notices,tjcu-library,tjcu-academic-affairs,tjcu-student-affairs,tjcu-logistics,tjcu-career,tjcu-undergrad-admissions,tjcu-grad-admissions
```

`npm run smoke:postgres` 是本地闭环的最小自动验收：默认要求至少 3 个官方源已有文档和最新 chunk，`图书馆` 能在 Postgres 中命中，`明天校园集市几点开始` 保持 `empty`。如果需要替换演示 query，可以通过 `SEARCH_SMOKE_HIT_QUERY`、`SEARCH_SMOKE_EMPTY_QUERY` 和 `SEARCH_SMOKE_MIN_SOURCES` 覆盖。

## 运行查询链路

```bash
npm run search-service
npm run dev
```

然后访问 `http://localhost:3000/search?q=图书馆借书`。如果 `SEARCH_SERVICE_PROVIDER=postgres` 且数据库没有命中，页面应该进入 `empty` 或 `partial`，而不是返回 seed corpus 的演示数据。

成功标准：

- `npm run inspect:ingestion` 至少显示 3 个官方源有 `documents > 0` 且 `latestVersionChunks > 0`。
- `npm run smoke:postgres` 输出 `Postgres smoke passed`。
- `SEARCH_SERVICE_PROVIDER=postgres` 时，预期无命中 query 不应因为 `校园`、`通知` 这类泛词返回演示答案。
