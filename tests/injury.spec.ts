import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import { act, newGame } from "../src/game/engine";
import { neighbors } from "../src/game/model";
import type { GameState } from "../src/game/model";

const key = "afterlight.save.v2";
function at(tile = 29): GameState {
  const state = newGame();
  state.position = tile; state.discovered = [tile, ...neighbors(tile)]; state.rng = 1;
  return state;
}
async function seed(page: Page, state: GameState | string) {
  const raw = typeof state === "string" ? state : JSON.stringify(state);
  await page.addInitScript(({ key, raw }) => { if (!localStorage.getItem(key)) localStorage.setItem(key, raw); }, { key, raw });
}
const storage = (page: Page): Promise<Record<string, string>> => page.evaluate(() => Object.fromEntries(Object.entries(localStorage)));
const saved = (page: Page): Promise<GameState> => page.evaluate(key => JSON.parse(localStorage.getItem(key)!), key);
const quick = (page: Page) => page.getByRole("button", { name: "手早く探す", exact: true });
const careful = (page: Page) => page.getByRole("button", { name: "慎重に探す", exact: true });
const condition = (page: Page) => page.getByRole("group", { name: "現在の負傷状態" });
async function fits(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
  expect(await page.locator('.condition, .action-details').evaluateAll(elements => elements.filter(element => element.getBoundingClientRect().width > 0).every(element => {
    const box = element.getBoundingClientRect(); return box.left >= 0 && box.right <= innerWidth && element.scrollWidth <= element.clientWidth;
  }))).toBe(true);
}

test.use({ hasTouch: true });
for (const width of [320, 390, 1280]) test(`${width}pxで実際の廃墟負傷→追加消費→再読込→包帯治療を操作位置を保って示す`, async ({ page }) => {
  await page.setViewportSize({ width, height: 900 });
  const state = at(); state.energy = 17;
  await seed(page, state); await page.goto("/");
  await expect(condition(page)).toContainText("現在の状態：負傷なし");
  await expect(condition(page).locator("details")).not.toHaveAttribute("open");
  await expect(quick(page)).toHaveAccessibleDescription(/気力 −10.*3分の1で体力 −10・軽い負傷/);
  await expect(careful(page)).toHaveAccessibleDescription(/負傷：0（なし）/);
  // Capture the live controls and shell to prove the condition update does not replace later siblings.
  await quick(page).evaluate(element => {
    (window as Window & { injuryNodes?: Element[] }).injuryNodes = [element, document.querySelector('.condition')!, document.querySelector('[data-item="bandage"][data-focus="use-bandage"]')!];
  });
  await quick(page).scrollIntoViewIfNeeded(); await quick(page).focus();
  const beforeY = await page.evaluate(() => scrollY);
  if (width === 320) await quick(page).tap(); else await page.keyboard.press("Enter");
  await expect(page.locator("#guide-search-quick")).toBeFocused();
  expect(Math.abs(await page.evaluate(() => scrollY) - beforeY)).toBeLessThan(3);
  await expect(condition(page)).toContainText("現在の状態：軽い負傷");
  await expect(condition(page)).toContainText("1時間ごとに気力 −2追加");
  await expect(page.getByTestId("energy")).toHaveText("7 / 100"); // Newly acquired injury is not charged retrospectively.
  await expect(page.getByTestId("health")).toHaveText("90 / 100");
  expect(await page.evaluate(() => {
    const nodes = (window as Window & { injuryNodes?: Element[] }).injuryNodes!;
    return nodes[0] === document.querySelector('[data-focus="search-quick"]') && nodes[1] === document.querySelector('.condition') && nodes[2] === document.querySelector('[data-focus="use-bandage"]');
  })).toBe(true);
  const injured = act(state, { type: "search", mode: "quick" });
  expect(await saved(page)).toEqual(injured);
  await fits(page);
  await page.locator(".survivor").screenshot({ path: `test-results/injury-${width}.png` });
  await page.screenshot({ path: `test-results/injury-page-${width}.png`, fullPage: true });
  await page.locator('[data-tile="30"]').click();
  const move = page.getByRole("button", { name: "ここへ移動", exact: true });
  await expect(move).toBeDisabled();
  await expect(move).toHaveAccessibleDescription(/気力 −8.*軽い負傷による気力 −2.*上の費用に含む.*気力が足りません/);
  const raw = await storage(page);
  await move.evaluate(element => { (element as HTMLButtonElement).disabled = false; (element as HTMLButtonElement).click(); });
  expect(await storage(page)).toEqual(raw);
  await page.reload(); await expect(condition(page)).toContainText("現在の状態：軽い負傷");
  expect(await storage(page)).toEqual(raw);
  const bandage = page.getByRole("button", { name: "包帯を使う", exact: true });
  await expect(bandage).toHaveAccessibleDescription(/軽い負傷を治療（軽い負傷 → 負傷なし）/);
  await bandage.scrollIntoViewIfNeeded(); await bandage.focus();
  await bandage.evaluate(element => { (window as Window & { treatmentButton?: Element }).treatmentButton = element; });
  const treatmentY = await page.evaluate(() => scrollY);
  if (width === 390) await bandage.tap(); else await page.keyboard.press("Enter");
  await expect(page.locator("#guide-use-bandage")).toBeFocused();
  expect(Math.abs(await page.evaluate(() => scrollY) - treatmentY)).toBeLessThan(3);
  expect(await bandage.evaluate(element => element === (window as Window & { treatmentButton?: Element }).treatmentButton)).toBe(true);
  await expect(condition(page)).toContainText("現在の状態：負傷なし");
  await expect(page.getByTestId("energy")).toHaveText("7 / 100");
  await page.locator('[data-tile="30"]').click(); await expect(move).toBeEnabled(); await expect(move).toHaveAccessibleDescription(/気力 −6/);
  await fits(page); await page.locator(".survivor").screenshot({ path: `test-results/injury-treated-${width}.png` });
  await page.screenshot({ path: `test-results/injury-treated-page-${width}.png`, fullPage: true });
  const treated = act(injured, { type: "use", item: "bandage" });
  expect(await saved(page)).toEqual(treated);
  await page.reload(); await expect(condition(page)).toContainText("現在の状態：負傷なし"); expect(await saved(page)).toEqual(treated);
});

test("負傷と治療の詳細をキーボードで開き、表示状態・ノードを行動後も保ち、開閉だけでは保存しない", async ({ page }) => {
  await seed(page, at()); await page.goto("/");
  const detail = condition(page).locator("details");
  const summary = detail.locator("summary");
  const before = await storage(page);
  await summary.focus(); await page.keyboard.press("Enter"); await expect(detail).toHaveAttribute("open");
  await expect(detail).toContainText("治療用に残すか");
  expect(await storage(page)).toEqual(before);
  await summary.evaluate(element => { (window as Window & { woundSummary?: Element }).woundSummary = element; });
  await quick(page).click();
  await expect(detail).toHaveAttribute("open");
  expect(await summary.evaluate(element => element === (window as Window & { woundSummary?: Element }).woundSummary)).toBe(true);
  const injured = await storage(page); await summary.focus(); await page.keyboard.press("Enter");
  await expect(summary).toBeFocused(); await expect(detail).not.toHaveAttribute("open"); expect(await storage(page)).toEqual(injured);
});

test("負傷中の探索費用12/20は気力境界と一致し、慎重な探索で新しい負傷を避ける", async ({ page }) => {
  const state = at(); state.wound = "minor"; state.energy = 19;
  await seed(page, state); await page.goto("/");
  await expect(quick(page)).toBeEnabled(); await expect(quick(page)).toHaveAccessibleDescription(/気力 −12.*軽い負傷による気力 −2/);
  await expect(careful(page)).toBeDisabled(); await expect(careful(page)).toHaveAccessibleDescription(/気力 −20.*軽い負傷による気力 −4.*必要 20/);
  const raw = await storage(page);
  await careful(page).evaluate(element => { (element as HTMLButtonElement).disabled = false; (element as HTMLButtonElement).click(); });
  expect(await storage(page)).toEqual(raw);
  const healthy = at(); await page.evaluate(({ key, healthy }) => localStorage.setItem(key, JSON.stringify(healthy)), { key, healthy }); await page.reload();
  await careful(page).click(); await expect(condition(page)).toContainText("現在の状態：負傷なし");
  const after = await saved(page); expect(after.rng).toBe(1); expect(after.health).toBe(100); expect(after.energy).toBe(69);
  expect(after).toEqual(act(healthy, { type: "search", mode: "careful" }));
});

test("避難所以外の休息では治らず、追加移動費用を払って避難所へ撤退し通常休息で治療する", async ({ page }) => {
  const state = at(); state.wound = "minor"; state.health = 90;
  await seed(page, state); await page.goto("/");
  const rest = page.getByRole("button", { name: "休息する", exact: true });
  await expect(rest).toHaveAccessibleDescription(/避難所以外の休息では、軽い負傷は治りません/);
  await rest.click(); await expect(condition(page)).toContainText("現在の状態：軽い負傷");
  await expect(page.getByTestId("health")).toHaveText("90 / 100");
  await page.locator('[data-tile="36"]').click();
  await expect(page.getByRole("button", { name: "ここへ移動", exact: true })).toHaveAccessibleDescription(/気力 −8/);
  await page.getByRole("button", { name: "ここへ移動", exact: true }).click();
  await page.locator('[data-choice="leave"]').click();
  await expect(rest).toHaveAccessibleDescription(/軽い負傷を治療/); await rest.click();
  await expect(condition(page)).toContainText("現在の状態：負傷なし");
  let expected = act(state, { type: "rest" }); expected = act(expected, { type: "move", target: 36 });
  expected = act(expected, { type: "choose", event: "shelter-embers", tile: 36, choice: "leave" }); expected = act(expected, { type: "rest" });
  expect(await saved(page)).toEqual(expected);
});

for (const item of ["bandage", "medkit"] as const) test(`体力100でも${item}による負傷治療を案内し実行できる`, async ({ page }) => {
  const state = at(); state.wound = "minor"; state.inventory[item] = 1;
  await seed(page, state); await page.goto("/");
  const button = page.locator(`[data-focus="use-${item}"]`);
  await expect(button).toBeEnabled(); await expect(button).toHaveAccessibleDescription(/体力 \+\d+（実回復 \+0）.*軽い負傷を治療/);
  await button.click(); await expect(condition(page)).toContainText("現在の状態：負傷なし");
  await expect(page.getByTestId("health")).toHaveText("100 / 100");
  expect(await saved(page)).toEqual(act(state, { type: "use", item }));
});

test("備蓄庫の危険な選択で負傷状態の変化を結果に示し、診療所の実回復0の処置でも治療する", async ({ page }) => {
  const state = at(); state.pendingEvent = { id: "collapsed-cache", tile: 29 };
  await seed(page, state); await page.goto("/");
  const deep = page.locator('[data-choice="deep"]');
  await expect(deep).toHaveAccessibleDescription(/気力 −12.*3分の1で体力 −10・軽い負傷/);
  await deep.click(); await expect(page.locator("#outcome-title")).toBeFocused();
  await expect(page.locator(".outcome-panel")).toContainText("負傷状態：負傷なし → 軽い負傷");
  const clinic = at(40); clinic.wound = "minor"; clinic.pendingEvent = { id: "clinic-supplies", tile: 40 };
  await page.evaluate(({ key, clinic }) => localStorage.setItem(key, JSON.stringify(clinic)), { key, clinic }); await page.reload();
  await expect(page.locator('[data-choice="treat"]')).toHaveAccessibleDescription(/気力 −4.*実回復 \+0.*軽い負傷を治療/);
  await page.locator('[data-choice="treat"]').click();
  await expect(page.locator(".outcome-panel")).toContainText("体力 ±0（100 → 100）");
  await expect(page.locator(".outcome-panel")).toContainText("負傷状態：軽い負傷 → 負傷なし");
  expect(await saved(page)).toEqual(act(clinic, { type: "choose", event: "clinic-supplies", tile: 40, choice: "treat" }));
});

test("負傷と探索方式の選択待ち・地面を再読込で保持し、包帯のろ過は治療せず追加消費を課さない", async ({ page }) => {
  const state = at(38); state.wound = "minor";
  await seed(page, state); await page.goto("/"); await careful(page).click();
  const pending = await saved(page); expect(pending.energy).toBe(65); expect(pending.pendingEvent?.searchMode).toBe("careful");
  const raw = await storage(page); await page.reload();
  await expect(page.locator("#event-title")).toBeFocused(); await expect(condition(page)).toContainText("現在の状態：軽い負傷");
  await expect(page.locator(".event-search-context")).toContainText("慎重に探す"); expect(await storage(page)).toEqual(raw);
  await expect(page.locator('[data-choice="filter"]')).toHaveAccessibleDescription(/気力 −4/);
  await page.locator('[data-choice="filter"]').click();
  await expect(page.locator(".outcome-panel")).toContainText("負傷状態：軽い負傷（変化なし）");
  const after = await saved(page); expect(after.inventory.bandage).toBe(0); expect(after.energy).toBe(61); expect(after.wound).toBe("minor");
  expect(after).toEqual(act(pending, { type: "choose", event: "rainwater-tank", tile: 38, choice: "filter" }));
  await page.reload(); expect(await saved(page)).toEqual(after);
});

test("実際の内容版5を読取専用で負傷なしへ移行し、探索待機・地面を保ったまま初回保存で原文退避する", async ({ page }) => {
  const state = act(at(38), { type: "search", mode: "careful" });
  state.ground[30] = { coffee: 1 }; state.discovered.push(30);
  const { wound: _wound, ...old } = state;
  const raw = JSON.stringify({ ...old, contentVersion: 5 }, null, 2);
  expect(JSON.parse(raw)).not.toHaveProperty("wound");
  await seed(page, raw); await page.goto("/");
  await expect(condition(page)).toContainText("現在の状態：負傷なし"); await expect(page.locator("#event-title")).toBeFocused();
  await expect(page.locator(".event-search-context")).toContainText("慎重に探す");
  expect(await storage(page)).toEqual({ [key]: raw }); await page.reload(); expect(await storage(page)).toEqual({ [key]: raw });
  await page.locator('[data-choice="leave"]').click();
  const after = await saved(page); expect(after.contentVersion).toBe(6); expect(after.wound).toBe("none"); expect(after.ground).toEqual(state.ground); expect(after.turn).toBe(state.turn);
  expect((await storage(page))[`${key}.original.0`]).toBe(raw); expect((await storage(page))[`${key}.backup`]).toBe(raw);
  await page.reload(); expect(await saved(page)).toEqual(after); expect((await storage(page))[`${key}.original.0`]).toBe(raw);
});
