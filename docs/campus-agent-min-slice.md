# Campus Agent 最小切片（已实现，实现契约）

## Goal
已在 #10 合入可演示的工具调用链路：检索 → 引用导出（有来源时）→ 带引用回答 / 失败回退。面试能讲清需求→入口→数据流→验证。

## Chosen shape（相对「塞进 search-service」）
编排放在 Next.js：`src/lib/agent/*` + `src/app/api/agent/route.ts`（SSE）。
Agent 工具复用现有 `searchServiceProvider`，不改 search-service 核心；主问答 / 检索 demo 仍走 `/api/search` 和 `SearchResponse`。

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

编排固定调用 `search_notices`；有来源时再调用 `export_citations`，没有 LLM 路由或模型决策。是否增加模型决策尚未拍板。

## API
`GET /api/agent?q=...` → `text/event-stream`
- `runtime = nodejs`
- 复用 rate limit，并返回 `x-agent-request-id` header
- 步骤事件包括 `phase`、`tool_call`、`tool_result`、`answer`；检索结束后一次发出 `answer`，不是 token 流
- 最后发 `phase: done` 和 `data: [DONE]`

## UI
现有搜索页加轻量「Agent 步骤」面板（phases + tool 行），不重做整页。
可用 query `?agent=1` 或页面开关；面板用 `EventSource` 收步骤事件，默认不打断 `/api/search` demo 流。

## Tests
- `tests/unit/agent-export-citations.test.ts`、`agent-orchestrator.test.ts`（含 registry）、`agent-route.test.ts`
- 已接到 `npm run test:unit`

## Out of scope
多 agent、ingestion 改动、真实 Microsoft To Do、托管密钥；LLM 路由未做，是否增加尚未拍板。
