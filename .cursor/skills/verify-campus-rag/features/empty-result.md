# Empty result

Empty result lets a user see that the product refused to invent an answer. `明天校园集市几点开始` matches nothing in the seed corpus.

## Sub-features

- `empty-submit` submits the unmatched query from the home box.
- `empty-no-answer` shows the empty state and hides the answer summary and citation cards.
- `empty-related` keeps a related-question suggestion and the explicit no-fabrication note.
- `empty-api` returns `empty` and a null answer from `/api/search`.

## How to get to it (user POV)

- Type `明天校园集市几点开始` on the home page and choose `开始检索`.
- Open `/search?q=明天校园集市几点开始` directly.

## Driving it with verify-campus-rag

Preconditions:

- `doctor` exits 0 for this launch.
- `browser reset` has opened a fresh profile.
- The seed corpus has no source for `明天校园集市几点开始`. If a source appears, stop. Do not pick a different query to force the empty state.

- **Reset and type.** Open home and enter the unmatched query. Run `node .cursor/skills/verify-campus-rag/bin/verify-campus-rag.mjs browser reset`, `node .cursor/skills/verify-campus-rag/bin/verify-campus-rag.mjs browser goto /`, and `node .cursor/skills/verify-campus-rag/bin/verify-campus-rag.mjs browser fill --label "输入校园问题" --value "明天校园集市几点开始"`. The submit button enables. Run `node .cursor/skills/verify-campus-rag/bin/verify-campus-rag.mjs browser expect enabled --role button --name "开始检索"`.
- **Action proof.** Capture the typed query. Run `node .cursor/skills/verify-campus-rag/bin/verify-campus-rag.mjs browser screenshot --feature empty-result --entry home-search-box --path artifacts/verify-campus-rag/evidence/empty-result/home-filled.png`. The screenshot shows the product name and the unmatched query.
- **Submit.** Choose `开始检索`. Run `node .cursor/skills/verify-campus-rag/bin/verify-campus-rag.mjs browser click --role button --name "开始检索"`. Then run `node .cursor/skills/verify-campus-rag/bin/verify-campus-rag.mjs browser expect url --includes "/search?q="` and `node .cursor/skills/verify-campus-rag/bin/verify-campus-rag.mjs browser expect heading --name "明天校园集市几点开始" --exact`.
- **Empty copy.** Wait for the empty state. Run `node .cursor/skills/verify-campus-rag/bin/verify-campus-rag.mjs browser expect text --name "无答案兜底"`, `node .cursor/skills/verify-campus-rag/bin/verify-campus-rag.mjs browser expect heading --name "暂未找到足够可靠的信息"`, `node .cursor/skills/verify-campus-rag/bin/verify-campus-rag.mjs browser expect text --name "当前没有足够高质量的来源"`, and `node .cursor/skills/verify-campus-rag/bin/verify-campus-rag.mjs browser expect text --name "没有可靠来源时不会强行生成答案。"`.
- **No fabricated answer.** Confirm the answer and citation cards are gone. Run `node .cursor/skills/verify-campus-rag/bin/verify-campus-rag.mjs browser expect absent --text "回答摘要"` and `node .cursor/skills/verify-campus-rag/bin/verify-campus-rag.mjs browser expect count --testid source-card --max 0`.
- **API second view.** Read the same query from `/api/search`. Run `node .cursor/skills/verify-campus-rag/bin/verify-campus-rag.mjs api search --query "明天校园集市几点开始" --expect-status empty --forbid-answer --feature empty-result --entry home-search-box --path artifacts/verify-campus-rag/evidence/empty-result/api-search.json`. Exit 0, status is `empty`, and `answer` is null.
- **Result proof.** Capture the empty page. Run `node .cursor/skills/verify-campus-rag/bin/verify-campus-rag.mjs browser screenshot --feature empty-result --entry home-search-box --path artifacts/verify-campus-rag/evidence/empty-result/results.png` and `node .cursor/skills/verify-campus-rag/bin/verify-campus-rag.mjs browser snapshot --aria --feature empty-result --entry home-search-box --path artifacts/verify-campus-rag/evidence/empty-result/results.aria.txt`. The artifacts show the query and `暂未找到足够可靠的信息`.

## Gotchas

- `暂未找到足够可靠的信息` is both the status heading and the empty-state heading. One visible heading is enough.
- While the page is still retrieving, citation cards are absent too. Wait for `无答案兜底` before asserting a zero card count.
- The loading region is named `正在生成回答摘要`. Assert the visible text `回答摘要`, which is the answer badge and is absent in the empty state.
- Related questions still include `图书馆怎么借书？`. That suggestion is not an answer to the original query.
- This journey does not cover the separate failure screen `本次检索未成功完成`. That screen requires `/api/search` to fail, and this seed instance is healthy.
