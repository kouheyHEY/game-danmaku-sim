import { describe, expect, it } from 'vitest';
import type { Bullet, ShipInput } from '../../src/domain/entities';
import { beginSession, chooseSpecialUpgrade, stepSession } from '../../src/run/session';
import {
  debugPriestMode, debugReversaMode, debugSpawnBossKind, debugTriggerBossEvent,
} from '../../src/run/debug';
import { applyBossHit, bossKindForLevel } from '../../src/run/bosses';
import { makeBoss } from '../../src/run/content';
import { makeRng } from '../../src/domain/rng';
import { FIELD } from '../../src/spec/stage0';

const STILL: ShipInput = { moveX: 0, moveY: 0 };
const DT = 1 / 120;

function stepFor(s: ReturnType<typeof beginSession>, seconds: number): void {
  const count = Math.ceil(seconds / DT);
  for (let i = 0; i < count && s.phase === 'playing'; i++) stepSession(s, STILL, DT);
}

describe('特徴ボス', () => {
  it('通常ボス2体ごとに特徴ボスが出て、15体目にプリーストが来る', () => {
    expect(Array.from({ length: 15 }, (_, level) => bossKindForLevel(level))).toEqual([
      'normal', 'normal', 'reversa',
      'normal', 'normal', 'sniper',
      'normal', 'normal', 'shogun',
      'normal', 'normal', 'tank',
      'normal', 'normal', 'priest',
    ]);
  });

  it('15体を順番に撃破し、3体ごとの特別報酬を経ても進行が続く', () => {
    const s = beginSession(11);
    s.world.ship.invulnUntil = 1e9;
    s.world.ship.autoFire = false;
    const expected = Array.from({ length: 15 }, (_, level) => bossKindForLevel(level));
    for (const [index, kind] of expected.entries()) {
      s.nextBossAt = s.world.time;
      stepSession(s, STILL, DT);
      expect(s.bossKind).toBe(kind);
      for (const e of s.world.enemies) e.hp = 0;
      stepSession(s, STILL, DT);
      expect(s.phase === 'reward').toBe((index + 1) % 3 === 0);
      if (s.phase === 'reward') expect(chooseSpecialUpgrade(s, 0)).toBe(true);
    }
    expect(s.level).toBe(15);
    expect(s.boss).toBeNull();
    expect(s.phase).toBe('playing');
  });

  it('通常ボスの弾幕は発射時の乱数状態に依存しない（ランダム弾なし）', () => {
    for (let seed = 0; seed < 30; seed++) {
      const boss = makeBoss(1, 0, FIELD, makeRng(seed));
      const a = boss.pattern!.emit(0, DT, boss.pos, makeRng(101));
      const b = boss.pattern!.emit(0, DT, boss.pos, makeRng(202));
      expect(a).toEqual(b);
    }
  });

  it('各ボスを20秒動かしても残弾が無制限に増えない', () => {
    for (const kind of ['reversa', 'sniper', 'shogun', 'tank', 'priest'] as const) {
      const s = beginSession(20);
      s.world.ship.autoFire = false;
      s.world.ship.invulnUntil = 1e9;
      debugSpawnBossKind(s, kind);
      for (const e of s.world.enemies) {
        e.hp = 1e9;
        e.maxHp = 1e9;
      }
      stepFor(s, 20);
      expect(s.phase).toBe('playing');
      expect(s.world.bullets.length).toBeLessThan(400);
    }
  });

  it('リバーサAは上下と弾方向、Cは操作を反転する', () => {
    const s = beginSession(1);
    s.world.ship.autoFire = true;
    debugSpawnBossKind(s, 'reversa');
    s.world.bullets.push({ id: 9000, pos: { x: 10, y: 10 }, vel: { x: 0, y: 0 }, radius: 4, owner: 'enemy' });
    debugReversaMode(s, 'swap');
    expect(s.world.bullets).toHaveLength(1); // 残弾は消さず、新規発射だけ止める
    expect(s.world.firingEnabled).toBe(false);
    stepFor(s, 1.5);
    expect(s.world.bullets).toHaveLength(1);
    stepFor(s, 0.6);
    expect(s.world.firingEnabled).toBe(true);
    const boss = s.world.enemies.find((e) => e.id === s.bossId)!;
    expect(s.world.ship.pos.y).toBeLessThan(s.world.bounds.h / 2);
    expect(boss.pos.y).toBeGreaterThan(s.world.bounds.h / 2);
    const normalTargetY = s.world.bounds.h * 0.3;
    stepSession(s, { moveX: 0, moveY: 0, target: { x: s.world.bounds.w / 2, y: normalTargetY } }, DT);
    expect(s.world.ship.pos.y).toBe(normalTargetY); // Aでもタッチ位置を鏡映しせず通常操作
    stepFor(s, 0.3);
    expect(s.world.bullets.some((b) => b.owner === 'player' && b.vel.y > 0)).toBe(true);
    expect(s.world.bullets.some((b) => b.owner === 'enemy' && b.vel.y < 0)).toBe(true);

    debugReversaMode(s, 'invert');
    stepFor(s, 2.1);
    const x0 = s.world.ship.pos.x;
    stepSession(s, { moveX: 1, moveY: 0 }, 0.1);
    expect(s.world.ship.pos.x).toBeLessThan(x0);
  });

  it('リバーサBは命中で回復し、非命中時間はダメージになる', () => {
    const s = beginSession(2);
    s.world.ship.autoFire = false;
    debugSpawnBossKind(s, 'reversa');
    debugReversaMode(s, 'regen');
    stepFor(s, 2.1);
    const runtime = s.boss!;
    const boss = s.world.enemies.find((e) => e.id === s.bossId)!;
    boss.hp -= 10;
    const beforeHit = boss.hp;
    const bullet: Bullet = { id: 9999, pos: { ...boss.pos }, vel: { x: 0, y: 0 }, radius: 5, owner: 'player' };
    s.world.bullets.push(bullet);
    stepSession(s, STILL, DT);
    expect(boss.hp).toBeGreaterThan(beforeHit);
    const afterHit = boss.hp;
    s.world.bullets = [];
    stepSession(s, STILL, 0.1);
    expect(boss.hp).toBeLessThan(afterHit);
    expect(runtime.kind).toBe('reversa');
  });

  it('スナイパーは3体で、高速射撃後だけ可視・攻撃可能になる', () => {
    const s = beginSession(3);
    s.world.ship.autoFire = false;
    debugSpawnBossKind(s, 'sniper');
    expect(s.world.enemies).toHaveLength(3);
    expect(s.world.enemies.every((e) => e.visible === false && e.targetable === false)).toBe(true);
    debugTriggerBossEvent(s);
    stepSession(s, STILL, DT);
    expect(s.world.bullets.filter((b) => b.style === 'sniper')).toHaveLength(3);
    expect(s.world.enemies.every((e) => e.visible && e.targetable)).toBe(true);

    if (s.boss?.kind !== 'sniper') throw new Error('sniper runtime expected');
    for (const shooter of s.boss.shooters) {
      shooter.vulnerableUntil = s.world.time;
      shooter.nextShotAt = 1e9;
    }
    stepSession(s, STILL, DT);
    expect(s.world.enemies.every((e) => e.visible === false && e.targetable === false)).toBe(true);
  });

  it('ショウグンは壁撃破まで無敵で、その後は位置に応じて三方向弾と刀波を使う', () => {
    const s = beginSession(4);
    s.world.ship.autoFire = false;
    debugSpawnBossKind(s, 'shogun');
    const boss = s.world.enemies.find((e) => e.id === s.bossId)!;
    expect(boss.targetable).toBe(false);
    expect(s.world.enemies.some((e) => e.role === 'guard')).toBe(true);
    debugTriggerBossEvent(s);
    stepSession(s, STILL, DT);
    stepSession(s, STILL, DT);
    expect(s.world.enemies.some((e) => e.role === 'guard')).toBe(false);
    expect(boss.targetable).toBe(true);

    if (s.boss?.kind !== 'shogun') throw new Error('shogun runtime expected');
    s.world.bullets = [];
    s.world.ship.pos.y = s.world.bounds.h * 0.8;
    s.boss.attackNextAt = s.world.time;
    stepSession(s, STILL, DT);
    expect(s.world.bullets.filter((b) => b.owner === 'enemy')).toHaveLength(3);

    s.world.bullets = [];
    s.world.ship.pos.y = s.world.bounds.h * 0.2;
    s.boss.attackNextAt = s.world.time;
    stepFor(s, 0.2);
    expect(s.world.bullets.filter((b) => b.style === 'wave').length).toBeGreaterThan(3);
  });

  it('タンクは耐久が高く、段階3で低速小型の1回跳弾へ変化し、次段階で復元を始める', () => {
    const s = beginSession(5);
    s.world.ship.autoFire = false;
    debugSpawnBossKind(s, 'tank');
    const boss = s.world.enemies.find((e) => e.id === s.bossId)!;
    expect(boss.maxHp).toBeGreaterThan(120);
    for (let i = 0; i < 3; i++) {
      debugTriggerBossEvent(s);
      stepSession(s, STILL, DT);
    }
    if (s.boss?.kind !== 'tank') throw new Error('tank runtime expected');
    expect(s.boss.stage).toBe(3);
    expect(s.boss.rebound).toBe(true);
    s.world.bullets = [];
    s.boss.nextShotAt = s.world.time;
    stepSession(s, STILL, DT);
    const bounce = s.world.bullets.find((b) => b.style === 'tank')!;
    expect(Math.hypot(bounce.vel.x, bounce.vel.y)).toBeLessThan(60);
    expect(bounce.radius).toBe(3);
    expect(bounce.bouncesRemaining).toBe(1);

    debugTriggerBossEvent(s);
    stepSession(s, STILL, DT);
    expect(s.boss.stage).toBe(4);
    expect(s.boss.rebound).toBe(false);
    expect(s.boss.recoverUntil).toBeGreaterThan(s.world.time);
  });

  it('プリーストBは弾が少ない時だけ加速跳弾を出し、Cは模倣して被ダメージを半減する', () => {
    const s = beginSession(6);
    s.world.ship.autoFire = false;
    debugSpawnBossKind(s, 'priest');
    debugPriestMode(s, 'orb');
    stepSession(s, STILL, DT);
    const orb = s.world.bullets.find((b) => b.style === 'orb')!;
    expect(orb.bouncesRemaining).toBeGreaterThan(1);
    expect(orb.bounceSpeedUp).toBeGreaterThan(1);
    const bounces0 = orb.bouncesRemaining!;
    orb.pos = { x: s.world.bounds.w - orb.radius + 1, y: s.world.bounds.h / 2 };
    orb.vel = { x: 100, y: 0 };
    stepSession(s, STILL, DT);
    expect(orb.vel.x).toBeLessThan(0);
    expect(orb.bouncesRemaining).toBe(bounces0 - 1);
    orb.pos = { x: orb.radius - 1, y: s.world.bounds.h / 2 };
    orb.vel = { x: -250, y: 0 };
    stepSession(s, STILL, DT);
    expect(s.world.bullets).not.toContain(orb); // 上限速度へ達した時点で消える

    debugPriestMode(s, 'duel');
    if (s.boss?.kind !== 'priest') throw new Error('priest runtime expected');
    expect(s.boss.mode).toBe('duel');
    expect(s.boss.copiedPattern).not.toBeNull();
    const boss = s.world.enemies.find((e) => e.id === s.bossId)!;
    const hp0 = boss.hp;
    applyBossHit(s.boss, s.world, boss.id, 10);
    expect(boss.hp).toBe(hp0 - 5);
    stepFor(s, 0.2);
    expect(s.world.bullets.some((b) => b.owner === 'enemy')).toBe(true);
  });
});
