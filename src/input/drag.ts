import type { Vec2 } from '../domain/math';

/**
 * 指の移動を自機目標へ変換する。
 * 反転時は絶対座標を鏡映しせず、前回からの移動量だけを1:1で逆向きにする。
 */
export function nextDragTarget(
  currentTarget: Vec2 | null,
  grab: Vec2,
  previousFinger: Vec2,
  nextFinger: Vec2,
  inverted: boolean,
): Vec2 {
  if (!inverted) return { x: nextFinger.x + grab.x, y: nextFinger.y + grab.y };
  const base = currentTarget ?? { x: previousFinger.x + grab.x, y: previousFinger.y + grab.y };
  return {
    x: base.x - (nextFinger.x - previousFinger.x),
    y: base.y - (nextFinger.y - previousFinger.y),
  };
}
