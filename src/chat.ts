/**
 * Chat panel (bottom-right): load last 100 messages, @nick links to Twitter, send message.
 */

import { getToken, getChatMessages, postChatMessage } from "./api";
import { escapeHtml } from "./utils";
import { homeState } from "./homeWindow";

const POLL_INTERVAL_MS = 5000;

function twitterUrl(username: string): string {
  const u = String(username).replace(/^@/, "");
  return u ? `https://x.com/${encodeURIComponent(u)}` : "#";
}

function renderMessage(username: string, message: string, createdAt: string, hasTwitter?: boolean): string {
  const displayName = username.startsWith("@") ? username : username ? `@${username}` : "?";
  const safeName = escapeHtml(displayName);
  const safeMsg = escapeHtml(message);
  const date = new Date(createdAt);
  const timeStr = date.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
  const authorHtml =
    hasTwitter === true
      ? `<a href="${escapeHtml(twitterUrl(username))}" target="_blank" rel="noopener noreferrer" class="ui-chat-author">${safeName}</a>`
      : `<span class="ui-chat-author">${safeName}</span>`;
  return `<div class="ui-chat-msg" data-username="${safeName}">
    ${authorHtml}
    <span class="ui-chat-msg-text">${safeMsg}</span>
    <span class="ui-chat-msg-time">${escapeHtml(timeStr)}</span>
  </div>`;
}

async function loadMessages(container: HTMLElement): Promise<void> {
  try {
    const res = await getChatMessages(100);
    if (!res.ok) {
      const status = "status" in res ? res.status : 0;
      const errMsg = "error" in res ? res.error : "";
      console.error("[Chat] GET /api/chat/messages failed:", status, errMsg);
      const hint = status === 404 ? " (API may need restart)" : status === 500 ? " (run migration 017_chat.sql)" : "";
      container.innerHTML = `<div class="ui-chat-msg ui-chat-msg-system">Failed to load chat${hint}.</div>`;
      return;
    }
    const messages = res.data.messages;
    if (messages.length === 0) {
      container.innerHTML = `<div class="ui-chat-msg ui-chat-msg-system">No messages yet. Say hi!</div>`;
      return;
    }
    container.innerHTML = messages
      .map((m) => renderMessage(m.username, m.message, m.createdAt, m.hasTwitter))
      .join("");
    container.scrollTop = container.scrollHeight;
  } catch (e) {
    console.error("[Chat] Request error:", e);
    container.innerHTML = `<div class="ui-chat-msg ui-chat-msg-system">Network error. Check console.</div>`;
  }
}

export function initChat(): void {
  if (typeof document === "undefined") return;
  const panel = document.getElementById("ui-chat-panel");
  const messagesEl = document.getElementById("ui-chat-panel-messages");
  const inputEl = document.querySelector(".ui-chat-panel-input") as HTMLInputElement | null;
  const chatBtn = document.getElementById("ui-chat-btn");
  if (!panel || !messagesEl) return;

  let pollTimer: ReturnType<typeof setInterval> | null = null;

  function startPolling(): void {
    if (pollTimer) return;
    pollTimer = setInterval(() => {
      if (panel.classList.contains("open")) loadMessages(messagesEl);
    }, POLL_INTERVAL_MS);
  }
  function stopPolling(): void {
    if (pollTimer) {
      clearInterval(pollTimer);
      pollTimer = null;
    }
  }

  function updateInputState(): void {
    if (inputEl) {
      const hasToken = !!getToken();
      inputEl.disabled = !hasToken;
      inputEl.placeholder = hasToken ? "Type a message..." : "Log in to chat";
    }
  }

  chatBtn?.addEventListener("click", () => {
    panel.classList.toggle("open");
    if (panel.classList.contains("open")) {
      updateInputState();
      loadMessages(messagesEl);
      startPolling();
    } else {
      stopPolling();
    }
  });

  panel.addEventListener("click", (e) => {
    if (inputEl && e.target !== inputEl && !inputEl.contains(e.target as Node)) {
      inputEl.blur();
    }
  });

  // Stop key events from bubbling to Phaser when typing in chat (so WASD, arrows, space work in the input)
  panel.addEventListener("keydown", (e) => {
    if ((e.target as Node)?.nodeName === "INPUT" || (e.target as Node)?.nodeName === "TEXTAREA") {
      e.stopPropagation();
    }
  }, false);
  panel.addEventListener("keyup", (e) => {
    if ((e.target as Node)?.nodeName === "INPUT" || (e.target as Node)?.nodeName === "TEXTAREA") {
      e.stopPropagation();
    }
  }, false);

  loadMessages(messagesEl);
  startPolling();
  updateInputState();

  if (inputEl) {
    inputEl.addEventListener("keydown", (e) => {
      if (e.key !== "Enter") return;
      e.preventDefault();
      const text = inputEl.value.trim();
      const token = getToken();
      if (!text || !token) return;
      inputEl.disabled = true;
      postChatMessage(token, text).then((res) => {
        updateInputState();
        inputEl.value = "";
        if (res.ok) {
          const html = renderMessage(
            res.data.username,
            res.data.message,
            res.data.createdAt,
            homeState.authProvider === "twitter"
          );
          messagesEl.insertAdjacentHTML("beforeend", html);
          messagesEl.scrollTop = messagesEl.scrollHeight;
        }
      });
    });
  }
}
