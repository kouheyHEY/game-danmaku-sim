import { describe, it, expect } from 'vitest';
import { makeWorld, defaultShip, defaultEnemy, step } from '../../src/domain/world';
import { hitEnemy, dontHitEnemy, makeScore } from '../../src/domain/objective';
import { evenSpread } from '../../src/domain/pattern';
import type { ShipInput } from '../../src/domain/entities';
import { FIELD } from '../../src/spec/stage0';

const DT = 1 / 120;
const STILL: ShipInput = { moveX: 0, moveY: 0 };

// 自機(下)と敵(上)は既定で同じ x に並ぶので、真上撃ちで当たる。
function world() {
  return makeWorld({ bounds: FIELD, seed: 1, ship: defaultShip(FIELD), enemies: [defaultEnemy(1, FIELD)] });
}

describe('自機が撃つ側（③④）：主体反転が step を変えずに乗る', () => {
  it('自動発射：入力なしでも player 陣営の自弾が出る（東方風）', () => {
    const w = world();
    for (let i = 0; i < 30; i++) step(w, STILL, DT);
    expect(w.bullets.some((b) => b.owner === 'player')).toBe(true);
  });

  it('autoFire を切れば撃たない', () => {
    const w = world();
    w.ship.autoFire = false;
    for (let i = 0; i < 30; i++) step(w, STILL, DT);
    expect(w.bullets.some((b) => b.owner === 'player')).toBe(false);
  });

  it('自弾が敵に届くと bullet-hits-enemy (owner=player) が出る', () => {
    const w = world();
    let hit = false;
    for (let i = 0; i < 240 && !hit; i++) {
      const events = step(w, STILL, DT);
      hit = events.some((e) => e.kind === 'bullet-hits-enemy' && e.owner === 'player');
    }
    expect(hit).toBe(true);
  });

  it('武器を弾幕パターンに差し替えると、1 回の発射で複数の自弾が出る', () => {
    const w = world();
    w.ship.weapon = evenSpread({ ways: 4, spread: 0.16, speed: 500, radius: 4, interval: 0.09, baseAngle: -Math.PI / 2 });
    let maxPerStep = 0;
    for (let i = 0; i < 30; i++) {
      const before = w.bullets.filter((b) => b.owner === 'player').length;
      step(w, STILL, DT);
      const after = w.bullets.filter((b) => b.owner === 'player').length;
      maxPerStep = Math.max(maxPerStep, after - before);
    }
    expect(maxPerStep).toBeGreaterThanOrEqual(4); // 偶数弾 4-way が同時に出る
  });

  it('③ hitEnemy：規定数当てれば cleared', () => {
    const o = hitEnemy({ quota: 3 });
    const s = makeScore(1);
    const ev = { kind: 'bullet-hits-enemy', bullet: 1, enemy: 1, owner: 'player' } as const;
    o.onCollision(ev, s);
    o.onCollision(ev, s);
    expect(o.evaluate(s, world())).toBe('ongoing');
    o.onCollision(ev, s);
    expect(o.evaluate(s, world())).toBe('cleared');
  });

  it('④ dontHitEnemy：1 発でも当てたら failed', () => {
    const o = dontHitEnemy();
    const s = makeScore(1);
    expect(o.evaluate(s, world())).toBe('ongoing');
    o.onCollision({ kind: 'bullet-hits-enemy', bullet: 1, enemy: 1, owner: 'player' }, s);
    expect(o.evaluate(s, world())).toBe('failed');
  });
});
