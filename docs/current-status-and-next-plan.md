# 当前开发进度与下一步计划

> 更新时间：2026-05-13
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
- feedback / query logs：前端入口已保留不变，但持久化已经统一收口到 `search-service`，并开始记录 `gateway_event` 与 `service_event_logs`；第二轮又补了仓库内告警检查脚本、定时 workflow、webhook 通知入口，以及基于 `/health.databaseRequired` / `telemetryRequired` 的模式感知判定，但仍缺后台分析面板和真实外部通知渠道验收。
- metrics：现在已经同时包含进程内 runtime metrics 与 Postgres 聚合的 `persistent` 指标，并可以被 `check:phase-three-ops` 自动判定；seed / demo 模式也不会再因为本机残留数据库配置而被误判成必须通过 persistent 指标，但还没有外部监控平台。

### 2.3 还明显没有完成的部分

- 生产级缓存、限流、告警、持久化观测与故障恢复
- 管理后台、来源状态看板、失败重试看板、人工审核工作流
- 社区来源长期治理策略和运营审计
- 数据库备份、迁移、恢复和回滚流程的真实演练记录
- 最终发布物料：上线 README、验收报告、release checklist、稳定演示脚本

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
- 更完整的来源治理、失败看板和运维后台

结论：第三阶段可以按“代码侧完成”进入第四阶段开发；真实外部监控、真实 webhook 发送、真实备份恢复回滚演练保留为上线前验收项，不能对外宣称 production-grade 运维闭环已完成。

### 第四阶段与第五阶段

当前状态：第四阶段管理后台与运营闭环已经进入代码侧落地；第五阶段仍未开始闭环。

- 第四阶段已新增单密钥后台登录、`/admin` 工作台、`search-service` 管理 API、来源治理覆盖层、query / feedback 追踪字段和社区审核记录。
- 代码侧已经可以覆盖来源状态看板、单来源同步触发、feedback 处理列表、社区审核与人工复核状态流转。
- 后续仍需要在真实部署环境配置 `ADMIN_DASHBOARD_TOKEN`、`SEARCH_SERVICE_API_KEY`、`DATABASE_URL` 和 `REDIS_URL`，再跑一次后台验收。
- 第五阶段的上线包装、验收报告、release checklist 也还没有形成最终版。

## 4. 下一步开发顺序

建议严格按下面顺序推进，不要跳步：

1. 固化第一阶段验收记录
   - 在运行手册和项目报告中记录 2026-05-11 的本地与 GitHub Actions 验收结果
   - 记录当前稳定官方源集合与社区关闭策略

2. 完成第四阶段代码侧复验
   - `npm run test:admin`
   - `npm run build`
   - 有 Postgres 时补跑 `npm run test:admin:postgres`
   - 有 Redis 时从后台触发单来源同步，再运行 `npm run ingest:worker -- --once`

3. 上线前补跑第三阶段真实验收
   - 把 `/health`、`/metrics.persistent`、`service_event_logs` 接到外部监控与通知平台
   - 在真实部署环境里复验缓存、限流、超时和降级策略
   - 用 `backup:drill` 做一次可复盘的备份、恢复和回滚演练

4. 最后再做发布物料
   - 上线 README、验收报告、release checklist

## 5. 当前最重要的里程碑

下一个真正应该完成的里程碑不是“再补 PostgreSQL / Redis 接入功能”，而是：

> 以当前已验证的真实数据链路和 Qwen3 评估结果为基础，把第四阶段后台治理 MVP 在本地和准线上环境验收完成。

阶段一和第二阶段已经把项目状态从“代码侧已准备”推进到了“真实数据链路已验证 + 默认检索策略已收口”；第三阶段已经完成代码侧可靠性基线，真实运维验收保留到上线前执行。第四阶段现在已有代码侧后台治理 MVP，当前重点应切换为后台验收、真实 Redis 手动同步和 Postgres admin integration 复验。

## 6. 当前建议的文档阅读顺序

如果之后要快速判断仓库状态，建议按这个顺序读：

1. `docs/current-status-and-next-plan.md`
2. `docs/search-quality-evaluation.md`
3. `docs/phase-three-operations.md`
4. `docs/local-postgres.md`
5. `docs/full-rag-launch-plan.md`
6. `docs/architecture.md`
7. `docs/data-pipeline.md`

这样可以避免把较早的阶段快照误读成当前最终状态。
