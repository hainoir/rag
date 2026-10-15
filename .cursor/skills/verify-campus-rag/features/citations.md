# Citations

Citations let a user leave the answer summary, read the retrieved snippets, expand a snippet, and check the original-source link without leaving the results page.

## Sub-features

- `citations-retrieval-view` switches from the answer to `命中原始片段`.
- `citations-expand` reveals the full snippet for the first library card.
- `citations-metadata` shows the source site and publish time on the card.
- `citations-original-link` exposes the canonical href for the borrow guide.

## How to get to it (user POV)

- Search `图书馆借书`, then choose `检索结果` in `结果视图切换`.
- Open `/search?q=图书馆借书`, then choose `检索结果`.
- On a citation card, choose `展开片段`, and use `查看原文` for the source site.

## Driving it with verify-campus-rag

Preconditions:

- `doctor` exits 0 for this launch.
- `browser reset` has opened a fresh profile.
- `图书馆借书` returns `图书馆借阅与续借办理说明` before `图书馆自习座位预约说明`.

- **Reset and open.** Open the results URL. Run `node .cursor/skills/verify-campus-rag/bin/verify-campus-rag.mjs browser reset` and `node .cursor/skills/verify-campus-rag/bin/verify-campus-rag.mjs browser goto "/search?q=图书馆借书"`. Then run `node .cursor/skills/verify-campus-rag/bin/verify-campus-rag.mjs browser expect heading --name "图书馆借书" --exact` and `node .cursor/skills/verify-campus-rag/bin/verify-campus-rag.mjs browser expect heading --name "图书馆借阅与续借办理说明"`.
- **Retrieval view.** Choose `检索结果`. Run `node .cursor/skills/verify-campus-rag/bin/verify-campus-rag.mjs browser click --role button --name "检索结果"`. Then run `node .cursor/skills/verify-campus-rag/bin/verify-campus-rag.mjs browser expect attribute --role button --name "检索结果" --attr aria-pressed --value true` and `node .cursor/skills/verify-campus-rag/bin/verify-campus-rag.mjs browser expect heading --name "命中原始片段"`. The answer summary is replaced by the raw hits. Run `node .cursor/skills/verify-campus-rag/bin/verify-campus-rag.mjs browser expect absent --text "回答摘要"`.
- **Collapsed snippet.** Confirm the long borrow sentence is not visible yet. Run `node .cursor/skills/verify-campus-rag/bin/verify-campus-rag.mjs browser expect absent --text "热门教材和工具书按照馆内规则限制外借"`.
- **Expand.** Choose the first `展开片段`. Run `node .cursor/skills/verify-campus-rag/bin/verify-campus-rag.mjs browser click --role button --name "展开片段" --first`. Then run `node .cursor/skills/verify-campus-rag/bin/verify-campus-rag.mjs browser expect text --name "收起片段"` and `node .cursor/skills/verify-campus-rag/bin/verify-campus-rag.mjs browser expect text --name "热门教材和工具书按照馆内规则限制外借"`. The first card expands.
- **Metadata.** Read the source site and publish label. Run `node .cursor/skills/verify-campus-rag/bin/verify-campus-rag.mjs browser expect text --name "来源站点"` and `node .cursor/skills/verify-campus-rag/bin/verify-campus-rag.mjs browser expect text --name "天津商业大学图书馆"` and `node .cursor/skills/verify-campus-rag/bin/verify-campus-rag.mjs browser expect text --name "发布时间"`.
- **Original link.** Read the borrow-guide href. Do not activate it. Run `node .cursor/skills/verify-campus-rag/bin/verify-campus-rag.mjs browser expect attribute --role link --name "查看原文：图书馆借阅与续借办理说明" --attr href --value "https://lib.tjcu.edu.cn/gk/borrow-guide.html"`. The href is the library guide.
- **Proof.** Capture the expanded retrieval view. Run `node .cursor/skills/verify-campus-rag/bin/verify-campus-rag.mjs browser screenshot --feature citations --entry retrieval-view --path artifacts/verify-campus-rag/evidence/citations/expanded.png` and `node .cursor/skills/verify-campus-rag/bin/verify-campus-rag.mjs browser snapshot --aria --feature citations --entry retrieval-view --path artifacts/verify-campus-rag/evidence/citations/expanded.aria.txt`. The artifacts show `命中原始片段`, `收起片段`, and `图书馆借阅与续借办理说明`.

## Gotchas

- `展开片段` is repeated once per card. `--first` is required and refers to `图书馆借阅与续借办理说明` only while that card is first. If the heading order changes, stop and report the new order; do not point `--first` at a different card to keep the href assertion.
- `查看原文` opens a new tab on an external site. Assert `href`. Following it leaves the app and is not proof of this product.
- In the answer view, `回答摘要` is still on the page, so the retrieval assertion belongs after `检索结果` is pressed.
- The expanded sentence `热门教材和工具书按照馆内规则限制外借` is absent while the card is collapsed. Assert that absence before the click.
- Source order for this query is the borrow guide, then the seat-booking guide. Both remain citation cards after one card expands.
