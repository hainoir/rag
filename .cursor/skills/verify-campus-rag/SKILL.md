---
name: verify-campus-rag
description: "Drive the campus RAG assistant web app (校园信息检索与可解释问答助手) the way a user does — home search, answers, citations, source filters, empty results, theme, and history — and capture proof. Use when changing the search UI, results page, citations, seed demo, or /api/search and you need to show the real app works."
---

# Verify the campus RAG assistant

The primary surface is the Next.js web app. A user searches from the home page, reads an answer with citations, filters official and community sources, and sees an explicit empty state when the seed corpus has no support. Theme and recent searches persist in the browser. The upstream search service and `/api/search` are supporting surfaces. Admin review and Postgres retrieval are outside this seed baseline.

The harness is `node .cursor/skills/verify-campus-rag/bin/verify-campus-rag.mjs`. `npm run verify:ui -- <command>` is the same binary. Feature recipes use the `node` form so flags are passed through unchanged.

Read [features/README.md](features/README.md) before driving. Drive the feature file that matches the change. A proof that exercises one entry point does not cover the other entry points listed in that file.

## Launch

Preconditions, once per machine:

```bash
npm install
npx playwright install chromium
```

From the repo root, with no verification instance already recorded:

```bash
node .cursor/skills/verify-campus-rag/bin/verify-campus-rag.mjs launch
```

Launch starts an isolated seed stack and blocks until it is usable:

1. `npm run search-service` on `127.0.0.1` at port `8180`, or the first free port above it. `VERIFY_CAMPUS_RAG_SEARCH_PORT` pins a port and fails if that port is taken.
2. `npm run dev` at port `3100`, or the first free port above it. The browser URL is `http://localhost:<webPort>`, matching `playwright.config.ts`. `VERIFY_CAMPUS_RAG_WEB_PORT` pins a port and fails if that port is taken. Do not open the web app at `127.0.0.1`: Next.js 16 blocks dev resources from that host while the server advertises `localhost`, so the page never hydrates and `开始检索` stays disabled.

Both processes inherit the Playwright e2e seed environment from `playwright.config.ts`, with optional keys cleared so a developer `.env.local` or shell cannot switch this instance to Postgres, an LLM, rerank, or admin:

- `SEARCH_SERVICE_PROVIDER=seed`
- `SEARCH_ANSWER_MODE=extractive`
- `SEARCH_SERVICE_DISABLE_ENV_FILE=1`
- `SEARCH_SERVICE_URL=http://127.0.0.1:<searchPort>/api/search` on the Next process
- `SEARCH_SERVICE_METHOD=POST`
- `SEARCH_SERVICE_LIMIT=6`
- `SEARCH_SERVICE_TIMEOUT_MS=8000`
- `DATABASE_URL`, `REDIS_URL`, `SEARCH_SERVICE_API_KEY`, `LLM_API_KEY`, `EMBEDDING_API_KEY`, `RERANK_API_KEY`, and `ADMIN_DASHBOARD_TOKEN` set to empty
- `NEXT_TELEMETRY_DISABLED=1` so launch does not wait on a prompt

There is no data directory and no migration. The usable corpus is the in-memory seed data compiled into `search-service`. An empty `DATABASE_URL` is the seed baseline, the same one `npm run verify:demo` and `npm run e2e` use.

Ready means all of these, not merely an open port:

- `GET http://127.0.0.1:<searchPort>/health` returns `status=ok`, `provider=seed`, `databaseRequired=false`, `mode.answerMode=extractive`, and `corpusSize` greater than 0.
- `GET http://localhost:<webPort>/` returns 200 and the HTML contains `校园信息检索与可解释问答助手`.
- `GET http://localhost:<webPort>/api/search?q=图书馆借书` returns `status=ok` and a source titled `图书馆借阅与续借办理说明`.
- `.next/dev/lock` records a pid that belongs to this launch and the same web port. Next.js keeps one dev server per checkout because `experimental.lockDistDir` defaults on.

The search-service log line is `Upstream search service listening on http://127.0.0.1:<searchPort>` followed by `Provider: seed`. The Next log contains `Ready in`. Those lines are written to scratch logs; readiness is the HTTP checks above, because Next buffers stdout when it is not a TTY.

Launch prints `webUrl`, pids, the git SHA, and package version. It records them in `artifacts/verify-campus-rag/scratch/run.json`. Use the printed `webUrl`. Do not assume port 3000 or 8080.

One checkout can run one Next dev server. Launch refuses when `run.json` already exists or when `.next/dev/lock` belongs to another live pid. It does not set Playwright's `reuseExistingServer`, and it does not attach to a server it did not start. A second search-service process can bind another port, but it cannot serve a second UI from this checkout. Do not start `npm run dev`, `npm run e2e`, or `npm run verify:release:local` while this instance holds the lock.

If launch fails, it stops the processes it started. If it does not, run cleanup before retrying.

## Doctor

Run this first whenever a page, port, or answer looks wrong:

```bash
node .cursor/skills/verify-campus-rag/bin/verify-campus-rag.mjs doctor
```

Doctor is read-only. Every line is `pass` or `fail`. Exit 0 means the instance is worth driving. It checks:

- checkout git SHA and `package.json` version match the values stored at launch
- search and web pids are alive, their cwd is this repo, and their command lines are `npm run search-service` and `npm run dev`
- the search and web ports are listened on by those process trees
- search `/health` still reports seed, extractive answers, `databaseRequired=false`, and the corpus size captured at launch
- the homepage still contains `校园信息检索与可解释问答助手`
- `/api/search?q=图书馆借书` still returns `图书馆借阅与续借办理说明`
- `.next/dev/lock` still belongs to this web pid and port

Doctor does not start a browser and does not click the UI. A failure means stop driving and fix the instance. Do not point the browser at another port to work around it.

## Drive

The browser session starts on the first `browser` command. It is a headless Chromium context at 1440×900, `zh-CN`, with `prefers-color-scheme: light`. It is not the user's Chrome profile. `browser reset` closes that context and opens a fresh one, which clears `localStorage`.

Start every feature recipe with `browser reset` unless that recipe says to continue. Commands talk to the recorded `webUrl` only. A `goto` to another origin fails.

Stable handles are accessible names and roles, plus `data-testid="source-card"` on source cards and `data-theme` on `<html>`. Prefer those over CSS and coordinates. The input's accessible name is `输入校园问题`. The submit button is `开始检索` and stays disabled until the query is non-empty.

```bash
node .cursor/skills/verify-campus-rag/bin/verify-campus-rag.mjs browser reset
node .cursor/skills/verify-campus-rag/bin/verify-campus-rag.mjs browser goto /
node .cursor/skills/verify-campus-rag/bin/verify-campus-rag.mjs browser fill --label "输入校园问题" --value "图书馆借书"
node .cursor/skills/verify-campus-rag/bin/verify-campus-rag.mjs browser click --role button --name "开始检索"
node .cursor/skills/verify-campus-rag/bin/verify-campus-rag.mjs browser expect heading --name "图书馆借书" --exact
```

`browser goto` and `browser reload` return only after `<html>` has `data-theme` of `light` or `dark`. The theme control sets that attribute once the client is running. The search box is a controlled input, and a fill that lands before hydration is discarded, leaving `开始检索` disabled.

`browser click` requires exactly one match. Pass `--first` only when the feature file says the control is repeated, such as `展开片段`. `browser expect` waits up to 15 seconds for the observable result. Do not insert a sleep for the retrieving and summarizing phases.

`api search` is the user-facing `/api/search` route the page calls. It is a second view of the same result, not a substitute for the screen.

```bash
node .cursor/skills/verify-campus-rag/bin/verify-campus-rag.mjs api search --query "图书馆借书" --expect-status ok,partial --require-answer --source-title "图书馆借阅与续借办理说明" --feature search-answer --entry home-search-box --path artifacts/verify-campus-rag/evidence/search-answer/api-search.json
```

Contract scripts, when the change needs them:

- `npm run verify:demo` checks `fixtures/demo-queries.json` against an ephemeral in-process seed server. It does not take the Next lock and may run beside this UI instance.
- `npm run e2e` uses `playwright.config.ts`, which starts its own seed search-service and `npm run dev` (default ports 3000 and 8080, overridable with `PLAYWRIGHT_PORT` and `PLAYWRIGHT_SEARCH_PORT`). Outside CI it may reuse an existing server. Run it only after cleanup so it does not fight `.next/dev/lock`.
- `npm run verify:release:local` is the local release gate: format, lint, search contract, `verify:demo`, unit tests, build, and e2e. It also needs the lock free. It is not the per-change UI drive.

Seed baseline boundaries, which this harness will not paper over:

- `有帮助` and `不准确` post to `/api/feedback`. With an empty `DATABASE_URL`, search-service returns 503 `feedback_store_unavailable` and the page says `反馈暂未提交成功`. That is the seed behavior. Do not mock `/api/feedback` and do not call it a saved row.
- `/admin/login` shows `后台访问口令尚未配置` because launch clears `ADMIN_DASHBOARD_TOKEN`. Admin review needs a real token and Postgres. Use `npm run verify:release:postgres` for that gate; do not claim it from this instance.
- The error screen `本次检索未成功完成` appears when `/api/search` fails. This instance is healthy, so that screen is not a seed journey. `tests/e2e/demo-flow.spec.ts` covers it by intercepting the route. This harness does not intercept `/api/search`.

## Evidence

Write proof under `artifacts/verify-campus-rag/evidence/`. The harness appends every command to `artifacts/verify-campus-rag/evidence/harness.log`. Cleanup never deletes this directory.

A UI proof includes:

- the user action and the resulting state, as separate screenshots when the action is not itself the final screen
- an ARIA snapshot whose header records `feature`, `entry`, `url`, and `title`
- a screenshot sidecar `*.meta.txt` with the same identity fields
- the document title containing `校园信息检索`

```bash
node .cursor/skills/verify-campus-rag/bin/verify-campus-rag.mjs browser screenshot --feature search-answer --entry home-search-box --path artifacts/verify-campus-rag/evidence/search-answer/results.png
node .cursor/skills/verify-campus-rag/bin/verify-campus-rag.mjs browser snapshot --aria --feature search-answer --entry home-search-box --path artifacts/verify-campus-rag/evidence/search-answer/results.aria.txt
```

Also record side effects outside the pixels:

- `browser storage --key campus-rag-history` or `--key campus-rag-theme`, with `--contains` and `--path`, for browser persistence
- `api search` JSON for the answer and source list the page requested

The results page must show the query, `回答摘要` or the empty-state copy, and the source titles the feature names. A final screenshot without the action that produced it is not enough. Do not drive internal setters, test-only endpoints, or `page.route` mocks. The seed corpus is real app data. External canonical sites are not: assert the `查看原文` href, and do not follow it.

`artifacts/` is gitignored. Leave the proof on disk and cite its path in the report.

## Cleanup

```bash
node .cursor/skills/verify-campus-rag/bin/verify-campus-rag.mjs cleanup
```

Cleanup signals only the search, web, and browser pids recorded in `run.json`, and only after checking that their cwd is this repo and their command lines match the processes launch started. It signals the process group (`SIGTERM`, then `SIGKILL` if needed). It does not kill by process name. It removes `artifacts/verify-campus-rag/scratch/`, including logs and `run.json`, and leaves `artifacts/verify-campus-rag/evidence/` in place.

Run cleanup after a failed launch or drive too, so a broken attempt does not keep the Next lock. If cleanup refuses a pid, do not kill that pid by hand from this skill; it is not the verification process.

After cleanup, confirm the evidence files named by the recipe are still on disk.

## Helpers

The executable helper is `.cursor/skills/verify-campus-rag/bin/verify-campus-rag.mjs`.

```bash
node .cursor/skills/verify-campus-rag/bin/verify-campus-rag.mjs launch
node .cursor/skills/verify-campus-rag/bin/verify-campus-rag.mjs doctor
node .cursor/skills/verify-campus-rag/bin/verify-campus-rag.mjs browser reset
node .cursor/skills/verify-campus-rag/bin/verify-campus-rag.mjs browser goto /
node .cursor/skills/verify-campus-rag/bin/verify-campus-rag.mjs browser reload
node .cursor/skills/verify-campus-rag/bin/verify-campus-rag.mjs browser fill --label "输入校园问题" --value "图书馆借书"
node .cursor/skills/verify-campus-rag/bin/verify-campus-rag.mjs browser click --role button --name "开始检索"
node .cursor/skills/verify-campus-rag/bin/verify-campus-rag.mjs browser expect url --includes "/search?q="
node .cursor/skills/verify-campus-rag/bin/verify-campus-rag.mjs browser expect heading --name "图书馆借书" --exact
node .cursor/skills/verify-campus-rag/bin/verify-campus-rag.mjs browser expect text --name "回答摘要"
node .cursor/skills/verify-campus-rag/bin/verify-campus-rag.mjs browser expect absent --text "回答摘要"
node .cursor/skills/verify-campus-rag/bin/verify-campus-rag.mjs browser expect absent --role heading --name "新生宿舍生活经验帖" --exact
node .cursor/skills/verify-campus-rag/bin/verify-campus-rag.mjs browser expect count --testid source-card --min 1
node .cursor/skills/verify-campus-rag/bin/verify-campus-rag.mjs browser expect enabled --role button --name "开始检索"
node .cursor/skills/verify-campus-rag/bin/verify-campus-rag.mjs browser expect disabled --role button --name "开始检索"
node .cursor/skills/verify-campus-rag/bin/verify-campus-rag.mjs browser expect attribute --selector html --attr data-theme --value dark
node .cursor/skills/verify-campus-rag/bin/verify-campus-rag.mjs browser storage --key campus-rag-history --contains "图书馆借书" --feature search-answer --entry home-search-box --path artifacts/verify-campus-rag/evidence/search-answer/history.txt
node .cursor/skills/verify-campus-rag/bin/verify-campus-rag.mjs api search --query "明天校园集市几点开始" --expect-status empty --forbid-answer --feature empty-result --entry home-search-box --path artifacts/verify-campus-rag/evidence/empty-result/api-search.json
node .cursor/skills/verify-campus-rag/bin/verify-campus-rag.mjs cleanup
```

`browser snapshot` and `browser screenshot` require `--feature`, `--entry`, and `--path`. Screenshot paths end in `.png`. `--selector` accepts only `html`. The first `browser` command starts a session process; cleanup stops it. Do not start `session` yourself.

The helper uses Linux `/proc`, `ss`, and POSIX process groups. It is the same local seed stack as `npm run e2e`, not a remote or Postgres stand-in.

When the UI changes, keep this map honest with `/maintain-verification-skill`.
