# Campus RAG verification map

This directory is the maintained source for verifying the user-facing behavior of 校园信息检索与可解释问答助手. Read the index before driving the app, then use the matching feature file as the recipe.

## Baseline preconditions

- Launch the seed stack with `node .cursor/skills/verify-campus-rag/bin/verify-campus-rag.mjs launch`.
- Run `node .cursor/skills/verify-campus-rag/bin/verify-campus-rag.mjs doctor` and require every line to start with `pass`.
- Use the `webUrl` launch prints. Do not browse port 3000 or 8080 unless that is the printed URL.
- The corpus is the built-in seed data. `doctor` must report `provider=seed`, `databaseRequired=false`, and `answerMode=extractive`.
- Start each feature with `browser reset` so theme and history do not leak from the previous recipe.
- Never drive an instance that was not started by this verification run.

## Driving conventions

- Start every recipe from the baseline state unless its preconditions say otherwise.
- Prefer ARIA roles and accessible names. The only non-ARIA handles in these recipes are `data-testid="source-card"` and `data-theme` on `html`.
- Treat every command as literal. Keep quoted names and flags unchanged.
- Run browser and API actions through `node .cursor/skills/verify-campus-rag/bin/verify-campus-rag.mjs`.
- The verification browser is 1440×900, `zh-CN`, and light `prefers-color-scheme`.
- Wait with `browser expect`. Do not sleep through `检索中` or `正在生成摘要`.
- Restore nothing in the seed corpus; it is read-only. `browser reset` clears browser storage.
- Do not remove proof artifacts during cleanup.

## Proof and skip reporting

- Capture the user action and the resulting state, not only the final screen.
- UI proof includes an ARIA snapshot and a screenshot whose sidecar shows a document title containing `校园信息检索`.
- API proof includes the `/api/search` status, source titles, and whether an answer object is present.
- Persistence proof includes a read of `campus-rag-history` or `campus-rag-theme` after the UI shows the new state.
- Record the feature ID and entry point on every artifact via `--feature` and `--entry`.
- Report an unreachable path with the attempted command and the unmet precondition.
- Do not report a skipped entry point as verified through a different path.

## Feature entry contract

Each feature file starts with an H1 title and one paragraph describing the user-visible behavior. It then uses exactly four H2 sections in this order.

1. `Sub-features` lists short IDs with one line for each behavior.
2. `How to get to it (user POV)` lists every user entry point.
3. `Driving it with verify-campus-rag` starts with `Preconditions:` and uses labeled bullets that pair each user action with an exact command and observable result.
4. `Gotchas` lists traps that can waste or invalidate a verification run.

Keep implementation details out of the map. Name only user paths, stable handles, required state, commands, and observable proof.

## Features

- [Search and answer](./search-answer.md) covers the home box, a suggested question, a direct results URL, history return, the answer, and the citation cards.
- [Citations](./citations.md) covers retrieval view, expanded snippets, source metadata, and the original-link href.
- [Source filter](./source-filter.md) covers all, official, and community filters, including a community filter with no rows.
- [Empty result](./empty-result.md) covers a query the seed corpus cannot answer and the refusal to invent one.
- [Theme and history](./theme-history.md) covers dark mode persistence and local recent searches.
