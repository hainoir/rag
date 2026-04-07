# 校园信息检索与可解释问答助手

副标题：基于 RAG 思路的校园信息检索前端产品实践

面向校园信息查询场景，聚合官方公开信息与社区讨论内容，提供带引用来源、来源分层和检索结果可视化的问答体验。项目重点不在于做一个聊天机器人，而在于把问答结果、检索证据与来源可信度用清晰的前端交互组织出来。

![首页搜索页占位图](./public/screenshots/home-placeholder.svg)
![结果页占位图](./public/screenshots/result-placeholder.svg)

## 项目概览

这是一个 **Next.js App Router + React + TypeScript + Tailwind CSS v4** 的前端原型，主题是“校园信息检索与可解释问答助手”。

它当前没有真实后端、没有数据库、没有 API Route，也没有向量检索链路。核心目标是用一套完整的前端交互，把“检索优先、回答可追溯”的 RAG 产品体验表达出来。

这个项目适合作为：

- 前端作品集项目
- 可解释 AI / RAG 产品的交互原型
- 面试中讲解状态设计和信息展示能力的案例

## 当前能力

- 首页输入问题、推荐问题和本地历史记录
- 结果页两阶段 loading
- 回答 / 检索结果双视图切换
- 官方 / 社区来源分层筛选
- 来源卡片展开与关键词高亮
- 无答案兜底和相关问题推荐

## 技术栈

- Next.js App Router
- React
- TypeScript
- Tailwind CSS v4
- React Context
- Local Storage
- Mock Search Provider

## 架构摘要

- 视图层：`HomePage`、`ResultsShell`、`AnswerPanel`、`SourceList` 等组件负责展示和交互
- 导航与状态层：`useSearchNavigation` 负责跳转，`SearchHistoryProvider` 负责本地历史
- 数据适配层：`SearchProvider` 抽象统一搜索接口，当前由 `mockSearchProvider` 返回静态结果

详细拆解见 [docs/architecture.md](./docs/architecture.md)。  
面试讲稿版见 [docs/interview-notes.md](./docs/interview-notes.md)。

## 本地运行

```bash
npm install
npm run dev
```

然后访问 [http://localhost:3000](http://localhost:3000)。

## 后续方向

- 接入真实检索接口和向量召回链路
- 增加错误态、埋点和可观测性
- 固定依赖版本并补自动化测试
