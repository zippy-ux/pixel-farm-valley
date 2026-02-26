/**
 * Level-up congratulations overlay — shown in Valley (map2) when player levels up.
 * Same style as arena result: yellow title, avatar, nickname, level, balance, referral link, Twitter share, close.
 */

import { homeState } from "./homeWindow";
import { marketState, formatPfv } from "./marketWindow";
import { getToken, getReferrals, postReferralBumpPreview } from "./api";
import { safeAvatarUrl } from "./utils";

const DEFAULT_AVATAR = "/assets/characters/pixm.png";

let overlay: HTMLDivElement | null = null;
let currentOnClose: (() => void) | null = null;
let currentLevel = 1;
let currentIsWelcome = false;
let levelUpClickBound = false;

function createOverlay(): HTMLDivElement {
  const wrap = document.createElement("div");
  wrap.className = "mine-window-overlay level-up-overlay";
  wrap.setAttribute("role", "dialog");
  wrap.setAttribute("aria-label", "Level up");
  wrap.tabIndex = -1;
  wrap.innerHTML = `
    <div class="mine-window level-up-window">
      <div class="mine-window-header level-up-header">
        <h2 id="level-up-title" class="mine-window-title level-up-title" style="color: #fbbf24;">Congratulations!</h2>
        <button type="button" id="level-up-close" class="level-up-close" aria-label="Close">&times;</button>
      </div>
      <div class="mine-window-body level-up-body">
        <p id="level-up-sub" class="level-up-sub">You reached level 2!</p>
        <div class="level-up-avatar-row">
          <img id="level-up-avatar" class="level-up-avatar" src="${DEFAULT_AVATAR}" alt="" width="52" height="52" />
          <span id="level-up-name" class="level-up-name">Pix</span>
        </div>
        <div class="level-up-stats">
          <span id="level-up-level">Level 1</span>
          <span class="sep">|</span>
          <span id="level-up-balance">0 $PFV</span>
        </div>
        <div class="level-up-referral">
          <label class="level-up-referral-label">Referral link</label>
          <div class="level-up-referral-row">
            <input type="text" id="level-up-referral-input" class="level-up-referral-input" readonly />
            <button type="button" id="level-up-copy" class="level-up-btn-copy">Copy</button>
          </div>
          <button type="button" id="level-up-twitter" class="level-up-btn-twitter">Share on Twitter</button>
        </div>
      </div>
    </div>
  `;
  return wrap;
}

const COPY_FEEDBACK_MS = 2500;

function escapeHtml(s: string): string {
  const div = document.createElement("div");
  div.textContent = s;
  return div.innerHTML;
}

function bindOverlayClickHandler(): void {
  if (!overlay || levelUpClickBound) return;
  levelUpClickBound = true;
  overlay.addEventListener("click", (e: Event) => {
    if ((e.target as HTMLElement).id === "level-up-close" || (e.target as HTMLElement).closest("#level-up-close")) {
      if (overlay) overlay.style.display = "none";
      const cb = currentOnClose;
      currentOnClose = null;
      cb?.();
    }
    if ((e.target as HTMLElement).id === "level-up-copy" || (e.target as HTMLElement).closest("#level-up-copy")) {
      const inp = document.getElementById("level-up-referral-input") as HTMLInputElement | null;
      const copyBtn = document.getElementById("level-up-copy");
      if (inp?.value) {
        navigator.clipboard?.writeText(inp.value).then(() => {
          if (copyBtn) copyBtn.textContent = "Copied";
          setTimeout(() => {
            if (copyBtn) copyBtn.textContent = "Copy";
          }, COPY_FEEDBACK_MS);
        });
      }
    }
    if ((e.target as HTMLElement).id === "level-up-twitter" || (e.target as HTMLElement).closest("#level-up-twitter")) {
      const inp = document.getElementById("level-up-referral-input") as HTMLInputElement | null;
      const link = inp?.value ?? "";
      const tweetText = link
        ? (currentIsWelcome
            ? `I just joined Pixel Farm Valley! @pixelfarmvalley ${link}`
            : `I just reached level ${currentLevel} in Pixel Farm Valley! @pixelfarmvalley ${link}`)
        : (currentIsWelcome
            ? "I just joined Pixel Farm Valley! @pixelfarmvalley"
            : `I just reached level ${currentLevel} in Pixel Farm Valley! @pixelfarmvalley`);
      const text = encodeURIComponent(tweetText);
      const intentUrl = `https://twitter.com/intent/tweet?text=${text}`;
      window.open(intentUrl, "_blank", "noopener,noreferrer");
    }
  });
}

export function showLevelUpOverlay(level: number, onClose: () => void): void {
  if (typeof console !== "undefined") console.log("[LevelUp] showLevelUpOverlay called, level=", level);
  if (typeof document === "undefined") return;
  const parent = document.querySelector(".ui-scale-wrapper") ?? document.body;
  if (!overlay || !overlay.parentNode) {
    overlay = createOverlay();
    parent.appendChild(overlay);
    bindOverlayClickHandler();
  }

  const titleEl = document.getElementById("level-up-title");
  const subEl = document.getElementById("level-up-sub");
  const closeBtn = document.getElementById("level-up-close") as HTMLButtonElement | null;
  const avatarEl = document.getElementById("level-up-avatar") as HTMLImageElement | null;
  const nameEl = document.getElementById("level-up-name");
  const levelEl = document.getElementById("level-up-level");
  const balanceEl = document.getElementById("level-up-balance");
  const inputEl = document.getElementById("level-up-referral-input") as HTMLInputElement | null;

  if (!closeBtn || !titleEl || !subEl) {
    if (typeof console !== "undefined") console.warn("[LevelUp] early return: missing elements (by id)", { closeBtn: !!closeBtn, titleEl: !!titleEl, subEl: !!subEl });
    return;
  }

  currentIsWelcome = false;
  titleEl.textContent = "Congratulations!";
  titleEl.style.color = "#fbbf24";
  subEl.textContent = `You reached level ${level}!`;
  (subEl as HTMLElement).style.display = "";
  if (avatarEl) {
    avatarEl.src = safeAvatarUrl(homeState.avatarUrl) ?? DEFAULT_AVATAR;
    avatarEl.onerror = () => { avatarEl.src = DEFAULT_AVATAR; avatarEl.onerror = null; };
  }
  if (nameEl) nameEl.textContent = escapeHtml(homeState.playerName || "Pix");
  if (levelEl) levelEl.textContent = `Level ${level}`;
  if (balanceEl) balanceEl.textContent = `${formatPfv(marketState.pfvBalance ?? 0)} $PFV`;

  currentOnClose = onClose;
  currentLevel = level;
  bindOverlayClickHandler();

  const token = getToken();
  if (token) {
    postReferralBumpPreview(token);
    if (inputEl) {
      getReferrals(token).then((res) => {
        if (res.ok && inputEl) inputEl.value = res.data.referralLink;
      });
    }
  } else if (inputEl) {
    inputEl.value = "";
  }

  overlay.setAttribute("aria-label", "Level up");
  overlay.style.display = "flex";
  overlay.querySelector(".level-up-window")?.focus();
  if (typeof console !== "undefined") console.log("[LevelUp] overlay displayed");
}

export function showWelcomeOverlay(onClose: () => void): void {
  if (typeof document === "undefined") return;
  const parent = document.querySelector(".ui-scale-wrapper") ?? document.body;
  if (!overlay || !overlay.parentNode) {
    overlay = createOverlay();
    parent.appendChild(overlay);
    bindOverlayClickHandler();
  }

  const titleEl = document.getElementById("level-up-title");
  const subEl = document.getElementById("level-up-sub");
  const closeBtn = document.getElementById("level-up-close") as HTMLButtonElement | null;
  const avatarEl = document.getElementById("level-up-avatar") as HTMLImageElement | null;
  const nameEl = document.getElementById("level-up-name");
  const levelEl = document.getElementById("level-up-level");
  const balanceEl = document.getElementById("level-up-balance");
  const inputEl = document.getElementById("level-up-referral-input") as HTMLInputElement | null;
  const copyBtn = document.getElementById("level-up-copy");
  if (copyBtn) copyBtn.textContent = "Copy";

  if (!closeBtn || !titleEl || !subEl) return;

  currentIsWelcome = true;
  titleEl.textContent = "Welcome to Pixel Farm Valley!";
  titleEl.style.color = "#fbbf24";
  (subEl as HTMLElement).style.display = "none";
  if (avatarEl) {
    avatarEl.src = safeAvatarUrl(homeState.avatarUrl) ?? DEFAULT_AVATAR;
    avatarEl.onerror = () => { avatarEl.src = DEFAULT_AVATAR; avatarEl.onerror = null; };
  }
  if (nameEl) nameEl.textContent = escapeHtml(homeState.playerName || "Pix");
  if (levelEl) levelEl.textContent = `Level ${homeState.level}`;
  if (balanceEl) balanceEl.textContent = `${formatPfv(marketState.pfvBalance ?? 0)} $PFV`;

  currentOnClose = onClose;
  currentLevel = homeState.level;

  const token = getToken();
  if (token) {
    postReferralBumpPreview(token);
    if (inputEl) {
      getReferrals(token).then((res) => {
        if (res.ok && inputEl) inputEl.value = res.data.referralLink;
      });
    }
  } else if (inputEl) {
    inputEl.value = "";
  }

  overlay.style.display = "flex";
  overlay.setAttribute("aria-label", "Welcome");
  overlay.querySelector(".level-up-window")?.focus();
}
