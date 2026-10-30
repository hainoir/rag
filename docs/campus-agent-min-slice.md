# Campus Agent 最小切片（设计草稿，实现契约）

## Goal
在现有 hybrid RAG 上增加可演示的工具调用主链路：检索 → 可选工具 → 带引用回答 / 失败回退。面试能讲清需求→入口→数据流→验证。

## Chosen shape（相对「塞进 search-service」）
编排放在 Next.js：`src/lib/agent/*` + `src/app/api/agent/route.ts`（SSE）。
检索仍走现有 `searchServiceProvider` / `/api/search` 契约，不改 search-service 核心。

## Domain model
- `AgentPhase`: `received` | `retrieving` | `tool` | `answering` | `done` | `error` | `fallback`
- `AgentEvent`（discriminated union，SSE 每行一个 JSON）:
  - `{ type: "phase", phase: AgentPhase, detail?: string }`
  - `{ type: "tool_call", id: string, name: ToolName, args: Record<string, unknown> }`
  - `{ type: "tool_result", id: string, name: ToolName, ok: boolean, summary: string }`
  - `{ type: "answer", summary: string, citations: AgentCitation[], fallback?: boolean }`
  - `{ type: "error", message: string, code?: string }`
- `ToolName`: `search_notices` | `export_citations`
- Tools 用 **registry**（name → `{ description, run }`），禁止散落 if/else。

## Tools
1. `search_notices`: 包装现有 `searchServiceProvider.search(query)`，返回精简 sources/answer。
2. `export_citations`: 对给定 sources 生成可复制引用文本（本地纯函数，不接外部 To Do）。

## Orchestration（同步可测，再包 SSE）
`runCampusAgent(query, emit)`:
1. phase received
2. 调 `search_notices`（tool_call/result）
3. 若有 sources：`export_citations`
4. phase answering → emit answer（summary 优先用检索 answer.summary，否则拼 citations）
5. 工具失败 → phase fallback，仍尽量用已有检索结果或明确错误；不得空挂

无 LLM 路由也可：本切片默认始终跑两个工具（白名单固定），后续再加模型决策。

## API
`GET /api/agent?q=...` → `text/event-stream`
- `runtime = nodejs`
- 复用 rate limit / requestId 思路（可简化：至少有 requestId header）
- 最后发 `data: [DONE]` 或 `type: phase phase: done`

## UI
现有搜索页加轻量「Agent 步骤」面板（phases + tool 行），不重做整页。
可用 query `?agent=1` 或页面开关；默认不破坏现有 demo 流。

## Tests
- `tests/unit/agent-*.test.ts`：registry、orchestrator（mock search）、SSE encoder、export_citations
- 接到 `npm run test:unit`（或单独脚本并由 test:unit 调用）

## Out of scope
多 agent、ingestion 改动、真实 Microsoft To Do、合 main、托管密钥。
