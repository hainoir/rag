import { DEFAULT_QUESTIONS } from "@/lib/search/default-questions";
import { HistoryPanel } from "@/components/history-panel";
import { SearchBox } from "@/components/search-box";
import { SuggestedQuestions } from "@/components/suggested-questions";
import { ThemeToggle } from "@/components/theme-toggle";

const HIGHLIGHTS = [
  {
    title: "问答 + 检索双模式",
    body: "先给结论，再给证据；用户可以在回答视图和原始检索结果视图之间自由切换。",
  },
  {
    title: "官方 / 社区来源分层",
    body: "事实类问题优先看官方来源，经验类问题再参考社区讨论，降低误导感。",
  },
  {
    title: "引用片段可追溯",
    body: "每条回答都附带命中片段、来源站点、发布时间或更新时间，方便快速验证信息。",
  },
];

export function HomePage() {
  return (
    <main className="page-shell">
      <div className="mx-auto flex max-w-7xl flex-col gap-8">
        <div className="flex justify-end">
          <ThemeToggle />
        </div>
        <section className="grid gap-6 xl:grid-cols-[minmax(0,1.25fr)_360px]">
          <div className="surface rounded-[40px] px-6 py-8 md:px-10 md:py-12">
            <div className="mb-6 flex flex-wrap gap-3">
              <span className="highlight text-xs font-semibold tracking-[0.18em] uppercase">
                校园信息检索产品
              </span>
              <span className="highlight text-xs font-semibold tracking-[0.18em] uppercase">
                可解释问答
              </span>
              <span className="highlight text-xs font-semibold tracking-[0.18em] uppercase">
                引用来源可追溯
              </span>
            </div>

            <div className="max-w-4xl space-y-5">
              <h1 className="font-display text-4xl leading-tight md:text-6xl">
                校园信息检索与
                <br />
                可解释问答助手
              </h1>
              <p className="max-w-3xl text-lg leading-8 muted">
                查询校园办事流程、生活信息与公开讨论内容。这个项目强调的不是聊天壳子，
                而是检索证据、来源分层和可验证的回答体验。
              </p>
            </div>

            <div className="mt-8">
              <SearchBox autoFocus />
            </div>

            <div className="mt-8">
              <SuggestedQuestions
                description="从这些校园高频问题开始，可以直接体验完整的检索与问答闭环。"
                questions={DEFAULT_QUESTIONS}
              />
            </div>
          </div>

          <div className="grid gap-4">
            <div className="surface rounded-[32px] p-6">
              <p className="text-sm font-semibold tracking-[0.18em] text-[var(--official)] uppercase">
                产品重点
              </p>
              <div className="mt-5 space-y-4">
                {HIGHLIGHTS.map((item) => (
                  <article
                    className="rounded-[22px] border border-[var(--line)] bg-white/75 p-4"
                    key={item.title}
                  >
                    <h2 className="font-display text-2xl leading-tight">{item.title}</h2>
                    <p className="mt-2 text-sm leading-7 muted">{item.body}</p>
                  </article>
                ))}
              </div>
            </div>

            <div className="surface rounded-[32px] p-6">
              <p className="text-sm font-semibold tracking-[0.18em] text-[var(--official)] uppercase">
                数据策略
              </p>
              <ul className="mt-4 space-y-3 text-sm leading-7 muted">
                <li>来源注册表：官方公开信息与社区白名单来源分开管理。</li>
                <li>清洗规则：去广告、去联系方式、保留来源站点和更新时间。</li>
                <li>去重策略：规范链接、标题日期指纹和正文近重复同时生效。</li>
              </ul>
            </div>
          </div>
        </section>

        <section className="grid gap-6 xl:grid-cols-[minmax(0,1.2fr)_minmax(320px,0.8fr)]">
          <HistoryPanel />

          <div className="surface rounded-[var(--radius-lg)] p-6">
            <p className="text-sm font-semibold tracking-[0.18em] text-[var(--official)] uppercase">
              为什么这个项目适合前端作品集
            </p>
            <div className="mt-4 grid gap-3">
              <div className="rounded-[22px] border border-[var(--line)] bg-white/70 p-4">
                <h2 className="font-semibold">复杂状态清晰可讲</h2>
                <p className="mt-2 text-sm leading-7 muted">
                  包含 loading、无答案、回答/检索双视图、来源展开、来源过滤和本地历史管理。
                </p>
              </div>
              <div className="rounded-[22px] border border-[var(--line)] bg-white/70 p-4">
                <h2 className="font-semibold">AI 亮点不抢前端戏份</h2>
                <p className="mt-2 text-sm leading-7 muted">
                  RAG 只作为数据来源与问答链路存在，真正被强调的是信息展示和可解释交互设计。
                </p>
              </div>
              <div className="rounded-[22px] border border-[var(--line)] bg-white/70 p-4">
                <h2 className="font-semibold">规模适中，MVP 完整</h2>
                <p className="mt-2 text-sm leading-7 muted">
                  两页、一个主流程，再加统一搜索接口、来源契约和入库链路骨架，就能形成可继续扩展的产品闭环。
                </p>
              </div>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
