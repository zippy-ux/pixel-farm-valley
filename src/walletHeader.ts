/**
 * Wallet connect button and dropdown in header.
 */
import {
  getConnectedWallet,
  shortAddress,
  onWalletChange,
  refreshWalletStatus,
  disconnectWallet,
  openConnectModal,
} from "./wallet";

let closeDropdownOnClickOutside: (() => void) | null = null;

function doCloseDropdown(): void {
  const dropdown = document.getElementById("ui-wallet-dropdown");
  const btn = document.getElementById("ui-wallet-btn");
  if (dropdown) dropdown.classList.remove("open");
  if (btn) btn.setAttribute("aria-expanded", "false");
}

function removeOutsideListener(): void {
  if (closeDropdownOnClickOutside) {
    const cb = closeDropdownOnClickOutside;
    closeDropdownOnClickOutside = null;
    cb();
  }
}

function closeDropdown(): void {
  doCloseDropdown();
  removeOutsideListener();
}

function updateWalletButton(): void {
  const btn = document.getElementById("ui-wallet-btn");
  if (!btn) return;

  const textSpan = btn.querySelector(".ui-wallet-btn-text") as HTMLElement;
  const arrowSpan = btn.querySelector(".ui-wallet-btn-arrow") as HTMLElement;
  const wallet = getConnectedWallet();
  if (wallet) {
    if (textSpan) textSpan.textContent = shortAddress(wallet);
    if (arrowSpan) arrowSpan.style.display = "";
    btn.setAttribute("aria-expanded", "false");
  } else {
    if (textSpan) textSpan.textContent = "CONNECT";
    if (arrowSpan) arrowSpan.style.display = "none";
  }

  doCloseDropdown();
  removeOutsideListener();
}

export function initWalletHeader(): void {
  if (typeof document === "undefined") return;

  const btn = document.getElementById("ui-wallet-btn");
  const dropdown = document.getElementById("ui-wallet-dropdown");
  if (!btn || !dropdown) return;

  refreshWalletStatus().then(() => updateWalletButton());

  onWalletChange(updateWalletButton);

  btn.addEventListener("click", (e) => {
    e.stopPropagation();
    const wallet = getConnectedWallet();
    if (wallet) {
      const isOpen = dropdown.classList.toggle("open");
      btn.setAttribute("aria-expanded", String(isOpen));
      if (isOpen) {
        const handler = (e: MouseEvent) => {
          if (dropdown.contains(e.target as Node)) return;
          closeDropdown();
        };
        closeDropdownOnClickOutside = () => {
          document.removeEventListener("click", handler);
          closeDropdownOnClickOutside = null;
          doCloseDropdown();
        };
        setTimeout(() => document.addEventListener("click", handler), 0);
      } else {
        closeDropdownOnClickOutside?.();
      }
    } else {
      openConnectModal();
    }
  });

  // Event delegation + mousedown (bypasses overlays that may block "click")
  dropdown.addEventListener("mousedown", (e) => {
    const item = (e.target as HTMLElement).closest("[data-wallet-action]");
    if (!item) return;
    e.preventDefault();
    e.stopPropagation();
    const action = (item as HTMLElement).dataset.walletAction;
    if (action === "copy") {
      const w = getConnectedWallet();
      if (w && navigator.clipboard?.writeText) {
        navigator.clipboard.writeText(w);
        const orig = item.textContent;
        item.textContent = "Copied";
        item.classList.add("ui-wallet-copied");
        setTimeout(() => {
          item.textContent = orig;
          item.classList.remove("ui-wallet-copied");
        }, 2500);
      }
      return;
    }
    closeDropdown();
    if (action === "deposit") {
      import("./depositWindow").then((m) => m.openDepositWindow());
    } else if (action === "claim") {
      import("./claimRequestWindow").then((m) => m.openClaimRequest());
    } else if (action === "disconnect") {
      void disconnectWallet();
    }
  });
}
