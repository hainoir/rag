# 演示与部署运行手册

## 固定演示问题

建议保留三类 query，用于覆盖主要状态：

- `图书馆借书`：期望 `ok`，展示官方来源、答案摘要和依据片段。
- `宿舍报修流程`：期望 `partial` 或 `ok`，取决于是否已同步学生处 / 后勤来源。
- `明天校园集市几点开始`：期望 `empty`，用于证明系统不会在无来源时编造答案。

## 本地服务分工

- Next.js 前端：`npm run dev`，默认 `http://localhost:3000`。
- 上游搜索服务：`npm run search-service`，默认 `http://127.0.0.1:8080/api/search`。
- Postgres：通过 `docker compose up -d postgres` 或托管数据库提供。
- 摄取任务：手动运行 `npm run ingest:official`；后续部署时可放进 cron / scheduled job。

## 部署边界

生产部署时不要让前端直接读数据库。前端仍然只访问 `/api/search`，由 Route Handler 调用 `SEARCH_SERVICE_URL`。搜索服务负责读取 Postgres、排序 chunks、生成 extractive answer，并返回 `SearchResponse`。

最低环境变量：

```bash
SEARCH_SERVICE_URL=https://your-search-service.example.com/api/search
SEARCH_SERVICE_METHOD=POST
SEARCH_SERVICE_TIMEOUT_MS=8000
DATABASE_URL=postgres://...
SEARCH_SERVICE_PROVIDER=postgres
INGEST_SOURCE_IDS=tjcu-main-notices,tjcu-library,tjcu-academic-affairs,tjcu-undergrad-admissions,tjcu-grad-admissions
```

## 发布前检查

```bash
npm run verify:search-contract
npm run smoke:postgres
npm run test:ingestion
npm run build
```

如果没有配置 `DATABASE_URL`，`npm run smoke:postgres` 会失败，`npm run test:ingestion` 也无法证明真实数据库闭环。发布前至少要让 smoke 检查和 Postgres 集成测试都通过。
