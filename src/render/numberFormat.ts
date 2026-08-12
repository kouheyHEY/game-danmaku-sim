/**
 * スコアや倍率をHUD向けの短い文字列へ整形する。
 */
const EXPONENT_THRESHOLD = 1_000_000;

function trimFixed(value: number, digits: number): string {
  return value.toFixed(digits).replace(/\.?0+$/, '');
}

export function formatScore(value: number): string {
  if (!Number.isFinite(value)) return '∞';
  if (Math.abs(value) >= EXPONENT_THRESHOLD) return value.toExponential(2);
  if (Number.isInteger(value)) return String(value);
  return trimFixed(value, 2);
}

export function formatMultiplier(value: number): string {
  if (!Number.isFinite(value)) return '×∞';
  if (Math.abs(value) >= EXPONENT_THRESHOLD) return `×${value.toExponential(2)}`;
  return `×${value.toFixed(2)}`;
}
