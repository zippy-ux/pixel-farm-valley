/**
 * Sync header bar with game state (player name, level, resources, PFV).
 * Call syncHeader() on load and when state changes (e.g. after sell in Market).
 */

import { homeState } from "./homeWindow";
import { marketState, formatPfv } from "./marketWindow";
import { safeAvatarUrl } from "./utils";

const DEFAULT_AVATAR = "/assets/characters/pixm.png";

export function syncHeader(): void {
  if (typeof document === "undefined") return;
  const nameEl = document.getElementById("ui-player-name");
  const levelEl = document.getElementById("ui-level");
  const goldEl = document.getElementById("ui-gold");
  const silverEl = document.getElementById("ui-silver");
  const bronzeEl = document.getElementById("ui-bronze");
  const pfvEl = document.getElementById("ui-pfv");
  const avatarEl = document.getElementById("ui-top-avatar") as HTMLImageElement | null;
  if (nameEl) nameEl.textContent = homeState.playerName;
  if (levelEl) levelEl.textContent = String(homeState.level);
  if (goldEl) goldEl.textContent = String(homeState.inventory.gold);
  if (silverEl) silverEl.textContent = String(homeState.inventory.silver);
  if (bronzeEl) bronzeEl.textContent = String(homeState.inventory.bronze);
  if (pfvEl) pfvEl.textContent = formatPfv(marketState.pfvBalance);
  if (avatarEl) {
    avatarEl.src = safeAvatarUrl(homeState.avatarUrl) ?? DEFAULT_AVATAR;
    avatarEl.onerror = () => { avatarEl!.src = DEFAULT_AVATAR; avatarEl!.onerror = null; };
  }
}
