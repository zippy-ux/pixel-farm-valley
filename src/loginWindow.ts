/**
 * Login overlay — landing-style main screen (title, LAUNCH GAME, DOCS, SOCIALS, social icons).
 * On LAUNCH GAME: redirect to Twitter login. On success: close overlay, callback.
 */

import { setToken, getToken, getCharacter, getMe, getTwitterLoginUrl, getCaptchaSiteKey, getSignupVisit, getRegistrationIntent, getLoginVisit, postLogin, postRegister, postSendEmailCode, postVerifyEmail, STORAGE_KEY } from "./api";
import { getFingerprint } from "./fingerprint";
import { setActionsLogAccountId, initActionsLog } from "./actionsLog";
import { applyCharacterData } from "./gameState";
import { syncHeader } from "./uiHeader";
import "./loginWindow.css";
import landingBgUrl from "./assets/landing/landing-bg.png";
import logoUrl from "./assets/landing/logo.png";
import launchBtnUrl from "./assets/landing/launch.png";
import iconXbUrl from "./assets/landing/xb.png";
import iconTgUrl from "./assets/landing/tg.png";
import iconGitUrl from "./assets/landing/git.png";

const GITBOOK_URL = "https://pixel-farm-valley.gitbook.io/pixel-farm-docs";
const TWITTER_URL = "https://x.com/pixelfarmvalley";
const TELEGRAM_URL = "https://t.me/pixelfarmvalley";

const TURNSTILE_SCRIPT_URL = "https://challenges.cloudflare.com/turnstile/v0/api.js";

let overlay: HTMLDivElement | null = null;
let onLoggedInCallback: (() => void) | null = null;

/** One-time token for POST /auth/register; set when register form is shown (incl. /signup page). */
let registrationIntentToken: string | null = null;
/** Dynamic honeypot field name (changes per intent). */
let registrationIntentHoneypotField: string | null = null;
/** When opening /signup we request intent immediately; on submit we can wait for this to finish. */
let registrationIntentPromise: Promise<
  { ok: true; intentToken: string; honeypotField: string } | { ok: false; status: number; error?: string }
> | null = null;

let turnstileSiteKey = "";
let turnstileScriptLoaded = false;
let turnstileWidgetId: string | null = null;
let turnstilePendingResolve: ((token: string) => void) | null = null;
/** For visible widget: token from callback when user completes the challenge. */
let lastTurnstileToken: string | null = null;

function loadTurnstileScript(): Promise<void> {
  if (typeof document === "undefined") return Promise.resolve();
  if (turnstileScriptLoaded) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = TURNSTILE_SCRIPT_URL;
    script.async = true;
    script.onload = () => {
      turnstileScriptLoaded = true;
      resolve();
    };
    script.onerror = () => reject(new Error("Turnstile script failed"));
    document.head.appendChild(script);
  });
}

function ensureTurnstileWidget(container: HTMLElement): void {
  if (!turnstileSiteKey) return;
  const win = typeof window !== "undefined" ? (window as unknown as { turnstile?: { render: (el: HTMLElement, opts: { sitekey: string; callback: (t: string) => void; size: string }) => string; execute: (id: string) => void; reset: (id: string) => void } }) : null;
  if (!win?.turnstile) return;
  if (!turnstileWidgetId && container) {
    container.classList.add("has-widget");
    turnstileWidgetId = win.turnstile.render(container, {
      sitekey: turnstileSiteKey,
      size: "normal",
      callback: (token: string) => {
        lastTurnstileToken = token;
        if (turnstilePendingResolve) {
          turnstilePendingResolve(token);
          turnstilePendingResolve = null;
        }
      },
    });
  }
}

function resetTurnstileWidget(): void {
  const win = typeof window !== "undefined" ? (window as unknown as { turnstile?: { reset: (id: string) => void } }) : null;
  if (win?.turnstile && turnstileWidgetId) win.turnstile.reset(turnstileWidgetId);
}

function getTurnstileToken(container: HTMLElement): Promise<string | null> {
  if (!turnstileSiteKey) return Promise.resolve(null);
  return loadTurnstileScript()
    .then(() => {
      ensureTurnstileWidget(container);
      const token = lastTurnstileToken;
      lastTurnstileToken = null;
      if (token) resetTurnstileWidget();
      return token;
    })
    .catch(() => null);
}

function getOrCreateOverlay(): HTMLDivElement {
  if (overlay) return overlay;
  const wrap = document.createElement("div");
  wrap.className = "login-overlay landing-overlay";
  wrap.setAttribute("aria-label", "Login");
  wrap.innerHTML = `
    <div class="landing-bg" role="presentation">
      <img alt="" class="landing-bg-img" />
    </div>
    <div class="landing-content">
      <div class="landing-content-inner">
        <div class="landing-center-wrap">
          <div class="landing-center">
          <div class="landing-logo">
            <img src="${logoUrl}" alt="Pixel Farm Valley" class="landing-logo-img" />
          </div>
          <p class="landing-subtitle"><span class="landing-subtitle-line1">Cultivate</span> <span class="landing-subtitle-line2">Your Pixel World</span></p>
          <div class="landing-buttons">
            <button type="button" class="landing-btn-img landing-launch-btn" id="login-launch-btn" aria-label="Launch game"><img src="${launchBtnUrl}" alt="Launch game" class="landing-btn-img-src" /></button>
          </div>
          <div class="landing-socials">
            <a href="${TWITTER_URL}" class="landing-social-img" target="_blank" rel="noopener noreferrer" aria-label="X (Twitter)"><img src="${iconXbUrl}" alt="" class="landing-social-img-src" /></a>
            <a href="${TELEGRAM_URL}" class="landing-social-img" target="_blank" rel="noopener noreferrer" aria-label="Telegram"><img src="${iconTgUrl}" alt="" class="landing-social-img-src" /></a>
            <a href="${GITBOOK_URL}" class="landing-social-img" target="_blank" rel="noopener noreferrer" aria-label="GitBook"><img src="${iconGitUrl}" alt="" class="landing-social-img-src" /></a>
          </div>
        </div>
        </div>
        <p class="landing-copyright">© 2026 Pixel Farm Valley</p>
      </div>
    </div>
    <div class="landing-auth-modal hidden" id="login-auth-modal" aria-hidden="true">
      <div class="landing-auth-modal-backdrop" id="login-auth-modal-backdrop"></div>
      <div class="landing-auth-modal-inner">
        <button type="button" class="landing-auth-modal-close" id="login-auth-modal-close" aria-label="Close">&times;</button>
        <div class="landing-auth-view landing-auth-view-choose" id="login-auth-view-choose">
          <p class="landing-auth-modal-text">Sign in to enter the game</p>
          <div class="landing-auth-error landing-auth-error-top" id="login-auth-choose-error" aria-live="polite" style="display:none;"></div>
          <button type="button" class="landing-btn-x" id="login-connectx-btn" aria-label="Log in with X">LOG IN WITH X</button>
          <button type="button" class="landing-btn-green" id="login-password-btn">LOG IN</button>
          <p class="landing-auth-create-text" id="login-create-account-link">Create account</p>
        </div>
        <div class="landing-auth-view landing-auth-view-login hidden" id="login-auth-view-login">
          <p class="landing-auth-modal-text">Log In</p>
          <form class="landing-auth-form landing-auth-form-centered" id="login-form">
            <input type="text" class="landing-auth-input" id="login-username" placeholder="Username" autocomplete="username" />
            <input type="password" class="landing-auth-input" id="login-password" placeholder="Password" autocomplete="current-password" />
            <input type="text" class="landing-auth-hp" id="login-website" name="website" tabindex="-1" autocomplete="off" aria-hidden="true" />
            <div class="landing-auth-error" id="login-form-error" aria-live="polite"></div>
            <div class="landing-auth-form-actions"><button type="submit" class="landing-btn-green" id="login-form-submit">LOG IN</button></div>
          </form>
          <div class="landing-auth-switch">
            <p class="landing-auth-switch-text">Don't have an account?</p>
            <button type="button" class="landing-auth-link" id="login-show-register">Create account</button>
          </div>
        </div>
        <div class="landing-auth-view landing-auth-view-register hidden" id="login-auth-view-register">
          <p class="landing-auth-modal-text">Create account</p>
          <form class="landing-auth-form landing-auth-form-centered" id="register-form">
            <input type="text" class="landing-auth-input" id="register-nick" placeholder="Nick" autocomplete="nickname" />
            <input type="text" class="landing-auth-input" id="register-username" placeholder="Username" autocomplete="username" />
            <input type="password" class="landing-auth-input" id="register-password" placeholder="Password" autocomplete="new-password" />
            <input type="password" class="landing-auth-input" id="register-repeat" placeholder="Repeat password" autocomplete="new-password" />
            <input type="text" class="landing-auth-hp" id="register-honeypot" tabindex="-1" autocomplete="off" aria-hidden="true" />
            <div class="landing-auth-error" id="register-form-error" aria-live="polite"></div>
            <div class="landing-auth-form-actions"><button type="submit" class="landing-btn-green" id="register-form-submit">CREATE ACCOUNT</button></div>
          </form>
          <div class="landing-auth-switch">
            <p class="landing-auth-switch-text">Already have an account?</p>
            <button type="button" class="landing-auth-link" id="register-show-login">Log In</button>
          </div>
        </div>
        <div class="landing-auth-view landing-auth-view-verify-email hidden" id="login-auth-view-verify-email">
          <p class="landing-auth-modal-text">Verify your email to play</p>
          <p class="landing-auth-modal-sub">Enter your email and we’ll send you a code.</p>
          <input type="email" class="landing-auth-input" id="verify-email-input" placeholder="Email" autocomplete="email" />
          <button type="button" class="landing-btn-outline" id="verify-send-code-btn">Send code</button>
          <input type="text" class="landing-auth-input" id="verify-code-input" placeholder="Verification code" autocomplete="one-time-code" maxlength="6" />
          <div class="landing-auth-error" id="verify-email-error" aria-live="polite"></div>
          <div class="landing-auth-form-actions"><button type="button" class="landing-btn-green" id="verify-email-submit">Verify and play</button></div>
        </div>
        <div id="auth-turnstile-container" class="landing-turnstile-container" aria-hidden="true"></div>
        <div class="landing-auth-view landing-auth-view-blocked hidden" id="login-auth-view-blocked">
          <p class="landing-auth-modal-text">Account blocked</p>
          <p class="landing-auth-blocked-reason" id="login-auth-blocked-reason"></p>
          <button type="button" class="landing-btn-green" id="login-auth-blocked-ok">OK</button>
        </div>
      </div>
    </div>
  `;
  const bgImg = wrap.querySelector(".landing-bg-img") as HTMLImageElement;
  const mobileBgPath = "/assets/landing/bg-mob.png";
  function setLandingBg() {
    if (!bgImg) return;
    const isMobile = window.matchMedia("(max-width: 768px)").matches;
    bgImg.src = isMobile ? mobileBgPath : landingBgUrl;
  }
  if (bgImg) {
    bgImg.onerror = () => {
      if (bgImg.src === mobileBgPath || bgImg.src.endsWith("bg-mob.png")) bgImg.src = landingBgUrl;
    };
  }
  setLandingBg();
  window.addEventListener("resize", setLandingBg);
  overlay = wrap;

  const launchBtn = wrap.querySelector("#login-launch-btn") as HTMLButtonElement;
  const authModal = wrap.querySelector("#login-auth-modal") as HTMLDivElement;
  const authModalBackdrop = wrap.querySelector("#login-auth-modal-backdrop") as HTMLDivElement;
  const authModalClose = wrap.querySelector("#login-auth-modal-close") as HTMLButtonElement;
  const connectxBtn = wrap.querySelector("#login-connectx-btn") as HTMLButtonElement;
  const viewChoose = wrap.querySelector("#login-auth-view-choose") as HTMLElement;
  const viewLogin = wrap.querySelector("#login-auth-view-login") as HTMLElement;
  const viewRegister = wrap.querySelector("#login-auth-view-register") as HTMLElement;
  const loginForm = wrap.querySelector("#login-form") as HTMLFormElement;
  const registerForm = wrap.querySelector("#register-form") as HTMLFormElement;

  function closeAuthModal(): void {
    if (authModal) {
      authModal.classList.add("hidden");
      authModal.setAttribute("aria-hidden", "true");
    }
  }

  const viewBlocked = wrap.querySelector("#login-auth-view-blocked") as HTMLElement;
  const viewVerifyEmail = wrap.querySelector("#login-auth-view-verify-email") as HTMLElement;
  const chooseErrorEl = wrap.querySelector("#login-auth-choose-error") as HTMLElement;

  function showAuthView(view: "choose" | "login" | "register" | "blocked" | "verifyEmail"): void {
    [viewChoose, viewLogin, viewRegister, viewBlocked, viewVerifyEmail].forEach((el) => el?.classList.add("hidden"));
    const target =
      view === "choose"
        ? viewChoose
        : view === "login"
          ? viewLogin
          : view === "register"
            ? viewRegister
            : view === "blocked"
              ? viewBlocked
              : viewVerifyEmail;
    target?.classList.remove("hidden");
    if (chooseErrorEl && view !== "choose") chooseErrorEl.style.display = "none";
    const turnstileContainer = wrap.querySelector("#auth-turnstile-container") as HTMLElement;
    if (turnstileContainer) {
      turnstileContainer.setAttribute("aria-hidden", view === "login" || view === "register" ? "false" : "true");
      if ((view === "login" || view === "register") && turnstileSiteKey) {
        loadTurnstileScript().then(() => ensureTurnstileWidget(turnstileContainer));
      }
    }
    if (view === "login") {
      getLoginVisit();
    }
    if (view === "register") {
      registrationIntentPromise = getSignupVisit().then((sv) => (sv.ok ? getRegistrationIntent() : sv));
      registrationIntentPromise.then((r) => {
        if (r.ok) {
          registrationIntentToken = r.intentToken;
          registrationIntentHoneypotField = r.honeypotField;
          const hpInput = wrap.querySelector("#register-honeypot") as HTMLInputElement;
          if (hpInput) hpInput.name = r.honeypotField;
        }
      });
    }
    if (view === "verifyEmail") {
      (wrap.querySelector("#verify-email-error") as HTMLElement)?.setAttribute("aria-live", "polite");
    }
  }

  function showChooseError(message: string): void {
    if (chooseErrorEl) {
      chooseErrorEl.textContent = message;
      chooseErrorEl.style.display = "block";
    }
  }

  function onAuthSuccess(): void {
    closeAuthModal();
    const preloader = document.getElementById("game-preloader");
    if (preloader) preloader.classList.remove("hidden");
    closeLoginOverlay();
    const LAUNCH_PRELOADER_MS = 1000;
    setTimeout(() => onLoggedInCallback?.(), LAUNCH_PRELOADER_MS);
  }

  const LAUNCH_PRELOADER_MS = 1000;

  if (launchBtn) {
    launchBtn.addEventListener("click", async (e) => {
      e.preventDefault();
      const token = getToken();
      if (token) {
        const meRes = await getMe(token);
        if (meRes.ok && meRes.data.needsEmailVerification) {
          if (authModal) {
            authModal.classList.remove("hidden");
            authModal.setAttribute("aria-hidden", "false");
            showAuthView("verifyEmail");
          }
          return;
        }
        const preloader = document.getElementById("game-preloader");
        if (preloader) preloader.classList.remove("hidden");
        closeLoginOverlay();
        setTimeout(() => onLoggedInCallback?.(), LAUNCH_PRELOADER_MS);
      } else {
        if (authModal) {
          authModal.classList.remove("hidden");
          authModal.setAttribute("aria-hidden", "false");
          showAuthView("choose");
          if (!turnstileSiteKey) getCaptchaSiteKey().then((k) => { turnstileSiteKey = k; });
        }
      }
    });
  }
  if (connectxBtn) {
    connectxBtn.addEventListener("click", (e) => {
      e.preventDefault();
      window.location.href = getTwitterLoginUrl();
    });
  }
  wrap.querySelector("#login-password-btn")?.addEventListener("click", (e) => {
    e.preventDefault();
    if (chooseErrorEl) chooseErrorEl.style.display = "none";
    window.location.href = "/login";
  });
  wrap.querySelector("#login-create-account-link")?.addEventListener("click", (e) => {
    e.preventDefault();
    window.location.href = "/signup";
  });
  wrap.querySelector("#login-show-register")?.addEventListener("click", (e) => {
    e.preventDefault();
    window.location.href = "/signup";
  });
  wrap.querySelector("#register-show-login")?.addEventListener("click", (e) => {
    e.preventDefault();
    window.location.href = "/login";
  });
  wrap.querySelector("#login-auth-blocked-ok")?.addEventListener("click", () => {
    showAuthView("choose");
  });

  if (loginForm) {
    loginForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const username = (wrap.querySelector("#login-username") as HTMLInputElement)?.value?.trim() ?? "";
      const password = (wrap.querySelector("#login-password") as HTMLInputElement)?.value ?? "";
      const errEl = wrap.querySelector("#login-form-error") as HTMLElement;
      const submitBtn = wrap.querySelector("#login-form-submit") as HTMLButtonElement;
      if (errEl) errEl.textContent = "";
      if ((wrap.querySelector("#login-website") as HTMLInputElement)?.value?.trim()) return;
      if (!username || !password) {
        if (errEl) errEl.textContent = "Enter username and password";
        return;
      }
      if (submitBtn) submitBtn.disabled = true;
      const turnstileContainer = wrap.querySelector("#auth-turnstile-container") as HTMLElement;
      const turnstileToken = turnstileContainer ? await getTurnstileToken(turnstileContainer) : null;
      if (!turnstileToken && turnstileSiteKey && errEl) {
        errEl.textContent = "Please complete the verification above.";
        if (submitBtn) submitBtn.disabled = false;
        return;
      }
      const lvRes = await getLoginVisit();
      if (!lvRes.ok && errEl) {
        errEl.textContent = lvRes.error === "visit_login_first" ? "Please refresh the page and try again." : (lvRes.error ?? "Could not load form.");
        if (submitBtn) submitBtn.disabled = false;
        return;
      }
      const res = await postLogin({ username, password, turnstileToken: turnstileToken ?? undefined });
      if (submitBtn) submitBtn.disabled = false;
      if (!res.ok) {
        if (res.status === 403 && res.error === "account_blocked") {
          const reasonEl = wrap.querySelector("#login-auth-blocked-reason") as HTMLElement;
          if (reasonEl) reasonEl.textContent = res.reason ?? "";
          showAuthView("blocked");
          return;
        }
        if (errEl) errEl.textContent = res.error === "captcha_failed" ? "Verification failed. Try again." : res.error === "visit_login_first" ? "Please refresh the page and try again." : (res.error ?? "Login failed");
        return;
      }
      setToken(res.data.token);
      onAuthSuccess();
    });
  }
  if (registerForm) {
    registerForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const nick = (wrap.querySelector("#register-nick") as HTMLInputElement)?.value?.trim() ?? "";
      const username = (wrap.querySelector("#register-username") as HTMLInputElement)?.value?.trim() ?? "";
      const password = (wrap.querySelector("#register-password") as HTMLInputElement)?.value ?? "";
      const repeat = (wrap.querySelector("#register-repeat") as HTMLInputElement)?.value ?? "";
      const errEl = wrap.querySelector("#register-form-error") as HTMLElement;
      const submitBtn = wrap.querySelector("#register-form-submit") as HTMLButtonElement;
      if (errEl) errEl.textContent = "";
      if ((wrap.querySelector("#register-honeypot") as HTMLInputElement)?.value?.trim()) return;
      if (!username || !password) {
        if (errEl) errEl.textContent = "Fill username and password";
        return;
      }
      if (password.length < 6) {
        if (errEl) errEl.textContent = "Password at least 6 characters";
        return;
      }
      if (password !== repeat) {
        if (errEl) errEl.textContent = "Passwords do not match";
        return;
      }
      if (submitBtn) submitBtn.disabled = true;
      if (!registrationIntentToken && registrationIntentPromise) {
        const intentRes = await registrationIntentPromise;
        if (intentRes.ok) {
          registrationIntentToken = intentRes.intentToken;
          registrationIntentHoneypotField = intentRes.honeypotField;
        }
      }
      if (!registrationIntentToken) {
        let intentRes: { ok: true; intentToken: string; honeypotField: string } | { ok: false; status: number; error?: string };
        try {
          const svRes = await getSignupVisit();
          intentRes = svRes.ok ? await getRegistrationIntent() : svRes;
        } catch {
          if (errEl) errEl.textContent = "Network error. Check your connection and try again.";
          if (submitBtn) submitBtn.disabled = false;
          return;
        }
        if (!intentRes.ok) {
          if (errEl) {
            if (intentRes.status === 429) errEl.textContent = "Too many attempts. Try again in a few minutes.";
            else if (intentRes.error === "registration_disabled") errEl.textContent = "Registration is temporarily disabled.";
            else if (intentRes.error === "visit_signup_first") errEl.textContent = "Please open the registration page (refresh or go to /signup) and try again.";
            else errEl.textContent = intentRes.error || "Could not load form. Please refresh the page.";
          }
          if (submitBtn) submitBtn.disabled = false;
          return;
        }
        registrationIntentToken = intentRes.intentToken;
        registrationIntentHoneypotField = intentRes.honeypotField;
      }
      const hpInput = wrap.querySelector("#register-honeypot") as HTMLInputElement;
      if (hpInput && registrationIntentHoneypotField) hpInput.name = registrationIntentHoneypotField;
      const turnstileContainer = wrap.querySelector("#auth-turnstile-container") as HTMLElement;
      const turnstileToken = turnstileContainer ? await getTurnstileToken(turnstileContainer) : null;
      if (!turnstileToken && turnstileSiteKey && errEl) {
        errEl.textContent = "Please complete the verification above.";
        if (submitBtn) submitBtn.disabled = false;
        return;
      }
      const intentToSend = registrationIntentToken;
      const honeypotFieldToSend = registrationIntentHoneypotField;
      registrationIntentToken = null;
      registrationIntentHoneypotField = null;
      const fp = await getFingerprint();
      const body: Record<string, string | undefined> = {
        nick: nick || username,
        username,
        password,
        email: "",
        code: "",
        turnstileToken: turnstileToken ?? undefined,
        registrationIntent: intentToSend ?? undefined,
        fingerprint: fp,
      };
      if (honeypotFieldToSend) {
        body[honeypotFieldToSend] = hpInput?.value ?? "";
      }
      const res = await postRegister(body);
      if (submitBtn) submitBtn.disabled = false;
      if (!res.ok) {
        if (errEl) {
          const msg =
            res.error === "too_many_accounts"
              ? "Too many accounts from this device."
              : res.error === "rate_limited"
                ? "Too many registration attempts from your network. Try again in a few seconds."
                : res.error === "registration_not_available"
                  ? "Registration is not available. Try from a different network or without VPN."
                  : res.error === "email_taken"
                ? "This email is already used"
                : res.error === "nick_taken"
                  ? "This nick is already taken"
                  : res.error === "username_taken"
                    ? "Username already taken"
                    : res.error === "invalid_or_expired_code"
                      ? "Invalid or expired code. Request a new one."
                      : res.error === "captcha_failed"
                        ? "Verification failed. Try again."
                        : res.error === "invalid_intent"
                          ? "Please open the registration page again and try again."
                          : res.error === "registration_disabled"
                            ? "Registration is temporarily disabled."
                            : (res.error ?? "Registration failed");
          errEl.textContent = msg;
        }
        return;
      }
      setToken(res.data.token);
      onAuthSuccess();
    });
  }

  wrap.querySelector("#verify-send-code-btn")?.addEventListener("click", async () => {
    const email = (wrap.querySelector("#verify-email-input") as HTMLInputElement)?.value?.trim() ?? "";
    const errEl = wrap.querySelector("#verify-email-error") as HTMLElement;
    if (errEl) errEl.textContent = "";
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      if (errEl) errEl.textContent = "Enter a valid email";
      return;
    }
    const fp = await getFingerprint();
    const res = await postSendEmailCode({ email, fingerprint: fp });
    if (res.ok) {
      if (errEl) errEl.textContent = "Code sent. Check your email.";
    } else {
      if (errEl) errEl.textContent = res.message ?? res.error ?? "Failed to send code";
    }
  });
  wrap.querySelector("#verify-email-submit")?.addEventListener("click", async () => {
    const email = (wrap.querySelector("#verify-email-input") as HTMLInputElement)?.value?.trim() ?? "";
    const code = (wrap.querySelector("#verify-code-input") as HTMLInputElement)?.value?.trim() ?? "";
    const errEl = wrap.querySelector("#verify-email-error") as HTMLElement;
    if (errEl) errEl.textContent = "";
    if (!email || !code) {
      if (errEl) errEl.textContent = "Enter email and code";
      return;
    }
    const fp = await getFingerprint();
    const res = await postVerifyEmail({ email, code, fingerprint: fp });
    if (!res.ok) {
      if (errEl) errEl.textContent = res.error === "invalid_or_expired_code" ? "Invalid or expired code." : (res.error ?? "Verification failed");
      return;
    }
    onAuthSuccess();
  });

  if (authModalBackdrop) authModalBackdrop.addEventListener("click", () => closeAuthModal());
  if (authModalClose) {
    authModalClose.addEventListener("click", (e) => {
      e.preventDefault();
      closeAuthModal();
    });
  }

  return wrap;
}

export function showLoginOverlay(
  onLoggedIn?: () => void,
  options?: { authError?: string; reason?: string; showVerifyEmail?: boolean; initialView?: "register" | "login" }
): void {
  if (typeof document === "undefined") return;
  onLoggedInCallback = onLoggedIn ?? null;
  const preloader = document.getElementById("game-preloader");
  if (preloader) preloader.classList.add("hidden");
  const wrap = getOrCreateOverlay();
  wrap.classList.remove("hidden");
  if (!wrap.parentNode) document.body.appendChild(wrap);
  const authModal = wrap.querySelector("#login-auth-modal") as HTMLDivElement;
  const chooseErrorEl = wrap.querySelector("#login-auth-choose-error") as HTMLElement;
  const viewBlocked = wrap.querySelector("#login-auth-view-blocked") as HTMLElement;
  const blockedReasonEl = wrap.querySelector("#login-auth-blocked-reason") as HTMLElement;
  const viewChoose = wrap.querySelector("#login-auth-view-choose");
  const viewLogin = wrap.querySelector("#login-auth-view-login");
  const viewRegister = wrap.querySelector("#login-auth-view-register");
  const viewVerifyEmail = wrap.querySelector("#login-auth-view-verify-email");

  if (options?.initialView === "login" && authModal) {
    authModal.classList.remove("hidden");
    authModal.setAttribute("aria-hidden", "false");
    [viewBlocked, viewChoose, viewLogin, viewRegister, viewVerifyEmail].forEach((el) => el?.classList.add("hidden"));
    viewLogin?.classList.remove("hidden");
    if (chooseErrorEl) chooseErrorEl.style.display = "none";
    getLoginVisit();
    const turnstileContainer = wrap.querySelector("#auth-turnstile-container") as HTMLElement;
    if (turnstileContainer) {
      turnstileContainer.setAttribute("aria-hidden", "false");
      getCaptchaSiteKey().then((k) => {
        turnstileSiteKey = k;
        if (k) loadTurnstileScript().then(() => ensureTurnstileWidget(turnstileContainer));
      });
    }
  } else if (options?.initialView === "register" && authModal) {
    authModal.classList.remove("hidden");
    authModal.setAttribute("aria-hidden", "false");
    [viewBlocked, viewChoose, viewLogin, viewRegister, viewVerifyEmail].forEach((el) => el?.classList.add("hidden"));
    viewRegister?.classList.remove("hidden");
    if (chooseErrorEl) chooseErrorEl.style.display = "none";
    registrationIntentPromise = getSignupVisit().then((sv) => (sv.ok ? getRegistrationIntent() : sv));
    registrationIntentPromise.then((r) => {
      if (r.ok) {
        registrationIntentToken = r.intentToken;
        registrationIntentHoneypotField = r.honeypotField;
        const hpInput = wrap.querySelector("#register-honeypot") as HTMLInputElement;
        if (hpInput) hpInput.name = r.honeypotField;
      }
    });
    const turnstileContainer = wrap.querySelector("#auth-turnstile-container") as HTMLElement;
    if (turnstileContainer) {
      turnstileContainer.setAttribute("aria-hidden", "false");
      getCaptchaSiteKey().then((k) => {
        turnstileSiteKey = k;
        if (k) loadTurnstileScript().then(() => ensureTurnstileWidget(turnstileContainer));
      });
    }
  } else if ((options?.authError || options?.showVerifyEmail) && authModal) {
    authModal.classList.remove("hidden");
    authModal.setAttribute("aria-hidden", "false");
    if (options?.showVerifyEmail) {
      [viewBlocked, viewChoose, viewLogin, viewRegister].forEach((el) => el?.classList.add("hidden"));
      viewVerifyEmail?.classList.remove("hidden");
    } else if (options?.authError === "too_many_accounts" && chooseErrorEl) {
      chooseErrorEl.textContent = "You already have more than 2 accounts, registration is not allowed.";
      chooseErrorEl.style.display = "block";
      [viewBlocked, viewLogin, viewRegister, viewVerifyEmail].forEach((el) => el?.classList.add("hidden"));
      viewChoose?.classList.remove("hidden");
    } else if (options?.authError === "rate_limited" && chooseErrorEl) {
      chooseErrorEl.textContent = "Too many registration attempts from your network. Please try again in a few seconds.";
      chooseErrorEl.style.display = "block";
      [viewBlocked, viewLogin, viewRegister, viewVerifyEmail].forEach((el) => el?.classList.add("hidden"));
      viewChoose?.classList.remove("hidden");
    } else if (options?.authError === "registration_not_available" && chooseErrorEl) {
      chooseErrorEl.textContent = "Registration is not available. Try from a different network or without VPN.";
      chooseErrorEl.style.display = "block";
      [viewBlocked, viewLogin, viewRegister, viewVerifyEmail].forEach((el) => el?.classList.add("hidden"));
      viewChoose?.classList.remove("hidden");
    } else if (options?.authError === "account_blocked" && viewBlocked && blockedReasonEl) {
      blockedReasonEl.textContent = options.reason ?? "";
      [viewChoose, viewLogin, viewRegister, viewVerifyEmail].forEach((el) => el?.classList.add("hidden"));
      viewBlocked.classList.remove("hidden");
    }
  }
}

export function closeLoginOverlay(): void {
  if (!overlay) return;
  overlay.classList.add("hidden");
}

export function isLoginOverlayVisible(): boolean {
  return !!overlay && !overlay.classList.contains("hidden");
}

let sessionInvalidOnContinue: (() => void) | null = null;
let sessionInvalidShowLoginOnOk = false;

const SESSION_INVALID_TEXT_DEFAULT = "You logged in in another tab or device. Click OK to continue here with the same account.";
const SESSION_INVALID_TEXT_SWITCH_TAB = "Please switch to the other tab to continue.";
const SESSION_INVALID_TEXT_401 = "You were logged out. Click OK to sign in again.";

/**
 * Show "session invalid" overlay.
 * options.onContinue: on OK re-attach token and call onContinue (show OK button).
 * options.showLoginOnOk: show OK button; on click close overlay and show login (401 case).
 * If neither: show message without OK button (inactive tab — switch to other tab).
 */
export function showSessionInvalidOverlay(options?: { onContinue?: () => void; message?: string; showLoginOnOk?: boolean }): void {
  if (typeof document === "undefined") return;
  const onContinue = options?.onContinue;
  const showLoginOnOk = options?.showLoginOnOk === true;
  sessionInvalidShowLoginOnOk = showLoginOnOk;
  const showOk = onContinue != null || showLoginOnOk;
  const message =
    options?.message ??
    (showLoginOnOk ? SESSION_INVALID_TEXT_401 : onContinue != null ? SESSION_INVALID_TEXT_DEFAULT : SESSION_INVALID_TEXT_SWITCH_TAB);
  sessionInvalidOnContinue = onContinue ?? null;
  let box = document.getElementById("session-invalid-overlay") as HTMLDivElement | null;
  if (!box) {
    box = document.createElement("div");
    box.id = "session-invalid-overlay";
    box.className = "login-overlay session-invalid-overlay";
    box.setAttribute("aria-label", "Session invalid");
    box.innerHTML = `
      <div class="login-box session-invalid-box" role="alertdialog">
        <h2 class="session-invalid-title">Session ended</h2>
        <p class="session-invalid-text"></p>
        <button type="button" class="login-btn session-invalid-ok" style="display:none;">OK</button>
      </div>
    `;
    const parent = document.querySelector(".ui-scale-wrapper") ?? document.body;
    parent.appendChild(box);
    (box.querySelector(".session-invalid-ok") as HTMLButtonElement).addEventListener("click", () => {
      const cb = sessionInvalidOnContinue;
      const showLogin = sessionInvalidShowLoginOnOk;
      sessionInvalidOnContinue = null;
      sessionInvalidShowLoginOnOk = false;
      box!.classList.add("hidden");
      if (cb && !showLogin) {
        const t = typeof localStorage !== "undefined" ? localStorage.getItem(STORAGE_KEY) : null;
        if (t) setToken(t);
        cb();
      } else {
        showLoginOverlay(() => syncHeader());
      }
    });
  }
  const textEl = box.querySelector(".session-invalid-text") as HTMLElement;
  const okBtn = box.querySelector(".session-invalid-ok") as HTMLButtonElement;
  if (textEl) textEl.textContent = message;
  if (okBtn) {
    okBtn.style.display = showOk ? "" : "none";
    if (showOk) okBtn.focus();
  }
  box.classList.remove("hidden");
}

export function closeSessionInvalidOverlay(): void {
  const box = document.getElementById("session-invalid-overlay") as HTMLDivElement | null;
  if (box) box.classList.add("hidden");
}

/**
 * Load character + me with current token and apply to state. Returns true if ok.
 */
export async function loadCharacterAndApply(): Promise<boolean> {
  const token = getToken();
  if (!token) return false;
  const charRes = await getCharacter(token);
  if (!charRes.ok) return false;
  const meRes = await getMe(token);
  applyCharacterData(
    charRes.data.character,
    charRes.data.slots,
    meRes.ok ? meRes.data.username : undefined,
    meRes.ok ? meRes.data.avatarUrl : undefined,
    meRes.ok ? meRes.data.authProvider : undefined
  );
  if (meRes.ok) {
    setActionsLogAccountId(meRes.data.accountId);
    initActionsLog();
  }
  return true;
}
