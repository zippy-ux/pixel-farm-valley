/**
 * Wallet picker modal — choose Phantom, Solflare, etc. before connecting.
 */
import { connectWalletWithProvider } from "./walletInjected";

export type WalletOption = "phantom" | "solflare";

const WALLET_INFO: { id: WalletOption; name: string }[] = [
  { id: "phantom", name: "Phantom" },
  { id: "solflare", name: "Solflare" },
];

export function isWalletAvailable(id: WalletOption): boolean {
  if (typeof window === "undefined") return false;
  const w = window as unknown as { phantom?: { solana?: unknown }; solflare?: unknown };
  if (id === "phantom") return !!(w?.phantom?.solana && typeof (w.phantom.solana as { connect?: unknown }).connect === "function");
  if (id === "solflare") return !!(w?.solflare && typeof (w.solflare as { connect?: unknown }).connect === "function");
  return false;
}

let overlay: HTMLDivElement | null = null;
let errorEl: HTMLElement | null = null;

function close(): void {
  if (overlay) {
    overlay.classList.add("hidden");
    overlay.setAttribute("aria-hidden", "true");
  }
}

function showError(msg: string): void {
  if (errorEl) {
    errorEl.textContent = msg;
    errorEl.style.display = "block";
  }
}

function hideError(): void {
  if (errorEl) {
    errorEl.textContent = "";
    errorEl.style.display = "none";
  }
}

function createOverlay(): HTMLDivElement {
  const o = document.createElement("div");
  o.className = "wallet-picker-overlay hidden";
  o.setAttribute("aria-modal", "true");
  o.setAttribute("aria-hidden", "true");
  o.setAttribute("role", "dialog");
  o.innerHTML = `
    <div class="wallet-picker-backdrop"></div>
    <div class="wallet-picker-inner">
      <button type="button" class="wallet-picker-close" aria-label="Close">&times;</button>
      <p class="wallet-picker-title">Connect Wallet</p>
      <p class="wallet-picker-sub">Choose your Solana wallet</p>
      <div class="wallet-picker-error" id="wallet-picker-error" style="display:none;"></div>
      <div class="wallet-picker-list">
        ${WALLET_INFO.map(
          (w) => `
          <button type="button" class="wallet-picker-item" data-wallet="${w.id}">
            <span class="wallet-picker-item-name">${w.name}</span>
            ${isWalletAvailable(w.id) ? '<span class="wallet-picker-item-status">Available</span>' : '<span class="wallet-picker-item-status unavailable">Not installed</span>'}
          </button>
        `
        ).join("")}
      </div>
      <p class="wallet-picker-hint">Install Phantom or Solflare browser extension if you don't have one.</p>
    </div>
  `;

  const backdrop = o.querySelector(".wallet-picker-backdrop");
  const closeBtn = o.querySelector(".wallet-picker-close");
  errorEl = o.querySelector("#wallet-picker-error");

  const dismiss = () => {
    close();
    hideError();
  };

  backdrop?.addEventListener("click", dismiss);
  closeBtn?.addEventListener("click", dismiss);

  o.querySelectorAll(".wallet-picker-item").forEach((btn) => {
    btn.addEventListener("click", async (e) => {
      e.stopPropagation();
      const id = (btn as HTMLElement).dataset.wallet as WalletOption | undefined;
      if (!id) return;
      hideError();
      if (!isWalletAvailable(id)) {
        const info = WALLET_INFO.find((w) => w.id === id);
        showError(`${info?.name ?? id} not found. Install the ${info?.name ?? id} browser extension.`);
        return;
      }
      const result = await connectWalletWithProvider(id);
      if (result.ok) {
        dismiss();
      } else {
        showError(result.error);
      }
    });
  });

  return o;
}

export function openWalletPicker(): void {
  if (!overlay) {
    overlay = createOverlay();
    document.body.appendChild(overlay);
  }
  hideError();
  overlay.classList.remove("hidden");
  overlay.setAttribute("aria-hidden", "false");
  // Re-render availability (user might have installed extension)
  const list = overlay.querySelector(".wallet-picker-list");
  if (list) {
    list.innerHTML = WALLET_INFO.map(
      (w) => `
      <button type="button" class="wallet-picker-item" data-wallet="${w.id}">
        <span class="wallet-picker-item-name">${w.name}</span>
        ${isWalletAvailable(w.id) ? '<span class="wallet-picker-item-status">Available</span>' : '<span class="wallet-picker-item-status unavailable">Not installed</span>'}
      </button>
    `
    ).join("");
    list.querySelectorAll(".wallet-picker-item").forEach((btn) => {
      btn.addEventListener("click", async (e) => {
        e.stopPropagation();
        const id = (btn as HTMLElement).dataset.wallet as WalletOption | undefined;
        if (!id) return;
        hideError();
        if (!isWalletAvailable(id)) {
          const info = WALLET_INFO.find((w) => w.id === id);
          showError(`${info?.name ?? id} not found. Install the ${info?.name ?? id} browser extension.`);
          return;
        }
        const result = await connectWalletWithProvider(id);
        if (result.ok) {
          close();
          hideError();
        } else {
          showError(result.error);
        }
      });
    });
  }
}
