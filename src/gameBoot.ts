import Phaser from "phaser";
import { getToken, setToken, clearToken, logout, setOnSessionInvalid, STORAGE_KEY, invalidateSessionInThisTab, isSessionInvalid, getCharacter, withGameLock, postMiningHit, getMiningRocks, postArenaStart, postArenaAttack, postArenaMonsterHit, postArenaNextWave, postArenaPing, postPvpAttack, getPvpRun, postPvpPosition, type PvpFacing } from "./api";
import { initHomeWindow, openHome, isHomeOpen, homeState } from "./homeWindow";
import { initMarketWindow, openMarket, isMarketOpen, fetchAndUpdatePoolInHeader, refreshMarketDataIfOpen } from "./marketWindow";
import { initForgeWindow, openForge, isForgeOpen } from "./forgeWindow";
import { openMine, isMineOpen, showTransitionPreloader } from "./mineWindow";
import { initArenaWindow, openArena, isArenaOpen } from "./arenaWindow";
import { initPvpArenaWindow } from "./pvpArenaWindow";
import { openValley, closeValley, isValleyOpen } from "./valleyWindow";
import { initBackpackWindow, openBackpack, isBackpackOpen } from "./backpackWindow";
import { syncHeader } from "./uiHeader";
import { applyCharacterData, pendingLevelUpLevel, clearPendingLevelUp, pendingWelcome, clearPendingWelcome, markWelcomeShown } from "./gameState";
import { loadCharacterAndApply, showSessionInvalidOverlay } from "./loginWindow";
import { showArenaResult } from "./arenaResultOverlay";
import { showLevelUpOverlay, showWelcomeOverlay } from "./levelUpOverlay";
import { initActionsLog, logAction } from "./actionsLog";
import { startMapMusic, stopMapMusic } from "./valleyMusic";
import { playStep, playPickaxe, playSword, prepareSfx } from "./gameSfx";
import {
  PLAYER_MELEE_RANGE,
  MONSTER_ATTACK_RANGE,
  PLAYER_HIT_COOLDOWN_MS,
  playerDamage,
  playerMaxHp,
  monsterHp,
  monsterDamage,
  monsterAttackCooldownMs,
  monsterSpeedK,
  monsterSpeedByLevelK,
  regenMultByLevel,
  waveCount,
  monstersInWave,
  spawnIntervalMs,
  playerSpeedPxPerSec,
  REGEN_DELAY_MS,
  REGEN_PCT_PER_SEC,
  ARENA_PAUSE_BETWEEN_WAVES_MS,
  SPAWN_FADE_MS,
  DEATH_FADE_MS,
  SPAWN_MIN_TILES_FROM_PLAYER,
} from "./arena/arenaConfig";
const TILE_SIZE = 32;
const DEFAULT_MAP_ID = "map1";
/** Shift character sprite up by 20% of tile height so they don't run on the tile edge. */
const CHARACTER_Y_OFFSET = -TILE_SIZE * 0.2;
/** Walk-down: 4 separate 80×80 PNGs (pix-walk-down-0.png … pix-walk-down-3.png). */
const WALK_DOWN_KEYS = ["character-walk-down-0", "character-walk-down-1", "character-walk-down-2", "character-walk-down-3"] as const;
/** Walk-right: 2 separate PNGs (pix-walk-right-0.png, pix-walk-right-1.png). */
const WALK_RIGHT_KEYS = ["character-walk-right-0", "character-walk-right-1"] as const;
/** Walk-up: 4 separate PNGs (pix-walk-up-0.png … pix-walk-up-3.png). */
const WALK_UP_KEYS = ["character-walk-up-0", "character-walk-up-1", "character-walk-up-2", "character-walk-up-3"] as const;
/** Walk-left: 2 separate PNGs (pix-walk-left-0.png, pix-walk-left-1.png). */
const WALK_LEFT_KEYS = ["character-walk-left-0", "character-walk-left-1"] as const;
/** Arena walk (sword): pix-walk-*-sw (4 down/up, 2 right/left). */
const ARENA_WALK_DOWN_KEYS = ["arena-walk-down-0", "arena-walk-down-1", "arena-walk-down-2", "arena-walk-down-3"] as const;
const ARENA_WALK_UP_KEYS = ["arena-walk-up-0", "arena-walk-up-1", "arena-walk-up-2", "arena-walk-up-3"] as const;
const ARENA_WALK_RIGHT_KEYS = ["arena-walk-right-0", "arena-walk-right-1"] as const;
const ARENA_WALK_LEFT_KEYS = ["arena-walk-left-0", "arena-walk-left-1"] as const;
/** Arena death: die-0 … die-3. */
const ARENA_DIE_KEYS = ["arena-die-0", "arena-die-1", "arena-die-2", "arena-die-3"] as const;
/** Arena hit (sword): hit-*-sw-0..3. */
const ARENA_HIT_DOWN_KEYS = ["arena-hit-down-0", "arena-hit-down-1", "arena-hit-down-2", "arena-hit-down-3"] as const;
const ARENA_HIT_UP_KEYS = ["arena-hit-up-0", "arena-hit-up-1", "arena-hit-up-2", "arena-hit-up-3"] as const;
const ARENA_HIT_RIGHT_KEYS = ["arena-hit-right-0", "arena-hit-right-1", "arena-hit-right-2", "arena-hit-right-3"] as const;
const ARENA_HIT_LEFT_KEYS = ["arena-hit-left-0", "arena-hit-left-1", "arena-hit-left-2", "arena-hit-left-3"] as const;
/** Arena idle (standing): pix-idle-sw-0..3. */
const ARENA_IDLE_KEYS = ["arena-idle-0", "arena-idle-1", "arena-idle-2", "arena-idle-3"] as const;
/** Idle (standing): 4 separate PNGs (pix-idle-0.png … pix-idle-3.png). */
const IDLE_KEYS = ["character-idle-0", "character-idle-1", "character-idle-2", "character-idle-3"] as const;
/** Hit (attack) animations: 4 frames each. */
const HIT_DOWN_KEYS = ["character-hit-down-0", "character-hit-down-1", "character-hit-down-2", "character-hit-down-3"] as const;
const HIT_LEFT_KEYS = ["character-hit-left-0", "character-hit-left-1", "character-hit-left-2", "character-hit-left-3"] as const;
const HIT_RIGHT_KEYS = ["character-hit-right-0", "character-hit-right-1", "character-hit-right-2", "character-hit-right-3"] as const;
const HIT_UP_KEYS = ["character-hit-up-0", "character-hit-up-1", "character-hit-up-2", "character-hit-up-3"] as const;
const CHARACTER_BASE = "/assets/characters";
const CURSOR_HIT_URL = "/assets/characters/hit.png";
/** Sword cursor in arena (PC). */
const CURSOR_SWORD_URL = "/assets/characters/sword.png";
/** Fixed display size for character on map (all textures scaled to this). */
const CHARACTER_DISPLAY_W = 80;
const CHARACTER_DISPLAY_H = 80;
// Walkable = only terrains whose name suggests a road (path/road), not general ground
const WALKABLE_TERRAIN_NAMES = /path|road/i;
// Playable area: -0.5 tiles inset on left/top/bottom, -1 tile on right
const BORDER_LEFT = 0.5;
const BORDER_TOP = 0.5;
const BORDER_BOTTOM = 0.5;
const BORDER_RIGHT = 1;

const BORDER_MAP2 = 0.5;

/** Map2 (Valley): no fixed tile; Arena POI is computed as leftmost walkable (on road). */

/** Tiles: arena monster only starts chasing when player is within this distance. */
const ARENA_MONSTER_ALERT_TILES = 4;
/** Patrol speed when not alerted (px/s). */
const ARENA_PATROL_SPEED_PX = 28;

interface ArenaMonsterData {
  sprite: Phaser.GameObjects.Sprite;
  tileX: number;
  tileY: number;
  pathSeed: number;
  hp: number;
  maxHp: number;
  damage: number;
  attackCooldownMs: number;
  speedPx: number;
  waveIndex: number;
  lastAttackAt: number;
  invulnerableUntil: number;
  hpBar: Phaser.GameObjects.Graphics;
  hpText: Phaser.GameObjects.Text;
  dead: boolean;
  alerted: boolean;
  patrolCenterX: number;
  patrolDirX: number;
}

/** Arena mode on map3: passed from main when Enter Arena / Continue is used. Server-authoritative: runId + initial monsters from POST /arena/start. currentWave0 is 0 for new run, or restored when resuming after API restart. */
export interface ArenaInitData {
  token: string;
  runId: string;
  character: { level: number; maxHp: number; currentHp: number; bowLevel: number; moveSpeedLevel: number };
  initialMonsters: { hp: number; maxHp: number; damage: number }[];
  totalWaves: number;
  currentWave0?: number;
  winsToday: number;
  battlesLeft: number;
  maxWinsPerDay: number;
  onExit: (result: "victory" | "defeat") => void;
}

/** PvP on map3: same arena location, one opponent. */
export interface PvpInitData {
  token: string;
  runId: string;
  battleId: string;
  character: { level: number; maxHp: number; currentHp: number; bowLevel: number; moveSpeedLevel: number };
  myHp: number;
  opponentHp: number;
  myMaxHp: number;
  opponentMaxHp: number;
  opponentLevel: number;
  opponentBowLevel: number;
  isPlayer1: boolean;
  onExit: () => void;
}

function getBorderLeft(mapId: string): number {
  return mapId === "map2" ? BORDER_MAP2 : BORDER_LEFT;
}
function getBorderTop(mapId: string): number {
  return mapId === "map2" ? 0 : BORDER_TOP;
}
function getBorderBottom(mapId: string): number {
  return mapId === "map2" ? BORDER_MAP2 : BORDER_BOTTOM;
}
function getBorderRight(mapId: string): number {
  return mapId === "map2" ? BORDER_MAP2 : BORDER_RIGHT;
}

/** Only objects with these names (from manifest) get a label above them. */
const LABEL_OBJECT_NAMES = new Set([
  "Home",
  "Market",
  "Mine",
  "Farm",
  "Farm (Locked)",
  "entrance",
  "Season 3",
  "Season3",
  "Arena",
]);

/** Map1 overlay-only objects (drawn on top of map, no label/click). */
const OVERLAY_OBJECT_NAMES = new Set(["market2", "market3"]);

/** Display label for object (map2: entrance → Valley, Season 3 → Season 3 (Locked), Farm (Locked) → Season 2 (Locked)). */
function getObjectDisplayLabel(name: string): string {
  if (name === "entrance") return "Valley";
  if (name === "Season 3" || name === "Season3") return "Season 3 (Locked)";
  if (name === "Farm (Locked)") return "Season 2 (Locked)";
  return name;
}

/** If true: base layer = map-composite.png (full map/tileset). If false: base = colored terrain tiles only. */
const USE_MAP_COMPOSITE = true;

declare const __BUILD_TIME__: number | undefined;
const CACHE_BUST = typeof __BUILD_TIME__ === "number" ? String(__BUILD_TIME__) : "dev";

if (typeof document !== "undefined") document.title = "Pixel Farm Valley";

const isAdminMarketPage =
  typeof document !== "undefined" &&
  (document.location.pathname === "/farmisgood/tryit" || document.location.hash === "#/farmisgood/tryit");

const PRELOADER_MIN_MS = 1000;
const preloaderStartTime = Date.now();

function asset(path: string) {
  return `${path}?v=${CACHE_BUST}`;
}

function showGameMessage(message: string): void {
  if (typeof document === "undefined") return;
  const el = document.createElement("div");
  el.className = "game-toast";
  el.textContent = message;
  el.style.cssText =
    "position:fixed;left:50%;top:20%;transform:translateX(-50%);padding:10px 16px;background:#1e1e1e;border:2px solid #fbbf24;color:#e0e0e0;font-family:inherit;font-size:10px;z-index:10004;pointer-events:none;";
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 3000);
}

/** True when chat input has focus (typing) — game should not handle arrows/WASD/space for movement. */
function isChatInputFocused(): boolean {
  if (typeof document === "undefined") return false;
  const el = document.activeElement;
  return (el?.classList?.contains("ui-chat-panel-input") === true) || (el?.tagName === "INPUT" && (el as HTMLElement).closest?.(".ui-chat-panel") != null) || false;
}

/** Mobile joystick state (set by index.html). Round stick: { x, y } in -1,0,1. */
function getJoystickDir(): { x: number; y: number } {
  const j = (typeof window !== "undefined" && (window as unknown as { __joystickDir?: { x?: number; y?: number } }).__joystickDir) ?? null;
  if (j && typeof j.x === "number" && typeof j.y === "number") return { x: j.x, y: j.y };
  return { x: 0, y: 0 };
}

// --- Map format types ---
interface MapConfig {
  mapConfig: {
    dimensions: { width: number; height: number; pixelWidth: number; pixelHeight: number };
    boundingBox?: { minX: number; minY: number; maxX: number; maxY: number };
  };
  terrains: { id: number; name: string; color: string }[];
}
interface TerrainMapData {
  defaultTerrain?: number;
  cells: { x: number; y: number; terrainId: number }[];
}
interface MapObject {
  id: string;
  name?: string;
  filename: string;
  boundingBox: { x: number; y: number; width: number; height: number };
  layer: number;
  visible: boolean;
}
interface ObjectsManifest {
  objects: MapObject[];
}

function parseColor(hex: string): number {
  return parseInt(hex.slice(1), 16);
}

class GameScene extends Phaser.Scene {
  private player!: Phaser.Physics.Arcade.Sprite;
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private wasd!: { W: Phaser.Input.Keyboard.Key; A: Phaser.Input.Keyboard.Key; S: Phaser.Input.Keyboard.Key; D: Phaser.Input.Keyboard.Key };
  private gridX = 0;
  private gridY = 0;
  private isMoving = false;
  private mapWidthTiles = 0;
  private mapHeightTiles = 0;
  private mapWidth = 0;
  private mapHeight = 0;
  private walkable = new Set<string>();
  private terrainGrid: number[][] = [];
  private mapData!: MapConfig;
  private objectSprites: Phaser.GameObjects.Image[] = [];
  private objectLabels: (Phaser.GameObjects.Text | Phaser.GameObjects.DOMElement)[] = [];
  private _viewW = 0;
  private _viewH = 0;
  private gridMinX = 0;
  private gridMinY = 0;
  /** Home object: sprite, nearest walkable tile (for path), and single door tile (upper only) that opens window. */
  private homeSprite: Phaser.GameObjects.Image | null = null;
  private homeTile: [number, number] | null = null;
  private homeDoorTile: [number, number] | null = null;
  /** Market object: same pattern as Home. */
  private marketSprite: Phaser.GameObjects.Image | null = null;
  private marketTile: [number, number] | null = null;
  private marketDoorTile: [number, number] | null = null;
  /** Mine object: same pattern as Home. */
  private mineSprite: Phaser.GameObjects.Image | null = null;
  private mineTile: [number, number] | null = null;
  private mineDoorTile: [number, number] | null = null;
  /** Arena object: same pattern as Mine. */
  private arenaSprite: Phaser.GameObjects.Image | null = null;
  private arenaTile: [number, number] | null = null;
  private arenaDoorTile: [number, number] | null = null;
  /** Farm object (for minimap marker). */
  private farmSprite: Phaser.GameObjects.Image | null = null;
  /** Display name for farm POI (e.g. "Farm" or "Season 2 (Locked)"). */
  private farmDisplayName = "Farm";
  /** Valley (map2 entrance) object. */
  private valleySprite: Phaser.GameObjects.Image | null = null;
  private valleyTile: [number, number] | null = null;
  private valleyDoorTile: [number, number] | null = null;
  /** Forge (Toly) door tile — map1. */
  private forgeDoorTile: [number, number] | null = null;
  /** Toly sprite — used for click and tap-to-move to open Forge. */
  private tolySprite: Phaser.GameObjects.Sprite | null = null;
  /** Season 3 (map2, locked) — minimap only. */
  private season3Sprite: Phaser.GameObjects.Image | null = null;
  /** Rock objects on map2 (block movement, depth so they draw in front when player is above). */
  private rockSprites: Phaser.GameObjects.Image[] = [];
  /** Grid position (gx, gy) for each rock, same index as rockSprites. */
  private rockTiles: [number, number][] = [];
  /** Progress bar DOM refs per rock (fill, pctEl) for updating from API. */
  private rockProgressBars: { fill: HTMLElement; pctEl: HTMLElement }[] = [];
  /** Queue of tiles to walk to (path to Home / Market / Mine / Valley); when empty, open target window. */
  private pathQueue: [number, number][] = [];
  private pathingToHome = false;
  private pathingToMarket = false;
  private pathingToMine = false;
  private pathingToArena = false;
  private pathingToValley = false;
  private pathingToForge = false;
  private pathingToRock = false;
  private rockTargetGx = 0;
  private rockTargetGy = 0;
  private pathingToArenaMonster = false;
  /** Cooldown until (ms) to prevent multiple hits from rapid clicks. */
  private hitCooldownUntil = 0;
  /** Canonical display size from base texture (pix.png); used for all character textures to avoid size jumps. */
  private playerDisplayW = 0;
  private playerDisplayH = 0;
  /** DOM canvas for minimap (bottom-left UI). */
  private minimapCanvas: HTMLCanvasElement | null = null;
  private _minimapFrame = 0;
  /** Current map id (map1, map2, …). Set in init(), used in preload/create. */
  private currentMapId = DEFAULT_MAP_ID;
  /** Spawn near POI after scene restart (passed in init data). */
  private pendingSpawnNear: string | undefined;
  /** True if first load started a second batch (object images); then placePlayer runs from that callback. */
  private _hadObjectsToLoad = false;
  /** Arena on map3: when true, run arena waves/monsters and use arena HUD. */
  private arenaMode = false;
  private arenaData: ArenaInitData | null = null;
  private arenaState: "PREPARE" | "WAVE" | "FIGHT" | "NEXT_WAVE" | "VICTORY" | "DEFEAT" = "PREPARE";
  private arenaMonsters: ArenaMonsterData[] = [];
  private arenaPlayerHp = 100;
  /** Display-only HP for smooth regen bar; synced to arenaPlayerHp on every server response. */
  private arenaPlayerHpDisplay = 100;
  private arenaPlayerMaxHp = 100;
  private arenaPlayerDamage = 10;
  private arenaPlayerSpeedPx = 133;
  private arenaHitCooldownUntil = 0;
  private arenaAttackTarget: ArenaMonsterData | null = null;
  private arenaLastDamageAt = 0;
  private arenaCurrentWave0 = 0;
  private arenaTotalWaves = 2;
  private arenaSpawnCountdown = 0;
  private arenaSpawnInterval = 900;
  private arenaToSpawnThisWave = 0;
  private arenaSpawnedThisWave = 0;
  private arenaNextWaveAt = 0;
  private _arenaPingIntervalId: ReturnType<typeof setInterval> | null = null;
  private arenaPlayerHpBar!: Phaser.GameObjects.Graphics;
  private arenaPlayerHpText!: Phaser.GameObjects.Text;
  private arenaPlayerNameText: Phaser.GameObjects.Text | null = null;
  private arenaHudText!: Phaser.GameObjects.Text;
  private arenaOverlayRect!: Phaser.GameObjects.Rectangle;
  private arenaOverlayTitle!: Phaser.GameObjects.Text;
  private arenaOverlaySub!: Phaser.GameObjects.Text;
  private arenaOverlayBtn!: Phaser.GameObjects.Text;
  private arenaDefeatCooldownUntil: string | null = null;
  /** When DEFEAT: show defeat overlay at this time (play die anim first, then 2s). */
  private arenaDefeatShowAt: number | null = null;
  /** When VICTORY: show victory overlay at this time (2s delay). */
  private arenaVictoryShowAt: number | null = null;
  /** Level from server when victory (for overlay "max level" text). */
  private arenaVictoryLevel: number | null = null;
  /** Server run id for arena (attack/next-wave). */
  private arenaRunId: string | null = null;

  /** PvP on map3: same arena, one opponent. */
  private pvpMode = false;
  private pvpData: PvpInitData | null = null;
  private pvpOpponent: {
    sprite: Phaser.GameObjects.Sprite;
    tileX: number;
    tileY: number;
    hp: number;
    maxHp: number;
    hpBar: Phaser.GameObjects.Graphics;
    hpText: Phaser.GameObjects.Text;
    nameText: Phaser.GameObjects.Text;
  } | null = null;
  private pvpPollRunAt = 0;
  private pvpBattleEnded = false;
  private pvpHitCooldownUntil = 0;
  private pathingToPvpOpponent = false;
  private pvpFacing: PvpFacing = "idle";
  private pvpLastPositionSendAt = 0;
  private pvpOpponentLastGridX = -1;
  private pvpOpponentLastGridY = -1;

  constructor() {
    super({ key: "Game" });
  }

  init(data?: { mapId?: string; spawnNear?: string; arenaMode?: boolean; arenaData?: ArenaInitData; pvpMode?: boolean; pvpData?: PvpInitData }) {
    if (data?.mapId) this.currentMapId = data.mapId;
    this.pendingSpawnNear = data?.spawnNear;
    this.arenaMode = data?.arenaMode ?? false;
    this.arenaData = data?.arenaData ?? null;
    this.pvpMode = data?.pvpMode ?? false;
    this.pvpData = data?.pvpData ?? null;
    if (!this.arenaMode && this._arenaPingIntervalId != null) {
      clearInterval(this._arenaPingIntervalId);
      this._arenaPingIntervalId = null;
    }
  }

  preload() {
    this.load.on("loaderror", (file: Phaser.Loader.File) => console.error("[Phaser] Load failed:", file.key, file.url));
    // Resolve assets from site origin so dynamic chunk doesn't break paths
    if (typeof window !== "undefined") this.load.setBaseURL(window.location.origin);

    const base = `/assets/locations/${this.currentMapId}`;
    const mapKey = `map-${this.currentMapId}`;
    const terrainKey = `terrain-map-${this.currentMapId}`;
    const manifestKey = `objects-manifest-${this.currentMapId}`;
    const mapBaseKey = `map-base-${this.currentMapId}`;

    this.load.json(mapKey, asset(`${base}/map.json`));
    this.load.json(terrainKey, asset(`${base}/terrain-map.json`));
    this.load.json(manifestKey, asset(`${base}/objects/manifest.json`));
    this.load.image("character", asset(`${CHARACTER_BASE}/pix.png`));
    this.load.image(WALK_DOWN_KEYS[0], asset(`${CHARACTER_BASE}/pix-walk-down-0.png`));
    this.load.image(WALK_DOWN_KEYS[1], asset(`${CHARACTER_BASE}/pix-walk-down-1.png`));
    this.load.image(WALK_DOWN_KEYS[2], asset(`${CHARACTER_BASE}/pix-walk-down-2.png`));
    this.load.image(WALK_DOWN_KEYS[3], asset(`${CHARACTER_BASE}/pix-walk-down-3.png`));
    for (let i = 0; i < WALK_RIGHT_KEYS.length; i++) {
      this.load.image(WALK_RIGHT_KEYS[i], asset(`${CHARACTER_BASE}/pix-walk-right-${i}.png`));
    }
    this.load.image(WALK_UP_KEYS[0], asset(`${CHARACTER_BASE}/pix-walk-up-0.png`));
    this.load.image(WALK_UP_KEYS[1], asset(`${CHARACTER_BASE}/pix-walk-up-1.png`));
    this.load.image(WALK_UP_KEYS[2], asset(`${CHARACTER_BASE}/pix-walk-up-2.png`));
    this.load.image(WALK_UP_KEYS[3], asset(`${CHARACTER_BASE}/pix-walk-up-3.png`));
    for (let i = 0; i < WALK_LEFT_KEYS.length; i++) {
      this.load.image(WALK_LEFT_KEYS[i], asset(`${CHARACTER_BASE}/pix-walk-left-${i}.png`));
    }
    this.load.image(IDLE_KEYS[0], asset(`${CHARACTER_BASE}/pix-idle-0.png`));
    this.load.image(IDLE_KEYS[1], asset(`${CHARACTER_BASE}/pix-idle-1.png`));
    this.load.image(IDLE_KEYS[2], asset(`${CHARACTER_BASE}/pix-idle-2.png`));
    this.load.image(IDLE_KEYS[3], asset(`${CHARACTER_BASE}/pix-idle-3.png`));
    for (let i = 0; i < 4; i++) {
      this.load.image(HIT_DOWN_KEYS[i], asset(`${CHARACTER_BASE}/hit-down-${i}.png`));
      this.load.image(HIT_LEFT_KEYS[i], asset(`${CHARACTER_BASE}/hit-left-${i}.png`));
      this.load.image(HIT_RIGHT_KEYS[i], asset(`${CHARACTER_BASE}/hit-right-${i}.png`));
      this.load.image(HIT_UP_KEYS[i], asset(`${CHARACTER_BASE}/hit-up-${i}.png`));
    }
    this.load.image(mapBaseKey, asset(`${base}/map-composite.png`));

    // After first batch — load object images; then placeObjects() then placePlayer() then finishCreateRest() so spawn uses door tiles
    this.load.once("complete", () => {
      const manifest = this.cache.json.get(manifestKey) as ObjectsManifest | undefined;
      const objects =
        manifest?.objects?.filter(
          (o) =>
            o.visible &&
            o.name?.trim() &&
            (LABEL_OBJECT_NAMES.has(o.name.trim()) || OVERLAY_OBJECT_NAMES.has(o.name.trim()))
        ) ?? [];
      this._hadObjectsToLoad = objects.length > 0;
      for (const obj of objects) {
        this.load.image(`obj-${this.currentMapId}-${obj.id}`, asset(`${base}/objects/${obj.filename}`));
      }
      if (this.currentMapId === "map1") {
        for (let i = 1; i <= 4; i++) this.load.image(`toly-${i}`, asset(`/assets/locations/map1/objects/toly-${i}.png`));
      }
      if (this.currentMapId === "map2") {
        this.load.image("obj-map2-rock1", asset(`${base}/objects/rock1.png`));
        this.load.image("obj-map2-rock2", asset(`${base}/objects/rock2.png`));
        this.load.image("obj-map2-rock3", asset(`${base}/objects/rock3.png`));
      }
      if (this.currentMapId === "map3" && (this.arenaMode || this.pvpMode)) {
        if (this.arenaMode) {
          this.load.image("arena-monster", asset("/assets/monsters/pumx.png"));
        }
        for (let i = 0; i < 4; i++) {
          this.load.image(ARENA_WALK_DOWN_KEYS[i], asset(`${CHARACTER_BASE}/pix-walk-down-sw-${i}.png`));
          this.load.image(ARENA_WALK_UP_KEYS[i], asset(`${CHARACTER_BASE}/pix-walk-up-sw-${i}.png`));
          this.load.image(ARENA_DIE_KEYS[i], asset(`${CHARACTER_BASE}/die-${i}.png`));
        }
        for (let i = 0; i < 2; i++) {
          this.load.image(ARENA_WALK_RIGHT_KEYS[i], asset(`${CHARACTER_BASE}/pix-walk-right-sw-${i}.png`));
          this.load.image(ARENA_WALK_LEFT_KEYS[i], asset(`${CHARACTER_BASE}/pix-walk-left-sw-${i}.png`));
        }
        for (let i = 0; i < 4; i++) {
          this.load.image(ARENA_HIT_DOWN_KEYS[i], asset(`${CHARACTER_BASE}/hit-down-sw-${i}.png`));
          this.load.image(ARENA_HIT_UP_KEYS[i], asset(`${CHARACTER_BASE}/hit-up-sw-${i}.png`));
          this.load.image(ARENA_HIT_RIGHT_KEYS[i], asset(`${CHARACTER_BASE}/hit-right-sw-${i}.png`));
          this.load.image(ARENA_HIT_LEFT_KEYS[i], asset(`${CHARACTER_BASE}/hit-left-sw-${i}.png`));
          this.load.image(ARENA_IDLE_KEYS[i], asset(`${CHARACTER_BASE}/pix-idle-sw-${i}.png`));
        }
        if (this.arenaMode) {
          for (let i = 0; i < 4; i++) {
            this.load.image(`monster-enter-${i}`, asset(`/assets/monsters/menter-${i}.png`));
            this.load.image(`monster-die-${i}`, asset(`/assets/monsters/mdie-${i}.png`));
          }
          for (let i = 0; i < 4; i++) {
            this.load.image(`monster-hit-down-${i}`, asset(`/assets/monsters/hit-down-${i}.png`));
            this.load.image(`monster-hit-up-${i}`, asset(`/assets/monsters/hit-up-${i}.png`));
            this.load.image(`monster-hit-right-${i}`, asset(`/assets/monsters/hit-right-${i}.png`));
          }
          this.load.image("monster-hit-left-0", asset("/assets/monsters/hit-left-0.png"));
          this.load.image("monster-hit-left-1", asset("/assets/monsters/hit-left-2.png"));
          this.load.image("monster-hit-left-2", asset("/assets/monsters/hit-left-3.png"));
          this.load.image("monster-hit-left-3", asset("/assets/monsters/hit-left-4.png"));
          for (let i = 0; i < 8; i++) {
            this.load.image(`monster-walk-left-${i}`, asset(`/assets/monsters/walk-left-${i}.png`));
            this.load.image(`monster-walk-right-${i}`, asset(`/assets/monsters/walk-right-${i}.png`));
          }
          for (let i = 0; i < 2; i++) {
            this.load.image(`monster-walk-up-${i}`, asset(`/assets/monsters/walk-up-${i}.png`));
            this.load.image(`monster-walk-down-${i}`, asset(`/assets/monsters/walk-down-${i}.png`));
          }
        }
        this._hadObjectsToLoad = true;
      }
      this._hadObjectsToLoad = this._hadObjectsToLoad || this.currentMapId === "map2";
      if (this._hadObjectsToLoad) {
        this.load.once("complete", () => {
          this.placeObjects();
          this.placePlayer();
          this.finishCreateRest();
          if (this.pvpMode && this.pvpData) this.initPvpArena();
          else if (this.arenaMode && this.arenaData) this.initArena();
        });
        this.load.start();
      }
    });
  }

  create() {
    // Defer UI overlay init to next tick so Phaser's DOM container is fully set up (avoids null.appendChild)
    // Market window is created lazily on first openMarket() to avoid appendChild errors in Phaser context
    if (typeof document !== "undefined") {
      setTimeout(() => {
        initActionsLog();
        if (document.body) initHomeWindow();
        initBackpackWindow();
        initForgeWindow();
        initArenaWindow();
        initPvpArenaWindow();
        syncHeader();
        (window as unknown as { refreshHeader?: () => void }).refreshHeader = syncHeader;
        document.getElementById("ui-avatar-btn")?.addEventListener("click", openBackpack);
      }, 0);
    }

    this.mapData = this.cache.json.get(`map-${this.currentMapId}`) as MapConfig;
    const dims = this.mapData.mapConfig.dimensions;
    this.mapWidthTiles = dims.width;
    this.mapHeightTiles = dims.height;
    this.mapWidth = dims.pixelWidth;
    this.mapHeight = dims.pixelHeight;
    const box = this.mapData.mapConfig.boundingBox;
    this.gridMinX = box?.minX ?? 0;
    this.gridMinY = box?.minY ?? 0;

    this.initTerrainGrid();
    this.initWalkable();

    this.refreshGameSize();
    const w = this.scale.width;
    const h = this.scale.height;

    this.physics.world.setBounds(0, 0, this.mapWidth, this.mapHeight);
    this.cameras.main.setBackgroundColor(0x1a1a1a);
    this.updateCameraView(w, h);

    this.scale.on("resize", () => {
      this.updateCameraView(this.scale.width, this.scale.height);
    });
    window.addEventListener("resize", () => this.refreshGameSize());

    this.drawMapBase();
    this.createCharacterAnimations();
    if (!this._hadObjectsToLoad) {
      this.placeObjects();
      this.placePlayer();
      this.finishCreateRest();
      if (this.pvpMode && this.pvpData) this.initPvpArena();
      else if (this.arenaMode && this.arenaData) this.initArena();
    }
  }

  private refreshGameSize() {
    const el = document.getElementById("game-container");
    if (el) this.scale.resize(el.clientWidth, el.clientHeight);
  }

  private updateCameraView(w: number, h: number) {
    const coverScale = Math.max(w / this.mapWidth, h / this.mapHeight);
    let zoom = Math.max(1, coverScale * 1.4) * 2;
    if (w <= 768) zoom *= 0.9;
    if (this.currentMapId === "map2") zoom *= 106 / 170;
    if (this.currentMapId === "map3") zoom *= 108 / 216; // arena: character ~108px instead of ~216px
    this.cameras.main.setZoom(zoom);
    this.cameras.main.setViewport(0, 0, w, h);
    this._viewW = w / zoom;
    this._viewH = h / zoom;
    const bl = getBorderLeft(this.currentMapId);
    const bt = getBorderTop(this.currentMapId);
    const br = getBorderRight(this.currentMapId);
    const bb = getBorderBottom(this.currentMapId);
    const x = bl * TILE_SIZE;
    const y = bt * TILE_SIZE;
    const ww = this.mapWidth - (bl + br) * TILE_SIZE;
    const hh = this.mapHeight - (bt + bb) * TILE_SIZE;
    this.cameras.main.setBounds(x, y, ww, hh);
  }

  private initTerrainGrid() {
    const data = this.cache.json.get(`terrain-map-${this.currentMapId}`) as TerrainMapData;
    const defaultId = data.defaultTerrain ?? 0;
    this.terrainGrid = Array.from({ length: this.mapHeightTiles }, () =>
      Array(this.mapWidthTiles).fill(defaultId)
    );
    for (const c of data.cells ?? []) {
      const lx = c.x - this.gridMinX;
      const ly = c.y - this.gridMinY;
      if (ly >= 0 && ly < this.mapHeightTiles && lx >= 0 && lx < this.mapWidthTiles) {
        this.terrainGrid[ly][lx] = c.terrainId;
      }
    }
  }

  private initWalkable() {
    this.walkable.clear();
    // Arena (map3): only brown terrain ("mine path tile") is walkable, not the blue/gray one
    const walkableTerrainIds =
      this.currentMapId === "map3"
        ? new Set(
            this.mapData.terrains.filter((t) => /mine path tile/i.test(t.name)).map((t) => t.id)
          )
        : new Set(
            this.mapData.terrains.filter((t) => WALKABLE_TERRAIN_NAMES.test(t.name)).map((t) => t.id)
          );
    for (let y = 0; y < this.mapHeightTiles; y++) {
      for (let x = 0; x < this.mapWidthTiles; x++) {
        if (walkableTerrainIds.has(this.terrainGrid[y][x])) this.walkable.add(`${x},${y}`);
      }
    }
  }

  private drawMapBase() {
    const mapBaseKey = `map-base-${this.currentMapId}`;
    const frame = USE_MAP_COMPOSITE && this.textures.exists(mapBaseKey) ? this.textures.getFrame(mapBaseKey, 0) : null;
    const useImage = frame && frame.cutWidth > 0 && frame.cutHeight > 0;

    if (useImage) {
      this.add.image(0, 0, mapBaseKey).setOrigin(0, 0).setDisplaySize(this.mapWidth, this.mapHeight).setDepth(0);
    } else {
      const colors: Record<number, number> = {};
      for (const t of this.mapData.terrains) colors[t.id] = parseColor(t.color);
      const defaultColor = this.mapData.terrains[0] ? parseColor(this.mapData.terrains[0].color) : 0x2d2d2d;
      const g = this.add.graphics({ x: 0, y: 0 }).setDepth(0);
      for (let ty = 0; ty < this.mapHeightTiles; ty++) {
        for (let tx = 0; tx < this.mapWidthTiles; tx++) {
          const color = colors[this.terrainGrid[ty][tx]] ?? defaultColor;
          g.fillStyle(color, 1);
          g.fillRect(tx * TILE_SIZE, ty * TILE_SIZE, TILE_SIZE, TILE_SIZE);
        }
      }
    }
  }

  /** Called after placePlayer(); sets up camera, minimap, preloader hide. */
  private finishCreateRest() {
    this.updateCameraView(this.scale.width, this.scale.height);
    this.cameras.main.setScroll(
      this.player.x - this._viewW / 2,
      this.player.y - this._viewH / 2
    );
    this.setupCameraAndInput();
    document.title = "Pixel Farm Valley";
    this.minimapCanvas = document.getElementById("minimap-canvas") as HTMLCanvasElement | null;
    this.drawMinimap();
    if (typeof window !== "undefined")
      (window as unknown as { __drawFullMap?: (c: HTMLCanvasElement) => void }).__drawFullMap = (canvas: HTMLCanvasElement) =>
        this.drawFullMapToCanvas(canvas);
    const preloader = document.getElementById("game-preloader");
    if (preloader) {
      const elapsed = Date.now() - preloaderStartTime;
      const delay = Math.max(0, PRELOADER_MIN_MS - elapsed);
      const done = () => {
        preloader.classList.add("hidden");
        (window as unknown as { __gameLoaded?: boolean; __onGameLoaded?: () => void }).__gameLoaded = true;
        const cb = (window as unknown as { __onGameLoaded?: () => void }).__onGameLoaded;
        (window as unknown as { __onGameLoaded?: () => void }).__onGameLoaded = undefined;
        cb?.();
      };
      if (delay > 0) setTimeout(done, delay);
      else done();
    }
    if (this.currentMapId !== "map2") this.setBodyCursor("");
    if (this.currentMapId === "map1" || this.currentMapId === "map2" || this.currentMapId === "map3") {
      startMapMusic(this.currentMapId);
    } else {
      stopMapMusic();
    }
  }

  shutdown(): void {
    stopMapMusic();
  }

  /** Walkable tiles reachable from player (connected roads only). */
  private getConnectedWalkable(): Set<string> {
    const out = new Set<string>();
    const startKey = `${this.gridX},${this.gridY}`;
    if (!this.walkable.has(startKey)) return out;
    const queue: [number, number][] = [[this.gridX, this.gridY]];
    const seen = new Set<string>([startKey]);
    const dirs = [[0, 1], [0, -1], [1, 0], [-1, 0]] as const;
    while (queue.length > 0) {
      const [gx, gy] = queue.shift()!;
      out.add(`${gx},${gy}`);
      for (const [dx, dy] of dirs) {
        const nx = gx + dx;
        const ny = gy + dy;
        const key = `${nx},${ny}`;
        if (this.walkable.has(key) && !seen.has(key)) {
          seen.add(key);
          queue.push([nx, ny]);
        }
      }
    }
    return out;
  }

  /** World size of minimap view (centered on player). */
  private static readonly MINIMAP_VIEW_SIZE = 40 * TILE_SIZE;

  /** Map2: leftmost walkable tile (for Arena POI so it sits on the road). */
  private getMap2ArenaPoiTile(): [number, number] | null {
    if (this.currentMapId !== "map2" || this.walkable.size === 0) return null;
    let best: [number, number] | null = null;
    let minGx = Infinity;
    for (const key of this.walkable) {
      const [gx, gy] = key.split(",").map(Number);
      if (gx < minGx) {
        minGx = gx;
        best = [gx, gy];
      }
    }
    return best;
  }

  /** Tiles to show as road on minimap (connected walkable + Home/Market/Mine/Valley door/target tiles, not Farm). */
  private getMinimapRoadTiles(): Set<string> {
    const out = new Set(this.getConnectedWalkable());
    const attach = [
      this.homeTile,
      this.homeDoorTile,
      this.marketTile,
      this.marketDoorTile,
      this.mineTile,
      this.mineDoorTile,
      this.arenaTile,
      this.arenaDoorTile,
      this.valleyTile,
      this.valleyDoorTile,
    ] as ([number, number] | null)[];
    for (const t of attach) {
      if (t) out.add(`${t[0]},${t[1]}`);
    }
    return out;
  }

  /** Draw minimap: viewport follows player, roads (muted) + POI dots (bright) + player. Clip to circle so POIs outside are hidden. */
  private drawMinimap() {
    if (!this.minimapCanvas) return;
    const ctx = this.minimapCanvas.getContext("2d");
    if (!ctx) return;
    const cw = this.minimapCanvas.width;
    const ch = this.minimapCanvas.height;
    const viewSize =
      this.currentMapId === "map2"
        ? GameScene.MINIMAP_VIEW_SIZE / 1.5
        : this.currentMapId === "map3"
          ? GameScene.MINIMAP_VIEW_SIZE / 2
          : GameScene.MINIMAP_VIEW_SIZE;
    const viewLeft = this.player.x - viewSize / 2;
    // Map2: minimap centered vertically in circle (only pans left/right with player); allow negative viewTop so small map is centered
    const viewTop =
      this.currentMapId === "map2"
        ? this.mapHeight / 2 - viewSize / 2
        : this.currentMapId === "map3"
          ? this.mapHeight / 2 - viewSize / 2
          : this.player.y - viewSize / 2;
    const scaleX = cw / viewSize;
    const scaleY = ch / viewSize;
    const toCanvasX = (wx: number) => (wx - viewLeft) * scaleX;
    const toCanvasY = (wy: number) => (wy - viewTop) * scaleY;

    ctx.save();
    ctx.beginPath();
    ctx.arc(cw / 2, ch / 2, Math.min(cw, ch) / 2, 0, Math.PI * 2);
    ctx.clip();
    ctx.fillStyle = "#1a1a1a";
    ctx.fillRect(0, 0, cw, ch);
    const roadTiles = this.getMinimapRoadTiles();
    ctx.fillStyle = "#166534";
    for (const key of roadTiles) {
      const [gx, gy] = key.split(",").map(Number);
      const wx = gx * TILE_SIZE;
      const wy = gy * TILE_SIZE;
      if (wx + TILE_SIZE < viewLeft || wx > viewLeft + viewSize) continue;
      if (wy + TILE_SIZE < viewTop || wy > viewTop + viewSize) continue;
      const x = toCanvasX(wx);
      const y = toCanvasY(wy);
      const w = Math.ceil(TILE_SIZE * scaleX) || 1;
      const h = Math.ceil(TILE_SIZE * scaleY) || 1;
      ctx.fillRect(x, y, w, h);
    }
    const poiRadius = 6;
    ctx.fillStyle = "#22c55e";
    if (this.currentMapId !== "map3") {
      const spritesToShow =
        this.currentMapId === "map2"
          ? [this.homeSprite, this.marketSprite, this.mineSprite, this.farmSprite, this.valleySprite, this.season3Sprite]
          : [this.homeSprite, this.marketSprite, this.mineSprite, this.arenaSprite, this.farmSprite, this.valleySprite, this.season3Sprite, this.tolySprite];
      for (const sprite of spritesToShow) {
        if (!sprite) continue;
        let worldX = sprite.x;
        let worldY = sprite.y;
        if (sprite === this.arenaSprite) {
          worldX -= TILE_SIZE * 5;
        }
        const cx = toCanvasX(worldX);
        const cy = toCanvasY(worldY);
        if (cx < -poiRadius || cx > cw + poiRadius || cy < -poiRadius || cy > ch + poiRadius) continue;
        ctx.beginPath();
        ctx.arc(cx, cy, poiRadius, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.fillStyle = "#fbbf24";
    const px = toCanvasX(this.player.x);
    const py = toCanvasY(this.player.y);
    ctx.beginPath();
    ctx.arc(px, py, 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  /** Draw full map to a canvas (for map window popup). Called from DOM when map window opens. */
  drawFullMapToCanvas(canvas: HTMLCanvasElement) {
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const cw = canvas.width;
    const ch = canvas.height;
    const scale = Math.min(cw / this.mapWidth, ch / this.mapHeight);
    const offsetX = (cw - this.mapWidth * scale) / 2;
    const offsetY = (ch - this.mapHeight * scale) / 2;
    const toCanvasX = (wx: number) => offsetX + wx * scale;
    const toCanvasY = (wy: number) => offsetY + wy * scale;

    ctx.fillStyle = "#1a1a1a";
    ctx.fillRect(0, 0, cw, ch);
    const roadTiles = this.getMinimapRoadTiles();
    ctx.fillStyle = "#166534";
    for (const key of roadTiles) {
      const [gx, gy] = key.split(",").map(Number);
      const wx = gx * TILE_SIZE;
      const wy = gy * TILE_SIZE;
      const x = toCanvasX(wx);
      const y = toCanvasY(wy);
      const w = Math.ceil(TILE_SIZE * scale) || 1;
      const h = Math.ceil(TILE_SIZE * scale) || 1;
      ctx.fillRect(x, y, w, h);
    }
    const poiRadius = Math.max(8, 16 * scale);
    const labelFont = '8px "Press Start 2P"';
    ctx.font = labelFont;
    ctx.textAlign = "center";
    /** POI: use door tile (end of route) for Home/Market/Mine so road enters circle; Farm uses sprite position. */
    const pois: { wx: number; wy: number; name: string }[] = [];
    if (this.homeDoorTile) {
      const [gx, gy] = this.homeDoorTile;
      pois.push({ wx: gx * TILE_SIZE + TILE_SIZE / 2, wy: gy * TILE_SIZE + TILE_SIZE / 2, name: "Home" });
    }
    if (this.marketDoorTile) {
      const [gx, gy] = this.marketDoorTile;
      pois.push({ wx: gx * TILE_SIZE + TILE_SIZE / 2, wy: gy * TILE_SIZE + TILE_SIZE / 2, name: "Market" });
    }
    if (this.mineDoorTile) {
      const [gx, gy] = this.mineDoorTile;
      pois.push({ wx: gx * TILE_SIZE + TILE_SIZE / 2, wy: gy * TILE_SIZE + TILE_SIZE / 2, name: "Mine" });
    }
    if (this.farmSprite)
      pois.push({ wx: this.farmSprite.x, wy: this.farmSprite.y, name: this.farmDisplayName });
    if (this.valleyDoorTile) {
      const [gx, gy] = this.valleyDoorTile;
      pois.push({ wx: gx * TILE_SIZE + TILE_SIZE / 2, wy: gy * TILE_SIZE + TILE_SIZE / 2, name: "Valley" });
    }
    if (this.season3Sprite)
      pois.push({ wx: this.season3Sprite.x, wy: this.season3Sprite.y, name: "Season 3 (Locked)" });
    if (this.currentMapId === "map3" && this.arenaDoorTile) {
      const [gx, gy] = this.arenaDoorTile;
      pois.push({ wx: gx * TILE_SIZE + TILE_SIZE / 2, wy: gy * TILE_SIZE + TILE_SIZE / 2, name: "Arena" });
    }
    if (this.tolySprite) {
      pois.push({ wx: this.tolySprite.x, wy: this.tolySprite.y, name: "toly" });
    }
    const lineHeight = 10;
    for (const { wx, wy, name } of pois) {
      const cx = toCanvasX(wx);
      const cy = toCanvasY(wy);
      ctx.fillStyle = "#22c55e";
      ctx.beginPath();
      ctx.arc(cx, cy, poiRadius, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#22c55e";
      if (name === "Season 3 (Locked)") {
        ctx.fillText("Season 3", cx, cy - poiRadius - 4);
        ctx.fillText("(Locked)", cx, cy - poiRadius - 4 + lineHeight);
      } else if (name === "Season 2 (Locked)") {
        ctx.fillText("Season 2", cx, cy - poiRadius - 4);
        ctx.fillText("(Locked)", cx, cy - poiRadius - 4 + lineHeight);
      } else {
        ctx.fillText(name, cx, cy - poiRadius - 4);
      }
    }
    const playerRadius = Math.max(4, 8 * scale);
    const px = toCanvasX(this.player.x);
    const py = toCanvasY(this.player.y);
    ctx.fillStyle = "#fbbf24";
    ctx.beginPath();
    ctx.arc(px, py, playerRadius, 0, Math.PI * 2);
    ctx.fill();
    const playerName =
      (typeof document !== "undefined" && document.getElementById("ui-player-name")?.textContent?.trim()) || "Pix";
    ctx.fillStyle = "#fbbf24";
    ctx.fillText(playerName, px, py - playerRadius - 6);
  }

  private setupCameraAndInput() {
    this.cameras.main.setRoundPixels(true);
    this.cameras.main.setDeadzone(0, 0);
    this.cameras.main.setScroll(
      this.player.x - this._viewW / 2,
      this.player.y - this._viewH / 2
    );
    this.cameras.main.startFollow(this.player, true, 0.1, 0.1);
    this.cursors = this.input.keyboard!.createCursorKeys();
    this.wasd = {
      W: this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.W),
      A: this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.A),
      S: this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.S),
      D: this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.D),
    };
    this.setupTapToMove();
  }

  /** Pointerdown: arena monster click (all devices); on touch also tap-to-move on road. */
  private setupTapToMove() {
    const tempVec = new Phaser.Math.Vector2();
    this.input.on("pointerdown", (pointer: Phaser.Input.Pointer) => {
      prepareSfx();
      if (isSessionInvalid()) return;
      if (isHomeOpen() || isMarketOpen() || isMineOpen() || isArenaOpen() || isValleyOpen() || isBackpackOpen() || isForgeOpen()) return;
      if (typeof document !== "undefined" && document.getElementById("ui-map-overlay")?.classList.contains("open"))
        return;
      if (!this.isClickOnGameCanvas(pointer)) return;
      (document.querySelector(".ui-chat-panel-input") as HTMLInputElement | null)?.blur();
      this.cameras.main.getWorldPoint(pointer.x, pointer.y, tempVec);
      if (this.pvpMode && !this.pvpBattleEnded) {
        const pvpHandled = this.onPvpPointerDown(tempVec.x, tempVec.y);
        if (pvpHandled) return;
      }
      if (this.arenaMode && this.arenaState !== "VICTORY" && this.arenaState !== "DEFEAT") {
        const arenaHandled = this.onArenaPointerDown(tempVec.x, tempVec.y);
        if (arenaHandled) return;
      }
      const isTouch = this.sys.game.device.input.touch;
      if (isTouch && (this.isMoving || this.pathQueue.length > 0)) {
        const gx = Math.floor(tempVec.x / TILE_SIZE);
        const gy = Math.floor(tempVec.y / TILE_SIZE);
        if (this.isWalkable(gx, gy)) {
          const hit = this.input.hitTestPointer(pointer);
          const interactive: Phaser.GameObjects.GameObject[] = [
            this.homeSprite,
            this.marketSprite,
            this.mineSprite,
            this.farmSprite,
            this.tolySprite,
            ...this.rockSprites,
            ...(this.arenaMode ? this.arenaMonsters.map((m) => m.sprite) : []),
          ].filter(Boolean) as Phaser.GameObjects.GameObject[];
          if (!hit.some((o) => interactive.includes(o))) {
            this.cancelPathing();
            return;
          }
        }
      }
      if (!isTouch) return;
      if (this.isMoving || this.pathQueue.length > 0) return;
      const gx = Math.floor(tempVec.x / TILE_SIZE);
      const gy = Math.floor(tempVec.y / TILE_SIZE);
      if (!this.isWalkable(gx, gy)) return;
      if (gx === this.gridX && gy === this.gridY) return;
      const hit = this.input.hitTestPointer(pointer);
      const interactive: Phaser.GameObjects.GameObject[] = [
        this.homeSprite,
        this.marketSprite,
        this.mineSprite,
        this.farmSprite,
        this.tolySprite,
        ...this.rockSprites,
      ].filter(Boolean) as Phaser.GameObjects.GameObject[];
      if (hit.some((o) => interactive.includes(o))) return;
      const path = this.bfsPath(this.gridX, this.gridY, gx, gy);
      if (path.length === 0) return;
      this.cancelPathing();
      this.pathQueue = path.slice(1);
      const next = path[0];
      this.tryMove(next[0] - this.gridX, next[1] - this.gridY, () => this.onPathStepComplete());
    });
  }

  private placeObjects() {
    this.homeSprite = null;
    this.homeTile = null;
    this.homeDoorTile = null;
    this.marketSprite = null;
    this.marketTile = null;
    this.marketDoorTile = null;
    this.mineSprite = null;
    this.mineTile = null;
    this.mineDoorTile = null;
    this.arenaSprite = null;
    this.arenaTile = null;
    this.arenaDoorTile = null;
    this.farmSprite = null;
    this.farmDisplayName = "Farm";
    this.valleySprite = null;
    this.valleyTile = null;
    this.valleyDoorTile = null;
    this.forgeDoorTile = null;
    this.tolySprite = null;
    this.season3Sprite = null;
    for (const sprite of this.objectSprites) sprite.destroy();
    this.objectSprites.length = 0;
    for (const sprite of this.rockSprites) sprite.destroy();
    this.rockSprites.length = 0;
    this.rockTiles.length = 0;
    this.rockProgressBars.length = 0;
    for (const label of this.objectLabels) label.destroy();
    this.objectLabels.length = 0;

    const manifest = this.cache.json.get(`objects-manifest-${this.currentMapId}`) as ObjectsManifest | undefined;
    const hasRocks = this.currentMapId === "map2" && this.textures.exists("obj-map2-rock1");
    if (!manifest?.objects?.length && !hasRocks) {
      console.warn("[Labels] No manifest or empty objects");
      return;
    }

    let placed = 0;
    let labelsCreated = 0;
    const offsetX = this.gridMinX * TILE_SIZE;
    const offsetY = this.gridMinY * TILE_SIZE;
    /** Overlay sprites only for these 4 (map-composite already has all objects). Shift +1 tile right, +1 tile down to align. */
    const shiftX = TILE_SIZE;
    const shiftY = TILE_SIZE;

    for (const obj of manifest?.objects ?? []) {
      const labelText = obj.name?.trim();
      if (!labelText || !LABEL_OBJECT_NAMES.has(labelText)) continue;
      if (!obj.visible || !this.textures.exists(`obj-${this.currentMapId}-${obj.id}`)) continue;
      placed++;
      const { x, y, width, height } = obj.boundingBox;
      const wx = x - offsetX + shiftX;
      const wy = y - offsetY + shiftY;
      const img = this.add
        .image(wx + width / 2, wy + height / 2, `obj-${this.currentMapId}-${obj.id}`)
        .setDisplaySize(width, height)
        .setOrigin(0.5, 0.5)
        .setDepth(obj.layer ?? 1);
      this.objectSprites.push(img);

      if (labelText === "Home") {
        this.homeSprite = img;
        const centerX = wx + width / 2;
        const centerY = wy + height / 2;
        const cx = Math.floor(centerX / TILE_SIZE);
        const cy = Math.floor(centerY / TILE_SIZE);
        this.homeTile = this.findNearestWalkableTile(cx, cy);
        const upperTile: [number, number] = [cx, cy - 1];
        this.homeDoorTile = this.isWalkable(upperTile[0], upperTile[1]) ? upperTile : this.homeTile;
        img.setInteractive({ useHandCursor: true });
        img.on("pointerdown", (pointer: Phaser.Input.Pointer) => {
          if (!this.isClickOnGameCanvas(pointer)) return;
          this.handleHomeClick();
        });
      }
      if (labelText === "Market") {
        this.marketSprite = img;
        const centerX = wx + width / 2;
        const centerY = wy + height / 2;
        const cx = Math.floor(centerX / TILE_SIZE);
        const cy = Math.floor(centerY / TILE_SIZE);
        this.marketTile = this.findNearestWalkableTile(cx, cy);
        const upperTile: [number, number] = [cx, cy - 1];
        this.marketDoorTile = this.isWalkable(upperTile[0], upperTile[1]) ? upperTile : this.marketTile;
        img.setInteractive({ useHandCursor: true });
        img.on("pointerdown", (pointer: Phaser.Input.Pointer) => {
          if (!this.isClickOnGameCanvas(pointer)) return;
          this.handleMarketClick();
        });
      }
      if (labelText === "Mine") {
        this.mineSprite = img;
        const centerX = wx + width / 2;
        const centerY = wy + height / 2;
        const cx = Math.floor(centerX / TILE_SIZE);
        const cy = Math.floor(centerY / TILE_SIZE);
        this.mineTile = this.findNearestWalkableTile(cx, cy);
        // Mine entrance: tile under the "Mine" label — 1 higher and 1 right (cx+1, cy-3)
        const entranceTile: [number, number] = [cx + 1, cy - 3];
        this.mineDoorTile = this.isWalkable(entranceTile[0], entranceTile[1])
          ? entranceTile
          : this.isWalkable(cx, cy - 2)
            ? [cx, cy - 2]
            : this.isWalkable(cx, cy - 1)
              ? [cx, cy - 1]
              : this.mineTile;
        img.setInteractive({ useHandCursor: true });
        img.on("pointerdown", (pointer: Phaser.Input.Pointer) => {
          if (!this.isClickOnGameCanvas(pointer)) return;
          this.handleMineClick();
        });
      }
      if (labelText === "Arena") {
        this.arenaSprite = img;
        const centerX = wx + width / 2;
        const centerY = wy + height / 2;
        const cx = Math.floor(centerX / TILE_SIZE);
        const cy = Math.floor(centerY / TILE_SIZE);
        this.arenaTile = this.findNearestWalkableTile(cx, cy);
        const upperTile: [number, number] = [cx, cy - 1];
        this.arenaDoorTile = this.isWalkable(upperTile[0], upperTile[1]) ? upperTile : this.arenaTile;
        img.setInteractive({ useHandCursor: true });
        img.on("pointerdown", (pointer: Phaser.Input.Pointer) => {
          if (!this.isClickOnGameCanvas(pointer)) return;
          this.handleArenaClick();
        });
      }
      if (labelText === "Farm" || labelText === "Farm (Locked)") {
        this.farmSprite = img;
        this.farmDisplayName = getObjectDisplayLabel(labelText);
      }
      if (labelText === "entrance") {
        this.valleySprite = img;
        const centerX = wx + width / 2;
        const centerY = wy + height / 2;
        const cx = Math.floor(centerX / TILE_SIZE);
        const cy = Math.floor(centerY / TILE_SIZE);
        this.valleyTile = this.findNearestWalkableTile(cx, cy);
        // Valley entrance: 1 tile left and 1 tile down from object center
        const doorTile: [number, number] = [cx - 1, cy + 1];
        this.valleyDoorTile = this.isWalkable(doorTile[0], doorTile[1]) ? doorTile : this.valleyTile;
        img.setInteractive({ useHandCursor: true });
        img.on("pointerdown", (pointer: Phaser.Input.Pointer) => {
          if (!this.isClickOnGameCanvas(pointer)) return;
          this.handleValleyClick();
        });
      }
      if (labelText === "Season 3" || labelText === "Season3") {
        this.season3Sprite = img;
      }

      const labelOffsetY = labelText === "Mine" ? 4 * TILE_SIZE : 2 * TILE_SIZE;
      const labelOffsetX = labelText === "Mine" ? TILE_SIZE : 0;
      const displayLabel = getObjectDisplayLabel(labelText);
      if (labelText === "Arena") {
        const elA = document.createElement("div");
        elA.className = "obj-label";
        elA.textContent = "Arena";
        if (typeof this.add.dom === "function") {
          const labelXA = wx;
          const labelYA = wy + height / 2 - height * 0.05;
          const domA = this.add.dom(labelXA, labelYA, elA).setOrigin(0, 1).setDepth(9999);
          this.objectLabels.push(domA);
          labelsCreated++;
        }
      } else {
      try {
        const el = document.createElement("div");
        el.className = "obj-label";
        if (displayLabel === "Season 3 (Locked)") {
          el.innerHTML = "Season 3<br>(Locked)";
        } else if (displayLabel === "Season 2 (Locked)") {
          el.innerHTML = "Season 2<br>(Locked)";
        } else {
          el.textContent = displayLabel;
        }
        if (typeof this.add.dom !== "function") {
          console.warn("[Labels] this.add.dom is not a function — enable dom.createContainer in config");
        } else {
          const cx = wx + width / 2 + labelOffsetX;
          const labelY = wy - 8 + labelOffsetY;
          const dom = this.add.dom(cx, labelY, el).setOrigin(0.5, 1).setDepth(9999);
          this.objectLabels.push(dom);
          labelsCreated++;
        }
      } catch (e) {
        console.warn("[Labels] Failed to create label for", labelText, e);
      }
      }
    }

    // Map1: place overlay-only objects (market2, market3) on top of map
    if (this.currentMapId === "map1" && manifest?.objects) {
      for (const obj of manifest.objects) {
        const name = obj.name?.trim();
        if (!obj.visible || !name || !OVERLAY_OBJECT_NAMES.has(name)) continue;
        const key = `obj-${this.currentMapId}-${obj.id}`;
        if (!this.textures.exists(key)) continue;
        const { x, y, width, height } = obj.boundingBox;
        const wx = x - offsetX + shiftX;
        const wy = y - offsetY + shiftY;
        const depth = (obj.layer ?? 1) + 20;
        const img = this.add
          .image(wx + width / 2, wy + height / 2, key)
          .setDisplaySize(width, height)
          .setOrigin(0.5, 0.5)
          .setDepth(depth);
        this.objectSprites.push(img);
      }
    }

    // Toly (Forge) — map1. Raw top-left (1125, 562), size 101×105. Use same offset/shift as map1 objects.
    if (this.currentMapId === "map1" && this.textures.exists("toly-1")) {
      if (!this.anims.exists("toly-idle")) {
        this.anims.create({
          key: "toly-idle",
          frames: [{ key: "toly-1" }, { key: "toly-2" }, { key: "toly-3" }, { key: "toly-4" }],
          frameRate: 4,
          repeat: -1,
        });
      }
      const tolyW = 101;
      const tolyH = 105;
      const tolyLeftRaw = 1125 + TILE_SIZE;
      const tolyTopRaw = 562 + TILE_SIZE;
      const tolyLeft = tolyLeftRaw - offsetX + shiftX;
      const tolyTop = tolyTopRaw - offsetY + shiftY;
      const tolyX = tolyLeft + tolyW / 2;
      const tolyYBase = tolyTop + tolyH / 2;
      const tolyY = tolyYBase + tolyH * 0.1;
      const tolyTopShifted = tolyY - tolyH / 2;
      const tolySprite = this.add
        .sprite(tolyX, tolyY, "toly-1")
        .setDisplaySize(tolyW, tolyH)
        .setOrigin(0.5, 0.5)
        .setDepth(10002);
      tolySprite.play("toly-idle");
      this.objectSprites.push(tolySprite);
      this.tolySprite = tolySprite;
      tolySprite.setInteractive({ useHandCursor: true });
      tolySprite.on("pointerdown", (pointer: Phaser.Input.Pointer) => {
        if (!this.isClickOnGameCanvas(pointer)) return;
        this.handleForgeClick();
      });
      const tilex = Math.floor((tolyX - tolyW / 2) / TILE_SIZE);
      const tiley = Math.floor((tolyY - tolyH / 2) / TILE_SIZE);
      const objGx = tilex + 1;
      const objGy = tiley + 2;
      this.walkable.delete(`${objGx},${objGy}`);
      this.walkable.delete(`${objGx + 1},${objGy}`);
      this.walkable.delete(`${objGx},${objGy + 1}`);
      this.walkable.delete(`${objGx + 1},${objGy + 1}`);
      const doorGx = objGx + 2;
      const doorGy = objGy + 1;
      this.forgeDoorTile = this.walkable.has(`${doorGx},${doorGy}`)
        ? [doorGx, doorGy]
        : this.findNearestWalkableTile(objGx, objGy);
      const TOLY_QUOTES = [
        "Hello, farmer why you holding metal just flip it to gold and giga farm.",
        "Gm, farm upgrades are like Solana upgrades performance is everything swap silver push gold.",
        "Gold is king metal is pre-alpha, like buying SOL per 1$.",
        "How was your farming today? Swap that silver, don't be emotional.",
        "Throughput on your farm kinda low need more gold anon.",
        "Bronze stacking is cute but gold stacking is legendary\n© Toly Yakovenko",
        "You here to farm or just vibe in the fields with me, ser?",
      ];
      if (typeof this.add.dom === "function") {
        const labelEl = document.createElement("div");
        labelEl.className = "obj-label-toly";
        labelEl.textContent = "toly";
        (labelEl as HTMLElement).style.pointerEvents = "none";
        const labelY = tolyTopShifted + 20;
        const labelDom = this.add.dom(tolyX, labelY, labelEl).setOrigin(0.5, 1).setDepth(9999).setScale(0.5);
        this.objectLabels.push(labelDom);
        const speechEl = document.createElement("div");
        speechEl.className = "toly-speech";
        const speechTextSpan = document.createElement("span");
        speechTextSpan.className = "toly-speech-text";
        speechTextSpan.textContent = TOLY_QUOTES[0];
        speechEl.appendChild(speechTextSpan);
        const tailSpan = document.createElement("span");
        tailSpan.className = "toly-speech-tail";
        speechEl.appendChild(tailSpan);
        (speechEl as HTMLElement).style.pointerEvents = "none";
        const speechX = tolyX;
        const speechY = labelY - 18;
        const speechDom = this.add.dom(speechX, speechY, speechEl).setOrigin(0.5, 1).setDepth(10001).setScale(0.5);
        this.objectLabels.push(speechDom);
        const syncSpeechSize = () => {
          if (typeof (speechDom as unknown as { updateSize?: () => void }).updateSize === "function") {
            (speechDom as unknown as { updateSize: () => void }).updateSize();
          }
        };
        this.time.delayedCall(100, syncSpeechSize);
        let speechVisible = true;
        let quoteIndex = 0;
        this.time.addEvent({
          delay: 5000,
          callback: () => {
            speechVisible = !speechVisible;
            speechDom.setVisible(speechVisible);
            if (speechVisible) {
              quoteIndex = (quoteIndex + 1) % TOLY_QUOTES.length;
              speechTextSpan.textContent = TOLY_QUOTES[quoteIndex];
              this.time.delayedCall(50, syncSpeechSize);
            }
          },
          loop: true,
        });
      }
    }

    if (hasRocks) this.placeRocksMap2();
  }

  /** Rock texture by health: rock1 >50%, rock2 30–50%, rock3 <30%. */
  private rockTextureKey(healthPct: number): string {
    if (healthPct > 50) return "obj-map2-rock1";
    if (healthPct > 30) return "obj-map2-rock2";
    return "obj-map2-rock3";
  }

  private updateRockProgressBar(rockIndex: number, healthPct: number): void {
    const bar = this.rockProgressBars[rockIndex];
    if (!bar) return;
    bar.fill.style.width = `${healthPct}%`;
    bar.pctEl.textContent = `${healthPct}%`;
  }

  private setRockSpriteByHealth(rockIndex: number, healthPct: number): void {
    const sprite = this.rockSprites[rockIndex];
    if (!sprite || !this.textures.exists(this.rockTextureKey(healthPct))) return;
    sprite.setTexture(this.rockTextureKey(healthPct));
  }

  /** Fetch rock health from server and update progress bars + sprites. */
  private refreshRockStateFromServer(): void {
    const token = getToken();
    if (!token || this.currentMapId !== "map2") return;
    getMiningRocks(token, this.currentMapId).then((res) => {
      if (!res.ok || !res.data.rocks) return;
      for (const r of res.data.rocks) {
        this.updateRockProgressBar(r.rockIndex, r.healthPct);
        this.setRockSpriteByHealth(r.rockIndex, r.healthPct);
      }
    });
  }

  /** Map2: place 6 rock sprites (3x tile size) in wide areas only. Block 1 tile wide × 3 tiles tall (center column); character drawn on top. */
  private placeRocksMap2() {
    if (!this.textures.exists("obj-map2-rock1")) return;
    const ROCK_DISPLAY_SIZE = TILE_SIZE * 3;
    /** Count walkable tiles in 3x3 around (gx, gy). */
    const walkableCount3x3 = (gx: number, gy: number): number => {
      let n = 0;
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++)
          if (this.isWalkable(gx + dx, gy + dy)) n++;
      return n;
    };
    /** Candidate tile positions — spread out on map2 34x18 (with requested offsets). */
    const candidates: [number, number][] = [
      [10, 5],   // 1. upper left
      [18, 6],   // 2. upper middle
      [24, 4],   // 3. upper right
      [25, 11],  // 4. lower right
      [16, 13],  // 5. lower middle
      [9, 13],   // 6. lower left
    ];
    const used = new Set<string>();
    const isAdjacent = (gx: number, gy: number) => {
      for (const key of used) {
        const [ux, uy] = key.split(",").map(Number);
        if (Math.abs(ux - gx) <= 2 && Math.abs(uy - gy) <= 2) return true;
      }
      return false;
    };
    let placed = 0;
    for (const [cx, cy] of candidates) {
      if (placed >= 6) break;
      const [gx, gy] = this.isWalkable(cx, cy) ? [cx, cy] : this.findNearestWalkableTile(cx, cy);
      if (walkableCount3x3(gx, gy) < 4) continue;
      const key = `${gx},${gy}`;
      if (used.has(key) || isAdjacent(gx, gy)) continue;
      for (let dy = -1; dy <= 0; dy++) this.walkable.delete(`${gx},${gy + dy}`);
      used.add(key);
      const px = gx * TILE_SIZE + TILE_SIZE / 2;
      const py = gy * TILE_SIZE + TILE_SIZE / 2;
      const img = this.add
        .image(px, py, "obj-map2-rock1")
        .setDisplaySize(ROCK_DISPLAY_SIZE, ROCK_DISPLAY_SIZE)
        .setOrigin(0.5, 0.5)
        .setDepth(400);
      this.rockSprites.push(img);
      this.rockTiles.push([gx, gy]);
      img.setInteractive({ useHandCursor: false });
      img.on("pointerover", () => this.setBodyCursor(`url(${CURSOR_HIT_URL}) 16 16, auto`));
      img.on("pointerout", () => this.setBodyCursor(""));
      img.on("pointerdown", (pointer: Phaser.Input.Pointer) => {
        if (!this.isClickOnGameCanvas(pointer)) return;
        this.handleRockClick(gx, gy);
      });
      try {
        const initialPct = 100;
        const wrapper = document.createElement("div");
        wrapper.className = "rock-progress-bar";
        const track = document.createElement("div");
        track.className = "rock-progress-track";
        const fill = document.createElement("div");
        fill.className = "rock-progress-fill";
        fill.style.width = `${initialPct}%`;
        track.appendChild(fill);
        const pctEl = document.createElement("div");
        pctEl.className = "rock-progress-pct";
        pctEl.textContent = `${initialPct}%`;
        track.appendChild(pctEl);
        wrapper.appendChild(track);
        this.rockProgressBars.push({ fill, pctEl });
        if (typeof this.add.dom === "function") {
          const dom = this.add.dom(px, py - ROCK_DISPLAY_SIZE / 2 - 4 + 15 - 10, wrapper).setOrigin(0.5, 1).setDepth(9999);
          this.objectLabels.push(dom);
        }
      } catch (e) {
        console.warn("[Rocks] Failed to create progress bar", e);
      }
      placed++;
    }
    this.refreshRockStateFromServer();
  }

  /** Spawn position: uses pendingSpawnNear + door tiles (set by placeObjects). Called after placeObjects() so mine/valley tiles exist. */
  private placePlayer() {
    if (this.player) this.player.destroy();
    const spawnNear = this.pendingSpawnNear;
    let gx: number;
    let gy: number;
    if (spawnNear === "mine" && this.mineDoorTile) {
      const [mx, my] = this.mineDoorTile;
      const nearTile: [number, number] = [mx, my + 1];
      [gx, gy] = this.isWalkable(nearTile[0], nearTile[1])
        ? nearTile
        : this.findNearestWalkableTile(nearTile[0], nearTile[1]);
      this.pendingSpawnNear = undefined;
    } else if (spawnNear === "arena" && this.arenaDoorTile) {
      const [ax, ay] = this.arenaDoorTile;
      const nearTile: [number, number] = [ax - 1, ay];
      [gx, gy] = this.isWalkable(nearTile[0], nearTile[1])
        ? nearTile
        : this.findNearestWalkableTile(nearTile[0], nearTile[1]);
      this.pendingSpawnNear = undefined;
    } else if ((spawnNear === "valley" || this.currentMapId === "map2") && this.valleyDoorTile) {
      const [dx, dy] = this.valleyDoorTile;
      const spawnTile: [number, number] = [dx - 1, dy + 2];
      [gx, gy] = this.isWalkable(spawnTile[0], spawnTile[1])
        ? spawnTile
        : this.findNearestWalkableTile(spawnTile[0], spawnTile[1]);
      this.pendingSpawnNear = undefined;
    } else if (this.currentMapId === "map3") {
      [gx, gy] = this.findArenaSpawn();
      this.pendingSpawnNear = undefined;
    } else {
      [gx, gy] = this.findSpawnOnRoad();
    }
    this.gridX = gx;
    this.gridY = gy;
    const px = gx * TILE_SIZE + TILE_SIZE / 2;
    const py = gy * TILE_SIZE + TILE_SIZE / 2 + CHARACTER_Y_OFFSET;

    this.player = this.physics.add.sprite(px, py, "character");
    this.playerDisplayW = CHARACTER_DISPLAY_W;
    this.playerDisplayH = CHARACTER_DISPLAY_H;
    this.player.setOrigin(0.5, 0.5).setDepth(2000).setDisplaySize(CHARACTER_DISPLAY_W, CHARACTER_DISPLAY_H);
    const body = this.player.body as Phaser.Physics.Arcade.Body;
    body.setSize(this.playerDisplayW * 0.5, this.playerDisplayH * 0.7);
    body.setOffset(this.playerDisplayW * 0.25, this.playerDisplayH * 0.15);
    // Start with idle animation when standing
    if (this.textures.exists(IDLE_KEYS[0]) && this.anims.exists("idle")) {
      this.player.setTexture(IDLE_KEYS[0], 0);
      this.player.setDisplaySize(this.playerDisplayW, this.playerDisplayH);
      this.player.anims.play("idle", true);
    }
  }

  private createCharacterAnimations() {
    const walkAnims: { key: string; keys: readonly string[] }[] = [
      { key: "walk-down", keys: WALK_DOWN_KEYS },
      { key: "walk-right", keys: WALK_RIGHT_KEYS },
      { key: "walk-up", keys: WALK_UP_KEYS },
      { key: "walk-left", keys: WALK_LEFT_KEYS },
    ];
    for (const { key, keys } of walkAnims) {
      if (!this.anims.exists(key) && this.textures.exists(keys[0])) {
        this.anims.create({ key, frames: keys.map((k) => ({ key: k, frame: 0 })), frameRate: 8, repeat: -1 });
      }
    }
    if (!this.anims.exists("idle") && this.textures.exists(IDLE_KEYS[0])) {
      this.anims.create({ key: "idle", frames: IDLE_KEYS.map((k) => ({ key: k, frame: 0 })), frameRate: 6, repeat: -1 });
    }
    const hitAnims: { key: string; keys: readonly string[] }[] = [
      { key: "hit-down", keys: HIT_DOWN_KEYS },
      { key: "hit-left", keys: HIT_LEFT_KEYS },
      { key: "hit-right", keys: HIT_RIGHT_KEYS },
      { key: "hit-up", keys: HIT_UP_KEYS },
    ];
    for (const { key, keys } of hitAnims) {
      if (!this.anims.exists(key) && this.textures.exists(keys[0])) {
        this.anims.create({ key, frames: keys.map((k) => ({ key: k, frame: 0 })), frameRate: 12, repeat: 0 });
      }
    }
  }

  /** Arena (map3): spawn 1 tile below the topmost walkable tile on the center column. */
  private findArenaSpawn(): [number, number] {
    const centerX = Math.floor(this.mapWidthTiles / 2);
    let minY = this.mapHeightTiles;
    for (let y = 0; y < this.mapHeightTiles; y++) {
      if (this.walkable.has(`${centerX},${y}`)) {
        minY = y;
        break;
      }
    }
    if (minY >= this.mapHeightTiles) return [centerX, Math.floor(this.mapHeightTiles / 2)];
    const spawnY = this.isWalkable(centerX, minY + 1) ? minY + 1 : minY;
    return [centerX, spawnY];
  }

  /** Spawn on road at right edge of playable area, vertically centered. */
  private findSpawnOnRoad(): [number, number] {
    const br = getBorderRight(this.currentMapId);
    const bt = getBorderTop(this.currentMapId);
    const bb = getBorderBottom(this.currentMapId);
    const bl = getBorderLeft(this.currentMapId);
    const rightX = this.mapWidthTiles - 1 - Math.ceil(br);
    const minY = Math.ceil(bt);
    const maxY = this.mapHeightTiles - 1 - Math.ceil(bb);
    const centerY = (minY + maxY) / 2;
    if (this.isWalkable(rightX, Math.floor(centerY))) return [rightX, Math.floor(centerY)];
    if (this.isWalkable(rightX, Math.ceil(centerY))) return [rightX, Math.ceil(centerY)];
    let best: [number, number] | null = null;
    let bestDist = Infinity;
    for (let y = minY; y <= maxY; y++) {
      if (!this.isWalkable(rightX, y)) continue;
      const dist = Math.abs(y - centerY);
      if (dist < bestDist) {
        bestDist = dist;
        best = [rightX, y];
      }
    }
    if (best) return best;
    for (let x = rightX - 1; x >= Math.ceil(bl); x--) {
      for (let y = minY; y <= maxY; y++) {
        if (!this.isWalkable(x, y)) continue;
        const dist = (rightX - x) ** 2 + (y - centerY) ** 2;
        if (best === null || dist < bestDist) {
          bestDist = dist;
          best = [x, y];
        }
      }
      if (best !== null) return best;
    }
    return [bl, minY];
  }

  private isWalkable(tileX: number, tileY: number): boolean {
    const bl = getBorderLeft(this.currentMapId);
    const bt = getBorderTop(this.currentMapId);
    const br = getBorderRight(this.currentMapId);
    const bb = getBorderBottom(this.currentMapId);
    if (tileX < bl || tileX >= this.mapWidthTiles - br) return false;
    if (tileY < bt || tileY >= this.mapHeightTiles - bb) return false;
    return this.walkable.has(`${tileX},${tileY}`);
  }

  /** Nearest walkable tile to (cx, cy), for "run to Home" target. */
  private findNearestWalkableTile(cx: number, cy: number): [number, number] {
    if (this.isWalkable(cx, cy)) return [cx, cy];
    for (let r = 1; r < Math.max(this.mapWidthTiles, this.mapHeightTiles); r++) {
      for (let dx = -r; dx <= r; dx++) {
        for (let dy = -r; dy <= r; dy++) {
          if (Math.abs(dx) !== r && Math.abs(dy) !== r) continue;
          const tx = cx + dx;
          const ty = cy + dy;
          if (this.isWalkable(tx, ty)) return [tx, ty];
        }
      }
    }
    return [cx, cy];
  }

  /** BFS path from (fromX, fromY) to (toX, toY). Returns list of tiles to step to (excluding start). */
  private bfsPath(fromX: number, fromY: number, toX: number, toY: number): [number, number][] {
    const queue: [number, number][] = [[fromX, fromY]];
    const prev = new Map<string, [number, number]>();
    prev.set(`${fromX},${fromY}`, [-1, -1]);
    while (queue.length > 0) {
      const [x, y] = queue.shift()!;
      if (x === toX && y === toY) {
        const path: [number, number][] = [];
        let px = x;
        let py = y;
        while (true) {
          const p = prev.get(`${px},${py}`);
          if (!p || p[0] === -1) break;
          path.unshift([px, py]);
          px = p[0];
          py = p[1];
        }
        return path;
      }
      for (const [nx, ny] of [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]] as [number, number][]) {
        if (!this.isWalkable(nx, ny) || prev.has(`${nx},${ny}`)) continue;
        prev.set(`${nx},${ny}`, [x, y]);
        queue.push([nx, ny]);
      }
    }
    return [];
  }

  /** BFS path with shuffled neighbor order so different monsters get different (shortest) paths. */
  private bfsPathForMonster(fromX: number, fromY: number, toX: number, toY: number, seed: number): [number, number][] {
    const dirs: [number, number][] = [[1, 0], [-1, 0], [0, 1], [0, -1]];
    const order = [(seed % 4 + 4) % 4, (seed + 1) % 4, (seed + 2) % 4, (seed + 3) % 4];
    const queue: [number, number][] = [[fromX, fromY]];
    const prev = new Map<string, [number, number]>();
    prev.set(`${fromX},${fromY}`, [-1, -1]);
    while (queue.length > 0) {
      const [x, y] = queue.shift()!;
      if (x === toX && y === toY) {
        const path: [number, number][] = [];
        let px = x;
        let py = y;
        while (true) {
          const p = prev.get(`${px},${py}`);
          if (!p || p[0] === -1) break;
          path.unshift([px, py]);
          px = p[0];
          py = p[1];
        }
        return path;
      }
      for (const i of order) {
        const [dx, dy] = dirs[i];
        const nx = x + dx;
        const ny = y + dy;
        if (!this.isWalkable(nx, ny) || prev.has(`${nx},${ny}`)) continue;
        prev.set(`${nx},${ny}`, [x, y]);
        queue.push([nx, ny]);
      }
    }
    return [];
  }

  private setBodyCursor(css: string) {
    if (typeof document !== "undefined" && document.body) document.body.style.cursor = css;
  }

  /** True if the pointer event target is the game canvas (ignore clicks that hit UI overlay). */
  private isClickOnGameCanvas(pointer: Phaser.Input.Pointer): boolean {
    const e = pointer.event as MouseEvent | undefined;
    if (!e?.target) return true;
    return e.target === this.sys.game.canvas;
  }

  private handleHomeClick() {
    if (isSessionInvalid()) return;
    if (isHomeOpen() || isMarketOpen() || isMineOpen() || isArenaOpen() || isValleyOpen() || isBackpackOpen() || isForgeOpen()) return;
    this.pathToDoorAndOpen(this.homeDoorTile, openHome, "pathingToHome");
  }

  private handleMarketClick() {
    if (isSessionInvalid()) return;
    if (isHomeOpen() || isMarketOpen() || isMineOpen() || isArenaOpen() || isValleyOpen() || isBackpackOpen() || isForgeOpen()) return;
    this.pathToDoorAndOpen(this.marketDoorTile, openMarket, "pathingToMarket");
  }

  private handleMineClick() {
    if (isSessionInvalid()) return;
    if (isHomeOpen() || isMarketOpen() || isMineOpen() || isArenaOpen() || isValleyOpen() || isBackpackOpen() || isForgeOpen()) return;
    this.pathToDoorAndOpen(this.mineDoorTile, openMine, "pathingToMine");
  }

  private handleArenaClick() {
    if (isSessionInvalid()) return;
    if (isHomeOpen() || isMarketOpen() || isMineOpen() || isArenaOpen() || isValleyOpen() || isBackpackOpen() || isForgeOpen()) return;
    this.pathToDoorAndOpen(this.arenaDoorTile, openArena, "pathingToArena");
  }

  private handleValleyClick() {
    if (this.currentMapId !== "map2" || !this.valleyDoorTile) return;
    if (isSessionInvalid()) return;
      if (isHomeOpen() || isMarketOpen() || isMineOpen() || isArenaOpen() || isValleyOpen() || isBackpackOpen() || isForgeOpen()) return;
    this.pathToDoorAndOpen(this.valleyDoorTile, openValley, "pathingToValley");
  }

  private handleForgeClick() {
    if (isSessionInvalid()) return;
    if (isHomeOpen() || isMarketOpen() || isMineOpen() || isArenaOpen() || isValleyOpen() || isBackpackOpen() || isForgeOpen()) return;
    this.pathToDoorAndOpen(this.forgeDoorTile, openForge, "pathingToForge");
  }

  /** Optional callback when this move finishes (used for path-to-Home). Only 4-directional: no diagonal. */
  private tryMove(dx: number, dy: number, onMoveComplete?: () => void) {
    if (isSessionInvalid()) return;
    if (this.isMoving) return;
    if (dx !== 0 && dy !== 0) dy = 0;
    const nx = this.gridX + dx;
    const ny = this.gridY + dy;
    if (!this.isWalkable(nx, ny)) return;

    this.isMoving = true;
    this.gridX = nx;
    this.gridY = ny;
    const targetX = this.gridX * TILE_SIZE + TILE_SIZE / 2;
    const targetY = this.gridY * TILE_SIZE + TILE_SIZE / 2 + CHARACTER_Y_OFFSET;

    const speedMult = 1 + (homeState.moveSpeedLevel || 0) * 0.25;
    const w = this.playerDisplayW;
    const h = this.playerDisplayH;
    const useArena = this.currentMapId === "map3" && (this.arenaMode || this.pvpMode);
    if (useArena && this.textures.exists(ARENA_WALK_DOWN_KEYS[0]) && this.anims.exists("arena-walk-down")) {
      if (dy === 1) {
        this.player.setTexture(ARENA_WALK_DOWN_KEYS[0], 0);
        this.player.setDisplaySize(w, h);
        this.player.anims.play("arena-walk-down", true);
        this.player.anims.timeScale = speedMult;
      } else if (dx === 1) {
        this.player.setTexture(ARENA_WALK_RIGHT_KEYS[0], 0);
        this.player.setDisplaySize(w, h);
        this.player.anims.play("arena-walk-right", true);
        this.player.anims.timeScale = speedMult;
      } else if (dy === -1) {
        this.player.setTexture(ARENA_WALK_UP_KEYS[0], 0);
        this.player.setDisplaySize(w, h);
        this.player.anims.play("arena-walk-up", true);
        this.player.anims.timeScale = speedMult;
      } else if (dx === -1) {
        this.player.setTexture(ARENA_WALK_LEFT_KEYS[0], 0);
        this.player.setDisplaySize(w, h);
        this.player.anims.play("arena-walk-left", true);
        this.player.anims.timeScale = speedMult;
      } else {
        this.player.anims.stop();
        if (this.textures.exists(ARENA_IDLE_KEYS[0]) && this.anims.exists("arena-idle")) {
          this.player.setTexture(ARENA_IDLE_KEYS[0], 0);
          this.player.anims.play("arena-idle", true);
        } else {
          this.player.setTexture(ARENA_WALK_DOWN_KEYS[0]);
        }
        this.player.setDisplaySize(w, h);
      }
    } else if (dy === 1 && this.textures.exists(WALK_DOWN_KEYS[0]) && this.anims.exists("walk-down")) {
      this.player.setTexture(WALK_DOWN_KEYS[0], 0);
      this.player.setDisplaySize(w, h);
      this.player.anims.play("walk-down", true);
      this.player.anims.timeScale = speedMult;
    } else if (dx === 1 && this.textures.exists(WALK_RIGHT_KEYS[0]) && this.anims.exists("walk-right")) {
      this.player.setTexture(WALK_RIGHT_KEYS[0], 0);
      this.player.setDisplaySize(w, h);
      this.player.anims.play("walk-right", true);
      this.player.anims.timeScale = speedMult;
    } else if (dy === -1 && this.textures.exists(WALK_UP_KEYS[0]) && this.anims.exists("walk-up")) {
      this.player.setTexture(WALK_UP_KEYS[0], 0);
      this.player.setDisplaySize(w, h);
      this.player.anims.play("walk-up", true);
      this.player.anims.timeScale = speedMult;
    } else if (dx === -1 && this.textures.exists(WALK_LEFT_KEYS[0]) && this.anims.exists("walk-left")) {
      this.player.setTexture(WALK_LEFT_KEYS[0], 0);
      this.player.setDisplaySize(w, h);
      this.player.anims.play("walk-left", true);
      this.player.anims.timeScale = speedMult;
    } else {
      this.player.anims.stop();
      this.player.setTexture(useArena && this.textures.exists(ARENA_WALK_DOWN_KEYS[0]) ? ARENA_WALK_DOWN_KEYS[0] : "character");
      this.player.setDisplaySize(w, h);
    }

    this.tweens.add({
      targets: this.player,
      x: targetX,
      y: targetY,
      duration: Math.round(240 / speedMult),
      ease: "Linear",
      onUpdate: () => {
        this.player.setPosition(Math.round(this.player.x), Math.round(this.player.y));
      },
      onComplete: () => {
        this.player.anims.timeScale = 1;
        this.isMoving = false;
        playStep();
        onMoveComplete?.();
        if (!onMoveComplete) this.getAdjacentDoorAction()?.();
      },
    });
  }

  /** If player is on a door tile, return the open-window callback; else null. */
  private getAdjacentDoorAction(): (() => void) | null {
    if (this.homeDoorTile && this.gridX === this.homeDoorTile[0] && this.gridY === this.homeDoorTile[1]) return openHome;
    if (this.marketDoorTile && this.gridX === this.marketDoorTile[0] && this.gridY === this.marketDoorTile[1]) return openMarket;
    if (this.mineDoorTile && this.gridX === this.mineDoorTile[0] && this.gridY === this.mineDoorTile[1]) return openMine;
    if (this.arenaDoorTile && this.gridX === this.arenaDoorTile[0] && this.gridY === this.arenaDoorTile[1]) return openArena;
    if (this.valleyDoorTile && this.gridX === this.valleyDoorTile[0] && this.gridY === this.valleyDoorTile[1]) return openValley;
    if (this.forgeDoorTile && this.gridX === this.forgeDoorTile[0] && this.gridY === this.forgeDoorTile[1]) return openForge;
    return null;
  }

  /** Cancel pathing to Home/Market/Mine/Valley/Arena (e.g. when user presses movement keys). */
  private cancelPathing() {
    this.pathQueue.length = 0;
    this.pathingToHome = false;
    this.pathingToMarket = false;
    this.pathingToMine = false;
    this.pathingToArena = false;
    this.pathingToValley = false;
    this.pathingToForge = false;
    this.pathingToRock = false;
    this.pathingToArenaMonster = false;
    this.pathingToPvpOpponent = false;
  }

  /** Walkable tile adjacent to (tx, ty), nearest to player; for pathing to arena monster. */
  private getWalkableTileNextToArenaTarget(tx: number, ty: number): [number, number] | null {
    const candidates: [number, number][] = [
      [tx - 1, ty],
      [tx + 1, ty],
      [tx, ty - 1],
      [tx, ty + 1],
    ];
    let best: [number, number] | null = null;
    let bestDist = Infinity;
    for (const [nx, ny] of candidates) {
      if (!this.isWalkable(nx, ny)) continue;
      const d = Math.abs(nx - this.gridX) + Math.abs(ny - this.gridY);
      if (d < bestDist) {
        bestDist = d;
        best = [nx, ny];
      }
    }
    return best;
  }

  // --- Arena on map3 (server-authoritative: runId, HP, damage from server) ---
  private initArena() {
    const d = this.arenaData!;
    const c = d.character;
    this.arenaRunId = d.runId;
    this.arenaPlayerMaxHp = c.maxHp;
    this.arenaPlayerHp = c.currentHp;
    this.arenaPlayerHpDisplay = c.currentHp;
    this.arenaPlayerDamage = playerDamage(c.bowLevel);
    this.arenaPlayerSpeedPx = playerSpeedPxPerSec(c.moveSpeedLevel);
    this.arenaTotalWaves = d.totalWaves;
    this.arenaState = "FIGHT";
    this.arenaCurrentWave0 = d.currentWave0 ?? 0;
    this.arenaMonsters = [];
    this.arenaAttackTarget = null;
    this.arenaHitCooldownUntil = 0;
    this.arenaLastDamageAt = 0;
    this.arenaVictoryLevel = null;
    this.arenaToSpawnThisWave = d.initialMonsters.length;
    this.arenaSpawnedThisWave = 0;

    this.arenaPlayerHpBar = this.add.graphics().setDepth(3000);
    this.arenaPlayerHpText = this.add
      .text(0, 0, "0/0", { fontFamily: "Press Start 2P", fontSize: "8px", color: "#fff" })
      .setOrigin(0.5, 1)
      .setDepth(3001);
    this.arenaHudText = this.add
      .text(0, 0, "", { fontFamily: "Press Start 2P", fontSize: "10px", color: "#fbbf24" })
      .setOrigin(0.5, 0)
      .setDepth(9999)
      .setVisible(false);
    const arenaHudEl = typeof document !== "undefined" ? document.getElementById("ui-arena-hud") : null;
    if (arenaHudEl) arenaHudEl.style.display = "";
    this.arenaOverlayRect = this.add
      .rectangle(this.mapWidth / 2, this.mapHeight / 2, this.mapWidth, this.mapHeight, 0x000000, 0.85)
      .setDepth(4000)
      .setVisible(false);
    this.arenaOverlayTitle = this.add
      .text(this.mapWidth / 2, this.mapHeight / 2 - 40, "VICTORY", {
        fontFamily: "Press Start 2P",
        fontSize: "16px",
        color: "#22c55e",
      })
      .setOrigin(0.5)
      .setDepth(4001)
      .setVisible(false);
    this.arenaOverlaySub = this.add
      .text(this.mapWidth / 2, this.mapHeight / 2, "", {
        fontFamily: "Press Start 2P",
        fontSize: "10px",
        color: "#e0e0e0",
      })
      .setOrigin(0.5)
      .setDepth(4001)
      .setVisible(false);
    this.arenaOverlayBtn = this.add
      .text(this.mapWidth / 2, this.mapHeight / 2 + 50, "Back to Valley", {
        fontFamily: "Press Start 2P",
        fontSize: "10px",
        color: "#fbbf24",
      })
      .setOrigin(0.5)
      .setDepth(4001)
      .setVisible(false)
      .setInteractive({ useHandCursor: true });
    this.arenaOverlayBtn.on("pointerdown", () => {
      const result = this.arenaState === "VICTORY" ? "victory" : "defeat";
      this.arenaData?.onExit(result);
    });

    const ARENA_PING_INTERVAL_MS = 10_000;
    this._arenaPingIntervalId = setInterval(() => {
      const t = d.token;
      if (t) postArenaPing(t).catch(() => {});
    }, ARENA_PING_INTERVAL_MS);

    if (!this.anims.exists("monster-hit-down") && this.textures.exists("monster-hit-down-0")) {
      for (const dir of ["down", "up", "right", "left"]) {
        const frames = [0, 1, 2, 3].map((i) => ({ key: `monster-hit-${dir}-${i}`, frame: 0 }));
        this.anims.create({ key: `monster-hit-${dir}`, frames, frameRate: 12, repeat: 0 });
      }
    }
    if (!this.anims.exists("monster-walk-left") && this.textures.exists("monster-walk-left-0")) {
      for (const dir of ["left", "right"]) {
        const frames = [0, 1, 2, 3, 4, 5, 6, 7].map((i) => ({ key: `monster-walk-${dir}-${i}`, frame: 0 }));
        this.anims.create({ key: `monster-walk-${dir}`, frames, frameRate: 10, repeat: -1 });
      }
      for (const dir of ["up", "down"]) {
        const frames = [0, 1].map((i) => ({ key: `monster-walk-${dir}-${i}`, frame: 0 }));
        this.anims.create({ key: `monster-walk-${dir}`, frames, frameRate: 8, repeat: -1 });
      }
    }
    if (!this.anims.exists("monster-enter") && this.textures.exists("monster-enter-0")) {
      this.anims.create({
        key: "monster-enter",
        frames: [0, 1, 2, 3].map((i) => ({ key: `monster-enter-${i}`, frame: 0 })),
        frameRate: 8,
        repeat: 0,
      });
    }
    if (!this.anims.exists("monster-die") && this.textures.exists("monster-die-0")) {
      this.anims.create({
        key: "monster-die",
        frames: [0, 1, 2, 3].map((i) => ({ key: `monster-die-${i}`, frame: 0 })),
        frameRate: 10,
        repeat: 0,
      });
    }
    if (!this.anims.exists("arena-walk-down") && this.textures.exists(ARENA_WALK_DOWN_KEYS[0])) {
      this.anims.create({ key: "arena-walk-down", frames: ARENA_WALK_DOWN_KEYS.map((k) => ({ key: k, frame: 0 })), frameRate: 8, repeat: -1 });
      this.anims.create({ key: "arena-walk-up", frames: ARENA_WALK_UP_KEYS.map((k) => ({ key: k, frame: 0 })), frameRate: 8, repeat: -1 });
      this.anims.create({ key: "arena-walk-right", frames: ARENA_WALK_RIGHT_KEYS.map((k) => ({ key: k, frame: 0 })), frameRate: 8, repeat: -1 });
      this.anims.create({ key: "arena-walk-left", frames: ARENA_WALK_LEFT_KEYS.map((k) => ({ key: k, frame: 0 })), frameRate: 8, repeat: -1 });
      this.anims.create({ key: "arena-die", frames: ARENA_DIE_KEYS.map((k) => ({ key: k, frame: 0 })), frameRate: 10, repeat: 0 });
      this.anims.create({ key: "arena-hit-down", frames: ARENA_HIT_DOWN_KEYS.map((k) => ({ key: k, frame: 0 })), frameRate: 12, repeat: 0 });
      this.anims.create({ key: "arena-hit-up", frames: ARENA_HIT_UP_KEYS.map((k) => ({ key: k, frame: 0 })), frameRate: 12, repeat: 0 });
      this.anims.create({ key: "arena-hit-right", frames: ARENA_HIT_RIGHT_KEYS.map((k) => ({ key: k, frame: 0 })), frameRate: 12, repeat: 0 });
      this.anims.create({ key: "arena-hit-left", frames: ARENA_HIT_LEFT_KEYS.map((k) => ({ key: k, frame: 0 })), frameRate: 12, repeat: 0 });
      this.anims.create({ key: "arena-idle", frames: ARENA_IDLE_KEYS.map((k) => ({ key: k, frame: 0 })), frameRate: 6, repeat: -1 });
    }

    if (this.textures.exists(ARENA_IDLE_KEYS[0]) && this.anims.exists("arena-idle")) {
      this.player.setTexture(ARENA_IDLE_KEYS[0], 0);
      this.player.setDisplaySize(CHARACTER_DISPLAY_W, CHARACTER_DISPLAY_H);
      this.player.anims.play("arena-idle", true);
    } else if (this.textures.exists(ARENA_WALK_DOWN_KEYS[0])) {
      this.player.setTexture(ARENA_WALK_DOWN_KEYS[0]);
      this.player.setDisplaySize(CHARACTER_DISPLAY_W, CHARACTER_DISPLAY_H);
      this.player.anims.stop();
    }

    for (const stats of d.initialMonsters) {
      this.spawnArenaMonsterWithServerStats(stats);
    }
    this.updateArenaHudText();
  }

  /** PvP on map3: same arena location, one opponent sprite, same HUD and overlay. */
  private initPvpArena() {
    const d = this.pvpData!;
    const c = d.character;
    this.arenaRunId = d.runId;
    this.arenaPlayerMaxHp = c.maxHp;
    this.arenaPlayerHp = d.myHp;
    this.arenaPlayerHpDisplay = d.myHp;
    this.arenaPlayerDamage = playerDamage(c.bowLevel);
    this.arenaPlayerSpeedPx = playerSpeedPxPerSec(c.moveSpeedLevel);
    this.arenaState = "FIGHT";
    this.arenaMonsters = [];
    this.arenaAttackTarget = null;
    this.arenaHitCooldownUntil = 0;
    this.pvpHitCooldownUntil = 0;
    this.pvpBattleEnded = false;
    this.pvpPollRunAt = 0;

    this.arenaPlayerHpBar = this.add.graphics().setDepth(3000);
    this.arenaPlayerHpText = this.add
      .text(0, 0, `${d.myHp}/${d.myMaxHp}`, { fontFamily: "Press Start 2P", fontSize: "8px", color: "#fff" })
      .setOrigin(0.5, 1)
      .setDepth(3001);
    this.arenaPlayerNameText = this.add
      .text(0, 0, "You", { fontFamily: "Press Start 2P", fontSize: "8px", color: "#fbbf24" })
      .setOrigin(0.5, 1)
      .setDepth(3001);
    this.arenaHudText = this.add
      .text(0, 0, "PvP — click opponent to attack", { fontFamily: "Press Start 2P", fontSize: "10px", color: "#fbbf24" })
      .setOrigin(0.5, 0)
      .setDepth(9999)
      .setVisible(false);
    const arenaHudEl = typeof document !== "undefined" ? document.getElementById("ui-arena-hud") : null;
    if (arenaHudEl) {
      arenaHudEl.style.display = "";
      arenaHudEl.textContent = "PvP — click opponent to attack";
    }
    this.arenaOverlayRect = this.add
      .rectangle(this.mapWidth / 2, this.mapHeight / 2, this.mapWidth, this.mapHeight, 0x000000, 0.85)
      .setDepth(4000)
      .setVisible(false);
    this.arenaOverlayTitle = this.add
      .text(this.mapWidth / 2, this.mapHeight / 2 - 40, "VICTORY", {
        fontFamily: "Press Start 2P",
        fontSize: "16px",
        color: "#22c55e",
      })
      .setOrigin(0.5)
      .setDepth(4001)
      .setVisible(false);
    this.arenaOverlaySub = this.add
      .text(this.mapWidth / 2, this.mapHeight / 2, "", {
        fontFamily: "Press Start 2P",
        fontSize: "10px",
        color: "#e0e0e0",
      })
      .setOrigin(0.5)
      .setDepth(4001)
      .setVisible(false);
    this.arenaOverlayBtn = this.add
      .text(this.mapWidth / 2, this.mapHeight / 2 + 50, "Back to Valley", {
        fontFamily: "Press Start 2P",
        fontSize: "10px",
        color: "#fbbf24",
      })
      .setOrigin(0.5)
      .setDepth(4001)
      .setVisible(false)
      .setInteractive({ useHandCursor: true });
    this.arenaOverlayBtn.on("pointerdown", () => {
      d.onExit();
    });

    if (!this.anims.exists("arena-walk-down") && this.textures.exists(ARENA_WALK_DOWN_KEYS[0])) {
      this.anims.create({ key: "arena-walk-down", frames: ARENA_WALK_DOWN_KEYS.map((k) => ({ key: k, frame: 0 })), frameRate: 8, repeat: -1 });
      this.anims.create({ key: "arena-walk-up", frames: ARENA_WALK_UP_KEYS.map((k) => ({ key: k, frame: 0 })), frameRate: 8, repeat: -1 });
      this.anims.create({ key: "arena-walk-right", frames: ARENA_WALK_RIGHT_KEYS.map((k) => ({ key: k, frame: 0 })), frameRate: 8, repeat: -1 });
      this.anims.create({ key: "arena-walk-left", frames: ARENA_WALK_LEFT_KEYS.map((k) => ({ key: k, frame: 0 })), frameRate: 8, repeat: -1 });
      this.anims.create({ key: "arena-die", frames: ARENA_DIE_KEYS.map((k) => ({ key: k, frame: 0 })), frameRate: 10, repeat: 0 });
      this.anims.create({ key: "arena-hit-down", frames: ARENA_HIT_DOWN_KEYS.map((k) => ({ key: k, frame: 0 })), frameRate: 12, repeat: 0 });
      this.anims.create({ key: "arena-hit-up", frames: ARENA_HIT_UP_KEYS.map((k) => ({ key: k, frame: 0 })), frameRate: 12, repeat: 0 });
      this.anims.create({ key: "arena-hit-right", frames: ARENA_HIT_RIGHT_KEYS.map((k) => ({ key: k, frame: 0 })), frameRate: 12, repeat: 0 });
      this.anims.create({ key: "arena-hit-left", frames: ARENA_HIT_LEFT_KEYS.map((k) => ({ key: k, frame: 0 })), frameRate: 12, repeat: 0 });
      this.anims.create({ key: "arena-idle", frames: ARENA_IDLE_KEYS.map((k) => ({ key: k, frame: 0 })), frameRate: 6, repeat: -1 });
    }

    if (this.textures.exists(ARENA_IDLE_KEYS[0]) && this.anims.exists("arena-idle")) {
      this.player.setTexture(ARENA_IDLE_KEYS[0], 0);
      this.player.setDisplaySize(CHARACTER_DISPLAY_W, CHARACTER_DISPLAY_H);
      this.player.anims.play("arena-idle", true);
    } else if (this.textures.exists(ARENA_WALK_DOWN_KEYS[0])) {
      this.player.setTexture(ARENA_WALK_DOWN_KEYS[0]);
      this.player.setDisplaySize(CHARACTER_DISPLAY_W, CHARACTER_DISPLAY_H);
      this.player.anims.stop();
    }

    const walkable = this.getArenaWalkableTiles();
    const farEnough = walkable.filter(([tx, ty]) => {
      const manhattan = Math.abs(tx - this.gridX) + Math.abs(ty - this.gridY);
      return manhattan >= 3;
    });
    const candidates = farEnough.length > 0 ? farEnough : walkable;
    const [tileX, tileY] = candidates[Math.floor(Math.random() * candidates.length)];
    const px = tileX * TILE_SIZE + TILE_SIZE / 2;
    const py = tileY * TILE_SIZE + TILE_SIZE / 2 + CHARACTER_Y_OFFSET;
    const oppSprite = this.add
      .sprite(px, py, ARENA_IDLE_KEYS[0])
      .setOrigin(0.5, 0.5)
      .setDisplaySize(CHARACTER_DISPLAY_W, CHARACTER_DISPLAY_H)
      .setDepth(1500 + tileY)
      .setTint(0xcc6666);
    if (this.anims.exists("arena-idle")) oppSprite.anims.play("arena-idle", true);
    oppSprite.setInteractive({ useHandCursor: true });
    oppSprite.on("pointerover", () => this.setBodyCursor(`url(${CURSOR_HIT_URL}) 16 16, auto`));
    oppSprite.on("pointerout", () => this.setBodyCursor(""));
    const hpBar = this.add.graphics().setDepth(1600 + tileY);
    const nameText = this.add
      .text(px, py - 50, "Opponent", { fontFamily: "Press Start 2P", fontSize: "8px", color: "#fbbf24" })
      .setOrigin(0.5, 1)
      .setDepth(1602 + tileY);
    const hpText = this.add
      .text(px, py - 36, `${d.opponentHp}/${d.opponentMaxHp}`, { fontFamily: "Press Start 2P", fontSize: "8px", color: "#fff" })
      .setOrigin(0.5, 1)
      .setDepth(1601 + tileY);
    this.pvpOpponent = { sprite: oppSprite, tileX, tileY, hp: d.opponentHp, maxHp: d.opponentMaxHp, hpBar, hpText, nameText };
    this.drawPvpOpponentHpBar();
    this.drawArenaPlayerHpBar();
    this.pvpOpponentLastGridX = -1;
    this.pvpOpponentLastGridY = -1;
    this.sendPvpPosition();
  }

  private sendPvpPosition() {
    if (!this.arenaRunId || this.pvpBattleEnded) return;
    const token = getToken();
    if (!token) return;
    postPvpPosition(token, this.arenaRunId, this.gridX, this.gridY, this.pvpFacing).catch(() => {});
  }

  private drawPvpOpponentHpBar() {
    const o = this.pvpOpponent;
    if (!o) return;
    const w = 48;
    const h = 6;
    const r = 2;
    const barTopY = o.sprite.y - 36;
    const x = o.sprite.x - w / 2;
    o.hpBar.clear();
    o.hpBar.fillStyle(0x333333, 1);
    o.hpBar.fillRoundedRect(x, barTopY, w, h, r);
    const pct = o.maxHp > 0 ? o.hp / o.maxHp : 0;
    const fillW = Math.max(0, Math.min(w, w * pct));
    o.hpBar.fillStyle(0xef4444, 1);
    o.hpBar.fillRoundedRect(x, barTopY, fillW, h, r);
    o.hpBar.lineStyle(1, 0xfbbf24, 1);
    o.hpBar.strokeRoundedRect(x, barTopY, w, h, r);
    o.nameText.setPosition(o.sprite.x, o.sprite.y - 50);
    o.hpText.setPosition(o.sprite.x, o.sprite.y - 36);
    o.hpText.setText(`${o.hp}/${o.maxHp}`);
  }

  private onPvpPointerDown(worldX: number, worldY: number): boolean {
    if (this.pvpBattleEnded || !this.pvpOpponent) return false;
    const o = this.pvpOpponent;
    const hitRadius = TILE_SIZE * 1.2;
    const dx = worldX - o.sprite.x;
    const dy = worldY - o.sprite.y;
    if (dx * dx + dy * dy > hitRadius * hitRadius) return false;
    const distPx = Phaser.Math.Distance.Between(this.player.x, this.player.y, o.sprite.x, o.sprite.y);
    if (distPx <= PLAYER_MELEE_RANGE && Date.now() >= this.pvpHitCooldownUntil) {
      this.doPvpAttack();
      return true;
    }
    const tile = this.getWalkableTileNextToArenaTarget(o.tileX, o.tileY);
    if (!tile) return true;
    const [hx, hy] = tile;
    if (this.pathingToPvpOpponent) {
      this.pathQueue.length = 0;
      this.pathingToPvpOpponent = false;
      this.tweens.killTweensOf(this.player);
      this.isMoving = false;
      this.player.setPosition(this.gridX * TILE_SIZE + TILE_SIZE / 2, this.gridY * TILE_SIZE + TILE_SIZE / 2 + CHARACTER_Y_OFFSET);
    }
    const path = this.bfsPath(this.gridX, this.gridY, hx, hy);
    if (path.length === 0) return true;
    this.pathQueue = path.slice(1);
    this.pathingToHome = false;
    this.pathingToMarket = false;
    this.pathingToMine = false;
    this.pathingToValley = false;
    this.pathingToForge = false;
    this.pathingToRock = false;
    this.pathingToArenaMonster = false;
    this.pathingToPvpOpponent = true;
    const next = path[0];
    this.tryMove(next[0] - this.gridX, next[1] - this.gridY, () => this.onPathStepComplete());
    return true;
  }

  private doPvpAttack() {
    playSword();
    const runId = this.arenaRunId;
    const d = this.pvpData;
    const o = this.pvpOpponent;
    if (!runId || !d || !o || this.pvpBattleEnded) return;
    this.pvpHitCooldownUntil = Date.now() + PLAYER_HIT_COOLDOWN_MS;
    const damage = Math.min(o.hp, this.arenaPlayerDamage);
    this.showFloatingDamageText(o.sprite.x, o.sprite.y, damage);
    const dx = o.tileX - this.gridX;
    const dy = o.tileY - this.gridY;
    const hitDir = Math.abs(dx) >= Math.abs(dy)
      ? (dx > 0 ? "hit-right" : "hit-left")
      : (dy > 0 ? "hit-down" : "hit-up");
    const arenaHitDir = `arena-${hitDir}` as "arena-hit-down" | "arena-hit-up" | "arena-hit-right" | "arena-hit-left";
    if (this.anims.exists(arenaHitDir)) {
      this.player.anims.play(arenaHitDir, false);
      this.player.once(Phaser.Animations.Events.ANIMATION_COMPLETE, () => this.restoreIdleAnimation());
    } else if (this.anims.exists(hitDir)) {
      this.player.anims.play(hitDir, false);
      this.player.once(Phaser.Animations.Events.ANIMATION_COMPLETE, () => this.restoreIdleAnimation());
    }

    postPvpAttack(getToken(), runId).then((res) => {
      if (!res.ok) return;
      const isPlayer1 = d.isPlayer1;
      this.arenaPlayerHp = isPlayer1 ? res.hp1 : res.hp2;
      this.arenaPlayerHpDisplay = this.arenaPlayerHp;
      if (o) {
        o.hp = isPlayer1 ? res.hp2 : res.hp1;
        this.drawPvpOpponentHpBar();
      }
      this.drawArenaPlayerHpBar();

      if ("victory" in res && res.victory) {
        this.pvpBattleEnded = true;
        const winnerId = (res as { winnerAccountId: number }).winnerAccountId;
        const myId = (window as unknown as { __accountId?: number }).__accountId;
        this.showPvpOverlay(typeof myId === "number" && winnerId === myId);
        return;
      }
      if (this.arenaPlayerHp <= 0) {
        this.pvpBattleEnded = true;
        this.showPvpOverlay(false);
      } else if (o && o.hp <= 0) {
        this.pvpBattleEnded = true;
        this.showPvpOverlay(true);
      }
    });
  }

  private showPvpOverlay(victory: boolean) {
    this.arenaOverlayRect.setVisible(true);
    this.arenaOverlayTitle.setVisible(true).setText(victory ? "VICTORY" : "DEFEAT").setColor(victory ? "#22c55e" : "#ef4444");
    this.arenaOverlaySub.setVisible(true).setText(victory ? "You won the PvP battle!" : "You were defeated.");
    this.arenaOverlayBtn.setVisible(true);
  }

  /** Spawn one monster with server-provided hp/maxHp/damage (first wave or next-wave). */
  private spawnArenaMonsterWithServerStats(stats: { hp: number; maxHp: number; damage: number }) {
    const d = this.arenaData!;
    const level = d.character.level;
    const waveIndex = this.arenaCurrentWave0 + 1;
    const cooldownMs = monsterAttackCooldownMs(level);
    const speedK = monsterSpeedK(waveIndex) * monsterSpeedByLevelK(level);
    const speedVariance = 0.85 + Math.random() * 0.3;
    const speedPx = this.arenaPlayerSpeedPx * speedK * speedVariance * 0.55;

    const walkable = this.getArenaWalkableTiles();
    const farEnough = walkable.filter(([tx, ty]) => {
      const manhattan = Math.abs(tx - this.gridX) + Math.abs(ty - this.gridY);
      return manhattan >= SPAWN_MIN_TILES_FROM_PLAYER;
    });
    const candidates = farEnough.length > 0 ? farEnough : walkable;
    const [tileX, tileY] = candidates[Math.floor(Math.random() * candidates.length)];
    const px = tileX * TILE_SIZE + TILE_SIZE / 2;
    const py = tileY * TILE_SIZE + TILE_SIZE / 2;
    const useEnterAnim = this.textures.exists("monster-enter-0") && this.anims.exists("monster-enter");
    const sprite = this.add
      .sprite(px, py, useEnterAnim ? "monster-enter-0" : "arena-monster")
      .setOrigin(0.5, 0.5)
      .setDepth(1500 + tileY);
    sprite.setDisplaySize(CHARACTER_DISPLAY_W, CHARACTER_DISPLAY_H);
    if (useEnterAnim) {
      sprite.anims.play("monster-enter", false);
      sprite.once(Phaser.Animations.Events.ANIMATION_COMPLETE, () => {
        if (sprite.scene && this.textures.exists("arena-monster")) sprite.setTexture("arena-monster");
      });
    } else {
      sprite.setAlpha(0);
      this.tweens.add({ targets: sprite, alpha: 1, duration: SPAWN_FADE_MS, ease: "Linear" });
    }
    sprite.setInteractive({ useHandCursor: false });
    sprite.on("pointerover", () => this.setBodyCursor(`url(${CURSOR_SWORD_URL}) 16 16, auto`));
    sprite.on("pointerout", () => this.setBodyCursor(""));

    const hpBar = this.add.graphics().setDepth(1600 + tileY);
    const hpText = this.add
      .text(px, py - 28, `${stats.hp}/${stats.maxHp}`, { fontFamily: "Press Start 2P", fontSize: "8px", color: "#fff" })
      .setOrigin(0.5, 1)
      .setDepth(1601 + tileY);
    const enterDurationMs = useEnterAnim ? 500 : SPAWN_FADE_MS;
    const invulnerableUntil = Date.now() + enterDurationMs;
    const m: ArenaMonsterData = {
      sprite,
      tileX,
      tileY,
      pathSeed: Math.floor(Math.random() * 4),
      hp: stats.hp,
      maxHp: stats.maxHp,
      damage: stats.damage,
      attackCooldownMs: cooldownMs,
      speedPx,
      waveIndex,
      lastAttackAt: 0,
      invulnerableUntil,
      hpBar,
      hpText,
      dead: false,
      alerted: false,
      patrolCenterX: tileX,
      patrolDirX: 1,
    };
    this.arenaMonsters.push(m);
    this.arenaSpawnedThisWave++;
    this.drawArenaMonsterHpBar(m);
  }

  private startArenaWave() {
    const d = this.arenaData!;
    const level = d.character.level;
    this.arenaToSpawnThisWave = monstersInWave(level, this.arenaCurrentWave0);
    this.arenaSpawnedThisWave = 0;
    this.arenaSpawnInterval = spawnIntervalMs(level);
    this.arenaSpawnCountdown = 0;
    this.arenaState = "FIGHT";
    this.updateArenaHudText();
  }

  private updateArenaHudText() {
    let s: string;
    if (this.arenaState === "NEXT_WAVE") {
      const secLeft = Math.max(0, Math.ceil((this.arenaNextWaveAt - Date.now()) / 1000));
      const nextWaveNum = this.arenaCurrentWave0 + 1;
      s = `Wave complete. Next wave (${nextWaveNum}/${this.arenaTotalWaves}) in: ${secLeft}s`;
    } else {
      const waveStr = `${this.arenaCurrentWave0 + 1}/${this.arenaTotalWaves}`;
      const total = this.arenaToSpawnThisWave;
      const killed = total - this.arenaMonsters.length;
      s = `Wave ${waveStr}   Monsters ${killed}/${total}`;
    }
    if (typeof document !== "undefined") {
      const el = document.getElementById("ui-arena-hud");
      if (el) el.textContent = s;
    }
  }

  /** All walkable tile keys "x,y" for arena spawn/chase. */
  private getArenaWalkableTiles(): [number, number][] {
    const out: [number, number][] = [];
    for (const key of this.walkable) {
      const [x, y] = key.split(",").map(Number);
      if (this.isWalkable(x, y)) out.push([x, y]);
    }
    return out;
  }

  private spawnArenaMonster() {
    const d = this.arenaData!;
    const level = d.character.level;
    const waveIndex = this.arenaCurrentWave0 + 1;
    const hp = monsterHp(level, waveIndex);
    const damage = monsterDamage(level, waveIndex);
    const cooldownMs = monsterAttackCooldownMs(level);
    const speedK = monsterSpeedK(waveIndex) * monsterSpeedByLevelK(level);
    const speedVariance = 0.85 + Math.random() * 0.3;
    const speedPx = this.arenaPlayerSpeedPx * speedK * speedVariance * 0.55;

    const walkable = this.getArenaWalkableTiles();
    const farEnough = walkable.filter(([tx, ty]) => {
      const manhattan = Math.abs(tx - this.gridX) + Math.abs(ty - this.gridY);
      return manhattan >= SPAWN_MIN_TILES_FROM_PLAYER;
    });
    const candidates = farEnough.length > 0 ? farEnough : walkable;
    const [tileX, tileY] = candidates[Math.floor(Math.random() * candidates.length)];
    const px = tileX * TILE_SIZE + TILE_SIZE / 2;
    const py = tileY * TILE_SIZE + TILE_SIZE / 2;
    const useEnterAnim = this.textures.exists("monster-enter-0") && this.anims.exists("monster-enter");
    const sprite = this.add
      .sprite(px, py, useEnterAnim ? "monster-enter-0" : "arena-monster")
      .setOrigin(0.5, 0.5)
      .setDepth(1500 + tileY);
    sprite.setDisplaySize(CHARACTER_DISPLAY_W, CHARACTER_DISPLAY_H);
    if (useEnterAnim) {
      sprite.anims.play("monster-enter", false);
      sprite.once(Phaser.Animations.Events.ANIMATION_COMPLETE, () => {
        if (sprite.scene && this.textures.exists("arena-monster")) sprite.setTexture("arena-monster");
      });
    } else {
      sprite.setAlpha(0);
      this.tweens.add({ targets: sprite, alpha: 1, duration: SPAWN_FADE_MS, ease: "Linear" });
    }
    sprite.setInteractive({ useHandCursor: false });
    sprite.on("pointerover", () => this.setBodyCursor(`url(${CURSOR_SWORD_URL}) 16 16, auto`));
    sprite.on("pointerout", () => this.setBodyCursor(""));

    const hpBar = this.add.graphics().setDepth(1600 + tileY);
    const hpText = this.add
      .text(px, py - 28, `${hp}/${hp}`, { fontFamily: "Press Start 2P", fontSize: "8px", color: "#fff" })
      .setOrigin(0.5, 1)
      .setDepth(1601 + tileY);
    const enterDurationMs = useEnterAnim ? 500 : SPAWN_FADE_MS;
    const invulnerableUntil = Date.now() + enterDurationMs;
    const m: ArenaMonsterData = {
      sprite,
      tileX,
      tileY,
      pathSeed: Math.floor(Math.random() * 4),
      hp,
      maxHp: hp,
      damage,
      attackCooldownMs: cooldownMs,
      speedPx,
      waveIndex,
      lastAttackAt: 0,
      invulnerableUntil,
      hpBar,
      hpText,
      dead: false,
      alerted: false,
      patrolCenterX: tileX,
      patrolDirX: 1,
    };
    this.arenaMonsters.push(m);
    this.arenaSpawnedThisWave++;
    this.drawArenaMonsterHpBar(m);
  }

  private drawArenaMonsterHpBar(m: ArenaMonsterData) {
    if (m.dead) return;
    const depthY = m.sprite.y / TILE_SIZE;
    m.hpText.setText(`${m.hp}/${m.maxHp}`);
    m.hpText.setPosition(m.sprite.x, m.sprite.y - 28);
    m.hpText.setDepth(1601 + depthY);
    m.hpBar.clear();
    const w = 24;
    const h = 4;
    const r = 2;
    const x = m.sprite.x - w / 2;
    const y = m.sprite.y - 28;
    m.hpBar.setDepth(1600 + depthY);
    m.hpBar.fillStyle(0x333333, 1);
    m.hpBar.fillRoundedRect(x, y, w, h, r);
    const pct = m.maxHp > 0 ? m.hp / m.maxHp : 0;
    const fillW = Math.max(0, pct * w);
    if (fillW > 0) {
      m.hpBar.fillStyle(0xef4444, 1);
      m.hpBar.fillRoundedRect(x, y, fillW, h, r);
    }
    m.hpBar.lineStyle(1, 0xfbbf24, 1);
    m.hpBar.strokeRoundedRect(x, y, w, h, r);
  }

  private drawArenaPlayerHpBar() {
    this.player.setDepth(1500 + this.player.y / TILE_SIZE);
    if (this.arenaPlayerNameText) {
      this.arenaPlayerNameText.setPosition(this.player.x, this.player.y - 44);
    }
    this.arenaPlayerHpText.setText(`${Math.round(this.arenaPlayerHpDisplay)}/${Math.round(this.arenaPlayerMaxHp)}`);
    this.arenaPlayerHpText.setPosition(this.player.x, this.player.y - 32);
    this.arenaPlayerHpBar.clear();
    const w = 40;
    const h = 6;
    const r = 2;
    const x = this.player.x - w / 2;
    const y = this.player.y - 32;
    this.arenaPlayerHpBar.fillStyle(0x333333, 1);
    this.arenaPlayerHpBar.fillRoundedRect(x, y, w, h, r);
    const pct = this.arenaPlayerMaxHp > 0 ? this.arenaPlayerHpDisplay / this.arenaPlayerMaxHp : 0;
    const fillW = Math.max(0, pct * w);
    if (fillW > 0) {
      this.arenaPlayerHpBar.fillStyle(0x22c55e, 1);
      this.arenaPlayerHpBar.fillRoundedRect(x, y, fillW, h, r);
    }
    this.arenaPlayerHpBar.lineStyle(1, 0xfbbf24, 1);
    this.arenaPlayerHpBar.strokeRoundedRect(x, y, w, h, r);
  }

  /** Returns true if the click was on a monster (attack or path to monster started). */
  private onArenaPointerDown(worldX: number, worldY: number): boolean {
    if (this.arenaState !== "FIGHT" && this.arenaState !== "WAVE") return false;
    const hitRadius = TILE_SIZE * 1.2;
    let hit: ArenaMonsterData | null = null;
    let bestD = hitRadius * hitRadius;
    for (const m of this.arenaMonsters) {
      if (m.dead) continue;
      const dx = worldX - m.sprite.x;
      const dy = worldY - m.sprite.y;
      const d2 = dx * dx + dy * dy;
      if (d2 < bestD) {
        bestD = d2;
        hit = m;
      }
    }
    if (!hit) {
      this.arenaAttackTarget = null;
      return false;
    }
    const distPx = Phaser.Math.Distance.Between(this.player.x, this.player.y, hit.sprite.x, hit.sprite.y);
    if (distPx <= PLAYER_MELEE_RANGE && Date.now() >= this.arenaHitCooldownUntil) {
      this.doArenaOneHit(hit);
      this.arenaAttackTarget = null;
      return true;
    }
    const tile = this.getWalkableTileNextToArenaTarget(hit.tileX, hit.tileY);
    if (!tile) return true;
    const [hx, hy] = tile;
    if (this.pathingToArenaMonster && this.arenaAttackTarget !== hit) {
      this.pathQueue.length = 0;
      this.pathingToArenaMonster = false;
      this.tweens.killTweensOf(this.player);
      this.isMoving = false;
      this.player.setPosition(this.gridX * TILE_SIZE + TILE_SIZE / 2, this.gridY * TILE_SIZE + TILE_SIZE / 2 + CHARACTER_Y_OFFSET);
    }
    const path = this.bfsPath(this.gridX, this.gridY, hx, hy);
    if (path.length === 0) return true;
    this.pathQueue = path.slice(1);
    this.pathingToHome = false;
    this.pathingToMarket = false;
    this.pathingToMine = false;
    this.pathingToValley = false;
    this.pathingToForge = false;
    this.pathingToRock = false;
    this.pathingToArenaMonster = true;
    this.arenaAttackTarget = hit;
    const next = path[0];
    this.tryMove(next[0] - this.gridX, next[1] - this.gridY, () => this.onPathStepComplete());
    return true;
  }

  private doArenaOneHit(m: ArenaMonsterData) {
    if (m.dead || Date.now() < m.invulnerableUntil) return;
    playSword();
    const runId = this.arenaRunId;
    const d = this.arenaData;
    if (!runId || !d) return;
    const monsterIndex = this.arenaMonsters.indexOf(m);
    if (monsterIndex < 0) return;
    this.arenaHitCooldownUntil = Date.now() + PLAYER_HIT_COOLDOWN_MS;
    const damage = Math.min(m.hp, this.arenaPlayerDamage);
    this.showFloatingDamageText(m.sprite.x, m.sprite.y, damage);
    const dx = m.tileX - this.gridX;
    const dy = m.tileY - this.gridY;
    const hitDir = Math.abs(dx) >= Math.abs(dy)
      ? (dx > 0 ? "hit-right" : "hit-left")
      : (dy > 0 ? "hit-down" : "hit-up");
    const arenaHitDir = `arena-${hitDir}` as "arena-hit-down" | "arena-hit-up" | "arena-hit-right" | "arena-hit-left";
    if (this.anims.exists(arenaHitDir)) {
      this.player.anims.play(arenaHitDir, false);
      this.player.once(Phaser.Animations.Events.ANIMATION_COMPLETE, () => this.restoreIdleAnimation());
    } else if (this.anims.exists(hitDir)) {
      this.player.anims.play(hitDir, false);
      this.player.once(Phaser.Animations.Events.ANIMATION_COMPLETE, () => this.restoreIdleAnimation());
    }

    postArenaAttack(d.token, runId, monsterIndex).then((res) => {
      if (!res.ok || !("playerHp" in res)) return;
      this.arenaPlayerHp = res.playerHp;
      this.arenaPlayerHpDisplay = res.playerHp;

      if ("victory" in res && res.victory) {
        m.hp = 0;
        m.dead = true;
        m.hpText.destroy();
        const playDieThenFade = () => {
          this.tweens.add({
            targets: m.sprite,
            alpha: 0,
            duration: DEATH_FADE_MS,
            ease: "Linear",
            onComplete: () => {
              m.sprite.destroy();
              m.hpBar.destroy();
            },
          });
        };
        if (this.anims.exists("monster-die") && this.textures.exists("monster-die-0")) {
          m.sprite.setTexture("monster-die-0");
          m.sprite.setDisplaySize(CHARACTER_DISPLAY_W, CHARACTER_DISPLAY_H);
          m.sprite.anims.play("monster-die", false);
          m.sprite.once(Phaser.Animations.Events.ANIMATION_COMPLETE, playDieThenFade);
        } else {
          playDieThenFade();
        }
        if (this._arenaPingIntervalId != null) {
          clearInterval(this._arenaPingIntervalId);
          this._arenaPingIntervalId = null;
        }
        this.arenaState = "VICTORY";
        this.arenaVictoryShowAt = Date.now() + 2000;
        this.arenaVictoryLevel = "character" in res ? (res as { character: { level: number } }).character.level : null;
        this.arenaMonsters = [];
        this.arenaAttackTarget = null;
        this.updateArenaHudText();
        return;
      }
      if ("defeat" in res && res.defeat) {
        if (this._arenaPingIntervalId != null) {
          clearInterval(this._arenaPingIntervalId);
          this._arenaPingIntervalId = null;
        }
        this.arenaState = "DEFEAT";
        this.arenaDefeatCooldownUntil = (res as { defeat: true; cooldownUntil?: string | null }).cooldownUntil ?? null;
        this.arenaDefeatShowAt = Date.now() + 2000;
        if (this.anims.exists("arena-die") && this.textures.exists(ARENA_DIE_KEYS[0])) {
          this.player.setTexture(ARENA_DIE_KEYS[0], 0);
          this.player.setDisplaySize(this.playerDisplayW, this.playerDisplayH);
          this.player.anims.play("arena-die", false);
        }
        this.arenaMonsters = [];
        this.arenaAttackTarget = null;
        this.updateArenaHudText();
        return;
      }

      const monsters = "monsters" in res ? res.monsters : [];
      for (let i = 0; i < monsters.length && i < this.arenaMonsters.length; i++) {
        const mon = this.arenaMonsters[i];
        const state = monsters[i];
        mon.hp = state.hp;
        mon.maxHp = state.maxHp;
        this.drawArenaMonsterHpBar(mon);
        if (state.hp <= 0) {
          mon.dead = true;
          mon.hpText.destroy();
          const playDieThenFade = () => {
            this.tweens.add({
              targets: mon.sprite,
              alpha: 0,
              duration: DEATH_FADE_MS,
              ease: "Linear",
              onComplete: () => {
                mon.sprite.destroy();
                mon.hpBar.destroy();
              },
            });
          };
          if (this.anims.exists("monster-die") && this.textures.exists("monster-die-0")) {
            mon.sprite.setTexture("monster-die-0");
            mon.sprite.setDisplaySize(CHARACTER_DISPLAY_W, CHARACTER_DISPLAY_H);
            mon.sprite.anims.play("monster-die", false);
            mon.sprite.once(Phaser.Animations.Events.ANIMATION_COMPLETE, playDieThenFade);
          } else {
            playDieThenFade();
          }
        }
      }
      this.arenaMonsters = this.arenaMonsters.filter((x) => !x.dead);
      if (this.arenaAttackTarget && this.arenaAttackTarget.dead) this.arenaAttackTarget = null;
      this.updateArenaHudText();

      if (this.arenaMonsters.length === 0 && this.arenaCurrentWave0 + 1 < this.arenaTotalWaves) {
        this.arenaState = "NEXT_WAVE";
        this.arenaNextWaveAt = Date.now() + ARENA_PAUSE_BETWEEN_WAVES_MS;
        this.updateArenaHudText();
        this.time.delayedCall(ARENA_PAUSE_BETWEEN_WAVES_MS, () => {
          postArenaNextWave(d.token, runId).then((nextRes) => {
            if (!nextRes.ok || !nextRes.monsters) return;
            this.arenaCurrentWave0++;
            this.arenaToSpawnThisWave = nextRes.monsters.length;
            this.arenaSpawnedThisWave = 0;
            for (const stats of nextRes.monsters) {
              this.spawnArenaMonsterWithServerStats(stats);
            }
            this.arenaState = "FIGHT";
            this.updateArenaHudText();
          });
        });
      }
    });
  }

  private updateArenaMonsters(delta: number) {
    const now = Date.now();
    const playerPxX = this.player.x;
    const playerPxY = this.player.y;
    const playerTileX = this.gridX;
    const playerTileY = this.gridY;
    for (const m of this.arenaMonsters) {
      if (m.dead || now < m.invulnerableUntil) continue;
      m.sprite.setDepth(1500 + m.sprite.y / TILE_SIZE);
      const mTileX = Math.round((m.sprite.x - TILE_SIZE / 2) / TILE_SIZE);
      const mTileY = Math.round((m.sprite.y - TILE_SIZE / 2) / TILE_SIZE);
      const distTiles = Math.abs(mTileX - playerTileX) + Math.abs(mTileY - playerTileY);
      if (distTiles <= ARENA_MONSTER_ALERT_TILES) m.alerted = true;
      const distPx = Phaser.Math.Distance.Between(m.sprite.x, m.sprite.y, playerPxX, playerPxY);
      if (distPx <= MONSTER_ATTACK_RANGE) {
        m.tileX = Math.round((m.sprite.x - TILE_SIZE / 2) / TILE_SIZE);
        m.tileY = Math.round((m.sprite.y - TILE_SIZE / 2) / TILE_SIZE);
        if (now - m.lastAttackAt >= m.attackCooldownMs) {
          m.lastAttackAt = now;
          const dx = this.gridX - m.tileX;
          const dy = this.gridY - m.tileY;
          const hitDir = Math.abs(dx) >= Math.abs(dy)
            ? (dx > 0 ? "monster-hit-right" : "monster-hit-left")
            : (dy > 0 ? "monster-hit-down" : "monster-hit-up");
          if (this.anims.exists(hitDir)) {
            m.sprite.setDisplaySize(CHARACTER_DISPLAY_W, CHARACTER_DISPLAY_H);
            m.sprite.anims.play(hitDir, false);
            this.time.delayedCall(0, () => {
              if (!m.dead && m.sprite.scene) m.sprite.setDisplaySize(CHARACTER_DISPLAY_W, CHARACTER_DISPLAY_H);
            });
            m.sprite.once(Phaser.Animations.Events.ANIMATION_COMPLETE, () => {
              m.sprite.setTexture("arena-monster");
              m.sprite.setDisplaySize(CHARACTER_DISPLAY_W, CHARACTER_DISPLAY_H);
            });
          }
          this.showFloatingDamageText(this.player.x, this.player.y, m.damage);
          this.arenaLastDamageAt = now;
          const runId = this.arenaRunId;
          const d = this.arenaData;
          const monsterIndex = this.arenaMonsters.indexOf(m);
          if (runId && d && monsterIndex >= 0) {
            postArenaMonsterHit(d.token, runId, monsterIndex).then((res) => {
              if (!res.ok) return;
              if ("playerHp" in res) {
                this.arenaPlayerHp = res.playerHp;
                this.arenaPlayerHpDisplay = res.playerHp;
              }
              if ("defeat" in res && res.defeat) {
                this.arenaPlayerHp = 0;
                this.arenaPlayerHpDisplay = 0;
                this.arenaState = "DEFEAT";
                this.arenaDefeatCooldownUntil = (res as { defeat: true; cooldownUntil?: string | null }).cooldownUntil ?? null;
                this.arenaDefeatShowAt = Date.now() + 2000;
                if (this.anims.exists("arena-die") && this.textures.exists(ARENA_DIE_KEYS[0])) {
                  this.player.setTexture(ARENA_DIE_KEYS[0], 0);
                  this.player.setDisplaySize(this.playerDisplayW, this.playerDisplayH);
                  this.player.anims.play("arena-die", false);
                }
                this.arenaMonsters = [];
                this.arenaAttackTarget = null;
                this.updateArenaHudText();
              }
            });
          }
        }
      } else if (m.alerted) {
        const mCurTileX = Math.round((m.sprite.x - TILE_SIZE / 2) / TILE_SIZE);
        const mCurTileY = Math.round((m.sprite.y - TILE_SIZE / 2) / TILE_SIZE);
        const path = this.bfsPathForMonster(mCurTileX, mCurTileY, this.gridX, this.gridY, m.pathSeed);
        if (path.length > 0) {
          const [nextTx, nextTy] = path[0];
          const targetPx = nextTx * TILE_SIZE + TILE_SIZE / 2;
          const targetPy = nextTy * TILE_SIZE + TILE_SIZE / 2;
          const dx = targetPx - m.sprite.x;
          const dy = targetPy - m.sprite.y;
          const len = Math.sqrt(dx * dx + dy * dy);
          const move = (m.speedPx * delta) / 1000;
          if (len <= move) {
            m.sprite.x = targetPx;
            m.sprite.y = targetPy;
            m.tileX = nextTx;
            m.tileY = nextTy;
          } else {
            m.sprite.x += (dx / len) * move;
            m.sprite.y += (dy / len) * move;
          }
          if (this.anims.exists("monster-walk-left")) {
            const walkKey = Math.abs(dx) >= Math.abs(dy)
              ? (dx > 0 ? "monster-walk-right" : "monster-walk-left")
              : (dy > 0 ? "monster-walk-down" : "monster-walk-up");
            m.sprite.setDisplaySize(CHARACTER_DISPLAY_W, CHARACTER_DISPLAY_H);
            m.sprite.anims.play(walkKey, true);
            this.time.delayedCall(0, () => {
              if (!m.dead && m.sprite.scene) m.sprite.setDisplaySize(CHARACTER_DISPLAY_W, CHARACTER_DISPLAY_H);
            });
          }
        } else if (this.textures.exists("arena-monster") && !m.sprite.anims.currentAnim?.key.startsWith("monster-hit")) {
          m.sprite.setTexture("arena-monster");
          m.sprite.setDisplaySize(CHARACTER_DISPLAY_W, CHARACTER_DISPLAY_H);
        }
        this.drawArenaMonsterHpBar(m);
      } else {
        const rawTarget = m.patrolCenterX + m.patrolDirX;
        const targetTileX = Phaser.Math.Clamp(rawTarget, 0, this.mapWidthTiles - 1);
        const targetPx = targetTileX * TILE_SIZE + TILE_SIZE / 2;
        const dx = targetPx - m.sprite.x;
        const move = (ARENA_PATROL_SPEED_PX * delta) / 1000;
        if (Math.abs(dx) <= move) {
          m.sprite.x = targetPx;
          m.tileX = targetTileX;
          m.patrolDirX = -m.patrolDirX;
        } else {
          m.sprite.x += (dx > 0 ? 1 : -1) * move;
          m.tileX = Math.round((m.sprite.x - TILE_SIZE / 2) / TILE_SIZE);
        }
        if (this.anims.exists("monster-walk-left")) {
          const walkKey = dx >= 0 ? "monster-walk-right" : "monster-walk-left";
          m.sprite.setDisplaySize(CHARACTER_DISPLAY_W, CHARACTER_DISPLAY_H);
          m.sprite.anims.play(walkKey, true);
        }
        this.drawArenaMonsterHpBar(m);
      }
    }
  }

  private updatePvpPlayerMovement(_delta: number) {
    if (isChatInputFocused()) return;
    if (this.pathQueue.length > 0 || this.pathingToHome || this.pathingToMarket || this.pathingToMine || this.pathingToArena || this.pathingToValley || this.pathingToForge || this.pathingToRock || this.pathingToPvpOpponent) {
      this.cancelPathing();
    }
    if (this.isMoving) return;
    const keyLeft = this.cursors.left.isDown || this.wasd.A.isDown;
    const keyRight = this.cursors.right.isDown || this.wasd.D.isDown;
    const keyUp = this.cursors.up.isDown || this.wasd.W.isDown;
    const keyDown = this.cursors.down.isDown || this.wasd.S.isDown;
    if (keyLeft || keyRight || keyUp || keyDown) {
      if (keyLeft) {
        this.pvpFacing = "left";
        this.tryMove(-1, 0);
      } else if (keyRight) {
        this.pvpFacing = "right";
        this.tryMove(1, 0);
      } else if (keyUp) {
        this.pvpFacing = "up";
        this.tryMove(0, -1);
      } else if (keyDown) {
        this.pvpFacing = "down";
        this.tryMove(0, 1);
      }
    } else {
      this.pvpFacing = "idle";
      this.stopWalkAnimIfIdle();
    }
  }

  private updateArenaPlayerMovement(_delta: number) {
    if (isChatInputFocused()) return;
    if (this.pathQueue.length > 0 || this.pathingToHome || this.pathingToMarket || this.pathingToMine || this.pathingToArena || this.pathingToValley || this.pathingToForge || this.pathingToRock || this.pathingToArenaMonster) {
      this.cancelPathing();
    }
    if (this.isMoving) return;
    const joy = getJoystickDir();
    const keyLeft = this.cursors.left.isDown || this.wasd.A.isDown;
    const keyRight = this.cursors.right.isDown || this.wasd.D.isDown;
    const keyUp = this.cursors.up.isDown || this.wasd.W.isDown;
    const keyDown = this.cursors.down.isDown || this.wasd.S.isDown;
    const joyX = joy.x !== 0 || joy.y !== 0 ? joy.x : 0;
    const joyY = joy.x !== 0 || joy.y !== 0 ? joy.y : 0;
    let dx = keyLeft || joyX === -1 ? -1 : keyRight || joyX === 1 ? 1 : 0;
    let dy = keyUp || joyY === -1 ? -1 : keyDown || joyY === 1 ? 1 : 0;
    if (dx !== 0 && dy !== 0) dx = dy = 0;
    if (dx !== 0 || dy !== 0) {
      this.arenaAttackTarget = null;
      this.tryMove(dx, dy);
    } else {
      this.stopWalkAnimIfIdle();
    }
    if (this.arenaAttackTarget && !this.arenaAttackTarget.dead) {
      const distPx = Phaser.Math.Distance.Between(this.player.x, this.player.y, this.arenaAttackTarget.sprite.x, this.arenaAttackTarget.sprite.y);
      if (distPx <= PLAYER_MELEE_RANGE && Date.now() >= this.arenaHitCooldownUntil) {
        this.doArenaOneHit(this.arenaAttackTarget);
        this.arenaAttackTarget = null;
      }
    }
  }

  /** Client-side regen for display only (smooth bar); server remains source of truth and syncs on each response. */
  private updateArenaRegen(delta: number) {
    if (this.arenaState !== "FIGHT" && this.arenaState !== "WAVE" && this.arenaState !== "NEXT_WAVE") return;
    const maxHp = this.arenaPlayerMaxHp;
    const eightyPct = Math.floor(maxHp * 0.8);
    const now = Date.now();
    if (now - this.arenaLastDamageAt < REGEN_DELAY_MS) return;
    if (this.arenaPlayerHpDisplay >= eightyPct) return;
    const level = this.arenaData?.character.level ?? 1;
    const regenMult = (1 + this.arenaCurrentWave0 * 0.2) * regenMultByLevel(level);
    const add = (maxHp * (REGEN_PCT_PER_SEC / 100) * regenMult * delta) / 1000;
    this.arenaPlayerHpDisplay = Math.min(eightyPct, this.arenaPlayerHpDisplay + add);
  }

  private showArenaVictory() {
    const el = typeof document !== "undefined" ? document.getElementById("ui-arena-hud") : null;
    if (el) el.style.display = "none";
    const level = this.arenaVictoryLevel ?? this.arenaData?.character.level ?? 1;
    showArenaResult("victory", { level }, () => this.arenaData?.onExit("victory"));
  }

  private showArenaDefeat() {
    const el = typeof document !== "undefined" ? document.getElementById("ui-arena-hud") : null;
    if (el) el.style.display = "none";
    const d = this.arenaData!;
    showArenaResult(
      "defeat",
      {
        battlesLeft: d.battlesLeft,
        maxBattlesPerDay: d.maxWinsPerDay,
        cooldownUntil: this.arenaDefeatCooldownUntil,
      },
      () => this.arenaData?.onExit("defeat")
    );
  }

  /** Walkable tile adjacent to rock (gx, gy), nearest to player; or null if none. */
  private getWalkableTileNextToRock(gx: number, gy: number): [number, number] | null {
    const candidates: [number, number][] = [
      [gx - 1, gy],
      [gx + 1, gy],
      [gx, gy - 1],
      [gx, gy + 1],
    ];
    let best: [number, number] | null = null;
    let bestDist = Infinity;
    for (const [tx, ty] of candidates) {
      if (!this.isWalkable(tx, ty)) continue;
      const d = Math.abs(tx - this.gridX) + Math.abs(ty - this.gridY);
      if (d < bestDist) {
        bestDist = d;
        best = [tx, ty];
      }
    }
    return best;
  }

  /** True if player is on a tile adjacent to rock center (gx, gy). */
  private isNextToRock(gx: number, gy: number): boolean {
    const manhattan = Math.abs(this.gridX - gx) + Math.abs(this.gridY - gy);
    return manhattan === 1;
  }

  /** Hit direction from player to rock: "hit-left" | "hit-right" | "hit-down" | "hit-up". */
  private getHitDirection(gx: number, gy: number): "hit-left" | "hit-right" | "hit-down" | "hit-up" {
    const adx = Math.abs(this.gridX - gx);
    const ady = Math.abs(this.gridY - gy);
    if (adx >= ady) {
      return this.gridX > gx ? "hit-left" : "hit-right";
    }
    return this.gridY < gy ? "hit-down" : "hit-up";
  }

  /** Play one hit animation then restore idle. Sets hit cooldown (1s, must match server). */
  private performRockHit(gx: number, gy: number) {
    playPickaxe();
    const HIT_COOLDOWN_MS = 1000;
    this.hitCooldownUntil = Date.now() + HIT_COOLDOWN_MS;
    const dir = this.getHitDirection(gx, gy);
    if (!this.anims.exists(dir)) {
      this.stopWalkAnimIfIdle();
      return;
    }
    const w = this.playerDisplayW;
    const h = this.playerDisplayH;
    const frameKeys = dir === "hit-down" ? HIT_DOWN_KEYS : dir === "hit-left" ? HIT_LEFT_KEYS : dir === "hit-right" ? HIT_RIGHT_KEYS : HIT_UP_KEYS;
    if (this.textures.exists(frameKeys[0])) {
      this.player.setTexture(frameKeys[0], 0);
      this.player.setDisplaySize(w, h);
    }
    this.player.anims.play(dir, false);
    const rockGx = gx;
    const rockGy = gy;
    this.player.once(Phaser.Animations.Events.ANIMATION_COMPLETE, () => {
      this.restoreIdleAnimation();
      this.onMiningHitComplete(rockGx, rockGy);
    });
  }

  private showFloatingDamageText(worldX: number, worldY: number, damage: number): void {
    const text = `-${Math.round(damage)}`;
    const t = this.add
      .text(worldX, worldY - 24, text, {
        fontFamily: "Press Start 2P",
        fontSize: "10px",
        color: "#ef4444",
      })
      .setOrigin(0.5, 0.5)
      .setDepth(10001)
      .setScrollFactor(1);
    this.tweens.add({
      targets: t,
      y: worldY - 24 - 48,
      alpha: 0,
      duration: 3600,
      ease: "Cubic.easeOut",
      onComplete: () => t.destroy(),
    });
  }

  private showFloatingDropText(text: string): void {
    if (!this.player) return;
    const worldX = this.player.x;
    const worldY = this.player.y - 24;
    const color = text === "Nothing" ? "#ffffff" : text.includes("Gold") ? "#d4a017" : text.includes("Silver") ? "#c0c0c0" : "#cd7f32";
    const t = this.add
      .text(worldX, worldY, text, {
        fontFamily: "Press Start 2P",
        fontSize: "10px",
        color,
      })
      .setOrigin(0.5, 0.5)
      .setDepth(10001)
      .setScrollFactor(1);
    this.tweens.add({
      targets: t,
      y: worldY - 48,
      alpha: 0,
      duration: 3600,
      ease: "Cubic.easeOut",
      onComplete: () => t.destroy(),
    });
  }

  private onMiningHitComplete(rockGx: number, rockGy: number): void {
    if (this.currentMapId !== "map2") return;
    const rockIndex = this.rockTiles.findIndex(([x, y]) => x === rockGx && y === rockGy);
    if (rockIndex < 0) return;
    const token = getToken();
    if (!token) return;
    withGameLock(() => postMiningHit(token, this.currentMapId, rockIndex)).then((result) => {
      if (result === null) {
        showGameMessage("Close the other tab to play here.");
        return;
      }
      if (!result.ok) {
        const err = (result as { error?: string }).error;
        if (err === "rock_depleted") showGameMessage("Rock depleted. Resets at 00/06/12/18 UTC.");
        else if (err === "daily_limit_reached") showGameMessage("Daily limit reached.");
        else if (err === "cooldown") { /* cooldown: no message */ }
        else if (err === "inventory_full") showGameMessage("Inventory full.");
        else showGameMessage(err ?? "Mining failed.");
        return;
      }
      const data = result.data;
      applyCharacterData(data.character, data.slots);
      syncHeader();
      this.updateRockProgressBar(data.rockIndex, data.rockHealthPct);
      this.setRockSpriteByHealth(data.rockIndex, data.rockHealthPct);
      const drop = data.drop;
      if (drop.resourceType === "nothing") this.showFloatingDropText("Nothing");
      else {
        const name = drop.resourceType.charAt(0).toUpperCase() + drop.resourceType.slice(1);
        this.showFloatingDropText(`+1 ${name}`);
        logAction(`Mined +1 ${name}`);
      }
    });
  }

  /** Set player to idle texture and animation (e.g. after hit completes). */
  private restoreIdleAnimation() {
    if (this.arenaMode && this.arenaState === "DEFEAT") return;
    const w = this.playerDisplayW;
    const h = this.playerDisplayH;
    const useArenaStyle = this.currentMapId === "map3" && (this.arenaMode || this.pvpMode);
    if (useArenaStyle && this.textures.exists(ARENA_IDLE_KEYS[0]) && this.anims.exists("arena-idle")) {
      this.player.setTexture(ARENA_IDLE_KEYS[0], 0);
      this.player.setDisplaySize(w, h);
      this.player.anims.play("arena-idle", true);
    } else if (useArenaStyle && this.textures.exists(ARENA_WALK_DOWN_KEYS[0])) {
      this.player.setTexture(ARENA_WALK_DOWN_KEYS[0]);
      this.player.setDisplaySize(w, h);
      this.player.anims.stop();
    } else if (this.textures.exists(IDLE_KEYS[0]) && this.anims.exists("idle")) {
      this.player.setTexture(IDLE_KEYS[0], 0);
      this.player.setDisplaySize(w, h);
      this.player.anims.play("idle", true);
    } else {
      this.player.setTexture("character");
      this.player.setDisplaySize(w, h);
    }
  }

  /** Click on rock: if near, hit once; else run to rock then hit. Clicking another rock while running switches target. */
  private handleRockClick(rockGx: number, rockGy: number) {
    if (isSessionInvalid()) return;
    if (isHomeOpen() || isMarketOpen() || isMineOpen() || isArenaOpen() || isValleyOpen() || isBackpackOpen() || isForgeOpen()) return;
    if (Date.now() < this.hitCooldownUntil) return;
    if (this.pathingToRock && rockGx === this.rockTargetGx && rockGy === this.rockTargetGy) return;
    if (this.isNextToRock(rockGx, rockGy)) {
      this.performRockHit(rockGx, rockGy);
      return;
    }
    const tile = this.getWalkableTileNextToRock(rockGx, rockGy);
    if (!tile) return;
    const [hx, hy] = tile;
    if (this.pathingToRock && (rockGx !== this.rockTargetGx || rockGy !== this.rockTargetGy)) {
      this.tweens.killTweensOf(this.player);
      this.isMoving = false;
      const snapX = this.gridX * TILE_SIZE + TILE_SIZE / 2;
      const snapY = this.gridY * TILE_SIZE + TILE_SIZE / 2 + CHARACTER_Y_OFFSET;
      this.player.setPosition(snapX, snapY);
    }
    const path = this.bfsPath(this.gridX, this.gridY, hx, hy);
    if (path.length === 0) return;
    this.pathQueue = path.slice(1);
    this.pathingToHome = false;
    this.pathingToMarket = false;
    this.pathingToMine = false;
    this.pathingToValley = false;
    this.pathingToRock = true;
    this.rockTargetGx = rockGx;
    this.rockTargetGy = rockGy;
    const next = path[0];
    this.tryMove(next[0] - this.gridX, next[1] - this.gridY, () => this.onPathStepComplete());
  }

  /** Start path to door tile and open window on arrival. Resets all pathing flags, sets one to true. */
  private pathToDoorAndOpen(
    doorTile: [number, number] | null,
    openWindow: () => void,
    pathingKey: "pathingToHome" | "pathingToMarket" | "pathingToMine" | "pathingToArena" | "pathingToValley" | "pathingToForge"
  ): void {
    if (!doorTile) return;
    const [hx, hy] = doorTile;
    if (this.gridX === hx && this.gridY === hy) {
      openWindow();
      return;
    }
    const path = this.bfsPath(this.gridX, this.gridY, hx, hy);
    if (path.length === 0) return;
    this.pathQueue = path.slice(1);
    this.pathingToHome = false;
    this.pathingToMarket = false;
    this.pathingToMine = false;
    this.pathingToArena = false;
    this.pathingToValley = false;
    this.pathingToForge = false;
    this.pathingToRock = false;
    this[pathingKey] = true;
    const next = path[0];
    this.tryMove(next[0] - this.gridX, next[1] - this.gridY, () => this.onPathStepComplete());
  }

  /** Called after each step when pathing to Home/Market/Mine/Valley; continue path or open window. */
  private onPathStepComplete() {
    const keyDown =
      this.cursors.left.isDown ||
      this.wasd.A.isDown ||
      this.cursors.right.isDown ||
      this.wasd.D.isDown ||
      this.cursors.up.isDown ||
      this.wasd.W.isDown ||
      this.cursors.down.isDown ||
      this.wasd.S.isDown;
    if (keyDown) {
      this.cancelPathing();
      return;
    }
    if (this.pathQueue.length > 0) {
      const next = this.pathQueue.shift()!;
      this.tryMove(next[0] - this.gridX, next[1] - this.gridY, () => this.onPathStepComplete());
      return;
    }
    if (this.pathingToHome) {
      this.pathingToHome = false;
      openHome();
    } else if (this.pathingToMarket) {
      this.pathingToMarket = false;
      openMarket();
    } else if (this.pathingToMine) {
      this.pathingToMine = false;
      openMine();
    } else if (this.pathingToArena) {
      this.pathingToArena = false;
      openArena();
    } else if (this.pathingToValley) {
      this.pathingToValley = false;
      logAction("Enter Valley");
      openValley();
    } else if (this.pathingToForge) {
      this.pathingToForge = false;
      openForge();
    } else if (this.pathingToRock) {
      this.pathingToRock = false;
      this.performRockHit(this.rockTargetGx, this.rockTargetGy);
    } else if (this.pathingToArenaMonster) {
      this.pathingToArenaMonster = false;
      if (this.arenaAttackTarget && !this.arenaAttackTarget.dead && Date.now() >= this.arenaHitCooldownUntil) {
        const distPx = Phaser.Math.Distance.Between(this.player.x, this.player.y, this.arenaAttackTarget.sprite.x, this.arenaAttackTarget.sprite.y);
        if (distPx <= PLAYER_MELEE_RANGE) {
          this.doArenaOneHit(this.arenaAttackTarget);
        }
        this.arenaAttackTarget = null;
      }
    } else if (this.pathingToPvpOpponent) {
      this.pathingToPvpOpponent = false;
    }
  }

  private stopWalkAnimIfIdle() {
    const currentAnimKey = this.player.anims?.currentAnim?.key;
    if (currentAnimKey === "hit-down" || currentAnimKey === "hit-left" || currentAnimKey === "hit-right" || currentAnimKey === "hit-up") return;
    if (currentAnimKey?.startsWith("arena-hit-") || currentAnimKey === "arena-idle") return;
    if ((IDLE_KEYS as readonly string[]).includes(this.player.texture.key)) return;
    if (this.currentMapId === "map3" && (this.arenaMode || this.pvpMode) && (ARENA_IDLE_KEYS as readonly string[]).includes(this.player.texture.key)) return;
    if (this.cursors.down.isDown || this.wasd.S.isDown) return;
    if (this.cursors.right.isDown || this.wasd.D.isDown) return;
    this.player.anims.stop();
    this.restoreIdleAnimation();
  }

  update(_time: number, delta: number) {
    if (!this.player?.body) return;
    (this.player.body as Phaser.Physics.Arcade.Body).setVelocity(0, 0);
    if (!this.isMoving) this.player.setPosition(Math.round(this.player.x), Math.round(this.player.y));
    if (this.pvpMode) {
      this.drawArenaPlayerHpBar();
      if (this.pvpOpponent) this.drawPvpOpponentHpBar();
      if (!this.pvpBattleEnded) {
        this.updatePvpPlayerMovement(delta);
        const now = Date.now();
        if (now - this.pvpLastPositionSendAt >= 50) {
          this.pvpLastPositionSendAt = now;
          this.sendPvpPosition();
        }
      }
      if (!this.pvpBattleEnded && this.arenaRunId && this.pvpData) {
        const now = Date.now();
        if (now - this.pvpPollRunAt >= 100) {
          this.pvpPollRunAt = now;
          getPvpRun(getToken(), this.arenaRunId).then((res) => {
            if (!res.ok || this.pvpBattleEnded) return;
            this.arenaPlayerHp = res.myHp;
            this.arenaPlayerHpDisplay = res.myHp;
            if (this.pvpOpponent) {
              this.pvpOpponent.hp = res.opponentHp;
              this.drawPvpOpponentHpBar();
              const ox = res.opponentGridX;
              const oy = res.opponentGridY;
              const facing = res.opponentFacing ?? "idle";
              if (typeof ox === "number" && typeof oy === "number" && ox >= 0 && oy >= 0) {
                if (ox !== this.pvpOpponentLastGridX || oy !== this.pvpOpponentLastGridY) {
                  this.pvpOpponentLastGridX = ox;
                  this.pvpOpponentLastGridY = oy;
                  this.pvpOpponent.tileX = ox;
                  this.pvpOpponent.tileY = oy;
                  const targetPx = ox * TILE_SIZE + TILE_SIZE / 2;
                  const targetPy = oy * TILE_SIZE + TILE_SIZE / 2 + CHARACTER_Y_OFFSET;
                  this.tweens.add({
                    targets: this.pvpOpponent.sprite,
                    x: targetPx,
                    y: targetPy,
                    duration: 150,
                    ease: "Linear",
                  });
                  this.pvpOpponent.sprite.setDepth(1500 + oy);
                  this.pvpOpponent.hpBar.setDepth(1600 + oy);
                  this.pvpOpponent.hpText.setDepth(1601 + oy);
                  this.pvpOpponent.nameText.setDepth(1602 + oy);
                }
                const animKey = facing === "idle" ? "arena-idle" : `arena-walk-${facing}`;
                if (this.anims.exists(animKey) && this.pvpOpponent.sprite.anims?.currentAnim?.key !== animKey) {
                  this.pvpOpponent.sprite.anims.play(animKey, true);
                }
              }
            }
            this.drawArenaPlayerHpBar();
            if (this.arenaPlayerHp <= 0 || (this.pvpOpponent && this.pvpOpponent.hp <= 0)) {
              this.pvpBattleEnded = true;
              this.showPvpOverlay(this.pvpOpponent != null && this.pvpOpponent.hp <= 0);
            }
          });
        }
      }
      return;
    }
    if (this.arenaMode) {
      if (this.arenaState === "DEFEAT" && this.arenaDefeatShowAt != null && Date.now() >= this.arenaDefeatShowAt) {
        this.arenaDefeatShowAt = null;
        this.showArenaDefeat();
        return;
      }
      if (this.arenaState === "VICTORY" && this.arenaVictoryShowAt != null && Date.now() >= this.arenaVictoryShowAt) {
        this.arenaVictoryShowAt = null;
        this.showArenaVictory();
        return;
      }
      if (this.arenaState === "VICTORY" || this.arenaState === "DEFEAT") return;
      this.updateArenaHudText();
      if (this.arenaState === "FIGHT" && this.arenaSpawnedThisWave < this.arenaToSpawnThisWave) {
        this.arenaSpawnCountdown -= delta;
        if (this.arenaSpawnCountdown <= 0) {
          this.spawnArenaMonster();
          this.arenaSpawnCountdown = this.arenaSpawnInterval;
        }
      }
      this.updateArenaPlayerMovement(delta);
      this.updateArenaMonsters(delta);
      this.updateArenaRegen(delta);
      this.drawArenaPlayerHpBar();
      this._minimapFrame++;
      if (this._minimapFrame % 3 === 0) this.drawMinimap();
      return;
    }
    if ((this.currentMapId === "map1" || this.currentMapId === "map2") && pendingLevelUpLevel != null) {
      const level = pendingLevelUpLevel;
      if (typeof console !== "undefined") console.log("[LevelUp] update: showing overlay for level", level, "currentMapId", this.currentMapId);
      clearPendingLevelUp();
      this.time.delayedCall(400, () => {
        if (typeof console !== "undefined") console.log("[LevelUp] delayedCall: calling showLevelUpOverlay(", level, ")");
        showLevelUpOverlay(level, () => {});
      });
    }
    if ((this.currentMapId === "map1" || this.currentMapId === "map2") && pendingWelcome) {
      clearPendingWelcome();
      this.time.delayedCall(400, () => {
        showWelcomeOverlay(() => {
          markWelcomeShown();
        });
      });
    }
    if (isSessionInvalid()) {
      this.cancelPathing();
      this.pathQueue.length = 0;
      this.isMoving = false;
      return;
    }
    if (isHomeOpen() || isMarketOpen() || isMineOpen() || isArenaOpen() || isValleyOpen() || isBackpackOpen() || isForgeOpen()) return;
    if (typeof document !== "undefined" && document.getElementById("ui-map-overlay")?.classList.contains("open"))
      return;
    if (this.isMoving) return;
    if (isChatInputFocused()) {
      this.stopWalkAnimIfIdle();
      this._minimapFrame++;
      if (this._minimapFrame % 3 === 0) this.drawMinimap();
      return;
    }
    this.stopWalkAnimIfIdle();
    const joy = getJoystickDir();
    const keyLeft = this.cursors.left.isDown || this.wasd.A.isDown;
    const keyRight = this.cursors.right.isDown || this.wasd.D.isDown;
    const keyUp = this.cursors.up.isDown || this.wasd.W.isDown;
    const keyDown = this.cursors.down.isDown || this.wasd.S.isDown;
    const joyX = joy.x !== 0 || joy.y !== 0 ? joy.x : 0;
    const joyY = joy.x !== 0 || joy.y !== 0 ? joy.y : 0;
    let dx = keyLeft || joyX === -1 ? -1 : keyRight || joyX === 1 ? 1 : 0;
    let dy = keyUp || joyY === -1 ? -1 : keyDown || joyY === 1 ? 1 : 0;
    if (dx !== 0 && dy !== 0) dx = dy = 0;
    if (dx !== 0 || dy !== 0) {
      if (this.pathQueue.length > 0 || this.pathingToHome || this.pathingToMarket || this.pathingToMine || this.pathingToArena || this.pathingToValley || this.pathingToForge || this.pathingToRock) {
        this.cancelPathing();
      }
      this.tryMove(dx, dy);
    }
    this._minimapFrame++;
    if (this._minimapFrame % 3 === 0) this.drawMinimap();
  }
}

const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  width: window.innerWidth,
  height: window.innerHeight,
  parent: "game-container",
  dom: { createContainer: true },
  backgroundColor: 0x2d2d2d,
  pixelArt: true,
  scale: {
    mode: Phaser.Scale.RESIZE,
    autoCenter: Phaser.Scale.CENTER_BOTH,
    width: window.innerWidth,
    height: window.innerHeight,
  },
  physics: { default: "arcade", arcade: { gravity: { x: 0, y: 0 } } },
  scene: [GameScene],
  render: { roundPixels: true, antialias: false },
};

let tokenAtBoot: string | null = null;

const TAB_ID =
  typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2) + Date.now().toString(36);
const ACTIVE_TAB_KEY = "pixelvalley_active_tab";
const ACTIVE_TAB_MAX_AGE_MS = 15000;

function setActiveTabInStorage(): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(ACTIVE_TAB_KEY, JSON.stringify({ tabId: TAB_ID, activeAt: Date.now() }));
  } catch {
    // ignore
  }
}

function bootGame() {
  if (typeof document === "undefined") return;
  const parentEl = document.getElementById("game-container");
  if (!parentEl) return;
  tokenAtBoot = getToken();
  setActiveTabInStorage();
  const game = new Phaser.Game({ ...config, parent: parentEl });
  (window as unknown as { game: Phaser.Game }).game = game;
  (
    window as unknown as {
      __switchToMap?: (mapId: string, options?: { spawnNear?: string }) => void;
    }
  ).__switchToMap = (mapId: string, options?: { spawnNear?: string }) => {
    const scene = game.scene.getScene("Game");
    if (scene) scene.scene.restart({ mapId, spawnNear: options?.spawnNear });
  };
  (
    window as unknown as {
      __startArena?: () => void;
    }
  ).__startArena = () => {
    const token = getToken();
    if (!token || isSessionInvalid()) return;
    const w = window as unknown as { __arenaStartInProgress?: boolean };
    if (w.__arenaStartInProgress) return;
    w.__arenaStartInProgress = true;
    postArenaStart(token).then((r) => {
      if (!r.ok) {
        if (r.error === "daily_limit") {
          showGameMessage("No arena battles left for today.");
        } else {
          const formatCooldown = (isoUntil: string | undefined): string => {
            if (!isoUntil) return "30 min";
            const end = new Date(isoUntil).getTime();
            const sec = Math.max(0, Math.floor((end - Date.now()) / 1000));
            const h = Math.floor(sec / 3600);
            const m = Math.floor((sec % 3600) / 60);
            const s = sec % 60;
            if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
            return `${m}:${String(s).padStart(2, "0")}`;
          };
          const remaining = formatCooldown(r.cooldownUntil);
          const el = document.createElement("div");
          el.className = "game-toast arena-toast";
          el.style.cssText =
            "position:fixed;left:50%;top:20%;transform:translateX(-50%);padding:12px 18px;background:#1e1e1e;border:2px solid #fbbf24;color:#e0e0e0;font-family:inherit;font-size:10px;z-index:10004;pointer-events:auto;";
          el.textContent = `Try again in ${remaining}.`;
          document.body.appendChild(el);
          setTimeout(() => el.remove(), 8000);
        }
        w.__arenaStartInProgress = false;
        return;
      }
      showTransitionPreloader("/assets/monsters/pumxm.png", () => {
        w.__arenaStartInProgress = false;
        const g = (window as unknown as { game: Phaser.Game }).game;
        if (!g) return;
        g.scene.start("Game", {
          mapId: "map3",
          spawnNear: "arena",
          arenaMode: true,
          arenaData: {
            token,
            runId: r.data!.runId,
            character: r.data!.character,
            initialMonsters: r.data!.monsters,
            totalWaves: r.data!.totalWaves,
            currentWave0: r.data!.currentWave0 ?? 0,
            winsToday: r.data!.winsToday,
            battlesLeft: r.data!.battlesLeft,
            maxWinsPerDay: r.data!.maxBattlesPerDay,
            onExit: () => {
              homeState.currentHp = homeState.maxHp;
              getCharacter(token)
                .then((cr) => {
                  if (cr?.ok) applyCharacterData(cr.data.character, cr.data.slots);
                  syncHeader();
                  g.scene.start("Game", { mapId: "map1", spawnNear: "arena" });
                })
                .catch(() => g.scene.start("Game", { mapId: "map1", spawnNear: "arena" }));
            },
          },
        });
      });
    }).catch(() => {
      (window as unknown as { __arenaStartInProgress?: boolean }).__arenaStartInProgress = false;
    });
  };
  (
    window as unknown as {
      __startPvpArena?: (opts: import("./pvpArenaWindow").PvpStartOpts) => void;
    }
  ).__startPvpArena = (opts) => {
    const token = getToken();
    if (!token) return;
    const g = (window as unknown as { game: Phaser.Game }).game;
    if (!g) return;
    const myLevel = opts.myLevel ?? 1;
    const myBowLevel = opts.myBowLevel ?? 0;
    const pvpData = {
      token,
      runId: opts.runId,
      battleId: opts.battleId,
      character: {
        level: myLevel,
        maxHp: opts.myMaxHp,
        currentHp: opts.myHp,
        bowLevel: myBowLevel,
        moveSpeedLevel: 0,
      },
      myHp: opts.myHp,
      opponentHp: opts.opponentHp,
      myMaxHp: opts.myMaxHp,
      opponentMaxHp: opts.opponentMaxHp,
      opponentLevel: opts.opponentLevel ?? 1,
      opponentBowLevel: opts.opponentBowLevel ?? 0,
      isPlayer1: opts.isPlayer1,
      onExit: () => {
        homeState.currentHp = homeState.maxHp;
        getCharacter(token)
          .then((cr) => {
            if (cr?.ok) applyCharacterData(cr.data.character, cr.data.slots);
            syncHeader();
            g.scene.start("Game", { mapId: "map1", spawnNear: "arena" });
          })
          .catch(() => g.scene.start("Game", { mapId: "map1", spawnNear: "arena" }));
      },
    };
    showTransitionPreloader("/assets/monsters/pumxm.png", () => {
      g.scene.start("Game", {
        mapId: "map3",
        spawnNear: "arena",
        pvpMode: true,
        pvpData,
      });
    });
  };
  const logoutBtn = document.getElementById("ui-logout-btn");
  if (logoutBtn) {
    logoutBtn.addEventListener("click", () => {
      logout(getToken()).then(() => window.location.reload());
    });
  }

  // Footer timer: countdown until 2026-02-17 20:00 UTC, then elapsed time since then
  const EVENT_START_UTC = new Date("2026-02-17T20:00:00Z").getTime();
  const updateFooterTimer = () => {
    const daysEl = document.getElementById("ui-days");
    const hoursEl = document.getElementById("ui-hours");
    const minutesEl = document.getElementById("ui-minutes");
    const secondsEl = document.getElementById("ui-seconds");
    if (!daysEl || !hoursEl || !minutesEl || !secondsEl) return;
    const now = Date.now();
    const diffMs = now < EVENT_START_UTC ? EVENT_START_UTC - now : now - EVENT_START_UTC;
    const totalSeconds = Math.max(0, Math.floor(diffMs / 1000));
    const days = Math.floor(totalSeconds / 86400);
    const hours = Math.floor((totalSeconds % 86400) / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    daysEl.textContent = String(days);
    hoursEl.textContent = String(hours);
    minutesEl.textContent = String(minutes);
    secondsEl.textContent = String(seconds);
  };
  updateFooterTimer();
  setInterval(updateFooterTimer, 1000);

  const onSessionContinued = () => {
    setActiveTabInStorage();
    loadCharacterAndApply().then((ok) => {
      if (ok) {
        syncHeader();
        fetchAndUpdatePoolInHeader();
      }
    });
  };
  window.addEventListener("storage", (e) => {
    if (e.key === STORAGE_KEY && e.newValue != null) {
      invalidateSessionInThisTab();
      showSessionInvalidOverlay({ onContinue: onSessionContinued });
      tokenAtBoot = null;
    }
  });
  setInterval(() => {
    if (tokenAtBoot == null && isSessionInvalid()) return;
    const raw = typeof localStorage !== "undefined" ? localStorage.getItem(STORAGE_KEY) : null;
    if (raw !== tokenAtBoot) {
      tokenAtBoot = null;
      if (!isSessionInvalid()) {
        invalidateSessionInThisTab();
        showSessionInvalidOverlay({ onContinue: onSessionContinued });
      }
      return;
    }
    const activeRaw = typeof localStorage !== "undefined" ? localStorage.getItem(ACTIVE_TAB_KEY) : null;
    if (activeRaw) {
      try {
        const data = JSON.parse(activeRaw) as { tabId?: string; activeAt?: number };
        if (
          data.tabId &&
          data.tabId !== TAB_ID &&
          typeof data.activeAt === "number" &&
          Date.now() - data.activeAt < ACTIVE_TAB_MAX_AGE_MS
        ) {
          if (!isSessionInvalid()) {
            invalidateSessionInThisTab();
            showSessionInvalidOverlay({ message: "Please switch to the other tab to continue." });
          }
          tokenAtBoot = null;
        }
      } catch {
        // ignore
      }
    }
  }, 2000);
  setInterval(() => {
    if (isSessionInvalid()) return;
    const token = getToken();
    if (token) getCharacter(token);
  }, 12000);
}

export { bootGame };
