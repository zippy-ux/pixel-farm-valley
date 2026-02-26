/**
 * Valley window (map2) — shown when player reaches Valley/entrance. Single Exit button returns to map1 near Mine.
 */

import { showTransitionPreloader } from "./mineWindow";

let overlay: HTMLDivElement | null = null;
let escHandler: ((e: KeyboardEvent) => void) | null = null;

export function openValley(): void {
  setTimeout(() => {
    if (!overlay) {
      initValleyWindow();
      if (!overlay) return;
    }
    overlay!.style.display = "flex";
    overlay!.querySelector(".valley-window")?.focus();
    escHandler = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeValley();
    };
    document.addEventListener("keydown", escHandler);
  }, 0);
}

export function closeValley(): void {
  if (overlay) overlay.style.display = "none";
  if (escHandler) {
    document.removeEventListener("keydown", escHandler);
    escHandler = null;
  }
}

export function isValleyOpen(): boolean {
  return !!overlay?.style.display && overlay.style.display !== "none";
}

function createWindow(): HTMLDivElement {
  const wrap = document.createElement("div");
  wrap.className = "mine-window-overlay valley-window-overlay";
  wrap.tabIndex = -1;
  wrap.innerHTML = `
    <div class="mine-window valley-window" role="dialog" aria-label="Valley" tabindex="0">
      <div class="mine-window-header">
        <div class="mine-window-title-row">
          <h2 class="mine-window-title">Valley</h2>
          <button type="button" class="mine-window-close" aria-label="Close">&times;</button>
        </div>
      </div>
      <div class="mine-window-body">
        <section class="mine-block mine-block-action">
          <button type="button" class="mine-btn-enter" data-valley-exit>Exit</button>
        </section>
      </div>
    </div>
  `;
  const panel = wrap.querySelector(".valley-window") as HTMLDivElement;
  if (!panel) return wrap;
  const closeBtn = panel.querySelector(".mine-window-close") as HTMLButtonElement;
  const btnExit = panel.querySelector("[data-valley-exit]") as HTMLButtonElement;
  wrap.addEventListener("click", (e) => {
    if (e.target === wrap) closeValley();
  });
  if (closeBtn) closeBtn.addEventListener("click", () => closeValley());
  if (btnExit) {
    btnExit.addEventListener("click", () => {
      closeValley();
      const sw = (window as unknown as { __switchToMap?: (id: string, o?: { spawnNear?: string }) => void }).__switchToMap;
      showTransitionPreloader("/assets/characters/pixm.png", () => {
        if (sw) sw("map1", { spawnNear: "mine" });
      });
    });
  }
  return wrap;
}

export function initValleyWindow(container?: HTMLElement | null): void {
  if (overlay) return;
  const parent = container ?? (typeof document !== "undefined" ? (document.querySelector(".ui-scale-wrapper") ?? document.body) : null);
  if (!parent) return;
  overlay = createWindow();
  parent.appendChild(overlay);
  overlay.style.display = "none";
}
