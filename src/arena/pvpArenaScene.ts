/**
 * PvP Arena scene: two players, same combat logic as vs monsters (HP, attack).
 * Does not modify ArenaScene or Game scene.
 */

import Phaser from "phaser";
import { getToken } from "../api";
import { postPvpAttack } from "../api";

const TILE_SIZE = 32;
const CHARACTER_BASE = "/assets/characters";
const CHARACTER_DISPLAY_W = 80;
const CHARACTER_DISPLAY_H = 80;
const MAP_PX_W = 25 * TILE_SIZE;
const MAP_PX_H = 19 * TILE_SIZE;
const PLAYER_HIT_COOLDOWN_MS = 500;

declare const __BUILD_TIME__: number | undefined;
const CACHE_BUST = typeof __BUILD_TIME__ === "number" ? String(__BUILD_TIME__) : "dev";
function asset(path: string) {
  return `${path}?v=${CACHE_BUST}`;
}

export type PvpArenaSceneData = {
  token: string;
  runId: string;
  battleId: string;
  myHp: number;
  opponentHp: number;
  myMaxHp: number;
  opponentMaxHp: number;
  stakePfv: number;
  /** true = creator (account1), false = challenger (account2). Used to map hp1/hp2 from API to my/opponent. */
  isPlayer1: boolean;
};

export class PvpArenaScene extends Phaser.Scene {
  static readonly KEY = "PvpArena";
  private data!: PvpArenaSceneData;
  private myHp = 100;
  private opponentHp = 100;
  private myMaxHp = 100;
  private opponentMaxHp = 100;
  private mySprite!: Phaser.GameObjects.Sprite;
  private opponentSprite!: Phaser.GameObjects.Sprite;
  private myHpBar!: Phaser.GameObjects.Graphics;
  private opponentHpBar!: Phaser.GameObjects.Graphics;
  private myLabel!: Phaser.GameObjects.Text;
  private opponentLabel!: Phaser.GameObjects.Text;
  private myX = 0;
  private opponentX = 0;
  private hitCooldownUntil = 0;
  private overlayRect!: Phaser.GameObjects.Rectangle;
  private overlayTitle!: Phaser.GameObjects.Text;
  private overlayBtn!: Phaser.GameObjects.Text;
  private hudText!: Phaser.GameObjects.Text;

  constructor() {
    super({ key: PvpArenaScene.KEY });
  }

  init(data: PvpArenaSceneData) {
    this.data = data;
    this.myHp = data.myHp;
    this.opponentHp = data.opponentHp;
    this.myMaxHp = data.myMaxHp;
    this.opponentMaxHp = data.opponentMaxHp;
  }

  preload() {
    this.load.setBaseURL("");
    this.load.image("character", asset(`${CHARACTER_BASE}/pix.png`));
  }

  create() {
    this.cameras.main.setBackgroundColor(0x1a1a1a);
    const centerX = MAP_PX_W / 2;
    const centerY = MAP_PX_H / 2;
    const offset = 120;
    this.myX = this.data.isPlayer1 ? centerX - offset : centerX + offset;
    this.opponentX = this.data.isPlayer1 ? centerX + offset : centerX - offset;

    this.mySprite = this.add.sprite(this.myX, centerY, "character").setDisplaySize(CHARACTER_DISPLAY_W, CHARACTER_DISPLAY_H).setDepth(100);
    this.opponentSprite = this.add.sprite(this.opponentX, centerY, "character").setDisplaySize(CHARACTER_DISPLAY_W, CHARACTER_DISPLAY_H).setDepth(100).setTint(0xff8888).setInteractive({ useHandCursor: true });

    this.myLabel = this.add.text(this.myX, centerY + CHARACTER_DISPLAY_H / 2 + 8, "You", { fontFamily: "Press Start 2P", fontSize: "8px", color: "#22c55e" }).setOrigin(0.5, 0).setDepth(150);
    this.opponentLabel = this.add.text(this.opponentX, centerY + CHARACTER_DISPLAY_H / 2 + 8, "Opponent", { fontFamily: "Press Start 2P", fontSize: "8px", color: "#ef4444" }).setOrigin(0.5, 0).setDepth(150);

    this.myHpBar = this.add.graphics().setDepth(200);
    this.opponentHpBar = this.add.graphics().setDepth(200);
    this.drawHpBars();

    this.hudText = this.add.text(centerX, 20, "Click opponent to attack", { fontFamily: "Press Start 2P", fontSize: "10px", color: "#fbbf24" }).setOrigin(0.5, 0).setDepth(200);

    this.overlayRect = this.add.rectangle(centerX, centerY, MAP_PX_W, MAP_PX_H, 0x000000, 0.85).setDepth(3000).setVisible(false);
    this.overlayTitle = this.add.text(centerX, centerY - 30, "", { fontFamily: "Press Start 2P", fontSize: "14px", color: "#fbbf24" }).setOrigin(0.5).setDepth(3001).setVisible(false);
    this.overlayBtn = this.add.text(centerX, centerY + 20, "Close", { fontFamily: "Press Start 2P", fontSize: "12px", color: "#fff" }).setOrigin(0.5).setDepth(3001).setInteractive({ useHandCursor: true }).setVisible(false);

    this.opponentSprite.on("pointerdown", () => this.doAttack());
    this.overlayBtn.on("pointerdown", () => this.exitToMap());
  }

  private drawHpBars() {
    const w = 80;
    const h = 8;
    const barY = MAP_PX_H / 2 - 60;
    this.myHpBar.clear();
    this.myHpBar.fillStyle(0x333333, 1);
    this.myHpBar.fillRect(this.myX - w / 2, barY, w, h);
    this.myHpBar.fillStyle(0x22c55e, 1);
    this.myHpBar.fillRect(this.myX - w / 2, barY, Math.max(0, (this.myHp / this.myMaxHp) * w), h);

    this.opponentHpBar.clear();
    this.opponentHpBar.fillStyle(0x333333, 1);
    this.opponentHpBar.fillRect(this.opponentX - w / 2, barY, w, h);
    this.opponentHpBar.fillStyle(0xef4444, 1);
    this.opponentHpBar.fillRect(this.opponentX - w / 2, barY, Math.max(0, (this.opponentHp / this.opponentMaxHp) * w), h);
  }

  private doAttack() {
    if (this.myHp <= 0 || this.opponentHp <= 0) return;
    if (Date.now() < this.hitCooldownUntil) return;
    const token = getToken();
    if (!token) return;
    this.hitCooldownUntil = Date.now() + PLAYER_HIT_COOLDOWN_MS;
    postPvpAttack(token, this.data.runId).then((res) => {
      if (!res.ok) return;
      const isP1 = this.data.isPlayer1;
      this.myHp = isP1 ? res.hp1 : res.hp2;
      this.opponentHp = isP1 ? res.hp2 : res.hp1;
      this.drawHpBars();
      if ("victory" in res && res.victory) {
        this.showResult(this.opponentHp <= 0 ? "You win! +80% $PFV" : "You lost");
        return;
      }
      if (this.opponentHp <= 0) this.showResult("You win! +80% $PFV");
      else if (this.myHp <= 0) this.showResult("You lost");
    });
  }

  private showResult(text: string) {
    this.overlayTitle.setText(text);
    this.overlayRect.setVisible(true);
    this.overlayTitle.setVisible(true);
    this.overlayBtn.setVisible(true);
  }

  private exitToMap() {
    const g = (typeof window !== "undefined" && (window as unknown as { game: Phaser.Game }).game);
    if (g) g.scene.start("Game", { mapId: "map1", spawnNear: "arena" });
  }
}
