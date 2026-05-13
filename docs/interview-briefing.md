# 面试用项目简介与预测问答

> 适用对象：需要在面试里介绍 `campus-rag-assistant` 项目的人  
> 当前口径：这是一个可演示的校园信息检索 / explainable RAG MVP，不是生产级 RAG 平台

## 一句话定位

这是一个面向校园公开信息的检索优先、回答可追溯的 RAG 产品原型。它不是简单的聊天壳子，而是把“答案、证据、来源可信度、结果状态”一起做进前端体验里。

## 30 秒版本

这个项目是一个校园信息检索与可解释问答助手，我想解决的不是“模型能不能生成一段话”，而是“用户拿到答案后能不能快速核验”。  
所以我把结果页做成了“回答摘要 + 来源卡片 + 原始命中片段”的结构，前端统一通过 `/api/search` 获取 `SearchResponse`，后面再由 `searchServiceProvider` 代理到独立搜索服务。  
它已经是一个可以演示的 RAG MVP，而且真实数据验收和检索评估已经闭环；但我不会把它包装成生产级平台，因为监控、稳定调度、后台治理和长期运维能力还没有完全闭环。

## 1 分钟版本

这个项目的主题是“校园信息检索与可解释问答”。我没有把它做成一个普通聊天页面，而是把重点放在“答案是否可信、用户能不能回头核对来源”。

技术上它基于 `Next.js App Router + React + TypeScript + Tailwind CSS v4`。前端只请求 `/api/search`，Route Handler 再通过 `searchServiceProvider` 调上游 `search-service`。上游服务目前支持 `seed / postgres / auto` 三种 provider，能够返回统一的 `SearchResponse` 契约。

这个项目最有价值的地方有三个：

- 回答和证据一起展示，不是只吐一段 AI 文本
- 官方来源和社区来源分层，避免把经验贴包装成确定事实
- 结果状态明确区分 `ok / partial / empty / error`，信息不足时不会强答

如果面试官问项目边界，我会明确说：它是一个可演示的 explainable RAG MVP，已经有官方来源摄取、Postgres 检索、已验证的 hybrid 检索、实验性 rerank 和可选 LLM answer，但还不是完整生产级 RAG 系统。

## 3 分钟版本

### 1. 我为什么做这个项目

我不想再做一个“输入问题，输出一大段 AI 文本”的聊天壳子，因为那类项目很难体现前端在真实产品里的价值。  
校园信息查询更像一个真实场景：用户既想快速拿到结论，也想知道依据是什么；而且官方规则、社区经验、时间敏感信息经常混在一起，所以产品必须能表达不确定性。

### 2. 这个项目解决什么问题

它主要解决三个问题：

- 用户怎么快速拿到结论
- 用户怎么知道结论来自哪里
- 系统在信息不够时怎么不乱答

所以结果页不是只展示答案，而是同时展示：

- 结构化回答
- 来源列表
- 原始命中片段
- 来源类型和时间语义
- 结果状态与兜底提示

### 3. 架构上我是怎么拆的

前端和搜索实现之间，我先守住统一边界：

`SearchBox -> /search?q=... -> ResultsShell -> /api/search -> searchServiceProvider -> search-service -> SearchResponse -> AnswerPanel / SourceList`

这样前端只消费 `SearchResponse`，不直接依赖数据库、抓取器或索引细节。  
后面即使换检索方式，页面层基本不用推倒重来。

### 4. 这个项目最值得讲的亮点

- 可解释性：回答和证据一起展示，用户能回到来源核验
- 可信度表达：官方 `official` 和社区 `community` 明确分层
- 状态设计：不是简单的“有结果 / 没结果”，而是 `ok / partial / empty / error`
- 工程边界：前端统一走 `/api/search`，由服务端代理上游搜索服务
- 可演进性：上游已经有真实验证过的 lexical / hybrid 检索、实验性 rerank 和可选 LLM answer，但前端契约保持稳定

### 5. 我会怎么诚实总结它

我会把它定义成“一个可演示的校园信息检索 / explainable RAG MVP”。  
它已经能展示完整主流程，也有真实化改造的代码路径；但我不会把它说成生产级平台，因为评估集、告警、限流、缓存策略、稳定调度和更完整的数据治理还没完全闭环。

## 项目主链路怎么讲

如果面试官让你按流程讲，可以直接按下面这条线：

1. 用户在首页输入校园问题，或者点推荐问题。
2. 前端通过 `useSearchNavigation` 跳到 `/search?q=...`。
3. `ResultsShell` 请求 `/api/search`，这是前端唯一搜索入口。
4. `src/app/api/search/route.ts` 会生成 `requestId`，做限流、缓存、日志记录，然后调用 `searchServiceProvider`。
5. `searchServiceProvider` 根据 `SEARCH_SERVICE_URL` 去请求上游 `search-service`。
6. 上游返回统一的 `SearchResponse`，其中包含 `status`、`answer`、`sources`、`relatedQuestions`、`resultGeneratedAt` 等字段。
7. 前端再用 `AnswerPanel`、`SourceList`、`StatusPanel` 把回答、证据和状态展示出来。

## 你可以重点强调的技术亮点

### 1. 统一结果契约

`src/lib/search/types.ts` 里定义了统一的 `SearchResponse`、`SearchSource`、`SearchStatus`。  
这让前端不需要感知上游到底是 seed 检索、Postgres lexical 检索，还是后续接入的 vector / rerank。

### 2. 结果状态不是二元的

项目里不是只有“成功”和“失败”两种状态，而是：

- `ok`：有较完整的高置信结果
- `partial`：有相关线索，但不足以形成高置信回答
- `empty`：当前没有足够可靠的信息
- `error`：请求或上游服务失败

这个设计比“答得出来就行”更接近真实信息产品。

### 3. 来源分层和时间语义

`src/lib/search/source-registry.ts` 里把来源分成 `official` 和 `community`，并为不同来源配置 `trustWeight`。  
`SearchSource` 还保留了 `publishedAt`、`updatedAt`、`fetchedAt`、`lastVerifiedAt`、`freshnessLabel` 这些字段，用来表达信息时效性，而不是把所有时间都混成一个字段。

### 4. 服务端网关而不是前端直连

`src/app/api/search/route.ts` 不是一个简单转发层。  
它还负责：

- 生成请求级 `requestId`
- 读写缓存
- 限流
- fail-open 记录查询日志
- 给前端附加 `meta.errorCode`、`cacheStatus`、`durationMs`

这说明项目已经开始考虑“搜索接口如何更接近真实线上入口”。

### 5. 上游搜索服务可以演进，但前端边界稳定

`search-service/server.cjs` 现在已经支持：

- `seed` provider：本地演示和兜底
- `postgres` provider：读取 Postgres chunk 检索
- `auto` provider：优先 Postgres，失败时回退 seed
- 可选 pgvector hybrid retrieval
- 可选 rerank
- 可选 evidence-bound LLM answer
- `/metrics` 统计

你可以把这部分讲成：后端能力在逐步真实化，但页面层始终只消费一个统一结果契约。

## 绝对不要夸大的说法

下面这些说法建议不要用：

- 不要说“这是完整生产级 RAG 平台”
- 不要说“已经做了大规模实时爬虫和稳定在线检索”
- 不要说“前端直接查数据库”
- 不要说“模型自己理解并回答了所有校园问题”
- 不要把 seed demo 当成真实数据库闭环证明

更稳妥的说法是：

> 这是一个可演示的校园信息检索 / explainable RAG MVP，已经有真实化的搜索服务、摄取和检索骨架，但生产级能力仍在后续闭环中。

## 高频预测问答

### 1. 这个项目到底是什么

这是一个面向校园公开信息的检索优先问答产品原型。  
它的重点不是“让模型像聊天机器人一样自由发挥”，而是让用户在拿到回答的同时，也能看到依据、来源类型和时间信息。

### 2. 它和普通 AI 聊天页面最大的区别是什么

普通聊天页面更像“用户提问，模型直接生成文本”。  
这个项目更像“先检索，再组织回答，再把证据展示给用户”。  
所以它更强调来源可追溯、状态兜底和可信度表达。

### 3. 为什么这个项目适合放在前端 / Web 面试里讲

因为它不是只接一个模型接口然后渲染文本，而是把复杂状态、信息层次和可信度表达做成了产品体验。  
前端价值主要体现在结果组织、视图切换、空态 / 部分命中兜底、来源分层和统一接口消费上。

### 4. 整体架构怎么设计

我把它拆成三层：

- 页面层：输入、跳转、结果展示、来源展开、视图切换
- 网关层：`/api/search` 统一前端入口，做限流、缓存、日志和错误归一化
- 搜索服务层：负责 seed / Postgres 检索、可选向量召回、可选 rerank 和可选 LLM summary

这种拆法的核心好处是：检索实现可以继续演化，但前端不需要直接跟着底层数据结构变化。

### 5. 为什么要设计统一的 `SearchResponse`

因为我不希望页面代码被某一种检索实现绑死。  
只要上游最后能返回 `query / status / answer / sources / relatedQuestions / resultGeneratedAt` 这套结构，前端就能稳定工作。  
这也是后续把 seed、Postgres、vector 和 rerank 串在一起时最重要的工程边界。

### 6. 为什么要区分 `official` 和 `community`

因为两类信息的可信度和用途不一样。  
官方来源更适合承载规则、流程、通知这类确定性信息；社区来源更适合补充经验和体感。  
如果不分层，用户很容易把经验贴误读成权威结论。

### 7. 为什么结果状态要分成 `ok / partial / empty / error`

因为真实信息产品不能把“有一点线索”“完全没找到”“服务请求失败”混成一种状态。  
`partial` 是在提醒用户：有一定相关信息，但不足以形成高置信结论；`empty` 是明确告诉用户当前没有可靠结果；`error` 则属于系统层问题。

### 8. 如果检索不到，或者来源互相冲突，系统怎么办

如果检索不到，就返回 `empty`，不去硬凑一个看起来完整的答案。  
如果来源冲突，产品层会优先展示官方来源，把社区来源作为补充说明。  
这比“先让模型生成一个听起来合理的答案”更稳妥。

### 9. 这个项目算不算真正的 RAG

算是一个 RAG 思路驱动的 MVP，但不是完整生产级 RAG 平台。  
因为它已经具备“检索优先、证据约束、统一结果契约、来源展示”的关键链路；但评估、告警、稳定调度和更完整的数据治理还没全部闭环。

### 10. LLM 在这个项目里扮演什么角色

LLM 在这里不是唯一核心，而是可选的回答组织层。  
上游命中来源后，可以基于 evidence 生成总结；如果没有配置模型，或者模型失败，也能回退到 extractive answer。  
也就是说，检索和证据是主体，生成只是锦上添花。

### 11. 当前真实数据能力做到哪一步

目前仓库里已经有官方来源摄取 CLI、Postgres schema、真实 `lexical / hybrid / hybrid_rerank` 三档评估报告，以及默认推荐 `hybrid` 的结论。  
同时 `source-registry.ts` 里已经配置了官方和社区来源入口。  
但我会明确说：这代表检索闭环已经跑通，不代表监控、调度和后台治理已经达到生产级。

### 12. 这个项目里最难的点是什么

最难的不是页面数量，而是状态和边界。  
一方面，结果页要同时处理 loading、视图切换、筛选、来源展开、历史记录和多种结果状态；另一方面，前端又不能和底层检索实现耦死，所以我更重视统一契约和网关层设计。

### 13. 做了哪些工程化保障

当前仓库已经有几类比较关键的验证入口：

- `npm run verify:search-contract`
- `npm run verify:demo`
- `npm run test:unit`
- `npm run build`
- `npm run e2e`

如果需要验证真实数据库链路，还有：

- `npm run verify:real-data`
- `npm run smoke:postgres`
- `npm run smoke:vector`

这些命令说明项目不是停留在“页面能点开”的层面，而是开始为契约、主流程和检索链路建立验收入口。

### 14. 为什么前端不直接读数据库

因为数据库结构不应该暴露给页面层。  
我希望前端只关心“统一搜索结果长什么样”，而不是感知 chunks、documents、ingestion runs 这些底层表结构。  
这样替换检索实现时，影响面会更小。

### 15. 如果继续做，你下一步会补什么

我会按这个顺序继续：

1. 先进入第三阶段可靠性建设，补缓存、超时、限流和观测
2. 再补 query logs、feedback 和更完整的后台治理
3. 如果后续有必要，再单独优化实验性 rerank，而不是把它作为默认策略
4. 最后再补更完整的调度、备份恢复和发布物料

这个顺序的核心思路是：先把真实链路做扎实，再谈更大的能力扩展。

### 16. 如果面试官问“你最想体现的能力是什么”

我会说，这个项目最想体现的不是“我接了一个模型接口”，而是我把一个 AI 主题做成了更接近真实产品的前端体验。  
我重点处理的是可信度表达、统一接口边界、复杂状态设计，以及“系统什么时候应该回答，什么时候应该诚实地说不知道”。

## 可直接套用的收尾总结

如果面试官让你最后用一句话总结，可以直接说：

> 这是一个把 RAG 主题做成真实产品原型的项目，我重点解决的不是“模型能不能回答”，而是“回答如何更可信、可追溯、可核验”，同时在工程上把前端结果页和上游搜索服务之间的边界先设计清楚。

## 个人贡献回答模板

如果面试官追问“你具体做了什么”，建议只保留你真实做过的部分。下面这段可以按实际经历删改：

> 我主要负责把项目做成一个更像真实产品的搜索体验，而不是聊天壳子。具体包括统一搜索入口、结果页状态编排、回答和来源的组合展示、`official / community` 分层、以及围绕 `SearchResponse` 的前后端边界设计。如果你的实际经历更多在数据摄取、搜索服务或测试验证，就把对应部分替换成你真实负责的工作。

## 代码证据索引

如果面试官要你进一步落到代码，可以优先看这些文件：

- `src/lib/search/types.ts`：统一 `SearchResponse` / `SearchSource` / `SearchStatus`
- `src/app/api/search/route.ts`：前端唯一搜索入口，含限流、缓存、日志、错误归一化
- `src/lib/search/search-provider.ts`：上游搜索服务适配层
- `src/lib/search/source-registry.ts`：官方 / 社区来源白名单和权重
- `search-service/server.cjs`：seed / Postgres / vector / rerank / LLM answer / metrics
- `docs/search-api-contract.md`：搜索契约文档
- `docs/demo-and-deploy.md`：演示与验证路径
- `package.json`：校验、测试、构建和演示脚本入口
