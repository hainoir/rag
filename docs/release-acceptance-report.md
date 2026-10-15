# 第五阶段 Release Acceptance Report

> 本文件记录 2026-10-15 的验收结果。没有环境、没有密钥或没有临时恢复库的项目写 `blocked`，不写 `passed`。本地一次性口令只存在于当次进程环境，没有进入仓库。

## 1. 基本信息

| 项目               | 内容                                                                                             |
| ------------------ | ------------------------------------------------------------------------------------------------ |
| Release candidate  | `v0.1.0-rc.1`（文档候选，未打 tag，未创建 GitHub Release）                                       |
| 验收日期           | 2026-10-15                                                                                       |
| 验收人             | cloud agent，对照 `docs/release-checklist.md` 与 `docs/current-status-and-next-plan.md`          |
| 基线 commit        | `7ff4733`                                                                                        |
| 验收分支           | `cursor/phase-4-5-acceptance-f284`                                                               |
| Node 版本          | `v22.14.0`                                                                                       |
| 部署环境           | 本地验收：PostgreSQL 16.15、Redis 7.0.15。托管生产环境未接入。                                   |
| Web URL            | seed UI `http://localhost:3100`；本地后台 `http://localhost:3200`                                |
| Search service URL | seed `http://127.0.0.1:8180`；本地 Postgres `http://127.0.0.1:8280`                              |
| Postgres           | 本地 `verified`。托管 `DATABASE_URL` 是否仍可连接未证明。                                        |
| Redis              | 本地 `verified`。GitHub Actions `REDIS_URL` `blocked`，主机 `in-burro-41364.upstash.io` 不存在。 |
| Ops webhook        | `not configured`                                                                                 |
| 临时恢复库         | 本地 `campus_rag_restore` `verified`。托管恢复库 `not configured`。                              |
| pgvector           | 本机 Postgres 的 `pg_available_extensions` 没有 `vector`。                                       |
| Embedding key      | `not configured`                                                                                 |

## 2. Release 结论

当前结论：

- 状态：`blocked`
- 项目定位：校园信息检索 / explainable RAG MVP，上线候选版本。
- 默认检索策略：`hybrid`（沿用 2026-05-13 历史评估；本次没有新报告）。
- 默认回答模式：`extractive`。
- `rerank`：默认关闭，仅作为显式实验能力。

结论说明：

> 本地 release gate、seed UI、本地 Postgres 官方摄取、后台治理、telemetry 和本地备份恢复已经复跑。`v0.1.0-rc.1` 仍不能打 tag：定时同步被失效的 Upstash 主机挡住，托管健康检查和 webhook 没有配置，hybrid 评估缺少 embedding key 和 pgvector。这些项需要 kir 提供下面第 9 节列出的材料。

## 3. 自动化验收记录

| Gate               | 命令                              | 环境要求                              | 状态    | 报告路径                                          | 阻断发布 | 备注                                        |
| ------------------ | --------------------------------- | ------------------------------------- | ------- | ------------------------------------------------- | -------- | ------------------------------------------- |
| Local              | `npm run verify:release:local`    | 无数据库依赖                          | passed  | 命令输出，e2e `9 passed`                          | 否       | 修复后在干净环境复跑通过                    |
| UI seed            | `npm run verify:ui`               | seed，无数据库                        | passed  | `artifacts/verify-campus-rag/evidence/`（不入库） | 否       | 五份 feature recipe 加 seed feedback        |
| Postgres 数据      | `verify:real-data` 等价命令       | 本地 `DATABASE_URL`                   | passed  | 本节第 4 表                                       | 否       | 不是 `verify:release:postgres` 整门         |
| Postgres 聚合门    | `npm run verify:release:postgres` | `DATABASE_URL` 与 `EMBEDDING_API_KEY` | blocked | 环境检查直接失败                                  | 是       | 缺 `EMBEDDING_API_KEY`                      |
| Ops 本地检查       | `npm run check:phase-three-ops`   | 本地 search-service                   | passed  | `reports/ops-health-check.md`                     | 否       | `persistentEnabled=true`，`errorRate=0`     |
| Ops 通知           | `npm run notify:phase-three-ops`  | `OPS_ALERT_WEBHOOK_URL`               | blocked | 命令打印 skip                                     | 是       | 缺 webhook 时退出码仍为 0，不能当成发送成功 |
| Ops 聚合门         | `npm run verify:release:ops`      | webhook、主库、临时恢复库             | blocked | 环境检查失败                                      | 是       | 缺 `OPS_ALERT_WEBHOOK_URL`                  |
| Admin unit         | `npm run test:admin`              | 无数据库依赖                          | passed  | 含在 `verify:release:local`                       | 否       |                                             |
| Admin postgres     | `npm run test:admin:postgres`     | 本地 `DATABASE_URL`                   | passed  | 命令退出码 0                                      | 否       |                                             |
| Telemetry postgres | `npm run test:telemetry:postgres` | 本地 `DATABASE_URL`                   | passed  | 命令退出码 0；备份恢复后又跑过一次                | 否       |                                             |
| 定时同步           | GitHub `Scheduled Ingestion`      | Actions secrets                       | blocked | run `38709421953`                                 | 是       | `ENOTFOUND in-burro-41364.upstash.io`       |
| 托管健康检查       | GitHub `Ops Health Check`         | `OPS_SEARCH_SERVICE_URL`              | blocked | run `38709402812`                                 | 是       | workflow 成功是因为跳过，不是因为检查通过   |

状态只能使用：

- `passed`
- `failed`
- `blocked`
- `skipped`
- `pending`

## 4. 数据验收

| 项目                        | 结果    | 证据                                                                                               |
| --------------------------- | ------- | -------------------------------------------------------------------------------------------------- |
| 官方来源集合                | passed  | `INGEST_SOURCE_IDS=tjcu-main-notices,tjcu-library,tjcu-academic-affairs,tjcu-undergrad-admissions` |
| `ingest:official`           | passed  | 主站选择器修复后 `stored=8 errors=0`；图书馆 `stored=8`；教务 `stored=7`；本科招生 `stored=1`      |
| `inspect:ingestion`         | passed  | 四个源 `lastStatus=succeeded`                                                                      |
| `smoke:postgres`            | passed  | `healthySources=4/4`，`图书馆` 命中 3 条，空查询保持 `empty`                                       |
| `test:ingestion:postgres`   | passed  | 含新增 `main notices current article shell`                                                        |
| `ingest:scheduled:official` | blocked | 托管 run `38709421953` 在 Redis DNS 失败。本地 worker 只证明了单源消费。                           |

验收说明：

> 修复前 `tjcu-main-notices` 的 8 个详情页都报 `No article content extracted`。现行页面正文在 `#vsb_content_4` / `.v_news_content`，旧选择器只认 `#vsb_content_2`。修复后该源可以入库。这是本地可连接 Postgres 上的真实抓取，不是 seed fallback。

## 5. 检索质量验收

| 策略            | 状态    | recall@10 | mrr    | ndcg@10 | evidenceCoverage | emptyAccuracy | averageLatencyMs | 报告                                                                     |
| --------------- | ------- | --------- | ------ | ------- | ---------------- | ------------- | ---------------- | ------------------------------------------------------------------------ |
| `lexical`       | blocked | 未重跑    | 未重跑 | 未重跑  | 未重跑           | 未重跑        | 未重跑           | 2026-05-13 历史记录，不是本次产物                                        |
| `hybrid`        | blocked | 未重跑    | 未重跑 | 未重跑  | 未重跑           | 未重跑        | 未重跑           | `reports/search-quality-evaluation-postgres-2026-05-13T04-01-25-714Z.md` |
| `hybrid_rerank` | blocked | 未重跑    | 未重跑 | 未重跑  | 未重跑           | 未重跑        | 未重跑           | `reports/search-quality-evaluation-postgres-2026-05-13T04-05-55-834Z.md` |

发布决策：

- 默认策略仍写作 `hybrid`，依据是 2026-05-13 已入库的历史比较，不是 2026-10-15 新跑出来的报告。
- `hybrid_rerank`：默认关闭。
- 本次不能把历史数字重新签成 passed。kir 提供 `EMBEDDING_API_KEY` 和带 `vector` 扩展的 Postgres 后，才能跑 `npm run verify:retrieval:real`。

历史记录里的比较仍然是：tuned `hybrid` 的 `mrr=0.9896`、`ndcg@10=0.9923`、`emptyAccuracy=1`，高于当时的 `hybrid_rerank`。

## 6. 运维验收

| 项目                  | 状态    | 证据                                                                                       | 备注                                                |
| --------------------- | ------- | ------------------------------------------------------------------------------------------ | --------------------------------------------------- |
| `/health`             | passed  | `reports/ops-health-check.md`                                                              | 本地 postgres 模式                                  |
| `/metrics.persistent` | passed  | 同上，`persistentEnabled=yes`，`requestsTotal=5`                                           | 本地                                                |
| 成功通知              | blocked | `notify:phase-three-ops` 打印 skip                                                         | 需要真实 `OPS_ALERT_WEBHOOK_URL`                    |
| 失败通知              | blocked | 未发送                                                                                     | 需要同一 webhook，再制造一次失败检查                |
| `backup:drill`        | passed  | `reports/backup-drills/2026-10-15T12-07-28-220Z-local-acceptance/backup-drill-report.json` | 本地主库和 `campus_rag_restore`，`verify=completed` |
| 托管主库备份          | blocked | 无生产连接串                                                                               | 不要把恢复库指到生产主库                            |
| 回滚流程              | blocked | 文档在 `docs/release-readme.md`，没有托管演练                                              | 本地恢复验证不能代替托管回滚                        |

## 7. 后台验收

| 场景          | 状态   | 证据                                                                      | 备注                                  |
| ------------- | ------ | ------------------------------------------------------------------------- | ------------------------------------- |
| 管理员登录    | passed | 本地 `/admin/login` 进入 `/admin`                                         | 一次性口令，未入库                    |
| 来源治理列表  | passed | 图书馆 8 文档 / 31 chunk，最近同步成功                                    | 本地 Postgres                         |
| 禁用来源      | passed | 召回排除；API `409 source_disabled`；UI 同步按钮禁用                      | 测试源 `gov-disabled`                 |
| 手动触发同步  | passed | `POST /api/admin/sources/tjcu-library/ingest` 202，worker `errors=0`      | 本地 Redis。托管定时任务仍 blocked    |
| feedback 追踪 | passed | 查询“图书馆”，评分 down，备注 `local acceptance handled`，状态 `resolved` | 含 source snapshot                    |
| 社区审核状态  | passed | 四个状态都走管理 API 和后台筛选                                           | `supplemental` 不进 `answer.evidence` |
| 保存提示      | fixed  | `src/components/admin-dashboard.tsx`                                      | 原先 `refresh()` 会立刻清掉成功提示   |

## 8. 演示验收

按 `docs/demo-script.md` 和 `.cursor/skills/verify-campus-rag` 执行。

| 路径              | 状态   | Query / 操作                           | 预期结果                                       | 备注                                                  |
| ----------------- | ------ | -------------------------------------- | ---------------------------------------------- | ----------------------------------------------------- |
| 正常命中          | passed | `图书馆借书`                           | answer、两张图书馆来源、evidence               | `artifacts/verify-campus-rag/evidence/search-answer/` |
| 无答案            | passed | `明天校园集市几点开始`                 | `empty`，不编造答案                            | `evidence/empty-result/`                              |
| 来源分层          | passed | `宿舍报修流程`、`社团纳新什么时候开始` | 官方/社区筛选                                  | `evidence/source-filter/`                             |
| 引用展开          | passed | 检索结果、展开片段、原文 href          | `https://lib.tjcu.edu.cn/gk/borrow-guide.html` | `evidence/citations/`                                 |
| 主题和历史        | passed | 暗色、最近搜索、清空                   | localStorage 往返                              | `evidence/theme-history/`                             |
| 提交 feedback     | passed | seed 点“有帮助”；Postgres 点“不准确”   | seed 明确失败；Postgres 写入                   | seed 文案：反馈暂未提交成功。                         |
| 后台处理 feedback | passed | 后台改为 `resolved`                    | 状态可更新                                     | 截图在 `artifacts/admin-acceptance/`                  |
| 错误态            | passed | e2e 拦截失败请求                       | 明确错误，不伪装成无答案                       | `verify:ui` 不拦截健康的 `/api/search`                |

## 9. kir 需要提供的内容

这些项保持 `blocked`。不要用本地结果代替。

1. GitHub Actions secret `REDIS_URL`。现在的主机 `in-burro-41364.upstash.io` 已不存在。run `38709421953` 在入队时 `getaddrinfo ENOTFOUND`。请换成仍可解析的 Redis URL。`DATABASE_URL` 在该 run 里非空所以没有走跳过分支，但 Redis 先失败了，因此这次没有证明托管数据库仍然可连。更换 Redis 时请同时确认 `DATABASE_URL` 仍指向活的数据库。
2. GitHub Actions secret `OPS_SEARCH_SERVICE_URL`（指向已部署 search-service 的 `/api/search`），或者同时设置变量 `OPS_SEARCH_SERVICE_HEALTH_URL` 与 `OPS_SEARCH_SERVICE_METRICS_URL`。run `38709402812` 三者都空，workflow 绿是因为跳过。
3. GitHub Actions secret `OPS_ALERT_WEBHOOK_URL`。用它发送一次成功通知，再制造一次失败检查并确认失败通知到达。
4. `EMBEDDING_API_KEY`。如果不是 2026-05-13 使用的 Qwen 配置，还要给 `EMBEDDING_BASE_URL` 和 `EMBEDDING_MODEL`。数据库必须安装 `vector` 扩展。本机 PostgreSQL 16.15 没有这个扩展。
5. 若要验收托管主库而不是这次本地库：生产 `DATABASE_URL`，以及一个空的、不是主库的 `BACKUP_DRILL_RESTORE_DATABASE_URL`。
6. 第 1 到第 3 项落地后，再观察 24 小时的定时同步、`/health`、`/metrics.persistent`、`service_event_logs` 和 feedback。本次没有这个观察窗口。

托管后台如果和本地不是同一套密钥，还要在部署环境配置 `ADMIN_DASHBOARD_TOKEN` 和 `SEARCH_SERVICE_API_KEY`。不要把这些值提交进仓库。

## 10. 已知限制

- 真实外部监控平台没有接入，不能宣称 production-grade 运维闭环。
- webhook 成功和失败通知没有发送证据。
- 备份恢复只在本地一次性 Postgres 上演练过，没有对托管主库演练。
- 社区来源仍是补充经验，不是权威事实来源。
- `hybrid_rerank` 默认关闭。
- LLM answer 是可选能力，默认发布口径仍是 extractive answer。
- 本次没有打 `v0.1.0-rc.1` tag。

## 11. 最终签收

| 角色 | 结论    | 备注                                                  |
| ---- | ------- | ----------------------------------------------------- |
| 开发 | passed  | 本地 gate、数据摄取修复和后台提示修复已留证           |
| 验收 | blocked | 检索重评、托管通知、托管定时同步和 24 小时观察未完成  |
| 发布 | blocked | 不要打 tag，直到第 9 节的材料补齐并且对应命令重新通过 |
