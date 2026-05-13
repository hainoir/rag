# 第五阶段 Release Checklist

这份 checklist 用于把当前项目收口成一个可交付的 release candidate。它不新增 RAG 核心能力，只确认已有代码、数据链路、运维入口、后台治理和演示材料是否达到可复盘状态。

当前默认发布口径：

- 项目定位：校园信息检索 / explainable RAG MVP，上线候选版本。
- 默认检索策略：`hybrid`。
- `rerank`：默认关闭，仅作为显式实验能力。
- 默认回答模式：`extractive`；LLM answer 是可选演示能力。
- 第三阶段运维和第四阶段后台如果没有真实准线上验收记录，只能写作“代码侧完成 / 待上线前验收”。

## 1. 发布前状态冻结

- [ ] 确认本次发布只包含第五阶段 release 文档、验收脚本和必要状态说明。
- [ ] 确认没有修改 `SearchResponse`、搜索 API、Postgres schema 或后台管理 API。
- [ ] 确认 `.env.local`、真实密钥、数据库连接串、webhook 地址没有进入仓库。
- [ ] 记录当前 commit hash、Node 版本、Postgres/Redis 环境和部署目标。
- [ ] 更新 `docs/release-acceptance-report.md` 的环境信息。

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

- [ ] 格式检查通过。
- [ ] lint 无 warning。
- [ ] `SearchResponse` 契约验证通过。
- [ ] seed demo 固定问题验证通过。
- [ ] 单元与组件测试通过。
- [ ] Next build 通过。
- [ ] e2e 覆盖首页、搜索结果、来源展开、无答案和错误态。

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

- [ ] `db:init -> ingest:official -> inspect:ingestion -> smoke:postgres -> test:ingestion:postgres` 通过。
- [ ] `verify:retrieval:real` 生成最新 `reports/search-quality-evaluation-*.json` 和 `.md`。
- [ ] 最新质量报告确认默认推荐策略仍为 `hybrid`。
- [ ] `test:telemetry:postgres` 验证 query log、feedback、`/health` 和 `/metrics.persistent`。
- [ ] `test:admin:postgres` 验证后台管理 API 与 Postgres 集成。

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

- [ ] `/health` 状态符合当前部署模式。
- [ ] `/metrics.persistent` 在真实 Postgres 模式下可用。
- [ ] 成功发送一次真实 webhook 通知。
- [ ] 人工制造或指定一次失败检查，确认失败通知可达。
- [ ] `backup:drill` 对真实主库和临时恢复库完成备份、恢复和验证。
- [ ] 生成 `reports/ops-health-check.*` 和 `reports/backup-drills/*` 证据。

## 5. Admin Gate

后台 gate 用于回收第四阶段真实验收。

- [ ] 配置真实 `ADMIN_DASHBOARD_TOKEN`。
- [ ] 配置真实 `SEARCH_SERVICE_API_KEY`。
- [ ] 登录 `/admin/login`，进入 `/admin`。
- [ ] 来源治理页能看到来源健康、最近同步、文档数、chunk 数和最近错误。
- [ ] 禁用一个测试来源后，该来源不参与召回或同步。
- [ ] 重新启用来源后，可以手动触发单来源同步。
- [ ] 有 Redis 时运行：

```bash
npm run ingest:worker -- --once
```

- [ ] feedback 列表能追踪到 query、source snapshot、answer summary 和处理状态。
- [ ] 社区审核记录能区分 `pending`、`rejected`、`supplemental`、`approved`。

## 6. Demo Gate

演示必须使用 `docs/demo-script.md` 的固定流程。

- [ ] 正常命中路径可展示 answer、sources 和 evidence。
- [ ] 无答案路径不会编造结果。
- [ ] 官方 / 社区来源分层清晰。
- [ ] 用户 feedback 能提交并在后台出现。
- [ ] 后台能处理 feedback。
- [ ] search-service 不可用或配置错误时前端显示明确错误态。

## 7. Release Candidate

- [ ] 形成 `v0.1.0-rc.1` release note。
- [ ] release note 包含完成能力、验证命令、报告路径、已知限制。
- [ ] `docs/release-acceptance-report.md` 填写完整。
- [ ] README 链接到第五阶段 release 文档。
- [ ] 所有 blocked 项明确说明原因、影响和下一步。

## 8. 发布后 24 小时观察

- [ ] scheduled ingestion 正常执行或失败可追踪。
- [ ] `/health` 持续可用。
- [ ] `/metrics.persistent` 有真实请求数据。
- [ ] `service_event_logs` 没有新增阻断错误。
- [ ] feedback 可以正常写入和处理。
- [ ] 若观察失败，按 `docs/release-readme.md` 的回滚流程处理，并在验收报告中记录。
