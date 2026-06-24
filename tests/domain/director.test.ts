import { describe, it, expect } from 'vitest';
import { makeWorld, defaultShip } from '../../src/domain/world';
import type { Bullet } from '../../src/domain/entities';
import { avoidEnemyBullets, catchEnemyBullets, transition, makeScore, type Mode } from '../../src/domain/objective';
import { makeDirector, type Phase } from '../../src/domain/director';
import { oneWay, rotating } from '../../src/domain/pattern';
import { FIELD } from '../../src/spec/stage0';

const AVOID: Mode = { firer: 'enemy', goal: 'avoid' };

function world() {
  return makeWorld({ bounds: FIELD, seed: 1, ship: defaultShip(FIELD) });
}

// ① 弾幕 →(lull)→ ② 一方向、という最小の遷移を組む。
function phases(): Phase[] {
  return [
    { id: 'avoid', objective: avoidEnemyBullets(), pattern: rotating({ ways: 3, speed: 100, radius: 5, interval: 0.2, spread: 0.3, rotStep: 0.3 }), end: { type: 'afterSeconds', seconds: 1 } },
    { id: 'lull', objective: transition(AVOID), pattern: null, end: { type: 'whenClear', minSeconds: 0.2 }, lull: true, cue: 'color-flip' },
    { id: 'catch', objective: catchEnemyBullets(), pattern: oneWay({ speed: 200, radius: 5, interval: 0.2 }), end: { type: 'objectiveCleared', deadline: 5 } },
  ];
}

const enemyBullet = (id: number): Bullet => ({ id, pos: { x: 0, y: 0 }, vel: { x: 0, y: 0 }, radius: 5, owner: 'enemy' });

describe('Director：①開始・遷移は無弾(lull)を挟む', () => {
  it('begin で初期フェーズの敵弾パターンと発射ONが場に適用される', () => {
    const w = world();
    const d = makeDirector(phases());
    d.begin(w);
    expect(d.phaseId()).toBe('avoid');
    expect(w.enemyPattern).not.toBeNull();
    expect(w.firingEnabled).toBe(true);
  });

  it('① は時間で lull へ。lull に入った瞬間に発射が止まる', () => {
    const w = world();
    const d = makeDirector(phases());
    d.begin(w);
    const score = makeScore(5);

    w.time = 1.01;
    expect(d.update(w, score)).toBe('ongoing');
    expect(d.phaseId()).toBe('lull');
    expect(w.firingEnabled).toBe(false);
    expect(w.enemyPattern).toBeNull();
  });

  it('lull は敵弾が残っている間は進まない（無弾の瞬間を保証）', () => {
    const w = world();
    const d = makeDirector(phases());
    d.begin(w);
    const score = makeScore(5);
    w.time = 1.01;
    d.update(w, score); // → lull

    w.bullets = [enemyBullet(1)]; // まだ敵弾あり
    w.time = 2.0; // minSeconds は満たすが弾が残る
    expect(d.update(w, score)).toBe('ongoing');
    expect(d.phaseId()).toBe('lull');
  });

  it('敵弾が消えたら ② へ。次の敵弾は一方向発射になる', () => {
    const w = world();
    const d = makeDirector(phases());
    d.begin(w);
    const score = makeScore(5);
    w.time = 1.01;
    d.update(w, score); // → lull

    w.bullets = []; // 無弾
    w.time = 1.3; // inPhase >= 0.2
    expect(d.update(w, score)).toBe('ongoing');
    expect(d.phaseId()).toBe('catch');
    expect(d.current().mode.goal).toBe('hit');
    expect(w.firingEnabled).toBe(true);
    expect(w.enemyPattern).not.toBeNull();
  });

  it('lull 中は telegraph が次モード(②hit)を予告する', () => {
    const w = world();
    const d = makeDirector(phases());
    d.begin(w);
    const score = makeScore(5);
    expect(d.telegraph(w)).toBeNull(); // ① 中は予告なし
    w.time = 1.01;
    d.update(w, score); // → lull
    const tel = d.telegraph(w)!;
    expect(tel.active).toBe(true);
    expect(tel.upcomingMode.goal).toBe('hit');
  });

  it('② は一撃成立でクリア', () => {
    const w = world();
    const d = makeDirector(phases());
    d.begin(w);
    const score = makeScore(5);
    w.time = 1.01;
    d.update(w, score);
    w.bullets = [];
    w.time = 1.3;
    d.update(w, score); // → catch
    d.onCollision({ kind: 'bullet-hits-ship', bullet: 1, owner: 'enemy' }, score);
    expect(d.update(w, score)).toBe('cleared');
  });

  it('② は期限内に取れなければ敗北', () => {
    const w = world();
    const d = makeDirector(phases());
    d.begin(w);
    const score = makeScore(5);
    w.time = 1.01;
    d.update(w, score);
    w.bullets = [];
    w.time = 1.3;
    d.update(w, score); // → catch（phaseStart=1.3）
    w.time = 1.3 + 5.01; // deadline 超過
    expect(d.update(w, score)).toBe('failed');
  });
});
