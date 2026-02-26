/**
 * Actions console (Last: … + expandable log).
 * Real player events: Enter Mine, Enter Valley, Mined +1 Gold/Silver/Bronze.
 * Persists last 100 entries per account in localStorage.
 */

const LAST_LABEL_SELECTOR = ".ui-actions-label";
const CONSOLE_SELECTOR = "#ui-actions-console";
const STORAGE_KEY_PREFIX = "pixelvalley_actions_log";
const MAX_ENTRIES = 100;

let currentAccountId: number | null = null;

/** Set current account so log is loaded/saved per account. Call after login; clear on logout. */
export function setActionsLogAccountId(accountId: number | null): void {
  currentAccountId = accountId;
}

function getStorageKey(): string {
  return currentAccountId != null ? `${STORAGE_KEY_PREFIX}_${currentAccountId}` : `${STORAGE_KEY_PREFIX}_anon`;
}

function getLabelEl(): HTMLElement | null {
  return typeof document !== "undefined" ? document.querySelector(LAST_LABEL_SELECTOR) : null;
}

function getConsoleEl(): HTMLElement | null {
  return typeof document !== "undefined" ? document.querySelector(CONSOLE_SELECTOR) : null;
}

function loadStoredLog(): string[] {
  if (typeof localStorage === "undefined") return [];
  try {
    const key = getStorageKey();
    const raw = localStorage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? parsed.filter((e): e is string => typeof e === "string").slice(0, MAX_ENTRIES) : [];
  } catch {
    return [];
  }
}

function saveLog(entries: string[]): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(getStorageKey(), JSON.stringify(entries.slice(0, MAX_ENTRIES)));
  } catch {
    /* ignore */
  }
}

function renderConsole(entries: string[]): void {
  const label = getLabelEl();
  const consoleEl = getConsoleEl();
  if (!consoleEl) return;
  consoleEl.innerHTML = "";
  for (const msg of entries) {
    const entry = document.createElement("div");
    entry.className = "entry";
    entry.textContent = msg;
    consoleEl.appendChild(entry);
  }
  if (label) {
    const first = entries[0];
    const short = first ? (first.length > 24 ? first.slice(0, 21) + "…" : first) : "—";
    label.textContent = `Last: ${short}`;
  }
}

/** Load last 100 logs from localStorage and render. Call once on load. */
export function initActionsLog(): void {
  const entries = loadStoredLog();
  renderConsole(entries);
  const label = getLabelEl();
  if (entries.length === 0 && label) label.textContent = "Last: —";
}

/** Append an action to the log (persist last 100), update "Last: …" and DOM. */
export function logAction(message: string): void {
  const entries = loadStoredLog();
  entries.unshift(message);
  const trimmed = entries.slice(0, MAX_ENTRIES);
  saveLog(trimmed);
  renderConsole(trimmed);
}
