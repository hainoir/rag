# 项目整体分析

## Summary

这个项目是一个 **Next.js App Router + React + TypeScript + Tailwind CSS v4** 的前端产品原型，主题是“校园信息检索与可解释问答助手”。

它现在的边界比早期 mock 版本清晰得多：前端通过 `src/app/api/search/route.ts` 请求结果，Route Handler 内部再调用 `searchServiceProvider` 访问外部搜索服务。这个仓库负责统一结果契约、状态编排和可信度表达；`search-service/` 负责最小可用的官方来源摄取、Postgres chunk 检索、seed fallback，以及可选的 evidence-bound LLM 回答生成。

从项目形态看，它已经具备完整主流程，适合作品集展示；从工程成熟度看，它仍然不是完整生产级 RAG 平台，因为当前虽然已经完成真实数据闭环、真实检索评估、`lexical / hybrid / hybrid_rerank` 三档验证和第四阶段后台治理代码侧 MVP，但线上告警、稳定调度、真实管理员验收和长期运维闭环仍未完成。

## 项目定位与目标用户

这个项目不是“聊天助手”，而是“检索优先、回答可追溯”的校园信息查询产品原型。

它最想表达的不是模型本身，而是下面几件更接近真实信息产品的事情：

- 回答和证据一起展示
- 官方信息和社区经验明确分层
- 命中片段可以直接核验
- 信息不足时不强行生成答案
- 时间敏感信息必须显式展示发布时间、更新时间和最近校验时间

更适合的使用场景和受众包括：

- 想快速查询校园规则、办事流程和生活信息的学生
- 想做一个有 AI 产品感、但仍突出前端价值的作品集项目的开发者
- 需要在面试中讲“可解释回答”和“复杂状态设计”的前端候选人

## 页面流与交互主流程

### 首页 `/`

首页负责建立产品认知，并把用户引导到主流程。

- `HomePage` 负责产品定位、亮点和数据策略的呈现
- `SearchBox` 负责输入问题和跳转搜索页
- `SuggestedQuestions` 提供默认问题，降低首屏使用门槛
- `HistoryPanel` 展示本地搜索历史，支持重查和清空

### 结果页 `/search?q=...`

结果页承载整个搜索和回答体验。

- URL 参数 `q` 作为问题输入
- `ResultsShell` 负责整页状态编排
- 页面先经历 `retrieving` 再经历 `summarizing`
- 完成后展示回答、来源、筛选和相关问题

页面上的主要交互包括：

- `StatusPanel` 显示当前检索阶段、来源数量和最近校验时间
- `ResultToolbar` 切换来源筛选与视图模式
- `AnswerPanel` 展示结构化回答
- `SourceList` / `SourceCard` 展示来源卡片、来源站点、时间元信息和命中片段
- `RelatedQuestionsPanel` 提供进一步追问入口和结果说明
- `EmptyState` 在无结果时承接兜底

## 当前检索链路

当前链路可以直接这样讲：

`用户提问 -> useSearchNavigation -> /search?q=... -> ResultsShell -> /api/search -> searchServiceProvider -> 外部搜索服务 -> SearchResponse -> AnswerPanel / SourceList`

这个链路的意义是：

- 前端只消费统一的 `SearchResponse`
- 搜索服务调用被收口在服务端内部
- 将来调整抓取、清洗、索引实现时，页面结构和大部分状态编排可以保留

当前同时要明确说明：

- `/api/search` 只是前端唯一入口，不代表仓库里已经包含完整搜索服务
- `searchServiceProvider` 负责请求上游搜索服务，不直接读取数据库
- `search-service/` 可以读取 Postgres chunks，默认生成 extractive answer，也可以在 `SEARCH_ANSWER_MODE=llm` 时调用 LLM 生成回答
- pgvector hybrid retrieval 已完成真实验证，当前默认推荐策略是 `hybrid`
- rerank 链路已接通且完成真实验证，但当前配置下效果回退，因此只保留为显式实验能力，不作为默认路径
- 告警、缓存、限流和生产调度仍属于后续搜索服务能力

## 架构分层

### 1. 视图层

视图层主要负责把产品意图表达清楚，不承担复杂数据策略。

- `HomePage`：首页信息组织
- `ResultsShell`：结果页主壳和状态编排
- `SearchBox`：搜索输入和提交
- `StatusPanel`：展示加载和结果状态
- `ResultToolbar`：来源过滤和视图切换
- `AnswerPanel`：结构化回答展示
- `SourceList` / `SourceCard`：来源列表、来源展开、原文跳转和关键词高亮
- `RelatedQuestionsPanel`：相关问题和可信度提示
- `EmptyState`：无答案兜底

### 2. 导航与状态层

这一层把页面行为串起来。

- `useSearchNavigation`：处理搜索提交、URL 跳转和同 query 刷新
- `SearchHistoryProvider`：维护本地搜索历史
- `ResultsShell`：连接搜索、loading、筛选和视图状态

### 3. 数据适配层

这是当前项目最像真实 RAG 系统接口边界的部分。

- `src/lib/search/types.ts` 定义统一搜索数据契约
- `SearchProvider.search(query)` 抽象统一搜索接口
- `src/app/api/search/route.ts` 提供前端唯一搜索入口
- `searchServiceProvider` 负责调用外部搜索服务并归一化响应
- `default-questions.ts` 提供首页和空态的默认问题

这个分层的优点是：未来接入不同搜索后端时，只要上游返回结构满足 `SearchResponse`，大部分页面代码都可以复用。

## 数据契约变化

相比早期只有标题、片段和 `publishedAt` 的来源卡片，现在 `SearchSource` 已经扩成更适合真实场景的结构：

- `sourceName` / `sourceDomain`：告诉用户这条信息来自哪个站点
- `publishedAt`：原始发布时间
- `updatedAt`：来源页面最近更新时间
- `fetchedAt`：搜索服务抓取或入库时间
- `lastVerifiedAt`：最近一次校验时间
- `freshnessLabel`：来源新鲜度
- `trustScore`：来源权重
- `canonicalUrl` / `dedupKey`：给去重和归档链路使用

这样 `resultGeneratedAt` 就不会再被误解成来源更新时间。

## 来源注册表和入库链路

仓库里新增了两类直接和真实化改造相关的文件：

- `src/lib/search/source-registry.ts`
  - 官方 / 社区来源白名单模板
  - 每个来源的抓取方式、更新频率、清洗 profile 和信任权重
- `src/lib/search/ingestion-contract.ts`
  - 清洗规则
  - 去重规则
  - 入库记录、分块记录和同步记录契约

配套文档：

- `docs/data-pipeline.md`：描述抓取、清洗、去重、分块、索引和查询映射
- `docs/search-storage-schema.sql`：给 Postgres 存储的基础表结构
- `docs/vector-search-schema.sql`：给 pgvector hybrid retrieval 的可选扩展结构
- `search-service/ingest/discovery-feeds.ts`：RSS / sitemap 增量候选检测工具

## 当前亮点

### 问答 / 检索双模式

这个项目没有把 AI 回答当作唯一输出，而是把“回答”和“原始检索片段”并列展示。用户既可以快速看摘要，也可以切到检索结果视图直接审查证据。

### 官方 / 社区来源分层

事实类信息优先看官方来源，经验类补充看社区内容。这个设计可以有效降低“经验被包装成权威事实”的误导风险。

### 引用来源可追溯

回答不是悬空文本。每条回答都能在来源卡片中找到依据，来源卡片同时提供来源站点、发布时间、更新时间、抓取时间和命中关键词。

### 可选生成式回答

`search-service/answer-generator.cjs` 提供 OpenAI-compatible Chat Completions 接入点。它只在检索命中后调用模型，提示词要求模型返回 `summary / usedSourceIds / confidence`，服务端再把 `usedSourceIds` 映射回 `SearchAnswer.evidence`。如果没有配置 key/model，或模型调用失败，系统会回退到 extractive answer。

### Hybrid 默认与实验性 rerank

`search-service/rerank-client.cjs` 提供兼容 `/rerank` 的 cross-encoder 接入点。当前普通请求默认不启用 rerank，只有显式 `SEARCH_RERANK_MODE=on|auto` 时才会参与重排；失败时仍保留原排序。当前真实评估已经确认 `hybrid` 是默认推荐策略，而 `hybrid_rerank` 仅保留为实验入口。`/metrics` 提供进程内 JSON 计数器，记录 provider、status、fallback、error code 和平均耗时。

### 无答案兜底

系统在信息不足时不会硬生成一个看起来完整的答案，而是返回空结果或部分命中，并引导用户继续细化提问。

## 为什么它仍然只是原型

需要明确承认的边界：

- 这个仓库已经包含最小官方 / 社区来源摄取、Postgres-backed retrieval、已验证的 hybrid 检索和实验性 rerank 接入，但还不是完整生产检索平台
- LLM 回答是可选生成层，不替代检索和来源校验；没有配置模型时仍是 extractive answer
- `source-registry.ts` 已绑定天津商业大学官方 / 社区来源，社区来源默认只摄取一个低权重入口，不能当作权威事实
- 当前已有上游错误码、seed / postgres 降级边界和轻量 metrics，但还没有完整的监控、告警、缓存和限流体系
- 已有 unit / component / contract / e2e / Postgres integration 入口，也已有固定检索评估集和真实对比报告，但仍缺生产运行指标与长期监控体系

## Validation

基于当前仓库检查，可以确认下面这些事实：

- 项目结构是单体前端仓库，不是前后端混合 monorepo
- 核心代码位于 `src/app`、`src/components`、`src/lib/search`
- 当前已有 `src/app/api/search/route.ts` 作为统一搜索入口
- 当前不再依赖 `mock-data.ts`，而是通过 `searchServiceProvider` 访问外部搜索服务
- 仓库内新增了来源注册表、清洗 / 去重契约和入库表结构草案
