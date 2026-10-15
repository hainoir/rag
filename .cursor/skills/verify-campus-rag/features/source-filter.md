# Source filter

Source filter lets a user keep every citation, only official sources, or only community sources. `宿舍报修流程` has one official card and one community card. `社团纳新什么时候开始` has an official card and no community card.

## Sub-features

- `filter-all` shows both dorm cards and `当前展示 2 / 2 条来源`.
- `filter-official` keeps `学生公寓报修与后勤服务流程` and hides the community card.
- `filter-community` keeps `新生宿舍生活经验帖`, including `经验讨论，仅供参考`.
- `filter-empty-community` shows the empty-filter copy for a query with no community source.

## How to get to it (user POV)

- Search `宿舍报修流程`, choose `检索结果`, then choose `全部`, `仅官方`, or `仅社区` in `来源类型筛选`.
- Search `社团纳新什么时候开始`, choose `检索结果`, then choose `仅社区`.

## Driving it with verify-campus-rag

Preconditions:

- `doctor` exits 0 for this launch.
- `browser reset` has opened a fresh profile.
- Seed search for `宿舍报修流程` returns the official dorm card and the community dorm card, in that order.
- Seed search for `社团纳新什么时候开始` returns only `学生社团纳新与招新活动安排`.

- **Reset and open.** Open the dorm results. Run `node .cursor/skills/verify-campus-rag/bin/verify-campus-rag.mjs browser reset` and `node .cursor/skills/verify-campus-rag/bin/verify-campus-rag.mjs browser goto "/search?q=宿舍报修流程"`. Then run `node .cursor/skills/verify-campus-rag/bin/verify-campus-rag.mjs browser expect heading --name "宿舍报修流程" --exact`.
- **Retrieval view.** Leave the answer on screen so card titles are not repeated inside the summary. Run `node .cursor/skills/verify-campus-rag/bin/verify-campus-rag.mjs browser click --role button --name "检索结果"`. Then run `node .cursor/skills/verify-campus-rag/bin/verify-campus-rag.mjs browser expect heading --name "命中原始片段"`.
- **All sources.** Confirm both cards. Run `node .cursor/skills/verify-campus-rag/bin/verify-campus-rag.mjs browser expect attribute --role button --name "全部" --attr aria-pressed --value true`, `node .cursor/skills/verify-campus-rag/bin/verify-campus-rag.mjs browser expect text --name "当前展示 2 / 2 条来源"`, `node .cursor/skills/verify-campus-rag/bin/verify-campus-rag.mjs browser expect count --testid source-card --min 2 --max 2`, `node .cursor/skills/verify-campus-rag/bin/verify-campus-rag.mjs browser expect heading --name "学生公寓报修与后勤服务流程"`, and `node .cursor/skills/verify-campus-rag/bin/verify-campus-rag.mjs browser expect heading --name "新生宿舍生活经验帖"`.
- **Official only.** Choose `仅官方`. Run `node .cursor/skills/verify-campus-rag/bin/verify-campus-rag.mjs browser click --role button --name "仅官方"`. Then run `node .cursor/skills/verify-campus-rag/bin/verify-campus-rag.mjs browser expect attribute --role button --name "仅官方" --attr aria-pressed --value true`, `node .cursor/skills/verify-campus-rag/bin/verify-campus-rag.mjs browser expect text --name "当前展示 1 / 2 条来源"`, `node .cursor/skills/verify-campus-rag/bin/verify-campus-rag.mjs browser expect count --testid source-card --min 1 --max 1`, `node .cursor/skills/verify-campus-rag/bin/verify-campus-rag.mjs browser expect heading --name "学生公寓报修与后勤服务流程"`, `node .cursor/skills/verify-campus-rag/bin/verify-campus-rag.mjs browser expect absent --role heading --name "新生宿舍生活经验帖" --exact`, and `node .cursor/skills/verify-campus-rag/bin/verify-campus-rag.mjs browser expect absent --text "经验讨论，仅供参考"`.
- **Community only.** Choose `仅社区`. Run `node .cursor/skills/verify-campus-rag/bin/verify-campus-rag.mjs browser click --role button --name "仅社区"`. Then run `node .cursor/skills/verify-campus-rag/bin/verify-campus-rag.mjs browser expect attribute --role button --name "仅社区" --attr aria-pressed --value true`, `node .cursor/skills/verify-campus-rag/bin/verify-campus-rag.mjs browser expect text --name "当前展示 1 / 2 条来源"`, `node .cursor/skills/verify-campus-rag/bin/verify-campus-rag.mjs browser expect heading --name "新生宿舍生活经验帖"`, `node .cursor/skills/verify-campus-rag/bin/verify-campus-rag.mjs browser expect text --name "经验讨论，仅供参考"`, and `node .cursor/skills/verify-campus-rag/bin/verify-campus-rag.mjs browser expect absent --role heading --name "学生公寓报修与后勤服务流程" --exact`.
- **Restore all.** Choose `全部` again. Run `node .cursor/skills/verify-campus-rag/bin/verify-campus-rag.mjs browser click --role button --name "全部"`. Then run `node .cursor/skills/verify-campus-rag/bin/verify-campus-rag.mjs browser expect text --name "当前展示 2 / 2 条来源"`.
- **Empty community filter.** Open the club query and filter to community. Run `node .cursor/skills/verify-campus-rag/bin/verify-campus-rag.mjs browser goto "/search?q=社团纳新什么时候开始"`, `node .cursor/skills/verify-campus-rag/bin/verify-campus-rag.mjs browser click --role button --name "检索结果"`, and `node .cursor/skills/verify-campus-rag/bin/verify-campus-rag.mjs browser expect heading --name "学生社团纳新与招新活动安排"`. Then run `node .cursor/skills/verify-campus-rag/bin/verify-campus-rag.mjs browser click --role button --name "仅社区"`, `node .cursor/skills/verify-campus-rag/bin/verify-campus-rag.mjs browser expect text --name "当前展示 0 / 1 条来源"`, `node .cursor/skills/verify-campus-rag/bin/verify-campus-rag.mjs browser expect text --name "当前筛选条件下没有可展示的来源"`, `node .cursor/skills/verify-campus-rag/bin/verify-campus-rag.mjs browser expect count --testid source-card --max 0`, and `node .cursor/skills/verify-campus-rag/bin/verify-campus-rag.mjs browser expect absent --role heading --name "学生社团纳新与招新活动安排" --exact`.
- **Proof.** Capture the empty community filter. Run `node .cursor/skills/verify-campus-rag/bin/verify-campus-rag.mjs browser screenshot --feature source-filter --entry community-empty --path artifacts/verify-campus-rag/evidence/source-filter/community-empty.png` and `node .cursor/skills/verify-campus-rag/bin/verify-campus-rag.mjs browser snapshot --aria --feature source-filter --entry community-empty --path artifacts/verify-campus-rag/evidence/source-filter/community-empty.aria.txt`. The artifacts show `仅社区` pressed and `当前筛选条件下没有可展示的来源`.

## Gotchas

- Filter the retrieval view. In the answer view the summary still names both dorm sources, so a hidden card can look like it is still on the page.
- The status line keeps the unfiltered totals, such as `官方 1 条` and `社区 1 条`, after a filter. Assert `当前展示 1 / 2 条来源`, not the status totals.
- The aside says `默认优先展示官方来源`, so the words `官方来源` remain on the page when only the community card is visible. Assert the card heading instead.
- `当前展示 0 / 0 条来源` also appears while results are still loading. Wait for a source heading or for `当前筛选条件下没有可展示的来源` before asserting a zero card count.
- `社团纳新什么时候开始` has no community source in the seed corpus. The empty filter is the expected result, not a failed search.
