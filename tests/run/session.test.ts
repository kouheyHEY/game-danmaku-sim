import { describe, expect, it } from 'vitest';
import {
  GRAZE_SCORE,
  BOSS_DEFEAT_HEAL,
  IFRAME,
  beginSession,
  chooseSpecialUpgrade,
  multiplierForPriestDefeats,
  pauseSession,
  resumeSession,
  scoreForBase,
  spawnBoss,
  stepSession,
  titleSession,
} from '../../src/run/session';
import type { Bullet, ShipInput } from '../../src/domain/entities';
import { availableSpecialRewards } from '../../src/run/upgrades';

const DT = 1 / 120;
const STILL: ShipInput = { moveX: 0, moveY: 0 };

function stepFor(session: ReturnType<typeof beginSession>, seconds: number): void {
  const count = Math.round(seconds / DT);
  for (let i = 0; i < count && session.phase === 'playing'; i++) stepSession(session, STILL, DT);
}

describe('boss-only session', () => {
  it('starts from the title and spawns the first boss without a mob phase', () => {
    expect(titleSession(1).phase).toBe('title');
    const session = beginSession(1);
    expect(session.world.enemies).toHaveLength(0);
    expect(session.scoreBase).toBe(0);
    stepFor(session, 1);
    expect(session.bossKind).toBe('reversa');
    expect(session.bossIsStrong).toBe(true);
    expect(session.world.enemies.every((enemy) => enemy.role !== 'mob')).toBe(true);
  });

  it('does not advance while paused', () => {
    const session = beginSession(1);
    const time = session.world.time;
    expect(pauseSession(session)).toBe(true);
    stepSession(session, STILL, 1);
    expect(session.world.time).toBe(time);
    expect(resumeSession(session)).toBe(true);
    stepSession(session, STILL, DT);
    expect(session.world.time).toBeGreaterThan(time);
  });

  it('adds ten base points when an enemy bullet grazes once', () => {
    const session = beginSession(2);
    session.nextBossAt = Number.POSITIVE_INFINITY;
    session.world.ship.autoFire = false;
    session.world.bullets.push({
      id: 999,
      pos: { x: session.world.ship.pos.x + 15, y: session.world.ship.pos.y },
      vel: { x: 0, y: 0 },
      radius: 2,
      owner: 'enemy',
    });

    stepSession(session, STILL, DT);
    expect(session.grazeCount).toBe(1);
    expect(session.scoreBase).toBe(GRAZE_SCORE);
    expect(session.score).toBe(GRAZE_SCORE);

    stepSession(session, STILL, DT);
    expect(session.grazeCount).toBe(1);
    expect(session.scoreBase).toBe(GRAZE_SCORE);
  });

  it('adds actual damage dealt to the base score and excludes overkill', () => {
    const session = beginSession(3);
    session.nextBossAt = Number.POSITIVE_INFINITY;
    session.world.ship.autoFire = false;
    expect(spawnBoss(session, 'normal', false)).toBe(true);
    const boss = session.world.enemies.find((enemy) => enemy.id === session.bossId)!;
    boss.hp = 0.5;
    session.world.bullets.push({
      id: session.world.nextId++,
      pos: { ...boss.pos },
      vel: { x: 0, y: 0 },
      radius: 2,
      owner: 'player',
    });

    stepSession(session, STILL, DT);
    expect(session.damageDealt).toBe(0.5);
    expect(session.scoreBase).toBe(0.5);
    expect(session.score).toBe(0.5);
  });

  it('does not score enemy bullets merely leaving the screen', () => {
    const session = beginSession(4);
    session.nextBossAt = Number.POSITIVE_INFINITY;
    session.world.bullets.push({
      id: 999,
      pos: { x: -100, y: -100 },
      vel: { x: -10, y: -10 },
      radius: 2,
      owner: 'enemy',
    });
    stepSession(session, STILL, DT);
    expect(session.scoreBase).toBe(0);
    expect(session.score).toBe(0);
  });

  it('applies the priest multiplier to damage and graze base points', () => {
    const session = beginSession(5);
    session.scoreBase = 10;
    expect(spawnBoss(session, 'priest', true)).toBe(true);
    session.world.enemies.forEach((enemy) => { enemy.hp = 0; });
    stepSession(session, STILL, DT);
    expect(session.priestDefeats).toBe(1);
    expect(session.scoreMultiplier).toBeCloseTo(1.2);
    expect(session.score).toBeCloseTo(12);
    expect(session.rewardNotice).toContain('×1.20');
    expect(multiplierForPriestDefeats(3)).toBeCloseTo(1.728);
    expect(scoreForBase(10, 3)).toBeCloseTo(17.28);
  });

  it('keeps upgrade levels after rebirth and can continue strengthening', () => {
    const session = beginSession(51);
    session.nextBossAt = Number.POSITIVE_INFINITY;
    session.world.ship.invulnUntil = 1e9;
    expect(spawnBoss(session, 'priest', true)).toBe(true);
    session.world.enemies.forEach((enemy) => { enemy.hp = 0; });
    stepSession(session, STILL, DT);
    expect(session.priestDefeats).toBe(1);

    session.specialChoices = [availableSpecialRewards(session.loadout).find((u) => u.key === 'focus')!];
    expect(chooseSpecialUpgrade(session, 0)).toBe(true);
    expect(session.loadout.upgradeLevels.focus).toBe(1);

    expect(spawnBoss(session, 'reversa', true)).toBe(true);
    session.world.enemies.forEach((enemy) => { enemy.hp = 0; });
    stepSession(session, STILL, DT);
    session.specialChoices = [availableSpecialRewards(session.loadout).find((u) => u.key === 'focus')!];
    expect(chooseSpecialUpgrade(session, 0)).toBe(true);
    expect(session.loadout.upgradeLevels.focus).toBe(2);
  });

  it('offers a special upgrade after a strong boss and continues to the next boss', () => {
    const session = beginSession(6);
    session.world.ship.invulnUntil = 1e9;
    stepFor(session, 1);
    expect(session.bossId).not.toBeNull();
    session.world.enemies.forEach((enemy) => { enemy.hp = 0; });
    stepSession(session, STILL, DT);
    expect(session.phase).toBe('reward');
    expect(session.specialChoices).toHaveLength(2);
    expect(chooseSpecialUpgrade(session, 0)).toBe(true);
    stepFor(session, 1.4);
    expect(session.bossKind).toBe('sniper');
    expect(session.world.enemies.every((enemy) => enemy.role !== 'mob')).toBe(true);
  });

  it('heals one HP automatically before showing every boss reward', () => {
    const session = beginSession(61);
    session.world.ship.invulnUntil = 1e9;
    session.world.ship.hp = 2;
    session.loadout.hp = 2;
    stepFor(session, 1);
    session.world.enemies.forEach((enemy) => { enemy.hp = 0; });

    stepSession(session, STILL, DT);

    expect(session.phase).toBe('reward');
    expect(session.world.ship.hp).toBe(2 + BOSS_DEFEAT_HEAL);
    expect(session.loadout.hp).toBe(2 + BOSS_DEFEAT_HEAL);
  });

  it('enters game over on the final hit and grants the configured invulnerability window', () => {
    const session = beginSession(7);
    session.world.ship.hp = 1;
    const bullet: Bullet = {
      id: 999,
      pos: { ...session.world.ship.pos },
      vel: { x: 0, y: 0 },
      radius: 6,
      owner: 'enemy',
    };
    session.world.bullets.push(bullet);
    stepSession(session, STILL, DT);
    expect(session.phase).toBe('gameover');
    expect(session.world.ship.invulnUntil - session.world.time).toBeCloseTo(IFRAME);
  });

  it('clears every enemy bullet with the player-centered hit wave', () => {
    const session = beginSession(8);
    const deathPos = { ...session.world.ship.pos };
    const hit: Bullet = { id: 1001, pos: { ...session.world.ship.pos }, vel: { x: 0, y: 0 }, radius: 6, owner: 'enemy' };
    const distant: Bullet = { id: 1002, pos: { x: 30, y: 30 }, vel: { x: 0, y: 0 }, radius: 6, owner: 'enemy' };
    const player: Bullet = { id: 1003, pos: { x: 40, y: 40 }, vel: { x: 0, y: -100 }, radius: 3, owner: 'player' };
    session.world.bullets.push(hit, distant, player);

    stepSession(session, STILL, DT);

    expect(session.world.ship.deathPos).toEqual(deathPos);
    expect(session.world.bullets.every((bullet) => bullet.owner === 'player')).toBe(true);
    expect(session.world.bullets).toContain(player);
  });
});
