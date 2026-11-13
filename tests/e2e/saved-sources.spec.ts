import { expect, test } from "@playwright/test";

const title = "图书馆借阅规则";
const originalUrl = "https://library.example.edu/borrow/raw";
const canonicalUrl = "https://library.example.edu/borrow";

test("saves a search source locally and opens it from the home page after reload", async ({ page }) => {
  await page.context().route("https://library.example.edu/**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "text/html; charset=utf-8",
      body: "<!doctype html><html><head><title>图书馆原文</title></head><body><h1>图书馆原文</h1></body></html>",
    });
  });
  await page.route("**/api/search**", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        query: "图书馆借书",
        status: "ok",
        answer: {
          summary: "学生可查看图书馆借阅规则。",
          sourceNote: "依据图书馆公开页面。",
          disclaimer: "请以来源原文为准。",
          confidence: 0.9,
        },
        sources: [
          {
            id: "saved-source-e2e",
            title,
            type: "official",
            sourceName: "校园图书馆",
            publishedAt: null,
            updatedAt: null,
            fetchedAt: "2026-11-01T00:00:00.000Z",
            lastVerifiedAt: null,
            snippet: "借阅规则见原文。",
            matchedKeywords: ["借阅"],
            url: originalUrl,
            canonicalUrl,
            freshnessLabel: "recent",
          },
        ],
        relatedQuestions: [],
        retrievedCount: 1,
        resultGeneratedAt: "2026-11-01T00:00:00.000Z",
      }),
    });
  });

  await page.goto("/search?q=%E5%9B%BE%E4%B9%A6%E9%A6%86%E5%80%9F%E4%B9%A6");
  await page.getByRole("button", { name: `收藏：${title}` }).click();
  await expect(page.getByRole("button", { name: `取消收藏：${title}` })).toBeVisible();

  await page.goto("/");
  await page.reload();
  const panel = page.getByRole("region", { name: "已收藏来源" });
  await expect(panel.getByText(title)).toBeVisible();
  await expect(panel.getByText("校园图书馆")).toBeVisible();
  const link = panel.getByRole("link", { name: `打开来源：${title}` });
  await expect(link).toHaveAttribute("href", canonicalUrl);
  const popupPromise = page.waitForEvent("popup");
  await link.click();
  const popup = await popupPromise;
  await popup.waitForLoadState("domcontentloaded");
  await expect(popup).toHaveURL(canonicalUrl);
  await expect(popup.getByRole("heading", { name: "图书馆原文" })).toBeVisible();
});
