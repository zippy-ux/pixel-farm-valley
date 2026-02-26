/**
 * Wallet — WalletConnect (AppKit) only. 500+ Solana wallets.
 * Requires VITE_WALLETCONNECT_PROJECT_ID in .env (get one at https://cloud.reown.com).
 */
import * as wc from "./walletConnect";

export type WalletConnectHandler = () => void;

export const getConnectedWallet = wc.getConnectedWallet;
export const shortAddress = wc.shortAddress;
export const onWalletChange = wc.onWalletChange;
export const refreshWalletStatus = wc.refreshWalletStatus;
export const disconnectWallet = wc.disconnectWallet;

export function openConnectModal(): void {
  wc.openConnectModal();
}

export function getWalletProvider(): { signMessage: (m: Uint8Array) => Promise<Uint8Array | string> } | null {
  return wc.getWalletProvider();
}
