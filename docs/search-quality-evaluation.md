# 第二阶段检索质量评估说明

这份文档对应第二阶段的检索质量评估与策略对比工作。

目标不是直接上线新的 RAG 生成能力，而是先把检索质量评估、策略对比和报告产出做成一个可重复执行的闭环。

补充说明：

- 第二阶段第二批已经跑通真实 `lexical / hybrid / hybrid_rerank` 三档评估，最新报告显示 `hybrid` 已优于 `lexical`，但 `hybrid_rerank` 暂未优于 `hybrid`。
- 当前第三批重点转向负样本拒答和 rerank 有效性验证，因此报告里会继续补充负样本误召回分析和 rerank 前后变化摘要。
- `postgres` 黄金集仍受真实官方来源覆盖约束。当前真实库稳定来源主要集中在研究生招生、图书馆、教务处、主站通知与单条本科招生动态；因此 `postgres` 数据集允许按真实来源覆盖优先扩展，并在文档或报告中显式记录覆盖不足的类别，而不是用错误命中反向固化真值。

## 1. 当前范围

这批只覆盖：

- 固定评估集 v2
- `evaluate:search` 多模式、多策略评估
- lexical / hybrid / hybrid_rerank 对比入口
- 官方主指标与社区附录拆分
- 结果 JSON / Markdown 报告输出

这批不覆盖：

- LLM answer 效果调优
- feedback 后台分析
- metrics 持久化
- 生产监控与告警

## 2. 评估集结构

评估集按运行模式拆分：

- `fixtures/golden-search-evaluation.json`
  - 用于 `seed`
  - 继续使用 seed corpus 的固定 `source.id`
- `fixtures/golden-search-evaluation.postgres.json`
  - 默认用于 `postgres` 和 `external`
  - 使用真实库稳定键，不依赖 Postgres chunk UUID

`seed` 数据集的基础结构如下：

```json
{
  "id": "library-borrow-card",
  "query": "图书馆借书需要什么证件",
  "category": "图书馆",
  "sourceScope": "official",
  "expectedSourceIds": ["official-library-borrow-guide"],
  "expectedEmpty": false,
  "notes": "可选说明"
}
```

字段约束：

- `category` 只允许：`招生`、`教务`、`图书馆`、`后勤`、`学生服务`
- `sourceScope` 只允许：`official`、`community`
- `expectedEmpty=true` 时，`expectedSourceIds` 必须为空数组
- `expectedEmpty=false` 时，`expectedSourceIds` 至少要有一个 source id

`postgres` / `external` 数据集额外支持稳定键匹配：

```json
{
  "id": "library-seat-booking",
  "query": "图书馆自习座位怎么预约",
  "category": "图书馆",
  "sourceScope": "official",
  "expectedSourceMatchers": [
    {
      "dedupKey": "c55d4b6dce96b714f7c8c3647f9c517f3df97d4128c432419c5e788b935b212d",
      "title": "座位预约系统使用说明",
      "sourceName": "天津商业大学图书馆",
      "canonicalUrl": "https://lib.tjcu.edu.cn/info/1001/2521.htm"
    }
  ],
  "expectedEmpty": false
}
```

`expectedSourceMatchers` 可用字段：

- `id`
- `dedupKey`
- `canonicalUrl`
- `url`
- `title`
- `sourceName`

匹配规则：

- `expectedSourceIds` 继续按 `source.id` 精确匹配
- `expectedSourceMatchers` 会要求已提供字段全部精确相等
- 一个 case 可以同时带 `expectedSourceIds` 和 `expectedSourceMatchers`
- `expectedEmpty=true` 时，两类 expected source 都必须为空

当前口径：

- 官方 query 进入主指标
- 社区 query 只作为附录样本，不进入第一版主结论
- 负样本通过 `expectedEmpty=true` 显式声明，用于统计 `emptyAccuracy`

## 3. 运行模式

`npm run evaluate:search` 支持三种模式：

- `seed`
  - 用本地 seed corpus 启动 `search-service`
  - 只允许 `lexical`
  - 主要用于回归演示链路
- `postgres`
  - 用本地真实 PostgreSQL 启动 `search-service`
  - 可比较 `lexical`、`hybrid`、`hybrid_rerank`
  - 是第二阶段主评估模式
- `external`
  - 直接请求 `SEARCH_EVAL_BASE_URL`
  - 用于后续远端或线上环境对比

默认规则：

- 未指定 `--mode` 且设置了 `SEARCH_EVAL_BASE_URL` 时，默认 `external`
- 否则默认 `seed`
- 未显式传 `--dataset` 时：
  - `seed` 默认读取 `fixtures/golden-search-evaluation.json`
  - `postgres` / `external` 默认读取 `fixtures/golden-search-evaluation.postgres.json`

## 4. 策略维度

支持三档策略：

- `lexical`
  - 强制 `SEARCH_RETRIEVAL_MODE=lexical`
  - 强制 `SEARCH_RERANK_MODE=off`
- `hybrid`
  - 强制 `SEARCH_RETRIEVAL_MODE=hybrid`
  - 强制 `SEARCH_RERANK_MODE=off`
- `hybrid_rerank`
  - 强制 `SEARCH_RETRIEVAL_MODE=hybrid`
  - 强制 `SEARCH_RERANK_MODE=on`

搜索服务新增但不对外暴露的新环境变量：

```bash
SEARCH_RETRIEVAL_MODE=auto|lexical|hybrid
SEARCH_RERANK_MODE=auto|off|on
```

默认仍是：

```bash
SEARCH_RETRIEVAL_MODE=auto
SEARCH_RERANK_MODE=auto
```

这保证了普通请求路径仍保持 fail-open，不会因为本地缺 vector / rerank 条件而让正常搜索失败。

## 5. Skip 语义

评估脚本不会把“缺条件的策略”伪装成成功对比结果。

常见 `skipped` 原因：

- `seed_mode_only_supports_lexical`
- `database_url_missing`
- `pg_dependency_missing`
- `embedding_unconfigured`
- `rerank_unconfigured`
- `search_eval_base_url_missing`

解释规则：

- `seed` 模式请求 `hybrid` 或 `hybrid_rerank`，直接 `skipped`
- `postgres` 模式缺 `DATABASE_URL`，直接 `skipped`
- `postgres + hybrid` 缺 embedding 配置，直接 `skipped`
- `postgres + hybrid_rerank` 缺 rerank 配置，直接 `skipped`
- `external` 模式缺 `SEARCH_EVAL_BASE_URL`，直接 `skipped`

## 6. 输出结构

JSON 主报告固定包含：

- 顶层执行信息
- 数据集概览
- 每个策略的 `status`
- 每个策略的 `reason`（若 skipped / failed）
- 每个策略的官方主指标 `primarySummary`
- 每个策略的社区附录指标 `appendixSummary`
- 每个策略按 category 的统计
- 每个 case 的详细打分结果

当 case 使用稳定键匹配时，明细里会额外包含：

- `expectedSourceMatchers`
- `matchedExpectedSources`
- `returnedTopSources`
- `retrievalDiagnostics`

第三批新增的报告摘要还会包含：

- `negativeAnalysis`
- `rerankImpact`

当前指标：

- `recallAt10`
- `mrr`
- `ndcgAt10`
- `evidenceCoverage`
- `emptyAccuracy`
- `averageLatencyMs`

如果传入 `--output-dir`，脚本会同时写出：

- 一份 JSON 报告
- 一份 Markdown 摘要

## 7. 常用命令

只跑 seed 基线：

```bash
npm run evaluate:search
```

指定模式和策略：

```bash
npm run evaluate:search -- --mode postgres --strategy lexical
```

一次跑完整策略集并写出报告文件：

```bash
npm run evaluate:search -- --mode postgres --strategy all --output-dir reports
```

跑第二阶段第二批真实检索闭环：

```bash
npm run verify:retrieval:real
```

如果要用更适合中文检索的 Qwen3 向量方案，同时保留现有旧向量列不动，建议在 `.env.local` 中显式配置：

```bash
EMBEDDING_BASE_URL=https://api.siliconflow.com/v1
EMBEDDING_MODEL=Qwen/Qwen3-Embedding-8B
EMBEDDING_DIMENSIONS=1024
EMBEDDING_VECTOR_COLUMN=embedding_qwen3_1024
EMBEDDING_MODEL_COLUMN=embedding_model_qwen3_1024
EMBEDDING_EMBEDDED_AT_COLUMN=embedded_at_qwen3_1024
EMBEDDING_QUERY_INSTRUCTION=请将这个中文校园检索问题转换为检索向量，以便召回最相关的官方资料：
RERANK_BASE_URL=https://api.siliconflow.com/v1
RERANK_MODEL=Qwen/Qwen3-Reranker-4B
```

这样 `vector:init`、`embed:chunks`、`smoke:vector` 和 `evaluate:search --mode postgres --strategy all` 会统一走新的 Qwen3 1024 向量列，不会覆盖原来的 `embedding` 列。

评估远端环境：

```bash
SEARCH_EVAL_BASE_URL=https://your-search-service.example.com \
npm run evaluate:search -- --mode external --strategy lexical --output-dir reports
```

## 8. 建议使用顺序

建议按这个顺序推进第二阶段：

1. 先跑 `seed + lexical`，确认评估脚本和报告结构正常
2. 再跑 `postgres + lexical`，拿到真实数据基线
3. 补齐 embedding 条件后跑 `postgres + hybrid`
4. 补齐 rerank 条件后跑 `postgres + hybrid_rerank`
5. 固定用同一份数据集和同一组 query 比较策略差异

## 9. 当前边界

这份评估闭环只解决“检索质量是否可评估、可比较、可回归”。

它不等于：

- LLM answer 已稳定
- 线上监控已完善
- 反馈治理已成型
- 项目已达到 production-grade RAG platform

当前更准确的口径仍然是：

> 这是一个已完成真实数据闭环、正在进入第二阶段检索质量评估与策略对比的 explainable RAG MVP。
