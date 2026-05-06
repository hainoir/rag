# 校园 RAG 助手 · 项目完成度评估报告

> 评估时间：2026-05-04 | 项目版本：0.1.0 | 口径：区分“已通过命令验证”和“已有代码/文档支撑”

## 总体判断

项目当前适合作为**前端作品集 / 可演示 MVP**，不应包装成生产级 RAG 平台。它已经具备完整的 seed demo 演示链路，也具备 Postgres 真实数据链路的代码、CLI、schema 和 CI 验收入口；但真实数据闭环是否成立，必须以当前环境中的 `npm run verify:real-data` 或 `npm run smoke:postgres` 输出为准。

| 维度               | 修正后完成度 | 当前事实                                                                                  |
| ------------------ | -----------: | ----------------------------------------------------------------------------------------- |
| 前端 UI 与交互     |          93% | build 与 e2e 可验证，主流程完整；已补暗色模式和移动端溢出检查                             |
| 搜索服务           |          87% | seed HTTP 服务可用；Postgres lexical + 可选 pgvector + 可选 rerank 已实现但依赖环境验收   |
| 数据摄取管线       |          82% | 官方 / 社区 CLI、adapter、schema、Postgres store 和 feed 增量工具已有；真实同步需环境验证 |
| 数据契约与类型系统 |          95% | `SearchResponse` 契约、fixture、validator 已固定                                          |
| 测试体系           |          82% | unit / component / contract / seed demo / e2e / Postgres integration 已拆分               |
| 文档覆盖           |          90% | 架构、数据链路、本地 Postgres、演示部署文档齐全                                           |
| 工程配置与 DevOps  |          84% | CI 已存在；新增 lint、format check、Dockerfile、Compose 编排和 scheduled ingestion        |
| 综合完成度         |      80%-84% | 可信 MVP；生产级能力仍缺评估、告警、缓存、限流、稳定调度和社区治理闭环                    |

## 已确认属实

- 前端主流程：`/ -> /search?q=...`、结果页、回答/检索视图、来源筛选、展开片段、空结果和错误态均有 e2e 覆盖。
- 搜索服务：`search-service/server.cjs` 提供 `/api/search` 和 `/health`，支持 `seed / postgres / auto` provider，返回统一 `SearchResponse`。
- 契约体系：`docs/search-api-contract.md`、`fixtures/search-response.json`、`scripts/validate-search-contract.mjs` 是当前权威契约。
- 数据源口径：注册表是 **9 个官方注册源 + 2 个社区 HTML 源**；ingestion 当前支持 **8 个官方 HTML 源 + 2 个社区 HTML 源**，默认同步 5 个官方源和 1 个社区源。
- CI 口径：`.github/workflows/ci.yml` 已存在，并覆盖 lint、format check、contract、seed demo、unit、Postgres integration、build 和 e2e。
- P1 口径：暗色模式、组件测试、Dockerfile、归一化边界测试已经补齐；Docker 构建是否可跑取决于宿主 Docker engine。
- P2 口径：pgvector schema、embedding CLI、vector smoke、社区自动摄取、隐私清洗、可选 rerank、metrics 和 RSS/sitemap 增量候选工具已经接入；真实向量 / rerank 效果仍必须以可用 Postgres、pgvector extension、embedding key、rerank 服务和固定 query 评估验证为准。

## 已修正的风险口径

- 不能把 `npm run test:ingestion` 当成真实数据库闭环证明。现在它只跑无数据库 unit；Postgres 必须用 `npm run test:ingestion:postgres`。
- 不能把 seed corpus 演示等同于真实检索。seed 链路用 `npm run verify:demo` 和 `npm run smoke:search-service` 验收；真实链路用 `npm run verify:real-data` 验收。
- 不能声称“生产级 RAG”。当前是 lexical / pg_trgm + optional pgvector hybrid retrieval + optional rerank + extractive/optional LLM answer，仍缺少系统化评估、生产告警、缓存、限流、稳定调度和社区来源治理闭环。

## 当前验收入口

基础链路：

```bash
npm run lint
npm run format:check
npm run verify:search-contract
npm run verify:demo
npm run smoke:search-service
npm run test:unit
npm run test:embedding-client
npm run test:rerank-client
npm run build
npm run e2e -- --reporter=line
```

真实数据链路：

```bash
docker compose up -d postgres
npm run verify:real-data
```

`verify:real-data` 串联：

```bash
npm run db:init
npm run ingest:official
npm run inspect:ingestion
npm run smoke:postgres
npm run test:ingestion:postgres
npm run vector:init
npm run embed:chunks
npm run smoke:vector
curl http://localhost:8080/metrics
```

## 下一步优先级

1. 先稳定 Postgres 真实数据验收：保证 3-5 个官方源能重复同步，并让 `verify:real-data` 在本地和 CI 环境都可解释。
2. 复验 pgvector：在可用数据库和 embedding key 下跑通 `vector:init -> embed:chunks -> smoke:vector`，再用真实 query 对比 lexical 与 hybrid 命中质量。
3. 复验 rerank：接入真实 cross-encoder 服务，用固定 query 记录 rerank 前后来源顺序和答案 evidence 变化。
4. 稳定社区来源：先做来源合规说明、质量阈值、失败重试和人工复核记录，再扩大默认摄取范围。
5. 再补检索质量：增加评估集、query 分类和搜索指标，不让调参只凭主观体验。
6. 再补生产工程：继续补告警、缓存、限流、持久化指标和稳定调度。
7. UI 只做必要质量增强：移动端、a11y 和组件测试继续补，但不要用 UI 新功能掩盖真实数据链路尚未验证的问题。
