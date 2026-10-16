import { expect, test } from "@playwright/test";
import { newGame } from "../src/game/engine";
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
  await page.getByRole("button", { name: "何も取らず立ち去る" }).click();
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
  await page.getByRole("button", { name: "何も取らず立ち去る" }).click();
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


test("六角形の斜め移動と非隣接拒否をキーボードで操作し復元する", async ({ page }) => {
  await page.goto("/");
  // B6 (odd row) shares an upper-right edge with C5.
  await page.getByRole("button", { name: /^C5 / }).focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("button", { name: /^C5 / })).toBeFocused();
  await page.getByRole("button", { name: "ここへ移動" }).focus();
  await page.keyboard.press("Space");
  await expect(page.getByTestId("position")).toHaveText("C5");
  await expect(page.getByTestId("remaining")).toHaveText("47");
  // B6 remains visible, but C4 does not share an edge with it.
  await move(page, "C4");
  await page.getByRole("button", { name: /^B6 / }).click();
  await expect(page.getByRole("button", { name: "ここへ移動" })).toBeDisabled();
  await expect(page.getByText("隣接する地点から移動してください")).toBeVisible();
  await expect(page.getByTestId("remaining")).toHaveText("46");
  await page.reload();
  await expect(page.getByTestId("position")).toHaveText("C4");
  await expect(page.getByTestId("remaining")).toHaveText("46");
});

test("旧v1セーブの進行を保ち新たな六角形隣接から移動できる", async ({ page }) => {
  await page.addInitScript(() => {
    if (localStorage.getItem("afterlight.save.v1")) return;
    localStorage.setItem("afterlight.save.v1", JSON.stringify({
      version: 1, turn: 9, position: 36, health: 82, hunger: 53, thirst: 42, energy: 61,
      inventory: { water: 4, food: 1, bandage: 2, scrap: 2 },
      discovered: [29, 35, 36, 37, 43], searched: [36, 29], rng: 12345,
      status: "active", log: [{ turn: 9, text: "以前の探索記録", kind: "info" }],
    }));
  });
  await page.goto("/");
  await expect(page.getByTestId("remaining")).toHaveText("39");
  await expect(page.getByTestId("health")).toContainText("82");
  await expect(page.getByText("以前の探索記録")).toBeVisible();
  await expect(page.getByRole("button", { name: /^B5 .*探索済み/ })).toBeEnabled();
  await move(page, "C5");
  await expect(page.getByTestId("item-scrap")).toHaveText("×2");
  await page.reload();
  await expect(page.getByTestId("position")).toHaveText("C5");
  await expect(page.getByTestId("remaining")).toHaveText("38");
});

for (const width of [320, 390]) test(`六角形の辺と行オフセットが一致し${width}px幅で収まる`, async ({ page }) => {
  await page.setViewportSize({ width, height: 844 });
  await page.goto("/");
  const geometry = await page.locator(".map-grid").evaluate(grid => {
    const buttons = [...grid.querySelectorAll<HTMLButtonElement>("button")];
    const rects = buttons.map(button => button.getBoundingClientRect());
    const bounds = grid.getBoundingClientRect();
    const stepX = rects[1]!.x - rects[0]!.x;
    const stepY = rects[7]!.y - rects[0]!.y;
    return {
      count: buttons.length,
      offset: (rects[7]!.x - rects[0]!.x) / stepX,
      ratio: stepY / stepX,
      inside: rects.every(rect => rect.left >= bounds.left && rect.right <= bounds.right + 1 && rect.bottom <= bounds.bottom + 1),
      clipped: getComputedStyle(buttons[36]!).clipPath.startsWith("polygon"),
      centersHit: buttons.every((button, index) => {
        const rect = rects[index]!;
        const hit = document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2);
        return hit?.closest("button") === button;
      }),
      overflow: document.documentElement.scrollWidth > innerWidth,
    };
  });
  expect(geometry.count).toBe(49);
  expect(geometry.offset).toBeCloseTo(0.5, 2);
  expect(geometry.ratio).toBeCloseTo(Math.sqrt(3) / 2, 2);
  expect(geometry.inside).toBe(true);
  expect(geometry.clipped).toBe(true);
  expect(geometry.overflow).toBe(false);
  expect(geometry.centersHit).toBe(true);
  await move(page, "C5");
  await page.keyboard.press("Tab");
  await page.getByRole("button", { name: /^C5 / }).focus();
  expect(await page.locator('[data-tile="30"] .hex-outline').evaluate(element => getComputedStyle(element).strokeDasharray)).not.toBe("none");
  await page.screenshot({ path: `test-results/hex-${width}.png`, fullPage: true });
});


test("行動の理由と回復・消費を示し、キーボード使用後も更新する", async ({ page }) => {
  const saved = newGame();
  saved.energy = 5;
  saved.thirst = 90;
  saved.inventory.bandage = 0;
  await page.addInitScript(saved => localStorage.setItem("afterlight.save.v1", JSON.stringify(saved)), saved);
  await page.goto("/");
  const search = page.getByRole("button", { name: "周囲を探索する" });
  await expect(search).toBeDisabled();
  await expect(search).toHaveAccessibleDescription(/必要 10/);
  await expect(page.locator("#guide-search .action-reason")).toBeVisible();
  const bandage = page.getByRole("button", { name: "包帯を使う" });
  await expect(bandage).toBeDisabled();
  await expect(bandage).toHaveAccessibleDescription(/所持 0個/);
  await expect(page.locator("#guide-use-bandage .action-reason")).toBeVisible();
  const water = page.getByRole("button", { name: "飲料水を使う" });
  await expect(water).toHaveAccessibleDescription(/1時間.*水分 −2.*実回復 \+10/);
  await expect(page.locator("#guide-rest")).toContainText("体力 +8");
  await water.focus();
  await page.keyboard.press("Enter");
  await expect(water).toBeFocused();
  await expect(page.getByTestId("thirst")).toContainText("98");
  await expect(page.getByTestId("hunger")).toContainText("79");
  await expect(page.getByTestId("item-water")).toHaveText("×1");
  await expect(water).toHaveAccessibleDescription(/実回復 \+2/);
  await page.getByRole("button", { name: /^C5 / }).click();
  const moveButton = page.getByRole("button", { name: "ここへ移動" });
  await expect(moveButton).toBeDisabled();
  await expect(moveButton).toHaveAccessibleDescription(/必要 6/);
});

test("最後の送信に消費と危険を示し、死亡後は終了理由を表示する", async ({ page }) => {
  const saved = newGame();
  saved.position = 6; saved.turn = 47; saved.health = 12; saved.hunger = 3;
  saved.inventory.scrap = 3;
  saved.discovered.push(6);
  await page.addInitScript(saved => localStorage.setItem("afterlight.save.v1", JSON.stringify(saved)), saved);
  await page.goto("/");
  const signal = page.getByRole("button", { name: "救難信号を送る" });
  await expect(signal).toHaveAccessibleDescription(/スクラップ 3個.*満腹度 −3.*水分 −4.*送信しても脱出できません/);
  await expect(page.locator("#guide-rest")).toContainText("体力が尽きます");
  await signal.click();
  await expect(page.getByRole("heading", { name: "街は、再び静かになった。" })).toBeVisible();
  for (const button of [signal, page.getByRole("button", { name: "休息する" }), page.getByRole("button", { name: "飲料水を使う" })]) {
    await expect(button).toBeDisabled();
    await expect(button).toHaveAccessibleDescription(/探索は終了しています/);
  }
  await expect(page.locator("#guide-signal .action-reason")).toBeVisible();
});

for (const width of [320, 390]) test(`危険と行動不能の説明が${width}pxで収まり読める`, async ({ page }) => {
  const saved = newGame();
  saved.position = 0; saved.health = 20; saved.hunger = 5; saved.thirst = 6;
  saved.inventory.food = 0;
  saved.discovered.push(0);
  await page.setViewportSize({ width, height: 844 });
  await page.addInitScript(saved => localStorage.setItem("afterlight.save.v1", JSON.stringify(saved)), saved);
  await page.goto("/");
  await expect(page.locator("#guide-search")).toContainText("負傷する可能性");
  await expect(page.locator("#guide-search")).toContainText("体力が尽きます");
  await expect(page.getByRole("button", { name: "保存食を使う" })).toHaveAccessibleDescription(/所持 0個/);
  const layout = await page.locator(".action-details").evaluateAll(elements => ({
    inside: elements.every(element => { const r = element.getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth; }),
    readable: elements.every(element => parseFloat(getComputedStyle(element).fontSize) >= 11),
    overflow: document.documentElement.scrollWidth > innerWidth,
  }));
  expect(layout).toEqual({ inside: true, readable: true, overflow: false });
  await page.screenshot({ path: `test-results/guidance-${width}.png`, fullPage: true });
});

for (const width of [320, 390]) test(`備蓄庫の選択と再読込・キーボード・結果が${width}pxで使える`, async ({ page }) => {
  await page.setViewportSize({ width, height: 844 });
  await page.goto("/"); await move(page, "B5");
  const title = page.getByRole("heading", { name: "崩れた備蓄庫" });
  await expect(title).toBeFocused();
  await expect(page.getByRole("button", { name: "周囲を探索する" })).toHaveAccessibleDescription(/選択を先に/);
  await expect(page.getByRole("button", { name: "飲料水を使う" })).toBeDisabled();
  const safe = page.getByRole("button", { name: "入口の箱を回収する" });
  await expect(safe).toHaveAccessibleDescription(/1時間.*気力 −4.*飲料水 \+1個.*保存食 \+1個/);
  await expect(page.getByRole("button", { name: "棚の奥まで踏み込む" })).toHaveAccessibleDescription(/負傷する可能性/);
  await page.reload(); await expect(title).toBeFocused();
  await expect(page.getByTestId("remaining")).toHaveText("47");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: `test-results/event-${width}.png`, fullPage: true });
  await safe.focus(); await page.keyboard.press("Enter");
  await expect(page.getByRole("heading", { name: "探索の記録" })).toBeFocused();
  await expect(page.getByText("入口の箱から飲料水 ×1、保存食 ×1を回収した。", { exact: true })).toBeVisible();
  await expect(page.getByTestId("remaining")).toHaveText("46");
  await expect(page.getByTestId("item-water")).toHaveText("×3");
  await page.reload(); await expect(title).toHaveCount(0);
  await expect(page.getByTestId("remaining")).toHaveText("46");
  await move(page, "B6"); await move(page, "B5"); await expect(title).toHaveCount(0);
});

test("未来の主保存は旧保存があっても保護し、通常プレイと再読込で原文を変えない", async ({ page }) => {
  const original = '{ "version": 87, "progress": "do not lose" }';
  await page.addInitScript(({ original, legacy }) => {
    if (localStorage.getItem("afterlight.save.v2") === null) localStorage.setItem("afterlight.save.v2", original);
    localStorage.setItem("afterlight.save.v1", legacy);
  }, { original, legacy: JSON.stringify({ ...newGame(), version: 1, turn: 10 }) });
  await page.goto("/");
  await expect(page.getByRole("status")).toContainText("対応していません");
  await expect(page.getByTestId("remaining")).toHaveText("48");
  await page.getByRole("button", { name: "周囲を探索する" }).click();
  expect(await page.evaluate(() => localStorage.getItem("afterlight.save.v2"))).toBe(original);
  await page.reload(); await expect(page.getByTestId("remaining")).toHaveText("48");
  expect(await page.evaluate(() => localStorage.getItem("afterlight.save.v2"))).toBe(original);
  await page.getByRole("button", { name: "新しい探索", exact: true }).click();
  await expect(page.getByRole("dialog")).toContainText("元のデータ");
  await page.getByRole("button", { name: "新しい探索を始める" }).click();
  expect(await page.evaluate(() => localStorage.getItem("afterlight.save.v2.original.0"))).toBe(original);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("afterlight.save.v2")!).version)).toBe(2);
});

test("旧保存は移行後も原文を保持し、直前の保存を確認して復旧する", async ({ page }) => {
  const legacy = JSON.stringify({ ...newGame(), version: 1, turn: 9 }, null, 2);
  await page.addInitScript(legacy => {
    if (!localStorage.getItem("afterlight.save.v1")) localStorage.setItem("afterlight.save.v1", legacy);
  }, legacy);
  await page.goto("/");
  await expect(page.getByTestId("remaining")).toHaveText("39");
  expect(await page.evaluate(() => localStorage.getItem("afterlight.save.v2"))).toBeNull();
  await page.getByRole("button", { name: "周囲を探索する" }).click();
  await page.getByRole("button", { name: "飲料水を使う" }).click();
  await expect(page.getByTestId("remaining")).toHaveText("37");
  expect(await page.evaluate(() => localStorage.getItem("afterlight.save.v1"))).toBe(legacy);
  await page.getByText("保存の確認・復旧", { exact: true }).click();
  await page.getByRole("button", { name: "ひとつ前の保存に戻す" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.getByRole("button", { name: "キャンセル" }).click();
  await expect(page.getByTestId("remaining")).toHaveText("37");
  await page.getByRole("button", { name: "ひとつ前の保存に戻す" }).click();
  await page.getByRole("button", { name: "保存を戻す", exact: true }).click();
  await expect(page.getByTestId("remaining")).toHaveText("38");
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("afterlight.save.v2.original.0")!).turn)).toBe(11);
  await page.reload(); await expect(page.getByTestId("remaining")).toHaveText("38");
  expect(await page.evaluate(() => localStorage.getItem("afterlight.save.v1"))).toBe(legacy);
});

test("バックアップ容量エラーで主保存を保護し、再読込で最後の保存へ戻る", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "周囲を探索する" }).click();
  const original = await page.evaluate(() => localStorage.getItem("afterlight.save.v2"));
  await page.evaluate(() => {
    const write = Storage.prototype.setItem;
    Storage.prototype.setItem = function(key, value) {
      if (key === "afterlight.save.v2.backup") throw new DOMException("quota", "QuotaExceededError");
      return write.call(this, key, value);
    };
  });
  await page.getByRole("button", { name: "飲料水を使う" }).click();
  await expect(page.getByRole("status")).toContainText("自動保存できませんでした");
  await expect(page.getByTestId("remaining")).toHaveText("46");
  expect(await page.evaluate(() => localStorage.getItem("afterlight.save.v2"))).toBe(original);
  await page.reload(); await expect(page.getByTestId("remaining")).toHaveText("47");
});

test("原文を退避できないリセットは元の保存を置き換えない", async ({ page }) => {
  const original = "{original-broken";
  await page.addInitScript(original => {
    localStorage.setItem("afterlight.save.v2", original);
    const write = Storage.prototype.setItem;
    Storage.prototype.setItem = function(key, value) {
      if (key.startsWith("afterlight.save.v2.original.")) throw new DOMException("quota", "QuotaExceededError");
      return write.call(this, key, value);
    };
  }, original);
  await page.goto("/");
  await page.getByRole("button", { name: "新しい探索", exact: true }).click();
  await page.getByRole("button", { name: "新しい探索を始める" }).click();
  await expect(page.getByRole("status")).toContainText("保存の切り替えを確認できませんでした");
  await page.getByRole("button", { name: "周囲を探索する" }).click();
  expect(await page.evaluate(() => localStorage.getItem("afterlight.save.v2"))).toBe(original);
});
