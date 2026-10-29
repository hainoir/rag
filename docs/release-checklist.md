# 第五阶段 Release Checklist

这份 checklist 用于把当前项目收口成一个可交付的 release candidate。它不新增 RAG 核心能力，只确认已有代码、数据链路、运维入口、后台治理和演示材料是否达到可复盘状态。

当前默认发布口径：

- 项目定位：校园信息检索 / explainable RAG MVP，上线候选版本。
- 默认检索策略：`hybrid`。
- `rerank`：默认关闭，仅作为显式实验能力。
- 默认回答模式：`extractive`；LLM answer 是可选演示能力。
- 第三阶段运维和第四阶段后台如果没有真实准线上验收记录，只能写作“代码侧完成 / 待上线前验收”。

2026-10-15 验收状态见 `docs/release-acceptance-report.md`。本地可复跑项已勾选。需要 kir 提供生产密钥或外部服务的项保持未勾选，并写明 `blocked`。

## 1. 发布前状态冻结

- [x] 本次候选包含第五阶段验收记录，以及两处验收中发现的代码修复：主站通知正文选择器、后台保存提示被刷新清掉。没有新增 RAG 接口。
- [x] 确认没有修改 `SearchResponse`、搜索 API、Postgres schema 或后台管理 API。
- [x] 确认 `.env.local`、真实密钥、数据库连接串、webhook 地址没有进入仓库。
- [x] 记录当前 commit hash、Node 版本、Postgres/Redis 环境和部署目标。见验收报告。
- [x] 更新 `docs/release-acceptance-report.md` 的环境信息。

## 2. Local Gate

本地 gate 不依赖真实数据库，是任何机器都应能复跑的基础验收。

```bash
npm run verify:release:local
```

等价分解命令：

```bash
npm run format:check
npm run lint
npm run verify:search-contract
npm run verify:demo
npm run test:unit
npm run build
npm run e2e -- --reporter=line
```

通过标准：

- [x] 格式检查通过。
- [x] lint 无 warning。
- [x] `SearchResponse` 契约验证通过。
- [x] seed demo 固定问题验证通过。
- [x] 单元与组件测试通过。
- [x] Next build 通过。
- [x] e2e 覆盖首页、搜索结果、来源展开、无答案和错误态。2026-10-15 修复后复跑 `9 passed`。

## 3. Postgres Gate

Postgres gate 必须使用真实可连接数据库。缺少 `DATABASE_URL`、pgvector/embedding 条件或真实数据时，对应项标记为 `blocked`，不能标记为 `passed`。
聚合脚本会先检查 `DATABASE_URL` 和 `EMBEDDING_API_KEY`，缺失时直接失败。

```bash
npm run verify:release:postgres
```

等价分解命令：

```bash
npm run verify:real-data
npm run verify:retrieval:real
npm run test:telemetry:postgres
npm run test:admin:postgres
```

通过标准：

- [x] `db:init -> ingest:official -> inspect:ingestion -> smoke:postgres -> test:ingestion:postgres` 在本地 Postgres 16.15 通过。官方源 `tjcu-main-notices,tjcu-library,tjcu-academic-affairs,tjcu-undergrad-admissions` 均为 `succeeded`。
- [ ] `verify:retrieval:real` 生成最新 `reports/search-quality-evaluation-*.json` 和 `.md`。blocked：本环境没有 `EMBEDDING_API_KEY`，且本机 Postgres 没有 `vector` 扩展。
- [ ] 最新质量报告确认默认推荐策略仍为 `hybrid`。blocked：没有新报告。2026-05-13 的历史报告仍记录 `hybrid` 优于 `hybrid_rerank`，不能当作本次通过。
- [x] `test:telemetry:postgres` 验证 query log、feedback、`/health` 和 `/metrics.persistent`。本地 Postgres 通过。
- [x] `test:admin:postgres` 验证后台管理 API 与 Postgres 集成。本地 Postgres 通过。

## 4. Ops Gate

Ops gate 必须对可访问的 search-service 执行。缺少真实 `OPS_ALERT_WEBHOOK_URL` 或临时恢复库时，应在验收报告中标记阻塞。
聚合脚本会先检查 search-service URL、`OPS_ALERT_WEBHOOK_URL`、`DATABASE_URL` 和 `BACKUP_DRILL_RESTORE_DATABASE_URL`，缺失时直接失败。

```bash
npm run verify:release:ops
```

等价分解命令：

```bash
npm run check:phase-three-ops
npm run notify:phase-three-ops
npm run backup:drill
```

通过标准：

- [x] `/health` 状态符合当前部署模式。本地 search-service `provider=postgres`、`status=ok`。
- [x] `/metrics.persistent` 在本地 Postgres 模式下可用。见 `reports/ops-health-check.md`。
- [ ] 成功发送一次真实 webhook 通知。blocked：没有 `OPS_ALERT_WEBHOOK_URL`。`notify:phase-three-ops` 在缺密钥时跳过并退出 0，不能记为已发送。
- [ ] 人工制造或指定一次失败检查，确认失败通知可达。blocked：同样需要 kir 提供 `OPS_ALERT_WEBHOOK_URL`。
- [x] `backup:drill` 对本地主库 `postgres` 和临时库 `campus_rag_restore` 完成备份、恢复和 `smoke:postgres` / `test:telemetry:postgres`。这不是托管主库。
- [ ] 对托管生产主库再跑一次 `backup:drill`。blocked：需要 kir 提供生产 `DATABASE_URL` 和另一套空的 `BACKUP_DRILL_RESTORE_DATABASE_URL`。
- [x] 生成本地证据 `reports/ops-health-check.*` 和 `reports/backup-drills/2026-10-15T12-07-28-220Z-local-acceptance/`。

## 5. Admin Gate

后台 gate 用于回收第四阶段真实验收。

- [x] 本地验收配置了一次性 `ADMIN_DASHBOARD_TOKEN` 和 `SEARCH_SERVICE_API_KEY`。这两个值没有写入仓库，也不是生产密钥。
- [ ] 托管环境的生产 `ADMIN_DASHBOARD_TOKEN` 和 `SEARCH_SERVICE_API_KEY`。blocked：需要 kir 配置到部署环境，不要把值提交进仓库。
- [x] 登录 `/admin/login`，进入 `/admin`。本地 `http://localhost:3200` 通过。
- [x] 来源治理页能看到来源健康、最近同步、文档数、chunk 数和最近错误。图书馆行显示 8 篇文档、31 个 chunk。
- [x] 禁用一个测试来源后，该来源不参与召回，同步按钮禁用；管理 API 对禁用入队返回 409 `source_disabled`。
- [x] 重新启用来源后，可以手动触发单来源同步。已对 `tjcu-library` 入队。
- [x] 有 Redis 时运行：

```bash
npm run ingest:worker -- --once
```

本地 Redis 7.0.15 已消费该任务：`source=tjcu-library ... errors=0`。GitHub Actions 定时同步仍 blocked，见验收报告。

- [x] feedback 列表能追踪到 query、source snapshot、answer summary 和处理状态。本地查询“图书馆”提交“不准确”后，后台改为 `resolved`。
- [x] 社区审核记录能区分 `pending`、`rejected`、`supplemental`、`approved`。`pending` / `rejected` 不召回，`supplemental` 只展示不进 evidence，`approved` 进入 evidence。

## 6. Demo Gate

演示必须使用 `docs/demo-script.md` 的固定流程。

- [x] 正常命中路径可展示 answer、sources 和 evidence。seed `图书馆借书`，`verify:ui`。
- [x] 无答案路径不会编造结果。seed `明天校园集市几点开始` 返回 `empty`。
- [x] 官方 / 社区来源分层清晰。`宿舍报修流程` 与 `社团纳新什么时候开始`。
- [x] 用户 feedback 能提交并在后台出现。seed 无数据库时页面显示“反馈暂未提交成功。”；本地 Postgres 模式显示“反馈已记录。”并写入后台。
- [x] 后台能处理 feedback。本地后台把该条改为 `resolved`。
- [x] search-service 不可用或配置错误时前端显示明确错误态。e2e `search request failures render the explicit error state` 通过。seed 验收实例不拦截 `/api/search`，所以错误态证据来自 e2e，不来自 `verify:ui`。

## 7. Release Candidate

- [x] 形成 `v0.1.0-rc.1` release note：`docs/release-notes/v0.1.0-rc.1.md`。未打 git tag，未创建 GitHub Release。
- [x] release note 包含完成能力、验证命令、报告路径、已知限制。
- [x] `docs/release-acceptance-report.md` 填写完整。
- [x] README 链接到第五阶段 release 文档和 release note。
- [x] 所有 blocked 项明确说明原因、影响和 kir 需要提供的内容。

## 8. 发布后 24 小时观察

- [ ] scheduled ingestion 正常执行或失败可追踪。failed：当前问题是 hosted runner 间歇性抓不到 TJCU 列表页，例 run `40591519263`。run `38709421953` 的 `in-burro-41364.upstash.io` `ENOTFOUND` 是历史 Redis 失败；Actions `REDIS_URL` 现已配置，那次入队已经能成功。还不能签 24 小时观察。
- [ ] `/health` 持续可用。blocked：Ops Health Check run `38709402812` 和 `40827602734` 都因为没有 `OPS_SEARCH_SERVICE_URL` 而跳过，当时 workflow 仍是绿的。缺端点现在应失败。本次无法做 24 小时观察。
- [ ] `/metrics.persistent` 有真实请求数据。blocked：同上，没有托管 search-service 地址。
- [ ] `service_event_logs` 没有新增阻断错误。blocked：同上。
- [ ] feedback 可以正常写入和处理。本地已验证；托管环境 24 小时观察 blocked。
- [ ] 若观察失败，按 `docs/release-readme.md` 的回滚流程处理，并在验收报告中记录。blocked：观察窗口尚未开始。
