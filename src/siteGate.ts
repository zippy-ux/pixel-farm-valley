/**
 * Site gate — password screen before the game login.
 * Temporary: remove before launch.
 * Password: VITE_SITE_GATE_PASSWORD in build env, or default below.
 */

const GATE_STORAGE_KEY = "pixelvalley_site_gate";
const DEFAULT_GATE_PASSWORD = "pixelvalley";

function getGatePassword(): string {
  if (typeof import.meta !== "undefined" && import.meta.env?.VITE_SITE_GATE_PASSWORD) {
    const v = (import.meta.env.VITE_SITE_GATE_PASSWORD as string).trim();
    if (v.length > 0) return v;
  }
  return DEFAULT_GATE_PASSWORD;
}

export function isGatePassed(): boolean {
  if (typeof sessionStorage === "undefined") return true;
  return sessionStorage.getItem(GATE_STORAGE_KEY) === "1";
}

/** Gate disabled for launch; set to true to require password again. */
export function isGateRequired(): boolean {
  return false;
}

let overlay: HTMLDivElement | null = null;

function getOrCreateOverlay(): HTMLDivElement {
  if (overlay) return overlay;
  const wrap = document.createElement("div");
  wrap.className = "login-overlay site-gate-overlay";
  wrap.setAttribute("aria-label", "Site access");
  wrap.innerHTML = `
    <div class="login-box site-gate-box" role="dialog">
      <h1 class="login-title">PIXEL FARM VALLEY</h1>
      <p class="login-subtitle">Enter password to continue</p>
      <form class="login-form" id="site-gate-form">
        <label class="login-label" for="site-gate-password">Password</label>
        <input type="password" class="login-input" id="site-gate-password" name="password" placeholder="Password" autocomplete="off" />
        <div class="login-error" id="site-gate-error" aria-live="polite"></div>
        <button type="submit" class="login-btn" id="site-gate-submit">Enter</button>
      </form>
    </div>
  `;
  overlay = wrap;

  const form = wrap.querySelector("#site-gate-form") as HTMLFormElement;
  const passwordInput = wrap.querySelector("#site-gate-password") as HTMLInputElement;
  const errorEl = wrap.querySelector("#site-gate-error") as HTMLElement;
  const submitBtn = wrap.querySelector("#site-gate-submit") as HTMLButtonElement;

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const password = passwordInput.value.trim();
    const expected = getGatePassword();
    if (!password) {
      errorEl.textContent = "Enter password";
      return;
    }
    errorEl.textContent = "";
    submitBtn.disabled = true;
    if (password !== expected) {
      errorEl.textContent = "Wrong password";
      submitBtn.disabled = false;
      return;
    }
    if (typeof sessionStorage !== "undefined") {
      sessionStorage.setItem(GATE_STORAGE_KEY, "1");
    }
    wrap.classList.add("hidden");
    const cb = (wrap as unknown as { _onPass?: () => void })._onPass;
    cb?.();
    submitBtn.disabled = false;
  });

  return wrap;
}

export function showSiteGate(onPass: () => void): void {
  if (typeof document === "undefined") return;
  const wrap = getOrCreateOverlay();
  (wrap as unknown as { _onPass?: () => void })._onPass = onPass;
  wrap.classList.remove("hidden");
  const parent = document.querySelector(".ui-scale-wrapper") ?? document.body;
  if (!wrap.parentNode) parent.appendChild(wrap);
  const input = wrap.querySelector("#site-gate-password") as HTMLInputElement;
  if (input) {
    input.value = "";
    input.focus();
  }
  const err = wrap.querySelector("#site-gate-error") as HTMLElement;
  if (err) err.textContent = "";
}
