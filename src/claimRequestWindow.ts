/**
 * Claim Request — standalone window with Claim tab content only.
 * Same design as Market window.
 */
import "./marketWindow.css";
import {
  getToken,
  getCharacter,
  getWithdrawStatus,
  getWithdrawHistory,
  postWithdraw,
} from "./api";
import { applyCharacterData } from "./gameState";
import { playWithdrawal, prepareSfx } from "./gameSfx";
import { getConnectedWallet, shortAddress, onWalletChange, disconnectWallet, openConnectModal } from "./wallet";
import { syncHeader } from "./uiHeader";
import { escapeHtml, formatPfv as formatPfvUtil, formatPfvSpace as formatPfvSpaceUtil } from "./utils";
import { marketState } from "./marketWindow";
import type { WithdrawStatusResponse, WithdrawHistoryItem } from "./api";

let overlay: HTMLDivElement | null = null;
let escHandler: ((e: KeyboardEvent) => void) | null = null;
let toastEl: HTMLDivElement | null = null;
let timerInterval: ReturnType<typeof setInterval> | null = null;

interface WithdrawRecord {
  status: string;
  amountPfv: number;
  wallet: string;
  walletShort: string;
  txid: string;
  date: string;
}

function formatDateShort(d: Date): string {
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}
function msToHHMMSS(ms: number): string {
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return `${h}:${m.toString().padStart(2, "0")}:${sec.toString().padStart(2, "0")}`;
}
function shortenWalletClaim(w: string): string {
  return w.length <= 9 ? w : w.slice(0, 4) + "..." + w.slice(-4);
}
function formatAvailablePfv(n: number): string {
  return formatPfvUtil(n) + " $PFV";
}

function showToast(msg: string, isError = false): void {
  if (!toastEl) return;
  toastEl.textContent = msg;
  toastEl.classList.toggle("market-toast-error", isError);
  toastEl.classList.add("market-toast-visible");
  setTimeout(() => toastEl?.classList.remove("market-toast-visible"), 2500);
}

function stopTimers(): void {
  if (timerInterval) {
    clearInterval(timerInterval);
    timerInterval = null;
  }
}

function createWindow(): HTMLDivElement {
  const wrap = document.createElement("div");
  wrap.className = "market-window-overlay claim-request-overlay";
  wrap.tabIndex = -1;
  wrap.innerHTML = `
    <div class="market-window claim-request-window" role="dialog" aria-label="Claim Request" tabindex="0">
      <div class="market-window-header">
        <div class="market-window-title-row">
          <h2 class="market-window-title">Claim Request</h2>
          <button type="button" class="market-window-close" aria-label="Close">&times;</button>
        </div>
      </div>
      <div class="market-window-body">
        <div class="market-panel market-panel-withdraw" data-panel="withdraw">
          <div class="market-withdraw-four-cards">
            <div class="market-top-card">
              <span class="market-top-card-label">Limit</span>
              <span class="market-top-card-value market-value-green" data-withdraw-limit>0/3</span>
            </div>
            <div class="market-top-card">
              <span class="market-top-card-label">Total $PFV</span>
              <span class="market-top-card-value market-value-green" data-withdraw-total-pfv>0</span>
            </div>
            <div class="market-top-card">
              <span class="market-top-card-label">Reserved $PFV</span>
              <span class="market-top-card-value market-value-green" data-withdraw-claim-reserved>0</span>
            </div>
            <div class="market-top-card">
              <span class="market-top-card-label">Total Claimed</span>
              <span class="market-top-card-value market-value-green" data-withdraw-total-all>0</span>
            </div>
          </div>
          <div class="market-withdraw-timer-row" aria-hidden="true">
            <div class="market-withdraw-timer-cell"><span class="market-withdraw-timer" data-withdraw-next-update></span></div>
            <div></div><div></div><div></div>
          </div>
          <div class="market-withdraw-form-card">
            <div class="market-withdraw-form-row">
              <div class="market-withdraw-field">
                <span class="market-withdraw-field-label">Solana Wallet</span>
                <div class="market-withdraw-wallet-display" data-withdraw-wallet-display>
                  <span class="market-withdraw-wallet-value" data-withdraw-wallet-value>—</span>
                  <button type="button" class="market-withdraw-disconnect market-withdraw-link-yellow" data-withdraw-disconnect style="display:none">Disconnect</button>
                </div>
                <div class="market-withdraw-wallet-connect-wrap" data-withdraw-wallet-connect-wrap style="display:none">
                  <button type="button" class="market-withdraw-connect-btn" data-withdraw-connect-wallet>Connect wallet</button>
                </div>
              </div>
              <div class="market-withdraw-field">
                <span class="market-withdraw-field-label">Amount $PFV</span>
                <input type="number" min="1000" step="0.001" data-withdraw-amount placeholder="Min 1000" class="market-withdraw-input" />
                <span class="market-withdraw-available-hint" data-withdraw-available-hint>Available: <span class="market-withdraw-available-value">0</span></span>
              </div>
            </div>
          </div>
          <div class="market-withdraw-btn-row">
            <button type="button" class="market-btn market-btn-withdraw" data-btn-withdraw>Create Claim Request</button>
          </div>
          <div class="market-table-card">
            <div class="market-table-wrap market-table-wrap-scroll">
              <table class="market-table">
                <thead><tr><th>STATUS</th><th>WALLET</th><th>$PFV</th><th>DATE</th><th>TXID</th></tr></thead>
                <tbody data-withdraw-tbody></tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
      <div class="market-toast" id="claim-request-toast" aria-live="polite"></div>
    </div>
  `;
  return wrap;
}

function copyToClipboard(text: string): void {
  if (navigator.clipboard?.writeText) navigator.clipboard.writeText(text);
}

export function openClaimRequest(): void {
  const parent = document.querySelector(".ui-scale-wrapper") ?? document.body;
  if (!overlay) {
    overlay = createWindow();
    parent.appendChild(overlay);
    overlay.style.display = "none";
    toastEl = document.getElementById("claim-request-toast");
  }

  let withdrawStatus: WithdrawStatusResponse | null = null;
  let withdrawals: WithdrawRecord[] = [];
  let marketUserLevel: number | null = null;

  const panel = overlay!.querySelector("[data-panel=withdraw]") as HTMLElement;
  const amountInput = panel.querySelector("[data-withdraw-amount]") as HTMLInputElement;

  function updateTimers(): void {
    if (!withdrawStatus?.nextPoolUpdateAt) return;
    const ms = new Date(withdrawStatus.nextPoolUpdateAt).getTime() - Date.now();
    const el = panel.querySelector("[data-withdraw-next-update]") as HTMLElement;
    if (el) el.textContent = ms > 0 ? `Update: ${msToHHMMSS(ms)}` : "";
  }

  function render(): void {
    const connectedWallet = getConnectedWallet();
    const walletValueEl = panel.querySelector("[data-withdraw-wallet-value]") as HTMLElement;
    const disconnectBtn = panel.querySelector("[data-withdraw-disconnect]") as HTMLElement;
    const connectWrap = panel.querySelector("[data-withdraw-wallet-connect-wrap]") as HTMLElement;
    if (walletValueEl) walletValueEl.textContent = connectedWallet ? shortAddress(connectedWallet) : "No wallet";
    if (disconnectBtn) disconnectBtn.style.display = connectedWallet ? "" : "none";
    if (connectWrap) connectWrap.style.display = connectedWallet ? "none" : "";

    const availablePfv = withdrawStatus?.availablePfv ?? 0;
    const claimReserved = withdrawStatus?.claimReservedPfv ?? 0;
    const totalReserved = withdrawStatus?.totalReservedPfv ?? 0;
    const withdrawsLeft = withdrawStatus?.withdrawsLeft ?? 0;
    const totalWithdrawn = withdrawStatus?.totalWithdrawnAllTime ?? 0;

    (panel.querySelector("[data-withdraw-claim-reserved]") as HTMLElement).textContent = formatPfvUtil(claimReserved);
    (panel.querySelector("[data-withdraw-total-pfv]") as HTMLElement).textContent = formatPfvUtil(totalReserved);
    (panel.querySelector("[data-withdraw-limit]") as HTMLElement).textContent = `${withdrawsLeft}/3`;
    (panel.querySelector("[data-withdraw-total-all]") as HTMLElement).textContent = formatPfvUtil(totalWithdrawn);

    const nextEl = panel.querySelector("[data-withdraw-next-update]") as HTMLElement;
    if (withdrawStatus?.nextPoolUpdateAt && nextEl) {
      const ms = new Date(withdrawStatus.nextPoolUpdateAt).getTime() - Date.now();
      nextEl.innerHTML = ms > 0 ? `Update: <span class="market-withdraw-timer-countdown">${msToHHMMSS(ms)}</span>` : "";
    }

    const availableHintEl = panel.querySelector("[data-withdraw-available-hint]") as HTMLElement;
    const availableValueEl = availableHintEl?.querySelector(".market-withdraw-available-value");
    const availableStr = formatAvailablePfv(availablePfv);
    if (availableValueEl) availableValueEl.textContent = availableStr;
    else if (availableHintEl) availableHintEl.textContent = `Available: ${availableStr}`;

    const withdrawAmountNum = parseFloat(amountInput?.value ?? "0") || 0;
    const withdrawBtn = panel.querySelector("[data-btn-withdraw]") as HTMLButtonElement;
    const hasWallet = !!connectedWallet;
    if (withdrawBtn) {
      withdrawBtn.disabled = withdrawsLeft <= 0 || withdrawAmountNum > availablePfv || !hasWallet;
    }

    const tbody = panel.querySelector("[data-withdraw-tbody]") as HTMLElement;
    if (tbody) {
      const shortTxid = (txid: string) => (txid.length <= 12 ? txid : txid.slice(0, 6) + "…" + txid.slice(-4));
      tbody.innerHTML = withdrawals
        .map((r) => {
          const statusClass = r.status === "PENDING" ? "market-status-pending" : r.status === "COMPLETED" ? "market-status-completed" : r.status === "CANCELLED" ? "market-status-cancelled" : "";
          const displayWallet = r.walletShort ?? shortenWalletClaim(r.wallet);
          return `<tr>
            <td class="${statusClass}">${escapeHtml(r.status)}</td>
            <td class="market-table-wallet-cell"><span class="market-table-txid market-wallet-short" title="${escapeHtml(r.wallet)}">${escapeHtml(displayWallet)}</span><button type="button" class="market-btn-copy-icon" data-copy-wallet="${escapeHtml(r.wallet)}" aria-label="Copy wallet">&#x2398;</button></td>
            <td>${formatPfvSpaceUtil(r.amountPfv)}</td>
            <td>${formatDateShort(new Date(r.date))}</td>
            <td class="market-table-txid-cell"><span class="market-table-txid" title="${escapeHtml(r.txid)}">${escapeHtml(shortTxid(r.txid))}</span><button type="button" class="market-btn-copy-icon" data-copy-txid="${escapeHtml(r.txid)}" aria-label="Copy TXID">&#x2398;</button></td>
          </tr>`;
        })
        .join("");
      tbody.querySelectorAll("[data-copy-txid]").forEach((btn) => {
        btn.addEventListener("click", () => copyToClipboard((btn as HTMLElement).dataset.copyTxid ?? ""));
      });
      tbody.querySelectorAll("[data-copy-wallet]").forEach((btn) => {
        btn.addEventListener("click", () => copyToClipboard((btn as HTMLElement).dataset.copyWallet ?? ""));
      });
    }
  }

  let unsubWallet: (() => void) | null = null;

  function close(): void {
    stopTimers();
    unsubWallet?.();
    unsubWallet = null;
    overlay!.style.display = "none";
    if (escHandler) {
      document.removeEventListener("keydown", escHandler);
      escHandler = null;
    }
  }

  unsubWallet = onWalletChange(() => render());

  panel.querySelector("[data-withdraw-disconnect]")?.addEventListener("click", () => {
    void disconnectWallet().then(() => render());
  });
  panel.querySelector("[data-withdraw-connect-wallet]")?.addEventListener("click", () => openConnectModal());
  amountInput?.addEventListener("input", () => render());

  panel.querySelector("[data-btn-withdraw]")?.addEventListener("click", async () => {
    prepareSfx();
    if (marketUserLevel != null && marketUserLevel < 3) {
      showToast("Market available from level 3", true);
      return;
    }
    const token = getToken();
    if (!token) {
      showToast("Please log in", true);
      return;
    }
    const wallet = getConnectedWallet();
    if (!wallet) {
      showToast("Connect wallet first", true);
      return;
    }
    const amount = parseFloat(amountInput?.value ?? "0");
    if (!Number.isFinite(amount) || amount < 1000) {
      showToast("Min 1000 $PFV", true);
      return;
    }
    if (withdrawStatus && (withdrawStatus.withdrawsLeft <= 0 || amount > withdrawStatus.availablePfv)) {
      showToast(withdrawStatus.withdrawsLeft <= 0 ? "Withdraw limit reached" : "Amount exceeds available PFV", true);
      return;
    }
    const res = await postWithdraw(token, { amountPfv: amount, walletAddress: wallet });
    if (!res.ok) {
      showToast(res.error ?? `Error ${res.status}`, true);
      return;
    }
    playWithdrawal();
    withdrawStatus = {
      ...withdrawStatus!,
      availablePfv: res.data.balances.availablePfv,
      claimReservedPfv: res.data.balances.claimReservedPfv,
      totalReservedPfv: res.data.balances.totalReservedPfv,
      withdrawsUsed: res.data.withdrawsUsed,
      withdrawsLeft: res.data.withdrawsLeft,
      nextPoolUpdateAt: withdrawStatus?.nextPoolUpdateAt ?? "",
      totalWithdrawnAllTime: withdrawStatus?.totalWithdrawnAllTime ?? 0,
    };
    marketState.pfvBalance = res.data.balances.availablePfv;
    syncHeader();
    withdrawals.unshift({
      status: res.data.withdrawal.status,
      amountPfv: res.data.withdrawal.amountPfv,
      wallet: res.data.withdrawal.walletAddress ?? wallet ?? "",
      walletShort: res.data.withdrawal.walletShort,
      txid: res.data.withdrawal.txid,
      date: res.data.withdrawal.date,
    });
    amountInput.value = "";
    showToast("Withdraw request created");
    render();
  });

  overlay.querySelector(".market-window-close")?.addEventListener("click", close);

  const token = getToken();
  if (token) {
    getCharacter(token).then((r) => {
      if (r?.ok) {
        marketUserLevel = r.data.character.level;
        applyCharacterData(r.data.character, r.data.slots);
        syncHeader();
      }
      render();
    });
  }

  Promise.all([getWithdrawStatus(token), getWithdrawHistory(token)]).then(([statusRes, historyRes]) => {
    if (statusRes.ok) {
      withdrawStatus = statusRes.data;
      marketState.pfvBalance = statusRes.data.availablePfv;
      syncHeader();
    }
    if (historyRes.ok) {
      withdrawals = historyRes.data.map((h: WithdrawHistoryItem) => ({
        status: h.status,
        amountPfv: h.amountPfv,
        wallet: h.walletAddress,
        walletShort: h.walletShort,
        txid: h.txid,
        date: h.date,
      }));
    }
    render();
  });

  timerInterval = setInterval(updateTimers, 1000);
  overlay!.style.display = "flex";
  overlay!.querySelector(".market-window")?.focus();
  escHandler = (e: KeyboardEvent) => { if (e.key === "Escape") close(); };
  document.addEventListener("keydown", escHandler);
}
