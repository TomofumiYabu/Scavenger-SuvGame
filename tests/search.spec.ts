import { menuButton } from "./menus";
import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import { act } from "../src/game/engine";
import { legacyGame as newGame } from "../test-support/fixtures";
import { neighbors } from "../src/game/model";
import type { GameState } from "../src/game/model";

async function seed(page: Page, state: GameState): Promise<void> {
  await page.addInitScript(state => {
    if (!localStorage.getItem("afterlight.save.v2")) localStorage.setItem("afterlight.save.v2", JSON.stringify(state));
  }, state);
}
function ruins(): GameState {
  const state = newGame();
  state.position = 29; state.discovered = [29, ...neighbors(29)]; state.rng = 1;
  return state;
}

for (const width of [320, 390, 1280]) for (const mode of ["quick", "careful"] as const) {
  test(`${width}pxで探索2方式を比較し${mode}の費用・収穫・操作位置・保存を保つ`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    const state = ruins(); state.hunger = 7; state.thirst = 7;
    await seed(page, state); await page.goto("/");
    const quick = (await menuButton(page, { name: "手早く探す" }));
    const careful = (await menuButton(page, { name: "慎重に探す" }));
    await expect(quick).toHaveAccessibleDescription(/1時間.*気力 −10.*満腹度 −5.*水分 −6.*スクラップ \+2個.*飲料水 \+1個.*3分の1で体力 −10/);
    await expect(careful).toHaveAccessibleDescription(/2時間.*気力 −16.*満腹度 −10.*水分 −12.*スクラップ \+3個.*飲料水 \+1個.*負傷：0（なし）/);
    await expect(careful).toHaveAccessibleDescription(/満腹度が0になり、体力 −12.*水分が0になり、体力 −12/);
    await expect(page.locator(".location-actions")).toContainText("どちらか一度だけ");
    await page.locator(".location-panel").screenshot({ path: `test-results/search-methods-${width}-${mode}.png` });
    const layout = await page.locator(".action-details").evaluateAll(elements => ({
      inside: elements.every(element => { const r = element.getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth; }),
      overflow: document.documentElement.scrollWidth > innerWidth,
    }));
    expect(layout).toEqual({ inside: true, overflow: false });
    const button = mode === "quick" ? quick : careful;
    await button.scrollIntoViewIfNeeded(); await button.focus();
    await button.evaluate(element => { (window as Window & { searchButton?: Element }).searchButton = element; });
    const y = await page.evaluate(() => scrollY);
    await page.keyboard.press("Enter");
    await expect(quick).toBeDisabled(); await expect(careful).toBeDisabled();
    const explanation = page.locator(`#guide-search-${mode}`);
    await expect(explanation).toBeFocused();
    await expect(explanation).toContainText("これ以上は探せません");
    expect(await button.evaluate(element => element === (window as Window & { searchButton?: Element }).searchButton)).toBe(true);
    expect(Math.abs(await page.evaluate(() => scrollY) - y)).toBeLessThan(3);
    const expected = act(state, { type: "search", mode });
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem("afterlight.save.v2")!))).toEqual(expected);
    await expect(page.getByTestId("remaining")).toHaveText(mode === "quick" ? "47" : "46");
    await expect(page.getByTestId("health")).toContainText(String(expected.health));
    await page.reload();
    await expect(quick).toBeDisabled(); await expect(careful).toBeDisabled();
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem("afterlight.save.v2")!))).toEqual(expected);
  });
}

test("残り1時間では慎重な探索を拒否し、2時間ちょうどの死亡を優先する", async ({ page }) => {
  const state = ruins(); state.turn = 47;
  await seed(page, state); await page.goto("/");
  await expect((await menuButton(page, { name: "手早く探す" }))).toBeEnabled();
  await expect((await menuButton(page, { name: "慎重に探す" }))).toBeDisabled();
  await expect(page.locator("#guide-search-careful")).toContainText("必要 2時間 / 残り 1時間");
  state.turn = 46; state.health = 24; state.hunger = 7; state.thirst = 7;
  await page.evaluate(state => localStorage.setItem("afterlight.save.v2", JSON.stringify(state)), state);
  await page.reload();
  await expect(page.locator("#guide-search-careful")).toContainText("体力が尽きます");
  await (await menuButton(page, { name: "慎重に探す" })).click();
  await expect(page.locator("#ending-title")).toBeFocused();
  await expect(page.locator("#ending-title")).toHaveText("街は、再び静かになった。");
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("afterlight.save.v2")!))).toEqual(act(state, { type: "search", mode: "careful" }));
});

test("入力の探索方式が欠落・不正ならコントローラーも実行しない", async ({ page }) => {
  await page.goto("/");
  const before = await page.evaluate(() => Object.fromEntries(Object.entries(localStorage)));
  const quick = (await menuButton(page, { name: "手早く探す" }));
  for (const mode of ["unknown", null]) {
    await quick.evaluate((element, mode) => { if (mode === null) delete (element as HTMLElement).dataset.searchMode; else (element as HTMLElement).dataset.searchMode = mode; }, mode);
    await quick.click();
    await expect(page.getByTestId("remaining")).toHaveText("48");
    expect(await page.evaluate(() => Object.fromEntries(Object.entries(localStorage)))).toEqual(before);
  }
});
