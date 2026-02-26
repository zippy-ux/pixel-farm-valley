/**
 * Arena window — UI overlay when approaching the Arena on map1.
 */

import { logAction } from "./actionsLog";
import { getToken, getArenaState } from "./api";
import { openPvpArena } from "./pvpArenaWindow";

export const arenaState = {
  canStart: false,
  battlesLeft: 0,
  maxBattlesPerDay: 4,
  winsToday: 0,
  resetAt: "",
  cooldownUntil: null as string | null,
  /** Persisted run (resume after API restart). When set, show "Continue" and do not consume an extra battle. */
  activeRun: null as {
    runId: string;
    playerHp: number;
    playerMaxHp: number;
    currentWave0: number;
    totalWaves: number;
    monsters: { hp: number; maxHp: number; damage: number }[];
  } | null,
};

let overlay: HTMLDivElement | null = null;
let escHandler: ((e: KeyboardEvent) => void) | null = null;
let resetTimerId: ReturnType<typeof setInterval> | null = null;

function msUntil(isoDate: string): number {
  return Math.max(0, new Date(isoDate).getTime() - Date.now());
}

function formatCountdown(ms: number): string {
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return [h, m, sec].map((n) => String(n).padStart(2, "0")).join(":");
}

const isPvpArenaEnabled = (): boolean =>
  typeof window !== "undefined" && window.location.hostname.includes("staging");

function createWindow(): HTMLDivElement {
  const wrap = document.createElement("div");
  wrap.className = "arena-window-overlay";
  wrap.tabIndex = -1;
  const pvpButtonHtml = isPvpArenaEnabled()
    ? ' <button type="button" class="arena-btn-pvp" data-btn-pvp>PVP ARENA</button>'
    : "";
  wrap.innerHTML =
    '<div class="arena-window" role="dialog" aria-label="Arena" tabindex="0">' +
    '<div class="arena-window-header">' +
    '<div class="arena-window-title-row"><h2 class="arena-window-title">Arena</h2>' +
    '<button type="button" class="arena-window-close" aria-label="Close">&times;</button></div>' +
    '<p class="arena-window-subtitle">Fight monsters</p>' +
    '<p class="arena-window-desc">You have 4 battles per day. Win gives 10 XP; loss gives nothing and a 30-minute cooldown if you still have battles left.</p>' +
    "</div>" +
    '<div class="arena-window-body">' +
    '<section class="arena-block arena-block-info">' +
    '<div class="arena-info-row"><span class="arena-info-label">Battles left today:</span> <span class="arena-info-value" data-battles-left>0</span></div>' +
    '<div class="arena-info-row"><span class="arena-info-label">Battles reset in:</span> <span class="arena-info-value" data-reset-timer>—</span></div>' +
    '<div class="arena-info-row arena-cooldown-row" data-cooldown-row style="display:none"><span class="arena-info-label">Arena opens in:</span> <span class="arena-info-value" data-cooldown-timer>—</span></div>' +
    "</section>" +
    '<section class="arena-block arena-block-action">' +
    '<div class="arena-buttons-row"><button type="button" class="arena-btn-enter" data-btn-enter>Enter Arena</button>' +
    pvpButtonHtml +
    "</div></section></div></div>";
  const panel = wrap.querySelector(".arena-window") as HTMLDivElement;
  if (!panel) return wrap;
  const closeBtn = panel.querySelector(".arena-window-close") as HTMLButtonElement;
  const btnEnter = panel.querySelector("[data-btn-enter]") as HTMLButtonElement;
  const btnPvp = panel.querySelector("[data-btn-pvp]") as HTMLButtonElement;
  if (btnPvp) btnPvp.addEventListener("click", () => { closeArena(); openPvpArena(); });
  wrap.addEventListener("click", (e) => {
    if (e.target === wrap) closeArena();
  });
  if (closeBtn) closeBtn.addEventListener("click", () => closeArena());
  if (btnEnter) {
    btnEnter.addEventListener("click", () => {
      if (btnEnter.disabled) return;
      closeArena();
      const startArena = (typeof window !== "undefined" && (window as unknown as { __startArena?: () => void }).__startArena);
      if (startArena) {
        logAction(arenaState.activeRun ? "Continue Arena" : "Enter Arena");
        startArena();
      }
    });
  }
  (wrap as unknown as { _arenaRender: () => void })._arenaRender = render;
  function render() {
    (panel.querySelector("[data-battles-left]") as HTMLElement).textContent = String(arenaState.battlesLeft);
    const resetEl = panel.querySelector("[data-reset-timer]") as HTMLElement;
    if (resetEl) resetEl.textContent = formatCountdown(msUntil(arenaState.resetAt || new Date().toISOString()));
    const cooldownRow = panel.querySelector("[data-cooldown-row]") as HTMLElement;
    const cooldownEl = panel.querySelector("[data-cooldown-timer]") as HTMLElement;
    const showCooldown = !!arenaState.cooldownUntil && arenaState.battlesLeft > 0;
    if (cooldownRow) cooldownRow.style.display = showCooldown ? "" : "none";
    if (cooldownEl && arenaState.cooldownUntil) cooldownEl.textContent = formatCountdown(msUntil(arenaState.cooldownUntil));
    const canContinue = !!arenaState.activeRun;
    if (btnEnter) {
      btnEnter.disabled = !arenaState.canStart && !canContinue;
      btnEnter.textContent = canContinue ? "Continue" : "Enter Arena";
    }
  }
  render();
  return wrap;
}

function bindState() {
  (overlay as unknown as { _arenaRender?: () => void })?._arenaRender?.();
}

export function initArenaWindow(container?: HTMLElement | null): void {
  if (overlay) return;
  const parent = container ?? (typeof document !== "undefined" ? (document.querySelector(".ui-scale-wrapper") ?? document.body) : null);
  if (!parent) return;
  overlay = createWindow();
  parent.appendChild(overlay);
  overlay.style.display = "none";
}

export function openArena(): void {
  setTimeout(async () => {
    if (!overlay) {
      initArenaWindow();
      if (!overlay) return;
    }
    const token = getToken();
    if (token) {
      const res = await getArenaState(token);
      if (res.ok && res.data) {
        arenaState.canStart = res.data.canStart;
        arenaState.battlesLeft = res.data.battlesLeft ?? 0;
        arenaState.maxBattlesPerDay = res.data.maxBattlesPerDay ?? 4;
        arenaState.winsToday = res.data.winsToday ?? 0;
        arenaState.resetAt = res.data.resetAt ?? new Date().toISOString();
        arenaState.cooldownUntil = res.data.cooldownUntil ?? null;
        arenaState.activeRun = res.data.activeRun ?? null;
      }
    }
    bindState();
    const btnEnter = overlay!.querySelector("[data-btn-enter]") as HTMLButtonElement;
    if (btnEnter) {
      const canContinue = !!arenaState.activeRun;
      btnEnter.disabled = !arenaState.canStart && !canContinue;
      btnEnter.textContent = canContinue ? "Continue" : "Enter Arena";
    }
    (overlay!.querySelector(".arena-window") as HTMLElement)?.focus();
    overlay!.style.display = "flex";
    const resetEl = overlay!.querySelector("[data-reset-timer]") as HTMLElement;
    const cooldownEl = overlay!.querySelector("[data-cooldown-timer]") as HTMLElement;
    if (resetTimerId) clearInterval(resetTimerId);
    resetTimerId = setInterval(() => {
      if (!overlay || overlay.style.display !== "flex") return;
      if (resetEl) resetEl.textContent = formatCountdown(msUntil(arenaState.resetAt));
      if (arenaState.cooldownUntil && cooldownEl) cooldownEl.textContent = formatCountdown(msUntil(arenaState.cooldownUntil));
    }, 1000);
    escHandler = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeArena();
    };
    document.addEventListener("keydown", escHandler);
  }, 0);
}

export function closeArena(): void {
  if (resetTimerId) {
    clearInterval(resetTimerId);
    resetTimerId = null;
  }
  if (!overlay) return;
  overlay.style.display = "none";
  if (escHandler) {
    document.removeEventListener("keydown", escHandler);
    escHandler = null;
  }
}

export function isArenaOpen(): boolean {
  return !!overlay && overlay.style.display === "flex";
}
