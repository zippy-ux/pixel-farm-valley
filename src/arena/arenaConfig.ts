/**
 * Arena config: formulas and constants (source of truth for client).
 * XP/HP/damage formulas must match server (character.ts).
 */

export const TILE_SIZE = 32;

/** Player melee range (px). */
export const PLAYER_MELEE_RANGE = 32;
/** Monster attack range (px). */
export const MONSTER_ATTACK_RANGE = 28;

/** Hit cooldown (ms), same as mining. */
export const PLAYER_HIT_COOLDOWN_MS = 500;

/** Max HP: 100 + (level-1)*20. Level 1..10. */
export function playerMaxHp(level: number): number {
  return 100 + (Math.min(10, Math.max(1, level)) - 1) * 20;
}

/** Player damage: 10 + bowLevel*3. bow_level 0..9 = L1..L10. */
export function playerDamage(bowLevel: number): number {
  return 10 + Math.min(9, Math.max(0, bowLevel)) * 3;
}

/** Monster HP: round(0.65 * playerMaxHP(level) + waveIndex*18). waveIndex 1..N. */
export function monsterHp(playerLevel: number, waveIndex: number): number {
  return Math.round(0.65 * playerMaxHp(playerLevel) + waveIndex * 18);
}

/** Monster damage: round(4 + level*1.0 + waveIndex*1.0). */
export function monsterDamage(playerLevel: number, waveIndex: number): number {
  return Math.round(4 + playerLevel * 1.0 + waveIndex * 1.0);
}

/** Monster attack cooldown (ms). 1.5x faster than before: L1-3 ~1.13s, L4-7 ~1.07s, L8-10: 1s. */
export function monsterAttackCooldownMs(playerLevel: number): number {
  if (playerLevel <= 3) return Math.round(1700 / 1.5);
  if (playerLevel <= 7) return Math.round(1600 / 1.5);
  return Math.round(1500 / 1.5);
}

/** Monster speed multiplier by wave (1..6). Flatter so higher waves aren’t much faster. */
const WAVE_SPEED_K = [0.97, 0.98, 1.0, 1.01, 1.02, 1.03];
export function monsterSpeedK(waveIndex: number): number {
  return WAVE_SPEED_K[Math.min(waveIndex - 1, WAVE_SPEED_K.length - 1)] ?? 1;
}

/** Monster speed multiplier by player level (1..10). Higher level => slower monsters. */
export function monsterSpeedByLevelK(playerLevel: number): number {
  const l = Math.min(10, Math.max(1, playerLevel));
  return 1 - ((l - 1) / 9) * 0.18;
}

/** Regen speed multiplier by player level (1..10). Higher level => faster regen. */
export function regenMultByLevel(playerLevel: number): number {
  const l = Math.min(10, Math.max(1, playerLevel));
  return 1 + ((l - 1) / 9) * 0.5;
}

/** Wave count by player level (1..10). */
export function waveCount(playerLevel: number): number {
  const l = Math.min(10, Math.max(1, playerLevel));
  if (l <= 2) return 2;
  if (l <= 4) return 3;
  if (l <= 6) return 4;
  if (l <= 8) return 5;
  return 6;
}

/** Monsters per wave by level (reduced for less crowding). Index = wave (0-based), value = count. */
const MONSTERS_PER_WAVE: Record<number, number[]> = {
  1: [1, 2],
  2: [2, 2, 3],
  3: [2, 3, 3],
  4: [2, 3, 4],
  5: [3, 3, 4, 4],
  6: [3, 4, 4, 5],
  7: [3, 4, 5, 5],
  8: [4, 4, 5, 6],
  9: [4, 5, 5, 6],
  10: [4, 5, 6, 6],
};
export function monstersInWave(playerLevel: number, waveIndex0: number): number {
  const arr = MONSTERS_PER_WAVE[Math.min(10, Math.max(1, playerLevel))] ?? MONSTERS_PER_WAVE[1];
  return arr[Math.min(waveIndex0, arr.length - 1)] ?? 0;
}

/** Spawn interval inside wave (ms) — longer so monsters appear less frequently. */
export function spawnIntervalMs(playerLevel: number): number {
  const l = Math.min(10, Math.max(1, playerLevel));
  if (l <= 3) return 2200;
  if (l <= 6) return 2000;
  if (l <= 8) return 1800;
  return 1600;
}

/** Base player speed (px/s). Movement uses 240ms per tile at speedMult 1; 1 tile = 32px => 32/0.24 ≈ 133. */
export const PLAYER_BASE_SPEED_PX = 32 / 0.24;
/** move_speed_level 0..4 => mult 1, 1.25, 1.5, 1.75, 2. */
export function playerSpeedPxPerSec(moveSpeedLevel: number): number {
  const mult = 1 + Math.min(4, Math.max(0, moveSpeedLevel)) * 0.25;
  return PLAYER_BASE_SPEED_PX * mult;
}

/** Regen: no damage for this long (ms) then start regen. */
export const REGEN_DELAY_MS = 1000;
/** Regen: +1% maxHP per second. */
export const REGEN_PCT_PER_SEC = 1;
/** Regen cap (0..1) during wave; between waves regen up to 100%. */
export const REGEN_CAP_DURING_WAVE = 0.8;
/** @deprecated Use REGEN_CAP_DURING_WAVE; kept for arenaScene. */
export const REGEN_CAP_WHILE_MONSTERS = 0.45;
/** Pause between waves (ms). */
export const ARENA_PAUSE_BETWEEN_WAVES_MS = 10000;

/** Spawn fade-in duration (ms). Monster invulnerable during. */
export const SPAWN_FADE_MS = 1600;
/** Death dissolve duration (ms). */
export const DEATH_FADE_MS = 600;

/** Min distance from player for spawn (tiles). */
export const SPAWN_MIN_TILES_FROM_PLAYER = 6;
