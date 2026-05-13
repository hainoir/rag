# 第五阶段固定演示脚本

这份脚本用于 release candidate 演示。演示目标不是展示“聊天机器人”，而是证明系统能围绕真实来源完成可解释检索、证据展示、反馈追踪和后台治理。

演示前准备：

```bash
npm run verify:search-contract
npm run verify:demo
```

如果演示真实数据链路，先确认：

```bash
npm run verify:real-data
```

如果演示后台，确认：

```bash
npm run test:admin
```

## 1. 正常命中

推荐 query：

```text
图书馆借书
```

演示步骤：

1. 打开首页。
2. 输入 query 并提交。
3. 进入结果页后展示回答区。
4. 切到来源列表，展开一个官方来源。

预期结果：

- 页面返回 `ok` 或可解释的 `partial`。
- 回答区展示摘要、置信度和 evidence。
- 来源卡片展示来源站点、发布时间、更新时间、抓取时间和最近校验时间。
- 点击原文能跳到 canonical URL。

说明口径：

> 系统先检索可信来源，再组织回答。回答和来源始终一起展示，避免只给一个不可追溯的生成文本。

## 2. 无答案

推荐 query：

```text
明天校园集市几点开始
```

演示步骤：

1. 输入 query 并提交。
2. 展示无答案状态。
3. 展示相关问题或换关键词引导。

预期结果：

- 页面返回 `empty`。
- 不生成没有来源支持的答案。
- UI 提示用户换关键词或查看相关来源。

说明口径：

> 无证据时系统必须承认不知道，这是可解释 RAG 比普通聊天壳子更重要的边界。

## 3. 官方 / 社区来源分层

推荐 query：

```text
社团纳新什么时候开始
```

演示步骤：

1. 搜索 query。
2. 在来源筛选中切换全部、官方、社区。
3. 展示社区来源的补充定位。

预期结果：

- 官方来源与社区来源标签清晰。
- 社区来源只作为经验补充，不包装成官方事实。
- 若当前环境没有社区来源数据，说明社区入口已保留，但当前发布默认关闭或待审核。

说明口径：

> 官方来源承担事实回答，社区来源只做补充经验，并通过审核状态控制是否进入回答证据。

## 4. 提交 Feedback

推荐操作：

1. 在任意结果页点击“没帮助”或对应反馈入口。
2. 选择原因，例如“来源过期”或“回答不准确”。
3. 提交反馈。

预期结果：

- 前端提交到 `/api/feedback`。
- `search-service` 负责持久化。
- 如果上游不可用，前端显示明确失败，而不是静默吞掉。

说明口径：

> feedback 入口保持在前端，但写入统一收口到 search-service，方便后续和 query log、source snapshot 关联。

## 5. 后台处理 Feedback

准备条件：

```bash
ADMIN_DASHBOARD_TOKEN=...
SEARCH_SERVICE_API_KEY=...
DATABASE_URL=...
```

演示步骤：

1. 打开 `/admin/login`。
2. 使用 `ADMIN_DASHBOARD_TOKEN` 登录。
3. 进入 feedback 工作台。
4. 找到刚提交的反馈。
5. 查看 query、source snapshot、answer summary。
6. 将状态改为 `reviewing` 或 `resolved`，填写管理员备注。

预期结果：

- 后台能追踪用户反馈关联的 query 和来源。
- 状态流转可保存。
- 管理 API 只能通过 `SEARCH_SERVICE_API_KEY` 访问。

说明口径：

> 第四阶段后台是代码侧运营 MVP。真实准线上管理员验收需要在 release report 中单独记录。

## 6. 来源治理与手动同步

准备条件：

```bash
DATABASE_URL=...
REDIS_URL=...
ADMIN_DASHBOARD_TOKEN=...
SEARCH_SERVICE_API_KEY=...
```

演示步骤：

1. 进入 `/admin` 的来源治理视图。
2. 选择一个测试来源，设置为禁用。
3. 尝试触发该来源同步。
4. 恢复启用状态。
5. 触发单来源同步。
6. 另一个终端运行：

```bash
npm run ingest:worker -- --once
```

预期结果：

- 禁用来源不能进入同步队列。
- 启用来源可以入队。
- worker 消费后，后台最近同步状态可刷新。

说明口径：

> 来源默认注册表仍由代码维护，运营调整写入 DB 覆盖层，避免后台直接改代码配置。

## 7. 错误态

演示方式：

1. 临时把 web 的 `SEARCH_SERVICE_URL` 指向不可达地址。
2. 打开首页并搜索一个正常 query。
3. 恢复正确配置。

预期结果：

- 前端显示明确错误态。
- 不把上游不可用伪装成无答案。
- search-service 恢复后搜索恢复正常。

说明口径：

> 错误态和无答案态必须区分。无答案代表检索没有证据；错误态代表系统链路异常。

## 8. 演示结束总结

推荐结束语：

> 这个版本可以作为校园信息检索 / explainable RAG MVP 的 release candidate。它已经具备统一搜索契约、真实来源摄取、Postgres/pgvector 检索、默认 hybrid 策略、证据展示、反馈入口、基础运维检查和后台治理 MVP。真实外部监控、webhook 通知、备份恢复和管理员准线上验收必须在 release acceptance report 中留证后，才能写入最终上线结论。
