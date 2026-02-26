/**
 * Apply API character + me data to UI state (homeState, marketState).
 * Called after login or on load when token is valid.
 */

import type { CharacterResponse, InventorySlotResponse } from "./api";
import { homeState } from "./homeWindow";
import { marketState } from "./marketWindow";
import { syncHeader } from "./uiHeader";
import { logAction } from "./actionsLog";

/** If set, show level-up congratulations when game is on Valley (map2). Cleared after showing. */
export let pendingLevelUpLevel: number | null = null;
export function clearPendingLevelUp(): void {
  pendingLevelUpLevel = null;
}

const WELCOME_STORAGE_PREFIX = "pfv_welcome_";

/** If true, show welcome overlay once when player is on map (first registration). Cleared after showing. */
export let pendingWelcome = false;
export let characterId: number | null = null;

export function clearPendingWelcome(): void {
  pendingWelcome = false;
}

export function markWelcomeShown(): void {
  if (characterId != null && typeof localStorage !== "undefined") {
    localStorage.setItem(WELCOME_STORAGE_PREFIX + characterId, "1");
  }
  clearPendingWelcome();
}

let appliedCharacterDataOnce = false;

function moveSpeedFromLevel(level: number): string {
  // 0 -> 100%, 1 -> 125%, 2 -> 150%, 3 -> 175%, 4 -> 200%
  return `${100 + level * 25}%`;
}

function miningEfficiencyFromLevel(level: number): string {
  return `x${1 + level}`;
}

export function applyCharacterData(
  character: CharacterResponse,
  slots: InventorySlotResponse[],
  username?: string,
  avatarUrl?: string | null,
  authProvider?: "twitter" | "password"
): void {
  characterId = character.id;
  if (username !== undefined) homeState.playerName = username;
  if (avatarUrl !== undefined) homeState.avatarUrl = avatarUrl;
  if (authProvider !== undefined) homeState.authProvider = authProvider;
  const oldLevel = homeState.level;
  homeState.level = character.level;
  if (character.level === 1 && typeof localStorage !== "undefined" && !localStorage.getItem(WELCOME_STORAGE_PREFIX + character.id)) {
    pendingWelcome = true;
  }
  homeState.currentXp = character.currentXp ?? 0;
  homeState.xpToNextLevel = character.xpToNextLevel ?? 100;
  if (appliedCharacterDataOnce && character.level > oldLevel) {
    logAction(`Level up! Level ${character.level}`);
    homeState.currentHp = character.maxHp ?? 100;
    pendingLevelUpLevel = character.level;
    if (typeof console !== "undefined") console.log("[LevelUp] pendingLevelUpLevel set to", character.level, "(oldLevel was", oldLevel, ")");
  } else if (typeof console !== "undefined" && appliedCharacterDataOnce && character.level <= oldLevel) {
    console.log("[LevelUp] no level-up: character.level", character.level, "oldLevel", oldLevel);
  }
  appliedCharacterDataOnce = true;
  homeState.moveSpeed = moveSpeedFromLevel(character.moveSpeedLevel);
  homeState.moveSpeedUpgrade = character.moveSpeedUpgrade ?? null;
  homeState.miningEfficiency = miningEfficiencyFromLevel(character.miningEfficiencyLevel);
  homeState.miningUpgrade = character.miningUpgrade ?? null;
  homeState.backpackUpgrade = character.backpackUpgrade ?? null;
  homeState.dailyMinedToday = character.dailyMinedToday;
  homeState.dailyMiningLimitNum = character.dailyMiningLimit;
  homeState.dailyMiningLimit = `${character.dailyMinedToday}/${character.dailyMiningLimit}`;
  homeState.backpackCapacity = character.capacity;
  homeState.moveSpeedLevel = character.moveSpeedLevel;
  homeState.miningEfficiencyLevel = character.miningEfficiencyLevel;
  homeState.backpackLevel = character.backpackLevel;
  homeState.pickaxeLevel = character.pickaxeLevel;
  homeState.bowLevel = character.bowLevel ?? 0;
  homeState.attack = String(10 + Math.min(9, Math.max(0, character.bowLevel ?? 0)) * 3);
  homeState.bowUpgrade = character.bowUpgrade ?? null;
  homeState.maxHp = character.maxHp ?? 100;
  if (character.level <= oldLevel) {
    const serverHp = character.currentHp ?? character.maxHp ?? 100;
    homeState.currentHp = Math.min(homeState.maxHp, Math.max(serverHp, homeState.currentHp));
  }
  const inv = { bronze: 0, silver: 0, gold: 0 };
  for (const s of slots) {
    if (s.resourceType === "bronze") inv.bronze += s.count;
    else if (s.resourceType === "silver") inv.silver += s.count;
    else if (s.resourceType === "gold") inv.gold += s.count;
  }
  homeState.inventory = inv;
  marketState.pfvBalance = character.pfv;
  syncHeader();
  import("./backpackWindow").then((m) => m.refreshBackpackState());
}
