import { act } from "../game/engine";
import { isSearchMode } from "../game/actions";
import { isItem } from "../game/items";
import type { Action, ChoiceId, EventId } from "../game/model";
import { SaveStore } from "../game/storage";
import { captureFocus, connectDialogs, restoreFocus, reveal } from "./focus";
import { eventOutcome } from "./outcome";
import type { Outcome } from "./outcome";
import { render } from "./render";
import { shell } from "./templates";
import type { Panel } from "./templates";
import { createExpedition } from "./seed";

export function startGame(app: HTMLElement): void {
  const store = new SaveStore(() => localStorage, createExpedition);
  let state = store.load();
  let selected = state.position;
  let outcome: Outcome | null = null;
  let panel: Panel = state.pendingEvent ? "encounter" : state.status !== "active" ? "ending" : null;
  let invoker = captureFocus(null);
  app.innerHTML = shell;
  const game = app.querySelector<HTMLElement>("#game")!;
  const dialogs = connectDialogs(app);
  const draw = () => render(game, { state, selected, store, outcome, panel });
  const currentTile = () => game.querySelector<HTMLElement>(`[data-tile="${state.position}"]`);
  const focusState = () => reveal(state.pendingEvent ? game.querySelector("#event-title") : state.status !== "active" ? game.querySelector("#ending-title") : currentTile());
  draw();
  if (state.pendingEvent || state.status !== "active") focusState();

  const closePanel = () => {
    panel = null; draw(); restoreFocus(invoker);
    if (!invoker.element || document.activeElement?.closest("[hidden]")) reveal(currentTile());
  };
  const openPanel = (name: Panel, source?: HTMLElement) => {
    if (source && !source.closest(".command-drawer")) invoker = captureFocus(source);
    panel = name; draw();
    const target = name === "encounter" ? state.pendingEvent ? "#event-title" : "#outcome-title" : name === "ending" ? "#ending-title" : name === "location" ? "#location-title" : name === "inventory" ? "#inventory-title" : name === "mission" ? "#mission-title" : name === "ground" ? "#ground-title" : name === "journal" ? "#journal-title" : "#settings-title";
    reveal(game.querySelector(target));
  };
  app.addEventListener("keydown", event => {
    if (!(event instanceof KeyboardEvent) || app.querySelector("dialog[open]")) return;
    if (event.key === "Escape" && panel) { event.preventDefault(); closePanel(); }
    if (event.key === "Tab" && panel) {
      const drawer = game.querySelector<HTMLElement>(".command-drawer")!;
      const controls = [...drawer.querySelectorAll<HTMLElement>('button:not(:disabled), summary, a[href], [tabindex="0"]')].filter(node => node.getClientRects().length > 0);
      const first = controls[0]; const last = controls.at(-1);
      if (event.shiftKey && (document.activeElement === first || !drawer.contains(document.activeElement))) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && (document.activeElement === last || !drawer.contains(document.activeElement))) { event.preventDefault(); first?.focus(); }
    }
  });
  app.addEventListener("click", event => {
    if ((event.target as Element).closest("[data-dismiss-panel]")) { closePanel(); return; }
    const button = (event.target as Element).closest<HTMLButtonElement>("button");
    if (!button || button.disabled) return;
    const focus = captureFocus(button);
    if (button.dataset.panel) {
      const name = button.dataset.panel as Panel;
      if (name === "location") selected = state.position;
      if (panel === name && button.closest(".command-dock")) closePanel();
      else openPanel(name, button);
      return;
    }
    if (button.dataset.tile !== undefined) {
      selected = Number(button.dataset.tile);
      openPanel("location", button); return;
    }
    const command = button.dataset.action;
    if (command === "close-panel") { closePanel(); return; }
    if (command === "help" || command === "reset" || command === "restore") {
      dialogs.open(command, button); return;
    }
    if (command === "reset-confirm") {
      dialogs.close("reset");
      state = createExpedition(); selected = state.position; outcome = null; panel = null;
      store.replace(state); draw(); focusState(); return;
    }
    if (command === "restore-confirm") {
      const backup = store.backup();
      dialogs.close("restore");
      if (backup && store.replace(backup)) {
        state = backup; selected = state.position; outcome = null; panel = state.pendingEvent ? "encounter" : state.status !== "active" ? "ending" : null;
        draw(); focusState();
      } else { draw(); reveal(game.querySelector('[data-action="restore"]')); }
      return;
    }
    if (command === "current" || command === "return-map") {
      selected = state.position;
      if (command === "return-map") { panel = null; draw(); reveal(currentTile()); }
      else openPanel("location", button);
      return;
    }
    if (command === "show-ground") { selected = state.position; openPanel("ground", button); return; }
    if (command === "show-ending") { openPanel("ending", button); return; }
    let action: Action | undefined;
    if (command === "move") action = { type: "move", target: selected };
    if (command === "search" && isSearchMode(button.dataset.searchMode)) action = { type: "search", mode: button.dataset.searchMode };
    if (command === "rest" || command === "signal" || command === "repair") action = { type: command };
    if (command === "pickup" || command === "drop") {
      const raw = button.dataset.quantity;
      if (!isItem(button.dataset.item) || !raw || !/^[1-9]\d*$/.test(raw)) return;
      const quantity = Number(raw);
      if (!Number.isSafeInteger(quantity)) return;
      action = { type: command, item: button.dataset.item, quantity };
    } else if (isItem(button.dataset.item)) action = { type: "use", item: button.dataset.item };
    if (button.dataset.choice) action = { type: "choose", event: button.dataset.event as EventId, tile: Number(button.dataset.eventTile), choice: button.dataset.choice as ChoiceId };
    if (!action) return;
    const next = act(state, action);
    if (next === state) return;
    const newEvent = !state.pendingEvent && !!next.pendingEvent;
    outcome = action.type === "choose" ? eventOutcome(state, next, action) : null;
    state = next;
    if (newEvent || outcome) panel = "encounter";
    else if (state.status !== "active") panel = "ending";
    const wasReady = store.mode === "ready";
    store.save(state);
    draw();
    if (wasReady && store.mode !== "ready") game.querySelector<HTMLDetailsElement>(".recovery details")!.open = true;
    if (newEvent) reveal(game.querySelector("#event-title"));
    else if (outcome) reveal(game.querySelector("#outcome-title"));
    else if (state.status !== "active") reveal(game.querySelector("#ending-title"));
    else restoreFocus(focus);
  });
}
