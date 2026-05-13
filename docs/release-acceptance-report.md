# 第五阶段 Release Acceptance Report

> 当前文件是验收报告模板。执行 release gate 后只记录真实结果；没有环境、没有密钥或没有临时恢复库时，状态写 `blocked`，不要写 `passed`。

## 1. 基本信息

| 项目               | 内容                                     |
| ------------------ | ---------------------------------------- |
| Release candidate  | `v0.1.0-rc.1`                            |
| 验收日期           | 2026-05-13                               |
| 验收人             | Codex                                    |
| Commit hash        | `df35ff1` + working tree changes         |
| Node 版本          | `v22.14.0`                               |
| 部署环境           | `local`                                  |
| Web URL            | `http://localhost:3002`                  |
| Search service URL | seed verification in-process             |
| Postgres           | `not configured / configured / verified` |
| Redis              | `not configured / configured / verified` |
| Ops webhook        | `not configured / configured / verified` |
| 临时恢复库         | `not configured / configured / verified` |

## 2. Release 结论

当前结论：

- 状态：`blocked`
- 项目定位：校园信息检索 / explainable RAG MVP，上线候选版本。
- 默认检索策略：`hybrid`。
- 默认回答模式：`extractive`。
- `rerank`：默认关闭，仅作为显式实验能力。

结论说明：

> 第五阶段发布文档、验收模板和聚合脚本已落地；本地格式、契约、demo、admin unit、lint、build、unit test 已通过。e2e 因当前工作区已有 Next dev server 占用同一项目单实例锁而未取得干净通过记录，因此 `verify:release:local` 当前不能写作 passed。Postgres、ops 和真实 admin gate 仍需在准线上环境补跑。

## 3. 自动化验收记录

| Gate               | 命令                              | 环境要求                                   | 状态    | 报告路径 | 阻断发布 | 备注                       |
| ------------------ | --------------------------------- | ------------------------------------------ | ------- | -------- | -------- | -------------------------- |
| Local              | `npm run verify:release:local`    | 无数据库依赖                               | blocked | 见下表   | 是       | e2e 未取得干净通过记录     |
| Postgres           | `npm run verify:release:postgres` | `DATABASE_URL`、真实数据、embedding 条件   | pending | 待填写   | 是       | 待填写                     |
| Ops                | `npm run verify:release:ops`      | 可访问 search-service、webhook、临时恢复库 | pending | 待填写   | 是       | 待填写                     |
| Admin unit         | `npm run test:admin`              | 无数据库依赖                               | passed  | 命令输出 | 是       | 仅有 Node 实验特性 warning |
| Admin postgres     | `npm run test:admin:postgres`     | `DATABASE_URL`                             | pending | 待填写   | 是       | 待填写                     |
| Telemetry postgres | `npm run test:telemetry:postgres` | `DATABASE_URL`                             | pending | 待填写   | 是       | 待填写                     |

状态只能使用：

- `passed`
- `failed`
- `blocked`
- `skipped`
- `pending`

本次代码侧实现验证记录：

| 命令                                       | 状态    | 备注                                                                                                                     |
| ------------------------------------------ | ------- | ------------------------------------------------------------------------------------------------------------------------ |
| `node -e "JSON.parse(...package.json...)"` | passed  | `package.json` 可解析                                                                                                    |
| `npm run format:check`                     | passed  | Prettier 检查通过                                                                                                        |
| `npm run verify:search-contract`           | passed  | `fixtures/search-response.json` 契约通过                                                                                 |
| `npm run verify:demo`                      | passed  | 4 条 seed demo query 通过                                                                                                |
| `npm run test:admin`                       | passed  | admin auth / validation 通过                                                                                             |
| `npm run lint`                             | passed  | ESLint 无 warning                                                                                                        |
| `npm run build`                            | passed  | Next production build 通过                                                                                               |
| `npm run test:unit`                        | passed  | unit + components 全部通过                                                                                               |
| `npm run e2e -- --reporter=line`           | blocked | 当前已有 `next dev` PID 4300 占用同一项目单实例锁；复用 `3002` server 后环境不干净，首次有断言失败，第二次超时未正常退出 |

## 4. 数据验收

| 项目                        | 结果    | 证据                    |
| --------------------------- | ------- | ----------------------- |
| 官方来源集合                | 待填写  | `INGEST_SOURCE_IDS=...` |
| `ingest:official`           | pending | 待填写                  |
| `inspect:ingestion`         | pending | 待填写                  |
| `smoke:postgres`            | pending | 待填写                  |
| `test:ingestion:postgres`   | pending | 待填写                  |
| `ingest:scheduled:official` | pending | 待填写                  |

验收说明：

> 待填写。需要明确真实 Postgres 链路是否闭合，不能用 seed fallback 替代真实数据证明。

## 5. 检索质量验收

| 策略            | 状态    | recall@10 | mrr    | ndcg@10 | evidenceCoverage | emptyAccuracy | averageLatencyMs | 报告   |
| --------------- | ------- | --------- | ------ | ------- | ---------------- | ------------- | ---------------- | ------ |
| `lexical`       | pending | 待填写    | 待填写 | 待填写  | 待填写           | 待填写        | 待填写           | 待填写 |
| `hybrid`        | pending | 待填写    | 待填写 | 待填写  | 待填写           | 待填写        | 待填写           | 待填写 |
| `hybrid_rerank` | pending | 待填写    | 待填写 | 待填写  | 待填写           | 待填写        | 待填写           | 待填写 |

发布决策：

- 默认策略：`hybrid`
- `hybrid_rerank`：默认关闭
- 若最新报告与上述结论冲突，必须在这里记录原因和决策。

## 6. 运维验收

| 项目                  | 状态    | 证据   | 备注                         |
| --------------------- | ------- | ------ | ---------------------------- |
| `/health`             | pending | 待填写 | 待填写                       |
| `/metrics.persistent` | pending | 待填写 | 待填写                       |
| 成功通知              | pending | 待填写 | 真实 `OPS_ALERT_WEBHOOK_URL` |
| 失败通知              | pending | 待填写 | 需要一次失败路径验证         |
| `backup:drill`        | pending | 待填写 | 需要临时恢复库               |
| 回滚流程              | pending | 待填写 | 文档演练或真实演练           |

## 7. 后台验收

| 场景          | 状态    | 证据   | 备注                                   |
| ------------- | ------- | ------ | -------------------------------------- |
| 管理员登录    | pending | 待填写 | `ADMIN_DASHBOARD_TOKEN`                |
| 来源治理列表  | pending | 待填写 | 真实 Postgres                          |
| 禁用来源      | pending | 待填写 | 不参与召回或同步                       |
| 手动触发同步  | pending | 待填写 | 需要 Redis                             |
| feedback 追踪 | pending | 待填写 | query、sources、answer                 |
| 社区审核状态  | pending | 待填写 | pending/rejected/supplemental/approved |

## 8. 演示验收

按 `docs/demo-script.md` 执行。

| 路径              | 状态    | Query / 操作 | 预期结果                       | 备注   |
| ----------------- | ------- | ------------ | ------------------------------ | ------ |
| 正常命中          | pending | 待填写       | 展示 answer、sources、evidence | 待填写 |
| 无答案            | pending | 待填写       | 不编造答案                     | 待填写 |
| 来源分层          | pending | 待填写       | 官方/社区分层清晰              | 待填写 |
| 提交 feedback     | pending | 待填写       | feedback 写入                  | 待填写 |
| 后台处理 feedback | pending | 待填写       | 状态可更新                     | 待填写 |
| 错误态            | pending | 待填写       | 前端明确错误                   | 待填写 |

## 9. 已知限制

- 真实外部监控平台接入如果未完成，不能宣称 production-grade 运维闭环。
- 真实 webhook 成功和失败通知如果未留证据，只能写作代码侧通知入口已具备。
- 备份恢复如果没有临时恢复库演练，只能写作脚本已具备，恢复未验收。
- 社区来源即使具备审核入口，也默认作为补充经验来源，不能包装成权威事实来源。
- `hybrid_rerank` 当前默认关闭，不能写成线上默认排序策略。
- LLM answer 是可选能力，默认发布口径仍以 extractive answer 为准。

## 10. 最终签收

| 角色 | 结论    | 备注   |
| ---- | ------- | ------ |
| 开发 | pending | 待填写 |
| 验收 | pending | 待填写 |
| 发布 | pending | 待填写 |
