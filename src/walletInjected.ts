/**
 * Injected provider (Phantom, Solflare) — fallback when WalletConnect not configured.
 */
import { getToken } from "./api";
import {
  getWalletConnectMessage,
  postWalletConnect,
  postWalletDisconnect,
  getWalletStatus,
} from "./api";
import { openWalletPicker as showWalletPicker } from "./walletPicker";

export type WalletConnectHandler = () => void;
export type WalletOption = "phantom" | "solflare";

interface WalletProvider {
  connect: () => Promise<{ publicKey: { toBase58: () => string } }>;
  signMessage?: (message: Uint8Array, display?: string) => Promise<{ signature: Uint8Array | string }>;
  disconnect?: () => Promise<void>;
}

let connectedPubkey: string | null = null;
const listeners: Set<WalletConnectHandler> = new Set();

function notifyListeners(): void {
  listeners.forEach((cb) => cb());
}

function getProvider(id?: WalletOption): WalletProvider | null {
  const w = typeof window !== "undefined" ? (window as unknown as { phantom?: { solana?: unknown }; solflare?: unknown }) : undefined;
  if (id === "phantom" || !id) {
    if (w?.phantom?.solana && typeof (w.phantom.solana as { connect?: unknown }).connect === "function") {
      return w.phantom.solana as WalletProvider;
    }
  }
  if (id === "solflare" || !id) {
    if (w?.solflare && typeof (w.solflare as { connect?: unknown }).connect === "function") {
      return w.solflare as WalletProvider;
    }
  }
  return null;
}

export function getConnectedWallet(): string | null {
  return connectedPubkey;
}

export function shortAddress(addr: string): string {
  if (addr.length <= 10) return addr;
  return addr.slice(0, 4) + "…" + addr.slice(-4);
}

export function onWalletChange(cb: WalletConnectHandler): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

export async function refreshWalletStatus(): Promise<string | null> {
  const token = getToken();
  if (!token) {
    connectedPubkey = null;
    notifyListeners();
    return null;
  }
  const res = await getWalletStatus(token);
  if (res.ok && res.data.walletPubkey) {
    connectedPubkey = res.data.walletPubkey;
  } else {
    connectedPubkey = null;
  }
  notifyListeners();
  return connectedPubkey;
}

export async function connectWalletWithProvider(id: WalletOption): Promise<{ ok: true } | { ok: false; error: string }> {
  const provider = getProvider(id);
  if (!provider) {
    const name = id === "phantom" ? "Phantom" : "Solflare";
    return { ok: false, error: `${name} not found. Install the ${name} browser extension.` };
  }
  const token = getToken();
  if (!token) return { ok: false, error: "Please log in first." };
  const signMessage = provider.signMessage;
  if (typeof signMessage !== "function") {
    return { ok: false, error: "Wallet does not support message signing." };
  }
  try {
    const connectResult = await provider.connect();
    const publicKey = connectResult.publicKey;
    const pubkeyB58 = typeof publicKey.toBase58 === "function" ? publicKey.toBase58() : String(publicKey);
    const msgRes = await getWalletConnectMessage(token);
    if (!msgRes.ok) return { ok: false, error: msgRes.error ?? "Failed to get message" };
    const message = msgRes.data.message;
    const messageBytes = new TextEncoder().encode(message);
    const signResult = await signMessage.call(provider, messageBytes);
    const signature = signResult?.signature;
    if (signature == null) return { ok: false, error: "Wallet did not return a signature." };
    const bs58 = await import("bs58");
    const signatureB58 = typeof signature === "string" ? signature : bs58.default.encode(signature as Uint8Array);
    const connectRes = await postWalletConnect(token, { publicKey: pubkeyB58, message, signature: signatureB58 });
    if (!connectRes.ok) return { ok: false, error: connectRes.error ?? "Verification failed" };
    connectedPubkey = pubkeyB58;
    notifyListeners();
    return { ok: true };
  } catch (e) {
    const err = e instanceof Error ? e.message : String(e);
    if (err.includes("User rejected") || err.includes("User refused") || err.includes("User denied")) {
      return { ok: false, error: "Connection cancelled" };
    }
    return { ok: false, error: err || "Connection failed" };
  }
}

export function openWalletPicker(): void {
  showWalletPicker();
}

export async function disconnectWallet(): Promise<void> {
  const token = getToken();
  if (token) await postWalletDisconnect(token);
  const provider = getProvider();
  if (provider?.disconnect) {
    try {
      await provider.disconnect();
    } catch {
      /* ignore */
    }
  }
  connectedPubkey = null;
  notifyListeners();
}
