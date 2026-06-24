import { makeWorld, defaultShip, defaultEnemy } from '../domain/world';
import { dontHitEnemy, makeScore } from '../domain/objective';
import { evenSpread } from '../domain/pattern';
import { makeDirector } from '../domain/director';
import { FIELD, type Stage } from './stage0';
import { intro } from './common';

/**
 * ① 弾幕 →(無弾の間)→ ④ 自機が撃つが当ててはいけない。
 * ④ の敵は発射しない（pattern=null）。
 * 自機の武器は「偶数弾（正面に隙間）」＝制御可能な型。敵を正面の隙間に収め続ければ当たらない。
 */
export const SURVIVE_SECONDS = 10;

export function stage3(seed = 22222): Stage {
  const ship = defaultShip(FIELD);
  // 偶数弾：正面(上)に隙間。敵をその隙間に置けば当たらない（制御して避ける）。
  ship.weapon = evenSpread({ ways: 4, spread: 0.16, speed: 520, radius: 4, interval: 0.09, baseAngle: -Math.PI / 2 });
  const world = makeWorld({
    bounds: FIELD,
    seed,
    ship,
    enemies: [defaultEnemy(1, FIELD)],
  });

  const director = makeDirector([
    ...intro(6),
    {
      id: 'dont-hit',
      objective: dontHitEnemy(),
      pattern: null, // ④：敵は撃たない
      end: { type: 'afterSeconds', seconds: SURVIVE_SECONDS },
    },
  ]);
  director.begin(world);

  return { world, director, score: makeScore(1) };
}
