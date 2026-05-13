# 校园 RAG 助手完整上线项目功能计划书

> 当前进度注记（2026-05-13）：
>
> - 第一阶段真实数据闭环已完成
> - 第二阶段检索质量闭环已完成，真实 `lexical / hybrid / hybrid_rerank` 三档验证已留档
> - 当前默认推荐策略是 `hybrid`
> - `rerank` 已验证可用，但当前配置下效果回退，因此仅保留为显式实验能力
> - 第三阶段可靠性与运维代码侧基线已完成，真实外部监控、通知和备份恢复验收流程后置到上线前执行
> - 第四阶段管理后台与运营闭环代码侧 MVP 已接入，真实线上管理员验收后置

## 1. 项目目标

本计划书面向当前 `campus-rag-assistant` 项目的下一阶段建设：把现有可演示 MVP 演进为一个可部署、可运维、可验收的校园信息检索与可解释问答系统。

项目目标不是做一个泛聊天机器人，而是做一个面向校园公开信息的 RAG 产品：

- 用户可以用自然语言查询校园通知、办事流程、招生就业、图书馆、后勤和学生服务等信息。
- 系统先检索可信来源，再基于命中证据生成回答。
- 每个回答必须展示来源、命中片段、发布时间、更新时间、抓取时间和最近校验时间。
- 官方来源与社区来源分层展示，避免把经验内容包装成权威事实。
- 当证据不足时，系统明确返回无答案或低置信结果，而不是强行生成。

上线后的核心判断标准是：用户能查到真实来源，回答能追溯，数据能持续更新，异常能被发现，部署能稳定恢复。

## 2. 当前基础

当前项目已经具备完整主链路的雏形：

- 前端使用 Next.js App Router、React、TypeScript 和 Tailwind CSS。
- 用户入口为首页搜索和结果页 `/search?q=...`。
- 前端统一通过 `/api/search` 获取 `SearchResponse`。
- Route Handler 通过 `searchServiceProvider` 调用 `SEARCH_SERVICE_URL` 指向的上游搜索服务。
- `search-service/` 已包含 seed fallback、Postgres chunk 检索、官方来源摄取 CLI、社区来源摄取 CLI、可选 LLM 回答、可选 pgvector hybrid retrieval、可选 rerank 和 `/metrics`。
- 文档中已经沉淀搜索契约、数据管线、Postgres schema、本地部署和演示部署说明。

当前仍不能直接称为完整上线级 RAG 项目，主要缺口包括：

- 真实数据同步需要在稳定数据库和调度环境中复验。
- 检索质量缺少固定评估集和指标体系。
- 线上缓存、限流、告警、日志留存和故障恢复还不完整。
- 社区来源缺少长期治理、审核和降权策略。
- 管理后台与反馈闭环已有代码侧 MVP，但真实管理员验收、内容回放和运营审计能力仍需补齐。
- 部署形态仍偏本地 Compose 与演示说明，需要补齐生产环境拆分、密钥管理、备份和发布流程。

## 3. 产品范围

### 3.1 用户侧功能

上线版本应包含以下用户功能：

- 自然语言搜索：用户可以输入完整问题，例如“图书馆寒假开放时间是什么”“研究生招生联系方式在哪里”。
- 推荐问题：首页提供高频问题、办事类问题和招生就业类问题。
- 搜索历史：本地保存最近搜索，支持再次查询和清空。
- 回答视图：展示结构化答案、置信度、证据引用和生成时间。
- 来源视图：展示命中来源列表、来源类型、站点、发布时间、更新时间、抓取时间、最近校验时间和命中片段。
- 来源筛选：支持官方、社区、全部来源切换。
- 无答案兜底：当命中不足时，引导用户换关键词、缩小范围或查看相关来源。
- 相关问题：基于当前 query 和命中来源提供后续追问入口。
- 错误态：上游不可用、超时、限流或数据源异常时给出明确状态。
- 移动端适配：保证搜索、结果切换、来源展开和跳转在手机端可用。

### 3.2 RAG 核心功能

完整上线版本应把 RAG 能力拆成可验证的模块：

- 数据源注册：维护官方来源和社区来源白名单，包括站点、权重、抓取方式、更新频率和清洗策略。
- 数据抓取：支持 HTML、RSS、sitemap 和指定 URL 的增量同步。
- 内容清洗：去除导航、页脚、脚本、重复栏目、广告和无关块。
- 去重归档：按 canonical URL、标题发布时间和内容 hash 分层去重。
- 分块入库：按段落优先切分，保存 chunk、snippet、来源元数据和版本关系。
- 关键词检索：基于 Postgres lexical / pg_trgm 提供稳定基线召回。
- 向量检索：通过 pgvector 和 embedding 支持 hybrid retrieval。
- 二阶段重排：通过 cross-encoder rerank 优化候选顺序。
- 回答生成：默认支持 extractive answer；配置 LLM 后生成 evidence-bound answer。
- 证据绑定：回答中的每个结论必须映射回来源 id 和片段。
- 回退策略：embedding、rerank 或 LLM 失败时回退到可解释的基础检索结果。

### 3.3 管理与运营功能

上线级项目需要补齐面向维护者的功能：

- 数据源管理：新增、停用、降权、调整抓取频率和查看来源状态。
- 同步任务看板：查看每次 ingestion 的开始时间、结束时间、状态、失败原因、文档数和 chunk 数。
- 文档版本回放：查看同一来源文档的历史版本、内容 hash 和更新时间。
- 失败重试：对网络错误、解析失败、入库失败提供可控重试。
- 人工审核：社区来源进入默认问答前需要可选审核、屏蔽和降权。
- 查询日志：记录 query、命中来源、耗时、provider、缓存命中和错误码。
- 用户反馈：支持“有帮助 / 没帮助 / 来源过期 / 回答不准确”反馈。
- 质量评估：维护固定 query 集，跟踪命中率、证据覆盖率、无答案准确率和延迟。

## 4. 技术架构规划

### 4.1 前端层

前端继续保持当前边界：只消费 `SearchResponse`，不直接读取数据库，不直接执行抓取。

主要职责：

- 组织搜索入口、结果页、回答视图、来源视图和状态展示。
- 对 `status: ok | empty | error` 做清晰表达。
- 展示来源可信度和时间语义。
- 支持移动端、可访问性和基础性能优化。
- 收集用户反馈并提交到后端反馈接口。

关键文件方向：

- `src/app/api/search/route.ts`：搜索代理、限流、缓存和错误归一化。
- `src/components/results-shell.tsx`：结果页状态编排。
- `src/lib/search/types.ts`：结果契约。
- `src/lib/search/search-gateway.ts`：缓存与网关策略。

### 4.2 搜索服务层

搜索服务是上线项目的核心后端，建议从当前 `search-service/` 继续演进，后续可独立部署。

主要职责：

- 暴露 `/api/search`、`/health`、`/metrics`。
- 读取 Postgres 中的 documents、versions、chunks 和 ingestion runs。
- 执行 lexical / hybrid retrieval。
- 调用 rerank 服务做二阶段排序。
- 调用 LLM 生成受证据约束的答案。
- 输出统一 `SearchResponse`。
- 记录结构化日志和检索指标。

### 4.3 数据摄取层

摄取层负责把公开来源转成可检索知识库。

主要职责：

- 根据 source registry 调度不同 adapter。
- 支持官方来源优先同步，社区来源默认保守开启。
- 对 RSS / sitemap 做增量候选检测。
- 对 HTML 内容做清洗和正文抽取。
- 入库 documents、document_versions、chunks、ingestion_runs 和 ingestion_run_items。
- 对失败任务记录 stage、error code、error message 和重试次数。

### 4.4 存储层

上线版本建议使用 Postgres 作为主存储：

- `documents`：归档唯一文档。
- `document_versions`：保存不同内容版本。
- `chunks`：保存可检索片段、snippet、embedding 和来源关系。
- `ingestion_runs`：记录每次同步任务。
- `ingestion_run_items`：记录单篇文档处理结果。
- `query_logs`：记录查询与性能数据。
- `feedback_events`：记录用户反馈。
- `evaluation_runs`：记录评估批次。

可选增强：

- pgvector：保存 chunk embedding 和向量索引。
- Redis 或 Vercel Runtime Cache：缓存高频 query。
- 对象存储：保存抓取原文快照或解析后的 markdown。

### 4.5 模型与外部服务层

模型调用需要遵守“检索优先、证据约束、失败回退”的原则：

- Embedding：只用于 query embedding 和 chunk embedding，不直接生成答案。
- Rerank：只重排候选 chunks，不改变来源内容。
- LLM：只在检索有命中时生成回答，并必须返回使用的 source ids。
- 所有模型调用都要设置超时、重试上限、错误日志和 fallback。
- 模型 key、base URL、model name 必须通过环境变量管理。

## 5. 上线阶段计划

### 第一阶段：真实数据闭环稳定化

目标：让官方来源数据能稳定入库、检索和展示。

功能任务：

- 固定 5 到 8 个高质量官方来源作为上线基线。
- 复验 `db:init -> ingest:official -> inspect:ingestion -> smoke:postgres -> test:ingestion:postgres`。
- 为每个官方 adapter 增加 fixture 和解析规则测试。
- 补齐 ingestion run 的错误分类和可读输出。
- 确保重复同步不会重复插入相同文档和版本。
- 在结果页明确展示来源时间语义。

验收标准：

- 至少 5 个官方来源可重复同步。
- 每个健康来源都有 documents、latest version 和 chunks。
- 至少 20 个固定 query 能命中真实来源。
- seed demo 和真实 Postgres 链路边界清晰，不互相冒充。

### 第二阶段：检索质量与 RAG 答案增强

目标：从“能查到”提升到“查得准、答得稳”。

功能任务：

- 建立固定评估集，按招生、教务、图书馆、后勤、学生服务分类。
- 增加 `evaluate:search` 的报告输出，包括 Recall@K、MRR、证据覆盖率、无答案准确率和平均延迟。
- 接入 pgvector embedding，复验 `vector:init -> embed:chunks -> smoke:vector`。
- 对比 lexical 与 hybrid retrieval 的命中变化。
- 接入 rerank 服务，对固定 query 记录重排前后来源顺序。
- 开启 evidence-bound LLM 回答，并保留 extractive fallback。
- 增加答案生成的结构校验，防止模型返回未引用来源的结论。

验收标准：

- 固定评估集不少于 50 个 query。
- 每次检索策略调整都能生成对比报告。
- LLM 回答失败时系统仍返回可解释检索结果。
- 回答 evidence 中引用的 source id 必须存在于 sources 列表。

### 第三阶段：线上可靠性与运维能力

当前状态：代码侧已完成，真实线上运维验收后置。

目标：让系统具备持续运行、可观测和可恢复能力。

功能任务：

- 已拆分 `web -> search-service -> Postgres` 的职责边界，`web` 不再直接写数据库。
- 已增加运行态检查，`/health` 暴露数据库、telemetry、scheduled ingestion 和可选能力状态。
- 已保留缓存、超时、限流的 fail-open 运行策略，适配本地 demo 与真实部署。
- 已持久化 query logs、feedback events 和 service event logs。
- 已将 `/metrics` 扩展为 runtime metrics 与 Postgres `persistent` 聚合视图。
- 已配置 scheduled ingestion workflow，官方来源定时同步，社区来源默认手动或审核后同步。
- 已增加 `check:phase-three-ops`、`notify:phase-three-ops` 和 `backup:drill` 运维脚本。
- 已补充健康检查、告警、备份恢复和部署回滚 runbook。

验收标准：

- web 不直接访问数据库，只访问搜索代理或搜索服务。
- search-service 可独立健康检查。
- 上游超时、数据库不可用、模型失败都能返回明确错误态或降级结果。
- 定时同步失败会留下可追踪记录。
- 生产环境密钥不进入仓库。

后置真实验收：

- 将 `/health`、`/metrics.persistent` 和 `service_event_logs` 接入真实外部监控平台。
- 配置真实 `OPS_ALERT_WEBHOOK_URL`，完成一次成功和一次失败通知验收。
- 使用真实主库和临时恢复库执行一次 `backup:drill`，留存备份、恢复和验证报告。
- 在准线上环境复验缓存、限流、超时和降级策略。

### 第四阶段：管理后台与运营闭环

当前状态：代码侧运营 MVP 已接入，真实线上管理员验收后置。

目标：让维护者能管理来源、质量和用户反馈。

功能任务：

- 已新增 `/admin/login` 与 `/admin`，使用 `ADMIN_DASHBOARD_TOKEN` 换取 HttpOnly 管理会话。
- 已新增 `search-service` 的 `/api/admin/*` 管理 API，必须配置 `SEARCH_SERVICE_API_KEY` 才能访问。
- 已新增 `source_governance_overrides`，管理员禁用、权重和更新频率调整写入 DB 覆盖层，不回写代码注册表。
- 来源列表支持查看健康状态、最近同步、文档数、chunk 数、失败率和最近错误。
- 支持手动触发单个来源同步；禁用来源会返回明确错误，不进入队列。
- 查询日志已补充 `source_ids`、`source_snapshot`、回答摘要和回答置信度，支持后台追踪。
- feedback 已支持 `new / reviewing / resolved / dismissed` 处理状态和管理员备注。
- 社区来源已新增 `community_review_records`，`pending/rejected` 不参与召回，`supplemental` 只展示为补充来源，`approved` 才允许进入回答证据。

验收标准：

- 管理员能定位某个来源为什么没有被检索到。
- 管理员能从用户反馈追踪到 query、sources 和回答。
- 社区来源有明确治理状态，不与官方来源混淆。
- `npm run test:admin` 通过；真实 Postgres 环境可补跑 `npm run test:admin:postgres`。

### 第五阶段：发布、验收与项目包装

目标：形成可展示、可维护、可复盘的上线版本。

功能任务：

- 编写上线 README：部署架构、环境变量、启动命令、回滚方式和常见故障。
- 编写产品演示脚本：覆盖正常命中、无答案、来源过期、社区来源和错误态。
- 编写验收报告：列出功能范围、测试结果、评估结果和已知限制。
- 补齐 CI：lint、format、contract、unit、component、e2e、build、search evaluation。
- 准备 production seed 或演示数据，避免演示依赖不稳定外站。
- 固化版本号、变更日志和 release checklist。

验收标准：

- 新环境可以按照文档完成部署。
- 演示流程不依赖本地隐藏状态。
- 所有核心命令有明确通过记录或失败说明。
- 文档不会把项目夸大为无边界的生产级 AI 平台，而是准确描述为可上线的校园信息检索 RAG 项目。

## 6. 功能优先级

### P0：必须完成

- 真实官方来源入库闭环。
- Postgres-backed search-service。
- `SearchResponse` 契约稳定。
- 来源引用、时间语义和证据展示。
- 错误态、无答案态和上游不可用处理。
- 基础缓存、限流和超时。
- CI 中的 contract、unit、build、e2e。
- 部署文档和环境变量说明。

### P1：上线增强

- pgvector hybrid retrieval。
- rerank 对比与灰度开启。
- evidence-bound LLM answer。
- 固定 query 评估集。
- scheduled ingestion。
- query logs 和 feedback events。
- 管理端来源状态看板。
- 数据库备份和回滚流程。

### P2：长期优化

- 社区来源审核工作流。
- 多学校 source registry 配置化。
- 权限系统和多角色后台。
- 更完整的质量评估 dashboard。
- A/B 测试不同检索策略。
- 多模型 provider fallback。
- 更细粒度的内容合规扫描。

## 7. 数据与合规策略

上线项目必须优先保证来源可信和用户理解成本：

- 官方来源作为事实回答的主要依据。
- 社区来源只作为经验补充，默认低权重。
- 社区内容进入答案生成前应具备审核或强降权策略。
- 所有来源必须保留 canonical URL。
- 页面展示时明确区分发布时间、更新时间、抓取时间和最近校验时间。
- 过期来源不能静默参与高置信答案。
- 用户反馈中可能包含个人信息，需要避免在日志中长期保存敏感原文。
- 抓取频率遵守目标站点负载，设置 user agent、timeout、concurrency 和 retry 上限。

## 8. 测试与验收体系

上线前建议保留四类验收：

### 8.1 契约验收

- `npm run verify:search-contract`
- fixture 中的 `SearchResponse` 必须与类型和文档一致。
- 前端不依赖搜索服务的私有字段。

### 8.2 数据验收

- `npm run db:init`
- `npm run ingest:official`
- `npm run inspect:ingestion`
- `npm run smoke:postgres`
- `npm run test:ingestion:postgres`

### 8.3 质量验收

- `npm run evaluate:search`
- 固定 query 集覆盖官方通知、办事流程、图书馆、后勤、招生就业和无答案场景。
- 每次调整检索策略都保留评估报告。

### 8.4 前端验收

- `npm run lint`
- `npm run format:check`
- `npm run test:unit`
- `npm run build`
- `npm run e2e -- --reporter=line`

## 9. 部署规划

推荐部署形态：

- Web：Next.js 应用，部署到 Vercel 或同类平台。
- Search Service：独立 Node.js 服务，部署到支持长连接数据库访问和后台任务的环境。
- Database：托管 Postgres，开启 pg_trgm；如启用向量检索，需要 pgvector。
- Scheduled Jobs：官方来源定时同步，社区来源按策略手动或低频同步。
- Secrets：通过部署平台环境变量管理 `DATABASE_URL`、`SEARCH_SERVICE_URL`、`LLM_API_KEY`、`EMBEDDING_API_KEY`、`RERANK_API_KEY`。
- Observability：集中收集 search-service 日志、query metrics、ingestion failures 和 API latency。

基础环境变量：

```bash
SEARCH_SERVICE_URL=https://your-search-service.example.com/api/search
SEARCH_SERVICE_PROVIDER=postgres
DATABASE_URL=postgres://...
INGEST_SOURCE_IDS=...
INGEST_FETCH_LIMIT=...
INGEST_HTTP_TIMEOUT_MS=...
INGEST_CONCURRENCY=...
```

可选模型变量：

```bash
SEARCH_ANSWER_MODE=llm
LLM_API_KEY=...
LLM_BASE_URL=...
LLM_MODEL=...
EMBEDDING_API_KEY=...
EMBEDDING_BASE_URL=...
EMBEDDING_MODEL=...
RERANK_API_KEY=...
RERANK_BASE_URL=...
RERANK_MODEL=...
```

## 10. 风险与应对

| 风险               | 影响                                | 应对                                                               |
| ------------------ | ----------------------------------- | ------------------------------------------------------------------ |
| 官方网站结构变化   | adapter 解析失败，数据不同步        | 为 adapter 加 fixture 测试、同步失败告警和人工复验                 |
| 数据源内容过期     | 回答引用旧信息                      | 展示 freshnessLabel，过期来源降权或提示                            |
| LLM 幻觉           | 回答出现来源不支持的结论            | evidence-bound prompt、结构校验、无证据不回答、失败回退 extractive |
| 向量召回质量不稳定 | 检索结果偏离关键词意图              | 保留 lexical baseline，用评估集对比 hybrid 效果                    |
| 社区来源误导       | 经验内容被当事实                    | 来源分层、低权重、人工审核、默认不作为高置信答案依据               |
| 线上成本失控       | embedding、rerank、LLM 调用费用上升 | 缓存、限流、topK 控制、只对命中结果调用模型                        |
| 上游服务不可用     | 前端搜索失败                        | 超时、错误态、健康检查、回滚和降级策略                             |
| 数据库不可用       | 真实检索中断                        | 备份、连接池限制、只读降级、明确错误码                             |

## 11. 里程碑排期建议

| 周期    | 目标             | 主要交付                                              |
| ------- | ---------------- | ----------------------------------------------------- |
| 第 1 周 | 真实数据闭环     | 官方来源稳定入库、Postgres 检索复验、数据验收命令通过 |
| 第 2 周 | 检索质量增强     | 评估集、evaluate 报告、pgvector 与 rerank 对比        |
| 第 3 周 | 生成式回答与反馈 | evidence-bound LLM、反馈接口、query logs              |
| 第 4 周 | 可靠性与部署     | 代码侧基线已完成，真实运维验收后置到上线前            |
| 第 5 周 | 管理后台         | 来源状态、同步记录、反馈处理、社区审核                |
| 第 6 周 | 上线验收         | CI 补齐、演示脚本、验收报告、release checklist        |

## 12. 最终上线验收清单

- 用户可以完成首页搜索到结果页查看的完整流程。
- 搜索结果来自真实 Postgres 数据，而不是 seed fallback。
- 每条答案都有可追溯来源和 evidence。
- 无答案、错误、超时和上游不可用都有明确 UI 状态。
- 官方来源与社区来源清晰分层。
- ingestion 可以定时运行，并记录成功、失败和重试。
- 固定 query 评估集能稳定运行并生成报告。
- `/health` 和 `/metrics` 可用于线上排查。
- 生产环境密钥不写入仓库。
- 文档包含部署、验证、回滚和已知限制。

完成以上范围后，项目可以被描述为：

> 一个面向校园公开信息的可上线 RAG 检索问答系统，支持官方来源摄取、Postgres/pgvector 检索、证据约束回答、来源可信度展示、质量评估、定时同步和基础运维监控。

在未完成评估、告警、缓存、限流、社区治理和稳定调度前，不建议称为“生产级 RAG 平台”。
