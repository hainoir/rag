import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { AnswerPanel } from "@/components/answer-panel";
import { EmptyState } from "@/components/empty-state";
import { ErrorState } from "@/components/error-state";
import { ResultToolbar } from "@/components/result-toolbar";
import { SearchBox } from "@/components/search-box";
import { SourceCard } from "@/components/source-card";
import { ThemeProvider } from "@/components/theme-provider";
import { ThemeToggle } from "@/components/theme-toggle";
import type { SearchAnswer, SearchSource } from "@/lib/search/types";

const navigationMocks = vi.hoisted(() => ({
  submitQuery: vi.fn(),
}));

vi.mock("@/hooks/use-search-navigation", () => ({
  useSearchNavigation: () => ({
    submitQuery: navigationMocks.submitQuery,
    isPending: false,
  }),
}));

const source: SearchSource = {
  id: "source-1",
  title: "图书馆借阅规则",
  type: "official",
  sourceName: "天津商业大学图书馆",
  sourceDomain: "lib.tjcu.edu.cn",
  publishedAt: "2026-05-01T00:00:00.000Z",
  updatedAt: "2026-05-02T00:00:00.000Z",
  fetchedAt: "2026-05-03T00:00:00.000Z",
  lastVerifiedAt: "2026-05-04T00:00:00.000Z",
  snippet: "学生凭校园卡办理借阅。",
  fullSnippet: "学生凭校园卡办理借阅，续借以图书馆系统规则为准。",
  matchedKeywords: ["借阅"],
  url: "https://lib.tjcu.edu.cn/info/1.htm",
  canonicalUrl: "https://lib.tjcu.edu.cn/info/1.htm",
  freshnessLabel: "fresh",
  trustScore: 0.95,
};

const answer: SearchAnswer = {
  summary: "图书馆借阅需要凭校园卡办理。",
  sourceNote: "当前结论主要基于 1 条官方来源整理。",
  disclaimer: "请以来源原文为准。",
  confidence: 0.86,
  evidence: [
    {
      sourceId: "source-1",
      title: "图书馆借阅规则",
      sourceName: "天津商业大学图书馆",
      snippet: "凭校园卡办理借阅。",
    },
  ],
};

beforeEach(() => {
  navigationMocks.submitQuery.mockClear();
});

describe("core React components", () => {
  test("SearchBox submits the current query and disables empty submissions", () => {
    render(<SearchBox />);

    const input = screen.getByLabelText("输入校园问题");
    const button = screen.getByRole("button", { name: "开始检索" });

    expect(button).toBeDisabled();
    fireEvent.change(input, { target: { value: " 图书馆借书 " } });
    expect(button).toBeEnabled();
    fireEvent.click(button);
    expect(navigationMocks.submitQuery).toHaveBeenCalledWith(" 图书馆借书 ");
  });

  test("ResultToolbar exposes filter and view state", () => {
    const onFilterChange = vi.fn();
    const onViewModeChange = vi.fn();

    render(
      <ResultToolbar
        filter="all"
        onFilterChange={onFilterChange}
        onViewModeChange={onViewModeChange}
        shownCount={1}
        totalCount={2}
        viewMode="answer"
      />,
    );

    expect(screen.getByRole("button", { name: "全部" })).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(screen.getByRole("button", { name: "仅官方" }));
    fireEvent.click(screen.getByRole("button", { name: "检索结果" }));
    expect(onFilterChange).toHaveBeenCalledWith("official");
    expect(onViewModeChange).toHaveBeenCalledWith("retrieval");
    expect(screen.getByText("当前展示 1 / 2 条来源")).toBeInTheDocument();
  });

  test("SourceCard renders metadata and toggles expansion", () => {
    const onToggle = vi.fn();

    render(<SourceCard expanded={false} onToggle={onToggle} source={source} />);

    expect(screen.getByText("官方来源")).toBeInTheDocument();
    expect(screen.getByText("图书馆借阅规则")).toBeInTheDocument();
    expect(screen.getByText("来源权重 95%")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "展开片段" }));
    expect(onToggle).toHaveBeenCalledWith("source-1");
  });

  test("EmptyState keeps no-answer wording distinct from failures", () => {
    render(<EmptyState query="不存在的问题" />);

    expect(screen.getByText("无答案兜底")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "暂未找到足够可靠的信息" })).toBeInTheDocument();
    expect(screen.queryByText("请求失败")).not.toBeInTheDocument();
  });

  test("ErrorState keeps retry action and failure wording distinct", () => {
    const onRetry = vi.fn();

    render(<ErrorState onRetry={onRetry} query="图书馆借书" />);

    expect(screen.getByText("请求失败")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "重新检索" }));
    expect(onRetry).toHaveBeenCalledWith("图书馆借书");
    expect(screen.queryByText("无答案兜底")).not.toBeInTheDocument();
  });

  test("AnswerPanel renders answer confidence and evidence", () => {
    render(<AnswerPanel answer={answer} status="ok" />);

    expect(screen.getByText("高置信回答")).toBeInTheDocument();
    expect(screen.getByText("置信度 86%")).toBeInTheDocument();
    expect(screen.getByText("图书馆借阅规则")).toBeInTheDocument();
  });

  test("ThemeToggle persists and applies dark mode", async () => {
    render(
      <ThemeProvider>
        <ThemeToggle />
      </ThemeProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "切换到暗色模式" }));

    await waitFor(() => {
      expect(document.documentElement.dataset.theme).toBe("dark");
    });
    expect(window.localStorage.getItem("campus-rag-theme")).toBe("dark");
  });
});
