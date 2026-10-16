import { newGame } from "./engine";
import { LEGACY_SAVE_KEY, SAVE_KEY } from "./model";
import type { GameState } from "./model";
import { decodeSave } from "./save";

export const BACKUP_KEY = `${SAVE_KEY}.backup`;
export const ARCHIVE_PREFIX = `${SAVE_KEY}.original.`;
export interface StorageAccess { getItem(key: string): string | null; setItem(key: string, value: string): void }
export type StorageMode = "ready" | "protected" | "unavailable";
/** The controller keeps writes separate from read-only decoding and fails closed. */
export class SaveStore {
  mode: StorageMode = "ready";
  message = "";
  private expected: string | null = null;
  private legacyProtected = false;
  private migratedSnapshot: string | null = null;
  constructor(private readonly access: () => StorageAccess) {}
  load(): GameState {
    try {
      this.expected = this.access().getItem(SAVE_KEY);
      const raw = this.expected ?? this.access().getItem(LEGACY_SAVE_KEY);
      if (raw === null) return newGame();
      const result = decodeSave(raw);
      if ("state" in result) {
        if (result.kind === "migrated") { this.message = "以前の探索を引き継ぎました。元の保存データは保持しています。"; this.migratedSnapshot = JSON.stringify(result.state); }
        return result.state;
      }
      this.mode = "protected";
      this.legacyProtected = this.expected === null;
      this.message = result.kind === "unsupported" ? "この保存データは現在のゲームでは対応していません。元のデータを保護し、保存せずに遊べます。" : "保存データを読み込めなかったため、元のデータを保護しています。保存せずに新しい探索を遊べます。";
    } catch { this.fail("このブラウザでは保存できません。ページを閉じると進行状況が失われます。"); }
    return newGame();
  }
  private fail(message = "自動保存できませんでした。元の保存は保持しています。ページを閉じると今回の進行状況が失われる可能性があります。"): false {
    this.mode = "unavailable"; this.message = message; return false;
  }
  private verifiedWrite(key: string, raw: string): void {
    const storage = this.access(); storage.setItem(key, raw);
    if (storage.getItem(key) !== raw) throw new Error("Storage verification failed");
  }
  private archive(raw: string, reuse = false): void {
    let index = 0;
    while (this.access().getItem(`${ARCHIVE_PREFIX}${index}`) !== null) {
      if (reuse && this.access().getItem(`${ARCHIVE_PREFIX}${index}`) === raw) return;
      index++;
    }
    this.verifiedWrite(`${ARCHIVE_PREFIX}${index}`, raw);
  }
  save(state: GameState): boolean {
    if (this.mode === "protected") return false;
    if (this.mode === "unavailable") return this.fail();
    try {
      const raw = JSON.stringify(state);
      if (decodeSave(raw).kind !== "valid") return this.fail("今回の進行を保存できませんでした。元の保存を保護し、画面上だけで続けます。");
      const current = this.access().getItem(SAVE_KEY);
      if (current !== this.expected || current !== null && !("state" in decodeSave(current))) {
        this.mode = "protected"; this.message = "保存データが別の画面で変更されたため保護しました。再読込して確認してください。今回の探索は保存されません。"; return false;
      }
      // Keep the exact old catalog raw permanently before rotating ordinary backups.
      if (current !== null && decodeSave(current).kind === "migrated") this.archive(current, true);
      if (current !== null) this.verifiedWrite(BACKUP_KEY, current);
      else if (this.migratedSnapshot !== null) this.verifiedWrite(BACKUP_KEY, this.migratedSnapshot);
      this.verifiedWrite(SAVE_KEY, raw); this.expected = raw; return true;
    } catch { return this.fail(); }
  }
  backup(): GameState | null {
    try { const raw = this.access().getItem(BACKUP_KEY); if (!raw) return null; const result = decodeSave(raw); return "state" in result ? result.state : null; } catch { return null; }
  }
  /** Explicit reset/restore archives the actual primary first, never deleting archives or v1. */
  replace(state: GameState): boolean {
    try {
      const raw = JSON.stringify(state);
      if (decodeSave(raw).kind !== "valid") return this.fail("今回の進行を保存できませんでした。元の保存を保護し、画面上だけで続けます。");
      const current = this.access().getItem(SAVE_KEY);
      const source = current ?? (this.legacyProtected ? this.access().getItem(LEGACY_SAVE_KEY) : null);
      if (source !== null) {
        this.archive(source);
      }
      this.verifiedWrite(SAVE_KEY, raw); this.expected = raw;
      this.mode = "ready"; this.legacyProtected = false;
      this.message = "保存を切り替えました。変更前のデータはブラウザ内に保持しています。";
      return true;
    } catch { return this.fail("保存の切り替えを確認できませんでした。元のデータは保持しています。今回の探索をメモリ上で続けます。"); }
  }
}
