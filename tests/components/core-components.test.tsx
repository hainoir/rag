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

const answerPanelProps = {
  answer,
  query: "图书馆借书需要什么？",
  sources: [source],
  resultGeneratedAt: "2026-05-05T08:30:00.000Z",
  status: "ok" as const,
};
const writeText = vi.fn<(value: string) => Promise<void>>();

beforeEach(() => {
  navigationMocks.submitQuery.mockClear();
  writeText.mockReset();
  writeText.mockResolvedValue();
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: { writeText },
  });
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
    render(<AnswerPanel {...answerPanelProps} />);

    expect(screen.getByText("高置信回答")).toBeInTheDocument();
    expect(screen.getByText("置信度 86%")).toBeInTheDocument();
    expect(screen.getByText("图书馆借阅规则")).toBeInTheDocument();
  });

  test("AnswerPanel copies the full answer with its canonical evidence URL", async () => {
    render(
      <AnswerPanel
        {...answerPanelProps}
        sources={[{ ...source, canonicalUrl: "https://lib.tjcu.edu.cn/canonical/1.htm" }]}
        status="partial"
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "复制回答与来源" }));

    await waitFor(() => expect(writeText).toHaveBeenCalledOnce());
    const copiedText = writeText.mock.calls[0][0];
    expect(copiedText).toContain(`问题：${answerPanelProps.query}`);
    expect(copiedText).toContain(`回答摘要：${answer.summary}`);
    expect(copiedText).toContain(`信息来源：${answer.sourceNote}`);
    expect(copiedText).toContain(`补充说明：${answer.disclaimer}`);
    expect(copiedText).toContain(answerPanelProps.resultGeneratedAt);
    expect(copiedText).toContain("图书馆借阅规则");
    expect(copiedText).toContain("https://lib.tjcu.edu.cn/canonical/1.htm");
    expect(copiedText).not.toContain(source.url);
    expect(await screen.findByText("已复制回答与来源。")).toBeInTheDocument();
  });

  test("AnswerPanel keeps evidence titles and disclaimer when URLs are unavailable", async () => {
    render(
      <AnswerPanel
        {...answerPanelProps}
        answer={{
          ...answer,
          evidence: [...(answer.evidence ?? []), { sourceId: "missing", title: "另一条依据" }],
        }}
        sources={[{ ...source, canonicalUrl: "javascript:alert(1)", url: "file:///local" }]}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "复制回答与来源" }));

    await waitFor(() => expect(writeText).toHaveBeenCalledOnce());
    const copiedText = writeText.mock.calls[0][0];
    expect(copiedText).toContain("图书馆借阅规则");
    expect(copiedText).toContain("另一条依据");
    expect(copiedText.match(/链接未提供/g)).toHaveLength(2);
    expect(copiedText).toContain(answer.disclaimer);
    expect(copiedText).not.toContain("javascript:");
    expect(copiedText).not.toContain("file://");
  });

  test("AnswerPanel falls back to a valid source URL", async () => {
    render(<AnswerPanel {...answerPanelProps} sources={[{ ...source, canonicalUrl: "javascript:alert(1)" }]} />);

    fireEvent.click(screen.getByRole("button", { name: "复制回答与来源" }));

    await waitFor(() => expect(writeText).toHaveBeenCalledOnce());
    expect(writeText.mock.calls[0][0]).toContain(source.url);
  });

  test("AnswerPanel reports clipboard failure without claiming success", async () => {
    writeText.mockRejectedValue(new Error("Clipboard denied"));
    render(<AnswerPanel {...answerPanelProps} />);

    fireEvent.click(screen.getByRole("button", { name: "复制回答与来源" }));

    expect(await screen.findByText("复制失败，请检查剪贴板权限后重试。")).toBeInTheDocument();
    expect(screen.queryByText("已复制回答与来源。")).not.toBeInTheDocument();
  });

  test("AnswerPanel hides copy when there is no complete successful answer or in Agent mode", () => {
    const { rerender } = render(<AnswerPanel loading />);
    expect(screen.queryByRole("button", { name: "复制回答与来源" })).not.toBeInTheDocument();

    rerender(<AnswerPanel {...answerPanelProps} status="empty" />);
    expect(screen.queryByRole("button", { name: "复制回答与来源" })).not.toBeInTheDocument();

    rerender(<AnswerPanel {...answerPanelProps} status="error" />);
    expect(screen.queryByRole("button", { name: "复制回答与来源" })).not.toBeInTheDocument();

    rerender(<AnswerPanel {...answerPanelProps} answer={{ ...answer, disclaimer: "" }} />);
    expect(screen.queryByRole("button", { name: "复制回答与来源" })).not.toBeInTheDocument();

    rerender(<AnswerPanel {...answerPanelProps} copyEnabled={false} />);
    expect(screen.queryByRole("button", { name: "复制回答与来源" })).not.toBeInTheDocument();
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
