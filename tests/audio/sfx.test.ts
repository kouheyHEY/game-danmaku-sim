import { describe, expect, it } from 'vitest';
import type { Bullet } from '../../src/domain/entities';
import { enemyShotCue, SfxTracker } from '../../src/audio/sfx';
import { beginSession } from '../../src/run/session';

function bullet(id: number, owner: Bullet['owner'], style?: Bullet['style']): Bullet {
  return { id, owner, style, pos: { x: 10, y: 10 }, vel: { x: 0, y: 1 }, radius: 3 };
}

describe('SfxTracker', () => {
  it('同じフレームの多方向弾を一つの発射音にまとめる', () => {
    const session = beginSession(1);
    const tracker = new SfxTracker();
    tracker.reset(session);
    session.world.bullets.push(bullet(1, 'player'), bullet(2, 'player'), bullet(3, 'player'));
    expect(tracker.collect(session)).toEqual(['player-shot']);
    expect(tracker.collect(session)).toEqual([]);
  });

  it('同時発射された敵弾も一つの音色にまとめる', () => {
    const session = beginSession(4);
    const tracker = new SfxTracker();
    tracker.reset(session);
    session.world.bullets.push(
      bullet(3, 'enemy'),
      bullet(9, 'enemy'),
      bullet(10, 'enemy', 'tank'),
    );
    expect(tracker.collect(session)).toEqual(['enemy-shot-burst']);
  });

  it('ショウグンの横断弾だけでは発射音を出さない', () => {
    const session = beginSession(5);
    const tracker = new SfxTracker();
    tracker.reset(session);
    session.world.bullets.push(bullet(1, 'enemy', 'side'), bullet(2, 'enemy', 'side'));
    expect(tracker.collect(session)).toEqual([]);
  });

  it('撃破・被弾・通常強化を状態差分から検出する', () => {
    const session = beginSession(2);
    const tracker = new SfxTracker();
    tracker.reset(session);
    session.kills += 1;
    session.world.ship.hp -= 1;
    session.level += 1;
    expect(tracker.collect(session)).toEqual(['enemy-defeat', 'player-hit', 'power-up']);
  });

  it('強ボス報酬待ちでは選択前の強化音を出さない', () => {
    const session = beginSession(3);
    const tracker = new SfxTracker();
    tracker.reset(session);
    session.level += 1;
    session.phase = 'reward';
    expect(tracker.collect(session)).toEqual([]);
  });
});

describe('enemyShotCue', () => {
  it('敵弾の種類に応じて音色を変える', () => {
    expect(enemyShotCue(bullet(1, 'enemy', 'sniper'))).toBe('enemy-shot-aimed');
    expect(enemyShotCue(bullet(2, 'enemy', 'tank'))).toBe('enemy-shot-heavy');
    expect(enemyShotCue(bullet(3, 'enemy', 'reversa'))).toBe('enemy-shot-burst');
    expect(enemyShotCue(bullet(4, 'enemy', 'side'))).toBeNull();
  });
});
