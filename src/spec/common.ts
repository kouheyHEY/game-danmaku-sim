import { rotating, oneWay, type Pattern } from '../domain/pattern';
import { avoidEnemyBullets, transition, type Mode } from '../domain/objective';
import type { Phase } from '../domain/director';

/** ① 弾幕：回転弾幕（奇数7way）。種類は pattern ライブラリから差し替え可能。 */
export const danmaku = (): Pattern =>
  rotating({ ways: 7, speed: 135, radius: 5, interval: 0.18, spread: 0.28, rotStep: 0.4 });

/** ②③ 通常の一方向発射：下向きストリーム。 */
export const oneWayDown = (): Pattern => oneWay({ speed: 210, radius: 5, interval: 0.16 });

const AVOID_MODE: Mode = { firer: 'enemy', goal: 'avoid' };

/**
 * 全ステージ共通の導入：① 弾幕 → lull（無弾の間）。
 * lull は「敵の発射を止め、画面の敵弾が消えるまで待つ」区間。
 * これに続けて任意のモードを置けば、必ず弾のない瞬間に遷移できる。
 */
export function intro(avoidSeconds = 6): Phase[] {
  return [
    {
      id: 'avoid',
      objective: avoidEnemyBullets(),
      pattern: danmaku(),
      end: { type: 'afterSeconds', seconds: avoidSeconds },
    },
    {
      id: 'lull',
      objective: transition(AVOID_MODE),
      pattern: null, // 発射停止
      end: { type: 'whenClear', minSeconds: 0.6 },
      lull: true,
      cue: 'color-flip',
    },
  ];
}
