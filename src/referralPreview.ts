/**
 * Referral share preview image: postbg, avatar (green border), nickname, level, balance.
 * For testing first; later attach to referral links (OG/Twitter card).
 */

import { formatPfv, safeAvatarUrl } from "./utils";

const OG_WIDTH = 1200;
const OG_HEIGHT = 630;
const TEXT_GREEN = "#9fce4e";
const GREEN_BORDER = "#15803d";
const PIXEL_FONT = '"Press Start 2P", monospace';
const DEFAULT_AVATAR = "/assets/characters/pixm.png";

async function getPostbgUrl(): Promise<string> {
  try {
    const mod = await import("./assets/landing/postbg.png");
    return typeof mod.default === "string" ? mod.default : "";
  } catch {
    return "";
  }
}

function loadImage(src: string, crossOrigin = false): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    if (crossOrigin) img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Failed to load " + src));
    img.src = src;
  });
}

function drawTextWithOutline(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  fillStyle: string,
  fontSize: number,
  outlineWidth: number
): void {
  ctx.font = `${fontSize}px ${PIXEL_FONT}`;
  ctx.textBaseline = "middle";
  ctx.strokeStyle = "#000";
  ctx.lineWidth = outlineWidth;
  ctx.lineJoin = "round";
  ctx.miterLimit = 2;
  ctx.strokeText(text, x, y);
  ctx.fillStyle = fillStyle;
  ctx.fillText(text, x, y);
}

/** Prefer higher-res Twitter avatar (e.g. _400x400) for better quality. Uses safe URL only. */
function avatarUrlHighRes(url: string | null): string {
  const safe = safeAvatarUrl(url);
  if (!safe) return DEFAULT_AVATAR;
  if (safe.includes("_normal") || safe.includes("_200x200")) {
    return safe.replace(/_normal|_200x200/g, "_400x400");
  }
  return safe;
}

export interface ReferralPreviewOptions {
  avatarUrl: string | null;
  nickname: string;
  level: number;
  balancePfv: number;
}

/**
 * Generate referral preview as PNG data URL. Postbg, block (avatar + gap + nickname) centered; level + balance at bottom.
 */
export async function generateReferralPreviewImage(options: ReferralPreviewOptions): Promise<string> {
  const { avatarUrl, nickname, level, balancePfv } = options;
  const canvas = document.createElement("canvas");
  canvas.width = OG_WIDTH;
  canvas.height = OG_HEIGHT;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2d not available");

  const postbgUrl = await getPostbgUrl();
  const bgImg = postbgUrl ? await loadImage(postbgUrl).catch(() => null) : null;
  if (bgImg) {
    const scale = Math.min(OG_WIDTH / bgImg.width, OG_HEIGHT / bgImg.height);
    const w = bgImg.width * scale;
    const h = bgImg.height * scale;
    ctx.drawImage(bgImg, (OG_WIDTH - w) / 2, (OG_HEIGHT - h) / 2, w, h);
  } else {
    ctx.fillStyle = "#1a1a1a";
    ctx.fillRect(0, 0, OG_WIDTH, OG_HEIGHT);
  }

  const avatarSize = 140;
  const centerY = OG_HEIGHT / 2;
  const centerX = OG_WIDTH / 2;

  const nickFontSize = 56;
  const levelFontSize = 36;
  const outlineBig = 12;
  const outlineLevel = 10;
  const avatarCircleW = avatarSize + 12;
  const shiftRight = avatarCircleW / 2;
  const nick = String(nickname || "Pix").slice(0, 16);
  ctx.font = `${nickFontSize}px ${PIXEL_FONT}`;
  const approxCharWidth = 32;
  const nickWidth = nick.length * approxCharWidth + outlineBig;
  const nickCenterX = centerX + shiftRight;
  const gap = 20;
  const avatarLeft = nickCenterX - nickWidth / 2 - gap - avatarCircleW;
  const avatarCenterX = avatarLeft + avatarCircleW / 2;
  const avatarCenterY = centerY - 50;
  const row1Y = centerY - 50;

  const avatarSrc = avatarUrlHighRes(avatarUrl);
  const avatarImg = await loadImage(avatarSrc, true).catch(() => loadImage(DEFAULT_AVATAR));

  ctx.save();
  ctx.beginPath();
  ctx.arc(avatarCenterX, avatarCenterY, avatarSize / 2 + 6, 0, Math.PI * 2);
  ctx.closePath();
  ctx.clip();
  ctx.drawImage(
    avatarImg,
    avatarCenterX - avatarSize / 2 - 6,
    avatarCenterY - avatarSize / 2 - 6,
    avatarSize + 12,
    avatarSize + 12
  );
  ctx.restore();

  ctx.strokeStyle = GREEN_BORDER;
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.arc(avatarCenterX, avatarCenterY, avatarSize / 2 + 3, 0, Math.PI * 2);
  ctx.stroke();

  const row2Y = centerY + 65;
  ctx.textAlign = "center";
  drawTextWithOutline(ctx, nick, nickCenterX, row1Y, TEXT_GREEN, nickFontSize, outlineBig);
  ctx.textAlign = "start";

  const levelLine = `Level ${level}  |  ${formatPfv(balancePfv)} $PFV`;
  ctx.font = `${levelFontSize}px ${PIXEL_FONT}`;
  const levelLineW = ctx.measureText(levelLine).width;
  const levelLineX = centerX - levelLineW / 2;
  drawTextWithOutline(ctx, levelLine, levelLineX, row2Y, TEXT_GREEN, levelFontSize, outlineLevel);

  return canvas.toDataURL("image/png");
}
