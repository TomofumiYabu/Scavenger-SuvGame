import { expect, test } from "@playwright/test";
import type { Locator, Page } from "@playwright/test";
import { act, newGame } from "../src/game/engine";
import { neighbors } from "../src/game/model";
import type { GameState } from "../src/game/model";

async function seed(page: Page, state: GameState): Promise<void> {
  await page.addInitScript(state => {
    if (!localStorage.getItem("afterlight.save.v2")) localStorage.setItem("afterlight.save.v2", JSON.stringify(state));
  }, state);
}
function pending(id: "collapsed-cache" | "clinic-supplies" | "shelter-embers"): GameState {
  const state = newGame();
  state.position = id === "collapsed-cache" ? 29 : id === "clinic-supplies" ? 40 : 36;
  state.discovered = [state.position, ...neighbors(state.position)];
  state.pendingEvent = { id, tile: state.position };
  return state;
}
async function visibleInViewport(locator: Locator): Promise<void> {
  const box = await locator.boundingBox();
  expect(box).not.toBeNull();
  expect(box!.y).toBeGreaterThanOrEqual(-1);
  expect(box!.y + box!.height).toBeLessThanOrEqual(await locator.page().evaluate(() => innerHeight + 1));
}
async function storage(page: Page): Promise<Record<string, string>> {
  return page.evaluate(() => Object.fromEntries(Object.entries(localStorage)));
}

for (const width of [320, 390, 1280]) {
  test(`選択→実際の結果→現在地→次の移動を${width}pxで読んで操作する`, async ({ browser }) => {
    const context = await browser.newContext({ viewport: { width, height: 900 }, hasTouch: true });
    const page = await context.newPage();
    await seed(page, pending("collapsed-cache"));
    await page.goto("/");
    await expect(page.locator("#event-title")).toBeFocused();
    // Previewing another tile must not send "return to map" to that selection.
    await page.locator('[data-tile="36"]').click();
    const choice = page.getByRole("button", { name: "入口の箱を調べる" });
    if (width === 320) await choice.tap();
    else if (width === 390) await choice.click();
    else { await choice.focus(); await page.keyboard.press("Enter"); }
    await expect(page.locator("#outcome-title")).toBeFocused();
    await visibleInViewport(page.locator("#outcome-title"));
    const panel = page.locator(".outcome-panel");
    await expect(panel).toContainText("選んだ行動：入口の箱を調べる");
    await expect(panel).toContainText("経過時間：1時間");
    await expect(panel).toContainText("気力 −4（85 → 81）");
    await expect(panel).toContainText("飲料水 +1個（0 → 1）");
    await expect(panel).toContainText("所持品：変化なし");
    await expect(page.getByTestId("item-water")).toHaveText("×2");
    await panel.screenshot({ path: `test-results/result-panel-${width}.png` });
    await page.screenshot({ path: `test-results/result-page-${width}.png`, fullPage: true });
    const saved = await storage(page);
    if (width === 320) await page.getByRole("button", { name: "マップへ戻る" }).tap();
    else { await page.getByRole("button", { name: "マップへ戻る" }).focus(); await page.keyboard.press("Enter"); }
    const current = page.locator('[data-tile="29"]');
    await expect(current).toBeFocused(); await expect(current).toHaveAttribute("aria-pressed", "true");
    await visibleInViewport(current);
    expect(await storage(page)).toEqual(saved);
    await page.screenshot({ path: `test-results/returned-map-${width}.png` });
    await page.locator('[data-tile="30"]').click();
    await page.getByRole("button", { name: "ここへ移動" }).click();
    await expect(page.getByTestId("position")).toHaveText("C5");
    await expect(panel).toHaveCount(0);
    await expect(page.locator(".location-actions")).toBeFocused();
    const focusedBox = await page.locator(".location-actions").boundingBox();
    expect(focusedBox!.y).toBeLessThan(900); expect(focusedBox!.y + focusedBox!.height).toBeGreaterThan(0);
    await expect(page.getByTestId("remaining")).toHaveText("46");
    await page.reload(); await expect(panel).toHaveCount(0);
    await context.close();
  });
}

test("12件の記録がある0時間の立ち去りは回復・消費・負傷を主張しない", async ({ page }) => {
  const state = pending("collapsed-cache"); state.hunger = 0; state.thirst = 0; state.health = 20;
  state.log = Array.from({ length: 12 }, (_, i) => ({ turn: 0, text: `以前の記録 ${i}`, kind: "info" }));
  await seed(page, state); await page.goto("/");
  await page.getByRole("button", { name: "何も取らず立ち去る" }).click();
  const panel = page.locator(".outcome-panel");
  await expect(panel).toContainText("経過時間：0時間");
  await expect(panel).toContainText("体力 ±0（20 → 20）");
  await expect(panel).toContainText("所持品：変化なし");
  await expect(panel.locator(".action-risk")).toHaveCount(0);
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem("afterlight.save.v2")!));
  expect(saved.rng).toBe(state.rng); expect(saved.turn).toBe(0); expect(saved.log).toHaveLength(12);
  expect(Object.keys(saved).sort()).toEqual(Object.keys(state).sort());
});

test("上限の実回復と空腹・渇きによる体力減少を結果に併記する", async ({ page }) => {
  const state = pending("shelter-embers"); state.health = 95; state.energy = 99; state.hunger = 1; state.thirst = 1;
  await seed(page, state); await page.goto("/");
  await page.getByRole("button", { name: "火のそばで眠る" }).click();
  const panel = page.locator(".outcome-panel");
  await expect(panel).toContainText("体力 −19（95 → 76）");
  await expect(panel).toContainText("気力 +1（99 → 100）");
  await expect(panel).toContainText("空腹で力が入らない。体力 −12。");
  await expect(panel).toContainText("ひどい渇きが体を蝕む。体力 −12。");
  await expect(panel).not.toContainText("体力 +12");
});

test("12件上限でも負傷と死亡を示し結果から終了・再開始へ進める", async ({ page }) => {
  const state = pending("collapsed-cache"); state.health = 10; state.rng = 1;
  state.log = Array.from({ length: 12 }, (_, i) => ({ turn: 0, text: `以前の記録 ${i}`, kind: "info" }));
  await seed(page, state); await page.goto("/");
  await page.getByRole("button", { name: "棚の奥まで踏み込む" }).click();
  const panel = page.locator(".outcome-panel");
  await expect(panel).toContainText("棚が崩れ、飛び散った破片で軽い負傷を負った。体力 −10。");
  await expect(panel).toContainText("体力 −10（10 → 0）");
  await expect(panel).toContainText("探索は終了しました。");
  await page.getByRole("button", { name: "終了の詳細へ" }).focus(); await page.keyboard.press("Enter");
  await expect(page.locator("#ending-title")).toBeFocused(); await visibleInViewport(page.locator("#ending-title"));
  await page.keyboard.press("Tab"); await expect(page.locator(".ending button")).toBeFocused();
  await page.keyboard.press("Enter");
  await page.keyboard.press("Escape"); await expect(page.locator(".ending button")).toBeFocused();
  await visibleInViewport(page.locator(".ending button"));
  await page.keyboard.press("Enter"); await page.getByRole("button", { name: "新しい探索を始める" }).click();
  await expect(page.locator('[data-tile="36"]')).toBeFocused();
  await expect(panel).toHaveCount(0); await expect(page.getByTestId("remaining")).toHaveText("48");
});

for (const width of [320, 1280]) test(`通常操作はDOM・操作位置・復旧の開閉状態を${width}pxで保つ`, async ({ page }) => {
  await page.setViewportSize({ width, height: 900 });
  const state = newGame(); state.inventory.water = 1;
  await seed(page, state); await page.goto("/");
  await page.locator(".recovery summary").click();
  const water = page.getByRole("button", { name: "飲料水を使う" });
  await water.scrollIntoViewIfNeeded(); await water.focus();
  const y = await page.evaluate(() => scrollY);
  await water.evaluate(element => { (window as Window & { remembered?: Element }).remembered = element; });
  await page.keyboard.press("Enter");
  await expect(page.locator("#guide-use-water")).toBeFocused();
  await visibleInViewport(page.locator("#guide-use-water"));
  expect(Math.abs(await page.evaluate(() => scrollY) - y)).toBeLessThan(3);
  expect(await water.evaluate(element => element === (window as Window & { remembered?: Element }).remembered)).toBe(true);
  await expect(page.locator(".recovery details")).toHaveAttribute("open", "");
  const rest = page.getByRole("button", { name: "休息する" });
  await rest.scrollIntoViewIfNeeded(); await rest.focus(); const restY = await page.evaluate(() => scrollY);
  await page.keyboard.press("Enter"); await expect(rest).toBeFocused();
  expect(Math.abs(await page.evaluate(() => scrollY) - restY)).toBeLessThan(3);
  const search = page.getByRole("button", { name: "手早く探す" });
  await search.focus(); const searchY = await page.evaluate(() => scrollY);
  await page.keyboard.press("Enter"); await expect(page.locator("#guide-search-quick")).toBeFocused();
  expect(Math.abs(await page.evaluate(() => scrollY) - searchY)).toBeLessThan(3);
  await visibleInViewport(page.locator("#guide-search-quick"));
  const tile = page.locator('[data-tile="30"]'); await tile.scrollIntoViewIfNeeded(); await tile.focus();
  const tileY = await page.evaluate(() => scrollY); await page.keyboard.press("Enter");
  await expect(tile).toBeFocused(); expect(Math.abs(await page.evaluate(() => scrollY) - tileY)).toBeLessThan(3);
  const saved = await storage(page);
  await page.getByRole("button", { name: "現在地に戻る" }).click();
  await expect(page.locator(".location-actions")).toBeFocused();
  expect(await storage(page)).toEqual(saved);
});

test("ヘルプ・新規探索・復旧のキャンセルは実際の起動ボタンとスクロールへ戻る", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 }); await page.goto("/");
  await page.getByRole("button", { name: "手早く探す" }).click();
  await page.getByRole("button", { name: "休息する" }).click();
  await page.locator(".recovery summary").click();
  for (const command of ["help", "reset", "restore"]) {
    const invoker = page.locator(`#game [data-action="${command}"]`).first();
    await invoker.scrollIntoViewIfNeeded(); await invoker.focus();
    const y = await page.evaluate(() => scrollY); const saved = await storage(page);
    await page.keyboard.press("Enter");
    if (command === "reset") await page.getByRole("button", { name: "キャンセル" }).click();
    else await page.keyboard.press("Escape");
    await expect(invoker).toBeFocused();
    expect(Math.abs(await page.evaluate(() => scrollY) - y)).toBeLessThan(3);
    expect(await storage(page)).toEqual(saved);
  }
});

test("復旧成功は未解決イベント・通常現在地・終了状態へそれぞれフォーカスする", async ({ page }) => {
  const state = pending("clinic-supplies");
  await seed(page, state); await page.goto("/");
  await page.getByRole("button", { name: "何も取らず立ち去る" }).click();
  await page.locator(".recovery summary").click();
  await page.getByRole("button", { name: "ひとつ前の保存に戻す" }).click();
  await page.getByRole("button", { name: "保存を戻す", exact: true }).click();
  await expect(page.locator("#event-title")).toBeFocused();
  await visibleInViewport(page.locator("#event-title")); await expect(page.locator(".outcome-panel")).toHaveCount(0);
  for (const ended of [false, true]) {
    const backup = newGame(); if (ended) { backup.health = 0; backup.status = "dead"; }
    await page.evaluate(backup => localStorage.setItem("afterlight.save.v2.backup", JSON.stringify(backup)), backup);
    await page.getByRole("button", { name: "ひとつ前の保存に戻す" }).click();
    await page.getByRole("button", { name: "保存を戻す", exact: true }).click();
    const target = ended ? page.locator("#ending-title") : page.locator('[data-tile="36"]');
    await expect(target).toBeFocused(); await visibleInViewport(target);
  }
});

test("保存ログのHTMLは結果と記録で実行されず、結果の再読込表示を追加しない", async ({ page }) => {
  const state = pending("collapsed-cache");
  state.log = [{ turn: 0, kind: "danger", text: '<img src=x onerror="window.badLog=true"> & <b>以前の負傷</b>' }];
  await seed(page, state); await page.goto("/");
  await expect(page.locator(".journal")).toContainText(state.log[0]!.text);
  await page.getByRole("button", { name: "何も取らず立ち去る" }).click();
  await expect(page.locator(".outcome-panel .action-risk")).toHaveCount(0);
  await expect(page.locator(".journal img, .journal b, .outcome-panel img")).toHaveCount(0);
  expect(await page.evaluate(() => (window as Window & { badLog?: boolean }).badLog)).toBeUndefined();
  await page.reload(); await expect(page.locator(".outcome-panel")).toHaveCount(0);
  await expect(page.locator(".journal")).toContainText("備蓄庫には踏み込まず");
});

test("治療の上限回復を定義の35ではなく実際の差分で示す", async ({ page }) => {
  const state = pending("clinic-supplies"); state.health = 98;
  const expected = act(state, { type: "choose", event: "clinic-supplies", tile: state.position, choice: "treat" });
  await seed(page, state); await page.goto("/");
  await page.getByRole("button", { name: "持ち水で傷を洗い処置する" }).click();
  await expect(page.locator(".outcome-panel")).toContainText("体力 +2（98 → 100）");
  await expect(page.locator(".outcome-panel")).toContainText("飲料水 −1個（2 → 1）");
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("afterlight.save.v2")!))).toEqual(expected);
});
