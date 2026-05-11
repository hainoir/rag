# 当前开发进度与下一步计划

> 更新时间：2026-05-11
>
> 阅读口径：
>
> - 当前状态优先参考 `docs/full-rag-launch-plan.md`、`docs/phase-one-infra.md`、`docs/production-data-runbook.md`
> - `docs/project-completion-report.md`、`docs/architecture.md`、`docs/data-pipeline.md` 更适合作为阶段快照和背景说明
> - 对外描述仍保持：这是一个可演示的校园信息检索 / explainable RAG MVP，不是生产级 RAG 平台

## 1. 一句话结论

当前项目已经完成了可演示 MVP，且第一阶段里的 PostgreSQL / Redis 接入开发已经完成；当前还没有被仓库内现有证据完全确认的，是基于真实云资源环境的闭环验收结果。

更准确地说：

- 前端主流程、统一搜索契约、上游搜索服务边界、官方来源 ingestion CLI、Postgres 检索、Redis 队列化 ingestion、社区审核接入口、基础 CI 和文档体系都已经具备。
- 但“项目已经可上线”这句话仍然缺最后一层证据：真实 PostgreSQL、真实 Redis、真实 GitHub Actions 定时任务和真实来源同步结果，需要有可复查的验收记录。

因此，当前阶段判断应是：

- 可以稳定描述为 demo-ready / explainable RAG MVP
- 不应描述为 production-grade RAG platform
- P0 开发主体已经接近完成，其中 PostgreSQL / Redis 接入已完成；但 P0 最关键的真实资源验收还没有正式关单

## 2. 当前开发进度

### 2.1 已经完成的部分

- 前端用户链路：`/` 到 `/search?q=...` 的搜索、结果、来源分层、空状态、错误状态、相关问题与历史记录都已成型。
- 契约边界：前端统一通过 `/api/search` 获取 `SearchResponse`，并通过 `searchServiceProvider` 调用 `SEARCH_SERVICE_URL` 指向的上游搜索服务。
- 搜索服务基线：`search-service/` 已支持 `seed / postgres / auto` provider、extractive answer、可选 LLM answer、可选 pgvector、可选 rerank、`/health` 与 `/metrics`。
- 数据摄取基础：官方来源与社区来源 CLI、来源注册表、清洗规则、去重规则、分块入库、Postgres schema、inspection 和 smoke 命令都已具备。
- 阶段一基建接入：Redis 队列、worker、scheduled ingestion 包装脚本、社区文本审核接入口、GitHub Actions 定时工作流都已存在。
- 基础工程保障：`lint`、`format:check`、contract verify、demo verify、unit、build、e2e、evaluation 脚本与 CI 流程已存在。

### 2.2 已有代码或脚手架，但还不能算完成的部分

- 真实数据闭环验收：文档、schema、脚本和 workflow 都已到位，但是否已经在真实 PostgreSQL / Redis / Secrets / Variables 环境里完整跑通，仍需要看验收记录。
- pgvector 检索：`vector:init`、`embed:chunks`、`smoke:vector` 已存在，但需要真实 embedding key、pgvector 扩展和固定 query 对比结果。
- rerank：接口和客户端已接入，但需要真实 cross-encoder 服务与评估对比。
- evidence-bound LLM answer：具备接入点和回退路径，但还需要更系统的效果验证和错误观测。
- feedback / query logs：schema 与写入接入口已经存在，但还没有演进成可运维的后台分析能力。
- metrics：当前是进程内 JSON 指标，适合本地和 demo，不等于生产监控。

### 2.3 还明显没有完成的部分

- 固定评估集驱动的检索质量闭环
- 生产级缓存、限流、告警、持久化观测与故障恢复
- 管理后台、来源状态看板、失败重试看板、人工审核工作流
- 社区来源长期治理策略和运营审计
- 数据库备份、迁移、恢复和回滚流程的完整演练
- 最终发布物料：上线 README、验收报告、release checklist、稳定演示脚本

## 3. 按阶段看当前所处位置

### 第一阶段：真实数据闭环稳定化

当前状态：PostgreSQL / Redis 接入开发已完成，真实环境下的阶段验收结果未在当前仓库证据里完整沉淀。

已经具备：

- `db:init`
- `ingest:official`
- `inspect:ingestion`
- `smoke:postgres`
- `test:ingestion:postgres`
- `ingest:scheduled:official`
- 官方来源白名单与最小默认源集合

还差：

- 在真实 PostgreSQL 上验证至少 3 到 5 个官方源稳定同步
- 在真实 Redis 上验证 queued ingestion 能入队并被 worker 消费
- 在 GitHub Actions 上验证官方定时同步可以稳定跑通
- 证明 search-service 返回的确实是 Postgres 真实 sources，而不是 seed fallback

结论：第一阶段的 PostgreSQL / Redis 开发工作已经完成；剩下差的不是“再做接入”，而是把真实环境验收跑完并留档。不建议跳过这一步直接继续做更多 UI 或后台功能。

### 第二阶段：检索质量与 RAG 答案增强

当前状态：已有能力入口，尚未形成稳定评估闭环。

已经具备：

- `evaluate:search`
- pgvector schema 与 embedding CLI
- rerank client
- 可选 LLM answer 与 extractive fallback

还差：

- 扩充固定 query 集
- 记录 lexical / hybrid / rerank 对比结果
- 验证 evidence 是否始终绑定到当前 `sources`
- 用真实环境生成可复现报告

结论：第二阶段可以开始，但前提是第一阶段先完成真实数据闭环。

### 第三阶段：线上可靠性与运维能力

当前状态：已有若干接入点，但还远不到“生产运维完成”。

已经具备：

- 基础 `/health`
- 基础 `/metrics`
- feedback / query log schema
- scheduled ingestion workflow

还差：

- 缓存、超时、限流策略的系统化验证
- 指标持久化或监控平台接入
- 备份、恢复、回滚文档和演练
- 更明确的异常追踪和告警路径

结论：第三阶段还属于后续建设，不应在当前文档里被默认视为已完成。

### 第四阶段与第五阶段

当前状态：基本未开始闭环。

- 第四阶段的管理后台、来源治理、人工审核、反馈处理仍主要停留在规划层。
- 第五阶段的上线包装、验收报告、release checklist 也还没有形成最终版。

## 4. 下一步开发顺序

建议严格按下面顺序推进，不要跳步：

1. 完成真实资源接入
   - 准备托管 PostgreSQL、托管 Redis、GitHub Actions Secrets / Variables
   - 本地 `.env.local` 指向真实资源

2. 完成第一阶段最终验收
   - 依次执行：
   - `npm run db:init`
   - `npm run ingest:official`
   - `npm run inspect:ingestion`
   - `npm run smoke:postgres`
   - `npm run test:ingestion:postgres`
   - `npm run ingest:scheduled:official`
   - 手动触发 GitHub Actions 的 `Scheduled Ingestion`

3. 固化第一阶段验收记录
   - 记录成功 source 数、documents 数、chunks 数
   - 记录 smoke 结果、workflow run 链接、审核模式
   - 明确哪些 query 命中了真实来源

4. 再做第二阶段质量增强
   - 扩充固定 query 集
   - 跑 `vector:init -> embed:chunks -> smoke:vector`
   - 接真实 rerank 服务
   - 产出 lexical / hybrid / rerank 对比报告

5. 再补第三阶段可靠性
   - 校验缓存、限流、超时和降级策略
   - 把 query logs / feedback / metrics 从“存在接入口”推进到“可观测、可排查”
   - 增加备份、恢复和回滚说明

6. 最后再做后台与发布物料
   - 来源状态看板
   - 社区审核与人工复核流程
   - 上线 README、验收报告、release checklist

## 5. 当前最重要的里程碑

下一个真正应该完成的里程碑不是“再补 PostgreSQL / Redis 接入功能”，而是：

> 在真实 PostgreSQL + Redis + GitHub Actions 环境下，完成阶段一闭环验收，并留下可复查的结果记录。

只有这个里程碑完成后，项目状态才能从“代码侧已准备”升级为“真实数据链路已验证”。

## 6. 当前建议的文档阅读顺序

如果之后要快速判断仓库状态，建议按这个顺序读：

1. `docs/current-status-and-next-plan.md`
2. `docs/full-rag-launch-plan.md`
3. `docs/phase-one-infra.md`
4. `docs/production-data-runbook.md`
5. `docs/project-completion-report.md`
6. `docs/architecture.md`
7. `docs/data-pipeline.md`

这样可以避免把较早的阶段快照误读成当前最终状态。
