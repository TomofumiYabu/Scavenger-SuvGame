interface FocusSnapshot {
  element: HTMLElement | null;
  key?: string;
  description?: string;
  region: HTMLElement | null;
  x: number;
  y: number;
  top?: number;
  scroller: HTMLElement | null;
  capacityNotice: { element: HTMLElement; height: number } | null;
}

export function captureFocus(element: HTMLElement | null = document.activeElement instanceof HTMLElement ? document.activeElement : null): FocusSnapshot {
  const capacityNotice = element?.closest(".inventory")?.querySelector<HTMLElement>('[data-region="capacity-warning"]');
  return { element, key: element?.dataset.focus, description: element?.getAttribute("aria-describedby")?.replace(/-description$/, "") ?? undefined,
    region: element?.closest<HTMLElement>(".ground-item, .ground, .item, .location-actions, .map-panel, .inventory, .recovery") ?? null,
    x: window.scrollX, y: window.scrollY, top: element?.getBoundingClientRect().top, scroller: element?.closest<HTMLElement>(".drawer-scroll") ?? null,
    capacityNotice: capacityNotice ? { element: capacityNotice, height: capacityNotice.getBoundingClientRect().height } : null };
}

function usable(element: HTMLElement | null): element is HTMLElement {
  return !!element?.isConnected && !element.matches(":disabled") && !element.closest("[hidden]");
}

export function restoreFocus(snapshot: FocusSnapshot): void {
  // At the top of a drawer, scrolling cannot compensate for a removed warning.
  // Keep its space for this interaction; normal navigation redraws clear it.
  const notice = snapshot.capacityNotice;
  if (notice?.element.isConnected && !notice.element.childElementCount && notice.height > 0) notice.element.style.minHeight = `${notice.height}px`;
  const keyed = snapshot.key ? document.querySelector<HTMLElement>(`[data-focus="${CSS.escape(snapshot.key)}"]`) : null;
  let target = usable(snapshot.element) ? snapshot.element : usable(keyed) ? keyed : null;
  if (!target && snapshot.description) { const description = document.getElementById(snapshot.description); if (usable(description)) target = description; }
  if (!target && snapshot.region?.matches(".ground-item") && snapshot.region.closest("[hidden]")) target = document.getElementById("ground-title");
  if (!target && snapshot.region?.isConnected) target = snapshot.region.matches(".location-actions") ? snapshot.region : snapshot.region.querySelector<HTMLElement>("h3, h2, summary");
  if (target) target.focus({ preventScroll: true });
  const anchor = target && target === snapshot.element && snapshot.top !== undefined
    ? target.getBoundingClientRect().top - snapshot.top : 0;
  if (snapshot.scroller?.isConnected) snapshot.scroller.scrollTop += anchor;
  window.scrollTo(snapshot.x, snapshot.y + (snapshot.scroller ? 0 : anchor));
  if (target && target !== snapshot.element) {
    const box = target.getBoundingClientRect();
    if (box.bottom <= 0 || box.top >= innerHeight) target.scrollIntoView({ block: "nearest", behavior: "instant" });
  }
}

/** Intentional navigation always reveals the reading/focus target, even on narrow screens. */
export function reveal(target: HTMLElement | null): void {
  if (!target) return;
  target.focus({ preventScroll: true });
  target.scrollIntoView({ block: "center", inline: "nearest", behavior: "instant" });
}

export function connectDialogs(app: HTMLElement): { open: (name: string, invoker: HTMLElement) => void; close: (name: string) => void } {
  const sessions = new Map<HTMLDialogElement, { snapshot: FocusSnapshot; restore: boolean }>();
  app.querySelectorAll<HTMLDialogElement>("dialog").forEach(dialog => {
    dialog.addEventListener("close", () => {
      const session = sessions.get(dialog);
      sessions.delete(dialog);
      if (session?.restore) restoreFocus(session.snapshot);
    });
  });
  const dialogFor = (name: string) => app.querySelector<HTMLDialogElement>(`#${name}-dialog`)!;
  return {
    open(name, invoker) {
      const dialog = dialogFor(name);
      const snapshot = captureFocus(invoker);
      sessions.set(dialog, { snapshot, restore: true });
      dialog.showModal();
    },
    close(name) {
      const dialog = dialogFor(name);
      const session = sessions.get(dialog);
      if (session) session.restore = false;
      dialog.close();
    },
  };
}
