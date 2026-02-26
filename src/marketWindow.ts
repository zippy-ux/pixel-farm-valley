/**
 * Market window — UI overlay with tabs: Sell, Withdraw, Statistics, Leaderboard, Guide.
 * Time and market status from GET /api/market/state (server UTC). Exports marketState.pfvBalance / reservedPfv for header/backpack/gameState.
 */

import "./marketWindow.css";
import {
  getMarketState,
  getToken,
  getMarketWindowPoints,
  getMarketSales,
  postMarketSell,
  getMarketLastWindow,
  getMarketLastWindowYourStats,
  getMarketAllTimeStats,
  getMarketLeaderboard,
  getWithdrawStatus,
  getWithdrawHistory,
  postWithdraw,
  getCharacter,
  type MarketStateResponse,
  type WithdrawStatusResponse,
  type WithdrawHistoryItem,
  type MarketLeaderboardRow,
} from "./api";
import { applyCharacterData } from "./gameState";
import { playMarketSell, playWithdrawal, prepareSfx } from "./gameSfx";
import { getConnectedWallet, shortAddress, onWalletChange, disconnectWallet, openConnectModal } from "./wallet";
import { syncHeader } from "./uiHeader";
import { escapeHtml, formatPfv as formatPfvUtil, formatPfvSpace as formatPfvSpaceUtil, safeAvatarUrl } from "./utils";

const GOLD_ICON = "/assets/interface/gold.png";
const SILVER_ICON = "/assets/interface/silver.png";
const BRONZE_ICON = "/assets/interface/bronze.png";

// --- Shared state: used by backpackWindow, gameState, uiHeader ---
export const marketState = {
  pfvBalance: 0,
  reservedPfv: 0,
};

// --- Mock state for Market UI (no API) ---
type MarketTab = "sell" | "withdraw" | "statistics" | "leaderboard" | "guide";

const POINTS_PER = { gold: 8, silver: 3, bronze: 1 } as const;

interface SellRecord {
  status: string;
  points: number;
  pfv?: number | null;
  txid: string;
  date: string;
  windowId?: string;
}

interface WithdrawRecord {
  status: string;
  amountPfv: number;
  wallet: string;
  walletShort: string;
  txid: string;
  date: string;
}

const mockState = {
  activeTab: "sell" as MarketTab,
  // Top block (pool values from API /api/market/state)
  marketStatus: "Open" as "Open" | "Closed",
  totalPoolPfv: "0",
  currentWindowPool: "0",
  timerNextUpdate: "", // filled by interval (e.g. "06:42:11")
  timerWindowClose: "", // filled by interval
  priceGold: "8",
  priceSilver: "3",
  priceBronze: "1",
  // Sell tab
  totalPointsInWindow: 45000,
  yourPointsInWindow: 120,
  sellGold: 0,
  sellSilver: 0,
  sellBronze: 0,
  sales: [] as SellRecord[],
  // Withdraw tab (from API when opened)
  withdrawStatus: null as WithdrawStatusResponse | null,
  withdrawals: [] as WithdrawRecord[],
  withdrawWallet: "",
  withdrawAmount: "",
  // Leaderboard
  leaderboardMode: "sales" as "sales" | "withdrawals",
  leaderboardPeriod: "allTime" as "allTime" | "lastDay",
};

let overlay: HTMLDivElement | null = null;
let escHandler: ((e: KeyboardEvent) => void) | null = null;
let toastEl: HTMLDivElement | null = null;
let timerInterval: ReturnType<typeof setInterval> | null = null;
let pollInterval: ReturnType<typeof setInterval> | null = null;
let visibilityHandler: (() => void) | null = null;

/** Last successful API state and local time when we received it (for server-time countdown). */
let marketStateFromApi: MarketStateResponse | null = null;
let lastMarketStateFetchAt = 0;
/** When window countdown hit 0, refetch once (throttle). */
let lastWindowEndRefetchAt = 0;
let onWindowEndedRefetch: (() => void) | null = null;
/** Last distributed window (Statistics tab). */
let lastWindowData: { windowId: string; windowPoolPfv: number; totalPoints: number; pricePerPoint: number | null; distributedPfv: number; returnedPfv: number } | null = null;
/** Your points and earned PFV in last window (Statistics). */
let yourLastWindowStats: { yourPoints: number; yourEarnedPfv: number } | null = null;
/** All-time stats (Statistics tab). */
let allTimeStats: { poolPfv: number; points: number; earnedPfv: number; claimedPfv: number } | null = null;
/** Leaderboard rows from API. */
let leaderboardRows: MarketLeaderboardRow[] = [];
/** User's character level from server (for market level gate). null = not loaded. */
let marketUserLevel: number | null = null;
function mockTxid(prefix: "S" | "W"): string {
  const id = Math.random().toString(36).slice(2, 7).toUpperCase();
  return `${prefix}-${id}`;
}

const MONTH_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function formatDateShort(d: Date): string {
  const day = d.getDate();
  const month = MONTH_SHORT[d.getMonth()];
  const h = d.getHours();
  const m = d.getMinutes();
  return `${day} ${month} ${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function msToHHMMSS(ms: number): string {
  const clamped = Math.max(0, Math.floor(ms / 1000));
  const s = clamped % 60;
  const m = Math.floor(clamped / 60) % 60;
  const h = Math.floor(clamped / 3600);
  return [h, m, s].map((n) => String(n).padStart(2, "0")).join(":");
}

/** Compute server "now" from last API response (serverTimeUtc + elapsed since fetch). */
function getServerNowMs(): number | null {
  if (!marketStateFromApi || lastMarketStateFetchAt <= 0) return null;
  const serverTimeMs = new Date(marketStateFromApi.serverTimeUtc).getTime();
  return serverTimeMs + (Date.now() - lastMarketStateFetchAt);
}

function updateTimers() {
  const serverNow = getServerNowMs();
  if (serverNow !== null && marketStateFromApi) {
    const windowEndMs = new Date(marketStateFromApi.window.endAt).getTime() - serverNow;
    const isWindowEnded = windowEndMs <= 0;
    mockState.timerWindowClose = isWindowEnded ? "…" : msToHHMMSS(windowEndMs);
    mockState.marketStatus = marketStateFromApi.marketStatus === "OPEN" ? "Open" : "Closed";
    if (marketStateFromApi.marketStatus === "CLOSED" && marketStateFromApi.maintenanceEndsAt) {
      const maintenanceMs = new Date(marketStateFromApi.maintenanceEndsAt).getTime() - serverNow;
      mockState.timerNextUpdate = msToHHMMSS(maintenanceMs);
    } else {
      const nextPoolMs = new Date(marketStateFromApi.nextPoolUpdateAt).getTime() - serverNow;
      mockState.timerNextUpdate = msToHHMMSS(nextPoolMs);
    }
    if (isWindowEnded && onWindowEndedRefetch && Date.now() - lastWindowEndRefetchAt > 2000) {
      lastWindowEndRefetchAt = Date.now();
      onWindowEndedRefetch();
    }
  } else {
    mockState.timerNextUpdate = "—";
    mockState.timerWindowClose = "—";
    mockState.marketStatus = "Open";
  }
}

async function fetchMarketStateAndRender(render: () => void) {
  const result = await getMarketState();
  if (result.ok) {
    marketStateFromApi = result.data;
    lastMarketStateFetchAt = Date.now();
    mockState.totalPoolPfv = formatPfv(result.data.currentPoolPfv ?? 0);
    mockState.currentWindowPool =
      result.data.isCycleLocked && result.data.currentWindowPoolPfv != null
        ? formatPfv(result.data.currentWindowPoolPfv)
        : "—";
    const poolEl = document.getElementById("ui-pool-pfv");
    if (poolEl) poolEl.textContent = mockState.totalPoolPfv === "—" ? "—" : mockState.totalPoolPfv + " $PFV";
    const onlineEl = document.getElementById("ui-system-online-count");
    if (onlineEl) onlineEl.textContent = String(result.data.onlineCount ?? "—");
  }
  updateTimers();
  render();
}

/** Fetch market state and update Pool in header. Call on app load so Pool is not "—" after refresh. */
export async function fetchAndUpdatePoolInHeader(): Promise<void> {
  const result = await getMarketState();
  if (result.ok) {
    const poolEl = document.getElementById("ui-pool-pfv");
    if (poolEl) poolEl.textContent = formatPfv(result.data.currentPoolPfv ?? 0) + " $PFV";
    const onlineEl = document.getElementById("ui-system-online-count");
    if (onlineEl) onlineEl.textContent = String(result.data.onlineCount ?? "—");
  }
}

function startTimers(render: () => void, refetch: () => void) {
  onWindowEndedRefetch = refetch;
  updateTimers();
  render();
  if (timerInterval) clearInterval(timerInterval);
  timerInterval = setInterval(() => {
    updateTimers();
    render();
  }, 1000);
  if (pollInterval) clearInterval(pollInterval);
  pollInterval = null;
}

function stopTimers() {
  if (timerInterval) {
    clearInterval(timerInterval);
    timerInterval = null;
  }
  if (pollInterval) {
    clearInterval(pollInterval);
    pollInterval = null;
  }
}

function showToast(message: string, isError = false) {
  if (!toastEl) return;
  toastEl.textContent = message;
  toastEl.classList.toggle("market-toast-error", isError);
  toastEl.classList.add("market-toast-visible");
  setTimeout(() => {
    toastEl?.classList.remove("market-toast-visible");
    toastEl?.classList.remove("market-toast-error");
  }, 2500);
}

function copyToClipboard(text: string) {
  navigator.clipboard.writeText(text).then(() => showToast("Copied!"));
}

function formatThousands(n: number): string {
  return n.toLocaleString("en-US");
}

/** Format PFV: integer only (floor), thousand separator comma. Exported for header/backpack. */
export const formatPfv = formatPfvUtil;
/** Same as formatPfv but space as thousand separator (for tables). */
const formatPfvSpace = formatPfvSpaceUtil;

/** Format for Claim "Available": no commas/spaces, show .xxx when there is a fractional part. */
function formatAvailablePfv(n: number): string {
  const x = Number(n);
  if (!Number.isFinite(x)) return "0";
  if (Math.floor(x) === x) return String(Math.floor(x));
  return x.toFixed(3);
}

/** Basic Solana address check: length 32–44, base58-like. */
function isValidSolanaAddress(s: string): boolean {
  if (s.length < 32 || s.length > 44) return false;
  const base58 = /^[1-9A-HJ-NP-Za-km-z]+$/;
  return base58.test(s);
}

function shortenWallet(wallet: string): string {
  if (wallet.length <= 12) return wallet;
  return wallet.slice(0, 6) + "…" + wallet.slice(-4);
}

function shortenWalletClaim(wallet: string): string {
  if (wallet.length <= 9) return wallet;
  return wallet.slice(0, 4) + "..." + wallet.slice(-4);
}

function createWindow(): HTMLDivElement {
  const wrap = document.createElement("div");
  wrap.className = "market-window-overlay";
  wrap.tabIndex = -1;

  wrap.innerHTML = `
    <div class="market-window" role="dialog" aria-label="Market" tabindex="0">
      <div class="market-window-header">
        <div class="market-window-title-row">
          <h2 class="market-window-title">Market</h2>
          <button type="button" class="market-window-close" aria-label="Close">&times;</button>
        </div>
        <p class="market-window-subtitle">Available from level 3. Your level: <span data-market-user-level class="market-level-pending">—</span></p>
        <div class="market-top-block">
          <div class="market-top-card">
            <span class="market-top-card-label">Market Status</span>
            <span class="market-top-card-value" data-market-status>Open</span>
          </div>
          <div class="market-top-card">
            <span class="market-top-card-label">Total Pool $PFV</span>
            <span class="market-top-card-value market-value-green" data-total-pool-pfv>0</span>
          </div>
          <div class="market-top-card">
            <span class="market-top-card-label" data-label-next>Next Pool Update</span>
            <span class="market-top-card-value market-value-green" data-timer-next>00:00:00</span>
          </div>
        </div>
        <nav class="market-tabs" role="tablist">
          <button type="button" class="market-tab" data-tab="sell" role="tab">Sell</button>
          <button type="button" class="market-tab" data-tab="withdraw" role="tab">Claim</button>
          <button type="button" class="market-tab" data-tab="statistics" role="tab">Statistics</button>
          <button type="button" class="market-tab" data-tab="leaderboard" role="tab">Leaderboard</button>
          <button type="button" class="market-tab" data-tab="guide" role="tab">Guide</button>
        </nav>
      </div>
      <div class="market-window-body">
        <div class="market-panel market-panel-sell" data-panel="sell" hidden>
          <div class="market-sell-inputs-card">
            <div class="market-sell-row-inputs">
              <span class="market-sell-cell"><img src="${GOLD_ICON}" alt="" width="20" height="20" /><input type="number" min="0" data-sell-gold value="0" /></span>
              <span class="market-sell-cell"><img src="${SILVER_ICON}" alt="" width="20" height="20" /><input type="number" min="0" data-sell-silver value="0" /></span>
              <span class="market-sell-cell"><img src="${BRONZE_ICON}" alt="" width="20" height="20" /><input type="number" min="0" data-sell-bronze value="0" /></span>
              <button type="button" class="market-btn market-btn-sell" data-btn-sell>Sell</button>
              <div class="market-sell-points-col">
                <p class="market-sell-points-line">Points: <strong data-sell-total-points>0</strong></p>
                <p class="market-sell-limit-line">Max 20% of window</p>
              </div>
            </div>
          </div>
          <div class="market-sell-prices-card">
            <span class="market-sell-prices-label">PRICES</span>
            <span class="market-sell-prices-row">
              <span class="market-top-price-item"><img src="${GOLD_ICON}" alt="Gold" width="12" height="12" /> – <span data-sell-price-gold>8</span> POINTS</span>
              <span class="market-top-price-item"><img src="${SILVER_ICON}" alt="Silver" width="12" height="12" /> – <span data-sell-price-silver>3</span> POINTS</span>
              <span class="market-top-price-item"><img src="${BRONZE_ICON}" alt="Bronze" width="12" height="12" /> – <span data-sell-price-bronze>1</span> POINTS</span>
            </span>
          </div>
          <span class="market-sell-current-window-title">Current Window</span>
          <div class="market-sell-four-cards">
            <div class="market-top-card">
              <span class="market-top-card-label">POOL $PFV</span>
              <span class="market-top-card-value market-value-green" data-sell-current-window-pool>0</span>
            </div>
            <div class="market-top-card">
              <span class="market-top-card-label">Closes in</span>
              <span class="market-top-card-value market-value-green" data-sell-timer-window>00:00:00</span>
            </div>
            <div class="market-top-card">
              <span class="market-top-card-label">Total points</span>
              <span class="market-top-card-value market-value-green" data-total-points-window>0</span>
            </div>
            <div class="market-top-card">
              <span class="market-top-card-label">Your points</span>
              <span class="market-top-card-value market-value-green" data-your-points-window>0</span>
            </div>
          </div>
          <div class="market-table-card">
            <div class="market-table-wrap market-table-wrap-scroll">
              <table class="market-table">
                <thead><tr><th>STATUS</th><th>POINTS</th><th>$PFV</th><th>DATE</th><th>TXID</th></tr></thead>
                <tbody data-sell-tbody></tbody>
              </table>
            </div>
          </div>
        </div>
        <div class="market-panel market-panel-withdraw" data-panel="withdraw" hidden>
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
                <input type="number" min="5000" step="0.001" data-withdraw-amount placeholder="Min 5000" class="market-withdraw-input" />
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
        <div class="market-panel market-panel-statistics" data-panel="statistics" hidden>
          <span class="market-sell-current-window-title">Last Window Total</span>
          <div class="market-stats-four-cards">
            <div class="market-top-card">
              <span class="market-top-card-label">Pool $PFV</span>
              <span class="market-top-card-value market-value-green" data-stat-lw-pool>0</span>
            </div>
            <div class="market-top-card">
              <span class="market-top-card-label">Points</span>
              <span class="market-top-card-value market-value-green" data-stat-lw-points>0</span>
            </div>
            <div class="market-top-card">
              <span class="market-top-card-label">EARNED $PFV</span>
              <span class="market-top-card-value market-value-green" data-stat-lw-pfv-earned>0</span>
            </div>
            <div class="market-top-card">
              <span class="market-top-card-label">$PFV/Point</span>
              <span class="market-top-card-value market-value-green" data-stat-lw-pfv-point>0</span>
            </div>
          </div>
          <span class="market-sell-current-window-title">Your Last Window</span>
          <div class="market-stats-two-cards">
            <div class="market-top-card">
              <span class="market-top-card-label">Points</span>
              <span class="market-top-card-value market-value-green" data-stat-your-points>0</span>
            </div>
            <div class="market-top-card">
              <span class="market-top-card-label">EARNED $PFV</span>
              <span class="market-top-card-value market-value-green" data-stat-your-pfv>0</span>
            </div>
          </div>
          <span class="market-sell-current-window-title">All Time Total</span>
          <div class="market-stats-four-cards market-stats-at">
            <div class="market-top-card">
              <span class="market-top-card-label">Pool $PFV</span>
              <span class="market-top-card-value market-value-green" data-stat-at-pool>0</span>
            </div>
            <div class="market-top-card">
              <span class="market-top-card-label">Points</span>
              <span class="market-top-card-value market-value-green" data-stat-at-points>0</span>
            </div>
            <div class="market-top-card">
              <span class="market-top-card-label">EARNED $PFV</span>
              <span class="market-top-card-value market-value-green" data-stat-at-pfv>0</span>
            </div>
            <div class="market-top-card">
              <span class="market-top-card-label">Claimed $PFV</span>
              <span class="market-top-card-value market-value-green" data-stat-at-claimed>0</span>
            </div>
          </div>
        </div>
        <div class="market-panel market-panel-leaderboard" data-panel="leaderboard" hidden>
          <div class="market-leaderboard-card">
            <div class="market-leaderboard-toggles">
              <button type="button" class="market-lb-btn" data-lb-mode="sales">Sell</button>
              <button type="button" class="market-lb-btn" data-lb-mode="withdrawals">Claim</button>
              <span class="market-lb-divider-vert" aria-hidden="true"></span>
              <button type="button" class="market-lb-btn" data-lb-period="allTime">All Time</button>
              <button type="button" class="market-lb-btn" data-lb-period="lastDay">Last Day</button>
            </div>
          </div>
          <div class="market-table-card">
            <div class="market-table-wrap market-table-wrap-scroll">
              <table class="market-table">
                <thead><tr><th>#</th><th>USER</th><th>LEVEL</th><th>$PFV</th></tr></thead>
                <tbody data-leaderboard-tbody></tbody>
              </table>
            </div>
          </div>
        </div>
        <div class="market-panel market-panel-guide" data-panel="guide" hidden>
          <div class="market-guide-content">
            <h3 class="market-guide-title">How the market works</h3>
            <ol class="market-guide-list">
              <li><strong>Mining.</strong> In the mine (Enter Mine from the valley) you mine gold, silver, and bronze. Resources go to your backpack.</li>
              <li><strong>Sell.</strong> On the <strong>Sell</strong> tab you exchange gold, silver, and bronze for points. Rarer resources give more points per unit. Points are converted into <strong>$PFV</strong> at the next pool distribution.</li>
              <li><strong>Pool and distribution.</strong> All sold resources go into a shared pool. Periodically the pool <strong>distributes</strong>: your accumulated points are turned into <strong>$PFV</strong> on your balance. Until then you see points and an estimated $PFV.</li>
              <li><strong>Claim (withdraw).</strong> On the <strong>Claim</strong> tab you can withdraw <strong>$PFV</strong> to your Solana wallet. The number of claims per cycle is limited. Use a valid wallet address.</li>
              <li><strong>Statistics and leaderboard.</strong> Use the <strong>Statistics</strong> and <strong>Leaderboard</strong> tabs to see sales, claims, and compare with other players.</li>
            </ol>
            <p class="market-guide-summary"><strong>In short:</strong> mine → sell in the market → wait for pool distribution → get $PFV on your balance → withdraw to wallet (Claim) when needed.</p>
          </div>
        </div>
      </div>
      <div class="market-toast" data-toast aria-live="polite"></div>
    </div>
  `;

  const panel = wrap.querySelector(".market-window") as HTMLDivElement;
  toastEl = panel.querySelector("[data-toast]") as HTMLDivElement;

  wrap.addEventListener("click", (e) => { if (e.target === wrap) closeMarket(); });
  panel.querySelector(".market-window-close")?.addEventListener("click", () => closeMarket());

  onWalletChange(render);

  // Tab clicks: when switching to Sell fetch points/sales+estimate; when Statistics fetch last-window
  panel.querySelectorAll(".market-tab").forEach((btn) => {
    btn.addEventListener("click", () => {
      mockState.activeTab = (btn as HTMLElement).dataset.tab as MarketTab;
      if (mockState.activeTab === "sell") {
        fetchSellData(render);
      } else if (mockState.activeTab === "withdraw") {
        fetchWithdrawData(render);
      } else if (mockState.activeTab === "statistics") {
        Promise.all([getMarketLastWindow(), getMarketAllTimeStats()]).then(([winRes, atRes]) => {
          if (winRes.ok && winRes.data.window) {
            const w = winRes.data.window;
            lastWindowData = {
              windowId: w.id,
              windowPoolPfv: w.windowPoolPfv,
              totalPoints: w.totalPoints,
              pricePerPoint: w.pricePerPoint,
              distributedPfv: w.distributedPfv,
              returnedPfv: w.returnedPfv,
            };
          } else {
            lastWindowData = null;
          }
          if (atRes.ok) allTimeStats = atRes.data;
          else allTimeStats = null;
          yourLastWindowStats = null;
          const token = getToken();
          if (token) {
            getMarketLastWindowYourStats(token).then((sr) => {
              if (sr.ok) {
                yourLastWindowStats = {
                  yourPoints: sr.data.yourPoints,
                  yourEarnedPfv: sr.data.yourEarnedPfv,
                };
              }
              render();
            });
          } else {
            render();
          }
        });
      } else if (mockState.activeTab === "leaderboard") {
        getMarketLeaderboard(mockState.leaderboardPeriod, mockState.leaderboardMode).then((r) => {
          if (r.ok) leaderboardRows = r.data.rows;
          else leaderboardRows = [];
          render();
        });
      }
      render();
    });
  });

  async function fetchSellData(afterRender: () => void) {
    const token = getToken();
    if (!token) return;
    const windowId = marketStateFromApi?.window?.id;
    const pointsRes = await getMarketWindowPoints(token, windowId);
    const salesRes = await getMarketSales(token, undefined, { all: true });
    if (pointsRes.ok) {
      mockState.totalPointsInWindow = pointsRes.data.totalPoints;
      mockState.yourPointsInWindow = pointsRes.data.yourPoints;
    } else {
      mockState.totalPointsInWindow = 0;
      mockState.yourPointsInWindow = 0;
      if (pointsRes.status === 500) showToast(pointsRes.error ?? "Failed to load points", true);
    }
    if (salesRes.ok) {
      mockState.sales = salesRes.data.map((r) => ({
        status: r.status,
        points: r.points,
        txid: r.txid,
        date: r.date,
        pfv: r.pfv ?? null,
        windowId: r.windowId,
      }));
    } else {
      mockState.sales = [];
      if (salesRes.status === 500) showToast(salesRes.error ?? "Failed to load sales", true);
    }
    afterRender();
  }

  async function fetchWithdrawData(afterRender: () => void) {
    const token = getToken();
    if (!token) return;
    const [statusRes, historyRes] = await Promise.all([getWithdrawStatus(token), getWithdrawHistory(token)]);
    if (statusRes.ok) {
      mockState.withdrawStatus = statusRes.data;
      marketState.pfvBalance = statusRes.data.availablePfv;
      syncHeader();
    } else mockState.withdrawStatus = null;
    if (historyRes.ok) {
      mockState.withdrawals = historyRes.data.map((h) => ({
        status: h.status,
        amountPfv: h.amountPfv,
        wallet: h.walletAddress,
        walletShort: h.walletShort,
        txid: h.txid,
        date: h.date,
      }));
    } else mockState.withdrawals = [];
    afterRender();
  }

  // Sell: inputs
  const goldInput = panel.querySelector("[data-sell-gold]") as HTMLInputElement;
  const silverInput = panel.querySelector("[data-sell-silver]") as HTMLInputElement;
  const bronzeInput = panel.querySelector("[data-sell-bronze]") as HTMLInputElement;
  const onSellInput = () => {
    mockState.sellGold = parseInt(goldInput.value, 10) || 0;
    mockState.sellSilver = parseInt(silverInput.value, 10) || 0;
    mockState.sellBronze = parseInt(bronzeInput.value, 10) || 0;
    render();
  };
  goldInput?.addEventListener("input", onSellInput);
  silverInput?.addEventListener("input", onSellInput);
  bronzeInput?.addEventListener("input", onSellInput);

  // Sell button: POST /api/market/sell, then update state from response
  panel.querySelector("[data-btn-sell]")?.addEventListener("click", async () => {
    prepareSfx();
    if (marketUserLevel != null && marketUserLevel < 3) {
      showToast("Market available from level 3", true);
      return;
    }
    const pts = mockState.sellGold * POINTS_PER.gold + mockState.sellSilver * POINTS_PER.silver + mockState.sellBronze * POINTS_PER.bronze;
    if (pts <= 0) return;
    const token = getToken();
    if (!token) {
      showToast("Please log in", true);
      return;
    }
    const result = await postMarketSell(token, {
      gold: mockState.sellGold,
      silver: mockState.sellSilver,
      bronze: mockState.sellBronze,
    });
    if (!result.ok) {
      showToast(result.error ?? `Error ${result.status}`, true);
      return;
    }
    playMarketSell();
    const { sale, window: win } = result.data;
    mockState.totalPointsInWindow = win.totalPoints;
    mockState.yourPointsInWindow = win.yourPoints;
    mockState.sales.unshift({
      status: sale.status,
      points: sale.points,
      txid: sale.txid,
      date: sale.date,
      pfv: null,
      windowId: sale.windowId,
    });
    if (token) {
      const charRes = await getCharacter(token);
      if (charRes?.ok) {
        applyCharacterData(charRes.data.character, charRes.data.slots);
        syncHeader();
      }
    }
    mockState.sellGold = 0;
    mockState.sellSilver = 0;
    mockState.sellBronze = 0;
    goldInput.value = "0";
    silverInput.value = "0";
    bronzeInput.value = "0";
    render();
  });

  // Withdraw form
  const amountInput = panel.querySelector("[data-withdraw-amount]") as HTMLInputElement;
  amountInput?.addEventListener("input", () => render());
  panel.querySelector("[data-withdraw-disconnect]")?.addEventListener("click", () => {
    void disconnectWallet().then(() => render());
  });
  panel.querySelector("[data-withdraw-connect-wallet]")?.addEventListener("click", () => {
    openConnectModal();
  });

  panel.querySelectorAll(".market-lb-btn[data-lb-mode]").forEach((btn) => {
    btn.addEventListener("click", () => {
      mockState.leaderboardMode = (btn as HTMLElement).dataset.lbMode as "sales" | "withdrawals";
      getMarketLeaderboard(mockState.leaderboardPeriod, mockState.leaderboardMode).then((r) => {
        if (r.ok) leaderboardRows = r.data.rows;
        else leaderboardRows = [];
        render();
      });
    });
  });
  panel.querySelectorAll(".market-lb-btn[data-lb-period]").forEach((btn) => {
    btn.addEventListener("click", () => {
      mockState.leaderboardPeriod = (btn as HTMLElement).dataset.lbPeriod as "allTime" | "lastDay";
      getMarketLeaderboard(mockState.leaderboardPeriod, mockState.leaderboardMode).then((r) => {
        if (r.ok) leaderboardRows = r.data.rows;
        else leaderboardRows = [];
        render();
      });
    });
  });

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
    if (!Number.isFinite(amount) || amount < 5000) {
      showToast("Min 5000 $PFV", true);
      return;
    }
    const st = mockState.withdrawStatus;
    if (st && (st.withdrawsLeft <= 0 || amount > st.availablePfv)) {
      showToast(st.withdrawsLeft <= 0 ? "Withdraw limit reached" : "Amount exceeds available PFV", true);
      return;
    }
    const res = await postWithdraw(token, { amountPfv: amount, walletAddress: wallet });
    if (!res.ok) {
      showToast(res.error ?? `Error ${res.status}`, true);
      return;
    }
    playWithdrawal();
    mockState.withdrawStatus = {
      ...mockState.withdrawStatus!,
      availablePfv: res.data.balances.availablePfv,
      claimReservedPfv: res.data.balances.claimReservedPfv,
      totalReservedPfv: res.data.balances.totalReservedPfv,
      withdrawsUsed: res.data.withdrawsUsed,
      withdrawsLeft: res.data.withdrawsLeft,
      nextPoolUpdateAt: mockState.withdrawStatus?.nextPoolUpdateAt ?? "",
      totalWithdrawnAllTime: mockState.withdrawStatus?.totalWithdrawnAllTime ?? 0,
    };
    marketState.pfvBalance = res.data.balances.availablePfv;
    syncHeader();
    mockState.withdrawals.unshift({
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

  // Leaderboard toggles
  panel.querySelectorAll("[data-lb-mode]").forEach((btn) => {
    btn.addEventListener("click", () => {
      mockState.leaderboardMode = (btn as HTMLElement).dataset.lbMode as "sales" | "withdrawals";
      getMarketLeaderboard(mockState.leaderboardPeriod, mockState.leaderboardMode).then((r) => {
        if (r.ok) leaderboardRows = r.data.rows;
        else leaderboardRows = [];
        render();
      });
    });
  });
  panel.querySelectorAll("[data-lb-period]").forEach((btn) => {
    btn.addEventListener("click", () => {
      mockState.leaderboardPeriod = (btn as HTMLElement).dataset.lbPeriod as "allTime" | "lastDay";
      getMarketLeaderboard(mockState.leaderboardPeriod, mockState.leaderboardMode).then((r) => {
        if (r.ok) leaderboardRows = r.data.rows;
        else leaderboardRows = [];
        render();
      });
    });
  });

  function render() {
    updateTimers();

    // Top block
    const statusEl = panel.querySelector("[data-market-status]") as HTMLElement;
    statusEl.textContent = mockState.marketStatus;
    statusEl.classList.remove("market-status-open", "market-status-closed");
    statusEl.classList.add(mockState.marketStatus === "Open" ? "market-status-open" : "market-status-closed");
    (panel.querySelector("[data-total-pool-pfv]") as HTMLElement).textContent = mockState.totalPoolPfv;
    (panel.querySelector("[data-label-next]") as HTMLElement).textContent = mockState.marketStatus === "Closed" ? "Back in" : "Next Pool Update";
    (panel.querySelector("[data-timer-next]") as HTMLElement).textContent = mockState.timerNextUpdate;
    (panel.querySelector("[data-sell-current-window-pool]") as HTMLElement).textContent = mockState.currentWindowPool;
    (panel.querySelector("[data-sell-timer-window]") as HTMLElement).textContent = mockState.timerWindowClose;
    (panel.querySelector("[data-sell-price-gold]") as HTMLElement).textContent = mockState.priceGold;
    (panel.querySelector("[data-sell-price-silver]") as HTMLElement).textContent = mockState.priceSilver;
    (panel.querySelector("[data-sell-price-bronze]") as HTMLElement).textContent = mockState.priceBronze;

    // Tabs active
    panel.querySelectorAll(".market-tab").forEach((b) => {
      const t = b as HTMLButtonElement;
      t.classList.toggle("market-tab-active", t.dataset.tab === mockState.activeTab);
    });
    panel.querySelectorAll("[data-panel]").forEach((p) => {
      const el = p as HTMLElement;
      el.hidden = el.dataset.panel !== mockState.activeTab;
    });

    // Top block + Sell: Total points / Your points; sell total from inputs; Sell button disabled when Closed
    (panel.querySelector("[data-total-points-window]") as HTMLElement).textContent = formatThousands(mockState.totalPointsInWindow);
    (panel.querySelector("[data-your-points-window]") as HTMLElement).textContent = formatThousands(mockState.yourPointsInWindow);
    const totalPts = mockState.sellGold * POINTS_PER.gold + mockState.sellSilver * POINTS_PER.silver + mockState.sellBronze * POINTS_PER.bronze;
    (panel.querySelector("[data-sell-total-points]") as HTMLElement).textContent = formatThousands(totalPts);

    // Level subtitle: server level, green if >= 3, red if < 3
    const levelEl = panel.querySelector("[data-market-user-level]") as HTMLElement;
    if (levelEl) {
      levelEl.textContent = marketUserLevel != null ? String(marketUserLevel) : "—";
      levelEl.classList.remove("market-level-ok", "market-level-low", "market-level-pending");
      if (marketUserLevel == null) levelEl.classList.add("market-level-pending");
      else levelEl.classList.add(marketUserLevel >= 3 ? "market-level-ok" : "market-level-low");
    }

    const sellBtn = panel.querySelector("[data-btn-sell]") as HTMLButtonElement;
    if (sellBtn) sellBtn.disabled = mockState.marketStatus === "Closed";
    const sellTbody = panel.querySelector("[data-sell-tbody]") as HTMLElement;
    if (sellTbody) {
      const formatSaleDate = (iso: string) => formatDateShort(new Date(iso));
      const shortTxid = (txid: string) => (txid.length <= 12 ? txid : txid.slice(0, 6) + "…" + txid.slice(-4));
      sellTbody.innerHTML = mockState.sales
        .map(
          (r) => {
            const pfvDisplay = r.pfv != null && r.pfv !== undefined ? formatPfvSpace(r.pfv) : "—";
            const statusLabel = r.status === "PENDING" ? "pending" : r.status === "SELL" ? "completed" : r.status;
            const statusClass = r.status === "PENDING" ? "market-status-pending" : r.status === "SELL" ? "market-status-completed" : "";
            return `
          <tr>
            <td class="${statusClass}">${escapeHtml(statusLabel)}</td>
            <td>${r.points}</td>
            <td>${pfvDisplay}</td>
            <td>${formatSaleDate(r.date)}</td>
            <td class="market-table-txid-cell"><span class="market-table-txid" title="${escapeHtml(r.txid)}">${escapeHtml(shortTxid(r.txid))}</span><button type="button" class="market-btn-copy-icon" data-copy="${escapeHtml(r.txid)}" aria-label="Copy TXID">&#x2398;</button></td>
          </tr>
        `;
          }
        )
        .join("");
      sellTbody.querySelectorAll("[data-copy]").forEach((btn) => {
        btn.addEventListener("click", () => copyToClipboard((btn as HTMLElement).dataset.copy ?? ""));
      });
    }

    // Withdraw panel
    const wst = mockState.withdrawStatus;
    const availablePfv = wst?.availablePfv ?? 0;
    const claimReservedPfv = wst?.claimReservedPfv ?? 0;
    const totalReservedPfv = wst?.totalReservedPfv ?? 0;
    const withdrawsUsed = wst?.withdrawsUsed ?? 0;
    const withdrawsLeft = wst?.withdrawsLeft ?? 0;
    const totalWithdrawnAll = wst?.totalWithdrawnAllTime ?? 0;
    (panel.querySelector("[data-withdraw-claim-reserved]") as HTMLElement).textContent = formatPfv(claimReservedPfv);
    (panel.querySelector("[data-withdraw-total-pfv]") as HTMLElement).textContent = formatPfv(totalReservedPfv);
    (panel.querySelector("[data-withdraw-limit]") as HTMLElement).textContent = `${withdrawsLeft}/3`;
    const nextUpdateEl = panel.querySelector("[data-withdraw-next-update]") as HTMLElement;
    if (nextUpdateEl) {
      const nextAt = wst?.nextPoolUpdateAt;
      if (nextAt) {
        const ms = new Date(nextAt).getTime() - Date.now();
        const countdown = ms > 0 ? msToHHMMSS(ms) : "0:00:00";
        nextUpdateEl.innerHTML = `Update: <span class="market-withdraw-timer-countdown">${countdown}</span>`;
      } else {
        nextUpdateEl.textContent = "";
      }
    }
    (panel.querySelector("[data-withdraw-total-all]") as HTMLElement).textContent = formatPfv(totalWithdrawnAll);
    const walletValueEl = panel.querySelector("[data-withdraw-wallet-value]") as HTMLElement;
    const disconnectBtn = panel.querySelector("[data-withdraw-disconnect]") as HTMLElement;
    const connectWrap = panel.querySelector("[data-withdraw-wallet-connect-wrap]") as HTMLElement;
    const connectedWallet = getConnectedWallet();
    if (walletValueEl) {
      walletValueEl.textContent = connectedWallet ? shortAddress(connectedWallet) : "No wallet";
    }
    if (disconnectBtn) {
      disconnectBtn.style.display = connectedWallet ? "" : "none";
    }
    if (connectWrap) {
      connectWrap.style.display = connectedWallet ? "none" : "";
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
      withdrawBtn.disabled =
        mockState.marketStatus === "Closed" ||
        withdrawsLeft <= 0 ||
        withdrawAmountNum > availablePfv ||
        !hasWallet;
    }
    const withdrawTbody = panel.querySelector("[data-withdraw-tbody]") as HTMLElement;
    if (withdrawTbody) {
      const formatWdDate = (iso: string) => formatDateShort(new Date(iso));
      const shortTxid = (txid: string) => (txid.length <= 12 ? txid : txid.slice(0, 6) + "…" + txid.slice(-4));
      withdrawTbody.innerHTML = mockState.withdrawals
        .map(
          (r) => {
            const statusClass = r.status === "PENDING" ? "market-status-pending" : r.status === "COMPLETED" ? "market-status-completed" : r.status === "CANCELLED" ? "market-status-cancelled" : "";
            const displayWallet = r.walletShort ?? shortenWalletClaim(r.wallet);
            return `
          <tr>
            <td class="${statusClass}">${escapeHtml(r.status)}</td>
            <td class="market-table-wallet-cell"><span class="market-table-txid market-wallet-short" title="${escapeHtml(r.wallet)}">${escapeHtml(displayWallet)}</span><button type="button" class="market-btn-copy-icon" data-copy-wallet="${escapeHtml(r.wallet)}" aria-label="Copy wallet">&#x2398;</button></td>
            <td>${formatPfvSpace(r.amountPfv)}</td>
            <td>${formatWdDate(r.date)}</td>
            <td class="market-table-txid-cell"><span class="market-table-txid" title="${escapeHtml(r.txid)}">${escapeHtml(shortTxid(r.txid))}</span><button type="button" class="market-btn-copy-icon" data-copy-txid="${escapeHtml(r.txid)}" aria-label="Copy TXID">&#x2398;</button></td>
          </tr>
        `;
          }
        )
        .join("");
      withdrawTbody.querySelectorAll("[data-copy-txid]").forEach((btn) => {
        btn.addEventListener("click", () => copyToClipboard((btn as HTMLElement).dataset.copyTxid ?? ""));
      });
      withdrawTbody.querySelectorAll("[data-copy-wallet]").forEach((btn) => {
        btn.addEventListener("click", () => copyToClipboard((btn as HTMLElement).dataset.copyWallet ?? ""));
      });
    }

    // Statistics panel: Last Window from API when available
    if (lastWindowData) {
      (panel.querySelector("[data-stat-lw-pool]") as HTMLElement).textContent = formatPfv(lastWindowData.windowPoolPfv);
      (panel.querySelector("[data-stat-lw-points]") as HTMLElement).textContent = formatThousands(lastWindowData.totalPoints);
      (panel.querySelector("[data-stat-lw-pfv-earned]") as HTMLElement).textContent = formatPfv(lastWindowData.distributedPfv);
      (panel.querySelector("[data-stat-lw-pfv-point]") as HTMLElement).textContent = lastWindowData.pricePerPoint != null ? lastWindowData.pricePerPoint.toFixed(3) : "—";
    } else {
      (panel.querySelector("[data-stat-lw-pool]") as HTMLElement).textContent = "—";
      (panel.querySelector("[data-stat-lw-points]") as HTMLElement).textContent = "—";
      (panel.querySelector("[data-stat-lw-pfv-earned]") as HTMLElement).textContent = "—";
      (panel.querySelector("[data-stat-lw-pfv-point]") as HTMLElement).textContent = "—";
    }
    if (yourLastWindowStats) {
      (panel.querySelector("[data-stat-your-points]") as HTMLElement).textContent = formatThousands(yourLastWindowStats.yourPoints);
      (panel.querySelector("[data-stat-your-pfv]") as HTMLElement).textContent = formatPfv(yourLastWindowStats.yourEarnedPfv);
    } else {
      (panel.querySelector("[data-stat-your-points]") as HTMLElement).textContent = "—";
      (panel.querySelector("[data-stat-your-pfv]") as HTMLElement).textContent = "—";
    }
    (panel.querySelector("[data-stat-at-pool]") as HTMLElement).textContent = "—";
    (panel.querySelector("[data-stat-at-points]") as HTMLElement).textContent = "—";
    (panel.querySelector("[data-stat-at-pfv]") as HTMLElement).textContent = "—";
    const statAtClaimedEl = panel.querySelector("[data-stat-at-claimed]") as HTMLElement;
    if (statAtClaimedEl) statAtClaimedEl.textContent = "—";
    if (allTimeStats) {
      (panel.querySelector("[data-stat-at-pool]") as HTMLElement).textContent = formatPfv(allTimeStats.poolPfv);
      (panel.querySelector("[data-stat-at-points]") as HTMLElement).textContent = formatThousands(allTimeStats.points);
      (panel.querySelector("[data-stat-at-pfv]") as HTMLElement).textContent = formatPfv(allTimeStats.earnedPfv);
      if (statAtClaimedEl) statAtClaimedEl.textContent = formatPfv(allTimeStats.claimedPfv);
    }

    // Leaderboard: active buttons
    panel.querySelectorAll(".market-lb-btn[data-lb-mode]").forEach((b) => {
      const el = b as HTMLElement;
      el.classList.toggle("market-lb-btn-active", el.dataset.lbMode === mockState.leaderboardMode);
    });
    panel.querySelectorAll(".market-lb-btn[data-lb-period]").forEach((b) => {
      const el = b as HTMLElement;
      el.classList.toggle("market-lb-btn-active", el.dataset.lbPeriod === mockState.leaderboardPeriod);
    });

    const lbTbody = panel.querySelector("[data-leaderboard-tbody]") as HTMLElement;
    if (lbTbody) {
      const defaultAvatar =
        typeof window !== "undefined" ? `${window.location.origin}/assets/characters/pixm.png` : "/assets/characters/pixm.png";
      lbTbody.innerHTML = leaderboardRows.map(
        (row) => {
          const avatarSrc = (() => {
            const safe = safeAvatarUrl(row.avatarUrl);
            return safe ? escapeHtml(safe) : defaultAvatar;
          })();
          const usernameHtml = escapeHtml(String(row.username));
          const showLink = row.username !== "—" && row.hasTwitter === true;
          const twitterUrl = showLink ? `https://x.com/${encodeURIComponent(String(row.username).replace(/^@/, ""))}` : "#";
          const linkAttrs = showLink ? `href="${twitterUrl}" target="_blank" rel="noopener noreferrer"` : "";
          const userInner = `<span class="market-lb-avatar-wrap"><img src="${avatarSrc}" alt="" class="market-lb-avatar" loading="lazy" referrerpolicy="no-referrer" onerror="this.onerror=null;this.src='/assets/characters/pixm.png'" /></span><span class="market-lb-username">${usernameHtml}</span>`;
          const userCell = showLink ? `<a ${linkAttrs} class="market-lb-user-link">${userInner}</a>` : `<span class="market-lb-user-link">${userInner}</span>`;
          return `<tr><td>${row.rank}</td><td class="market-lb-user-cell">${userCell}</td><td>${row.level}</td><td>${formatPfvSpace(row.pfv)}</td></tr>`;
        }
      ).join("");
    }
  }

  (wrap as unknown as { _marketRender: () => void; _fetchSellData: (cb: () => void) => void; _fetchWithdrawData?: (cb: () => void) => void })._marketRender = render;
  (wrap as unknown as { _fetchSellData: (cb: () => void) => void })._fetchSellData = fetchSellData;
  (wrap as unknown as { _fetchWithdrawData: (cb: () => void) => void })._fetchWithdrawData = fetchWithdrawData;
  return wrap;
}

function bindState() {
  const o = overlay as unknown as { _marketRender?: () => void };
  o._marketRender?.();
}

export function initMarketWindow(container?: HTMLElement | null): void {
  if (overlay) return;
  const parent = container ?? (document.querySelector(".ui-scale-wrapper") ?? document.body);
  if (!parent) return;
  overlay = createWindow();
  parent.appendChild(overlay);
  overlay.style.display = "none";
}

export function openMarket(initialTab?: MarketTab): void {
  if (initialTab) mockState.activeTab = initialTab;
  setTimeout(async () => {
    if (!overlay) {
      initMarketWindow();
      if (!overlay) return;
    }
    const token = getToken();
    marketUserLevel = null;
    if (token) {
      getCharacter(token).then((r) => {
        if (r?.ok) {
          marketUserLevel = r.data.character.level;
          applyCharacterData(r.data.character, r.data.slots);
          syncHeader();
        }
        bindState();
      });
    } else {
      bindState();
    }
    startTimers(bindState, () => fetchMarketStateAndRender(bindState));
    await fetchMarketStateAndRender(bindState);
    bindState();
    const o = overlay as unknown as { _fetchSellData?: (cb: () => void) => void; _fetchWithdrawData?: (cb: () => void) => void };
    if (mockState.activeTab === "sell") {
      o._fetchSellData?.(bindState);
    } else if (mockState.activeTab === "withdraw") {
      o._fetchWithdrawData?.(bindState);
    }
    visibilityHandler = () => {
      if (document.visibilityState === "visible") fetchMarketStateAndRender(bindState);
    };
    document.addEventListener("visibilitychange", visibilityHandler);
    overlay!.style.display = "flex";
    overlay!.querySelector(".market-window")?.focus();
    escHandler = (e: KeyboardEvent) => { if (e.key === "Escape") closeMarket(); };
    document.addEventListener("keydown", escHandler);
  }, 0);
}

/** Called on SSE distribute: refresh market state, sell/claim/statistics data when Market is open. */
export function refreshMarketDataIfOpen(): void {
  if (!overlay || overlay.style.display !== "flex") return;
  const o = overlay as unknown as { _marketRender?: () => void; _fetchSellData?: (cb: () => void) => void; _fetchWithdrawData?: (cb: () => void) => void };
  const render = () => o._marketRender?.();
  fetchMarketStateAndRender(render);
  o._fetchSellData?.(render);
  if (mockState.activeTab === "withdraw") o._fetchWithdrawData?.(render);
  if (mockState.activeTab === "statistics") {
    Promise.all([getMarketLastWindow(), getMarketAllTimeStats()]).then(([winRes, atRes]) => {
      if (winRes.ok && winRes.data.window) {
        const w = winRes.data.window;
        lastWindowData = {
          windowId: w.id,
          windowPoolPfv: w.windowPoolPfv,
          totalPoints: w.totalPoints,
          pricePerPoint: w.pricePerPoint,
          distributedPfv: w.distributedPfv,
          returnedPfv: w.returnedPfv,
        };
      } else {
        lastWindowData = null;
      }
      if (atRes.ok) allTimeStats = atRes.data;
      yourLastWindowStats = null;
      const token = getToken();
      if (token) {
        getMarketLastWindowYourStats(token).then((sr) => {
          if (sr.ok) {
            yourLastWindowStats = { yourPoints: sr.data.yourPoints, yourEarnedPfv: sr.data.yourEarnedPfv };
          }
          render();
        });
      } else render();
    });
  }
  if (mockState.activeTab === "leaderboard") {
    getMarketLeaderboard(mockState.leaderboardPeriod, mockState.leaderboardMode).then((r) => {
      if (r.ok) leaderboardRows = r.data.rows;
      else leaderboardRows = [];
      render();
    });
  }
}

export function closeMarket(): void {
  if (!overlay) return;
  stopTimers();
  if (visibilityHandler) {
    document.removeEventListener("visibilitychange", visibilityHandler);
    visibilityHandler = null;
  }
  overlay.style.display = "none";
  if (escHandler) {
    document.removeEventListener("keydown", escHandler);
    escHandler = null;
  }
}

export function isMarketOpen(): boolean {
  return !!overlay && overlay.style.display === "flex";
}
