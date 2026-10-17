import type { Locator, Page } from "@playwright/test";

type ButtonOptions = Parameters<Page["getByRole"]>[1];
/** Navigate through the same visible dock that a player uses, then return its action. */
export async function openMenu(page: Page, pane: string): Promise<void> {
  if (await page.locator(`.drawer-pane[data-pane="${pane}"]`).isVisible()) return;
  if (["location", "inventory", "mission", "journal", "settings"].includes(pane)) {
    await page.locator(`.command-dock [data-panel="${pane}"]`).click();
  } else {
    if (await page.locator(".command-drawer").isVisible()) await page.getByRole("button", { name: "メニューを閉じる" }).click();
    await page.locator(pane === "ground" ? '.map-context [data-action="show-ground"]' : pane === "ending" ? '.map-context [data-action="show-ending"]' : '.map-context [data-panel="encounter"]').click();
  }
}
export async function menuButton(page: Page, options: ButtonOptions): Promise<Locator> {
  const visible = page.getByRole("button", options);
  if (await visible.count()) {
    if (await visible.first().evaluate(element => element.hasAttribute("data-tile") && !!element.closest(".map-grid")) && await page.locator(".command-drawer").isVisible()) await page.getByRole("button", { name: "メニューを閉じる" }).click();
    return await visible.first().evaluate(element => !!element.closest("[data-pane]")) ? page.getByRole("button", { ...options, includeHidden: true }) : visible;
  }
  const button = page.getByRole("button", { ...options, includeHidden: true });
  const pane = await button.first().evaluate(element => element.closest<HTMLElement>("[data-pane]")?.dataset.pane);
  if (pane) await openMenu(page, pane);
  else if (await page.locator(".command-drawer").isVisible()) await page.getByRole("button", { name: "メニューを閉じる" }).click();
  return page.getByRole("button", { ...options, includeHidden: true });
}
export async function mapTile(page: Page, selector: string): Promise<Locator> {
  if (await page.locator(".command-drawer").isVisible()) await page.getByRole("button", { name: "メニューを閉じる" }).click();
  return page.locator(`.map-grid ${selector}`);
}
