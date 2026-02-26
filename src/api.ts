/**
 * API client for Pixel Valley Farm backend.
 * Token: sessionStorage (per-tab) + localStorage (persists across tab close/reopen).
 * New tab / reopened tab reads token from localStorage so user doesn't need to re-auth via Twitter.
 * Game actions use withGameLock so only one tab can act at a time.
 */

export const STORAGE_KEY = "pixelvalley_token";
const SESSION_KEY = "pixelvalley_token";

let tokenInvalidatedInThisTab = false;

export function getApiBase(): string {
  if (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_URL) {
    return (import.meta.env.VITE_API_URL as string).replace(/\/$/, "");
  }
  if (typeof window !== "undefined" && window.location?.hostname !== "localhost") {
    return "";
  }
  return "http://localhost:3002";
}

function getSessionStorage(): Storage | null {
  return typeof sessionStorage !== "undefined" ? sessionStorage : null;
}

export function getToken(): string | null {
  if (tokenInvalidatedInThisTab) return null;
  const session = getSessionStorage();
  let token = session ? session.getItem(SESSION_KEY) : null;
  if (!token && typeof localStorage !== "undefined") {
    token = localStorage.getItem(STORAGE_KEY);
    if (token && session) session.setItem(SESSION_KEY, token);
  }
  return token;
}

export function setToken(token: string): void {
  tokenInvalidatedInThisTab = false;
  const session = getSessionStorage();
  if (session) session.setItem(SESSION_KEY, token);
  if (typeof localStorage !== "undefined") localStorage.setItem(STORAGE_KEY, token);
}

export function clearToken(): void {
  const session = getSessionStorage();
  if (session) session.removeItem(SESSION_KEY);
  if (typeof localStorage !== "undefined") localStorage.removeItem(STORAGE_KEY);
  tokenInvalidatedInThisTab = true;
}

/** This tab was invalidated (e.g. login in another tab). Token stays in localStorage; getToken() returns null until setToken() or user clicks "Continue" in overlay. */
export function invalidateSessionInThisTab(): void {
  tokenInvalidatedInThisTab = true;
}

export function isSessionInvalid(): boolean {
  return tokenInvalidatedInThisTab;
}

let onSessionInvalid: (() => void) | null = null;
export function setOnSessionInvalid(cb: (() => void) | null): void {
  onSessionInvalid = cb;
}

let onNeedsEmailVerification: (() => void) | null = null;
export function setOnNeedsEmailVerification(cb: (() => void) | null): void {
  onNeedsEmailVerification = cb;
}

// --- Response types (match API) ---

export interface MeResponse {
  accountId: number;
  username: string;
  avatarUrl: string | null;
  authProvider?: "twitter" | "password";
  emailVerified?: boolean;
  needsEmailVerification?: boolean;
}

export interface CharacterResponse {
  id: number;
  level: number;
  currentXp?: number;
  xpToNextLevel?: number;
  moveSpeedLevel: number;
  moveSpeedUpgrade?: { requiredGold: number; requiredCharacterLevel: number } | null;
  miningEfficiencyLevel: number;
  miningUpgrade?: { requiredGold: number; requiredCharacterLevel: number } | null;
  backpackUpgrade?: { requiredGold: number; requiredCharacterLevel: number } | null;
  dailyMiningLimit: number;
  dailyMinedToday: number;
  backpackLevel: number;
  capacity: number;
  pfv: number;
  pickaxeLevel: number;
  bowLevel: number;
  bowUpgrade?: { requiredGold: number; requiredCharacterLevel: number } | null;
  currentHp: number;
  maxHp: number;
}

export interface InventorySlotResponse {
  slotIndex: number;
  resourceType: string;
  count: number;
}

export interface CharacterApiResponse {
  character: CharacterResponse;
  slots: InventorySlotResponse[];
}

export interface DevLoginResponse {
  token: string;
  accountId: number;
}

/** GET /api/market/state — server time, pool/window, market open/closed, pool PFV. */
export interface MarketStateResponse {
  serverTimeUtc: string;
  marketStatus: "OPEN" | "CLOSED";
  reason: "NONE" | "POOL_UPDATE_MAINTENANCE" | "ADMIN_MAINTENANCE";
  nextPoolUpdateAt: string;
  maintenanceEndsAt: string | null;
  poolCycle: { id: string; startAt: string; endAt: string };
  window: { id: string; index: number; startAt: string; endAt: string };
  currentPoolPfv?: number;
  isCycleLocked?: boolean;
  currentWindowPoolPfv?: number | null;
  /** Number of distinct accounts active in game in last few minutes (logged in + request). */
  onlineCount?: number;
}

/** GET /api/admin/check-ip — no auth. 200 if client IP allowed for admin, 403 otherwise. */
export async function getAdminCheckIp(): Promise<{ ok: true } | { ok: false; status: number }> {
  const base = getApiBase();
  const res = await fetch(`${base}/api/admin/check-ip`, { method: "GET" });
  if (res.ok) return { ok: true };
  return { ok: false, status: res.status };
}

/** GET /api/admin/market/pool — admin view (requires X-Admin-Secret). */
export interface AdminPoolViewResponse {
  marketStatus: string;
  maintenanceEndsAt: string | null;
  poolCycleId: string;
  current_pool_pfv: number;
  locked_at: string | null;
  start_pool_pfv: number | null;
  window_pool_pfv: number | null;
  timeUntilPoolCloseAt: string | null;
  timeUntilWindowCloseAt: string | null;
  onlineCount: number;
  arenaInBattleCount?: number;
  manualMaintenance: { forceClosed: boolean; endsAt: string | null; note: string | null };
  events: { id: string; pool_cycle_id: string; added_pfv: number; created_at: string; note: string | null; before_pfv?: number; after_pfv?: number }[];
  cycleStats: {
    totalSellCompletedPfv: number;
    totalSellCompletedUniqueAccounts: number;
    totalSellPendingPfv: number;
    totalSellPendingUniqueAccounts: number;
    totalSellPendingPoints: number;
    totalClaimPendingPfv: number;
    totalClaimPendingUniqueAccounts: number;
  };
}

export interface AdminMaintenanceState {
  forceClosed: boolean;
  endsAt: string | null;
  note: string | null;
  updatedAt: string;
}

export async function getAdminMaintenance(adminSecret: string): Promise<
  { ok: true; data: AdminMaintenanceState } | { ok: false; status: number; error?: string }
> {
  const base = getApiBase();
  const res = await fetch(`${base}/api/admin/market/maintenance`, {
    method: "GET",
    headers: { "X-Admin-Secret": adminSecret },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) return { ok: false, status: res.status, error: data?.error ?? res.statusText };
  return { ok: true, data };
}

export async function postAdminMaintenanceEnable(
  adminSecret: string,
  body: { minutes?: number; note?: string }
): Promise<
  { ok: true; data: { ok: boolean; forceClosed: boolean; endsAt: string | null } } | { ok: false; status: number; error?: string }
> {
  const base = getApiBase();
  const res = await fetch(`${base}/api/admin/market/maintenance/enable`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Admin-Secret": adminSecret },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) return { ok: false, status: res.status, error: data?.error ?? res.statusText };
  return { ok: true, data };
}

export async function postAdminMaintenanceDisable(adminSecret: string): Promise<
  { ok: true; data: { ok: boolean; forceClosed: boolean } } | { ok: false; status: number; error?: string }
> {
  const base = getApiBase();
  const res = await fetch(`${base}/api/admin/market/maintenance/disable`, {
    method: "POST",
    headers: { "X-Admin-Secret": adminSecret },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) return { ok: false, status: res.status, error: data?.error ?? res.statusText };
  return { ok: true, data };
}

/** [DEV] Lock cycle now. Requires ENABLE_DEV_TOOLS and X-Admin-Secret. */
export async function postAdminDevLock(
  adminSecret: string,
  body?: { poolCycleId?: string }
): Promise<
  { ok: true; data: { ok: boolean; poolCycleId: string; lockedAt: string; startPoolPfv: number; windowPoolPfv: number } } | { ok: false; status: number; error?: string }
> {
  const base = getApiBase();
  const res = await fetch(`${base}/api/admin/market/dev/lock`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Admin-Secret": adminSecret },
    body: JSON.stringify(body ?? {}),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) return { ok: false, status: res.status, error: data?.error ?? res.statusText };
  return { ok: true, data };
}

/** [DEV] Distribute current window now. */
export async function postAdminDevDistribute(
  adminSecret: string,
  body?: { windowId?: string }
): Promise<
  | { ok: true; data: { ok: boolean; windowId: string; totalPoints?: number; pricePerPoint?: number | null; distributedPfv?: number; returnedPfv?: number; accountsCount?: number; alreadyDistributed?: boolean } }
  | { ok: false; status: number; error?: string }
> {
  const base = getApiBase();
  const res = await fetch(`${base}/api/admin/market/dev/distribute`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Admin-Secret": adminSecret },
    body: JSON.stringify(body ?? {}),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) return { ok: false, status: res.status, error: data?.error ?? res.statusText };
  return { ok: true, data };
}

/** [DEV] Reset current cycle data. */
export async function postAdminDevReset(
  adminSecret: string,
  body?: { poolCycleId?: string; resetPoolTo?: number }
): Promise<
  { ok: true; data: { ok: boolean; poolCycleId: string } } | { ok: false; status: number; error?: string }
> {
  const base = getApiBase();
  const res = await fetch(`${base}/api/admin/market/dev/reset`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Admin-Secret": adminSecret },
    body: JSON.stringify(body ?? {}),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) return { ok: false, status: res.status, error: data?.error ?? res.statusText };
  return { ok: true, data };
}

/** [DEV] Clear all pool data (events + start/current pool for current cycle). */
export async function postAdminDevClearPoolData(
  adminSecret: string,
  body?: { poolCycleId?: string }
): Promise<
  { ok: true; data: { poolCycleId: string } } | { ok: false; status: number; error?: string }
> {
  const base = getApiBase();
  const res = await fetch(`${base}/api/admin/market/dev/clear-pool-data`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Admin-Secret": adminSecret },
    body: JSON.stringify(body ?? {}),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) return { ok: false, status: res.status, error: data?.error ?? res.statusText };
  return { ok: true, data };
}

export async function getAdminPool(adminSecret: string): Promise<
  { ok: true; data: AdminPoolViewResponse } | { ok: false; status: number; error?: string }
> {
  const base = getApiBase();
  const res = await fetch(`${base}/api/admin/market/pool`, {
    method: "GET",
    headers: { "X-Admin-Secret": adminSecret },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) return { ok: false, status: res.status, error: data?.error ?? res.statusText };
  return { ok: true, data };
}

export async function postAdminPoolAdd(
  adminSecret: string,
  body: { amountPfv: number; note?: string }
): Promise<
  { ok: true; data: { ok: boolean; poolCycleId: string; currentPoolPfv: number } } | { ok: false; status: number; error?: string }
> {
  const base = getApiBase();
  const res = await fetch(`${base}/api/admin/market/pool/add`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Admin-Secret": adminSecret },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) return { ok: false, status: res.status, error: data?.error ?? res.statusText };
  return { ok: true, data };
}

/** GET /api/admin/forge/price — current forge price per 1 Density. */
export async function getAdminForgePrice(adminSecret: string): Promise<
  { ok: true; pricePerDensity: number } | { ok: false; status: number; error?: string }
> {
  const base = getApiBase();
  const res = await fetch(`${base}/api/admin/forge/price`, {
    method: "GET",
    headers: { "X-Admin-Secret": adminSecret },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) return { ok: false, status: res.status, error: data?.error ?? res.statusText };
  return { ok: true, pricePerDensity: data?.pricePerDensity ?? 0 };
}

/** POST /api/admin/forge/price — set forge price per 1 Density. Body: { pricePerDensity: number }. */
export async function postAdminForgePrice(
  adminSecret: string,
  pricePerDensity: number
): Promise<
  { ok: true; pricePerDensity: number } | { ok: false; status: number; error?: string }
> {
  const base = getApiBase();
  const res = await fetch(`${base}/api/admin/forge/price`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Admin-Secret": adminSecret },
    body: JSON.stringify({ pricePerDensity }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) return { ok: false, status: res.status, error: data?.error ?? res.statusText };
  return { ok: true, pricePerDensity: data?.pricePerDensity ?? pricePerDensity };
}

export interface AdminForgeBurnStats {
  usersTotalBurnedPfv: number;
  usersTodayBurnedPfv: number;
  realBurnedPfv: number;
  remainingToBurnPfv: number;
}

/** GET /api/admin/forge/burn — burn stats for admin Burn tab. */
export async function getAdminForgeBurn(adminSecret: string): Promise<
  { ok: true; data: AdminForgeBurnStats } | { ok: false; status: number; error?: string }
> {
  const base = getApiBase();
  const res = await fetch(`${base}/api/admin/forge/burn`, {
    method: "GET",
    headers: { "X-Admin-Secret": adminSecret },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) return { ok: false, status: res.status, error: data?.error ?? res.statusText };
  return {
    ok: true,
    data: {
      usersTotalBurnedPfv: data?.usersTotalBurnedPfv ?? 0,
      usersTodayBurnedPfv: data?.usersTodayBurnedPfv ?? 0,
      realBurnedPfv: data?.realBurnedPfv ?? 0,
      remainingToBurnPfv: data?.remainingToBurnPfv ?? 0,
    },
  };
}

/** POST /api/admin/forge/burn — add amount to real burned. Body: { addRealBurned: number }. */
export async function postAdminForgeBurnAdd(
  adminSecret: string,
  addRealBurned: number
): Promise<
  { ok: true; realBurnedPfv: number } | { ok: false; status: number; error?: string }
> {
  const base = getApiBase();
  const res = await fetch(`${base}/api/admin/forge/burn`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Admin-Secret": adminSecret },
    body: JSON.stringify({ addRealBurned }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) return { ok: false, status: res.status, error: data?.error ?? res.statusText };
  return { ok: true, realBurnedPfv: data?.realBurnedPfv ?? 0 };
}

export async function postAdminChatClear(adminSecret: string): Promise<
  { ok: true } | { ok: false; status: number; error?: string }
> {
  const base = getApiBase();
  const res = await fetch(`${base}/api/admin/chat/clear`, {
    method: "POST",
    headers: { "X-Admin-Secret": adminSecret },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) return { ok: false, status: res.status, error: data?.error ?? res.statusText };
  return { ok: true };
}

/** GET /api/admin/market/sales — list sales (status=PENDING|SELL, limit=100). */
export interface AdminSaleItem {
  id: string;
  accountId: number;
  poolCycleId: string;
  windowId: string;
  points: number;
  status: string;
  deliveredPfv: number | null;
  txid: string;
  createdAt: string;
  username: string | null;
  hasTwitter?: boolean;
  blocked?: boolean;
  level?: number;
  sameIpCount?: number;
  sameFingerCount?: number;
  neverChatted?: boolean;
  singleRequestPath?: boolean;
}

export async function getAdminSales(
  adminSecret: string,
  status?: "PENDING" | "SELL",
  limit?: number,
  offset?: number,
  sort?: string,
  order?: "asc" | "desc"
): Promise<
  { ok: true; data: { sales: AdminSaleItem[]; total: number } } | { ok: false; status: number; error?: string }
> {
  const params = new URLSearchParams();
  if (status != null) params.set("status", status);
  if (limit != null) params.set("limit", String(limit));
  if (offset != null) params.set("offset", String(offset));
  if (sort != null) params.set("sort", sort);
  if (order != null) params.set("order", order);
  const q = params.toString() ? `?${params.toString()}` : "";
  const base = getApiBase();
  const res = await fetch(`${base}/api/admin/market/sales${q}`, {
    method: "GET",
    headers: { "X-Admin-Secret": adminSecret },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) return { ok: false, status: res.status, error: data?.error ?? res.statusText };
  const sales = Array.isArray(data?.sales) ? data.sales : (Array.isArray(data) ? data : []);
  const total = typeof data?.total === "number" ? data.total : sales.length;
  return { ok: true, data: { sales, total } };
}

/** GET /api/admin/market/withdrawals — list withdrawals (default status=PENDING, limit=100). */
export interface AdminWithdrawalItem {
  id: string;
  accountId: number;
  poolCycleId: string;
  status: string;
  amountPfv: number;
  walletAddress: string;
  walletShort: string;
  txid: string;
  createdAt: string;
  adminNote: string | null;
  username: string | null;
  hasTwitter?: boolean;
  ip?: string | null;
  blocked?: boolean;
  level?: number;
  sameIpCount?: number;
  sameFingerCount?: number;
  neverChatted?: boolean;
  singleRequestPath?: boolean;
}

export async function getAdminWithdrawals(
  adminSecret: string,
  status?: string,
  limit?: number,
  offset?: number,
  sort?: string,
  order?: "asc" | "desc"
): Promise<
  { ok: true; data: { withdrawals: AdminWithdrawalItem[]; total: number } } | { ok: false; status: number; error?: string }
> {
  const params = new URLSearchParams();
  if (status != null) params.set("status", status);
  if (limit != null) params.set("limit", String(limit));
  if (offset != null) params.set("offset", String(offset));
  if (sort != null) params.set("sort", sort);
  if (order != null) params.set("order", order);
  const q = params.toString() ? `?${params.toString()}` : "";
  const base = getApiBase();
  const res = await fetch(`${base}/api/admin/market/withdrawals${q}`, {
    method: "GET",
    headers: { "X-Admin-Secret": adminSecret },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) return { ok: false, status: res.status, error: data?.error ?? res.statusText };
  const withdrawals = Array.isArray(data?.withdrawals) ? data.withdrawals : (Array.isArray(data) ? data : []);
  const total = typeof data?.total === "number" ? data.total : withdrawals.length;
  return { ok: true, data: { withdrawals, total } };
}

export async function getAdminWithdrawalsPendingTotals(
  adminSecret: string
): Promise<
  { ok: true; data: { totalPfv: number; accountCount: number } } | { ok: false; status: number; error?: string }
> {
  try {
    const base = getApiBase();
    const res = await fetch(`${base}/api/admin/market/withdrawals/pending-totals`, {
      method: "GET",
      headers: { "X-Admin-Secret": adminSecret },
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false, status: res.status, error: data?.error ?? res.statusText };
    return { ok: true, data: { totalPfv: data?.totalPfv ?? 0, accountCount: data?.accountCount ?? 0 } };
  } catch {
    return { ok: false, status: 0, error: "Network error" };
  }
}

export async function postAdminWithdrawalComplete(
  adminSecret: string,
  id: string,
  adminNote?: string
): Promise<{ ok: true } | { ok: false; status: number; error?: string }> {
  const base = getApiBase();
  const res = await fetch(`${base}/api/admin/market/withdrawals/${encodeURIComponent(id)}/complete`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Admin-Secret": adminSecret },
    body: JSON.stringify(adminNote != null ? { adminNote } : {}),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) return { ok: false, status: res.status, error: data?.error ?? res.statusText };
  return { ok: true };
}

export async function postAdminWithdrawalCancel(
  adminSecret: string,
  id: string,
  adminNote?: string
): Promise<{ ok: true } | { ok: false; status: number; error?: string }> {
  const base = getApiBase();
  const res = await fetch(`${base}/api/admin/market/withdrawals/${encodeURIComponent(id)}/cancel`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Admin-Secret": adminSecret },
    body: JSON.stringify(adminNote != null ? { adminNote } : {}),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) return { ok: false, status: res.status, error: data?.error ?? res.statusText };
  return { ok: true };
}

/** POST /api/admin/market/withdrawals/complete-batch — complete multiple PENDING withdrawals. */
export async function postAdminWithdrawalsCompleteBatch(
  adminSecret: string,
  ids: string[]
): Promise<
  { ok: true; data: { results: { id: string; ok: boolean; error?: string }[] } } | { ok: false; status: number; error?: string }
> {
  const base = getApiBase();
  const res = await fetch(`${base}/api/admin/market/withdrawals/complete-batch`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Admin-Secret": adminSecret },
    body: JSON.stringify({ ids }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) return { ok: false, status: res.status, error: data?.error ?? res.statusText };
  return { ok: true, data: { results: data?.results ?? [] } };
}

/** POST /api/admin/market/withdrawals/cancel-batch — cancel multiple PENDING withdrawals. */
export async function postAdminWithdrawalsCancelBatch(
  adminSecret: string,
  ids: string[]
): Promise<
  { ok: true; data: { results: { id: string; ok: boolean; error?: string }[] } } | { ok: false; status: number; error?: string }
> {
  const base = getApiBase();
  const res = await fetch(`${base}/api/admin/market/withdrawals/cancel-batch`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Admin-Secret": adminSecret },
    body: JSON.stringify({ ids }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) return { ok: false, status: res.status, error: data?.error ?? res.statusText };
  return { ok: true, data: { results: data?.results ?? [] } };
}

/** GET /api/admin/market/stats — stats by period (1d, 7d, all). */
export async function getAdminStats(
  adminSecret: string,
  period: "1d" | "7d" | "all"
): Promise<
  { ok: true; data: { totalSellPfv: number; totalSellUniqueAccounts: number; totalClaimedPfv: number; totalClaimedUniqueAccounts: number; totalPoints: number; totalNewUsers: number; avgCharacterLevel: number } } | { ok: false; status: number; error?: string }
> {
  const base = getApiBase();
  const res = await fetch(`${base}/api/admin/market/stats?period=${encodeURIComponent(period)}`, {
    method: "GET",
    headers: { "X-Admin-Secret": adminSecret },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) return { ok: false, status: res.status, error: data?.error ?? res.statusText };
  return { ok: true, data };
}

/** GET /api/admin/online — accounts online (active in last 3 min). For admin Online tab. */
export interface AdminOnlineRow {
  accountId: number;
  nick: string;
  username: string;
  location: "arena" | "mining" | "valley";
  lastRequestPath: string;
  lastSeenAt: string;
  sessionStartedAt: string | null;
  suspectedBot?: boolean;
  ip?: string | null;
  level?: number;
  hasTwitter?: boolean;
  blocked?: boolean;
  sameIpCount?: number;
  sameFingerCount?: number;
  neverChatted?: boolean;
  singleRequestPath?: boolean;
}

export async function getAdminOnline(adminSecret: string): Promise<
  { ok: true; data: { list: AdminOnlineRow[] } } | { ok: false; status: number; error?: string }
> {
  const base = getApiBase();
  const res = await fetch(`${base}/api/admin/online`, {
    method: "GET",
    headers: { "X-Admin-Secret": adminSecret },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) return { ok: false, status: res.status, error: data?.error ?? res.statusText };
  return { ok: true, data: { list: data?.list ?? [] } };
}

/** GET /api/admin/arena — accounts currently in arena (heartbeat last 1 min). Same shape as Online. */
export async function getAdminArena(adminSecret: string): Promise<
  { ok: true; data: { list: AdminOnlineRow[] } } | { ok: false; status: number; error?: string }
> {
  const base = getApiBase();
  const res = await fetch(`${base}/api/admin/arena`, {
    method: "GET",
    headers: { "X-Admin-Secret": adminSecret },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) return { ok: false, status: res.status, error: data?.error ?? res.statusText };
  return { ok: true, data: { list: data?.list ?? [] } };
}

/** POST /api/admin/end-sessions — end sessions for selected accounts (log them out). */
export async function postAdminEndSessions(
  adminSecret: string,
  accountIds: number[]
): Promise<{ ok: true; data: { count: number } } | { ok: false; status: number; error?: string }> {
  const base = getApiBase();
  const res = await fetch(`${base}/api/admin/end-sessions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Admin-Secret": adminSecret },
    body: JSON.stringify({ accountIds }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) return { ok: false, status: res.status, error: data?.error ?? res.statusText };
  return { ok: true, data: { count: data?.count ?? 0 } };
}

/** GET /api/admin/market/users — users list (limit, offset, ip filter, blocked filter). */
export interface AdminUserRow {
  accountId: number;
  username: string;
  hasTwitter?: boolean;
  level: number;
  balancePfv: number;
  sellPfv: number;
  claimedPfv: number;
  gold: number;
  silver: number;
  bronze: number;
  ip?: string | null;
  blocked?: boolean;
  sameIpCount?: number;
  sameFingerCount?: number;
  neverChatted?: boolean;
  singleRequestPath?: boolean;
}

export async function getAdminUsers(
  adminSecret: string,
  limit?: number,
  offset?: number,
  ip?: string | null,
  blocked?: "all" | "blocked" | null,
  nick?: string | null,
  sort?: string,
  order?: "asc" | "desc"
): Promise<
  { ok: true; data: { users: AdminUserRow[]; total: number } } | { ok: false; status: number; error?: string }
> {
  const params = new URLSearchParams();
  if (limit != null) params.set("limit", String(limit));
  if (offset != null) params.set("offset", String(offset));
  if (ip != null && ip !== "") params.set("ip", ip);
  if (blocked === "blocked") params.set("blocked", "1");
  if (nick != null && nick !== "") params.set("nick", nick);
  if (sort != null) params.set("sort", sort);
  if (order != null) params.set("order", order);
  const q = params.toString() ? `?${params.toString()}` : "";
  const base = getApiBase();
  const res = await fetch(`${base}/api/admin/market/users${q}`, {
    method: "GET",
    headers: { "X-Admin-Secret": adminSecret },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) return { ok: false, status: res.status, error: data?.error ?? res.statusText };
  return { ok: true, data: { users: data?.users ?? [], total: typeof data?.total === "number" ? data.total : data?.users?.length ?? 0 } };
}

/** GET /api/admin/market/ips — IPs with account count and list (for Users IP tab). */
export interface AdminIpRow {
  ip: string;
  accountCount: number;
  accounts: AdminUserRow[];
}

export async function getAdminIps(
  adminSecret: string,
  limit?: number,
  offset?: number,
  ip?: string | null,
  nick?: string | null,
  sort?: "ip" | "accountCount",
  order?: "asc" | "desc"
): Promise<
  { ok: true; data: { ips: AdminIpRow[]; total: number } } | { ok: false; status: number; error?: string }
> {
  const params = new URLSearchParams();
  if (limit != null) params.set("limit", String(limit));
  if (offset != null) params.set("offset", String(offset));
  if (ip != null && ip !== "") params.set("ip", ip);
  if (nick != null && nick !== "") params.set("nick", nick);
  if (sort != null) params.set("sort", sort);
  if (order != null) params.set("order", order);
  const q = params.toString() ? `?${params.toString()}` : "";
  const base = getApiBase();
  const res = await fetch(`${base}/api/admin/market/ips${q}`, {
    method: "GET",
    headers: { "X-Admin-Secret": adminSecret },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) return { ok: false, status: res.status, error: data?.error ?? res.statusText };
  return { ok: true, data: { ips: data?.ips ?? [], total: typeof data?.total === "number" ? data.total : data?.ips?.length ?? 0 } };
}

/** GET /api/admin/market/fingerprints — fingerprints with account count and list (for Users Finger tab). */
export interface AdminFingerRow {
  fingerprintHash: string;
  fingerprintHashFull: string;
  accountCount: number;
  accounts: AdminUserRow[];
}

export async function getAdminFingerprints(
  adminSecret: string,
  limit?: number,
  offset?: number,
  nick?: string | null,
  sort?: "accountCount" | "fingerprint",
  order?: "asc" | "desc"
): Promise<
  { ok: true; data: { fingerprints: AdminFingerRow[]; total: number } } | { ok: false; status: number; error?: string }
> {
  const params = new URLSearchParams();
  if (limit != null) params.set("limit", String(limit));
  if (offset != null) params.set("offset", String(offset));
  if (nick != null && nick !== "") params.set("nick", nick);
  if (sort != null) params.set("sort", sort);
  if (order != null) params.set("order", order);
  const q = params.toString() ? `?${params.toString()}` : "";
  const base = getApiBase();
  const res = await fetch(`${base}/api/admin/market/fingerprints${q}`, {
    method: "GET",
    headers: { "X-Admin-Secret": adminSecret },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) return { ok: false, status: res.status, error: data?.error ?? res.statusText };
  return { ok: true, data: { fingerprints: data?.fingerprints ?? [], total: typeof data?.total === "number" ? data.total : data?.fingerprints?.length ?? 0 } };
}

/** GET /api/admin/market/users/:accountId — user detail for popup. */
export interface AdminUserDetail {
  accountId: number;
  characterId: number | null;
  username: string;
  createdAt: string;
  balancePfv: number;
  level: number;
  blocked?: boolean;
  blockReason?: string | null;
  referralCount?: number;
  /** Per-IP groups: each IP this account shares with others, with count and account list. */
  sameIpByIp: { ip: string; count: number; accounts: { accountId: number; username: string; createdAt?: string; index?: number; blocked?: boolean }[] }[];
  /** Accounts that share the same registration fingerprint. */
  sameFingerAccounts: { accountId: number; username: string; createdAt?: string; index?: number; blocked?: boolean }[];
  neverChatted?: boolean;
  singleRequestPath?: boolean;
  sales: { status: string; points: number; deliveredPfv: number | null; createdAt: string }[];
  withdrawals: { status: string; amountPfv: number; walletAddress: string; createdAt: string; completedAt: string | null }[];
}

export interface AdminTwitterUserRow {
  accountId: number;
  username: string;
  followersCount: number | null;
}

export interface AdminReferralRow {
  accountId: number;
  username: string;
  previewVersion: number;
  referralCount: number;
}

export async function getAdminTwitterUsers(
  adminSecret: string,
  params: { limit?: number; offset?: number; nick?: string; sort?: string; order?: "asc" | "desc" }
): Promise<
  { ok: true; data: { rows: AdminTwitterUserRow[]; total: number } } | { ok: false; status: number; error?: string }
> {
  const base = getApiBase();
  const q = new URLSearchParams();
  if (params.limit != null) q.set("limit", String(params.limit));
  if (params.offset != null) q.set("offset", String(params.offset));
  if (params.nick) q.set("nick", params.nick);
  if (params.sort) q.set("sort", params.sort);
  if (params.order) q.set("order", params.order);
  const res = await fetch(`${base}/api/admin/twitter-users?${q.toString()}`, {
    headers: { "X-Admin-Secret": adminSecret },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) return { ok: false, status: res.status, error: data?.error ?? res.statusText };
  return { ok: true, data: { rows: data?.rows ?? [], total: data?.total ?? 0 } };
}

export async function getAdminReferrals(
  adminSecret: string,
  params: { limit?: number; offset?: number; nick?: string; id?: string; sort?: string; order?: "asc" | "desc" }
): Promise<
  { ok: true; data: { rows: AdminReferralRow[]; total: number } } | { ok: false; status: number; error?: string }
> {
  const base = getApiBase();
  const q = new URLSearchParams();
  if (params.limit != null) q.set("limit", String(params.limit));
  if (params.offset != null) q.set("offset", String(params.offset));
  if (params.nick) q.set("nick", params.nick);
  if (params.id != null && params.id !== "") q.set("id", String(params.id));
  if (params.sort) q.set("sort", params.sort);
  if (params.order) q.set("order", params.order);
  const res = await fetch(`${base}/api/admin/referrals?${q.toString()}`, {
    headers: { "X-Admin-Secret": adminSecret },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) return { ok: false, status: res.status, error: data?.error ?? res.statusText };
  return { ok: true, data: { rows: data?.rows ?? [], total: data?.total ?? 0 } };
}

export async function getAdminReferralsList(
  adminSecret: string,
  accountId: number
): Promise<
  { ok: true; data: { referrals: { accountId: number; username: string }[] } } | { ok: false; status: number; error?: string }
> {
  const base = getApiBase();
  const res = await fetch(`${base}/api/admin/referrals/${encodeURIComponent(accountId)}/list`, {
    headers: { "X-Admin-Secret": adminSecret },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) return { ok: false, status: res.status, error: data?.error ?? res.statusText };
  return { ok: true, data: { referrals: data?.referrals ?? [] } };
}

/** POST /api/admin/market/users/:accountId/block — block account. */
export async function postAdminUserBlock(
  adminSecret: string,
  accountId: number,
  reason?: string
): Promise<{ ok: true } | { ok: false; status: number; error?: string }> {
  const base = getApiBase();
  const res = await fetch(`${base}/api/admin/market/users/${encodeURIComponent(accountId)}/block`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Admin-Secret": adminSecret },
    body: JSON.stringify({ reason: reason ?? "" }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) return { ok: false, status: res.status, error: data?.error ?? res.statusText };
  return { ok: true };
}

/** POST /api/admin/market/users/:accountId/unblock — unblock account. */
export async function postAdminUserUnblock(
  adminSecret: string,
  accountId: number
): Promise<{ ok: true } | { ok: false; status: number; error?: string }> {
  const base = getApiBase();
  const res = await fetch(`${base}/api/admin/market/users/${encodeURIComponent(accountId)}/unblock`, {
    method: "POST",
    headers: { "X-Admin-Secret": adminSecret },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) return { ok: false, status: res.status, error: data?.error ?? res.statusText };
  return { ok: true };
}

/** POST /api/admin/market/users/:accountId/add-balance — add $PFV to user balance. */
export async function postAdminUserAddBalance(
  adminSecret: string,
  accountId: number,
  amountPfv: number
): Promise<{ ok: true } | { ok: false; status: number; error?: string }> {
  const base = getApiBase();
  const res = await fetch(`${base}/api/admin/market/users/${encodeURIComponent(accountId)}/add-balance`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Admin-Secret": adminSecret },
    body: JSON.stringify({ amountPfv }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) return { ok: false, status: res.status, error: data?.error ?? res.statusText };
  return { ok: true };
}

/** POST /api/admin/market/users/:accountId/add-resources — add gold/silver/bronze to character inventory. */
export async function postAdminUserAddResources(
  adminSecret: string,
  accountId: number,
  amounts: { gold?: number; silver?: number; bronze?: number }
): Promise<{ ok: true } | { ok: false; status: number; error?: string }> {
  const base = getApiBase();
  const res = await fetch(`${base}/api/admin/market/users/${encodeURIComponent(accountId)}/add-resources`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Admin-Secret": adminSecret },
    body: JSON.stringify(amounts),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) return { ok: false, status: res.status, error: data?.error ?? res.statusText };
  return { ok: true };
}

/** GET /api/admin/ip/investigate?ip= — investigate IP: accounts, activity, blocked status. */
export async function getAdminIpInvestigate(
  adminSecret: string,
  ip: string
): Promise<
  | { ok: true; data: { ip: string; isBlocked: boolean; accountsFromRegistration: { id: number; nick: string; username: string; createdAt: string; hasTwitter: boolean }[]; activity: { accountId: number; lastSeenAt: string; lastRequestPath: string | null }[] } }
  | { ok: false; status: number; error?: string }
> {
  const base = getApiBase();
  const res = await fetch(`${base}/api/admin/ip/investigate?ip=${encodeURIComponent(ip)}`, {
    method: "GET",
    headers: { "X-Admin-Secret": adminSecret },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) return { ok: false, status: res.status, error: data?.error ?? res.statusText };
  return { ok: true, data };
}

/** POST /api/admin/ip/delete-accounts — delete all accounts linked to this IP. */
export async function postAdminIpDeleteAccounts(
  adminSecret: string,
  ip: string
): Promise<{ ok: true; data: { deleted: number } } | { ok: false; status: number; error?: string }> {
  const base = getApiBase();
  const res = await fetch(`${base}/api/admin/ip/delete-accounts`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Admin-Secret": adminSecret },
    body: JSON.stringify({ ip }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) return { ok: false, status: res.status, error: data?.error ?? res.statusText };
  return { ok: true, data: { deleted: data?.deleted ?? 0 } };
}

/** GET /api/admin/blocked-ips — list blocked IPs. */
export async function getAdminBlockedIps(adminSecret: string): Promise<
  { ok: true; data: { ips: string[] } } | { ok: false; status: number; error?: string }
> {
  const base = getApiBase();
  const res = await fetch(`${base}/api/admin/blocked-ips`, {
    method: "GET",
    headers: { "X-Admin-Secret": adminSecret },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) return { ok: false, status: res.status, error: data?.error ?? res.statusText };
  return { ok: true, data: { ips: data?.ips ?? [] } };
}

/** POST /api/admin/block-ip — block IP from accessing the site. */
export async function postAdminBlockIp(
  adminSecret: string,
  ip: string
): Promise<{ ok: true } | { ok: false; status: number; error?: string }> {
  const base = getApiBase();
  const res = await fetch(`${base}/api/admin/block-ip`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Admin-Secret": adminSecret },
    body: JSON.stringify({ ip }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) return { ok: false, status: res.status, error: data?.error ?? res.statusText };
  return { ok: true };
}

/** POST /api/admin/unblock-ip — remove IP from blocked list. */
export async function postAdminUnblockIp(
  adminSecret: string,
  ip: string
): Promise<{ ok: true } | { ok: false; status: number; error?: string }> {
  const base = getApiBase();
  const res = await fetch(`${base}/api/admin/unblock-ip`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Admin-Secret": adminSecret },
    body: JSON.stringify({ ip }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) return { ok: false, status: res.status, error: data?.error ?? res.statusText };
  return { ok: true };
}

/** POST /api/admin/accounts/:accountId/delete — delete one account. */
export async function postAdminAccountDelete(
  adminSecret: string,
  accountId: number
): Promise<{ ok: true } | { ok: false; status: number; error?: string }> {
  const base = getApiBase();
  const res = await fetch(`${base}/api/admin/accounts/${encodeURIComponent(accountId)}/delete`, {
    method: "POST",
    headers: { "X-Admin-Secret": adminSecret },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) return { ok: false, status: res.status, error: data?.error ?? res.statusText };
  return { ok: true };
}

export async function getAdminUserDetail(
  adminSecret: string,
  accountId: number
): Promise<
  { ok: true; data: AdminUserDetail } | { ok: false; status: number; error?: string }
> {
  const base = getApiBase();
  const res = await fetch(`${base}/api/admin/market/users/${encodeURIComponent(accountId)}`, {
    method: "GET",
    headers: { "X-Admin-Secret": adminSecret },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) return { ok: false, status: res.status, error: data?.error ?? res.statusText };
  return { ok: true, data };
}

/** GET /api/market/last-window — last distributed window for Statistics. */
export interface MarketLastWindowResponse {
  window: {
    id: string;
    index: number;
    startAt: string;
    endAt: string;
    windowPoolPfv: number;
    totalPoints: number;
    pricePerPoint: number | null;
    distributedPfv: number;
    returnedPfv: number;
  } | null;
}

/** GET /api/market/estimate — current window estimate for Sell tab. */
export interface MarketEstimateResponse {
  windowId: string;
  windowPoolPfv: number;
  totalPoints: number;
  estimatedPricePerPoint: number | null;
  estimatedPfvPerPoint: number | null;
  estimatedPfvPerGold: number | null;
  estimatedPfvPerSilver: number | null;
  estimatedPfvPerBronze: number | null;
}

export async function getMarketState(): Promise<
  { ok: true; data: MarketStateResponse } | { ok: false; status: number; error?: string }
> {
  return fetchApi<MarketStateResponse>("/api/market/state", { method: "GET" });
}

export async function getMarketLastWindow(): Promise<
  { ok: true; data: MarketLastWindowResponse } | { ok: false; status: number; error?: string }
> {
  return fetchApi<MarketLastWindowResponse>("/api/market/last-window", { method: "GET" });
}

export interface MarketAllTimeStatsResponse {
  poolPfv: number;
  points: number;
  earnedPfv: number;
  claimedPfv: number;
}

export async function getMarketAllTimeStats(): Promise<
  { ok: true; data: MarketAllTimeStatsResponse } | { ok: false; status: number; error?: string }
> {
  return fetchApi<MarketAllTimeStatsResponse>("/api/market/all-time-stats", { method: "GET" });
}

export interface MarketLeaderboardRow {
  rank: number;
  username: string;
  hasTwitter?: boolean;
  avatarUrl: string | null;
  level: number;
  pfv: number;
}

export async function getMarketLeaderboard(
  period: "allTime" | "lastDay",
  mode: "sales" | "withdrawals"
): Promise<
  { ok: true; data: { rows: MarketLeaderboardRow[] } } | { ok: false; status: number; error?: string }
> {
  const q = `?period=${encodeURIComponent(period)}&mode=${encodeURIComponent(mode)}`;
  return fetchApi<{ rows: MarketLeaderboardRow[] }>(`/api/market/leaderboard${q}`, { method: "GET" });
}

// --- Forge (in-game) ---
export interface ForgeStateResponse {
  pricePerDensity: number;
  totalBurnedPfv: number;
  todayBurnedPfv: number;
  /** Global totals (all players) shown in "Total Burned" / "Today Burned" cards */
  globalTotalBurnedPfv?: number;
  globalTodayBurnedPfv?: number;
}

export async function getForgeState(
  token: string | null
): Promise<
  { ok: true; data: ForgeStateResponse } | { ok: false; status: number; error?: string }
> {
  if (!token) return { ok: false, status: 401 };
  return fetchApi<ForgeStateResponse>("/api/forge/state", { method: "GET", token });
}

export interface ForgeRefineResponse {
  character: { id: number; pfv: number };
  slots: { slotIndex: number; resourceType: string; count: number }[];
  burnedPfv: number;
}

export async function postForgeRefine(
  token: string | null,
  body: { type: "silver" | "gold"; amount: number }
): Promise<
  { ok: true; data: ForgeRefineResponse } | { ok: false; status: number; error?: string }
> {
  if (!token) return { ok: false, status: 401 };
  return fetchApi<ForgeRefineResponse>("/api/forge/refine", {
    method: "POST",
    body: JSON.stringify(body),
    token,
  });
}

export interface ForgeLeaderboardRow {
  rank: number;
  accountId: number;
  username: string;
  avatarUrl: string | null;
  hasTwitter?: boolean;
  level: number;
  burnedPfv: number;
}

export async function getForgeLeaderboard(period: "all" | "today"): Promise<
  { ok: true; data: { period: string; list: ForgeLeaderboardRow[] } } | { ok: false; status: number; error?: string }
> {
  const q = `?period=${encodeURIComponent(period)}`;
  return fetchApi<{ period: string; list: ForgeLeaderboardRow[] }>(`/api/forge/leaderboard${q}`, { method: "GET" });
}

/** Your points and actual earned PFV (capped 20%) for last distributed window. */
export interface MarketLastWindowYourStatsResponse {
  yourPoints: number;
  yourEarnedPfv: number;
}

export async function getMarketLastWindowYourStats(
  token: string | null
): Promise<
  { ok: true; data: MarketLastWindowYourStatsResponse } | { ok: false; status: number; error?: string }
> {
  if (!token) return { ok: false, status: 401 };
  return fetchApi<MarketLastWindowYourStatsResponse>("/api/market/last-window-your-stats", { method: "GET", token });
}

export async function getMarketEstimate(): Promise<
  { ok: true; data: MarketEstimateResponse } | { ok: false; status: number; error?: string }
> {
  return fetchApi<MarketEstimateResponse>("/api/market/estimate", { method: "GET" });
}

export interface MarketWindowPointsResponse {
  windowId: string;
  totalPoints: number;
  yourPoints: number;
}

export async function getMarketWindowPoints(
  token: string | null,
  windowId?: string
): Promise<{ ok: true; data: MarketWindowPointsResponse } | { ok: false; status: number; error?: string }> {
  if (!token) return { ok: false, status: 401 };
  const q = windowId ? `?windowId=${encodeURIComponent(windowId)}` : "";
  return fetchApi<MarketWindowPointsResponse>(`/api/market/window-points${q}`, { method: "GET", token });
}

export interface MarketSaleItem {
  status: string;
  points: number;
  txid: string;
  date: string;
  pfv: number | null;
  windowId?: string;
}

export async function getMarketSales(
  token: string | null,
  windowId?: string,
  options?: { all?: boolean }
): Promise<{ ok: true; data: MarketSaleItem[] } | { ok: false; status: number; error?: string }> {
  if (!token) return { ok: false, status: 401 };
  const params = new URLSearchParams();
  if (options?.all) params.set("all", "1");
  else if (windowId) params.set("windowId", windowId);
  const q = params.toString() ? `?${params.toString()}` : "";
  return fetchApi<MarketSaleItem[]>(`/api/market/sales${q}`, { method: "GET", token });
}

export interface MarketSellResponse {
  ok: true;
  sale: { status: string; points: number; txid: string; date: string; windowId: string };
  window: { windowId: string; totalPoints: number; yourPoints: number };
}

export async function postMarketSell(
  token: string | null,
  body: { gold: number; silver: number; bronze: number }
): Promise<{ ok: true; data: MarketSellResponse } | { ok: false; status: number; error?: string }> {
  if (!token) return { ok: false, status: 401 };
  return fetchApi<MarketSellResponse>("/api/market/sell", {
    method: "POST",
    token,
    body: JSON.stringify(body),
  });
}

/** GET /api/market/withdraw/status */
export interface WithdrawStatusResponse {
  availablePfv: number;
  claimReservedPfv: number;
  totalReservedPfv: number;
  withdrawsUsed: number;
  withdrawsLeft: number;
  nextPoolUpdateAt: string;
  totalWithdrawnAllTime: number;
}

export async function getWithdrawStatus(
  token: string | null
): Promise<{ ok: true; data: WithdrawStatusResponse } | { ok: false; status: number; error?: string }> {
  if (!token) return { ok: false, status: 401 };
  return fetchApi<WithdrawStatusResponse>("/api/market/withdraw/status", { method: "GET", token });
}

/** GET /api/market/withdraw/history */
export interface WithdrawHistoryItem {
  status: string;
  amountPfv: number;
  walletShort: string;
  walletAddress: string;
  txid: string;
  date: string;
}

export async function getWithdrawHistory(
  token: string | null
): Promise<{ ok: true; data: WithdrawHistoryItem[] } | { ok: false; status: number; error?: string }> {
  if (!token) return { ok: false, status: 401 };
  return fetchApi<WithdrawHistoryItem[]>("/api/market/withdraw/history", { method: "GET", token });
}

/** POST /api/market/withdraw */
export interface PostWithdrawResponse {
  ok: true;
  balances: { availablePfv: number; claimReservedPfv: number; totalReservedPfv: number };
  withdrawsUsed: number;
  withdrawsLeft: number;
  withdrawal: {
    status: string;
    amountPfv: number;
    walletAddress?: string;
    walletShort: string;
    txid: string;
    date: string;
  };
}

export async function postWithdraw(
  token: string | null,
  body: { amountPfv: number; walletAddress?: string }
): Promise<{ ok: true; data: PostWithdrawResponse } | { ok: false; status: number; error?: string }> {
  if (!token) return { ok: false, status: 401 };
  return fetchApi<PostWithdrawResponse>("/api/market/withdraw", {
    method: "POST",
    token,
    body: JSON.stringify(body),
  });
}

/** GET /api/wallet/connect-message */
export async function getWalletConnectMessage(
  token: string | null
): Promise<{ ok: true; data: { message: string } } | { ok: false; status: number; error?: string }> {
  if (!token) return { ok: false, status: 401 };
  return fetchApi<{ message: string }>("/api/wallet/connect-message", { method: "GET", token });
}

/** POST /api/wallet/connect */
export async function postWalletConnect(
  token: string | null,
  body: { publicKey: string; message: string; signature: string }
): Promise<{ ok: true; data: { walletPubkey: string } } | { ok: false; status: number; error?: string }> {
  if (!token) return { ok: false, status: 401 };
  return fetchApi<{ walletPubkey: string }>("/api/wallet/connect", {
    method: "POST",
    token,
    body: JSON.stringify(body),
  });
}

/** POST /api/wallet/disconnect */
export async function postWalletDisconnect(
  token: string | null
): Promise<{ ok: true } | { ok: false; status: number; error?: string }> {
  if (!token) return { ok: false, status: 401 };
  return fetchApi<Record<string, never>>("/api/wallet/disconnect", {
    method: "POST",
    body: JSON.stringify({}),
    token,
  });
}

/** GET /api/wallet/status */
export async function getWalletStatus(
  token: string | null
): Promise<{ ok: true; data: { walletPubkey: string | null } } | { ok: false; status: number; error?: string }> {
  if (!token) return { ok: false, status: 401 };
  return fetchApi<{ walletPubkey: string | null }>("/api/wallet/status", { method: "GET", token, cache: "no-store" });
}

async function fetchApi<T>(
  path: string,
  options: RequestInit & { token?: string | null } = {}
): Promise<{ ok: true; data: T } | { ok: false; status: number; error?: string }> {
  const { token, ...init } = options;
  const url = `${getApiBase()}${path}`;
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(init.headers as Record<string, string>),
  };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  const res = await fetch(url, { ...init, headers });
  const text = await res.text();
  let data: unknown;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = null;
  }
  if (!res.ok) {
    const error = typeof data === "object" && data !== null && "error" in data ? String((data as { error: string }).error) : undefined;
    if (res.status === 401 && token) {
      invalidateSessionInThisTab();
      onSessionInvalid?.();
    } else if (res.status === 403 && error === "needs_email_verification") {
      onNeedsEmailVerification?.();
    }
    return {
      ok: false,
      status: res.status,
      error,
    };
  }
  return { ok: true, data: data as T };
}

export async function devLogin(secret: string): Promise<{ ok: true; token: string } | { ok: false; error: string }> {
  const result = await fetchApi<DevLoginResponse>("/api/auth/dev-login", {
    method: "POST",
    body: JSON.stringify({ secret }),
  });
  if (!result.ok) {
    return { ok: false, error: result.error ?? `HTTP ${result.status}` };
  }
  return { ok: true, token: result.data.token };
}

export async function getMe(token: string | null): Promise<{ ok: true; data: MeResponse } | { ok: false; status: number }> {
  if (!token) return { ok: false, status: 401 };
  const result = await fetchApi<MeResponse>("/api/auth/me", { token });
  if (!result.ok) return { ok: false, status: result.status };
  return { ok: true, data: result.data };
}

export const REFERRAL_STORAGE_KEY = "pixelvalley_ref";

export interface ReferralsResponse {
  referralLink: string;
  referralCount: number;
  referredUsers: { accountId: number; username: string; hasTwitter?: boolean; joinedAt: string }[];
}

export async function getReferrals(
  token: string | null
): Promise<{ ok: true; data: ReferralsResponse } | { ok: false; status: number }> {
  if (!token) return { ok: false, status: 401 };
  const result = await fetchApi<ReferralsResponse>("/api/auth/referrals", { token });
  if (!result.ok) return { ok: false, status: result.status };
  return { ok: true, data: result.data };
}

/** Bump og:image version so share preview URL changes (call when welcome / level-up / referrals tab is shown). */
export async function postReferralBumpPreview(
  token: string | null
): Promise<{ ok: true } | { ok: false; status: number }> {
  if (!token) return { ok: false, status: 401 };
  const result = await fetchApi<{ ok: true }>("/api/auth/referral-bump-preview", {
    token,
    method: "POST",
  });
  if (!result.ok) return { ok: false, status: result.status };
  return { ok: true };
}

/** URL to start Twitter OAuth; include ref from localStorage so new user is attributed. */
export function getTwitterLoginUrl(): string {
  const base = getApiBase();
  const ref = typeof localStorage !== "undefined" ? localStorage.getItem(REFERRAL_STORAGE_KEY) : null;
  const refParam = ref ? `?ref=${encodeURIComponent(ref)}` : "";
  return `${base}/api/auth/twitter${refParam}`;
}

export async function getCaptchaSiteKey(): Promise<string> {
  const base = getApiBase();
  const res = await fetch(`${base}/api/auth/captcha-key`);
  const data = await res.json().catch(() => ({}));
  return typeof data?.turnstileSiteKey === "string" ? data.turnstileSiteKey : "";
}

export async function postSendEmailCode(body: {
  email: string;
  fingerprint?: string;
}): Promise<{ ok: true } | { ok: false; status: number; error?: string; message?: string }> {
  const base = getApiBase();
  const token = getToken();
  const res = await fetch(`${base}/api/auth/send-email-code`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) return { ok: false, status: res.status, error: data?.error, message: data?.message };
  return { ok: true };
}

export async function postVerifyEmail(body: {
  email: string;
  code: string;
  fingerprint?: string;
}): Promise<{ ok: true } | { ok: false; status: number; error?: string }> {
  const base = getApiBase();
  const token = getToken();
  if (!token) return { ok: false, status: 401 };
  const res = await fetch(`${base}/api/auth/verify-email`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) return { ok: false, status: res.status, error: data?.error };
  return { ok: true };
}

/** Call before login — sets pv_lv cookie. Requires Cloudflare challenge on /login + this path. */
export async function getLoginVisit(): Promise<{ ok: true } | { ok: false; status: number; error?: string }> {
  const base = getApiBase();
  const res = await fetch(`${base}/api/auth/login-visit`, { credentials: "include" });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) return { ok: false, status: res.status, error: data?.error ?? res.statusText };
  return { ok: true };
}

/** Call before getRegistrationIntent — sets pv_sv cookie. Requires Cloudflare challenge on /signup + this path. */
export async function getSignupVisit(): Promise<{ ok: true } | { ok: false; status: number; error?: string }> {
  const base = getApiBase();
  const res = await fetch(`${base}/api/auth/signup-visit`, { credentials: "include" });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) return { ok: false, status: res.status, error: data?.error ?? res.statusText };
  return { ok: true };
}

export async function getRegistrationIntent(): Promise<
  { ok: true; intentToken: string; honeypotField: string } | { ok: false; status: number; error?: string }> {
  const base = getApiBase();
  const res = await fetch(`${base}/api/auth/registration-intent`, { credentials: "include" });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) return { ok: false, status: res.status, error: data?.error ?? res.statusText };
  const honeypotField = typeof data?.honeypotField === "string" ? data.honeypotField : "hp_fallback";
  return { ok: true, intentToken: data.intentToken, honeypotField };
}

export async function postRegister(body: {
  nick: string;
  username: string;
  password: string;
  email: string;
  code: string;
  turnstileToken?: string;
  registrationIntent?: string;
  fingerprint?: string;
  [key: string]: string | undefined;
}): Promise<
  { ok: true; data: { token: string; accountId: number } } | { ok: false; status: number; error?: string }>
{
  const base = getApiBase();
  const ref = typeof localStorage !== "undefined" ? localStorage.getItem(REFERRAL_STORAGE_KEY) : null;
  const url = ref ? `${base}/api/auth/register?ref=${encodeURIComponent(ref)}` : `${base}/api/auth/register`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    credentials: "include",
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) return { ok: false, status: res.status, error: data?.error ?? res.statusText };
  return { ok: true, data: { token: data.token, accountId: data.accountId } };
}

export async function postLogin(body: {
  username: string;
  password: string;
  turnstileToken?: string;
}): Promise<
  { ok: true; data: { token: string; accountId: number } } | { ok: false; status: number; error?: string; reason?: string }>
{
  const base = getApiBase();
  const res = await fetch(`${base}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    credentials: "include",
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) return { ok: false, status: res.status, error: data?.error ?? res.statusText, reason: data?.reason };
  return { ok: true, data: { token: data.token, accountId: data.accountId } };
}

export async function changePassword(body: {
  currentPassword: string;
  newPassword: string;
}): Promise<{ ok: true } | { ok: false; status: number; error?: string }> {
  const base = getApiBase();
  const token = getToken();
  if (!token) return { ok: false, status: 401 };
  const res = await fetch(`${base}/api/auth/change-password`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) return { ok: false, status: res.status, error: data?.error ?? res.statusText };
  return { ok: true };
}

export async function uploadAvatar(imageDataUrl: string): Promise<
  { ok: true; data: { avatarUrl: string } } | { ok: false; status: number; error?: string; message?: string }> {
  const base = getApiBase();
  const token = getToken();
  if (!token) return { ok: false, status: 401 };
  try {
    const res = await fetch(`${base}/api/auth/avatar`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
      body: JSON.stringify({ image: imageDataUrl }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false, status: res.status, error: data?.error ?? res.statusText, message: data?.message };
    const avatarUrl = typeof data?.avatarUrl === "string" ? data.avatarUrl : undefined;
    if (!avatarUrl) return { ok: false, status: res.status, error: "invalid_response", message: "Server did not return avatar URL." };
    return { ok: true, data: { avatarUrl } };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Network error";
    return { ok: false, status: 0, error: "network", message: msg };
  }
}

export interface ChatMessage {
  id: number;
  accountId: number;
  username: string;
  hasTwitter?: boolean;
  message: string;
  createdAt: string;
}

export async function getChatMessages(
  limit = 100
): Promise<{ ok: true; data: { messages: ChatMessage[] } } | { ok: false; status: number }> {
  const result = await fetchApi<{ messages: ChatMessage[] }>(
    `/api/chat/messages?limit=${Math.min(100, Math.max(1, limit))}`,
    { method: "GET" }
  );
  if (!result.ok) return { ok: false, status: result.status };
  return { ok: true, data: result.data };
}

export async function postChatMessage(
  token: string | null,
  text: string
): Promise<{ ok: true; data: ChatMessage } | { ok: false; status: number; error?: string }> {
  if (!token) return { ok: false, status: 401 };
  const result = await fetchApi<ChatMessage>("/api/chat/messages", {
    method: "POST",
    token,
    body: JSON.stringify({ text: text.trim() }),
  });
  if (!result.ok) return { ok: false, status: result.status, error: result.error };
  return { ok: true, data: result.data };
}

export async function getCharacter(
  token: string | null
): Promise<{ ok: true; data: CharacterApiResponse } | { ok: false; status: number }> {
  if (!token) return { ok: false, status: 401 };
  const result = await fetchApi<CharacterApiResponse>("/api/character", { token });
  if (!result.ok) return { ok: false, status: result.status };
  return { ok: true, data: result.data };
}

// --- Arena ---
export interface ArenaStateResponse {
  canStart: boolean;
  battlesLeft: number;
  maxBattlesPerDay: number;
  winsToday: number;
  resetAt: string; // ISO date, next UTC midnight
  cooldownUntil: string | null;
  /** Present when a persisted run exists (resume after API restart). */
  activeRun?: {
    runId: string;
    playerHp: number;
    playerMaxHp: number;
    currentWave0: number;
    totalWaves: number;
    monsters: { hp: number; maxHp: number; damage: number }[];
  };
}

export interface ArenaStartResponse {
  runId: string;
  character: {
    level: number;
    maxHp: number;
    currentHp: number;
    bowLevel: number;
    moveSpeedLevel: number;
    totalXp: number;
  };
  monsters: { hp: number; maxHp: number; damage: number }[];
  totalWaves: number;
  currentWave0?: number;
  winsToday: number;
  battlesLeft: number;
  maxBattlesPerDay: number;
}

export async function getArenaState(
  token: string | null
): Promise<{ ok: true; data: ArenaStateResponse } | { ok: false; status: number }> {
  if (!token) return { ok: false, status: 401 };
  const result = await fetchApi<ArenaStateResponse>("/api/arena/state", { token });
  if (!result.ok) return { ok: false, status: result.status };
  return { ok: true, data: result.data };
}

/** Heartbeat while in arena (keeps "In Arena" count real-time; call every ~10s). */
export async function postArenaPing(token: string | null): Promise<{ ok: boolean }> {
  if (!token) return { ok: false };
  const result = await fetchApi<{ ok: boolean }>("/api/arena/ping", { token });
  return { ok: result.ok };
}

export async function postArenaStart(
  token: string | null
): Promise<
  | { ok: true; data: ArenaStartResponse }
  | { ok: false; status: number; error?: "cooldown" | "daily_limit"; cooldownUntil?: string }
> {
  if (!token) return { ok: false, status: 401 };
  const result = await fetchApi<
    | {
        ok: true;
        resumed?: boolean;
        runId: string;
        character: ArenaStartResponse["character"];
        monsters: { hp: number; maxHp: number; damage: number }[];
        totalWaves: number;
        currentWave0?: number;
        winsToday: number;
        battlesLeft: number;
        maxBattlesPerDay: number;
      }
    | { error: string; cooldownUntil?: string; winsToday?: number; battlesLeft?: number; maxBattlesPerDay?: number }
  >("/api/arena/start", { method: "POST", token, body: JSON.stringify({}) });
  if (!result.ok) return { ok: false, status: result.status };
  const d = result.data;
  if (d && typeof d === "object" && "character" in d && d.character && "runId" in d) {
    const r = d as {
      runId: string;
      character: ArenaStartResponse["character"];
      monsters: { hp: number; maxHp: number; damage: number }[];
      totalWaves: number;
      currentWave0?: number;
      winsToday: number;
      battlesLeft: number;
      maxBattlesPerDay: number;
    };
    return {
      ok: true,
      data: {
        runId: r.runId,
        character: r.character,
        monsters: r.monsters,
        totalWaves: r.totalWaves,
        currentWave0: r.currentWave0 ?? 0,
        winsToday: r.winsToday,
        battlesLeft: r.battlesLeft,
        maxBattlesPerDay: r.maxBattlesPerDay,
      },
    };
  }
  if (d && typeof d === "object" && "error" in d) {
    return {
      ok: false,
      status: 429,
      error: (d as { error: string }).error as "cooldown" | "daily_limit",
      cooldownUntil: (d as { cooldownUntil?: string }).cooldownUntil,
    };
  }
  return { ok: false, status: 200 };
}

export type ArenaAttackResponse =
  | { ok: true; playerHp: number; monsters: { hp: number; maxHp: number }[] }
  | { ok: true; victory: true; playerHp: number; xpGained: number; character: { level: number; totalXp: number; currentXp: number; xpToNextLevel: number; arenaWinsToday: number } }
  | { ok: true; defeat: true; cooldownUntil?: string | null };

export async function postArenaAttack(
  token: string | null,
  runId: string,
  monsterIndex: number
): Promise<ArenaAttackResponse | { ok: false; status: number }> {
  if (!token) return { ok: false, status: 401 };
  const result = await fetchApi<ArenaAttackResponse>("/api/arena/attack", {
    method: "POST",
    token,
    body: JSON.stringify({ runId, monsterIndex }),
  });
  if (!result.ok) return { ok: false, status: result.status };
  const d = result.data;
  if (d && typeof d === "object" && "ok" in d && d.ok) return d as ArenaAttackResponse;
  return { ok: false, status: 200 };
}

export type ArenaMonsterHitResponse =
  | { ok: true; playerHp: number }
  | { ok: true; defeat: true; cooldownUntil?: string | null };

export async function postArenaMonsterHit(
  token: string | null,
  runId: string,
  monsterIndex: number
): Promise<ArenaMonsterHitResponse | { ok: false; status: number }> {
  if (!token) return { ok: false, status: 401 };
  const result = await fetchApi<ArenaMonsterHitResponse>("/api/arena/monster-hit", {
    method: "POST",
    token,
    body: JSON.stringify({ runId, monsterIndex }),
  });
  if (!result.ok) return { ok: false, status: result.status };
  const d = result.data;
  if (d && typeof d === "object" && "ok" in d && d.ok) return d as ArenaMonsterHitResponse;
  return { ok: false, status: 200 };
}

export async function postArenaNextWave(
  token: string | null,
  runId: string
): Promise<
  | { ok: true; monsters: { hp: number; maxHp: number; damage: number }[] }
  | { ok: false; status: number }
> {
  if (!token) return { ok: false, status: 401 };
  const result = await fetchApi<{ ok: true; monsters: { hp: number; maxHp: number; damage: number }[] }>(
    "/api/arena/next-wave",
    { method: "POST", token, body: JSON.stringify({ runId }) }
  );
  if (!result.ok) return { ok: false, status: result.status };
  const d = result.data;
  if (d && typeof d === "object" && "ok" in d && d.ok && "monsters" in d) return d as { ok: true; monsters: { hp: number; maxHp: number; damage: number }[] };
  return { ok: false, status: 200 };
}

export async function postArenaFinishWin(
  token: string | null
): Promise<
  | { ok: true; data: { xpGained: number; character: { level: number; totalXp: number; currentXp: number; xpToNextLevel: number; arenaWinsToday: number } } }
  | { ok: false; status: number }
> {
  if (!token) return { ok: false, status: 401 };
  const result = await fetchApi<{ ok: true; xpGained: number; character: { level: number; totalXp: number; currentXp: number; xpToNextLevel: number; arenaWinsToday: number } }>(
    "/api/arena/finish-win",
    { method: "POST", token, body: JSON.stringify({}) }
  );
  if (!result.ok) return { ok: false, status: result.status };
  const d = result.data;
  if (d && typeof d === "object" && "ok" in d && d.ok && "character" in d) {
    return { ok: true, data: { xpGained: d.xpGained, character: d.character } };
  }
  return { ok: false, status: 200 };
}

export async function postArenaFinishLoss(
  token: string | null
): Promise<{ ok: true; data: { cooldownUntil: string | null } } | { ok: false; status: number }> {
  if (!token) return { ok: false, status: 401 };
  const result = await fetchApi<{ ok: true; cooldownUntil: string | null }>("/api/arena/finish-loss", {
    method: "POST",
    token,
    body: JSON.stringify({}),
  });
  if (!result.ok) return { ok: false, status: result.status };
  const d = result.data;
  if (d && typeof d === "object" && "ok" in d && d.ok) {
    return { ok: true, data: { cooldownUntil: d.cooldownUntil ?? null } };
  }
  return { ok: false, status: 200 };
}

export async function postArenaClearCooldown(
  token: string | null
): Promise<{ ok: true } | { ok: false; status: number }> {
  if (!token) return { ok: false, status: 401 };
  const result = await fetchApi<{ ok: true }>("/api/arena/clear-cooldown", { method: "POST", token, body: JSON.stringify({}) });
  if (!result.ok) return { ok: false, status: result.status };
  const d = result.data;
  if (d && typeof d === "object" && "ok" in d && d.ok) return { ok: true };
  return { ok: false, status: 200 };
}

// --- PvP Arena ---
export type PvpBattle = { id: string; name: string; stakePfv: number; status: string; participants: number; maxParticipants: number; isCreator?: boolean };
export type PvpCreateBattleError =
  | { ok: false; status: number; error: string }
  | { ok: false; status: number; error: "insufficient_pfv"; required: number; available: number };
export async function postPvpCreateBattle(
  token: string | null,
  name: string,
  stakePfv: number
): Promise<{ ok: true; battle: PvpBattle } | PvpCreateBattleError> {
  if (!token) return { ok: false, status: 401, error: "unauthorized" };
  const result = await fetchApi<{ ok: true; battle: PvpBattle } | { error: string; required?: number; available?: number }>("/api/pvp/battles", {
    method: "POST",
    token,
    body: JSON.stringify({ name, stakePfv }),
  });
  if (!result.ok) {
    const data = result.data as { error?: string; required?: number; available?: number };
    if (data?.error === "insufficient_pfv" && typeof data.required === "number") {
      return { ok: false, status: result.status, error: "insufficient_pfv", required: data.required, available: typeof data.available === "number" ? data.available : 0 };
    }
    return { ok: false, status: result.status, error: data?.error ?? "Failed to create battle" };
  }
  const d = result.data;
  if (d && typeof d === "object" && "ok" in d && d.ok && "battle" in d) return { ok: true, battle: d.battle };
  return { ok: false, status: 200, error: "Invalid response" };
}
export async function getPvpBattles(
  token: string | null,
  mine?: boolean
): Promise<{ ok: true; battles: PvpBattle[] } | { ok: false; status: number }> {
  if (!token) return { ok: false, status: 401 };
  const url = mine ? "/api/pvp/list?mine=1" : "/api/pvp/list";
  const result = await fetchApi<{ ok: true; battles: PvpBattle[] }>(url, { method: "GET", token });
  if (!result.ok) return { ok: false, status: result.status };
  const d = result.data;
  if (d && typeof d === "object" && "battles" in d) return { ok: true, battles: d.battles };
  return { ok: false, status: 200 };
}
export type PvpBattleDetail = PvpBattle & {
  runId?: string;
  myHp?: number;
  opponentHp?: number;
  myMaxHp?: number;
  opponentMaxHp?: number;
  myLevel?: number;
  myBowLevel?: number;
  opponentLevel?: number;
  opponentBowLevel?: number;
  winnerAccountId?: number;
};
export async function getPvpBattle(
  token: string | null,
  battleId: string
): Promise<{ ok: true; battle: PvpBattleDetail } | { ok: false; status: number }> {
  if (!token) return { ok: false, status: 401 };
  const result = await fetchApi<{ ok: true; battle: PvpBattleDetail } & Record<string, unknown>>(`/api/pvp/battles/${battleId}`, { token });
  if (!result.ok) return { ok: false, status: result.status };
  const d = result.data;
  if (d && typeof d === "object" && "battle" in d) {
    const b = d.battle as PvpBattleDetail;
    if (d.runId) b.runId = d.runId as string;
    if (typeof d.myHp === "number") b.myHp = d.myHp;
    if (typeof d.opponentHp === "number") b.opponentHp = d.opponentHp;
    if (typeof d.myMaxHp === "number") b.myMaxHp = d.myMaxHp;
    if (typeof d.opponentMaxHp === "number") b.opponentMaxHp = d.opponentMaxHp;
    if (typeof d.myLevel === "number") b.myLevel = d.myLevel;
    if (typeof d.myBowLevel === "number") b.myBowLevel = d.myBowLevel;
    if (typeof d.opponentLevel === "number") b.opponentLevel = d.opponentLevel;
    if (typeof d.opponentBowLevel === "number") b.opponentBowLevel = d.opponentBowLevel;
    return { ok: true, battle: b };
  }
  return { ok: false, status: 200 };
}
export type PvpEnterResponse = {
  ok: true;
  battleId: string;
  runId: string;
  stakePfv: number;
  myCharacter: { level: number; maxHp: number; currentHp: number; bowLevel: number };
  opponentCharacter: { level: number; maxHp: number; currentHp: number; bowLevel: number };
  myHp: number;
  opponentHp: number;
  myMaxHp: number;
  opponentMaxHp: number;
};
export async function postPvpEnterBattle(
  token: string | null,
  battleId: string
): Promise<PvpEnterResponse | { ok: false; status: number; error?: string }> {
  if (!token) return { ok: false, status: 401 };
  const result = await fetchApi<PvpEnterResponse | { error: string }>(`/api/pvp/battles/${battleId}/enter`, {
    method: "POST",
    token,
    body: JSON.stringify({}),
  });
  if (!result.ok) return { ok: false, status: result.status, error: (result.data as { error?: string })?.error };
  const d = result.data;
  if (d && typeof d === "object" && "ok" in d && d.ok && "runId" in d) return d as PvpEnterResponse;
  return { ok: false, status: 200 };
}
export type PvpAttackResponse =
  | { ok: true; hp1: number; hp2: number }
  | { ok: true; victory: true; winnerAccountId: number; hp1: number; hp2: number };
export async function postPvpAttack(
  token: string | null,
  runId: string
): Promise<PvpAttackResponse | { ok: false; status: number }> {
  if (!token) return { ok: false, status: 401 };
  const result = await fetchApi<PvpAttackResponse>("/api/pvp/attack", {
    method: "POST",
    token,
    body: JSON.stringify({ runId }),
  });
  if (!result.ok) return { ok: false, status: result.status };
  const d = result.data;
  if (d && typeof d === "object" && "ok" in d && d.ok) return d as PvpAttackResponse;
  return { ok: false, status: 200 };
}
export type PvpFacing = "idle" | "down" | "up" | "left" | "right";

export type PvpRunState = {
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
  opponentGridX?: number;
  opponentGridY?: number;
  opponentFacing?: PvpFacing;
};
export async function getPvpRun(
  token: string | null,
  runId: string
): Promise<{ ok: true } & PvpRunState | { ok: false; status: number }> {
  if (!token) return { ok: false, status: 401 };
  const result = await fetchApi<{ ok: true } & PvpRunState>(`/api/pvp/run/${runId}`, { token });
  if (!result.ok) return { ok: false, status: result.status };
  const d = result.data;
  if (d && typeof d === "object" && "ok" in d && d.ok) return d as { ok: true } & PvpRunState;
  return { ok: false, status: 200 };
}

export async function postPvpPosition(
  token: string | null,
  runId: string,
  gridX: number,
  gridY: number,
  facing?: PvpFacing
): Promise<{ ok: true } | { ok: false; status: number }> {
  if (!token) return { ok: false, status: 401 };
  const result = await fetchApi<{ ok: true }>("/api/pvp/run/" + runId + "/position", {
    method: "POST",
    token,
    body: JSON.stringify({ gridX, gridY, facing }),
  });
  if (!result.ok) return { ok: false, status: result.status };
  const d = result.data;
  if (d && typeof d === "object" && "ok" in d && d.ok) return { ok: true };
  return { ok: false, status: 200 };
}

export async function upgradeMoveSpeed(
  token: string | null
): Promise<{ ok: true; data: CharacterApiResponse } | { ok: false; status: number; error?: string }> {
  if (!token) return { ok: false, status: 401 };
  const result = await fetchApi<
    | { success: true; character: CharacterResponse; slots: InventorySlotResponse[] }
    | { success: false; error: string }
  >("/api/character/upgrade-move-speed", {
    method: "POST",
    body: JSON.stringify({}),
    token,
  });
  if (!result.ok) return { ok: false, status: result.status, error: result.error };
  const body = result.data;
  if (body && typeof body === "object" && "success" in body && !body.success && "error" in body) {
    return { ok: false, status: 200, error: String(body.error) };
  }
  if (body && typeof body === "object" && "success" in body && body.success && "character" in body && "slots" in body) {
    return { ok: true, data: { character: body.character, slots: body.slots } };
  }
  return { ok: false, status: 200, error: "Invalid response" };
}

export async function upgradeMiningEfficiency(
  token: string | null
): Promise<{ ok: true; data: CharacterApiResponse } | { ok: false; status: number; error?: string }> {
  if (!token) return { ok: false, status: 401 };
  const result = await fetchApi<
    | { success: true; character: CharacterResponse; slots: InventorySlotResponse[] }
    | { success: false; error: string }
  >("/api/character/upgrade-mining-efficiency", {
    method: "POST",
    body: JSON.stringify({}),
    token,
  });
  if (!result.ok) return { ok: false, status: result.status, error: result.error };
  const body = result.data;
  if (body && typeof body === "object" && "success" in body && !body.success && "error" in body) {
    return { ok: false, status: 200, error: String(body.error) };
  }
  if (body && typeof body === "object" && "success" in body && body.success && "character" in body && "slots" in body) {
    return { ok: true, data: { character: body.character, slots: body.slots } };
  }
  return { ok: false, status: 200, error: "Invalid response" };
}

export async function upgradeBackpackCapacity(
  token: string | null
): Promise<{ ok: true; data: CharacterApiResponse } | { ok: false; status: number; error?: string }> {
  if (!token) return { ok: false, status: 401 };
  const result = await fetchApi<
    | { success: true; character: CharacterResponse; slots: InventorySlotResponse[] }
    | { success: false; error: string }
  >("/api/character/upgrade-backpack-capacity", {
    method: "POST",
    body: JSON.stringify({}),
    token,
  });
  if (!result.ok) return { ok: false, status: result.status, error: result.error };
  const body = result.data;
  if (body && typeof body === "object" && "success" in body && !body.success && "error" in body) {
    return { ok: false, status: 200, error: String(body.error) };
  }
  if (body && typeof body === "object" && "success" in body && body.success && "character" in body && "slots" in body) {
    return { ok: true, data: { character: body.character, slots: body.slots } };
  }
  return { ok: false, status: 200, error: "Invalid response" };
}

export async function upgradeBowAttack(
  token: string | null
): Promise<{ ok: true; data: CharacterApiResponse } | { ok: false; status: number; error?: string }> {
  if (!token) return { ok: false, status: 401 };
  const result = await fetchApi<
    | { success: true; character: CharacterResponse; slots: InventorySlotResponse[] }
    | { success: false; error: string }
  >("/api/character/upgrade-bow-attack", {
    method: "POST",
    body: JSON.stringify({}),
    token,
  });
  if (!result.ok) return { ok: false, status: result.status, error: result.error };
  const body = result.data;
  if (body && typeof body === "object" && "success" in body && !body.success && "error" in body) {
    return { ok: false, status: 200, error: String(body.error) };
  }
  if (body && typeof body === "object" && "success" in body && body.success && "character" in body && "slots" in body) {
    return { ok: true, data: { character: body.character, slots: body.slots } };
  }
  return { ok: false, status: 200, error: "Invalid response" };
}

export async function logout(token: string | null): Promise<void> {
  if (token) {
    await fetchApi("/api/auth/logout", { method: "POST", token });
  }
  clearToken();
}

const GAME_LOCK_NAME = "pixelvalley-game";
const GAME_LOCK_TIMEOUT_MS = 2500;

export async function withGameLock<T>(fn: () => Promise<T>): Promise<T | null> {
  if (typeof navigator === "undefined" || !navigator.locks?.request) {
    return fn();
  }
  try {
    return await navigator.locks.request(
      GAME_LOCK_NAME,
      { signal: AbortSignal.timeout(GAME_LOCK_TIMEOUT_MS) },
      fn
    );
  } catch {
    return null;
  }
}

export interface MiningHitResponse {
  character: CharacterResponse;
  slots: InventorySlotResponse[];
  rockHealthPct: number;
  rockIndex: number;
  drop: { resourceType: "gold" | "silver" | "bronze" | "nothing"; count: number };
}

export interface MiningRocksResponse {
  rocks: { rockIndex: number; healthPct: number }[];
}

export async function getMiningRocks(
  token: string | null,
  mapId: string
): Promise<{ ok: true; data: MiningRocksResponse } | { ok: false; status: number }> {
  if (!token) return { ok: false, status: 401 };
  const result = await fetchApi<MiningRocksResponse>(`/api/mining/rocks?mapId=${encodeURIComponent(mapId)}`, {
    method: "GET",
    token,
  });
  if (!result.ok) return { ok: false, status: result.status };
  return { ok: true, data: result.data };
}

export async function postMiningHit(
  token: string | null,
  mapId: string,
  rockIndex: number
): Promise<
  | { ok: true; data: MiningHitResponse }
  | { ok: false; status: number; error?: string }
> {
  if (!token) return { ok: false, status: 401 };
  const result = await fetchApi<MiningHitResponse>("/api/mining/hit", {
    method: "POST",
    token,
    body: JSON.stringify({ mapId, rockIndex }),
  });
  if (!result.ok) return { ok: false, status: result.status, error: result.error };
  return { ok: true, data: result.data };
}
