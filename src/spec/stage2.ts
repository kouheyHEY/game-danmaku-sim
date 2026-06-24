import { makeWorld, defaultShip, defaultEnemy } from '../domain/world';
import { hitEnemy, makeScore } from '../domain/objective';
import { makeDirector } from '../domain/director';
import { FIELD, type Stage } from './stage0';
import { intro, oneWayDown } from './common';

/**
 * ① 弾幕 →(無弾の間)→ ③ 自機が撃つ：動く敵に当てる。
 * 調整：敵を横移動させ、自機の直線ショットは正面のみ → 標的を追って位置を合わせないと当たらない。
 * ③ の敵弾は通常の一方向発射（撃ち返しを避けつつ追う）。
 */
export const HIT_QUOTA = 12;
export const HIT_DEADLINE = 16;
export const ENEMY_SPEED = 130;

export function stage2(seed = 11111): Stage {
  const enemy = defaultEnemy(1, FIELD);
  enemy.vel = { x: ENEMY_SPEED, y: 0 }; // 横に往復する動く標的
  const world = makeWorld({
    bounds: FIELD,
    seed,
    ship: defaultShip(FIELD),
    enemies: [enemy],
  });

  const director = makeDirector([
    ...intro(6),
    {
      id: 'shoot',
      objective: hitEnemy({ quota: HIT_QUOTA }),
      pattern: oneWayDown(),
      end: { type: 'objectiveCleared', deadline: HIT_DEADLINE },
    },
  ]);
  director.begin(world);

  return { world, director, score: makeScore(5) };
}
