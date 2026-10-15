# Theme and history

Theme and history let a user switch to dark mode and rerun a recent question. Both values persist in the verification browser across reload, and both disappear when the profile is reset.

## Sub-features

- `theme-toggle` switches the document to dark and renames the toggle.
- `theme-persist` keeps dark mode across reload and can switch back to light.
- `history-record` stores a submitted query and shows it under `最近搜索`.
- `history-rerun` runs that saved query from the home page.
- `history-clear` removes recent searches without changing the theme.

## How to get to it (user POV)

- Choose `切换到暗色模式` or `切换到浅色模式` on the home page or the results page.
- Submit a search, return home, and choose the query under `最近搜索`.
- Choose `清空` in `最近搜索`.

## Driving it with verify-campus-rag

Preconditions:

- `doctor` exits 0 for this launch.
- `browser reset` has opened a fresh profile. The verification browser emulates light `prefers-color-scheme`, so the first theme is light.
- No `campus-rag-history` value is stored yet.

- **Reset and open.** Open the home page. Run `node .cursor/skills/verify-campus-rag/bin/verify-campus-rag.mjs browser reset` and `node .cursor/skills/verify-campus-rag/bin/verify-campus-rag.mjs browser goto /`. Then run `node .cursor/skills/verify-campus-rag/bin/verify-campus-rag.mjs browser expect attribute --selector html --attr data-theme --value light` and `node .cursor/skills/verify-campus-rag/bin/verify-campus-rag.mjs browser expect text --name "还没有历史问题。"`.
- **Turn on dark mode.** Choose `切换到暗色模式`. Run `node .cursor/skills/verify-campus-rag/bin/verify-campus-rag.mjs browser click --role button --name "切换到暗色模式"`. Then run `node .cursor/skills/verify-campus-rag/bin/verify-campus-rag.mjs browser expect attribute --selector html --attr data-theme --value dark` and `node .cursor/skills/verify-campus-rag/bin/verify-campus-rag.mjs browser expect attribute --role button --name "切换到浅色模式" --attr aria-pressed --value true`.
- **Stored theme.** Read the saved theme. Run `node .cursor/skills/verify-campus-rag/bin/verify-campus-rag.mjs browser storage --key campus-rag-theme --contains "dark" --feature theme-history --entry theme-toggle --path artifacts/verify-campus-rag/evidence/theme-history/theme-dark.txt`. The value contains `dark`.
- **Reload.** Reload the home page. Run `node .cursor/skills/verify-campus-rag/bin/verify-campus-rag.mjs browser reload`. Then run `node .cursor/skills/verify-campus-rag/bin/verify-campus-rag.mjs browser expect attribute --selector html --attr data-theme --value dark`. Dark mode survives the reload.
- **Return to light.** Choose `切换到浅色模式`. Run `node .cursor/skills/verify-campus-rag/bin/verify-campus-rag.mjs browser click --role button --name "切换到浅色模式"`. Then run `node .cursor/skills/verify-campus-rag/bin/verify-campus-rag.mjs browser expect attribute --selector html --attr data-theme --value light` and `node .cursor/skills/verify-campus-rag/bin/verify-campus-rag.mjs browser storage --key campus-rag-theme --contains "light" --feature theme-history --entry theme-toggle --path artifacts/verify-campus-rag/evidence/theme-history/theme-light.txt`.
- **Create history.** Submit a query. Run `node .cursor/skills/verify-campus-rag/bin/verify-campus-rag.mjs browser fill --label "输入校园问题" --value "图书馆借书"` and `node .cursor/skills/verify-campus-rag/bin/verify-campus-rag.mjs browser click --role button --name "开始检索"`. Then run `node .cursor/skills/verify-campus-rag/bin/verify-campus-rag.mjs browser expect heading --name "图书馆借书" --exact`.
- **History visible.** Return home. Run `node .cursor/skills/verify-campus-rag/bin/verify-campus-rag.mjs browser goto /`. Then run `node .cursor/skills/verify-campus-rag/bin/verify-campus-rag.mjs browser expect text --name "最近搜索"` and `node .cursor/skills/verify-campus-rag/bin/verify-campus-rag.mjs browser storage --key campus-rag-history --contains "图书馆借书" --feature theme-history --entry history-panel --path artifacts/verify-campus-rag/evidence/theme-history/history.txt`.
- **Rerun.** Choose the saved query. Run `node .cursor/skills/verify-campus-rag/bin/verify-campus-rag.mjs browser click --role button --name "图书馆借书"`. Then run `node .cursor/skills/verify-campus-rag/bin/verify-campus-rag.mjs browser expect heading --name "图书馆借书" --exact`.
- **Clear.** Return home and choose `清空`. Run `node .cursor/skills/verify-campus-rag/bin/verify-campus-rag.mjs browser goto /` and `node .cursor/skills/verify-campus-rag/bin/verify-campus-rag.mjs browser click --role button --name "清空"`. Then run `node .cursor/skills/verify-campus-rag/bin/verify-campus-rag.mjs browser expect text --name "还没有历史问题。"` and `node .cursor/skills/verify-campus-rag/bin/verify-campus-rag.mjs browser storage --key campus-rag-history --contains "[]" --feature theme-history --entry history-panel --path artifacts/verify-campus-rag/evidence/theme-history/history-cleared.txt`.
- **Proof.** Capture the cleared home page. Run `node .cursor/skills/verify-campus-rag/bin/verify-campus-rag.mjs browser screenshot --feature theme-history --entry history-panel --path artifacts/verify-campus-rag/evidence/theme-history/cleared.png` and `node .cursor/skills/verify-campus-rag/bin/verify-campus-rag.mjs browser snapshot --aria --feature theme-history --entry history-panel --path artifacts/verify-campus-rag/evidence/theme-history/cleared.aria.txt`. The artifacts show `还没有历史问题。`. `theme-light.txt` is the stored theme, and the screenshot sidecar records the document title.

## Gotchas

- `data-theme` is applied after the page hydrates. `browser expect attribute` waits for it. A snapshot taken before that can still show the product name with the attribute missing.
- The verification browser forces light `prefers-color-scheme`. A user's own browser may start in dark mode when the operating system does. Do not treat a host-dark first paint as a product failure inside this profile.
- The toggle's accessible name changes from `切换到暗色模式` to `切换到浅色模式` after the click. The old name is gone.
- `browser reload` keeps the same profile. `browser reset` clears theme and history.
- `清空` removes recent searches only. It does not reset the theme.
- Direct navigation to `/search?q=` does not add a history entry. Submit the form first.
- The empty-history sentence is `还没有历史问题。` including the period.
