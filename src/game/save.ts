import { ITEM_IDS, LEGACY_ITEM_IDS } from "./items";
import { eventById, EVENTS } from "./events";
import { isSearchMode } from "./actions";
import { EVENT_ID, MAX_TURNS, SIZE, TOWER, neighbors, tileAt } from "./model";
import type { GameState } from "./model";

const record = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);
const integer = (value: unknown, min: number, max: number): value is number =>
  typeof value === "number" &&
  Number.isInteger(value) &&
  value >= min &&
  value <= max;
const tileList = (value: unknown): value is number[] =>
  Array.isArray(value) &&
  value.length <= SIZE * SIZE &&
  new Set(value).size === value.length &&
  value.every((id) => integer(id, 0, SIZE * SIZE - 1));

const SUPPORTED_CONTENT = [1, 2, 3, 4, 5];
const hasModernItems = (s: Record<string, unknown>): boolean => s.version === 2 && integer(s.contentVersion, 3, 5);
const hasGround = (s: Record<string, unknown>): boolean => s.version === 2 && integer(s.contentVersion, 4, 5);
// Content 1 knew only the cache; content 2–4 knew the original movement events.
const ORIGINAL_EVENT_IDS = [EVENT_ID, "clinic-supplies", "shelter-embers"];
const allowedEvents = (content: unknown) => EVENTS.filter(event => content === 5 || (content === 1 ? event.id === EVENT_ID : ORIGINAL_EVENT_IDS.includes(event.id)));
const supportedEvent = (id: string, content: unknown): boolean => allowedEvents(content).some(event => event.id === id);

export type SaveResult = { kind: "valid" | "migrated"; state: GameState } | { kind: "corrupt" | "unsupported" };

/** Read-only classification. Never modifies storage or draws random numbers. */
export function decodeSave(raw: string): SaveResult {
  let parsed: unknown;
  try { parsed = JSON.parse(raw); } catch { return { kind: "corrupt" }; }
  if (record(parsed) && (parsed.version !== 1 && parsed.version !== 2 || parsed.version === 2 && !SUPPORTED_CONTENT.includes(parsed.contentVersion as number))) return { kind: "unsupported" };
  if (record(parsed) && parsed.version === 2) {
    if (Array.isArray(parsed.resolvedEvents) && parsed.resolvedEvents.some(id => typeof id === "string" && !supportedEvent(id, parsed.contentVersion))) return { kind: "unsupported" };
    if (record(parsed.pendingEvent) && typeof parsed.pendingEvent.id === "string" && !supportedEvent(parsed.pendingEvent.id, parsed.contentVersion)) return { kind: "unsupported" };
  }
  if (record(parsed) && record(parsed.pendingEvent) && typeof parsed.pendingEvent.searchMode === "string" && !isSearchMode(parsed.pendingEvent.searchMode)) return { kind: "unsupported" };
  if (record(parsed) && record(parsed.inventory)) {
    const known: readonly string[] = hasModernItems(parsed) ? ITEM_IDS : LEGACY_ITEM_IDS;
    if (Object.keys(parsed.inventory).some(id => !known.includes(id))) return { kind: "unsupported" };
  }
  if (record(parsed) && hasGround(parsed) && record(parsed.ground)) {
    for (const pile of Object.values(parsed.ground)) {
      if (record(pile) && Object.keys(pile).some(id => !(ITEM_IDS as readonly string[]).includes(id))) return { kind: "unsupported" };
    }
  }
  const state = validate(raw);
  return state ? { kind: record(parsed) && (parsed.version === 1 || parsed.contentVersion !== 5) ? "migrated" : "valid", state } : { kind: "corrupt" };
}
export function deserialize(raw: string): GameState | null {
  const result = decodeSave(raw);
  return "state" in result ? result.state : null;
}
function validate(raw: string): GameState | null {
  try {
    const s: unknown = JSON.parse(raw);
    if (
      !record(s) ||
      (s.version !== 1 && s.version !== 2) ||
      !integer(s.turn, 0, MAX_TURNS) ||
      !integer(s.position, 0, SIZE * SIZE - 1) ||
      !integer(s.rng, 0, 0xffffffff)
    )
      return null;
    for (const key of ["health", "hunger", "thirst", "energy"])
      if (!integer(s[key], 0, 100)) return null;
    if (!record(s.inventory)) return null;
    for (const key of hasModernItems(s) ? ITEM_IDS : LEGACY_ITEM_IDS)
      if (!integer(s.inventory[key], 0, Number.MAX_SAFE_INTEGER)) return null;
    if (
      !tileList(s.discovered) ||
      !tileList(s.searched) ||
      !s.discovered.includes(s.position)
    )
      return null;
    const discovered = s.discovered;
    if (hasGround(s)) {
      if (!record(s.ground)) return null;
      for (const [key, pile] of Object.entries(s.ground)) {
        const id = Number(key);
        if (!integer(id, 0, SIZE * SIZE - 1) || String(id) !== key || !discovered.includes(id) || !record(pile)) return null;
        for (const [item, count] of Object.entries(pile)) {
          if (!(ITEM_IDS as readonly string[]).includes(item) || !integer(count, 0, Number.MAX_SAFE_INTEGER)) return null;
        }
      }
    }
    if (!s.searched.every((id) => discovered.includes(id))) return null;
    if (
      typeof s.status !== "string" ||
      !["active", "won", "dead", "lost"].includes(s.status)
    )
      return null;
    if (s.status === "active" && (s.health === 0 || s.turn >= MAX_TURNS))
      return null;
    if (s.status === "dead" && s.health !== 0) return null;
    if (s.status === "lost" && (s.turn !== MAX_TURNS || s.health === 0))
      return null;
    if (s.status === "won" && (s.position !== TOWER || s.health === 0))
      return null;
    const turn = s.turn;
    if (
      !Array.isArray(s.log) ||
      s.log.length > 12 ||
      !s.log.every(
        (entry) =>
          record(entry) &&
          integer(entry.turn, 0, turn) &&
          typeof entry.text === "string" &&
          entry.text.length <= 180 &&
          typeof entry.kind === "string" &&
          ["info", "good", "danger"].includes(entry.kind),
      )
    )
      return null;
    if (s.version === 2) {
      if (!SUPPORTED_CONTENT.includes(s.contentVersion as number) || !Array.isArray(s.resolvedEvents) || s.resolvedEvents.length > allowedEvents(s.contentVersion).length || new Set(s.resolvedEvents).size !== s.resolvedEvents.length || s.resolvedEvents.some(id => typeof id !== "string" || !supportedEvent(id, s.contentVersion))) return null;
      if (s.pendingEvent !== null) {
        const pending = s.pendingEvent;
        if (!record(pending) || typeof pending.id !== "string" || !supportedEvent(pending.id, s.contentVersion) || !integer(pending.tile, 0, SIZE * SIZE - 1) || pending.tile !== s.position || s.status !== "active" || s.resolvedEvents.includes(pending.id)) return null;
        const event = eventById(pending.id)!;
        if (tileAt(pending.tile).terrain !== event.terrain) return null;
        if (event.trigger === "search") {
          if (!isSearchMode(pending.searchMode) || !s.searched.includes(pending.tile)) return null;
        } else if ("searchMode" in pending) return null;
      }
    }
    // All fields used by the application were checked above. Never trust arbitrary saved HTML.
    // v1 IDs and fields are unchanged. Preserve progress and reveal the current
    // hex ring for square-grid saves, without inferring an unavailable route.
    return {
      ...s,
      version: 2, contentVersion: 5,
      ground: hasGround(s) ? s.ground : {},
      inventory: { snack: 0, electrolyte: 0, medkit: 0, coffee: 0, ...s.inventory },
      pendingEvent: s.version === 1 ? null : s.pendingEvent,
      resolvedEvents: s.version === 1 ? [] : s.resolvedEvents,
      discovered: [...new Set([...s.discovered, ...neighbors(s.position)])],
    } as unknown as GameState;
  } catch {
    return null;
  }
}
