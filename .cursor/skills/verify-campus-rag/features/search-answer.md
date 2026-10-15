# Search and answer

Search lets a user ask a campus question and read an answer that stays attached to citation cards. The seed query `图书馆借书` returns a high-confidence answer and two official library sources.

## Sub-features

- `search-submit` submits a typed query from the home search box.
- `search-answer-visible` shows the answer summary, confidence, and the query as the page heading.
- `search-citations-visible` lists citation cards under `引用来源`, including both library sources.
- `search-suggested` opens a suggested question from the home page.
- `search-direct-url` opens the same results from a `/search?q=` link.
- `search-history-return` runs a previous query again from `最近搜索`.
- `search-side-effects` records the query in recent searches and returns the same source from `/api/search`.

## How to get to it (user POV)

- Type in `输入校园问题` on the home page and choose `开始检索`.
- Choose `图书馆怎么借书？` under `常见问题` on the home page.
- Open `/search?q=图书馆借书` directly.
- After a search, choose that query under `最近搜索` on the home page.
- Edit the query in the results-page search box and choose `开始检索` again.

## Driving it with verify-campus-rag

Preconditions:

- `doctor` exits 0 for this launch.
- `browser reset` has opened a fresh profile with no `campus-rag-history` entry.
- The seed corpus can answer `图书馆借书` and `图书馆怎么借书？`.

- **Reset profile.** Start from an empty browser. Run `node .cursor/skills/verify-campus-rag/bin/verify-campus-rag.mjs browser reset`. The next page load has no recent searches.
- **Open home.** Open the product home page. Run `node .cursor/skills/verify-campus-rag/bin/verify-campus-rag.mjs browser goto /`. The heading `校园信息检索与可解释问答助手` is visible and `开始检索` is disabled.
- **Disabled submit.** Confirm the empty box cannot submit. Run `node .cursor/skills/verify-campus-rag/bin/verify-campus-rag.mjs browser expect disabled --role button --name "开始检索"`. The button stays disabled.
- **Enter query.** Type the seed query. Run `node .cursor/skills/verify-campus-rag/bin/verify-campus-rag.mjs browser fill --label "输入校园问题" --value "图书馆借书"`. Then run `node .cursor/skills/verify-campus-rag/bin/verify-campus-rag.mjs browser expect enabled --role button --name "开始检索"`. The button enables.
- **Action proof.** Capture the filled box before submit. Run `node .cursor/skills/verify-campus-rag/bin/verify-campus-rag.mjs browser screenshot --feature search-answer --entry home-search-box --path artifacts/verify-campus-rag/evidence/search-answer/home-filled.png` and `node .cursor/skills/verify-campus-rag/bin/verify-campus-rag.mjs browser snapshot --aria --feature search-answer --entry home-search-box --path artifacts/verify-campus-rag/evidence/search-answer/home-filled.aria.txt`. Both identify `校园信息检索` and show `图书馆借书` in the search box.
- **Submit.** Choose `开始检索`. Run `node .cursor/skills/verify-campus-rag/bin/verify-campus-rag.mjs browser click --role button --name "开始检索"`. The URL contains `/search?q=`. Run `node .cursor/skills/verify-campus-rag/bin/verify-campus-rag.mjs browser expect url --includes "/search?q="`.
- **Answer.** Wait for the results heading. Run `node .cursor/skills/verify-campus-rag/bin/verify-campus-rag.mjs browser expect heading --name "图书馆借书" --exact`, `node .cursor/skills/verify-campus-rag/bin/verify-campus-rag.mjs browser expect text --name "回答摘要"`, `node .cursor/skills/verify-campus-rag/bin/verify-campus-rag.mjs browser expect text --name "高置信回答"`, and `node .cursor/skills/verify-campus-rag/bin/verify-campus-rag.mjs browser expect text --name "凭校园卡或读者码办理借阅"`. The answer is about borrowing with a campus card, not an empty state.
- **Citations.** Confirm both library cards. Run `node .cursor/skills/verify-campus-rag/bin/verify-campus-rag.mjs browser expect heading --name "引用来源"`, `node .cursor/skills/verify-campus-rag/bin/verify-campus-rag.mjs browser expect heading --name "图书馆借阅与续借办理说明"`, `node .cursor/skills/verify-campus-rag/bin/verify-campus-rag.mjs browser expect heading --name "图书馆自习座位预约说明"`, and `node .cursor/skills/verify-campus-rag/bin/verify-campus-rag.mjs browser expect count --testid source-card --min 2 --max 2`.
- **History side effect.** Read the saved query. Run `node .cursor/skills/verify-campus-rag/bin/verify-campus-rag.mjs browser storage --key campus-rag-history --contains "图书馆借书" --feature search-answer --entry home-search-box --path artifacts/verify-campus-rag/evidence/search-answer/history.txt`. The stored value contains `图书馆借书`.
- **API second view.** Read the same search through the page's API. Run `node .cursor/skills/verify-campus-rag/bin/verify-campus-rag.mjs api search --query "图书馆借书" --expect-status ok,partial --require-answer --source-title "图书馆借阅与续借办理说明" --feature search-answer --entry home-search-box --path artifacts/verify-campus-rag/evidence/search-answer/api-search.json`. Exit 0, status is `ok` or `partial`, and the body names `图书馆借阅与续借办理说明`.
- **Result proof.** Capture the answered page. Run `node .cursor/skills/verify-campus-rag/bin/verify-campus-rag.mjs browser screenshot --feature search-answer --entry home-search-box --path artifacts/verify-campus-rag/evidence/search-answer/results.png` and `node .cursor/skills/verify-campus-rag/bin/verify-campus-rag.mjs browser snapshot --aria --feature search-answer --entry home-search-box --path artifacts/verify-campus-rag/evidence/search-answer/results.aria.txt`. The artifacts show the query, `回答摘要`, and `图书馆借阅与续借办理说明`.
- **Suggested question.** Return home and choose the suggestion. Run `node .cursor/skills/verify-campus-rag/bin/verify-campus-rag.mjs browser goto /` and `node .cursor/skills/verify-campus-rag/bin/verify-campus-rag.mjs browser click --role button --name "图书馆怎么借书？"`. Then run `node .cursor/skills/verify-campus-rag/bin/verify-campus-rag.mjs browser expect heading --name "图书馆怎么借书？" --exact` and `node .cursor/skills/verify-campus-rag/bin/verify-campus-rag.mjs browser expect heading --name "图书馆借阅与续借办理说明"`. The suggestion opens its own results page and still cites the borrow guide.
- **Direct URL.** Open the original query from the address bar. Run `node .cursor/skills/verify-campus-rag/bin/verify-campus-rag.mjs browser goto "/search?q=图书馆借书"`. Then run `node .cursor/skills/verify-campus-rag/bin/verify-campus-rag.mjs browser expect heading --name "图书馆借书" --exact`. The heading matches the URL query.
- **History return.** Go home and choose the saved query. Run `node .cursor/skills/verify-campus-rag/bin/verify-campus-rag.mjs browser goto /` and `node .cursor/skills/verify-campus-rag/bin/verify-campus-rag.mjs browser click --role button --name "图书馆借书"`. Then run `node .cursor/skills/verify-campus-rag/bin/verify-campus-rag.mjs browser expect heading --name "图书馆借书" --exact`. The history control returns to that result.
- **Results box.** Submit the same query from the results-page box. Run `node .cursor/skills/verify-campus-rag/bin/verify-campus-rag.mjs browser fill --label "输入校园问题" --value "图书馆借书"` and `node .cursor/skills/verify-campus-rag/bin/verify-campus-rag.mjs browser click --role button --name "开始检索"`. Then run `node .cursor/skills/verify-campus-rag/bin/verify-campus-rag.mjs browser expect heading --name "图书馆借书" --exact` and `node .cursor/skills/verify-campus-rag/bin/verify-campus-rag.mjs browser expect text --name "回答摘要"`. The page stays on that result.

## Gotchas

- `开始检索` is disabled while the box is empty. Do not invent a keypress to submit it.
- The search box discards text typed before the client hydrates. `browser goto` waits until `data-theme` is set. If a hand-driven fill happens before that, the button stays disabled.
- The large summary types itself out. Assert `凭校园卡或读者码办理借阅`, which is already in `结论摘要`, rather than the animated headline.
- Results stay on `检索中` and then `正在生成摘要` for a short time. `browser expect` waits for the heading; a fixed sleep is not a result.
- Opening `/search?q=` from `goto` does not write `campus-rag-history`. Only the home box, a suggested question, or a history control does.
- The history button's accessible name also includes `重新检索`. Match the query text. Do not require the accessible name to be only the query.
- `图书馆怎么借书？` does not contain the contiguous text `图书馆借书`. After both queries have been run, the suggestion and its history button share the name `图书馆怎么借书？`, so run the suggestion click before that second history button exists.
- `查看原文` points at an external site. Do not click it here.
- `有帮助` on this seed instance shows `反馈暂未提交成功` and does not store feedback. Do not treat that message as a failed search.
- The web log can contain `query_log_store_unavailable` because this seed instance has no database. `/api/search` still returns the answer. Do not treat that log line as a failed search.
- Two citation cards both expose `展开片段`. This recipe does not click them. The citations recipe does, with `--first`.
