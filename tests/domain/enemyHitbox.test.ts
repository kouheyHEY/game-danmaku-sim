/**
 * 該当モジュールの期待挙動を固定する自動テスト。
 */
import { describe, expect, it } from 'vitest';
import type { Bullet, Enemy } from '../../src/domain/entities';
import { bulletHitsEnemy } from '../../src/domain/world';

const bullet = (x: number, y: number, radius = 1): Bullet => ({
  id: 1,
  pos: { x, y },
  vel: { x: 0, y: 0 },
  radius,
  owner: 'player',
});

const enemy = (hitbox: Enemy['hitbox']): Enemy => ({
  id: 2,
  pos: { x: 100, y: 100 },
  vel: { x: 0, y: 0 },
  hitRadius: 10,
  hitbox,
  hp: 1,
  maxHp: 1,
  pattern: null,
});

describe('enemy hitboxes', () => {
  it('uses the full rectangular texture area for ordinary enemies', () => {
    const target = enemy({ kind: 'rect', halfWidth: 24, halfHeight: 24 });
    expect(bulletHitsEnemy(bullet(123, 123), target)).toBe(true);
    expect(bulletHitsEnemy(bullet(126, 126), target)).toBe(false);
  });

  it('keeps the priest hitbox circular and small', () => {
    const priest = enemy({ kind: 'circle', radius: 8 });
    expect(bulletHitsEnemy(bullet(107, 100), priest)).toBe(true);
    expect(bulletHitsEnemy(bullet(108, 108), priest)).toBe(false);
  });
});
