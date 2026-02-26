/**
 * Arena Phaser scene: waves, monsters, click-to-hit (like mining), victory/defeat.
 * State: PREPARE → WAVE → FIGHT → NEXT_WAVE → VICTORY | DEFEAT
 */
import Phaser from "phaser";
import {
  TILE_SIZE,
  PLAYER_MELEE_RANGE,
  MONSTER_ATTACK_RANGE,
  PLAYER_HIT_COOLDOWN_MS,
  playerMaxHp,
  playerDamage,
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
  REGEN_CAP_WHILE_MONSTERS,
  SPAWN_FADE_MS,
  DEATH_FADE_MS,
  SPAWN_MIN_TILES_FROM_PLAYER,
} from "./arenaConfig.js";

const CHARACTER_BASE = "/assets/characters";
const CHARACTER_Y_OFFSET = -TILE_SIZE * 0.2;
const CHARACTER_DISPLAY_W = 80;
const CHARACTER_DISPLAY_H = 80;
const CENTER_TILE_X = 12;
const MAP_TILES_W = 25;
const MAP_TILES_H = 19;
const MAP_PX_W = MAP_TILES_W * TILE_SIZE;
const MAP_PX_H = MAP_TILES_H * TILE_SIZE;

declare const __BUILD_TIME__: number | undefined;
const CACHE_BUST = typeof __BUILD_TIME__ === "number" ? String(__BUILD_TIME__) : "dev";
function asset(path: string) {
  return `${path}?v=${CACHE_BUST}`;
}

const WALK_DOWN_KEYS = ["character-walk-down-0", "character-walk-down-1", "character-walk-down-2", "character-walk-down-3"] as const;
const WALK_UP_KEYS = ["character-walk-up-0", "character-walk-up-1", "character-walk-up-2", "character-walk-up-3"] as const;
const IDLE_KEYS = ["character-idle-0", "character-idle-1", "character-idle-2", "character-idle-3"] as const;
const HIT_DOWN_KEYS = ["character-hit-down-0", "character-hit-down-1", "character-hit-down-2", "character-hit-down-3"] as const;
const HIT_UP_KEYS = ["character-hit-up-0", "character-hit-up-1", "character-hit-up-2", "character-hit-up-3"] as const;

export type ArenaSceneData = {
  token: string;
  character: {
    level: number;
    maxHp: number;
    currentHp: number;
    bowLevel: number;
    moveSpeedLevel: number;
  };
  winsToday: number;
  maxWinsPerDay: number;
  /** Called when player dies to record loss and get cooldownUntil for overlay. */
  recordLoss?: () => Promise<{ cooldownUntil: string } | null>;
  onExit: (result: "victory" | "defeat") => void;
};

type ArenaState = "PREPARE" | "WAVE" | "FIGHT" | "NEXT_WAVE" | "VICTORY" | "DEFEAT";

/** Tiles: monster only starts chasing when player is within this distance. */
const MONSTER_ALERT_TILES = 4;
/** Patrol speed when not alerted (px/s). */
const PATROL_SPEED_PX = 24;

interface MonsterData {
  sprite: Phaser.GameObjects.Sprite;
  tileY: number;
  hp: number;
  maxHp: number;
  damage: number;
  attackCooldownMs: number;
  speedPx: number;
  waveIndex: number;
  lastAttackAt: number;
  invulnerableUntil: number;
  hpBar: Phaser.GameObjects.Graphics;
  dead: boolean;
  alerted: boolean;
  patrolCenterY: number;
  patrolDir: number;
}

export class ArenaScene extends Phaser.Scene {
  static readonly KEY = "Arena";
  private data!: ArenaSceneData;
  private state: ArenaState = "PREPARE";
  private player!: Phaser.Physics.Arcade.Sprite;
  private playerTileY = 1;
  private playerHp = 100;
  private playerMaxHp = 100;
  private playerDamageAmount = 10;
  private playerSpeedPx = 133;
  private hitCooldownUntil = 0;
  private attackTarget: MonsterData | null = null;
  private lastDamageAt = 0;
  private monsters: MonsterData[] = [];
  private currentWave0 = 0;
  private totalWaves = 2;
  private spawnCountdown = 0;
  private spawnInterval = 900;
  private toSpawnThisWave = 0;
  private spawnedThisWave = 0;
  private playerHpBar!: Phaser.GameObjects.Graphics;
  private hudText!: Phaser.GameObjects.Text;
  private overlayRect!: Phaser.GameObjects.Rectangle;
  private overlayTitle!: Phaser.GameObjects.Text;
  private overlaySub!: Phaser.GameObjects.Text;
  private overlayBtn!: Phaser.GameObjects.Text;
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private wasd!: { W: Phaser.Input.Keyboard.Key; A: Phaser.Input.Keyboard.Key; S: Phaser.Input.Keyboard.Key; D: Phaser.Input.Keyboard.Key };
  private defeatCooldownUntil: string | null = null;
  private defeatCountdownEvent: Phaser.Time.TimerEvent | null = null;

  constructor() {
    super({ key: ArenaScene.KEY });
  }

  init(data: ArenaSceneData) {
    this.data = data;
    const c = data.character;
    this.playerMaxHp = c.maxHp;
    this.playerHp = c.currentHp;
    this.playerDamageAmount = playerDamage(c.bowLevel);
    this.playerSpeedPx = playerSpeedPxPerSec(c.moveSpeedLevel);
    this.totalWaves = waveCount(c.level);
    this.state = "PREPARE";
    this.currentWave0 = 0;
    this.monsters = [];
    this.attackTarget = null;
    this.hitCooldownUntil = 0;
    this.lastDamageAt = 0;
  }

  preload() {
    this.load.setBaseURL("");
    this.load.image("character", asset(`${CHARACTER_BASE}/pix.png`));
    this.load.image("arena-monster", asset("/assets/monsters/pumx.png"));
    for (let i = 0; i < 8; i++) {
      this.load.image(`monster-walk-left-${i}`, asset(`/assets/monsters/walk-left-${i}.png`));
      this.load.image(`monster-walk-right-${i}`, asset(`/assets/monsters/walk-right-${i}.png`));
    }
    for (let i = 0; i < 2; i++) {
      this.load.image(`monster-walk-up-${i}`, asset(`/assets/monsters/walk-up-${i}.png`));
      this.load.image(`monster-walk-down-${i}`, asset(`/assets/monsters/walk-down-${i}.png`));
    }
    for (let i = 0; i < 4; i++) {
      this.load.image(IDLE_KEYS[i], asset(`${CHARACTER_BASE}/pix-idle-${i}.png`));
      this.load.image(WALK_DOWN_KEYS[i], asset(`${CHARACTER_BASE}/pix-walk-down-${i}.png`));
      this.load.image(WALK_UP_KEYS[i], asset(`${CHARACTER_BASE}/pix-walk-up-${i}.png`));
      this.load.image(HIT_DOWN_KEYS[i], asset(`${CHARACTER_BASE}/hit-down-${i}.png`));
      this.load.image(HIT_UP_KEYS[i], asset(`${CHARACTER_BASE}/hit-up-${i}.png`));
    }
  }

  create() {
    this.cameras.main.setBackgroundColor(0x1a1a1a);
    this.physics.world.setBounds(0, 0, MAP_PX_W, MAP_PX_H);
    const px = CENTER_TILE_X * TILE_SIZE + TILE_SIZE / 2;
    const py = this.playerTileY * TILE_SIZE + TILE_SIZE / 2 + CHARACTER_Y_OFFSET;
    this.player = this.physics.add.sprite(px, py, "character");
    this.player.setOrigin(0.5, 0.5).setDepth(1500).setDisplaySize(CHARACTER_DISPLAY_W, CHARACTER_DISPLAY_H);
    (this.player.body as Phaser.Physics.Arcade.Body).setCollideWorldBounds(true);
    this.createCharacterAnimations();
    if (this.anims.exists("idle")) this.player.anims.play("idle", true);

    this.playerHpBar = this.add.graphics().setDepth(3000);
    this.hudText = this.add
      .text(MAP_PX_W / 2, 16, "Wave 0/" + this.totalWaves + "  Monsters: 0", {
        fontFamily: "Press Start 2P",
        fontSize: "10px",
        color: "#fbbf24",
      })
      .setOrigin(0.5, 0)
      .setDepth(3000);

    this.overlayRect = this.add
      .rectangle(MAP_PX_W / 2, MAP_PX_H / 2, MAP_PX_W, MAP_PX_H, 0x000000, 0.85)
      .setDepth(4000)
      .setVisible(false);
    this.overlayTitle = this.add
      .text(MAP_PX_W / 2, MAP_PX_H / 2 - 40, "VICTORY", {
        fontFamily: "Press Start 2P",
        fontSize: "16px",
        color: "#22c55e",
      })
      .setOrigin(0.5)
      .setDepth(4001)
      .setVisible(false);
    this.overlaySub = this.add
      .text(MAP_PX_W / 2, MAP_PX_H / 2, "", {
        fontFamily: "Press Start 2P",
        fontSize: "10px",
        color: "#e0e0e0",
      })
      .setOrigin(0.5)
      .setDepth(4001)
      .setVisible(false);
    this.overlayBtn = this.add
      .text(MAP_PX_W / 2, MAP_PX_H / 2 + 50, "Back to Valley", {
        fontFamily: "Press Start 2P",
        fontSize: "10px",
        color: "#fbbf24",
      })
      .setOrigin(0.5)
      .setDepth(4001)
      .setVisible(false)
      .setInteractive({ useHandCursor: true });
    this.overlayBtn.on("pointerdown", () => this.exitArena());

    this.cursors = this.input.keyboard!.createCursorKeys();
    this.wasd = {
      W: this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.W),
      A: this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.A),
      S: this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.S),
      D: this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.D),
    };
    this.input.on("pointerdown", (ptr: Phaser.Input.Pointer) => this.onPointerDown(ptr));

    this.state = "WAVE";
    this.startWave();
  }

  private createCharacterAnimations() {
    const idleFrames = IDLE_KEYS.map((k) => ({ key: k, frame: 0 }));
    if (!this.anims.exists("idle") && this.textures.exists(IDLE_KEYS[0])) {
      this.anims.create({ key: "idle", frames: idleFrames, frameRate: 6, repeat: -1 });
    }
    ["walk-down", "walk-up"].forEach((animKey, i) => {
      const textureKeys = i === 0 ? WALK_DOWN_KEYS : WALK_UP_KEYS;
      if (!this.anims.exists(animKey) && this.textures.exists(textureKeys[0])) {
        this.anims.create({
          key: animKey,
          frames: textureKeys.map((k) => ({ key: k, frame: 0 })),
          frameRate: 8,
          repeat: -1,
        });
      }
    });
    ["hit-down", "hit-up"].forEach((animKey, i) => {
      const textureKeys = i === 0 ? HIT_DOWN_KEYS : HIT_UP_KEYS;
      if (!this.anims.exists(animKey) && this.textures.exists(textureKeys[0])) {
        this.anims.create({
          key: animKey,
          frames: textureKeys.map((k) => ({ key: k, frame: 0 })),
          frameRate: 12,
          repeat: 0,
        });
      }
    });
    if (!this.anims.exists("monster-walk-down") && this.textures.exists("monster-walk-down-0")) {
      for (const dir of ["down", "up"]) {
        const frames = [0, 1].map((i) => ({ key: `monster-walk-${dir}-${i}`, frame: 0 }));
        this.anims.create({ key: `monster-walk-${dir}`, frames, frameRate: 8, repeat: -1 });
      }
      for (const dir of ["left", "right"]) {
        const frames = [0, 1, 2, 3, 4, 5, 6, 7].map((i) => ({ key: `monster-walk-${dir}-${i}`, frame: 0 }));
        this.anims.create({ key: `monster-walk-${dir}`, frames, frameRate: 10, repeat: -1 });
      }
    }
  }

  private startWave() {
    const level = this.data.character.level;
    this.toSpawnThisWave = monstersInWave(level, this.currentWave0);
    this.spawnedThisWave = 0;
    this.spawnInterval = spawnIntervalMs(level);
    this.spawnCountdown = 0;
    this.state = "FIGHT";
    this.hudText.setText(`Wave ${this.currentWave0 + 1}/${this.totalWaves}  Monsters: ${this.monsters.length + this.toSpawnThisWave}`);
  }

  private spawnOneMonster() {
    const level = this.data.character.level;
    const waveIndex = this.currentWave0 + 1;
    const hp = monsterHp(level, waveIndex);
    const damage = monsterDamage(level, waveIndex);
    const cooldownMs = monsterAttackCooldownMs(level);
    const speedK = monsterSpeedK(waveIndex) * monsterSpeedByLevelK(level);
    const speedPx = this.playerSpeedPx * speedK;

    let tileY = Math.floor(MAP_TILES_H / 2);
    const dist = Math.abs(tileY - this.playerTileY);
    if (dist < SPAWN_MIN_TILES_FROM_PLAYER) {
      tileY = this.playerTileY >= MAP_TILES_H / 2 ? 1 : MAP_TILES_H - 2;
    }
    const px = CENTER_TILE_X * TILE_SIZE + TILE_SIZE / 2;
    const py = tileY * TILE_SIZE + TILE_SIZE / 2;
    const sprite = this.add.sprite(px, py, "arena-monster").setOrigin(0.5, 0.5).setDepth(1500 + tileY);
    sprite.setDisplaySize(TILE_SIZE * 1.2, TILE_SIZE * 1.2);
    sprite.setAlpha(0);
    this.tweens.add({ targets: sprite, alpha: 1, duration: SPAWN_FADE_MS, ease: "Linear" });

    const hpBar = this.add.graphics().setDepth(1600 + tileY);
    const invulnerableUntil = Date.now() + SPAWN_FADE_MS;
    const m: MonsterData = {
      sprite,
      tileY,
      hp,
      maxHp: hp,
      damage,
      attackCooldownMs: cooldownMs,
      speedPx,
      waveIndex,
      lastAttackAt: 0,
      invulnerableUntil,
      hpBar,
      dead: false,
      alerted: false,
      patrolCenterY: tileY,
      patrolDir: 1,
    };
    this.monsters.push(m);
    this.spawnedThisWave++;
    this.drawMonsterHpBar(m);
  }

  private drawMonsterHpBar(m: MonsterData) {
    if (m.dead) return;
    m.hpBar.clear();
    const w = 24;
    const h = 4;
    const x = m.sprite.x - w / 2;
    const y = m.sprite.y - 28;
    m.hpBar.fillStyle(0x333333, 1);
    m.hpBar.fillRect(x, y, w, h);
    m.hpBar.fillStyle(0xef4444, 1);
    m.hpBar.fillRect(x, y, (m.hp / m.maxHp) * w, h);
  }

  private drawPlayerHpBar() {
    this.playerHpBar.clear();
    const w = 40;
    const h = 6;
    const x = this.player.x - w / 2;
    const y = this.player.y - 30;
    this.playerHpBar.fillStyle(0x333333, 1);
    this.playerHpBar.fillRect(x, y, w, h);
    this.playerHpBar.fillStyle(0x22c55e, 1);
    this.playerHpBar.fillRect(x, y, (this.playerHp / this.playerMaxHp) * w, h);
  }

  private onPointerDown(ptr: Phaser.Input.Pointer) {
    if (this.state !== "FIGHT" && this.state !== "WAVE") return;
    const world = this.cameras.main.getWorldPoint(ptr.x, ptr.y);
    const gx = Math.floor(world.x / TILE_SIZE);
    const gy = Math.floor(world.y / TILE_SIZE);
    if (gx !== CENTER_TILE_X) return;
    const hit = this.monsters.find((m) => !m.dead && m.tileY === gy);
    if (hit) {
      this.attackTarget = hit;
      const distPx = Math.abs(this.player.y - (hit.tileY * TILE_SIZE + TILE_SIZE / 2));
      if (distPx <= PLAYER_MELEE_RANGE && Date.now() >= this.hitCooldownUntil) {
        this.doOneHit(hit);
        this.attackTarget = null;
      }
    } else {
      this.attackTarget = null;
    }
  }

  private doOneHit(m: MonsterData) {
    if (m.dead || Date.now() < m.invulnerableUntil) return;
    this.hitCooldownUntil = Date.now() + PLAYER_HIT_COOLDOWN_MS;
    m.hp = Math.max(0, m.hp - this.playerDamageAmount);
    this.drawMonsterHpBar(m);
    if (this.anims.exists("hit-down")) {
      this.player.anims.play(this.playerTileY < m.tileY ? "hit-down" : "hit-up", true);
      this.player.once(Phaser.Animations.Events.ANIMATION_COMPLETE, () => {
        if (this.anims.exists("idle")) this.player.anims.play("idle", true);
      });
    }
    if (m.hp <= 0) {
      m.dead = true;
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
      this.monsters = this.monsters.filter((x) => !x.dead);
      this.hudText.setText(`Wave ${this.currentWave0 + 1}/${this.totalWaves}  Monsters: ${this.monsters.length + (this.toSpawnThisWave - this.spawnedThisWave)}`);
      if (this.attackTarget === m) this.attackTarget = null;
      if (this.monsters.length === 0 && this.spawnedThisWave >= this.toSpawnThisWave) {
        if (this.currentWave0 + 1 >= this.totalWaves) {
          this.state = "VICTORY";
          this.showVictory();
        } else {
          this.state = "NEXT_WAVE";
          this.currentWave0++;
          this.time.delayedCall(800, () => {
            this.state = "WAVE";
            this.startWave();
          });
        }
      }
    }
  }

  private updateMonsters(delta: number) {
    const now = Date.now();
    const playerPxY = this.player.y;
    const playerTileY = this.playerTileY;
    for (const m of this.monsters) {
      if (m.dead || now < m.invulnerableUntil) continue;
      const distTiles = Math.abs(m.tileY - playerTileY);
      if (distTiles <= MONSTER_ALERT_TILES) m.alerted = true;
      const monsterPxY = m.tileY * TILE_SIZE + TILE_SIZE / 2;
      const distPx = Math.abs(monsterPxY - playerPxY);
      if (distPx <= MONSTER_ATTACK_RANGE) {
        m.sprite.setTexture("arena-monster");
        if (now - m.lastAttackAt >= m.attackCooldownMs) {
          m.lastAttackAt = now;
          this.playerHp = Math.max(0, this.playerHp - m.damage);
          this.lastDamageAt = now;
          if (this.playerHp <= 0) {
            this.state = "DEFEAT";
            this.defeatCooldownUntil = null;
            if (this.data.recordLoss) {
              this.data.recordLoss().then((r) => {
                this.defeatCooldownUntil = r?.cooldownUntil ?? null;
                this.showDefeat();
              }).catch(() => this.showDefeat());
            } else {
              this.showDefeat();
            }
          }
        }
      } else if (m.alerted) {
        const dir = monsterPxY < playerPxY ? 1 : -1;
        const move = (m.speedPx * delta) / 1000;
        let newPxY = m.sprite.y + dir * move;
        newPxY = Phaser.Math.Clamp(newPxY, TILE_SIZE / 2, MAP_PX_H - TILE_SIZE / 2);
        m.sprite.y = newPxY;
        m.tileY = Math.round((newPxY - TILE_SIZE / 2) / TILE_SIZE);
        m.tileY = Phaser.Math.Clamp(m.tileY, 0, MAP_TILES_H - 1);
        if (this.anims.exists("monster-walk-down")) {
          m.sprite.anims.play(dir > 0 ? "monster-walk-down" : "monster-walk-up", true);
        }
        this.drawMonsterHpBar(m);
      } else {
        const targetTileY = m.patrolCenterY + m.patrolDir;
        const clampTarget = Phaser.Math.Clamp(targetTileY, 0, MAP_TILES_H - 1);
        const clampedPxY = clampTarget * TILE_SIZE + TILE_SIZE / 2;
        const dir = monsterPxY < clampedPxY ? 1 : -1;
        const move = (PATROL_SPEED_PX * delta) / 1000;
        let newPxY = m.sprite.y + dir * move;
        newPxY = Phaser.Math.Clamp(newPxY, TILE_SIZE / 2, MAP_PX_H - TILE_SIZE / 2);
        m.sprite.y = newPxY;
        m.tileY = Math.round((newPxY - TILE_SIZE / 2) / TILE_SIZE);
        m.tileY = Phaser.Math.Clamp(m.tileY, 0, MAP_TILES_H - 1);
        if (Math.abs(m.sprite.y - clampedPxY) < TILE_SIZE / 2) m.patrolDir = -m.patrolDir;
        if (this.anims.exists("monster-walk-down")) {
          m.sprite.anims.play(dir > 0 ? "monster-walk-down" : "monster-walk-up", true);
        }
        this.drawMonsterHpBar(m);
      }
    }
  }

  private updatePlayerMovement(delta: number) {
    let dy = 0;
    if (this.cursors.up.isDown || this.wasd.W.isDown) dy = -1;
    else if (this.cursors.down.isDown || this.wasd.S.isDown) dy = 1;
    if (dy !== 0) {
      this.attackTarget = null;
      const move = (this.playerSpeedPx * delta) / 1000;
      let newY = this.player.y + dy * move;
      newY = Phaser.Math.Clamp(newY, TILE_SIZE / 2 + CHARACTER_Y_OFFSET, MAP_PX_H - TILE_SIZE / 2 + CHARACTER_Y_OFFSET);
      this.player.y = newY;
      this.playerTileY = Math.round((newY - CHARACTER_Y_OFFSET - TILE_SIZE / 2) / TILE_SIZE);
      this.playerTileY = Phaser.Math.Clamp(this.playerTileY, 0, MAP_TILES_H - 1);
      if (dy < 0 && this.anims.exists("walk-up")) this.player.anims.play("walk-up", true);
      else if (dy > 0 && this.anims.exists("walk-down")) this.player.anims.play("walk-down", true);
    } else {
      if (this.anims.exists("idle") && !this.player.anims.currentAnim?.key.startsWith("hit")) {
        this.player.anims.play("idle", true);
      }
    }
    if (this.attackTarget && !this.attackTarget.dead) {
      const distPx = Math.abs(this.player.y - (this.attackTarget.tileY * TILE_SIZE + TILE_SIZE / 2));
      if (distPx <= PLAYER_MELEE_RANGE && Date.now() >= this.hitCooldownUntil) {
        this.doOneHit(this.attackTarget);
        this.attackTarget = null;
      }
    }
  }

  private updateRegen(delta: number) {
    if (this.state !== "FIGHT" && this.state !== "WAVE") return;
    if (this.playerHp >= this.playerMaxHp * 0.8) return;
    const now = Date.now();
    if (now - this.lastDamageAt < REGEN_DELAY_MS) return;
    const cap = this.monsters.some((m) => !m.dead) ? REGEN_CAP_WHILE_MONSTERS * this.playerMaxHp : this.playerMaxHp;
    if (this.playerHp >= cap) return;
    const level = this.data.character.level;
    const regenMult = (1 + this.currentWave0 * 0.2) * regenMultByLevel(level);
    const add = (this.playerMaxHp * (REGEN_PCT_PER_SEC / 100) * regenMult * delta) / 1000;
    this.playerHp = Math.min(cap, this.playerHp + add);
  }

  update(_time: number, delta: number) {
    if (this.state === "VICTORY" || this.state === "DEFEAT") return;
    if (this.state === "FIGHT" && this.spawnedThisWave < this.toSpawnThisWave) {
      this.spawnCountdown -= delta;
      if (this.spawnCountdown <= 0) {
        this.spawnOneMonster();
        this.spawnCountdown = this.spawnInterval;
        this.hudText.setText(`Wave ${this.currentWave0 + 1}/${this.totalWaves}  Monsters: ${this.monsters.length + (this.toSpawnThisWave - this.spawnedThisWave)}`);
      }
    }
    this.updatePlayerMovement(delta);
    this.updateMonsters(delta);
    this.updateRegen(delta);
    this.player.setDepth(1500 + this.playerTileY);
    for (const m of this.monsters) {
      if (!m.dead) {
        m.sprite.setDepth(1500 + m.tileY);
        m.hpBar.setDepth(1600 + m.tileY);
      }
    }
    this.drawPlayerHpBar();
  }

  private showVictory() {
    this.overlayRect.setVisible(true);
    this.overlayTitle.setVisible(true).setText("VICTORY").setColor("#22c55e");
    this.overlaySub.setVisible(true).setText("+20 XP");
    this.overlayBtn.setVisible(true);
  }

  private formatCooldown(isoUntil: string | null): string {
    if (!isoUntil) return "00:30:00";
    const end = new Date(isoUntil).getTime();
    const now = Date.now();
    const sec = Math.max(0, Math.floor((end - now) / 1000));
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = sec % 60;
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  }

  private updateDefeatCountdown() {
    if (this.state !== "DEFEAT" || !this.overlaySub.visible) return;
    const w = this.data.winsToday;
    const max = this.data.maxWinsPerDay;
    const line = this.formatCooldown(this.defeatCooldownUntil);
    this.overlaySub.setText(`Battles left today: ${w}/${max}\nTry again in: ${line}`);
  }

  private showDefeat() {
    this.overlayRect.setVisible(true);
    this.overlayTitle.setVisible(true).setText("DEFEAT").setColor("#ef4444");
    this.updateDefeatCountdown();
    this.overlaySub.setVisible(true);
    this.overlayBtn.setVisible(true);
    this.defeatCountdownEvent?.destroy();
    this.defeatCountdownEvent = this.time.addEvent({
      delay: 1000,
      callback: this.updateDefeatCountdown,
      callbackScope: this,
      loop: true,
    });
  }

  private exitArena() {
    const result = this.state === "VICTORY" ? "victory" : "defeat";
    this.scene.stop();
    this.data.onExit(result);
  }

  /** Call from outside to notify win/loss to server and close. */
  public reportResultAndExit(result: "victory" | "defeat") {
    this.exitArena();
  }
}
