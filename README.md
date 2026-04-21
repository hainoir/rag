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

`SearchBox / SuggestedQuestions -> /api/search -> searchServiceProvider -> SEARCH_SERVICE_URL -> SearchResponse -> ResultsShell -> 回答视图 / 检索视图`

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

仓库现在内置了一个最小可用的上游搜索服务，启动 `npm run search-service` 后会在 `http://localhost:8080/api/search` 提供 HTTP 搜索接口。这个服务基于本地 seed corpus 做关键词召回和结果归一化，适合把前端搜索链路从 mock 切到真实接口；如果后续接入爬虫、清洗和索引服务，只需要继续复用同一条 `SearchResponse` 契约。

`.env.local` 至少需要配置一个可访问的 `SEARCH_SERVICE_URL`。如果上游服务没有准备好，前端会进入错误态，而不会伪装成“无答案”。

然后访问 [http://localhost:3000](http://localhost:3000)。

## 后续方向

当前推荐的演进顺序是：

1. 把 `source-registry.ts` 里的模板域名替换成目标校园的真实官方 / 社区来源
2. 在独立搜索服务里实现抓取、清洗、去重、分块和索引
3. 固定依赖版本并补自动化测试
4. 再补更细的错误分类、埋点和监控
