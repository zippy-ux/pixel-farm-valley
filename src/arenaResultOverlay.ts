/**
 * Arena result overlay (victory/defeat) in site design — same look as mine/market windows.
 */

let overlay: HTMLDivElement | null = null;
let countdownInterval: ReturnType<typeof setInterval> | null = null;

function formatCooldown(isoUntil: string | null): string {
  if (!isoUntil) return "00:30:00";
  const end = new Date(isoUntil).getTime();
  const now = Date.now();
  const sec = Math.max(0, Math.floor((end - now) / 1000));
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function createOverlay(): HTMLDivElement {
  const wrap = document.createElement("div");
  wrap.className = "mine-window-overlay arena-result-overlay";
  wrap.setAttribute("role", "dialog");
  wrap.setAttribute("aria-label", "Arena result");
  wrap.tabIndex = -1;
  wrap.innerHTML = `
    <div class="mine-window arena-result-window">
      <div class="mine-window-header">
        <h2 class="mine-window-title arena-result-title" data-arena-title>VICTORY</h2>
      </div>
      <div class="mine-window-body">
        <p class="arena-result-sub" data-arena-sub>+10 XP</p>
        <div class="mine-buttons-row">
          <button type="button" class="mine-btn-enter" data-arena-back>Back to Valley</button>
        </div>
      </div>
    </div>
  `;
  return wrap;
}

const MAX_LEVEL = 10;

export function showArenaResult(
  result: "victory" | "defeat",
  options: { level?: number; battlesLeft?: number; maxBattlesPerDay?: number; cooldownUntil?: string | null },
  onBack: () => void
): void {
  if (countdownInterval) {
    clearInterval(countdownInterval);
    countdownInterval = null;
  }
  if (!overlay) {
    overlay = createOverlay();
    const parent = document.querySelector(".ui-scale-wrapper") ?? document.body;
    parent.appendChild(overlay);
  }
  const titleEl = overlay.querySelector("[data-arena-title]") as HTMLElement;
  const subEl = overlay.querySelector("[data-arena-sub]") as HTMLElement;
  const backBtn = overlay.querySelector("[data-arena-back]") as HTMLButtonElement;

  if (result === "victory") {
    titleEl.textContent = "VICTORY";
    titleEl.style.color = "#22c55e";
    subEl.textContent = (options.level ?? 0) >= MAX_LEVEL ? "+10 XP (max level)" : "+10 XP";
    subEl.style.display = "block";
  } else {
    titleEl.textContent = "DEFEAT";
    titleEl.style.color = "#ef4444";
    const left = options.battlesLeft ?? 0;
    const max = options.maxBattlesPerDay ?? 4;
    const updateSub = () => {
      subEl.textContent = `Battles left today: ${left}/${max}\nTry again in: ${formatCooldown(options.cooldownUntil ?? null)}`;
    };
    updateSub();
    subEl.style.display = "block";
    if (countdownInterval) clearInterval(countdownInterval);
    countdownInterval = setInterval(updateSub, 1000);
  }

  const hide = () => {
    overlay!.style.display = "none";
    if (countdownInterval) {
      clearInterval(countdownInterval);
      countdownInterval = null;
    }
  };

  backBtn.replaceWith(backBtn.cloneNode(true));
  const newBack = overlay.querySelector("[data-arena-back]") as HTMLButtonElement;
  newBack.addEventListener("click", () => {
    hide();
    onBack();
  });

  overlay.style.display = "flex";
  overlay.querySelector(".arena-result-window")?.focus();
}
