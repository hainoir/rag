import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { ResultsShell } from "@/components/results-shell";
import { SearchHistoryProvider } from "@/components/search-history-provider";
import { ThemeProvider } from "@/components/theme-provider";
import type { AgentEvent } from "@/lib/agent/types";
import type { SearchResponse } from "@/lib/search/types";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));

class MockEventSource {
  static instances: MockEventSource[] = [];
  onmessage: ((message: MessageEvent) => void) | null = null;
  onerror: (() => void) | null = null;
  close = vi.fn();
  constructor(readonly url: string) {
    MockEventSource.instances.push(this);
  }
  send(event: AgentEvent) {
    this.onmessage?.({ data: JSON.stringify(event) } as MessageEvent);
  }
  done() {
    this.onmessage?.({ data: "[DONE]" } as MessageEvent);
  }
  fail() {
    this.onerror?.();
  }
}

const searchResponse: SearchResponse = {
  query: "图书馆借书",
  status: "ok",
  answer: { summary: "并行检索独有摘要", sourceNote: "检索来源", disclaimer: "请核对", confidence: 0.9 },
  sources: [
    {
      id: "s1",
      documentId: "d1",
      title: "图书馆借阅规则",
      type: "official",
      sourceName: "图书馆",
      publishedAt: null,
      updatedAt: null,
      fetchedAt: "2026-01-01T00:00:00Z",
      lastVerifiedAt: null,
      snippet: "借书片段",
      matchedKeywords: [],
      freshnessLabel: "fresh",
    },
  ],
  relatedQuestions: [],
  retrievedCount: 1,
  resultGeneratedAt: "2026-01-01T00:00:00Z",
};
const answer = (summary: string, fallback = false): Extract<AgentEvent, { type: "answer" }> => ({
  type: "answer",
  summary,
  citations: [{ sourceId: "s1", title: "图书馆借阅规则", sourceName: "图书馆", snippet: "正文依据" }],
  evidence: [{ sourceId: "s1", title: "图书馆借阅规则", sourceName: "图书馆", snippet: "正文依据" }],
  fallback,
});
const fetchResult = (ok: boolean): AgentEvent => ({
  type: "tool_result",
  id: ok ? "fetch-1" : "fetch-2",
  name: "fetch_notice",
  ok,
  summary: ok ? "读取正文" : "读取失败",
});

beforeEach(() => {
  MockEventSource.instances = [];
  vi.stubGlobal("EventSource", MockEventSource);
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => searchResponse }));
});
afterEach(() => vi.unstubAllGlobals());

function primary() {
  return screen.getByRole("region", { name: "Agent 回答" });
}
function stream() {
  return MockEventSource.instances.at(-1)!;
}
function renderPage() {
  return render(
    <ThemeProvider>
      <SearchHistoryProvider>
        <ResultsShell agentMode initialQuery="图书馆借书" />
      </SearchHistoryProvider>
    </ThemeProvider>,
  );
}

describe("Agent primary answer", () => {
  test("shows procedure sections and each item's source in the Agent answer", () => {
    renderPage();
    act(() => {
      stream().send(fetchResult(true));
      stream().send({
        ...answer("借阅正文摘要"),
        procedure: {
          steps: [{ text: "确认图书可借。", evidence: { documentId: "d1", title: "图书馆借阅规则" } }],
          exceptions: [{ text: "热门教材限制外借。", evidence: { documentId: "d1", title: "图书馆借阅规则" } }],
          verify: [{ text: "核对最新馆内规则。", evidence: { documentId: "d1", title: "图书馆借阅规则" } }],
        },
      });
    });
    const region = within(primary());
    expect(region.getByRole("heading", { name: "办理步骤" })).toBeInTheDocument();
    expect(region.getByRole("heading", { name: "特殊情况" })).toBeInTheDocument();
    expect(region.getByRole("heading", { name: "仍需核对原文" })).toBeInTheDocument();
    expect(region.getByText("确认图书可借。")).toBeInTheDocument();
    expect(region.getAllByText("来源：图书馆借阅规则")).toHaveLength(3);
    expect(region.getByText("借阅正文摘要")).toBeInTheDocument();
    expect(region.getByText("已读到正文")).toBeInTheDocument();
  });

  test("unread fallback has no procedure sections", () => {
    renderPage();
    act(() => {
      stream().send(fetchResult(false));
      stream().send(answer("未读到通知全文，请核对原文。", true));
    });
    const region = within(primary());
    expect(region.getByText("未读到正文")).toBeInTheDocument();
    expect(region.queryByRole("heading", { name: "办理步骤" })).not.toBeInTheDocument();
    expect(region.queryByText("确认图书可借。")).not.toBeInTheDocument();
  });

  test("shows the SSE answer, body evidence, and parallel search sources", async () => {
    renderPage();
    await waitFor(() => expect(screen.getByText("图书馆借阅规则", { selector: "h3" })).toBeInTheDocument(), {
      timeout: 3000,
    });
    act(() => {
      stream().send(fetchResult(true));
      stream().send(answer("Agent 正文独有回答"));
      stream().done();
      stream().fail();
    });
    expect(within(primary()).getByText("Agent 正文独有回答")).toBeInTheDocument();
    expect(within(primary()).getByText("已读到正文")).toBeInTheDocument();
    expect(within(primary()).getAllByText(/正文依据/).length).toBeGreaterThan(0);
    expect(screen.queryByText("并行检索独有摘要")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "重新运行 Agent" })).not.toBeInTheDocument();
  });

  test("labels an eligible success and eligible failure as a partial body read", () => {
    renderPage();
    act(() => {
      stream().send(fetchResult(true));
      stream().send(fetchResult(false));
      stream().send(answer("官方正文用于回答，另一篇官方通知读取失败。"));
    });
    expect(within(primary()).getByText("部分读到正文")).toBeInTheDocument();
    expect(within(primary()).getByText("官方正文用于回答，另一篇官方通知读取失败。")).toBeInTheDocument();
  });

  test("labels a supplemental-only body as unread when the answer says no usable full text was read", () => {
    renderPage();
    act(() => {
      stream().send({ type: "tool_result", id: "fetch-1", name: "fetch_notice", ok: true, summary: "已读取《经验帖》正文。" });
      stream().send(answer("未读到可用于回答的通知全文，请核对官方通知。", true));
    });
    expect(within(primary()).getByText("未读到正文")).toBeInTheDocument();
    expect(within(primary()).queryByText("已读到正文")).not.toBeInTheDocument();
  });

  test("labels unread fallback and keeps search summary hidden", () => {
    renderPage();
    act(() => {
      stream().send(fetchResult(false));
      stream().send(answer("Agent 未读正文回退", true));
      stream().done();
    });
    expect(within(primary()).getByText("未读到正文")).toBeInTheDocument();
    expect(within(primary()).getByText("回退回答")).toBeInTheDocument();
    expect(screen.queryByText("并行检索独有摘要")).not.toBeInTheDocument();
  });

  test("disconnects before completion and retries only Agent with a cleared log", async () => {
    renderPage();
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1), { timeout: 3000 });
    act(() => {
      stream().send({ type: "phase", phase: "retrieving", detail: "旧步骤" });
      stream().fail();
    });
    expect(within(primary()).getByText("Agent 连接中断，可以重新运行。")).toBeInTheDocument();
    expect(within(primary()).queryByText("Agent 正文独有回答")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "重新运行 Agent" }));
    expect(MockEventSource.instances).toHaveLength(2);
    expect(stream().url).toBe(MockEventSource.instances[0].url);
    expect(screen.queryByText(/旧步骤/)).not.toBeInTheDocument();
    expect(screen.getByText("正在连接 Agent…")).toBeInTheDocument();
    act(() => {
      stream().send(fetchResult(true));
      stream().send(answer("重试后的正文回答"));
      stream().done();
    });
    expect(within(primary()).getByText("重试后的正文回答")).toBeInTheDocument();
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  test("a hard Agent error remains retryable after its fallback answer", () => {
    renderPage();
    act(() => {
      stream().send({ type: "error", message: "检索失败" });
      stream().send(answer("Agent 回退提示", true));
      stream().done();
    });
    expect(within(primary()).getByText("Agent 回退提示")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "重新运行 Agent" })).toBeInTheDocument();
  });

  test("a parallel search failure stays in the sources area", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 503 }));
    renderPage();
    act(() => {
      stream().send(answer("Agent 独立回答"));
      stream().done();
    });
    await waitFor(() => expect(screen.getByText("并行检索来源加载失败。")).toBeInTheDocument(), { timeout: 3000 });
    expect(within(primary()).getByText("Agent 独立回答")).toBeInTheDocument();
    expect(screen.queryByText("并行检索独有摘要")).not.toBeInTheDocument();
  });
});
