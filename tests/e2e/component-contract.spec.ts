import { expect, test } from "@playwright/test";

const hitQuery = "图书馆借书";
const emptyQuery = "明天校园集市几点开始";

test("core search controls expose stable labels and states", async ({ page }) => {
  await page.goto("/");

  const input = page.getByLabel("输入校园问题");
  const submit = page.getByRole("button", { name: "开始检索" });

  await expect(input).toBeVisible();
  await expect(submit).toBeDisabled();
  await input.fill(hitQuery);
  await expect(submit).toBeEnabled();
});

test("theme toggle applies and persists dark mode", async ({ page }) => {
  await page.goto("/");

  await page.getByRole("button", { name: "切换到暗色模式" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");

  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.getByRole("button", { name: "切换到浅色模式" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
});

test("result toolbar and source cards keep the filter/view contract", async ({ page }) => {
  await page.goto(`/search?q=${encodeURIComponent(hitQuery)}`);

  await expect(page.getByRole("button", { name: "全部" })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("button", { name: "仅官方" })).toBeVisible();
  await expect(page.getByRole("button", { name: "仅社区" })).toBeVisible();
  await expect(page.getByRole("button", { name: "回答" })).toHaveAttribute("aria-pressed", "true");

  await page.getByRole("button", { name: "检索结果" }).click();
  await expect(page.getByRole("button", { name: "检索结果" })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByText(/当前展示 \d+ \/ \d+ 条来源/)).toBeVisible();
  await expect(page.getByTestId("source-card").first()).toBeVisible();
  await expect(page.getByRole("button", { name: "展开片段" }).first()).toBeVisible();
});

test("empty and error states remain distinct user-facing contracts", async ({ page }) => {
  await page.goto(`/search?q=${encodeURIComponent(emptyQuery)}`);
  await expect(page.getByText("无答案兜底")).toBeVisible();
  await expect(page.getByRole("heading", { name: "暂未找到足够可靠的信息" }).last()).toBeVisible();

  await page.route("**/api/search**", async (route) => {
    await route.fulfill({
      status: 500,
      contentType: "application/json",
      body: JSON.stringify({ error: "forced component-contract failure" }),
    });
  });

  await page.goto(`/search?q=${encodeURIComponent(hitQuery)}`);
  await expect(page.getByRole("heading", { exact: true, name: "本次检索未成功完成" })).toBeVisible();
  await expect(page.getByText("失败态不会伪装成“无答案”。")).toBeVisible();
});
