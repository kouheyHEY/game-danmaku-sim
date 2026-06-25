import { describe, it, expect } from 'vitest';
import { startRun, stepRun, chooseReward, currentEnemy } from '../../src/run/run';
import { drawChoices, UPGRADES } from '../../src/run/upgrades';
import { startingLoadout } from '../../src/run/loadout';
import { makeRng } from '../../src/domain/rng';
import { FIELD } from '../../src/spec/stage0';
import type { Bullet, ShipInput } from '../../src/domain/entities';

const DT = 1 / 120;
const STILL: ShipInput = { moveX: 0, moveY: 0 };

// 敵HPを直接削って撃破を再現（弾の当たり判定に依存せず進行ロジックを検証）。
function killCurrentEnemy(run: ReturnType<typeof startRun>) {
  run.world.enemies.forEach((e) => (e.hp = 0));
  stepRun(run, STILL, DT);
}

describe('Run：撃破→3択強化→次→…→踏破/死亡', () => {
  it('開始時は fighting、最初の敵がセットされる', () => {
    const run = startRun(1);
    expect(run.phase).toBe('fighting');
    expect(run.index).toBe(0);
    expect(currentEnemy(run).name).toBe('斥候');
    expect(run.world.ship.weapon).toBeTruthy();
  });

  it('撃破すると reward フェーズに入り、3択が出る', () => {
    const run = startRun(1);
    killCurrentEnemy(run);
    expect(run.phase).toBe('reward');
    expect(run.rewards).toHaveLength(3);
  });

  it('強化を選ぶとロードアウトに反映され、次の敵で fighting に戻る', () => {
    const run = startRun(1);
    killCurrentEnemy(run);
    const power = run.rewards.findIndex((u) => u.id === 'power');
    const choice = power >= 0 ? power : 0;
    const before = run.loadout.weapon.damage;
    chooseReward(run, choice);
    expect(run.phase).toBe('fighting');
    expect(run.index).toBe(1);
    if (run.rewards.length === 0 && choice === power) expect(run.loadout.weapon.damage).toBe(before + 1);
    // 新しい敵の World が組み直されている
    expect(run.world.enemies[0].hp).toBe(currentEnemy(run).hp);
  });

  it('最後の敵を倒すと win', () => {
    const run = startRun(1);
    const n = run.queue.length;
    for (let k = 0; k < n; k++) {
      killCurrentEnemy(run);
      if (run.phase === 'reward') chooseReward(run, 0);
    }
    expect(run.phase).toBe('win');
  });

  it('自機HPが尽きると gameover', () => {
    const run = startRun(1);
    run.world.ship.hp = 1;
    // 敵弾を自機に当て続けるのは大変なので、HP を直接0にして判定を確認
    run.world.ship.hp = 0;
    stepRun(run, STILL, DT);
    expect(run.phase).toBe('gameover');
  });

  it('drawChoices は重複なく3つ返す（決定論）', () => {
    const l = startingLoadout();
    const a = drawChoices(makeRng(42), l);
    const ids = new Set(a.map((u) => u.id));
    expect(a).toHaveLength(3);
    expect(ids.size).toBe(3);
    const b = drawChoices(makeRng(42), l);
    expect(b.map((u) => u.id)).toEqual(a.map((u) => u.id)); // 同シードで同結果
  });

  it('直線単発のうちは角度系強化(拡散角UP)を出さない', () => {
    const straight = startingLoadout(); // kind: 'straight'
    for (let seed = 0; seed < 40; seed++) {
      const ids = drawChoices(makeRng(seed), straight).map((u) => u.id);
      expect(ids).not.toContain('wide');
    }
    // 拡散ショットで多方向化したら出るようになる
    const spread = startingLoadout();
    UPGRADES.find((u) => u.id === 'spread')!.apply(spread);
    const appears = Array.from({ length: 40 }, (_, s) => drawChoices(makeRng(s), spread).map((u) => u.id)).some((ids) => ids.includes('wide'));
    expect(appears).toBe(true);
  });

  it('被弾：1減り点滅(無敵)・初期位置へ。点滅中は無敵で自弾も撃たない', () => {
    const run = startRun(1);
    const w = run.world;
    const ship = w.ship;
    const hp0 = ship.hp;
    const atShip = (id: number): Bullet => ({ id, pos: { x: ship.pos.x, y: ship.pos.y }, vel: { x: 0, y: 0 }, radius: 6, owner: 'enemy' });

    w.bullets.push(atShip(9991));
    stepRun(run, STILL, DT);
    expect(ship.hp).toBe(hp0 - 1);
    expect(ship.invulnUntil).toBeGreaterThan(w.time);
    expect(ship.pos.x).toBeCloseTo(FIELD.x + FIELD.w / 2); // 初期位置へ
    expect(ship.pos.y).toBeCloseTo(FIELD.y + FIELD.h * 0.8);

    // 点滅中：敵弾を重ねても無敵で通り抜け、自弾も増えない
    const hp1 = ship.hp;
    const playerBefore = w.bullets.filter((b) => b.owner === 'player').length;
    w.bullets.push({ id: 9992, pos: { x: ship.pos.x, y: ship.pos.y }, vel: { x: 0, y: 0 }, radius: 6, owner: 'enemy' });
    stepRun(run, STILL, DT);
    expect(ship.hp).toBe(hp1); // 無敵：減らない
    expect(w.bullets.some((b) => b.id === 9992)).toBe(true); // 通り抜け（消えない）
    const playerAfter = w.bullets.filter((b) => b.owner === 'player').length;
    expect(playerAfter).toBeLessThanOrEqual(playerBefore); // 自弾を撃たない（増えない）
  });
});
