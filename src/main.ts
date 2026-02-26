import { getToken, setToken, clearToken, logout, setOnSessionInvalid, setOnNeedsEmailVerification, STORAGE_KEY, REFERRAL_STORAGE_KEY, invalidateSessionInThisTab, isSessionInvalid, getCharacter, getMe, getApiBase } from "./api";
import { fetchAndUpdatePoolInHeader, refreshMarketDataIfOpen } from "./marketWindow";
import { syncHeader } from "./uiHeader";
import { applyCharacterData } from "./gameState";
import { showLoginOverlay, loadCharacterAndApply, showSessionInvalidOverlay } from "./loginWindow";
import { showSiteGate, isGateRequired, isGatePassed } from "./siteGate";
import { initChat } from "./chat";
import { initWalletHeader } from "./walletHeader";
import { refreshWalletStatus } from "./wallet";
import { toggleSound, isSoundMuted, getVolume, setVolume } from "./valleyMusic";
import "./homeWindow.css";
import "./marketWindow.css";
import "./mineWindow.css";
import "./arenaWindow.css";
import "./valleyWindow.css";
import "./backpackWindow.css";
import "./arenaResultOverlay.css";
import "./levelUpOverlay.css";
import "./walletPicker.css";

if (typeof document !== "undefined") document.title = "Pixel Farm Valley";

function initSoundToggle(): void {
  if (typeof document === "undefined") return;
  const el = document.getElementById("ui-sound-toggle");
  const slider = document.getElementById("ui-volume-slider") as HTMLInputElement | null;
  if (!el) return;
  function updateUI(): void {
    const muted = isSoundMuted();
    el.textContent = muted ? "SOUND: OFF" : "SOUND: ON";
    el.classList.toggle("sound-off", muted);
  }
  updateUI();
  el.addEventListener("click", () => {
    toggleSound();
    updateUI();
  });
  el.addEventListener("keydown", (e: KeyboardEvent) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      toggleSound();
      updateUI();
    }
  });
  if (slider) {
    slider.value = String(Math.round(getVolume() * 100));
    slider.addEventListener("input", () => setVolume(Number(slider.value) / 100));
  }
}



async function initAuthThenBoot() {
  if (typeof document === "undefined") return;
  setOnSessionInvalid(() => showSessionInvalidOverlay({ showLoginOnOk: true }));
  setOnNeedsEmailVerification(() => {
    showLoginOverlay(async () => {
      const ok = await loadCharacterAndApply();
      if (ok) {
        syncHeader();
        fetchAndUpdatePoolInHeader();
        refreshWalletStatus();
        if (typeof document !== "undefined") document.body.classList.add("game-ui-visible");
        (await import("./gameBoot")).bootGame();
        startDistributionEventListener();
      } else clearToken();
    }, { showVerifyEmail: true });
  });
  const params = new URLSearchParams(window.location.search);
  const urlToken = params.get("token");
  if (urlToken) {
    setToken(urlToken);
    params.delete("token");
    const clean = window.location.pathname + (params.toString() ? "?" + params.toString() : "");
    window.history.replaceState(null, "", clean);
    const meRes = await getMe(urlToken);
    if (meRes.ok && meRes.data.needsEmailVerification) {
      showLoginOverlay(
        async () => {
          const ok2 = await loadCharacterAndApply();
          if (ok2) {
            syncHeader();
            fetchAndUpdatePoolInHeader();
            if (typeof document !== "undefined") document.body.classList.add("game-ui-visible");
            (await import("./gameBoot")).bootGame();
            startDistributionEventListener();
          } else clearToken();
        },
        { showVerifyEmail: true }
      );
      return;
    }
    const ok = await loadCharacterAndApply();
    if (ok) {
      syncHeader();
      fetchAndUpdatePoolInHeader();
      if (typeof document !== "undefined") document.body.classList.add("game-ui-visible");
      (await import("./gameBoot")).bootGame();
      startDistributionEventListener();
    } else {
      clearToken();
      showLoginOverlay(async () => {
        const ok2 = await loadCharacterAndApply();
        if (ok2) {
          syncHeader();
          fetchAndUpdatePoolInHeader();
          if (typeof document !== "undefined") document.body.classList.add("game-ui-visible");
          (await import("./gameBoot")).bootGame();
          startDistributionEventListener();
        } else clearToken();
      });
    }
    return;
  }
  // Normal load or refresh: show landing; game boots when user clicks LAUNCH and is logged in
  const authError = params.get("auth_error");
  const authReason = params.get("reason") ?? undefined;
  if (authError === "too_many_accounts" || authError === "account_blocked" || authError === "rate_limited" || authError === "registration_not_available") {
    params.delete("auth_error");
    params.delete("reason");
    const clean = window.location.pathname + (params.toString() ? "?" + params.toString() : "") + window.location.hash;
    window.history.replaceState(null, "", clean);
  }
  const isSignupPage =
    typeof window !== "undefined" && window.location.pathname === "/signup";
  const isLoginPage =
    typeof window !== "undefined" && window.location.pathname === "/login";
  const initialView = authError
    ? undefined
    : isSignupPage
      ? "register"
      : isLoginPage
        ? "login"
        : undefined;
  showLoginOverlay(
    async () => {
      const ok = await loadCharacterAndApply();
      if (ok) {
        syncHeader();
        fetchAndUpdatePoolInHeader();
        refreshWalletStatus();
        if (typeof document !== "undefined") document.body.classList.add("game-ui-visible");
        (await import("./gameBoot")).bootGame();
        startDistributionEventListener();
      } else {
        clearToken();
      }
    },
    authError ? { authError, reason: authReason } : initialView ? { initialView } : undefined
  );
}

function startDistributionEventListener(): void {
  if (typeof EventSource === "undefined") return;
  const url = `${getApiBase()}/api/market/distribution-events`;
  let es: EventSource | null = null;
  const connect = () => {
    es = new EventSource(url);
    es.onmessage = (e) => {
      if (e.data === "distributed" || e.data === "state") {
        fetchAndUpdatePoolInHeader();
        const t = getToken();
        if (t) {
          getCharacter(t).then((r) => {
            if (r?.ok) {
              applyCharacterData(r.data.character, r.data.slots);
              syncHeader();
            }
            refreshMarketDataIfOpen();
          });
        } else {
          refreshMarketDataIfOpen();
        }
      }
    };
    es.onerror = () => {
      es?.close();
      es = null;
      setTimeout(connect, 5000);
    };
  };
  connect();
}

function captureReferralFromUrl(): void {
  if (typeof window === "undefined" || !window.location?.search) return;
  const params = new URLSearchParams(window.location.search);
  const raw = params.get("ref")?.trim();
  const ref = raw?.replace(/\D/g, "");
  if (ref) {
    try {
      localStorage.setItem(REFERRAL_STORAGE_KEY, ref);
    } catch {
      // ignore
    }
  }
}

if (typeof document !== "undefined" && document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => {
    captureReferralFromUrl();
    initChat();
    initSoundToggle();
    initWalletHeader();
    if (isGateRequired() && !isGatePassed()) {
      showSiteGate(initAuthThenBoot);
    } else {
      initAuthThenBoot();
    }
  });
} else {
  captureReferralFromUrl();
  initChat();
  initSoundToggle();
  initWalletHeader();
  if (isGateRequired() && !isGatePassed()) {
    showSiteGate(initAuthThenBoot);
  } else {
    initAuthThenBoot();
  }
}
