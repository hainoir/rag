import type { Metadata } from "next";

import { ResultsShell } from "@/components/results-shell";

type SearchPageProps = {
  searchParams: Promise<{
    q?: string;
  }>;
};

export async function generateMetadata({
  searchParams,
}: SearchPageProps): Promise<Metadata> {
  const { q = "" } = await searchParams;
  const query = q.trim();

  if (!query) {
    return {
      title: "搜索结果 | 校园信息检索与可解释问答助手",
      description:
        "输入校园问题后查看带引用来源、来源分层和检索片段的可解释问答结果。",
    };
  }

  return {
    title: `${query} | 校园信息检索结果`,
    description: `查看“${query}”的校园信息检索结果，包含回答摘要、官方/社区来源分层和可核对的依据片段。`,
  };
}

export default async function SearchPage({ searchParams }: SearchPageProps) {
  const { q = "" } = await searchParams;

  return <ResultsShell initialQuery={q} />;
}
