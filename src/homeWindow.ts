/**
 * Home window — same top as Player (avatar, level, XP), stats with Upgrade buttons.
 * Move speed upgrade: gold + character level; other upgrades placeholder.
 */

import "./homeWindow.css";
import { getToken, getCharacter, upgradeMoveSpeed, upgradeMiningEfficiency, upgradeBackpackCapacity, upgradeBowAttack } from "./api";
import { applyCharacterData } from "./gameState";
import { syncHeader } from "./uiHeader";
import { logAction } from "./actionsLog";
import { safeAvatarUrl } from "./utils";

export const homeState = {
  playerName: "Pix",
  avatarUrl: null as string | null,
  authProvider: undefined as "twitter" | "password" | undefined,
  level: 1,
  currentXp: 0,
  xpToNextLevel: 100,
  moveSpeed: "100%",
  miningEfficiency: "x1",
  dailyMiningLimit: "20/day",
  dailyMinedToday: 0,
  dailyMiningLimitNum: 300,
  backpackCapacity: 50,
  moveSpeedLevel: 0,
  miningEfficiencyLevel: 0,
  backpackLevel: 0,
  pickaxeLevel: 0,
  bowLevel: 0,
  attack: "10",
  bowUpgrade: null as { requiredGold: number; requiredCharacterLevel: number } | null,
  currentHp: 100,
  maxHp: 100,
  inventory: { bronze: 0, silver: 0, gold: 0 },
  moveSpeedUpgrade: null as { requiredGold: number; requiredCharacterLevel: number } | null,
  miningUpgrade: null as { requiredGold: number; requiredCharacterLevel: number } | null,
  backpackUpgrade: null as { requiredGold: number; requiredCharacterLevel: number } | null,
};

const DEFAULT_AVATAR = "/assets/characters/pixm.png";
const PICKAXE_ICON = "/assets/characters/hit.png";
const BOW_ICON = "/assets/characters/sword.png";
const GOLD_ICON = "/assets/interface/gold.png";
const SILVER_ICON = "/assets/interface/silver.png";

let overlay: HTMLDivElement | null = null;
let escHandler: ((e: KeyboardEvent) => void) | null = null;

function moveSpeedFromLevel(level: number): string {
  return `${100 + level * 25}%`;
}
function capacityFromBackpackLevel(level: number): number {
  return 50 + 50 * level;
}
function miningEffFromLevel(level: number): string {
  return `x${1 + level}`;
}
/** Attack (bow): L1=10, +3 per level. level 0..9 = L1..L10. */
function attackFromBowLevel(level: number): number {
  return 10 + Math.min(9, Math.max(0, level)) * 3;
}

type UpgradeType = "move_speed" | "mining" | "capacity" | "attack";

function buildMoveSpeedBodyHtml(): string {
  const current = homeState.moveSpeed;
  const next = moveSpeedFromLevel(homeState.moveSpeedLevel + 1);
  const req = homeState.moveSpeedUpgrade;
  const levelOk = req ? homeState.level >= req.requiredCharacterLevel : true;
  const goldOk = req ? homeState.inventory.gold >= req.requiredGold : true;
  if (req) {
    const levelClass = levelOk ? "home-upgrade-req-ok" : "home-upgrade-req-fail";
    const goldClass = goldOk ? "home-upgrade-req-ok" : "home-upgrade-req-fail";
    return `
      <div class="home-upgrade-row home-upgrade-row-with-arrow">
        <div class="home-upgrade-side"><span class="home-upgrade-label">Current</span><span class="home-upgrade-value">${current}</span></div>
        <div class="home-upgrade-arrow-wrap"><span class="home-upgrade-arrow" aria-hidden="true">→</span></div>
        <div class="home-upgrade-side"><span class="home-upgrade-label">Next</span><span class="home-upgrade-value home-upgrade-next">${next}</span></div>
      </div>
      <div class="home-upgrade-req-block">
        <span class="home-upgrade-req-level ${levelClass}">Lv.${req.requiredCharacterLevel}</span>
        <span class="home-upgrade-req-gold ${goldClass}">${req.requiredGold}</span>
        <img class="home-upgrade-req-gold-icon" src="${GOLD_ICON}" alt="" width="20" height="20" />
      </div>
    `;
  }
  return `
    <div class="home-upgrade-row home-upgrade-row-max">
      <div class="home-upgrade-side"><span class="home-upgrade-label">Current</span><span class="home-upgrade-value">${current}</span></div>
    </div>
    <p class="home-upgrade-req home-upgrade-req-center">Already max level.</p>
  `;
}

/** Bow: level and gold. L2: 2 lvl 6 gold ... L10: 10 lvl 200 gold. */
const BOW_COSTS: { requiredCharacterLevel: number; requiredGold: number }[] = [
  { requiredCharacterLevel: 2, requiredGold: 3 },
  { requiredCharacterLevel: 3, requiredGold: 5 },
  { requiredCharacterLevel: 4, requiredGold: 8 },
  { requiredCharacterLevel: 5, requiredGold: 13 },
  { requiredCharacterLevel: 6, requiredGold: 20 },
  { requiredCharacterLevel: 7, requiredGold: 30 },
  { requiredCharacterLevel: 8, requiredGold: 44 },
  { requiredCharacterLevel: 9, requiredGold: 60 },
  { requiredCharacterLevel: 10, requiredGold: 80 },
];

/** Backpack: 5 levels. L2: 1 lvl 6 gold, L3: 2 lvl 15 gold, L4: 3 lvl 30 gold, L5: 4 lvl 55 gold. */
const BACKPACK_COSTS: { requiredCharacterLevel: number; requiredGold: number }[] = [
  { requiredCharacterLevel: 1, requiredGold: 3 },
  { requiredCharacterLevel: 2, requiredGold: 6 },
  { requiredCharacterLevel: 3, requiredGold: 12 },
  { requiredCharacterLevel: 4, requiredGold: 22 },
];

function buildCapacityBodyHtml(): string {
  const current = homeState.backpackCapacity;
  const next = capacityFromBackpackLevel(homeState.backpackLevel + 1);
  const req = homeState.backpackUpgrade ?? (homeState.backpackLevel < 4 ? BACKPACK_COSTS[homeState.backpackLevel] ?? null : null);
  const levelOk = req ? homeState.level >= req.requiredCharacterLevel : true;
  const goldOk = req ? homeState.inventory.gold >= req.requiredGold : true;
  const atMax = homeState.backpackLevel >= 4;
  if (atMax) {
    return `
      <div class="home-upgrade-row home-upgrade-row-max">
        <div class="home-upgrade-side"><span class="home-upgrade-label">Current</span><span class="home-upgrade-value">${current}</span></div>
      </div>
      <p class="home-upgrade-req home-upgrade-req-center">Already max level.</p>
    `;
  }
  const levelClass = levelOk ? "home-upgrade-req-ok" : "home-upgrade-req-fail";
  const goldClass = goldOk ? "home-upgrade-req-ok" : "home-upgrade-req-fail";
  return `
    <div class="home-upgrade-row home-upgrade-row-with-arrow">
      <div class="home-upgrade-side"><span class="home-upgrade-label">Current</span><span class="home-upgrade-value">${current}</span></div>
      <div class="home-upgrade-arrow-wrap"><span class="home-upgrade-arrow" aria-hidden="true">→</span></div>
      <div class="home-upgrade-side"><span class="home-upgrade-label">Next</span><span class="home-upgrade-value home-upgrade-next">${next}</span></div>
    </div>
    <div class="home-upgrade-req-block">
      <span class="home-upgrade-req-level ${levelClass}">Lv.${req?.requiredCharacterLevel ?? 1}</span>
      <span class="home-upgrade-req-gold ${goldClass}">${req?.requiredGold ?? 0}</span>
      <img class="home-upgrade-req-gold-icon" src="${GOLD_ICON}" alt="" width="20" height="20" />
    </div>
  `;
}

function buildAttackBodyHtml(): string {
  const bowLv = homeState.bowLevel + 1;
  const current = attackFromBowLevel(homeState.bowLevel);
  const next = attackFromBowLevel(homeState.bowLevel + 1);
  const req = homeState.bowUpgrade ?? (homeState.bowLevel < 9 ? BOW_COSTS[homeState.bowLevel] ?? null : null);
  const levelOk = req ? homeState.level >= req.requiredCharacterLevel : true;
  const goldOk = req ? homeState.inventory.gold >= req.requiredGold : true;
  const atMax = homeState.bowLevel >= 9;
  if (atMax) {
    return `
      <div class="home-upgrade-row home-upgrade-row-max">
        <div class="home-upgrade-side home-upgrade-side-multiline">
          <img class="home-upgrade-icon" src="${BOW_ICON}" alt="" width="40" height="40" />
          <span class="home-upgrade-icon-level">Lv.${bowLv}</span>
          <span class="home-upgrade-value home-upgrade-benefit-text">${current}</span>
        </div>
      </div>
      <p class="home-upgrade-req home-upgrade-req-center">Already max level.</p>
    `;
  }
  const levelClass = levelOk ? "home-upgrade-req-ok" : "home-upgrade-req-fail";
  const goldClass = goldOk ? "home-upgrade-req-ok" : "home-upgrade-req-fail";
  return `
    <div class="home-upgrade-row home-upgrade-row-with-arrow">
      <div class="home-upgrade-side home-upgrade-side-multiline">
        <img class="home-upgrade-icon" src="${BOW_ICON}" alt="" width="40" height="40" />
        <span class="home-upgrade-icon-level">Lv.${bowLv}</span>
        <span class="home-upgrade-value home-upgrade-benefit-text">${current}</span>
      </div>
      <div class="home-upgrade-arrow-wrap"><span class="home-upgrade-arrow" aria-hidden="true">→</span></div>
      <div class="home-upgrade-side home-upgrade-side-multiline">
        <img class="home-upgrade-icon" src="${BOW_ICON}" alt="" width="40" height="40" />
        <span class="home-upgrade-icon-level">Lv.${bowLv + 1}</span>
        <span class="home-upgrade-value home-upgrade-next home-upgrade-benefit-text">${next}</span>
      </div>
    </div>
    <div class="home-upgrade-req-block">
      <span class="home-upgrade-req-level ${levelClass}">Lv.${req?.requiredCharacterLevel ?? 2}</span>
      <span class="home-upgrade-req-gold ${goldClass}">${req?.requiredGold ?? 0}</span>
      <img class="home-upgrade-req-gold-icon" src="${GOLD_ICON}" alt="" width="20" height="20" />
    </div>
  `;
}

function setUpgradeMsg(kind: "error" | "success", text: string): void {
  const el = document.getElementById("home-upgrade-msg");
  if (!el) return;
  el.textContent = text;
  el.className = "home-upgrade-msg home-upgrade-msg-" + kind;
}

function clearUpgradeMsg(): void {
  const el = document.getElementById("home-upgrade-msg");
  if (!el) return;
  el.textContent = "";
  el.className = "home-upgrade-msg";
}

/** Cumulative bonuses at given pickaxe level: drop%, silver%, gold%. */
function getMiningCumulativeBonuses(pickaxeLv: number): { drop: number; silver: number; gold: number } {
  if (pickaxeLv <= 1) return { drop: 0, silver: 0, gold: 0 };
  if (pickaxeLv === 2) return { drop: 5, silver: 0, gold: 0 };
  if (pickaxeLv === 3) return { drop: 10, silver: 0, gold: 0 };
  if (pickaxeLv === 4) return { drop: 15, silver: 0, gold: 0 };
  if (pickaxeLv === 5) return { drop: 20, silver: 0, gold: 0 };
  if (pickaxeLv === 6) return { drop: 20, silver: 5, gold: 0 };
  if (pickaxeLv === 7) return { drop: 20, silver: 10, gold: 0 };
  if (pickaxeLv === 8) return { drop: 20, silver: 15, gold: 0 };
  if (pickaxeLv === 9) return { drop: 20, silver: 15, gold: 2.5 };
  return { drop: 20, silver: 15, gold: 5 };
}

/** Single bonus added when going to next level (for "Next" column). */
function getMiningNextBonus(pickaxeLv: number): { type: "drop" | "silver" | "gold"; value: number } | null {
  if (pickaxeLv >= 10) return null;
  if (pickaxeLv === 1) return { type: "drop", value: 5 };
  if (pickaxeLv === 2) return { type: "drop", value: 10 };
  if (pickaxeLv === 3) return { type: "drop", value: 15 };
  if (pickaxeLv === 4) return { type: "drop", value: 20 };
  if (pickaxeLv === 5) return { type: "silver", value: 5 };
  if (pickaxeLv === 6) return { type: "silver", value: 10 };
  if (pickaxeLv === 7) return { type: "silver", value: 15 };
  if (pickaxeLv === 8) return { type: "gold", value: 2.5 };
  return { type: "gold", value: 5 };
}

/** One-line HTML for Mining stat: +10% (pickaxe) +5% (silver) +2.5% (gold). */
export function getMiningOneLineHTML(pickaxeLv: number): string {
  const b = getMiningCumulativeBonuses(pickaxeLv);
  const parts: string[] = [];
  if (b.drop > 0) parts.push(`+${b.drop}% <img class="home-mining-inline-icon" src="${PICKAXE_ICON}" alt="" width="14" height="14" />`);
  if (b.silver > 0) parts.push(`+${b.silver}% <img class="home-mining-inline-icon" src="${SILVER_ICON}" alt="" width="14" height="14" />`);
  if (b.gold > 0) parts.push(`+${b.gold}% <img class="home-mining-inline-icon" src="${GOLD_ICON}" alt="" width="14" height="14" />`);
  if (parts.length === 0) return `+0% <img class="home-mining-inline-icon" src="${PICKAXE_ICON}" alt="" width="14" height="14" />`;
  return parts.join(" ");
}

/** Plain text for tooltip: +10% +5% silver +2.5% gold. */
export function getMiningOneLineText(pickaxeLv: number): string {
  const b = getMiningCumulativeBonuses(pickaxeLv);
  const parts: string[] = [];
  if (b.drop > 0) parts.push(`+${b.drop}%`);
  if (b.silver > 0) parts.push(`+${b.silver}% silver`);
  if (b.gold > 0) parts.push(`+${b.gold}% gold`);
  if (parts.length === 0) return "+0%";
  return parts.join(" ");
}

function formatMiningNextBonusLine(bonus: { type: "drop" | "silver" | "gold"; value: number }): string {
  if (bonus.type === "drop") return `+${bonus.value}%`;
  if (bonus.type === "silver") return `+${bonus.value}% <img class="home-upgrade-benefit-icon" src="${SILVER_ICON}" alt="" width="16" height="16" />`;
  return `+${bonus.value}% <img class="home-upgrade-benefit-icon" src="${GOLD_ICON}" alt="" width="16" height="16" />`;
}

function buildMiningBodyHtml(): string {
  const pickaxeLv = homeState.miningEfficiencyLevel + 1;
  const currentBonuses = getMiningCumulativeBonuses(pickaxeLv);
  const nextBonuses = getMiningCumulativeBonuses(pickaxeLv + 1);
  const req = homeState.miningUpgrade;
  const levelOk = req ? homeState.level >= req.requiredCharacterLevel : true;
  const goldOk = req ? homeState.inventory.gold >= req.requiredGold : true;

  const pickaxeIconHtml = `<img class="home-upgrade-benefit-icon" src="${PICKAXE_ICON}" alt="" width="10" height="10" />`;
  const currentLines: string[] = [];
  if (currentBonuses.drop > 0) currentLines.push(`<span class="home-upgrade-value home-upgrade-benefit-text"><span class="home-upgrade-benefit-pct">+${currentBonuses.drop}%</span> ${pickaxeIconHtml}</span>`);
  if (currentBonuses.silver > 0) currentLines.push(`<span class="home-upgrade-value home-upgrade-benefit-text"><span class="home-upgrade-benefit-pct">+${currentBonuses.silver}%</span> <img class="home-upgrade-benefit-icon" src="${SILVER_ICON}" alt="" width="10" height="10" /></span>`);
  if (currentBonuses.gold > 0) currentLines.push(`<span class="home-upgrade-value home-upgrade-benefit-text"><span class="home-upgrade-benefit-pct">+${currentBonuses.gold}%</span> <img class="home-upgrade-benefit-icon" src="${GOLD_ICON}" alt="" width="10" height="10" /></span>`);
  if (currentLines.length === 0) currentLines.push(`<span class="home-upgrade-value home-upgrade-benefit-text"><span class="home-upgrade-benefit-pct">+0%</span> ${pickaxeIconHtml}</span>`);

  const nextLines: string[] = [];
  const nextCls = (curr: number, next: number) =>
    next === curr ? "home-upgrade-value home-upgrade-benefit-text" : "home-upgrade-value home-upgrade-next home-upgrade-benefit-text";
  if (nextBonuses.drop > 0) nextLines.push(`<span class="${nextCls(currentBonuses.drop, nextBonuses.drop)}"><span class="home-upgrade-benefit-pct">+${nextBonuses.drop}%</span> ${pickaxeIconHtml}</span>`);
  if (nextBonuses.silver > 0) nextLines.push(`<span class="${nextCls(currentBonuses.silver, nextBonuses.silver)}"><span class="home-upgrade-benefit-pct">+${nextBonuses.silver}%</span> <img class="home-upgrade-benefit-icon" src="${SILVER_ICON}" alt="" width="10" height="10" /></span>`);
  if (nextBonuses.gold > 0) nextLines.push(`<span class="${nextCls(currentBonuses.gold, nextBonuses.gold)}"><span class="home-upgrade-benefit-pct">+${nextBonuses.gold}%</span> <img class="home-upgrade-benefit-icon" src="${GOLD_ICON}" alt="" width="10" height="10" /></span>`);
  if (nextLines.length === 0) nextLines.push(`<span class="home-upgrade-value home-upgrade-benefit-text"><span class="home-upgrade-benefit-pct">+0%</span> ${pickaxeIconHtml}</span>`);

  const atMax = pickaxeLv >= 10;
  if (!atMax) {
    const levelClass = req ? (levelOk ? "home-upgrade-req-ok" : "home-upgrade-req-fail") : "home-upgrade-req-ok";
    const goldClass = req ? (goldOk ? "home-upgrade-req-ok" : "home-upgrade-req-fail") : "home-upgrade-req-ok";
    const reqBlock = req
      ? `<div class="home-upgrade-req-block">
        <span class="home-upgrade-req-level ${levelClass}">Lv.${req.requiredCharacterLevel}</span>
        <span class="home-upgrade-req-gold ${goldClass}">${req.requiredGold}</span>
        <img class="home-upgrade-req-gold-icon" src="${GOLD_ICON}" alt="" width="20" height="20" />
      </div>`
      : "";
    return `
      <div class="home-upgrade-row home-upgrade-row-with-arrow">
        <div class="home-upgrade-side home-upgrade-side-multiline">
          <img class="home-upgrade-icon" src="${PICKAXE_ICON}" alt="" width="40" height="40" />
          <span class="home-upgrade-icon-level">Lv.${pickaxeLv}</span>
          <div class="home-upgrade-value-lines">${currentLines.map((l) => `<div>${l}</div>`).join("")}</div>
        </div>
        <div class="home-upgrade-arrow-wrap"><span class="home-upgrade-arrow" aria-hidden="true">→</span></div>
        <div class="home-upgrade-side home-upgrade-side-multiline">
          <img class="home-upgrade-icon" src="${PICKAXE_ICON}" alt="" width="40" height="40" />
          <span class="home-upgrade-icon-level">Lv.${pickaxeLv + 1}</span>
          <div class="home-upgrade-value-lines">${nextLines.map((l) => `<div>${l}</div>`).join("")}</div>
        </div>
      </div>
      ${reqBlock}
    `;
  }
  return `
    <div class="home-upgrade-row home-upgrade-row-max">
      <div class="home-upgrade-side home-upgrade-side-multiline">
        <img class="home-upgrade-icon" src="${PICKAXE_ICON}" alt="" width="40" height="40" />
        <span class="home-upgrade-icon-level">Lv.${pickaxeLv}</span>
        <div class="home-upgrade-value-lines">${currentLines.map((l) => `<div>${l}</div>`).join("")}</div>
      </div>
    </div>
    <p class="home-upgrade-req home-upgrade-req-center">Already max level.</p>
  `;
}

function openUpgradePopup(type: UpgradeType): void {
  const popup = document.getElementById("home-upgrade-popup");
  const titleEl = document.getElementById("home-upgrade-title");
  const bodyEl = document.getElementById("home-upgrade-body");
  const confirmBtn = document.getElementById("home-upgrade-confirm");
  if (!popup || !titleEl || !bodyEl || !confirmBtn) return;
  clearUpgradeMsg();

  const reqLevel = 2;
  const reqPfv = 50;
  let title = "";
  let bodyHtml = "";

  if (type === "move_speed") {
    title = "Move Speed";
    bodyHtml = buildMoveSpeedBodyHtml();
  } else if (type === "mining") {
    title = "Mining Efficiency";
    bodyHtml = buildMiningBodyHtml();
  } else if (type === "capacity") {
    title = "Capacity";
    bodyHtml = buildCapacityBodyHtml();
  } else if (type === "attack") {
    title = "Sword";
    bodyHtml = buildAttackBodyHtml();
  }

  titleEl.textContent = title;
  bodyEl.innerHTML = bodyHtml;
  popup.classList.remove("hidden");
  confirmBtn.onclick = () => {
    if (type === "move_speed" && homeState.moveSpeedUpgrade) {
      clearUpgradeMsg();
      const requiredGold = homeState.moveSpeedUpgrade.requiredGold;
      upgradeMoveSpeed(getToken()).then((res) => {
        if (res.ok) {
          applyCharacterData(res.data.character, res.data.slots);
          syncHeader();
          bindState();
          logAction(`Spent ${requiredGold} gold`);
          logAction("Move speed upgraded");
          bodyEl.innerHTML = buildMoveSpeedBodyHtml();
          setUpgradeMsg("success", "Upgrade completed.");
          setTimeout(clearUpgradeMsg, 2500);
        } else {
          const msg =
            res.error === "not_enough_gold"
              ? "Not enough gold."
              : res.error === "level_too_low"
                ? "Character level too low."
                : res.error === "already_max"
                  ? "Already max level."
                  : res.error || "Cannot upgrade.";
          setUpgradeMsg("error", msg);
        }
      });
    } else if (type === "mining" && homeState.miningUpgrade) {
      clearUpgradeMsg();
      const requiredGold = homeState.miningUpgrade.requiredGold;
      upgradeMiningEfficiency(getToken()).then((res) => {
        if (res.ok) {
          applyCharacterData(res.data.character, res.data.slots);
          syncHeader();
          bindState();
          logAction(`Spent ${requiredGold} gold`);
          logAction("Mining efficiency upgraded");
          bodyEl.innerHTML = buildMiningBodyHtml();
          setUpgradeMsg("success", "Upgrade completed.");
          setTimeout(clearUpgradeMsg, 2500);
        } else {
          const msg =
            res.error === "not_enough_gold"
              ? "Not enough gold."
              : res.error === "level_too_low"
                ? "Character level too low."
                : res.error === "already_max"
                  ? "Already max level."
                  : res.error || "Cannot upgrade.";
          setUpgradeMsg("error", msg);
        }
      });
    } else if (type === "capacity" && homeState.backpackLevel < 4) {
      clearUpgradeMsg();
      const reqCap = homeState.backpackUpgrade ?? BACKPACK_COSTS[homeState.backpackLevel];
      const requiredGold = reqCap?.requiredGold ?? 0;
      upgradeBackpackCapacity(getToken()).then((res) => {
        if (res.ok) {
          applyCharacterData(res.data.character, res.data.slots);
          syncHeader();
          bindState();
          logAction(`Spent ${requiredGold} gold`);
          logAction("Capacity upgraded");
          bodyEl.innerHTML = buildCapacityBodyHtml();
          setUpgradeMsg("success", "Upgrade completed.");
          setTimeout(clearUpgradeMsg, 2500);
        } else {
          const msg =
            res.error === "not_enough_gold"
              ? "Not enough gold."
              : res.error === "level_too_low"
                ? "Character level too low."
                : res.error === "already_max"
                  ? "Already max level."
                  : res.error || "Cannot upgrade.";
          setUpgradeMsg("error", msg);
        }
      });
    } else if (type === "attack" && homeState.bowLevel < 9) {
      clearUpgradeMsg();
      const reqBow = homeState.bowUpgrade ?? BOW_COSTS[homeState.bowLevel];
      const requiredGold = reqBow?.requiredGold ?? 0;
      upgradeBowAttack(getToken()).then((res) => {
        if (res.ok) {
          applyCharacterData(res.data.character, res.data.slots);
          syncHeader();
          bindState();
          logAction(`Spent ${requiredGold} gold`);
          logAction("Sword upgraded");
          bodyEl.innerHTML = buildAttackBodyHtml();
          setUpgradeMsg("success", "Upgrade completed.");
          setTimeout(clearUpgradeMsg, 2500);
        } else {
          const msg =
            res.error === "not_enough_gold"
              ? "Not enough gold."
              : res.error === "level_too_low"
                ? "Character level too low."
                : res.error === "already_max"
                  ? "Already max level."
                  : res.error || "Cannot upgrade.";
          setUpgradeMsg("error", msg);
        }
      });
    } else {
      popup.classList.add("hidden");
    }
  };
}

function closeUpgradePopup(): void {
  document.getElementById("home-upgrade-popup")?.classList.add("hidden");
}

function createWindow(): HTMLDivElement {
  if (overlay) return overlay;
  const wrap = document.createElement("div");
  wrap.className = "home-window-overlay";
  wrap.tabIndex = -1;
  wrap.innerHTML = `
    <div class="home-window" role="dialog" aria-label="Home" tabindex="0">
      <div class="home-window-header">
        <div class="home-window-title-row">
          <h2 class="home-window-title">Home</h2>
          <button type="button" class="home-window-close" aria-label="Close">&times;</button>
        </div>
      </div>
      <div class="home-window-body">
        <div class="home-top">
          <div class="home-avatar-wrap">
            <img class="home-avatar" id="home-avatar" src="${DEFAULT_AVATAR}" alt="" width="48" height="48" />
          </div>
          <span class="home-name" id="home-name">Pix</span>
        </div>
        <div class="home-level-row">
          <span class="home-level-label">Lv.<span id="home-level">1</span></span>
          <div class="home-xp-bar-wrap">
            <div class="home-xp-bar-track">
              <div class="home-xp-bar-fill" id="home-xp-fill"></div>
            </div>
            <span class="home-xp-text" id="home-xp-text">0/100 XP</span>
          </div>
        </div>
        <div class="home-hp-row">
          <div class="home-hp-bar-wrap">
            <div class="home-hp-bar-track">
              <div class="home-hp-bar-fill" id="home-hp-fill"></div>
            </div>
            <span class="home-hp-text" id="home-hp-text">80/100 HP</span>
          </div>
        </div>
        <div class="home-stats">
          <div class="home-stat-row">
            <span class="home-stat-label">Move Speed</span>
            <span class="home-stat-value" id="home-move-speed">100%</span>
            <button type="button" class="home-btn-upgrade" data-upgrade="move_speed">Upgrade</button>
          </div>
          <div class="home-stat-row">
            <span class="home-stat-label">Mining Eff.</span>
            <span class="home-stat-value" id="home-mining-eff">x1</span>
            <button type="button" class="home-btn-upgrade" data-upgrade="mining">Upgrade</button>
          </div>
          <div class="home-stat-row">
            <span class="home-stat-label">Capacity</span>
            <span class="home-stat-value" id="home-capacity">50</span>
            <button type="button" class="home-btn-upgrade" data-upgrade="capacity">Upgrade</button>
          </div>
          <div class="home-stat-row">
            <span class="home-stat-label">Sword</span>
            <span class="home-stat-value" id="home-attack">+0%</span>
            <button type="button" class="home-btn-upgrade" data-upgrade="attack">Upgrade</button>
          </div>
          <div class="home-stat-row">
            <span class="home-stat-label">Daily Mining Limit</span>
            <span class="home-stat-value" id="home-daily-limit">0/300</span>
          </div>
        </div>
      </div>
    </div>
    <div class="home-upgrade-popup hidden" id="home-upgrade-popup" aria-hidden="true">
      <div class="home-upgrade-popup-inner">
        <div class="home-upgrade-popup-header">
          <h3 class="home-upgrade-popup-title" id="home-upgrade-title">Upgrade</h3>
          <button type="button" class="home-upgrade-close" aria-label="Close">&times;</button>
        </div>
        <div class="home-upgrade-popup-body" id="home-upgrade-body"></div>
        <div class="home-upgrade-popup-footer">
          <button type="button" class="home-upgrade-confirm" id="home-upgrade-confirm">Confirm</button>
          <div class="home-upgrade-msg" id="home-upgrade-msg" role="status"></div>
        </div>
      </div>
    </div>
  `;

  const panel = wrap.querySelector(".home-window") as HTMLDivElement;
  const closeBtn = panel.querySelector(".home-window-close") as HTMLButtonElement;
  wrap.addEventListener("click", (e) => {
    if (e.target === wrap) closeHome();
  });
  closeBtn?.addEventListener("click", () => closeHome());

  wrap.querySelectorAll(".home-btn-upgrade").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const type = (btn as HTMLElement).dataset.upgrade as UpgradeType;
      if (type) openUpgradePopup(type);
    });
  });

  const popup = wrap.querySelector("#home-upgrade-popup");
  const popupClose = wrap.querySelector(".home-upgrade-close");
  popupClose?.addEventListener("click", closeUpgradePopup);
  popup?.addEventListener("click", (e) => {
    if (e.target === popup) closeUpgradePopup();
  });

  overlay = wrap;
  return wrap;
}

function bindState(): void {
  if (!overlay) return;
  const avatarEl = overlay.querySelector("#home-avatar") as HTMLImageElement | null;
  if (avatarEl) {
    avatarEl.src = safeAvatarUrl(homeState.avatarUrl) ?? DEFAULT_AVATAR;
    avatarEl.onerror = () => { avatarEl.src = DEFAULT_AVATAR; avatarEl.onerror = null; };
  }
  const set = (id: string, text: string) => {
    const el = document.getElementById(id);
    if (el) el.textContent = text;
  };
  set("home-name", homeState.playerName);
  set("home-level", String(homeState.level));
  set("home-move-speed", homeState.moveSpeed);
  const miningEffEl = document.getElementById("home-mining-eff");
  if (miningEffEl) miningEffEl.innerHTML = getMiningOneLineHTML(homeState.miningEfficiencyLevel + 1);
  set("home-capacity", String(homeState.backpackCapacity));
  homeState.attack = String(attackFromBowLevel(homeState.bowLevel));
  set("home-attack", homeState.attack);
  set("home-daily-limit", `${homeState.dailyMinedToday}/${homeState.dailyMiningLimitNum}`);

  const hpFill = document.getElementById("home-hp-fill");
  const hpText = document.getElementById("home-hp-text");
  const maxHp = homeState.maxHp || 100;
  const currentHp = Math.min(homeState.currentHp, maxHp);
  if (hpFill) (hpFill as HTMLElement).style.width = maxHp > 0 ? `${(currentHp / maxHp) * 100}%` : "0%";
  if (hpText) hpText.textContent = `${currentHp}/${maxHp} HP`;

  const xpFill = document.getElementById("home-xp-fill");
  const xpText = document.getElementById("home-xp-text");
  if (homeState.level >= 10) {
    if (xpFill) (xpFill as HTMLElement).style.width = "100%";
    if (xpText) xpText.textContent = "MAX";
  } else {
    if (xpFill) (xpFill as HTMLElement).style.width = `${Math.min(100, homeState.xpToNextLevel > 0 ? (homeState.currentXp / homeState.xpToNextLevel) * 100 : 0)}%`;
    if (xpText) xpText.textContent = `${homeState.currentXp}/${homeState.xpToNextLevel} XP`;
  }
}

export function initHomeWindow(container?: HTMLElement | null): void {
  if (overlay) return;
  const parent = container ?? (typeof document !== "undefined" ? (document.querySelector(".ui-scale-wrapper") ?? document.body) : null);
  if (!parent) return;
  overlay = createWindow();
  parent.appendChild(overlay);
  overlay.style.display = "none";
}

export function openHome(): void {
  if (!overlay) {
    initHomeWindow();
    if (!overlay) return;
  }
  closeUpgradePopup();
  bindState();
  const token = getToken();
  if (token) {
    getCharacter(token).then((cr) => {
      if (cr?.ok) {
        applyCharacterData(cr.data.character, cr.data.slots);
        syncHeader();
        bindState();
      }
    });
  }
  overlay.style.display = "flex";
  overlay.querySelector(".home-window")?.focus();
  escHandler = (e: KeyboardEvent) => {
    if (e.key === "Escape") {
      if (document.getElementById("home-upgrade-popup")?.classList.contains("hidden")) closeHome();
      else closeUpgradePopup();
    }
  };
  document.addEventListener("keydown", escHandler);
}

export function closeHome(): void {
  if (!overlay) return;
  overlay.style.display = "none";
  closeUpgradePopup();
  if (escHandler) {
    document.removeEventListener("keydown", escHandler);
    escHandler = null;
  }
}

export function isHomeOpen(): boolean {
  return !!overlay && overlay.style.display === "flex";
}
