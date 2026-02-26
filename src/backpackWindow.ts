/**
 * Player window — avatar, stats, tabs: Backpack | Referrals.
 * Backpack: pickaxe, sword, resources; hover popup for tools. PFV + reserved.
 * Referrals: count, link, Copy, Share on Twitter, list of referred users.
 */

import { homeState, getMiningOneLineHTML, getMiningOneLineText } from "./homeWindow";
import { marketState, formatPfv } from "./marketWindow";
import { getToken, getReferrals, getCharacter, getMe, changePassword, uploadAvatar } from "./api";
import { applyCharacterData } from "./gameState";
import { syncHeader } from "./uiHeader";
import { escapeHtml, safeAvatarUrl } from "./utils";
import "./backpackWindow.css";

const PICKAXE_ICON = "/assets/characters/hit.png";
const BOW_ICON = "/assets/characters/sword.png";
const GOLD_ICON = "/assets/interface/gold.png";
const SILVER_ICON = "/assets/interface/silver.png";
const BRONZE_ICON = "/assets/interface/bronze.png";
const DEFAULT_AVATAR = "/assets/characters/pixm.png";

let overlay: HTMLDivElement | null = null;
let escHandler: ((e: KeyboardEvent) => void) | null = null;
let activeTab: "backpack" | "referrals" | "settings" = "backpack";

function itemCount(): number {
  return 1 + 1 + homeState.inventory.gold + homeState.inventory.silver + homeState.inventory.bronze; // pickaxe + sword + resources
}

function createWindow(): HTMLDivElement {
  if (overlay) return overlay;
  const wrap = document.createElement("div");
  wrap.className = "backpack-window-overlay player-window-overlay";
  wrap.tabIndex = -1;
  wrap.innerHTML = `
    <div class="player-window home-window" role="dialog" aria-label="Player" tabindex="0">
      <div class="home-window-header">
        <div class="home-window-title-row">
          <h2 class="home-window-title">Player</h2>
          <button type="button" class="home-window-close" aria-label="Close">&times;</button>
        </div>
      </div>
      <div class="player-window-body">
        <div class="player-top">
          <div class="player-avatar-wrap">
            <img class="player-avatar" id="player-window-avatar" src="${DEFAULT_AVATAR}" alt="" width="48" height="48" />
          </div>
          <span class="player-name" id="player-window-name">Pix</span>
        </div>
        <div class="player-level-row">
          <span class="player-level-label">Lv.<span id="player-window-level">1</span></span>
          <div class="player-xp-bar-wrap">
            <div class="player-xp-bar-track">
              <div class="player-xp-bar-fill" id="player-xp-fill"></div>
            </div>
            <span class="player-xp-text" id="player-xp-text">0/100 XP</span>
          </div>
        </div>
        <div class="player-hp-row">
          <div class="player-hp-bar-wrap">
            <div class="player-hp-bar-track">
              <div class="player-hp-bar-fill" id="player-hp-fill"></div>
            </div>
            <span class="player-hp-text" id="player-hp-text">80/100 HP</span>
          </div>
        </div>
        <div class="player-stats">
          <div class="player-stat"><span class="player-stat-label">Move Speed</span><span class="player-stat-value" id="player-move-speed">100%</span></div>
          <div class="player-stat"><span class="player-stat-label">Mining Eff.</span><span class="player-stat-value" id="player-mining-eff">x1</span></div>
          <div class="player-stat"><span class="player-stat-label">Attack</span><span class="player-stat-value" id="player-attack">10</span></div>
          <div class="player-stat"><span class="player-stat-label">Daily Mining Limit</span><span class="player-stat-value" id="player-daily-limit">0/300</span></div>
        </div>
        <div class="player-tabs">
          <button type="button" class="player-tab active" data-tab="backpack">Backpack</button>
          <button type="button" class="player-tab" data-tab="referrals">Referrals</button>
          <button type="button" class="player-tab" data-tab="settings">Settings</button>
        </div>
        <div class="player-tab-panel" id="player-tab-backpack">
          <div class="backpack-top-row">
            <span class="backpack-count" id="backpack-count">0/50</span>
            <span class="backpack-pfv-row">$PFV: <span id="backpack-pfv" class="backpack-pfv-value">0</span></span>
          </div>
          <div class="backpack-grid" id="backpack-grid"></div>
        </div>
        <div class="player-tab-panel hidden" id="player-tab-referrals">
          <div class="referrals-count">Referrals joined: <span id="referrals-count">0</span></div>
          <div class="referrals-link-wrap">
            <label class="referrals-link-label">Referral link</label>
            <div class="referrals-link-row">
              <input type="text" class="referrals-link-input" id="referrals-link-input" readonly value="Loading..." />
              <button type="button" class="referrals-btn referrals-btn-copy" id="referrals-btn-copy" title="Copy link">Copy</button>
            </div>
          </div>
          <div class="referrals-actions">
            <button type="button" class="referrals-btn" id="referrals-btn-twitter">Share on Twitter</button>
          </div>
          <div class="referrals-list-wrap" id="referrals-list-wrap">
            <div class="referrals-list-label">Who joined via your link</div>
            <ul class="referrals-list" id="referrals-list"></ul>
          </div>
        </div>
        <div class="player-tab-panel hidden" id="player-tab-settings">
          <div class="settings-section" id="settings-password-section">
            <div class="settings-section-title">Change password</div>
            <p class="settings-hint" id="settings-password-hint">Only for accounts that use password to log in.</p>
            <form class="settings-form" id="settings-password-form">
              <label class="settings-label">Current password</label>
              <input type="password" class="settings-input" id="settings-current-password" autocomplete="current-password" />
              <label class="settings-label">New password</label>
              <input type="password" class="settings-input" id="settings-new-password" autocomplete="new-password" />
              <label class="settings-label">Repeat new password</label>
              <input type="password" class="settings-input" id="settings-repeat-password" autocomplete="new-password" />
              <p class="settings-format-hint">At least 6 characters.</p>
              <div class="settings-error" id="settings-password-error" aria-live="polite"></div>
              <button type="submit" class="referrals-btn" id="settings-password-submit">Change password</button>
            </form>
          </div>
          <div class="settings-section">
            <div class="settings-section-title">Avatar</div>
            <p class="settings-format-hint">Allowed formats: PNG, JPEG, GIF, WebP. Max 2 MB.</p>
            <div class="settings-avatar-row">
              <img class="settings-avatar-preview" id="settings-avatar-preview" src="${DEFAULT_AVATAR}" alt="" width="64" height="64" />
              <div>
                <input type="file" class="settings-file-input" id="settings-avatar-file" accept=".png,.jpg,.jpeg,.gif,.webp,image/png,image/jpeg,image/gif,image/webp" />
                <button type="button" class="referrals-btn" id="settings-avatar-upload" disabled>Upload</button>
              </div>
            </div>
            <div class="settings-error" id="settings-avatar-error" aria-live="polite"></div>
          </div>
        </div>
      </div>
    </div>
    <div class="player-tooltip hidden" id="player-tooltip" aria-hidden="true"></div>
  `;
  const panel = wrap.querySelector(".player-window") as HTMLDivElement;
  const closeBtn = panel.querySelector(".home-window-close") as HTMLButtonElement;
  wrap.addEventListener("click", (e) => {
    if (e.target === wrap) closeBackpack();
  });
  closeBtn?.addEventListener("click", () => closeBackpack());

  wrap.querySelectorAll(".player-tab").forEach((btn) => {
    btn.addEventListener("click", () => {
      const tab = (btn as HTMLElement).dataset.tab as "backpack" | "referrals" | "settings";
      activeTab = tab;
      wrap.querySelectorAll(".player-tab").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      wrap.querySelectorAll(".player-tab-panel").forEach((p) => p.classList.add("hidden"));
      const panelEl = document.getElementById(`player-tab-${tab}`);
      if (panelEl) panelEl.classList.remove("hidden");
      if (tab === "referrals") loadReferralsTab();
      if (tab === "settings") loadSettingsTab();
    });
  });

  const copyBtn = wrap.querySelector("#referrals-btn-copy") as HTMLButtonElement;
  copyBtn?.addEventListener("click", () => {
    const input = wrap.querySelector("#referrals-link-input") as HTMLInputElement;
    if (input?.value && input.value !== "Loading...") {
      input.select();
      navigator.clipboard?.writeText(input.value).then(() => {
        copyBtn.textContent = "Copied";
        setTimeout(() => { copyBtn.textContent = "Copy"; }, 2500);
      });
    }
  });
  const twitterBtn = wrap.querySelector("#referrals-btn-twitter") as HTMLButtonElement;
  twitterBtn?.addEventListener("click", () => {
    const input = wrap.querySelector("#referrals-link-input") as HTMLInputElement;
    const link = input?.value && input.value !== "Loading..." ? input.value : "";
    if (link) {
      const text = encodeURIComponent(`Join me on Pixel Valley Farm! @pixelfarmvalley ${link}`);
      window.open(`https://twitter.com/intent/tweet?text=${text}`, "_blank", "noopener,noreferrer");
    }
  });

  const passwordForm = wrap.querySelector("#settings-password-form") as HTMLFormElement | null;
  if (passwordForm) {
    passwordForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const current = (wrap.querySelector("#settings-current-password") as HTMLInputElement)?.value ?? "";
      const newPw = (wrap.querySelector("#settings-new-password") as HTMLInputElement)?.value ?? "";
      const repeat = (wrap.querySelector("#settings-repeat-password") as HTMLInputElement)?.value ?? "";
      const errEl = wrap.querySelector("#settings-password-error") as HTMLElement | null;
      const submitBtn = wrap.querySelector("#settings-password-submit") as HTMLButtonElement | null;
      if (errEl) errEl.textContent = "";
      if (newPw.length < 6) {
        if (errEl) errEl.textContent = "New password at least 6 characters";
        return;
      }
      if (newPw !== repeat) {
        if (errEl) errEl.textContent = "Passwords do not match";
        return;
      }
      if (submitBtn) submitBtn.disabled = true;
      const res = await changePassword({ currentPassword: current, newPassword: newPw });
      if (submitBtn) submitBtn.disabled = false;
      if (!res.ok) {
        if (errEl) errEl.textContent = res.error === "wrong_password" ? "Wrong current password" : (res.error ?? "Failed");
        return;
      }
      if (errEl) errEl.textContent = "";
      passwordForm.reset();
      if (errEl) errEl.textContent = "Password changed.";
    });
  }

  let pendingAvatarDataUrl: string | null = null;
  const avatarFileInput = wrap.querySelector("#settings-avatar-file") as HTMLInputElement | null;
  const avatarPreview = wrap.querySelector("#settings-avatar-preview") as HTMLImageElement | null;
  const avatarUploadBtn = wrap.querySelector("#settings-avatar-upload") as HTMLButtonElement | null;
  const avatarErrorEl = wrap.querySelector("#settings-avatar-error") as HTMLElement | null;
  if (avatarFileInput && avatarUploadBtn) {
    avatarFileInput.addEventListener("change", () => {
      pendingAvatarDataUrl = null;
      avatarUploadBtn.disabled = true;
      if (avatarErrorEl) avatarErrorEl.textContent = "";
      const file = avatarFileInput.files?.[0];
      if (!file) return;
      if (file.size > 2 * 1024 * 1024) {
        if (avatarErrorEl) avatarErrorEl.textContent = "Max 2 MB";
        return;
      }
      const reader = new FileReader();
      reader.onload = () => {
        const dataUrl = typeof reader.result === "string" ? reader.result : null;
        if (dataUrl && /^data:image\/(png|jpeg|jpg|gif|webp);base64,/.test(dataUrl)) {
          pendingAvatarDataUrl = dataUrl;
          avatarUploadBtn.disabled = false;
          if (avatarPreview) avatarPreview.src = dataUrl;
        } else {
          if (avatarErrorEl) avatarErrorEl.textContent = "Use PNG, JPEG, GIF or WebP";
        }
      };
      reader.readAsDataURL(file);
    });
    avatarUploadBtn.addEventListener("click", async () => {
      if (!pendingAvatarDataUrl) return;
      if (avatarErrorEl) avatarErrorEl.textContent = "";
      avatarUploadBtn.disabled = true;
      try {
        const res = await uploadAvatar(pendingAvatarDataUrl);
        if (!res.ok) {
          if (avatarErrorEl) avatarErrorEl.textContent = res.message ?? res.error ?? "Upload failed";
          avatarUploadBtn.disabled = false;
          return;
        }
        homeState.avatarUrl = res.data.avatarUrl;
        syncHeader();
        bindState();
        if (avatarErrorEl) avatarErrorEl.textContent = "Avatar updated.";
        pendingAvatarDataUrl = null;
        avatarFileInput.value = "";
        if (avatarPreview) {
          avatarPreview.src = safeAvatarUrl(res.data.avatarUrl) ?? DEFAULT_AVATAR;
          avatarPreview.onerror = () => { avatarPreview.src = DEFAULT_AVATAR; avatarPreview.onerror = null; };
        }
      } catch (e) {
        if (avatarErrorEl) avatarErrorEl.textContent = e instanceof Error ? e.message : "Upload failed";
        avatarUploadBtn.disabled = false;
      }
    });
  }

  overlay = wrap;
  return wrap;
}

function loadReferralsTab(): void {
  const countEl = document.getElementById("referrals-count");
  const inputEl = document.getElementById("referrals-link-input") as HTMLInputElement | null;
  const listEl = document.getElementById("referrals-list");
  const listWrap = document.getElementById("referrals-list-wrap");
  const token = getToken();
  if (!token) {
    if (countEl) countEl.textContent = "0";
    if (inputEl) inputEl.value = "Log in to see your link";
    if (listEl) listEl.innerHTML = "";
    return;
  }
  if (inputEl) inputEl.value = "Loading...";
  getReferrals(token).then((res) => {
    if (!res.ok) {
      if (countEl) countEl.textContent = "0";
      if (inputEl) inputEl.value = "Failed to load";
      if (listEl) listEl.innerHTML = "";
      return;
    }
    const d = res.data;
    if (countEl) countEl.textContent = String(d.referralCount);
    if (inputEl) inputEl.value = d.referralLink;
    if (listEl) {
      if (d.referredUsers.length === 0) {
        listEl.innerHTML = "<li class=\"referrals-list-empty\">No one yet</li>";
      } else {
        listEl.innerHTML = d.referredUsers
          .map((u) => {
            const nameHtml = escapeHtml(u.username);
            const userEl =
              u.hasTwitter === true
                ? `<a href="${referralUserTwitterUrl(u.username)}" target="_blank" rel="noopener noreferrer" class="referrals-list-user">${nameHtml}</a>`
                : `<span class="referrals-list-user">${nameHtml}</span>`;
            return `<li class="referrals-list-item">${userEl} <span class="referrals-list-date">${formatReferralDate(u.joinedAt)}</span></li>`;
          })
          .join("");
      }
    }
    if (listWrap) listWrap.style.display = d.referredUsers.length > 0 ? "" : "block";
  });
}

function loadSettingsTab(): void {
  const token = getToken();
  const passwordSection = document.getElementById("settings-password-section");
  const passwordHint = document.getElementById("settings-password-hint");
  const passwordForm = document.getElementById("settings-password-form");
  const avatarPreview = document.getElementById("settings-avatar-preview") as HTMLImageElement | null;
  if (avatarPreview) {
    avatarPreview.src = safeAvatarUrl(homeState.avatarUrl) ?? DEFAULT_AVATAR;
    avatarPreview.onerror = () => { avatarPreview.src = DEFAULT_AVATAR; avatarPreview.onerror = null; };
  }
  if (!token) {
    if (passwordSection) passwordSection.classList.add("hidden");
    return;
  }
  getMe(token).then((res) => {
    if (!res.ok) return;
    const isPassword = res.data.authProvider === "password";
    if (passwordSection) passwordSection.classList.remove("hidden");
    if (passwordHint) {
      passwordHint.textContent = isPassword ? "" : "You signed in with X. Password change is not available.";
      passwordHint.classList.toggle("hidden", isPassword);
    }
    if (passwordForm) {
      (passwordForm as HTMLElement).classList.toggle("hidden", !isPassword);
      if (!isPassword) (passwordForm as HTMLFormElement).reset();
    }
  });
}

function formatReferralDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function referralUserTwitterUrl(username: string): string {
  const handle = String(username).replace(/^@/, "");
  return `https://x.com/${encodeURIComponent(handle)}`;
}

const TOOLTIP_WIDTH = 220;

function showTooltip(line1: string, line2: string, anchorRect: DOMRect): void {
  const tip = document.getElementById("player-tooltip");
  if (!tip) return;
  tip.innerHTML = `<span class="tooltip-line1">${line1}</span><span class="tooltip-line2">${line2}</span>`;
  const gap = 6;
  let left = anchorRect.right + gap;
  let top = anchorRect.top;
  if (left + TOOLTIP_WIDTH > window.innerWidth) left = anchorRect.left - TOOLTIP_WIDTH - gap;
  if (top + 80 > window.innerHeight) top = window.innerHeight - 85;
  if (top < 8) top = 8;
  tip.style.left = `${left}px`;
  tip.style.top = `${top}px`;
  tip.classList.remove("hidden");
  tip.setAttribute("aria-hidden", "false");
}

function hideTooltip(): void {
  const tip = document.getElementById("player-tooltip");
  if (!tip) return;
  tip.classList.add("hidden");
  tip.setAttribute("aria-hidden", "true");
}

function buildGrid(): void {
  const grid = document.getElementById("backpack-grid");
  if (!grid) return;
  grid.innerHTML = "";

  const pickaxeLv = homeState.miningEfficiencyLevel + 1;
  const tools: { icon: string; name: string; level: number; stats: string }[] = [
    {
      icon: PICKAXE_ICON,
      name: "Pickaxe",
      level: pickaxeLv,
      stats: getMiningOneLineText(pickaxeLv),
    },
    {
      icon: BOW_ICON,
      name: "Sword",
      level: homeState.bowLevel + 1,
      stats: `Attack ${10 + homeState.bowLevel * 3}`,
    },
  ];

  const resources: { icon: string; count: number }[] = [
    ...(homeState.inventory.gold > 0 ? [{ icon: GOLD_ICON, count: homeState.inventory.gold }] : []),
    ...(homeState.inventory.silver > 0 ? [{ icon: SILVER_ICON, count: homeState.inventory.silver }] : []),
    ...(homeState.inventory.bronze > 0 ? [{ icon: BRONZE_ICON, count: homeState.inventory.bronze }] : []),
  ];

  const totalSlots = 15;
  for (let i = 0; i < totalSlots; i++) {
    const cell = document.createElement("div");
    cell.className = "backpack-cell";
    if (i < tools.length) {
      const t = tools[i]!;
      cell.innerHTML = `
        <img class="backpack-cell-icon backpack-cell-tool" src="${t.icon}" alt="${t.name}" width="40" height="40" data-name="${t.name}" data-level="${t.level}" data-stats="${(t.stats || "").replace(/"/g, "&quot;")}" />
      `;
      const img = cell.querySelector(".backpack-cell-tool");
      if (img) {
        img.addEventListener("mouseenter", (e) => {
          const name = (img as HTMLElement).dataset.name || "";
          const level = (img as HTMLElement).dataset.level || "0";
          const stats = (img as HTMLElement).dataset.stats || "";
          const line1 = `${name} <span class="tooltip-lv">Lv.${level}</span>`;
          const line2 = name === "Pickaxe" ? getMiningOneLineHTML(Number(level)) : stats;
          const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
          showTooltip(line1, line2, rect);
        });
        img.addEventListener("mouseleave", hideTooltip);
      }
    } else if (i - tools.length < resources.length) {
      const r = resources[i - tools.length]!;
      cell.innerHTML = `
        <img class="backpack-cell-icon" src="${r.icon}" alt="" width="40" height="40" />
        <span class="backpack-cell-count">${r.count}</span>
      `;
    }
    grid.appendChild(cell);
  }
}

function bindState(): void {
  if (!overlay) return;
  const avatarEl = overlay.querySelector("#player-window-avatar") as HTMLImageElement | null;
  const nameEl = document.getElementById("player-window-name");
  const levelEl = document.getElementById("player-window-level");
  const xpFill = document.getElementById("player-xp-fill");
  const xpText = document.getElementById("player-xp-text");
  const hpFill = document.getElementById("player-hp-fill");
  const hpText = document.getElementById("player-hp-text");
  const moveSpeedEl = document.getElementById("player-move-speed");
  const miningEffEl = document.getElementById("player-mining-eff");
  const attackEl = document.getElementById("player-attack");
  const dailyLimitEl = document.getElementById("player-daily-limit");
  const countEl = document.getElementById("backpack-count");
  const pfvEl = document.getElementById("backpack-pfv");

  if (avatarEl) {
    avatarEl.src = safeAvatarUrl(homeState.avatarUrl) ?? DEFAULT_AVATAR;
    avatarEl.onerror = () => { avatarEl.src = DEFAULT_AVATAR; avatarEl.onerror = null; };
  }
  if (nameEl) nameEl.textContent = homeState.playerName;
  if (levelEl) levelEl.textContent = String(homeState.level);
  if (moveSpeedEl) moveSpeedEl.textContent = homeState.moveSpeed;
  if (miningEffEl) miningEffEl.textContent = homeState.miningEfficiency;
  if (attackEl) attackEl.textContent = homeState.attack;
  if (dailyLimitEl) dailyLimitEl.textContent = `${homeState.dailyMinedToday}/${homeState.dailyMiningLimitNum}`;
  if (countEl) countEl.textContent = `${itemCount()}/${homeState.backpackCapacity}`;
  if (pfvEl) pfvEl.textContent = formatPfv(marketState.pfvBalance);

  if (homeState.level >= 10) {
    if (xpFill) (xpFill as HTMLElement).style.width = "100%";
    if (xpText) xpText.textContent = "MAX";
  } else {
    const xpPct = homeState.xpToNextLevel > 0 ? Math.min(100, (homeState.currentXp / homeState.xpToNextLevel) * 100) : 0;
    if (xpFill) (xpFill as HTMLElement).style.width = `${xpPct}%`;
    if (xpText) xpText.textContent = `${homeState.currentXp}/${homeState.xpToNextLevel} XP`;
  }

  const maxHp = homeState.maxHp || 100;
  const currentHp = Math.min(homeState.currentHp, maxHp);
  if (hpFill) (hpFill as HTMLElement).style.width = maxHp > 0 ? `${(currentHp / maxHp) * 100}%` : "0%";
  if (hpText) hpText.textContent = `${currentHp}/${maxHp} HP`;

  const miningOneLine = getMiningOneLineHTML(homeState.miningEfficiencyLevel + 1);
  if (miningEffEl) miningEffEl.innerHTML = miningOneLine;

  buildGrid();
}

export function initBackpackWindow(container?: HTMLElement | null): void {
  if (overlay) return;
  const parent = container ?? (typeof document !== "undefined" ? (document.querySelector(".ui-scale-wrapper") ?? document.body) : null);
  if (!parent) return;
  createWindow();
  if (overlay && !overlay.parentNode) parent.appendChild(overlay);
  overlay!.style.display = "none";
}

export function openBackpack(): void {
  if (!overlay) {
    initBackpackWindow();
    if (!overlay) return;
  }
  hideTooltip();
  activeTab = "backpack";
  overlay!.querySelectorAll(".player-tab").forEach((b) => b.classList.toggle("active", (b as HTMLElement).dataset.tab === "backpack"));
  overlay!.querySelectorAll(".player-tab-panel").forEach((p) => {
    const id = p.id;
    p.classList.toggle("hidden", id !== "player-tab-backpack");
  });
  const token = getToken();
  const applyAndShow = () => {
    bindState();
    overlay!.style.display = "flex";
    overlay!.querySelector(".player-window")?.focus();
    escHandler = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeBackpack();
    };
    document.addEventListener("keydown", escHandler);
  };
  if (token) {
    getCharacter(token).then((cr) => {
      if (cr?.ok) {
        applyCharacterData(cr.data.character, cr.data.slots);
        syncHeader();
      }
      applyAndShow();
    }).catch(() => applyAndShow());
  } else {
    applyAndShow();
  }
}

export function closeBackpack(): void {
  if (!overlay) return;
  overlay.style.display = "none";
  hideTooltip();
  if (escHandler) {
    document.removeEventListener("keydown", escHandler);
    escHandler = null;
  }
}

export function isBackpackOpen(): boolean {
  return !!overlay && overlay.style.display === "flex";
}

/** Refresh player/backpack UI from homeState (e.g. after upgrade in Home). */
export function refreshBackpackState(): void {
  if (overlay) bindState();
}
