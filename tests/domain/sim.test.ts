import { describe, it, expect } from 'vitest';
import { step } from '../../src/domain/world';
import type { ShipInput } from '../../src/domain/entities';
import { stage0, SURVIVE_SECONDS } from '../../src/spec/stage0';

const DT = 1 / 120;
const STILL: ShipInput = { moveX: 0, moveY: 0 };

function run(input: ShipInput, seconds: number) {
  const s = stage0();
  const steps = Math.round(seconds / DT);
  let badHits = 0;
  for (let i = 0; i < steps; i++) {
    const events = step(s.world, input, DT);
    for (const e of events) s.director.onCollision(e, s.score);
    const outcome = s.director.update(s.world, s.score);
    badHits += events.length;
    if (outcome !== 'ongoing') return { ...s, outcome, badHits, stepsTaken: i + 1 };
  }
  return { ...s, outcome: 'ongoing' as const, badHits, stepsTaken: steps };
}

describe('決定論シミュレーション (domain は Pixi 非依存でテストできる)', () => {
  it('同じシード＋同じ入力なら、完全に同じ展開になる', () => {
    const a = run(STILL, 3);
    const b = run(STILL, 3);
    expect(a.world.bullets.length).toBe(b.world.bullets.length);
    expect(a.world.ship.pos).toEqual(b.world.ship.pos);
    expect(a.score).toEqual(b.score);
  });

  it('弾幕パターンが実際に弾を生んでいる', () => {
    const s = stage0();
    for (let i = 0; i < 60; i++) step(s.world, STILL, DT);
    expect(s.world.bullets.length).toBeGreaterThan(0);
  });

  it('① avoid: 止まっていれば被弾し、制限時間より前に failed になる', () => {
    const r = run(STILL, SURVIVE_SECONDS);
    expect(r.outcome).toBe('failed');
    expect(r.score.hp).toBeLessThanOrEqual(0);
    expect(r.world.time).toBeLessThan(SURVIVE_SECONDS);
  });
});
