import { Container, Graphics, Sprite, Text, type Texture } from 'pixi.js';
import { FIELD } from '../spec/stage0';
import { RESPAWN_TIME, type Session } from '../run/session';
import { BOSS_NAMES, bossStatus } from '../run/bosses';
import { formatMultiplier, formatScore } from './numberFormat';
import { enemyHitbox } from '../domain/entities';
import {
  FEATURE_BOSS_TEXTURE_DISPLAY_SIZE,
  PLAYER_TEXTURE_DISPLAY_SIZE,
  PRIEST_TEXTURE_DISPLAY_SIZE,
} from '../spec/entityVisuals';

const BOSS = 0xff5d73;
const STRONG_BOSS = 0xc084fc;
const PRIEST = 0x34d399;
const ENEMY_BULLET = 0xffd166;
const ENEMY_BULLET_OUTLINE = 0x5c2d10;
const PLAYER_BULLET = 0x67e8f9;
const PLAYER_BULLET_VISUAL_MAX = 7;
const BULLET_COLORS = {
  normal: ENEMY_BULLET,
  reversa: 0xf0abfc,
  sniper: 0xff6b6b,
  wave: 0xf8fafc,
  orb: 0xc084fc,
  side: 0x86efac,
  tank: 0xf59e0b,
  reflected: 0x34d399,
} as const;

export interface RewardCardRect { x: number; y: number; w: number; h: number }

export type BossTextureKey = 'reversa' | 'sniper' | 'shogun' | 'tank' | 'priest';

export interface EntityTextures extends Record<BossTextureKey, Texture> {
  player: Texture;
}

export function bossTextureDisplaySize(kind: BossTextureKey): number {
  return kind === 'priest' ? PRIEST_TEXTURE_DISPLAY_SIZE : FEATURE_BOSS_TEXTURE_DISPLAY_SIZE;
}

export function playerTextureDisplaySize(): number {
  return PLAYER_TEXTURE_DISPLAY_SIZE;
}

/** 描画とタップ判定で共有する、スマホ向けの大きな2択カード。 */
export function specialRewardCardRects(): RewardCardRect[] {
  return [
    { x: 40, y: 210, w: FIELD.w - 80, h: 160 },
    { x: 40, y: 390, w: FIELD.w - 80, h: 160 },
  ];
}

export function pauseButtonRect(): RewardCardRect {
  return { x: 8, y: 8, w: 44, h: 38 };
}

const style = (size: number, fill: number, bold = false) => ({
  fill,
  fontSize: size,
  fontWeight: (bold ? 'bold' : 'normal') as 'bold' | 'normal',
  fontFamily: 'system-ui, sans-serif',
  align: 'center' as const,
  lineHeight: size + 6,
});

/** Session を読んで描く：弾/自機/ボス＋右上スコア＋Tap to Start／GameOver。 */
export class SessionRenderer {
  private readonly playerBulletsG = new Graphics();
  private readonly enemyBulletsG = new Graphics();
  private readonly fxG = new Graphics();
  private readonly bossG = new Graphics();
  private readonly shipG = new Graphics();
  private readonly hitboxG = new Graphics();
  private readonly enemySprites = new Container();
  private readonly enemySpriteById = new Map<number, Sprite>();
  private readonly shipSprite: Sprite;
  private readonly hpText: Text;
  private readonly scoreLabel: Text;
  private readonly scoreNum: Text;
  private readonly multiplierText: Text;
  private readonly dodgedText: Text;
  private readonly killsText: Text;
  private readonly toast: Text;
  private readonly bossName: Text;
  private readonly pauseG = new Graphics();
  private readonly pauseText: Text;
  private readonly dim = new Graphics();
  private readonly rewardG = new Graphics();
  private readonly rewardTitle: Text;
  private readonly rewardTexts: Text[];
  private readonly center: Text;

  constructor(stage: Container, private readonly textures: EntityTextures, private readonly showHitboxes = false) {
    // 安全な自弾は奥、避けるべき敵弾は敵より手前、自機と白い当たり判定は最前面。
    // 強化で自弾が大きく・多くなっても、危険情報が隠れない描画順を固定する。
    this.shipSprite = new Sprite(textures.player);
    this.shipSprite.anchor.set(0.5);
    this.shipSprite.width = playerTextureDisplaySize();
    this.shipSprite.height = playerTextureDisplaySize();
    stage.addChild(
      this.enemySprites, this.bossG, this.enemyBulletsG, this.fxG,
      this.shipSprite, this.shipG, this.playerBulletsG, this.hitboxG,
    );

    this.hpText = new Text({ text: '', style: { ...style(15, 0xff8fa3), align: 'left' } });
    this.hpText.position.set(62, 16);

    this.scoreLabel = new Text({ text: 'スコア', style: style(12, 0x9aa3b8) });
    this.scoreLabel.anchor.set(1, 0);
    this.scoreLabel.position.set(FIELD.w - 10, 6);
    this.scoreNum = new Text({ text: '0', style: style(28, 0xffffff, true) });
    this.scoreNum.anchor.set(1, 0);
    this.scoreNum.position.set(FIELD.w - 10, 20);
    this.multiplierText = new Text({ text: '×1.00', style: style(12, 0xfde68a, true) });
    this.multiplierText.anchor.set(1, 0);
    this.multiplierText.position.set(FIELD.w - 10, 52);
    this.dodgedText = new Text({ text: '避けた弾 0', style: style(13, 0x9aa3b8) });
    this.dodgedText.anchor.set(1, 0);
    this.dodgedText.position.set(FIELD.w - 10, 70);
    this.killsText = new Text({ text: '撃破 0', style: style(14, 0x9fe8b0) });
    this.killsText.anchor.set(1, 0);
    this.killsText.position.set(FIELD.w - 10, 90);

    this.toast = new Text({ text: '', style: style(16, 0xfff0a8, true) });
    this.toast.anchor.set(0.5, 0);
    this.toast.position.set(FIELD.w / 2, 64);

    this.bossName = new Text({ text: '', style: style(14, 0xe9d5ff, true) });
    this.bossName.anchor.set(0.5, 0);
    this.bossName.position.set(FIELD.w / 2, 92);

    this.pauseText = new Text({ text: 'II', style: style(17, 0xffffff, true) });
    this.pauseText.anchor.set(0.5);

    this.center = new Text({ text: '', style: style(28, 0xffffff, true) });
    this.center.anchor.set(0.5);
    this.center.position.set(FIELD.w / 2, FIELD.h * 0.44);

    this.rewardTitle = new Text({ text: '特別強化を選択', style: style(24, 0xf1d4ff, true) });
    this.rewardTitle.anchor.set(0.5);
    this.rewardTitle.position.set(FIELD.w / 2, 172);
    this.rewardTexts = specialRewardCardRects().map((r) => {
      const text = new Text({
        text: '',
        style: { ...style(20, 0xffffff, true), wordWrap: true, wordWrapWidth: r.w - 28 },
      });
      text.anchor.set(0.5);
      text.position.set(r.x + r.w / 2, r.y + r.h / 2);
      return text;
    });

    stage.addChild(
      this.hpText, this.scoreLabel, this.scoreNum, this.multiplierText, this.dodgedText, this.killsText,
      this.toast, this.bossName, this.pauseG, this.pauseText,
      this.dim, this.rewardG, this.rewardTitle, ...this.rewardTexts, this.center,
    );
  }

  draw(session: Session): void {
    const w = session.world;
    const ship = w.ship;

    this.playerBulletsG.clear();
    this.enemyBulletsG.clear();
    for (const b of w.bullets) {
      if (b.owner === 'player') {
        // 当たり判定半径は domain の b.radius のまま。見た目だけ抑え、画面占有を制限する。
        const visualRadius = Math.min(b.radius, PLAYER_BULLET_VISUAL_MAX);
        this.playerBulletsG.circle(b.pos.x, b.pos.y, visualRadius).fill({ color: PLAYER_BULLET, alpha: 0.46 });
      } else {
        // 暗い輪郭＋明るいコアで、自弾や背景の上でも敵弾の境界を保つ。
        const color = BULLET_COLORS[b.style ?? 'normal'];
        this.enemyBulletsG.circle(b.pos.x, b.pos.y, b.radius + 2).fill({ color: ENEMY_BULLET_OUTLINE, alpha: 0.96 });
        this.enemyBulletsG.circle(b.pos.x, b.pos.y, b.radius).fill({ color });
      }
    }

    this.bossG.clear();
    for (const sprite of this.enemySpriteById.values()) sprite.visible = false;
    const liveEnemyIds = new Set(w.enemies.map((enemy) => enemy.id));
    for (const e of w.enemies) {
      if (e.visible === false) continue;
      const inBoss = !!session.boss?.enemyIds.includes(e.id);
      const strong = session.bossIsStrong && inBoss;
      const priest = session.boss?.kind === 'priest' && e.id === session.boss.primaryId;
      const color = priest ? PRIEST : e.role === 'guard' ? 0x94a3b8 : e.role === 'sniper' ? 0x67e8f9 : strong ? STRONG_BOSS : BOSS;
      const textureKey: BossTextureKey | null = inBoss && e.role !== 'guard' && session.boss?.kind !== 'normal'
        ? session.boss?.kind ?? null
        : null;
      const textureSize = textureKey ? bossTextureDisplaySize(textureKey) : null;
      const visualRadius = textureSize ? textureSize / 2 : priest ? 13 : e.hitRadius;
      if (strong) this.bossG.circle(e.pos.x, e.pos.y, visualRadius + 8).stroke({ color, width: 4, alpha: 0.55 });
      if (textureKey && textureSize) {
        let sprite = this.enemySpriteById.get(e.id);
        if (!sprite) {
          sprite = new Sprite(this.textures[textureKey]);
          sprite.anchor.set(0.5);
          this.enemySpriteById.set(e.id, sprite);
          this.enemySprites.addChild(sprite);
        }
        sprite.texture = this.textures[textureKey];
        sprite.position.set(e.pos.x, e.pos.y);
        sprite.width = textureSize;
        sprite.height = textureSize;
        sprite.alpha = e.targetable === false ? 0.34 : 1;
        sprite.visible = true;
      } else {
        this.bossG.circle(e.pos.x, e.pos.y, visualRadius).fill({ color, alpha: e.targetable === false ? 0.34 : 1 });
      }
      const bw = Math.max(24, visualRadius * 2.4);
      const bx = e.pos.x - bw / 2;
      const by = e.pos.y - visualRadius - 10;
      this.bossG.rect(bx, by, bw, 4).fill({ color: 0x33384a });
      this.bossG.rect(bx, by, bw * Math.max(0, e.hp / e.maxHp), 4).fill({ color });
    }
    for (const [id, sprite] of this.enemySpriteById) {
      if (liveEnemyIds.has(id)) continue;
      sprite.removeFromParent();
      sprite.destroy();
      this.enemySpriteById.delete(id);
    }

    this.hitboxG.clear();
    if (this.showHitboxes) {
      for (const e of w.enemies) {
        if (e.visible === false) continue;
        const hitbox = enemyHitbox(e);
        const alpha = e.targetable === false ? 0.28 : 0.9;
        if (hitbox.kind === 'circle') {
          this.hitboxG.circle(e.pos.x, e.pos.y, hitbox.radius).stroke({ color: 0xff4fd8, width: 1.5, alpha });
        } else {
          this.hitboxG
            .rect(
              e.pos.x - hitbox.halfWidth,
              e.pos.y - hitbox.halfHeight,
              hitbox.halfWidth * 2,
              hitbox.halfHeight * 2,
            )
            .stroke({ color: 0xff4fd8, width: 1.5, alpha });
        }
      }
      for (const b of w.bullets) {
        this.hitboxG.circle(b.pos.x, b.pos.y, b.radius).stroke({
          color: b.owner === 'player' ? 0x67e8f9 : 0xffd166,
          width: 1,
          alpha: 0.55,
        });
      }
      this.hitboxG.circle(ship.pos.x, ship.pos.y, ship.hitRadius).stroke({ color: 0x7cff9b, width: 1.5, alpha: 1 });
    }

    this.fxG.clear();
    if (w.time < ship.respawnUntil) {
      const p = Math.max(0, Math.min(1, 1 - (ship.respawnUntil - w.time) / RESPAWN_TIME));
      const r = 8 + 40 * p;
      this.fxG.circle(ship.deathPos.x, ship.deathPos.y, r).stroke({ color: 0xffd166, width: 3, alpha: (1 - p) * 0.8 });
      this.fxG.circle(ship.deathPos.x, ship.deathPos.y, r * 0.55).stroke({ color: 0xffffff, width: 2, alpha: (1 - p) * 0.6 });
    }

    this.shipG.clear();
    this.shipSprite.visible = session.phase !== 'gameover';
    if (this.shipSprite.visible) {
      const inv = w.time < ship.invulnUntil;
      const a = inv ? 0.3 + 0.5 * ((Math.sin(w.time * 28) + 1) / 2) : 1;
      this.shipSprite.position.set(ship.pos.x, ship.pos.y);
      this.shipSprite.alpha = a;
      // 見た目を32pxにしても、衝突判定は従来どおり ship.hitRadius（3px）のまま。
      this.shipG.circle(ship.pos.x, ship.pos.y, ship.hitRadius).fill({ color: 0xffffff, alpha: a });
    }

    this.hpText.text = 'HP ' + '♥'.repeat(Math.max(0, ship.hp));
    this.scoreNum.text = formatScore(session.score);
    this.multiplierText.text = formatMultiplier(session.scoreMultiplier);
    this.dodgedText.text = `避けた弾 ${formatScore(w.dodged)}`;
    this.killsText.text = `撃破 ${session.kills}`;
    const playing = session.phase === 'playing';
    const active = playing || session.phase === 'paused';
    this.scoreLabel.visible = active;
    this.scoreNum.visible = active;
    this.multiplierText.visible = active;
    this.dodgedText.visible = active;
    this.killsText.visible = active;
    this.hpText.visible = active;
    this.toast.text = session.toast?.text ?? '';
    this.toast.visible = active && !!session.toast;
    this.bossName.text = session.boss ? `${BOSS_NAMES[session.boss.kind]} ・ ${bossStatus(session.boss, w)}` : '';
    this.bossName.visible = active && !!session.bossKind;

    const pauseRect = pauseButtonRect();
    this.pauseG.clear();
    this.pauseG.visible = playing;
    this.pauseText.visible = playing;
    if (playing) {
      this.pauseG
        .roundRect(pauseRect.x, pauseRect.y, pauseRect.w, pauseRect.h, 12)
        .fill({ color: 0x111827, alpha: 0.76 })
        .stroke({ color: 0xffffff, alpha: 0.5, width: 1.5 });
      this.pauseText.position.set(pauseRect.x + pauseRect.w / 2, pauseRect.y + pauseRect.h / 2);
    }

    this.dim.clear();
    this.rewardG.clear();
    this.rewardTitle.visible = false;
    for (const text of this.rewardTexts) text.visible = false;
    if (session.phase === 'title') {
      this.dim.rect(0, 0, FIELD.w, FIELD.h).fill({ color: 0x0b0d12, alpha: 0.6 });
      this.center.text = 'Tap to Start';
      this.center.visible = true;
    } else if (session.phase === 'gameover') {
      this.dim.rect(0, 0, FIELD.w, FIELD.h).fill({ color: 0x0b0d12, alpha: 0.72 });
      this.center.text = `GAME OVER\nスコア  ${formatScore(session.score)}  ${formatMultiplier(session.scoreMultiplier)}\n避けた弾  ${formatScore(w.dodged)}  ・  撃破  ${session.kills}\n\nTap to restart`;
      this.center.visible = true;
    } else if (session.phase === 'reward') {
      this.dim.rect(0, 0, FIELD.w, FIELD.h).fill({ color: 0x0b0d12, alpha: 0.84 });
      this.rewardTitle.visible = true;
      const rects = specialRewardCardRects();
      rects.forEach((r, i) => {
        this.rewardG.roundRect(r.x, r.y, r.w, r.h, 14).fill({ color: 0x241b35, alpha: 0.98 });
        this.rewardG.roundRect(r.x, r.y, r.w, r.h, 14).stroke({ color: STRONG_BOSS, width: 3, alpha: 0.9 });
        const choice = session.specialChoices[i];
        const text = this.rewardTexts[i];
        text.text = choice ? `${choice.name}\n\n${choice.description}\n\nTap` : '';
        text.visible = !!choice;
      });
      this.center.visible = false;
    } else if (session.phase === 'paused') {
      this.dim.rect(0, 0, FIELD.w, FIELD.h).fill({ color: 0x030712, alpha: 0.76 });
      this.center.text = 'PAUSED\n\nTap to resume';
      this.center.visible = true;
    } else {
      this.center.visible = false;
    }
  }
}
