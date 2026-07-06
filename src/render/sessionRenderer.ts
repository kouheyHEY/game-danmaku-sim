import { Container, Graphics, Text } from 'pixi.js';
import { FIELD } from '../spec/stage0';
import { RESPAWN_TIME, type Session } from '../run/session';

const BOSS = 0xff5d73;
const ENEMY_BULLET = 0xffd166;
const PLAYER_BULLET = 0x67e8f9;
const SHIP = 0x4ea1ff;

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
  private readonly bulletsG = new Graphics();
  private readonly fxG = new Graphics();
  private readonly bossG = new Graphics();
  private readonly shipG = new Graphics();
  private readonly hpText: Text;
  private readonly scoreLabel: Text;
  private readonly scoreNum: Text;
  private readonly killsText: Text;
  private readonly toast: Text;
  private readonly dim = new Graphics();
  private readonly center: Text;

  constructor(stage: Container) {
    stage.addChild(this.bulletsG, this.fxG, this.bossG, this.shipG);

    this.hpText = new Text({ text: '', style: { ...style(15, 0xff8fa3), align: 'left' } });
    this.hpText.position.set(8, 8);

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

    this.center = new Text({ text: '', style: style(28, 0xffffff, true) });
    this.center.anchor.set(0.5);
    this.center.position.set(FIELD.w / 2, FIELD.h * 0.44);

    stage.addChild(this.hpText, this.scoreLabel, this.scoreNum, this.killsText, this.toast, this.dim, this.center);
  }

  draw(session: Session): void {
    const w = session.world;
    const ship = w.ship;

    this.bulletsG.clear();
    for (const b of w.bullets) {
      this.bulletsG.circle(b.pos.x, b.pos.y, b.radius).fill({ color: b.owner === 'player' ? PLAYER_BULLET : ENEMY_BULLET });
    }

    this.bossG.clear();
    for (const e of w.enemies) {
      this.bossG.circle(e.pos.x, e.pos.y, e.hitRadius).fill({ color: BOSS });
      const bw = Math.max(24, e.hitRadius * 2.4);
      const bx = e.pos.x - bw / 2;
      const by = e.pos.y - e.hitRadius - 10;
      this.bossG.rect(bx, by, bw, 4).fill({ color: 0x33384a });
      this.bossG.rect(bx, by, bw * Math.max(0, e.hp / e.maxHp), 4).fill({ color: BOSS });
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
    this.scoreLabel.visible = playing;
    this.scoreNum.visible = playing;
    this.killsText.visible = playing;
    this.hpText.visible = playing;
    this.toast.text = session.toast?.text ?? '';
    this.toast.visible = playing && !!session.toast;

    this.dim.clear();
    if (session.phase === 'title') {
      this.dim.rect(0, 0, FIELD.w, FIELD.h).fill({ color: 0x0b0d12, alpha: 0.6 });
      this.center.text = 'Tap to Start';
      this.center.visible = true;
    } else if (session.phase === 'gameover') {
      this.dim.rect(0, 0, FIELD.w, FIELD.h).fill({ color: 0x0b0d12, alpha: 0.72 });
      this.center.text = `GAME OVER\n避けた弾  ${session.score}  ・  撃破  ${session.kills}\n\nTap to restart`;
      this.center.visible = true;
    } else {
      this.center.visible = false;
    }
  }
}
