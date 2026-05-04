import { expect, test } from "@playwright/test";

const hitQuery = "图书馆借书";
const emptyQuery = "明天校园集市几点开始";

test("home search reaches an answer-backed results page", async ({ page }) => {
  await page.goto("/");

  await expect(page).toHaveTitle(/校园信息检索/);
  await page.getByLabel("输入校园问题").fill(hitQuery);
  await page.getByRole("button", { name: "开始检索" }).click();

  await expect(page).toHaveURL(/\/search\?q=/);
  await expect(page.getByRole("heading", { name: hitQuery })).toBeVisible();
  await expect(page.getByText("回答摘要")).toBeVisible();
  await expect(page.getByText("引用来源")).toBeVisible();
  await expect.poll(() => page.getByTestId("source-card").count()).toBeGreaterThan(0);
});

test("results page supports retrieval view and source expansion", async ({ page }) => {
  await page.goto(`/search?q=${encodeURIComponent(hitQuery)}`);

  await expect(page.getByText("回答摘要")).toBeVisible();
  await page.getByRole("button", { name: "检索结果" }).click();
  await expect(page.getByRole("heading", { name: "命中原始片段" })).toBeVisible();

  const expandButtons = page.getByRole("button", { name: "展开片段" });
  await expect(expandButtons.first()).toBeVisible();
  await expandButtons.first().click();
  await expect(page.getByRole("button", { name: "收起片段" }).first()).toBeVisible();
});

test("empty query result does not fabricate an answer", async ({ page }) => {
  await page.goto(`/search?q=${encodeURIComponent(emptyQuery)}`);

  await expect(page.getByText("当前没有足够高质量的来源")).toBeVisible();
  await expect(page.getByText("没有可靠来源时不会强行生成答案。")).toBeVisible();
});

test("search request failures render the explicit error state", async ({ page }) => {
  await page.route("**/api/search**", async (route) => {
    await route.fulfill({
      status: 500,
      contentType: "application/json",
      body: JSON.stringify({ error: "forced e2e failure" }),
    });
  });

  await page.goto(`/search?q=${encodeURIComponent(hitQuery)}`);

  await expect(page.getByRole("heading", { exact: true, name: "本次检索未成功完成" })).toBeVisible();
  await expect(page.getByText("失败态不会伪装成“无答案”。")).toBeVisible();
});
