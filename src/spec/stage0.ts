import type { Rect } from '../domain/math';
import { makeWorld, defaultShip, defaultEnemy, type World } from '../domain/world';
import { avoidEnemyBullets, makeScore, type Score } from '../domain/objective';
import { makeDirector, type Director } from '../domain/director';
import { danmaku } from './common';

/** M0 のステージ＝① 弾幕を一定時間生き延びるだけ（単一フェーズ）。 */
export const FIELD: Rect = { x: 0, y: 0, w: 480, h: 640 };

export const SURVIVE_SECONDS = 30;
export const START_HP = 5;

export interface Stage {
  world: World;
  director: Director;
  score: Score;
}

export function stage0(seed = 12345): Stage {
  const world = makeWorld({
    bounds: FIELD,
    seed,
    ship: defaultShip(FIELD),
    enemies: [defaultEnemy(1, FIELD)],
  });

  const director = makeDirector([
    {
      id: 'avoid',
      objective: avoidEnemyBullets(),
      pattern: danmaku(),
      end: { type: 'afterSeconds', seconds: SURVIVE_SECONDS },
    },
  ]);
  director.begin(world);

  return { world, director, score: makeScore(START_HP) };
}
