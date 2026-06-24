import { makeWorld, defaultShip, defaultEnemy } from '../domain/world';
import { catchEnemyBullets, makeScore } from '../domain/objective';
import { makeDirector } from '../domain/director';
import { FIELD, type Stage } from './stage0';
import { intro, oneWayDown } from './common';

/**
 * ① 弾幕 →(無弾の間)→ ② 逆弾幕（一方向の敵弾に当たりに行く）。
 * B＝一撃成立。② の敵弾は通常の一方向発射。
 */
export const CATCH_DEADLINE = 8;
export const START_HP = 8;

export function stage1(seed = 24680): Stage {
  const world = makeWorld({
    bounds: FIELD,
    seed,
    ship: defaultShip(FIELD),
    enemies: [defaultEnemy(1, FIELD)],
  });

  const director = makeDirector([
    ...intro(6),
    {
      id: 'catch',
      objective: catchEnemyBullets(),
      pattern: oneWayDown(),
      end: { type: 'objectiveCleared', deadline: CATCH_DEADLINE },
    },
  ]);
  director.begin(world);

  return { world, director, score: makeScore(START_HP) };
}
