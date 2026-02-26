/**
 * PvP Arena window: CREATE PVP BATTLE (name, stake), list of battles, ENTER.
 * Does not modify existing arena flow.
 */

import { getToken } from "./api";
import {
  postPvpCreateBattle,
  getPvpBattles,
  getPvpBattle,
  postPvpEnterBattle,
  type PvpBattle,
  type PvpEnterResponse,
} from "./api";
import { logAction } from "./actionsLog";

let overlay: HTMLDivElement | null = null;
let escHandler: ((e: KeyboardEvent) => void) | null = null;
let pollBattleId: string | null = null;
let pollIntervalId: ReturnType<typeof setInterval> | null = null;

function createWindow(): HTMLDivElement {
  const wrap = document.createElement("div");
  wrap.className = "arena-window-overlay pvp-arena-overlay";
  wrap.tabIndex = -1;
  wrap.innerHTML =
    '<div class="arena-window pvp-arena-window" role="dialog" aria-label="PvP Arena" tabindex="0">' +
    '<div class="arena-window-header">' +
    '<div class="arena-window-title-row"><h2 class="arena-window-title">PVP ARENA</h2>' +
    '<button type="button" class="arena-window-close" aria-label="Close">&times;</button></div>' +
    '<p class="arena-window-subtitle">Create a battle or enter an existing one</p>' +
    "</div>" +
    '<div class="arena-window-body">' +
    '<section class="pvp-create-block">' +
    '<button type="button" class="arena-btn-enter pvp-btn-create" data-pvp-create>CREATE PVP BATTLE</button>' +
    "</section>" +
    '<section class="pvp-form-block" data-pvp-form style="display:none">' +
    '<label>Battle name <input type="text" data-pvp-name maxlength="64" placeholder="My battle" /></label>' +
    '<label>Stake $PFV <input type="number" data-pvp-stake min="1" step="1" value="10" /></label>' +
    '<div class="pvp-form-buttons"><button type="button" class="arena-btn-enter" data-pvp-submit>CREATE</button> <button type="button" class="arena-window-close" data-pvp-cancel>Cancel</button></div>' +
    "</section>" +
    '<section class="pvp-list-block">' +
    '<p class="arena-window-desc">Open battles — click ENTER to join (stake is deducted when both have joined).</p>' +
    '<div class="pvp-table-wrap"><table class="pvp-battles-table"><thead><tr><th>Name</th><th>Players</th><th>$PFV</th><th></th></tr></thead><tbody data-pvp-tbody></tbody></table></div>' +
    '<p class="pvp-waiting-msg" data-pvp-waiting style="display:none">Waiting for opponent (1/2)…</p>' +
    "</section></div></div>";
  const panel = wrap.querySelector(".pvp-arena-window") as HTMLDivElement;
  if (!panel) return wrap;

  const closeBtn = panel.querySelector(".arena-window-close") as HTMLButtonElement;
  const btnCreate = panel.querySelector("[data-pvp-create]") as HTMLButtonElement;
  const formBlock = panel.querySelector("[data-pvp-form]") as HTMLElement;
  const inputName = panel.querySelector("[data-pvp-name]") as HTMLInputElement;
  const inputStake = panel.querySelector("[data-pvp-stake]") as HTMLInputElement;
  const btnSubmit = panel.querySelector("[data-pvp-submit]") as HTMLButtonElement;
  const btnCancel = panel.querySelector("[data-pvp-cancel]") as HTMLButtonElement;
  const tbody = panel.querySelector("[data-pvp-tbody]") as HTMLElement;
  const waitingMsg = panel.querySelector("[data-pvp-waiting]") as HTMLElement;

  wrap.addEventListener("click", (e) => {
    if (e.target === wrap) closePvpArena();
  });
  if (closeBtn) closeBtn.addEventListener("click", () => closePvpArena());

  if (btnCreate) {
    btnCreate.addEventListener("click", () => {
      formBlock.style.display = formBlock.style.display ? "" : "block";
    });
  }
  if (btnCancel) {
    btnCancel.addEventListener("click", () => {
      formBlock.style.display = "none";
    });
  }
  if (btnSubmit) {
    btnSubmit.addEventListener("click", async () => {
      const name = inputName?.value?.trim() || "";
      const stake = Math.max(1, Math.floor(Number(inputStake?.value) || 10));
      if (!name) return;
      btnSubmit.disabled = true;
      const token = getToken();
      const res = await postPvpCreateBattle(token, name, stake);
      btnSubmit.disabled = false;
      if (res.ok && res.battle) {
        formBlock.style.display = "none";
        inputName.value = "";
        inputStake.value = String(stake);
        await refreshList();
        startPollingBattle(res.battle.id);
        if (waitingMsg) waitingMsg.style.display = "";
      } else if (!res.ok) {
        const msg =
          res.error === "insufficient_pfv" && "required" in res
            ? `Not enough $PFV. Required: ${res.required}, your balance: ${res.available}.`
            : res.error || "Could not create battle.";
        alert(msg);
      }
    });
  }

  async function refreshList() {
    const token = getToken();
    const [openRes, mineRes] = await Promise.all([
      getPvpBattles(token, false),
      getPvpBattles(token, true),
    ]);
    const open = openRes.ok ? openRes.battles : [];
    const mine = mineRes.ok ? mineRes.battles : [];
    const ids = new Set(open.map((b) => b.id));
    mine.forEach((b) => ids.add(b.id));
    const all = [...open, ...mine.filter((b) => !ids.has(b.id))].sort((a, b) => 0);
    renderBattles(all);
  }

  function renderBattles(battles: PvpBattle[]) {
    if (!tbody) return;
    tbody.innerHTML = "";
    battles.forEach((b) => {
      const tr = document.createElement("tr");
      tr.innerHTML =
        `<td>${escapeHtml(b.name)}</td>` +
        `<td>${b.participants}/${b.maxParticipants}</td>` +
        `<td>${b.stakePfv}</td>` +
        '<td><button type="button" class="pvp-btn-enter" data-battle-id="' + escapeAttr(b.id) + '" ' +
        (b.participants >= 2 || b.isCreator ? "disabled" : "") + ">ENTER</button></td>";
      const btn = tr.querySelector(".pvp-btn-enter") as HTMLButtonElement;
      if (btn && b.participants < 2 && !b.isCreator) {
        btn.addEventListener("click", async () => {
          const token = getToken();
          const res = await postPvpEnterBattle(token, b.id);
          if (res.ok && "runId" in res) {
            closePvpArena();
            logAction("Enter PvP Battle");
            startPvpFight(res as PvpEnterResponse);
          } else {
            alert((res as { error?: string }).error || "Could not enter battle");
          }
        });
      }
      tbody.appendChild(tr);
    });
  }

  function escapeHtml(s: string): string {
    const div = document.createElement("div");
    div.textContent = s;
    return div.innerHTML;
  }
  function escapeAttr(s: string): string {
    return s.replace(/"/g, "&quot;");
  }

  (wrap as unknown as { _refreshList: () => Promise<void> })._refreshList = refreshList;
  return wrap;
}

  function startPollingBattle(battleId: string) {
  if (pollIntervalId) clearInterval(pollIntervalId);
  pollBattleId = battleId;
  const waitEl = overlay?.querySelector("[data-pvp-waiting]") as HTMLElement | null;
  if (waitEl) waitEl.style.display = "";
  pollIntervalId = setInterval(async () => {
    if (!pollBattleId) return;
    const token = getToken();
    const res = await getPvpBattle(token, pollBattleId);
    if (!res.ok || !res.battle) return;
    const b = res.battle;
    if (b.status === "IN_PROGRESS" && b.runId) {
      stopPollingBattle();
      if (waitEl) waitEl.style.display = "none";
      closePvpArena();
      const startPvp = (typeof window !== "undefined" && (window as unknown as { __startPvpArena?: (opts: PvpStartOpts) => void }).__startPvpArena);
      if (startPvp && b.myHp != null && b.opponentHp != null && b.myMaxHp != null && b.opponentMaxHp != null) {
        logAction("PvP Battle started");
        startPvp({
          runId: b.runId,
          battleId: b.id,
          myHp: b.myHp,
          opponentHp: b.opponentHp,
          myMaxHp: b.myMaxHp,
          opponentMaxHp: b.opponentMaxHp,
          myLevel: b.myLevel ?? 1,
          myBowLevel: b.myBowLevel ?? 0,
          opponentLevel: b.opponentLevel ?? 1,
          opponentBowLevel: b.opponentBowLevel ?? 0,
          stakePfv: b.stakePfv ?? 0,
          isPlayer1: true,
        });
      }
    }
  }, 2000);
}

function stopPollingBattle() {
  pollBattleId = null;
  if (pollIntervalId) {
    clearInterval(pollIntervalId);
    pollIntervalId = null;
  }
}

export type PvpStartOpts = {
  runId: string;
  battleId: string;
  myHp: number;
  opponentHp: number;
  myMaxHp: number;
  opponentMaxHp: number;
  myLevel?: number;
  myBowLevel?: number;
  opponentLevel?: number;
  opponentBowLevel?: number;
  stakePfv: number;
  isPlayer1: boolean;
};
declare let __startPvpArena: ((opts: PvpStartOpts) => void) | undefined;
function startPvpFight(data: PvpEnterResponse) {
  const win = typeof window !== "undefined" ? window : null;
  const startPvp = win && (win as unknown as { __startPvpArena?: (opts: PvpStartOpts) => void }).__startPvpArena;
  if (startPvp) {
    startPvp({
      runId: data.runId,
      battleId: data.battleId,
      myHp: data.myCharacter.currentHp,
      opponentHp: data.opponentCharacter.currentHp,
      myMaxHp: data.myCharacter.maxHp,
      opponentMaxHp: data.opponentCharacter.maxHp,
      myLevel: data.myCharacter.level,
      myBowLevel: data.myCharacter.bowLevel,
      opponentLevel: data.opponentCharacter.level,
      opponentBowLevel: data.opponentCharacter.bowLevel,
      stakePfv: data.stakePfv ?? 0,
      isPlayer1: false,
    });
  }
}

export function initPvpArenaWindow(container?: HTMLElement | null): void {
  if (overlay) return;
  const parent = container ?? (typeof document !== "undefined" ? (document.querySelector(".ui-scale-wrapper") ?? document.body) : null);
  if (!parent) return;
  overlay = createWindow();
  parent.appendChild(overlay);
  overlay.style.display = "none";
}

export function openPvpArena(): void {
  setTimeout(async () => {
    if (!overlay) {
      initPvpArenaWindow();
      if (!overlay) return;
    }
    (overlay as unknown as { _refreshList: () => Promise<void> })._refreshList?.();
    (overlay.querySelector(".pvp-arena-window") as HTMLElement)?.focus();
    overlay.style.display = "flex";
    escHandler = (e: KeyboardEvent) => {
      if (e.key === "Escape") closePvpArena();
    };
    document.addEventListener("keydown", escHandler);
  }, 0);
}

export function closePvpArena(): void {
  if (!overlay) return;
  overlay.style.display = "none";
  if (escHandler) {
    document.removeEventListener("keydown", escHandler);
    escHandler = null;
  }
  // Do not stop polling here: creator may close the "Waiting" modal but must still be moved to the arena when the second player joins.
}

export function isPvpArenaOpen(): boolean {
  return !!overlay && overlay.style.display === "flex";
}
