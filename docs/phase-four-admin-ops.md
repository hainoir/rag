# 第四阶段管理后台与运营闭环运行手册

这份文档对应第四阶段代码侧运营 MVP。它解决的是“维护者如何看见、判断并处理来源、查询日志、用户反馈和社区内容”，不是第五阶段发布包装，也不是完整多角色账号系统。

## 1. 当前边界

已经具备：

- `/admin/login`：使用 `ADMIN_DASHBOARD_TOKEN` 登录，成功后写入 HttpOnly 管理 cookie。
- `/admin`：来源治理、同步记录、查询反馈、社区审核四个工作台视图。
- `search-service /api/admin/*`：后台只通过 search-service 管理 API 读写 Postgres，不让 Next 页面直连数据库。
- `source_governance_overrides`：来源禁用、权重和更新频率写入 DB 覆盖层，不覆盖 `src/lib/search/source-registry.ts` 的默认注册表。
- `search_query_logs` 增强字段：`source_ids`、`source_snapshot`、`answer_summary`、`answer_confidence`、`result_generated_at`。
- `search_feedback` 处理字段：`status`、`handled_at`、`handled_by`、`admin_note`。
- `community_review_records`：社区内容审核状态和风险级别。

仍不包含：

- 完整用户系统、角色权限或审计登录历史。
- 线上外部监控、真实 webhook 告警和真实备份恢复演练；这些仍属于上线前验收。
- 后台直接编辑代码注册表。默认来源仍从代码维护，运营调整通过 DB 覆盖层生效。

## 2. 环境变量

Next.js 与 search-service 都需要：

```bash
SEARCH_SERVICE_URL=http://localhost:8080/api/search
SEARCH_SERVICE_API_KEY=your-api-key
SEARCH_SERVICE_AUTH_HEADER=Authorization
ADMIN_DASHBOARD_TOKEN=your-admin-dashboard-token
DATABASE_URL=postgres://postgres:postgres@127.0.0.1:5432/postgres
REDIS_URL=redis://127.0.0.1:6379/0
SEARCH_ADMIN_TIMEOUT_MS=8000
```

说明：

- `ADMIN_DASHBOARD_TOKEN` 只用于浏览器登录后台。
- `SEARCH_SERVICE_API_KEY` 用于 Next 后台代理访问 `search-service /api/admin/*`；管理 API 在没有该密钥时 fail-closed。
- `DATABASE_URL` 用于后台读取来源、日志、反馈和审核记录。
- `REDIS_URL` 用于后台手动触发单来源同步；未配置时页面会显示同步入队失败，而不是静默成功。

## 3. 数据治理规则

来源治理：

- `source_registry` 存默认来源信息。
- `source_governance_overrides` 存运营覆盖：`enabled_override`、`trust_weight_override`、`update_cadence_override`、`admin_note`。
- 检索 SQL 使用 effective enabled / trust weight。禁用来源不会参与召回。
- ingestion 在开始同步前读取覆盖层，禁用来源不会继续同步。

社区审核：

- 社区 ingestion 会为社区文档创建 `community_review_records`。
- `pending` 和 `rejected` 不参与召回。
- `supplemental` 可以作为补充来源展示，但不会进入 `answer.evidence`，也不会传给 LLM 生成回答。
- `approved` 才能进入回答证据。

反馈处理：

- 用户反馈按 `request_id` 关联最近一条 query log。
- 后台详情能看到 query、用户评分、原因、source snapshot、回答摘要和处理状态。
- 状态流转为 `new -> reviewing -> resolved / dismissed`；MVP 不强制状态机，只校验枚举合法。

## 4. 本地使用流程

1. 初始化数据库：

```bash
npm run db:init
```

2. 启动 search-service：

```bash
npm run search-service
```

3. 启动 Next：

```bash
npm run dev
```

4. 打开后台：

```text
http://localhost:3000/admin/login
```

5. 用 `ADMIN_DASHBOARD_TOKEN` 登录。

6. 验证来源治理：

- 在“来源治理”里禁用某个来源。
- 保存后确认来源状态变为禁用。
- 点击同步应返回禁用来源不能入队。

7. 验证手动同步：

- 确保 `REDIS_URL` 可用。
- 启用来源并点击同步。
- 另开终端运行：

```bash
npm run ingest:worker -- --once
```

- 回到后台刷新，确认最近同步状态、文档数或错误信息更新。

## 5. 验收命令

无数据库基础验收：

```bash
npm run test:admin
npm run test:query-log
npm run lint
npm run build
```

有 Postgres 时补跑：

```bash
npm run test:admin:postgres
npm run test:telemetry:postgres
```

有 Redis 时补跑：

```bash
npm run ingest:enqueue -- source tjcu-library
npm run ingest:worker -- --once
```

完整回归仍建议保留：

```bash
npm run test:unit
npm run verify:search-contract
npm run verify:demo
npm run e2e -- --reporter=line
```

## 6. 上线前限制

第四阶段代码侧完成不等于 production-grade 后台已经上线。上线前还需要：

- 使用真实 `ADMIN_DASHBOARD_TOKEN` 和 `SEARCH_SERVICE_API_KEY`，并确认密钥没有进入仓库。
- 在真实 Postgres 上跑 `npm run test:admin:postgres`。
- 在真实 Redis 上从后台触发一次单来源同步，并由 worker 成功消费。
- 把 `/health`、`/metrics.persistent`、`service_event_logs` 接入外部监控。
- 使用真实通知渠道跑一次 `notify:phase-three-ops` 成功和失败通知。
- 使用真实主库和临时恢复库跑一次 `backup:drill`。
