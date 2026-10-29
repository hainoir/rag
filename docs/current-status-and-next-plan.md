# 当前开发进度与下一步计划

> 更新时间：2026-10-15
>
> 阅读口径：
>
> - 当前状态优先参考 `docs/current-status-and-next-plan.md`、`docs/search-quality-evaluation.md`、`docs/local-postgres.md`
> - `docs/full-rag-launch-plan.md`、`docs/architecture.md`、`docs/data-pipeline.md` 更适合作为阶段规划和背景说明
> - 对外描述仍保持：这是一个可演示的校园信息检索 / explainable RAG MVP，不是生产级 RAG 平台

## 1. 一句话结论

当前项目已经完成了可演示 MVP，第一阶段已于 2026-05-11 完成真实 PostgreSQL / Redis / GitHub Actions 的闭环验收；第二阶段也已完成真实 `lexical / hybrid / hybrid_rerank` 三档验证，并确认当前默认推荐策略应为 `hybrid`。

更准确地说：

- 前端主流程、统一搜索契约、上游搜索服务边界、官方来源 ingestion CLI、Postgres 检索、Redis 队列化 ingestion、社区审核接入口、基础 CI 和文档体系都已经具备。
- 真实云资源验收已经留档：本地真实数据链路、真实 Redis 队列链路、本地 `search-service` 的 Postgres provider 查询，以及 GitHub Actions 官方定时同步都已跑通。

因此，当前阶段判断应是：

- 可以稳定描述为 demo-ready / explainable RAG MVP
- 不应描述为 production-grade RAG platform
- P0 开发主体已经完成第一阶段关单；下一阶段重点转向检索质量评估和线上可靠性

## 2. 当前开发进度

### 2.1 已经完成的部分

- 前端用户链路：`/` 到 `/search?q=...` 的搜索、结果、来源分层、空状态、错误状态、相关问题与历史记录都已成型。
- 契约边界：前端统一通过 `/api/search` 获取 `SearchResponse`，并通过 `searchServiceProvider` 调用 `SEARCH_SERVICE_URL` 指向的上游搜索服务。
- 搜索服务基线：`search-service/` 已支持 `seed / postgres / auto` provider、extractive answer、可选 LLM answer、可选 pgvector、可选 rerank、`/health` 与 `/metrics`。
- 数据摄取基础：官方来源与社区来源 CLI、来源注册表、清洗规则、去重规则、分块入库、Postgres schema、inspection 和 smoke 命令都已具备。
- 阶段一基建接入：Redis 队列、worker、scheduled ingestion 包装脚本、社区文本审核接入口、GitHub Actions 定时工作流都已存在。
- 真实数据闭环验收：本地已跑通 `db:init -> ingest:official -> inspect:ingestion -> smoke:postgres -> test:ingestion:postgres -> ingest:scheduled:official`，并确认 `search-service` 能用 Postgres provider 返回真实来源；GitHub Actions `Scheduled Ingestion` 已在 2026-05-11 的 run `25659617695` 通过。
- 基础工程保障：`lint`、`format:check`、contract verify、demo verify、unit、build、e2e、evaluation 脚本与 CI 流程已存在。

### 2.2 已有代码或脚手架，但还不能算完成的部分

- pgvector 检索：已接通 Qwen3 向量方案，本地 `vector:init -> embed:chunks -> smoke:vector` 已跑通，当前重点不再是“是否接通”，而是误召回抑制和排序收益。
- rerank：代码链路、候选诊断和真实评估入口都已完成，且 `Qwen/Qwen3-Reranker-8B` 已在真实评估中跑通；但当前模型与参数组合会拉低排序质量，因此只保留为显式实验能力，不再建议默认开启。
- evidence-bound LLM answer：具备接入点和回退路径，但还需要更系统的效果验证和错误观测。
- feedback / query logs：前端入口已保留不变，但持久化已经统一收口到 `search-service`，并开始记录 `gateway_event` 与 `service_event_logs`；第二轮又补了仓库内告警检查脚本、定时 workflow、webhook 通知入口，以及基于 `/health.databaseRequired` / `telemetryRequired` 的模式感知判定；第四阶段已补入后台分析入口，真实外部通知渠道验收仍待完成。
- metrics：现在已经同时包含进程内 runtime metrics 与 Postgres 聚合的 `persistent` 指标，并可以被 `check:phase-three-ops` 自动判定；seed / demo 模式也不会再因为本机残留数据库配置而被误判成必须通过 persistent 指标，但还没有外部监控平台。

### 2.3 还明显没有完成的部分

- 生产级缓存、限流、告警和托管故障恢复。本地 `/health`、`/metrics.persistent` 和备份恢复已留证；托管 webhook 与 24 小时观察仍 blocked
- 第四阶段本地管理员验收已复跑。托管 `ADMIN_DASHBOARD_TOKEN` / `SEARCH_SERVICE_API_KEY` 仍要由 kir 配置
- 社区审核四个状态已在本地验证。长期运营规则和托管审计仍未闭环
- 托管数据库的备份、迁移和回滚。本地一次性主库和 `campus_rag_restore` 已演练
- 第五阶段本地 gate 和 `v0.1.0-rc.1` release note 已写入验收报告。定时同步、embedding 重评和托管通知仍 blocked，因此没有打 tag

## 3. 按阶段看当前所处位置

### 第一阶段：真实数据闭环稳定化

当前状态：已完成，并已有真实环境验收记录。

已经具备：

- `db:init`
- `ingest:official`
- `inspect:ingestion`
- `smoke:postgres`
- `test:ingestion:postgres`
- `ingest:scheduled:official`
- 本地 `search-service` 用 `postgres` provider 返回真实 sources
- GitHub Actions `Scheduled Ingestion` 成功 run：`25659617695`
- 当前远端稳定官方源集合：`tjcu-main-notices,tjcu-library,tjcu-academic-affairs,tjcu-undergrad-admissions`

验收结果：

- 阶段一要求的真实 PostgreSQL、真实 Redis、真实 GitHub Actions 官方同步已经跑通。
- GitHub Actions 当前使用 4 个已验证稳定的官方源；社区同步保持 `RUN_COMMUNITY_INGESTION=false`。
- `tjcu-undergrad-admissions` 仍可能出现个别 detail page 抓取失败，但 source 整体可以完成发现、去重和入库统计，不影响“稳定 3 到 5 个官方源”的阶段目标。

结论：第一阶段已经完成。后续不再需要围绕 PostgreSQL / Redis 做“是否接通”的收尾，而应把重点切换到第二阶段检索质量和第三阶段可靠性。

### 第二阶段：检索质量与 RAG 答案增强

当前状态：已完成收口，默认策略已明确。

已经具备：

- `evaluate:search`
- pgvector schema 与 embedding CLI
- rerank client
- 可选 LLM answer 与 extractive fallback
- 54 条官方 Postgres 黄金集
- `npm run verify:retrieval:real`
- Qwen3 `lexical / hybrid / hybrid_rerank` 真实对比报告
- tuned `lexical` 与 tuned `hybrid` 的负样本拒答收口
- `hybrid_rerank` 的真实增益验证与默认关闭决策

当前结论：

- tuned `lexical`：`recall@10=1`，`emptyAccuracy=0.5`
- tuned `hybrid`：`recall@10=1`，`mrr=0.9896`，`ndcg@10=0.9923`，`emptyAccuracy=1`
- `hybrid_rerank`：`recall@10=1`，`mrr=0.9635`，`ndcg@10=0.9728`，`emptyAccuracy=1`
- `hybrid_rerank` 已经真实跑通，但当前配置下劣于纯 `hybrid`
- 普通请求路径已调整为默认关闭 rerank；仅在显式 `SEARCH_RERANK_MODE=on|auto` 时作为实验能力启用

结论：第二阶段已经完成，最终默认策略是 `hybrid`；`rerank` 不是未完成，而是已被验证为当前配置下不适合默认开启。

### 第三阶段：线上可靠性与运维能力

当前状态：代码侧可靠性与运维基线已完成，真实线上运维验收后置。

已经具备：

- `web` 不再直连 Postgres，feedback / query log 已统一代理到 `search-service`
- `/api/feedback`、`/api/query-logs`
- 增强版 `/health`
- 带 `persistent` 聚合的 `/metrics`
- `service_event_logs`
- scheduled ingestion workflow
- `test:telemetry:postgres`
- `docs/phase-three-operations.md`
- `check:phase-three-ops`
- `notify:phase-three-ops`
- `backup:drill`
- `.github/workflows/ops-health-check.yml`
- seed / demo 模式的本地运维检查入口：`SEARCH_SERVICE_DISABLE_ENV_FILE=1`

还差：

- 缓存、超时、限流策略在真实部署环境下的持续回归验证
- 外部监控平台接入
- 真实外部通知渠道的密钥配置和发送验收记录
- 备份、恢复、回滚的真实演练记录
- 第四阶段代码侧后台治理 MVP 已接入，但真实来源治理、失败看板和后台操作验收仍待补跑

结论：第三阶段仍按“代码侧完成”处理，第四阶段管理后台与运营闭环也已完成代码侧 MVP；真实外部监控、真实 webhook 发送、真实备份恢复回滚演练和真实管理员验收保留为上线前验收项，不能对外宣称 production-grade 运维闭环已完成。

### 第四阶段与第五阶段

当前状态：2026-10-15 已完成本地 Phase 4 / Phase 5 可复跑验收。托管定时同步、托管通知、hybrid 重评和 24 小时观察仍 blocked。结论以 `docs/release-acceptance-report.md` 为准。

- 第四阶段本地后台已登录，来源看板、禁用召回、单源 Redis 同步、feedback 追踪和四个社区审核状态都有记录。
- 主站通知解析已改为 `#vsb_content_4` / `.v_news_content`。修复前 8 篇详情页无法入库。
- 后台保存成功提示不再被同一次刷新清掉。
- 本地 `verify:release:local`、官方四源摄取、`smoke:postgres`、admin/telemetry Postgres 测试和本地 `backup:drill` 已通过。
- 仍 blocked 的托管材料列在验收报告第 9 节。Actions `REDIS_URL` 已经配置，2026-10-15 的 `in-burro-41364.upstash.io` `ENOTFOUND` 是历史失败。当前定时同步失败是 hosted runner 间歇性抓不到 TJCU 列表页。`OPS_SEARCH_SERVICE_URL`、`OPS_ALERT_WEBHOOK_URL` 和 `EMBEDDING_API_KEY` 仍然没有验收证据。

## 4. 下一步开发顺序

2026-10-15 之后，本地可复跑的第四、第五阶段项已经归档。2026-10-29 把三类托管问题拆开：间歇性 TJCU 列表页抓取、仍缺的托管密钥、历史 Redis `ENOTFOUND`。不要在材料缺失时打 `v0.1.0-rc.1` tag。

1. 本地 Phase 4 / Phase 5 已归档
   - `npm run verify:release:local` 通过
   - 本地官方四源、`test:admin:postgres`、`test:telemetry:postgres`、后台 UI 和本地 `backup:drill` 通过
   - release note：`docs/release-notes/v0.1.0-rc.1.md`

2. 定时同步的当前失败不是 Redis
   - Actions `DATABASE_URL` 和 `REDIS_URL` 已配置。run `40591519263` 跳过了缺密钥分支，入队成功，然后四个源列表页 `fetch failed`
   - run `38709421953` 的 `in-burro-41364.upstash.io` `ENOTFOUND` 只代表 2026-10-15 那次历史失败
   - 2026-10-15 以来 Scheduled Ingestion 为 80 success / 11 failure。代码侧加长了重试并让部分来源成功时退出 0；这还没有新的 hosted 运行证据

3. 仍然要 kir 提供、且这次没有证据的材料
   - `OPS_SEARCH_SERVICE_URL`。未配置时 Ops Health Check 现在失败，不再把 skip 当成成功。run `40827602734` 仍是旧的绿 skip
   - `OPS_ALERT_WEBHOOK_URL`
   - `EMBEDDING_API_KEY` 和带 `vector` 扩展的 Postgres
   - 托管主库与单独的 `BACKUP_DRILL_RESTORE_DATABASE_URL`

4. 材料到齐后才做发布定稿
   - 重跑 `verify:release:postgres`、`verify:release:ops` 和 Scheduled Ingestion
   - 观察 24 小时
   - 那时才可以打 `v0.1.0-rc.1` tag

## 5. 当前最重要的里程碑

> 本地验收已经收口。Actions Redis 密钥已经可用。下一个里程碑是让定时抓取能扛住 `.tjcu.edu.cn` 间歇性不可达，并补齐托管监控、webhook 和 embedding 条件；在此之前不要打 tag。

阶段一和第二阶段的真实数据链路与 `hybrid` 默认策略仍然有效。2026-10-15 把第四阶段本地后台和第五阶段本地 release gate 补进了验收报告。定时同步当前是间歇性 `failed`，托管通知和 hybrid 重评保持 blocked。

## 6. 当前建议的文档阅读顺序

如果之后要快速判断仓库状态，建议按这个顺序读：

1. `docs/current-status-and-next-plan.md`
2. `docs/search-quality-evaluation.md`
3. `docs/phase-three-operations.md`
4. `docs/release-readme.md`
5. `docs/release-checklist.md`
6. `docs/local-postgres.md`
7. `docs/full-rag-launch-plan.md`
8. `docs/architecture.md`
9. `docs/data-pipeline.md`

这样可以避免把较早的阶段快照误读成当前最终状态。
