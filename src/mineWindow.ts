/**
 * Mine window — UI overlay for entering the mine / dungeon.
 * Remaining in cycle = rocks with health > 0; Stones update = next 6h UTC; Daily limit from character.
 */

import { logAction } from "./actionsLog";
import { getToken, getCharacter, getMiningRocks } from "./api";

const SIX_HOURS_MS = 6 * 60 * 60 * 1000;

function msUntilNextStonesUpdate(): number {
  const now = Date.now();
  const windowStart = Math.floor(now / SIX_HOURS_MS) * SIX_HOURS_MS;
  return windowStart + SIX_HOURS_MS - now;
}

function formatCountdown(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return [h, m, sec].map((n) => String(n).padStart(2, "0")).join(":");
}

export const mineState = {
  /** Rocks (for this account) with health > 0 in current 6h cycle. */
  remainingInCycle: 0,
  /** Daily mining limit from character. */
  dailyLimit: 0,
  /** Daily mined so far (for display if needed). */
  dailyMinedToday: 0,
};

let overlay: HTMLDivElement | null = null;
let escHandler: ((e: KeyboardEvent) => void) | null = null;
let stonesTimerId: ReturnType<typeof setInterval> | null = null;

const TRANSITION_PRELOADER_MS_LOADED = 1000;

export function showTransitionPreloader(logoUrl: string, onComplete: () => void): void {
  if (typeof document === "undefined") {
    onComplete();
    return;
  }
  const el = document.getElementById("game-preloader");
  if (!el) {
    onComplete();
    return;
  }
  const win = window as unknown as { __gameLoaded?: boolean; __onGameLoaded?: () => void };
  const img = el.querySelector(".game-preloader-logo") as HTMLImageElement | null;
  if (img) img.src = logoUrl;
  el.classList.remove("hidden");

  const hideAndComplete = () => {
    el.classList.add("hidden");
    onComplete();
  };

  if (win.__gameLoaded) {
    setTimeout(hideAndComplete, TRANSITION_PRELOADER_MS_LOADED);
  } else {
    win.__onGameLoaded = hideAndComplete;
  }
}

/**
 * Called when player confirms "Enter Mine". Shows preloader (pixm): 1s if game already loaded, else until loaded; then switches to map2.
 */
export function enterDungeon(): void {
  logAction("Enter Mine");
  const switchToMap = (typeof window !== "undefined" &&
    (window as unknown as { __switchToMap?: (mapId: string, options?: { spawnNear?: string }) => void }).__switchToMap);
  showTransitionPreloader("/assets/characters/pixm.png", () => {
    if (switchToMap) switchToMap("map2", { spawnNear: "valley" });
  });
}

/**
 * Called when player confirms "Enter Arena". Checks arena limits, shows preloader, then starts Arena scene.
 */
export function enterArena(): void {
  logAction("Enter Arena");
  const startArena = (typeof window !== "undefined" &&
    (window as unknown as { __startArena?: () => void }).__startArena);
  if (startArena) startArena();
}

function createWindow(): HTMLDivElement {
  const wrap = document.createElement("div");
  wrap.className = "mine-window-overlay";
  wrap.tabIndex = -1;
  wrap.innerHTML = `
    <div class="mine-window" role="dialog" aria-label="Mine" tabindex="0">
      <div class="mine-window-header">
        <div class="mine-window-title-row">
          <h2 class="mine-window-title">Mine</h2>
          <button type="button" class="mine-window-close" aria-label="Close">&times;</button>
        </div>
        <p class="mine-window-subtitle">Underground resources</p>
        <p class="mine-window-desc">Resources can be mined inside. Mining is limited by time and daily limits.</p>
      </div>
      <div class="mine-window-body">
        <section class="mine-block mine-block-info">
          <div class="mine-info-row"><span class="mine-info-label">Remaining in cycle:</span> <span class="mine-info-value" data-remaining-cycle>0</span></div>
          <div class="mine-info-row"><span class="mine-info-label">Stones update:</span> <span class="mine-info-value" data-stones-update>—</span></div>
          <div class="mine-info-row"><span class="mine-info-label">Daily resource limit:</span> <span class="mine-info-value" data-daily-limit>0</span></div>
        </section>
        <p class="mine-warning" data-mine-warning style="display: none;">You have reached your daily mining limit.</p>
        <section class="mine-block mine-block-action">
          <div class="mine-buttons-row">
            <button type="button" class="mine-btn-enter" data-btn-enter>Enter Mine</button>
          </div>
        </section>
      </div>
    </div>
  `;

  const panel = wrap.querySelector(".mine-window") as HTMLDivElement;
  if (!panel) return wrap;
  const closeBtn = panel.querySelector(".mine-window-close") as HTMLButtonElement;
  const btnEnter = panel.querySelector("[data-btn-enter]") as HTMLButtonElement;

  wrap.addEventListener("click", (e) => {
    if (e.target === wrap) closeMine();
  });
  if (closeBtn) closeBtn.addEventListener("click", () => closeMine());

  if (btnEnter) {
    btnEnter.addEventListener("click", () => {
      if (btnEnter.disabled) return;
      closeMine();
      enterDungeon();
    });
  }

  (wrap as unknown as { _mineRender: () => void })._mineRender = render;
  function render() {
    (panel.querySelector("[data-remaining-cycle]") as HTMLElement).textContent = String(mineState.remainingInCycle);
    const stonesEl = panel.querySelector("[data-stones-update]") as HTMLElement;
    if (stonesEl) stonesEl.textContent = formatCountdown(msUntilNextStonesUpdate());
    (panel.querySelector("[data-daily-limit]") as HTMLElement).textContent = String(mineState.dailyLimit);

    const warningEl = panel.querySelector("[data-mine-warning]") as HTMLElement;
    const isLimitReached = mineState.dailyMinedToday >= mineState.dailyLimit && mineState.dailyLimit > 0;
    if (warningEl) warningEl.style.display = isLimitReached ? "block" : "none";
    if (btnEnter) btnEnter.disabled = isLimitReached;
  }

  render();
  return wrap;
}

function bindState() {
  const o = overlay as unknown as { _mineRender?: () => void };
  o._mineRender?.();
}

/**
 * Mount the Mine window (call once at init or on first open).
 */
export function initMineWindow(container?: HTMLElement | null): void {
  if (overlay) return;
  const parent = container ?? (typeof document !== "undefined" ? (document.querySelector(".ui-scale-wrapper") ?? document.body) : null);
  if (!parent) return;
  overlay = createWindow();
  parent.appendChild(overlay);
  overlay.style.display = "none";
}

/**
 * Open the Mine window. Fetches character + rocks and updates state, then shows.
 */
export function openMine(): void {
  setTimeout(async () => {
    if (!overlay) {
      initMineWindow();
      if (!overlay) return;
    }
    const token = getToken();
    if (token) {
      const [charRes, rocksRes] = await Promise.all([
        getCharacter(token),
        getMiningRocks(token, "map2"),
      ]);
      if (charRes?.ok) {
        mineState.dailyLimit = charRes.data.character.dailyMiningLimit ?? 0;
        mineState.dailyMinedToday = charRes.data.character.dailyMinedToday ?? 0;
      }
      if (rocksRes?.ok && rocksRes.data.rocks) {
        mineState.remainingInCycle = rocksRes.data.rocks.filter((r) => r.healthPct > 0).length;
      }
    }
    bindState();
    const panel = overlay!.querySelector(".mine-window");
    (panel as HTMLElement)?.focus();
    overlay!.style.display = "flex";
    const stonesEl = overlay!.querySelector("[data-stones-update]") as HTMLElement;
    if (stonesTimerId) clearInterval(stonesTimerId);
    stonesTimerId = setInterval(() => {
      if (!overlay || overlay.style.display !== "flex") return;
      if (stonesEl) stonesEl.textContent = formatCountdown(msUntilNextStonesUpdate());
    }, 1000);
    escHandler = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeMine();
    };
    document.addEventListener("keydown", escHandler);
  }, 0);
}

export function closeMine(): void {
  if (stonesTimerId) {
    clearInterval(stonesTimerId);
    stonesTimerId = null;
  }
  if (!overlay) return;
  overlay.style.display = "none";
  if (escHandler) {
    document.removeEventListener("keydown", escHandler);
    escHandler = null;
  }
}

export function isMineOpen(): boolean {
  return !!overlay && overlay.style.display === "flex";
}
