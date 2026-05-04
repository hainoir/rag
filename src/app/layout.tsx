import type { Metadata } from "next";

import "./globals.css";
import { SearchHistoryProvider } from "@/components/search-history-provider";

export const metadata: Metadata = {
  title: "校园信息检索与可解释问答助手",
  description:
    "聚合校园官方公开信息与社区讨论内容，提供带引用来源、来源分层和检索结果可视化的问答体验。",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html data-scroll-behavior="smooth" lang="zh-CN">
      <body>
        <SearchHistoryProvider>{children}</SearchHistoryProvider>
      </body>
    </html>
  );
}
