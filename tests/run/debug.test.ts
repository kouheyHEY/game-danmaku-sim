import { describe, it, expect } from 'vitest';
import { beginSession } from '../../src/run/session';
import {
  debugSpawnBoss, debugSpawnMob, debugLevelUp, debugGiveUpgrade, debugFullHeal,
  debugHurt, debugToggleInvuln, debugClearBullets, debugAddScore, WEAPON_UPGRADES,
} from '../../src/run/debug';

describe('デバッグアクション', () => {
  it('ボス出現：bossId が付き、弾幕を持つ敵が追加される', () => {
    const s = beginSession(1);
    debugSpawnBoss(s);
    expect(s.bossId).not.toBeNull();
    const boss = s.world.enemies.find((e) => e.id === s.bossId)!;
    expect(boss.pattern).not.toBeNull();
    // 既にボスがいれば増えない
    const n = s.world.enemies.length;
    debugSpawnBoss(s);
    expect(s.world.enemies.length).toBe(n);
  });

  it('雑魚出現：HP1の敵が追加される', () => {
    const s = beginSession(1);
    debugSpawnMob(s);
    expect(s.world.enemies.length).toBe(1);
    expect(s.world.enemies[0].maxHp).toBe(1);
  });

  it('Lv+強化：レベル+1・HP+1回復・武器が変化', () => {
    const s = beginSession(1);
    s.world.ship.hp = 2;
    const before = JSON.stringify(s.loadout.weapon);
    debugLevelUp(s);
    expect(s.level).toBe(1);
    expect(s.world.ship.hp).toBe(3);
    expect(JSON.stringify(s.loadout.weapon)).not.toBe(before);
  });

  it('指定強化を付与：武器スペックに反映', () => {
    const s = beginSession(1);
    const big = WEAPON_UPGRADES.find((u) => u.name === '弾を大きく')!;
    const r0 = s.loadout.weapon.radius;
    debugGiveUpgrade(s, big);
    expect(s.loadout.weapon.radius).toBeGreaterThan(r0);
    expect(s.world.ship.weapon).toBeTruthy(); // 武器が組み直されている
  });

  it('全回復・被弾・無敵・弾消し・スコア', () => {
    const s = beginSession(1);
    s.world.ship.hp = 1;
    debugFullHeal(s);
    expect(s.world.ship.hp).toBe(s.world.ship.maxHp);

    debugHurt(s);
    expect(s.world.ship.hp).toBe(s.world.ship.maxHp - 1);
    expect(s.world.ship.respawnUntil).toBeGreaterThan(s.world.time);

    const on = debugToggleInvuln(s);
    expect(on).toBe(true);
    expect(s.world.ship.invulnUntil).toBeGreaterThan(s.world.time + 1e6);

    s.world.bullets.push({ id: 1, pos: { x: 0, y: 0 }, vel: { x: 0, y: 0 }, radius: 4, owner: 'enemy' });
    debugClearBullets(s);
    expect(s.world.bullets).toHaveLength(0);

    debugAddScore(s, 100);
    expect(s.score).toBe(100);
  });
});
