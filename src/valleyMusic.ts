/**
 * Map background music — Valley (map1), Mine (map2), Arena (map3).
 * Valley: Valley1..Valley10 shuffled, Mine: Mine1-2, Arena: Arena1.
 */

const DEFAULT_VOLUME = 0.35;
const STORAGE_KEY = "pixelvalley_sound_muted";
const VOLUME_STORAGE_KEY = "pixelvalley_sound_volume";
const MUSIC_BASE = "/assets/music";

function loadMutedState(): boolean {
  if (typeof localStorage === "undefined") return false;
  try {
    return localStorage.getItem(STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

function saveMutedState(muted: boolean): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, muted ? "1" : "0");
  } catch {
    /* ignore */
  }
}

function loadVolume(): number {
  if (typeof localStorage === "undefined") return DEFAULT_VOLUME;
  try {
    const v = parseFloat(localStorage.getItem(VOLUME_STORAGE_KEY) ?? "");
    return Number.isFinite(v) && v >= 0 && v <= 1 ? v : DEFAULT_VOLUME;
  } catch {
    return DEFAULT_VOLUME;
  }
}

function saveVolume(vol: number): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(VOLUME_STORAGE_KEY, String(vol));
  } catch {
    /* ignore */
  }
}

let audio: HTMLAudioElement | null = null;
let _volume = loadVolume();
let _currentMapId: string | null = null;
let valleyOrder: number[] = [];
let valleyIndex = 0;
let _muted = loadMutedState();

export function isSoundMuted(): boolean {
  return _muted;
}

export function setSoundMuted(muted: boolean): void {
  _muted = muted;
  saveMutedState(muted);
  if (audio) audio.muted = muted;
}

export function toggleSound(): boolean {
  _muted = !_muted;
  saveMutedState(_muted);
  if (audio) audio.muted = _muted;
  return _muted;
}

export function getVolume(): number {
  return _volume;
}

export function setVolume(vol: number): void {
  _volume = Math.max(0, Math.min(1, vol));
  saveVolume(_volume);
  if (audio) audio.volume = _volume;
}

function shuffleValleyOrder(): number[] {
  const arr = Array.from({ length: 10 }, (_, i) => i + 1);
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function playNext(): void {
  if (!audio || _muted || !_currentMapId) return;
  let src: string;
  let loop = false;
  if (_currentMapId === "map1") {
    if (valleyOrder.length === 0) valleyOrder = shuffleValleyOrder();
    const n = valleyOrder[valleyIndex];
    valleyIndex = (valleyIndex + 1) % valleyOrder.length;
    src = `${MUSIC_BASE}/Valley${n}.mp3`;
  } else if (_currentMapId === "map2") {
    const n = (valleyIndex % 2) + 1;
    valleyIndex++;
    src = `${MUSIC_BASE}/Mine${n}.mp3`;
  } else if (_currentMapId === "map3") {
    src = `${MUSIC_BASE}/Arena1.mp3`;
    loop = true;
  } else {
    return;
  }
  audio.src = src;
  audio.volume = _volume;
  audio.muted = _muted;
  audio.loop = loop;
  audio.play().catch(() => {
    const resume = () => {
      document.removeEventListener("click", resume);
      document.removeEventListener("keydown", resume);
      if (!_muted && audio) audio.play().catch(() => {});
    };
    document.addEventListener("click", resume, { once: true });
    document.addEventListener("keydown", resume, { once: true });
  });
}

export function startMapMusic(mapId: string): void {
  _currentMapId = mapId;
  valleyIndex = 0;
  if (mapId === "map1") valleyOrder = shuffleValleyOrder();
  _muted = loadMutedState();
  if (!audio) {
    audio = new Audio();
    audio.addEventListener("ended", () => {
      if (!audio?.loop) playNext();
    });
  }
  audio.loop = false;
  audio.muted = _muted;
  playNext();
}

export function stopMapMusic(): void {
  _currentMapId = null;
  if (audio) {
    audio.pause();
    audio.currentTime = 0;
  }
}

/** @deprecated Use startMapMusic. */
export function startValleyMusic(): void {
  startMapMusic("map2");
}

/** @deprecated Use stopMapMusic. */
export function stopValleyMusic(): void {
  stopMapMusic();
}
