import { describe, it, expect } from 'vitest';
import { makeWorld, defaultShip, defaultEnemy, step } from '../../src/domain/world';
import type { ShipInput } from '../../src/domain/entities';
import { FIELD } from '../../src/spec/stage0';

const DT = 1 / 120;
const STILL: ShipInput = { moveX: 0, moveY: 0 };

function world() {
  return makeWorld({ bounds: FIELD, seed: 1, ship: defaultShip(FIELD) });
}

describe('移動入力', () => {
  it('target（タッチ/ドラッグ）指定で自機が直接その位置へ追従する', () => {
    const w = world();
    const input: ShipInput = { moveX: 0, moveY: 0, target: { x: 120, y: 200 } };
    step(w, input, DT);
    expect(w.ship.pos).toEqual({ x: 120, y: 200 });
  });

  it('target は場の範囲にクランプされる', () => {
    const w = world();
    const input: ShipInput = { moveX: 0, moveY: 0, target: { x: -999, y: 99999 } };
    step(w, input, DT);
    expect(w.ship.pos.x).toBe(FIELD.x);
    expect(w.ship.pos.y).toBe(FIELD.y + FIELD.h);
  });

  it('target が無ければ moveX/moveY の速度移動になる', () => {
    const w = world();
    const x0 = w.ship.pos.x;
    step(w, { moveX: 1, moveY: 0 }, DT);
    expect(w.ship.pos.x).toBeGreaterThan(x0);
  });

  it('敵は横移動し、壁で反射する（③の動く標的）', () => {
    const enemy = defaultEnemy(1, FIELD);
    enemy.vel = { x: 1000, y: 0 };
    const w = makeWorld({ bounds: FIELD, seed: 1, ship: defaultShip(FIELD), enemies: [enemy] });
    for (let i = 0; i < 60; i++) step(w, STILL, DT); // 右壁に到達して反射するまで
    const e = w.enemies[0];
    expect(e.pos.x).toBeLessThanOrEqual(FIELD.w); // 場内に収まる
    expect(e.pos.x).toBeGreaterThanOrEqual(0);
    expect(e.vel.x).toBeLessThan(0); // 反射して左向きに転じた
  });
});
