import { withoutWound, withoutRecap } from "./fixtures";
import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import { act, newGame } from "../src/game/engine";
import { eventById, eventChoice } from "../src/game/events";
import { neighbors } from "../src/game/model";
import type { ChoiceId, GameState, SearchMode } from "../src/game/model";

const key = "afterlight.save.v2";
const encounters = [
  { id: "delivery-van", tile: 30, choice: "probe", spend: "wedge", supply: "scrap" },
  { id: "rainwater-tank", tile: 38, choice: "draw", spend: "filter", supply: "bandage" },
  { id: "backup-generator", tile: 6, choice: "unwire", spend: "cool", supply: "water" },
] as const;
function at(tile: number): GameState {
  const state = newGame(); state.position = tile; state.discovered = [tile, ...neighbors(tile)];
  return state;
}
async function seed(page: Page, state: GameState | string) {
  const raw = typeof state === "string" ? state : JSON.stringify(state);
  await page.addInitScript(({ key, raw }) => { if (!localStorage.getItem(key)) localStorage.setItem(key, raw); }, { key, raw });
}
const storage = (page: Page) => page.evaluate(() => Object.fromEntries(Object.entries(localStorage)));
const saved = (page: Page): Promise<GameState> => page.evaluate(key => JSON.parse(localStorage.getItem(key)!), key);
const choice = (page: Page, id: ChoiceId) => page.locator(`[data-choice="${id}"]`);
async function search(page: Page, mode: SearchMode) {
  await page.getByRole("button", { name: mode === "quick" ? "手早く探す" : "慎重に探す", exact: true }).click();
}

for (const encounter of encounters) for (const mode of ["quick", "careful"] as const) {
  test(`${encounter.id}/${mode}: 探索確定後の方式を保存し追加費用・収穫・結果を一致させる`, async ({ page }) => {
    const state = at(encounter.tile);
    await seed(page, state); await page.goto("/");
    for (const method of ["quick", "careful"]) {
      const guide = page.locator(`#guide-search-${method}`);
      await expect(guide).toContainText(eventById(encounter.id)!.title);
      await expect(guide).toContainText("慎重な探索なら");
      await expect(guide).toContainText("立ち去る選択は0時間・消費なし");
    }
    await search(page, mode);
    await expect(page.locator("#event-title")).toBeFocused();
    await expect(page.locator(".event-search-context")).toContainText(mode === "quick" ? "手早く探す" : "慎重に探す");
    await expect(page.locator(".event-search-context")).toContainText("探索の時間・消費は確定");
    const pending = await saved(page);
    expect(pending).toEqual(act(state, { type: "search", mode }));
    expect(pending.pendingEvent).toEqual({ id: encounter.id, tile: encounter.tile, searchMode: mode });
    const raw = await storage(page);
    await page.reload(); await expect(page.locator("#event-title")).toBeFocused();
    expect(await storage(page)).toEqual(raw);
    await expect(choice(page, encounter.choice)).toHaveAccessibleDescription(mode === "careful" ? /0時間/ : /1時間.*気力 −/);
    await expect(choice(page, encounter.choice).locator("..")).toContainText(mode === "careful" ? "慎重な探索" : eventChoice(encounter.id, encounter.choice)!.detail);
    await expect(page.getByRole("button", { name: "休息する", exact: true })).toBeDisabled();
    await expect(page.locator('[data-focus="drop-water"]')).toBeDisabled();
    const groundItem = Object.keys(pending.ground[encounter.tile]!)[0]!;
    const pickup = page.locator(`[data-focus="pickup-${groundItem}"]`);
    await expect(pickup).toBeDisabled(); await expect(pickup).toHaveAccessibleDescription(/選択を先に/);
    // Force the DOM control through its handler: engine rejection must also protect storage.
    await pickup.evaluate(button => { (button as HTMLButtonElement).disabled = false; (button as HTMLButtonElement).click(); });
    expect(await storage(page)).toEqual(raw);
    const remote = neighbors(encounter.tile)[0]!;
    await page.locator(`[data-tile="${remote}"]`).click();
    await expect(page.locator(".location-panel")).toContainText("選択中の地点");
    await expect(page.locator(".event-search-context")).toContainText("現在地");
    await choice(page, encounter.choice).focus(); await page.keyboard.press("Enter");
    await expect(page.locator("#outcome-title")).toBeFocused();
    const expected = act(pending, { type: "choose", event: encounter.id, tile: encounter.tile, choice: encounter.choice });
    expect(await saved(page)).toEqual(expected);
    await expect(page.locator(".outcome-panel")).toContainText(`経過時間：${mode === "careful" ? 0 : 1}時間`);
    await expect(page.locator(".outcome-panel")).toContainText(eventChoice(encounter.id, encounter.choice, mode)!.outcome);
    if (mode === "careful") {
      expect(expected.energy).toBe(pending.energy);
      await expect(page.locator(".outcome-panel")).not.toContainText("経過時間：1時間");
    }
    if (encounter.id === "rainwater-tank") {
      expect(expected.ground[38]?.electrolyte ?? 0).toBe(mode === "careful" ? 2 : 0);
      await expect(page.locator(".outcome-panel")).toContainText("飲料水 +1個");
    }
    await page.getByRole("button", { name: "マップへ戻る", exact: true }).click();
    await expect(page.locator(`[data-tile="${encounter.tile}"]`)).toBeFocused();
    await page.getByRole("button", { name: "現在地の物資を拾う", exact: true }).click();
    await expect(page.locator("#ground-title")).toBeFocused();
    expect(await saved(page)).toEqual(expected);
  });
}

for (const encounter of encounters) test(`${encounter.id}: 手持ちだけを費用に使い、地面の物資は選択中に使えない`, async ({ page }) => {
  const state = at(encounter.tile); state.inventory[encounter.supply] = 0; state.ground[encounter.tile] = { [encounter.supply]: 1 };
  await seed(page, state); await page.goto("/"); await search(page, "quick");
  const spend = choice(page, encounter.spend);
  await expect(spend).toBeDisabled(); await expect(spend).toHaveAccessibleDescription(/所持 0個/);
  const before = await storage(page);
  await spend.evaluate(button => { (button as HTMLButtonElement).disabled = false; (button as HTMLButtonElement).click(); });
  expect(await storage(page)).toEqual(before);
  await choice(page, "leave").click();
  await expect(page.locator(".outcome-panel")).toContainText("経過時間：0時間");
  await expect(page.locator(".outcome-panel")).toContainText("所持品：変化なし");
  // A new expedition with the item in the bag enables the alternative.
  const prepared = at(encounter.tile); prepared.inventory[encounter.supply] = 1;
  await page.evaluate(({ key, prepared }) => localStorage.setItem(key, JSON.stringify(prepared)), { key, prepared });
  await page.reload(); await search(page, "quick"); await expect(choice(page, encounter.spend)).toBeEnabled();
  const pending = await saved(page); await choice(page, encounter.spend).click();
  const after = await saved(page);
  expect(after.inventory[encounter.supply]).toBe(0);
  expect(after).toEqual(act(pending, { type: "choose", event: encounter.id, tile: encounter.tile, choice: encounter.spend }));
  await expect(page.locator(".outcome-panel")).toContainText("経過時間：1時間");
});

for (const width of [320, 390, 1280]) test(`${width}pxで方式別の説明・選択・結果・フォーカスを読める`, async ({ page }) => {
  await page.setViewportSize({ width, height: 900 });
  await seed(page, at(38)); await page.goto("/");
  await page.locator(".location-panel").screenshot({ path: `test-results/event-search-preview-${width}.png` });
  await search(page, "careful");
  await expect(page.locator("#event-title")).toBeFocused();
  await expect(choice(page, "draw")).toHaveAccessibleDescription(/0時間.*電解質飲料 \+1個/);
  await expect(choice(page, "draw").locator("..")).toContainText("慎重な探索で汲み口を整え");
  const boxes = await page.locator(".event-panel, .event-choice, .event-search-context").evaluateAll(elements => elements.every(element => {
    const box = element.getBoundingClientRect(); return box.left >= 0 && box.right <= innerWidth && element.scrollWidth <= element.clientWidth;
  }));
  expect(boxes).toBe(true); expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
  await page.locator(".event-panel").screenshot({ path: `test-results/event-search-${width}.png` });
  await choice(page, "draw").focus(); await page.keyboard.press("Enter");
  await expect(page.locator("#outcome-title")).toBeFocused();
  await expect(page.locator(".outcome-panel")).toContainText("経過時間：0時間");
  await expect(page.locator(".outcome-panel")).toContainText("電解質飲料 +1個（1 → 2）");
  await page.locator(".outcome-panel").screenshot({ path: `test-results/event-search-result-${width}.png` });
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
});

test("気力も余裕時間もない追加選択から無料で離れ、通信塔の最終時間に送信できる", async ({ page }) => {
  const state = at(6); state.turn = 46; state.energy = 10; state.inventory.scrap = 2;
  await seed(page, state); await page.goto("/"); await search(page, "quick");
  await expect(choice(page, "cool")).toBeDisabled(); await expect(choice(page, "unwire")).toBeDisabled();
  await expect(choice(page, "leave")).toBeEnabled();
  const pending = await saved(page); expect(pending.turn).toBe(47); expect(pending.energy).toBe(0);
  await choice(page, "leave").click(); expect((await saved(page)).turn).toBe(47);
  await page.getByRole("button", { name: "スクラップを1個拾う", exact: true }).click();
  await page.getByRole("button", { name: "救難信号を送る", exact: true }).click();
  await expect(page.locator("#ending-title")).toHaveText("その声は、届いた。");
  expect((await saved(page)).turn).toBe(48);
});

for (const terminal of ["dead", "lost"] as const) test(`${terminal}になる探索では追加イベントを開かない`, async ({ page }) => {
  const state = at(38);
  if (terminal === "dead") { state.health = 24; state.hunger = 0; state.thirst = 0; }
  else state.turn = 47;
  await seed(page, state); await page.goto("/"); await search(page, "quick");
  await expect(page.locator("#ending-title")).toBeFocused(); await expect(page.locator("#event-title")).toHaveCount(0);
  const after = await saved(page); expect(after.status).toBe(terminal); expect(after.pendingEvent).toBeNull();
  expect(after.searched).toContain(38); expect(after.ground[38]).toEqual({ food: 1, water: 1 });
});

test("不正な選択と解決済みの古いボタンは再消費も保存も行わない", async ({ page }) => {
  await seed(page, at(30)); await page.goto("/"); await search(page, "careful");
  const before = await storage(page); const button = page.locator('[data-focus="choice-probe"]');
  for (const id of ["unknown", "filter", "__proto__"]) {
    await button.evaluate((button, id) => { (button as HTMLElement).dataset.choice = id; (button as HTMLButtonElement).click(); }, id);
    expect(await storage(page)).toEqual(before);
  }
  await button.evaluate(button => { (button as HTMLElement).dataset.choice = "probe"; });
  await button.evaluate(button => { (window as Window & { oldChoice?: Element }).oldChoice = button.cloneNode(true) as Element; });
  await button.click(); const resolved = await storage(page);
  await page.evaluate(() => {
    const button = (window as Window & { oldChoice?: Element }).oldChoice!;
    document.querySelector("#game")!.append(button); (button as HTMLButtonElement).click(); button.remove();
  });
  expect(await storage(page)).toEqual(resolved);
});

test("内容版4の地面・選択待ちを読取専用で引き継ぎ、最初の確定時に原文を正確に退避する", async ({ page }) => {
  const state = at(29); state.turn = 9; state.pendingEvent = { id: "collapsed-cache", tile: 29 };
  state.ground = { 29: { water: 2 }, 30: { coffee: 1 } };
  const raw = JSON.stringify({ ...withoutRecap(withoutWound(state)), contentVersion: 4 }, null, 2);
  await seed(page, raw); await page.goto("/"); await expect(page.locator("#event-title")).toBeFocused();
  await expect(page.locator(".event-search-context")).toHaveCount(0);
  expect(await storage(page)).toEqual({ [key]: raw }); await page.reload(); expect(await storage(page)).toEqual({ [key]: raw });
  await choice(page, "leave").click(); const after = await saved(page);
  expect(after.contentVersion).toBe(7); expect(after.turn).toBe(9); expect(after.ground).toEqual(state.ground);
  expect(after.resolvedEvents).toContain("collapsed-cache");
  expect((await storage(page))[`${key}.original.0`]).toBe(raw); expect((await storage(page))[`${key}.backup`]).toBe(raw);
});
