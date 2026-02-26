/**
 * WalletConnect (Reown AppKit) integration — connect to 500+ Solana wallets.
 */
declare const __FAVICON_DATA_URL__: string | undefined;

import { createAppKit } from "@reown/appkit";
import { SolanaAdapter } from "@reown/appkit-adapter-solana";
import { solana, solanaDevnet, solanaTestnet } from "@reown/appkit/networks";
import { getToken } from "./api";
import {
  getWalletConnectMessage,
  postWalletConnect,
  postWalletDisconnect,
  getWalletStatus,
} from "./api";

const PROJECT_ID = import.meta.env.VITE_WALLETCONNECT_PROJECT_ID as string | undefined;

export type WalletConnectHandler = () => void;

let connectedPubkey: string | null = null;
let listeners: Set<WalletConnectHandler> = new Set();

function notifyListeners(): void {
  listeners.forEach((cb) => cb());
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

export function isWalletConnectAvailable(): boolean {
  return !!PROJECT_ID && typeof PROJECT_ID === "string" && PROJECT_ID.length > 10;
}

let appKit: ReturnType<typeof createAppKit> | null = null;
let verificationPending = false;

async function verifyAndLinkWallet(address: string): Promise<boolean> {
  if (verificationPending) return false;
  verificationPending = true;
  const token = getToken();
  if (!token) {
    appKit?.showErrorMessage?.("Please log in first");
    verificationPending = false;
    return false;
  }
  try {
    let provider = appKit?.getWalletProvider() as { signMessage?: (m: Uint8Array) => Promise<Uint8Array | string> } | null;
    for (let i = 0; i < 5 && !provider?.signMessage; i++) {
      await new Promise((r) => setTimeout(r, 300));
      provider = appKit?.getWalletProvider() as typeof provider;
    }
    if (!provider?.signMessage) {
      appKit?.showErrorMessage?.("Wallet does not support message signing");
      verificationPending = false;
      return false;
    }
    const msgRes = await getWalletConnectMessage(token);
    if (!msgRes.ok) {
      const err = msgRes.error ?? "Failed to get message";
      console.error("[WalletConnect] getMessage failed:", err);
      appKit?.showErrorMessage?.(err);
      verificationPending = false;
      return false;
    }
    const message = msgRes.data.message;
    const messageBytes = new TextEncoder().encode(message);
    const rawSig = await provider.signMessage(messageBytes);
    const signature =
      rawSig && typeof rawSig === "object" && "signature" in rawSig ? (rawSig as { signature: Uint8Array }).signature : rawSig;
    if (signature == null || (typeof signature !== "string" && !(signature instanceof Uint8Array))) {
      appKit?.showErrorMessage?.("Invalid signature from wallet");
      verificationPending = false;
      return false;
    }
    const bs58 = await import("bs58");
    const signatureB58 =
      typeof signature === "string" ? signature : bs58.default.encode(signature);
    const connectRes = await postWalletConnect(token, {
      publicKey: address,
      message,
      signature: signatureB58,
    });
    if (!connectRes.ok) {
      const err = connectRes.error ?? "Verification failed";
      console.error("[WalletConnect] postConnect failed:", err);
      appKit?.showErrorMessage?.(err);
      await appKit?.disconnect?.("solana");
      verificationPending = false;
      return false;
    }
    connectedPubkey = address;
    notifyListeners();
    appKit?.showSuccessMessage?.("Wallet connected");
    await appKit?.close?.();
    return true;
  } catch (e) {
    const err = e instanceof Error ? e.message : String(e);
    if (!err.includes("User rejected") && !err.includes("User refused") && !err.includes("User denied")) {
      appKit?.showErrorMessage?.(err || "Connection failed");
    }
    await appKit?.disconnect?.("solana");
    return false;
  } finally {
    verificationPending = false;
  }
}

function initAppKit(): void {
  if (appKit) return;
  if (!PROJECT_ID || PROJECT_ID.length < 10) {
    console.warn("[WalletConnect] VITE_WALLETCONNECT_PROJECT_ID not set. Get one at https://cloud.reown.com");
    return;
  }
  const adapter = new SolanaAdapter();
  appKit = createAppKit({
    adapters: [adapter],
    networks: [solana, solanaTestnet, solanaDevnet],
    enableReconnect: false, // Disconnect must clear session; no auto-restore on reload/Connect
    metadata: {
      name: "Pixel Farm Valley",
      description: "Play-to-Earn economy built on Solana",
      url: typeof window !== "undefined" ? window.location.origin : "https://pixelvalley.farm",
      // Base64 data URL so Phantom (strict CSP) can show the icon; fallback to URL
      icons: [(typeof __FAVICON_DATA_URL__ !== "undefined" && __FAVICON_DATA_URL__) || (typeof window !== "undefined" ? window.location.origin : "https://pixelvalley.farm") + "/favicon.png"],
    },
    projectId: PROJECT_ID,
    features: {
      analytics: false,
      email: false,
      socials: [],
    },
  });
  appKit.subscribeAccount((account) => {
    if (account?.isConnected && account?.address) {
      let addr = String(account.address);
      if (addr.startsWith("solana:")) addr = addr.slice(7);
      if (addr && addr !== connectedPubkey) {
        verifyAndLinkWallet(addr);
      }
    } else if (!account?.isConnected) {
      if (connectedPubkey) {
        connectedPubkey = null;
        notifyListeners();
      }
    }
  }, "solana");
}

/** Load wallet status from API (e.g. on app init). */
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

export function openConnectModal(): void {
  initAppKit();
  if (appKit) {
    appKit.open();
  } else {
    alert("WalletConnect not configured. Set VITE_WALLETCONNECT_PROJECT_ID in .env");
  }
}

export async function disconnectWallet(): Promise<boolean> {
  const token = getToken();
  if (token) {
    const res = await postWalletDisconnect(token);
    if (!res.ok) {
      console.error("[WalletConnect] disconnect API failed:", res.status, res.error);
      appKit?.showErrorMessage?.(res.error ?? `Disconnect failed (${res.status})`);
      return false;
    }
  }
  if (appKit) {
    await appKit.disconnect("solana");
  }
  connectedPubkey = null;
  notifyListeners();
  return true;
}

/** Get the wallet provider for signing transactions (e.g. deposit). May be null if not connected. */
export function getWalletProvider(): { signMessage: (m: Uint8Array) => Promise<Uint8Array | string> } | null {
  const p = appKit?.getWalletProvider() as { signMessage?: (m: Uint8Array) => Promise<Uint8Array | string> } | null;
  return p?.signMessage ? p : null;
}
