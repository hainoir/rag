"use client";

import type { FormEvent } from "react";
import { useEffect, useMemo, useState } from "react";

type AdminTab = "sources" | "sync" | "feedback" | "community";

type AdminSummary = {
  windowHours: number;
  queryCount: number;
  errorCount: number;
  errorRate: number;
  averageDurationMs: number;
  pendingFeedbackCount: number;
  ingestionIssueCount: number;
  pendingCommunityReviewCount: number;
};

type AdminSource = {
  id: string;
  name: string;
  type: "official" | "community";
  baseUrl: string;
  effectiveEnabled: boolean;
  effectiveTrustWeight: number;
  effectiveUpdateCadence: "hourly" | "daily" | "weekly" | "manual";
  override: {
    adminNote?: string | null;
    updatedAt?: string | null;
  };
  stats: {
    runCount: number;
    failedRunCount: number;
    failureRate: number;
    documentCount: number;
    chunkCount: number;
    lastStatus?: string | null;
    lastStartedAt?: string | null;
    latestError?: string | null;
  };
  healthStatus: "healthy" | "warning" | "failed" | "disabled";
};

type QueryLogItem = {
  id: string;
  requestId: string;
  query: string;
  status: string;
  sourceCount: number;
  officialSourceCount: number;
  communitySourceCount: number;
  durationMs?: number | null;
  errorCode?: string | null;
  gatewayEvent: string;
  answerSummary?: string | null;
  createdAt: string;
};

type FeedbackItem = {
  id: string;
  requestId: string;
  query: string;
  rating: "up" | "down";
  reason?: string | null;
  sourceIds: string[];
  status: "new" | "reviewing" | "resolved" | "dismissed";
  adminNote?: string | null;
  answerSummary?: string | null;
  sourceSnapshot: Array<{ id: string; title: string; sourceName: string; type: string }>;
  createdAt: string;
};

type CommunityReviewItem = {
  id: string;
  sourceId: string;
  sourceName?: string | null;
  title?: string | null;
  canonicalUrl: string;
  status: "pending" | "approved" | "supplemental" | "rejected";
  riskLevel: "low" | "medium" | "high";
  reason?: string | null;
  updatedAt: string;
};

const tabs: Array<{ id: AdminTab; label: string }> = [
  { id: "sources", label: "来源治理" },
  { id: "sync", label: "同步记录" },
  { id: "feedback", label: "查询反馈" },
  { id: "community", label: "社区审核" },
];

function formatTime(value?: string | null) {
  if (!value) {
    return "-";
  }

  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function statusLabel(value: string) {
  const labels: Record<string, string> = {
    healthy: "健康",
    warning: "注意",
    failed: "失败",
    disabled: "禁用",
    succeeded: "成功",
    partial: "部分失败",
    new: "新反馈",
    reviewing: "处理中",
    resolved: "已处理",
    dismissed: "已忽略",
    pending: "待审核",
    approved: "可回答",
    supplemental: "仅补充",
    rejected: "已拒绝",
  };

  return labels[value] ?? value;
}

function badgeClass(value: string) {
  if (["healthy", "succeeded", "approved", "resolved"].includes(value)) {
    return "border-emerald-300 bg-emerald-50 text-emerald-800";
  }

  if (["warning", "partial", "reviewing", "supplemental", "pending"].includes(value)) {
    return "border-amber-300 bg-amber-50 text-amber-800";
  }

  if (["failed", "rejected", "dismissed", "disabled"].includes(value)) {
    return "border-rose-300 bg-rose-50 text-rose-800";
  }

  return "border-[var(--line)] bg-white/70 text-[var(--muted)]";
}

async function readJson<T>(url: string): Promise<T> {
  const response = await fetch(url, {
    cache: "no-store",
  });
  const payload = (await response.json()) as T & { error?: string; message?: string };

  if (!response.ok) {
    throw new Error(payload.message ?? payload.error ?? `HTTP ${response.status}`);
  }

  return payload;
}

async function writeJson<T>(url: string, method: "PATCH" | "POST", body?: unknown): Promise<T> {
  const response = await fetch(url, {
    method,
    headers: {
      "Content-Type": "application/json",
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const payload = (await response.json()) as T & { error?: string; message?: string };

  if (!response.ok) {
    throw new Error(payload.message ?? payload.error ?? `HTTP ${response.status}`);
  }

  return payload;
}

export function AdminDashboard() {
  const [activeTab, setActiveTab] = useState<AdminTab>("sources");
  const [summary, setSummary] = useState<AdminSummary | null>(null);
  const [sources, setSources] = useState<AdminSource[]>([]);
  const [queryLogs, setQueryLogs] = useState<QueryLogItem[]>([]);
  const [feedback, setFeedback] = useState<FeedbackItem[]>([]);
  const [communityReview, setCommunityReview] = useState<CommunityReviewItem[]>([]);
  const [sourceType, setSourceType] = useState("");
  const [sourceHealth, setSourceHealth] = useState("");
  const [feedbackStatus, setFeedbackStatus] = useState("");
  const [feedbackRating, setFeedbackRating] = useState("");
  const [communityStatus, setCommunityStatus] = useState("pending");
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  async function refresh() {
    setLoading(true);
    setMessage(null);

    try {
      const [summaryPayload, sourcePayload, queryPayload, feedbackPayload, communityPayload] = await Promise.all([
        readJson<{ summary: AdminSummary }>("/api/admin/summary"),
        readJson<{ sources: AdminSource[] }>(
          `/api/admin/sources?${new URLSearchParams({
            ...(sourceType ? { type: sourceType } : {}),
            ...(sourceHealth ? { health: sourceHealth } : {}),
          })}`,
        ),
        readJson<{ items: QueryLogItem[] }>("/api/admin/query-logs?limit=30"),
        readJson<{ items: FeedbackItem[] }>(
          `/api/admin/feedback?${new URLSearchParams({
            limit: "30",
            ...(feedbackStatus ? { status: feedbackStatus } : {}),
            ...(feedbackRating ? { rating: feedbackRating } : {}),
          })}`,
        ),
        readJson<{ items: CommunityReviewItem[] }>(
          `/api/admin/community-review?${new URLSearchParams({
            limit: "30",
            ...(communityStatus ? { status: communityStatus } : {}),
          })}`,
        ),
      ]);

      setSummary(summaryPayload.summary);
      setSources(sourcePayload.sources);
      setQueryLogs(queryPayload.items);
      setFeedback(feedbackPayload.items);
      setCommunityReview(communityPayload.items);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "后台数据加载失败。");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refresh();
  }, [sourceType, sourceHealth, feedbackStatus, feedbackRating, communityStatus]);

  const syncIssues = useMemo(
    () =>
      sources.filter(
        (source) => source.healthStatus === "failed" || source.healthStatus === "warning" || source.stats.failedRunCount > 0,
      ),
    [sources],
  );

  async function logout() {
    await fetch("/api/admin/session", { method: "DELETE" });
    window.location.href = "/admin/login";
  }

  async function updateSource(event: FormEvent<HTMLFormElement>, sourceId: string) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const trustWeightValue = Number(formData.get("trustWeight"));
    const payload = {
      enabled: formData.get("enabled") === "on",
      trustWeight: Number.isFinite(trustWeightValue) ? trustWeightValue : null,
      updateCadence: String(formData.get("updateCadence") ?? "daily"),
      adminNote: String(formData.get("adminNote") ?? ""),
    };

    await writeJson(`/api/admin/sources/${encodeURIComponent(sourceId)}`, "PATCH", payload);
    setMessage(`已更新 ${sourceId}`);
    await refresh();
  }

  async function enqueueSource(sourceId: string) {
    const payload = await writeJson<{ job: { id: string } }>(
      `/api/admin/sources/${encodeURIComponent(sourceId)}/ingest`,
      "POST",
    );
    setMessage(`已加入同步队列：${payload.job.id}`);
  }

  async function updateFeedback(event: FormEvent<HTMLFormElement>, feedbackId: string) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);

    await writeJson(`/api/admin/feedback/${encodeURIComponent(feedbackId)}`, "PATCH", {
      status: String(formData.get("status")),
      adminNote: String(formData.get("adminNote") ?? ""),
    });
    setMessage("反馈状态已更新。");
    await refresh();
  }

  async function updateCommunityReview(event: FormEvent<HTMLFormElement>, reviewId: string) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);

    await writeJson(`/api/admin/community-review/${encodeURIComponent(reviewId)}`, "PATCH", {
      status: String(formData.get("status")),
      riskLevel: String(formData.get("riskLevel")),
      reason: String(formData.get("reason") ?? ""),
    });
    setMessage("社区审核状态已更新。");
    await refresh();
  }

  return (
    <div className="mx-auto grid max-w-7xl gap-5 px-4 py-6">
      <header className="flex flex-wrap items-center justify-between gap-4 border-b border-[var(--line)] pb-4">
        <div>
          <p className="text-sm font-semibold text-[var(--accent)]">第四阶段运营后台</p>
          <h1 className="text-3xl font-semibold">管理后台与运营闭环</h1>
        </div>
        <div className="flex gap-2">
          <button className="rounded-lg border border-[var(--line)] px-3 py-2 text-sm" onClick={() => void refresh()} type="button">
            刷新
          </button>
          <button className="rounded-lg border border-[var(--line)] px-3 py-2 text-sm" onClick={() => void logout()} type="button">
            退出
          </button>
        </div>
      </header>

      {summary ? (
        <section className="grid gap-3 md:grid-cols-5">
          {[
            ["24h 查询", summary.queryCount],
            ["错误率", `${Math.round(summary.errorRate * 100)}%`],
            ["平均耗时", `${Math.round(summary.averageDurationMs)}ms`],
            ["待处理反馈", summary.pendingFeedbackCount],
            ["同步异常", summary.ingestionIssueCount + summary.pendingCommunityReviewCount],
          ].map(([label, value]) => (
            <div className="rounded-lg border border-[var(--line)] bg-white/72 p-4" key={label}>
              <p className="muted text-xs">{label}</p>
              <p className="mt-2 text-2xl font-semibold">{value}</p>
            </div>
          ))}
        </section>
      ) : null}

      {message ? <p className="rounded-lg border border-[var(--line)] bg-white/80 px-4 py-3 text-sm">{message}</p> : null}

      <nav className="flex flex-wrap gap-2 border-b border-[var(--line)] pb-3">
        {tabs.map((tab) => (
          <button
            className={`rounded-lg border px-3 py-2 text-sm ${
              activeTab === tab.id ? "border-[var(--accent)] bg-[var(--accent-soft)]" : "border-[var(--line)] bg-white/60"
            }`}
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            type="button"
          >
            {tab.label}
          </button>
        ))}
      </nav>

      {loading ? <p className="muted rounded-lg border border-[var(--line)] bg-white/60 p-4 text-sm">正在加载后台数据...</p> : null}

      {activeTab === "sources" ? (
        <section className="grid gap-4">
          <div className="flex flex-wrap gap-3">
            <select aria-label="按来源类型筛选" className="rounded-lg border border-[var(--line)] bg-white/80 px-3 py-2 text-sm" onChange={(event) => setSourceType(event.target.value)} value={sourceType}>
              <option value="">全部来源</option>
              <option value="official">官方</option>
              <option value="community">社区</option>
            </select>
            <select aria-label="按来源健康状态筛选" className="rounded-lg border border-[var(--line)] bg-white/80 px-3 py-2 text-sm" onChange={(event) => setSourceHealth(event.target.value)} value={sourceHealth}>
              <option value="">全部状态</option>
              <option value="healthy">健康</option>
              <option value="warning">注意</option>
              <option value="failed">失败</option>
              <option value="disabled">禁用</option>
            </select>
          </div>
          <div className="overflow-x-auto rounded-lg border border-[var(--line)] bg-white/72">
            <table className="w-full min-w-[980px] border-collapse text-left text-sm">
              <thead className="border-b border-[var(--line)] bg-white/80">
                <tr>
                  <th className="p-3">来源</th>
                  <th className="p-3">健康</th>
                  <th className="p-3">文档 / chunk</th>
                  <th className="p-3">最近同步</th>
                  <th className="p-3">治理设置</th>
                  <th className="p-3">操作</th>
                </tr>
              </thead>
              <tbody>
                {sources.map((source) => (
                  <tr className="border-b border-[var(--line)] align-top" key={source.id}>
                    <td className="grid gap-1 p-3">
                      <strong>{source.name}</strong>
                      <span className="muted font-mono text-xs">{source.id}</span>
                      <span className="muted text-xs">{source.type}</span>
                    </td>
                    <td className="p-3">
                      <span className={`rounded-md border px-2 py-1 text-xs ${badgeClass(source.healthStatus)}`}>
                        {statusLabel(source.healthStatus)}
                      </span>
                    </td>
                    <td className="p-3">
                      {source.stats.documentCount} / {source.stats.chunkCount}
                    </td>
                    <td className="p-3">
                      <p>{statusLabel(source.stats.lastStatus ?? "未同步")}</p>
                      <p className="muted text-xs">{formatTime(source.stats.lastStartedAt)}</p>
                      {source.stats.latestError ? <p className="mt-1 max-w-xs text-xs text-rose-700">{source.stats.latestError}</p> : null}
                    </td>
                    <td className="p-3">
                      <form className="grid min-w-[280px] gap-2" onSubmit={(event) => void updateSource(event, source.id)}>
                        <label className="flex items-center gap-2 text-xs">
                          <input aria-label={`${source.name} 是否启用`} defaultChecked={source.effectiveEnabled} name="enabled" type="checkbox" />
                          启用
                        </label>
                        <div className="grid grid-cols-2 gap-2">
                          <input
                            className="rounded-md border border-[var(--line)] px-2 py-1 text-xs"
                            aria-label={`${source.name} 来源权重`}
                            defaultValue={source.effectiveTrustWeight}
                            max="1"
                            min="0"
                            name="trustWeight"
                            step="0.01"
                            type="number"
                          />
                          <select
                            className="rounded-md border border-[var(--line)] px-2 py-1 text-xs"
                            aria-label={`${source.name} 更新频率`}
                            defaultValue={source.effectiveUpdateCadence}
                            name="updateCadence"
                          >
                            <option value="hourly">hourly</option>
                            <option value="daily">daily</option>
                            <option value="weekly">weekly</option>
                            <option value="manual">manual</option>
                          </select>
                        </div>
                        <input
                          className="rounded-md border border-[var(--line)] px-2 py-1 text-xs"
                          aria-label={`${source.name} 治理备注`}
                          defaultValue={source.override.adminNote ?? ""}
                          name="adminNote"
                          placeholder="备注"
                        />
                        <button className="rounded-md border border-[var(--line)] px-2 py-1 text-xs" type="submit">
                          保存
                        </button>
                      </form>
                    </td>
                    <td className="p-3">
                      <button
                        className="rounded-md border border-[var(--line)] px-2 py-1 text-xs disabled:opacity-50"
                        disabled={!source.effectiveEnabled}
                        onClick={() => void enqueueSource(source.id)}
                        type="button"
                      >
                        同步
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {activeTab === "sync" ? (
        <section className="grid gap-4">
          <div className="rounded-lg border border-[var(--line)] bg-white/72 p-4">
            <h2 className="text-lg font-semibold">同步异常来源</h2>
            <div className="mt-3 grid gap-2">
              {syncIssues.length === 0 ? <p className="muted text-sm">最近没有来源同步异常。</p> : null}
              {syncIssues.map((source) => (
                <div className="rounded-lg border border-[var(--line)] bg-white/75 p-3" key={source.id}>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <strong>{source.name}</strong>
                    <span className={`rounded-md border px-2 py-1 text-xs ${badgeClass(source.healthStatus)}`}>
                      {statusLabel(source.healthStatus)}
                    </span>
                  </div>
                  <p className="muted mt-1 text-xs">
                    run={source.stats.runCount} failed={source.stats.failedRunCount} rate=
                    {Math.round(source.stats.failureRate * 100)}%
                  </p>
                  {source.stats.latestError ? <p className="mt-2 text-sm text-rose-700">{source.stats.latestError}</p> : null}
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-lg border border-[var(--line)] bg-white/72 p-4">
            <h2 className="text-lg font-semibold">最近查询日志</h2>
            <div className="mt-3 grid gap-2">
              {queryLogs.map((item) => (
                <details className="rounded-lg border border-[var(--line)] bg-white/75 p-3" key={item.id}>
                  <summary className="cursor-pointer">
                    <span className={`mr-2 rounded-md border px-2 py-1 text-xs ${badgeClass(item.status)}`}>
                      {statusLabel(item.status)}
                    </span>
                    {item.query}
                  </summary>
                  <div className="muted mt-3 grid gap-1 text-xs">
                    <span>requestId={item.requestId}</span>
                    <span>
                      sources={item.sourceCount} official={item.officialSourceCount} community={item.communitySourceCount}
                    </span>
                    <span>
                      event={item.gatewayEvent} duration={item.durationMs ?? "-"}ms error={item.errorCode ?? "-"}
                    </span>
                    <span>{formatTime(item.createdAt)}</span>
                    {item.answerSummary ? <p className="text-[var(--ink)]">{item.answerSummary}</p> : null}
                  </div>
                </details>
              ))}
            </div>
          </div>
        </section>
      ) : null}

      {activeTab === "feedback" ? (
        <section className="grid gap-4">
          <div className="flex flex-wrap gap-3">
            <select aria-label="按反馈状态筛选" className="rounded-lg border border-[var(--line)] bg-white/80 px-3 py-2 text-sm" onChange={(event) => setFeedbackStatus(event.target.value)} value={feedbackStatus}>
              <option value="">全部反馈状态</option>
              <option value="new">新反馈</option>
              <option value="reviewing">处理中</option>
              <option value="resolved">已处理</option>
              <option value="dismissed">已忽略</option>
            </select>
            <select aria-label="按反馈评分筛选" className="rounded-lg border border-[var(--line)] bg-white/80 px-3 py-2 text-sm" onChange={(event) => setFeedbackRating(event.target.value)} value={feedbackRating}>
              <option value="">全部评分</option>
              <option value="up">有帮助</option>
              <option value="down">无帮助</option>
            </select>
          </div>
          <div className="grid gap-3">
            {feedback.map((item) => (
              <details className="rounded-lg border border-[var(--line)] bg-white/72 p-4" key={item.id}>
                <summary className="cursor-pointer">
                  <span className={`mr-2 rounded-md border px-2 py-1 text-xs ${badgeClass(item.status)}`}>
                    {statusLabel(item.status)}
                  </span>
                  {item.rating === "up" ? "有帮助" : "无帮助"} · {item.query}
                </summary>
                <div className="mt-4 grid gap-3">
                  <p className="muted text-sm">{item.reason ?? "无反馈原因"}</p>
                  {item.answerSummary ? <p className="rounded-lg bg-white/80 p-3 text-sm">{item.answerSummary}</p> : null}
                  <div className="grid gap-1 text-xs">
                    {item.sourceSnapshot.map((source) => (
                      <span className="muted" key={source.id}>
                        {source.type} · {source.sourceName} · {source.title}
                      </span>
                    ))}
                  </div>
                  <form className="grid gap-2 md:grid-cols-[180px_1fr_96px]" onSubmit={(event) => void updateFeedback(event, item.id)}>
                    <select aria-label="反馈处理状态" className="rounded-md border border-[var(--line)] px-2 py-2 text-sm" defaultValue={item.status} name="status">
                      <option value="new">new</option>
                      <option value="reviewing">reviewing</option>
                      <option value="resolved">resolved</option>
                      <option value="dismissed">dismissed</option>
                    </select>
                    <input aria-label="反馈处理备注" className="rounded-md border border-[var(--line)] px-2 py-2 text-sm" defaultValue={item.adminNote ?? ""} name="adminNote" placeholder="处理备注" />
                    <button className="rounded-md border border-[var(--line)] px-2 py-2 text-sm" type="submit">
                      保存
                    </button>
                  </form>
                </div>
              </details>
            ))}
          </div>
        </section>
      ) : null}

      {activeTab === "community" ? (
        <section className="grid gap-4">
          <select aria-label="按社区审核状态筛选" className="w-fit rounded-lg border border-[var(--line)] bg-white/80 px-3 py-2 text-sm" onChange={(event) => setCommunityStatus(event.target.value)} value={communityStatus}>
            <option value="">全部审核状态</option>
            <option value="pending">待审核</option>
            <option value="approved">可回答</option>
            <option value="supplemental">仅补充</option>
            <option value="rejected">已拒绝</option>
          </select>
          <div className="grid gap-3">
            {communityReview.map((item) => (
              <div className="rounded-lg border border-[var(--line)] bg-white/72 p-4" key={item.id}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold">{item.title ?? item.canonicalUrl}</p>
                    <p className="muted mt-1 text-xs">
                      {item.sourceName ?? item.sourceId} · {item.canonicalUrl}
                    </p>
                  </div>
                  <span className={`rounded-md border px-2 py-1 text-xs ${badgeClass(item.status)}`}>
                    {statusLabel(item.status)}
                  </span>
                </div>
                <form className="mt-4 grid gap-2 md:grid-cols-[160px_140px_1fr_96px]" onSubmit={(event) => void updateCommunityReview(event, item.id)}>
                  <select aria-label="社区审核状态" className="rounded-md border border-[var(--line)] px-2 py-2 text-sm" defaultValue={item.status} name="status">
                    <option value="pending">pending</option>
                    <option value="approved">approved</option>
                    <option value="supplemental">supplemental</option>
                    <option value="rejected">rejected</option>
                  </select>
                  <select aria-label="社区审核风险级别" className="rounded-md border border-[var(--line)] px-2 py-2 text-sm" defaultValue={item.riskLevel} name="riskLevel">
                    <option value="low">low</option>
                    <option value="medium">medium</option>
                    <option value="high">high</option>
                  </select>
                  <input aria-label="社区审核原因" className="rounded-md border border-[var(--line)] px-2 py-2 text-sm" defaultValue={item.reason ?? ""} name="reason" placeholder="审核原因" />
                  <button className="rounded-md border border-[var(--line)] px-2 py-2 text-sm" type="submit">
                    保存
                  </button>
                </form>
              </div>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}
