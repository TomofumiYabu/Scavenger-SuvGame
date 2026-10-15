import { expect, test } from "@playwright/test";

test("静的ホストのサブディレクトリでも全アセットが読み込まれ、操作できる", async ({ page }) => {
  const errors: string[] = [];
  const requests: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  page.on("response", response => {
    if (response.status() >= 400) errors.push(`${response.status()} ${response.url()}`);
  });
  page.on("requestfailed", request => errors.push(request.url()));
  page.on("request", request => requests.push(request.url()));
  await page.goto("http://127.0.0.1:4174/Scavenger-SuvGame/");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await page.getByRole("button", { name: "周囲を探索する" }).click();
  await expect(page.getByTestId("remaining")).toHaveText("47");
  expect(await page.locator(".map-grid").evaluate(element => getComputedStyle(element).display)).toBe("grid");
  expect(requests.some(url => url.endsWith(".js"))).toBe(true);
  expect(requests.some(url => url.endsWith(".css"))).toBe(true);
  expect(requests.every(url => url.startsWith("http://127.0.0.1:4174/Scavenger-SuvGame/"))).toBe(true);
  expect(errors).toEqual([]);
});

test("320px幅でも目標と操作が表示され、横にはみ出さない", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 740 });
  await page.goto("/");
  await expect(page.locator(".mobile-mission")).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole("button", { name: "周囲を探索する" }).click();
  await expect(page.getByTestId("remaining")).toHaveText("47");
});
