import { describe, it, expect } from 'vitest';
import { titleSession, beginSession, stepSession } from '../../src/run/session';
import { randomWeaponUpgrade } from '../../src/run/upgrades';
import { startingLoadout } from '../../src/run/loadout';
import { makeRng } from '../../src/domain/rng';
import type { Bullet, ShipInput } from '../../src/domain/entities';

const DT = 1 / 120;
const STILL: ShipInput = { moveX: 0, moveY: 0 };

function stepFor(session: ReturnType<typeof beginSession>, seconds: number) {
  const n = Math.round(seconds / DT);
  for (let i = 0; i < n && session.phase === 'playing'; i++) stepSession(session, STILL, DT);
}

describe('Session：Tap to Start / ひたすら避ける / たまにボス', () => {
  it('title は開始前、begin で playing・雨が降る・敵なし', () => {
    expect(titleSession(1).phase).toBe('title');
    const s = beginSession(1);
    expect(s.phase).toBe('playing');
    expect(s.world.enemyPattern).not.toBeNull();
    expect(s.world.enemies).toHaveLength(0);
  });

  it('避けた弾がスコアになる（画面外に出た敵弾を数える）', () => {
    const s = beginSession(1);
    s.world.ship.invulnUntil = 1e9; // 無敵にして被弾でゲームオーバーにしない
    stepFor(s, 8);
    expect(s.score).toBeGreaterThan(0);
    expect(s.score).toBe(s.world.dodged);
    expect(s.phase).toBe('playing');
  });

  it('一定時間でボスが出現する', () => {
    const s = beginSession(1);
    s.world.ship.invulnUntil = 1e9;
    s.nextBossAt = s.world.time + 0.2;
    stepFor(s, 0.5);
    expect(s.bossActive).toBe(true);
    expect(s.world.enemies.length).toBe(1);
  });

  it('ボス撃破で HP+1回復・武器強化・次のボス予約', () => {
    const s = beginSession(1);
    s.world.ship.invulnUntil = 1e9;
    s.world.ship.hp = 2; // 回復が見えるよう減らしておく
    s.nextBossAt = s.world.time + 0.05;
    stepFor(s, 0.2); // ボス出現
    expect(s.bossActive).toBe(true);
    const wpnBefore = JSON.stringify(s.loadout.weapon);
    s.world.enemies.forEach((e) => (e.hp = 0)); // 撃破
    stepSession(s, STILL, DT);
    expect(s.bossActive).toBe(false);
    expect(s.level).toBe(1);
    expect(s.world.ship.hp).toBe(3); // +1回復
    expect(JSON.stringify(s.loadout.weapon)).not.toBe(wpnBefore); // 強化された
    expect(s.toast).not.toBeNull();
    expect(s.nextBossAt).toBeGreaterThan(s.world.time);
  });

  it('HP0 で gameover', () => {
    const s = beginSession(1);
    s.world.ship.hp = 1;
    const b: Bullet = { id: 999, pos: { x: s.world.ship.pos.x, y: s.world.ship.pos.y }, vel: { x: 0, y: 0 }, radius: 6, owner: 'enemy' };
    s.world.bullets.push(b);
    stepSession(s, STILL, DT);
    expect(s.phase).toBe('gameover');
  });

  it('randomWeaponUpgrade：直線のうちは拡散UPを選ばない', () => {
    const l = startingLoadout();
    for (let seed = 0; seed < 30; seed++) {
      const l2 = startingLoadout();
      const name = randomWeaponUpgrade(makeRng(seed), l2);
      expect(name).not.toBe('拡散UP');
    }
    expect(l.weapon.kind).toBe('straight');
  });
});
