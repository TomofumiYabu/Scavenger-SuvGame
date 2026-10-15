import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

async function move(page: Page, coordinate: string): Promise<void> {
  await page
    .getByRole("button", { name: new RegExp(`^${coordinate} `) })
    .click();
  await page.getByRole("button", { name: "ここへ移動" }).click();
  await expect(page.getByTestId("position")).toHaveText(coordinate);
}

test("探索、移動、アイテム使用、自動保存からの復元", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toContainText(
    "あなたは、まだ。",
  );
  await expect(page.getByTestId("position")).toHaveText("B6");
  await page.getByRole("button", { name: "周囲を探索する" }).click();
  await expect(page.getByTestId("item-water")).toHaveText("×3");
  await expect(page.getByRole("button", { name: /^探索済み/ })).toBeDisabled();
  await move(page, "B5");
  await page.getByRole("button", { name: "飲料水を使う" }).click();
  await expect(page.getByTestId("item-water")).toHaveText("×2");
  await expect(page.getByTestId("remaining")).toHaveText("45");
  await page.reload();
  await expect(page.getByTestId("position")).toHaveText("B5");
  await expect(page.getByTestId("remaining")).toHaveText("45");
  await expect(page.getByTestId("item-water")).toHaveText("×2");
  expect(errors).toEqual([]);
});

test("UIから資源を集めて脱出し、終了状態も保存する", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "周囲を探索する" }).click();
  await move(page, "B5");
  await page.getByRole("button", { name: "周囲を探索する" }).click();
  await move(page, "C5");
  await page.getByRole("button", { name: "周囲を探索する" }).click();
  await expect(page.getByTestId("item-scrap")).toHaveText("×3");
  await page.getByRole("button", { name: "飲料水を使う" }).click();
  await page.getByRole("button", { name: "保存食を使う" }).click();
  await page.getByRole("button", { name: "休息する" }).click();
  for (const coordinate of ["C4", "C3", "C2", "D2", "E2", "F2", "F1", "G1"])
    await move(page, coordinate);
  await page.getByRole("button", { name: "救難信号を送る" }).click();
  await expect(
    page.getByRole("heading", { name: "その声は、届いた。" }),
  ).toBeVisible();
  await expect(page.getByTestId("item-scrap")).toHaveText("×0");
  await expect(page.getByRole("button", { name: "休息する" })).toBeDisabled();
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "その声は、届いた。" }),
  ).toBeVisible();
});

test("新しい探索の確認をキャンセルでき、承認時だけリセットする", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "周囲を探索する" }).click();
  await page.getByRole("button", { name: "新しい探索", exact: true }).click();
  await page.getByRole("button", { name: "キャンセル" }).click();
  await expect(page.getByTestId("remaining")).toHaveText("47");
  await page.getByRole("button", { name: "新しい探索", exact: true }).click();
  await page.getByRole("button", { name: "新しい探索を始める" }).click();
  await expect(page.getByTestId("remaining")).toHaveText("48");
  await expect(page.getByTestId("item-water")).toHaveText("×2");
  await page.reload();
  await expect(page.getByTestId("remaining")).toHaveText("48");
});

test("破損したセーブから安全に再開する", async ({ page }) => {
  await page.addInitScript(() =>
    localStorage.setItem("afterlight.save.v1", "{broken"),
  );
  await page.goto("/");
  await expect(page.getByRole("status")).toContainText(
    "保存データを読み込めなかった",
  );
  await page.getByRole("button", { name: "周囲を探索する" }).click();
  await expect(page.getByTestId("remaining")).toHaveText("47");
});

test("ストレージ禁止でも通知してプレイを継続する", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, "localStorage", {
      get() {
        throw new DOMException("Blocked", "SecurityError");
      },
    });
  });
  await page.goto("/");
  await expect(page.getByRole("status")).toContainText("保存できません");
  await page.getByRole("button", { name: "周囲を探索する" }).click();
  await expect(page.getByTestId("remaining")).toHaveText("47");
  await expect(page.getByRole("status")).toContainText(
    "自動保存できませんでした",
  );
});

test("スマートフォン幅で横スクロールせず移動と探索ができる", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await move(page, "C6");
  await page.getByRole("button", { name: "周囲を探索する" }).click();
  await expect(page.getByTestId("item-scrap")).toHaveText("×1");
  await page.screenshot({ path: "test-results/mobile.png", fullPage: true });
});

test("キーボード操作でヘルプを開閉できる", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "遊び方" }).focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await expect(page.getByRole("button", { name: "遊び方" })).toBeFocused();
  await page.screenshot({ path: "test-results/desktop.png", fullPage: true });
});
