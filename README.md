# 校园信息检索与可解释问答助手

副标题：基于 RAG 思路的校园信息检索前端产品原型

面向校园信息查询场景，聚合官方公开信息与社区讨论内容，提供带引用来源、来源分层和检索结果可视化的问答体验。项目重点不在于做一个聊天机器人，而在于把问答结果、检索证据与来源可信度用清晰的前端交互组织出来。

![首页搜索页占位图](./public/screenshots/home-placeholder.svg)
![结果页占位图](./public/screenshots/result-placeholder.svg)

## 项目概览

这是一个 **Next.js App Router + React + TypeScript + Tailwind CSS v4** 的前端产品原型，主题是“校园信息检索与可解释问答助手”。

项目当前定位要点：

- 前端统一通过 `/api/search` 获取 `SearchResponse`
- Route Handler 内部调用 `searchServiceProvider`，再代理到外部搜索服务
- `SearchSource` 已支持来源站点、发布时间、更新时间、抓取时间、最近校验时间和来源新鲜度
- 仓库内已经补齐来源注册表、清洗规则、去重规则和入库表结构骨架，方便接真实数据链路
- 搜索服务可选接入 OpenAI-compatible LLM，把检索片段升级为生成式回答；未配置 key 时自动保持 extractive answer

这个项目适合作为：

- 前端作品集项目
- 可解释 AI / RAG 产品的交互原型
- 面试中讲解状态设计、可信度表达和接口边界的案例

## 当前能力

- 首页输入问题、推荐问题和本地历史记录
- 结果页两阶段 loading
- 回答 / 检索结果双视图切换
- 官方 / 社区来源分层筛选
- 来源卡片展开、原文跳转和关键词高亮
- 来源卡片展示来源站点、发布时间、更新时间、抓取时间和最近校验时间
- 无答案兜底和相关问题推荐
- 统一的 `/api/search` 搜索入口

## 当前检索链路

浏览器提问后，当前链路是：

`SearchBox / SuggestedQuestions -> /api/search -> searchServiceProvider -> SEARCH_SERVICE_URL -> search-service -> SearchResponse -> ResultsShell -> 回答视图 / 检索视图`

这条链路已经具备“前端只消费统一结果结构”的边界。当前仓库**不直接包含**下面这些生产能力：

- 爬虫或 RSS 抓取服务
- 正文抽取与清洗执行器
- 向量数据库 / BM25 / rerank 服务
- 在线评估与监控平台

这些能力现在通过仓库内的契约文件和文档留好了接口，而不是继续写死在前端页面里。

## 数据源与更新链路

和真实数据接入直接相关的文件：

- [src/lib/search/source-registry.ts](./src/lib/search/source-registry.ts)：官方 / 社区来源白名单与更新频率模板
- [src/lib/search/ingestion-contract.ts](./src/lib/search/ingestion-contract.ts)：清洗规则、去重规则和入库记录契约
- [docs/data-pipeline.md](./docs/data-pipeline.md)：抓取、清洗、去重、分块、入库和查询映射说明
- [docs/search-storage-schema.sql](./docs/search-storage-schema.sql)：Postgres 表结构草案
- [docs/architecture.md](./docs/architecture.md)：前端边界与上游服务分工

## 技术栈

- Next.js App Router
- React
- TypeScript
- Tailwind CSS v4
- React Context
- Local Storage
- Route Handler API
- External Search Service Contract

## 面试准备重点

推荐把这个项目讲成“可解释 RAG 的前端产品原型”，重点放在：

- 为什么校园信息查询更适合“检索优先”而不是聊天壳子
- 为什么回答必须和来源片段一起展示
- 为什么官方 / 社区来源要分层
- 为什么要把 `resultGeneratedAt` 和来源更新时间分开
- 为什么来源卡片要展示发布时间、更新时间和最近校验时间
- 这个仓库里哪些是前端表达，哪些应该由上游搜索服务负责

详细拆解见 [docs/architecture.md](./docs/architecture.md)。  
数据链路说明见 [docs/data-pipeline.md](./docs/data-pipeline.md)。  
面试讲稿、追问准备和演示脚本见 [docs/interview-notes.md](./docs/interview-notes.md)。

## 本地运行

```bash
npm install
cp .env.example .env.local
npm run verify:search-contract
npm run search-service
npm run dev
```

仓库现在内置了一个最小可用的上游搜索服务，启动 `npm run search-service` 后会在 `http://localhost:8080/api/search` 提供 HTTP 搜索接口。默认 `SEARCH_SERVICE_PROVIDER=auto`：配置 `DATABASE_URL` 时优先读取 Postgres 中的 ingestion chunks；没有数据库时使用本地 seed corpus 作为 demo fallback。无论哪种模式，都继续输出同一条 `SearchResponse` 契约。

`.env.local` 至少需要配置一个可访问的 `SEARCH_SERVICE_URL`。如果上游服务没有准备好，前端会进入错误态，而不会伪装成“无答案”。

然后访问 [http://localhost:3000](http://localhost:3000)。

### 可选 LLM 回答

默认回答模式是 `SEARCH_ANSWER_MODE=extractive`，只根据命中的 chunk 片段拼接摘要，不需要任何模型密钥。需要演示生成式 RAG 回答时，可以配置 OpenAI-compatible Chat Completions：

```bash
SEARCH_ANSWER_MODE=llm
LLM_API_KEY=...
LLM_BASE_URL=https://api.openai.com/v1
LLM_MODEL=your-chat-model
```

LLM 只在检索已有来源时调用，提示词要求模型只使用传入 evidence，并返回 `usedSourceIds`。服务会把这些 sourceId 映射回 `SearchAnswer.evidence`，保持前端契约不变；模型调用失败时回退 extractive answer。

## 官方来源 Ingestion v1

仓库现在额外提供了一套面向官方来源的 CLI ingestion 闭环，运行在 `search-service/` 下的 TypeScript runtime 中，不改前端查询链路。默认同步 5 个官方源，运行时已支持主站、图书馆、教务处、学生处、后勤、就业网、本科招生网和研究生招生网。

在执行同步前，需要先配置数据库和 ingestion 运行参数：

```bash
DATABASE_URL=postgres://...
SEARCH_SERVICE_PROVIDER=postgres
INGEST_SOURCE_IDS=tjcu-main-notices,tjcu-library,tjcu-academic-affairs,tjcu-undergrad-admissions,tjcu-grad-admissions
INGEST_FETCH_LIMIT=12
INGEST_HTTP_TIMEOUT_MS=15000
INGEST_CONCURRENCY=4
INGEST_USER_AGENT=campus-rag-ingestion/1.0 (+https://www.tjcu.edu.cn/)
```

常用命令：

```bash
npm run smoke:search-service
npm run db:init
npm run ingest:official
npm run ingest:source -- tjcu-main-notices
npm run inspect:ingestion
npm run smoke:postgres
npm run test:ingestion
```

这期已经闭合了 `documents / document_versions / chunks / ingestion_runs -> search-service -> SearchResponse` 的最小真实数据回路。重复执行 `npm run ingest:official` 时，未变化文章只刷新校验时间，不会重复插入相同文档和版本。
`npm run smoke:postgres` 会检查默认官方源是否已有可检索文档和 chunk，并验证一个真实命中 query 与一个预期无命中 query，避免把 seed corpus 或泛词命中误判为真实闭环成功。

本地 Postgres 启动和真实检索闭环见 [docs/local-postgres.md](./docs/local-postgres.md)。演示 query 与部署边界见 [docs/demo-and-deploy.md](./docs/demo-and-deploy.md)。

## 后续方向

当前推荐的演进顺序是：

1. 固化本地真实闭环复验：`db:init -> ingest:official -> inspect:ingestion -> smoke:postgres -> /api/search`
2. 配置 `SEARCH_ANSWER_MODE=llm` 做生成式回答演示，并保留无 key 时的 extractive fallback
3. 扩大官方来源 adapter 的实站验证范围，优先保证 3-5 个来源稳定重复同步
4. 再补向量检索、错误分类、埋点、监控和定时摄取任务
