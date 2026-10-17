import { menuButton, mapTile, openMenu } from "./menus";
import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import { act } from "../src/game/engine";
import { legacyGame as newGame } from "../test-support/fixtures";
import { neighbors, TOWER } from "../src/game/model";
import type { Action, GameState } from "../src/game/model";
import { withoutRecap } from "../test-support/fixtures";

const key = "afterlight.save.v2";
function at(tile = 30): GameState {
  const state = newGame();
  state.position = tile; state.discovered = [tile, ...neighbors(tile)];
  return state;
}
async function seed(page: Page, state: GameState | string) {
  const raw = typeof state === "string" ? state : JSON.stringify(state);
  await page.addInitScript(({ key, raw }) => { if (!localStorage.getItem(key)) localStorage.setItem(key, raw); }, { key, raw });
}
const storage = (page: Page): Promise<Record<string, string>> => page.evaluate(() => Object.fromEntries(Object.entries(localStorage)));
const saved = (page: Page): Promise<GameState> => page.evaluate(key => JSON.parse(localStorage.getItem(key)!), key);
const ending = (page: Page) => page.locator(".ending");
async function openDetails(page: Page) {
  await openMenu(page, "ending");
  const summary = page.locator("#recap-details summary");
  await summary.focus(); await page.keyboard.press("Enter");
  await expect(page.locator("#recap-details")).toHaveAttribute("open");
}

const boundaries: { name: string; configure: (state: GameState) => void; action: Action; button: string; reason: RegExp; damage?: RegExp }[] = [
  { name: "空腹死", configure: state => { state.health = 12; state.hunger = 0; }, action: { type: "rest" }, button: "休息する", reason: /空腹/, damage: /空腹[^。]*12/ },
  { name: "渇きによる死", configure: state => { state.health = 12; state.thirst = 0; }, action: { type: "rest" }, button: "休息する", reason: /渇き|水分/, damage: /渇き[^。]*12/ },
  { name: "廃墟の負傷死", configure: state => { state.position = 29; state.discovered = [29, ...neighbors(29)]; state.health = 10; state.rng = 1; }, action: { type: "search", mode: "quick" }, button: "手早く探す", reason: /負傷/, damage: /負傷[^。]*10/ },
  { name: "48時間での時間切れ", configure: state => { state.turn = 47; }, action: { type: "rest" }, button: "休息する", reason: /48時間|救難電波|時間切れ/ },
  { name: "48時間目の送信中の死亡", configure: state => { state.position = TOWER; state.discovered = [TOWER, ...neighbors(TOWER)]; state.turn = 47; state.health = 12; state.hunger = 0; state.inventory.scrap = 3; }, action: { type: "signal" }, button: "救難信号を送る", reason: /空腹/, damage: /空腹[^。]*12/ },
  { name: "48時間目の送信成功", configure: state => { state.position = TOWER; state.discovered = [TOWER, ...neighbors(TOWER)]; state.turn = 47; state.inventory.scrap = 3; }, action: { type: "signal" }, button: "救難信号を送る", reason: /救難信号|交信|脱出/ },
  { name: "慎重な探索の複数時間・資源による死亡", configure: state => { state.health = 30; state.hunger = 0; state.thirst = 0; }, action: { type: "search", mode: "careful" }, button: "慎重に探す", reason: /空腹|渇き/, damage: /体力/ },
];
for (const scenario of boundaries) test(`振り返り：${scenario.name}を確定行動の事実で示し再読込で保持する`, async ({ page }) => {
  const state = at(); scenario.configure(state);
  await seed(page, state); await page.goto("/");
  await (await menuButton(page, { name: scenario.button, exact: true })).click();
  await expect(page.locator("#ending-title")).toBeFocused();
  await expect(ending(page).locator(".recap-reason")).toContainText(scenario.reason);
  await expect(ending(page).locator(".recap-last")).toContainText(scenario.button === "休息する" ? "休息" : scenario.action.type === "signal" ? "救難信号を送信" : scenario.button);
  await expect(ending(page).locator(".recap-last")).toContainText(`${scenario.action.type === "search" && scenario.action.mode === "careful" ? 2 : 1}時間`);
  if (scenario.damage) await expect(ending(page).locator(".recap-last")).toContainText(scenario.damage);
  if (scenario.name === "廃墟の負傷死") {
    await expect(ending(page).locator(".recap-hints")).toContainText(/慎重.*2時間/);
    await expect(ending(page).locator(".recap-hints")).not.toContainText("入口の箱");
  }
  const expected = act(state, scenario.action);
  expect(await saved(page)).toEqual(expected);
  const before = await storage(page);
  await openDetails(page);
  if (scenario.name === "慎重な探索の複数時間・資源による死亡") {
    await expect(ending(page)).toContainText("空腹による体力 −18");
    await expect(ending(page)).toContainText("渇きによる体力 −12");
  }
  const text = await ending(page).innerText();
  expect(await storage(page)).toEqual(before);
  await page.reload(); await expect(page.locator("#ending-title")).toBeFocused();
  await openDetails(page); expect(await ending(page).innerText()).toBe(text);
  expect(await storage(page)).toEqual(before);
});

for (const width of [320, 390, 1280]) test(`振り返りを${width}pxで読み、キーボード・再描画・再開始確認を保つ`, async ({ page }) => {
  await page.setViewportSize({ width, height: 900 });
  const state = at(29); state.health = 10; state.rng = 1; state.pendingEvent = { id: "collapsed-cache", tile: 29 };
  await seed(page, state); await page.goto("/");
  await (await menuButton(page, { name: "棚の奥まで踏み込む", exact: true })).click();
  await expect(page.locator("#outcome-title")).toBeFocused();
  await (await menuButton(page, { name: "終了の詳細へ" })).click();
  await expect(page.locator("#ending-title")).toBeFocused();
  await expect(ending(page).locator(".recap-hints")).toContainText("入口の箱");
  await expect(ending(page).locator(".recap-hints")).toContainText(/0時間.*立ち去|立ち去.*0時間/);
  await expect(ending(page).locator(".recap-hints")).not.toContainText("慎重");
  await page.keyboard.press("Tab"); await expect(ending(page).getByRole("button", { name: "新しい探索" })).toBeFocused();
  await page.keyboard.press("Tab"); await expect(page.locator("#recap-details summary")).toBeFocused();
  await ending(page).screenshot({ path: `test-results/recap-collapsed-${width}.png` });
  const before = await storage(page); await page.keyboard.press("Enter");
  await expect(page.locator("#recap-details")).toHaveAttribute("open");
  await page.locator("#recap-details summary").evaluate(element => { (window as Window & { recapSummary?: Element }).recapSummary = element; });
  await (await mapTile(page, '[data-tile="30"]')).click();
  await openMenu(page, "ending");
  await expect(page.locator("#recap-details")).toHaveAttribute("open");
  expect(await page.locator("#recap-details summary").evaluate(element => element === (window as Window & { recapSummary?: Element }).recapSummary)).toBe(true);
  expect(await storage(page)).toEqual(before);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(await ending(page).evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
  await ending(page).screenshot({ path: `test-results/recap-${width}.png` });
  await page.screenshot({ path: `test-results/recap-page-${width}.png`, fullPage: true });
  await ending(page).getByRole("button", { name: "新しい探索" }).click();
  await page.keyboard.press("Escape"); await expect(ending(page).getByRole("button", { name: "新しい探索" })).toBeFocused();
  expect(await storage(page)).toEqual(before);
  await ending(page).getByRole("button", { name: "新しい探索" }).click();
  await (await menuButton(page, { name: "新しい探索を始める", exact: true })).click();
  await expect(ending(page)).toHaveCount(0); await expect((await mapTile(page, '[data-tile="36"]'))).toBeFocused();
  expect((await saved(page)).recap).toBeNull();
});

test("12件のログから消えた探索方式・出来事・治療・休息を実際の全履歴で振り返る", async ({ page }) => {
  const state = at(29); state.rng = 1; state.pendingEvent = { id: "collapsed-cache", tile: 29 };
  await seed(page, state); await page.goto("/");
  await page.locator('[data-choice="safe"]').click();
  await (await menuButton(page, { name: "手早く探す", exact: true })).click();
  await (await menuButton(page, { name: "包帯を使う", exact: true })).click();
  await (await mapTile(page, '[data-tile="30"]')).click(); await (await menuButton(page, { name: "ここへ移動", exact: true })).click();
  await (await menuButton(page, { name: "慎重に探す", exact: true })).click();
  await page.locator('[data-choice="leave"]').click();
  for (let i = 0; i < 30 && await ending(page).count() === 0; i++) await (await menuButton(page, { name: "休息する", exact: true })).click();
  await expect(ending(page)).toBeVisible();
  const result = await saved(page); expect(result.log).toHaveLength(12); expect(result.recap!.entries.length).toBeGreaterThan(12);
  await expect(page.locator(".journal")).not.toContainText("入口の箱");
  await openDetails(page);
  for (const label of ["入口の箱を調べる", "手早く探す", "慎重に探す", "包帯", "休息"]) await expect(page.locator(".recap-timeline")).toContainText(label);
  const before = await storage(page); const text = await ending(page).innerText();
  await page.reload(); await openDetails(page); expect(await ending(page).innerText()).toBe(text); expect(await storage(page)).toEqual(before);
});

test("0時間の物資移動や不正入力を振り返りに増やさず、確定した行動だけを記録する", async ({ page }) => {
  await seed(page, at()); await page.goto("/");
  for (let i = 0; i < 14; i++) {
    await (await menuButton(page, { name: "飲料水をここに1個置く", exact: true })).click();
    await (await menuButton(page, { name: "飲料水を1個拾う", exact: true })).click();
  }
  expect((await saved(page)).recap).toBeNull();
  const before = await storage(page);
  await page.locator('[data-focus="drop-water"]').evaluate(element => { (element as HTMLButtonElement).dataset.quantity = "0"; (element as HTMLButtonElement).click(); });
  expect(await storage(page)).toEqual(before);
  await (await menuButton(page, { name: "飲料水を使う", exact: true })).click();
  expect((await saved(page)).recap!.entries).toHaveLength(1);
  expect((await saved(page)).turn).toBe(1);
});

test("旧保存の負傷・探索待機・地面を保ち、移行後からの一部分と0時間の選択を示す", async ({ page }) => {
  const state = at(38); state.turn = 9; state.wound = "minor"; state.searched = [38];
  state.pendingEvent = { id: "rainwater-tank", tile: 38, searchMode: "careful" };
  state.ground = { 38: { water: 0, food: 2 }, 37: { coffee: 1 } };
  const raw = JSON.stringify({ ...withoutRecap(state), contentVersion: 6 }, null, 2);
  await seed(page, raw); await page.goto("/");
  await expect(page.locator("#event-title")).toBeFocused(); await expect(page.getByTestId("condition")).toContainText("軽い負傷");
  expect(await storage(page)).toEqual({ [key]: raw });
  await page.locator('[data-choice="leave"]').click();
  const migrated = await saved(page); expect(migrated.turn).toBe(9); expect(migrated.wound).toBe("minor"); expect(migrated.ground).toEqual(state.ground);
  expect(migrated.recap!.entries).toHaveLength(1);
  expect((await storage(page))[`${key}.original.0`]).toBe(raw);
  for (let i = 0; i < 30 && await ending(page).count() === 0; i++) await (await menuButton(page, { name: "休息する", exact: true })).click();
  await expect(ending(page).locator(".ending-summary .recap-coverage")).toContainText(/9時間|一部|途中/);
  await openDetails(page); await expect(page.locator(".recap-timeline")).toContainText("何も取らず立ち去る");
  await expect(page.locator(".recap-timeline")).toContainText("経過 9 → 9時間");
});

for (const status of ["dead", "lost", "won"] as const) test(`過去に終了した${status}の保存から詳しい原因・選択を推測しない`, async ({ page }) => {
  const state = at(status === "won" ? TOWER : 30); state.status = status; state.turn = status === "lost" ? 48 : 22; state.health = status === "dead" ? 0 : 50; state.hunger = 0; state.thirst = 0;
  state.log = [{ turn: state.turn, kind: "danger", text: '<img src=x onerror="window.badRecap=true">空腹・渇き・負傷という古い記録' }];
  const raw = JSON.stringify({ ...withoutRecap(state), contentVersion: 6 });
  await seed(page, raw); await page.goto("/");
  await expect(page.locator("#ending-title")).toBeFocused();
  await expect(ending(page)).toContainText(/記録|保存/);
  await expect(ending(page)).toContainText(/確認できません|ありません|残っていません|分かりません/);
  await expect(page.locator("#recap-details")).toHaveCount(0);
  await expect(ending(page)).not.toContainText("空腹で");
  await expect(ending(page).locator("img")).toHaveCount(0);
  expect(await page.evaluate(() => (window as Window & { badRecap?: boolean }).badRecap)).toBeUndefined();
  expect(await storage(page)).toEqual({ [key]: raw });
  await page.reload(); expect(await storage(page)).toEqual({ [key]: raw });
});
