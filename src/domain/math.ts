export interface Vec2 {
  x: number;
  y: number;
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export const vec = (x: number, y: number): Vec2 => ({ x, y });

export function dist2(a: Vec2, b: Vec2): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return dx * dx + dy * dy;
}

/** 円同士の重なり判定。距離計算に sqrt を使わない。 */
export function circlesOverlap(a: Vec2, ra: number, b: Vec2, rb: number): boolean {
  const r = ra + rb;
  return dist2(a, b) <= r * r;
}

/** 円と、中心・半幅で表した軸平行矩形の重なり判定。 */
export function circleRectOverlap(
  circle: Vec2,
  radius: number,
  rectCenter: Vec2,
  halfWidth: number,
  halfHeight: number,
): boolean {
  const nearestX = clamp(circle.x, rectCenter.x - halfWidth, rectCenter.x + halfWidth);
  const nearestY = clamp(circle.y, rectCenter.y - halfHeight, rectCenter.y + halfHeight);
  const dx = circle.x - nearestX;
  const dy = circle.y - nearestY;
  return dx * dx + dy * dy <= radius * radius;
}

export function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}
