# Search API Contract

这份文档是前端 `SearchResponse` 与后端搜索服务之间的权威契约。

目标只有一个：前后端对字段名、时间语义、状态值不再有歧义。

## Scope

- 适用入口：上游搜索服务返回给前端 `searchServiceProvider` 的响应体
- 权威字段名：只认 camelCase
- 非 contract 字段名：`updated_at`、`siteName`、`results`、`generatedAt` 这类别名不属于正式契约
- 兼容说明：前端目前仍保留少量别名兜底，目的是迁移期兼容，不代表后端可以继续自由漂移

## Request

后端至少要支持下面两种请求形式中的一种：

### GET

`GET /api/search?q=<query>&limit=<limit>`

### POST

```json
{
  "query": "图书馆怎么借书",
  "limit": 6
}
```

约束：

- `query` 是用户原始查询字符串，后端可以做 trim，但不能改成别的字段名
- `limit` 是正整数，表示本次最多返回多少条 `sources`

## Response Shape

```json
{
  "query": "图书馆怎么借书",
  "status": "ok",
  "answer": {
    "summary": "string",
    "sourceNote": "string",
    "disclaimer": "string",
    "confidence": 0.82
  },
  "sources": [
    {
      "id": "official-library-borrow-guide",
      "title": "图书馆借阅与续借办理说明",
      "type": "official",
      "sourceName": "天津商业大学图书馆",
      "sourceDomain": "lib.tjcu.edu.cn",
      "publishedAt": "2026-03-01T02:00:00.000Z",
      "updatedAt": "2026-04-18T02:00:00.000Z",
      "fetchedAt": "2026-04-20T02:00:00.000Z",
      "lastVerifiedAt": "2026-04-20T02:00:00.000Z",
      "snippet": "string",
      "fullSnippet": "string",
      "matchedKeywords": ["图书馆", "借书"],
      "url": "https://example.edu.cn/notice",
      "canonicalUrl": "https://example.edu.cn/notice",
      "freshnessLabel": "fresh",
      "trustScore": 0.95,
      "dedupKey": "lib-borrow-guide"
    }
  ],
  "relatedQuestions": ["图书馆自习座位怎么预约？"],
  "retrievedCount": 2,
  "resultGeneratedAt": "2026-04-20T08:30:00.000Z"
}
```

完整样例见 [fixtures/search-response.json](../fixtures/search-response.json)。

## Top-Level Rules

### `status`

只允许 4 个值：

- `ok`
- `partial`
- `empty`
- `error`

语义约束：

- `ok`：有可展示来源，且 `answer` 不能为空
- `partial`：有可展示来源，但答案完整性不足；`answer` 仍然应该返回一个可展示摘要
- `empty`：没有命中结果；`answer` 必须为 `null`，`sources` 必须为空数组
- `error`：请求链路失败；`answer` 必须为 `null`，`sources` 必须为空数组

### `resultGeneratedAt`

- 含义：本次响应对象的生成时间
- 格式：UTC ISO 8601，例如 `2026-04-20T08:30:00.000Z`
- 禁止误用：不能把它当作来源更新时间或内容新鲜度时间

### `retrievedCount`

- 含义：后端实际命中的总条数
- 约束：必须大于等于 `sources.length`
- 用途：让前端知道“当前展示条数”和“总命中条数”不是一回事

## Source Contract

每一条 `sources[i]` 都必须满足以下约束。

### Required Fields

- `id: string`
- `title: string`
- `type: "official" | "community"`
- `sourceName: string`
- `updatedAt: string | null`
- `fetchedAt: string`
- `lastVerifiedAt: string | null`
- `snippet: string`
- `matchedKeywords: string[]`
- `freshnessLabel: "fresh" | "recent" | "stale" | "undated"`

### Optional Fields

- `sourceDomain?: string`
- `publishedAt?: string | null`
- `fullSnippet?: string`
- `url?: string`
- `canonicalUrl?: string`
- `trustScore?: number`
- `dedupKey?: string`

### Nullability Rule

对时间字段执行同一条规则：

- 字段有值时：必须是 UTC ISO 8601 字符串
- 字段未知时：必须显式返回 `null`
- 不要返回空字符串
- 不要返回 `"N/A"`、`"-"`、`"unknown"` 这类占位文本
- 不要在这些关键字段上省略属性名

这条规则重点覆盖：

- `updatedAt`
- `lastVerifiedAt`

`publishedAt` 推荐也遵守同样的 `string | null` 约束。

## Time Semantics

下面 5 个时间字段必须严格区分：

- `publishedAt`：来源内容第一次公开发布时间
- `updatedAt`：来源页面或来源内容最近一次更新时间
- `fetchedAt`：搜索服务抓取、入库或物化这条来源记录的时间
- `lastVerifiedAt`：搜索服务最近一次重新校验这条来源链接或元数据仍然有效的时间
- `resultGeneratedAt`：本次搜索响应生成时间

禁止混用：

- 不能用 `resultGeneratedAt` 冒充 `updatedAt`
- 不能用最近一次抓取时间 `fetchedAt` 冒充来源内容真的更新了
- 不能把 `lastVerifiedAt` 理解成“来源内容更新”，它只表示后端确认过这条来源仍可用

## Freshness Contract

`freshnessLabel` 必须由后端显式返回，且只允许 4 个值：

- `fresh`
- `recent`
- `stale`
- `undated`

判定顺序固定为：

1. `lastVerifiedAt`
2. `updatedAt`
3. `publishedAt`
4. `fetchedAt`

说明：

- 后面的字段只能在前面的字段缺失时补位
- 不能因为今天重新抓取过旧文章，就把它从 `stale` 直接变成 `fresh`

判定阈值以本次响应的 `resultGeneratedAt` 为参考时间：

- `fresh`：参考时间距今 `0-3` 天
- `recent`：参考时间距今 `4-30` 天
- `stale`：参考时间距今大于 `30` 天
- `undated`：四个参考字段都缺失或都不可解析

## Answer Contract

当 `answer` 不为 `null` 时，必须包含：

- `summary: string`
- `sourceNote: string`
- `disclaimer: string`
- `confidence: number`
- `evidence?: Array<{ sourceId: string; title: string; sourceName?: string; snippet?: string }>`

约束：

- `confidence` 使用 `0-1` 浮点数
- 不要混用百分比整数和小数
- `evidence` 用于把摘要绑定到本次 `sources` 中已展示的来源或 chunk，不能引用本次响应之外的片段

## Non-Negotiable Naming Rules

- 顶层字段只用 `query / status / answer / sources / relatedQuestions / retrievedCount / resultGeneratedAt`
- 来源字段只用 `sourceName / publishedAt / updatedAt / fetchedAt / lastVerifiedAt / freshnessLabel`
- 不要再输出 snake_case、PascalCase 或同义别名来赌前端兜底

## Verification

仓库内提供了一个轻量校验脚本：

```bash
npm run verify:search-contract
```

默认校验 [fixtures/search-response.json](../fixtures/search-response.json)。

也可以手动指定别的响应文件：

```bash
node scripts/validate-search-contract.mjs path/to/response.json
```
