import { Container, Graphics, Text } from 'pixi.js';
import type { Rect } from '../domain/math';
import { FIELD } from '../spec/stage0';
import { currentEnemy, RESPAWN_TIME, type Run } from '../run/run';
import { describeWeapon } from '../run/weapon';

const ENEMY = 0xff5d73;
const ENEMY_BULLET = 0xffd166;
const PLAYER_BULLET = 0x67e8f9;
const SHIP = 0x4ea1ff;

export const CARD = { w: 380, h: 92, gap: 14 };

/** 3択カードの矩形（場座標）。描画と当たり判定で共有する。 */
export function rewardCardRects(): Rect[] {
  const x = (FIELD.w - CARD.w) / 2;
  const total = 3 * CARD.h + 2 * CARD.gap;
  const y0 = (FIELD.h - total) / 2;
  return [0, 1, 2].map((i) => ({ x, y: y0 + i * (CARD.h + CARD.gap), w: CARD.w, h: CARD.h }));
}

const textStyle = (size: number, fill: number, bold = false) => ({
  fill,
  fontSize: size,
  fontWeight: (bold ? 'bold' : 'normal') as 'bold' | 'normal',
  fontFamily: 'system-ui, sans-serif',
  lineHeight: size + 5,
});

/** Run を読んで描く：戦闘＋HP/進行HUD＋3択リワード＋結果バナー。 */
export class RunRenderer {
  private readonly enemyG = new Graphics();
  private readonly enemyHpG = new Graphics();
  private readonly bulletsG = new Graphics();
  private readonly fxG = new Graphics();
  private readonly shipG = new Graphics();
  private readonly dim = new Graphics();
  private readonly cardG = new Graphics();
  private readonly hud: Text;
  private readonly hpBar = new Graphics();
  private readonly cardName: Text[] = [];
  private readonly cardDesc: Text[] = [];
  private readonly hint: Text;
  private readonly banner: Text;

  constructor(stage: Container) {
    stage.addChild(this.enemyG, this.enemyHpG, this.bulletsG, this.fxG, this.shipG, this.hpBar);
    this.hud = new Text({ text: '', style: textStyle(13, 0xcfd6e6) });
    this.hud.position.set(8, 8);
    stage.addChild(this.hud, this.dim, this.cardG);
    for (let i = 0; i < 3; i++) {
      const n = new Text({ text: '', style: textStyle(17, 0xffffff, true) });
      const d = new Text({ text: '', style: textStyle(13, 0xaab2c5) });
      this.cardName.push(n);
      this.cardDesc.push(d);
      stage.addChild(n, d);
    }
    this.hint = new Text({ text: '', style: textStyle(12, 0x9aa3b8) });
    this.hint.anchor.set(0.5, 0);
    this.banner = new Text({ text: '', style: { ...textStyle(26, 0xffffff, true), align: 'center' } });
    this.banner.anchor.set(0.5);
    this.banner.position.set(FIELD.w / 2, FIELD.h * 0.42);
    stage.addChild(this.hint, this.banner);
  }

  draw(run: Run): void {
    const w = run.world;
    const ship = w.ship;

    this.enemyG.clear();
    this.enemyHpG.clear();
    for (const e of w.enemies) {
      this.enemyG.circle(e.pos.x, e.pos.y, e.hitRadius).fill({ color: ENEMY });
      const bw = 46;
      const bx = e.pos.x - bw / 2;
      const by = e.pos.y - e.hitRadius - 12;
      this.enemyHpG.rect(bx, by, bw, 5).fill({ color: 0x33384a });
      this.enemyHpG.rect(bx, by, bw * Math.max(0, e.hp / e.maxHp), 5).fill({ color: ENEMY });
    }

    this.bulletsG.clear();
    for (const b of w.bullets) {
      this.bulletsG.circle(b.pos.x, b.pos.y, b.radius).fill({ color: b.owner === 'player' ? PLAYER_BULLET : ENEMY_BULLET });
    }

    // 死亡エフェクト：被弾位置で広がって消えるリング（復帰スライド中に表示）。
    this.fxG.clear();
    if (w.time < ship.respawnUntil) {
      const p = Math.max(0, Math.min(1, 1 - (ship.respawnUntil - w.time) / RESPAWN_TIME));
      const r = 8 + 40 * p;
      this.fxG.circle(ship.deathPos.x, ship.deathPos.y, r).stroke({ color: 0xffd166, width: 3, alpha: (1 - p) * 0.8 });
      this.fxG.circle(ship.deathPos.x, ship.deathPos.y, r * 0.55).stroke({ color: 0xffffff, width: 2, alpha: (1 - p) * 0.6 });
    }

    // 自機。見た目は大きく、当たり判定(白い小点)はそのまま小さく。
    this.shipG.clear();
    const inv = w.time < ship.invulnUntil;
    const a = inv ? 0.3 + 0.5 * ((Math.sin(w.time * 28) + 1) / 2) : 1;
    this.shipG.circle(ship.pos.x, ship.pos.y, 20).fill({ color: SHIP, alpha: 0.16 * a }); // グロー
    this.shipG.circle(ship.pos.x, ship.pos.y, 14).fill({ color: SHIP, alpha: 0.85 * a }); // 機体（大きめ）
    this.shipG.circle(ship.pos.x, ship.pos.y, ship.hitRadius).fill({ color: 0xffffff, alpha: a }); // 当たり判定

    const e = currentEnemy(run);
    this.hud.text = [
      `敵 ${run.index + 1}/${run.queue.length}  ${e.name}`,
      `HP ${Math.max(0, ship.hp)}/${ship.maxHp}`,
      `武器 ${describeWeapon(run.loadout.weapon)}`,
    ].join('\n');

    this.hpBar.clear();
    const hbW = 120;
    this.hpBar.rect(8, 30, hbW, 7).fill({ color: 0x33384a });
    this.hpBar.rect(8, 30, hbW * Math.max(0, ship.hp) / ship.maxHp, 7).fill({ color: 0x4ade80 });

    this.drawOverlay(run);
  }

  private drawOverlay(run: Run): void {
    const reward = run.phase === 'reward';
    const ended = run.phase === 'gameover' || run.phase === 'win';

    this.dim.clear();
    this.cardG.clear();
    for (let i = 0; i < 3; i++) {
      this.cardName[i].visible = false;
      this.cardDesc[i].visible = false;
    }
    this.hint.visible = false;
    this.banner.text = '';

    if (reward) {
      this.dim.rect(0, 0, FIELD.w, FIELD.h).fill({ color: 0x0b0d12, alpha: 0.72 });
      const rects = rewardCardRects();
      rects.forEach((r, i) => {
        this.cardG.roundRect(r.x, r.y, r.w, r.h, 10).fill({ color: 0x161b26 }).stroke({ color: 0x3b4253, width: 2 });
        const up = run.rewards[i];
        if (!up) return;
        this.cardName[i].text = `${i + 1}.  ${up.name}`;
        this.cardName[i].position.set(r.x + 16, r.y + 16);
        this.cardName[i].visible = true;
        this.cardDesc[i].text = up.desc;
        this.cardDesc[i].position.set(r.x + 16, r.y + 50);
        this.cardDesc[i].visible = true;
      });
      const last = rects[2];
      this.hint.text = '強化を選択：1 / 2 / 3 キー または タップ';
      this.hint.position.set(FIELD.w / 2, last.y + last.h + 14);
      this.hint.visible = true;
    } else if (ended) {
      this.dim.rect(0, 0, FIELD.w, FIELD.h).fill({ color: 0x0b0d12, alpha: 0.72 });
      this.banner.text = run.phase === 'win' ? '踏破！ CLEAR\nタップ / [R] でもう一度' : 'GAME OVER\nタップ / [R] でリスタート';
    }
  }
}
