/**
 * Game sound effects — steps, pickaxe, sword, market, withdrawal.
 * Respects mute and volume from valleyMusic.
 * Uses a shared Audio element to avoid browser restrictions on multiple instances.
 */

import { isSoundMuted, getVolume } from "./valleyMusic";

const SFX_BASE = "/assets/sfx";

let sfxAudio: HTMLAudioElement | null = null;

/** Call when game becomes interactive (e.g. after first user click) to unlock SFX playback. */
export function prepareSfx(): void {
  if (!sfxAudio) sfxAudio = new Audio();
}

function playSfx(name: string): void {
  if (isSoundMuted()) return;
  prepareSfx();
  if (!sfxAudio) return;
  sfxAudio.pause();
  sfxAudio.currentTime = 0;
  sfxAudio.src = `${SFX_BASE}/${name}.mp3`;
  sfxAudio.volume = getVolume();
  sfxAudio.play().catch(() => {});
}

let stepIndex = 0;

export function playStep(): void {
  stepIndex = (stepIndex % 3) + 1;
  playSfx(`Step${stepIndex}`);
}

export function playPickaxe(): void {
  playSfx("Pickaxe");
}

export function playSword(): void {
  playSfx("Sword");
}

export function playMarketSell(): void {
  playSfx("MarketSell");
}

export function playWithdrawal(): void {
  playSfx("Withdrawal");
}
