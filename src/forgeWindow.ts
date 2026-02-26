/**
 * Forge window — Fusion (bronze→silver, silver→gold), Leaderboard (burned PFV), Guide.
 * State from GET /api/forge/state; refine via POST /api/forge/refine.
 */

import "./forgeWindow.css";
import {
  getToken,
  getForgeState,
  postForgeRefine,
  getForgeLeaderboard,
  getCharacter,
  type ForgeStateResponse,
  type ForgeLeaderboardRow,
} from "./api";
import { applyCharacterData } from "./gameState";
import { syncHeader } from "./uiHeader";
import { escapeHtml, formatPfv as formatPfvUtil, formatPfvSpace as formatPfvSpaceUtil, safeAvatarUrl } from "./utils";
import { logAction } from "./actionsLog";

const GOLD_ICON = "/assets/interface/gold.png";
const SILVER_ICON = "/assets/interface/silver.png";
const BRONZE_ICON = "/assets/interface/bronze.png";

type ForgeTab = "fusion" | "leaderboard" | "guide";

let overlay: HTMLDivElement | null = null;
let escHandler: ((e: KeyboardEvent) => void) | null = null;
let toastEl: HTMLDivElement | null = null;

let forgeState: ForgeStateResponse | null = null;
let leaderboardList: ForgeLeaderboardRow[] = [];
let leaderboardPeriod: "all" | "today" = "all";

function showToast(message: string) {
  if (!toastEl) return;
  toastEl.textContent = message;
  toastEl.classList.add("forge-toast-visible");
  setTimeout(() => toastEl?.classList.remove("forge-toast-visible"), 2500);
}

const formatPfv = formatPfvUtil;
const formatPfvSpace = formatPfvSpaceUtil;

const FORGE_GUIDE_HTML = `
  <h3 class="forge-guide-title">How the Forge works</h3>
  <p class="forge-guide-section"><strong>Density</strong><br>Bronze = 1 &nbsp; Silver = 3 &nbsp; Gold = 9</p>
  <p class="forge-guide-section"><strong>Fusion</strong><br>3 Bronze → 1 Silver<br>3 Silver → 1 Gold<br>Each conversion costs $PFV based on the current Price per Density.</p>
  <p class="forge-guide-section"><strong>$PFV</strong><br>Uses $PFV from your balance.</p>
  <p class="forge-guide-section"><strong>Inventory</strong><br>Refined resources go to your backpack. Free space is required.</p>
  <p class="forge-guide-section"><strong>Leaderboard</strong><br>Shows who burned the most $PFV (today / all time).</p>
  <p class="forge-guide-summary"><strong>Summary</strong><br>Select resource → click REFINE → receive upgraded resource.</p>
`;

function createWindow(): HTMLDivElement {
  const wrap = document.createElement("div");
  wrap.className = "forge-window-overlay";
  wrap.tabIndex = -1;

  wrap.innerHTML = `
    <div class="forge-window" role="dialog" aria-label="Forge" tabindex="0">
      <div class="forge-window-header">
        <div class="forge-window-title-row">
          <h2 class="forge-window-title">Forge</h2>
          <button type="button" class="forge-window-close" aria-label="Close">&times;</button>
        </div>
        <div class="forge-top-block">
          <div class="forge-top-card">
            <span class="forge-top-card-label">Total Burned $PFV</span>
            <span class="forge-top-card-value forge-value-green" data-forge-total-burned>0</span>
          </div>
          <div class="forge-top-card">
            <span class="forge-top-card-label">Today Burned $PFV</span>
            <span class="forge-top-card-value forge-value-green" data-forge-today-burned>0</span>
          </div>
          <div class="forge-top-card">
            <span class="forge-top-card-label">Density Price</span>
            <span class="forge-top-card-value forge-value-green" data-forge-price>0</span>
          </div>
        </div>
        <p class="forge-burn-notice forge-burn-notice-yellow">All $PFV used for the Forge will be burned.</p>
        <div class="forge-your-stats-block">
          <p class="forge-your-stats-title">Your stats</p>
          <div class="forge-top-block forge-your-stats-cards">
            <div class="forge-top-card">
              <span class="forge-top-card-label">TOTAL BURNED $PFV</span>
              <span class="forge-top-card-value forge-value-green" data-forge-user-total-burned>0</span>
            </div>
            <div class="forge-top-card">
              <span class="forge-top-card-label">TODAY BURNED $PFV</span>
              <span class="forge-top-card-value forge-value-green" data-forge-user-today-burned>0</span>
            </div>
          </div>
        </div>
        <nav class="forge-tabs" role="tablist">
          <button type="button" class="forge-tab" data-tab="fusion" role="tab">Fusion</button>
          <button type="button" class="forge-tab" data-tab="leaderboard" role="tab">Leaderboard</button>
          <button type="button" class="forge-tab" data-tab="guide" role="tab">Guide</button>
        </nav>
      </div>
      <div class="forge-window-body">
        <div class="forge-panel forge-panel-fusion" data-panel="fusion" hidden>
          <div class="forge-fusion-cards">
            <div class="forge-fusion-card">
              <span class="forge-fusion-card-title">Bronze → Silver</span>
              <p class="forge-fusion-desc">3 Bronze + 3×Density $PFV = 1 Silver</p>
              <div class="forge-fusion-row">
                <span class="forge-fusion-cell"><img src="${BRONZE_ICON}" alt="" width="20" height="20" /><input type="number" min="3" step="3" data-forge-silver-amount value="3" placeholder="3" /></span>
                <span class="forge-fusion-eq">=</span>
                <span class="forge-fusion-output" data-forge-silver-output>1</span>
                <span class="forge-fusion-res-icon"><img src="${SILVER_ICON}" alt="Silver" width="20" height="20" /></span>
                <span class="forge-fusion-cost" data-forge-silver-cost>Cost: 0 $PFV</span>
              </div>
              <button type="button" class="forge-btn forge-btn-refine" data-forge-refine-silver>REFINE</button>
            </div>
            <div class="forge-fusion-card">
              <span class="forge-fusion-card-title">Silver → Gold</span>
              <p class="forge-fusion-desc">3 Silver + 8×Density $PFV = 1 Gold</p>
              <div class="forge-fusion-row">
                <span class="forge-fusion-cell"><img src="${SILVER_ICON}" alt="" width="20" height="20" /><input type="number" min="3" step="3" data-forge-gold-amount value="3" placeholder="3" /></span>
                <span class="forge-fusion-eq">=</span>
                <span class="forge-fusion-output" data-forge-gold-output>1</span>
                <span class="forge-fusion-res-icon"><img src="${GOLD_ICON}" alt="Gold" width="20" height="20" /></span>
                <span class="forge-fusion-cost" data-forge-gold-cost>Cost: 0 $PFV</span>
              </div>
              <button type="button" class="forge-btn forge-btn-refine" data-forge-refine-gold>REFINE</button>
            </div>
          </div>
        </div>
        <div class="forge-panel forge-panel-leaderboard" data-panel="leaderboard" hidden>
          <div class="forge-leaderboard-toggles">
            <button type="button" class="forge-lb-btn" data-forge-lb-period="all">All</button>
            <button type="button" class="forge-lb-btn" data-forge-lb-period="today">Today</button>
          </div>
          <div class="forge-table-card">
            <div class="forge-table-wrap">
              <table class="forge-table">
                <thead><tr><th>#</th><th>USER</th><th>LEVEL</th><th>BURNED $PFV</th></tr></thead>
                <tbody data-forge-leaderboard-tbody></tbody>
              </table>
            </div>
          </div>
        </div>
        <div class="forge-panel forge-panel-guide" data-panel="guide" hidden>
          <div class="forge-guide-content">${FORGE_GUIDE_HTML}</div>
        </div>
      </div>
      <div class="forge-toast" data-forge-toast aria-live="polite"></div>
    </div>
  `;

  const panel = wrap.querySelector(".forge-window") as HTMLDivElement;
  toastEl = panel.querySelector("[data-forge-toast]") as HTMLDivElement;

  wrap.addEventListener("click", (e) => {
    if (e.target === wrap) closeForge();
  });
  panel.querySelector(".forge-window-close")?.addEventListener("click", () => closeForge());

  let activeTab: ForgeTab = "fusion";
  panel.querySelectorAll(".forge-tab").forEach((btn) => {
    btn.addEventListener("click", () => {
      activeTab = (btn as HTMLElement).dataset.tab as ForgeTab;
      panel.querySelectorAll(".forge-panel").forEach((p) => (p as HTMLElement).setAttribute("hidden", ""));
      const sel = panel.querySelector(`[data-panel="${activeTab}"]`);
      if (sel) (sel as HTMLElement).removeAttribute("hidden");
      panel.querySelectorAll(".forge-tab").forEach((t) => (t as HTMLElement).classList.remove("forge-tab-active"));
      (btn as HTMLElement).classList.add("forge-tab-active");
      if (activeTab === "leaderboard") {
        getForgeLeaderboard(leaderboardPeriod).then((r) => {
          leaderboardList = r.ok ? r.data.list : [];
          render();
        });
      }
      render();
    });
  });

  // Fusion: update output and cost on input change
  const silverAmountInput = panel.querySelector("[data-forge-silver-amount]") as HTMLInputElement;
  const goldAmountInput = panel.querySelector("[data-forge-gold-amount]") as HTMLInputElement;
  function updateFusionLabels() {
    const price = forgeState?.pricePerDensity ?? 0;
    const sAmt = Math.max(0, Math.floor(Number(silverAmountInput?.value) || 0));
    const gAmt = Math.max(0, Math.floor(Number(goldAmountInput?.value) || 0));
    const sOut = Math.floor(sAmt / 3);
    const gOut = Math.floor(gAmt / 3);
    const sCost = sOut * 3 * price;
    const gCost = gOut * 8 * price;
    const soEl = panel.querySelector("[data-forge-silver-output]");
    const goEl = panel.querySelector("[data-forge-gold-output]");
    const scEl = panel.querySelector("[data-forge-silver-cost]");
    const gcEl = panel.querySelector("[data-forge-gold-cost]");
    if (soEl) soEl.textContent = String(sOut);
    if (goEl) goEl.textContent = String(gOut);
    if (scEl) scEl.textContent = `Cost: ${formatPfv(sCost)} $PFV`;
    if (gcEl) gcEl.textContent = `Cost: ${formatPfv(gCost)} $PFV`;
  }
  silverAmountInput?.addEventListener("input", updateFusionLabels);
  goldAmountInput?.addEventListener("input", updateFusionLabels);

  // Refine buttons
  panel.querySelector("[data-forge-refine-silver]")?.addEventListener("click", async () => {
    const amount = Math.floor(Number(silverAmountInput?.value) || 0);
    if (amount < 3 || amount % 3 !== 0) {
      showToast("Enter amount ≥ 3, multiple of 3.");
      return;
    }
    const token = getToken();
    if (!token) return;
    const res = await postForgeRefine(token, { type: "silver", amount });
    if (res.ok) {
      const outCount = Math.floor(amount / 3);
      logAction(`Refined ${outCount} Silver`);
      const charRes = await getCharacter(token);
      if (charRes?.ok) {
        applyCharacterData(charRes.data.character, charRes.data.slots);
        syncHeader();
      }
      getForgeState(token).then((r) => {
        if (r.ok) forgeState = r.data;
        updateFusionLabels();
        render();
      });
      showToast(`Refined! Burned ${formatPfv(res.data.burnedPfv)} $PFV.`);
    } else {
      const err = res.error ?? "Refine failed.";
      const msg =
        err === "inventory_full"
          ? "Inventory full! Free a slot first."
          : err === "not_enough_pfv"
            ? "Not enough $PFV!"
            : err === "not_enough_resources"
              ? "Not enough Bronze!"
              : err === "invalid_amount"
                ? "Invalid amount (min 3, multiple of 3)."
                : err === "price_not_set"
                  ? "Forge price not set. Try later."
                  : err;
      showToast(msg);
    }
  });

  panel.querySelector("[data-forge-refine-gold]")?.addEventListener("click", async () => {
    const amount = Math.floor(Number(goldAmountInput?.value) || 0);
    if (amount < 3 || amount % 3 !== 0) {
      showToast("Enter amount ≥ 3, multiple of 3.");
      return;
    }
    const token = getToken();
    if (!token) return;
    const res = await postForgeRefine(token, { type: "gold", amount });
    if (res.ok) {
      const outCount = Math.floor(amount / 3);
      logAction(`Refined ${outCount} Gold`);
      const charRes = await getCharacter(token);
      if (charRes?.ok) {
        applyCharacterData(charRes.data.character, charRes.data.slots);
        syncHeader();
      }
      getForgeState(token).then((r) => {
        if (r.ok) forgeState = r.data;
        updateFusionLabels();
        render();
      });
      showToast(`Refined! Burned ${formatPfv(res.data.burnedPfv)} $PFV.`);
    } else {
      const err = res.error ?? "Refine failed.";
      const msg =
        err === "inventory_full"
          ? "Inventory full! Free a slot first."
          : err === "not_enough_pfv"
            ? "Not enough $PFV!"
            : err === "not_enough_resources"
              ? "Not enough Silver!"
              : err === "invalid_amount"
                ? "Invalid amount (min 3, multiple of 3)."
                : err === "price_not_set"
                  ? "Forge price not set. Try later."
                  : err;
      showToast(msg);
    }
  });

  // Leaderboard period
  panel.querySelectorAll("[data-forge-lb-period]").forEach((btn) => {
    btn.addEventListener("click", () => {
      leaderboardPeriod = (btn as HTMLElement).dataset.forgeLbPeriod === "today" ? "today" : "all";
      getForgeLeaderboard(leaderboardPeriod).then((r) => {
        leaderboardList = r.ok ? r.data.list : [];
        render();
      });
    });
  });

  function render() {
    if (forgeState) {
      const totalBurned = forgeState.globalTotalBurnedPfv ?? forgeState.totalBurnedPfv ?? 0;
      const todayBurned = forgeState.globalTodayBurnedPfv ?? forgeState.todayBurnedPfv ?? 0;
      const userTotal = forgeState.totalBurnedPfv ?? 0;
      const userToday = forgeState.todayBurnedPfv ?? 0;
      (panel.querySelector("[data-forge-total-burned]") as HTMLElement).textContent = formatPfv(totalBurned);
      (panel.querySelector("[data-forge-today-burned]") as HTMLElement).textContent = formatPfv(todayBurned);
      (panel.querySelector("[data-forge-price]") as HTMLElement).textContent = String(forgeState.pricePerDensity);
      (panel.querySelector("[data-forge-user-total-burned]") as HTMLElement).textContent = formatPfv(userTotal);
      (panel.querySelector("[data-forge-user-today-burned]") as HTMLElement).textContent = formatPfv(userToday);
    } else {
      (panel.querySelector("[data-forge-total-burned]") as HTMLElement).textContent = "0";
      (panel.querySelector("[data-forge-today-burned]") as HTMLElement).textContent = "0";
      (panel.querySelector("[data-forge-price]") as HTMLElement).textContent = "0";
      (panel.querySelector("[data-forge-user-total-burned]") as HTMLElement).textContent = "0";
      (panel.querySelector("[data-forge-user-today-burned]") as HTMLElement).textContent = "0";
    }
    updateFusionLabels();

    panel.querySelectorAll(".forge-tab").forEach((t) => {
      (t as HTMLElement).classList.toggle("forge-tab-active", (t as HTMLElement).dataset.tab === activeTab);
    });
    panel.querySelectorAll(".forge-panel").forEach((p) => {
      const key = (p as HTMLElement).dataset.panel;
      (p as HTMLElement).toggleAttribute("hidden", key !== activeTab);
    });
    panel.querySelectorAll("[data-forge-lb-period]").forEach((b) => {
      (b as HTMLElement).classList.toggle(
        "forge-lb-btn-active",
        (b as HTMLElement).dataset.forgeLbPeriod === leaderboardPeriod
      );
    });

    const lbTbody = panel.querySelector("[data-forge-leaderboard-tbody]") as HTMLElement;
    if (lbTbody) {
      const defaultAvatar =
        typeof window !== "undefined" ? `${window.location.origin}/assets/characters/pixm.png` : "/assets/characters/pixm.png";
      lbTbody.innerHTML = leaderboardList
        .map((row) => {
          const avatarSrc = (() => {
            const safe = safeAvatarUrl(row.avatarUrl);
            return safe ? escapeHtml(safe) : defaultAvatar;
          })();
          const usernameHtml = escapeHtml(String(row.username));
          const showLink = row.username !== "—" && row.hasTwitter === true;
          const twitterUrl = showLink ? `https://x.com/${encodeURIComponent(String(row.username).replace(/^@/, ""))}` : "#";
          const linkAttrs = showLink ? `href="${twitterUrl}" target="_blank" rel="noopener noreferrer"` : "";
          const userInner = `<span class="forge-lb-avatar-wrap"><img src="${avatarSrc}" alt="" class="forge-lb-avatar" loading="lazy" referrerpolicy="no-referrer" onerror="this.onerror=null;this.src='/assets/characters/pixm.png'" /></span><span class="forge-lb-username">${usernameHtml}</span>`;
          const userCell = showLink ? `<a ${linkAttrs} class="forge-lb-user-link">${userInner}</a>` : `<span class="forge-lb-user-link">${userInner}</span>`;
          return `<tr><td>${row.rank}</td><td class="forge-lb-user-cell">${userCell}</td><td>${row.level}</td><td>${formatPfvSpace(row.burnedPfv)}</td></tr>`;
        })
        .join("");
    }
  }

  (wrap as unknown as { _forgeRender: () => void })._forgeRender = render;
  (wrap as unknown as { _updateFusionLabels: () => void })._updateFusionLabels = updateFusionLabels;
  return wrap;
}

function bindState() {
  const o = overlay as unknown as { _forgeRender?: () => void };
  o._forgeRender?.();
}

export function initForgeWindow(container?: HTMLElement | null): void {
  if (overlay) return;
  const parent = container ?? (document.querySelector(".ui-scale-wrapper") ?? document.body);
  if (!parent) return;
  overlay = createWindow();
  parent.appendChild(overlay);
  overlay.style.display = "none";
}

export function openForge(): void {
  setTimeout(async () => {
    if (!overlay) {
      initForgeWindow();
      if (!overlay) return;
    }
    const token = getToken();
    if (token) {
      const stateRes = await getForgeState(token);
      if (stateRes.ok) forgeState = stateRes.data;
      getCharacter(token).then((r) => {
        if (r?.ok) {
          applyCharacterData(r.data.character, r.data.slots);
          syncHeader();
        }
      });
    } else {
      forgeState = null;
    }
    bindState();
    getForgeLeaderboard(leaderboardPeriod).then((r) => {
      leaderboardList = r.ok ? r.data.list : [];
      bindState();
    });
    overlay!.style.display = "flex";
    overlay!.querySelector(".forge-window")?.focus();
    escHandler = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeForge();
    };
    document.addEventListener("keydown", escHandler);
  }, 0);
}

export function closeForge(): void {
  if (!overlay) return;
  overlay.style.display = "none";
  if (escHandler) {
    document.removeEventListener("keydown", escHandler);
    escHandler = null;
  }
}

export function isForgeOpen(): boolean {
  return !!overlay && overlay.style.display === "flex";
}
