import { describe, it, expect } from 'vitest';
import {
  titleSession, beginSession, stepSession, chooseSpecialUpgrade, pauseSession, resumeSession, spawnBoss,
  IFRAME, multiplierForPriestDefeats, scoreForDodged,
} from '../../src/run/session';
import { randomWeaponUpgrade } from '../../src/run/upgrades';
import { startingLoadout } from '../../src/run/loadout';
import { makeRng } from '../../src/domain/rng';
import type { Bullet, ShipInput } from '../../src/domain/entities';

const DT = 1 / 120;
const STILL: ShipInput = { moveX: 0, moveY: 0 };

it('一時停止中はゲームが進まず、再開後に進む', () => {
  const s = beginSession(1);
  const time = s.world.time;
  expect(pauseSession(s)).toBe(true);
  stepSession(s, STILL, 1);
  expect(s.world.time).toBe(time);
  expect(resumeSession(s)).toBe(true);
  stepSession(s, STILL, DT);
  expect(s.world.time).toBeGreaterThan(time);
});

function stepFor(session: ReturnType<typeof beginSession>, seconds: number) {
  const n = Math.round(seconds / DT);
  for (let i = 0; i < n && session.phase === 'playing'; i++) stepSession(session, STILL, DT);
}

describe('Session：Tap to Start / ひたすら避ける / たまにボス', () => {
  it('title は開始前、begin で playing・固定エミッタ無し・敵なし', () => {
    expect(titleSession(1).phase).toBe('title');
    const s = beginSession(1);
    expect(s.phase).toBe('playing');
    expect(s.world.enemyPattern).toBeNull(); // 弾は敵が撃つ
    expect(s.world.enemies).toHaveLength(0);
    expect(s.kills).toBe(0);
    expect(s.scoreMultiplier).toBe(1);
    expect(s.priestDefeats).toBe(0);
    expect(s.bossId).toBeNull();
  });

  it('降ってくる敵が弾を撃ち、避けた弾がスコアになる', () => {
    const s = beginSession(1);
    s.world.ship.invulnUntil = 1e9; // 無敵にして被弾でゲームオーバーにしない
    stepFor(s, 8);
    expect(s.world.enemies.length).toBeGreaterThan(0); // 敵が湧いている
    expect(s.score).toBeGreaterThan(0); // 敵弾を避けた（画面外に消えた）
    expect(s.score).toBe(s.world.dodged);
    expect(s.phase).toBe('playing');
  });

  it('雑魚を倒すと撃破数が増える', () => {
    const s = beginSession(1);
    s.world.ship.invulnUntil = 1e9;
    s.nextBossAt = 1e9; // ボスは出さない
    s.nextMobAt = s.world.time + 0.05;
    stepFor(s, 0.2); // 雑魚出現
    expect(s.world.enemies.length).toBeGreaterThan(0);
    expect(s.world.enemies.every((e) => e.maxHp === 1)).toBe(true); // ボス以外は一撃(HP1)
    const kills0 = s.kills;
    s.world.enemies.forEach((e) => (e.hp = 0)); // 撃破
    stepSession(s, STILL, DT);
    expect(s.kills).toBe(kills0 + 1);
  });

  it('一定時間で最初の大ボスが出現し弾幕を撃つ', () => {
    const s = beginSession(1);
    s.world.ship.invulnUntil = 1e9;
    s.nextMobAt = 1e9; // 雑魚を止めてボスだけ
    s.nextBossAt = s.world.time + 0.2;
    stepFor(s, 1);
    expect(s.bossId).not.toBeNull();
    expect(s.bossKind).toBe('reversa');
    expect(s.bossIsStrong).toBe(true);
    expect(s.world.bullets.some((b) => b.style === 'reversa')).toBe(true);
  });

  it('ボス時刻後は増援を止め、雑魚全滅後に残弾を消さず大ボスを出す', () => {
    const s = beginSession(12);
    s.nextBossAt = 1e9;
    stepFor(s, 0.6);
    const mobIds = s.world.enemies.map((e) => e.id);
    expect(mobIds.length).toBeGreaterThan(0);
    s.world.bullets.push({ id: 9998, pos: { x: 20, y: 20 }, vel: { x: 0, y: 0 }, radius: 4, owner: 'enemy' });
    s.nextBossAt = s.world.time;
    const enemyCount = s.world.enemies.length;
    stepFor(s, 0.5);
    expect(s.bossId).toBeNull();
    expect(s.world.enemies.length).toBeLessThanOrEqual(enemyCount);
    expect(s.world.enemies.every((e) => mobIds.includes(e.id))).toBe(true);

    s.world.enemies.forEach((e) => (e.hp = 0));
    stepSession(s, STILL, DT);
    expect(s.bossKind).toBe('reversa');
    expect(s.bossIsStrong).toBe(true);
    expect(s.world.bullets.some((b) => b.id === 9998)).toBe(true);
  });

  it('大ボス連戦モードは雑魚・通常ボスを出さず、特徴ボスを短い間隔で連戦する', () => {
    const s = beginSession(13, { featureBossOnly: true });
    s.world.ship.invulnUntil = 1e9;
    expect(s.nextMobAt).toBe(Number.POSITIVE_INFINITY);
    stepFor(s, 1);
    expect(s.bossKind).toBe('reversa');
    expect(s.bossIsStrong).toBe(true);
    s.world.enemies.forEach((e) => (e.hp = 0));
    stepSession(s, STILL, DT);
    expect(s.phase).toBe('reward');
    expect(chooseSpecialUpgrade(s, 0)).toBe(true);
    stepFor(s, 1.4);
    expect(s.bossKind).toBe('sniper');
    expect(s.world.enemies.every((e) => e.role !== 'mob')).toBe(true);
  });

  it('大ボス撃破でHP+1回復・撃破数+1・特別強化選択後に次のボスを予約する', () => {
    const s = beginSession(1);
    s.world.ship.invulnUntil = 1e9;
    s.world.ship.hp = 2; // 回復が見えるよう減らしておく
    s.nextMobAt = 1e9;
    s.nextBossAt = s.world.time + 0.05;
    stepFor(s, 0.2); // ボス出現
    expect(s.bossId).not.toBeNull();
    const kills0 = s.kills;
    const loadoutBefore = JSON.stringify(s.loadout);
    s.world.enemies.forEach((e) => (e.hp = 0)); // 撃破
    stepSession(s, STILL, DT);
    expect(s.bossId).toBeNull();
    expect(s.level).toBe(1);
    expect(s.world.ship.hp).toBe(3); // +1回復
    expect(s.kills).toBe(kills0 + 1);
    expect(s.phase).toBe('reward');
    expect(s.specialChoices).toHaveLength(2);
    expect(chooseSpecialUpgrade(s, 0)).toBe(true);
    expect(JSON.stringify(s.loadout)).not.toBe(loadoutBefore);
    expect(s.nextBossAt).toBeGreaterThan(s.world.time);
  });

  it('プリースト撃破ごとに倍率が1.1乗され、避けた弾数へ反映される', () => {
    const s = beginSession(21);
    s.world.dodged = 10;
    expect(spawnBoss(s, 'priest', true)).toBe(true);
    s.world.enemies.forEach((e) => (e.hp = 0));
    stepSession(s, STILL, DT);
    expect(s.priestDefeats).toBe(1);
    expect(s.scoreMultiplier).toBeCloseTo(1.1);
    expect(s.score).toBeCloseTo(11);
    expect(multiplierForPriestDefeats(3)).toBeCloseTo(1.331);
    expect(scoreForDodged(10, 3)).toBeCloseTo(13.31);
  });

  it('すべてのボス枠で固定順の強敵ボスが出現する', () => {
    const s = beginSession(1);
    s.nextMobAt = 1e9;
    s.nextBossAt = s.world.time + 0.05;
    stepFor(s, 0.2);
    expect(s.bossIsStrong).toBe(true);
    expect(s.bossKind).toBe('reversa');
    const boss = s.world.enemies.find((e) => e.id === s.bossId)!;
    expect(boss.hitRadius).toBeLessThanOrEqual(18);
    expect(boss.maxHp).toBeGreaterThanOrEqual(200);
  });

  it('強敵ボス撃破で2択が出て、選択後に強化を反映して進行再開する', () => {
    const s = beginSession(4);
    s.level = 2;
    s.world.ship.invulnUntil = 1e9;
    s.nextMobAt = 1e9;
    s.nextBossAt = s.world.time + 0.05;
    stepFor(s, 0.2);
    s.world.bullets.push({ id: 999, pos: { x: 10, y: 10 }, vel: { x: 0, y: 0 }, radius: 5, owner: 'enemy' });
    s.world.enemies.find((e) => e.id === s.bossId)!.hp = 0;
    stepSession(s, STILL, DT);

    expect(s.phase).toBe('reward');
    expect(s.level).toBe(3);
    expect(s.specialChoices).toHaveLength(2);
    expect(s.world.bullets).toHaveLength(0);
    const before = JSON.stringify(s.loadout);
    expect(chooseSpecialUpgrade(s, 0)).toBe(true);
    expect(s.phase).toBe('playing');
    expect(s.specialChoices).toHaveLength(0);
    expect(JSON.stringify(s.loadout)).not.toBe(before);
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

  it('被弾後は2.5秒間無敵になる', () => {
    const s = beginSession(9);
    s.world.bullets.push({
      id: 999,
      pos: { ...s.world.ship.pos },
      vel: { x: 0, y: 0 },
      radius: 6,
      owner: 'enemy',
    });
    stepSession(s, STILL, DT);
    expect(IFRAME).toBe(2.5);
    expect(s.world.ship.invulnUntil - s.world.time).toBeCloseTo(IFRAME);
  });

  it('randomWeaponUpgrade：直線のうちは収束UPを選ばない', () => {
    const l = startingLoadout();
    for (let seed = 0; seed < 30; seed++) {
      const l2 = startingLoadout();
      const name = randomWeaponUpgrade(makeRng(seed), l2);
      expect(name).not.toBe('収束UP');
    }
    expect(l.weapon.kind).toBe('straight');
  });
});
