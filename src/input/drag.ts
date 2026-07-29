import type { Vec2 } from '../domain/math';

/** 指の位置と掴んだ位置の差から、自機の次の目標位置を求める。 */
export function nextDragTarget(grab: Vec2, nextFinger: Vec2): Vec2 {
  return { x: nextFinger.x + grab.x, y: nextFinger.y + grab.y };
}
