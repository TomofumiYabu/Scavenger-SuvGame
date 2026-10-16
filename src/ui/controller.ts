import { act, newGame } from "../game/engine";
import { isSearchMode } from "../game/actions";
import type { Action, ChoiceId, EventId, Item } from "../game/model";
import { SaveStore } from "../game/storage";
import { captureFocus, connectDialogs, restoreFocus, reveal } from "./focus";
import { eventOutcome } from "./outcome";
import type { Outcome } from "./outcome";
import { render } from "./render";
import { shell } from "./templates";

export function startGame(app: HTMLElement): void {
  const store = new SaveStore(() => localStorage);
  let state = store.load();
  let selected = state.position;
  let outcome: Outcome | null = null;
  app.innerHTML = shell;
  const game = app.querySelector<HTMLElement>("#game")!;
  const dialogs = connectDialogs(app);
  const draw = () => render(game, { state, selected, store, outcome });
  const currentTile = () => game.querySelector<HTMLElement>(`[data-tile="${state.position}"]`);
  const focusState = () => reveal(state.pendingEvent ? game.querySelector("#event-title") : state.status !== "active" ? game.querySelector("#ending-title") : currentTile());
  draw();
  if (state.pendingEvent) reveal(game.querySelector("#event-title"));

  app.addEventListener("click", event => {
    const button = (event.target as Element).closest<HTMLButtonElement>("button");
    if (!button || button.disabled) return;
    const focus = captureFocus(button);
    if (button.dataset.tile !== undefined) {
      selected = Number(button.dataset.tile);
      draw(); restoreFocus(focus); return;
    }
    const command = button.dataset.action;
    if (command === "help" || command === "reset" || command === "restore") {
      dialogs.open(command, button); return;
    }
    if (command === "reset-confirm") {
      dialogs.close("reset");
      state = newGame(); selected = state.position; outcome = null;
      store.replace(state); draw(); focusState(); return;
    }
    if (command === "restore-confirm") {
      const backup = store.backup();
      dialogs.close("restore");
      if (backup && store.replace(backup)) {
        state = backup; selected = state.position; outcome = null;
        draw(); focusState();
      } else { draw(); reveal(game.querySelector('[data-action="restore"]')); }
      return;
    }
    if (command === "current" || command === "return-map") {
      selected = state.position;
      draw();
      if (command === "return-map") reveal(currentTile());
      else restoreFocus(focus);
      return;
    }
    if (command === "show-ending") { reveal(game.querySelector("#ending-title")); return; }
    let action: Action | undefined;
    if (command === "move") action = { type: "move", target: selected };
    if (command === "search" && isSearchMode(button.dataset.searchMode)) action = { type: "search", mode: button.dataset.searchMode };
    if (command === "rest" || command === "signal") action = { type: command };
    if (button.dataset.item) action = { type: "use", item: button.dataset.item as Item };
    if (button.dataset.choice) action = { type: "choose", event: button.dataset.event as EventId, tile: Number(button.dataset.eventTile), choice: button.dataset.choice as ChoiceId };
    if (!action) return;
    const next = act(state, action);
    if (next === state) return;
    const newEvent = !state.pendingEvent && !!next.pendingEvent;
    outcome = action.type === "choose" ? eventOutcome(state, next, action) : null;
    state = next;
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
