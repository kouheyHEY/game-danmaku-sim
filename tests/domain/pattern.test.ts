import { describe, it, expect } from 'vitest';
import { oddSpread, evenSpread, randomSpread, rotating, aimed } from '../../src/domain/pattern';
import { makeRng } from '../../src/domain/rng';

const rng = () => makeRng(1);
const DOWN = Math.PI / 2; // +y
// 真下(+π/2)に撃つ弾＝vx≈0, vy>0
const isStraight = (b: { vel: { x: number; y: number } }) => Math.abs(b.vel.x) < 1e-6 && b.vel.y > 0;

const base = { spread: 0.2, speed: 100, radius: 4, interval: 0.2, baseAngle: DOWN };

describe('弾幕パターンの種類', () => {
  it('奇数弾：ways を奇数に矯正し、中心(正面)に1発を含む', () => {
    const spawns = oddSpread({ ...base, ways: 4 }).emit(0, 0.05, { x: 0, y: 0 }, rng());
    expect(spawns.length).toBe(5); // 4 → 5
    expect(spawns.filter(isStraight).length).toBe(1);
  });

  it('偶数弾：ways を偶数に矯正し、正面に隙間（中心弾なし）', () => {
    const spawns = evenSpread({ ...base, ways: 5 }).emit(0, 0.05, { x: 0, y: 0 }, rng());
    expect(spawns.length).toBe(6); // 5 → 6
    expect(spawns.filter(isStraight).length).toBe(0);
  });

  it('回転弾幕：発射ごとに中心角が回る', () => {
    const p = rotating({ ...base, ways: 1, rotStep: 0.5 });
    const first = p.emit(0, 0.01, { x: 0, y: 0 }, rng())[0];
    const second = p.emit(0.2, 0.01, { x: 0, y: 0 }, rng())[0];
    const a1 = Math.atan2(first.vel.y, first.vel.x);
    const a2 = Math.atan2(second.vel.y, second.vel.x);
    expect(Math.abs(a2 - a1)).toBeGreaterThan(0.1);
  });

  it('aimed：自機(aim)の方向へ撃つ', () => {
    const p = aimed({ ways: 1, spread: 0, speed: 100, radius: 4, interval: 0.2 });
    const src = { x: 100, y: 0 };
    const down = p.emit(0, 0.05, src, rng(), { x: 100, y: 200 })[0]; // 真下
    expect(Math.abs(down.vel.x)).toBeLessThan(1e-6);
    expect(down.vel.y).toBeGreaterThan(0);
    const right = p.emit(0, 0.05, src, rng(), { x: 300, y: 0 })[0]; // 真右
    expect(right.vel.x).toBeGreaterThan(0);
    expect(Math.abs(right.vel.y)).toBeLessThan(1e-6);
  });

  it('ランダム弾：jitter で同条件でも角度がばらつく', () => {
    const spawns = randomSpread({ ...base, ways: 8, jitter: 0.4 }).emit(0, 0.05, { x: 0, y: 0 }, rng());
    const straight = spawns.filter(isStraight).length;
    expect(straight).toBe(0); // 揺らぎで真っ直ぐは生まれにくい
    expect(spawns.length).toBe(8);
  });
});
