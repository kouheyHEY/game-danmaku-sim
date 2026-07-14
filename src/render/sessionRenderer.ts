import { Container, Graphics, Text } from 'pixi.js';
import { FIELD } from '../spec/stage0';
import { RESPAWN_TIME, type Session } from '../run/session';

const BOSS = 0xff5d73;
const STRONG_BOSS = 0xc084fc;
const ENEMY_BULLET = 0xffd166;
const ENEMY_BULLET_OUTLINE = 0x5c2d10;
const PLAYER_BULLET = 0x67e8f9;
const SHIP = 0x4ea1ff;
const PLAYER_BULLET_VISUAL_MAX = 7;

export interface RewardCardRect { x: number; y: number; w: number; h: number }

/** 描画とタップ判定で共有する、スマホ向けの大きな2択カード。 */
export function specialRewardCardRects(): RewardCardRect[] {
  return [
    { x: 28, y: 218, w: 204, h: 210 },
    { x: 248, y: 218, w: 204, h: 210 },
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
  private readonly hpText: Text;
  private readonly scoreLabel: Text;
  private readonly scoreNum: Text;
  private readonly killsText: Text;
  private readonly toast: Text;
  private readonly pauseG = new Graphics();
  private readonly pauseText: Text;
  private readonly dim = new Graphics();
  private readonly rewardG = new Graphics();
  private readonly rewardTitle: Text;
  private readonly rewardTexts: Text[];
  private readonly center: Text;

  constructor(stage: Container) {
    // 安全な自弾は奥、避けるべき敵弾は敵より手前、自機と白い当たり判定は最前面。
    // 強化で自弾が大きく・多くなっても、危険情報が隠れない描画順を固定する。
    stage.addChild(this.playerBulletsG, this.bossG, this.enemyBulletsG, this.fxG, this.shipG);

    this.hpText = new Text({ text: '', style: { ...style(15, 0xff8fa3), align: 'left' } });
    this.hpText.position.set(62, 16);

    this.scoreLabel = new Text({ text: '避けた弾', style: style(12, 0x9aa3b8) });
    this.scoreLabel.anchor.set(1, 0);
    this.scoreLabel.position.set(FIELD.w - 10, 6);
    this.scoreNum = new Text({ text: '0', style: style(28, 0xffffff, true) });
    this.scoreNum.anchor.set(1, 0);
    this.scoreNum.position.set(FIELD.w - 10, 20);
    this.killsText = new Text({ text: '撃破 0', style: style(14, 0x9fe8b0) });
    this.killsText.anchor.set(1, 0);
    this.killsText.position.set(FIELD.w - 10, 56);

    this.toast = new Text({ text: '', style: style(16, 0xfff0a8, true) });
    this.toast.anchor.set(0.5, 0);
    this.toast.position.set(FIELD.w / 2, 64);

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
      this.hpText, this.scoreLabel, this.scoreNum, this.killsText, this.toast, this.pauseG, this.pauseText,
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
        this.enemyBulletsG.circle(b.pos.x, b.pos.y, b.radius + 2).fill({ color: ENEMY_BULLET_OUTLINE, alpha: 0.96 });
        this.enemyBulletsG.circle(b.pos.x, b.pos.y, b.radius).fill({ color: ENEMY_BULLET });
      }
    }

    this.bossG.clear();
    for (const e of w.enemies) {
      const strong = session.bossIsStrong && e.id === session.bossId;
      const color = strong ? STRONG_BOSS : BOSS;
      if (strong) this.bossG.circle(e.pos.x, e.pos.y, e.hitRadius + 8).stroke({ color: STRONG_BOSS, width: 4, alpha: 0.55 });
      this.bossG.circle(e.pos.x, e.pos.y, e.hitRadius).fill({ color });
      const bw = Math.max(24, e.hitRadius * 2.4);
      const bx = e.pos.x - bw / 2;
      const by = e.pos.y - e.hitRadius - 10;
      this.bossG.rect(bx, by, bw, 4).fill({ color: 0x33384a });
      this.bossG.rect(bx, by, bw * Math.max(0, e.hp / e.maxHp), 4).fill({ color });
    }

    this.fxG.clear();
    if (w.time < ship.respawnUntil) {
      const p = Math.max(0, Math.min(1, 1 - (ship.respawnUntil - w.time) / RESPAWN_TIME));
      const r = 8 + 40 * p;
      this.fxG.circle(ship.deathPos.x, ship.deathPos.y, r).stroke({ color: 0xffd166, width: 3, alpha: (1 - p) * 0.8 });
      this.fxG.circle(ship.deathPos.x, ship.deathPos.y, r * 0.55).stroke({ color: 0xffffff, width: 2, alpha: (1 - p) * 0.6 });
    }

    this.shipG.clear();
    if (session.phase !== 'gameover') {
      const inv = w.time < ship.invulnUntil;
      const a = inv ? 0.3 + 0.5 * ((Math.sin(w.time * 28) + 1) / 2) : 1;
      this.shipG.circle(ship.pos.x, ship.pos.y, 20).fill({ color: SHIP, alpha: 0.16 * a });
      this.shipG.circle(ship.pos.x, ship.pos.y, 14).fill({ color: SHIP, alpha: 0.85 * a });
      this.shipG.circle(ship.pos.x, ship.pos.y, ship.hitRadius).fill({ color: 0xffffff, alpha: a });
    }

    this.hpText.text = 'HP ' + '♥'.repeat(Math.max(0, ship.hp));
    this.scoreNum.text = String(session.score);
    this.killsText.text = `撃破 ${session.kills}`;
    const playing = session.phase === 'playing';
    const active = playing || session.phase === 'paused';
    this.scoreLabel.visible = active;
    this.scoreNum.visible = active;
    this.killsText.visible = active;
    this.hpText.visible = active;
    this.toast.text = session.toast?.text ?? '';
    this.toast.visible = active && !!session.toast;

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
      this.center.text = `GAME OVER\n避けた弾  ${session.score}  ・  撃破  ${session.kills}\n\nTap to restart`;
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
