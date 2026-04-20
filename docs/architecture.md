# 项目整体分析

## Summary

这个项目是一个 **Next.js App Router + React + TypeScript + Tailwind CSS v4** 的前端产品原型，主题是“校园信息检索与可解释问答助手”。

它现在的边界比早期 mock 版本清晰得多：前端通过 `src/app/api/search/route.ts` 请求结果，Route Handler 内部再调用 `searchServiceProvider` 访问外部搜索服务。这个仓库负责统一结果契约、状态编排和可信度表达；真实来源抓取、清洗、去重、分块和索引则由上游服务负责。

从项目形态看，它已经具备完整主流程，适合作品集展示；从工程成熟度看，它仍然不是完整生产级 RAG 平台，因为上游抓取与索引服务没有直接实现在这个仓库里。

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
- `searchServiceProvider` 负责请求外部服务，不负责抓取网页或建立索引
- 向量召回、BM25、rerank 和评估体系应由上游服务实现

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
- `docs/search-storage-schema.sql`：给 Postgres / pgvector 类存储的表结构草案

## 当前亮点

### 问答 / 检索双模式

这个项目没有把 AI 回答当作唯一输出，而是把“回答”和“原始检索片段”并列展示。用户既可以快速看摘要，也可以切到检索结果视图直接审查证据。

### 官方 / 社区来源分层

事实类信息优先看官方来源，经验类补充看社区内容。这个设计可以有效降低“经验被包装成权威事实”的误导风险。

### 引用来源可追溯

回答不是悬空文本。每条回答都能在来源卡片中找到依据，来源卡片同时提供来源站点、发布时间、更新时间、抓取时间和命中关键词。

### 无答案兜底

系统在信息不足时不会硬生成一个看起来完整的答案，而是返回空结果或部分命中，并引导用户继续细化提问。

## 为什么它仍然只是原型

需要明确承认的边界：

- 这个仓库只包含前端和搜索服务适配层，不包含抓取器、索引器和向量检索服务实现
- `source-registry.ts` 里的域名仍是模板，需要替换成目标校园的真实来源
- 当前只有前端统一错误态，还没有上游错误码和服务降级体系
- 没有埋点、监控和自动化测试体系

## Validation

基于当前仓库检查，可以确认下面这些事实：

- 项目结构是单体前端仓库，不是前后端混合 monorepo
- 核心代码位于 `src/app`、`src/components`、`src/lib/search`
- 当前已有 `src/app/api/search/route.ts` 作为统一搜索入口
- 当前不再依赖 `mock-data.ts`，而是通过 `searchServiceProvider` 访问外部搜索服务
- 仓库内新增了来源注册表、清洗 / 去重契约和入库表结构草案
