# 数据源与更新链路

这份文档描述当前仓库中“真实数据源 + 搜索服务”的交接面。前端仍然不直接执行爬虫和入库；这些工作由 `search-service/` 完成，并通过统一 `SearchResponse` 映射到结果页。

## 1. 来源注册表

来源白名单模板位于 `src/lib/search/source-registry.ts`。

每条来源至少包含：

- `id`：稳定来源标识
- `type`：`official` 或 `community`
- `baseUrl`：来源根域名
- `allowedPaths`：允许抓取的路径前缀
- `fetchMode`：`api / rss / html / sitemap / manual`
- `updateCadence`：`hourly / daily / weekly / manual`
- `cleaningProfile`：决定使用哪套清洗规则
- `trustWeight`：进入排序和回答时的基础权重

建议先只接 8 到 12 个高质量白名单来源，不要一开始就做全站抓取。当前自动摄取入口分两类：`ingest:official` 默认跑官方源；`ingest:community` 默认只跑低权重的 `tjcu-tieba`，其余社区来源需要显式指定。

RSS / sitemap 来源的增量候选检测已经沉淀在 `search-service/ingest/discovery-feeds.ts`，可解析 `loc / lastmod`、`link / guid / pubDate`，并按 `lastSeenAt` 过滤旧内容。当前官方 HTML adapter 仍保持原路径，后续新增 feed 来源时再接入这套工具。

## 2. 清洗规则

清洗规则模板位于 `src/lib/search/ingestion-contract.ts` 的 `CLEANING_RULES`。

### 官方来源

- 去导航、页脚、广告、悬浮栏
- 保留标题、来源站点、发布时间、更新时间、原始链接
- 合并重复段落
- 标准化绝对时间

### 社区来源

- 去广告、去联系方式、去楼层噪音
- 只保留公开帖子正文
- 把“昨天 / 上周 / 刚刚”转换成抓取当天对应的绝对时间
- 只把社区内容作为经验补充，不把它提升为权威事实
- 入库前隐藏手机号、邮箱和常见微信 / QQ 联系方式

## 3. 去重规则

去重规则模板位于 `src/lib/search/ingestion-contract.ts` 的 `DEDUP_RULES`。

推荐按这个顺序做：

1. `canonical_url`：同一规范链接只保留一份主文档
2. `title_and_date`：标题和发布日期完全一致时标记为重复候选
3. `content_hash`：清洗后的正文哈希一致时合并版本
4. `simhash`：正文高相似片段在分块阶段合并

这样既能处理官方公告转载，也能处理社区帖子反复摘抄。

## 4. 入库流程

推荐链路：

`定时任务 -> 来源抓取 -> 正文抽取 -> 清洗 -> 去重 -> 分块 -> 索引 -> 查询 API`

更具体的阶段建议：

1. `fetch`
   - 根据来源注册表抓取增量页面
   - 记录本次同步开始时间和抓取数量
2. `clean`
   - 按 `cleaningProfile` 执行清洗
   - 抽取标题、正文、发布时间、更新时间、来源站点
3. `dedup`
   - 先按 `canonicalUrl`
   - 再按 `title + publishedAt`
   - 最后按 `contentHash / simhash`
4. `chunk`
   - 对清洗后的正文按段落或固定 token 数切片
   - 为每个 chunk 生成可回显的 `snippet` 和 `fullSnippet`
5. `index`
   - 写入全文索引
   - 可选执行 `vector:init -> embed:chunks` 写入 pgvector embedding
   - 记录 chunk 数量和入库结果
6. `publish`
   - 对查询 API 暴露统一的搜索结果结构

## 5. 时间字段约定

为了避免时间语义混乱，建议明确区分：

- `publishedAt`：来源原始发布时间
- `updatedAt`：来源页面最近更新时间
- `fetchedAt`：抓取或入库时间
- `lastVerifiedAt`：最近校验时间
- `resultGeneratedAt`：本次回答对象生成时间

`resultGeneratedAt` 不能拿来冒充来源更新时间。

## 6. 查询 API 到前端的映射

前端结果页现在依赖的关键字段：

- `SearchResponse.query`
- `SearchResponse.status`
- `SearchResponse.answer`
- `SearchResponse.sources`
- `SearchResponse.resultGeneratedAt`

每条 `SearchSource` 建议至少返回：

- `id`
- `title`
- `type`
- `sourceName`
- `publishedAt`
- `updatedAt`
- `fetchedAt`
- `lastVerifiedAt`
- `snippet`
- `fullSnippet`
- `matchedKeywords`
- `url`
- `canonicalUrl`
- `freshnessLabel`
- `trustScore`

## 7. 存储结构

表结构草案见 [search-storage-schema.sql](./search-storage-schema.sql)。可选 pgvector 扩展见 [vector-search-schema.sql](./vector-search-schema.sql)。

最小可用集合：

- `source_registry`
- `documents`
- `document_versions`
- `chunks`
- `ingestion_runs`

如果后续要做失败重试或调试回放，再补 `ingestion_run_items`。

## 8. 向量检索扩展

当前 pgvector 是可选增强，不改变前端契约：

1. `npm run vector:init`
   - 创建 `vector` extension
   - 给 `chunks` 增加 `embedding / embedding_model / embedded_at`
   - 创建 HNSW 索引，失败时回退 IVFFLAT
2. `npm run embed:chunks`
   - 读取最新 active document version 中未 embedding 的 chunks
   - 调用 OpenAI-compatible embeddings API
   - 把向量、模型名和写入时间落回 `chunks`
3. `npm run smoke:vector`
   - 用一个固定 query 生成 query embedding
   - 检查向量距离排序能返回已入库 chunk

`search-service` 会检测 `chunks.embedding` 和 embedding key。满足条件时使用 lexical + vector hybrid retrieval；不满足时仍使用现有 lexical / pg_trgm 路径。

## 9. Rerank 与观测

cross-encoder rerank 是可选二阶段排序：

- 环境变量：`RERANK_API_KEY / RERANK_BASE_URL / RERANK_MODEL / RERANK_TOP_K`
- 请求形态：兼容常见 `/rerank` API，传入 `query` 和候选 `documents`
- 失败策略：记录 `rerank.failed`，保留原 lexical / hybrid 排序

搜索服务同时提供 `/metrics` JSON 端点，记录 provider、status、fallback reason、error code 和平均耗时。当前它是进程内计数器，适合本地调试和 demo，不替代生产监控。
