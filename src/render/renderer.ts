import { Container, Graphics, Text } from 'pixi.js';
import type { World } from '../domain/world';
import type { Mode, Outcome, Score } from '../domain/objective';
import type { TelegraphSignal } from '../domain/director';
import { FIELD } from '../spec/stage0';

export interface View {
  mode: Mode;
  telegraph: TelegraphSignal | null;
}

const AVOID_COLOR = 0xffffff; // 食らい判定（避ける）
const HIT_COLOR = 0x4ade80; // 当たりに行く
const ENEMY_BULLET = 0xffd166;
const PLAYER_BULLET = 0x67e8f9;

/** World と View を読んで描くだけ。状態を持たず／変えない。 */
export class Renderer {
  private readonly bg = new Graphics();
  private readonly enemy = new Graphics();
  private readonly bullets = new Graphics();
  private readonly ship = new Graphics();
  private readonly hud: Text;
  private readonly banner: Text;

  constructor(stage: Container) {
    stage.addChild(this.bg, this.enemy, this.bullets, this.ship);
    this.hud = new Text({
      text: '',
      style: { fill: 0xcfd6e6, fontSize: 13, fontFamily: 'system-ui, sans-serif', lineHeight: 18 },
    });
    this.hud.position.set(8, 8);
    this.banner = new Text({
      text: '',
      style: { fill: 0xffffff, fontSize: 22, fontWeight: 'bold', fontFamily: 'system-ui, sans-serif', align: 'center' },
    });
    this.banner.anchor.set(0.5);
    this.banner.position.set(FIELD.w / 2, FIELD.h * 0.32);
    stage.addChild(this.hud, this.banner);
  }

  draw(world: World, score: Score, outcome: Outcome, view: View): void {
    const goalColor = view.mode.goal === 'hit' ? HIT_COLOR : AVOID_COLOR;

    // 予告フラッシュ：無弾の間(lull)に明滅。色は次モードを先取りで示す。
    this.bg.clear();
    const tel = view.telegraph;
    if (tel?.active && tel.cue !== 'none') {
      const blink = (Math.sin(world.time * 16) + 1) / 2;
      const tint = tel.upcomingMode.goal === 'hit' ? HIT_COLOR : AVOID_COLOR;
      this.bg.rect(0, 0, FIELD.w, FIELD.h).fill({ color: tint, alpha: 0.08 + 0.16 * blink });
    }

    const e = world.enemies[0];
    this.enemy.clear();
    if (e) this.enemy.circle(e.pos.x, e.pos.y, e.hitRadius).fill({ color: 0xff5d73 });

    this.bullets.clear();
    for (const b of world.bullets) {
      const color = b.owner === 'player' ? PLAYER_BULLET : ENEMY_BULLET;
      this.bullets.circle(b.pos.x, b.pos.y, b.radius).fill({ color });
    }

    const s = world.ship;
    this.ship.clear();
    this.ship.circle(s.pos.x, s.pos.y, 9).fill({ color: goalColor, alpha: 0.25 });
    this.ship.circle(s.pos.x, s.pos.y, s.hitRadius).fill({ color: goalColor });

    this.hud.text = hudText(view, score);
    this.banner.text = bannerText(outcome, tel);
    this.banner.style.fill = outcome === 'failed' ? 0xff7a7a : 0xfff0a8;
  }
}

function modeLabel(m: Mode): string {
  if (m.firer === 'enemy') return m.goal === 'avoid' ? '① 当たるな (avoid)' : '② 当たりに行け (hit)';
  return m.goal === 'hit' ? '③ 当てろ' : '④ 当てるな';
}

function hudText(view: View, score: Score): string {
  const lines = [`MODE  ${modeLabel(view.mode)}`];
  if (view.mode.firer === 'enemy') lines.push(`HP    ${'♥'.repeat(Math.max(0, score.hp))}`);
  lines.push(`GOOD  ${score.goodHits}`, `BAD   ${score.badHits}`);
  return lines.join('\n');
}

function bannerText(outcome: Outcome, tel: TelegraphSignal | null): string {
  if (outcome === 'cleared') return 'CLEARED!\n［R］でリトライ';
  if (outcome === 'failed') return 'FAILED…\n［R］でリトライ';
  if (tel?.active) return `まもなく反転\n→ ${modeLabel(tel.upcomingMode)}`;
  return '';
}
